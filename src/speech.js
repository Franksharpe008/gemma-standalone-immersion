import { AUTO_VOICE, NATURAL_VOICES, englishVoices, voiceId, resolveVoice } from './voice-options.js';
import { takeSpeechChunks, trimSpeechEdges } from './speech-timing.js';

const STORAGE_KEY = 'sienna.voice.v1';

export function createSpeechController({ select, status, pitch, rate, onState, audioContext, cadence, prepareText = text => text }) {
  const synth = window.speechSynthesis;
  let choice = AUTO_VOICE;
  try { choice = localStorage.getItem(STORAGE_KEY) || AUTO_VOICE; } catch { /* Private storage can be unavailable. */ }
  let voices = [];
  let worker;
  let requestId = 0;
  let generation = 0;
  const sources = new Set();
  const deviceCompletions = new Set();
  let backend;
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
    if (!sources.size && !utterance) report(readyLabel(), resolved().type === 'natural' && !ready ? 'loading' : 'ready');
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
      loadPromise = request('load').then(result => {
        ready = true; backend = result.backend;
        if (!sources.size && !utterance && resolved().type === 'natural') report(readyLabel());
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
    worker?.postMessage({ type: 'cancel', generation });
    for (const source of sources) { source.stop(); }
    sources.clear();
    synth?.cancel();
    for (const complete of deviceCompletions) complete();
    deviceCompletions.clear();
    utterance = null;
    onState('idle');
  }
  function play(samples, sampleRate, token, timeline) {
    if (token !== generation) return Promise.resolve();
    const ctx = audioContext();
    const clean = trimSpeechEdges(samples, sampleRate);
    const buffer = ctx.createBuffer(1, clean.length, sampleRate);
    buffer.copyToChannel(clean, 0);
    return new Promise(resolve => {
      const current = ctx.createBufferSource();
      sources.add(current);
      current.buffer = buffer;
      current.connect(ctx.destination);
      current.onended = () => { current.disconnect(); sources.delete(current); resolve(); };
      // Schedule on the audio clock, before the preceding source has ended.
      const start = Math.max(ctx.currentTime + 0.025, timeline.next);
      const gapMs = timeline.next ? Math.max(0, start - timeline.next) * 1000 : 0;
      timeline.next = start + clean.length / sampleRate + (cadence() ? 0.08 : 0);
      onState('speaking');
      report(`${readyLabel()} · speaking`, 'speaking');
      console.info('Sienna speech timing', JSON.stringify({ backend, generation: token, gapMs: Math.round(gapMs), firstAudioMs: timeline.started ? undefined : Math.round(performance.now() - timeline.created) }));
      timeline.started = true;
      current.start(start);
    });
  }
  function playDevice(text, selected, token) {
    return new Promise((resolve, reject) => {
      if (token !== generation) return resolve();
      const current = new SpeechSynthesisUtterance(text);
      const complete = () => { deviceCompletions.delete(complete); if (utterance === current) utterance = null; resolve(); };
      deviceCompletions.add(complete);
      utterance = current;
      current.voice = selected.voice;
      current.lang = selected.voice.lang;
      current.rate = Number(rate.value);
      current.pitch = Number(pitch.value);
      current.onstart = () => { if (token === generation) { onState('speaking'); report(`${selected.voice.name} · speaking`, 'speaking'); } };
      current.onend = complete;
      current.onerror = event => { complete(); if (token === generation && event.error !== 'interrupted' && event.error !== 'canceled') console.warn('Sienna device voice:', event.error); };
      synth.resume();
      synth.speak(current);
    });
  }
  function beginStream() {
    stop();
    const token = generation;
    const selected = resolved();
    const ctx = audioContext();
    const timeline = { next: 0, created: performance.now(), started: false };
    const playing = [];
    let buffer = '', closed = false, failed = false;
    // Unlock in the click; synthesis runs independently while text is arriving.
    let rendering = ctx.resume().then(async () => {
      if (selected.type === 'natural') { report('Preparing natural English speech…', 'loading'); await prepare(); }
    });
    const fail = error => {
      if (token !== generation || failed) return;
      failed = true;
      console.error('Sienna voice:', error.message);
      for (const source of sources) source.stop();
      report('Voice unavailable. Press Preview voice to retry, or select an English device voice.', 'error');
      onState('idle');
    };
    rendering = rendering.catch(fail);
    function enqueue(text) {
      text = prepareText(text).trim();
      if (!text) return;
      rendering = rendering.then(async () => {
        if (token !== generation || failed) return;
        if (selected.type === 'natural') {
          const audio = await request('generate', { text, voice: selected.id.slice(7), speed: Number(rate.value), generation: token });
          if (token !== generation || audio.type === 'cancelled') return;
          playing.push(play(audio.samples, audio.sampleRate, token, timeline));
        } else playing.push(playDevice(text, selected, token));
      }).catch(fail);
    }
    return {
      push(delta) {
        if (closed || token !== generation) return;
        buffer += delta;
        const split = takeSpeechChunks(buffer);
        buffer = split.rest;
        split.chunks.forEach(enqueue);
      },
      async finish() {
        if (closed) return;
        closed = true;
        const split = takeSpeechChunks(buffer, true);
        split.chunks.forEach(enqueue);
        await rendering;
        await Promise.all(playing);
        if (token === generation && !failed) { report(readyLabel()); onState('idle'); }
      },
      cancel() { if (token === generation) stop(); closed = true; },
    };
  }
  function speak(text) {
    // Full preview text uses the same continuous queue as a streamed chat reply.
    const stream = beginStream();
    stream.push(text);
    return stream.finish();
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
  return { speak, beginStream, unlock: () => audioContext().resume(), stop: () => { stop(); report(readyLabel()); } };
}
