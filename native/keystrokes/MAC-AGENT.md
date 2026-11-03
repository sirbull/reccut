# Keystroke-tillegget på Mac: instruksjoner for agent

Denne filen er for en agent som jobber med Reccut på en Mac. Den forklarer hva Keystroke-tillegget er, hvordan det bygges og testes på macOS, og hvilke regler som gjelder. Les også [README.md](README.md) i samme mappe og prosjektreglene i [CLAUDE.md](../../CLAUDE.md).

## Hva tillegget er

Reccut kan vise snarveier (for eksempel ⌘ S) i opptak. For å se taster mens andre apper er i fokus, må noe lese tastaturet for hele systemet. Det er samme teknikk som keyloggere bruker, og den får antivirusprogrammer til å flagge appen. Derfor er det delt i to:

- **Reccut selv leser aldri tastaturet globalt.** Ingen tastaturkrok, `uiohook`, `CGEventTap` eller lignende i `src/` eller i `dependencies`. `test/keystrokes.test.mjs` sjekker dette.
- **Tillegget er et eget lite program** (`reccut-keystrokes-mac`) bygget fra [keystrokes-mac.c](keystrokes-mac.c). Det ligger ikke i installasjonsfilen. Brukeren laster det ned selv fra GitHub-utgivelsen, etter et samtykkevindu i Record › Overlays › Show keystrokes.

## Slik henger det sammen

| Del | Fil | Oppgave |
| --- | --- | --- |
| Hjelpeprogram | `native/keystrokes/keystrokes-mac.c` | Leser tastetrykk med en lytt-bare event tap (`kCGEventTapOptionListenOnly`), filtrerer og skriver snarveier til stdout |
| Styring i Reccut | `src/main/keystrokes.js` | Nedlasting, SHA-256-sjekk, start og stopp, tolking av linjer |
| Kobling til opptak | `src/main/main.js` (`rec:begin`, `rec:stopping`, `rec:finish`, `keystrokes:*`) | Starter tillegget ved opptaksstart, stopper ved stopp, lagrer snarveiene i `recording.json` under `keys` |
| Brukerflate | `src/renderer/recorder/KeystrokesAddon.jsx` | Samtykkevindu, av/på, fjerning, knapp for Input Monitoring |
| Bygg og utgivelse | `.github/workflows/build.yml`, jobben `keystrokes` | Bygger universell binærfil, signerer ad hoc, legger ved `.sha256` i utgivelsen |

## Protokollen

```
reccut-keystrokes-mac            kjører til stdin lukkes
reccut-keystrokes-mac --check    skriver granted eller denied
reccut-keystrokes-mac --request  ber macOS om Input Monitoring, skriver granted eller denied
```

Mens det kjører, skriver det én linje per hendelse:

```
READY                 lytter
K <navn> <mods>       en snarvei; mods: 1 Ctrl, 2 Option, 4 Shift, 8 Cmd
E permission          Input Monitoring er ikke tillatt
```

## Regler som ikke skal brytes

1. **Filteret ligger i hjelpeprogrammet.** Bare taster sammen med Cmd eller Ctrl, pluss Esc og F-tastene, slipper ut. Option alene skriver tegn (for eksempel | [ ] på norsk tastatur) og skal ikke slippe ut. Shift alene skal ikke slippe ut. Gjentatte tastetrykk (autorepeat) slippes ikke ut. Ikke flytt filteret til Reccut, og ikke gjør det løsere.
2. **Ingen lagring og ikke noe nett i hjelpeprogrammet.** Det skriver bare til stdout. Ingen filer, ingen logger, ingen nettverkskall.
3. **Tillegget lever bare under et opptak.** Det avslutter når stdin lukkes. Ikke la det kjøre i bakgrunnen.
4. **Hold det utenfor installasjonsfilen.** `native/` skal ikke inn i `build.files` i `package.json`.
5. **Hold det lytt-bare.** Event tap skal være `kCGEventTapOptionListenOnly`, aldri en tap som kan endre eller stoppe hendelser.

## Bygge på Mac

Krever Xcode Command Line Tools (`xcode-select --install`).

```sh
cd native/keystrokes
clang -O2 -Wall -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 \
  -o reccut-keystrokes-mac keystrokes-mac.c -framework ApplicationServices
codesign --force -s - reccut-keystrokes-mac
lipo -archs reccut-keystrokes-mac          # skal vise: x86_64 arm64
codesign -dv reccut-keystrokes-mac 2>&1 | grep Signature   # Signature=adhoc
```

Byggingen skal gå uten advarsler. Ikke legg den ferdige binærfilen inn i git.

## Teste hjelpeprogrammet alene

Tillatelsen Input Monitoring gis til appen som startet programmet, ikke til selve programmet. Startes det fra Terminal, er det Terminal (eller iTerm, eller agentens terminal) som må ha tillatelsen.

```sh
./reccut-keystrokes-mac --check      # denied første gang
./reccut-keystrokes-mac --request    # åpner spørsmålet fra macOS
```

