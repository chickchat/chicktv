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
  screenPinned = [false],
  screenPinnedKeys = [null],
  screenIncludeOffline = [false],
  hideOfflineChannels = true,
  selected = 0,
  screenOfflineChannelKeys = new Set(),
  screenOnlineChannelKeys = new Set(),
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
      ? "顯示離線或狀態未確認的頻道"
      : "Show offline or unverified channels"
    : traditionalChinese
      ? "只顯示已確認在線的頻道"
      : "Show only confirmed online channels";
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
    if (hideOfflineChannels && !screenOnlineChannelKeys.has(screenChannelKey(c)))
      return;
    const b = el(
      "button",
      "channel" + (screens[selected] === i ? " active" : ""),
    );
    b.dataset.channelKey = screenChannelKey(c);
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
      screenPinnedKeys[selected] = screenPinned[selected] ? screenChannelKey(channels[i]) : null;
      renderScreens();
      renderTabs();
    };
    (c.custom ? $("#personal-channels") : rail).append(b);
  });

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
let pinnedFallbackEnabled = saved("chick-pin-fallback", false) === true;
function updatePinnedFallbackButton() {
  const button = $("#pin-fallback");
  button.setAttribute("aria-pressed", String(pinnedFallbackEnabled));
}
updatePinnedFallbackButton();
$("#pin-fallback").onclick = () => {
  pinnedFallbackEnabled = !pinnedFallbackEnabled;
  try { localStorage.setItem("chick-pin-fallback", JSON.stringify(pinnedFallbackEnabled)); }
  catch { toast("Browser storage is unavailable. Changes last for this visit."); }
  updatePinnedFallbackButton();
  if (pinnedFallbackEnabled) applyPinnedFallback();
  else {
    screenPinnedKeys.forEach((key, slot) => {
      const index = channels.findIndex(channel => screenChannelKey(channel) === key);
      if (screenPinned[slot] && index >= 0) screens[slot] = index;
    });
    renderScreens();
    renderTabs();
  }
  renderPinnedReplacements();
};
const playbackCooldowns = new Map();
function playbackKey(pin, channel) {
  return JSON.stringify([pin, screenChannelKey(channel)]);
}
function playbackCoolingDown(pin, channel) {
  return (playbackCooldowns.get(playbackKey(pin, channel)) || 0) > Date.now();
}
function applyPinnedFallback() {
  if (!pinnedFallbackEnabled) return;
  let changed = false;
  screens.forEach((current, slot) => {
    if (!screenPinned[slot]) return;
    const key = screenPinnedKeys[slot];
    const original = channels.findIndex(channel => screenChannelKey(channel) === key);
    const currentChannel = channels[current];
    if (original < 0 || !currentChannel) return;
    const currentKey = screenChannelKey(currentChannel);
    const originalStatus = liveStates.get(channelKey(channels[original]));
    const currentStatus = liveStates.get(channelKey(currentChannel));
    const playbackFailed = playbackCoolingDown(key, currentChannel);
    if (currentStatus !== false && !playbackFailed) return;
    const used = new Set(screens.flatMap((index, otherSlot) =>
      otherSlot !== slot && channels[index] ? [screenChannelKey(channels[index])] : []));
    if (currentKey !== key && originalStatus === true && !used.has(key) &&
        !playbackCoolingDown(key, channels[original])) {
      screens[slot] = original;
      changed = true;
      return;
    }
    for (let offset = 1; offset < channels.length; offset++) {
      const index = (original + offset) % channels.length;
      const candidate = channels[index];
      if (!used.has(screenChannelKey(candidate)) && liveStates.get(channelKey(candidate)) === true &&
          !playbackCoolingDown(key, candidate)) {
        screens[slot] = index;
        changed = true;
        break;
      }
    }
  });
  if (changed) { renderScreens(); renderTabs(); }
  renderPinnedReplacements();
}
function renderPinnedReplacements() {
  const row = $("#pin-replacements");
  row.replaceChildren();
  if (!pinnedFallbackEnabled) { row.hidden = true; return; }
  screens.forEach((index, slot) => {
    if (!screenPinned[slot]) return;
    const original = channels.find(channel => screenChannelKey(channel) === screenPinnedKeys[slot]);
    const current = channels[index];
    if (!original || !current) return;
    const failed = playbackCoolingDown(screenPinnedKeys[slot], current);
    const isOriginal = screenChannelKey(original) === screenChannelKey(current);
    if (isOriginal && !failed) return;
    const item = el("div", "pin-replacement");
    const names = isOriginal ? original.displayname : original.displayname + " → " + current.displayname;
    const label = failed ? "Playback failed; waiting for an available channel" : liveStates.get(channelKey(current)) === false ? "Replacement offline; waiting for an online channel" : "Replacing offline pin";
    item.append(el("span", "", "Screen"), document.createTextNode(" " + String(slot + 1).padStart(2, "0") + ": " + names + " "), el("span", "replacement-label", label));
    if (!isOriginal && liveStates.get(channelKey(original)) === true) {
      item.append(el("span", "", "Original channel is online"));
      const back = el("button", "", "Switch back");
      back.type = "button";
      back.onclick = () => {
        const target = channels.findIndex(channel => screenChannelKey(channel) === screenPinnedKeys[slot]);
        if (target < 0) return;
        playbackCooldowns.delete(playbackKey(screenPinnedKeys[slot], channels[target]));
        screens[slot] = target;
        renderScreens(); renderTabs();
      };
      item.append(back);
    }
    row.append(item);
  });
  row.hidden = !row.children.length;
}
function savePinnedScreens() {
  const pinned = screens.flatMap((index, slot) =>
    screenPinned[slot] && channels[index]
      ? [{ key: screenPinnedKeys[slot] || screenChannelKey(channels[index]), includeOffline: !!screenIncludeOffline[slot] }]
      : [],
  );
  try {
    localStorage.setItem("chick-pinned-screens", JSON.stringify(pinned));
    return true;
  } catch {
    return false;
  }
}
function restorePinnedScreens() {
  const savedScreens = saved("chick-pinned-screens", []);
  if (!Array.isArray(savedScreens)) return;
  const restored = savedScreens.slice(0, 4).flatMap((entry) => {
    if (!entry || typeof entry.key !== "string") return [];
    const index = channels.findIndex((channel) => screenChannelKey(channel) === entry.key);
    return index < 0 ? [] : [{ index, includeOffline: entry.includeOffline === true }];
  });
  if (!restored.length) return;
  screens = restored.map((entry) => entry.index);
  screenIncludeOffline = restored.map((entry) => entry.includeOffline);
  screenPinned = restored.map(() => true);
  screenPinnedKeys = restored.map(entry => screenChannelKey(channels[entry.index]));
  selected = 0;
  userChoseChannel = true; // Keep initial availability selection from replacing a pinned channel.
}
function updateScreenPin(button, slot) {
  const pinned = !!screenPinned[slot];
  button.textContent = pinned ? "📌 Unpin screen" : "📌 Pin screen";
  button.setAttribute("aria-pressed", String(pinned));
}
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
      updateScreenPin(existing.querySelector(".pin-screen"), slot);
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
      screenPinnedKeys[slot] = screenPinned[slot] ? screenChannelKey(channels[screens[slot]]) : null;
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
      if (!savePinnedScreens()) toast("Browser storage is unavailable. Changes last for this visit.");
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
            : new URL(providerPlayerUrl(c.url)).hostname === "player.kick.com"
              ? "KICK"
              : ["play.sooplive.com", "play.sooplive.co.kr"].includes(new URL(providerPlayerUrl(c.url)).hostname)
                ? "SOOP"
                : "",
      ),
    );
    const pin = el("button", "pin-screen");
    pin.type = "button";
    updateScreenPin(pin, slot);
    pin.onclick = (event) => {
      event.stopPropagation();
      screenPinned[slot] = !screenPinned[slot];
      screenPinnedKeys[slot] = screenPinned[slot] ? screenChannelKey(channels[screens[slot]]) : null;
      renderPinnedReplacements();
      updateScreenPin(pin, slot);
      if (!savePinnedScreens()) toast("Browser storage is unavailable. Changes last for this visit.");
    };
    bar.append(pin);
    {
      const close = el("button", "remove-screen", "×");
      close.hidden = screens.length === 1;
      close.title = "Remove screen";
      close.onclick = (e) => {
        e.stopPropagation();
        screens.splice(slot, 1);
        screenPinned.splice(slot, 1);
        screenPinnedKeys.splice(slot, 1);
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
  if (!savePinnedScreens()) toast("Browser storage is unavailable. Changes last for this visit.");
  renderPinnedReplacements();
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
const playbackRetryDelay = 15000;
const playbackCooldown = 180000;
function pinnedPlaybackKey(c, wrap, slot) {
  if (!wrap.isConnected || !pinnedFallbackEnabled || !screenPinned[slot] ||
      !channels[screens[slot]] || screenChannelKey(channels[screens[slot]]) !== screenChannelKey(c)) return null;
  return screenPinnedKeys[slot];
}
async function recheckPlaybackStatus(c) {
  const source = statusProvider(c.original || c.url);
  if (c.platform !== "m3u8" && source?.provider !== "soop") return;
  const endpoint = new URL(goshEndpoint(c.details || "status"));
  if (c.platform !== "m3u8") {
    endpoint.pathname = "/api/provider-status";
    endpoint.search = new URLSearchParams(source);
  }
  const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) return;
  const data = await response.json();
  const live = c.platform === "m3u8" ? data.isLive :
    data.status === "live" ? true : data.status === "offline" ? false : undefined;
  if (typeof live === "boolean") recordAvailability(c, live, false);
  return live;
}
async function handlePlaybackFailure(c, wrap, slot, retry, failureIsCurrent) {
  const pin = pinnedPlaybackKey(c, wrap, slot);
  if (!pin) return;
  const stillPinned = () => failureIsCurrent() && pinnedPlaybackKey(c, wrap, slot) === pin;
  const retryAt = Date.now() + playbackRetryDelay;
  const live = await recheckPlaybackStatus(c).catch(() => undefined);
  if (!stillPinned()) return;
  if (live === false) {
    applyPinnedFallback();
    return;
  }
  if (!retry) {
    setTimeout(() => {
      if (stillPinned()) mountPlayer(c, wrap, slot, true);
    }, Math.max(0, retryAt - Date.now()));
    return;
  }
  const key = playbackKey(pin, c);
  const expires = Date.now() + playbackCooldown;
  playbackCooldowns.set(key, expires);
  applyPinnedFallback();
  setTimeout(() => {
    if (playbackCooldowns.get(key) !== expires) return;
    playbackCooldowns.delete(key);
    if (stillPinned()) {
      applyPinnedFallback();
      if (stillPinned() && liveStates.get(channelKey(c)) !== false) mountPlayer(c, wrap, slot);
    }
  }, playbackCooldown);
}
async function mountPlayer(c, wrap, slot, retry = false) {
  let failure;
  const failed = () => {
    if (failure) return;
    const attempt = {};
    failure = attempt;
    void handlePlaybackFailure(c, wrap, slot, retry, () => failure === attempt);
  };
  if (c.platform === "m3u8") {
    state(wrap, "Connecting to " + c.displayname, "Finding the live stream…");
    try {
      const res = await fetch(goshEndpoint(c.details), { cache: "no-store", signal: AbortSignal.timeout(15000) });
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
        if (data.isLive === false) {
          recordAvailability(c, false, false);
          applyPinnedFallback();
        } else failed();
        return;
      }
      playVideo(data.m3u8Url, wrap, c, failed);
    } catch {
      if (wrap.isConnected) {
        state(
          wrap,
          "Stream unavailable",
          "The provider could not be reached. Try the original channel or select another.",
          c,
        );
        failed();
      }
    }
    return;
  }
  if (c.platform === "video") {
    playVideo(c.url, wrap, c, failed);
    return;
  }
  // A retry rebuilds an embedded player. Remove the failed iframe first so it
  // cannot keep loading or playing underneath the replacement.
  wrap.replaceChildren();
  wrap._soopPlaybackFailure = null;
  wrap._soopPlaybackRecovered = null;
  let url = providerPlayerUrl(c.url);
  const kickUrl = new URL(url);
  if (kickUrl.hostname === "player.kick.com")
    kickUrl.searchParams.set("muted", "false");
  if (kickUrl.hostname === "player.kick.com") url = kickUrl.href;
  if (c.platform === "twitch")
    url =
      "https://player.twitch.tv/?channel=" +
      encodeURIComponent(c.details) +
      "&parent=" +
      encodeURIComponent(location.hostname) +
      "&muted=false";
  const frame = el("iframe");
  if (["fanversecast.com", "www.fanversecast.com"].includes(new URL(url).hostname)) {
    wrap.classList.add("fanverse-player-crop");
    frame.scrolling = "no";
  }
  frame.title = c.displayname + " live player";
  frame.src = url;
  if (statusProvider(c.original || c.url)?.provider === "soop") {
    wrap._soopPlaybackFailure = failed;
    wrap._soopPlaybackRecovered = () => {
      failure = null;
      retry = false;
      const pin = pinnedPlaybackKey(c, wrap, slot);
      if (pin && playbackCooldowns.delete(playbackKey(pin, c))) renderPinnedReplacements();
    };
  }
  frame.allow = "autoplay; fullscreen; picture-in-picture";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  if (kickUrl.hostname === "player.kick.com") {
    let muted = false;
    const sound = el("button", "kick-sound", "🔇");
    sound.type = "button";
    const updateSoundButton = () => {
      sound.textContent = muted ? "🔊" : "🔇";
      sound.dataset.requestedMuted = String(muted);
      const chinese = document.documentElement.lang === "zh-Hant";
      const label = chinese ? (muted ? "開啟聲音" : "靜音") : (muted ? "Enable sound" : "Mute sound");
      sound.setAttribute("aria-label", label);
      sound.title = label + (chinese ? "（會重新載入此 Kick 播放器）" : " (reloads this Kick player)");
    };
    updateSoundButton();
    sound.onclick = (event) => {
      event.stopPropagation();
      muted = !muted;
      kickUrl.searchParams.set("muted", String(muted));
      frame.src = kickUrl.href;
      updateSoundButton();
    };
    const bar = wrap.closest(".screen").querySelector(".screen-bar");
    bar.insertBefore(sound, bar.querySelector(".remove-screen"));
  }
  wrap.append(frame);
}
window.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type !== "chicktv-soop-playback-failed" && type !== "chicktv-soop-playback-recovered") return;
  for (const frame of document.querySelectorAll(".video-wrap iframe[data-soop-original-src]")) {
    if (event.source !== frame.contentWindow) continue;
    const player = new URL(frame.src);
    if (player.protocol !== "chrome-extension:" || player.pathname !== "/player.html" ||
        event.origin !== "chrome-extension://" + player.host) return;
    const wrap = frame.closest(".video-wrap");
    if (type === "chicktv-soop-playback-failed") wrap._soopPlaybackFailure?.();
    else wrap._soopPlaybackRecovered?.();
    return;
  }
});
function playVideo(url, wrap, c, failed) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw Error("HTTPS required");
  wrap.replaceChildren();
  const video = el("video");
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  wrap.append(video);
  const showFailure = (detail) => {
    if (!video.isConnected) return;
    video.onerror = null;
    wrap._hls?.destroy();
    wrap._hls = null;
    state(
      wrap,
      "Playback unavailable",
      detail,
      c,
    );
    failed();
  };
  video.onerror = () => showFailure("The stream may be offline or blocked by its provider.");
  if (/\.m3u8/i.test(url) && window.Hls?.isSupported()) {
    const h = new Hls();
    wrap._hls = h;
    h.on(Hls.Events.MANIFEST_PARSED, () => {
      // Select the best video variant, regardless of playlist ordering.
      let best = -1;
      for (let i = 0; i < h.levels.length; i++) {
        const level = h.levels[i];
        if (!level.height || !level.width) continue;
        const previous = h.levels[best];
        if (!previous || level.height > previous.height ||
            (level.height === previous.height &&
             (level.bitrate || 0) > (previous.bitrate || 0))) best = i;
      }
      if (best >= 0) h.currentLevel = best;
    });
    h.loadSource(url);
    h.attachMedia(video);
    h.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) showFailure("The stream could not be loaded. Try another channel.");
    });
  } else video.src = url;
}
$("#add-screen").onclick = () => {
  if (screens.length >= 4) {
    toast("You can watch up to four screens at once.");
    return;
  }
  let next = nextScreenChannel(
    channels,
    screens,
    screens[selected],
    (channel) => liveStates.get(channelKey(channel)) === true,
  );
  if (!channels.length) return;
  const usingAdjacentChannel = next < 0;
  if (usingAdjacentChannel) {
    next = ((screens[selected] ?? 0) + 1) % channels.length;
  }
  userChoseChannel = true;
  screens.push(next);
  screenPinned.push(false);
  screenPinnedKeys.push(null);
  screenIncludeOffline.push(usingAdjacentChannel);
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
function setTheaterMode(enabled, persist = true) {
  document.body.classList.toggle("theater", enabled);
  const button = $("#theater");
  button.textContent = enabled ? "⛶ Exit theater" : "⛶ Theater mode";
  button.setAttribute("aria-pressed", String(enabled));
  if (!persist) return;
  try {
    localStorage.setItem("chick-theater-mode", JSON.stringify(enabled));
  } catch {}
}
setTheaterMode(saved("chick-theater-mode", false), false);
$("#theater").onclick = () => {
  setTheaterMode(!document.body.classList.contains("theater"));
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("theater"))
    setTheaterMode(false);
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
    restorePinnedScreens();
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
