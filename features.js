let requestMode = false,
  userChoseChannel = false;
const communityEnabled = window.CHICKTV_CONFIG.backendEnabled;
function communityEndpoint(path) {
  return (
    (window.CHICKTV_CONFIG.apiBaseUrl.replace(/\/$/, "") || location.origin) +
    "/api/" +
    path
  );
}
const subscriptions = new Set(saved("chick-alerts", []));
const alertMessages = saved("chick-alert-messages", {});
const savedDesktopAlerts = saved("chick-desktop-alerts", []);
const desktopAlerts = new Set(Array.isArray(savedDesktopAlerts) ? savedDesktopAlerts.filter(key => typeof key === "string") : []);
let extensionStatusChecksAvailable = false;
let availabilityStarted = false;
function updateDesktopAlertNote() {
  $("#pin-fallback").hidden = !extensionStatusChecksAvailable;
  $("#alert-desktop").disabled = !extensionStatusChecksAvailable;
  $("#alert-desktop-note").textContent = extensionStatusChecksAvailable
    ? "Background notification extension connected."
    : "Install or update the ChickTV notification extension to check channel status and receive alerts.";
}
updateDesktopAlertNote();

const notifiedOnline = new Set(saved("chick-alerted-online", []));
const onlineAlertQueue = [];
let onlineAlertWindow;
const notificationMonitorPageSource = "chicktv-notification-page";
const notificationMonitorExtensionSource = "chicktv-notification-extension";
function notificationMonitorChannel(channel) {
  const key = channelKey(channel);
  return {
    key,
    name: String(channel.displayname || "Channel").slice(0, 80),
    message: alertText(channel),
    desktop: desktopAlerts.has(key),
    platform: String(channel.platform || ""),
    details: String(channel.details || ""),
    url: String(channel.original || channel.url || ""),
  };
}
function syncNotificationMonitor() {
  window.postMessage({
    source: notificationMonitorPageSource,
    type: "sync",
    channels: channels
      .filter((channel) => subscriptions.has(channelKey(channel)))
      .map(notificationMonitorChannel),
    alerted: [...notifiedOnline],
  }, location.origin);
}
function publishNotificationObservation(channel, live, notify = false) {
  const key = channelKey(channel);
  if (!subscriptions.has(key)) return;
  window.postMessage({
    source: notificationMonitorPageSource,
    type: "observation",
    key,
    status: live ? "live" : "offline",
    alerted: notifiedOnline.has(key),
    notify,
  }, location.origin);
}
function requestPendingOnlinePopups() {
  if (!extensionStatusChecksAvailable || document.hidden) return;
  window.postMessage({source: notificationMonitorPageSource, type: "take-popups"}, location.origin);
}
window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin ||
      event.data?.source !== notificationMonitorExtensionSource) return;
  if (event.data.type === "ready" && event.data.statusChecks === true) {
    const firstConnection = !extensionStatusChecksAvailable;
    extensionStatusChecksAvailable = true;
    requestPendingOnlinePopups();
    if (firstConnection && availabilityStarted && !document.hidden)
      void checkAvailability(true);
  }
  updateDesktopAlertNote();
  if (extensionStatusChecksAvailable && event.data.type === "popups") {
    for (const popup of Array.isArray(event.data.popups) ? event.data.popups : []) {
      if (subscriptions.has(popup?.key) && typeof popup.message === "string")
        showOnlineAlert(popup.message);
    }
    return;
  }
  if (!extensionStatusChecksAvailable || event.data.type !== "state" ||
      !Array.isArray(event.data.states)) return;
  const monitored = new Set();
  for (const state of event.data.states) {
    if (!state || typeof state.key !== "string") continue;
    monitored.add(state.key);
    if (state.status === "live" || state.status === "offline")
      liveStates.set(state.key, state.status === "live");
    if (state.alerted) notifiedOnline.add(state.key);
    else notifiedOnline.delete(state.key);
  }
  if (monitored.size) {
    requestPendingOnlinePopups();
    saveNotifiedOnline();
    updateScreenChannelOptions(
      channels
        .filter((channel) => liveStates.get(channelKey(channel)) === false)
        .map(screenChannelKey),
    );
    renderTabs();
  }
});
function showOnlineAlert(text) {
  onlineAlertQueue.push(text);
  if (!onlineAlertWindow) {
    onlineAlertWindow = el("dialog", "online-alert-window");
    const title = el("h2", "", "頻道上線通知");
    const content = el("p", "online-alert-message");
    const close = el("button", "primary", "知道了");
    close.type = "button";
    close.onclick = () => onlineAlertWindow.close();
    onlineAlertWindow.append(title, content, close);
    document.body.append(onlineAlertWindow);
    onlineAlertWindow.addEventListener("close", () => displayNextOnlineAlert());
  }
  displayNextOnlineAlert();
}
function displayNextOnlineAlert() {
  if (document.hidden || !onlineAlertWindow || onlineAlertWindow.open || !onlineAlertQueue.length)
    return;
  onlineAlertWindow.querySelector(".online-alert-message").textContent =
    onlineAlertQueue.shift();
  onlineAlertWindow.showModal();
}
function saveNotifiedOnline() {
  try {
    localStorage.setItem(
      "chick-alerted-online",
      JSON.stringify([...notifiedOnline]),
    );
  } catch {}
}
function defaultAlertMessage(channel) {
  return (Array.from(channel.displayname || "")[0] || "台") + "扑快！";
}
function alertText(channel) {
  const value = alertMessages[channelKey(channel)];
  return typeof value === "string" && value.trim()
    ? value
    : defaultAlertMessage(channel);
}
let editingAlert = null;
function openAlertSettings(channel) {
  editingAlert = channel;
  $("#alert-title").textContent = channel.displayname + " · 上線通知";
  $("#alert-message").value = alertText(channel);
  $("#alert-desktop").checked = desktopAlerts.has(channelKey(channel));
  updateDesktopAlertNote();
  $("#alert-disable").hidden = !subscriptions.has(channelKey(channel));
  $("#alert-support").textContent =
    typeof statusProvider === "function" &&
    statusProvider(channel.original || channel.url)
      ? statusProvider(channel.original || channel.url).provider === "soop"
        ? "SOOP 每 60 秒檢查上線狀態，通知需保持頁面開啟。"
        : "YouTube 不檢查上線狀態，因此不會發出上線通知。"
      : typeof angelThumpChannel === "function" &&
          angelThumpChannel(channel.url)
        ? "AngelThump 狀態每 60 秒檢查，頁面開啟時可發出上線通知。"
        : channel.platform === "m3u8"
          ? "頁面開啟時，偵測離線轉為上線後通知。"
          : channel.platform === "twitch"
            ? "登入 Twitch 後可偵測上線。"
            : channel.platform === "vl" && channel.details
              ? "預設 Kick 頻道使用 SKLive 狀態資料，每 60 秒檢查。"
              : "可儲存通知設定；此平台的上線偵測尚未接通，暫時不會發出通知。";
  $("#alert-dialog").showModal();
}
function saveAlertSettings(event) {
  event.preventDefault();
  if (!editingAlert) return;
  const text = $("#alert-message").value.trim();
  if (!text) return;
  const key = channelKey(editingAlert);
  alertMessages[key] = text;
  subscriptions.add(key);
  if (extensionStatusChecksAvailable) {
    if ($("#alert-desktop").checked) desktopAlerts.add(key);
    else desktopAlerts.delete(key);
  }
  storeAlerts();
  syncNotificationMonitor();
  $("#alert-dialog").close();
  renderTabs();
  if (liveStates.get(key) === true)
    recordAvailability(editingAlert, true, false);
  else void checkAvailability(false);
}
function storeAlerts() {
  try {
    localStorage.setItem("chick-desktop-alerts", JSON.stringify([...desktopAlerts]));
    localStorage.setItem("chick-alerts", JSON.stringify([...subscriptions]));
    localStorage.setItem("chick-alert-messages", JSON.stringify(alertMessages));
  } catch {
    toast("Could not save notification settings in this browser.");
  }
}
function recordAvailability(channel, live, initial) {
  const key = channelKey(channel);
  if (live !== true && live !== false) return;
  let notifyThroughExtension = false;
  liveStates.set(key, live);
  if (!live) {
    notifiedOnline.delete(key);
    saveNotifiedOnline();
  } else if (subscriptions.has(key) && !notifiedOnline.has(key)) {
    notifiedOnline.add(key);
    saveNotifiedOnline();
    showOnlineAlert(alertText(channel));
    notifyThroughExtension = desktopAlerts.has(key);
  }
  if (typeof publishNotificationObservation === "function")
    publishNotificationObservation(channel, live, notifyThroughExtension);
}
const liveStates = new Map(),
  chatCounts = new Map(),
  seenMessages = new Set();
