import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanText} from '../src/spoken-text.js';
test('performance cues are removed instead of spoken literally', () => {
  assert.equal(cleanText('( pause ) Hi Frank. *Pause* Let’s build. [long pause] Ready?'), "Hi Frank. Let's build. Ready?");
});
test('intentional normal words survive speech formatting', () => {
  assert.equal(cleanText('I just like that idea. A pause is useful sometimes.'),'I just like that idea. A pause is useful sometimes.');
});
test('ellipsis and markdown do not create spaced-out pronunciation', () => {
  assert.equal(cleanText('**Hello**... what can we build? 🚀'),'Hello, what can we build?');
});
