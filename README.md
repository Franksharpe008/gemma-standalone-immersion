# Sienna · Browser-Based Edge AI Conversation

A conversational interface using **local conversation models through WebLLM/WebGPU**, with streamed replies and natural English speech.

**[Open Sienna](https://gemma-standalone.vercel.app)** · [Selected work](https://github.com/Franksharpe008/frank-sharpe-portfolio) · [LinkedIn](https://www.linkedin.com/in/therelentlessconnoisseur/)

## Purpose

Explore an AI conversation whose language-model inference runs on a supported local device. The interface exposes system instructions, conversation controls and English voice choices instead of relying on a fixed-response imitation.

## First visit

1. Use a browser/device with WebGPU and sufficient available memory.
2. The edge model starts automatically. Its first download is several hundred MB or more and can take a while; later starts reuse browser caching.
3. Type a prompt while initialization runs; your text stays in place. Execute becomes available after the model is ready.
4. Enter a prompt. Replies stream into the conversation and are spoken in English. **Preview voice** works independently of the conversation engine; **Stop voice** interrupts playback.

**Sienna · Natural English (automatic)** preserves the original Google UK English Female voice where the browser provides it. Otherwise, Kokoro's British Emma voice runs locally in a worker. American Heart is also available. A first neural-voice download is cached by the browser; preparation and errors are shown explicitly. Your chosen voice is remembered on this browser. Device voices are optional; their availability varies by browser and operating system. Natural voices preserve their tone; the rate slider controls their speaking speed. The pitch slider applies to device voices.

Model startup shows progress, with explicit unsupported-device and load-failure feedback and a **Load Edge Model / Retry Edge Model Load** control. Retrying reuses browser caching where available.

## Boundaries

- Uses the WebLLM runtime `0.2.85` and fast default `Llama-3.2-1B-Instruct-q4f16_1-MLC` model, with original `gemma-2b-it-q4f16_1-MLC` selectable.
- Model inference runs through WebGPU; external requests still obtain runtime code, model files and fonts.
- Kokoro-js `1.2.1` uses the `onnx-community/Kokoro-82M-v1.0-ONNX` fp32 model on WebGPU, with q8 WASM fallback when GPU speech cannot initialize. Speech generation stays on-device after downloading runtime/model/voice assets. Browser-selected device voices can use platform or remote services. No universal offline-speech guarantee is made.
- Model replies may be incorrect. This is a portfolio experiment, not a safety-critical assistant or enterprise deployment.

## Run locally

```bash
npm ci --ignore-scripts
npm run dev
```

Open the local URL printed by Vite, a secure local origin suitable for WebGPU. Internet access is needed for the initial runtime/model download.

## Validation

October 8, 2026: inline-module syntax, automatic startup, editable input during loading, retained typed text, and readiness were checked. The model completed initialization, and the retained “Hi” prompt produced a live streamed reply. The existing model and system instructions were preserved. This proves an inference path for the tested device, not a broad accuracy benchmark. Initialization remains hardware and browser dependent.

[WebLLM documentation](https://webllm.mlc.ai/docs/user/basic_usage.html) · AI-assisted implementation directed and reviewed by Frank D. Sharpe.

## Speech repair validation — October 11, 2026

13 regression tests cover the original preferred voice, OS-only/empty inventories, stable saved selection, English language identity, long replies, stop/cancellation, stale replies, failure/retry, and sentence prefetch. The production build was tested locally: Gemma generated a reply, neural speech reached playback, and Stop returned it to ready. Preview, voice-choice persistence, and the deployed path are checked as part of release verification. Automated checks establish routing/playback behavior, not a subjective rating of the sound.

Sources: [Web Speech voice inventory](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices), [Kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), [Kokoro ONNX model and voices](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).

## Conversation pacing repair — October 11, 2026

Speech now starts from the first complete thought while the conversation model is still generating the rest of the reply. Neural speech prefers WebGPU, warms its kernels during preparation, trims excess silence at clip edges and schedules upcoming audio on the audio clock. Stop cancels both current and scheduled clips. The original Gemma model remains selectable; persona is retained, with instructions clarified for normal punctuation and direct answers without invented backstories. A smaller Llama 3.2 1B is the new fast default, warmed before readiness.

A same-device browser benchmark measured a 4.4-second phrase at 12.352 seconds generation on q8 WASM versus 1.082 seconds on fp32 WebGPU (4.475 seconds of audio). This measures synthesis, not total conversational response time. First downloads, cold startup, long prompts and hardware still affect latency; CPU fallback is slower. 24 regression checks cover streaming boundaries, retained words, silence trimming, scheduling and cancellation alongside voice selection.

The GPU-first approach follows the [official Kokoro Web worker](https://github.com/xenova/kokoro-web/blob/main/src/worker.ts). The incremental reply uses [WebLLM streaming completions](https://webllm.mlc.ai/docs/user/basic_usage.html#streaming-chat-completion).

A three-prompt candidate check returned coherent brief replies and warm first-token times of 223–232 ms for Llama 3.2 1B. The original Gemma warm conversation measured 1.436 seconds to first token in its tested conversation context. These are small, non-identical prompt/context samples, not a broad model benchmark or universal speed guarantee. Model choice is saved per browser.
