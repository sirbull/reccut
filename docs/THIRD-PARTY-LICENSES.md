# Third-party software, models and artwork

Reccut uses open-source libraries, separately licensed model weights and artwork,
and optional proprietary decoder components. Each retains its own license and
copyright notices. Reccut's own application license does not replace those terms.
The current project declares MIT; a future commercial edition must identify its
own license separately and preserve the rights attached to third-party components
and previously distributed MIT editions.

## Find the notices in the app

Open **About Reccut → Third-party licenses**. On macOS, About Reccut is in the
Reccut application menu. The reader lists components, installed package versions,
their purpose, upstream links and the included license texts. Reading the notices
does not require an internet connection; upstream links open in your browser.

**Open license files and documentation** opens the local notices directory.
Installed apps carry it in their resources directory as `licenses/`; development
builds use `build/licenses/`. It includes the reader, `manifest.json`, original
texts under `texts/` and this document as `DISTRIBUTION.md`. Electron and Chromium
also have their own license files in the installed application's resources.

## Main components and their terms

| Component | Use in Reccut | License and relevant distinction |
| --- | --- | --- |
| Electron and Chromium | Desktop runtime | Electron is MIT. Chromium and its dependencies have additional notices in the installed runtime. |
| Preact, Signals and Immer | Interface and project state | MIT. Retain the required copyright and permission notices. |
| Lucide/Feather and Tabler | Interface and Design icons | ISC/MIT. Retain the notices for the relevant icon collections. |
| FFmpeg | Import, media preparation, conversion and export | The selected binaries are GPLv3 or later, used as a separate command-line program. The binary build and its included libraries determine the full obligations. |
| Mediabunny | Media reading and export | MPL 2.0. Source availability applies to its covered files, including distributed modifications. Minified library code is not a replacement for its readable source. |
| Transformers.js and ONNX Runtime | Local inference | Apache 2.0 and MIT, with additional ONNX Runtime third-party notices. These runtime licenses are separate from model licenses. |
| Whisper model weights | Local transcription | MIT. Converted models have their own repository and pinned revision, shown by the model manager. |
| BiRefNet model weights, downloaded on request | Background removal | The model variants declare MIT. They are not in the installer; their pinned revisions and original license texts are listed in the reader. |
| DeepFilterNet 3 model | AI Clean Voice (noise removal) | MIT or Apache 2.0. Included with the app, checked with SHA-256, and runs on the computer. |
| OpenMoji | Color and outline emoji | CC BY-SA 4.0. Preserve attribution, the license reference and applicable ShareAlike terms when adapting the artwork. |
| Unicode data | Emoji names and sequences | Unicode License V3. System-style emoji are rendered with installed fonts. |
| PDF.js | PDF import | Apache 2.0, plus the licenses for bundled fonts, character maps, color profiles and decoder components. These additional texts are included in the reader. |
| Kokoro-82M (AI voices), downloaded on request | Voice Over Studio | The model and voices are Apache 2.0 (onnx-community/Kokoro-82M-v1.0-ONNX, pinned revision, checked with SHA-256). The text normalization in Reccut follows kokoro-js (Apache 2.0). Not included in the installer. |
| Piper voices (rhasspy/piper-voices), downloaded on request | Voices made for Norwegian, Swedish, Danish, German, Dutch, Finnish, Polish, Spanish, French, Italian and Portuguese in the Voice Over Studio | Each voice has its own licence, listed in the catalogue and shown before download: most are CC0; fr_FR-siwis-medium and it_IT-serena-medium are CC BY 4.0 (credit the voice and its dataset); es_MX-claude-high is Apache 2.0. Voices with AGPL, non-commercial or unclear licences are not offered. Pinned revision, checked with SHA-256, not included in the installer. |
| VoxCPM2 model, downloaded on request | Expressive local speech on Apple Silicon | Apache 2.0. GGUF conversion by DennisHuang648 from openbmb/VoxCPM2, with pinned revision, file sizes and SHA-256. Not included in the installer. |
| VoxCPM engine, downloaded on request | Separate persistent speech process | The pinned llama.cpp-omni runtime and nlohmann JSON parser are MIT. Reccut's adapter is built separately and attached to the matching app release, with checksum and notices. No engine binary is bundled in the installer. |
| Reccut synthetic voice references, downloaded on request | Two reference voices per VoxCPM language | MIT. Generated from descriptions without recordings or clones of real people. Reference WAVs are separate release attachments, pinned by size and SHA-256; their license is in `native/voxcpm/voices/LICENSE.txt` and the offline reader. |
| phonemizer.js with eSpeak NG, downloaded on request | Pronunciation for Kokoro and Piper | The npm package says Apache 2.0, but it contains eSpeak NG, which is GPLv3 or later. It is never included in the installer: it is downloaded from npm when the user asks for these voices, checked against its npm integrity hash and loaded in a separate worker window. VoxCPM does not use it. |
| Blackmagic RAW, when included | Native RAW decoding | Separate proprietary SDK terms. Availability depends on the platform and build. The SDK is not covered by Reccut's or FFmpeg's open-source license. |

