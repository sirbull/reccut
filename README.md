# Reccut

Appen het tidligere OBSlite. Innstillinger, nylige prosjekter og prosjekter med endelsen .obslite flyttes over og åpnes som før.

Ta opp, rediger og eksporter video i én app, for Mac og Windows. Grensesnittet er på engelsk. Appen er delt i tre faner, **Record**, **Edit** og **Export** (Cmd 1, 2 og 3), som kan brukes hver for seg: du kan redigere uten å ha tatt opp, og eksportere eller konvertere filer uten å ha redigert.

## Opptak

* Skjerm i native oppløsning, webkamera eller eksternt kamera, intern eller ekstern mikrofon
* **Systemlyd** med én bryter
* Kamerabildet som sirkel, kvadrat eller 16:9, i tre størrelser
* Seks oppsett som byttes med hurtigtast under opptak: 1 kamera, 2 skjerm, 3 til 6 bilde i bilde i hvert hjørne
* **Tastetrykk vises på skjermen** (kan slås av). Bare snarveier med Cmd, Ctrl eller Alt vises, aldri vanlig skriving. Reccut sine egne snarveier vises ikke.
* **Forstørret musepeker:** hold inne en tast (standard høyre Cmd på Mac, høyre Ctrl på Windows), så vokser pekeren frem med en animasjon til du slipper
* Fremheving av museklikk (valgfritt)
* Skjerm og kamera lagres hver for seg, sammen med oppsett, peker og tastetrykk. Alt kan dermed endres i etterkant.
* Ferdig MP4 lages automatisk i bakgrunnen etter opptak (kan slås av), og knappen **Edit** åpner opptaket i redigeringen
* Opptakene lagres i mappen Recordings i det åpne prosjektet og legges rett inn i prosjektets bibliotek

## Prosjekter og mapper

* Et nytt prosjekt får navn og plassering, og appen lager en egen mappe med prosjektfilen og undermappene **Media**, **Recordings**, **Optimized Media** og **Exports**. Første gang appen startes, må du lage eller åpne et prosjekt.
* Ved import velger du **Copy to project folder** eller **Leave files in place**. Valget huskes og brukes også når du drar filer inn.
* Prosjektet som er åpent, vises øverst i vinduet. Klikk på det for å åpne andre prosjekter, vise dem i Finder eller Utforsker, fjerne dem fra listen eller legge dem i papirkurven.
* **Optimize Media** (Option Cmd O, også som valg ved import) gjør klippene om til et format som er lett å redigere: H.264 med kort GOP for 8-bit, og 10-bit VP9 for 10-bit og HDR. Det skjer i bakgrunnen med fremdrift øverst i vinduet.
* **HDR** (PQ og HLG) gjenkjennes ved import og vises tonemappet til SDR, med 10 bit i arbeidskopien. Eksport i HDR støttes ikke ennå.
* **RAW-bilder** (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2 og flere) importeres med kameraets innebygde JPEG i full størrelse, med riktig orientering. Selve RAW-dataene fremkalles ikke, og RAW-video (BRAW, R3D, ProRes RAW) støttes ikke.
* **Media Offline**: mangler en fil (flyttet, omdøpt eller på en disk som ikke er koblet til), vises et testkort i stil med det gamle NRK-kortet, med filnavnet øverst og MEDIA OFFLINE nederst. Kortet tegnes for prosjektets format, så sirkelen alltid er rund, og det brukes også i eksporten. Appen sjekker på nytt når vinduet får fokus, og **Relink File** (høyreklikk i biblioteket eller Option Cmd L) peker mediet til en ny fil uten at redigeringen går tapt.
* Merker i biblioteket viser HDR, 10-bit, RAW, optimalisert media og synket lyd. Info-fanen viser hvilken fil som brukes til avspilling.

## Redigering

