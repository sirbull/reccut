# Plan: VoxCPM2-stemmer med stemning i Voice Over Studio

Status: implementasjon påbegynt 12. november 2026. Skrevet 11. november 2026 etter lyttetestene i `vendor/voice-tests/norwegian/lyttetest.html`.

Utgivelsesmål: **Reccut 0.9.3**, med tagg **v0.9.3**. Versjonen er satt med
`npm version 0.9.3 --no-git-tag-version`. Se [utgivelsesnotater og kontrollpunkter](releases/0.9.3.md)
og [brukerveiledning for stemmene](AI-VOICES.md). Versjonssettingen publiserer ikke en utgivelse.

Første implementasjon omfatter grunnlaget for fase 2–4:

- Mac arm64-motor med statiske biblioteker og innebygd Metal, bygget fra låst revisjon, med CI-vedlegg og kontrollsum per utgivelse.
- Modellkatalog med verifiserte SHA-256-verdier og Apache 2.0-lisens for GGUF-konverteringen. Frakoblet lisensoversikt inkluderer modell og motor.
- `src/main/downloadFile.js` strømmer til disk og gjenopptar delvise modellfiler med `Range`. Feil kontrollsum eller størrelse blir aldri en installert modell.
- `src/main/voxcpm.js` håndterer status, modell/språkinstallasjon, avbryt, fjerning og lokal generering per setning. Motoren SHA-256-kontrolleres før kjøring, teksten sendes som lokale argumenter, og midlertidige WAV-filer ryddes opp.
- IPC er koblet til eksisterende nedlastingsjobber og talekø, med fremdrift og avbryt. Ingen installasjon starter fra status eller generering.

Andre implementasjon (12. november) omfatter fase 5 og klargjøring av fase 1:

- `VoicePackages.jsx` er den felles listen i første åpning av studioet, Innstillinger › AI og ved `MODEL_MISSING:voices`. Appens velkomstvindu beholder raden om stemmenes bruk og størrelse, men sender valget videre til samme liste.
- Listen viser bruk, størrelse, lisens og lokale lydprøver, med søk og forslag fra system-/appspråk. Ingen nedlasting starter ved åpning, valg eller lytting. Kokoro/Piper deler uttaletillegget i størrelsessummen; VoxCPM-språk velger den felles modellen automatisk.
- At listen er vist, lagres som `voicePackagesAsked` i hovedprosessen (`voice-packages.json`). «Not now» lar studioet brukes med egen mikrofon. Nedlastinger går i egne vanlige bakgrunnsjobber, serielt så uttaletillegget kan deles, med fremdrift og avbryt også mens pakken står i kø.
- Alle åtte norske v3-prøver og begge referanser er samlet i en lokal lytterapport med normalisert lyttenivå, SHA-256, varighet og Whisper Base-transkripsjoner. Whisper gjenkjenner begge «ikke» i alle åtte stemningsprøver, men flagger andre ord og variasjoner. Resultatene er lagret i [voxcpm-norwegian-review.json](voxcpm-norwegian-review.json); ingen av stemmene er godkjent automatisk.

Tredje implementasjon (12. november) omfatter fase 6, styrt av katalogen:

- AI Voices viser en egen VoxCPM2-gruppe øverst for språk som har katalogførte stemmer, med én stemningsvelger per stemme. Lytting bruker ferdige lokale prøver også før modellen er lastet ned; manglende pakker åpner den felles pakkelisten.
- En ny VoxCPM-person lagrer `{ engine: 'voxcpm', voice, mood, lang }`. Personens innstillinger lar stemning og stemme endres senere, uten å endre eksisterende lydfiler. Hastighetsslideren skjules for VoxCPM; Kokoro/Piper beholder hastighet og talervalg.
- `src/shared/aiVoice.js` deler ruting, tilgjengelighetssjekk og genereringsparametere mellom avspilling og opptak. VoxCPM krever sin egen modell, motor og språkpakke; en installert Kokoro-modell kan ikke føre til at feil motor brukes. `mood` følger med til motoren, mens `speed` og `speaker` utelates for VoxCPM.
- `scripts/test-voxcpm-picker.cjs` bygger en separat testutgave med teststemmer på norsk, engelsk og tysk i en midlertidig katalog. Den verifiserer lytting uten nedlasting, pakkevalg, alle ti uttrykk, generering/lagring av Warm og Sensual på engelsk, vanlige 48 kHz-opptak, uendrede eksisterende lydfiler og bytte mellom språk og VoxCPM/Piper. Testens lydprøver og generering er tekniske testdata, ikke en kvalitetstest av kandidatene.

Fjerde implementasjon (12. november) omfatter fase 7:

