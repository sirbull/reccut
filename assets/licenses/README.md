# License text provenance

The application builds its offline license reader with `scripts/build-licenses.mjs`.
Dependency licenses are copied from the installed npm packages, including notices
inside PDF.js. Model licenses are copied from the pinned model directories.
The original files are not fetched from the network during this build step.

VoxCPM2 notices were retrieved on 12 November 2026:

| File | Source | SHA-256 |
| --- | --- | --- |
| VoxCPM2-Apache-2.0.txt | https://raw.githubusercontent.com/OpenBMB/VoxCPM/300e4260b509066151d623dc9c0aa922cf82232b/LICENSE | 4f10acc209addacfad28293315c74c4cd648f771ee1263a748f1781d1e0265e4 |
| llama-cpp-omni-MIT.txt | https://raw.githubusercontent.com/tc-mb/llama.cpp-omni/d30f00feadb7ebce95bacd55b0d104e3ef501481/LICENSE | 0c873ab8419f18798cc837e62b4ebb89fcd6360408aabda61ef7b95d02530b08 |
| nlohmann-json-MIT.txt | https://raw.githubusercontent.com/nlohmann/json/v3.12.0/LICENSE.MIT | 46a65cffd1ea955132d95a8dd921640714a8d6b537d2e4e482d31145ae95b603 |

The original [openbmb/VoxCPM2 model card](https://huggingface.co/openbmb/VoxCPM2/tree/7936080b41163874f38610f46f438e2c0757f9fd)
declares Apache 2.0; its model repository has no separate LICENSE file. The full
text above comes from the upstream VoxCPM code repository. The pinned GGUF
[conversion model card](https://huggingface.co/DennisHuang648/VoxCPM2-GGUF/blob/169f64d8b98bbaab1761e4ca3a83e6af653456cc/README.md)
also declares Apache 2.0 and retains the original weights' terms. Both GGUF
SHA-256 values were checked against the pinned Hugging Face LFS metadata and
the existing local listening-test models. Engine binaries and weights remain
optional downloads; the license reader needs neither installed.

The following supplemental texts were retrieved on 6 November 2026:

| File | Source | SHA-256 |
| --- | --- | --- |
| GPL-3.0.txt | https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/COPYING.GPLv3 | 8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903 |
| LGPL-3.0.txt | https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/COPYING.LGPLv3 | da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768 |
| ONNXRUNTIME-LICENSE.txt | https://raw.githubusercontent.com/microsoft/onnxruntime/8d85527a010e294a26b274749f74294b2a32cec5/LICENSE | 2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c |
| ONNXRUNTIME-ThirdPartyNotices.txt | https://raw.githubusercontent.com/microsoft/onnxruntime/8d85527a010e294a26b274749f74294b2a32cec5/ThirdPartyNotices.txt | 143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3 |

The ONNX Runtime commit matches `node_modules/onnxruntime-web/__commit.txt` in
the reviewed installation. When upgrading ONNX Runtime, review and update these
supplemental notices for the new build. Its upstream ThirdPartyNotices file is
a broad upstream inventory, not a claim that all listed libraries are active in
Reccut's WebAssembly runtime.

`LIBUIOHOOK-NOTICE.txt` reproduces the libuiohook copyright and license notice
from the C sources included in uiohook-napi 1.5.5, with a note identifying the
wrapper. The GNU license texts are provided separately in full.

These notices do not include complete corresponding source for the FFmpeg
binaries or establish a working LGPL relinking procedure. See
`docs/THIRD-PARTY-LICENSES.md` for the remaining distribution requirements.
