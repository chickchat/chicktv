function goshEndpoint(channel) {
  const base = window.CHICKTV_CONFIG.apiBaseUrl.trim();
  if (!base && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))
    throw Error("Set apiBaseUrl in config.js before hosting");
  const url = new URL(
    (base ? base.replace(/\/$/, "") : location.origin) + "/api/gosh",
  );
  if (!window.CHICKTV_CONFIG.backendEnabled)
    throw Error("Backend must use HTTPS");
  url.searchParams.set("channel", channel);
  return url.href;
}
const $ = (s) => document.querySelector(s),
  room = "whitewing940920";
let channels = [],
  screens = [0],
  screenIncludeOffline = [false],
  hideOfflineChannels = true,
  selected = 0,
  screenOfflineChannelKeys = new Set(),
  editingPersonalChannel = -1,
  players = [],
  socket,
  retry,
  twitchUser = null,
  token = null;
const saved = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
hideOfflineChannels = saved("chick-hide-offline-channels", true);
function updateOfflineFilterButton() {
  const button = $("#hide-offline");
  if (!button) return;
  button.textContent = hideOfflineChannels ? "Show offline" : "Hide offline";
  button.setAttribute("aria-pressed", String(hideOfflineChannels));
  const traditionalChinese = document.documentElement.lang === "zh-Hant";
  button.title = hideOfflineChannels
    ? traditionalChinese
      ? "顯示離線頻道"
      : "Show offline channels"
    : traditionalChinese
      ? "隱藏離線頻道"
      : "Hide offline channels";
}
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4000);
}
function persist() {
  try {
    localStorage.setItem(
      "chick-channels",
      JSON.stringify(channels.filter((c) => c.custom)),
    );
  } catch {
    toast("Browser storage is unavailable. Changes last for this visit.");
  }
}
function renderTabs() {
  const rail = $("#channels");
  rail.replaceChildren();
  $("#personal-channels")?.replaceChildren();
  channels.forEach((c, i) => {
    if (hideOfflineChannels && screenOfflineChannelKeys.has(screenChannelKey(c)))
      return;
    const b = el(
      "button",
      "channel" + (screens[selected] === i ? " active" : ""),
    );
    b.append(
      el(
        "span",
        "provider " + c.platform,
        c.platform === "twitch" ? "▣" : c.platform === "m3u8" ? "G" : "K",
      ),
      document.createTextNode(c.displayname),
    );
    b.onclick = () => {
      userChoseChannel = true;
      screens[selected] = i;
      renderScreens();
      renderTabs();
    };
    (c.custom ? $("#personal-channels") : rail).append(b);
  });
  const visibleCount = channels.filter(
    (channel) =>
      !hideOfflineChannels ||
      !screenOfflineChannelKeys.has(screenChannelKey(channel)),
  ).length;
  $("#channel-count").textContent = visibleCount + " channels";
}
function sourceUrl(c) {
  if (c.platform === "m3u8")
    return "https://gosh.com/" + encodeURIComponent(c.details);
  if (c.platform === "twitch") return "https://www.twitch.tv/" + c.details;
  return c.original || c.url;
}
function state(wrap, title, detail, c) {
  wrap.replaceChildren();
  const box = el("div", "player-state");
  box.append(
    el("div", "symbol", "◉"),
    el("h3", "", title),
    el("p", "", detail),
  );
  if (c) {
    const a = el("a", "", "Open original channel ↗");
    a.href = sourceUrl(c);
    a.target = "_blank";
    a.rel = "noopener";
    box.append(a);
  }
  wrap.append(box);
}
function screenChannelKey(channel) {
  return (
    channel.identityKey ||
    channel.platform + ":" + (channel.details || channel.original || channel.url)
  );
}
function screenPlayerKey(channel) {
  return JSON.stringify([
    channel.platform,
    channel.details || channel.url || channel.original,
  ]);
}
function populateScreenChannelSelect(select, slot) {
  const currentIndex = screens[slot];
  const available = channels
    .map((channel, index) => ({ channel, index }))
    .filter(
      ({ channel }) =>
        screenIncludeOffline[slot] ||
        !screenOfflineChannelKeys.has(screenChannelKey(channel)),
    );
  const currentAvailable = available.some(({ index }) => index === currentIndex);
  select.replaceChildren();
  if (!currentAvailable) {
    const placeholder = el(
      "option",
      "",
      available.length
        ? "Choose an available channel"
        : "No channels are currently available",
    );
    placeholder.value = "";
    placeholder.disabled = true;
    select.append(placeholder);
  }
  available.forEach(({ channel, index }) => {
    const offline = screenOfflineChannelKeys.has(screenChannelKey(channel));
    const option = el(
      "option",
      "",
      channel.displayname + (offline ? " · Offline" : ""),
    );
    option.value = String(index);
    select.append(option);
  });
  select.value = currentAvailable ? String(currentIndex) : "";
}
function updateScreenChannelOptions(offlineKeys) {
  screenOfflineChannelKeys = new Set(offlineKeys);
  document.querySelectorAll(".screen-channel-select").forEach((select) => {
    const slot = Number(select.closest(".screen")?.dataset.slot);
    populateScreenChannelSelect(select, slot);
  });
}
updateOfflineFilterButton();
$("#hide-offline").onclick = () => {
  hideOfflineChannels = !hideOfflineChannels;
  try {
    localStorage.setItem(
      "chick-hide-offline-channels",
      JSON.stringify(hideOfflineChannels),
    );
  } catch {}
  updateOfflineFilterButton();
  renderTabs();
};
function renderScreens() {
  const grid = $("#screens");
  // Keep unchanged players connected so adding a screen preserves mute and playback.
  [...grid.children].forEach((card, slot) => {
    const channel = channels[screens[slot]];
    if (!channel || card.dataset.playerKey !== screenPlayerKey(channel)) {
      card.querySelector(".video-wrap")?._hls?.destroy();
      card.remove();
    }
  });
  grid.classList.toggle("multi", screens.length > 1);
  screens.forEach((idx, slot) => {
    const existing = grid.querySelector(`[data-slot="${slot}"]`);
    if (existing) {
      existing.classList.toggle("selected", selected === slot);
      existing.querySelector(".remove-screen").hidden = screens.length === 1;
      populateScreenChannelSelect(
        existing.querySelector(".screen-channel-select"),
        slot,
      );
      return;
    }
    const c = channels[idx],
      card = el("article", "screen" + (selected === slot ? " selected" : ""));
    card.dataset.slot = String(slot);
    card.dataset.playerKey = screenPlayerKey(c);
    card.tabIndex = 0;
    card.setAttribute(
      "aria-label",
      "Screen " + (slot + 1) + ": " + c.displayname,
    );
    card.onfocus = () => select(slot);
    card.onclick = () => select(slot);
    const bar = el("div", "screen-bar");
    const choose = el(
      "button",
      "screen-label",
      "SCREEN " + String(slot + 1).padStart(2, "0"),
    );
    choose.onclick = () => select(slot);
    const channelSelect = el("select", "screen-channel-select");
    channelSelect.setAttribute(
      "aria-label",
      "Select channel for screen " + (slot + 1),
    );
    populateScreenChannelSelect(channelSelect, slot);
    channelSelect.onclick = (event) => event.stopPropagation();
    channelSelect.onchange = () => {
      userChoseChannel = true;
      selected = slot;
      screens[slot] = Number(channelSelect.value);
      renderScreens();
      renderTabs();
    };
    const channelFilter = el("select", "screen-channel-filter");
    channelFilter.setAttribute("aria-label", "Channel status filter");
    channelFilter.title = "Choose whether to include offline channels";
    for (const [value, label] of [
      ["online", "Hide offline"],
      ["all", "All"],
    ]) {
      const option = el("option", "", label);
      option.value = value;
      channelFilter.append(option);
    }
    channelFilter.value = screenIncludeOffline[slot] ? "all" : "online";
    channelFilter.onclick = (event) => event.stopPropagation();
    channelFilter.onchange = () => {
      screenIncludeOffline[slot] = channelFilter.value === "all";
      populateScreenChannelSelect(channelSelect, slot);
    };
    bar.append(
      choose,
      channelSelect,
      channelFilter,
      el(
        "span",
        "source",
        c.platform === "m3u8"
          ? "GOSH"
          : c.platform === "twitch"
            ? "TWITCH"
            : "LIVE PLAYER",
      ),
    );
    const full = el("button", "", "⛶");
    full.title = "Fullscreen";
    full.onclick = (e) => {
      e.stopPropagation();
      card
        .requestFullscreen?.()
        .catch(() => toast("Fullscreen is unavailable"));
    };
    bar.append(full);
    {
      const close = el("button", "remove-screen", "×");
      close.hidden = screens.length === 1;
      close.title = "Remove screen";
      close.onclick = (e) => {
        e.stopPropagation();
        screens.splice(slot, 1);
        screenIncludeOffline.splice(slot, 1);
        selected = Math.min(selected, screens.length - 1);
        renderScreens();
        renderTabs();
      };
      bar.append(close);
    }
    const wrap = el("div", "video-wrap");
    card.append(bar, wrap);
    const following = [...grid.children].find(
      (node) => Number(node.dataset.slot) > slot,
    );
    grid.insertBefore(card, following || null);
    mountPlayer(c, wrap, slot);
  });
  $("#screen-count").textContent =
    screens.length + " screen" + (screens.length > 1 ? "s" : "");
}
function select(slot) {
  selected = slot;
  document
    .querySelectorAll(".screen")
    .forEach((c, i) => c.classList.toggle("selected", i === slot));
  renderTabs();
}
async function mountPlayer(c, wrap, slot) {
  if (c.platform === "m3u8") {
    state(wrap, "Connecting to " + c.displayname, "Finding the live stream…");
    try {
      const res = await fetch(goshEndpoint(c.details));
      if (!res.ok) throw Error();
      const data = await res.json();
      if (!wrap.isConnected) return;
      if (!data.isLive || !data.m3u8Url) {
        state(
          wrap,
          "Taking a little break",
          "This channel is currently offline.",
          c,
        );
        return;
      }
      playVideo(data.m3u8Url, wrap, slot, c);
    } catch {
      if (wrap.isConnected)
        state(
          wrap,
          "Stream unavailable",
          "The provider could not be reached. Try the original channel or select another.",
          c,
        );
    }
    return;
  }
  if (c.platform === "video") {
    playVideo(c.url, wrap, slot, c);
    return;
  }
  let url = providerPlayerUrl(c.url);
  const kickUrl = new URL(url);
  if (kickUrl.hostname === "player.kick.com")
    kickUrl.searchParams.set("muted", "true");
  if (kickUrl.hostname === "player.kick.com") url = kickUrl.href;
  if (c.platform === "twitch")
    url =
      "https://player.twitch.tv/?channel=" +
      encodeURIComponent(c.details) +
      "&parent=" +
      encodeURIComponent(location.hostname) +
      "&muted=true";
  const frame = el("iframe");
  frame.title = c.displayname + " live player";
  frame.src = url;
  frame.allow = "autoplay; fullscreen; picture-in-picture";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  if (kickUrl.hostname === "player.kick.com") {
    let muted = true;
    const sound = el("button", "kick-sound", "🔊 Enable sound");
    sound.type = "button";
    sound.title = "Changes sound by reloading this Kick player";
    sound.onclick = (event) => {
      event.stopPropagation();
      muted = !muted;
      kickUrl.searchParams.set("muted", String(muted));
      frame.src = kickUrl.href;
      sound.textContent = muted ? "🔊 Enable sound" : "🔇 Mute sound";
    };
    wrap.closest(".screen").querySelector(".screen-bar").append(sound);
  }
  wrap.append(frame);
}
function playVideo(url, wrap, slot, c) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw Error("HTTPS required");
  wrap.replaceChildren();
  const video = el("video");
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  wrap.append(video);
  video.onerror = () =>
    state(
      wrap,
      "Playback unavailable",
      "The stream may be offline or blocked by its provider.",
      c,
    );
  if (/\.m3u8/i.test(url) && window.Hls?.isSupported()) {
    const h = new Hls();
    wrap._hls = h;
    h.loadSource(url);
    h.attachMedia(video);
    h.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) {
        h.destroy();
        if (wrap.isConnected)
          state(
            wrap,
            "Playback unavailable",
            "The stream could not be loaded. Try another channel.",
            c,
          );
      }
    });
  } else video.src = url;
}
$("#add-screen").onclick = () => {
  if (screens.length >= 4) {
    toast("You can watch up to four screens at once.");
    return;
  }
  const next = nextScreenChannel(
    channels,
    screens,
    screens[selected],
    (channel) => liveStates.get(channelKey(channel)) === true,
  );
  if (next < 0) {
    toast("No additional online channel is available.");
    return;
  }
  userChoseChannel = true;
  screens.push(next);
  screenIncludeOffline.push(false);
  selected = screens.length - 1;
  renderScreens();
  renderTabs();
  toast("Screen added. Choose a channel from the top.");
};
$("#add-channel").onclick = () => $("#channel-dialog").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
function updateChannelSourceFields() {
  const gosh = $("#channel-provider").value === "gosh";
  for (const [selector, active] of [
    ["#channel-gosh-field", gosh],
    ["#channel-url-field", !gosh],
  ]) {
    const field = $(selector);
    field.hidden = !active;
    field.style.display = active ? "" : "none";
    const input = field.querySelector("input");
    input.disabled = !active;
    input.required = active;
  }
}
$("#channel-provider").onchange = updateChannelSourceFields;
$("#channel-form").addEventListener("reset", () =>
  queueMicrotask(updateChannelSourceFields),
);
updateChannelSourceFields();
$("#channel-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  let c;
  if (f.get("provider") === "gosh") {
    const id = String(f.get("goshId") || "").trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      toast("Enter a valid Gosh channel ID.");
      return;
    }
    c = {
      displayname: f.get("name").trim(),
      provider: "gosh",
      goshId: id,
      platform: "m3u8",
      details: id,
      url: "",
      original: "https://gosh.com/" + id,
      custom: true,
    };
  } else {
    let u;
    try {
      u = new URL(f.get("url"));
    } catch {
      toast("Enter a valid channel URL.");
      return;
    }
    if (u.protocol !== "https:") {
      toast("Please use a secure HTTPS URL.");
      return;
    }
    c = {
      displayname: f.get("name").trim(),
      url: u.href,
      original: u.href,
      platform: "embed",
      custom: true,
    };
    if (!c.displayname) return;
    const host = u.hostname.replace(/^www\./, "");
    if (host === "twitch.tv") {
      c.platform = "twitch";
      c.details = u.pathname.split("/")[1];
      if (!/^[a-z0-9_]+$/i.test(c.details || "")) {
        toast("Enter a Twitch channel URL.");
        return;
      }
    } else if (host === "kick.com") {
      const name = u.pathname.split("/")[1];
      if (!/^[a-z0-9_-]+$/i.test(name || "")) {
        toast("Enter a Kick channel URL.");
        return;
      }
      c.url = "https://player.kick.com/" + name;
      c.platform = "vl";
    } else if (["youtube.com", "youtu.be", "m.youtube.com"].includes(host)) {
      const id =
        host === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v") || u.pathname.split("/").pop();
      if (!/^[\w-]{11}$/.test(id || "")) {
        toast("Use a YouTube video or live video URL.");
        return;
      }
      c.url = "https://www.youtube.com/embed/" + id;
    } else if (/\.(m3u8|mp4|webm)$/i.test(u.pathname)) c.platform = "video";
    c.url = providerPlayerUrl(c.url);
  }
  if (!c.displayname) return;
  if (
    !requestMode &&
    c.platform === "m3u8" &&
    channels.some(
      (channel, index) =>
        index !== editingPersonalChannel &&
        channel.platform === "m3u8" &&
        channel.details === c.details,
    )
  ) {
    toast("This Gosh channel is already listed.");
    return;
  }
  if (requestMode) {
    await submitRequest(c);
    return;
  }
  if (editingPersonalChannel >= 0) {
    const previous = channels[editingPersonalChannel];
    if (!previous?.custom) {
      editingPersonalChannel = -1;
      toast("This personal channel is no longer available to edit.");
      return;
    }
    c.identityKey = previous.identityKey || screenChannelKey(previous);
    channels[editingPersonalChannel] = c;
    editingPersonalChannel = -1;
    persist();
    renderTabs();
    renderScreens();
    void checkAvailability(false);
    $("#channel-dialog").close();
    e.target.reset();
    toast("Personal channel updated in this browser.");
    return;
  }
  channels.push(c);
  persist();
  screens[selected] = channels.length - 1;
  renderTabs();
  renderScreens();
  $("#channel-dialog").close();
  e.target.reset();
  toast("Channel added to your browser.");
};
$("#layout").onclick = () => {
  const grid = $("#screens");
  grid.classList.toggle("multi");
  $("#layout").textContent = grid.classList.contains("multi")
    ? "▤ Stacked view"
    : "▦ Grid view";
};
$("#theater").onclick = () => {
  document.body.classList.toggle("theater");
  $("#theater").textContent = document.body.classList.contains("theater")
    ? "⛶ Exit theater"
    : "⛶ Theater mode";
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.body.classList.remove("theater");
});
function message(
  name,
  text,
  id = "",
  self = false,
  login = "",
  at = Date.now(),
  badges = "",
  color = "",
  reply = null,
) {
  const externalReply = parseExternalReply(text);
  text = externalReply.text;
  if (!reply && externalReply.login)
    reply = resolveExternalReply(externalReply);
  reply = normalizeReplyChain(reply);
  if (!restoringHistory && !self) trackChatter(name, login, id);
  if (!self)
    rememberChat(name, text, id, self, login, at, badges, color, reply);
  const list = $("#messages");
  $(".welcome")?.remove();
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 100,
    b = el("div", "bubble" + (self ? " self" : ""));
  b.dataset.id = id;
  b.dataset.login = login;
  b.dataset.text = text;
  b.chatReply = reply;
  b.chatName = name;
  b.dataset.at = String(at);
  b.dataset.receivedAt = String(Date.now());
  b.dataset.localTimestamp = String(self);
  if (reply?.id) b.append(replyQuote(reply));
  const author = el("div", "chat-author");
  applyChatColor(author, color);
  author.append(badgeStrip(badges), el("strong", "", name));
  const username = el("span", "chat-username", " (" + (login || name) + ")");
  username.hidden = !login || name.toLowerCase() === login.toLowerCase();
  author.append(username);
  if (/^[a-z0-9_]{1,25}$/i.test(login)) {
    author.setAttribute("role", "button");
    author.tabIndex = 0;
    author.setAttribute("aria-haspopup", "dialog");
    author.onclick = () => openChatProfile(name, login, author);
    author.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openChatProfile(name, login, author);
      }
    };
  }
  const body = renderChatContent(text);
  body.classList.add("chat-body");
  b.append(
    author,
    body,
    el(
      "time",
      "",
      new Date(at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    ),
  );
  list.append(b);
  if (id) addReplyButton(b, name);
  if (!restoringHistory) pruneChatMessages();
  if (near) list.scrollTop = list.scrollHeight;
  return b;
}
function connect() {
  clearTimeout(retry);
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  $("#connection").textContent = "Connecting…";
  socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  socket.onopen = () => {
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    if (token && twitchUser) {
      socket.send("PASS oauth:" + token);
      socket.send("NICK " + twitchUser.login);
    } else
      socket.send(
        "NICK justinfan" + Math.floor(Math.random() * 900000 + 10000),
      );
    socket.send("JOIN #" + room);
  };
  socket.onmessage = (event) => {
    for (const line of event.data.split("\r\n")) {
      if (line.startsWith("PING")) {
        socket.send("PONG :tmi.twitch.tv");
        continue;
      }
      if (line.includes(" 366 ") || line.includes(" ROOMSTATE "))
        $("#connection").textContent = "Connected";
      const tags = {};
      if (line.startsWith("@"))
        line
          .split(" ")[0]
          .slice(1)
          .split(";")
          .forEach((t) => {
            const [k, ...v] = t.split("=");
            tags[k] = v.join("=").replace(/\\s/g, " ").replace(/\\:/g, ";");
          });
      if (twitchUser && tags["display-name"] && line.includes(" USERSTATE ")) {
        twitchUser.display_name = tags["display-name"];
        refreshChatDisplayName(twitchUser.login, twitchUser.display_name);
      }
      if (twitchUser && line.includes(" USERSTATE ") && tags.color)
        updateChatColor(twitchUser.login, tags.color);
      if (line.includes(" USERSTATE ") && typeof tags.badges === "string")
        updateOwnBadges(tags.badges);
      moderateChatHistory(line, tags);
      outgoingResult(line, tags);
      const m = line.match(/:([^! ]+)!.* PRIVMSG #[^ ]+ :(.*)/);
      if (m) learnTwitchEmotes(m[2], tags.emotes);
      if (m)
        message(
          tags["display-name"] || m[1],
          m[2],
          tags.id,
          false,
          m[1],
          Number(tags["tmi-sent-ts"]) || Date.now(),
          tags.badges || "",
          tags.color || "",
          tags["reply-parent-msg-id"]
            ? {
                id: tags["reply-parent-msg-id"],
                name:
                  tags["reply-parent-display-name"] ||
                  tags["reply-parent-user-login"] ||
                  "",
                text: tags["reply-parent-msg-body"] || "",
              }
            : null,
        );
      if (m && tags.color) updateChatColor(m[1], tags.color);
      if (line.includes(" CLEARMSG "))
        document.querySelectorAll(".bubble").forEach((b) => {
          if (b.dataset.id === tags["target-msg-id"]) b.remove();
        });
      if (line.includes(" CLEARCHAT ")) {
        const login = line.match(/ CLEARCHAT #[^ ]+ :(.+)/)?.[1];
        document.querySelectorAll(".bubble").forEach((b) => {
          if (!login || b.dataset.login === login) b.remove();
        });
      }
      if (line.includes(" NOTICE ")) toast(line.split(" :").pop());
      if (line.includes(" RECONNECT ")) socket.close();
    }
  };
  socket.onerror = () =>
    ($("#connection").textContent = "Connection unavailable");
  socket.onclose = () => {
    $("#connection").textContent = "Reconnecting…";
    retry = setTimeout(connect, 8000);
  };
}
$("#send-form").onsubmit = sendChat;
const redirect = new URL("./", location.href).href;
$("#login").onclick = login;
async function start() {
  try {
    const res = await fetch("channels.json");
    channels = [...(await res.json()), ...saved("chick-channels", [])];
    renderTabs();
    renderScreens();
    const featuresReady = initFeatures();
    restoreChatHistory();
    await auth();
    void checkAvailability(false);
    connect();
    await featuresReady;
  } catch (error) {
    console.error(error);
    toast("Preview init error: " + String(error?.message || error));
  }
}
start();
