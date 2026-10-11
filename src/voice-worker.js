import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

// Keep speech off the Gemma GPU and the UI thread. No conversation text leaves this worker.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let modelPromise;
function load() {
  if (!modelPromise) {
    modelPromise = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8', device: 'wasm',
      progress_callback: progress => self.postMessage({ type: 'progress', progress }),
    }).catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

// Serialize requests: cancellation invalidates the caller, while the reusable model stays warm.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const tts = await load();
      if (data.type === 'load') {
        self.postMessage({ type: 'ready', id: data.id });
      } else if (data.type === 'generate') {
        const audio = await tts.generate(data.text, { voice: data.voice, speed: data.speed });
        self.postMessage({ type: 'audio', id: data.id, samples: audio.audio, sampleRate: audio.sampling_rate }, [audio.audio.buffer]);
      }
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error.message });
    }
  });
};
