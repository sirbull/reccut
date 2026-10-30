# OBSlite

Ta opp, rediger og eksporter opplæringsvideoer i én app, for Mac og Windows. Opptaksdelen er enkel som før. Redigeringsdelen ligner Final Cut Pro, men har bare det du trenger.

## Opptak

* Skjerm i native oppløsning, webkamera eller eksternt kamera, intern eller ekstern mikrofon
* **Systemlyd** med én bryter
* Kamerabildet som sirkel, kvadrat eller 16:9, i tre størrelser
* Seks oppsett som byttes med hurtigtast under opptak: 1 kamera, 2 skjerm, 3 til 6 bilde i bilde i hvert hjørne
* **Tastetrykk vises på skjermen** (kan slås av). Bare snarveier med Cmd, Ctrl eller Alt vises, aldri vanlig skriving. OBSlite sine egne snarveier vises ikke.
* **Forstørret musepeker:** hold inne en tast (standard høyre Cmd på Mac, høyre Ctrl på Windows), så vokser pekeren frem med en animasjon til du slipper
* Fremheving av museklikk (valgfritt)
* Skjerm og kamera lagres hver for seg, sammen med oppsett, peker og tastetrykk. Alt kan dermed endres i etterkant.
* Ferdig MP4 lages automatisk i bakgrunnen etter opptak (kan slås av), og knappen **Rediger** åpner opptaket i redigeringen

## Redigering

* Magnetisk hovedspor som i Final Cut Pro, med tilkoblede spor over (bilder, video, titler) og lydspor under (musikk, lydeffekter)
* Importer video, lyd og bilder (dra inn eller Cmd I). Formater appen ikke kan spille av direkte får automatisk en optimalisert kopi i bakgrunnen.
* Trim, kutt (blade), flytt, kopier og lim inn, slå klipp av og på, angre og gjør om
* Opptak kan justeres i etterkant: kamera av eller på, bytt oppsett ved spillhodet, form og størrelse, tastetrykk, forstørret peker og klikk, og lydnivå for mikrofon og systemlyd hver for seg
* Titler (tittel, nedre tredjedel, overskrift, tittelkort) med animasjon
* Undertekster i eget spor: skriv selv, importer og eksporter SRT, eller lag dem **automatisk med Whisper** (kjører lokalt, modellen lastes ned første gang)
* Overganger: krysstoning, via svart, skyv, tørk og zoom
* Farge: ferdige utseender og justering av lysstyrke, kontrast, metning og temperatur
* Lydstyrke i dB, inn og uttoning med håndtak på klippet
* **Nøkkelbilder** på opasitet, posisjon, skala, rotasjon, farge og volum
* Lydbølger og miniatyrbilder på tidslinjen, markører og inn og utpunkt
* Prosjekter lagres automatisk

## Eksport

Velg en forhåndsinnstilling og trykk Eksporter. Eksporten kjører i bakgrunnen mens du jobber videre, og du får beskjed når filen er klar.

| Video | Lyd |
| --- | --- |
| MP4 (H.264, HEVC, AV1), WebM (VP9, AV1), MOV (H.264, ProRes 422), MKV, GIF | MP3, AAC (M4A), WAV, FLAC, Opus |

Oppløsning, bildefrekvens, kvalitet, område (hele eller inn til ut) og undertekster (brent inn, egen SRT eller begge) kan velges. Anslått filstørrelse vises før du starter.

## Hurtigtaster

### Opptak (globale, virker selv om en annen app er i fokus)

| Handling | Mac (standard) | Windows (standard) |
| --- | --- | --- |
| Oppsett 1 til 6 | Ctrl Option 1 til 6 | Ctrl Shift 1 til 6 |
| Start og stopp opptak | Ctrl Option 0 | Ctrl Shift 0 |
| Forstørr pekeren | Hold høyre Cmd | Hold høyre Ctrl |

### Redigering (som i Final Cut Pro)

| Tast | Handling |
| --- | --- |
| Mellomrom | Spill av eller pause |
| J, K, L | Spill bakover, stopp, spill fremover (trykk flere ganger for raskere) |
| Venstre og høyre pil | Ett bilde (med Shift: ti bilder) |
| Opp og ned pil | Forrige eller neste kutt |
| A, B | Velg, kutt |
| Cmd B, Shift Cmd B | Kutt valgte klipp ved spillhodet, kutt alle |
| Delete, Shift Delete | Slett og lukk, slett og behold mellomrom |
| V | Slå klipp av eller på |
| Cmd T | Legg til krysstoning |
| Ctrl T | Legg til tittel (Alt T på Windows) |
| Option C | Legg til undertekst |
| Option [ og Option ] | Trim start eller slutt til spillhodet |
| E, W, Q | Legg til på slutten, sett inn, koble på over |
| Ctrl + og Ctrl - | Volum opp eller ned 1 dB (Alt på Windows) |
| N | Festing av og på |
| M | Markør |
| I, O, Option X | Inn og utpunkt, fjern område |
| Komma og punktum | Flytt valgt klipp ett bilde |
| Cmd + og Cmd -, Shift Z | Zoom på tidslinjen, tilpass |
| Cmd Z, Shift Cmd Z | Angre, gjør om |
| Cmd I, Cmd E | Importer, eksporter |
| Cmd 1, Cmd 2 | Opptak, redigering |

På Windows brukes Ctrl i stedet for Cmd og Alt i stedet for Option.

## Installere

Installasjonsfiler bygges av GitHub Actions: fanen **Actions**, arbeidsflyten **Bygg installasjonsfiler**, knappen **Run workflow**. Ferdige filer ligger under **Artifacts**: `.dmg` for Mac (Apple Silicon og Intel) og `.exe` for Windows. Med en tag som `v0.2.0` legges de også ved en release.

Appen er ikke kodesignert ennå:

* **Mac:** Hvis macOS sier at appen er skadet, kjør `xattr -cr /Applications/OBSlite.app` i Terminal. Gi tilgang til kamera, mikrofon og skjermopptak. For tastetrykk og forstørret peker trengs også tilgang under Personvern og sikkerhet, Tilgjengelighet. Start appen på nytt etter at tilgang er gitt.
* **Windows:** Velg **Mer informasjon** og **Kjør likevel** hvis SmartScreen advarer.

## Kjøre fra kildekoden

Krever Node.js 20 eller nyere.

```bash
npm install
npm start        # bygger grensesnittet og starter appen
npm test         # tester redigeringslogikken
npm run dist:mac # eller dist:win, lager installasjonsfil
```

## Teknisk

| Del | Innhold |
| --- | --- |
| `src/main` | Electron hovedprosess: vindu, opptak til disk, tastaturlytter, FFmpeg, bakgrunnsoppgaver, prosjekter |
| `src/shared` | Prosjektmodell, redigeringsoperasjoner og tegnemotor, felles for forhåndsvisning og eksport |
| `src/renderer` | Grensesnittet i Preact: opptak, bibliotek, visning, inspektør, tidslinje og eksport |
| `src/worker` | Skjulte vinduer for eksport og automatisk teksting |

Åpen kildekode som brukes: Electron, Preact, Lucide (ikoner), Mediabunny (dekoding og koding med WebCodecs), FFmpeg via ffmpeg-static (miksing, omkoding, analyse), uiohook-napi (globale tastetrykk) og Transformers.js med Whisper (teksting). FFmpeg-binærfilene er GPL-lisensiert.
