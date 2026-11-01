# Keying, bakgrunnsfjerning og AI i Reccut

## Det som er implementert

I Effects-fanen på et video-, bilde- eller opptaksklipp finnes **Keying & effect stack**. På opptak velger du kamera eller skjerm før du legger til en effekt.

- **Remove solid background** leser kildebildet ved spillhodet, finner den vanligste kantfargen og legger på en fargekeyer.
- **Remove static background** leser ni kildebilder fra klippet. En median per piksel estimerer en bakgrunnsreferanse, og en differansekeyer sammenligner hvert bilde med den.
- **Color key** kan også legges til manuelt, med valgfri bakgrunnsfarge.
- **Background reference key** lar deg fange et rent bakgrunnsbilde ved spillhodet. Motivet må være ute av bildet når referansen tas.
- **Luma key** fjerner mørke områder, eller lyse områder med Invert matte.

**Advanced** har nå også **Recover fine detail** for delvis gjennomsiktige hårstrå og fine kanter, **Preserve source shadows** for skygger i opptaket, **Shadow color range** for skyggens fargetoleranse, **Recover edge color** for bakgrunnsfarge i kantpiksler og **Matte gamma** for mellomtonene i alfamasken. De nye recovery-kontrollene starter på 0, slik at eksisterende prosjekter beholder resultatet. Gamma starter på 1. Skyggebevaring trenger en lys, uskygget Screen color-prøve. Motiver med samme farge som bakgrunnen kan kreve en maske.

**Advanced** åpner ellers spillfjerning for fargekeyeren, matte black/white, krymping eller utvidelse av kanten, feather, invertering og mattevisning. Positiv kantverdi krymper forgrunnen; negativ utvider. Husk å bytte fra mattevisning til Composite før eksport: visningen er del av effekten.

Effektene kjøres ovenfra og ned. Du kan legge til samme effekt flere ganger, slå av, duplisere, fjerne og flytte hver instans. Blur, Saturation, Contrast og Opacity kan også legges i denne stakken. Stakken kjøres før klippets eksisterende fargekorrigering og øvrige klippeffekter. Masker kan brukes etterpå. Stack-parametrene er foreløpig statiske; de eksisterende klippeffektene beholder nøkkelbildestøtten sin.

**Drop Shadow** bruker den synlige formen etter keying, beskjæring og masker. Vignett og fargejusteringer bevarer gjennomsiktigheten, og lagene under vises gjennom de fjernede områdene.

Bruk **×** ved effektnavnet for å slette en video- eller lydeffekt. Justerte effekter viser en advarsel med **Don’t show this again**. Valget lagres i appinnstillingene og kan tilbakestilles under **Settings → General → Projects → Warn before removing adjusted effects**. Sletting med alle innstillinger og nøkkelbilder kan angres i ett steg.

Forhåndsvisning og eksport bruker samme effektkode. WebGL2 brukes når det er tilgjengelig; CPU-reserven gir samme matteberegning, men er tregere på store bilder. Keyeren bruker ingen tidsbasert utjevning som kan etterlate spor fra forrige bilde. Det er ikke en garanti for perfekte kanter, hår eller bevegelsesuskarphet.

Bakgrunnsanalyse krever fast kamera, stabil belysning og at bakgrunnen er synlig i de fleste prøvene ved hver piksel. En person som står stille gjennom hele opptaket kan bli del av referansen. Et rent referansebilde gir bedre kontroll. Dette er ikke semantisk personsegmentering, kamera-sporing eller AI-basert rekonstruksjon av forgrunnsfarger. Referansen lagres i prosjektet og følger med i prosjektpakking.

## Eksterne prosessorer og CorridorKey

Under **Settings → Plugins** kan du installere en lokal prosessor fra en JSON-manifest. Et eksempel finnes i [examples/local-processor.json](examples/local-processor.json). Bytt executable og argumentene til din lokalt installerte adapter. Manifesten gjennomgås i grensesnittet før installasjon.

En prosessor er et separat program, ikke JavaScript som lastes fra prosjektfilen. Reccut starter programmet uten et shell, med hvert argument som et separat argument. `{input}` erstattes med kildefilen, og `{output}` med en ny resultatfil i Reccut/Processed. Prosessorer kjører med brukerens rettigheter, så installer bare verktøy du stoler på.

Kontrakten er:

