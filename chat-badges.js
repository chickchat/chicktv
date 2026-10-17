const twitchBadgeImages = new Map();
function parseChatBadges(value) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map((b) => b.split('/'))
        .filter((b) => b.length === 2 && /^[\w-]+$/.test(b[0]) && /^[\w-]+$/.test(b[1]))
        .slice(0, 15)
    : [];
}
function badgeStrip(value = '') {
  const strip = el('span', 'chat-badges');
  strip.dataset.badges = value;
  fillBadgeStrip(strip);
  return strip;
}
function fillBadgeStrip(strip) {
  strip.replaceChildren();
  for (const [set, version] of parseChatBadges(strip.dataset.badges)) {
    const badge = twitchBadgeImages.get(set + '/' + version);
    if (!badge) continue;
    const img = el('img', 'chat-badge');
    img.src = badge.url;
    img.alt = badge.title;
    img.title = badge.title;
    img.width = 18;
    img.height = 18;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    strip.append(img);
  }
}
function addBadgeSets(sets) {
  for (const set of sets || [])
    for (const version of set.versions || []) {
      try {
        const url = new URL(version.image_url_2x || version.image_url_1x);
        if (url.protocol === 'https:' && url.hostname === 'static-cdn.jtvnw.net')
          twitchBadgeImages.set(set.set_id + '/' + version.id, {
            url: url.href,
            title: version.title || set.set_id
          });
      } catch {}
    }
}
async function loadChatBadges() {
  if (!token || !twitchUser) return;
  const headers = {
    Authorization: 'Bearer ' + token,
    'Client-Id': window.CHICKTV_CONFIG.twitchClientId || saved('twitch-client', '')
  };
  try {
    const globalRequest = fetch('https://api.twitch.tv/helix/chat/badges/global', { headers }).then(
      async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      }
    );
    const channelRequest = (async () => {
      const users = await fetch(
        'https://api.twitch.tv/helix/users?login=' + encodeURIComponent(room),
        { headers }
      );
      if (!users.ok) throw Error();
      const body = await users.json();
      const id = body.data?.[0]?.id;
      if (!id) throw Error();
      const badges = await fetch(
        'https://api.twitch.tv/helix/chat/badges?broadcaster_id=' + encodeURIComponent(id),
        { headers }
      );
      if (!badges.ok) throw Error();
      return badges.json();
    })();
    const results = await Promise.allSettled([globalRequest, channelRequest]);
    // Channel-specific subscription images override the global set where applicable.
    for (const result of results)
      if (result.status === 'fulfilled') addBadgeSets(result.value.data);
    document.querySelectorAll('.chat-badges').forEach(fillBadgeStrip);
  } catch {}
}
function updateOwnBadges(value) {
  if (!twitchUser || typeof value !== 'string') return;
  twitchUser.badges = value;
  document.querySelectorAll('.bubble').forEach((b) => {
    if (b.dataset.login?.toLowerCase() === twitchUser.login.toLowerCase()) {
      const strip = b.querySelector('.chat-badges');
      if (strip) {
        strip.dataset.badges = value;
        fillBadgeStrip(strip);
      }
    }
  });
  const rows = readChatHistory();
  for (const row of rows)
    if (row.login.toLowerCase() === twitchUser.login.toLowerCase()) row.badges = value;
  writeChatHistory(rows);
}
