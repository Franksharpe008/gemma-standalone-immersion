import { AUTO_VOICE, NATURAL_VOICES, englishVoices, voiceId, resolveVoice, speechChunks } from './voice-options.js';

const STORAGE_KEY = 'sienna.voice.v1';

export function createSpeechController({ select, status, pitch, rate, onState, audioContext, cadence }) {
  const synth = window.speechSynthesis;
  let choice = AUTO_VOICE;
  try { choice = localStorage.getItem(STORAGE_KEY) || AUTO_VOICE; } catch { /* Private storage can be unavailable. */ }
  let voices = [];
  let worker;
  let requestId = 0;
  let generation = 0;
  let source;
  let utterance;
  let loadPromise;
  let ready = false;
  const pending = new Map();

  const report = (text, state = 'ready') => {
    status.textContent = text;
    status.dataset.state = state;
  };
  function resolved() { return resolveVoice(choice, voices); }
  function readyLabel() {
    const selected = resolved();
    return selected.type === 'device' ? `${selected.voice.name} · English voice ready`
      : `${NATURAL_VOICES.find(v => v.id === selected.id).name} · ${ready ? 'ready' : 'preparing'}`;
  }
  function updateControls() {
    pitch.disabled = resolved().type === 'natural';
    pitch.title = pitch.disabled ? 'Natural voices preserve their original tone. Rate still changes speaking speed.' : 'Device voice pitch';
  }
  function refreshVoices() {
    voices = synth?.getVoices() || [];
    select.replaceChildren(new Option('Sienna · Natural English (automatic)', AUTO_VOICE));
    for (const voice of NATURAL_VOICES) select.add(new Option(voice.name, voice.id));
    for (const voice of englishVoices(voices)) select.add(new Option(`${voice.name} · ${voice.lang} (device)`, voiceId(voice)));
    if (![...select.options].some(o => o.value === choice)) {
      // A temporarily missing saved device voice may appear in a later voiceschanged event.
      if (choice.startsWith('device:')) select.add(new Option('Saved voice unavailable · using natural English', choice));
      else choice = AUTO_VOICE;
    }
    select.value = choice;
    updateControls();
    if (!source && !utterance) report(readyLabel(), resolved().type === 'natural' && !ready ? 'loading' : 'ready');
    if (resolved().type === 'natural') prepare().catch(() => {});
  }
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        if (!ready && resolved().type === 'natural') {
          const percent = data.progress.progress;
          report(`Preparing natural English voice${Number.isFinite(percent) ? ` · ${Math.round(percent)}%` : '…'} · first download is cached`, 'loading');
        }
        return;
      }
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      clearTimeout(request.timer);
      if (data.type === 'error') request.reject(new Error(data.message));
      else request.resolve(data);
    };
    worker.onerror = () => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Voice worker could not start.')); }
      pending.clear();
      worker.terminate(); worker = null; ready = false; loadPromise = null;
      report('Natural voice unavailable. Check your connection, then press Preview voice to retry.', 'error');
    };
    return worker;
  }
  function request(type, data = {}) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timer = setTimeout(() => {
        pending.delete(id);
        // A stalled model must not keep every subsequent retry behind it.
        worker?.terminate(); worker = null; ready = false; loadPromise = null;
        for (const other of pending.values()) { clearTimeout(other.timer); other.reject(new Error('Voice preparation timed out.')); }
        pending.clear();
        reject(new Error('Voice preparation timed out.'));
      }, 180000);
      pending.set(id, { resolve, reject, timer });
      try { getWorker().postMessage({ type, id, ...data }); }
      catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  function prepare() {
    if (!loadPromise) {
      loadPromise = request('load').then(() => {
        ready = true;
        if (!source && !utterance && resolved().type === 'natural') report(readyLabel());
      }).catch(error => {
        loadPromise = null;
        if (resolved().type === 'natural') report('Natural voice could not load. Check your connection, then press Preview voice to retry.', 'error');
        throw error;
      });
    }
    return loadPromise;
  }
  function stop() {
    ++generation;
    if (source) { source.stop(); source = null; }
    synth?.cancel();
    utterance = null;
    onState('idle');
  }
  function play(samples, sampleRate, token) {
    if (token !== generation) return Promise.resolve();
    const ctx = audioContext();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    return new Promise(resolve => {
      source = ctx.createBufferSource();
      const current = source;
      current.buffer = buffer;
      current.connect(ctx.destination);
      current.onended = () => { current.disconnect(); if (source === current) source = null; resolve(); };
      onState('speaking');
      report(`${readyLabel()} · speaking`, 'speaking');
      current.start();
    });
  }
  function playDevice(text, selected, token) {
    return new Promise((resolve, reject) => {
      if (token !== generation) return resolve();
      const current = new SpeechSynthesisUtterance(text);
      utterance = current;
      current.voice = selected.voice;
      current.lang = selected.voice.lang;
      current.rate = Number(rate.value);
      current.pitch = Number(pitch.value);
      current.onstart = () => { if (token === generation) { onState('speaking'); report(`${selected.voice.name} · speaking`, 'speaking'); } };
      current.onend = () => { if (utterance === current) utterance = null; resolve(); };
      current.onerror = event => { if (utterance === current) utterance = null; token !== generation ? resolve() : reject(new Error(event.error)); };
      synth.resume();
      synth.speak(current);
    });
  }
  async function speak(text) {
    stop();
    if (!text.trim()) return;
    const token = generation;
    const selected = resolved();
    // Resume immediately in the initiating click; later worker replies are outside user activation.
    const ctx = audioContext();
    try {
      await ctx.resume();
      if (selected.type === 'natural') { report('Preparing natural English speech…', 'loading'); await prepare(); }
      if (token !== generation) return;
      const chunks = speechChunks(text);
      const render = chunk => request('generate', { text: chunk, voice: selected.id?.slice(7), speed: Number(rate.value) })
        .then(audio => ({ audio }), error => ({ error }));
      let nextAudio = selected.type === 'natural' ? render(chunks[0]) : null;
      for (let index = 0; index < chunks.length; index++) {
        if (token !== generation) return;
        if (selected.type === 'natural') {
          const result = await nextAudio;
          if (token !== generation) return;
          if (result.error) throw result.error;
          const audio = result.audio;
          // Prepare the next sentence while this one plays, avoiding synthesis gaps.
          nextAudio = index + 1 < chunks.length ? render(chunks[index + 1]) : null;
          await play(audio.samples, audio.sampleRate, token);
        } else await playDevice(chunks[index], selected, token);
        if (cadence()) await new Promise(resolve => setTimeout(resolve, 80));
      }
      if (token === generation) { report(readyLabel()); onState('idle'); }
    } catch (error) {
      if (token !== generation) return;
      console.error('Sienna voice:', error.message);
      report('Voice unavailable. Press Preview voice to retry, or select an English device voice.', 'error');
      onState('idle');
    }
  }
  select.addEventListener('change', () => {
    stop(); choice = select.value;
    try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* Keep session choice. */ }
    updateControls();
    report(readyLabel(), resolved().type === 'natural' && !ready ? 'loading' : 'ready');
    if (resolved().type === 'natural') prepare().catch(() => {});
  });
  synth?.addEventListener('voiceschanged', refreshVoices);
  refreshVoices();
  window.addEventListener('pagehide', () => { stop(); worker?.terminate(); }, { once: true });
  return { speak, unlock: () => audioContext().resume(), stop: () => { stop(); report(readyLabel()); } };
}
