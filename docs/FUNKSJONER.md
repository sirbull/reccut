# Reccut: funksjoner, hurtigtaster og teknisk oversikt

[Tilbake til README](../README.md)

Appen het tidligere OBSlite. Innstillinger, nylige prosjekter og prosjekter med endelsen .obslite flyttes over og åpnes som før.

Ta opp, rediger og eksporter video i én app, for Mac og Windows. Grensesnittet er på engelsk. Appen er delt i tre faner, **Record**, **Edit** og **Export** (Cmd 1, 2 og 3), som kan brukes hver for seg: du kan redigere uten å ha tatt opp, og eksportere eller konvertere filer uten å ha redigert.

## Opptak

* Skjerm i native oppløsning, **et enkelt programvindu**, webkamera eller eksternt kamera, intern eller ekstern mikrofon
* **Start fra hvilket som helst program**: Control Option 0 (Ctrl Shift 0 på Windows) starter og stopper opptaket også når Reccut ligger i bakgrunnen eller står i Edit. Samme taster med 8 setter på pause og fortsetter. Pausene tas ut av videoen, og tastetrykk, klikk, pekerzoom og oppsett følger med.
* **Du ser at du tar opp, uten at det kommer med i videoen**: en liten kontrollinje med tid, mikrofonnivå, Pause og Stop flyter over andre programmer og er skjult for opptaket (macOS og Windows). Ikonet i menylinjen på macOS viser rød prikk og tid, og på Windows blir ikonet i systemstatusfeltet rødt. Reccut kan legge seg bort mens du tar opp og komme tilbake når opptaket er lagret.
* **Sjekk av mikrofonen**: viser om den er stille, svak, god eller overstyrt, og Test tar opp fire sekunder og spiller dem av.
* **Opptaket redder seg selv**: det skrives til disk underveis (WebM, pakkes om til MP4 når du stopper), og krasjer appen eller maskinen, tilbyr Reccut å hente det inn igjen ved neste start, med oppsett, tastetrykk og pekerbevegelser.
* **Ta opp bare et område av skjermen**: velg Area, dra opp området rett på skjermen (fritt eller låst til 16:9, 9:16, 1:1 eller 4:3), eller juster det i forhåndsvisningen. Bare området lagres, og pekerzoom, klikk og tastetrykk følger området. En tynn ramme på skjermen viser området og blir rød under opptak; den ligger rett utenfor området og kommer aldri med i videoen.
* **Nedtelling** på 3, 5 eller 10 sekunder før opptaket starter, i forhåndsvisningen og midt i området på skjermen
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
* **Autolagring med lang historikk**: prosjektet lagres et øyeblikk etter hver endring, trygt mot krasj og strømbrudd, og en siste gang når du avslutter. I tillegg tas det vare på en kopi hvert femte minutt og når appen lukkes, i mappen Auto-Save ved prosjektet. Eldre kopier tynnes ut: alt fra de siste to timene, én per time i to døgn, én per dag i en måned, én per uke i et år og én per måned etter det. **Project History** (Shift Option Cmd H) henter tilbake en tidligere versjon, og det kan angres.
* **Prosjektfil**: prosjektet lagres automatisk som en .reccut-fil i prosjektmappen. **Save As** (Shift Cmd S) lagrer det med nytt navn og sted, og en .reccut-fil kan åpnes med dobbeltklikk i Finder eller Utforsker. Prosjektfilen husker filene både med full sti og i forhold til prosjektfilen, så en flyttet eller kopiert prosjektmappe finner filene sine igjen.
* **Videoskoper**: valgfritt panel med luma- og RGB-waveform, RGB-parade, histogram og vectorscope. Åpnes fra View → Video Scopes eller Cmd/Ctrl+7. Måler det samplede SDR-bildet etter fargekorrigering og effekter. Se [videoskopguiden](VIDEO-SCOPES.md).
* **Lokale KI-modeller og flere leverandører**: Ollama, LM Studio, llama.cpp og egendefinerte servere, i tillegg til flere skytjenester. Hent modellnavn direkte fra serveren. Se [modelloppsett](AI-MODELS.md).
* **Keying og effektstakk**: ettklikks fargekeying, analyse av statisk bakgrunn, ren bakgrunnsreferanse og luma key. Advanced gir spillfjerning, matte- og kantkontroller. Flere instanser kan flyttes, dupliseres, slås av og kombineres med masker. Samme motor brukes i forhåndsvisning og eksport.
* **AI og Plugins**: en redigeringsagent som klipper fortellinger etter manus eller brief, fjerner feiltakes, tekster og oversetter, fargekorrigerer, lager animert grafikk og introer, kan generere KI-video via Higgsfield og kan skrive egne programtillegg som brukeren godkjenner. Programtillegg, også det innebygde Higgsfield-tillegget, åpnes som små verktøyvinduer fra Plugins-knappen og kan deles som .reccut-plugin-filer. Den kan bruke OpenAI, Claude, Gemini, Mistral, OpenRouter og andre leverandører, eller lokale modeller via Ollama, LM Studio og llama.cpp. Lokale prosesseringsverktøy kan installeres via manifest. Native OFX/Adobe og direkte CorridorKey-integrasjon er foreløpig ikke implementert. Se [bruk og begrensninger](KEYING-AND-AI.md).
* **Package Project** (Option Shift Cmd P), som Collect Files og Reduce Project i After Effects: prosjektfilen og ALLE filene den bruker kopieres til én mappe (Footage, Recordings og prosjektfilen), så mappen inneholder alt som trengs for å åpne prosjektet på en annen maskin eller om mange år. Før pakkingen kan du fjerne ubrukte media, klipp som er slått av (blir mellomrom i hovedsporet, så ingenting flytter seg), lyd som er slått av i alle klipp og klipp på skjulte spor, velge om optimalisert media skal med, og kutte vanlige video- og lydfiler til delene som brukes med valgfri ekstra tid på hver side. Opptaksmapper og stillbilder kopieres hele; kutting omkoder med høy kvalitet. Vinduet viser antall filer og størrelse og varsler om filer som mangler. Pakkingen går i bakgrunnen, sjekker ledig plass og at hver kopi er komplett, og skriver en Package Report.txt med alt som ble kopiert og fjernet. Det åpne prosjektet endres ikke.
* Ved import velger du **Copy to project folder** eller **Leave files in place**. Valget huskes og brukes også når du drar filer inn.
* Prosjektet som er åpent, vises øverst i vinduet. Klikk på det for å åpne andre prosjekter, vise dem i Finder eller Utforsker, fjerne dem fra listen eller legge dem i papirkurven.
* **Optimize Media** (Option Cmd O, også som valg ved import) gjør klippene om til et format som er lett å redigere: H.264 med kort GOP for 8-bit, og 10-bit VP9 for 10-bit og HDR. Det skjer i bakgrunnen med fremdrift øverst i vinduet.
* **HDR** (PQ og HLG) gjenkjennes ved import og vises tonemappet til SDR, med 10 bit i arbeidskopien. Eksport i HDR støttes ikke ennå.
* **LOG og LUT**: Camera LUT i Info-fanen gjør Apple Log, S-Log3, V-Log, F-Log og LogC3 om til vanlige farger, eller bruker en .cube-fil. Gjelder alle klipp fra filen, i visningen og eksporten.
* **Bildesekvenser**: nummererte bilder (render_0001.png …) blir ett videoklipp med valgfri bildefrekvens, valgt i importvinduet.
* **RAW-video** dekodes med produsentens program når det er installert, og blir ProRes 4444 ved import: Blackmagic RAW (egen hjelper, `native/braw`, bygges med `node scripts/build-braw.mjs` når SDK-en er installert), R3D og N-RAW (REDline fra REDCINE-X PRO), ARRIRAW (art-cmd) og ProRes RAW på Mac (avconvert). Mangler programmet, får brukeren lenke og Locate. Canon Cinema RAW Light har ingen dekoder andre kan bruke.
* **RAW-bilder** (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2 og flere) importeres med kameraets innebygde JPEG i full størrelse, med riktig orientering. Selve RAW-dataene fremkalles ikke, og RAW-video (BRAW, R3D, ProRes RAW) støttes ikke.
* **Media Offline**: mangler en fil (flyttet, omdøpt eller på en disk som ikke er koblet til), vises et testkort i stil med det gamle NRK-kortet, med filnavnet øverst og MEDIA OFFLINE nederst. Kortet tegnes for prosjektets format, så sirkelen alltid er rund, og det brukes også i eksporten. Appen sjekker på nytt når vinduet får fokus, og **Relink File** (høyreklikk i biblioteket eller Option Cmd L) peker mediet til en ny fil uten at redigeringen går tapt.
* Merker i biblioteket viser HDR, 10-bit, RAW, optimalisert media og synket lyd. Info-fanen viser hvilken fil som brukes til avspilling.

