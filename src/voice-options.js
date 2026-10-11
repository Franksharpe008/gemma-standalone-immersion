export const AUTO_VOICE = 'sienna:auto';
export const NATURAL_VOICES = [
  { id: 'kokoro:bf_emma', name: 'Emma · Natural British English', language: 'en-GB' },
  { id: 'kokoro:af_heart', name: 'Heart · Natural American English', language: 'en-US' },
];

export function voiceId(voice) {
  return `device:${voice.voiceURI || voice.name}|${voice.lang}`;
}

export function englishVoices(voices) {
  return voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang)).sort((a, b) => {
    const score = v => /Google UK English Female/i.test(v.name) ? 1000
      : /natural|neural|premium|enhanced/i.test(v.name) ? 800
      : /Google/i.test(v.name) ? 700
      : /Samantha|Karen|Moira|Daniel|Tessa/i.test(v.name) ? 500
      : v.default ? 100 : 0;
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });
}

export function resolveVoice(choice, voices) {
  const english = englishVoices(voices);
  if (choice.startsWith('kokoro:')) {
    return { type: 'natural', id: NATURAL_VOICES.find(v => v.id === choice)?.id || 'kokoro:bf_emma' };
  }
  if (choice.startsWith('device:')) {
    const voice = english.find(v => voiceId(v) === choice);
    if (voice) return { type: 'device', voice };
  }
  // Preserve the original preferred voice. Never silently fall back to an OS novelty voice.
  const original = english.find(v => /Google UK English Female/i.test(v.name));
  return original ? { type: 'device', voice: original } : { type: 'natural', id: 'kokoro:bf_emma' };
}

export function speechChunks(text) {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]).flatMap(sentence => {
    // Bound each synthesis request without losing words in a long unpunctuated reply.
    const words = sentence.trim().split(/\s+/);
    const chunks = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length > 220) { chunks.push(current); current = ''; }
      current += `${current ? ' ' : ''}${word}`;
    }
    if (current) chunks.push(current);
    return chunks;
  }).filter(Boolean);
}
