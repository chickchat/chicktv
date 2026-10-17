const status = document.querySelector('#admin-status'),
  list = document.querySelector('#requests');
const local =
  ['localhost', '127.0.0.1'].includes(location.hostname) && !window.CHICKTV_CONFIG.apiBaseUrl;
let loginPopup = null;
let pendingLogin = null;
let loginPoll = null;
let freshToken = '';

function openAdminLogin() {
  const client = window.CHICKTV_CONFIG.twitchClientId;
  if (!client) throw Error('Twitch sign-in has not been configured.');
  const state = crypto.randomUUID();
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: client,
    redirect_uri: new URL('../', location.href).href,
    response_type: 'token',
    scope: 'chat:read chat:edit',
    state
  });
  pendingLogin = { state, client };
  loginPopup = window.open(url.href, 'chicktv-twitch-login', 'popup=yes,width=520,height=760');
  if (!loginPopup) {
    pendingLogin = null;
    throw Error('Please allow popups for this site, then try again.');
  }
  status.textContent = 'Complete Twitch sign-in in the popup…';
  document.querySelector('#admin-start').disabled = true;
  loginPoll = setInterval(() => {
    if (loginPopup?.closed && pendingLogin) {
      clearInterval(loginPoll);
      pendingLogin = null;
      status.textContent = 'Twitch sign-in was cancelled. Click the button to try again.';
      document.querySelector('#admin-start').disabled = false;
    }
  }, 500);
}

window.addEventListener('message', async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== loginPopup ||
    event.data?.type !== 'chicktv-twitch-auth' ||
    !pendingLogin
  )
    return;
  const pending = pendingLogin;
  pendingLogin = null;
  clearInterval(loginPoll);
  try {
    if (event.data.state !== pending.state)
      throw Error('Could not verify Twitch sign-in. Try again.');
    if (event.data.error || !event.data.token) throw Error('Twitch sign-in was cancelled.');
    freshToken = event.data.token;
    const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + freshToken }
    });
    if (!validation.ok) throw Error('Twitch sign-in expired. Please try again.');
    const identity = await validation.json();
    if (identity.client_id !== pending.client || !(identity.expires_in > 0))
      throw Error('Could not verify Twitch sign-in. Please try again.');
    await verifyAdmin();
    localStorage.setItem(
      'chick-twitch-session',
      JSON.stringify({
        token: freshToken,
        client: pending.client,
        expiresAt: Date.now() + identity.expires_in * 1000
      })
    );
  } catch (e) {
    status.textContent = e.message;
  } finally {
    freshToken = '';
    loginPopup?.close();
    loginPopup = null;
    document.querySelector('#admin-start').disabled = !local;
  }
});
if (location.protocol === 'file:') {
  status.textContent =
    'Open http://localhost:4173/admin/ to use the admin portal. Opening this file directly cannot connect to the server.';
  document.querySelector('#admin-start').textContent = 'Open local admin portal';
} else if (!local) {
  status.textContent =
    'Hosted administration is not connected yet. Please use the local server for now.';
  document.querySelector('#admin-start').disabled = true;
}
async function api(path, data) {
  const res = await fetch('../api/admin/' + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      Authorization: 'Bearer ' + adminToken()
    },
    body: data ? JSON.stringify(data) : undefined
  });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      list.replaceChildren();
      document.querySelector('#manage-channels').hidden = true;
      document.querySelector('#admin-users-section').hidden = true;
    }
    throw Error(body.error);
  }
  return body;
}
async function refresh() {
  const data = await api('requests');
  list.replaceChildren();
  for (const r of data.requests.slice().reverse()) {
    const card = document.createElement('section');
    card.className = 'request-card';
    const title = document.createElement('h2');
    title.textContent = r.channel.displayname;
    const info = document.createElement('p');
    info.textContent = r.channel.original + ' · ' + r.status;
    card.append(title, info);
    if (r.status === 'pending')
      for (const action of ['approve', 'reject']) {
        const b = document.createElement('button');
        b.textContent = action === 'approve' ? 'Approve' : 'Reject';
        b.onclick = async () => {
          try {
            await api('decision', { id: r.id, action });
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
  if (!data.requests.length) list.textContent = 'No requests yet. Submit one from the watch page.';
}
async function verifyAdmin() {
  const session = await api('session', {});
  await refresh();
  await refreshChannels();
  status.textContent = 'Verified Twitch administrator: ' + session.admin.username;
  document.querySelector('#admin-users-section').hidden = session.admin.role !== 'owner';
  if (session.admin.role === 'owner') await refreshAdminUsers();
}
async function refreshChannels() {
  const data = await api('channels');
  const container = document.querySelector('#admin-channels-list');
  container.replaceChildren();
  document.querySelector('#manage-channels').hidden = false;
  for (const channel of data.channels) {
    const row = document.createElement('div');
    row.className = 'request-card admin-user-row';
    const label = document.createElement('span');
    label.textContent = channel.displayname;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.onclick = async () => {
      if (!confirm('Delete ' + channel.displayname + ' from 預製區?')) return;
      remove.disabled = true;
      try {
        await api('channels', { action: 'delete', id: channel.deleteId });
        await refreshChannels();
        await refresh();
      } catch (error) {
        status.textContent = error.message;
        remove.disabled = false;
      }
    };
    row.append(label, remove);
    container.append(row);
  }
}
document.querySelector('#admin-start').onclick = async () => {
  if (location.protocol === 'file:') {
    location.href = 'http://localhost:4173/admin/';
    return;
  }
  const start = document.querySelector('#admin-start');
  start.disabled = true;
  status.textContent = 'Verifying your Twitch access…';
  try {
    if (!adminToken()) {
      openAdminLogin();
      return;
    }
    await verifyAdmin();
  } catch (e) {
    status.textContent = e.message;
  } finally {
    start.disabled = !local || !!pendingLogin;
  }
};
async function refreshAdminUsers() {
  const data = await api('users');
  const container = document.querySelector('#admin-users-list');
  container.replaceChildren();
  for (const admin of data.admins) {
    const row = document.createElement('div');
    row.className = 'request-card admin-user-row';
    const label = document.createElement('span');
    label.textContent = admin.username + ' · ' + admin.role;
    row.append(label);
    if (admin.role !== 'owner') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove admin ' + admin.username);
      remove.onclick = async () => {
        if (!confirm('Remove admin access for ' + admin.username + '?')) return;
        remove.disabled = true;
        try {
          await api('users', { action: 'remove', userId: admin.userId });
          await refreshAdminUsers();
          document.querySelector('#admin-users-status').textContent = 'Admin access removed.';
        } catch (e) {
          document.querySelector('#admin-users-status').textContent = e.message;
          remove.disabled = false;
        }
      };
      row.append(remove);
    }
    container.append(row);
  }
}
document.querySelector('#add-admin-form').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  button.disabled = true;
  const note = document.querySelector('#admin-users-status');
  note.textContent = 'Checking Twitch account…';
  try {
    await api('users', {
      action: 'add',
      username: document.querySelector('#new-admin-username').value
    });
    event.target.reset();
    await refreshAdminUsers();
    note.textContent = 'Admin added. Access applies on their next admin request.';
  } catch (e) {
    note.textContent = e.message;
  } finally {
    button.disabled = false;
  }
};
function adminToken() {
  if (freshToken) return freshToken;
  try {
    const saved = JSON.parse(localStorage.getItem('chick-twitch-session'));
    return saved?.expiresAt > Date.now() ? saved.token || '' : '';
  } catch {
    return '';
  }
}
