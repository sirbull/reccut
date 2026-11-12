# Local AI voices in Voice Over Studio

Open **Voice Over Studio** from the **Edit** toolbar, then choose **AI Voice** in the side panel.
Use **Record** to return to microphone recording. Each AI voice becomes a person
with its own track, takes and sound settings.

## Choose and download a package

The first time you open the studio, **Voice Packages** lists the available
packages. Search for a language, listen to the included samples and select the
packages you want. Each entry shows its purpose, download size and license.
**Download selected** starts the downloads; opening the list, selecting a
package or listening does not. **Not now** lets you continue with your microphone.

Return to the list through **Manage voice packages…** in AI Voices,
**Download Voices…** under the person's sound settings, or **Settings → AI**.
A missing model opens the same list. Downloads run as background jobs and can be
canceled. Interrupted VoxCPM model downloads can resume.

| Engine | Languages and choices | Download and platform |
| --- | --- | --- |
| VoxCPM2 | Norwegian Bokmål, English (US), Swedish, Danish and German; Woman 1 and Man 1 in each language; ten moods and delivery styles | Apple Silicon Mac. One shared model, about 3.55 GB, plus small reference packages per language and a separate engine. |
| Kokoro | 41 voices for English (US/UK), Spanish, French, Italian, Brazilian Portuguese and Hindi, plus ready made styles and blends | About 116 MB, plus the shared pronunciation add-on. Other script languages are read with an accent. |
| Piper | Smaller native-language alternatives, including Norwegian and other European languages | About 63–77 MB per voice package, plus the shared pronunciation add-on. Some packages have several speakers or their own emotions. |

The package chooser calculates shared dependencies once. Adding another VoxCPM
language reuses the model. Kokoro and Piper share their pronunciation add-on.
The exact size shown in the app is authoritative.

## VoxCPM moods and delivery

Choose the script's **Language**, then a VoxCPM2 voice and its mood. Listen before
adding it. The same choices are available for each of the five languages:

| Choice | Intended delivery |
| --- | --- |
| Neutral | Calm and matter-of-fact |
| Intense | Urgent and emphatic |
| Angry | Forceful and angry |
| Sad | Soft, slow and close to tears |
| Warm | Friendly, welcoming and conversational |
| Sensual | Soft, low, intimate and subtly breathy |
| Cheerful | Bright, smiling and upbeat |
| Confident | Clear, steady and assured |
| Reassuring | Gentle, compassionate and patient |
| Whispering | Hushed and softly whispered |

Change **Language**, **Voice** or **Mood** under **Sound for** to apply them to
new takes. Existing recordings keep their audio; generate another take to hear
the change. VoxCPM controls its own speaking pace and has no Generation speed
slider. Kokoro and Piper keep their speed and speaker controls. Kokoro's ready
made effect styles and Piper's package-specific emotions are separate choices.

Press **R** or **Read line** to generate the selected line. **Read Again** makes
another take, and **Read All Missing Lines** generates lines without takes.
Generation shows progress per sentence. Canceling stops the current job. AI takes
are ordinary WAV recordings and can be compared, trimmed, mixed and stitched
like microphone takes. Effects such as Voice Character can change an existing
take without regenerating it.

## Quality and privacy

The first VoxCPM voice set was accepted with known quality differences. A mood
may sound different between voices and languages, and words can be repeated or
mispronounced. The Norwegian male voice has a known issue around phrases such as
“bestemme oss”, sometimes producing “oss oss” or “osses”. This is not fixed in
0.9.3. **Say it as** can provide a pronunciation alternative for a line, but is
not a guaranteed remedy. Keep the take that works or record that line yourself.

All three engines synthesize on your computer. Voice scripts and recordings are
not uploaded for synthesis. No model weights are included in the installer, and
none are downloaded until you request a package. The bundled listening samples
work before a model is installed.

VoxCPM's model is Apache 2.0; its separate engine and Reccut's synthetic reference
recordings are MIT. References were generated from descriptions, without
recordings or clones of real people. Kokoro/Piper use the downloaded eSpeak NG
pronunciation add-on (GPL); VoxCPM does not need it. Full notices are available in
**About Reccut → Third-party licenses** and [the component overview](THIRD-PARTY-LICENSES.md).

For architecture, verification results and remaining platform work, see
[the VoxCPM2 implementation plan](plan-voxcpm2.md). For 0.9.3 release preparation,
see [the release notes](releases/0.9.3.md).
