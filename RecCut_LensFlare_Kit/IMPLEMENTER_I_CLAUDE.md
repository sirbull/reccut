# RecCut Lens Flare Kit — implementeringsoppskrift for Claude Code

**Versjon:** 1.0  
**Innhold:** 36 transparente PNG-ressurser, 8 redigerbare JSON-presets, 3 UHD/4K-eksempler, kontaktark, genereringsskript og tester.  
**Mål:** En profesjonell, lagbasert **Lens Flare / Flare Studio**-effekt inspirert av arbeidsflyten i Video Copilots Optical Flares, men med egen implementasjon og egenproduserte ressursfiler.

> **Viktig:** Dette er et **funksjonelt startbibliotek**, ikke en samling ekte fotograferte optiske flares. Alle 36 PNG-er er generert matematisk fra bunnen av. De har ekte alfakanal, ingen svart bakgrunn og kontrollerbare kanter. Noen iris-/ring-elementer er stiliserte. For enda større fotorealisme kan disse suppleres med nye lovlig fotograferte eller egenproduserte teksturer senere. Ingen filer fra Video Copilot følger med.

## 1. Oppgaven til Claude

1. Undersøk RecCuts eksisterende kode for effekter, GPU-/videorendering, prosjektpersistens, keyframes og UI før du endrer noe.
2. Kopier `assets/`, `presets/` og `manifest.json` til et egnet, versjonert ressursområde. **Ikke anta at filene er vedlagt i kodebasen før de er kopiert.**
3. Implementer et nytt effekt-objekt `LensFlareEffect` med en global kontrollflate og en ordnet samling `FlareElement`.
4. Implementer den optiske refleksjonsaksen fra punktformelen nedenfor, slik at lens ghost-/ring-elementer beveger seg når lyspunktet flyttes.
5. Implementer korrekt kompositering av RGB og alfa i **lineært lys**; legg til tone mapping bare på eksisterende, korrekt sted i renderpipen.
6. Implementer editoren **Flare Studio** med live preview, elementliste, Inspector og preset-bibliotek.
7. Koble globale parametere og eventuelt individuelle elementparametere til RecCuts eksisterende keyframe-system.
8. Kjør `scripts/validate_pack.py` og manuelle tester i RecCut. Ikke betrakt funksjonen som ferdig dersom bare UI-en er implementert.

## 2. Innhold og formål

| Mappe | Antall | Hva elementene brukes til | Typisk visningsstørrelse |
|---|---:|---|---|
| `assets/glows/` | 4 | Myk glød omkring lyskilden | 0,3–1,4 ganger videohøyden |
| `assets/starbursts/` | 4 | Stjerner og spisse stråler | 0,3–1,0 ganger videohøyden |
| `assets/streaks/` | 5 | Horisontale anamorfiske striper | 1,5–3,5 ganger videohøyden i **bredde** |
| `assets/ghosts/` | 6 | Runde, sekskantede og prismeaktige objektivreflekser | 0,1–0,5 ganger videohøyden |
| `assets/rings/` | 4 | Halo og sirkulære refleksjoner | 0,3–1,0 ganger videohøyden |
| `assets/arcs/` | 4 | Deler av optiske lysringer | 0,4–1,2 ganger videohøyden |
| `assets/glints/` | 3 | Liten, sterk lyskjerne | 0,15–0,6 ganger videohøyden |
| `assets/diffraction/` | 2 | Flere tynne diffraksjonsstråler | 0,4–1,1 ganger videohøyden |
| `assets/dirt/` | 4 | Støv, riper og smuss som kan modulere lys | Avhenger av lysmaskens størrelse |

**Alle filene er frittstående RGBA-PNG-er.** `manifest.json` er fasiten for filnavn, kategori, bredde/høyde og utklippsgrense (`alpha_bbox_xyxy`). `presets/*.json` beskriver nøyaktig hvilke filer som skal kombineres. Eksemplene i `previews/` er kun referansebilder, ikke teksturer som skal rendres i selve effekten.

## 3. Filformat og kvalitetskrav