## Ytelse og oppdateringer

* **Lange prosjekter**: endringer lages med delt struktur, så bare det som endres kopieres, og en tidsindeks gjør at avspilling, eksport og lydmiks bare ser på klippene nær spillhodet. Tidslinjen lager bare komponenter for det som synes. Målt med 3100 klipp over to og en halv time: en endring tar 5 ms (før 27 ms), og oppslag for bilde og lyd 0,05 og 0,03 ms (før 1,3 og 1,8 ms), som også gjør eksport av lange prosjekter mye raskere.
* **Virker helt uten nett.** Med nett ser Reccut én gang i døgnet etter nye versjoner under Releases på GitHub, og kan laste ned installasjonsfilen for maskinen til Nedlastinger. Ingenting installeres før du selv åpner filen. Help, Check for Updates sjekker med en gang, og den automatiske sjekken kan slås av under Settings.
* **Ny versjon på GitHub**: øk versjonen i package.json, lag en tagg som `v0.3.0` og push den. Arbeidsflyten i `.github/workflows/build.yml` bygger for Mac (Apple Silicon og Intel) og Windows og legger filene ved en release, og appen finner den automatisk.

## Redigering

* Magnetisk hovedspor som i Final Cut Pro, med tilkoblede spor over (bilder, video, titler) og lydspor under (musikk, lydeffekter)
* Verktøy som i Final Cut Pro: **Select (A)**, **Trim (T)** med roll på kutt, slip i klippet og slide med Option, **Position (P)** som flytter klipp og lager mellomrom, **Range (R)**, **Blade (B)**, **Zoom (Z)** og **Hand (H)**. Musepekeren viser hva som skjer.
* **Skumming**: hold musen over tidslinjen eller et klipp i biblioteket, så viser visningen bildet der pekeren er, og lyden spilles i korte utdrag. **S** slår skumming av og på, **Shift S** slår lyden ved skumming av og på, og **N** slår festing (snapping) av og på, som i Final Cut Pro.
* **Biblioteket som filmstriper, som i Final Cut Pro**: hvert klipp vises som en filmstripe med bilder og lydbølge. Skum over klippet og trykk I og O for å markere et område (eller dra over det), X markerer hele klippet. Legg området til med E, W, Q eller D, eller dra det gule området ned på tidslinjen. Kantene på området kan dras. Row bestemmer hvor mye tid hver rad viser (hele klippet ned til 5 sekunder), så lange klipp brytes over flere rader, og Height gjør bildene større eller mindre.
* **Fart**: 10 %, 25 %, 50 %, 2x, 4x, 8x, 20x eller egen verdi, med valg om å beholde tonehøyden. **Frosset bilde** med Option F.
* **Baklengs** (Reverse Clip): en baklengs kopi lages i bakgrunnen, så avspillingen blir jevn. Eksporten blir baklengs med lyd.
* **Spill bakover**: Shift mellomrom, J eller knappen ved siden av avspillingsknappen spiller tidslinjen bakover. Har klippet en baklengs kopi, brukes den, så bilde og lyd går jevnt.
* **Fartsramper** som i Final Cut Pro: Ramp to 0%, Ramp from 0%, Slow Down in the Middle, Speed Up, Slow Down og Speed Burst, eller egen start- og sluttfart. Kurven vises i inspektøren.
* **Flere spor**: videospor over hovedsporet (V2, V3 og så videre) og lydspor under (A1, A2 og så videre), med sporhoder for skjul, demp og lås, og knapper for å legge til spor. Slipp et klipp på det tomme sporet øverst eller nederst for å lage et nytt.
* **Utvid lyd** (Control S, Alt E på Windows) viser lyden for seg under bildet, så kantene kan dras for J- og L-kutt. **Koble fra lyd** (Control Shift S, Alt Shift E) gir egne lydklipp.
* **Automatisk synk av lyd** (Auto Sync Audio): legg et lydopptak fra en ekstern mikrofon under tidslinjen, høyreklikk og velg Auto Sync Audio (Option Cmd G). Appen sammenligner lyden med lyden i videoklippene og legger opptaket rett under videoen det hører til. Er lydklippet lengre enn videoen, klippes det til; er det kortere, legges det bare på riktig sted. Passer det under flere klipp, kommer det opp et valg: synk med det første klippet, eller del opp og legg en bit under hvert klipp. Lyden kan grupperes med videoen og kameralyden dempes automatisk (valgene huskes, og finnes også i Preferences). Velger du også videoklipp, synkes det bare mot dem.
* **Fargekoder**: marker ett eller flere klipp, høyreklikk og velg farge under Color (rød, oransje, gul, grønn, blå, lilla, rosa, brun eller grå), eller bruk Control Option 1 til 9 (Ctrl Shift Alt 1 til 9 på Windows). Control Option 0 fjerner fargen. Gjelder både video og lyd, også lyddelen av et utvidet klipp.
* **Sporhøyde som i Premiere Pro**: dra i underkanten av sporhodet helt til venstre for å gjøre sporet høyere eller lavere. Shift endrer alle video- eller lydspor, dobbeltklikk tilbakestiller, og Option (Alt) med rulling over sporhodet gjør det samme. Høyden lagres i prosjektet.
* **Klipp som analyseres** får turkise striper i bevegelse og en fremdriftslinje nederst, så du ser at maskinen jobber (stabilisering, optimalisert media og baklengs kopi). Turkis brukes aldri som fargekode.
* **Grupper klipp** (Cmd G): alle slags klipp kan grupperes, også titler, supringer, undertekster og sladding sammen med video og lyd. Flyttes videoen, følger resten av gruppen med, også klipp som starter før videoen. Grupperer du et klipp som allerede er i en gruppe, slås gruppene sammen. Et klikk velger hele gruppen, Option klikk velger ett klipp. Shift Cmd G løser opp gruppen. Grupperte klipp har et lenkemerke.
* **Synk i biblioteket**: marker videoklipp og lydfiler (gjerne alt med Cmd A) og velg Synchronize Audio (Option Cmd G). Lyden flettes inn i videoene som et ekstra lydspor, og kameralyden slås av, men blir liggende. Når klippet dras til tidslinjen, har det begge lydsporene, og du velger selv hvilket du bruker.
* **Lydkomponenter**: et klipp kan ha flere lydspor (kameralyd, ekstern opptaker, mikrofon og systemlyd). Slå dem av og på i Audio-fanen, i høyreklikkmenyen, eller klikk på et spor i utvidet lyd og trykk V. Et spor som er av, blir liggende grått.
* **V** slår et klipp av og på. Klippet blir liggende på tidslinjen, men grått.
* **Lydeffekter og reparasjon**: egen fane i biblioteket (Shift Cmd 6) med maler og enkelteffekter, som høres med en gang ved avspilling og blir like i eksporten (samme kode i begge). Reparasjon: High Pass, Hum Removal (50 og 60 Hz), Noise Reduction (lærer støyen i pausene), Noise Gate, De-esser og Auto Level. 10-bånds equalizer med kurve og ferdige innstillinger, Low Pass og Band Pass. Compressor, Limiter, Gain, panorering og stereobredde. Reverb og Echo. Distortion, Bitcrusher, Lo-fi Tape med svaj, sus og knitter, Chorus, Flanger, Tremolo og Robot. Over 30 maler, blant annet Voice Clean Up (Option Cmd A), Podcast Voice, Telephone, Walkie-Talkie, Old Radio, Megaphone, Vinyl Record, 8-bit, Underwater og Cathedral. Effektene ligger i en kjede i Audio-fanen, kan slås av og på, flyttes og fjernes.
* **Paste Effects og Paste Attributes** som i Final Cut Pro: kopier et klipp (Cmd C), marker andre klipp og trykk Option Cmd V for å lime inn alle effekter, eller Shift Cmd V for å velge selv i en dialog med video- og lydegenskaper (effekter, farge, transform, beskjæring, maske, stabilisering, toning, volum og lydeffekter). Nøkkelbilder følger med, med samme timing eller strukket til det nye klippet. Remove Effects (Option Cmd X) og Remove Attributes (Shift Cmd X) fjerner dem igjen.
* **Kryssfade i lyd**: marker to lydklipp som ligger inntil hverandre og trykk Cmd T. Standardlengden (1 sekund) settes i Preferences (Cmd ,).
* Overwrite (D), Lift from Storyline (Option Cmd Opp), Overwrite to Storyline (Option Cmd Ned), Insert Gap (Option W), Solo (Option S) og Select Clip (C)
* **Spiser nesten alt, som VLC**: MP4, MOV, MKV, WebM, AVI, WMV, FLV, MPEG 1 og 2, MXF, DV, 3GP, OGV, Y4M, MPEG-TS, M2TS og AVCHD (.mts) fra kameraer, og rå H.264- og HEVC-strømmer. Kodeker som ProRes (også 4444 med alfa), DNxHD og DNxHR, H.264 og HEVC i 10-bit og 4:2:2, AV1, VP9, FFV1, MJPEG og Theora. Lyd i WAV, AIFF, FLAC, MP3, AAC, ALAC, Ogg, Opus, WMA, AC3, E-AC3, DTS, AMR, CAF, WavPack, TTA, Speex og flere. Bilder i JPEG, PNG, GIF, WebP, HEIC, JPEG XL, AVIF, TIFF, TGA, EXR, HDR, DPX, JPEG 2000 og QOI. Animert GIF og WebP blir video. Det appen ikke kan spille av direkte konverteres i bakgrunnen: linjeflettet video avflettes, video med alfa beholder gjennomsiktigheten, og skadde filer leses så langt det går (ny runde med feiltoleranse om første forsøk feiler). Klarer ikke FFmpeg å åpne en TS- eller AVCHD-fil, pakker appen den ut selv. Testet med 70 ulike filer.
* Trim, kutt, flytt, kopier og lim inn, slå klipp av og på, angre og gjør om
* **Nøkkelbilder med myke overganger** (Linear, Ease In, Ease Out, Ease In and Out, Hold) på opasitet, posisjon, skala, rotasjon, farge, effekter og volum. Diamantene på klippet kan dras, og høyreklikk gir valg av overgang.
* **Animasjonsmaler**: Fade In, Fade Out, Slow Zoom In og Out, Slide In fra tre kanter, Pop In og Spin In
* Dra klipp, titler og undertekster direkte i visningen for å plassere dem
* **Effekter**: Blur, Vignette, Sepia, Black & White, Invert, Hue Shift, Rounded Corners, Drop Shadow og Border
* **Sladding** av passord, ansikter og skilt: Pixelate (Option P), Blur (Option Shift P), Solid og Frosted. Sladden er et eget klipp over videoen og virker på alt under. Flytt og endre størrelse rett i visningen, eller tegn et nytt område. Form (rektangel, avrundet, ellipse eller fri form med punkter), styrke, myk kant, rotasjon og Redact outside (alt utenom området skjules). Posisjon, størrelse og punktene i en fri form kan ha nøkkelbilder, så sladden kan følge noe som beveger seg og endre form. Likt i visningen og eksporten.
* **Effekter for hele bildet**: Blur, Pixelate og Frosted Glass dekker hele bildet som et justeringslag, og en maske tegnet med pennen bestemmer hvor de virker. Slik får du full manuell kontroll over sladdingen.
* **Pennen** (Option Cmd M), som i Premiere Pro: klikk punkter i visningen, dra litt for myke kurver, og lukk med et klikk på første punkt, dobbeltklikk eller Retur. Rettetasten fjerner siste punkt.
* **Masker** på video, bilder, opptak, titler og effektklipp: rektangel, ellipse og fri form (Option M og Option Shift M). Formen redigeres rett i visningen: dra for å flytte, dra håndtakene for å endre størrelse, og i en fri form dras punktene, dobbeltklikk på kanten gir nytt punkt og Option klikk fjerner et. Flere masker kan legges sammen, trekkes fra eller snittes, og hver kan inverteres, få myk kant (Feather), utvides eller krympes (Expansion) og få gjennomsiktighet. Alt kan animeres med nøkkelbilder, også hele formen i en fri form (punkt for punkt, som rotoskopering). Masken følger klippet når det flyttes, skaleres eller roteres.
* **Stabilisering** (Shift Option S eller Stabilize i Video-fanen), som i Final Cut Pro: kamerabevegelsen analyseres i bakgrunnen (hundrevis av punkter følges fra bilde til bilde, og bevegelse i motivet blir sortert bort), og ristingen glattes ut. Velg Automatic, Smooth eller Tripod, juster X, Y og rotasjon hver for seg, og la zoomen skjule kantene automatisk eller sett den selv. Samme korreksjon brukes i visningen og eksporten. Analysen kan også kjøres ved import.
* **Fargekorrigering**: ferdige utseender, eksponering, kontrast, høylys, skygger, metning, temperatur og tint, og fargehjul for skygger, mellomtoner og høylys. Regnes ut på skjermkortet i 16-bit flyttall, så 10-bit klipp beholder jevne overganger. Samme utregning brukes i visningen og eksporten.
* **Inspektøren som i Final Cut Pro**: marker et klipp, så vises egenskapene til høyre, med ikonfaner for Text, Video (posisjon, skala, rotasjon, beskjæring, animasjon og toning), Color, Effects, Audio, Speed og Info. Info viser klippet, filen (format, størrelse, bitrate, opptakstid, kamera) og bilde og lyd i den. Audio viser nivåer med topp og gjennomsnitt, lydspor, volum, toning og lydformatet.
* **Titler** fra maler (Title, Headline, Title Card, Boxed, Typewriter, End Card, Chapter) med animasjon inn og ut, alle systemskrifter, farge, plassering og størrelse
* **Supringer (lower thirds)** med animasjon: Bar, Line, Box, Split, News Band, Minimal, Tag og Right Corner. Skriv navn og tittel i inspektøren, så animeres supringen inn i starten og ut på slutten av klippet; lengden på tidslinjen bestemmer hvor lenge den står. Farger, skrift og lengden på animasjonene kan justeres, og boksen vokser med teksten.
* **Egne maler fra After Effects**: Get the Template Kit (Help-menyen) gir et skript som lager en supring i After Effects, og et som eksporterer komposisjonen til en `.reccut-title`-fil. Formatet er åpent JSON og beskrevet i pakken, så maler også kan lages for hånd eller med andre verktøy. Importerte maler lagres i prosjektet.
* **Photoshop og Illustrator med lag**: importer en PSD eller PSB (eller SVG fra Illustrator) og velg hvilke lag som skal med, som egne bilder stablet og gruppert på tidslinjen, eller som ett sammenslått bilde. Lagene legges i prosjektets Media-mappe.
* **Overganger**: Cross Dissolve, Fade to Black, Fade to White, Push i tre retninger, Wipe, Circle Reveal, Zoom og Blur
* Alle titler, overganger og effekter har levende forhåndsvisning i biblioteket (hold musen over), tegnet med samme motor som eksporten
* **Undertekster**: én til tre linjer, venstre, midtstilt eller høyre, plassert øverst, i midten, nederst, fritt med X og Y, eller dratt i visningen. Skrift, størrelse, vekt, tekstfarge, konturfarge og konturtykkelse, bakgrunn med farge og gjennomsiktighet, og skygge. Import og eksport av SRT og WebVTT, og automatisk teksting med Whisper.
* Opptak kan justeres i etterkant: kamera av eller på, bytt oppsett ved spillhodet, form og størrelse, tastetrykk, forstørret peker og klikk, og lydnivå for mikrofon og systemlyd hver for seg
* **Prosjektmaler**: Automatic, YouTube 1080p og 4K, Shorts/Reels/TikTok, Square, Instagram Feed, Tutorial (med tittelkort og nedre tredjedel) og Cinematic. Format og bildefrekvens kan endres fritt i prosjektinnstillingene, også til egne verdier. Med Automatic får sekvensen formatet til første klipp, og Sequence Settings (Cmd J) åpnes så du kan beholde det eller velge noe annet.
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

