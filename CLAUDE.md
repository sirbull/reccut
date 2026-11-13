# Reccut

## Ny versjon

Når vi lager en ny versjon av Reccut, må About-vinduet også vise det nye versjonsnummeret.

- Sett versjonen med `npm version <x.y.z> --no-git-tag-version`. Det oppdaterer både `package.json` og `package-lock.json`.
- About-vinduet ([src/main/about.js](src/main/about.js)) henter versjonen fra `package.json` via `app.getVersion()`. Ikke skriv versjonsnummeret direkte i koden.
- Start appen (`npm start`), åpne Reccut › About Reccut og sjekk at riktig versjon vises.
- Oppdateringssjekken ([src/main/updates.js](src/main/updates.js)) sammenligner med samme versjon, så den må stemme med GitHub-utgivelsen.
- Keystroke-tillegget lastes ned fra utgivelsen med samme versjon (`v<x.y.z>`). Byggeflyten legger det ved automatisk når taggen pushes. Sjekk at utgivelsen har `reccut-keystrokes-*` med tilhørende `.sha256`, ellers får brukerne beskjed om at tillegget ikke er publisert ennå.

## Dokumentasjon på nettsiden

- Docs-siden på nettstedet ([docs/docs/index.html](docs/docs/index.html)) genereres fra håndboken i appen (`src/renderer/help`) og kommandoregisteret. Ikke rediger den for hånd.
- Kjør `npm run docs` etter endringer i hjelpetekstene eller hurtigtastene. Den kopierer også bildene fra `assets/help` til `docs/docs/help`. Testen `test/docs-site.test.mjs` feiler hvis siden ikke er oppdatert.

## Keystroke-tillegget

- Reccut selv skal aldri lese tastaturet globalt. Ingen tastaturkrok, `uiohook`, `GetAsyncKeyState` eller lignende i `src/` eller i `dependencies`. Testen `test/keystrokes.test.mjs` sjekker dette.
- All global tastaturlesing ligger i [native/keystrokes](native/keystrokes), som bygges for seg og aldri pakkes inn i installasjonsfilen.
- Filteret (bare snarveier, aldri vanlig skriving) ligger i selve hjelpeprogrammet, slik at vanlige tegn aldri når Reccut.
- Unntakene er venstre tastaturhalvdel (`--game`) og hele tastaturet (`--full-keyboard`), med listene `GAME_KEYS` og `FULL_KEYS` i [native/keystrokes/filter.h](native/keystrokes/filter.h). Hvert av dem krever et eget samtykke som lagres i hovedprosessen, og begge er av som standard. Listene skal ikke utvides uten at brukeren ber om det.
- Tastetrykk (`inputs` i `recording.json`) skal aldri sendes til AI-verktøyene.

## AI-stemmer (Voice Over Studio)

- AI-stemmene er Kokoro-82M (Apache 2.0) og kjører lokalt i et skjult arbeidsvindu ([src/worker/tts.js](src/worker/tts.js)). Nedlastingen er i [src/main/tts.js](src/main/tts.js).
- VoxCPM2 (Apache 2.0) får en egen lokal motor i [src/main/voxcpm.js](src/main/voxcpm.js). Første implementasjon støtter bare Apple Silicon. Motoren bygges fra låst `tc-mb/llama.cpp-omni` (MIT), lastes ned fra samme Reccut-utgivelse og SHA-256-kontrolleres før den kjøres. Verken binærfilen eller GGUF-vektene pakkes i installasjonsfilen.
- VoxCPM2-modellen (3,55 GB) deles av språkene og strømmes til disk med kontrollsum og gjenopptakelse ved avbrudd. Katalogen har norsk, amerikansk engelsk, svensk, dansk og tysk med to syntetiske referansestemmer hver. Brukeren godtok disse som første versjon 12. november, med kjente kvalitetsforskjeller og uløst norsk uttalefeil. Referansene er låst med størrelse og SHA-256, lagres i `native/voxcpm/voices` og publiseres som separate vedlegg til samme Reccut-versjon som motoren (`source: 'release'`); de pakkes ikke i installasjonsfilen. `scripts/prepare-voxcpm-voices.mjs` kontrollerer filene før publisering. HF-pakker har fortsatt fast revisjon. Ingen nedlasting skjer fra status eller generering; installasjon startes uttrykkelig av brukeren. Ingen manus eller `recording.json` sendes over nett.
- Uttrykkene har fast tørr studiobeskrivelse og `cfg: 3.5`. Reccuts stdio-adapter gjenbruker modellen mellom setninger og talejobber, med fremdrift og avbryt gjennom talekøen. Prosessen frigjøres etter 60 sekunder uten arbeid og stoppes ved avbryt/feil, installasjon/fjerning og når appen avsluttes; se [docs/plan-voxcpm2.md](docs/plan-voxcpm2.md). Motorens protokollversjon kontrolleres uten å laste modellen, og tekst sendes bare over stdin. Lisenstekstene (også JSON-parserens MIT-lisens) følger appens frakoblede lisensoversikt i `assets/licenses`.
- VoxCPM-gruppen i AI Voices og stemningsvelgeren for personer styres av katalogen (`src/renderer/voiceover/voxcpm.js`). Uttrykkene er felles for språkene: Neutral, Intense, Angry, Sad, Warm, Sensual, Cheerful, Confident, Reassuring og Whispering. Hver katalogført stemme har ferdige lokale lydprøver i alle ti uttrykk. Første versjon er godtatt som den er; ikke krev en ny lyttetestrunde for disse referansene. Senere prøver er ikke automatisk merket som individuelt menneskevurdert. `ai: { engine: 'voxcpm', voice, mood, lang }` følger personen; endringer gjelder nye opptak. `src/shared/aiVoice.js` sjekker riktig modell/motor/språk og utelater hastighet og talerparametere for VoxCPM. Kokoro og Piper beholder sine innstillinger; de får ikke VoxCPM-beskrivelser som stemningsstyring.
- `VoicePackages.jsx` er felles stemmepakkeliste for første åpning av VO-studio, Innstillinger › AI, appens velkomstvindu og `MODEL_MISSING:voices`. `voicePackagesAsked` lagres i hovedprosessen og sier bare at listen er vist, aldri at nedlasting er godkjent. Språkforslag og lytting starter ingen modellnedlasting. Pakker lastes ned etter «Download selected», som separate bakgrunnsjobber i den serielle `voiceDownloads`-køen; felles modell og uttaletillegg telles bare én gang.
- Uttalen kommer fra phonemizer.js, som inneholder eSpeak NG (GPLv3). Den skal aldri pakkes inn i installasjonsfilen eller legges i `dependencies`. Den lastes ned fra npm når brukeren ber om AI-stemmer. Testen `test/tts.test.mjs` sjekker dette.
- Alle filer er låst i [src/main/ttsCatalog.json](src/main/ttsCatalog.json): modellen og stemmene med fast revisjon og SHA-256, uttalepakken med npm sin sha512. Endres versjonen, må kontrollsummene regnes ut på nytt.
- Ingenting lastes ned før brukeren trykker Download AI Voices, og manuset sendes aldri ut av maskinen.
- Språk som Kokoro ikke har egne stemmer for (norsk, svensk, dansk, tysk og flere), får Piper-stemmer fra `rhasspy/piper-voices`, låst under `piper` i `ttsCatalog.json`. Bare stemmer med åpen lisens (CC0, CC BY 4.0, Apache 2.0 eller MIT) skal inn i katalogen, aldri AGPL, ikke-kommersielle eller uklare. Testen i `test/tts.test.mjs` sjekker dette.

