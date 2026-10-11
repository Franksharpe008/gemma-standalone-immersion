import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, conversationModel } from '../src/conversation-models.js';
test('new or invalid model preferences choose the measured fast conversation model', () => {
  for (const saved of [undefined, null, '', 'missing']) assert.equal(conversationModel(saved).id, 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
});
test('the original Gemma remains selectable and saved choices are respected', () => {
  const original=MODELS.find(model=>model.id==='gemma-2b-it-q4f16_1-MLC');
  assert.equal(conversationModel(original.id),original);
});
