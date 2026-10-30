# OBSlite

En enkel skjerm- og kameraopptaker for Mac og Windows. Ta opp skjermen med deg selv som bilde i bilde, og bytt oppsett med en hurtigtast mens du tar opp.

## Funksjoner

* Skjermopptak i skjermens native oppløsning (også Retina og 4K)
* Webkamera eller eksternt kamera
* Intern eller ekstern mikrofon, med nivåmåler
* Seks oppsett som kan byttes under opptak, med myk overgang
  1. Kamera i fullskjerm
  2. Skjerm i fullskjerm
  3. Bilde i bilde oppe til venstre
  4. Bilde i bilde oppe til høyre
  5. Bilde i bilde nede til venstre
  6. Bilde i bilde nede til høyre
* Kamerabildet kan være sirkel, kvadrat eller rektangel (16:9), i tre størrelser
* Globale hurtigtaster som virker selv om en annen app er i fokus
* Lagrer MP4 (H.264) rett til disk, som standard i `Filmer/OBSlite` (Mac) eller `Videoer\OBSlite` (Windows)
* OBSlite skjuler sitt eget vindu fra opptaket

## Hurtigtaster

| Handling | Mac (standard) | Windows (standard) |
| --- | --- | --- |
| Oppsett 1 til 6 | Ctrl + Option + 1 til 6 | Ctrl + Shift + 1 til 6 |
| Start og stopp opptak | Ctrl + Option + 0 | Ctrl + Shift + 0 |

Tastekombinasjonen kan endres i appen. På Mac brukes Cmd + Shift + 3, 4 og 5 av systemet til skjermbilder, derfor er ikke det standardvalget.

## Installere

Installasjonsfiler bygges automatisk av GitHub Actions (fanen **Actions**, arbeidsflyten **Bygg installasjonsfiler**, knappen **Run workflow**). Når kjøringen er ferdig ligger `.dmg` for Mac og `.exe` for Windows under **Artifacts**. Lager du en tag som `v0.1.0`, legges filene også ved en release.

Appen er foreløpig ikke kodesignert:

* **Mac:** Hvis macOS sier at appen er skadet, kjør `xattr -cr /Applications/OBSlite.app` i Terminal. Første gang må du gi tilgang til kamera, mikrofon og skjermopptak (Systeminnstillinger, Personvern og sikkerhet, Skjerm- og systemlydopptak), og deretter starte appen på nytt.
* **Windows:** Velg **Mer informasjon** og **Kjør likevel** hvis SmartScreen advarer.

## Kjøre fra kildekoden

Krever Node.js 20 eller nyere.

```bash
npm install
npm start
```

Bygg installasjonsfil lokalt:

```bash
npm run dist:mac   # på en Mac
npm run dist:win   # på Windows
```

## Teknisk

Electron app. Skjermen hentes med `getDisplayMedia`, kamera og mikrofon med `getUserMedia`. Alt settes sammen på et lerret med samme oppløsning som skjermen, og `MediaRecorder` koder til H.264 (maskinvareakselerert der det finnes). Opptaket skrives til disk hvert sekund, så lange opptak ikke fyller minnet.

| Fil | Innhold |
| --- | --- |
| `src/main.js` | Vindu, skjermvalg, hurtigtaster, tillatelser og skriving til fil |
| `src/preload.js` | Trygg bro mellom vindu og hovedprosess |
| `src/renderer/compositor.js` | Setter sammen skjerm og kamera, og animerer mellom oppsett |
| `src/renderer/app.js` | Grensesnitt, kilder og opptak |
