const status = document.querySelector("#admin-status"),
  list = document.querySelector("#requests");
const adminEnabled =
  location.protocol !== "file:" && window.CHICKTV_CONFIG.backendEnabled;
const adminApiBase = window.CHICKTV_CONFIG.apiBaseUrl.replace(/\/$/, "");
let loginPopup = null;
let pendingLogin = null;
let loginPoll = null;
let freshToken = "";

function openAdminLogin(inThisTab = false) {
  const client = window.CHICKTV_CONFIG.twitchClientId;
  if (!client) throw Error("Twitch sign-in has not been configured.");
  const state = crypto.randomUUID();
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: client,
    redirect_uri: new URL("../", location.href).href,
    response_type: "token",
    scope: "chat:read chat:edit",
    state,
  });
  pendingLogin = { state, client };
  if (inThisTab) {
    clearInterval(loginPoll);
    loginPopup?.close();
    sessionStorage.setItem("twitch-state", state);
    sessionStorage.setItem(
      "chicktv-admin-pending",
      JSON.stringify({ state, client, expiresAt: Date.now() + 600000 }),
    );
    location.assign(url.href);
    return;
  }
  sessionStorage.removeItem("chicktv-admin-pending");
  loginPopup = window.open(
    url.href,
    "chicktv-twitch-login",
    "popup=yes,width=520,height=760",
  );
  if (!loginPopup) {
    pendingLogin = null;
    throw Error("Please allow popups for this site, then try again.");
  }
  status.textContent = "Complete Twitch sign-in in the popup…";
  document.querySelector("#admin-start").disabled = true;
  loginPoll = setInterval(() => {
    if (loginPopup?.closed && pendingLogin) {
      clearInterval(loginPoll);
      pendingLogin = null;
      status.textContent =
        "Twitch sign-in was cancelled. Click the button to try again.";
      document.querySelector("#admin-start").disabled = false;
    }
  }, 500);
}

window.addEventListener("message", async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== loginPopup ||
    event.data?.type !== "chicktv-twitch-auth" ||
    !pendingLogin
  )
    return;
  const pending = pendingLogin;
  pendingLogin = null;
  clearInterval(loginPoll);
  try {
    if (event.data.state !== pending.state)
      throw Error("Could not verify Twitch sign-in. Try again.");
    if (event.data.error || !event.data.token)
      throw Error("Twitch sign-in was cancelled.");
    await completeAdminLogin(event.data.token, pending.client);
  } catch (e) {
    status.textContent = e.message;
  } finally {
    freshToken = "";
    loginPopup?.close();
    loginPopup = null;
    document.querySelector("#admin-start").disabled = !adminEnabled;
  }
});
async function completeAdminLogin(accessToken, client) {
  if (client !== window.CHICKTV_CONFIG.twitchClientId)
    throw Error("Twitch application changed. Sign in again.");
  freshToken = accessToken;
  const validation = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: "OAuth " + freshToken },
    signal: AbortSignal.timeout(15000),
  });
  if (!validation.ok) throw Error("Twitch sign-in expired. Please try again.");
  const identity = await validation.json();
  if (identity.client_id !== client || !(identity.expires_in > 0))
    throw Error("Could not verify Twitch sign-in. Please try again.");
  await verifyAdmin();
  localStorage.setItem(
    "chick-twitch-session",
    JSON.stringify({
      token: freshToken,
      client,
      expiresAt: Date.now() + identity.expires_in * 1000,
    }),
  );
}

document.querySelector("#admin-login-here").onclick = () => {
  try {
    openAdminLogin(true);
  } catch (error) {
    pendingLogin = null;
    status.textContent = error.message;
  }
};

