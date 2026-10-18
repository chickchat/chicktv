// Public browser configuration only. Never put secrets or tokens here.
(() => {
  const loopbackHosts = ['localhost', '127.0.0.1'];
  const localEnvironment = location.protocol === 'http:' && loopbackHosts.includes(location.hostname);
  const apiBaseUrl = localEnvironment
    ? 'http://localhost:8787'
    : 'https://chicktv-api.homeboykeroro96.workers.dev';
  const backend = new URL(apiBaseUrl);
  const backendEnabled = backend.protocol === 'https:' ||
    (localEnvironment && backend.protocol === 'http:' && loopbackHosts.includes(backend.hostname));
  window.CHICKTV_CONFIG = Object.freeze({
    apiBaseUrl,
    backendEnabled,
    localEnvironment,
    twitchClientId: 'gt77e2hv1pwngj386byur6d28iptsz'
  });
})();