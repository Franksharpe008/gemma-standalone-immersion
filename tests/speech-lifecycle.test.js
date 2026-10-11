import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechController } from '../src/speech.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const events = {};
  const storage = new Map();
  const status = { textContent: '', dataset: {} };
  const select = {
    options: [], value: '', add(option) { this.options.push(option); },
    replaceChildren(...options) { this.options = options; },
    addEventListener(name, handler) { this[name] = handler; },
  };
  const workers = [];
  class Worker {
    requests = [];
    constructor() { workers.push(this); }
    postMessage(message) { this.requests.push(message); }
    answer(request, data) { this.onmessage({data: {id: request.id, ...data}}); }
    terminate() {}
  }
  const sources = [];
  const ctx = { resume: async () => {}, destination: {},
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource() {
      const source = { started: false, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.onended?.(); } };
      sources.push(source); return source;
    },
  };
  globalThis.Worker = Worker;
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  globalThis.localStorage = {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v)};
  globalThis.window = { speechSynthesis: {getVoices: () => [], cancel() {}, addEventListener: (n,h) => events[n] = h}, addEventListener: (n,h) => events[n] = h };
  const control = createSpeechController({ select, status, pitch: {}, rate: {value: '1'}, onState() {}, audioContext: () => ctx, cadence: () => false });
  return {control, workers, sources, status, select, events, storage};
}

test('Stop during model preparation prevents delayed speech from starting', async () => {
  const t = setup();
  const speaking = t.control.speak('Hello Frank.');
  await tick(); t.control.stop();
  t.workers[0].answer(t.workers[0].requests[0], {type: 'ready'});
  await speaking;
  assert.equal(t.workers[0].requests.length, 1);
  assert.equal(t.sources.length, 0);
});
test('a newer preview suppresses a stale generated clip', async () => {
  const t = setup(); const worker = t.workers[0];
  worker.answer(worker.requests[0], {type: 'ready'}); await tick();
  const first = t.control.speak('Old request.'); await tick();
  const second = t.control.speak('New request.'); await tick();
  worker.answer(worker.requests[1], {type:'audio', samples:new Float32Array(100), sampleRate:24000});
  await first; assert.equal(t.sources.length, 0);
  worker.answer(worker.requests[2], {type:'audio', samples:new Float32Array(100), sampleRate:24000}); await tick();
  assert.equal(t.sources.length, 1); assert.equal(t.sources[0].started, true);
  t.sources[0].onended(); await second;
  assert.equal(t.status.dataset.state, 'ready');
});
test('voice load failure stays visible and Preview retries', async () => {
  const t = setup(); const worker = t.workers[0];
  worker.answer(worker.requests[0], {type:'error', message:'Offline'}); await tick();
  assert.equal(t.status.dataset.state, 'error');
  const retry = t.control.speak('Retry.'); await tick();
  assert.equal(worker.requests[1].type, 'load');
  worker.answer(worker.requests[1], {type:'ready'}); await tick();
  t.control.stop();
  worker.answer(worker.requests[2], {type:'audio', samples:new Float32Array(100), sampleRate:24000});
  await retry; assert.equal(t.sources.length, 0);
});
test('changing voice during preparation saves the choice and cancels pending playback', async () => {
  const t = setup(); const speaking = t.control.speak('Old voice.'); await tick();
  t.select.value = 'kokoro:af_heart'; t.select.change();
  t.workers[0].answer(t.workers[0].requests[0], {type:'ready'});
  await speaking;
  assert.equal(t.storage.get('sienna.voice.v1'), 'kokoro:af_heart');
  assert.equal(t.sources.length, 0);
  assert.match(t.status.textContent, /Heart/);
});
test('the next sentence is synthesized while the current sentence plays', async () => {
  const t = setup(); const worker = t.workers[0];
  worker.answer(worker.requests[0], {type:'ready'}); await tick();
  const speaking = t.control.speak('First sentence. Second sentence.'); await tick();
  worker.answer(worker.requests[1], {type:'audio', samples:new Float32Array(100), sampleRate:24000}); await tick();
  assert.equal(t.sources[0].started, true);
  assert.equal(worker.requests[2].text, 'Second sentence.');
  worker.answer(worker.requests[2], {type:'audio', samples:new Float32Array(100), sampleRate:24000});
  t.sources[0].onended(); await tick();
  assert.equal(t.sources[1].started, true);
  t.sources[1].onended(); await speaking;
});
