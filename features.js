let requestMode = false,
  userChoseChannel = false;
const localCommunity =
  ['localhost', '127.0.0.1'].includes(location.hostname) && !window.CHICKTV_CONFIG.apiBaseUrl;
const communityEnabled = localCommunity || /^https:\/\//.test(window.CHICKTV_CONFIG.apiBaseUrl);
function communityEndpoint(path) {
  return (window.CHICKTV_CONFIG.apiBaseUrl.replace(/\/$/, '') || location.origin) + '/api/' + path;
}
const subscriptions = new Set(saved('chick-alerts', []));
const alertMessages = saved('chick-alert-messages', {});
const notifiedOnline = new Set(saved('chick-alerted-online', []));
const onlineAlertQueue = [];
let onlineAlertWindow;
function showOnlineAlert(text) {
  onlineAlertQueue.push(text);
  if (!onlineAlertWindow) {
    onlineAlertWindow = el('dialog', 'online-alert-window');
    const title = el('h2', '', '頻道上線通知');
    const content = el('p', 'online-alert-message');
    const close = el('button', 'primary', '知道了');
    close.type = 'button';
    close.onclick = () => onlineAlertWindow.close();
    onlineAlertWindow.append(title, content, close);
    document.body.append(onlineAlertWindow);
    onlineAlertWindow.addEventListener('close', () => displayNextOnlineAlert());
  }
  displayNextOnlineAlert();
}
function displayNextOnlineAlert() {
  if (!onlineAlertWindow || onlineAlertWindow.open || !onlineAlertQueue.length) return;
  onlineAlertWindow.querySelector('.online-alert-message').textContent = onlineAlertQueue.shift();
  onlineAlertWindow.showModal();
}
function saveNotifiedOnline() {
  try {
    localStorage.setItem('chick-alerted-online', JSON.stringify([...notifiedOnline]));
  } catch {}
}
function defaultAlertMessage(channel) {
  return (Array.from(channel.displayname || '')[0] || '台') + '扑快！';
}
function alertText(channel) {
  const value = alertMessages[channelKey(channel)];
  return typeof value === 'string' && value.trim() ? value : defaultAlertMessage(channel);
}
let editingAlert = null;
function openAlertSettings(channel) {
  editingAlert = channel;
  $('#alert-title').textContent = channel.displayname + ' · 上線通知';
  $('#alert-message').value = alertText(channel);
  $('#alert-disable').hidden = !subscriptions.has(channelKey(channel));
  $('#alert-support').textContent =
    typeof statusProvider === 'function' && statusProvider(channel.original || channel.url)
      ? statusProvider(channel.original || channel.url).provider === 'soop'
        ? 'SOOP 每 60 秒檢查上線狀態，通知需保持頁面開啟。'
        : 'YouTube 不檢查上線狀態，因此不會發出上線通知。'
      : typeof angelThumpChannel === 'function' && angelThumpChannel(channel.url)
        ? 'AngelThump 狀態每 60 秒檢查，頁面開啟時可發出上線通知。'
        : channel.platform === 'm3u8'
          ? '頁面開啟時，偵測離線轉為上線後通知。'
          : channel.platform === 'twitch'
            ? '登入 Twitch 後可偵測上線。'
            : channel.platform === 'vl' && channel.details
              ? '預設 Kick 頻道使用 SKLive 狀態資料，每 60 秒檢查。'
              : '可儲存通知設定；此平台的上線偵測尚未接通，暫時不會發出通知。';
  $('#alert-dialog').showModal();
}
function saveAlertSettings(event) {
  event.preventDefault();
  if (!editingAlert) return;
  const text = $('#alert-message').value.trim();
  if (!text) return;
  const key = channelKey(editingAlert);
  alertMessages[key] = text;
  subscriptions.add(key);
  storeAlerts();
  $('#alert-dialog').close();
  renderTabs();
  if (liveStates.get(key) === true) recordAvailability(editingAlert, true, false);
  else void checkAvailability(false);
}
function storeAlerts() {
  try {
    localStorage.setItem('chick-alerts', JSON.stringify([...subscriptions]));
    localStorage.setItem('chick-alert-messages', JSON.stringify(alertMessages));
  } catch {
    toast('Could not save notification settings in this browser.');
  }
}
function recordAvailability(channel, live, initial) {
  const key = channelKey(channel);
  if (live !== true && live !== false) return;
  liveStates.set(key, live);
  if (!live) {
    notifiedOnline.delete(key);
    saveNotifiedOnline();
  } else if (subscriptions.has(key) && !notifiedOnline.has(key)) {
    notifiedOnline.add(key);
    saveNotifiedOnline();
    showOnlineAlert(alertText(channel));
  }
}
const liveStates = new Map(),
  chatCounts = new Map(),
  seenMessages = new Set();
