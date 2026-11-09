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

## AI-stemmer (Voice Over Studio)

- AI-stemmene er Kokoro-82M (Apache 2.0) og kjører lokalt i et skjult arbeidsvindu ([src/worker/tts.js](src/worker/tts.js)). Nedlastingen er i [src/main/tts.js](src/main/tts.js).
- Uttalen kommer fra phonemizer.js, som inneholder eSpeak NG (GPLv3). Den skal aldri pakkes inn i installasjonsfilen eller legges i `dependencies`. Den lastes ned fra npm når brukeren ber om AI-stemmer. Testen `test/tts.test.mjs` sjekker dette.
- Alle filer er låst i [src/main/ttsCatalog.json](src/main/ttsCatalog.json): modellen og stemmene med fast revisjon og SHA-256, uttalepakken med npm sin sha512. Endres versjonen, må kontrollsummene regnes ut på nytt.
- Ingenting lastes ned før brukeren trykker Download AI Voices, og manuset sendes aldri ut av maskinen.
