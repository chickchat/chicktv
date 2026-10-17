let outgoing = null;
let replyTarget = null;
function cancelReply() {
  replyTarget = null;
  document.querySelector('#reply-preview')?.remove();
}
function selectReply(bubble, name) {
  if (!/^[\w-]+$/.test(bubble.dataset.id || '')) return;
  cancelReply();
  replyTarget = { id: bubble.dataset.id, name, text: bubble.dataset.text };
  const preview = el('div', 'reply-preview');
  preview.id = 'reply-preview';
  preview.append(replyQuote(replyTarget));
  const cancel = el('button', '', '×');
  cancel.type = 'button';
  cancel.setAttribute('aria-label', 'Cancel reply');
  cancel.onclick = cancelReply;
  preview.append(cancel);
  $('#send-form').before(preview);
  $('#message').focus();
}
function addReplyButton(bubble, name) {
  const button = el('button', 'chat-reply', '↩');
  button.type = 'button';
  button.setAttribute('aria-label', 'Reply to ' + name);
  button.onclick = () => selectReply(bubble, name);
  bubble.append(button);
}
function replyQuote(reply) {
  const quote = el('div', 'reply-quote');
  quote.append(el('div', 'reply-author', '↪ ' + reply.name));
  // Preserve the full signed URL: truncating it breaks Discord attachments.
  quote.append(renderChatContent(reply.text));
  return quote;
}
function sendChat(event) {
  event.preventDefault();
  if (!twitchUser || !token) {
    login();
    return;
  }
  const text = $('#message')
    .value.trim()
    .replace(/[\r\n]/g, ' ');
  if (!text) return;
  if (socket?.readyState !== 1) {
    toast('Chat is reconnecting. Please try again.');
    return;
  }
  if (outgoing) {
    toast('Please wait for the previous message result.');
    return;
  }
  try {
    socket.send(
      (replyTarget ? '@reply-parent-msg-id=' + replyTarget.id + ' ' : '') +
        'PRIVMSG #' +
        room +
        ' :' +
        text
    );
  } catch {
    toast('Message could not be sent. Please try again.');
    return;
  }
  const bubble = message(
    twitchUser.display_name || twitchUser.login,
    text,
    '',
    true,
    twitchUser.login,
    Date.now(),
    twitchUser.badges || '',
    twitchUser.color || '',
    replyTarget
  );
  const status = el('small', 'send-status', 'Submitted · awaiting Twitch confirmation');
  bubble.append(status);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  const pending = {
    text,
    bubble,
    status,
    name: twitchUser.display_name || twitchUser.login,
    badges: twitchUser.badges || '',
    color: twitchUser.color || '',
    login: twitchUser.login
  };
  pending.reply = replyTarget;
  if (typeof emotePanel !== 'undefined' && emotePanel) emotePanel.hidden = true;
  cancelReply();
  outgoing = pending;
  pending.timer = setTimeout(() => {
    if (outgoing === pending) {
      status.textContent = 'Delivery not confirmed';
      outgoing = null;
    }
  }, 10000);
  $('#message').value = '';
}
function outgoingResult(line, tags) {
  if (!outgoing) return;
  // Twitch supplies an id in USERSTATE after a successful PRIVMSG.
  if (line.includes(' USERSTATE #' + room) && tags.id) {
    const p = outgoing;
    if (tags['display-name']) p.name = tags['display-name'];
    outgoing = null;
    clearTimeout(p.timer);
    p.bubble.dataset.id = tags.id;
    addReplyButton(p.bubble, p.name || p.login);
    p.status.remove();
    if (typeof rememberChat === 'function')
      rememberChat(
        p.name || p.login,
        p.text,
        tags.id,
        true,
        p.login,
        Date.now(),
        tags.badges ?? p.badges ?? '',
        tags.color || p.color || '',
        p.reply
      );
    trackChatter(p.name || p.login, p.login, tags.id);
  } else if (
    line.includes(' NOTICE ') &&
    (/^(msg_|no_permission|tos_ban)/.test(tags['msg-id'] || '') ||
      /authentication failed/i.test(line))
  ) {
    const p = outgoing;
    outgoing = null;
    clearTimeout(p.timer);
    p.status.textContent = 'Not sent: ' + line.split(' :').pop();
  }
}

function openChatProfile(name, login) {
  if (!/^[a-z0-9_]{1,25}$/i.test(login)) return;
  document.querySelector('#chat-profile')?.remove();
  const english = document.documentElement.lang === 'en';
  const popup = el('dialog', 'chat-profile');
  popup.id = 'chat-profile';
  popup.setAttribute('aria-labelledby', 'chat-profile-name');
  const heading = el('h2', '', name);
  heading.id = 'chat-profile-name';
  const close = el('button', '', '×');
  close.type = 'button';
  close.setAttribute('aria-label', english ? 'Close' : '關閉');
  close.onclick = () => popup.close();
  const header = el('div', 'modal-top');
  header.append(heading, close);
  popup.append(header);
  if (name.toLowerCase() !== login.toLowerCase()) popup.append(el('p', '', login));
  const link = el('a', 'profile-twitch-link', english ? 'Open Twitch page ↗' : '前往 Twitch 頁面 ↗');
  link.href = 'https://www.twitch.tv/' + encodeURIComponent(login.toLowerCase());
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  popup.append(link);
  popup.addEventListener('click', (event) => {
    if (event.target !== popup) return;
    const rect = popup.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) popup.close();
  });
  popup.addEventListener('close', () => popup.remove(), { once: true });
  document.body.append(popup);
  popup.showModal();
}