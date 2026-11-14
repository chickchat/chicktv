const chatEmotes = new Map();
const skLiveCatalogBase = 'https://sk-knower.com/sklive_api/read/';
let emoteMode = 'sk',
  emotePanel,
  emoteGrid,
  emoteSearch;
let emotePack = 'channel',
  emotePacks = [],
  emoteTabs;
// Fixed display heights: keep small pixel-art packs close to their intended scale.
function stickerSize(pack) {
  if (['hkg1', 'hkg2'].includes(pack)) return 32;
  if (['lomoreList', 'helloweenlomore', 'eventlistrnd2016', 'event2listRC2016', 'hiddenlist'].includes(pack)) return 70;
  if (/^Set[1-7]List$/.test(pack)) return 80;
  return 160;
}
function applyStickerSize(image, pack) {
  image.dataset.emotePack = pack || '';
  image.style.setProperty('--sk-emote-size', stickerSize(pack) + 'px');
}
function filteredEmotes(mode, pack, query = '') {
  return [...chatEmotes.values()].filter(
    (x) =>
      x.provider === mode &&
      (mode !== 'sk' || pack === 'all' || x.pack === pack) &&
      x.code.toLowerCase().includes(query.trim().toLowerCase())
  );
}
function drawEmoteTabs() {
  if (!emoteTabs) return;
  emoteTabs.replaceChildren();
  emoteTabs.hidden = emoteMode !== 'sk';
  if (emoteMode !== 'sk') return;
  for (const pack of [{ id: 'all', label: '全部' }, ...emotePacks]) {
    const button = el('button', 'emote-pack' + (pack.id === emotePack ? ' active' : ''));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(pack.id === emotePack));
    button.title = pack.label;
    if (pack.image) {
      const image = el('img');
      image.src = pack.image;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      button.append(image);
    }
    button.append(document.createTextNode(pack.label));
    button.onclick = () => {
      emotePack = pack.id;
      emoteGrid.scrollTop = 0;
      drawEmoteTabs();
      drawEmotes();
    };
    emoteTabs.append(button);
  }
}
function registerEmotes(items, provider) {
  for (const item of items || [])
    try {
      const u = new URL(item.url);
      if (u.protocol === 'https:' && typeof item.code === 'string' && item.code.length < 100)
        chatEmotes.set(item.code, { ...item, provider });
    } catch {}
}
function validSkLivePackId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,50}$/.test(value);
}
function normalizedSkLiveStickers(data, pack) {
  if (!validSkLivePackId(pack) || !Array.isArray(data?.[pack])) return [];
  const unique = new Map();
  for (const item of data[pack]) {
    if (item?.showicon !== 'true' || typeof item.alt !== 'string' ||
        !item.alt.length || item.alt.length >= 100 || typeof item.src !== 'string') continue;
    try {
      const url = new URL(item.src);
      if (url.protocol === 'https:' && !url.username && !url.password)
        unique.set(item.alt, { code: item.alt, url: url.href, pack });
    } catch {}
  }
  return [...unique.values()];
}
async function fetchSkLiveJson(path, query) {
  const url = new URL(path, skLiveCatalogBase);
  url.search = new URLSearchParams(query);
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw Error('SKLive catalog unavailable');
  return response.json();
}
async function synchronizeSkLiveStickers(bundled) {
  const metadata = await fetchSkLiveJson('skchat_set.php', { showset: 'public' });
  const publicPacks = Array.isArray(metadata?.set)
    ? metadata.set.filter((pack) => pack?.showset === 'true' && validSkLivePackId(pack.name)).slice(0, 50)
    : [];
  const results = await Promise.allSettled(
    publicPacks.map(async (pack) => ({
      metadata: pack,
      stickers: normalizedSkLiveStickers(
        await fetchSkLiveJson('skchat_icon.php', { set: pack.name }),
        pack.name
      )
    }))
  );
  const synchronized = new Map();
  for (const result of results)
    if (result.status === 'fulfilled' && result.value.stickers.length)
      synchronized.set(result.value.metadata.name, result.value);
  if (!synchronized.size) return;

  const merged = bundled.filter((item) => !synchronized.has(item.pack));
  for (const { stickers } of synchronized.values()) merged.push(...stickers);
  for (const [code, emote] of chatEmotes)
    if (emote.provider === 'sk') chatEmotes.delete(code);
  registerEmotes(merged, 'sk');

  const existing = new Map(emotePacks.map((pack) => [pack.id, pack]));
  for (const { metadata: pack, stickers } of synchronized.values()) {
    const current = existing.get(pack.name);
    const updated = {
      id: pack.name,
      label: current?.label || pack.dis || pack.name,
      image: pack.image || stickers[0].url,
      count: stickers.length
    };
    if (current) Object.assign(current, updated);
    else {
      emotePacks.push(updated);
      existing.set(updated.id, updated);
    }
  }
  refreshEmoteMessages();
  drawEmoteTabs();
  if (!emotePanel.hidden) drawEmotes();
}
function emoteParts(text) {
  const codes = [...chatEmotes.keys()].sort((a, b) => b.length - a.length);
  const parts = [];
  let plain = '',
    i = 0;
  while (i < text.length) {
    const code = codes.find(
      (c) =>
        text.startsWith(c, i) &&
        (chatEmotes.get(c).provider === 'sk' ||
          ((i === 0 || /\s/.test(text[i - 1])) &&
            (i + c.length === text.length || /\s/.test(text[i + c.length]))))
    );
    if (code) {
      if (plain) {
        parts.push({ text: plain });
        plain = '';
      }
      parts.push({ emote: chatEmotes.get(code) });
      i += code.length;
    } else {
      plain += text[i++];
    }
  }
  if (plain) parts.push({ text: plain });
  return parts;
}
function appendEmoteParts(span, text) {
  for (const part of emoteParts(text)) {
    if (part.text !== undefined) span.append(document.createTextNode(part.text));
    else {
      const image = el('img', 'chat-emote ' + part.emote.provider);
      if (part.emote.provider === 'sk') applyStickerSize(image, part.emote.pack);
      image.src = part.emote.url;
      image.alt = part.emote.code;
      image.title = part.emote.code;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.onerror = () => image.replaceWith(document.createTextNode(part.emote.code));
      span.append(image);
    }
  }
}
function renderEmoteText(text) {
  const span = el('span', 'emote-text');
  const urlPattern = /https?:\/\/[^\s<>"'`]+/giu;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    let linkText = match[0];
    while (/[.,!?;:，。！？；：、]+$/u.test(linkText)) linkText = linkText.slice(0, -1);
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}'], ['（', '）'], ['【', '】']]) {
      while (linkText.endsWith(close) &&
        [...linkText].filter((char) => char === close).length > [...linkText].filter((char) => char === open).length)
        linkText = linkText.slice(0, -close.length);
    }
    if (!linkText) continue;
    let url;
    try { url = new URL(linkText); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
      continue;

    appendEmoteParts(span, text.slice(cursor, match.index));
    const link = el('a', 'chat-link');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow ugc';
    link.textContent = linkText;
    span.append(link);
    cursor = match.index + linkText.length;
  }
  appendEmoteParts(span, text.slice(cursor));
  return span;
}
function refreshEmoteMessages() {
  document.querySelectorAll('.bubble').forEach((b) => {
    const old = b.querySelector('.chat-body');
    if (old && b.dataset.text) {
      const content = renderChatContent(b.dataset.text);
      content.classList.add('chat-body');
      old.replaceWith(content);
    }
  });
}
function learnTwitchEmotes(text, tags) {
  if (!tags) return;
  const chars = Array.from(text);
  for (const group of tags.split('/')) {
    const [id, positions] = group.split(':');
    if (!/^[\w-]+$/.test(id || '') || !positions) continue;
    const [start, end] = positions.split(',')[0].split('-').map(Number);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end >= chars.length
    )
      continue;
    registerEmotes(
      [
        {
          code: chars.slice(start, end + 1).join(''),
          url: 'https://static-cdn.jtvnw.net/emoticons/v2/' + id + '/default/dark/2.0'
        }
      ],
      'twitch'
    );
  }
}
async function loadTwitchEmotes() {
  if (!token) return;
  const headers = {
    Authorization: 'Bearer ' + token,
    'Client-Id': window.CHICKTV_CONFIG.twitchClientId || saved('twitch-client', '')
  };
  const requests = [
    (async () => {
      const r = await fetch('https://api.twitch.tv/helix/chat/emotes/global', { headers });
      if (r.ok) return (await r.json()).data;
    })(),
    (async () => {
      const u = await fetch('https://api.twitch.tv/helix/users?login=' + room, { headers });
      if (!u.ok) return;
      const id = (await u.json()).data?.[0]?.id;
      if (!id) return;
      const r = await fetch('https://api.twitch.tv/helix/chat/emotes?broadcaster_id=' + id, {
        headers
      });
      if (r.ok) return (await r.json()).data;
    })()
  ];
  const results = await Promise.allSettled(requests);
  for (const result of results)
    if (result.status === 'fulfilled')
      registerEmotes(
        (result.value || []).map((x) => ({
          code: x.name,
          url: 'https://static-cdn.jtvnw.net/emoticons/v2/' + x.id + '/default/dark/2.0'
        })),
        'twitch'
      );
  refreshEmoteMessages();
  if (emotePanel && !emotePanel.hidden) drawEmotes();
}
function insertChatEmote(code) {
  const input = $('#message'),
    start = input.selectionStart ?? input.value.length,
    end = input.selectionEnd ?? start;
  const insert = (start && !/\s/.test(input.value[start - 1]) ? ' ' : '') + code + ' ';
  if (input.value.length - (end - start) + insert.length > input.maxLength) return;
  input.setRangeText(insert, start, end, 'end');
  input.focus();
}
function drawEmotes() {
  emoteGrid.replaceChildren();
  const query = emoteSearch.value.toLowerCase();
  const entries = filteredEmotes(emoteMode, emotePack, query);
  for (const item of entries) {
    const b = el('button', 'emote-choice');
    b.type = 'button';
    b.title = item.code;
    b.setAttribute('aria-label', item.code);
    const img = el('img');
    img.src = item.url;
    img.alt = item.code;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    b.append(img);
    b.onclick = () => insertChatEmote(item.code);
    emoteGrid.append(b);
  }
  if (!entries.length)
    emoteGrid.append(
      el(
        'p',
        '',
        emoteMode === 'twitch' ? 'Connect to Twitch to load emotes.' : 'No matching emotes.'
      )
    );
}
document.addEventListener('DOMContentLoaded', async () => {
  const tools = el('div', 'emote-tools');
  emotePanel = el('section', 'emote-panel');
  emotePanel.hidden = true;
  emotePanel.setAttribute('aria-label', 'Emote picker');
  emoteSearch = el('input');
  emoteSearch.placeholder = 'Search emotes…';
  emoteSearch.setAttribute('aria-label', 'Search emotes');
  emoteSearch.oninput = drawEmotes;
  const close = el('button', '', 'Close');
  close.type = 'button';
  close.onclick = () => (emotePanel.hidden = true);
  emoteGrid = el('div', 'emote-grid');
  emoteTabs = el('div', 'emote-tabs');
  emoteTabs.setAttribute('aria-label', 'SKLive sticker packs');
  emotePanel.append(emoteTabs, emoteSearch, close, emoteGrid);
  for (const [provider, label] of [
    ['twitch', '☻ Twitch emotes'],
    ['sk', '🎮 SKLive emotes']
  ]) {
    const b = el('button', '', label);
    b.type = 'button';
    b.onclick = () => {
      emoteMode = provider;
      emoteSearch.value = '';
      emotePanel.hidden = false;
      drawEmoteTabs();
      drawEmotes();
    };
    tools.append(b);
  }
  $('#send-form').before(tools, emotePanel);
  try {
    const r = await fetch(new URL('sk-emotes.json', document.baseURI));
    if (r.ok) {
      const bundled = await r.json();
      registerEmotes(bundled, 'sk');
      try {
        const packs = await fetch(new URL('sk-emote-packs.json', document.baseURI));
        if (packs.ok) emotePacks = await packs.json();
      } catch {}
      refreshEmoteMessages();
      drawEmoteTabs();
      if (!emotePanel.hidden) drawEmotes();
      void synchronizeSkLiveStickers(bundled).catch(() => {});
    }
  } catch {}
});