Gi tillatelsen i Systeminnstillinger › Personvern og sikkerhet › Input Monitoring, og start terminalen på nytt. Kjør så:

```sh
./reccut-keystrokes-mac
```

Forventet: `READY`. Bytt til en annen app og prøv:

| Du trykker | Forventet linje |
| --- | --- |
| hello | ingenting |
| Shift A | ingenting |
| Option 7 | ingenting |
| ⌘ S | `K S 8` |
| ⇧ ⌘ Z | `K Z 12` |
| ⌃ ⌘ F | `K F 9` |
| Esc | `K Escape 0` |
| F5 | `K F5 0` |
| ⌘ ← | `K ArrowLeft 8` |
| Hold ⌘ J inne | bare én `K J 8` |

Skriv i et passordfelt: ingenting skal komme ut, fordi macOS slår av event taps under Secure Input.

Lukk stdin (Ctrl D i terminalen) og sjekk at programmet avslutter. Fra skript:

```sh
(sleep 5) | ./reccut-keystrokes-mac & sleep 6; pgrep -f reccut-keystrokes-mac || echo avsluttet
```

Vil du sende taster automatisk, kan du bruke `osascript -e 'tell application "System Events" to keystroke "s" using command down'`. Det krever at terminalen også har tillatelsen Tilgjengelighet.

For å teste spørsmålet om tillatelse på nytt: `tccutil reset ListenEvent`.

## Teste inne i Reccut

Utgivelsen på GitHub har bare tillegget når en `v`-tagg er pushet, så for lokal testing legges filen inn for hånd. Reccut startet med `npm start` bruker en egen profil:

```sh
DIR="$HOME/Library/Application Support/Reccut Development/addons/keystrokes"
mkdir -p "$DIR"
cp native/keystrokes/reccut-keystrokes-mac "$DIR/"
VERSION=$(node -p "require('./package.json').version")
SHA=$(shasum -a 256 "$DIR/reccut-keystrokes-mac" | cut -c1-64)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"version":"%s","sha256":"%s","asset":"reccut-keystrokes-mac","installedAt":"%s","consentAt":"%s"}\n' \
  "$VERSION" "$SHA" "$NOW" "$NOW" > "$DIR/addon.json"
npm start
```

Den installerte appen bruker `~/Library/Application Support/Reccut/addons/keystrokes/` i stedet.

Under `npm start` er det Electron.app som ber om Input Monitoring, ikke Reccut. Gi tillatelsen til Electron og start på nytt.

Sjekk i appen:

1. Record › Overlays viser Show keystrokes som en bryter og lenken Remove add-on.
2. Slå på Show keystrokes. Hvis tillatelsen mangler, vises knappen Allow Input Monitoring.
3. Start et opptak. Merket KEYS vises i forhåndsvisningen, og Keys vises i kontrollinjen.
4. Trykk noen snarveier i en annen app, og skriv litt vanlig tekst.
5. Stopp opptaket. `pgrep -f reccut-keystrokes-mac` skal ikke finne noe.
6. Åpne `recording.json` i opptaksmappen. `keys` skal ha snarveiene med tid, for eksempel `[2.31, "⌘ S"]`, og ingen vanlig tekst. Reccut sine egne opptakssnarveier (for eksempel ⌃⌥0) skal ikke være med.
7. Åpne opptaket i Edit. Inspector viser Keystrokes (antall) under Overlays, og tastene vises nederst i bildet.
8. Endre én byte i `reccut-keystrokes-mac`. Overlays skal da melde at tillegget er endret, og Reccut skal ikke starte det.

Kjør `npm test` etter endringer. `test/keystrokes.test.mjs` og `test/input.test.mjs` skal passere.

## Utgivelse

Når en `v`-tagg pushes (for eksempel `v0.9.2`), bygger jobben `keystrokes` i `.github/workflows/build.yml` filen og legger `reccut-keystrokes-mac` og `reccut-keystrokes-mac.sha256` ved utgivelsen. Reccut laster ned fra utgivelsen med samme versjon som appen. Sjekk at begge filene ligger i utgivelsen.

## Vanlige problemer

| Problem | Årsak og løsning |
| --- | --- |
| `E permission` | Appen som startet programmet mangler Input Monitoring. Gi tillatelsen og start appen på nytt. |
| `--check` sier granted, men ingen taster kommer | Ofte Secure Input (et passordfelt eller en app som 1Password er aktiv). Prøv i en annen app. |
| Programmet blir drept med en gang på Apple Silicon | Mangler signatur. Kjør `codesign --force -s -` på nytt. |
| macOS sier at filen ikke kan åpnes | Filen har karanteneflagg. `xattr -d com.apple.quarantine reccut-keystrokes-mac`. Filer som Reccut laster ned selv får ikke dette flagget. |
| Tastene stopper etter en stund | macOS slår av en treg tap. Programmet slår den på igjen ved `kCGEventTapDisabledByTimeout`. Ikke gjør tung jobb i tilbakekallet. |
