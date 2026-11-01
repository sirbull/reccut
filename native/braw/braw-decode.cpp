// braw-decode <bibliotek> <fil.braw>
// Dekoder et Blackmagic RAW-klipp med Blackmagic RAW SDK og skriver først en linje "bredde høyde fps antall",
// deretter hvert bilde som 16-bit RGB (rgb48le) til stdout. src/main/decoders.js koder det til ProRes.
// <bibliotek> er BlackmagicRawAPI.framework (Mac) eller mappen med biblioteket, fra brukerens installasjon.
// Bygges med scripts/build-braw.mjs mot SDK-ens BlackmagicRawAPI.h og BlackmagicRawAPIDispatch.cpp.
#include "BlackmagicRawAPI.h"

#include <cstdio>
#include <cstdlib>
#include <string>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
typedef CFStringRef BrawString;
static BrawString makeString(const char* s) { return CFStringCreateWithCString(nullptr, s, kCFStringEncodingUTF8); }
#else
typedef const char* BrawString;
static BrawString makeString(const char* s) { return s; }
#endif

static bool failed = false;

static void fail(const char* what) {
  fprintf(stderr, "%s\n", what);
  failed = true;
}

class Callback : public IBlackmagicRawCallback {
 public:
  void ReadComplete(IBlackmagicRawJob* readJob, HRESULT result, IBlackmagicRawFrame* frame) override {
    IBlackmagicRawJob* job = nullptr;
    if (result == S_OK) result = frame->SetResourceFormat(blackmagicRawResourceFormatRGBU16);
    if (result == S_OK) result = frame->CreateJobDecodeAndProcessFrame(nullptr, nullptr, &job);
    if (result == S_OK) result = job->Submit();
    if (result != S_OK) {
      if (job) job->Release();
      fail("Could not decode a frame.");
    }
    readJob->Release();
  }

  void ProcessComplete(IBlackmagicRawJob* job, HRESULT result, IBlackmagicRawProcessedImage* image) override {
    uint32_t w = 0, h = 0;
    void* data = nullptr;
    if (result == S_OK) result = image->GetWidth(&w);
    if (result == S_OK) result = image->GetHeight(&h);
    if (result == S_OK) result = image->GetResource(&data);
    if (result == S_OK) {
      fwrite(data, 1, size_t(w) * h * 6, stdout);
    } else {
      fail("Could not process a frame.");
    }
    job->Release();
  }

  void ReadAudioComplete(IBlackmagicRawJob*, HRESULT, IBlackmagicRawAudioBuffer*) override {}
  void DecodeComplete(IBlackmagicRawJob*, HRESULT) override {}
  void TrimProgress(IBlackmagicRawJob*, float) override {}
  void TrimComplete(IBlackmagicRawJob*, HRESULT) override {}
  void SidecarMetadataParseWarning(IBlackmagicRawClip*, BrawString, uint32_t, BrawString) override {}
  void SidecarMetadataParseError(IBlackmagicRawClip*, BrawString, uint32_t, BrawString) override {}
  void PreparePipelineComplete(void*, HRESULT) override {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID, LPVOID*) override { return E_NOTIMPL; }
  ULONG STDMETHODCALLTYPE AddRef() override { return 0; }
  ULONG STDMETHODCALLTYPE Release() override { return 0; }
};

int main(int argc, char** argv) {
  if (argc != 3) {
    fprintf(stderr, "usage: braw-decode <library> <clip.braw>\n");
    return 2;
  }
  // Fabrikken vil ha mappen biblioteket ligger i.
  std::string lib = argv[1];
  size_t slash = lib.find_last_of('/');
  if (lib.size() > 10 && lib.compare(lib.size() - 10, 10, ".framework") == 0 && slash != std::string::npos) lib = lib.substr(0, slash);

  IBlackmagicRawFactory* factory = CreateBlackmagicRawFactoryInstanceFromPath(makeString(lib.c_str()));
  if (!factory) return fail("Blackmagic RAW is not installed, or the library could not be loaded."), 3;
  IBlackmagicRaw* codec = nullptr;
  IBlackmagicRawClip* clip = nullptr;
  if (factory->CreateCodec(&codec) != S_OK) return fail("Could not create the Blackmagic RAW codec."), 3;
  if (codec->OpenClip(makeString(argv[2]), &clip) != S_OK) return fail("Could not open the clip."), 4;
  Callback callback;
  codec->SetCallback(&callback);

  uint32_t w = 0, h = 0;
  uint64_t frames = 0;
  float fps = 0;
  clip->GetWidth(&w);
  clip->GetHeight(&h);
  clip->GetFrameCount(&frames);
  clip->GetFrameRate(&fps);
  printf("%u %u %.6f %llu\n", w, h, fps, (unsigned long long)frames);
  fflush(stdout);

  // Ett bilde om gangen, så rekkefølgen i strømmen blir riktig.
  for (uint64_t i = 0; i < frames && !failed; i++) {
    IBlackmagicRawJob* read = nullptr;
    if (clip->CreateJobReadFrame(i, &read) != S_OK || read->Submit() != S_OK) {
      if (read) read->Release();
      fail("Could not read a frame.");
      break;
    }
    codec->FlushJobs();
  }
  fflush(stdout);
  clip->Release();
  codec->Release();
  factory->Release();
  return failed ? 5 : 0;
}
