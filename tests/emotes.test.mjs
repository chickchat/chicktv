import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../chat-emotes.js', import.meta.url), 'utf8');
const synchronization = source.slice(
  source.indexOf('function validSkLivePackId('),
  source.indexOf('function emoteParts(')
);

test('SKLive synchronization replaces updated packs and keeps bundled fallbacks', async () => {
  const bundled = [
    { code: 'old', url: 'https://sk-knower.com/old.png', pack: 'known' },
    { code: 'fallback', url: 'https://sk-knower.com/fallback.png', pack: 'failed' },
    { code: 'historic', url: 'https://sk-knower.com/historic.png', pack: 'historic' }
  ];
  const chatEmotes = new Map([
    ['old', { ...bundled[0], provider: 'sk' }],
    ['fallback', { ...bundled[1], provider: 'sk' }],
    ['historic', { ...bundled[2], provider: 'sk' }],
    ['twitch', { code: 'twitch', url: 'https://example.com/twitch.png', provider: 'twitch' }]
  ]);
  const emotePacks = [
    { id: 'known', label: 'Known', image: 'https://sk-knower.com/old.png', count: 1 },
    { id: 'failed', label: 'Failed', image: 'https://sk-knower.com/fallback.png', count: 1 },
    { id: 'historic', label: 'Historic', image: 'https://sk-knower.com/historic.png', count: 1 }
  ];
  const responses = new Map([
    ['skchat_set.php', { set: [
      { name: 'known', dis: 'Known upstream', image: '', showset: 'true' },
      { name: 'new_pack', dis: 'New pack', image: '', showset: 'true' },
      { name: 'failed', dis: 'Failed', image: '', showset: 'true' }
    ] }],
    ['known', { known: [{ alt: 'updated', src: 'https://sk-knower.com/updated.gif', showicon: 'true' }] }],
    ['new_pack', { new_pack: [{ alt: 'new', src: 'https://sk-knower.com/new.png', showicon: 'true' }] }]
  ]);
  const context = vm.createContext({
    URL,
    URLSearchParams,
    AbortSignal,
    skLiveCatalogBase: 'https://sk-knower.com/sklive_api/read/',
    chatEmotes,
    emotePacks,
    emotePanel: { hidden: true },
    refreshEmoteMessages() {},
    drawEmoteTabs() {},
    drawEmotes() {},
    registerEmotes(items, provider) {
      for (const item of items) chatEmotes.set(item.code, { ...item, provider });
    },
    fetch: async (url) => {
      const request = new URL(url);
      const key = request.pathname.endsWith('skchat_set.php')
        ? 'skchat_set.php'
        : request.searchParams.get('set');
      if (!responses.has(key)) throw Error('unavailable');
      return { ok: true, json: async () => responses.get(key) };
    }
  });
  vm.runInContext(synchronization, context);
  await context.synchronizeSkLiveStickers(bundled);

  assert.equal(chatEmotes.has('old'), false);
  assert.equal(chatEmotes.get('updated').pack, 'known');
  assert.equal(chatEmotes.get('new').pack, 'new_pack');
  assert.equal(chatEmotes.get('fallback').pack, 'failed');
  assert.equal(chatEmotes.get('historic').pack, 'historic');
  assert.equal(chatEmotes.get('twitch').provider, 'twitch');
  assert.deepEqual(
    emotePacks.map(({ id, label, count }) => ({ id, label, count })),
    [
      { id: 'known', label: 'Known', count: 1 },
      { id: 'failed', label: 'Failed', count: 1 },
      { id: 'historic', label: 'Historic', count: 1 },
      { id: 'new_pack', label: 'New pack', count: 1 }
    ]
  );
});
