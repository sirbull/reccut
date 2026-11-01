# Lokale modeller og flere KI-leverandører

Åpne **Settings → AI & Plugins**. Velg en tjeneste, hent tilgjengelige modeller med **Fetch models**, og velg eller skriv nøyaktig modell-ID. Lagre før du starter en samtale.

Lokale tilkoblinger:

| Tjeneste | Standard API-adresse | Oppsett utenfor Reccut |
| --- | --- | --- |
| Ollama | http://localhost:11434/v1 | Installer Ollama og last ned en modell som kan bruke verktøy |
| LM Studio | http://localhost:1234/v1 | Last inn en modell og start den lokale serveren |
| llama.cpp | http://localhost:8080/v1 | Start llama-server med ønsket modellfil |

Reccut er klient for serveren; det laster ikke selv ned eller kjører språkmodellvektene. Modeller på maskinen trenger normalt ingen API-nøkkel, men en server kan være konfigurert med en tilgangsnøkkel. Du kan også bruke en egen serveradresse på lokalnettet.

Velg en modell med **tool calling** for agentens redigeringsverktøy. Hvis modellen bare behandler tekst, slå av **Model can see images**. At serveren har en kompatibel API-adresse betyr ikke at alle modellene den tilbyr kan bruke verktøy eller analysere bilder. Oppgavenes kvalitet og hastighet avhenger av modellen og maskinvaren.

Ollama kan også formidle skymodeller. For frakoblet bruk må du velge en nedlastet lokal modell og kontrollere at modellserveren bruker lokal inferens. Reccut sender til den valgte serveren og bytter ikke automatisk til en skyleverandør når en modell ikke svarer.

Tjenestevelgeren inkluderer også OpenAI, Anthropic, Google Gemini, Mistral, OpenRouter, Groq, xAI og DeepSeek. **Other server or gateway** åpner for andre tjenester som tilbyr den støttede Chat Completions- eller Anthropic Messages-protokollen. «OpenAI-compatible» betyr et API-format; forbindelsen går til adressen du har valgt, ikke automatisk til OpenAI.

Nøkler oppbevares separat fra prosjektet. Bytter du serveradresse eller API-format, følger ikke den gamle nøkkelen automatisk med. Modellhenting kan gjøres før du lagrer, og bruker bare en eksisterende nøkkel hvis tilkoblingen fortsatt peker på samme adresse og format.

Offisiell dokumentasjon: [Ollama](https://docs.ollama.com/api/openai-compatibility), [LM Studio](https://lmstudio.ai/docs/developer/openai-compat), [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [Gemini](https://ai.google.dev/gemini-api/docs/openai), [OpenRouter](https://openrouter.ai/docs/api/reference/overview), [Mistral](https://docs.mistral.ai/resources/migration-guides) og [Groq](https://console.groq.com/docs/openai).

Forbindelsen er testet mot en virkelig lokal HTTP-testserver, uten API-nøkkel, og med simulerte leverandørsvar. Testene laster ikke ned modeller, utfører ikke tung lokal inferens og bruker ikke betalte API-kontoer.
