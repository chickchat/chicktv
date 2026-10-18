// Some chat clients encode replies in the message body instead of Twitch tags.
function parseExternalReply(text) {
  const match = typeof text === 'string' && text.match(/^\[r\]([a-z0-9_]{1,25}),(\d{13})\[m\]\s?/i);
  return match ? { text: text.slice(match[0].length), login: match[1], at: Number(match[2]) } : { text };
}
function resolveExternalReply(marker) {
  const loaded = [...(document.querySelector('#messages')?.querySelectorAll('.bubble') || [])].find(
    (bubble) => bubble.dataset.login?.toLowerCase() === marker.login.toLowerCase() && Number(bubble.dataset.at) === marker.at
  );
  if (loaded?.dataset.id) return { id: loaded.dataset.id, name: loaded.chatName || marker.login, text: loaded.dataset.text };
  const savedMessage = typeof readChatHistory === 'function' && readChatHistory().find(
    (row) => row.id && row.login.toLowerCase() === marker.login.toLowerCase() && row.at === marker.at
  );
  if (savedMessage) return { id: savedMessage.id, name: savedMessage.name, text: savedMessage.text, ancestors: savedMessage.reply ? [...(savedMessage.reply.ancestors || []), savedMessage.reply] : [] };
  return { id: 'external-' + marker.login.toLowerCase() + '-' + marker.at, name: marker.login, text: document.documentElement.lang === 'en' ? 'Original message is not loaded.' : '原訊息未載入。' };
}
let outgoing = null;
let replyTarget = null;
function cancelReply() {
  replyTarget = null;
  document.querySelector("#reply-preview")?.remove();
}
function selectReply(bubble, name) {
  if (!/^[\w-]+$/.test(bubble.dataset.id || "")) return;
  cancelReply();
  replyTarget = normalizeReplyChain({ id: bubble.dataset.id, name, text: bubble.dataset.text });
  const preview = el("div", "reply-preview");
  preview.id = "reply-preview";
  preview.append(replyQuote(replyTarget));
  const cancel = el("button", "", "×");
  cancel.type = "button";
  cancel.setAttribute("aria-label", "Cancel reply");
  cancel.onclick = cancelReply;
  preview.append(cancel);
  $("#send-form").before(preview);
  $("#message").focus();
}
function addReplyButton(bubble, name) {
  const button = el("button", "chat-reply", "↩");
  button.type = "button";
  button.setAttribute("aria-label", "Reply to " + name);
  button.onclick = () => selectReply(bubble, name);
  bubble.append(button);
}
function jumpToReplyMessage(id) {
  const list = document.querySelector('#messages');
  const target = [...(list?.querySelectorAll('.bubble') || [])].find(
    (bubble) => bubble.dataset.id === id
  );
  if (!target) {
    toast(document.documentElement.lang === 'en'
      ? 'The original message is no longer available in this chat.'
      : '原訊息已不在目前的聊天紀錄中。');
    return;
  }
  list.querySelectorAll('.reply-jump-highlight').forEach((bubble) => bubble.classList.remove('reply-jump-highlight'));
  const listRect = list.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  list.scrollTo({
    top: list.scrollTop + targetRect.top - listRect.top - (list.clientHeight - targetRect.height) / 2,
    behavior: reducedMotion ? 'instant' : 'smooth'
  });
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.classList.add('reply-jump-highlight');
  clearTimeout(target.replyJumpTimer);
  target.replyJumpTimer = setTimeout(() => target.classList.remove('reply-jump-highlight'), 1800);
}
function normalizeReplyChain(reply) {
  if (!reply || typeof reply.id !== 'string' || !reply.id || typeof reply.name !== 'string' || typeof reply.text !== 'string') return null;
  const validItem = (item) => item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && typeof item.text === 'string';
  const parent = [...(document.querySelector('#messages')?.querySelectorAll('.bubble') || [])].find((bubble) => bubble.dataset.id === reply.id);
  const previous = parent?.chatReply;
  const source = previous ? [...(previous.ancestors || []), previous] : (Array.isArray(reply.ancestors) ? reply.ancestors : []);
  const seen = new Set([reply.id]);
  const ancestors = [];
  for (const item of source.slice(-199)) {
    if (!validItem(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    ancestors.push({ id: item.id.slice(0, 100), name: item.name.slice(0, 100), text: item.text.slice(0, 2000) });
  }
  return { id: reply.id.slice(0, 100), name: reply.name.slice(0, 100), text: reply.text.slice(0, 2000), ancestors };
}
function replyQuote(reply) {
  const normalized = normalizeReplyChain(reply);
  if (!normalized) return el('div', 'reply-quote');
  const chain = el('div', 'reply-chain');
  chain.setAttribute('role', 'group');
  chain.setAttribute('aria-label', document.documentElement.lang === 'en' ? 'Conversation being replied to' : '回覆的對話紀錄');
  for (const item of [...normalized.ancestors, normalized]) chain.append(singleReplyQuote(item));
  return chain;
}
function singleReplyQuote(reply) {
  const quote = el('div', 'reply-quote');
  quote.append(el('div', 'reply-author', '↪ ' + reply.name));
  // Preserve the full signed URL: truncating it breaks Discord attachments.
  quote.append(renderChatContent(parseExternalReply(reply.text).text));
  if (typeof reply.id === 'string' && reply.id) {
    quote.tabIndex = 0;
    quote.setAttribute('role', 'link');
    quote.setAttribute('aria-label', document.documentElement.lang === 'en'
      ? 'Jump to original message from ' + reply.name
      : '跳至 ' + reply.name + ' 的原訊息');
    quote.onclick = (event) => {
      if (event.target.closest('a, button, video, iframe')) return;
      jumpToReplyMessage(reply.id);
    };
    quote.onkeydown = (event) => {
      if (event.target !== quote || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      jumpToReplyMessage(reply.id);
    };
  }
  return quote;
}
function sendChat(event) {
  event.preventDefault();
  if (!twitchUser || !token) {
    login();
    return;
  }
  const text = $("#message")
    .value.trim()
    .replace(/[\r\n]/g, " ");
  if (!text) return;
  if (socket?.readyState !== 1) {
    toast("Chat is reconnecting. Please try again.");
    return;
  }
  if (outgoing) {
    toast("Please wait for the previous message result.");
    return;
  }
  try {
    socket.send(
      (replyTarget ? "@reply-parent-msg-id=" + replyTarget.id + " " : "") +
        "PRIVMSG #" +
        room +
        " :" +
        text,
    );
  } catch {
    toast("Message could not be sent. Please try again.");
    return;
  }
  const bubble = message(
    twitchUser.display_name || twitchUser.login,
    text,
    "",
    true,
    twitchUser.login,
    Date.now(),
    twitchUser.badges || "",
    twitchUser.color || "",
    replyTarget,
  );
  const status = el(
    "small",
    "send-status",
    "Submitted · awaiting Twitch confirmation",
  );
  bubble.append(status);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  const pending = {
    text,
    bubble,
    status,
    name: twitchUser.display_name || twitchUser.login,
    badges: twitchUser.badges || "",
    color: twitchUser.color || "",
    login: twitchUser.login,
  };
  pending.reply = replyTarget;
  if (typeof emotePanel !== "undefined" && emotePanel) emotePanel.hidden = true;
  cancelReply();
  outgoing = pending;
  pending.timer = setTimeout(() => {
    if (outgoing === pending) {
      status.textContent = "Delivery not confirmed";
      outgoing = null;
    }
  }, 10000);
  $("#message").value = "";
}
function outgoingResult(line, tags) {
  if (!outgoing) return;
  // Twitch supplies an id in USERSTATE after a successful PRIVMSG.
  if (line.includes(" USERSTATE #" + room) && tags.id) {
    const p = outgoing;
    if (tags["display-name"]) p.name = tags["display-name"];
    outgoing = null;
    clearTimeout(p.timer);
    p.bubble.dataset.id = tags.id;
    addReplyButton(p.bubble, p.name || p.login);
    p.status.remove();
    if (typeof rememberChat === "function")
      rememberChat(
        p.name || p.login,
        p.text,
        tags.id,
        true,
        p.login,
        Date.now(),
        tags.badges ?? p.badges ?? "",
        tags.color || p.color || "",
        p.reply,
      );
    trackChatter(p.name || p.login, p.login, tags.id);
  } else if (
    line.includes(" NOTICE ") &&
    (/^(msg_|no_permission|tos_ban)/.test(tags["msg-id"] || "") ||
      /authentication failed/i.test(line))
  ) {
    const p = outgoing;
    outgoing = null;
    clearTimeout(p.timer);
    p.status.textContent = "Not sent: " + line.split(" :").pop();
  }
}

function openChatProfile(name, login, anchor) {
  if (!/^[a-z0-9_]{1,25}$/i.test(login) || !anchor?.isConnected) return;
  document.querySelector("#chat-profile")?.hidePopover();
  document.querySelector("#chat-profile")?.remove();
  const english = document.documentElement.lang === "en";
  const popup = el("div", "chat-profile");
  popup.id = "chat-profile";
  popup.setAttribute("popover", "auto");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-labelledby", "chat-profile-name");
  const heading = el("h2", "", name);
  heading.id = "chat-profile-name";
  const close = el("button", "", "×");
  close.type = "button";
  close.setAttribute("aria-label", english ? "Close" : "關閉");
  close.onclick = () => popup.hidePopover();
  const header = el("div", "modal-top");
  header.append(heading, close);
  popup.append(header);
  if (name.toLowerCase() !== login.toLowerCase())
    popup.append(el("p", "", login));
  const link = el(
    "a",
    "profile-twitch-link",
    english ? "Open Twitch page ↗" : "前往 Twitch 頁面 ↗",
  );
  link.href =
    "https://www.twitch.tv/" + encodeURIComponent(login.toLowerCase());
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  popup.append(link);
  const dismiss = () => {
    if (popup.isConnected) popup.hidePopover();
  };
  const onScroll = (event) => {
    if (!popup.contains(event.target)) dismiss();
  };
  popup.addEventListener("toggle", (event) => {
    if (event.newState !== "closed") return;
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", dismiss);
    anchor.setAttribute("aria-expanded", "false");
    popup.remove();
  });
  document.body.append(popup);
  popup.showPopover();
  const rect = anchor.getBoundingClientRect();
  const gap = 6,
    margin = 8;
  popup.style.left =
    Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - popup.offsetWidth - margin),
    ) + "px";
  const below = window.innerHeight - rect.bottom - gap - margin;
  const top =
    below >= popup.offsetHeight
      ? rect.bottom + gap
      : Math.max(margin, rect.top - popup.offsetHeight - gap);
  popup.style.top = top + "px";
  anchor.setAttribute("aria-expanded", "true");
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", dismiss);
}
