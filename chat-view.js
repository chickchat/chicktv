// Switch presentation only. The existing custom-chat socket and message DOM stay alive.
(() => {
  const toggle = document.querySelector('#chat-view-toggle');
  const nativePanel = document.querySelector('#native-chat');
  const messages = document.querySelector('#messages');
  const panel = toggle?.closest('aside');
  if (!toggle || !nativePanel || !messages || !panel) return;
  let nativeFrame;
  toggle.onclick = () => {
    const useTwitch = toggle.getAttribute('aria-checked') !== 'true';
    if (useTwitch && !nativeFrame) {
      const url = new URL('https://www.twitch.tv/embed/' + encodeURIComponent(room) + '/chat');
      url.searchParams.set('parent', location.hostname);
      url.searchParams.set('darkpopout', '');
      nativeFrame = document.createElement('iframe');
      nativeFrame.title = 'Twitch chat';
      nativeFrame.src = url.href;
      nativeFrame.referrerPolicy = 'strict-origin-when-cross-origin';
      nativePanel.append(nativeFrame);
    }
    toggle.setAttribute('aria-checked', String(useTwitch));
    panel.classList.toggle('native-chat-active', useTwitch);
    nativePanel.hidden = !useTwitch;
    messages.setAttribute('aria-live', useTwitch ? 'off' : 'polite');
    if (!useTwitch) requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  };
})();
