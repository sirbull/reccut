#!/usr/bin/env bash
# Build the optional persistent adapter, with static ggml and embedded Metal.
set -euo pipefail
source_dir="${1:?Usage: build-mac.sh <llama.cpp-omni checkout> <output directory>}"
output_dir="${2:?Supply an output directory}"
project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
expected_revision="$(node -p "require(process.argv[1]).voxcpm.engine.revision" "$project_dir/src/main/ttsCatalog.json")"
expected_protocol="$(node -p "require(process.argv[1]).voxcpm.engine.protocol" "$project_dir/src/main/ttsCatalog.json")"
test "$(git -C "$source_dir" rev-parse HEAD)" = "$expected_revision"
source_dir="$(cd "$source_dir" && pwd)"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
cmake -S "$project_dir/native/voxcpm" -B "$output_dir/server-build" -DVOXCPM_SOURCE_DIR="$source_dir" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0 \
  -DBUILD_SHARED_LIBS=OFF -DGGML_BACKEND_DL=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH=armv8.2-a+dotprod -DGGML_OPENMP=OFF \
  -DLLAMA_OPENSSL=OFF -DENABLE_COREML=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF
cmake --build "$output_dir/server-build" --target reccut-voxcpm --config Release -j 3
asset=reccut-voxcpm-mac
cp "$output_dir/server-build/bin/reccut-voxcpm" "$output_dir/$asset"
codesign --force -s - "$output_dir/$asset"
# No Homebrew libraries or build-directory paths may be needed on the user's Mac.
otool -L "$output_dir/$asset" > "$output_dir/dependencies.txt"
if tail -n +2 "$output_dir/dependencies.txt" | awk '{print $1}' | /usr/bin/grep -Ev '^(/usr/lib/|/System/Library/)' ; then
  echo 'Unexpected non-system dynamic dependency' >&2
  exit 1
fi
"$output_dir/$asset" --help > "$output_dir/smoke.txt" 2>&1 || true
/usr/bin/grep -q 'VoxCPM2 CLI' "$output_dir/smoke.txt"
"$output_dir/$asset" --protocol > "$output_dir/protocol.json"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).protocol!==Number(process.argv[2]))process.exit(1)' "$output_dir/protocol.json" "$expected_protocol"
cat "$project_dir/assets/licenses/llama-cpp-omni-MIT.txt" "$project_dir/assets/licenses/nlohmann-json-MIT.txt" > "$output_dir/$asset.LICENSE.txt"
cd "$output_dir"
shasum -a 256 "$asset" > "$asset.sha256"
