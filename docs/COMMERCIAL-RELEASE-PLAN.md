# Betalt Reccut med lukket egen kildekode

Vurdert 5. november 2026, mot den lokale arbeidskopien av Reccut 0.9.0.
Dette er en teknisk endringsplan, ikke en ferdig implementasjon eller juridisk godkjenning.

Status 6. november 2026: About har nå en lokal lisensleser med komponentoversikt,
versjoner og lisenstekster. Den genereres under bygging, pakkes som eksterne
ressurser og er beskrevet i README, den innebygde hjelpen og
[tredjepartsdokumentasjonen](THIRD-PARTY-LICENSES.md). Dette er informasjonsdelen
av punkt 1 nedenfor. Fullstendige kildeleveranser, LGPL-gjenoppbygging og de øvrige
utgivelseskravene i planen gjenstår. Reccuts egen lisens er ikke endret.

## Anbefalt løsning

Behold dagens mediemotor, eksportbibliotek, inputbibliotek og modeller. Gjør lisensinformasjon, tredjepartskilder og bygging til en kontrollert del av utgivelsen. Reccuts egen editor, opptakslogikk, grensesnitt og prosjektformat kan etter denne vurderingen fortsatt distribueres under en proprietær lisens. Tredjepartskomponentene beholder sine egne lisenser.

Det er teknisk mulig å gjennomføre denne løsningen uten å fjerne funksjoner eller bytte kodeker. Det må verifiseres med pakkede apper på hver støttet plattform før funksjonslikhet kan bekreftes. Særlig vurderingen av FFmpeg som et separat verk og oppfyllelsen av LGPL for inputmodulen må avklares for den endelige distribusjonen.

## Komponentene som styrer valgene

| Komponent | Faktisk bruk i prosjektet | Anbefalt behandling | Funksjoner som kan beholdes |
| --- | --- | --- | --- |
| FFmpeg, GPLv3 eller nyere | Kjøres som separat binærfil via `spawn`, med standard argumenter, filer og mediestrømmer. Den lokale Mac-binæren har `--enable-gpl`, `--enable-version3`, x264 og x265, uten `--enable-nonfree`. | Behold prosessgrensen. Arkiver og tilgjengeliggjør fullstendig tilhørende kildekode, biblioteker, endringer, byggeskript og lisenser for hvert distribuert bygg. | H.264/H.265, konvertering, proxyer, importklargjøring, opptaksfinalisering, programvarebasert eksport og øvrige FFmpeg-formater. |
| Mediabunny 1.65.0, MPL 2.0 | Importeres i `src/worker/export.js` og bygges inn i minifisert JavaScript. | Behold biblioteket. Distribuer MPL-informasjon og tydelig tilgang til riktig originalkilde og eventuelle endringer. | WebCodecs-basert lesing, eksport og containerhåndtering. |
| uiohook-napi 1.5.5 / libuiohook | npm-omslaget er MIT, men C-biblioteket inni er LGPLv3 eller nyere. `binding.gyp` bygger dette som et statisk bibliotek inni en separat `.node`-modul. | Behold modulen, med komplett byggbar kilde til modulen og en dokumentert og testet måte å gjenoppbygge og erstatte den på. Vurder dette konkret mot LGPL §4. | Globale tastehendelser, museklikk, pekersporing og zoomtast. |
| Whisper og de to aktive BiRefNet-modellene, MIT | Modeller og konfigurasjon pakkes fra `vendor`. | Behold modeller og lisens-/opphavsrettstekster. Kontroller hver versjon og modell som faktisk leveres eller lastes ned. | Lokal transkripsjon og bakgrunnsfjerning. |
| OpenMoji, CC BY-SA 4.0 | Farge- og konturgrafikk kopieres til appen; kildeopplysninger følger plasserte elementer. | Behold kreditering, lisens og informasjon om eventuelle endringer. Skill grafikkens vilkår fra lisensen for Reccut-koden. | Emoji og grafikkbibliotek. |
| Blackmagic RAW | Egen decoderprosess og Blackmagics API-bibliotek finnes lokalt og kopieres av `scripts/build-braw.mjs`. | Behold integrasjonen etter SDK-avtalen. Ta med relevante lisensopplysninger; ikke publiser hele SDK-en som del av et åpent kildearkiv. | BRAW-import på bygg/plattformer som allerede støtter dette. |

