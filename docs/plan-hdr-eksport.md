# Plan: Eksport i HDR (PQ og HLG)

Status: Første avgrensede PQ-eksport er implementert som «HDR PQ (Early Access)» 24. november 2026. Full HDR-redigering og HDR10-mastering er ikke ferdig. Opprinnelig plan skrevet 13. november 2026.

## Første implementasjon

Produktets eksportarbeider bruker nå originalvideo → FFmpeg float32 → lineær BT.2020 i WebGL2/RGBA16F → FFmpeg HEVC Main10/PQ. Referansehvitt er 203 nit. HLG-inngang korrigeres med luminansavhengig OOTF (1000 nit/gamma 1,2) før interpolering. SDR er fortsatt standard, og forhåndsvisningen er fortsatt SDR. Valget ligger i eksportrommet og Easy Export, i Quick Search og hos agenten som `export:hdr`.

Dette er en avgrenset del av I1–I5: kutt/trimming, fart, vanlig videogeometri, opasitet, fades og lineær eksponering, med SDR-rasteriserte bilder/titler/undertekster og eksisterende lydmiks. Forhåndskontroll avviser øvrige videoeffekter/fargekorrigering, overganger, tracking, slideshows, andre blend modes, kamera-LUT/LOG, opptaksklipp og videoalfa. SDR-kopier kan ikke brukes som HDR-originaler. Ingen mastering display-/CLL-verdier konstrueres; bare faktiske PQ-/BT.2020-tagger settes. HDR10-mastering, HLG-utgang, full effektstøtte, ytelsesgodkjenning og fysisk HDR-avspilling gjenstår.

`scripts/test-hdr-export.cjs` kjører den faktiske bygde eksportarbeideren i Electron med isolert profil og uavhengige syntetiske PQ-/HLG-felt. Den kontrollerer lysverdier, primærfarger, lineær eksponering/alfablanding, SDR-referansehvitt, bilderekkefølge etter trimming og reversering, 10-bit-/PQ-metadata og avvisning av ustøttede redigeringer. `--samples` tester MP4-kontrollklipp uten å endre originalene; `--baseline-ref` sammenligner dekodede SDR-bilder med eksportarbeideren fra en angitt Git-revisjon. `test/hdr.test.mjs` kontrollerer referansematematikk, innstillinger og forhåndskontroll.

### Kontrollert 25. november 2026

[Resultater fra produktets eksportarbeider](hdr-export-validation.json), Windows/Electron 45.1.0, AMD Radeon PRO/D3D11:

- PQ-felt og primærfarger har høyst 1,766 % relativ feil eller feil målt mot referansehvitt; HLG → PQ har høyst 1,263 %. Dette inkluderer den faktiske tapskodingen med HEVC, ikke bare en matematisk rundtur.
- Et 1000-nit-felt blir 501,64 nit ved −1 stopp, og blandingen 50 % av 1000 og 250 nit blir 626,21 nit (forventet 625). En hvit SDR-bildeflate ved 50 % opasitet blir 101,05 nit (forventet 101,5).
- Trimming og baklengs avspilling har riktig kildebilde i samtlige kontrollerte bilder. Testen fant og rettet en feil ved rekonstruksjon av tidsstempler etter FFmpeg-søk; HDR bruker nå opprinnelige, heltallsbaserte tidsstempler.
- Begge MP4-filene fra brukerens testmappe ble eksportert som både SDR og PQ, med lydmiks/muksing. SDR-bildene er identiske med eksportarbeideren i `c50a05d` målt med dekodet `framemd5`. Originalenes størrelse og endringstid er uendret. Disse klippene er SDR-kontroller, ikke dokumentasjon på ekte HDR-innhold.
- `scripts/test-hdr-ui.cjs` kontrollerte den virkelige appen med isolert profil: Quick Search kjører HDR-kommandoen, forhåndsinnstillingen velger PQ/HEVC, Standard gjenoppretter SDR, og HDR-veiledningen vises både i håndbokvinduet og på den genererte Docs-siden. Ingen modellnedlasting.
- Bygg og relevante tester for HDR, eksportrom, formater, bildeeksport, prosjektmodell, lyd, Quick Search, agent og generert dokumentasjon består.

