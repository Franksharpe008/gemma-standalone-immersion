import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

// Speech stays on-device in a worker. Prefer WebGPU for conversational latency.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let modelPromise;
let backend = "wasm";
let activeGeneration = 0;
function load() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const options = { progress_callback: progress => self.postMessage({ type: 'progress', progress }) };
      let tts;
      if (self.navigator?.gpu) {
        try {
          tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { ...options, dtype: 'fp32', device: 'webgpu' });
          await tts.generate('Hello.', { voice: 'bf_emma', speed: 1 });
          backend = 'webgpu';
        } catch (error) {
          console.warn('GPU voice unavailable; using CPU speech.', error.message);
          try { await tts?.model.dispose(); } catch { /* Already lost device. */ }
          tts = null;
        }
      }
      if (!tts) {
        backend = 'wasm';
        tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { ...options, dtype: 'q8', device: 'wasm' });
        await tts.generate('Hello.', { voice: 'bf_emma', speed: 1 });
      }
      return tts;
    })().catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

// Serialize requests: cancellation invalidates the caller, while the reusable model stays warm.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  if (data.type === 'cancel') { activeGeneration = data.generation; return; }
  if (data.type === 'generate') activeGeneration = Math.max(activeGeneration, data.generation);
  queue = queue.then(async () => {
    try {
      if (data.type === 'generate' && data.generation !== activeGeneration) {
        self.postMessage({ type: 'cancelled', id: data.id }); return;
      }
      const tts = await load();
      if (data.type === 'load') {
        self.postMessage({ type: 'ready', id: data.id, backend });
      } else if (data.type === 'generate') {
        const start = performance.now();
        const audio = await tts.generate(data.text, { voice: data.voice, speed: data.speed });
        self.postMessage({ type: 'audio', id: data.id, samples: audio.audio, sampleRate: audio.sampling_rate, generationMs: performance.now() - start, backend }, [audio.audio.buffer]);
      }
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error.message });
    }
  });
};