## KI-modeller lastes ned ved behov

- Ingen modellvekter skal pakkes inn i installasjonsfilen: verken Whisper, BiRefNet eller Kokoro. `extraResources` skal ikke ha `subtitle-models` eller `models`, og `postinstall` og `dist` skal ikke laste ned modeller. Testene i `test/subtitle-models.test.mjs` og `test/tts.test.mjs` sjekker dette.
- Første gang appen startes, spør den én gang hvilke modeller brukeren vil laste ned ([src/renderer/AiModels.jsx](src/renderer/AiModels.jsx)). Vinduet skal alltid si hva hver modell brukes til og hvor stor den er.
- En funksjon som mangler modellen sin, kaster `MODEL_MISSING:<captions|background|voices>` og åpner det samme vinduet i stedet for å vise en feilmelding.
- Lisenstekstene til modellene ligger i `assets/licenses`, så lisensoversikten kan bygges uten modellene.
- Unntak: støyfjerningsmodellen til Clean Voice (DeepFilterNet 3, MIT/Apache 2.0, 16 MB) følger med appen, etter ønske fra brukeren. Den ligger i `assets/denoise`, kopieres til `build/denoise` og er låst med SHA-256 i `test/clean-voice.test.mjs`. Ingen andre modeller skal pakkes inn.

## Clean Voice (AI-støyfjerning)

- Slås på per lydkomponent i Audio-fanen (`props.cleanVoice[key]` = styrke 0 til 1), og under Sound i Properties i multicam-vinduet (`angle.sound.clean`, som blir `props.cleanVoice` på klippene). Kjører lokalt i et skjult arbeidsvindu ([src/worker/denoise.js](src/worker/denoise.js)).
- Hver kildefil renses én gang til `clean-voice.flac` i hurtigbufferen, med fire kanaler: original V/H og renset V/H. Styrken blandes inn med `cleanNoiseGain` i avspillingen (lydtråden) og eksporten (ffmpeg `pan`), så slideren virker med en gang.
- Modellen (DeepFilterNet 3, MIT/Apache 2.0, 16 MB) følger med appen. Den finnes bare ett sted, `assets/denoise/denoiser_model.onnx` (kopieres til `build/denoise`), og er låst med SHA-256 i `test/clean-voice.test.mjs`. Alle deler av appen som bruker Clean Voice, bruker denne ene modellen. Ikke legg inn en kopi.

## Multicam

- Klippene på tidslinjen er sannheten for kutt og trimming. Før multicam-klippet bygges på nytt (Edit Multicam Clip, Active Audio Angle), leses de tilbake med `absorbTimeline` i [src/shared/multicam.js](src/shared/multicam.js), og `buildMulticamClips` gir hver ny bit effektene, nøkkelbildene, fargen og overgangene fra klippet den kom fra. Brukerens arbeid i redigeringen skal aldri gå tapt uten at de blir spurt.
- Active Video Angle bytter kilden i selve klippet (`switchClipAngle`), uten å bygge om gruppen.