- **Format:** PNG RGBA8, rett/straight alpha (ikke ferdig premultiplied).
- **Fargerom:** sRGB RGB-kanaler; alfa er lineær deknings-/intensitetsmaske.
- **Bakgrunn:** faktiske transparente piksler; ingen innbrent svart eller hvit bakgrunn.
- **Sikker kant:** ytterste pikselrekke og -kolonne har alfa 0. Dette hindrer klippede, synlige harde grenser når bilder vises inne på lerretet.
- **Teksturer:** 1024² og 1536² for spredte detaljer, 3072×512 for streaks, 2048² for dirt. Disse er dimensjonert for å **brukes i et 4K-prosjekt**, ikke slik at hver enkelt fil er 4096×4096.
- **Store elementer:** glows, starbursts og streaks som må dekke ekstremt store deler av 4K-bildet, bør primært rendres med shadergeometri eller regenereres i høyere oppløsning fremfor å strekkes ubegrenset.
- **RGB for alfa=0:** RGB kan fremdeles inneholde en farge selv om alfa er 0. Det er tilsiktet; **alfa må brukes** når lyset blandes. Ikke bruk RGB direkte som et heldekkende videolag.

**VIKTIG ved bilinear-filtrering:** Konverter sRGB-RGB til lineært lys, premultipliser RGB med alfa (ideelt før teksturfiltrering/under opplasting til GPU), og unngå å premultiplisere en gang til i shaderen. Alternativt kan korrekt straight-alpha-sampling brukes. Dette forhindrer mørke eller fargede kanthaloer. Sjekk dette mot eksisterende renderer før du endrer blend-modell.

## 4. Den optiske modellen — SLIK FILENE HØRER SAMMEN

Det er **ikke** nok å plassere alle bildene på samme punkt. Lens flares består av en lyskilde og en optisk kjede av refleksjoner. En enkel og styrbar modell er:

```text
C = Optical Center UV, vanligvis (0.5, 0.5)
S = Light Source UV (kan være utenfor [0,1])
d = element.distance
spread = global flare_spread
O = element.offset_uv

# Hold kilde-d=1 og optisk-sentrum-d=0 fast når spread justeres.
if d < 0:       adjusted_d = d * spread
elif d > 1:     adjusted_d = 1 + (d - 1) * spread
else:          adjusted_d = d

P = C + (S - C) * adjusted_d + O
```

- `distance = 1`: elementets sentrum ligger på **lyskilden**.
- `distance = 0`: elementets sentrum ligger ved **optisk sentrum**.
- `distance = -1`: elementet ligger like langt på **motsatt side av optisk sentrum**.
- `distance > 1` eller `< -1`: elementet kan plasseres lenger ut på samme akse.
- `offset_uv`: frikoblet korreksjon i UV-koordinater på hele videorammen.
- `flare_spread`: skalerer avstanden for sekundære elementer **utenfor segmentet** mellom lyskilden og optisk sentrum. Kildekjernen (`d=1`) og optisk sentrum (`d=0`) skal ikke flytte seg når spread endres.

**Eksempel:** `light_source_uv = [0.68, 0.39]`, `optical_center_uv = [0.5, 0.5]`. Et element med `distance=-0.5` havner ved `[0.41,0.555]` når spread=1 og offset=[0,0].

UV = fraksjon av **bildebredde/-høyde**, ikke kvadratiske piksler. Bruk bredde og høyde separat ved posisjonskonvertering. Elementenes **fysiske størrelse** bør derimot kunne uttrykkes i enhet relativ til videohøyden, slik at utseendet blir konsistent mellom 16:9 og 9:16.

### Størrelse og rotasjon

I denne pakken er `display_width_as_fraction_of_video_height` definert slik:

```text
sprite_width_px  = element.display_width_as_fraction_of_video_height * video_height_px * global_scale
sprite_height_px = sprite_width_px * (asset.pixel_height / asset.pixel_width)
```

Bevar originalt sideforhold. Rotasjon skal skje **om elementets eget sentrum**. Streaks er allerede brede bilder og skal ikke tolkes som kvadratiske sprites.

## 5. Slik bygges en flare — konkrete layer-oppskrifter

De åtte ferdige JSON-filene kan brukes direkte som eksempler. Her er strukturen for tre av dem. Alle listene skal rendres **i samme frame**; `distance` påvirker hvor de havner.

### A. `cinematic_warm.json` — klassisk filmatisk solrefleks

