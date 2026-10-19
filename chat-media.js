function chatMedia(text) {
  const match = text.match(
    /\[(s|img|video|v|y)\]\s*(https:\/\/[^\s<>\[\]]+)(?:\s*\[(?:t|e)\]|\s*\[\/(?:s|img|video|v|y)\])?/i,
  );
  if (!match) return null;
  try {
    const url = new URL(match[2]);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.replace(/^www\./, '');
    const youtube = ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host);
    let youtubeId = null;
    if (youtube) {
      if (host === 'youtu.be') youtubeId = url.pathname.split('/')[1];
      else if (url.pathname === '/watch') youtubeId = url.searchParams.get('v');
      else {
        const path = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})(?:\/|$)/);
        youtubeId = path?.[1];
      }
    }
    const embed = /^[\w-]{11}$/.test(youtubeId || '')
      ? 'https://www.youtube-nocookie.com/embed/' + youtubeId
      : null;
    const directVideo = /\.(mp4|webm)$/i.test(url.pathname);
    // A recognized video URL takes priority over another client's generic [s] tag.
    const kind = embed || directVideo ? 'video'
      : /^(s|img)$/i.test(match[1]) || /\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname)
        ? 'image' : 'video';
    return {
      kind,
      url: url.href,
      embed,
      start: match.index,
      end: match.index + match[0].length,
      directVideo,
    };
  } catch {
    return null;
  }
}
function renderChatContent(text) {
  const media = chatMedia(text);
  if (!media)
    return typeof renderEmoteText === "function"
      ? renderEmoteText(text)
      : el("span", "", text);
  const content = el("div", "chat-media");
  const renderText = (value) => typeof renderEmoteText === 'function' ? renderEmoteText(value) : el('span', '', value);
  if (media.start) content.append(renderText(text.slice(0, media.start)));
  const link = el(
    "a",
    "media-link",
    media.kind === "image" ? "Open image ↗" : "Open video ↗",
  );
  link.href = media.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  let player;
  if (media.kind === "image") {
    player = el("img");
    player.alt = "Image shared in chat";
    player.loading = "lazy";
    player.referrerPolicy = "no-referrer";
    player.src = media.url;
  } else if (media.embed) {
    player = el("iframe");
    player.title = "YouTube video shared in chat";
    player.referrerPolicy = "strict-origin-when-cross-origin";
    player.src = media.embed;
    player.allow = "encrypted-media; fullscreen; picture-in-picture";
    player.allowFullscreen = true;
  } else if (media.directVideo) {
    player = el("video");
    player.controls = true;
    player.preload = "metadata";
    player.playsInline = true;
    // Request an early frame for the paused preview after learning the duration.
    // Keep the original signed URL untouched and never start playback automatically.
    player.addEventListener("loadedmetadata", () => {
      if (player.paused && player.currentTime === 0 && Number.isFinite(player.duration) && player.duration > 0) {
        try { player.currentTime = Math.min(0.01, player.duration / 2); } catch {}
      }
    }, { once: true });
    player.referrerPolicy = "no-referrer";
    player.src = media.url;
  }
  if (player) {
    player.onerror = () => {
      player.remove();
      content.append(link);
      content.append(
        el("small", "", "Preview unavailable. Use the link above."),
      );
    };
    if (media.kind === "image") {
      link.textContent = "";
      link.setAttribute("aria-label", "Open image in a new tab");
      link.append(player);
      content.append(link);
      player.onerror = () => {
        player.remove();
        link.textContent = "Open image ↗";
      };
    } else content.append(player);
  } else content.append(link);
  if (media.end < text.length)
    content.append(renderText(text.slice(media.end)));
  return content;
}
function insertMediaTag(kind) {
  const input = $("#message"),
    tag = kind === "image" ? "[s] " : "[video] ";
  const start = input.selectionStart ?? input.value.length,
    end = input.selectionEnd ?? start;
  if (input.value.length - (end - start) + tag.length > input.maxLength) {
    toast("The message is too long to add a tag.");
    return;
  }
  input.setRangeText(tag, start, end, "end");
  input.focus();
}
document.addEventListener("DOMContentLoaded", () => {
  const tools = el("div", "media-tools");
  for (const [kind, label] of [
    ["image", "Image"],
    ["video", "Video"],
  ]) {
    const b = el("button", "", label);
    b.type = "button";
    b.onclick = () => insertMediaTag(kind);
    tools.append(b);
  }
  $("#send-form").before(tools);
  const sizes = el("div", "font-controls");
  sizes.setAttribute("aria-label", "Chat font size");
  const smaller = el("button", "", "A−"),
    value = el("span"),
    larger = el("button", "", "A+");
  smaller.type = larger.type = "button";
  smaller.setAttribute("aria-label", "Decrease chat font size");
  larger.setAttribute("aria-label", "Increase chat font size");
  let size = 16;
  try {
    const stored = Number(localStorage.getItem("chick-chat-font"));
    if (stored >= 12 && stored <= 24) size = stored;
  } catch {}
  function apply() {
    document.documentElement.style.setProperty("--chat-font-size", size + "px");
    value.textContent = size + "px";
    smaller.disabled = size <= 12;
    larger.disabled = size >= 24;
    try {
      localStorage.setItem("chick-chat-font", String(size));
    } catch {}
  }
  smaller.onclick = () => {
    size = Math.max(12, size - 1);
    apply();
  };
  larger.onclick = () => {
    size = Math.min(24, size + 1);
    apply();
  };
  sizes.append(smaller, value, larger);
  tools.append(sizes);
  apply();
});