Gjenta etter `npm run build` og `npm run docs`:

```powershell
node scripts/test-hdr-export.cjs --ffprobe C:/path/to/ffprobe.exe --samples C:/path/to/samples --baseline-ref c50a05d
node scripts/test-hdr-ui.cjs
```

Alle videoutfiler og testprofiler skrives til en ny midlertidig mappe. Kjøring uten `--samples` trenger bare syntetisk materiale. Dette er korte korrekthetstester ved 320×180 ut, også når kontrollkilden er 4K. De godkjenner ikke lange 4K-jobber, total RAM/VRAM, HDR-skjerm, andre operativsystemer eller en leveranseplattform.

## Resultat og valg etter Windows-utprøvingen

**Velg vei C som kandidat på Windows: sammensetting i lineært lys i WebGL2/RGBA16F, med flyttallsdekoding og HDR-koding gjennom FFmpeg.** Et bytte til float16-Canvas alene er ikke tilstrekkelig. Arkitekturen må kontrolleres på Mac og Linux før valget regnes som verifisert der.

Målingene finnes i [hdr-spike-results.json](hdr-spike-results.json), siste validerte kjøring. [Kjøreskript og metode](../scripts/hdr-spike/README.md) beskriver hvordan de kan gjentas. Testen kjører isolert, bruker bare syntetisk materiale og endrer ingen produktkode eller brukerprosjekter. Binærfiler og videomateriale ligger bare i en midlertidig mappe; rapporten inneholder ikke brukerens lokale filstier.

Maskin: Windows x64, AMD Ryzen 5 PRO 6650U, 12 tilgjengelige logiske CPU-er, 11,8 GB RAM, AMD Radeon PRO Graphics gjennom ANGLE/D3D11. Faktisk runtime er **Electron 45.1.0 / Chromium 156.0.8078.49**, ikke Chromium 140 som den opprinnelige planen antok. FFmpeg og den kontrollerte ffprobe kommer fra det låste 9.0.2-bygget; rapporten har versjoner og SHA-256.

