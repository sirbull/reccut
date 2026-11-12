// SPDX-License-Identifier: MIT
// Reccut's local JSON-lines adapter for the pinned VoxCPM2 runtime. No sockets,
// network, text logging or persistent script files. stdout is protocol only.
#include "voxcpm2_runtime.h"
#include "nlohmann/json.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;
static constexpr int protocol = 1;
static constexpr size_t max_line = 65536;
static constexpr size_t max_audio = 64 * 1024 * 1024;

static void reply(const json & value) { std::cout << value.dump() << '\n' << std::flush; }
static uint16_t u16(const std::vector<uint8_t> & b, size_t p) { return uint16_t(b.at(p)) | uint16_t(b.at(p + 1)) << 8; }
static uint32_t u32(const std::vector<uint8_t> & b, size_t p) { return uint32_t(u16(b, p)) | uint32_t(u16(b, p + 2)) << 16; }
static bool tag(const std::vector<uint8_t> & b, size_t p, const char * s) {
    return p + 4 <= b.size() && std::equal(b.begin() + p, b.begin() + p + 4, s);
}
static std::vector<float> reference_wav(const std::string & path, int & rate) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f || f.tellg() < 44 || f.tellg() > 16 * 1024 * 1024) throw std::runtime_error("reference");
    std::vector<uint8_t> b(static_cast<size_t>(f.tellg())); f.seekg(0);
    if (!f.read(reinterpret_cast<char *>(b.data()), b.size()) || !tag(b, 0, "RIFF") || !tag(b, 8, "WAVE") || u32(b, 4) != b.size() - 8) throw std::runtime_error("reference");
    size_t data = 0, size = 0; int channels = 0;
    for (size_t p = 12; p + 8 <= b.size();) {
        const size_t n = u32(b, p + 4), start = p + 8;
        if (n > b.size() - start) throw std::runtime_error("reference");
        if (tag(b, p, "fmt ")) {
            if (n < 16 || u16(b, start) != 1 || u16(b, start + 14) != 16) throw std::runtime_error("reference");
            channels = u16(b, start + 2); rate = static_cast<int>(u32(b, start + 4));
            if ((channels != 1 && channels != 2) || rate < 8000 || rate > 192000 || u16(b, start + 12) != channels * 2 || u32(b, start + 8) != uint32_t(rate * channels * 2)) throw std::runtime_error("reference");
        }
        if (tag(b, p, "data")) { data = start; size = n; }
        p = start + n + n % 2;
    }
    if (!data || !size || !channels || size % (channels * 2)) throw std::runtime_error("reference");
    std::vector<float> pcm(size / (channels * 2), 0.0f);
    for (size_t i = 0; i < pcm.size(); i++) for (int ch = 0; ch < channels; ch++) {
        const uint16_t raw = u16(b, data + (i * channels + ch) * 2);
        const int value = raw >= 32768 ? int(raw) - 65536 : int(raw);
        pcm[i] += float(value) / (32768.0f * channels);
    }
    return pcm;
}
static void write_wav(const std::string & path, const std::vector<float> & pcm, int rate) {
    if (pcm.empty() || pcm.size() > (max_audio - 44) / 2) throw std::runtime_error("audio");
    std::ofstream f(path, std::ios::binary | std::ios::trunc);
    if (!f) throw std::runtime_error("output");
    auto w16 = [&](uint16_t n) { f.put(char(n & 255)); f.put(char(n >> 8)); };
    auto w32 = [&](uint32_t n) { w16(uint16_t(n)); w16(uint16_t(n >> 16)); };
    const uint32_t bytes = uint32_t(pcm.size() * 2);
    f.write("RIFF", 4); w32(36 + bytes); f.write("WAVEfmt ", 8); w32(16);
    w16(1); w16(1); w32(uint32_t(rate)); w32(uint32_t(rate * 2)); w16(2); w16(16);
    f.write("data", 4); w32(bytes);
    for (float value : pcm) {
        if (!std::isfinite(value)) throw std::runtime_error("audio");
        w16(uint16_t(int16_t(std::max(-1.0f, std::min(1.0f, value)) * 32767.0f)));
    }
    f.flush(); if (!f) throw std::runtime_error("output");
}
static std::string field(const json & request, const char * name, size_t max) {
    const std::string value = request.at(name).get<std::string>();
    if (value.empty() || value.size() > max || value.find('\0') != std::string::npos) throw std::runtime_error("request");
    return value;
}
static void generate(VoxCPM2Runtime & runtime, const json & request) {
    const std::string text = field(request, "text", 16384);
    const std::string reference = field(request, "reference", 4096), output = field(request, "output", 4096);
    VoxCPM2GenerateParams params;
    params.cfg_value = request.value("cfg", 3.5f);
    params.max_steps = request.value("steps", 250);
    params.inference_timesteps = request.value("timesteps", 10);
    params.temperature = request.value("temperature", 1.0f);
    params.seed = request.value("seed", uint32_t(42));
    if (!std::isfinite(params.cfg_value) || params.cfg_value <= 0 || params.cfg_value > 10 || params.max_steps < 1 || params.max_steps > 1000 || params.inference_timesteps < 1 || params.inference_timesteps > 100 || !std::isfinite(params.temperature) || params.temperature <= 0 || params.temperature > 2) throw std::runtime_error("request");
    int reference_rate = 0;
    auto pcm = reference_wav(reference, reference_rate);
    params.reference_sample_rate = reference_rate;
    // Keep weights and compiled graphs; each prefill clears the KV/decode state.
    auto audio = runtime.generate_with_clone(text, pcm, params);
    write_wav(output, audio, runtime.sample_rate());
}
int main(int argc, char ** argv) {
    if (argc == 2 && std::string(argv[1]) == "--protocol") {
        reply({{"type", "protocol"}, {"protocol", protocol}}); return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "--help") {
        std::cout << "Reccut VoxCPM2 CLI adapter\n--serve <BaseLM.gguf> <Acoustic.gguf> [--cpu]\nJSON lines over stdin/stdout; EOF stops the engine.\n"; return 0;
    }
    if ((argc != 4 && argc != 5) || std::string(argv[1]) != "--serve" || (argc == 5 && std::string(argv[4]) != "--cpu")) return 2;
    try {
        ggml_time_init();
        VoxCPM2Runtime runtime;
        if (!runtime.init(argv[2], argv[3], -1, argc != 5)) { reply({{"type", "fatal"}, {"error", "Could not load the voice model."}}); return 1; }
        reply({{"type", "ready"}, {"protocol", protocol}, {"rate", runtime.sample_rate()}});
        while (true) {
            // Bound input before parsing, including a request without a newline.
            std::string line; char c;
            while (std::cin.get(c) && c != '\n') {
                if (line.size() >= max_line) return 2;
                line.push_back(c);
            }
            if (!std::cin && line.empty()) break;
            int64_t id = 0;
            try {
                const auto request = json::parse(line);
                if (!request.at("id").is_number_integer()) throw std::runtime_error("request");
                id = request.at("id").get<int64_t>();
                if (id < 1 || id > 9007199254740991LL) throw std::runtime_error("request");
                generate(runtime, request);
                reply({{"type", "done"}, {"id", id}, {"rate", runtime.sample_rate()}});
            } catch (...) {
                // Never return parser exceptions: they can contain script text.
                reply({{"type", "error"}, {"id", id}, {"error", "Voice generation failed."}});
            }
            if (!std::cin) break;
        }
        return 0;
    } catch (...) { reply({{"type", "fatal"}, {"error", "The voice engine failed."}}); return 1; }
}