* Magnetisk hovedspor som i Final Cut Pro, med tilkoblede spor over (bilder, video, titler) og lydspor under (musikk, lydeffekter)
* Verktøy som i Final Cut Pro: **Select (A)**, **Trim (T)** med roll på kutt, slip i klippet og slide med Option, **Position (P)** som flytter klipp og lager mellomrom, **Range (R)**, **Blade (B)**, **Zoom (Z)** og **Hand (H)**. Musepekeren viser hva som skjer.
* **Skumming**: hold musen over tidslinjen eller et klipp i biblioteket, så viser visningen bildet der pekeren er, og lyden spilles i korte utdrag. **S** slår skumming av og på, **Shift S** slår lyden ved skumming av og på, og **N** slår festing (snapping) av og på, som i Final Cut Pro.
* **Biblioteket som filmstriper**: hvert klipp vises som en liten tidslinje med bilder og lydbølge, under hverandre. Dra over et klipp for å velge et område, og legg det til med E, W, Q eller D (eller dra navnet til tidslinjen).
* **Fart**: 10 %, 25 %, 50 %, 2x, 4x, 8x, 20x eller egen verdi, med valg om å beholde tonehøyden. **Frosset bilde** med Option F.
* **Baklengs** (Reverse Clip): en baklengs kopi lages i bakgrunnen, så avspillingen blir jevn. Eksporten blir baklengs med lyd.
* **Spill bakover**: Shift mellomrom, J eller knappen ved siden av avspillingsknappen spiller tidslinjen bakover. Har klippet en baklengs kopi, brukes den, så bilde og lyd går jevnt.
* **Fartsramper** som i Final Cut Pro: Ramp to 0%, Ramp from 0%, Slow Down in the Middle, Speed Up, Slow Down og Speed Burst, eller egen start- og sluttfart. Kurven vises i inspektøren.
* **Flere spor**: videospor over hovedsporet (V2, V3 og så videre) og lydspor under (A1, A2 og så videre), med sporhoder for skjul, demp og lås, og knapper for å legge til spor. Slipp et klipp på det tomme sporet øverst eller nederst for å lage et nytt.
* **Utvid lyd** (Control S, Alt E på Windows) viser lyden for seg under bildet, så kantene kan dras for J- og L-kutt. **Koble fra lyd** (Control Shift S, Alt Shift E) gir egne lydklipp.
* **Automatisk synk av lyd** (Auto Sync Audio): legg et lydopptak fra en ekstern mikrofon under tidslinjen, høyreklikk og velg Auto Sync Audio (Option Cmd G). Appen sammenligner lyden med lyden i videoklippene og legger opptaket rett under videoen det hører til. Er lydklippet lengre enn videoen, klippes det til; er det kortere, legges det bare på riktig sted. Passer det under flere klipp, kommer det opp et valg: synk med det første klippet, eller del opp og legg en bit under hvert klipp. Lyden kan grupperes med videoen og kameralyden dempes automatisk (valgene huskes, og finnes også i Preferences). Velger du også videoklipp, synkes det bare mot dem.
* **Grupper klipp** (Cmd G): marker video og lyd og grupper dem, så følger lyden videoen når den flyttes, også om lyden starter før videoen. Et klikk velger hele gruppen, Option klikk velger ett klipp. Shift Cmd G løser opp gruppen. Grupperte klipp har et lenkemerke.
* **Synk i biblioteket**: marker videoklipp og lydfiler (gjerne alt med Cmd A) og velg Synchronize Audio (Option Cmd G). Lyden flettes inn i videoene som et ekstra lydspor, og kameralyden slås av, men blir liggende. Når klippet dras til tidslinjen, har det begge lydsporene, og du velger selv hvilket du bruker.
* **Lydkomponenter**: et klipp kan ha flere lydspor (kameralyd, ekstern opptaker, mikrofon og systemlyd). Slå dem av og på i Audio-fanen, i høyreklikkmenyen, eller klikk på et spor i utvidet lyd og trykk V. Et spor som er av, blir liggende grått.
* **V** slår et klipp av og på. Klippet blir liggende på tidslinjen, men grått.
* **Kryssfade i lyd**: marker to lydklipp som ligger inntil hverandre og trykk Cmd T. Standardlengden (1 sekund) settes i Preferences (Cmd ,).
* Overwrite (D), Lift from Storyline (Option Cmd Opp), Overwrite to Storyline (Option Cmd Ned), Insert Gap (Option W), Solo (Option S) og Select Clip (C)
* Importer nesten alle formater: MP4, MOV, MKV, WebM, AVI, WMV, FLV, MPEG, MXF, ProRes, DNxHR, 10-bit H.264, animert GIF, TIFF, TGA, HEIC, WAV, AIFF, MP3, AAC, FLAC, OGG, WMA, AC3 og flere. Det appen ikke kan spille av direkte konverteres i bakgrunnen. Filer som ikke kan leses avvises med en tydelig melding.
* Trim, kutt, flytt, kopier og lim inn, slå klipp av og på, angre og gjør om
* **Nøkkelbilder med myke overganger** (Linear, Ease In, Ease Out, Ease In and Out, Hold) på opasitet, posisjon, skala, rotasjon, farge, effekter og volum. Diamantene på klippet kan dras, og høyreklikk gir valg av overgang.
* **Animasjonsmaler**: Fade In, Fade Out, Slow Zoom In og Out, Slide In fra tre kanter, Pop In og Spin In
* Dra klipp, titler og undertekster direkte i visningen for å plassere dem
* **Effekter**: Blur, Vignette, Sepia, Black & White, Invert, Hue Shift, Rounded Corners, Drop Shadow og Border
* **Fargekorrigering**: ferdige utseender, eksponering, kontrast, høylys, skygger, metning, temperatur og tint, og fargehjul for skygger, mellomtoner og høylys. Regnes ut på skjermkortet i 16-bit flyttall, så 10-bit klipp beholder jevne overganger. Samme utregning brukes i visningen og eksporten.
* **Titler** fra åtte maler (Title, Lower Third, Headline, Title Card, Boxed, Typewriter, Callout, End Card) med animasjon inn og ut og alle systemskrifter
* **Overganger**: Cross Dissolve, Fade to Black, Fade to White, Push i tre retninger, Wipe, Circle Reveal, Zoom og Blur
* Alle titler, overganger og effekter har levende forhåndsvisning i biblioteket (hold musen over), tegnet med samme motor som eksporten
* **Undertekster**: én til tre linjer, venstre, midtstilt eller høyre, plassert øverst, i midten, nederst, fritt med X og Y, eller dratt i visningen. Skrift, størrelse, vekt, tekstfarge, konturfarge og konturtykkelse, bakgrunn med farge og gjennomsiktighet, og skygge. Import og eksport av SRT og WebVTT, og automatisk teksting med Whisper.
* Opptak kan justeres i etterkant: kamera av eller på, bytt oppsett ved spillhodet, form og størrelse, tastetrykk, forstørret peker og klikk, og lydnivå for mikrofon og systemlyd hver for seg
* **Prosjektmaler**: Automatic, YouTube 1080p og 4K, Shorts/Reels/TikTok, Square, Instagram Feed, Tutorial (med tittelkort og nedre tredjedel) og Cinematic. Format og bildefrekvens kan endres fritt i prosjektinnstillingene, også til egne verdier.
* Lydbølger, miniatyrbilder, markører, inn og utpunkt, og automatisk lagring (også når appen lukkes rett etter en endring)

