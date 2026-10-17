function statusProvider(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (['play.sooplive.com', 'play.sooplive.co.kr'].includes(url.hostname)) {
      const id = url.pathname.split('/')[1];
      return /^[a-z0-9_-]{1,80}$/i.test(id || '') ? { provider: 'soop', id } : null;
    }
    if (
      [
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'www.youtube-nocookie.com',
        'youtu.be'
      ].includes(url.hostname)
    ) {
      const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
      return /^[\w-]{11}$/.test(id || '') ? { provider: 'youtube', id } : null;
    }
  } catch {}
  return null;
}
function angelThumpChannel(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const name =
      url.hostname === 'player.angelthump.com'
        ? url.searchParams.get('channel')
        : ['angelthump.com', 'www.angelthump.com'].includes(url.hostname)
          ? url.pathname.split('/')[1]
          : null;
    return /^[a-z0-9_-]{1,80}$/i.test(name || '') ? name.toLowerCase() : null;
  } catch {
    return null;
  }
}
function nextScreenChannel(channels, screens, current, isOnline) {
  for (let offset = 1; offset <= channels.length; offset++) {
    const index = (current + offset) % channels.length;
    if (!screens.includes(index) && isOnline(channels[index])) return index;
  }
  return -1;
}
function providerPlayerUrl(value) {
  const url = new URL(value);
  if (
    url.protocol === 'https:' &&
    ['angelthump.com', 'www.angelthump.com'].includes(url.hostname) &&
    /^\/[a-z0-9_-]+\/?$/i.test(url.pathname)
  ) {
    const player = new URL('https://player.angelthump.com/');
    player.searchParams.set('channel', url.pathname.split('/')[1]);
    return player.href;
  }
  if (
    url.protocol === 'https:' &&
    ['play.sooplive.com', 'play.sooplive.co.kr'].includes(url.hostname) &&
    /^\/[a-z0-9_-]+(?:\/\d+)?(?:\/embed)?\/?$/i.test(url.pathname)
  ) {
    url.pathname = url.pathname.replace(/\/$/, '').replace(/\/embed$/, '') + '/embed';
    return url.href;
  }
  return value;
}
