// Runs before the watch page scripts when Twitch returns to this directory.
(() => {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  if (!window.opener || (!hash.has('access_token') && !query.has('error'))) return;
  const result = {
    type: 'chicktv-twitch-auth',
    token: hash.get('access_token'),
    state: hash.get('state') || query.get('state'),
    error: query.get('error')
  };
  history.replaceState(null, '', location.pathname);
  window.opener.postMessage(result, location.origin);
  window.close();
})();