## Eksport

Eksportfanen tar enten prosjektet eller filer du importerer direkte, for å konvertere dem uten å gå via redigering. Flere filer kan konverteres med samme innstillinger på én gang.

* Forhåndsinnstillinger (Standard, YouTube og web, Minst fil, Apple-enheter, Master, GIF, Bare lyd), og alle verdier kan overstyres
* Størrelse: original, 4K, 1440p, 1080p, 720p, 480p eller egen bredde og høyde, med lås for sideforhold
* Tilpasning når formatet endres: tilpass (svarte kanter), fyll (beskjær) eller strekk
* Beskjæring: 16:9, 9:16, 1:1, 4:5 eller fritt, med en ramme du drar i forhåndsvisningen eller eksakte verdier i piksler
* Bildefrekvens: som kilden, vanlige verdier eller egen
* Kvalitet: lav til maks, eller egen videobitrate i Mbit/s, og valgfri lydbitrate
* Område: hele eller egendefinert fra og til, med knapp for å bruke spillhodet
* Undertekster brent inn i bildet, som eget spor i filen (kan slås av og på i avspilleren), som egen SRT eller WebVTT fil, eller kombinasjoner
* Eksportkø med fremdrift. Eksisterende filer overskrives aldri.

| Video | Lyd |
| --- | --- |
| MP4 (H.264, HEVC, AV1), WebM (VP9, AV1), MOV (H.264, ProRes 422), MKV, GIF | MP3, AAC (M4A), WAV, FLAC, Opus |

## Hjelp, søk og hurtigtaster