1. Les hele kildefilen fra `{input}` og skriv én spillbar video til `{output}`.
2. Behold kildevarighet, bildefrekvens og bildetidspunkter. Reccut kontrollerer varigheten før resultatet brukes, men kan ikke bevise at en ekstern prosessor har bevart hvert bildetidspunkt.
3. For keying må resultatet ha alfakanal, for eksempel ProRes 4444 MOV eller VP9 med alfa i WebM. En vanlig H.264 MP4 har ikke alfa.
4. Avslutt med status 0 ved suksess, og skriv feilmeldinger til stderr ved feil.

Velg prosessoren under **Effects → External processing** på et vanlig videoklipp. Resultatet brukes bare på det klippet. Originalmediet beholdes i biblioteket, original lyd beholdes, og kildebyttet kan angres. Bakgrunnsoppgaven kan avbrytes. Ved feil eller endret kilde underveis blir ikke klippet byttet automatisk.

Det er foreløpig **ingen native OFX-/Adobe-host eller ferdig CorridorKey-adapter**. Installasjon av en OFX-bundle er derfor ikke nok. Den kjøpte CorridorKey-appen kan brukes separat; importer deretter en video med alfa. Et lokalt CLI-verktøy eller den åpne modellen kan kobles til gjennom en adapter som oppfyller kontrakten over. Modeller, Python/GPU-miljø og eventuelle lisenser installeres separat; ingen modeller er distribuert med Reccut.

