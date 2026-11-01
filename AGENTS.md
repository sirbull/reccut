# Reccut

## Ny versjon

Når vi lager en ny versjon av Reccut, må About-vinduet også vise det nye versjonsnummeret.

- Sett versjonen med `npm version <x.y.z> --no-git-tag-version`. Det oppdaterer både `package.json` og `package-lock.json`.
- About-vinduet ([src/main/about.js](src/main/about.js)) henter versjonen fra `package.json` via `app.getVersion()`. Ikke skriv versjonsnummeret direkte i koden.
- Start appen (`npm start`), åpne Reccut › About Reccut og sjekk at riktig versjon vises.
- Oppdateringssjekken ([src/main/updates.js](src/main/updates.js)) sammenligner med samme versjon, så den må stemme med GitHub-utgivelsen.
