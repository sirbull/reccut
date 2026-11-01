# Videoskoper i Reccut

Åpne **View → Video Scopes**, bruk **Cmd+7** på Mac / **Ctrl+7** på Windows, eller trykk scope-ikonet ved forhåndsvisningens avspillingskontroller. Panelet er slått av som standard. Du kan også finne det ved å søke etter waveform, RGB, histogram eller vectorscope i kommandosøket.

Velg fire skoper samtidig eller ett større skop:

| Skop | Viser | Nyttig til |
| --- | --- | --- |
| Luma waveform | Luma Y′ fra 0 til 100 %, med bildets venstreside til venstre | Sammenligne skygger, mellomtoner og høylys på bestemte steder i bildet |
| RGB waveform | Rød, grønn og blå kanal overlagt på samme graf | Sammenligne kanalnivåer ved samme bildeposisjon |
| RGB parade | Rød, grønn og blå kanal i hver sin del av grafen | Finne fargestikk og forskjeller mellom kanalene |
| Histogram | Antall piksler ved hvert RGB- og lumanivå fra 0 til 255 | Se fordelingen av signalnivåer; RGB er farget, luma er lys grå |
| Vectorscope | Rec.709 Cb/Cr: nøytralt i sentrum, fargetone etter retning og fargestyrke etter avstand | Sammenligne fargemetning og retningen til et fargestikk |

**Gain** endrer lysstyrken på sporene uten å endre målingene. **Log** velger logaritmisk eller lineær histogramhøyde. Vectorscopet har målmerker for 75 % fargebarer og en valgfri, omtrentlig hudtoneretning. Hudguiden er en referanseretning, ikke en regel for alle hudtoner eller lyssettinger.

**Hold** fryser skopene mens videoen kan fortsette. **Resume** henter inn nye bilder igjen. Dra i panelets nedre høyre hjørne for å endre høyden innenfor plassen i visningen. Fire skoper vises i to rader på smalere visninger og én rad når det er nok plass. Lukk med krysset eller samme menyvalg som åpnet panelet. Innstillingene for visning, type og gain huskes mellom økter. Panelet skjules i fullskjermavspilling.

## Hva som måles

Skopene leser det ferdig tegnede bildet i forhåndsvisningslerretet, etter fargekorrigering, LUT-er, effekter, masker og sammensetting. De følger dermed det synlige kilde- eller tidslinjebildet. Redigeringshåndtakene er separate skjermelementer og inngår ikke. Skopene legges ikke på eksportert video.

Dette er **samplede 8-bit SDR-visningsverdier**, ikke målinger direkte fra RAW- eller HDR-kilden. Luma Y′ beregnes med koeffisientene i [ITU-R BT.709](https://www.itu.int/rec/R-REC-BT.709-6-201506-I). Y′ er signalets luma, ikke en fysisk luminansmåling i nits. HDR eller LOG måles slik det er konvertert til den synlige forhåndsvisningen. Verdier utenfor det bildet kan representere kan ikke rekonstrueres av skopene.

Teksten **RGB at 255** viser andelen samplede piksler der minst én RGB-kanal er ved øvre kodeverdi. En mettet farge kan gi dette utslaget uten at originalopptaket er overeksponert. Dette er derfor ikke en automatisk vurdering av klipping eller en kontroll av kringkastingsnivåer.

For å begrense arbeidsmengden samples opptil 512 × 288 piksler, maksimalt åtte ganger i sekundet. Små detaljer eller korte topper kan bli oversett, og redusert forhåndsvisningsoppløsning påvirker analysen. Når bildet og innstillingene er uendret, gjenbrukes analysen og tegningen. Når panelet er lukket, leses ingen bilder. Hold stopper nye bildelesinger; skjulte visninger samples ikke.

## Verifisering

- `node --test test/scopes.test.mjs` kontrollerer histogramtelling, waveform-posisjon, primærfarger, gråskala, Cb/Cr-retninger og alfahåndtering.
- `npm run test:scopes` bruker et eget Electron-vindu og en midlertidig brukerprofil. Den kontrollerer at skjulte og lukkede skoper ikke leser bilder, at Hold og Resume virker, at alle skopvisninger kan velges, at panelet får plass ved 320 piksler, og at innstillingene lagres.
