import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const viewCode = fs.readFileSync(new URL('../chat-view.js', import.meta.url), 'utf8');
const historyCode = fs.readFileSync(new URL('../chat-history.js', import.meta.url), 'utf8');
function fixture(hostname = 'chickchat.github.io') {
  const classes = new Set(), attributes = new Map([['aria-checked', 'false']]), storage = new Map();
  const panel = { classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } } };
  const toggle = { closest: () => panel, getAttribute: name => attributes.get(name), setAttribute: (name, value) => attributes.set(name, value) };
  const native = { hidden: true, children: [], append(frame) { this.children.push(frame); } };
  const messages = { children: [], scrollTop: 17, scrollHeight: 1000, setAttribute(name, value) { this[name] = value; } };
  const draft = { value: 'unsent draft' };
  const nodes = { '#chat-view-toggle': toggle, '#native-chat': native, '#messages': messages, '#message': draft };
  const context = { URL, Date, room: 'whitewing940920', location: { hostname }, requestAnimationFrame: callback => callback(),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    normalizeReplyChain: reply => reply,
    document: { querySelector: selector => nodes[selector], querySelectorAll: () => messages.children, createElement: tag => ({ tag }) },
    WebSocket: class { constructor() { throw Error('Switching must not create a chat connection'); } } };
  vm.createContext(context); vm.runInContext(historyCode, context); vm.runInContext(viewCode, context);
  return { context, toggle, native, messages, draft, classes, attributes };
}
test('Official Twitch chat loads only when selected, using the current hosting domain', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'chickchat.github.io']) {
    const f = fixture(hostname); assert.equal(f.native.children.length, 0);
    f.toggle.onclick(); const url = new URL(f.native.children[0].src);
    assert.equal(url.origin, 'https://www.twitch.tv'); assert.equal(url.pathname, '/embed/whitewing940920/chat');
    assert.equal(url.searchParams.get('parent'), hostname); assert.deepEqual([...url.searchParams.keys()].sort(), ['darkpopout', 'parent']);
    assert.equal(f.native.hidden, false); assert.equal(f.attributes.get('aria-checked'), 'true');
  }
});
test('Switching preserves custom DOM, draft and original Twitch iframe', () => {
  const f = fixture(); const original = { text: 'before switching' }; f.messages.children.push(original);
  f.toggle.onclick(); const frame = f.native.children[0];
  f.messages.children.push({ text: 'received while hidden' });
  f.toggle.onclick(); assert.equal(f.native.hidden, true); assert.equal(f.messages.children[0], original);
  assert.equal(f.messages.children[1].text, 'received while hidden'); assert.equal(f.draft.value, 'unsent draft');
  assert.equal(f.messages.scrollTop, f.messages.scrollHeight); assert.equal(f.messages['aria-live'], 'polite');
  f.toggle.onclick(); assert.equal(f.native.children.length, 1); assert.equal(f.native.children[0], frame);
});
test('Background messages retain existing 200 display and 30 saved limits', () => {
  const f = fixture(); f.toggle.onclick();
  for (let i = 0; i < 250; i++) {
    const bubble = { id: String(i), remove() { const at = f.messages.children.indexOf(this); if (at >= 0) f.messages.children.splice(at, 1); } };
    f.messages.children.push(bubble);
    f.context.rememberChat('Example', 'message ' + i, String(i), false, 'example', Date.now());
    f.context.pruneChatMessages();
  }
  f.toggle.onclick(); assert.equal(f.messages.children.length, 200); assert.equal(f.messages.children[0].id, '50');
  const saved = f.context.readChatHistory(); assert.equal(saved.length, 30); assert.equal(saved[0].id, '220');
});
