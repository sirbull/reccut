# Reccut

## Ny versjon

Når vi lager en ny versjon av Reccut, må About-vinduet også vise det nye versjonsnummeret.

- Sett versjonen med `npm version <x.y.z> --no-git-tag-version`. Det oppdaterer både `package.json` og `package-lock.json`.
- About-vinduet ([src/main/about.js](src/main/about.js)) henter versjonen fra `package.json` via `app.getVersion()`. Ikke skriv versjonsnummeret direkte i koden.
- Start appen (`npm start`), åpne Reccut › About Reccut og sjekk at riktig versjon vises.
- Oppdateringssjekken ([src/main/updates.js](src/main/updates.js)) sammenligner med samme versjon, så den må stemme med GitHub-utgivelsen.
- Keystroke-tillegget lastes ned fra utgivelsen med samme versjon (`v<x.y.z>`). Byggeflyten legger det ved automatisk når taggen pushes. Sjekk at utgivelsen har `reccut-keystrokes-*` med tilhørende `.sha256`, ellers får brukerne beskjed om at tillegget ikke er publisert ennå.

## Keystroke-tillegget

- Reccut selv skal aldri lese tastaturet globalt. Ingen tastaturkrok, `uiohook`, `GetAsyncKeyState` eller lignende i `src/` eller i `dependencies`. Testen `test/keystrokes.test.mjs` sjekker dette.
- All global tastaturlesing ligger i [native/keystrokes](native/keystrokes), som bygges for seg og aldri pakkes inn i installasjonsfilen.
- Filteret (bare snarveier, aldri vanlig skriving) ligger i selve hjelpeprogrammet, slik at vanlige tegn aldri når Reccut.
- Unntakene er venstre tastaturhalvdel (`--game`) og hele tastaturet (`--full-keyboard`), med listene `GAME_KEYS` og `FULL_KEYS` i [native/keystrokes/filter.h](native/keystrokes/filter.h). Hvert av dem krever et eget samtykke som lagres i hovedprosessen, og begge er av som standard. Listene skal ikke utvides uten at brukeren ber om det.
- Tastetrykk (`inputs` i `recording.json`) skal aldri sendes til AI-verktøyene.

## Clean Voice (AI-støyfjerning)

- Slås på per lydkomponent i Audio-fanen (`props.cleanVoice[key]` = styrke 0 til 1), og under Sound i Properties i multicam-vinduet (`angle.sound.clean`, som blir `props.cleanVoice` på klippene). Kjører lokalt i et skjult arbeidsvindu ([src/worker/denoise.js](src/worker/denoise.js)).
- Hver kildefil renses én gang til `clean-voice.flac` i hurtigbufferen, med fire kanaler: original V/H og renset V/H. Styrken blandes inn med `cleanNoiseGain` i avspillingen (lydtråden) og eksporten (ffmpeg `pan`), så slideren virker med en gang.
- Modellen (DeepFilterNet 3, MIT/Apache 2.0, 16 MB) følger med appen. Den finnes bare ett sted, `assets/denoise/denoiser_model.onnx` (kopieres til `build/denoise`), og er låst med SHA-256 i `test/clean-voice.test.mjs`. Alle deler av appen som bruker Clean Voice, bruker denne ene modellen. Ikke legg inn en kopi.

## Multicam

- Klippene på tidslinjen er sannheten for kutt og trimming. Før multicam-klippet bygges på nytt (Edit Multicam Clip, Active Audio Angle), leses de tilbake med `absorbTimeline` i [src/shared/multicam.js](src/shared/multicam.js), og `buildMulticamClips` gir hver ny bit effektene, nøkkelbildene, fargen og overgangene fra klippet den kom fra. Brukerens arbeid i redigeringen skal aldri gå tapt uten at de blir spurt.
- Active Video Angle bytter kilden i selve klippet (`switchClipAngle`), uten å bygge om gruppen.