- `native/voxcpm/voxcpm_server.cpp` er en lokal stdio-adapter over den låste VoxCPM2-runtime-en. Vekter og kompilerte grafer holdes i minnet, mens runtime-en nullstiller setningskontekst ved hver generering. Motoren bygges som samme separate utgivelsesvedlegg, med protokollsjekk og lisenstekst for JSON-parseren.
- `src/main/voxcpmProcess.js` håndterer oppstart, JSON-linjer, tidsavbrudd, kontroll av svar og gjenbruk mellom talejobber. Tekst sendes bare over stdin. Prosessen stoppes ved avbryt eller feil, ved installasjon/fjerning, når appen avsluttes, og etter 60 sekunder uten arbeid. Ingen avbrutt tekst prøves automatisk på nytt.
- `src/main/voxcpm.js` beholder setningsfremdrift og midlertidige WAV-filer, men starter ikke lenger modellen på nytt per setning. Motorens protokollversjon sjekkes uten vekter før den godkjennes ved installasjon; gamle CLI-binærer kan ikke merkes som kompatible.
- Den ekte motoren er testet med begge eksisterende referanser: flere setninger/stemninger i samme prosess, bytte av referanse og tilbake, identiske PCM-samples ved samme tekst/stemme/stemning, avbryt og ren oppstart etterpå. [Kontrollresultater](voxcpm-process-check.json) inkluderer kontrollsummer og målinger. Første måling var cirka 23,2 s med oppstart mot 5,6 s uten ny modellinnlasting; med OS/Metal-cache var en senere måling cirka 9,2 mot 5,6 s for 1,76 s lyd. Dette gjelder en kort teknisk prøve, ikke generell ytelse eller stemmekvalitet.

Uttalekontroll etter brukerens lytting: Mannen sier fortsatt «osses»/«oss oss» også i oppfølgingsprøven med ny variasjon. Setningsdeling og seed 7 er ikke en bekreftet løsning, selv om Whisper gjengir ett «oss». Feilen står som uløst. En siste avgrenset kontroll sammenligner CFG 3,5 med 3 og 2, siden upstream-verktøyet anbefaler 1–3; manus, referanse og øvrige parametere er like. De to nye prøvene er ikke lyttetestet/godkjent, og produksjonsinnstillingene er uendret. Se [lytteoppfølgingen](../vendor/voice-tests/norwegian/oss-check/lower-guidance/index.html).

Utvidelse etter brukerønske (12. november): Stemningslisten er nå felles for alle VoxCPM-språk og har ti uttrykk: Neutral, Intense, Angry, Sad, Warm, Sensual, Cheerful, Confident, Reassuring og Whispering. De fire eksisterende id-ene og beskrivelsene er beholdt. Pakkelisten beregner antall uttrykk og lydprøver fra katalogen. Kokoro/Piper får ikke disse VoxCPM-beskrivelsene som stemningsstyring.

`scripts/voice-expression-samples.mjs` lager syntetiske referanser og en [egen lokal lyttepakke for flere språk](../vendor/voice-tests/expressions/index.html), uten nedlastinger. Den første sammenligningen hadde 50 prøver: engelsk (USA) med alle ti uttrykk, norsk med de seks nye, og svensk, dansk og tysk med nøytral, varm og sensuell. `--all-expressions` fullfører alle ti uttrykk for begge stemmer på alle fem språk, med samme tekst per språk. Ingen lyd klippes for å skjule uttalefeil.

**Brukerens beslutning 12. november:** «Det er ikke alle stemmene som er like gode, men jeg tenker det får holde. Jeg kan heller gå tilbake og gjøre justeringer. Vi må nesten videre i prosessen.» Dette godtar dagens referanser og uttrykk som første versjon, med kvalitetsforskjeller og den kjente norske uttalefeilen. Det betyr ikke at alle senere lydprøver er lyttet til enkeltvis eller at feilen er løst. Det skal ikke kreves en ny kvalitetsrunde før integrasjon. Målet på 3–4 sekunder beholdes for nye referanser; de godtatte første referansene omfatter en dansk kvinne på 2,88 s og en amerikansk mann på 4,64 s.

Femte implementasjon klargjør fase 1 og 8 for første versjon:

