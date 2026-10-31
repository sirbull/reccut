# Plan for Reccut 0.2: opptak og redigering i én app

Målet er én enkel app for opplæringsvideoer: ta opp, rediger og eksporter. Opptaksdelen er som før, men med systemlyd, tastetrykk og forstørret musepeker. Redigeringsdelen ligner Final Cut Pro, men i en enkel versjon.

## Viktigste valg

**Opptak med separate kilder.** Skjerm (med systemlyd) og kamera (med mikrofon) tas opp i hver sin fil, i tillegg til en hendelseslogg med oppsett, musebevegelser og tastetrykk. Dermed kan bilde i bilde, tastetrykk og forstørret peker slås av og på i etterkant, på tidslinjen. Oppsettene du byttet mellom under opptaket ligger som nøkkelbilder som kan endres.

**Samme tegnemotor overalt.** Én modul tegner et bilde ut fra prosjektet og et tidspunkt. Den brukes i forhåndsvisningen under opptak, i redigeringsvisningen og i eksporten. Det du ser er det du får.

**Eksport i bakgrunnen.** Et skjult vindu dekoder og koder video med maskinvareakselerasjon (WebCodecs via Mediabunny). FFmpeg står for lydmiksing, formater som ProRes og GIF, og ren lydeksport. Du kan fortsette å redigere mens den jobber.

## Åpen kildekode vi bygger på

| Bibliotek | Brukes til |
| --- | --- |
| Electron | App for Mac og Windows |
| Preact og Signals | Raskt og lett grensesnitt |
| Lucide | Ikoner |
| Mediabunny | Lese, dekode og kode video (WebCodecs) |
| FFmpeg (ffmpeg-static) | Miksing, omkoding, miniatyrbilder og lydbølger |
| uiohook-napi | Globale tastetrykk og hold-for-å-forstørre |
| Transformers.js med Whisper | Automatiske undertekster (valgfritt, lastes ned ved første bruk) |

## Faser

1. **Struktur.** Byggesteg med esbuild, felles tegnemoduler, ny opptaksvisning i Preact.
2. **Opptak.** Separate kilder, systemlyd, tastetrykk, forstørret peker, egne snarveier skjult fra opptaket, knapp til redigering.
3. **Redigering, kjerne.** Prosjektmodell, angre og gjør om, mediebibliotek med import, tidslinje med magnetisk hovedspor, avspilling, inspektør.
4. **Redigering, innhold.** Titler, undertekster med SRT, overganger, fargejustering, lydstyrke, toning og nøkkelbilder.
5. **Eksport.** Forhåndsinnstillinger, mange video og lydformater, bakgrunnsoppgaver med fremdrift, automatisk ferdig video etter opptak.
6. **Polering.** Snarveier som i Final Cut Pro, testing av alle eksportformater, CI og dokumentasjon.

## Snarveier (som i Final Cut Pro)

| Tast | Handling |
| --- | --- |
| Mellomrom | Spill av eller pause |
| J K L | Spill bakover, stopp, spill fremover (flere trykk gir raskere) |
| Venstre og høyre pil | Ett bilde frem eller tilbake |
| Opp og ned pil | Forrige eller neste klipp |
| A og B | Velg eller kutt (blade) |
| Cmd B | Kutt ved spillhodet |
| Slett | Slett og lukk mellomrom |
| Shift Slett | Slett og la mellomrom stå |
| V | Slå klipp av eller på |
| Cmd T | Legg til krysstoning |
| Ctrl T | Legg til tittel |
| Option C | Legg til undertekst |
| Option [ og Option ] | Trim start eller slutt til spillhodet |
| E, W, Q | Legg til på slutten, sett inn, koble på over |
| N | Slå festing (snapping) av eller på |
| M | Legg til markør |
| I og O | Sett inn og utpunkt for eksport |
| Cmd + og Cmd - | Zoom på tidslinjen, Shift Z tilpasser |
| Cmd Z og Shift Cmd Z | Angre og gjør om |
| Cmd I | Importer medier |
| Cmd E | Eksporter |

På Windows brukes Ctrl i stedet for Cmd og Alt i stedet for Option.
