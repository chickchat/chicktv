import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('CHZZK channel links normalize and participate in provider status checks', () => {
  const context = vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../provider-links.js', import.meta.url), 'utf8'), context);
  const id = '083c66a5cfce51967bcad5c1b0b86e5d';
  assert.equal(context.providerPlayerUrl('https://chzzk.naver.com/' + id), 'https://chzzk.naver.com/live/' + id);
  assert.equal(context.statusProvider('https://chzzk.naver.com/live/' + id).provider, 'chzzk');
  assert.equal(context.statusProvider('https://chzzk.naver.com/live/invalid'), null);
  assert.equal(context.statusProvider('https://chzzk.naver.com.evil.test/live/' + id), null);
});

test('SOOP and CHZZK channel buttons use distinct provider badges', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /provider === "soop"[\s\S]*?\? "S"/);
  assert.match(app, /provider === "chzzk"[\s\S]*?\? "C"/);
});
