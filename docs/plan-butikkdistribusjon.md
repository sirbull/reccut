# Plan: Reccut i Microsoft Store og Mac App Store, med egen nettside

Skrevet 26. november 2026. Dette er en plan, ikke en implementasjon. Ingenting her
skal gjøres før programmet er ferdig. Lisens- og rettsspørsmålene bygger videre på
[COMMERCIAL-RELEASE-PLAN.md](COMMERCIAL-RELEASE-PLAN.md) og er ikke en juridisk
vurdering.

## Mål

- Kildekoden blir privat. Ingen del av distribusjonen er avhengig av GitHub-repoet.
- Reccut selges i Microsoft Store og Mac App Store, og kan også selges direkte fra
  egen nettside.
- Ingen funksjoner fjernes. Det som Mac App Store ikke tillater inne i appen,
  flyttes til et gratis hjelpeprogram, **Reccut Pro Tools**, som brukeren laster ned
  fra nettsiden.

## Kort oppsummert

| Kanal | Hva brukeren får | Hovedarbeid |
|---|---|---|
| Microsoft Store | Hele Reccut, som i dag | MSIX-bygg, oppdateringssjekken av, butikkoppføring |
| Direktesalg Mac (Developer ID) | Hele Reccut, som i dag | Ekte signering og notarisering, betaling og lisensnøkkel |
| Mac App Store | Reccut i sandkasse, pluss Pro Tools fra nettsiden | Sandkasse, filtilgang, hjelpeprogram, FFmpeg med LGPL |
| Direktesalg Windows/Linux | Hele Reccut, som i dag | Signering av Windows-filer |

## Kostnader (sjekkes igjen før start)

| Post | Omtrent | Merknad |
|---|---|---|
| Apple Developer Program | 99 USD/år | Trengs både for Mac App Store og for Developer ID. |
| Microsoft Store-konto | 0 kr | Gratis for privatpersoner og firma, men bare gjennom den nye påmeldingen. Dukker et gebyr opp, er det den gamle påmeldingen. |
| Domene | 100–200 kr/år | |
| Nettside og filer | 0 kr ved forventet trafikk | For eksempel Cloudflare Pages med R2, uten trafikkostnad. |
| Signering av Windows-filer utenfor Store | ca. 10 USD/mnd og oppover | Azure Artifact Signing eller et OV-sertifikat. Trengs ikke for Store-versjonen. |
| Butikkenes andel | 15 % | Apple Small Business Program; Microsoft for apper med Microsofts betaling. |
| Direktesalg | ca. 5 % | Paddle eller Lemon Squeezy er selger overfor kunden og tar seg av MVA. |
| Advokat | etter tilbud | GPL/LGPL i butikkene og en proprietær lisens for Reccut. |

Registrer ENK før salget starter, og avklar MVA og regnskap med en regnskapsfører.

---

## Fase 0: Programmet blir ferdig

Ingenting nedenfor påvirker vanlig funksjonsarbeid. To ting gjør likevel resten
billigere, og de kan følges allerede nå:

- **Nye eksterne programmer skal være egne prosesser.** Tastaturtillegget,
  VoxCPM-motoren og BRAW-dekoderen er allerede det. En ny funksjon som skal kjøre
  nedlastet kode, kan da flyttes til Pro Tools uten omskriving.
- **Prosjekter bør ikke være avhengige av å lese vilkårlige absolutte stier.** Se
  fase 5, punktet om filtilgang.

## Fase 1: Bort fra GitHub (gjelder alle kanaler)

### 1.1 Egen nettside og filvert

- Flytt nettsiden (`docs/`, i dag publisert av `pages.yml`) til eget domene.
- Lag en filvert for installasjonsfiler og tillegg, for eksempel `downloads.<domene>`.
- Lag en egen side der kildekoden til tredjepartskomponentene kan lastes ned
  (FFmpeg, inputmodulen, eSpeak NG). GPL og LGPL krever den, og den skal være
  gratis. Se [COMMERCIAL-RELEASE-PLAN.md](COMMERCIAL-RELEASE-PLAN.md).

### 1.2 Endringer i koden