function movePersonalChannel(index, direction) {
  const customIndices = channels.flatMap((channel, channelIndex) =>
    channel.custom ? [channelIndex] : [],
  );
  const position = customIndices.indexOf(index);
  const target = customIndices[position + direction];
  if (target === undefined) return;
  [channels[index], channels[target]] = [channels[target], channels[index]];
  screens = screens.map((channelIndex) =>
    channelIndex === index ? target : channelIndex === target ? index : channelIndex,
  );
  persist();
  renderTabs();
  renderScreens();
  toast("Personal channel order updated in this browser.");
}
const originalRenderTabs = renderTabs;
renderTabs = function () {
  // Unknown is not proof that a channel is online. Keep it available through
  // Show offline, without allowing incomplete feeds to defeat the live-only rail.
  const onlineChannels = channels.filter((channel) => liveStates.get(channelKey(channel)) === true);
  screenOnlineChannelKeys = new Set(
    (extensionStatusChecksAvailable ? onlineChannels : channels).map(screenChannelKey),
  );
  originalRenderTabs();
  $("#pin-fallback").hidden = !extensionStatusChecksAvailable;
  $("#hide-offline").disabled = !extensionStatusChecksAvailable;
  $("#status-note").textContent = extensionStatusChecksAvailable
    ? `Online channels: ${onlineChannels.length}`
    : "Install or update the ChickTV notification extension to check channel status and receive alerts.";
  for (const [i, c] of channels.entries()) {
    const container = c.custom ? $("#personal-channels") : $("#channels");
    const key = channelKey(c);
    const b = [...container.querySelectorAll(".channel")].find(
      (button) => button.dataset.channelKey === key,
    );
    if (!b) continue;
    const status = liveStates.get(key);
    b.title =
      status === true
        ? "Online"
        : status === false
          ? "Offline"
          : "Live status unknown";
    b.classList.toggle("channel-online", status === true);
    b.classList.toggle("channel-offline", status === false);
    b.setAttribute("aria-label", c.displayname + " · " + b.title);
    const bell = extensionStatusChecksAvailable
      ? el("button", "bell", subscriptions.has(key) ? "🔔" : "♧")
      : null;
    if (bell) {
      bell.setAttribute(
        "aria-label",
        "Configure online alert for " + c.displayname,
      );
      bell.setAttribute("aria-pressed", String(subscriptions.has(key)));
      bell.title = alertText(c);
      bell.onclick = () => openAlertSettings(c);
    }
    if (c.custom) {
      const customIndices = channels.flatMap((channel, channelIndex) =>
        channel.custom ? [channelIndex] : [],
      );
      const position = customIndices.indexOf(i);
      const actions = el("span", "personal-actions");
      actions.hidden = true;
      const moveUp = el("button", "personal-action personal-move-up", "↑");
      moveUp.type = "button";
      moveUp.disabled = position === 0;
      moveUp.onclick = (event) => {
        event.stopPropagation();
        movePersonalChannel(i, -1);
      };
      const moveDown = el("button", "personal-action personal-move-down", "↓");
      moveDown.type = "button";
      moveDown.disabled = position === customIndices.length - 1;
      moveDown.onclick = (event) => {
        event.stopPropagation();
        movePersonalChannel(i, 1);
      };
      const edit = el("button", "personal-action", "✎");
      edit.setAttribute("aria-label", "Edit personal channel " + c.displayname);
      edit.title = "Edit personal channel";
      edit.onclick = () => openChannelForm(false, i);
      const remove = el("button", "personal-action", "🗑");
      remove.setAttribute(
        "aria-label",
        "Remove personal channel " + c.displayname,
      );
      remove.title = "Remove personal channel";
      remove.onclick = () => {
        channels.splice(i, 1);
        screens = screens.map((idx) =>
          idx === i ? 0 : idx > i ? idx - 1 : idx,
        );
        persist();
        renderTabs();
        renderScreens();
      };
      actions.append(moveUp, moveDown, edit, remove);
      const actionsToggle = el(
        "button",
        "personal-action personal-actions-toggle",
        "⋯",
      );
      actionsToggle.type = "button";
      actionsToggle.setAttribute("aria-expanded", "false");
      actionsToggle.setAttribute("aria-label", "Show personal channel actions");
      actionsToggle.title = "Show personal channel actions";
      actionsToggle.onclick = (event) => {
        event.stopPropagation();
        actions.hidden = !actions.hidden;
        const expanded = !actions.hidden;
        const isEnglish = document.documentElement.lang === "en";
        const label = isEnglish
          ? expanded
            ? "Hide personal channel actions"
            : "Show personal channel actions"
          : expanded
            ? "收起頻道管理按鈕"
            : "展開頻道管理按鈕";
        actionsToggle.setAttribute("aria-expanded", String(expanded));
        actionsToggle.setAttribute("aria-label", label);
        actionsToggle.title = label;
      };
      b.after(actionsToggle, actions, ...(bell ? [bell] : []));
    } else if (bell) {
      b.after(bell);
    }
  }
};
function channelKey(c) {
  return c.identityKey || c.platform + ":" + (c.details || c.original || c.url);
}
function openChannelForm(request, editIndex = -1) {
  requestMode = request;
  editingPersonalChannel = editIndex;
  const form = $("#channel-form");
  form.reset();
  const channel = editIndex >= 0 ? channels[editIndex] : null;
  if (editIndex >= 0 && !channel?.custom) {
    editingPersonalChannel = -1;
    toast("Only personal channels can be edited here.");
    return;
  }
  $("#channel-title").textContent = request
    ? "Request a permanent channel"
    : channel
      ? "Edit personal channel"
      : "Add a personal channel";
  $("#channel-submit").textContent = request
    ? "Send request"
    : channel
      ? "Save changes"
      : "Add personal channel";
  $("#channel-description").textContent = request
    ? "Suggest a channel for the shared list."
    : channel
      ? "Update this channel’s name or link."
      : "Bring another favorite into your watch room.";
  if (channel) {
    form.elements.namedItem("name").value = channel.displayname || "";
    $("#channel-provider").value = channel.platform === "m3u8" ? "gosh" : "url";
    form.elements.namedItem("goshId").value =
      channel.platform === "m3u8" ? channel.details || "" : "";
    form.elements.namedItem("url").value =
      channel.platform === "m3u8" ? "" : channel.original || channel.url || "";
  }
  updateChannelSourceFields();
  $("#channel-dialog").showModal();
}
$("#add-channel").onclick = () => openChannelForm(false);
$("#request-channel").onclick = () => openChannelForm(true);
async function submitRequest(channel) {
  if (!communityEnabled) {
    toast("Shared requests need the hosted database and admin login setup.");
    return;
  }
  const button = $("#channel-submit");
  button.disabled = true;
  try {
    const res = await fetch(communityEndpoint("requests"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    $("#channel-dialog").close();
    $("#channel-form").reset();
    toast("Request sent. It joins the shared list after admin approval.");
  } catch (e) {
    toast(e.message || "Request failed. Please try again.");
  } finally {
    button.disabled = false;
  }
}
let availabilityQueue = Promise.resolve();
function checkAvailability(initial = false) {
  const next = availabilityQueue.then(() => runAvailabilityCheck(initial));
  availabilityQueue = next.catch(() => {});
  return next;
}
function requestExtensionStatuses(entries) {
  if (!extensionStatusChecksAvailable || document.hidden) return Promise.resolve({});
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const finish = (statuses) => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      resolve(statuses);
    };
    function receive(event) {
      if (event.source === window && event.origin === location.origin &&
          event.data?.source === notificationMonitorExtensionSource &&
          event.data.type === "status-result" && event.data.id === id)
        finish(event.data.statuses || {});
    }
    const timeout = setTimeout(() => finish({}), 32000);
    window.addEventListener("message", receive);
    window.postMessage({
      source: notificationMonitorPageSource,
      type: "check-status",
      id,
      channels: entries.map(notificationMonitorChannel),
    }, location.origin);
  });
}
async function runAvailabilityCheck(initial = false) {
  if (!extensionStatusChecksAvailable || document.hidden) return;
  const requested = [...channels];
  const statuses = await requestExtensionStatuses(requested);
  for (const channel of requested) {
    if (!channels.includes(channel)) continue;
    const key = channelKey(channel);
    const status = statuses[key];
    if (status === "live" || status === "offline")
      recordAvailability(channel, status === "live", initial);
    else liveStates.set(key, null);
  }
  if (initial && !userChoseChannel) {
    const idx = channels.findIndex(
      (c) => liveStates.get(channelKey(c)) === true,
    );
    if (idx >= 0) {
      screens[0] = idx;
      renderScreens();
    }
  }
  const online = channels.filter(
    (c) => liveStates.get(channelKey(c)) === true,
  ).length;
  $("#status-note").textContent = `Online channels: ${online}`;
  updateScreenChannelOptions(
    channels
      .filter((channel) => liveStates.get(channelKey(channel)) === false)
      .map((channel) =>
        channel.identityKey ||
        channel.platform + ":" + (channel.details || channel.original || channel.url),
      ),
  );
  applyPinnedFallback();
  renderPinnedReplacements();
  // Refresh channel buttons after replacing the offline-key set. Otherwise,
  // channels that just came online can stay filtered out until another status check.
  renderTabs();
}
function trackChatter(name, login, id) {
  // Ranking is deferred; do not collect counts when its UI is absent.
  if (!$("#chat-ranking")) return;
  if (id && seenMessages.has(id)) return;
  if (id) seenMessages.add(id);
  const key = (login || name).toLowerCase();
  const row = chatCounts.get(key) || { name, count: 0 };
  row.name = name;
  row.count++;
  chatCounts.set(key, row);
  const ranking = $("#chat-ranking");
  ranking.replaceChildren();
  [...chatCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10)
    .forEach((r) =>
      ranking.append(el("li", "", r.name + " · " + r.count + " messages")),
    );
}
let communityRefreshBusy = false;
async function refreshCommunity() {
  if (!communityEnabled || communityRefreshBusy) return;
  communityRefreshBusy = true;
  try {
    const res = await fetch(communityEndpoint("community"), {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw Error();
    const data = await res.json();
    const personal = channels.filter((c) => c.custom);
    const previous = screens.map(
      (index) => channels[index] && channelKey(channels[index]),
    );
    const shared = Array.isArray(data.shared)
      ? data.shared
      : [
          ...channels.filter(
            (c) =>
              !c.custom && !(data.removed || []).includes(c.original || c.url),
          ),
          ...(data.approved || []),
        ];
    const updated = [
      ...new Map(shared.map((c) => [channelKey(c), c])).values(),
      ...personal,
    ];
    if (JSON.stringify(updated) !== JSON.stringify(channels)) {
      channels = updated;
      screens = previous.map((key) =>
        Math.max(
          0,
          channels.findIndex((c) => channelKey(c) === key),
        ),
      );
      renderTabs();
      renderScreens();
      syncNotificationMonitor();
    }
  } finally {
    communityRefreshBusy = false;
  }
}
async function initFeatures(authReady) {
  $("#alert-form").onsubmit = saveAlertSettings;
  $("#alert-disable").onclick = () => {
    if (editingAlert) {
      subscriptions.delete(channelKey(editingAlert));
      desktopAlerts.delete(channelKey(editingAlert));
      notifiedOnline.delete(channelKey(editingAlert));
      saveNotifiedOnline();
      storeAlerts();
      syncNotificationMonitor();
      $("#alert-dialog").close();
      renderTabs();
    }
  };
  if (communityEnabled) {
    try {
      await refreshCommunity();
    } catch {
      toast(
        "Channel updates are temporarily unavailable. Showing the saved channel list.",
      );
    }
  }
  renderTabs();
  await authReady;
  availabilityStarted = true;
  syncNotificationMonitor();
  await checkAvailability(true);
  setInterval(async () => {
    if (!document.hidden) {
      try {
        await refreshCommunity();
      } catch {}
      void checkAvailability(false);
    }
  }, 120000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    displayNextOnlineAlert();
    requestPendingOnlinePopups();
    void checkAvailability(false);
  });
}