Kontroller versjonen du bruker mot [CorridorKeys offisielle dokumentasjon](https://help.corridorkey.com/docs/getting-started/), [runtime-prosjektets CLI-dokumentasjon](https://github.com/alexandremendoncaalvaro/CorridorKey-Runtime#cli-usage) og [modellprosjektet](https://github.com/nikopueringer/CorridorKey2.0). Disse har forskjellige inndata- og utdataopplegg. Eksempelmanifesten er et adapterformat, ikke en bekreftelse på at en bestemt CorridorKey-versjon er testet med Reccut.

## Redigeringsagenten

### Modeller og leverandører

Under **Settings → AI** velger du OpenAI, Anthropic Claude, Google Gemini, Mistral, OpenRouter, Groq, xAI eller DeepSeek. Du kan også velge en lokal server: Ollama, LM Studio eller llama.cpp. **Other server or gateway** tar alle OpenAI- eller Anthropic-kompatible adresser, for eksempel vLLM, Jan, LocalAI, LiteLLM eller en maskin i det lokale nettet. **Fetch models** henter modell-ID-ene fra serveren. Modellen må støtte verktøykall. **Model can see images** slås av for modeller uten bildeinndata.

Alle unntatt Anthropic bruker Chat Completions-protokollen. HTTP er bare tillatt mot denne maskinen og private nettverksadresser. Andre adresser krever HTTPS. Lokale servere trenger ingen nøkkel. Nøkler krypteres med safeStorage og ligger bare i hovedprosessen, aldri i prosjektet eller i grensesnittet.

### Slik virker den

Agenten er en løkke: modellen får et verktøyregister, kaller verktøy, får svarene og fortsetter til den svarer uten verktøykall, men høyst 40 steg.

- **Verktøyregisteret** ligger i [src/shared/aiEdits.js](../src/shared/aiEdits.js). Hvert verktøy har navn, beskrivelse, JSON-skjema og koden som gjør endringen. Det er altså én kilde for dokumentasjon, validering og handling. Redigeringen bruker de samme funksjonene som tidslinjen (ops.js), og hvert verktøykall blir ett angresteg.
- **Lese:** `get_timeline`, `list_media`.
- **Redigere:** `add_media_to_timeline`, `split_clips`, `delete_clips`, `trim_clip`, `move_clip`, `add_title`, `add_captions`, `set_clip_properties` (mange klipp i ett angresteg, med alle fargekontroller og fargehjulene), `add_video_effect`, `add_transition`.
- **Kjøretid** ([src/renderer/agent.js](../src/renderer/agent.js)):
  - `transcribe_speech` kjører Whisper lokalt på lyden på tidslinjen og gir tale med tidskoder uten å endre undertekstene. Resultatet gjenbrukes til lyden endres.
  - `analyze_look` måler lysstyrke, svart- og hvitpunkt, klipping, metning og fargestikk i kildebildene til hvert klipp, og i vedlagte referansebilder.
  - `preview_frames` rendrer tidslinjen med samme motor som eksporten og måler det ferdig korrigerte bildet. Bildet sendes også til modellen når den kan se bilder.
  - `search_help` søker i hjelpeartiklene, og `show_help` åpner en artikkel for brukeren.
  - `find_commands` og `run_command` gir tilgang til alle kommandoene i appen, fra samme register som menyene, hurtigtastene og Find Command ([src/renderer/registry.js](../src/renderer/registry.js)). Nye kommandoer blir dermed automatisk tilgjengelige for agenten, med meny, hurtigtast og beskrivelse.
  - `select` velger klipp og flytter spillhodet, slik brukeren gjør før en kommando.
  - `get_settings` og `change_settings` leser og endrer innstillingene, opptaksinnstillingene og hurtigtastene.
- **Alle egenskaper:** `get_clip` viser alt i inspektøren. `set_clip_properties` og `set_project_settings` godtar alle enkle verdier som finnes fra før, med samme type (`checkPatch`). Nye egenskaper i inspektøren blir derfor tilgjengelige uten egen kode. Kjente verdier har i tillegg faste grenser.
  - `import_media` importerer filer brukeren har oppgitt.
- **Håndboken** er systeminstruksjonen i agent.js. Den forklarer den magnetiske tidslinjen, forskjellen på kildetid og tidslinjetid, spor, undertekster, opptak og lydnivåer, og gir en arbeidsflyt for automatisk redigering. Detaljer slås opp med `search_help`, slik at hjelpen og agenten ikke sier forskjellige ting.
- **Hovedprosessen** ([src/main/extensions.js](../src/main/extensions.js)) oversetter den nøytrale meldingshistorikken til Anthropic Messages eller Chat Completions, med verktøy og bilder. Chat Completions tar bare imot bilder i brukermeldinger, så de legges etter verktøysvarene.

Agenten redigerer uten å spørre ved hvert kutt. **Undo this request** angrer alle endringene fra siste forespørsel, så lenge prosjektet ikke er endret etterpå. **Stop** avbryter mellom to steg.

### Råmateriale: talking head og skjermopptak

Agenten jobber som en redaktør med en assistent som har logget materialet: først tekst og tall, bilder bare der det trengs.

- **Tale:** Whisper kjører med ordtider (modellene `whisper-*_timestamped`). Pauser måles fra lydnivået ([src/shared/speech.js](../src/shared/speech.js)). Whisper strekker ofte siste ord inn i en pause, så ordkantene flyttes til pausene. Undertekstene fra «Generate captions» bruker de samme ordtidene og blir dermed også mer presise. `transcribe_speech` kan transkribere ett medieklipp i kildetid før det ligger på tidslinjen.
- **Skjerm:** `inspect_media` gir sceneskift (ffmpeg, nedskalert til 160 px og 4 bilder per sekund, så også lange opptak går raskt), hendelsesloggen fra Reccut-opptak (klikk, hurtigtaster og zoom, aldri vanlig skriving) og et oversiktsark med bilder og tidskoder. Agenten ser først på hele filen og deretter på kortere utsnitt.
- **Bygging:** `build_sequence` legger hele planen i ett angresteg. Gode tagninger legges i hovedsporet. Skjermklipp kobles til det segmentet der de forklares, med forskyvning og eventuell økt hastighet. Titler plasseres på samme måte. Kutt som havner i en målt pause, får beholde opptil 0,15 sekunder stillhet, slik at overgangene høres naturlige ut.
- **Egne titler:** `create_title_template` lager animerte maler i det samme formatet som de innebygde (.reccut-title). Formatbeskrivelsen og et eksempel hentes fra koden. Malene lagres i prosjektet og vises i Titles-biblioteket.

### Fortelling, grafikk, KI-video og programtillegg

- **Historien:** `get_story` og `set_story` lagrer brief, papirklipp, notater per medieklipp og vedlagte dokumenter i prosjektet. Dokumenter lagt ved i chatten (PDF, Typeloom, Word, Final Draft, Fountain, RTF og tekst) leses i hovedprosessen og lagres i historien. PDF leses med pdf.js: linjer og avstander rekonstrueres fra tekstposisjonene, slik at rollenavn og replikkblokker i et manus holdes adskilt. Skannede PDF-er uten tekst gir en tydelig feilmelding. Typeloom-prosjekter (`.typeloom`, en zip med `binder.json` og TipTap-dokumenter) skrives om til manus i Fountain-stil. Binderrekkefølgen, mapper som overskrifter, korktavle-sammendrag som `= `-linjer og manuselementene beholdes, mens dokumenter i papirkurven og researchfiler utelates. Mangler manus eller brief, skal agenten spørre før den klipper, eller foreslå en struktur.
- **Manus mot tagninger:** `match_script` ([src/shared/speech.js](../src/shared/speech.js)) sammenstiller hver replikk med ordene i transkripsjonene, som ScriptSync. I et filmmanus matches bare replikkene, med rollen som sier dem. Et manus regnes som filmmanus når et rollenavn går igjen eller det finnes sceneoverskrifter. I et voiceover-manus matches alle setninger. Den finner alle tagninger, også flere i samme fil, med samsvar og antall nøl. Sceneoverskrifter, rollenavn og regi hoppes over.
- **Animert grafikk:** `create_motion_graphic` lar agenten skrive en tegnefunksjon for canvas. Den kjøres i et skjult vindu i en egen, tom økt uten nettverk, filer og Node, med tidsgrense per bilde ([src/main/graphics.js](../src/main/graphics.js)). Bildene kodes til H.264, eller til ProRes 4444 med alfakanal for grafikk over video. Klippet importeres, og agenten får fire forhåndsbilder og eventuelle kodefeil tilbake.
- **KI-video:** Higgsfield følger med som innebygd programtillegg (**Higgsfield AI Video**). Det står øverst i Plugins-listen, kan ikke fjernes, settes opp i Settings → Plugins og har et eget verktøyvindu med beskrivelse, lengde, startbilde fra spillhodet og plassering ved spillhodet. Agentens `generate_video` bruker samme API. Nøkkel-ID og hemmelighet lagres kryptert. Startbilder lastes opp til en forhåndssignert adresse uten nøkkelen. Forespørselen sendes med Idempotency-Key, og status sjekkes med økende ventetid til den er ferdig. Prisen vises og må godkjennes før hver generering (kan slås av). Modellene velges med endpoint-ID i innstillingene. Det er testet med simulert API, ikke med en ekte konto.
- **Programtillegg:** `propose_processor` lager et programtillegg: et FFmpeg-kall eller et Python-skript med eget ikon (SVG) og innstillinger (tall, valg eller av/på), som settes inn i argumentene som `{param:id}`. Utkastet vises i chatten med hele skriptet, og ingenting installeres eller kjøres før brukeren velger **Install processor**. Deretter åpnes det som et verktøyvindu.
  - **Plugins**-knappen i verktøylinjen lister installerte programtillegg. Hvert åpnes i et lite, flyttbart vindu over resten av appen ([src/renderer/Plugins.jsx](../src/renderer/Plugins.jsx)), med innstillingene som kontroller og **Apply to selected clip**. Vinduene husker plasseringen sin.
  - Ikoner vises som `<img>` (SVG kan ikke kjøre skript der), og skript, lenker og bilder avvises i tillegg.
  - Innstillinger er aldri fritekst. Tall kontrolleres mot min og maks, og valg mot en liste med enkle verdier, så verdier ikke kan smugle inn ekstra kommandolinjevalg.
  - `run_processor` kjører et programtillegg med valgte innstillinger, og `open_plugin` åpner vinduet for brukeren.
- **Innstillinger per programtillegg:** Settings → Plugins har en **Settings**-knapp per tillegg, og tannhjulet i tilleggets vindu åpner samme sted. For tillegg med parametere lagres brukerens standardverdier i preferansene (`pluginSettings`). Vinduet starter med dem, og agentens `run_processor` bruker dem når den ikke selv oppgir verdier. «Reset» går tilbake til tilleggets egne standarder. For Higgsfield inneholder innstillingene konto, modeller og prisbekreftelse.
- **Én versjon per programtillegg:** Når agenten endrer et programtillegg, gir den `replaceId` (eller samme navn), og tillegget beholder id-en og får høyere versjonsnummer. Installasjon erstatter tillegget med samme id, slik at det aldri blir liggende kopier. Python-skript lagres som én fil per versjon, så den installerte versjonen virker helt til oppdateringen er installert. Deretter slettes de gamle filene. **Remove** i innstillingene sletter også skriptene.
- **Deling:** **Share…** lager en `.reccut-plugin`-fil (JSON med navn, versjon, forfatter, ikon, innstillinger, argumenter og skript, uten lokale stier). Filtypen er registrert i `package.json`, så dobbeltklikk åpner Reccut. Filen åpnes for gjennomgang (`plugins:readFile`) og installeres ikke før brukeren godtar. Bare programtillegg laget med FFmpeg eller Python kan deles. FFmpeg-tillegg bruker alltid appens egen FFmpeg, også etter oppdateringer.
- **Vilkår:** Teksten ligger i [src/shared/pluginTerms.json](../src/shared/pluginTerms.json), med versjon. Deling krever at vilkårene for deling er godtatt. Tillegg kan deles gratis eller selges, men Reccut er ikke part i salget, og den som deler, er ansvarlig. Godkjenningen lagres i filen med dato og eventuelt navn. All installasjon (fra agenten, fra fil eller fra manifest) krever at brukeren krysser av for at de selv er ansvarlige. Hovedprosessen avviser installasjon og eksport uten godkjenning. Vilkårsteksten bør gjennomgås juridisk før lansering.
- **AI-knappen** i verktøylinjen åpner chatten. Første gang vises oppsettet, og chatten åpnes når tilkoblingen er testet.
- **Oppsett:** Første gang chatten åpnes, kan brukeren velge mellom en modell på maskinen (Ollama, LM Studio eller llama.cpp blir funnet automatisk), Google Gemini, Claude og OpenAI. Med en nøkkel hentes modellisten, og den beste modellen velges (`pickModel`). Tilkoblingen testes før chatten åpnes. **? What can I ask** forklarer hvordan man spør og har eksempler man kan klikke på.

### Teksting, farge og stil

- **Teksting og oversettelse:** Agenten transkriberer, oversetter og forkorter, og erstatter undertekstsporet med `add_captions` og `replace`. Reglene ligger i koden (`fitCaptions` i [src/shared/srt.js](../src/shared/srt.js)), ikke bare i instruksjonene:
  - minst 1 sekund og høyst 7 sekunder på skjermen
  - høyst 17 tegn per sekund
  - to linjer à 42 tegn
  - minst to bilder mellom undertekstene, og ingen overlapp

  Korte tekster forlenges inn i stillheten etter seg. Tekster som bryter reglene, sendes tilbake som advarsler, og agenten skriver dem om. Modellen gjør det den er god på (omformulere), og koden gjør regningen.
- **Farge og eksponering:** Agenten måler først, retter så feil (eksponering, klipping, fargestikk), lager stil etterpå, og avstemmer klipp fra samme scene. Den kontrollerer resultatet med målingene fra `preview_frames`. Det virker derfor også med modeller som ikke ser bilder.
- **Referansebilde:** Bilder legges ved med **Image…**, ved å lime inn eller ved å dra dem inn. De sendes med meldingen, og `analyze_look` måler dem, slik at agenten kan flytte tallene for hvert klipp mot referansen.

### Begrensninger og neste steg

- Ordtidene fra Whisper er gode, men ikke helt presise. Kuttene legges derfor i målte pauser når det går.
- Agenten kan ikke lage programtillegg med kode. Titler er data og trygge. Kjørbare prosessorer må installeres av brukeren.
- Agenten kan ikke generere voiceover, bilder eller video ennå. Dette passer inn som egne verktøy som lager en fil og importerer den.
- Den kan ikke sladde ansikter automatisk. Det krever ansiktsgjenkjenning og sporing.
- Den kan ikke eksportere eller pakke prosjektet.
- Det finnes ingen MCP-server ennå.
- Agenten er testet med simulerte modellsvar i Node og Electron. Målingene er testet på ekte dekodede videobilder. Ordtider og pauser er testet med Whisper-modellen i Node på syntetisk tale. Den er ikke testet mot en ekte leverandør, og transkripsjonsarbeideren og `preview_frames` er ikke kjørt i den ferdige appen.

## Prosjektpakking

Claude hadde allerede lagt til **Trim media to the parts that are used** i Package Project. Arbeidet er videreført med tester og feilrettinger: overgangsreserver beholdes selv med null ekstra handles, ulike kutt med samme start forveksles ikke, lyd utenfor opptaksmappen følger med, og ufullstendige pakker ryddes bort ved feil eller avbrudd.

Vanlige video- og lydfiler kan kuttes. Opptaksmapper og stillbilder kopieres hele. Kutting omkoder med høy kvalitet og er ikke en bit-identisk kopi av originalen. Vist størrelse er et anslag; en omkodet fil kan bli større enn forventet. Originalprosjektet endres ikke.

## Verifisering

- `npm test`: modell-, sikkerhets-, prosessor- og FFmpeg-integrasjonstester.
- `npm run build`: renderer, eksportarbeider og transkripsjonsarbeider.
- `npm run test:render`: ekte WebGL2 og CPU-rendering i Electron, effektstabling, sammensetting over et annet spor, kildelesing, inspektørhandlinger og AI-forslag med angre.

Syntetiske testbilder og korte genererte videoer brukes til funksjonskontroll. Hår, glass og komplekse ekte opptak er ikke kvalitetsvalidert, og ingen kjøpt CorridorKey-installasjon eller ekstern API-konto er brukt i testene.
