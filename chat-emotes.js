const chatEmotes = new Map();
let emoteMode = 'sk',
  emotePanel,
  emoteGrid,
  emoteSearch;
let emotePack = 'channel',
  emotePacks = [],
  emoteTabs;
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
function renderEmoteText(text) {
  const span = el('span', 'emote-text');
  for (const part of emoteParts(text)) {
    if (part.text !== undefined) span.append(document.createTextNode(part.text));
    else {
      const image = el('img', 'chat-emote ' + part.emote.provider);
      image.src = part.emote.url;
      image.alt = part.emote.code;
      image.title = part.emote.code;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.onerror = () => image.replaceWith(document.createTextNode(part.emote.code));
      span.append(image);
    }
  }
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
      registerEmotes(await r.json(), 'sk');
      try {
        const packs = await fetch(new URL('sk-emote-packs.json', document.baseURI));
        if (packs.ok) emotePacks = await packs.json();
      } catch {}
      refreshEmoteMessages();
      drawEmoteTabs();
      if (!emotePanel.hidden) drawEmotes();
    }
  } catch {}
});
