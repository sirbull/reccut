# Keying, bakgrunnsfjerning og AI i Reccut

## Det som er implementert

I Effects-fanen på et video-, bilde- eller opptaksklipp finnes **Keying & effect stack**. På opptak velger du kamera eller skjerm før du legger til en effekt.

- **Remove solid background** leser kildebildet ved spillhodet, finner den vanligste kantfargen og legger på en fargekeyer.
- **Remove static background** leser ni kildebilder fra klippet. En median per piksel estimerer en bakgrunnsreferanse, og en differansekeyer sammenligner hvert bilde med den.
- **Color key** kan også legges til manuelt, med valgfri bakgrunnsfarge.
- **Background reference key** lar deg fange et rent bakgrunnsbilde ved spillhodet. Motivet må være ute av bildet når referansen tas.
- **Luma key** fjerner mørke områder, eller lyse områder med Invert matte.

**Advanced** åpner spillfjerning for fargekeyeren, matte black/white, krymping eller utvidelse av kanten, feather, invertering og mattevisning. Positiv kantverdi krymper forgrunnen; negativ utvider. Husk å bytte fra mattevisning til Composite før eksport: visningen er del av effekten.

Effektene kjøres ovenfra og ned. Du kan legge til samme effekt flere ganger, slå av, duplisere, fjerne og flytte hver instans. Blur, Saturation, Contrast og Opacity kan også legges i denne stakken. Stakken kjøres før klippets eksisterende fargekorrigering og øvrige klippeffekter. Masker kan brukes etterpå. Stack-parametrene er foreløpig statiske; de eksisterende klippeffektene beholder nøkkelbildestøtten sin.

Forhåndsvisning og eksport bruker samme effektkode. WebGL2 brukes når det er tilgjengelig; CPU-reserven gir samme matteberegning, men er tregere på store bilder. Keyeren bruker ingen tidsbasert utjevning som kan etterlate spor fra forrige bilde. Det er ikke en garanti for perfekte kanter, hår eller bevegelsesuskarphet.

Bakgrunnsanalyse krever fast kamera, stabil belysning og at bakgrunnen er synlig i de fleste prøvene ved hver piksel. En person som står stille gjennom hele opptaket kan bli del av referansen. Et rent referansebilde gir bedre kontroll. Dette er ikke semantisk personsegmentering, kamera-sporing eller AI-basert rekonstruksjon av forgrunnsfarger. Referansen lagres i prosjektet og følger med i prosjektpakking.

## Eksterne prosessorer og CorridorKey

Under **Settings → AI & Plugins** kan du installere en lokal prosessor fra en JSON-manifest. Et eksempel finnes i [examples/local-processor.json](examples/local-processor.json). Bytt executable og argumentene til din lokalt installerte adapter. Manifesten gjennomgås i grensesnittet før installasjon.

En prosessor er et separat program, ikke JavaScript som lastes fra prosjektfilen. Reccut starter programmet uten et shell, med hvert argument som et separat argument. `{input}` erstattes med kildefilen, og `{output}` med en ny resultatfil i Reccut/Processed. Prosessorer kjører med brukerens rettigheter, så installer bare verktøy du stoler på.

Kontrakten er:

1. Les hele kildefilen fra `{input}` og skriv én spillbar video til `{output}`.
2. Behold kildevarighet, bildefrekvens og bildetidspunkter. Reccut kontrollerer varigheten før resultatet brukes, men kan ikke bevise at en ekstern prosessor har bevart hvert bildetidspunkt.
3. For keying må resultatet ha alfakanal, for eksempel ProRes 4444 MOV eller VP9 med alfa i WebM. En vanlig H.264 MP4 har ikke alfa.
4. Avslutt med status 0 ved suksess, og skriv feilmeldinger til stderr ved feil.

Velg prosessoren under **Effects → External processing** på et vanlig videoklipp. Resultatet brukes bare på det klippet. Originalmediet beholdes i biblioteket, original lyd beholdes, og kildebyttet kan angres. Bakgrunnsoppgaven kan avbrytes. Ved feil eller endret kilde underveis blir ikke klippet byttet automatisk.