- `voxcpm.languages` inneholder nå norsk, amerikansk engelsk, svensk, dansk og tysk, med Woman 1 / Man 1 per språk. Referanser er syntetiske og låst med størrelse og SHA-256.
- Referansefilene i `native/voxcpm/voices` pakkes ikke i installasjonsfilen. `source: 'release'` henter dem fra samme Reccut-utgivelse som motoren; appen kontrollerer dem mot katalogens faste kontrollsummer. HF-kilder med låst revisjon støttes fortsatt. Uendrede referanser overlever en appoppdatering; motoren følger fortsatt appversjonen.
- `scripts/prepare-voxcpm-voices.mjs` kontrollerer størrelse, hash og WAV-format, og klargjør små utgivelsesvedlegg med kontrollsummer, manifest og MIT-lisens. CI gjør dette sammen med motorbyggingen.
- `scripts/install-voxcpm-local.mjs` bruker den vanlige verifiserte installasjonen med lokale kildefiler, uten nett. Alle fem språk er installert i utviklingsprofilen fra de eksisterende modellfilene; dette kjøres aldri fra appstart, postinstall eller bygg.
- Hver stemme får lokale OGG-prøver i alle ti uttrykk. Kvalitetsforskjeller kan justeres senere uten at eksisterende opptak endres.

Verifisert første versjon: 100 ekte OGG-prøver er lagt i `assets/voice-samples/voxcpm`, med kontrollsummer og brukerens vurdering i [voxcpm-expressions-review.json](voxcpm-expressions-review.json). Bygg og alle 864 tester består, inkludert nedlasting fra versjonens utgivelse, innholdslåste referanser ved appoppdatering og alle ti uttrykk på engelsk/tysk. Begge isolerte Electron-tester består med den nye katalogen. Bygget har 100 prøver og ingen GGUF-vekter eller referanse-WAV-er. Motor, referanser, kontrollsummer og lisenser er klargjort lokalt som utgivelsesfiler.

Den ekte backend-en er også prøvd mot den installerte utviklingsprofilen, uten nett: engelsk Warm og norsk Sensual ga 48 kHz mono og riktig setningsfremdrift, og det andre språket brukte samme innlastede modell. [Kontrollresultat](voxcpm-first-version-check.json). Dette bekrefter integrasjonen, ikke feilfri uttale. Reproduser med `node scripts/test-voxcpm-installed.mjs "<installert voxcpm-mappe>"`.

**Gjenstår for distribusjon:** CI-oppsettet må kjøres i GitHub, og motoren og referansevedleggene må publiseres med neste Reccut-utgivelse. Ingen utgivelse eller tagg er publisert i denne økten. Fase 9 (Windows/Linux) krever fortsatt ytelsesmåling; appen tilbyr VoxCPM på Apple Silicon.

Kontroll for 0.9.3: Alle 871 tester består. Den lokale installasjonen er oppgradert
til motoren for 0.9.3, med gjenbruk av eksisterende modell- og referansefiler,
uten nett. Ekte generering med engelsk Warm og norsk Sensual, setningsfremdrift
og gjenbruk av innlastet modell er bekreftet i [kontrollrapporten](voxcpm-0.9.3-check.json).
Den tidligere rapporten for 0.9.2 beholdes som historisk resultat.

Reproduser kontrollene uten å laste ned modeller:

```sh
node scripts/review-voxcpm.mjs "<lokal mappe med whisper-base>"
node scripts/voice-expression-samples.mjs "<upstream design-CLI>" "<motor>" "<modellmappe>"
node scripts/voice-expression-samples.mjs "<upstream design-CLI>" "<motor>" "<modellmappe>" --all-expressions
node scripts/prepare-voxcpm-voices.mjs "<utgivelsesmappe>"
npm run build
node scripts/test-voice-packages.cjs
node scripts/test-voxcpm-picker.cjs
node scripts/test-voxcpm-process.mjs "<motor>" "<modellmappe>" "<syntetisk referanse.wav>"
```

UI-testen bruker en isolert Electron-profil og små testjobber, og sjekker førstegangsvisning, lagring i hovedprosessen, søk, lokale prøver, eksplisitt nedlasting og avbryt av køjobber. Lytterapporten i `vendor/` genereres lokalt; kontrollresultatene i `docs/` beholdes i prosjektet.

Modellfilene er låst direkte med SHA-256. Motorbinærens kontrollsum oppstår ved bygging, og lastes derfor ned fra `.sha256`-vedlegget i appens egen utgivelse (som Keystroke-tillegget); kildekoderevisjonen er låst i katalogen og kontrolleres i byggeskriptet.

Verifisering 12. november: Mac-byggeskriptet er kjørt lokalt og gir en 5,2 MB-binær med bare systembiblioteker. En ende-til-ende-prøve gjennom den nye backend-en, med eksisterende lokale modellfiler og den eksperimentelle kvinnereferansen, ga 48 kHz mono-WAV (1,76 s lyd på cirka 21 s inkludert modelloppstart). Dette er en teknisk røykprøve, ikke en godkjenning av stemmekvalitet eller ytelse. Referansen er fortsatt utenfor katalogen.

## Mål

