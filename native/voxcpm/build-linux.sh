#!/usr/bin/env bash
# Build the optional persistent adapter for Linux x64: CPU only, static ggml,
# libstdc++ and libgcc. Only glibc libraries remain dynamic. Build on the
# oldest supported distribution, since the binary needs that glibc or newer.
set -euo pipefail
source_dir="${1:?Usage: build-linux.sh <llama.cpp-omni checkout> <output directory>}"
output_dir="${2:?Supply an output directory}"
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
expected_revision="$(node -p "require(process.argv[1]).voxcpm.engine.revision" "$project_dir/src/main/ttsCatalog.json")"
expected_protocol="$(node -p "require(process.argv[1]).voxcpm.engine.protocol" "$project_dir/src/main/ttsCatalog.json")"
test "$(git -C "$source_dir" rev-parse HEAD)" = "$expected_revision"
test -z "$(git -C "$source_dir" status --porcelain --untracked-files=no)"
source_dir="$(cd "$source_dir" && pwd)"
test "$(uname -s)" = Linux
test "$(uname -m)" = x86_64
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
# Portable baseline: every optional x86 extension is off explicitly, because
# GGML_NATIVE=OFF alone does not disable them.
cmake -S "$project_dir/native/voxcpm" -B "$output_dir/server-build" -G Ninja -DVOXCPM_SOURCE_DIR="$source_dir" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_BACKEND_DL=OFF -DGGML_NATIVE=OFF \
  -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DENABLE_COREML=OFF -DGGML_OPENMP=OFF \
  -DGGML_SSE42=OFF -DGGML_BMI2=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_AVX512=OFF -DGGML_AVX_VNNI=OFF \
  -DGGML_FMA=OFF -DGGML_F16C=OFF \
  -DCMAKE_EXE_LINKER_FLAGS="-static-libstdc++ -static-libgcc" \
  -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF
cmake --build "$output_dir/server-build" --target reccut-voxcpm --parallel 4
asset=reccut-voxcpm-linux-x64
cp "$output_dir/server-build/bin/reccut-voxcpm" "$output_dir/$asset"
strip "$output_dir/$asset"
# Only glibc and the kernel's vDSO; no libstdc++, OpenMP or build-machine paths.
ldd "$output_dir/$asset" > "$output_dir/dependencies.txt"
if awk '{print $1}' "$output_dir/dependencies.txt" | grep -Ev '^(linux-vdso\.so\.1|libc\.so\.6|libm\.so\.6|libpthread\.so\.0|libdl\.so\.2|librt\.so\.1|/lib64/ld-linux-x86-64\.so\.2)$'; then
  echo 'Unexpected dynamic dependency' >&2
  exit 1
fi
objdump -T "$output_dir/$asset" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -n 1 > "$output_dir/glibc.txt"
"$output_dir/$asset" --help > "$output_dir/smoke.txt" 2>&1 || true
grep -q 'VoxCPM2 CLI' "$output_dir/smoke.txt"
"$output_dir/$asset" --protocol > "$output_dir/protocol.json"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).protocol!==Number(process.argv[2]))process.exit(1)' "$output_dir/protocol.json" "$expected_protocol"
cat "$project_dir/assets/licenses/llama-cpp-omni-MIT.txt" "$project_dir/assets/licenses/nlohmann-json-MIT.txt" > "$output_dir/$asset.LICENSE.txt"
cd "$output_dir"
sha256sum "$asset" > "$asset.sha256"
echo "Built $asset, needs $(cat glibc.txt) or newer"