1. `glow_warm` **d=1.00**: stor, varm diffus lyskjerne.
2. `glow_white` **d=1.00**: mindre hvit kjerne som gir høylys.
3. `glint_gold_micro` **d=1.00**: skarp sentral glint.
4. `starburst_8_amber` **d=1.00**: åtte synlige stråler.
5. `streak_warm_horizontal` **d=1.00**: lang horisontal streak.
6. `ring_rainbow` **d=-0.58**: optisk ring på motsatt side av sentrum.
7. `ghost_round_amber` **d=-0.48**: én liten iris-refleks.
8. `ghost_hex_purple` **d=-1.18**: separat sekskantrefleks.
9. `ghost_prism_round` **d=-1.75**: prismefarget refleks lenger ut.
10. `arc_gold_bottom` **d=-0.65**: delvis lysring.
11. `lens_dirt_speckles`: **slått AV som standard**; er et modulasjonslag, se avsnitt 7.

### B. `anamorphic_blue.json` — blå filmstripe

Kombiner `glow_blue`, `glow_white`, `glint_blue_cross`, `streak_anamorphic_blue` og `streak_cyan_double` **på lyskilden**. Legg `ghost_hex_blue`, `ghost_octagon_green`, `ring_blue_thin` og `arc_blue_right` ved negative distanser. Resultatet er en kraftig horisontal stripe med mindre refleksjoner som følger lyspunktet.

### C. `prism_rainbow.json` — kreativ, regnbuefarget flare

Kombiner `glow_white`, `starburst_12_white` og `streak_white_thin` på lyskilden. Fordel `ring_rainbow`, `ghost_prism_round`, `ring_prism_offset`, `arc_rainbow_top` og `ghost_hex_blue` langs den negative refleksjonsaksen.

De øvrige fem JSON-filene demonstrerer andre kombinasjoner: `sci_fi_violet`, `golden_sunset`, `vintage_35mm`, `flashlight_white` og `concert_cyan`.

## 6. Renderer — korrekt blending i lineært lys

Den anbefalte implementasjonen er en **egen emissive flare-pass** med GPU-sprites/shaders, som så blandes med videobildet. Se opp for at noen videopipelines allerede jobber med lineær farge, mens andre jobber med gamma-kodet YUV/RGB.

```pseudo
function renderFlare(frame, effect, t):
    S = animated(effect.lightSourceUV, t)
    C = animated(effect.opticalCenterUV, t)
    E = floatHDRTexture(frame.width, frame.height, initial=0)

    for element in effect.elements in declared order:
        if !element.visible: continue
        if element.blendMode == lens_dirt_modulation:
            continue  // separat pass, ikke ordinær sprite

        d = adjustedDistancePreserveAnchors(element.distance, effect.spread)
        p = C + (S - C) * d + element.offsetUV
        size = calcSizePreserveAspect(element, manifest)
        sprite = loadAndTransformTexture(element.asset_id, p, size, rotation)

        // PNG: RGB er sRGB, A er lineær alpha/energi.
        rgbLinear = srgbDecode(sprite.rgb)
        alpha = sprite.a * element.opacity
        emission = rgbLinear * alpha * element.tintLinear * element.intensity
        E = blendEmission(E, emission, element.blendMode)

    outputLinear = blendWithVideo(frame.linearRGB, E * effect.intensity, effect.blendMode)
    return existingRenderPipelineToneMapAndEncode(outputLinear)
```

**Add/Linear Dodge** er naturlig for fysisk lys. **Screen** er et nyttig kreativt alternativ (håndter tonemapping/HDR konsekvent). **Normal/Soft Light/Overlay** kan tilby stiliserte alternativer, men krever egen dokumentert definisjon i riktig fargerom.

Renderer skal aldri legge på svart bakgrunn fra forhåndsvisningsbildene. Importer sprites direkte fra `assets/`.

Referanseskriptet `scripts/build_presets_and_previews.py` implementerer en **forenklet CPU-renderer** og viser faktisk hvordan JSON-presets kombinerer PNG-filene. Skriptet er bevisst ikke en ferdig realtime videorenderer.

## 7. Lens dirt — IKKE tegn det som vanlig lyslag

`assets/dirt/` er mikroskopisk optikk-smuss. Disse bildene skal normalt **modulere hvor glød fra sterke lyskilder blir synlig**, ikke legges på som permanent hvitt støv over videoen.

Anbefaling:

```pseudo
visibleDirt = sampleDirtUV(uv) * blurOrBloomMask(brightLightSources)
flareEmission += visibleDirt * dirtIntensity * dirtTint
```