## Styreflate og mus

* To fingre sidelengs flytter langs tidslinjen, to fingre opp og ned ruller mellom sporene, som i Final Cut Pro. Det virker også over sporhodene til venstre.
* Knip zoomer inn og ut, og punktet under pekeren blir stående der det er.
* Med mus: rullehjulet ruller opp og ned, Shift og rullehjulet sidelengs, og Ctrl eller Cmd og rullehjulet zoomer ett steg om gangen.

## Innstillinger

Settings (Cmd ,) er bygd som i Final Cut Pro, med faner øverst:

* **General**: plassering for nye prosjekter, åpne siste prosjekt ved oppstart, se etter media som mangler, og nullstill alt
* **Editing**: standardlengder for overganger, kryssfade, bilder, titler og frosne bilder, festing, og spillhodet til slutten av klipp som legges til
* **Playback**: skumming, visningskvalitet (bedre ytelse tegner visningen i halv oppløsning), avspilling i løkke og tonehøyde ved endret fart
* **Import**: kopier eller la filene ligge, optimalisert media og analyse for stabilisering
* **Audio**: valgene for automatisk synk
* **Export**: prosjektets Exports-mappe eller en annen mappe
* **Keyboard**: endre hurtigtasten for alle kommandoer. Søk, klikk på tasten og trykk den nye. Er tasten i bruk, sier appen av hvilken kommando, og du velger om den skal flyttes. Tilbake til standard for én eller alle, og eksporter eller importer hurtigtastene til en fil. Menyene, søket og hjelpen viser alltid dine egne taster.

