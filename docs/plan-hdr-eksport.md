# Plan: Eksport i HDR (PQ og HLG)

Status: ikke påbegynt. Skrevet 13. november 2026.

Målet er at Reccut kan eksportere HDR-video (HDR10/PQ og HLG) med riktig metadata, uten at HDR-klippene først tonemappes til SDR. SDR-eksport skal fungere som før, og være standard.

Planen har to deler:

1. **Utprøving (del 1):** avgrensede tester som avgjør hvilken teknisk vei som virker i Electron 45 (Chromium 140) og i FFmpeg-bygget vårt. Ingen endringer i produktkoden.
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