const originalRenderTabs = renderTabs;
renderTabs = function () {
  originalRenderTabs();
  for (const [i, c] of channels.entries()) {
    const container = c.custom ? $('#personal-channels') : $('#channels');
    const channelButtons = [...container.querySelectorAll('.channel')];
    const peers = channels.filter((x) => !!x.custom === !!c.custom);
    const b = channelButtons[peers.indexOf(c)];
    if (!b) continue;
    const key = channelKey(c);
    const status = liveStates.get(key);
    b.title = status === true ? 'Online' : status === false ? 'Offline' : 'Live status unknown';
    b.classList.toggle('channel-online', status === true);
    b.classList.toggle('channel-offline', status === false);
    b.setAttribute('aria-label', c.displayname + ' · ' + b.title);
    {
      const bell = el('button', 'bell', subscriptions.has(key) ? '🔔' : '♧');
      bell.setAttribute('aria-label', 'Configure online alert for ' + c.displayname);
      bell.setAttribute('aria-pressed', String(subscriptions.has(key)));
      bell.title = alertText(c);
      bell.onclick = () => openAlertSettings(c);
      b.after(bell);
    }
    if (c.custom) {
      const remove = el('button', 'bell', '×');
      remove.setAttribute('aria-label', 'Remove personal channel ' + c.displayname);
      remove.onclick = () => {
        channels.splice(i, 1);
        screens = screens.map((idx) => (idx === i ? 0 : idx > i ? idx - 1 : idx));
        persist();
        renderTabs();
        renderScreens();
      };
      b.after(remove);
    }
  }
};
function channelKey(c) {
  return c.platform + ':' + (c.details || c.original || c.url);
}
function openChannelForm(request) {
  requestMode = request;
  $('#channel-title').textContent = request
    ? 'Request a permanent channel'
    : 'Add a personal channel';
  $('#channel-submit').textContent = request ? 'Send request' : 'Add personal channel';
  $('#channel-dialog').showModal();
}
$('#add-channel').onclick = () => openChannelForm(false);
$('#request-channel').onclick = () => openChannelForm(true);
async function submitRequest(channel) {
  if (!communityEnabled) {
    toast('Shared requests need the hosted database and admin login setup.');
    return;
  }
  const button = $('#channel-submit');
  button.disabled = true;
  try {
    const res = await fetch(communityEndpoint('requests'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    $('#channel-dialog').close();
    $('#channel-form').reset();
    toast('Request sent. It joins the shared list after admin approval.');
  } catch (e) {
    toast(e.message || 'Request failed. Please try again.');
  } finally {
    button.disabled = false;
  }
}
async function checkAvailability(initial = false) {
  const candidates = channels.filter((c) => c.platform === 'm3u8');
  let next = 0;
  async function runner() {
    while (next < candidates.length) {
      const c = candidates[next++],
        key = channelKey(c);
      try {
        const res = await fetch(goshEndpoint(c.details), { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw Error();
        const data = await res.json();
        recordAvailability(c, !!data.isLive, initial);
      } catch {
        liveStates.set(key, null);
      }
      renderTabs();
    }
  }
  async function checkSharedStatus() {
    const kickChannels = channels.filter((c) => ['vl', 'twitch'].includes(c.platform) && c.details);
    if (kickChannels.length) {
      try {
        const endpoint = new URL(goshEndpoint('status'));
        endpoint.pathname = '/api/channel-status';
        endpoint.search = '';
        const response = await fetch(endpoint.href, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Array.isArray(data.channels)) throw Error();
        for (const c of kickChannels) {
          const status = data.channels.find(
            (x) => x.platform === c.platform && x.details === c.details
          )?.status;
          if (status === 'live' || status === 'offline')
            recordAvailability(c, status === 'live', initial);
          else liveStates.set(channelKey(c), null);
        }
      } catch {
        for (const c of kickChannels) liveStates.set(channelKey(c), null);
      }
    }
    renderTabs();
  }
  const sharedStatusReady = checkSharedStatus();
  async function checkTwitch() {
    await sharedStatusReady;
    const twitchChannels = channels.filter((c) => c.platform === 'twitch');
    if (typeof token !== 'undefined' && token && twitchChannels.length) {
      for (let start = 0; start < twitchChannels.length; start += 100) {
        const batch = twitchChannels.slice(start, start + 100);
        try {
          const query = new URLSearchParams();
          for (const c of batch) query.append('user_login', c.details);
          const res = await fetch('https://api.twitch.tv/helix/streams?' + query, {
            headers: {
              Authorization: 'Bearer ' + token,
              'Client-Id': window.CHICKTV_CONFIG.twitchClientId || saved('twitch-client', '')
            },
            signal: AbortSignal.timeout(15000)
          });
          if (!res.ok) throw Error();
          const body = await res.json();
          if (!Array.isArray(body.data)) throw Error();
          const online = new Set(body.data.map((s) => s.user_login.toLowerCase()));
          for (const c of batch)
            recordAvailability(c, online.has(c.details.toLowerCase()), initial);
        } catch {
          // Keep the fresh shared status if Twitch authentication or its API fails.
        }
      }
    }
    renderTabs();
  }
  async function checkAngelThump() {
    if (typeof angelThumpChannel !== 'function') return;
    await Promise.all(
      channels.map(async (channel) => {
        const name = angelThumpChannel(channel.url);
        if (!name) return;
        try {
          const response = await fetch(
            'https://api.angelthump.com/v3/streams?username=' + encodeURIComponent(name),
            {
              signal: AbortSignal.timeout(15000),
              cache: 'no-store'
            }
          );
          if (!response.ok) throw Error();
          const streams = await response.json();
          if (!Array.isArray(streams)) throw Error();
          recordAvailability(
            channel,
            streams.some(
              (stream) => stream.type === 'live' && stream.user?.username?.toLowerCase() === name
            ),
            initial
          );
        } catch {
          liveStates.set(channelKey(channel), null);
        }
        renderTabs();
      })
    );
  }
  async function checkOtherProviders() {
    if (typeof statusProvider !== 'function') return;
    await Promise.all(
      channels.map(async (channel) => {
        const source = statusProvider(channel.original || channel.url);
        if (!source || source.provider === 'youtube') return;
        try {
          const endpoint = new URL(goshEndpoint('status'));
          endpoint.pathname = '/api/provider-status';
          endpoint.search = new URLSearchParams(source);
          const response = await fetch(endpoint.href, {
            signal: AbortSignal.timeout(15000),
            cache: 'no-store'
          });
          if (!response.ok) throw Error();
          const data = await response.json();
          if (['live', 'offline'].includes(data.status))
            recordAvailability(channel, data.status === 'live', initial);
          else liveStates.set(channelKey(channel), null);
        } catch {
          liveStates.set(channelKey(channel), null);
        }
        renderTabs();
      })
    );
  }
  await Promise.all([
    runner(),
    runner(),
    runner(),
    sharedStatusReady,
    checkTwitch(),
    checkAngelThump(),
    checkOtherProviders()
  ]);
  if (initial && !userChoseChannel) {
    const idx = channels.findIndex((c) => liveStates.get(channelKey(c)) === true);
    if (idx >= 0) {
      screens[0] = idx;
      renderScreens();
    }
  }
  const online = channels.filter((c) => liveStates.get(channelKey(c)) === true).length;
  $('#status-note').textContent = `${online} channel(s) confirmed online`;
  renderTabs();
}
function trackChatter(name, login, id) {
  // Ranking is deferred; do not collect counts when its UI is absent.
  if (!$('#chat-ranking')) return;
  if (id && seenMessages.has(id)) return;
  if (id) seenMessages.add(id);
  const key = (login || name).toLowerCase();
  const row = chatCounts.get(key) || { name, count: 0 };
  row.name = name;
  row.count++;
  chatCounts.set(key, row);
  const ranking = $('#chat-ranking');
  ranking.replaceChildren();
  [...chatCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10)
    .forEach((r) => ranking.append(el('li', '', r.name + ' · ' + r.count + ' messages')));
}
let communityRefreshBusy = false;
async function refreshCommunity() {
  if (!communityEnabled || communityRefreshBusy) return;
  communityRefreshBusy = true;
  try {
    const res = await fetch(communityEndpoint('community'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw Error();
    const data = await res.json();
    const personal = channels.filter((c) => c.custom);
    const previous = screens.map((index) => channels[index] && channelKey(channels[index]));
    const shared = Array.isArray(data.shared)
      ? data.shared
      : [
          ...channels.filter(
            (c) => !c.custom && !(data.removed || []).includes(c.original || c.url)
          ),
          ...(data.approved || [])
        ];
    const updated = [...new Map(shared.map((c) => [channelKey(c), c])).values(), ...personal];
    if (JSON.stringify(updated) !== JSON.stringify(channels)) {
      channels = updated;
      screens = previous.map((key) =>
        Math.max(
          0,
          channels.findIndex((c) => channelKey(c) === key)
        )
      );
      renderTabs();
      renderScreens();
    }
  } finally {
    communityRefreshBusy = false;
  }
}
async function initFeatures() {
  $('#alert-form').onsubmit = saveAlertSettings;
  $('#alert-disable').onclick = () => {
    if (editingAlert) {
      subscriptions.delete(channelKey(editingAlert));
      notifiedOnline.delete(channelKey(editingAlert));
      saveNotifiedOnline();
      storeAlerts();
      $('#alert-dialog').close();
      renderTabs();
    }
  };
  if (communityEnabled) {
    try {
      await refreshCommunity();
    } catch {
      toast('Channel updates are temporarily unavailable. Showing the saved channel list.');
    }
  }
  renderTabs();
  await checkAvailability(true);
  setInterval(async () => {
    if (!document.hidden) {
      try {
        await refreshCommunity();
      } catch {}
      void checkAvailability(false);
    }
  }, 60000);
}
