# Local models and multiple AI providers

Open **Settings → AI & Plugins**. Choose a service, fetch the available models with **Fetch models**, and select or type the exact model ID. Save before you start a conversation.

Local connections:

| Service | Default API address | Setup outside Reccut |
| --- | --- | --- |
| Ollama | http://localhost:11434/v1 | Install Ollama and download a model that can use tools |
| LM Studio | http://localhost:1234/v1 | Load a model and start the local server |
| llama.cpp | http://localhost:8080/v1 | Start llama-server with the model file you want |

Reccut is a client for the server; it does not download or run the language model weights itself. Models on your machine normally need no API key, but a server can be configured with an access key. You can also use your own server address on the local network.

Choose a model with **tool calling** for the agent's editing tools. If the model only handles text, turn off **Model can see images**. A server having a compatible API address does not mean every model it offers can use tools or analyze images. Task quality and speed depend on the model and the hardware.

Ollama can also relay cloud models. For offline use you must choose a downloaded local model and make sure the model server uses local inference. Reccut sends to the selected server and does not switch to a cloud provider automatically when a model does not respond.

The service picker also includes OpenAI, Anthropic, Google Gemini, Mistral, OpenRouter, Groq, xAI and DeepSeek. **Other server or gateway** opens up other services that offer the supported Chat Completions or Anthropic Messages protocol. "OpenAI-compatible" means an API format; the connection goes to the address you have chosen, not automatically to OpenAI.

Keys are stored separately from the project. If you change the server address or API format, the old key does not carry over automatically. Models can be fetched before you save, and an existing key is only used if the connection still points to the same address and format.

Official documentation: [Ollama](https://docs.ollama.com/api/openai-compatibility), [LM Studio](https://lmstudio.ai/docs/developer/openai-compat), [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [Gemini](https://ai.google.dev/gemini-api/docs/openai), [OpenRouter](https://openrouter.ai/docs/api/reference/overview), [Mistral](https://docs.mistral.ai/resources/migration-guides) and [Groq](https://console.groq.com/docs/openai).

The connection has been tested against a real local HTTP test server, without an API key, and with simulated provider responses. The tests do not download models, run heavy local inference or use paid API accounts.