Dirt-teksturen bør være låst til bildeplanet/linseplanet, ikke flyttes med ghost-elementene på den optiske aksen. Begynn gjerne med denne funksjonen som valgfri i fase 2. De ferdige presetene har derfor dirt **deaktivert** når funksjonen ikke er implementert.

## 8. Beskjæring av teksturene

**Som hovedregel: IKKE beskjær original-PNG-ene ved import.** De inneholder bevisst myk, transparent plass rundt lysformen. Det sikrer korrekt ankerpunkt og filtrering.

Hvis Claude vil trimme transparente marger for GPU-minne/atlas:

1. Bruk `manifest.json` sitt `alpha_bbox_xyxy` som forslag, ikke som uforanderlig fasit (det er definert for alfa > 1/255).
2. Legg til **minst 8–16 piksler** ekstra transparent padding rundt cropen, tilpasset filtrering og mipmaps.
3. Beregn ny UV-ankerposisjon fra det **opprinnelige** senteret:

```text
original anchor pixels = (original_width/2, original_height/2)
new_anchor_uv.x = (original_width/2 - crop_left) / crop_width
new_anchor_uv.y = (original_height/2 - crop_top) / crop_height
```

4. **Viktig:** Dersom bredden blir mindre ved crop, må den viste størrelsen korrigeres med `cropped_width/original_width`, ellers skaleres motivet feil.
5. Behold originalfilene for senere regenerering.
6. Bruk premultiplied alpha og atlas-padding slik at mipmaps ikke blander inn farge fra nabosprites.

**Ikke** bruk AI-autocrop direkte på et lysbilde som ser ut som svart bakgrunn. Den virkelige grensen finner man fra alfakanalen, ikke fra lysstyrken i et flattenet RGB-bilde.

## 9. Hva bør være kode, og hva bør være bildefiler?

**Shader/prosedyrisk (anbefalt):** Den store sentrale gløden, bevegelig hotspot, ubegrenset lange anamorphic streaks, stjernestråler som strekker seg over mange piksler, animert shimmer/flicker, global bloom og valgfri auto-intensitet ved offscreen-posisjon.

**PNG som her (anbefalt):** Iris ghosts, optiske ringer, asymmetriske refleksjoner, detaljerte prismatiske haloer, dirt og sekundære streak-/glint-detaljer.

**Valgbar hybrid:** Tegn prosedyregenerert hovedglød og legg 3–10 små PNG-sprites langs refleksjonsaksen. Dette gir høy ytelse, fleksibilitet og 4K-skalerbarhet.

**Hvorfor?** En 1024-piksel ghost som dekker 250–400 skjermpiksler er mer enn god nok i 4K. En 1024-piksel glow som forsøkes strukket til 3000 skjermpiksler kan bli myk/bandete; den bør tegnes direkte av en shader.

## 10. Forslag til datastruktur og UI

**Effektpanel i tidslinjen:** Preset, Light Source X/Y, Optical Center X/Y, Intensity, Global Scale, Spread, Tint, Blend Mode og knappen **Open Flare Studio**.

**Flare Studio:**
- Stor Preview med visning på svart / checkerboard / faktisk videobilde.
- Klikk-dra for light source og optical center; hjelpestreker skal ikke bli med i eksport.
- **Element Stack** med rekkefølge, hide/show, solo, grupper, dupliser og slett.
- **Element Inspector** med `asset_id`, distance, offset, scale, rotation, intensity, opacity, tint, blend mode.
- **Element Browser** med en miniatyr for hver PNG, grupper etter `manifest.assets[].group`.
- **Preset Browser** med åtte innebygde JSON-eksempler og egendefinerte presets.
- **Keyframes** på kildeposisjon, optical center, intensity, scale, spread, tint og sentrale elementparametere.

Ingen preset skal være et ferdig, flattenet bilde. Bruk `presets/*.json` som redigerbare grunninnstillinger, og lagre en **full kopi av de redigerte elementdataene i prosjektet** slik at nye versjoner av built-in presets ikke endrer eksisterende prosjekter.

## 11. Tidsmodell og keyframes