Det er foreløpig **ingen native OFX-/Adobe-host eller ferdig CorridorKey-adapter**. Installasjon av en OFX-bundle er derfor ikke nok. Den kjøpte CorridorKey-appen kan brukes separat; importer deretter en video med alfa. Et lokalt CLI-verktøy eller den åpne modellen kan kobles til gjennom en adapter som oppfyller kontrakten over. Modeller, Python/GPU-miljø og eventuelle lisenser installeres separat; ingen modeller er distribuert med Reccut.

Kontroller versjonen du bruker mot [CorridorKeys offisielle dokumentasjon](https://help.corridorkey.com/docs/getting-started/), [runtime-prosjektets CLI-dokumentasjon](https://github.com/alexandremendoncaalvaro/CorridorKey-Runtime#cli-usage) og [modellprosjektet](https://github.com/nikopueringer/CorridorKey2.0). Disse har forskjellige inndata- og utdataopplegg. Eksempelmanifesten er et adapterformat, ikke en bekreftelse på at en bestemt CorridorKey-versjon er testet med Reccut.

## AI-chat med egen API-nøkkel

Åpne **Settings → AI & Plugins**, velg OpenAI-compatible eller Anthropic Messages, og skriv API-baseadresse, nøyaktig modell-ID og egen nøkkel. Lokale OpenAI-kompatible servere kan bruke HTTP på localhost uten nøkkel. Andre endepunkter krever HTTPS og nøkkel. Lagre og åpne **AI Chat** øverst i programmet.

Nøkler krypteres med operativsystemets safeStorage og lagres separat fra prosjektet. Hvis sikker lagring ikke finnes, beholdes nøkkelen bare i minnet til appen avsluttes. Nøkler lagres ikke i localStorage, prosjektfilen eller en prosjektpakke. Bytte av leverandør eller endepunkt fjerner tidligere nøkkel.

Chatten sender meldingene og tekstmetadata om opptil 100 klipp, med valgte klipp først. Navn, tidsplassering, enkelte egenskaper og underteksttekst kan bli sendt. Videofiler, lydfiler, bakgrunnsreferanser og lokale filstier lastes ikke opp. Chatten kan derfor ikke vurdere bilde- eller lydkvaliteten i materialet. Leverandørens vanlige API-priser gjelder.

Modellen kan foreslå navn, eksponering, kontrast, metning, temperatur, opacity, volum, blur, fades og nye stack-effekter. Forslag valideres mot tillatte operasjoner og vises før **Apply**. Hele forslaget brukes som ett angresteg. Ugyldige eller foreldede forslag brukes ikke. Modellen kan ikke kjøre kode, starte prosessorer eller endre filer. Dette er en første versjon av redigeringsassistenten, ikke en multimodal redigeringsagent.

API-protokollene bygger på [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) og [Anthropic Messages](https://platform.claude.com/docs/en/api/messages). Nettverksdelen er testet med simulerte svar; faktisk API-bruk krever brukerens nøkkel og modelltilgang.

## Prosjektpakking

Claude hadde allerede lagt til **Trim media to the parts that are used** i Package Project. Arbeidet er videreført med tester og feilrettinger: overgangsreserver beholdes selv med null ekstra handles, ulike kutt med samme start forveksles ikke, lyd utenfor opptaksmappen følger med, og ufullstendige pakker ryddes bort ved feil eller avbrudd.

Vanlige video- og lydfiler kan kuttes. Opptaksmapper og stillbilder kopieres hele. Kutting omkoder med høy kvalitet og er ikke en bit-identisk kopi av originalen. Vist størrelse er et anslag; en omkodet fil kan bli større enn forventet. Originalprosjektet endres ikke.

## Verifisering

- `npm test`: modell-, sikkerhets-, prosessor- og FFmpeg-integrasjonstester.
- `npm run build`: renderer, eksportarbeider og transkripsjonsarbeider.
- `npm run test:render`: ekte WebGL2 og CPU-rendering i Electron, effektstabling, sammensetting over et annet spor, kildelesing, inspektørhandlinger og AI-forslag med angre.

Syntetiske testbilder og korte genererte videoer brukes til funksjonskontroll. Hår, glass og komplekse ekte opptak er ikke kvalitetsvalidert, og ingen kjøpt CorridorKey-installasjon eller ekstern API-konto er brukt i testene.
