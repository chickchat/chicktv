// Runs before the watch page scripts when Twitch returns to this directory.
(() => {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const responsePresent = hash.has('access_token') || hash.has('error') || query.has('error');
  if (!responsePresent) return;
  // Some browsers do not show OAuth popup windows. The explicit same-tab admin
  // flow returns through the same registered root URL, then goes back to admin.
  const stored = sessionStorage.getItem('chicktv-admin-pending');
  if (stored) {
    sessionStorage.removeItem('chicktv-admin-pending');
    sessionStorage.removeItem('twitch-state');
    let result;
    try {
      const pending = JSON.parse(stored);
      const state = hash.get('state') || query.get('state');
      const valid = pending.state && pending.state === state && pending.expiresAt > Date.now();
      result = valid
        ? {
            token: hash.get('access_token'),
            client: pending.client,
            expiresAt: pending.expiresAt,
            error:
              query.get('error') || hash.get('error')
                ? 'Twitch sign-in was cancelled. Please try again.'
                : ''
          }
        : { error: 'Could not verify Twitch sign-in. Please try again.' };
    } catch {
      result = { error: 'Could not verify Twitch sign-in. Please try again.' };
    }
    history.replaceState(null, '', location.pathname);
    sessionStorage.setItem('chicktv-admin-result', JSON.stringify(result));
    location.replace(new URL('admin/', location.href).href);
    return;
  }
  if (!window.opener) return;
  const result = {
    type: 'chicktv-twitch-auth',
    token: hash.get('access_token'),
    state: hash.get('state') || query.get('state'),
    error: query.get('error') || hash.get('error')
  };
  history.replaceState(null, '', location.pathname);
  window.opener.postMessage(result, location.origin);
  window.close();
})();
