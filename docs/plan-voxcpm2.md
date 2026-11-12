# Plan: VoxCPM2-stemmer med stemning i Voice Over Studio

Status: plan, ikke påbegynt. Skrevet 11. november 2026 etter lyttetestene i `vendor/voice-tests/norwegian/lyttetest.html`.

## Mål

- VoxCPM2 blir hovedstemmen for norsk, og etter hvert for flere språk.
- Brukeren velger stemning (nøytral, intens, sint, trist) før stemmen lages.
- Hver stemme beholder samme person og dialekt i alle stemninger.

## Hva testene viste

| Funn | Konsekvens |
|---|---|
| En stemmebeskrivelse uten referanse gir en ny person hver gang, med ny dialekt. | Hver stemme må låses med et referanseklipp (stemmekloning, `-r`). |
| En lang referanse (12 s, rolig) overstyrer stemningen. | Referansen er bare 3 til 4 sekunder, én setning. |
| `cfg` 2,0 ga for svak stemning, 3,5 ga tydelig stemning. | Bruk `--cfg 3.5`. |
| «Movie trailer narrator» ga romklang. | Ingen ord om film, trailer, scene eller sal. Hver beskrivelse slutter med «Dry, close-mic studio recording with no reverb.» |
| Litt sus i rålyden. | Ingen egen støyfjerning i motoren. Brukeren har allerede Clean Voice med styrkeslider (`props.cleanVoice`). Vurder å slå den på som standard for VoxCPM-klipp. |
| Kvinnen fra «dyp»-beskrivelsen byttet dialekt, men den første kvinneprøven var stabil. | Hver referanse må lyttetestes i alle stemninger før den kommer inn i katalogen. |
| Whisper hørte ikke «ikke» i en av de første prøvene. | Hver referanse og hver stemning sjekkes for ord som faller bort. |
| Hastighet: cirka 2,4 sekunder regnetid per sekund lyd på M1 Pro (Metal). | Tregere enn sanntid. Fremdriften må vises per setning, slik den gjør i dag. |

Innstillinger fra forsøk 3, som fungerte:

```
voxcpm2-cli -r <referanse.wav> -t "(<stemning> Dry, close-mic studio recording with no reverb.)<tekst>" \
  --cfg 3.5 --steps 250 --timesteps 10 --temperature 1.0 <BaseLM-Q8_0.gguf> <Acoustic-F16.gguf>
```

Stemningene (teksten i parentes):

| Id | Navn | Beskrivelse |
|---|---|---|
| `neutral` | Neutral | Calm, neutral and matter-of-fact. |
| `intense` | Intense | Extremely intense and urgent, almost breathless, hammering every word with heavy emphasis, full of tension. |
| `angry` | Angry | Furious and shouting, voice shaking with anger, spitting the words out harshly. |
| `sad` | Sad | Deeply sad and close to tears, voice trembling and breaking, speaking slowly and softly. |

«Serious» (alvorlig) var for lik nøytral i forsøk 2 og er ikke testet i forsøk 3. Den kommer bare med hvis en ny test viser at den skiller seg ut.

## Språk: én modell, små stemmepakker per språk

VoxCPM2 er **én flerspråklig modell med 30 språk**, blant dem norsk, svensk, dansk, tysk, finsk, nederlandsk og polsk. Den trenger ingen språkkode, for den leser språket ut av teksten. Kvaliteten varierer med hvor mye treningsdata hvert språk har. Kilde: [openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2).

Modellen kan altså ikke deles opp per språk, og den lastes ned én gang (cirka 3,55 GB). Det som er per språk, er stemmepakkene:

- **Modell:** én nedlasting, cirka 3,55 GB, felles for alle språk.
- **Stemmepakke per språk:** referanseklipp (for eksempel en kvinne og en mann), cirka 0,2 til 0,4 MB per stemme, pluss lydprøver til lytting.

Brukeren søker opp språket i AI Voices og laster ned stemmepakken for det. Første gang lastes modellen ned samtidig, og knappen viser den samlede størrelsen. Etter det er neste språk bare noen hundre kB.

Et språk kommer bare inn i katalogen etter at stemmene er lyttetestet. Norsk er først. Svensk, dansk og tysk lages på samme måte, med en referanse og fire stemninger hver.

Referansestemmene er laget av VoxCPM2 selv, med stemmebeskrivelse, og er ikke klonet fra ekte personer. Slik skal det fortsette.

## Arkitektur

### 1. Motoren (`voxcpm2-cli`)

