const historyKey = 'chick-chat-history:whitewing940920';
let restoringHistory = false;
function recentChatHistory(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (r) =>
        r &&
        typeof r.name === 'string' &&
        r.name.length <= 100 &&
        typeof r.text === 'string' &&
        r.text.length <= 2000 &&
        typeof r.id === 'string' &&
        typeof r.login === 'string' &&
        Number.isFinite(r.at) &&
        r.at > now - 600000 &&
        r.at <= now
    )
    .slice(-20);
}
function readChatHistory() {
  try {
    return recentChatHistory(JSON.parse(localStorage.getItem(historyKey)));
  } catch {
    return [];
  }
}
function writeChatHistory(rows) {
  try {
    localStorage.setItem(historyKey, JSON.stringify(recentChatHistory(rows)));
  } catch {}
}
function rememberChat(
  name,
  text,
  id,
  self,
  login,
  at = Date.now(),
  badges = '',
  color = '',
  reply = null
) {
  if (restoringHistory) return;
  const rows = readChatHistory();
  if (id && rows.some((r) => r.id === id)) return;
  rows.push({
    name,
    text,
    id: id || '',
    self: !!self,
    login: login || '',
    at,
    reply:
      reply &&
      typeof reply.id === 'string' &&
      typeof reply.name === 'string' &&
      typeof reply.text === 'string'
        ? {
            id: reply.id.slice(0, 100),
            name: reply.name.slice(0, 100),
            text: reply.text.slice(0, 2000),
            ancestors: normalizeReplyChain(reply)?.ancestors || []
          }
        : null,
    color: typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ? color : '',
    badges: typeof badges === 'string' ? badges.slice(0, 1000) : ''
  });
  writeChatHistory(rows);
}
function moderateChatHistory(line, tags) {
  if (line.includes(' CLEARMSG '))
    writeChatHistory(readChatHistory().filter((r) => r.id !== tags['target-msg-id']));
  if (line.includes(' CLEARCHAT ')) {
    const login = line.match(/ CLEARCHAT #[^ ]+ :(.+)/)?.[1];
    writeChatHistory(
      login ? readChatHistory().filter((r) => r.login.toLowerCase() !== login.toLowerCase()) : []
    );
  }
}
function restoreChatHistory() {
  const rows = readChatHistory();
  writeChatHistory(rows);
  if (!rows.length) return;
  restoringHistory = true;
  try {
    $('#messages').append(el('div', 'day', 'RECENT HISTORY · THIS BROWSER'));
    for (const r of rows) {
      const name =
        typeof twitchUser !== 'undefined' &&
        twitchUser?.display_name &&
        r.login.toLowerCase() === twitchUser.login.toLowerCase()
          ? twitchUser.display_name
          : r.name;
      const bubble = message(
        name,
        r.text,
        r.id,
        r.self,
        r.login,
        r.at,
        r.badges || '',
        r.color || '',
        r.reply && typeof r.reply.name === 'string' && typeof r.reply.text === 'string'
          ? r.reply
          : null
      );
      bubble.append(el('small', 'send-status', 'Previous message'));
    }
    $('#messages').append(el('div', 'day', 'LIVE MESSAGES'));
    $('#messages').scrollTop = $('#messages').scrollHeight;
  } finally {
    restoringHistory = false;
  }
}
function refreshChatDisplayName(login, displayName) {
  if (!login || !displayName) return;
  const normalized = login.toLowerCase();
  const rows = readChatHistory();
  for (const row of rows) if (row.login.toLowerCase() === normalized) row.name = displayName;
  writeChatHistory(rows);
  document.querySelectorAll('.bubble').forEach((b) => {
    if (b.dataset.login?.toLowerCase() === normalized) {
      const name = b.querySelector('.chat-author strong');
      if (name) name.textContent = displayName;
      const username = b.querySelector('.chat-username');
      if (username) username.hidden = displayName.toLowerCase() === normalized;
    }
  });
}
