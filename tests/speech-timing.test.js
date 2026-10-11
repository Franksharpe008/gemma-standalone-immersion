import test from 'node:test';
import assert from 'node:assert/strict';
import { takeSpeechChunks, trimSpeechEdges } from '../src/speech-timing.js';
test('token boundaries preserve decimals, abbreviations and complete sentence punctuation', () => {
  let rest = '', chunks = [];
  for (const token of ['Dr.', ' Smith costs 3.', '14 dollars.', ' Really', '? ', 'Yes.']) {
    const split = takeSpeechChunks(rest + token); chunks.push(...split.chunks); rest = split.rest;
  }
  chunks.push(...takeSpeechChunks(rest, true).chunks);
  assert.deepEqual(chunks, ['Dr. Smith costs 3.14 dollars.', 'Really?', 'Yes.']);
});
test('streaming and flushing retain all words from long replies', () => {
  const text = Array.from({length:250},(_,i)=>`word${i}`).join(' ') + '.';
  let rest='', chunks=[];
  for (let i=0;i<text.length;i+=13) { const split=takeSpeechChunks(rest+text.slice(i,i+13)); chunks.push(...split.chunks);rest=split.rest; }
  chunks.push(...takeSpeechChunks(rest,true).chunks);
  assert.equal(chunks.join(' '),text);
  assert.ok(chunks.every(chunk=>chunk.length<=220));
});
test('edge trimming removes surplus padding without deleting interior pauses', () => {
  const audio=new Float32Array(3000);
  audio.fill(0.1,500,1000); audio.fill(0.1,1500,2000);
  const trimmed=trimSpeechEdges(audio,1000);
  assert.equal(trimmed.length,1620);
  assert.equal(trimmed.slice(540,1040).every(sample=>sample===0),true);
  assert.equal(trimmed[40],audio[500]);
});
test('quiet or silent audio is left intact rather than clipped aggressively', () => {
  const audio=new Float32Array(200).fill(0.0001);
  assert.equal(trimSpeechEdges(audio,1000),audio);
});
test('a short introductory clause does not hide a later useful early boundary', () => {
  const text = "Hello, I can help you build useful tools, and we can explore a new idea together.";
  const split = takeSpeechChunks(text);
  assert.equal(split.chunks[0], 'Hello, I can help you build useful tools,');
  assert.equal(split.rest, 'and we can explore a new idea together.');
});