* Alle verktøy og funksjoner har en hurtigtast, og alle står i menyene med tasten ved siden av. Menyene, tastene, søket og listen over hurtigtaster lages fra én liste i koden (`src/renderer/registry.js`), så de alltid stemmer med hverandre.
* **Ctrl mellomrom** åpner hurtigsøket, som FX Console: skriv navnet på en effekt, et verktøy, en overgang, en tittel, en look, en animasjon, en innstilling (for eksempel Exposure eller Volume), en kommando eller et medium, og trykk Enter. Effekter og looks legges på valgte klipp, innstillinger åpnes i inspektøren med tallfeltet klart, og det som ble endret eller åpnet, blinker kort så du ser hvor det er. Virker også mens du skriver i et felt. Cmd K (Ctrl K) og spørsmålstegnet øverst åpner det samme. På Mac har også Hjelp-menyen det vanlige søkefeltet som finner menyvalg.
* **F1** åpner hjelpen med artikler og bilder for alle deler av appen, og et søk som finner både artikler og kommandoer. Knapper i artiklene kjører kommandoen de beskriver.
* **Option Cmd K** viser alle hurtigtaster, gruppert etter meny.


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
| Shift mellomrom | Spill bakover |
| J, K, L | Spill bakover, stopp, spill fremover (trykk flere ganger for raskere) |
| Venstre og høyre pil | Ett bilde (med Shift: ti bilder) |
| Opp og ned pil | Forrige eller neste kutt |
| A, T, P, R, B, Z, H | Select, Trim, Position, Range, Blade, Zoom, Hand |
| S, Shift S, N | Skumming, lyd ved skumming, festing (snapping) |
| D, C | Skriv over ved spillhodet, velg klippet under spillhodet |
| Cmd R, Option Cmd R | Fart, normal fart |
| Option F, Option W, Option S | Frosset bilde, sett inn mellomrom, solo |
| Control S, Control Shift S | Utvid lyd, koble fra lyd (Alt E og Alt Shift E på Windows) |
| Option Cmd Opp og Ned | Løft ut av hovedsporet, skriv over til hovedsporet |
| Cmd G, Shift Cmd G | Grupper klipp, løs opp gruppe |
| Option Cmd G | Synk lyd (i biblioteket og på tidslinjen) |
| Option Cmd O | Optimaliser media |
| Option R | Spill klippet baklengs |
| Shift Option 1 til 6, Shift Option 0 | Fartsrampe, fjern rampe |
| Shift Option minus og pluss | Sakte 50 %, raskt 2x |
| Ctrl M | Slett markør |
| Cmd 4, Option Cmd 4, Cmd 6, Option Cmd 5, Cmd 8 | Video, lyd, farge, effekter og info i inspektøren |
| Shift Cmd 1, Option Cmd 1, Cmd 5, Shift Cmd 5, Shift Cmd 7 | Media, titler, effekter, overganger og undertekster i biblioteket |
| Shift Cmd F | Spill av i fullskjerm |
| Shift Cmd A | Fjern alt utvalg |
| Shift Cmd R | Vis prosjektmappen |
| Ctrl mellomrom, F1, Option Cmd K | Hurtigsøk, hjelp, alle hurtigtaster |
| Option Cmd L | Relink File (finn en fil som mangler) |
| Cmd , | Preferences |
| Cmd B, Shift Cmd B | Kutt valgte klipp ved spillhodet, kutt alle |
| Delete, Shift Delete | Slett og lukk, slett og behold mellomrom |
| V | Slå klipp av eller på |
| Cmd T | Legg til krysstoning |
| Ctrl T | Legg til tittel (Alt T på Windows) |
| Option C | Legg til undertekst |
| Option [ og Option ] | Trim start eller slutt til spillhodet |
| E, W, Q | Legg til på slutten, sett inn, koble på over |
| Ctrl + og Ctrl - | Volum opp eller ned 1 dB (Alt på Windows) |
| M | Markør |
| I, O, Option X | Inn og utpunkt, fjern område |
| Komma og punktum | Flytt valgt klipp ett bilde |
| Cmd + og Cmd -, Shift Z | Zoom på tidslinjen, tilpass |
| Cmd Z, Shift Cmd Z | Angre, gjør om |
| Cmd I, Cmd E | Importer, eksporter |
| Cmd 1, Cmd 2, Cmd 3 | Opptak, Rediger, Eksport |

På Windows brukes Ctrl i stedet for Cmd og Alt i stedet for Option.

## Installere

Installasjonsfiler bygges av GitHub Actions: fanen **Actions**, arbeidsflyten **Bygg installasjonsfiler**, knappen **Run workflow**. Ferdige filer ligger under **Artifacts**: `.dmg` for Mac (Apple Silicon og Intel) og `.exe` for Windows. Med en tag som `v0.2.0` legges de også ved en release.

Appen er ikke kodesignert ennå:

* **Mac:** Hvis macOS sier at appen er skadet, kjør `xattr -cr /Applications/Reccut.app` i Terminal. Gi tilgang til kamera, mikrofon og skjermopptak. For tastetrykk og forstørret peker trengs også tilgang under Personvern og sikkerhet, Tilgjengelighet. Start appen på nytt etter at tilgang er gitt.
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
| `src/renderer` | Grensesnittet i Preact: opptak, redigering (bibliotek, visning, inspektør, tidslinje), eksportfanen, kommandoregisteret og hjelpen |
| `assets/help` | Skjermbilder til hjelpen |
| `src/worker` | Skjulte vinduer for eksport og automatisk teksting |

Åpen kildekode som brukes: Electron, Preact, Lucide (ikoner), Mediabunny (dekoding og koding med WebCodecs), FFmpeg via ffmpeg-static (miksing, omkoding, analyse), uiohook-napi (globale tastetrykk) og Transformers.js med Whisper (teksting). FFmpeg-binærfilene er GPL-lisensiert.