| Test | Målt resultat | Følge for implementasjonen |
|---|---|---|
| T1: float16-Canvas | Vanlig lagring, tegning, transformasjoner, masker, tekst, skygger og uskarphet beholder høye verdier. `lighter`, `brightness`, `contrast` og `saturate` klipper til 1. Ved 50/50-blanding av lineære verdier 0,25 og 4 blir resultatet 1,467, mot riktig 2,125: omtrent 31 % feil. | float16 er nyttig lagring, men dagens Canvas-operasjoner gir ikke en full HDR-kompositor eller korrekt lineær lysblanding. |
| T2: Mediabunny → VideoFrame → Canvas | HEVC Main10 dekodes med PQ/HLG og BT.2020 i metadata. GPU-bildets `format` er `null` (ugjennomsiktig GPU-format). Canvas gir SDR-lignende verdier rundt 0–1. Forespurt `toneMapping: extended` gir faktisk `standard`. | Bruk ikke denne veien som sannhet for HDR-lysverdier i eksporten på denne konfigurasjonen. |
| T3: FFmpeg → lineært flyttall → RGBA16F | PQ har høyst 0,465 % feil i testfeltene; floatteksturen bevarer verdiene. Rå HLG-konvertering gir riktige gråfelt, men opptil 77,4 % feil for en mettet primærfarge. Eksplisitt luminansavhengig HLG-korreksjon reduserer største feil til 0,819 %. | PQ-veien fungerer. HLG trenger en eksplisitt, testet OOTF-korreksjon ved lesing og tilsvarende behandling ved skriving. |
| T4: fargekorrigering | Dagens uendrede GLSL klipper alle verdier over 1, også når målet er RGBA16F. Eksponering bruker eksisterende gamma-2,2-domene. Den separate lineære kontrollshaderen bevarer verdier over 1 og dobler/halverer korrekt. | Fase I4 er nødvendig; det holder ikke å skifte bufferformat. SDR-korrigeringen må fortsatt bevares. |
| T5: kodeker og metadata | Ti kombinasjoner består: PQ/HLG med HEVC, AV1, VP9 profil 2 og ProRes HQ/4444. Alle gir minst 10 bit og riktige BT.2020-/transfer-tagger. HEVC PQ har mastering display og CLL. Feilen er høyst 0,465 % for PQ og 0,819 % for HLG etter korreksjon. Kodede signalverdier er også sjekket mot den uavhengige referansen. | FFmpeg-bygget har de nødvendige kodekene på Windows. WebCodecs godtar ikke de prøvde HEVC Main10-/AV1-konfigurasjonene; VP9-konfigurasjonen godtas, men HDR-feltet fjernes. Behold FFmpeg som planlagt. |
| T6: hele prototypeløkken | Fem like syntetiske lag, 12 bilder per tilfelle, inkludert lesing, tegning, tilbakelesing, pakking og koding. WebGL: 5,68 bilder/s ved 1080p mot SDR 13,96 (2,46× tidsbruk). Ved 2160p: 0,94 mot 3,42 (3,64×). HDR-feltene er bevart i de ferdige filene. | Målet på høyst 3× er ikke oppfylt ved 4K i denne prototypen. Tilbakelesing, pakking og koding må forbedres før ytelsen kan godkjennes. |
| T7: skjerm og forhåndsvisning | Miljøet melder ikke høy dynamikk eller P3. `rec2100-pq` og `rec2100-hlg` avvises som Canvas-fargerom. Ingen fysisk HDR-visning er kontrollert. | Behold tonemappet SDR-forhåndsvisning som første mål. Faktisk HDR-visning må prøves på en HDR-skjerm. |

T3-konverteringen, uten sammensetting og koding, ga omtrent 65–66 bilder/s ved 1080p og 26,6–26,9 ved 2160p i den korte prøven. Full eksport er derfor vesentlig mer enn bare dekoding. T6 bruker x264 CRF18 ultrafast for SDR og x265 lossless ultrafast for HDR, og lagene viser samme statiske testbilde uten effekter. Tallene inkluderer prosessoppstart og er **prototypemålinger, ikke en prognose for ferdig Reccut eller en sammenligning ved lik kodek/kvalitet**.

Samlet målt arbeidssett for Electrons prosesser økte omtrent 1,74 GiB over utgangspunktet. Det er prøver tatt hver 50 ms, uten full måling av eksterne FFmpeg-prosesser og driverens VRAM. Kravet om under 4 GB ekstra minne er derfor **ikke ferdig verifisert**.

