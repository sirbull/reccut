# Fase 9: VoxCPM2 på Windows og Linux

Skrevet 12. november 2026. Utgangspunkt: Reccut 0.9.3 og
[VoxCPM2-planen](plan-voxcpm2.md). **Dette er en gjennomføringsplan. Windows- og
Linux-støtten er ikke implementert eller målt ennå.** Arbeidet starter på en
Windows-maskin. Windows testes direkte; Linux kan først bygges og måles i WSL2.

## Mål og avgrensning

Lever en separat CPU-motor for Windows x64 og Linux x64 dersom målingene viser
at den er brukbar. Hver plattform kan godkjennes og aktiveres uavhengig av den
andre. Behold Mac arm64-flyten, modellene, de fem språkene, ti uttrykkene og de
eksisterende syntetiske referansene. Ingen ny lyttetestrunde kreves for å komme
i gang; kjente uttalefeil regnes ikke som løst av porteringen.

GPU-støtte med CUDA/Vulkan, Windows ARM64, Linux ARM64, Intel Mac og nye
kvantiseringer er egne senere oppgaver. Første måling bruker samme modellfiler,
parametere og referanser som Mac. Ikke senk kvaliteten for å få et bedre ytelsestall.

Windows- og Linux-motorene skal fortsatt lastes ned uttrykkelig, fra utgivelsen
som svarer til appversjonen, og kontrolleres med SHA-256 og protokollsjekk.
Verken motor, modellvekter eller referanse-WAV-er skal inn i installasjonsfilen.
Manus og opptak skal forbli lokale. Keystroke-tillegget berøres ikke.

## Dagens kode og nødvendige endringer

| Fil | Status og arbeid |
| --- | --- |
| `native/voxcpm/voxcpm_server.cpp` | Stdio-adapteren har allerede `--cpu`, `--protocol`, `--help` og 48 kHz PCM-utgang. Prøv MSVC/GCC og rett konkrete portabilitetsfeil. Undersøk UTF-8-filnavn og modellargumenter på Windows. |
| `native/voxcpm/CMakeLists.txt` | Felles CMake-target finnes. Legg til nødvendige plattformvalg og kontroller runtime-/bibliotekavhengigheter. |
| `native/voxcpm/build-mac.sh` | Bare Mac. Opprett `build-windows.ps1` og `build-linux.sh` med samme revisjons-, protokoll-, lisens- og hashkontroll. |
| `src/main/voxcpm.js` | `assetName()` tillater bare Mac arm64. Utvid først når aktuell plattform består kravene. Behold innholdslåste modell-/referansepakker og versjonslåst motor. |
| `src/main/voxcpmProcess.js` | Har oppstart 120 s, forespørsel 300 s og avslutning med SIGTERM/SIGKILL. Test Windows-avslutning og filopprydding; gi benchmarken eksplisitt CPU-valg uten å endre Mac-standard. |
| `scripts/test-voxcpm-process.mjs` | Kan teste en separat CPU-binær før plattformen åpnes i appen. Dagens test er kort og er ikke en full ytelsesbenchmark. |
| `scripts/install-voxcpm-local.mjs` | Hardkoder `reccut-voxcpm-mac` i lokal filkilde og kontrollsum. Gjør plattformnavnet dynamisk før bruk på Windows/Linux. |
| `src/main/ttsCatalog.json` | Bare `engine.files.mac` finnes. Legg til metadata for godkjente plattformer; ikke bytt modellrevisjon eller referanser. |
| `src/shared/voicePackages.js`, `src/renderer/voiceover/AiVoice.jsx` | Har faste tekster om Apple Silicon. Bruk faktisk plattformtilgjengelighet og en presis begrunnelse ved manglende støtte. |
| `.github/workflows/build.yml` | Appen bygges på alle tre OS, men VoxCPM-jobben er bare Mac. Legg til separate CPU-bygg uten modellnedlasting. |

## 1. Klargjør Windows-maskinen

