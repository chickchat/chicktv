let authPopup = null,
  pendingAuth = null,
  popupPoll = null;
const twitchSessionKey = 'chick-twitch-session';
function forgetTwitchSession() {
  try {
    localStorage.removeItem(twitchSessionKey);
    sessionStorage.removeItem(twitchSessionKey);
  } catch {}
}
function login() {
  const client = window.CHICKTV_CONFIG.twitchClientId || saved('twitch-client', '');
  if (!client) {
    toast(
      'Twitch connection is not set up yet. The site owner must configure its public Twitch Client ID.'
    );
    return;
  }
  if (authPopup && !authPopup.closed) {
    authPopup.focus();
    return;
  }
  const state = crypto.randomUUID();
  const u = new URL('https://id.twitch.tv/oauth2/authorize');
  u.search = new URLSearchParams({
    client_id: client,
    redirect_uri: redirect,
    response_type: 'token',
    scope: 'chat:read chat:edit',
    state
  });
  pendingAuth = { state, client };
  authPopup = window.open(u.href, 'chicktv-twitch-login', 'popup=yes,width=520,height=760');
  if (!authPopup) {
    pendingAuth = null;
    toast('Please allow popups for this site, then click Connect to Twitch again.');
    return;
  }
  $('#auth-note').textContent = 'Complete sign-in in the Twitch window…';
  popupPoll = setInterval(() => {
    if (authPopup?.closed) {
      clearInterval(popupPoll);
      pendingAuth = null;
      authPopup = null;
      if (!twitchUser) $('#auth-note').textContent = 'Reading as a guest';
    }
  }, 500);
}
async function acceptTwitchToken(accessToken, client, restoring = false) {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: 'OAuth ' + accessToken }
  });
  if (!response.ok) {
    const error = Error('Sign-in expired or was rejected. Please try again.');
    error.invalidSession = response.status === 401 || response.status === 403;
    throw error;
  }
  const user = await response.json();
  if (
    user.client_id !== client ||
    !user.login ||
    !['chat:read', 'chat:edit'].every((s) => user.scopes?.includes(s))
  ) {
    const error = Error('Twitch did not grant the required chat connection.');
    error.invalidSession = true;
    throw error;
  }
  token = accessToken;
  twitchUser = user;
  // Validation returns the login; the user profile supplies the display name.
  try {
    const profile = await fetch('https://api.twitch.tv/helix/users', {
      headers: { Authorization: 'Bearer ' + accessToken, 'Client-Id': client }
    });
    if (profile.ok) {
      const data = await profile.json();
      const own = data.data?.find((p) => p.login?.toLowerCase() === user.login.toLowerCase());
      if (own?.display_name) twitchUser.display_name = own.display_name;
    }
  } catch {}
  try {
    localStorage.setItem(
      twitchSessionKey,
      JSON.stringify({
        token: accessToken,
        client,
        expiresAt: Date.now() + (user.expires_in || 3600) * 1000
      })
    );
    sessionStorage.removeItem(twitchSessionKey);
  } catch {}
  if (typeof loadChatBadges === 'function') void loadChatBadges();
  if (typeof loadTwitchEmotes === 'function') void loadTwitchEmotes();
  $('#auth-note').textContent = 'Signed in as ' + user.login;
  $('#login').textContent = 'Disconnect Twitch';
  $('#login').onclick = () => {
    forgetTwitchSession();
    token = null;
    twitchUser = null;
    $('#auth-note').textContent = 'Reading as a guest';
    $('#login').textContent = 'Connect to Twitch ↗';
    $('#login').onclick = login;
    connect();
  };
  if (!restoring) {
    connect();
    if (typeof checkAvailability === 'function') void checkAvailability(false);
    toast('Connected to Twitch as ' + user.login);
  }
}
window.addEventListener('message', async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== authPopup ||
    event.data?.type !== 'chicktv-twitch-auth' ||
    !pendingAuth
  )
    return;
  const pending = pendingAuth;
  pendingAuth = null;
  clearInterval(popupPoll);
  if (event.data.state !== pending.state) {
    toast('Twitch sign-in could not be verified. Please try again.');
    return;
  }
  try {
    if (event.data.error || !event.data.token) throw Error('Twitch sign-in was cancelled.');
    await acceptTwitchToken(event.data.token, pending.client);
  } catch (e) {
    $('#auth-note').textContent = 'Reading as a guest';
    toast(e.message);
  } finally {
    authPopup?.close();
    authPopup = null;
  }
});
// Legacy full-page OAuth returns still validate state before accepting a token.
async function auth() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (!hash.has('access_token')) {
    let stored;
    try {
      stored = JSON.parse(
        localStorage.getItem(twitchSessionKey) || sessionStorage.getItem(twitchSessionKey)
      );
    } catch {
      forgetTwitchSession();
      return;
    }
    if (!stored) return;
    const client = window.CHICKTV_CONFIG.twitchClientId || saved('twitch-client', '');
    if (!stored.token || stored.client !== client || !(stored.expiresAt > Date.now())) {
      forgetTwitchSession();
      return;
    }
    $('#auth-note').textContent = 'Restoring Twitch connection…';
    try {
      await acceptTwitchToken(stored.token, client, true);
    } catch (error) {
      if (error.invalidSession) forgetTwitchSession();
      token = null;
      twitchUser = null;
      $('#auth-note').textContent = 'Reading as a guest';
      toast(
        error.invalidSession
          ? 'Twitch sign-in has expired. Please connect again.'
          : 'Cannot reach Twitch right now. Your saved login is kept; refresh to retry.'
      );
    }
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  const state = sessionStorage.getItem('twitch-state');
  sessionStorage.removeItem('twitch-state');
  if (!state || hash.get('state') !== state) {
    toast('Please click Connect to Twitch to sign in.');
    return;
  }
  try {
    await acceptTwitchToken(
      hash.get('access_token'),
      window.CHICKTV_CONFIG.twitchClientId || saved('twitch-client', '')
    );
  } catch (e) {
    toast(e.message);
  }
}