GNU beskriver kommandolinje og pipes som mekanismer som normalt brukes mellom separate programmer, men også kommunikasjonens innhold og graden av integrasjon teller. `spawn()` alene er derfor ingen juridisk garanti. MPL tillater uttrykkelig en større proprietær app, også når MPL-kode og annen kode minifiseres sammen. LGPL har egne krav til endring, gjenkobling og nødvendige installasjonsopplysninger.

Kilder: [GNU om separate verk](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation), [GPLv3 §6](https://www.gnu.org/licenses/gpl-3.0.html), [LGPLv3 §4](https://www.gnu.org/licenses/lgpl-3.0.en.html), [MPL FAQ, særlig spørsmål 8, 11 og 16](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [Mediabunnys lisensforklaring](https://github.com/Vanilagy/mediabunny#license), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Blackmagic-vurderingen bygger på den installerte SDK-ens `Documents/License.rtf`, særlig §1.1(d).

## Konkrete endringer i kode og bygging

### 1. Generer og vis tredjepartsinformasjon

- Legg til et byggesteg, for eksempel `scripts/third-party-notices.mjs`, som lager komponentoversikt, fullstendige lisenstekster og versjonsfestede kildereferanser. Ta med nødvendige NOTICE-filer og underliggende biblioteker, ikke bare `license`-feltet i npm-metadata.
- Koble steget til `scripts/build.mjs` og pakk resultatet under `build/licenses/` eller en egen ressursmappe. Eksisterende kopiering av OpenMoji, Unicode og Whisper kan inngå i dette.
- Ta med lisensene til blant annet Preact, Signals, Lucide/Feather, Tabler, Immer, Transformers.js, ONNX Runtime, Mediabunny og PDF.js med innebygde komponenter. Behold også Electrons og Chromiums egne lisensfiler.
- Legg til en lokal visning av «Third-party licenses» fra `src/main/about.js` eller hjelpen. Der må brukeren finne lisenser og kildekodeinformasjon også etter installasjon. Versjonen skal fortsatt komme fra `app.getVersion()`.

Dette endrer ikke opptaks- eller redigeringsalgoritmene. At en pakke står i `devDependencies`, fritar den ikke fra lisenskrav hvis den bygges inn i appen. En kontroll med esbuild-metafiler bekreftet at blant annet Mediabunny, Transformers.js og ONNX Runtime inngår i JavaScript-byggene. Sharp/libvips ble ikke funnet i denne kontrollen av JavaScript-inndata; den endelige installasjonspakken må likevel kontrolleres separat.

### 2. Gjør FFmpeg-distribusjonen komplett

- Endre `scripts/fetch-ffmpeg.mjs`: Behold originale lisens- og opphavsrettsfiler fra arkivet. Dagens script kopierer kun binæren og lager en kort tekst med generelle lenker.
- Fest kildegrunnlag, tredjepartsbiblioteker, eventuelle patcher, byggeskript og konfigurasjon til hvert plattform-/arkitekturbygg. Knytt dem til binærens sjekksum i et manifest.
- Skaff et fullstendig kildearkiv som svarer til leverandørens binærfil. Hvis det ikke lar seg dokumentere, bygg FFmpeg fra et kildegrunnlag vi selv arkiverer, med nødvendige kodeker og filtre.
- Legg kildearkivet tilgjengelig sammen med installerens nedlastingsinformasjon, uten ekstra betaling for kildene. Et separat arkiv på utgivelsessiden kan holde installasjonsfilen liten. Generelle lenker til FFmpeg-forsiden og en release-tarball er ikke tilstrekkelig dokumentasjon på samsvar med det distribuerte bygget.
- La et kontrollsteg i pakkingen stoppe utgivelsen hvis påkrevde kilder, lisensfiler eller koblingen mellom kilde og binær mangler. Ikke merk en generell eller ubekreftet kildelenke som kontrollert.

Behold `src/main/ffmpeg.js`, `src/worker/export.js` og prosessgrensen. Unngå å lenke GPL-bibliotekene direkte inn i proprietær Reccut-kode.

### 3. Gjør inputmodulen gjenoppbyggbar og utskiftbar

- Arkiver den eksakte kilden til `uiohook-napi` og den medfølgende libuiohook-utgaven, inkludert patcher, lisenser, byggeskript og byggeinstruksjoner. npm-omslagets MIT-lisens dekker ikke hele den native modulen.
- Foretrekk å bygge modulens binærfiler fra dette kjente grunnlaget i utgivelsesjobben, slik at samsvaret med kildene kan dokumenteres.
- Behold `asarUnpack` for `node_modules/uiohook-napi/**` i `package.json`. Kontroller at installert app faktisk laster den utskiftbare `.node`-filen.
- Verifiser at en mottaker kan bygge modulen med en endret libuiohook og bruke resultatet i appen. Oppgi nødvendig installasjons-/signeringsfremgangsmåte der vilkårene krever det. Kontroller dette på den endelig signerte pakken, ikke bare i utviklingsmodus.
- Egen app-lisens må ha nødvendige unntak for tredjepartsrettigheter, inkludert LGPLs rettigheter til å endre biblioteket og feilsøke slike endringer.

Denne løsningen tar sikte på å publisere den avgrensede native modulen med tilhørende byggemateriale, mens `src/main/input.js` og resten av Reccut forblir lukket. Om dokumentasjonen og utskiftingsmekanismen oppfyller LGPL må vurderes mot den faktiske pakken. Det er ikke nok å legge ved en LGPL-tekst. Det er heller ikke nødvendig å starte med en ny implementasjon av globale inputhendelser på tre operativsystemer.

### 4. Etabler proprietær Reccut-utgave og separat distribusjon

- Avklar rettighetene til egen kode og eventuelle bidrag. Bruk en proprietær app-lisens for den nye utgaven, med uttrykkelig unntak for tredjepartskomponentenes lisenser. Oppdater `package.json`/låsefilens prosjektmetadata og omtalen av den nye utgaven i README/nettside i samsvar med valgt lisens.
- Allerede utleverte MIT-utgaver gir mottakerne rettigheter som ikke forsvinner når en senere utgave blir lukket. Dersom gammel MIT-kode fra andre rettighetshavere inngår, må påkrevde merknader bevares. Et privat repo gir ikke i seg selv nye rettigheter til andres kode.
- Bruk et privat utviklingsrepo og en offentlig distribusjonskanal med bare installasjonsfiler, utgivelsesinformasjon og nødvendige tredjepartskilder. Dette kan være et eget offentlig GitHub-repo. Hvis nedlasting skal kreve kjøp, trengs en egnet tjeneste for dette; kildekodekravene til tredjepartsdelene må fortsatt oppfylles.
- Endre `src/main/updates.js` slik at utgivelseskanalen kan konfigureres uavhengig av kildekoderepoet. I dag leses `package.json.repository`, og appen bruker GitHub uten autentisering. Flyttes dette repoet privat uten en ny kanal, vil oppdateringssjekken slutte å virke. Behold kontrollen av tillatte nedlastingsadresser.
- Tilpass `.github/workflows/build.yml` til valgt kanal og publiser nødvendige kildearkiver/lisensoversikter sammen med installasjonsfilene. Eventuelle publiseringsnøkler hører hjemme på byggeserveren.
- Ved en ny versjon: bruk `npm version <x.y.z> --no-git-tag-version`, og kontroller About-vinduet og oppdateringssjekken som beskrevet i `AGENTS.md`.

MIT-kilden: [Open Source Initiative](https://opensource.org/license/mit).

### 5. Behold RAW- og modellstøtte i utgivelsesløpet

Den lokale Mac-pakken har BRAW-biblioteket, men GitHub-jobben kjører ikke `scripts/build-braw.mjs` og installerer ikke Blackmagic SDK. Lokal funksjonalitet er derfor ikke dokumentasjon på at CI-pakken har BRAW-støtte. Utgivelsesløpet må bygge og pakke denne delen under SDK-vilkårene for plattformene som skal ha funksjonen. Ikke lov BRAW-støtte på Windows ut fra dagens script; det hopper over Windows.

Modellene må fortsatt inkluderes med samme filer, lokale filstier og lisenser. Pågående arbeid med undertekstmodeller i arbeidskopien må tas med når den endelige pakkelisten fastsettes.

## Hvorfor et enkelt bytte til FFmpeg uten GPL kan gi funksjonstap

BtbNs LGPL-variant mangler blant annet libx264 og libx265. Reccut har direkte avhengigheter til disse i `src/shared/formats.js`, `src/worker/export.js`, `src/main/ffmpeg.js`, `src/main/recording.js`, `src/main/media.js`, `src/main/packager.js`, `src/main/graphics.js` og `src/main/sequence.js`.

Et slikt bytte krever en felles mekanisme for å velge tilgjengelig encoder og egne innstillinger for hver encoder. Maskinvarekoding finnes ikke likt på alle maskiner, og parametere for kvalitet, bitdybde og hastighet kan ikke oversettes direkte fra x264/x265. En eksportknapp som fortsatt heter H.264 er derfor ikke i seg selv bevis på samme funksjonalitet, kvalitet eller kompatibilitet. Dette er et større alternativ hvis man ønsker å unngå GPL-komponenten helt; det er ikke nødvendig bare for å ta betalt.

Kilde: [BtbNs dokumentasjon av byggvariantene](https://github.com/BtbN/FFmpeg-Builds#targets-variants-and-addins).

## Verifikasjon før utgivelse

For løsningen over må vi kontrollere pakket app på Mac ARM64/Intel, Windows x64 og Linux x64 med de samme funksjonene som det aktuelle bygget støttet før endringene: opptak og gjenoppretting, kamera/mikrofon, globale inputhendelser, proxy/import, H.264/H.265/10-bit, AV1/VP9/ProRes, lyd, transkripsjon, bakgrunnsfjerning, Design/emoji og oppdatering. BRAW kontrolleres på plattformer der decoder allerede finnes eller skal leveres.

Kilde- og pakkekontrollen må også vise at riktig tredjepartskilde er tilgjengelig, at nødvendige lisenser følger med og at en gjenoppbygd inputmodul kan brukes. Windows- og Linux-verifikasjon kan ikke erstattes av Mac-tester.

Under denne undersøkelsen ble alle de åtte JavaScript-entrypointene som brukes av byggescriptet kontrollert med esbuild i minnet. Ingen ferdig distribusjon ble bygget eller signert. `npm test` på dagens arbeidskopi ga 626 tester: 623 bestått, tre feilet:

- `test/design-online.test.mjs`: forventningen om minst 180 vanlige designelementer.
- `test/design-state.test.mjs`: prosjektets navn etter undo/redo mellom Design og Edit.
- `test/editor-state.test.mjs`: referanselikhet etter forhåndsvisning av redigering.

Dette er en referansekjøring før implementasjon av denne planen. Feilene må vurderes før utgivelse; de skyldes ikke lisensendringer utført i denne undersøkelsen. Funksjonskoden og prosjektets lisens er ikke endret som del av vurderingen.

Kodekpatenter og den endelige app-/SDK-avtalen er egne avklaringer som ikke løses av å legge til lisensfiler. [FFmpegs juridiske informasjon](https://ffmpeg.org/legal.html) omtaler skillet mellom kode- og patentrettigheter. Electron/ASAR/minifisering er heller ikke et løfte om at distribuert JavaScript blir teknisk umulig å lese; lukket kildekode handler her om lisens og publisering av utviklingskilden.
