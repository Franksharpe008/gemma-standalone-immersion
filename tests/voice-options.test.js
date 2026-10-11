import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_VOICE, voiceId, englishVoices, resolveVoice, speechChunks } from '../src/voice-options.js';
const os = { name: 'Eddy', lang: 'en-GB', voiceURI: 'os:eddy', default: true };
const original = { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'google:uk' };

test('original preferred English voice survives a shuffled browser inventory', () => {
  assert.equal(resolveVoice(AUTO_VOICE, [os, original]).voice, original);
  assert.equal(resolveVoice(AUTO_VOICE, [original, os]).voice, original);
});
test('Codex-style OS-only inventory uses neural English instead of Eddy', () => {
  assert.deepEqual(resolveVoice(AUTO_VOICE, [os]), { type: 'natural', id: 'kokoro:bf_emma' });
});
test('empty and non-English inventories still have a natural English voice', () => {
  for (const voices of [[], [{ name: 'Google español', lang: 'es-ES' }]]) {
    assert.equal(resolveVoice(AUTO_VOICE, voices).type, 'natural');
  }
});
test('explicit neural choice is retained even when Google appears later', () => {
  assert.equal(resolveVoice('kokoro:af_heart', [original]).id, 'kokoro:af_heart');
});
test('explicit saved device choice remains selected on refresh', () => {
  assert.equal(resolveVoice(voiceId(os), [original, os]).voice, os);
});
test('voice identifiers distinguish same-named multilingual device voices', () => {
  const other = { ...os, lang: 'zh-CN' };
  assert.notEqual(voiceId(os), voiceId(other));
  assert.equal(englishVoices([other, os]).length, 1);
});
test('missing saved device choice uses neural speech, never arbitrary first voice', () => {
  assert.equal(resolveVoice('device:missing|en-US', [os]).type, 'natural');
});
test('long replies retain every word within bounded synthesis chunks', () => {
  const text = Array.from({length: 150}, (_, i) => `word${i}`).join(' ') + '.';
  const chunks = speechChunks(text);
  assert.equal(chunks.join(' '), text);
  assert.ok(chunks.every(chunk => chunk.length <= 220));
  assert.deepEqual(speechChunks('Hi Frank. How are you? Good!'), ['Hi Frank.', 'How are you?', 'Good!']);
});
