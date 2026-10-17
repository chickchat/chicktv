function safeChatColor(value) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '';
}
function applyChatColor(author, color) {
  const safe = safeChatColor(color);
  if (safe) author.style.setProperty('--twitch-name-color', safe);
}
function updateChatColor(login, color) {
  const safe = safeChatColor(color);
  if (!safe || !login) return;
  const normalized = login.toLowerCase();
  if (twitchUser?.login.toLowerCase() === normalized) twitchUser.color = safe;
  document.querySelectorAll('.bubble').forEach((b) => {
    if (b.dataset.login?.toLowerCase() === normalized) {
      const author = b.querySelector('.chat-author');
      if (author) applyChatColor(author, safe);
    }
  });
  const rows = readChatHistory();
  for (const r of rows) if (r.login.toLowerCase() === normalized) r.color = safe;
  writeChatHistory(rows);
}