The full license texts govern; this table is a guide to the main components.
The catalogue is not a complete source archive for native binaries or an audit
of every library linked into a third-party binary.

## Your recordings, designs and imported assets

Processing your recordings with FFmpeg does not by itself license those recordings
under the GPL. Rights to media, fonts, stock images, model inputs and other material
you import still depend on that material's terms.

OpenMoji graphics and downloaded stock images can have attribution or other
requirements. Preserve their source and license information when distributing
work that uses them. Design stores source information for supported downloaded
assets, and **Copy Credits** in Design's export options can help collect it.
It does not determine every legal requirement for a finished composition.

## Source availability and commercial distribution

Upstream links in the reader identify the projects. A repository homepage alone
does not establish that the complete corresponding source for a distributed
native binary is available. Before distributing a commercial edition:

- **FFmpeg:** provide the full source corresponding to each binary, including
  relevant library sources, patches, configuration and build scripts. Preserve
  notices and provide source access as required by the selected GPL distribution
  method. The current fetch script's generic FFmpeg source link is not proof of
  matching source for the supplied binaries.
- **Mediabunny:** identify the exact version and make its covered source and any
  distributed modifications available under MPL, with clear instructions for
  recipients. Check completeness, including shared source files; do not assume
  that a package's `src/` directory alone is a complete source distribution.
- **Blackmagic RAW:** follow the SDK agreement for the particular libraries
  distributed. Do not include the complete proprietary SDK in an open-source
  source bundle merely because the application uses its API libraries.
- **All components:** review the actual packaged files, included binary libraries,
  notices and versions for each platform. Keep third-party rights separate from
  the commercial application terms. Review codec patent rights separately.

Adding the About notice and this documentation does not itself complete these
source-delivery and native-library requirements. The implementation plan and the
remaining technical work are described in `docs/COMMERCIAL-RELEASE-PLAN.md` in the
development repository.

## Maintain the catalogue

`scripts/build-licenses.mjs` generates the offline reader during `npm run build`
and `npm start`. It reads versions and license files from installed dependencies
and checked-in model notices verified against the pinned background-model catalogue.
Model weights in `vendor/` are not needed to build this reader or start the app.
Missing required license files stop
the build rather than silently omitting their texts. No network request is needed
by this generation step. Review `assets/licenses/README.md` when updating ONNX
Runtime or other supplemental notices. Add newly bundled components to the
catalogue and review the final distribution when dependencies change.

## Primary references

- GNU GPL FAQ, including separate programs and program output: https://www.gnu.org/licenses/gpl-faq.en.html
- GPLv3, particularly distribution and corresponding source: https://www.gnu.org/licenses/gpl-3.0.html
- LGPLv3, particularly combined works: https://www.gnu.org/licenses/lgpl-3.0.en.html
- Mozilla MPL FAQ, particularly questions 8, 11 and 16: https://www.mozilla.org/en-US/MPL/2.0/FAQ/
- FFmpeg licensing and patent information: https://ffmpeg.org/legal.html
- OpenMoji: https://openmoji.org
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- Blackmagic RAW SDK: https://www.blackmagicdesign.com/developer/products/braw/sdk-and-software
