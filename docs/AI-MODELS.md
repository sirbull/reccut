# Local models and multiple AI providers

## Recommendations for Reccut's local feature models

**View → AI Models**, Quick Search (“recommended models”) and **Settings → AI** show model sizes and **Recommended** labels with reasons. Reccut reads system RAM and available logical CPU count locally; background removal also checks the WebGPU capabilities used by its worker. This is a conservative starting estimate, not a benchmark or a measurement of CPU/GPU speed, free memory or VRAM. No model is loaded or downloaded to make a recommendation.

- **Captions and transcripts:** Tiny with less than about 8 GB RAM or at most two available logical CPUs; otherwise Base as the lighter default. Small is suggested from about 16 GB and eight logical CPUs, and Medium from about 32 GB and twelve. Unsupported models are excluded. Large V3 Turbo stays an optional quality choice. New Whisper downloads currently use single-threaded CPU inference; extra cores indicate headroom for editing, not proportional transcription speed.
- **Background removal:** Fast (GPU) when the required WebGPU features are exposed; Standard otherwise. Compatibility does not guarantee sufficient GPU memory or faster inference.
- **Voice packages:** recommendations account for language and engine availability. Piper is lighter; Kokoro covers its own languages; VoxCPM2 is suggested on supported Apple Silicon systems from about 16 GB and eight logical CPUs. Its shared model is about 3.55 GB. Language and voice preferences remain editable.
- **Roto Brush:** Small for constrained hardware, Base+ with about 16 GB and four logical CPUs. Large remains an option for harder subjects. Current models are kept.

Badges are advisory. First-run suggestions can be cleared; only Download/Download selected starts installation. AI Agent setup does not download suggested models. Existing installed/active selections are retained. The built-in agent and Reccut's MCP interface can read the same advice through `get_model_recommendations`, or open the chooser with `run_command` and `ai:models`.

The thresholds are Reccut heuristics, not vendor performance requirements. Upstream references: [Whisper model tradeoffs](https://github.com/openai/whisper#available-models-and-languages) and [Transformers.js WebGPU configuration](https://huggingface.co/docs/transformers.js/guides/webgpu). Whisper's published GPU timings do not predict the speed of Reccut's quantized CPU models.

Validation, 24 November 2026: 71 targeted tests and the production build pass. `node scripts/test-model-recommendations.cjs weak`, `balanced` and `powerful` run the real Windows app with injected RAM/CPU counts (4 GB/2, 12 GB/12 and 32 GB/16). They check Tiny/Base/Medium labels, first-run suggestions, preserved manual deselection, the registered command and voice recommendations without downloads. The balanced run also checks that AI Agent setup does not download preselected models, and opens the new handbook article in the app and generated website Docs. These are functional checks with simulated hardware, not performance benchmarks or cross-platform runtime acceptance.

## Language models for the editing agent

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