## Hjelp, søk og hurtigtaster

**Help → Reccut Help** (F1) åpner en egen engelskspråklig håndbok med 74 artikler, bilder, praktiske eksempler og søk i hele innholdet. Hjelpen kan stå ved siden av redigeringen og virker uten nett. Den dekker også KI-oppsett, lokale modeller, plugins og feilsøking. Kommandoer og egne hurtigtaster hentes fra programmet. Plan og vedlikehold: [HELP-PLAN.md](HELP-PLAN.md). Kjør `npm run test:help` for å kontrollere innhold og hjelpevinduet, og `npm run help:screenshots` for å oppdatere de nye illustrasjonene.

* Alle verktøy og funksjoner har en hurtigtast, og alle står i menyene med tasten ved siden av. Menyene, tastene, søket og listen over hurtigtaster lages fra én liste i koden (`src/renderer/registry.js`), så de alltid stemmer med hverandre.
* **Ctrl mellomrom** åpner hurtigsøket, som FX Console: skriv navnet på en effekt, et verktøy, en overgang, en tittel, en look, en animasjon, en innstilling (for eksempel Exposure eller Volume), en kommando eller et medium, og trykk Enter. Effekter og looks legges på valgte klipp, innstillinger åpnes i inspektøren med tallfeltet klart, og det som ble endret eller åpnet, blinker kort så du ser hvor det er. Virker også mens du skriver i et felt. Cmd K (Ctrl K) og spørsmålstegnet øverst åpner det samme. På Mac har også Hjelp-menyen det vanlige søkefeltet som finner menyvalg.
* **F1** åpner hjelpen med artikler og bilder for alle deler av appen, og et søk som finner både artikler og kommandoer. Knapper i artiklene kjører kommandoen de beskriver.
* **Option Cmd K** viser alle hurtigtaster, gruppert etter meny.


