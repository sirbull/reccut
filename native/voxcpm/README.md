# Optional VoxCPM2 engine

`build-mac.sh <source checkout> <output directory>` builds Reccut's persistent
stdio adapter against the VoxCPM2 runtime from the revision pinned in
`src/main/ttsCatalog.json`. Requires an Apple Silicon
Mac, Xcode command-line tools, CMake and Node. CI checks out this revision and
attaches the signed (ad hoc) standalone binary, SHA-256 and MIT notice to each
tagged release. Static libraries and embedded Metal shaders keep it independent
of the build machine. No model is needed for the build or help smoke check.

The application downloads the engine from **its own version's release**, checks
the accompanying SHA-256, and verifies the binary again before running it.
Build output checksums cannot be pinned before CI builds a release. Model and
reference checksums are pinned directly in the catalog. Installation also checks
`--protocol` without weights; the former one-shot CLI is not compatible. The
engine notice includes nlohmann JSON's MIT notice, matching version 3.12.0 in
the pinned upstream checkout.

Only macOS arm64 is enabled. Windows, Linux and Intel Macs stay unavailable until
CPU performance has been measured. Nothing here is bundled in the installer.

The backend supports model installation, language installation, cancel/resume,
removal and sentence-by-sentence synthesis in the existing speech job queue.
Synthesis reuses one process between sentences and speech jobs. It is released
after 60 seconds idle, during installation/removal, on cancellation or failure,
and when the app exits. Cancellation kills the process, waits for it to close,
then removes temporary WAVs. The canceled script is never automatically retried.
Other errors discard the process too, so a later job starts with clean state.

## Protocol v1

`reccut-voxcpm-mac --serve <BaseLM.gguf> <Acoustic.gguf>` loads the local files
once. Optional `--cpu` is for development measurements; it does not enable more
application platforms. There are no sockets or HTTP endpoints. stdout contains
JSON lines only; the app ignores stderr and never logs input.

After loading, the adapter sends `{"type":"ready","protocol":1,"rate":48000}`.
Send one JSON request per line, with one request in flight:

```json
{"id":1,"text":"(Calm, neutral and matter-of-fact. Dry, close-mic studio recording with no reverb.)Hei.","reference":"/local/reference.wav","output":"/local/temporary.wav","cfg":3.5,"steps":250,"timesteps":10,"temperature":1.0,"seed":42}
```

The response is `{"type":"done","id":1,"rate":48000}` after writing the WAV,
or a generic `error` with the matching id. Initialization errors are `fatal`.
Input lines are bounded at 64 KiB. The app bounds replies, checks version/id/rate,
applies loading/generation deadlines and terminates invalid peers. Native error
text is never forwarded, since it might contain private input. EOF stops an idle
adapter; SIGTERM with SIGKILL fallback interrupts generation. There is no replay
after a timeout, crash or cancellation.

References are bounded 16-bit PCM WAV, mono or stereo. Output is bounded 16-bit
mono WAV at 48 kHz. The pinned runtime clears KV/decode state on each prefill
while retaining weights and compiled graphs. Seed 42 preserves the CLI default.

Real offline check with existing local models:

```sh
node scripts/test-voxcpm-process.mjs <built-engine> <model-directory> <synthetic-reference.wav> [second-reference.wav]
```

This checks model reuse, identical PCM after changing mood/reference and returning
to the first voice, cancellation and restart. Timings/audio go to a temporary
folder. Results in `docs/voxcpm-process-check.json` are technical checks, not
listening approval. OS/Metal caches and script length affect the speedup.

The first catalog contains Norwegian, US English, Swedish, Danish and German,
with two synthetic voices per language. On 12 November the user explicitly
accepted these for a first version, with uneven quality and the known Norwegian
pronunciation issue deferred. This is not a claim that every sample was reviewed
or that the pronunciation issue was fixed. References target 3–4 seconds; the
accepted first version retains the uncut 2.88 s Danish woman and 4.64 s US man.

A language entry has `lang`, `source: "release"`, and `voices`; each voice has
`id`, `name`, `gender` and `reference: { path, size, sha256 }`. The small WAVs in
`voices/` are checked and copied by `scripts/prepare-voxcpm-voices.mjs` into the
engine's release artifacts, with checksum files and their MIT license. They are
downloaded from the same app version's release, and never included in installers.
Content hashes allow unchanged references to survive app upgrades. HF reference
packs can alternatively pin a `repository` and `revision` as before.

To prepare multilingual listening candidates with already downloaded models:

```sh
node scripts/voice-expression-samples.mjs <upstream-voxcpm2-cli> <built-engine> <model-directory>
```

The upstream CLI designs synthetic references; the persistent adapter makes the
expression samples. Nothing is downloaded, published or catalogued. The local
HTML page includes raw reference durations, normalized playback and exact scripts.
Use `--all-expressions` to complete all ten previews for every language, reusing
verified cached results. References outside the 3–4 second target remain visible,
rather than being cut mid-sentence. The user's first-version acceptance and the
distinction between generated and individually reviewed samples are recorded.

For an explicit developer installation from existing local files:

```sh
node scripts/install-voxcpm-local.mjs <built-engine> <model-directory> <destination> [lang,lang]
```

This uses the normal checksum/protocol/atomic installer, with an offline file
source. It makes no network requests and is never called by app startup or build.