HLG-testen bruker en 1000-nits skjerm, systemgamma 1,2 og svartnivå 0. HLG er relativt: testfeltene stopper ved 1000 nits, mens PQ-testen går til 10000 nits. Den opprinnelige formuleringen «samme innhold i HLG» ville ellers gitt en uklar eller ugyldig nitsreferanse. HLG er sjekket mot luminansavhengig OOTF i [ITU-R BT.2100](https://www.itu.int/rec/R-REC-BT.2100/en). [zimgs kilde](https://raw.githubusercontent.com/sekrit-twc/zimg/master/src/zimg/colorspace/gamma.cpp) beskriver sin kanalvise tilnærming. En ren rundtur gjennom samme encoder/decoder ville skjult dette avviket; utprøvingen sjekker derfor også signalverdiene mot egne referansefelt.

**Ikke godkjent eller utført:** Mac/Linux-matrisen, full minnemåling, ytelse i den ferdige HDR-kompositoren, avspilling som HDR i QuickTime/Windows-spiller/VLC, fysisk HDR-skjerm og brukerens private YouTube-opplasting. Kodektesten er teknisk bestått på Windows; den er ikke en offentlig HDR-kompatibilitetsgodkjenning.

Opprinnelig anbefaling etter utprøvingen var I1, deretter lineær WebGL, HLG-korreksjon og SDR-regresjonstester før et fullt HDR-valg. Den avgrensede implementasjonen over er nå tilgjengelig som eksplisitt Early Access med forhåndskontroll; dette betyr ikke at I1–I5 eller ytelseskravene under er fullt godkjent.

Målet er at Reccut kan eksportere HDR-video (HDR10/PQ og HLG) med riktig metadata, uten at HDR-klippene først tonemappes til SDR. SDR-eksport skal fungere som før, og være standard.

Planen har to deler:

1. **Utprøving (del 1):** avgrensede tester som avgjør hvilken teknisk vei som virker i Electron 45 (faktisk Chromium-versjon logges) og i FFmpeg-bygget vårt. Ingen endringer i produktkoden.
2. **Implementasjon (del 2):** fasene vi gjennomfører når del 1 har valgt vei.

---

## Slik virker det i dag

Bildekjeden er SDR fra dekodingen til fila:

| Ledd | Hvor | I dag |
|---|---|---|
| Innlesing | [src/main/ffmpeg.js](../src/main/ffmpeg.js) (rundt linje 105–130) | HDR (PQ/HLG) tonemappes til Rec. 709 med `zscale` og `tonemap=hable`, både i arbeidskopien og som `decodeFilters` når originalen leses ved eksport. |
| Lesing ved eksport | [src/worker/export.js](../src/worker/export.js): `Reader`, `FfmpegReader`, `neededFrames` | `FfmpegReader` leverer 8-bit `RGBA` som `VideoFrame`. `Reader` (mediabunny) leverer `VideoSample`. |
| Sammensetting | [src/shared/render.js](../src/shared/render.js): `drawFrame` | Et vanlig 2D-canvas (8-bit sRGB). Hjelpecanvas (temperatur, masker, uskarphet, PiP) er også 8-bit, og `temperatureSource` bruker `getImageData` og `putImageData` med `Uint8ClampedArray`. CSS-filtre (`brightness`, `contrast`, `blur`) brukes direkte på canvas. |
| Fargekorrigering | [src/shared/grade.js](../src/shared/grade.js): `gradeImage` | WebGL2 med RGBA16F-tekstur, men standard 8-bit tegnebuffer, så resultatet blir 8 bit igjen. Shaderne, looks og LUT-er antar signal i 0–1 (SDR). |
| Koding | [src/worker/export.js](../src/worker/export.js): `renderVideo`, `videoArgsCrf` | FFmpeg får `-pix_fmt rgba` og koder `yuv420p` (ProRes `yuv422p10le`) uten fargemetadata. WebCodecs-veien bruker `CanvasSource` (8-bit). |
| Formater | [src/shared/formats.js](../src/shared/formats.js) | Ingen HDR-valg. |

Tekst om at HDR ikke støttes finnes i [src/renderer/help/articles.js](../src/renderer/help/articles.js) (`hdr`), [src/renderer/help/catalog.js](../src/renderer/help/catalog.js), [docs/FEATURES.md](FEATURES.md), [README.md](../README.md) og [docs/index.html](index.html).

---

## Del 1: Utprøving

Utprøvingen bygges som et eget skript, `scripts/hdr-spike.cjs`, som starter Electron med et skjult vindu, på samme måte som `scripts/test-voxcpm-picker.cjs`. Det leser og skriver bare i en midlertidig mappe og endrer ikke `src/`. Resultatene lagres i `docs/hdr-spike-results.json` med plattform, GPU, Electron- og FFmpeg-versjon, slik at vi kan sammenligne Mac, Windows og Linux.

### Testmateriale

Lages med FFmpeg i skriptet, så ingen filer må sjekkes inn:

- `pq-ramp.mov`: HEVC Main10, BT.2020, PQ, 3840×2160 og 1920×1080. Gråtrapp fra 0 til 1000 nits og felt med kjente nivåer: 100, 203, 400, 1000 og 4000 nits, pluss mettet rød, grønn og blå i BT.2020 utenfor Rec. 709.
- `hlg-ramp.mov`: samme innhold i HLG.
- `sdr-ref.mp4`: samme mønster i Rec. 709 SDR, for SDR-klipp i en HDR-tidslinje.
- En PNG med tekst og hvit grafikk, for referansehvitt.

Feltenes verdier er kjente, så hver test kan måle avvik i tall i stedet for å se på bildet.

### T1. Holder float16-canvas verdier over 1,0?

Det viktigste spørsmålet. Svaret avgjør om `drawFrame` kan brukes nesten som før.

- Lag `canvas.getContext('2d', { colorType: 'float16', colorSpace: 'srgb' })` (og `'display-p3'`). Sjekk at `getContextAttributes()` faktisk sier `float16`.
- Tegn et kildebilde med verdier over 1,0 (fra T3) og les tilbake med `getImageData(0, 0, w, h, { pixelFormat: 'rgba-float16' })`, hvis det finnes. Ellers via `createImageBitmap` til en WebGL2-tekstur og `readPixels(..., HALF_FLOAT)`.
- Gjenta med operasjonene `drawFrame` bruker: `setTransform`, skalering med bildeutjevning, `globalAlpha`, `globalCompositeOperation` (`source-over`, `destination-in`, `destination-out`, `lighter`, `source-atop`), `clip()`, `filter: blur()`, `brightness()`, `contrast()` og `saturate()`, skygger og tekst.

**Godkjent:** verdier opp til minst 49,3 (10 000 nits ved 203 nits som 1,0) overlever alle operasjonene med under 0,5 % avvik. Ingen klemming til 1,0.
**Delvis:** verdiene overlever tegning og blanding, men noen filtre klemmer. Da noterer vi hvilke, og de må flyttes til WebGL.

### T2. Hva skjer med en HDR-`VideoFrame` på canvas?

- Dekod `pq-ramp.mov` og `hlg-ramp.mov` med mediabunny (`VideoSampleSink`), som `Reader` gjør, og noter `VideoFrame.format` og `colorSpace` (forventet `I010`/`P010`, `bt2020`, `pq`/`hlg`).
- Tegn rammen på et float16-canvas (T1) og les tilbake.

**Spørsmålet:** tonemapper Chromium bildet til SDR, klemmer det, eller beholder det lyse felt som verdier over 1,0? Dette avgjør om `Reader` kan brukes for HDR, eller om HDR alltid må gå gjennom FFmpeg (T3).

### T3. Lineær HDR fra FFmpeg

En variant av `FfmpegReader` som ikke tonemapper:

- `zscale=tin=smpte2084|arib-std-b67:min=bt2020nc:pin=bt2020:t=linear:npl=203,format=gbrpf32le` eller `rgba64le`, slik at 203 nits blir 1,0 (BT.2408).
- Last bufferen inn i en WebGL2-tekstur (RGBA16F/RGBA32F) og i en `VideoFrame`, hvis Chromium godtar et flyttallsformat. Ellers må vi bruke tekstur eller `ImageBitmap`.

**Måling:** feltene har riktig lineær verdi (100 nits ≈ 0,49, 1000 nits ≈ 4,93), med under 1 % avvik. Mål også gjennomstrømningen i bilder per sekund ved 1080p og 2160p.

### T4. Fargekorrigering i HDR

- Kjør `gradeImage` med en tegnebuffer i RGBA16F (`gl.drawingBufferStorage(gl.RGBA16F, w, h)` hvis det finnes, ellers en FBO med RGBA16F) og kildeverdier over 1,0.
- Sjekk at nøytral korrigering gir samme bilde ut som inn, og at eksponering ±1 dobler eller halverer de lineære verdiene uten klemming.
- Sjekk hva dagens shader gjør med verdier over 1,0 i kontrast, høylys, skygger og fargehjul. Dette er et kartleggingssteg; vi forventer at de må skrives om (fase I4).

### T5. Koding med HDR-metadata

Lag fila fra kjente rammer (rådata fra T3 eller T1) med FFmpeg-bygget vårt (`scripts/fetch-ffmpeg.mjs`):

- HEVC: `-f rawvideo -pix_fmt gbrpf32le` (eller `rgba64le`) inn, `zscale` til PQ eller HLG, `libx265 -pix_fmt yuv420p10le -x265-params hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=…:max-cll=…`.
- AV1 (`libaom-av1`, `yuv420p10le`), VP9 (`libvpx-vp9 -profile:v 2`) og ProRes 422 HQ/4444 (`prores_ks`, `yuv422p10le`/`yuv444p10le`) med `-color_primaries bt2020 -color_trc smpte2084|arib-std-b67 -colorspace bt2020nc`.
- Kontroller med `ffprobe -show_streams -show_frames` at fargemetadata, mastering display og CLL står i fila, og dekod tilbake til lineært lys for å måle feltene.
- Sjekk at `zscale` og 10-bit `libx265`, `libaom` og `libvpx` finnes i FFmpeg-bygget på alle tre plattformer.
- Sjekk om `VideoEncoder.isConfigSupported` godtar HEVC Main10 eller AV1 10-bit med HDR-metadata. Vi forventer nei eller bare enkelte maskiner, og legger derfor opp til FFmpeg.

**Godkjent:** filene spilles av som HDR i QuickTime (Mac), Filmer og TV (Windows) og VLC, og YouTube godtar dem som HDR ved en manuell opplasting (privat video, utføres av brukeren). Feltenes målte nits har under 2 % avvik.

### T6. Ytelse

- Mål bilder per sekund for hele løkken (lesing, tegning, tilbakelesing og piping) ved 1080p og 2160p for SDR i dag, HDR med float16-canvas (vei A) og HDR med WebGL (vei C, hvis aktuell).
- Mål minnebruk ved 2160p med fem lag.

**Godkjent:** HDR-eksport er høyst 3× tregere enn SDR-eksport via FFmpeg i dag, og bruker under 4 GB ekstra minne ved 2160p.

### T7. Forhåndsvisning (bare kartlegging)

- Sjekk om et HDR-`<video>`-element eller et canvas med `colorSpace: 'rec2100-pq'`/HDR-flagg vises som HDR på en HDR-skjerm i Electron 45 (Mac XDR og Windows med HDR på).
- Bare for å vite om fase I7 er mulig. Det påvirker ikke valget av vei.

### Valg av vei etter utprøvingen

| Resultat | Vei | Konsekvens |
|---|---|---|
| T1 godkjent, T2 beholder HDR | **A: float16-canvas, mediabunny** | `drawFrame` beholdes. Hjelpecanvas og `temperatureSource` må få float16. Minst arbeid. |
| T1 godkjent, T2 tonemapper eller klemmer | **B: float16-canvas, HDR via FFmpeg** | Som A, men HDR-kilder leses alltid med lineær `FfmpegReader` (T3). Noe tregere. |
| T1 delvis | **A/B med unntak** | Filtrene som klemmer, flyttes til WebGL (uskarphet og fargefiltre). |
| T1 ikke godkjent | **C: WebGL-sammensetting** | Ny sammensetting i WebGL2 med RGBA16F for HDR-eksport. Tekst og grafikk rasteriseres i SDR og legges på som teksturer. Mest arbeid, sannsynligvis flere uker. |
| T5 ikke godkjent på en plattform | — | FFmpeg-bygget må utvides før noe annet. HDR skjules på den plattformen til det er gjort. |

Resultatet, valget og begrunnelsen skrives øverst i denne planen før del 2 starter.

---

## Del 2: Implementasjon

Fasene bygger på hverandre. Hver fase skal kunne slås sammen alene, med HDR skjult bak et internt flagg til I5 er ferdig.

### I1. Fargerom i prosjektet

- Nytt felt på prosjektet: `color: { output: 'sdr' | 'pq' | 'hlg', peak: 1000 }`. Standard `sdr`, og gamle prosjekter tolkes som `sdr`.
- Hjelpefunksjoner i en ny `src/shared/hdr.js`: PQ og HLG til og fra lineært lys, referansehvitt (203 nits = 1,0), BT.2020 ↔ Rec. 709-matriser og SDR → HDR-plassering for grafikk og SDR-klipp. Ren JavaScript, enhetstestet i `test/hdr.test.mjs` mot kjente verdier fra ITU-R BT.2100 og BT.2408.
- Sjekk i `sealProject` og formatvalidering at HDR bare kombineres med kodeker som støtter det.

### I2. Kildene leses uten tonemapping ved HDR-eksport

- `neededFrames` og `direct()` i [src/worker/export.js](../src/worker/export.js): ved HDR-utdata brukes originalfila, og `decodeFilters` byttes ut med den lineære kjeden fra T3 (vei B), eller mediabunny brukes direkte (vei A).
- Tonemappede arbeidskopier og proxyer brukes aldri ved HDR-eksport. Mangler originalen, får brukeren beskjed før eksporten starter, i stedet for at det stille blir SDR.
- SDR-klipp i HDR-tidslinje: lineariseres fra Rec. 709 og plasseres på referansehvitt (1,0) i BT.2020.
- Stillbilder: SDR på referansehvitt. EXR og `.hdr` bruker sine lineære verdier.

### I3. Sammensetting i flyttall

Vei A/B:

- `renderVideo` lager hovedcanvas med `colorType: 'float16'` når utdata er HDR.
- Alle hjelpecanvas i [src/shared/render.js](../src/shared/render.js) (temperatur, masker, PiP, uskarphet, Design-lag) får samme innstilling gjennom én hjelpefunksjon, så det ikke blir glemt noen.
- `temperatureSource` skrives om så den ikke bruker 8-bit `getImageData`, helst ved å flytte temperaturen inn i fargekorrigeringen i WebGL.
- Filtre som klemte i T1, flyttes til WebGL.
- Tekst, titler, undertekster og Design-grafikk tegnes i SDR-verdier (0–1 = 0–203 nits), så de blir like lyse som i SDR-eksport. Valgfritt senere: en innstilling for grafikkens lysstyrke.

Vei C:

- Ny `src/shared/renderGl.js` med samme grensesnitt som `drawFrame`, men lag, transformasjoner, blandemoduser, masker og overganger i WebGL2 med RGBA16F.
- Tekst og vektorgrafikk tegnes på et SDR-canvas og lastes opp som tekstur.
- `drawFrame` beholdes for SDR og forhåndsvisning. En sammenligningstest sørger for at de to gir samme bilde for SDR-prosjekter, innenfor 1/255.

### I4. Fargekorrigering i HDR

- `gradeImage` får en HDR-modus: tegnebuffer i RGBA16F og ingen klemming før til slutt.
- Eksponering og temperatur regnes i lineært lys. Kontrast, høylys, skygger og fargehjul regnes i en logaritmisk arbeidskurve, slik at de oppfører seg likt i SDR og HDR. SDR-resultatet skal være uendret; det sjekkes mot dagens referansebilder i `test/film-looks.test.mjs` og `test/camera-lut.test.mjs`.
- Looks og `.cube`-LUT-er laget for SDR: brukes på et SDR-tonemappet signal og løftes tilbake, eller merkes «SDR only» og slås av i HDR-eksport. Valget tas her, ut fra resultatet i T4.
- Logg-konvertering (Apple Log, S-Log3 og så videre) kan gå til BT.2020 lineært i stedet for Rec. 709, så logg-opptak også kan eksporteres i HDR.

### I5. Koding og eksportvalg

- [src/shared/formats.js](../src/shared/formats.js): `hdr: true` på kodekene som støtter det: HEVC (MP4, MOV, MKV), AV1 (MP4, MKV, WebM), VP9 profil 2 (WebM, MKV) og ProRes 422 HQ/4444. H.264 og GIF får det ikke.
- Ny oppskrift i eksportrommet: «HDR (HEVC, PQ)» og «HDR for YouTube (HLG eller PQ)».
- `renderVideo` piper `rgba64le` eller flyttall til FFmpeg, og `videoArgsCrf` legger til 10-bit, fargemetadata og for HEVC `hdr10=1`, `master-display` og `max-cll`. MaxCLL og MaxFALL måles under tegningen, og skrives inn ved å mikse lyden med `-c:v copy` etterpå, eller settes til prosjektets `peak` hvis det ikke går.
- WebCodecs slås av for HDR (`useWebCodecs = false`), med mindre T5 viste at det virker.
- Eksportvinduet ([src/renderer/editor/ExportDialog.jsx](../src/renderer/editor/ExportDialog.jsx)): valg SDR / HDR PQ / HDR HLG, synlig bare når en HDR-kodek er valgt. Teksten sier at forhåndsvisningen er tonemappet og at fila vil se lysere ut på HDR-skjermer.
- Bildeeksport (`frameExport.js`): uendret i første versjon (SDR). Senere eventuelt AVIF eller PNG med HDR.

### I6. Tester

- `test/hdr.test.mjs`: overføringsfunksjoner, referansehvitt og matriser.
- `test/formats.test.mjs` og `test/export-room.test.mjs`: HDR bare på riktige kodeker, H.264 avvises, og argumentene til FFmpeg inneholder metadata og 10-bit.
- Ny integrasjonstest i Electron (skript, som `scripts/test-voice-packages.cjs`): eksporter `pq-ramp` og `hlg-ramp` med tekst og et SDR-klipp. Mål feltene, referansehvitt for grafikken, og sjekk `ffprobe`-metadata. Samme prosjekt eksportert som SDR skal gi samme resultat som i dag.
- Ytelsesmålingen fra T6 gjentas, og tallene skrives i resultatfila.

### I7. Forhåndsvisning og scopes (senere, valgfritt)

- Hvis T7 viste at det går: HDR-visning i viewer på HDR-skjermer, med bryter for tonemappet visning.
- Scopes i nits (waveform med 100/203/1000-linjer) når prosjektet er HDR. Dagens 8-bit SDR-scopes og tekstene i [docs/VIDEO-SCOPES.md](VIDEO-SCOPES.md) gjelder fortsatt i SDR.

### I8. Dokumentasjon

- Oppdater hjelpeartikkelen `hdr` og eksportteksten i `catalog.js`, deretter `npm run docs` (se CLAUDE.md), så `test/docs-site.test.mjs` går gjennom.
- Oppdater [docs/FEATURES.md](FEATURES.md), [README.md](../README.md) og [docs/index.html](index.html): fjern «HDR export is not supported yet», og beskriv hva som støttes (kodeker, PQ/HLG, at forhåndsvisningen er SDR).

---

## Åpne spørsmål for brukeren

- Skal første versjon ha både PQ og HLG, eller bare én av dem? HLG er enklest å vise riktig på SDR-skjermer, PQ (HDR10) er vanligst.
- Skal looks og LUT-er være tilgjengelige i HDR fra start (med tilpasning), eller være merket «SDR only» i første versjon?
- Hvilken toppverdi skal være standard (1000 nits er vanlig for HDR10)?
- Skal en tidslinje med bare SDR-klipp kunne eksporteres som HDR, eller skal valget bare vises når prosjektet har HDR-klipp?

## Risiko

- Chromium-støtten for float16-canvas og HDR i `VideoFrame` kan endre seg mellom Electron-versjoner. Utprøvingen må kjøres på nytt ved hver Electron-oppgradering, og resultatfila sier hvilken versjon den gjelder.
- GPU-driverforskjeller (særlig Windows og Linux) kan gi ulik flyttallsstøtte. Vei C er mer forutsigbar enn A/B.
- Forhåndsvisningen er tonemappet SDR, mens fila er HDR. Brukerne kan bli overrasket over hvordan eksporten ser ut, så eksportvinduet må si det tydelig.