- VoxCPM2 blir hovedstemmen for norsk, og etter hvert for flere språk.
- Brukeren velger stemning eller talemåte før stemmen lages: nøytral, intens, sint, trist, varm, sensuell, glad, selvsikker, beroligende eller hviskende.
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
| `warm` | Warm | Warm, friendly and welcoming, with a soft natural smile and a relaxed conversational tone. |
| `sensual` | Sensual | Soft, low and intimate, with a subtly breathy, unhurried and gently alluring delivery. |
| `cheerful` | Cheerful | Bright, cheerful and upbeat, with a smiling voice and lively, natural expression. |
| `confident` | Confident | Confident, clear and assured, speaking steadily with calm conviction. |
| `reassuring` | Reassuring | Gentle, reassuring and compassionate, speaking calmly and patiently. |
| `whispering` | Whispering | Whisper softly and clearly in a hushed voice, keeping every word intelligible. |

«Serious» (alvorlig) var for lik nøytral i forsøk 2 og er ikke testet i forsøk 3. Den kommer bare med hvis en ny test viser at den skiller seg ut.

## Språk: én modell, små stemmepakker per språk

VoxCPM2 er **én flerspråklig modell med 30 språk**, blant dem norsk, svensk, dansk, tysk, finsk, nederlandsk og polsk. Den trenger ingen språkkode, for den leser språket ut av teksten. Kvaliteten varierer med hvor mye treningsdata hvert språk har. Kilde: [openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2).

Modellen kan altså ikke deles opp per språk, og den lastes ned én gang (cirka 3,55 GB). Det som er per språk, er stemmepakkene:

- **Modell:** én nedlasting, cirka 3,55 GB, felles for alle språk.
- **Stemmepakke per språk:** referanseklipp (for eksempel en kvinne og en mann), cirka 0,2 til 0,4 MB per stemme, pluss lydprøver til lytting.

Brukeren søker opp språket i AI Voices og laster ned stemmepakken for det. Første gang lastes modellen ned samtidig, og knappen viser den samlede størrelsen. Etter det er neste språk bare noen hundre kB.

Nye språk vurderes separat gjennom lytting og ordkontroll. Første versjon med norsk, amerikansk engelsk, svensk, dansk og tysk er godtatt med kvalitetsbegrensninger som beskrevet over. Hvert språk har låste referanser og egne lydprøver for alle ti uttrykk. Nye språk kan godkjennes uavhengig av norsk.

Referansestemmene er laget av VoxCPM2 selv, med stemmebeskrivelse, og er ikke klonet fra ekte personer. Slik skal det fortsette.

## Arkitektur

### 1. Motoren (Reccuts stdio-adapter over VoxCPM2-runtime-en)

- Kilde: [tc-mb/llama.cpp-omni](https://github.com/tc-mb/llama.cpp-omni), MIT, låst til revisjon `d30f00feadb7ebce95bacd55b0d104e3ef501481`.
- Bygges i `.github/workflows/build.yml` per plattform, på samme måte som Keystroke-tillegget: `reccut-voxcpm-mac` (arm64, Metal), `reccut-voxcpm-win-x64.exe` og `reccut-voxcpm-linux-x64`, hver med en `.sha256`.
- Legges ved GitHub-utgivelsen `v<x.y.z>`, lastes ned ved behov og kontrolleres med SHA-256. Den pakkes ikke inn i installasjonsfilen.
- **Risiko:** Uten GPU, på Windows og Linux, kan motoren bli for treg. Mål sanntidsfaktoren på CPU før disse plattformene får stemmene. Mac er først.
- **Løst i fase 7:** Modellen holdes i minnet mellom setninger og talejobber, via stdin/stdout og én JSON-forespørsel per linje. Inaktive prosesser frigjøres etter 60 sekunder.

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
- **Generering:** Start stdio-adapteren med `spawn` ved behov og gjenbruk den mellom setninger. De samme innstillingene sendes med hver JSON-forespørsel; en midlertidig WAV leses inn som `{ samples, rate }`. Teksten deles med `chunksForSpeech` fra `src/shared/tts.js`. Avbryt med `kill`, vent på avslutning og rydd opp.
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
9. **Windows og Linux:** Når hastigheten på CPU er målt og godtatt. Se
   [gjennomføringsplan fra Windows](plan-voxcpm2-windows-linux.md) for verktøy,
   separate CPU-bygg, målekrav, WSL-løype, appintegrasjon og utgivelsesfiler.

## Åpne spørsmål

- Er 3,55 GB greit? En mindre kvantisering (Q4) er ikke testet. Den kan gi bedre tid og plass, men dårligere lyd.
- Skal stemningen kunne settes per replikk i manuset, og ikke bare per person? Det er nyttig, men en egen fase.
- Skal Piper-stemmene for norsk bli værende som et lett alternativ (63 MB)? Anbefaling: ja.
- Skal Clean Voice slås på automatisk for VoxCPM-klipp, og med hvilken styrke?