| Fil | I dag | Endring |
|---|---|---|
| [src/main/updates.js](../src/main/updates.js) | Leser `package.json.repository` og bruker GitHubs API, `api.github.com/.../releases/latest`. Godtar bare nedlastinger fra `github.com`. | Leser `https://<domene>/releases/latest.json`, med versjon, nedlastingsadresse per plattform og SHA-256. Bare eget domene godtas. |
| [src/main/addonCatalog.json](../src/main/addonCatalog.json) | Adresser til `github.com/sirbull/reccut/releases/download/addons-v…` | Nye adresser på eget domene, med de samme kontrollsummene. Ikke bygg pakkene på nytt; flytt de eksakte filene. |
| [src/main/stock/index.js:5](../src/main/stock/index.js#L5) | Designkatalogen på `sirbull.github.io` | Eget domene. |
| `.github/workflows/*.yml` | Bygger og publiserer på GitHub | Se 1.3. |
| `README.md`, nettsiden, hjelpetekstene | Lenker til GitHub | Gå gjennom med `grep github`. Lenker til andres repoer kan bli. |

Nedlastinger fra andres repoer på GitHub (BtbN FFmpeg, uv, SAM 2, CorridorKey) kan
bli som de er, siden de ikke er avhengige av at Reccut-repoet er offentlig. Mac App
Store-versjonen får likevel ikke laste ned disse selv; se fase 4.

### 1.3 Bygging

Et privat GitHub-repo kan fortsatt brukes til kode og Actions hvis ønskelig. Det er
offentligheten som skal bort, ikke nødvendigvis GitHub. Alternativer:

- **Egne maskiner:** Windows-bygget lages på Windows, Mac-byggene på Macen. Gratis,
  men manuelt.
- **Selvhostet runner på egen Mac:** Gratis og automatisk. Unngår at Mac-minutter
  telles ti ganger i et privat repo.

Nøkler til signering og opplasting skal bare ligge på byggemaskinen eller som
hemmeligheter i CI, aldri i repoet.

### 1.4 Eldre versjoner som allerede er i bruk

Reccut 0.9.x spør GitHub om oppdateringer og laster tillegg derfra. 0.9.4 og eldre
bruker enkeltfiler fra appens egen utgivelse; se `AGENTS.md`. Blir repoet privat,
slutter dette å virke.

- **Anbefalt:** Eldre apper leser `repository` fra sin egen `package.json`, så de
  gamle utgivelsene må fortsatt ligge under `sirbull/reccut`. Behold derfor
  `sirbull/reccut` som et offentlig utgivelsesrepo med bare de gamle utgivelsene og
  en siste utgivelse som peker til den nye nettsiden. Koden flyttes til et nytt
  privat repo.
- Versjoner som allerede er gitt ut under MIT, forblir MIT. Bare ny kode blir lukket.

### 1.5 Ferdig når

- En ny versjon finner oppdateringer og tillegg uten å kontakte `github.com/sirbull`.
- En gammel 0.9.x-installasjon finner fortsatt sine tillegg og får beskjed om ny
  versjon.
- Testene for oppdateringer og tillegg (`test/updates.test.mjs`,
  `test/helpers/addon-package.mjs`) er oppdatert til det nye domenet.

## Fase 2: Felles grunnlag for butikkversjonene

Lag én modul, for eksempel `src/main/distribution.js`, som forteller resten av
appen hvilken kanal den kjører i:

```js
// 'direct' | 'msstore' | 'mas'
const channel = process.mas ? 'mas' : process.windowsStore ? 'msstore' : 'direct';
```

`process.mas` og `process.windowsStore` settes av Electron i de respektive byggene.
Dette styrer:

- **Oppdateringssjekken:** av i `msstore` og `mas`. Butikken oppdaterer appen.
  Menyvalget forsvinner, og Quick Search og agenten finner det ikke heller.
- **Nedlasting av kjørbar kode:** av i `mas`; se fase 4.
- **Betaling:** se fase 6.

En test sjekker at oppdateringssjekken ikke kan startes i butikkversjonene.

## Fase 3: Microsoft Store

Alt kan gjøres på Windows, fra VS Code og en nettleser. Ingen egen utviklerapp
trengs.

### 3.1 Konto og navn

1. Opprett en utviklerkonto i Partner Center (<https://partner.microsoft.com>). Bruk
   påmeldingen fra Microsoft Stores utviklerside, så blir den gratis.
2. Reserver navnet «Reccut».
3. Under *Product identity* står tre verdier som skal inn i bygget: `Identity Name`,
   `Publisher` (`CN=…`) og `Publisher display name`.

### 3.2 Bygget (MSIX)

Legg til `appx` som mål i electron-builder:

```json
"win": { "target": [{ "target": "nsis", "arch": ["x64"] }, { "target": "appx", "arch": ["x64"] }] },
"appx": {
  "identityName": "<fra Partner Center>",
  "publisher": "CN=<fra Partner Center>",
  "publisherDisplayName": "<fra Partner Center>",
  "displayName": "Reccut",
  "applicationId": "Reccut",
  "languages": ["en-US"],
  "capabilities": ["runFullTrust", "internetClient", "webcam", "microphone"]
}
```

`npm run dist:win` lager da også en `.appx`/`.msix`. Den skal ikke signeres selv;
Microsoft signerer den ved godkjenning. Til lokal testing kan pakken signeres med et
selvlaget testsertifikat.

### 3.3 Det som må sjekkes i en pakket app

En MSIX-app kjører som «full trust», så nesten alt virker som i dag. Kontroller
likevel følgende:

- **Skrivbare mapper:** Appen kan ikke skrive i installasjonsmappen. Skriving til
  `%AppData%` omdirigeres til pakkens egen mappe. Tillegg, modeller og hurtigbuffer
  må fungere, også for hjelpeprosessene (FFmpeg, tastaturtillegget, VoxCPM).
- **Avinstallering:** Pakkens data fjernes når appen avinstalleres. Det må stå i
  hjelpen at prosjekter i brukerens egne mapper blir liggende.
- **Tastaturtillegget og den globale musesporingen** virker i en pakket app.
- **Tillegg som lastes ned og kjøres** er tillatt så lenge de er beskrevet i
  butikkoppføringen og ikke endrer appens formål (Store Policy 10.2.2).
- **GPL-komponenter** (FFmpeg, eSpeak NG) er tillatt i Microsoft Store, men
  kildekoden må finnes på nettsiden (fase 1.1).
- **Prøv pakken med Windows App Certification Kit** (WACK), som følger med Windows
  SDK, før innsending.

### 3.4 Butikkoppføring

På engelsk, som resten av nettsiden:

- Beskrivelse, skjermbilder (minst ett, gjerne 1920×1080), ikon.
- Nettside for personvern (påkrevd, fordi appen bruker nett, kamera og mikrofon).
  Skriv det som stemmer: at ingenting sendes ut av maskinen med mindre brukeren
  selv slår på AI-tjenester eller MCP.
- Aldersgrense (IARC-skjema i Partner Center).
- Pris, prøveperiode og markeder.

### 3.5 Innsending

Last opp `.msix` i Partner Center og send inn. Sertifiseringen tar vanligvis noen
virkedager. Senere versjoner kan sendes inn fra kommandolinjen med Microsoft Store
Developer CLI (`msstore`), også fra CI.

**Alternativ:** Store godtar også den vanlige NSIS-installasjonsfilen som en
Win32-app. Da må den signeres med et betalt sertifikat, ligge på en fast
https-adresse, og appen må oppdatere seg selv. MSIX er billigere og enklere, så det
er anbefalt.

## Fase 4: Reccut Pro Tools (hjelpeprogrammet for Mac)

### 4.1 Hvorfor

Mac App Store-regel 2.5.2 forbyr at appen laster ned eller kjører kode som ikke var
med i den godkjente pakken. Regel 2.4.5 sier det samme om kode og ressurser som
endrer funksjonaliteten. Dessuten regnes GPL som uforenlig med App Store-vilkårene.
Det rammer i dag:

| Funksjon | Kode | Problem |
|---|---|---|
| Tastaturtillegget | [src/main/keystrokes.js](../src/main/keystrokes.js), `native/keystrokes` | Lastes ned og kjøres |
| VoxCPM2 | [src/main/voxcpm.js](../src/main/voxcpm.js), `voxcpmProcess.js` | Motoren lastes ned og kjøres |
| Uttale til AI-stemmer (eSpeak NG via phonemizer.js) | [src/main/tts.js](../src/main/tts.js), [src/worker/tts.js](../src/worker/tts.js) | Kode (JS/WASM) lastes ned og kjøres, og er GPLv3 |
| CorridorKey og Roto | [src/main/corridorkey.js](../src/main/corridorkey.js), [src/main/roto.js](../src/main/roto.js) | Laster ned uv, Python og pakker |
| Egne prosessorer | [src/main/extensions.js](../src/main/extensions.js) | Kjører programmer brukeren velger, utenfor sandkassen |
| Verktøyservere (MCP) | [src/main/mcpClients.js](../src/main/mcpClients.js) | Starter `npx`/`uvx` |
| FFmpeg med x264/x265 | [scripts/fetch-ffmpeg.mjs](../scripts/fetch-ffmpeg.mjs) | GPL |

Modellvekter (Whisper, BiRefNet, Kokoro, VoxCPM-GGUF) er data. De kan fortsatt lastes
ned av selve appen.

### 4.2 Hvordan

Pro Tools er et eget, lite program som:

- er signert med Developer ID og notarisert, men ligger utenfor App Store og utenfor
  sandkassen;
- er gratis og lastes ned fra nettsiden som `.pkg` eller `.dmg`;
- kjører i bakgrunnen (menylinjeikon eller `LaunchAgent`) og bare lytter på
  `127.0.0.1`;
- tar over jobbene i tabellen over, i samme form som i dag.

**Oppkobling:** Begge programmene signeres av samme Team ID og får den samme App
Group (`<TEAMID>.no.sirbull.reccut`). Pro Tools skriver port og et tilfeldig token
til gruppens felles mappe. Reccut i sandkassen leser dem derfra. Arbeidsfiler, som
lyd fra VoxCPM og video fra CorridorKey, skrives til den samme mappen. Reccut har
tilgang dit uten å spørre brukeren.

**Protokoll:** Hver jobb i dag er en prosess med stdio. Pro Tools gjør det samme og
sender stdin, stdout og avbryt over tilkoblingen. Reccut får en felles funksjon,
for eksempel `runTool(name, args)`, som starter prosessen lokalt i `direct` og
`msstore`, og via Pro Tools i `mas`. Resten av koden merker ingen forskjell.

**Regler som fortsatt gjelder:**

- Filteret i tastaturtillegget blir der det er. Bare snarveier når Reccut, og
  tastetrykk sendes aldri til AI-verktøyene. Samtykkene lagres fortsatt i Reccut.
- Innhold og nøkler fra MCP-servere går bare til sin egen server.
- Pro Tools godtar bare tilkoblinger med riktig token og fra `127.0.0.1`, og avviser
  forespørsler med fremmed `Origin`, som MCP-serveren gjør.
- Pro Tools laster ned tillegg med de samme låste kontrollsummene fra
  `addonCatalog.json`.

**Uttale:** phonemizer.js trenger en JavaScript-motor. Enten blir Pro Tools et
Node-program (Node SEA), eller uttalen skrives om slik at den kjører i et lite eget
program. Valget tas ved oppstart av fasen.

### 4.3 I appen

- Funksjoner som trenger Pro Tools, er synlige også uten den. De viser «Requires
  Reccut Pro Tools» og en knapp som åpner nedlastingssiden i nettleseren. Appen
  laster aldri ned eller installerer Pro Tools selv.
- Reccut må fungere alene: opptak, redigering, effekter, undertekster, bakgrunnsfjerning,
  Kokoro- og Piper-stemmer uten uttaletillegget der det går, og eksport.
- Pro Tools dokumenteres i håndboken, på Docs-siden og i Quick Search, og agenten
  kan se om den er installert. Dette følger reglene i `AGENTS.md`.

### 4.4 Ferdig når

- Alle funksjonene i 4.1 virker i `mas`-bygget når Pro Tools er installert.
- Uten Pro Tools viser de samme funksjonene en forklaring, ikke en feilmelding.
- En test sjekker at `mas`-bygget aldri kaller `stagePackage` i
  [src/main/addonPackages.js](../src/main/addonPackages.js) eller `spawn` på noe utenfor app-pakken.

## Fase 5: Mac App Store-bygget

Dette må gjøres på Macen: Xcode (for kommandolinjeverktøyene og sertifikatene),
electron-builder med målet `mas`, og Apples Transporter-app for opplasting.

### 5.1 Sertifikater og konto

- Apple Developer Program.
- Sertifikatene *Apple Distribution* og *Mac Installer Distribution* til App
  Store-bygget, og *Developer ID Application* og *Developer ID Installer* til
  direktesalg og Pro Tools.
- En provisjoneringsprofil for `no.sirbull.reccut` med App Group.
- Opprett appen i App Store Connect.

### 5.2 Bygget

- Nytt mål `mas` i `package.json`, med egne entitlement-filer: `entitlements.mas.plist`
  og `entitlements.mas.inherit.plist`.
- Entitlements: `app-sandbox`, `device.camera`, `device.audio-input`,
  `network.client`, `network.server` (for MCP-serveren), `files.user-selected.read-write`,
  `files.bookmarks.app-scope`, og App Group.
- Fjern `disable-library-validation` fra [build/entitlements.mac.plist](../build/entitlements.mac.plist)
  så snart appen signeres med Team ID. Det står også i en kommentar der.
- Medfølgende hjelpeprogrammer (FFmpeg, BRAW-dekoderen) signeres med
  `inherit`-entitlement.

### 5.3 FFmpeg

App Store-bygget får en FFmpeg med LGPL, uten `--enable-gpl`, og med VideoToolbox
for H.264 og HEVC. `src/main/ffmpeg.js` og `src/worker/export.js` velger koder etter
hva som finnes, og bruker x264/x265 via Pro Tools når den er installert. Det betyr
en felles koder-velger med egne kvalitetsinnstillinger per koder; se avsnittet om
FFmpeg uten GPL i [COMMERCIAL-RELEASE-PLAN.md](COMMERCIAL-RELEASE-PLAN.md). Dette er den
største tekniske jobben i planen.

### 5.4 Filtilgang i sandkassen

En app i sandkasse får bare lese filer brukeren har valgt eller dratt inn, og
mister tilgangen ved omstart. Reccut lagrer i dag absolutte stier i prosjektene.

- Lagre et *security-scoped bookmark* for hvert medium, hver prosjektmappe og
  opptaksmappen når brukeren velger dem, og åpne dem ved oppstart.
- Opptak lagres i en mappe brukeren har valgt, eller i appens egen mappe.
- Prosjekter som peker til filer uten bookmark, viser «Locate media» i stedet for å
  feile.

### 5.5 Andre ting som må sjekkes

- Skjermopptak, kamera og mikrofon i sandkassen.
- Den globale musesporingen og zoomtasten i [src/main/input.js](../src/main/input.js):
  bare lytting er lov i sandkassen, med tillatelsen *Input Monitoring*.
  Tilgjengelighets-API (*Accessibility*) er ikke lov. Flyttes til Pro Tools hvis det ikke
  virker.
- Systemsnarveiene i [src/main/systemShortcuts.js](../src/main/systemShortcuts.js)
  leser systeminnstillinger, noe sandkassen kan stoppe.
- MCP-broen [src/main/mcp-stdio.cjs](../src/main/mcp-stdio.cjs) startes av andre
  AI-apper fra app-pakken.

### 5.6 Innsending

- Last opp `.pkg` med Transporter.
- I notatet til App Review: forklar at Pro Tools er valgfritt, gratis, ikke
  installeres av appen, og hva appen kan uten det. Legg ved en demokonto eller et
  prosjekt.
- Send inn en tidlig, enkel versjon for å få svar på om oppsettet med Pro Tools
  godtas, før hele jobben gjøres. App Review gjør en skjønnsvurdering.

## Fase 6: Betaling og lisens

- **Microsoft Store:** fast pris eller prøveperiode i Partner Center. 15 % til
  Microsoft.
- **Mac App Store:** fast pris eller kjøp i appen. 15 % til Apple. Funksjoner i
  Pro Tools kan ikke låses opp med betaling utenfor Apple, så Pro Tools er gratis
  og selve Reccut er det man betaler for.
- **Direktesalg:** Paddle eller Lemon Squeezy med lisensnøkkel. Reccut kontrollerer
  nøkkelen lokalt og ved sjeldne nettsjekker. Butikkversjonene trenger ikke nøkkel.
- Proprietær lisens for Reccut, med unntak for tredjepartskomponentene. Se fase 4 i
  [COMMERCIAL-RELEASE-PLAN.md](COMMERCIAL-RELEASE-PLAN.md).

## Fase 7: Gjør koden privat

Til slutt, når fase 1 virker:

1. Opprett et nytt privat repo for koden.
2. Gjør `sirbull/reccut` om til utgivelsesrepo (fase 1.4) og fjern koden derfra i en
   ny commit. Historikken er fortsatt MIT.
3. Sjekk at ingen hemmeligheter ligger i historikken til det offentlige repoet.

## Rekkefølge og omfang

| Fase | Avhenger av | Omfang |
|---|---|---|
| 0. Ferdig program | | |
| 1. Bort fra GitHub | 0 | Noen dager |
| 2. Kanal-modul | 1 | Liten |
| 3. Microsoft Store | 2 | Omtrent en uke, inkludert testing og godkjenning |
| 6. Betaling og direktesalg | 2 | Omtrent en uke |
| 4. Pro Tools | 2 | Flere uker |
| 5. Mac App Store | 4 | Flere uker, mest på grunn av FFmpeg og filtilgang |
| 7. Privat kode | 1 | Liten |

Anbefalt start etter fase 0: 1, 2, 3, deretter direktesalg på Mac. Mac App Store sist.

## Åpne spørsmål

- Godtar App Review oppsettet med Pro Tools? Avklares med en tidlig innsending.
- Pro Tools som Node-program eller eget lite program (fase 4.2)?
- Er FFmpeg med LGPL og VideoToolbox godt nok som standard i App Store-versjonen?
- Holder LGPL-kravene for inputmodulen i en sandkasse-app, eller må den også ut?
  Spør advokat.
- Pris, prøveperiode og om oppgraderinger skal koste noe.