- Render basert på et nøyaktig **tidsstempel**, ikke på hvor mange frames som tidligere er rendret.
- Samme tidspunkt + samme preset + samme seed skal gi identisk resultat ved scrubbing, paused preview og eksport.
- Bruk eksisterende RecCut-konvensjon for effektens lokale tid og keyframes, spesielt ved trimming/flytting av klipp.
- Ikke generer ny tilfeldig dirt/flicker hver frame. Bruk deterministisk seed + tidsfunksjon.
- Interpoler farger i et egnet fargerom og numeriske parametere med Ease In/Out der passende.
- Støtt offscreen-lights (`source_uv` utenfor `[0,1]`) uten å klippe hovedgløden for tidlig.

## 12. Faser / prioritert byggeplan

1. **Minimum fungerende motor:** Les manifest + preset, tegn RGBA-sprites korrekt ved riktig posisjon og blend i GPU-renderer. Vis forskjell på Add og Screen.
2. **Flare Studio:** Live preview, elementliste og inspector; vis/skjul, flytt, kopier og slett.
3. **Animasjon:** Koble source/optical center/spread/intensity til eksisterende keyframes.
4. **Hybrid-shaders:** Erstatt store, reskalerte glows/streaks med tilsvarende shaderbasert geometri; behold PNG for små ghosts/rings.
5. **Avansert:** Lens dirt-modulasjon, maskebasert occlusion, kilde-lysstyrke, egendefinerte textures og preset import/eksport.

## 13. Kvalitetskontroller og 4K-test

Kjør fra pakkeroten:

```bash
python -m pip install numpy Pillow scipy
python scripts/validate_pack.py
python scripts/build_presets_and_previews.py
```

Se forhåndsvisningene i `previews/`:

- `asset_contact_sheet.jpg` — alle 36 teksturene (flat forhåndsvisning på mørk bakgrunn).
- `presets_overview.jpg` — alle 8 presetene i en enkel simuleringsrenderer.
- `cinematic_warm_4k.png`, `anamorphic_blue_4k.png`, `prism_rainbow_4k.png` — ferdige 3840×2160-testcomposites.

**Manuelle tester RecCut må bestå:**

- Legg flare over mørk og lys video og kontroller at det ikke vises svarte/lyse rektangler.
- Test bevegelig lyskilde også **utenfor** bildekanten.
- Flytt lyskilden: negative distances skal bevege seg over optisk sentrum i motsatt retning.
- Kontroller myke kanter på 100 % og 200 % zoom i 3840×2160.
- Test Rec.709/sRGB-prosjekter og HDR-prosjekter separat hvis programmet støtter HDR.
- Kontroller 16:9, 9:16 og 1:1 uten at ghost-ringer blir ellipser utilsiktet.
- Kontroller at et skjult element virkelig ikke rendres.
- Sammenlign paused preview ved samme tidskode med eksportert frame.
- Test Save/Reload, Undo/Redo og trim/flytt av klipp.

## 14. Regenerere bildefilene

Alle teksturene er reproducible/originale og kan genereres på nytt lokalt:

```bash
# Original størrelse
python scripts/generate_assets.py --scale 1

# Dobbelt oppløsning på alle sprites (store filer!)
python scripts/generate_assets.py --scale 2
```

**Advarsel:** `--scale 2` overskriver filene i `assets/` og oppdaterer `manifest.json`. Det øker total pikselmengde 4 ganger og bør kun brukes for elementer som faktisk trenger det. Ta kopi av basispakken først. Genereringen er matematisk/oppløsningsuavhengig, slik at dette ikke bare er oppskalering av eksisterende bilder.

For mer fotografisk karakter kan du senere lage ekte fotosprites av egne bilder av objektivrefleksjoner. Isoler motivet til RGBA eller bruk riktig lysbasert blandemodus; lisensen må dekke distribusjon av **råressursene** med RecCut, ikke bare bruk i en ferdig video.

## 15. Opphavsrett og begrensninger

Alt bildemateriale i denne pakken er spesialgenerert med egen kode; pakken inneholder ingen kopierte Video Copilot-filer, kjøpte fototeksturer eller eksterne bildebankressurser. Optical Flares er bare en **funksjonell referanse**. Vurder distribusjonsvilkår og relevant lisenspolicy før offentlig publisering av RecCut.

**Kvalitetsforventning:** Denne pakken gir et pålitelig utgangspunkt for en teknisk korrekt, redigerbar flare-motor. Den garanterer ikke at alle 36 elementer holder samme fotografiske nivå som en moden kommersiell plugin. Den største forbedringen senere vil være realistiske optiske ghost-teksturer og finere bloom/tonemapping.
