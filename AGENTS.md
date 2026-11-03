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