async function restoreAdminLogin() {
  let result;
  try {
    const stored = sessionStorage.getItem("chicktv-admin-result");
    sessionStorage.removeItem("chicktv-admin-result");
    if (!stored) return;
    result = JSON.parse(stored);
    if (result.error) throw Error(result.error);
    if (!(result.expiresAt > Date.now()) || !result.token)
      throw Error("Sign-in expired. Please try again.");
    status.textContent = "Verifying your Twitch access…";
    document.querySelector("#admin-start").disabled = true;
    await completeAdminLogin(result.token, result.client);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    freshToken = "";
    document.querySelector("#admin-start").disabled = !adminEnabled;
  }
}
if (location.protocol === "file:") {
  status.textContent =
    "Open http://localhost:4173/admin/ to use the admin portal. Opening this file directly cannot connect to the server.";
  document.querySelector("#admin-start").textContent =
    "Open local admin portal";
  document.querySelector("#admin-login-here").disabled = true;
} else if (!adminEnabled) {
  status.textContent =
    "Hosted administration is not connected yet. Please use the local server for now.";
  document.querySelector("#admin-start").disabled = true;
  document.querySelector("#admin-login-here").disabled = true;
}
async function api(path, data) {
  const res = await fetch(
    (adminApiBase || location.origin) + "/api/admin/" + path,
    {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        Authorization: "Bearer " + adminToken(),
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(20000),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      list.replaceChildren();
      document.querySelector("#manage-channels").hidden = true;
      document.querySelector("#admin-users-section").hidden = true;
      if (res.status === 401) {
        freshToken = "";
        localStorage.removeItem("chick-twitch-session");
      }
    }
    throw Error(body.error);
  }
  return body;
}
async function refresh() {
  const data = await api("requests");
  list.replaceChildren();
  for (const r of data.requests.slice().reverse()) {
    const card = document.createElement("section");
    card.className = "request-card";
    const title = document.createElement("h2");
    title.textContent = r.channel.displayname;
    const info = document.createElement("p");
    info.textContent = r.channel.original + " · " + r.status;
    card.append(title, info);
    if (r.status === "pending")
      for (const action of ["approve", "reject"]) {
        const b = document.createElement("button");
        b.textContent = action === "approve" ? "Approve" : "Reject";
        b.onclick = async () => {
          try {
            await api("decision", { id: r.id, action });
            await refresh();
            await refreshChannels();
          } catch (e) {
            status.textContent = e.message;
          }
        };
        card.append(b);
      }
    list.append(card);
  }
  if (!data.requests.length)
    list.textContent = "No requests yet. Submit one from the watch page.";
}
async function verifyAdmin() {
  const session = await api("session", {});
  await refresh();
  await refreshChannels();
  status.textContent =
    "Verified Twitch administrator: " + session.admin.username;
  document.querySelector("#admin-users-section").hidden =
    session.admin.role !== "owner";
  if (session.admin.role === "owner") await refreshAdminUsers();
}
async function refreshChannels() {
  const data = await api("channels");
  const container = document.querySelector("#admin-channels-list");
  container.replaceChildren();
  document.querySelector("#manage-channels").hidden = false;
  const ids = data.channels.map((channel) => channel.deleteId);
  for (const [index, channel] of data.channels.entries()) {
    const row = document.createElement("section");
    row.className = "request-card admin-channel-card";
    const summary = document.createElement("div");
    summary.className = "admin-channel-summary";
    const label = document.createElement("strong");
    label.textContent = index + 1 + ". " + channel.displayname;
    const source = document.createElement("p");
    source.className = "admin-channel-source";
    source.textContent =
      channel.original || channel.url || channel.details || "";
    summary.append(label, source);
    const controls = document.createElement("div");
    controls.className = "admin-channel-actions";
    const setBusy = (busy) =>
      container.querySelectorAll("button").forEach((button) => {
        button.disabled = busy || button.dataset.boundary === "true";
      });
    for (const [offset, caption] of [
      [-1, "Move up"],
      [1, "Move down"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = caption;
      button.setAttribute("aria-label", caption + ": " + channel.displayname);
      button.dataset.boundary = String(
        index + offset < 0 || index + offset >= ids.length,
      );
      button.disabled = button.dataset.boundary === "true";
      button.onclick = async () => {
        const ordered = [...ids];
        [ordered[index], ordered[index + offset]] = [
          ordered[index + offset],
          ordered[index],
        ];
        setBusy(true);
        try {
          await api("channels", {
            action: "reorder",
            ids: ordered,
            expectedOrder: ids,
          });
          await refreshChannels();
          document.querySelector("#admin-channels-status").textContent =
            "Channel order saved.";
        } catch (error) {
          document.querySelector("#admin-channels-status").textContent =
            error.message;
          setBusy(false);
        }
      };
      controls.append(button);
    }
    const editor = document.createElement("form");
    editor.className = "admin-channel-editor";
    editor.hidden = true;
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Display name";
    const nameInput = document.createElement("input");
    nameInput.required = true;
    nameInput.maxLength = 40;
    nameInput.value = channel.displayname;
    nameLabel.append(nameInput);
    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Channel or video URL";
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.maxLength = 2048;
    urlInput.value = channel.original || channel.url || "";
    urlInput.required = !!urlInput.value;
    urlLabel.append(urlInput);
    const providerLabel = document.createElement("label");
    providerLabel.textContent = "Provider";
    const providerInput = document.createElement("select");
    for (const [value, text] of [
      ["url", "Other providers (URL)"],
      ["gosh", "Gosh"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      providerInput.append(option);
    }
    providerInput.value = channel.platform === "m3u8" ? "gosh" : "url";
    providerLabel.append(providerInput);
    const goshLabel = document.createElement("label");
    goshLabel.textContent = "Gosh channel ID";
    const goshInput = document.createElement("input");
    goshInput.maxLength = 80;
    goshInput.pattern = "[A-Za-z0-9_-]{1,80}";
    goshInput.placeholder = "meidingdang";
    goshInput.value = channel.platform === "m3u8" ? channel.details : "";
    goshLabel.append(goshInput);
    const updateSourceFields = () => {
      const gosh = providerInput.value === "gosh";
      urlLabel.style.display = gosh ? "none" : "";
      goshLabel.style.display = gosh ? "" : "none";
      urlInput.disabled = gosh;
      urlInput.required = !gosh;
      goshInput.disabled = !gosh;
      goshInput.required = gosh;
    };
    providerInput.onchange = updateSourceFields;
    updateSourceFields();
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "primary";
    save.textContent = "Save changes";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.onclick = () => {
      editor.hidden = true;
      edit.hidden = false;
      edit.focus();
    };
    editor.append(nameLabel, providerLabel, urlLabel, goshLabel, save, cancel);
    editor.onsubmit = async (event) => {
      event.preventDefault();
      if (!nameInput.value.trim()) {
        nameInput.setCustomValidity("Enter a display name.");
        nameInput.reportValidity();
        return;
      }
      setBusy(true);
      try {
        await api("channels", {
          action: "update",
          id: channel.deleteId,
          displayname: nameInput.value.trim(),
          url: providerInput.value === "gosh" ? "" : urlInput.value.trim(),
          provider: providerInput.value,
          goshId: goshInput.value.trim(),
          expected: {
            displayname: channel.displayname,
            original: channel.original || "",
            url: channel.url || "",
          },
        });
        await refreshChannels();
        await refresh();
        document.querySelector("#admin-channels-status").textContent =
          "Channel changes saved.";
      } catch (error) {
        document.querySelector("#admin-channels-status").textContent =
          error.message;
        setBusy(false);
      }
    };
    nameInput.oninput = () => nameInput.setCustomValidity("");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", "Edit " + channel.displayname);
    edit.onclick = () => {
      providerInput.value = channel.platform === "m3u8" ? "gosh" : "url";
      goshInput.value = channel.platform === "m3u8" ? channel.details : "";
      updateSourceFields();
      nameInput.value = channel.displayname;
      nameInput.setCustomValidity("");
      urlInput.value = channel.original || channel.url || "";
      editor.hidden = false;
      edit.hidden = true;
      nameInput.focus();
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.onclick = async () => {
      if (!confirm("Delete " + channel.displayname + " from 預製區?")) return;
      setBusy(true);
      try {
        await api("channels", { action: "delete", id: channel.deleteId });
        await refreshChannels();
        await refresh();
      } catch (error) {
        document.querySelector("#admin-channels-status").textContent =
          error.message;
        setBusy(false);
      }
    };
    controls.append(edit, remove);
    row.append(summary, controls, editor);
    container.append(row);
  }
}
document.querySelector("#admin-start").onclick = async () => {
  if (location.protocol === "file:") {
    location.href = "http://localhost:4173/admin/";
    return;
  }
  const start = document.querySelector("#admin-start");
  start.disabled = true;
  status.textContent = "Verifying your Twitch access…";
  try {
    if (!adminToken()) {
      openAdminLogin();
      return;
    }
    await verifyAdmin();
  } catch (e) {
    status.textContent = e.message;
  } finally {
    start.disabled = !adminEnabled || !!pendingLogin;
  }
};
async function refreshAdminUsers() {
  const data = await api("users");
  const container = document.querySelector("#admin-users-list");
  container.replaceChildren();
  for (const admin of data.admins) {
    const row = document.createElement("div");
    row.className = "request-card admin-user-row";
    const label = document.createElement("span");
    label.textContent = admin.username + " · " + admin.role;
    row.append(label);
    if (admin.role !== "owner") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove admin " + admin.username);
      remove.onclick = async () => {
        if (!confirm("Remove admin access for " + admin.username + "?")) return;
        remove.disabled = true;
        try {
          await api("users", { action: "remove", userId: admin.userId });
          await refreshAdminUsers();
          document.querySelector("#admin-users-status").textContent =
            "Admin access removed.";
        } catch (e) {
          document.querySelector("#admin-users-status").textContent = e.message;
          remove.disabled = false;
        }
      };
      row.append(remove);
    }
    container.append(row);
  }
}
document.querySelector("#add-admin-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.disabled = true;
  const note = document.querySelector("#admin-users-status");
  note.textContent = "Checking Twitch account…";
  try {
    await api("users", {
      action: "add",
      username: document.querySelector("#new-admin-username").value,
    });
    event.target.reset();
    await refreshAdminUsers();
    note.textContent =
      "Admin added. Access applies on their next admin request.";
  } catch (e) {
    note.textContent = e.message;
  } finally {
    button.disabled = false;
  }
};
function adminToken() {
  if (freshToken) return freshToken;
  try {
    const saved = JSON.parse(localStorage.getItem("chick-twitch-session"));
    return saved?.expiresAt > Date.now() ? saved.token || "" : "";
  } catch {
    return "";
  }
}
void restoreAdminLogin();
