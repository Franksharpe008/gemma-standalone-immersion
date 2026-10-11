// Emit complete thoughts as tokens arrive; wait for lookahead at punctuation so
// decimals, abbreviations and punctuation split across tokens are not broken.
const ABBREVIATION = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)|\b[A-Z])\.$/i;
export function takeSpeechChunks(text, flush = false, limit = 140) {
  const chunks = [];
  let rest = text;
  while (rest.trim()) {
    let cut = 0;
    for (const match of rest.matchAll(/[.!?]+["'”’)]*(?=\s)/g)) {
      const end = match.index + match[0].length;
      if (ABBREVIATION.test(rest.slice(0, end).trim())) continue;
      if (end <= limit) { cut = end; break; }
    }
    // Keep long spoken thoughts flowing by preparing a natural clause early.
    if ((!cut || cut > 90) && rest.length >= 90) {
      const clause = /[,;:]\s/.exec(rest.slice(0, Math.min(cut || limit, limit)));
      if (clause && clause.index >= 35) cut = clause.index + 1;
    }
    if (!cut && rest.length > limit) {
      // Prefer a clause boundary; otherwise use a whole-word boundary.
      const prefix = rest.slice(0, limit + 1);
      cut = Math.max(prefix.lastIndexOf(', '), prefix.lastIndexOf('; '), prefix.lastIndexOf(': '));
      cut = cut > 35 ? cut + 1 : prefix.lastIndexOf(' ');
      if (cut < 1) cut = limit;
    }
    if (!cut) {
      if (flush) { chunks.push(rest.trim()); rest = ''; }
      break;
    }
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }
  return { chunks, rest };
}

// Only trim excess silence at clip edges. Interior pauses and quiet consonants
// remain intact; padding protects breath/fricatives and a short fade avoids clicks.
export function trimSpeechEdges(samples, sampleRate) {
  const frame = Math.max(1, Math.round(sampleRate * 0.01));
  let first = samples.length, last = 0;
  for (let i = 0; i < samples.length; i += frame) {
    let peak = 0;
    for (let j = i; j < Math.min(i + frame, samples.length); j++) peak = Math.max(peak, Math.abs(samples[j]));
    if (peak >= 0.002) { first = Math.min(first, i); last = Math.min(i + frame, samples.length); }
  }
  if (last === 0) return samples;
  const start = Math.max(0, first - Math.round(sampleRate * 0.04));
  const end = Math.min(samples.length, last + Math.round(sampleRate * 0.08));
  const output = samples.slice(start, end);
  const fade = Math.min(Math.round(sampleRate * 0.004), Math.floor(output.length / 2));
  for (let i = 0; i < fade; i++) { output[i] *= i / fade; output[output.length - 1 - i] *= i / fade; }
  return output;
}