### Opptak

Snarveiene virker som standard bare når Reccut er i fokus, utenfor felt og dialoger. Slå på **Allow shortcuts in other apps** under **Record → Shortcuts** for globale opptakssnarveier. Da kan disse tastekombinasjonene overstyre snarveier i andre programmer. Flytende opptakskontroller og menyikonet kan alltid brukes til pause og stopp.

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
| Shift Option S | Stabiliser klipp |
| Shift Ctrl T | Legg til supring (Shift Alt T på Windows) |
| Shift Option Cmd I, Shift Option Cmd K | Importer titelmal, hent malpakken |
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

`npm start` åpner kildekodeversjonen med en egen profil i **Reccut Development**, så en installert Reccut-versjon ikke overtar oppstarten. Innstillinger og nylige prosjekter er separate; eksisterende prosjektfiler kan åpnes med Open Project. Oppstarten fjerner også `ELECTRON_RUN_AS_NODE` fra miljøet til appen, slik at den åpnes med et grafisk vindu fra terminaler inne i Electron-baserte verktøy.

## Teknisk

| Del | Innhold |
| --- | --- |
| `src/main` | Electron hovedprosess: vindu, opptak til disk, tastaturlytter, FFmpeg, bakgrunnsoppgaver, prosjekter |
| `src/shared` | Prosjektmodell, redigeringsoperasjoner og tegnemotor, felles for forhåndsvisning og eksport |
| `src/renderer` | Grensesnittet i Preact: opptak, redigering (bibliotek, visning, inspektør, tidslinje), eksportfanen, kommandoregisteret og hjelpen |
| `assets/help` | Skjermbilder til hjelpen |
| `assets/template-kit` | Malpakken for After Effects og beskrivelsen av `.reccut-title`-formatet |
| `src/worker` | Skjulte vinduer for eksport og automatisk teksting |

Åpen kildekode som brukes: Electron, Preact, Lucide (ikoner), Mediabunny (dekoding og koding med WebCodecs), FFmpeg 9 (miksing, omkoding, analyse; hentes med `node scripts/fetch-ffmpeg.mjs`, som også kjøres etter `npm install`), uiohook-napi (globale tastetrykk) og Transformers.js med Whisper (teksting). FFmpeg-binærfilene er GPL-lisensiert, bygget uten `--enable-nonfree`, og følger med appen sammen med LICENSE-FFmpeg.txt.