- Kilde: [tc-mb/llama.cpp-omni](https://github.com/tc-mb/llama.cpp-omni), MIT, låst til revisjon `d30f00feadb7ebce95bacd55b0d104e3ef501481`.
- Bygges i `.github/workflows/build.yml` per plattform, på samme måte som Keystroke-tillegget: `reccut-voxcpm-mac` (arm64, Metal), `reccut-voxcpm-win-x64.exe` og `reccut-voxcpm-linux-x64`, hver med en `.sha256`.
- Legges ved GitHub-utgivelsen `v<x.y.z>`, lastes ned ved behov og kontrolleres med SHA-256. Den pakkes ikke inn i installasjonsfilen.
- **Risiko:** Uten GPU, på Windows og Linux, kan motoren bli for treg. Mål sanntidsfaktoren på CPU før disse plattformene får stemmene. Mac er først.
- **Risiko:** CLI-en laster 3,5 GB på nytt for hver kjøring. For lange manus trengs en prosess som holder modellen i minnet og får setningene én etter én (stdin/stdout, JSON per linje). Fase 1 kan bruke CLI-en per avsnitt, men fase 2 må ha den vedvarende prosessen.

### 2. Katalogen (`src/main/ttsCatalog.json`, ny seksjon `voxcpm`)

```json
"voxcpm": {
  "license": "Apache-2.0",
  "model": { "repository": "DennisHuang648/<repo>", "revision": "169f64d8b98bbaab1761e4ca3a83e6af653456cc",
             "files": [{ "path": "VoxCPM2-BaseLM-Q8_0.gguf", "size": 1727309920, "sha256": "…" },
                       { "path": "VoxCPM2-Acoustic-F16.gguf", "size": 1825096352, "sha256": "…" }] },
  "engine": { "revision": "d30f00f…", "files": { "mac": { "name": "reccut-voxcpm-mac", "sha256": "…" } } },
  "settings": { "cfg": 3.5, "steps": 250, "timesteps": 10, "temperature": 1.0, "suffix": "Dry, close-mic studio recording with no reverb." },
  "moods": [{ "id": "neutral", "label": "Neutral", "prompt": "…" }],
  "languages": [{ "lang": "nb", "voices": [{ "id": "nb-female-1", "name": "…", "gender": "Female",
                  "reference": { "path": "…", "size": 0, "sha256": "…" } }] }]
}
```

- **Lisenssjekk:** Kontroller lisensen til GGUF-konverteringen fra DennisHuang648 før den tas inn (originalen er Apache 2.0). Hvis lisensen er uklar, konverterer vi selv fra `openbmb/VoxCPM2` og publiserer filene.
- SHA-256 for GGUF-filene står i testoppsettet fra lyttetesten. Hent dem derfra eller regn dem ut på nytt.

### 3. Hovedprosessen (`src/main/voxcpm.js`, ny)

Følg mønsteret til Piper i [src/main/tts.js](../src/main/tts.js): `status`, `installLanguage(lang)`, `cancel`, `removeLanguage`, `removeModel`, og nedlasting til en midlertidig mappe som byttes inn til slutt.

- **Viktig:** `fetchBytes` leser hele svaret inn i minnet. Det går ikke med filer på 1,8 GB. Modellfilene må strømmes til disk med SHA-256 underveis, og nedlastingen må kunne fortsette etter et avbrudd (`Range`).
- **Generering:** Kjør `voxcpm2-cli` med `spawn` og argumentene over, en midlertidig wav som utdata, og les den inn som `{ samples, rate }`. Teksten deles med `chunksForSpeech` fra `src/shared/tts.js`. Avbryt med `kill` når jobben avbrytes.
- Manglende modell eller stemmepakke kaster `MODEL_MISSING:voices`.
- Kobles inn der Piper og Kokoro rutes i dag (`engine: 'voxcpm'`, se `ttsJobs.js` og `main.js`).

### 4. Brukerflaten

#### Stemmepakker: første gang VO-studio åpnes, og i innstillingene

Første gang brukeren åpner Voice Over Studio, kommer et vindu med alle stemmepakkene, så brukeren kan velge og laste ned alt de vil ha på én gang. Samme liste finnes under Innstillinger › AI, så pakker kan legges til eller fjernes senere.

- **Én komponent, tre steder:** `VoicePackages.jsx` brukes i velkomstvinduet i VO-studio, under Innstillinger › AI og når en funksjon kaster `MODEL_MISSING:voices`. Da er listen alltid lik, uansett hvor den åpnes.
- **Innhold:**
  - VoxCPM2-modellen.
  - Språkene med VoxCPM-stemmer, med søk og en avkrysning per språk.
  - Kokoro.
  - Piper-stemmene per språk.

  Hver rad sier hva pakken er, hvilke språk den dekker, størrelsen og lisensen, og har en lytteknapp med de ferdige lydprøvene.
- **Avhengigheter:** Krysser brukeren av et VoxCPM-språk, krysses modellen av automatisk, og summen nederst viser den samlede størrelsen (for eksempel «3,55 GB + 0,4 MB»). Fjernes det siste VoxCPM-språket, tilbys det å fjerne modellen også.
- **Forslag:** Språket i appen og systemspråket er krysset av som forslag. Ingenting lastes ned før brukeren trykker «Download selected».
- **Én gang:** Vinduet vises bare første gang. At det er vist, lagres i hovedprosessen (`voicePackagesAsked`), sammen med de andre samtykkene. «Not now» lukker vinduet uten å laste ned noe. Studioet virker fortsatt med opptak av egen stemme.
- **Nedlasting i bakgrunnen:** Nedlastingene går som vanlige bakgrunnsjobber (`jobs.add`, `kind: 'download'`) med fremdrift og avbryt, så brukeren kan bruke studioet mens de pågår.
- **Velkomstvinduet for appen ([AiModels.jsx](../src/renderer/AiModels.jsx)):** Velkomstvinduet ved første oppstart beholder sin egen rad for stemmer, med hva den brukes til og størrelsen, slik regelen i `CLAUDE.md` krever. Velger brukeren stemmer der, åpnes `VoicePackages`, i stedet for at det finnes to ulike lister. Krysser brukeren av stemmer der, regnes stemmevinduet som vist, og VO-studio viser det ikke igjen.

#### AI Voices-vinduet

- **[AiVoice.jsx](../src/renderer/voiceover/AiVoice.jsx):** For språk med VoxCPM-stemmer kommer en ny gruppe øverst, «Voices made for Norwegian (VoxCPM2)». Hver stemme har en lytteknapp og en stemningsvelger.
- **Lytting før nedlasting:** Ferdige lydprøver per stemme og stemning (`voice-samples/voxcpm/<voice>-<mood>.ogg`), slik som Piper-prøvene. Brukeren skal kunne høre alt før 3,5 GB lastes ned.
- **Manglende pakker:** Mangler språket i manuset en pakke, vises en lenke til `VoicePackages` med det språket valgt.
- **Personen:** `ai: { engine: 'voxcpm', voice: 'nb-female-1', mood: 'angry', lang: 'nb' }`. Stemningen kan endres i personens innstillinger etterpå.
- **Hastighet:** VoxCPM har ingen hastighetsparameter. Skjul hastighetssliderne for VoxCPM i fase 1, eller bruk `atempo` etterpå.

### 5. Tester (`test/tts.test.mjs`)

- `voxcpm` i katalogen har låst revisjon, størrelse og SHA-256 for alle filer, og lisensen er Apache 2.0 eller MIT.
- Ingen GGUF-filer eller `voxcpm`-binærfiler i `extraResources`, `files` eller `dependencies`.
- Hver stemning har id, navn og beskrivelse, og ingen beskrivelse inneholder «trailer», «movie», «hall» eller «stage».
- Hver stemme har en referanse med SHA-256.
- `VoicePackages` starter ingen nedlasting før brukeren trykker last ned, og alle rader viser bruk og størrelse.
- Manuset og `inputs` fra `recording.json` sendes aldri ut av maskinen. Motoren får teksten som argument eller via stdin, aldri over nett.
- Oppdater `CLAUDE.md` (avsnittet om AI-stemmer) med VoxCPM2, lisensene og nedlastingsreglene.

## Faser

1. **Stemmepakke for norsk:** Velg endelige referanser (utgangspunkt: `ref-kvinne-kort.wav` og `ref-mann-kort.wav`), lag lydprøver for alle stemninger, lyttetest og sjekk ord med Whisper. Avgjør om «serious» skal med.
2. **Motor i CI:** Bygg `voxcpm2-cli` for Mac og legg den ved utgivelsen. Mål hastigheten.
3. **Nedlasting og katalog:** `voxcpm`-seksjonen, strømming til disk, tester.
4. **Generering:** `engine: 'voxcpm'` i hovedprosessen, med CLI per avsnitt.
5. **Stemmepakker:** `VoicePackages.jsx` med alle pakkene (VoxCPM2, språk, Kokoro og Piper). Vises første gang VO-studio åpnes og under Innstillinger › AI, og kobles til `AiModels.jsx` og `MODEL_MISSING:voices`.
6. **Brukerflate:** Gruppen i AI Voices, stemningsvelger og lydprøver.
7. **Vedvarende motorprosess:** Modellen holdes i minnet, så lange manus går fortere.
8. **Flere språk:** Svensk, dansk og tysk, med samme fremgangsmåte som i fase 1.
9. **Windows og Linux:** Når hastigheten på CPU er målt og godtatt.

## Åpne spørsmål

- Er 3,55 GB greit? En mindre kvantisering (Q4) er ikke testet. Den kan gi bedre tid og plass, men dårligere lyd.
- Skal stemningen kunne settes per replikk i manuset, og ikke bare per person? Det er nyttig, men en egen fase.
- Skal Piper-stemmene for norsk bli værende som et lett alternativ (63 MB)? Anbefaling: ja.
- Skal Clean Voice slås på automatisk for VoxCPM-klipp, og med hvilken styrke?
