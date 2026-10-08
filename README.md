# Sienna · Browser-Based Local AI Conversation

A conversational interface using **Gemma through WebLLM/WebGPU**, with streamed replies and optional browser speech.

**[Open Sienna](https://gemma-standalone.vercel.app)** · [Selected work](https://github.com/Franksharpe008/frank-sharpe-portfolio) · [LinkedIn](https://www.linkedin.com/in/therelentlessconnoisseur/)

## Purpose

Explore an AI conversation whose language-model inference runs on a supported local device. The interface exposes system instructions, conversation controls and device speech voices instead of relying on a fixed-response imitation.

## First visit

1. Use a browser/device with WebGPU and sufficient available memory.
2. Choose **Load Local Model**. The first model download is large (more than 1 GB) and may take several minutes.
3. Follow download/initialization progress; Execute becomes available after initialization.
4. Enter a prompt. Replies stream into the conversation and can be spoken using a selected browser voice.

Model download is deliberate, with explicit unsupported-device and load-failure feedback. Retrying reuses browser caching where available.

## Boundaries

- Uses the WebLLM runtime `0.2.85` and configured `gemma-2b-it-q4f16_1-MLC` model.
- Model inference runs through WebGPU; external requests still obtain runtime code, model files and fonts.
- Browser speech availability and whether a voice uses platform services depend on the device. No universal offline-speech guarantee is made.
- Model replies may be incorrect. This is a portfolio experiment, not a safety-critical assistant or enterprise deployment.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`, a secure local origin suitable for WebGPU. Internet access is needed for the initial runtime/model download.

## Validation

October 8, 2026: inline-module syntax, initial disabled controls, user-initiated load and visible download progress were checked. The model completed initialization, and a live streamed prompt about two plus two returned a reply beginning “Four.” This proves an inference path for the tested device, not a broad accuracy benchmark. Initialization remains hardware and browser dependent.

[WebLLM documentation](https://webllm.mlc.ai/docs/user/basic_usage.html) · AI-assisted implementation directed and reviewed by Frank D. Sharpe.