Bruk en Windows x64-maskin, helst Windows 11, og vanlig strømtilkobling under
målingen. **16 GB RAM og minst 15 GB ledig disk er en anbefaling for utviklingsarbeidet,
ikke et målt minimumskrav til brukerne.** Noter faktisk CPU, kjerner/tråder,
RAM, OS-versjon og strømprofil i rapporten.

Installer Git, Node.js med samme hovedversjon som CI (nå 26), CMake, Ninja og
Microsoft C++ Build Tools med **Desktop development with C++**, MSVC x64/x86
og Windows SDK. Åpne Developer PowerShell som setter opp x64-verktøyene.
Microsoft beskriver [installasjon](https://learn.microsoft.com/en-us/cpp/overview/acquire-msvc?view=msvc-170)
og [utviklerskallet](https://learn.microsoft.com/en-us/cpp/build/building-on-the-command-line).

Ha Reccut-arbeidskopien på Windows-disken, for eksempel `C:\src\reccut`.
Hent grenen som inneholder både fase 1–8 og denne planen; ikke anta at en eldre
standardgren inneholder arbeidet. Behold egne lokale endringer.

Kjør fra prosjektroten i Developer PowerShell:

```powershell
Get-Command node, git, cmake, ninja, cl
node -p "process.platform + '/' + process.arch"
git status --short
git rev-parse HEAD
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci feilet' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Grunntestene feilet' }
```

Forvent `win32/x64`. `npm ci` installerer utviklingsavhengigheter og prosjektets
vanlige FFmpeg-oppsett, ikke VoxCPM-modeller. Rett eller dokumenter eksisterende
Windows-feil før nye feil tilskrives motoren.

## 2. Hent låst kildekode og lokale testmodeller

Klon upstream under den ignorerte `vendor`-mappen, og sjekk ut revisjonen fra
katalogen. Nåværende lås er `d30f00feadb7ebce95bacd55b0d104e3ef501481`.
Ikke bytt til upstreams nyeste kode som en skjult del av porteringen.

```powershell
$voxSource = Join-Path (Get-Location) 'vendor/voxcpm-source'
$voxRevision = node -p "require('./src/main/ttsCatalog.json').voxcpm.engine.revision"
if (-not (Test-Path $voxSource)) {
  git clone https://github.com/tc-mb/llama.cpp-omni.git $voxSource
  if ($LASTEXITCODE -ne 0) { throw 'Kloning feilet' }
}
# Kontroller eventuelle lokale upstream-endringer før checkout.
git -C $voxSource status --short
git -C $voxSource checkout --detach $voxRevision
if ($LASTEXITCODE -ne 0) { throw 'Checkout feilet' }
if ((git -C $voxSource rev-parse HEAD) -ne $voxRevision) {
  throw 'Feil upstream-revisjon'
}
```

De to eksisterende modellfilene kan kopieres fra Mac eller hentes eksplisitt
fra den låste katalogen. Legg dem for eksempel i `C:\reccut-models\voxcpm`.
Samlet størrelse er 3 552 406 272 byte. Kontroller hver fil, også etter kopiering:

```powershell
$voxModels = 'C:\reccut-models\voxcpm'
$voxCatalog = (Get-Content .\src\main\ttsCatalog.json -Raw | ConvertFrom-Json).voxcpm
foreach ($file in $voxCatalog.model.files) {
  $target = Join-Path $voxModels $file.path
  if ((Get-Item $target).Length -ne $file.size) { throw "Feil størrelse: $target" }
  if ((Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
    throw "Feil SHA-256: $target"
  }
}
```

Ved eksplisitt nedlasting er URL-mønsteret
`https://huggingface.co/<repository>/resolve/<revision>/<path>`, med verdiene
fra `voxcpm.model` i katalogen. Dette er en utviklerhandling, aldri et nytt
postinstall-/byggesteg. Referansene finnes allerede i `native/voxcpm/voices`.

## 3. Få et separat Windows CPU-bygg til å starte

Start med Ninja/Release og uten GPU-backender eller OpenMP. Dermed blir første
undersøkelse enklere å flytte til en ren maskin. **Kommandoen under er et
konfigurasjonsutgangspunkt, ikke et Windows-bygg som allerede er verifisert.**
Fiks faktiske compiler-/linkerfeil i adapteren eller med en dokumentert lokal
patch; ikke opphev revisjonslåsen. Ta vare på CMake-konfigurasjonen og loggen.

```powershell
$voxBuild = Join-Path (Get-Location) 'vendor/voxcpm-win-build'
cmake -S native/voxcpm -B $voxBuild -G Ninja `
  "-DVOXCPM_SOURCE_DIR=$voxSource" `
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded `
  -DBUILD_SHARED_LIBS=OFF -DGGML_BACKEND_DL=OFF -DGGML_NATIVE=OFF `
  -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DENABLE_COREML=OFF `
  -DGGML_OPENMP=OFF -DGGML_SSE42=OFF -DGGML_BMI2=OFF `
  -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_AVX512=OFF `
  -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF `
  -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF
if ($LASTEXITCODE -ne 0) { throw 'CMake-konfigurering feilet' }
cmake --build $voxBuild --target reccut-voxcpm --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Motorbygget feilet' }
$voxExe = Join-Path $voxBuild 'bin/reccut-voxcpm.exe'
& $voxExe --protocol
if ($LASTEXITCODE -ne 0) { throw 'Protokollsjekken feilet' }
& $voxExe --help
dumpbin /DEPENDENTS $voxExe
```

Forvent protokoll 1. Ninja bruker `CMAKE_BUILD_TYPE=Release`; hvis Visual Studio
som fler-konfigurasjonsgenerator velges i stedet, bygg med `--config Release`
og håndter at EXE-filen kan ligge under `bin/Release`.
Se [CMake om byggtype](https://cmake.org/cmake/help/latest/variable/CMAKE_BUILD_TYPE.html).
`MultiThreaded` velger statisk MSVC-runtime når CMake-policyen tillater det;
kontroller de faktiske avhengighetene, ikke bare flagget.
[CMake-dokumentasjon](https://cmake.org/cmake/help/latest/variable/CMAKE_MSVC_RUNTIME_LIBRARY.html).

Undersøk spesielt `NOMINMAX`/MSVC-definisjoner der det trengs, UTF-8-manus over
Node-pipes, CRLF, og stier med mellomrom og Unicode. Adapteren bruker i dag
smale `main`-argumenter og `ifstream`/`ofstream` med strengstier. Vurder Windows
wide-argumenter konvertert til UTF-8 og `filesystem::u8path` for referanse/utgang;
test også modellinnlastingens upstream-støtte. En ASCII-test alene godkjenner
ikke filstøtte under et vanlig Windows-brukernavn.

Test EXE-filen uten Developer PowerShell og på en maskin uten Build Tools.
Hvis ekstra DLL-er kreves, enten fjern avhengigheten eller gjør den til en
eksplisitt, verifisert del av motorpakken. Dagens installasjon håndterer én EXE;
ikke distribuer en EXE som i stillhet trenger løse DLL-er.

## 4. Verifiser protokollen før appen åpnes for Windows

Den eksisterende prosesskontrollen kan kjøres mot en CPU-binær selv om
`assetName()` fortsatt sperrer Windows i appen:

```powershell
$voxRef1 = '.\native\voxcpm\voices\reccut-voxcpm-en-us-female-1.wav'
$voxRef2 = '.\native\voxcpm\voices\reccut-voxcpm-en-us-male-1.wav'
node scripts/test-voxcpm-process.mjs $voxExe $voxModels $voxRef1 $voxRef2
if ($LASTEXITCODE -ne 0) { throw 'Prosesskontrollen feilet' }
```

Dagens kontroll bruker en norsk testsetning, gjenbruker modellen, bytter
referanse/stemning, avbryter og starter på nytt. Den krever samme PCM ved gjentatt
kjøring i samme miljø. Ikke krev identiske PCM-hasher mellom ulike OS/CPU-er.
Hvis instruksjonsvalg gir forskjeller, undersøk dem og definer en begrunnet
toleranse; ikke fjern regresjonssjekken for å skjule lekkasje av setningskontekst.

CPU-bygget i trinn 3 har ingen GPU-backender. For sammenligning med bygg som
også har GPU-støtte, utvid testscriptet/prosesskonfigurasjonen med eksplisitt
`--cpu`, og ta CPU-/trådvalg med i prosessens gjenbruksnøkkel. Native-adapteren
støtter allerede `--cpu`; testscriptet har ikke dette valget ennå.

Avbryt både mens modellen lastes og mens den genererer. Kontroller at barnet
avsluttes, at `close` er mottatt før WAV-mappen slettes, at ingen filhåndtak står
åpne, og at neste jobb lykkes. Test appavslutning med lastet modell. Windows
har andre signalforhold enn POSIX; verifiser resultatet på Windows.

## 5. Lag en reproducerbar CPU-benchmark

Opprett **`scripts/benchmark-voxcpm.mjs`**. Scriptet finnes ikke ennå.
Det skal bruke den virkelige adapteren og katalogens innstillinger, uten nett
eller installasjon. Det skal skrive maskinlesbar JSON og beholde testlyd i en
valgt resultatmappe. Det skal ikke endre appens standardinnstillinger.

Benchmarken må kunne ta `--cpu`, eksplisitte lokale filstier, antall repetisjoner,
utdatamappe og eventuelt trådantall. For trådtuning finnes
`VoxCPM2Runtime::set_n_threads()` allerede i den låste runtime-en; adapteren må
få et avgrenset valg før det kan brukes. Ikke anta at `OMP_NUM_THREADS` styrer
alle delene av modellen. Kjør først med dagens standard, deretter mål få
begrunnede alternativer. Hold samme valg ved Windows/Linux-sammenligning.

Bruk et lite, versjonslagret sett med engelske og norske syntetiske testtekster:

- En kort setning for oppstart og første komplette lydfil.
- To–tre setninger for vanlig generering med varm modell.
- Et manus på omtrent ett minutt, delt med appens `spokenText`/`chunksForSpeech`.
  Hver setning må få samme stemningsbeskrivelse, og all tekst må komme med.
- Bytte språk, referanse og uttrykk i samme prosess, deretter tilbake til
  opprinnelig innstilling. Bruk minst Neutral, Warm og Sensual; røykprøv alle ti.

Kjør minst tre prosessoppstarter og fem varme repetisjoner per vanlig testtilfelle.
Skill **ny prosess** fra **kald diskcache**; ikke kall alle nye prosesser kald disk.
Rapporter median og p95 som beskrivelser av dette begrensede utvalget.

| Måling | Definisjon |
| --- | --- |
| Modelloppstart | Tid fra start av barnet til `ready` |
| Første lyd | Fra første forespørsel til ferdig WAV; adapteren streamer ikke lyd til appen |
| Varm generering | Tid for en jobb etter at modellen er lastet, uten ny prosess |
| RTF | Genereringstid / faktisk lydlengde. 12 s arbeid for 4 s lyd gir RTF 3. Skill oppstart fra varm RTF. |
| Minne | Motorprosessens høyeste RSS/working set, og private/commit der tilgjengelig. Ikke bruk Node-scriptets minne som motorens. |
| Avbryt | Tid til barnet er avsluttet og midlertidige filer kan fjernes |
| Langt manus | Total tid, lydlengde og antall setninger, med bekreftelse på komplett tekst |

Rapporten skal ha Reccut-commit, upstream-revisjon, motor-/modell-/referansehash,
OS, CPU/arkitektur, RAM, compiler/CMake-versjoner, byggflagg og SIMD-/trådvalg.
Merk WSL/VM-resultater og eventuell VM-grense for CPU og minne. Bruk samme strømprofil
og noter bakgrunnsbelastning. Ta med alle repetisjoner, ikke bare det beste tallet.

**Foreslåtte kriterier for første CPU-versjon** — arbeidsmål, ikke allerede
godkjente maskinkrav:

| Område | Mål før plattformen tilbys |
| --- | --- |
| Varm hastighet | Median RTF ≤ 3 og p95 ≤ 5 på en dokumentert representativ testmaskin |
| Oppstart | `ready` innen 60 s og første korte lydfil innen 90 s fra prosessstart |
| Minne | Motorens toppminne ≤ 8 GiB på 16 GiB-testmaskinen, uten vedvarende swapping eller voksende bruk gjennom gjentatte jobber |
| Avbryt | Barn avsluttet og opprydding mulig innen 2 s i normaltest, også ved modelloppstart |
| Stabilitet | Ingen krasj/fastlåsing; minst ti påfølgende jobber, bytte mellom stemmer og ren jobb etter avbryt |
| Lyd/tekst | Gyldig, ikke-stille 48 kHz mono-WAV, komplett manus og ingen ny systematisk plattformfeil |

Hvis et kriterium ikke nås: dokumenter målingen og behold plattformen sperret
mens et avgrenset tiltak prøves. En mislykket ytelsesprøve skal ikke merkes som
ferdig plattformstøtte. CPU-optimalisering kan undersøkes uten å endre modell,
CFG, timesteps eller testtekst.

Første bygg er en portabilitetsbaseline. Et separat AVX2-bygg kan måles deretter.
`GGML_NATIVE=OFF` alene slår ikke av alle SIMD-utvidelser i den låste koden.
Dokumenter eksplisitte flagg, inklusive FMA/F16C for GCC/Clang og MSVCs implisitte
valg. Ikke send en lokalt optimalisert eller AVX2-avhengig EXE til vilkårlige x64-
maskiner. Hvis AVX2 blir et produktkrav, må en trygg egenskapssjekk og en tydelig
begrunnelse finnes før motoren kjøres; ellers behold en portabel CPU-baseline.

## 6. Bygg og mål Linux fra Windows

Bruk WSL2 for den første Linux-løypen. Microsoft beskriver
[installasjonen](https://learn.microsoft.com/en-us/windows/wsl/install).
Kjør bare hvis WSL ikke allerede er satt opp, i administrator-PowerShell:

```powershell
wsl --install -d Ubuntu
```

Start maskinen på nytt hvis installasjonen krever det. Kontroller med
`wsl --list --verbose` at distribusjonen bruker WSL2. Åpne Ubuntu og ha en
**egen Linux-arbeidskopi og egne `node_modules`**, for eksempel `~/src/reccut`.
Oppbevar kildekode, bygg og testmodeller i Linux-filsystemet under målingen,
ikke under `/mnt/c`. Dette følger Microsofts
[filsystemanbefaling](https://learn.microsoft.com/en-us/windows/wsl/filesystems).

Installer compiler, CMake, Ninja og Git i Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake ninja-build git
```

Installer også Linux-utgaven av Node med samme hovedversjon som CI; ikke bruk
Windows-Node gjennom WSL-interoperabilitet. I Linux-arbeidskopien:

```bash
set -euo pipefail
node -p "process.platform + '/' + process.arch"
git rev-parse HEAD
npm ci
npm test
vox_revision="$(node -p "require('./src/main/ttsCatalog.json').voxcpm.engine.revision")"
git clone https://github.com/tc-mb/llama.cpp-omni.git vendor/voxcpm-source
git -C vendor/voxcpm-source checkout --detach "$vox_revision"
```

Bruk eksisterende upstream-kopi dersom den finnes, med samme lokale-endringer-
og revisjonskontroll som i Windows. Forvent `linux/x64`. Kopier modellfilene
eksplisitt inn i Linux-filsystemet, og verifiser SHA-256 og størrelse på nytt.

Konfigurasjonsutgangspunkt for et rent CPU-bygg:

```bash
set -euo pipefail
cmake -S native/voxcpm -B vendor/voxcpm-linux-build -G Ninja \
  -DVOXCPM_SOURCE_DIR="$PWD/vendor/voxcpm-source" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DGGML_BACKEND_DL=OFF -DGGML_NATIVE=OFF \
  -DGGML_METAL=OFF -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DENABLE_COREML=OFF \
  -DGGML_OPENMP=OFF -DGGML_SSE42=OFF -DGGML_BMI2=OFF \
  -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_AVX512=OFF \
  -DGGML_FMA=OFF -DGGML_F16C=OFF \
  -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF
cmake --build vendor/voxcpm-linux-build --target reccut-voxcpm --parallel 4
vendor/voxcpm-linux-build/bin/reccut-voxcpm --protocol
ldd vendor/voxcpm-linux-build/bin/reccut-voxcpm
```

Kontroller hver returkode; stopp ved første feil. Kjør prosesskontrollen og den
samme benchmarken med Linux-filbaner og samme testdata som på Windows. WSL-tall
er reelle WSL-målinger, men erstatter ikke godkjenning av Linux-desktop eller
en bestemt distribusjons binærkompatibilitet. Før Linux slås på, test også i en
ren Linux-VM eller på en Linux-maskin. Dette kan administreres fra Windows.

Bestem eldste støttede distribusjon, bygg mot en passende glibc/libstdc++-baseline
og test på denne og en nyere distribusjon. Ikke anta at en binær fra
`ubuntu-latest` virker på eldre Linux. Ikke legg ved alle systembiblioteker eller
et helt modellmiljø for å skjule manglende avhengighetskontroll.

## 7. Koble godkjente plattformer til appen

Gjør dette etter at målingene for den aktuelle plattformen foreligger:

1. Utvid `assetName()` og katalogen med **`reccut-voxcpm-win-x64.exe`** og/eller
   **`reccut-voxcpm-linux-x64`**, med `.sha256` og `.LICENSE.txt`. Andre arkitekturer
   forblir sperret; x64-emulering er ikke en test av Windows ARM64-støtte.
2. Behold samme modell- og referansefingeravtrykk. Installer motoren for appens
   faktiske versjon, ikke en hardkodet `v0.9.3` eller en annen utgivelses tagg.
   Ingen nedlasting fra status, lytting eller generering.
3. Gjør den lokale installasjonshjelperen dynamisk for plattformnavn og checksum.
   Installer først i en testmappe. Verifiser modellen én gang og gjenbruk den
   når neste språk eller en ny appmotor installeres.
4. Oppdater plattformtekstene i pakkelisten og AI Voices. Tilgjengelighet må følge
   faktisk støtte, med presise meldinger for feil arkitektur eller manglende motor.
5. Test de reelle nedlastings-/genereringsløypene: installasjon, avbryt/gjenoppta,
   feil kontrollsum, ufullstendig fil, protokollfeil, avbryt og fjerning av modell.
6. Kjør `npm test`, `npm run build`, begge Electron-UI-testene og ekte
   `test-voxcpm-installed.mjs` etter lokal installasjon. Kontroller at scriptet
   fortsatt bruker engelsk Warm og norsk Sensual med fremdrift og modellgjenbruk.
7. Prøv GUI-en: opprett AI-person, alle uttrykk, språkbytte, lagre/åpne prosjekt,
   lytt før installasjon, og avbryt en lang jobb. Test at gamle opptak er uendret,
   Kokoro/Piper fortsatt virker, og mikrofonopptak ikke trenger VoxCPM.

Ta med Windows-stier med mellomrom og `æøå`/andre Unicode-tegn, LF/CRLF, manglende
skrivetilgang, oppdatering fra gammel motor og appavslutning med modellen i minnet.
Test installert `.exe`/AppImage uten utviklerverktøy. Linux-GUI må testes i et
Linux-skrivebordsmiljø; en vellykket hodeløs CI-test er ikke hele GUI-kontrollen.

## 8. Byggeskript, CI og utgivelse

De nye `build-windows.ps1` og `build-linux.sh` skal kontrollere upstream-revisjon,
arkitektur, ExitCode ved alle steg, protokoll uten vekter, dynamiske avhengigheter
og relevante MIT-lisenser før SHA-256 skrives. Lokale patcher skal være lagret
og brukes likt i CI; ingen endring av upstream må skjules bak samme revisjon.

Utvid VoxCPM-jobben med egne runner-/plattformvalg og behold Mac-jobben. Unngå
at tre jobber overskriver samme referansevedlegg: publiser de ti felles WAV-ene,
deres kontrollsummer, manifest og lisens fra **én** jobb. Hver motorjobb legger
bare ved sin motor, kontrollsum og lisens. Modellvekter er ikke CI-artifacts.

CI kan bygge og sjekke `--protocol`/`--help` uten modellfiler. Ekte ytelsesmåling
hører til den dokumenterte maskinrapporten, ikke et tilfeldig GitHub-runner-tall.
Kjør gjerne byggene med `workflow_dispatch` og last ned artifacts før tagging;
tagg er ikke nødvendig for å teste at byggesystemet virker.

0.9.3 er dagens versjonsmål. Kontroller om den allerede er publisert når arbeidet
tas opp på Windows. Ikke erstatt publiserte 0.9.3-installasjonsfiler i stillhet.
Hvis plattformstøtten kommer senere, bruk neste avtalte versjon med
`npm version <x.y.z> --no-git-tag-version`, og kontroller About og utgivelsesvedlegg
som beskrevet i `AGENTS.md`. Denne planen oppretter eller publiserer ingen tagg.

## Leveranser og ferdigkriterier

- Byggeskript for Windows og Linux, med tilhørende CI-jobber og reproduksjonskommandoer.
- Benchmark-script og faste testtekster, med lagrede rapporter og per-plattformbeslutning
  under `docs/voxcpm-cpu/`. Store WAV-er og vekter blir i en ignorert resultatmappe.
- Dokumenterte maskiner, CPU-profiler, avhengigheter, målinger og eventuelle avvik
  fra de foreslåtte ytelseskriteriene. Ingen plattform merkes målt uten faktiske data.
- Plattformruting, katalog, installasjonshjelper og UI-tekster oppdatert bare for
  plattformene som består. App- og prosessavbryt må være verifisert på hvert OS.
- Testresultater fra kildebygg og installert app, med uendret Mac-funksjon og ingen
  modellvekter eller motorbinærer i installasjonsfilen.
- Oppdatert [brukerveiledning](AI-VOICES.md), [hjelp i appen](../src/renderer/help/articles.js),
  [motor-README](../native/voxcpm/README.md), hovedplan og aktuelle utgivelsesnotater.
- Faktiske utgivelsesvedlegg og nedlasting kontrolleres etter publisering. Ikke
  skriv at dette er bestått etter bare lokale eller mockede nedlastinger.

## Starttekst for neste arbeidsøkt på Windows

> Les AGENTS.md og docs/plan-voxcpm2-windows-linux.md. Gjennomfør fase 9 fra
> Windows x64, med native Windows-test først og Linux gjennom WSL2 som egen løype.
> Begynn med et separat CPU-bygg og prosesskontroll før appen åpnes for plattformen.
> Lag en reproducerbar benchmark, mål faktisk maskinvare og rapporter funnene.
> Behold modeller, innstillinger, syntetiske referanser og Mac-støtte. Ikke krev
> en ny generell lyttetestrunde; kjente uttalefeil er godtatt for første versjon.
> Ikke aktiver en plattform uten målinger og fungerende avbryt/opprydding.
> Fullfør app-/CI-integrasjon for plattformer som består, og dokumenter det som
> gjenstår for andre. Ikke publiser en ny utgivelse som del av denne planen.

Kildegrunnlaget for byggevalg er prosjektets låste
[llama.cpp-omni-revisjon](https://github.com/tc-mb/llama.cpp-omni/tree/d30f00feadb7ebce95bacd55b0d104e3ef501481)
og de offisielle Microsoft-/CMake-kildene lenket ved de relevante stegene.
