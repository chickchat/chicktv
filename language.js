// Translate interface text only; channel names and chat messages are user content.
(() => {
  const labels = {
    'Receive desktop notifications': '接收桌面通知',
    'Keep ChickTV open. Sleeping tabs or system settings may delay notifications.': '需保持 ChickTV 開啟；分頁休眠或系統設定可能延遲通知。',
    'Desktop notifications are unavailable in this browser.': '此瀏覽器不支援桌面通知。',
    "Notifications are blocked. Allow them in your browser's site settings.": '通知已被封鎖，請在瀏覽器的網站設定中允許通知。',

    'Screen': '畫面',
    'Auto-replace offline pins': '固定畫面自動替補',
    'Replace offline pinned channels with online channels; keep the original pins.': '固定頻道離線時，以其他線上頻道替補；保留原本的固定設定。',
    'Replacing offline pin': '替補中',
    'Replacement offline; waiting for an online channel': '替補頻道已離線，等待其他在線頻道',
    'Playback failed; waiting for an available channel': '播放失敗，等待可用頻道',
    'Original channel is online': '原頻道已上線',
    'Switch back': '切回原頻道',

    '📌 Pin screen': '📌 固定畫面',
    '📌 Unpin screen': '📌 取消固定',
    'Chat history is unavailable in this browser. Messages may disappear after refresh.': '此瀏覽器無法儲存或讀取聊天紀錄，重新整理後訊息可能消失。',
    Provider: '平台',
    'Other providers (URL)': '其他平台（網址）',
    'Gosh channel ID': 'Gosh 頻道 ID',
    'Enter a valid Gosh channel ID.': '請輸入有效的 Gosh 頻道 ID。',
    'This Gosh channel is already listed.': '此 Gosh 頻道已在清單中。',
    'Enter a valid channel URL.': '請輸入有效的頻道網址。',
    Image: '圖片',
    Video: '影片',
    Close: '關閉',
    'Search emotes…': '搜尋表情…',
    '🔊 Enable sound': '🔊 開啟聲音',
    '🔇 Mute sound': '🔇 靜音',
    'YOUR CHANNELS': '預製區',
    'MY CHANNELS': '自助區',
    'Request channel': '加台 (預製區)',
    '＋ Personal channel': '加台 (自助區)',
    '▣ Add screen': '▣ 新增畫面',
    'WATCH TOGETHER': '一起看直播',
    'THE WATCH ROOM': '觀看區',
    '▦ Grid view': '▦ 網格排列',
    '▤ Stacked view': '▤ 垂直排列',
    '⛶ Theater mode': '⛶ 劇院模式',
    '⛶ Exit theater': '⛶ 離開劇院模式',
    'Your personal channels appear here': '你的自助頻道會顯示在這裡',
    'Checking channel availability…': '正在檢查頻道狀態…',
    'Click a screen, then pick a channel': '點選畫面，再選擇頻道',
    '· Click a screen, then pick a channel': '· 點選畫面，再選擇頻道',
    'Choose an available channel': '選擇可用的頻道',
    'No channels are currently available': '目前沒有可用的頻道',
    'Hide offline': '隱藏離線',
    'Show offline': '顯示離線',
    All: '全部',
    'Edit personal channel': '編輯自助頻道',
    'Save changes': '儲存變更',
    'Personal channel updated in this browser.': '已在此瀏覽器更新自助頻道。',
    'Personal channel order updated in this browser.': '已在此瀏覽器更新自助頻道順序。',
    'Bring another favorite into your watch room.': '將喜歡的頻道加入觀看區。',
    'Update this channel’s name or link.': '更新此頻道的名稱或網址。',
    'Suggest a channel for the shared list.': '推薦頻道加入共用清單。',
    'Only personal channels can be edited here.': '此處只能編輯自助頻道。',
    'This personal channel is no longer available to edit.': '此自助頻道已無法編輯。',
    'Your corner of the internet.': '你的網路小天地。',
    'Switch channels. Add another screen. Stay for the conversation.':
      '切換頻道、新增畫面，一起聊天。',
    'MAKE YOURSELF AT HOME': '輕鬆自在地看',
    'Top 10 in the coop': '聊天室活躍前十名',
    'Messages received since you opened this page · resets on refresh':
      '依開啟頁面後收到的訊息計算，重新整理後重設',
    'Waiting for chat messages…': '等待聊天訊息…',
    'The chicken coop': '小雞聊天室',
    'Connecting…': '連線中…',
    Connected: '已連線',
    'Connection unavailable': '無法連線',
    'Reconnecting…': '重新連線中…',
    'Same room. Different screens. Good vibes.': '同一個聊天室，不同畫面，一起同樂。',
    '☷ Same room. Different screens. Good vibes.': '☷ 同一個聊天室，不同畫面，一起同樂。',
    TODAY: '今天',
    'Welcome to the coop': '歡迎來到小雞聊天室',
    'Live Twitch messages appear here.': 'Twitch 即時訊息會顯示在這裡。',
    'Say hello and watch together.': '打個招呼，一起看直播。',
    'Join the conversation…': '加入聊天…',
    'Connect to Twitch ↗': '連接 Twitch ↗',
    'Disconnect Twitch': '中斷 Twitch 連線',
    '圖片 · Image': '圖片',
    '影片 · Video': '影片',
    '☻ Twitch emotes': '☻ Twitch 表情',
    '🎮 SKLive emotes': '🎮 SKLive 表情',
    'Add a personal channel': '加台 (自助區)',
    'Request a permanent channel': '加台 (預製區)',
    'Add personal channel': '新增自助頻道',
    'Send request': '送出申請',
    'Bring another favorite into your watch room.': '將喜歡的頻道加入觀看區。',
    'Channel name': '頻道名稱',
    'Channel or video URL': '頻道或影片網址',
    'My favorite channel': '我喜歡的頻道',
    'Supports Twitch, Kick, YouTube, direct MP4 / HLS, and HTTPS embed URLs. Providers must allow embedding.':
      '支援 Twitch、Kick、YouTube、MP4 / HLS 及 HTTPS 嵌入網址，來源須允許嵌入。',
    'Open original channel ↗': '開啟原始頻道 ↗',
    'Taking a little break': '稍作休息',
    'This channel is currently offline.': '此頻道目前離線。',
    'Stream unavailable': '無法播放直播',
    'The provider could not be reached. Try the original channel or select another.':
      '無法連接直播來源，請開啟原始頻道或選擇其他頻道。'
  };
  let language = 'zh-Hant';
  try {
    language = localStorage.getItem('chick-language') === 'en' ? 'en' : 'zh-Hant';
  } catch {}
  const originals = new WeakMap();
  function translated(text) {
    const key = text.trim().replace(/\s+/g, ' ');
    if (labels[key]) return text.replace(text.trim(), labels[key]);
    if (language !== 'en' && key.endsWith(' · Offline'))
      return text.replace(/ · Offline$/i, ' · 離線');
    if (/^Online channels: \d+$/.test(key))
      return key.replace('Online channels:', '在線頻道:');
    if (/^\d+ channels$/.test(key)) return key.replace(' channels', ' 個頻道');
    if (/^\d+ screens?$/.test(key)) return key.replace(/ screens?$/, ' 個畫面');
    if (/^SCREEN \d+$/.test(key)) return key.replace('SCREEN', '畫面');
    return text;
  }
  function apply() {
    observer.disconnect();
    document.documentElement.lang = language;
    const brand = document.querySelector('.brand b');
    if (brand) {
      const prefix = language === 'en' ? 'chick' : '雞友';
      const suffix = language === 'en' ? 'tv' : '台';
      if (brand.firstChild.nodeValue !== prefix) brand.firstChild.nodeValue = prefix;
      if (brand.querySelector('span').textContent !== suffix)
        brand.querySelector('span').textContent = suffix;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        node.parentElement.closest(
          'script, style, .brand b, .bubble, .channel, #toast, #language-toggle, .reply-preview'
        )
      )
        continue;
      const previous = originals.get(node);
      const original =
        previous && node.nodeValue === previous.output ? previous.original : node.nodeValue;
      const output = language === 'en' ? original : translated(original);
      originals.set(node, { original, output });
      if (node.nodeValue !== output) node.nodeValue = output;
    }
    for (const input of document.querySelectorAll('input[placeholder]')) {
      if (!input.dataset.englishPlaceholder) input.dataset.englishPlaceholder = input.placeholder;
      input.placeholder =
        language === 'en'
          ? input.dataset.englishPlaceholder
          : translated(input.dataset.englishPlaceholder);
    }
    const button = document.querySelector('#language-toggle');
    button.textContent = language === 'en' ? '繁體中文' : 'English';
    button.setAttribute(
      'aria-label',
      language === 'en' ? 'Switch to Traditional Chinese' : '切換至英文'
    );
    const offlineFilter = document.querySelector('#hide-offline');
    if (offlineFilter)
      offlineFilter.title =
        language === 'en'
          ? offlineFilter.getAttribute('aria-pressed') === 'true'
            ? 'Show offline or unverified channels'
            : 'Show only confirmed online channels'
          : offlineFilter.getAttribute('aria-pressed') === 'true'
            ? '顯示離線或狀態未確認的頻道'
            : '只顯示已確認在線的頻道';
    document.querySelectorAll('.kick-sound').forEach((button) => {
      const muted = button.dataset.requestedMuted === 'true';
      const label = language === 'en' ? (muted ? 'Enable sound' : 'Mute sound') : (muted ? '開啟聲音' : '靜音');
      button.setAttribute('aria-label', label);
      button.title = label + (language === 'en' ? ' (reloads this Kick player)' : '（會重新載入此 Kick 播放器）');
    });
    document.querySelectorAll('.screen-channel-filter').forEach((filter) => {
      filter.setAttribute(
        'aria-label',
        language === 'en' ? 'Channel status filter' : '頻道狀態篩選',
      );
      filter.title =
        language === 'en'
          ? 'Choose whether to include offline channels'
          : '選擇是否顯示離線頻道';
    });
    document.querySelectorAll('.personal-move-up').forEach((button) => {
      const label = language === 'en' ? 'Move channel up' : '將頻道上移';
      button.title = label;
      button.setAttribute('aria-label', label);
    });
    document.querySelectorAll('.personal-move-down').forEach((button) => {
      const label = language === 'en' ? 'Move channel down' : '將頻道下移';
      button.title = label;
      button.setAttribute('aria-label', label);
    });
    document.querySelectorAll('.personal-actions-toggle').forEach((button) => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      const label = language === 'en'
        ? expanded ? 'Hide personal channel actions' : 'Show personal channel actions'
        : expanded ? '收起頻道管理按鈕' : '展開頻道管理按鈕';
      button.title = label;
      button.setAttribute('aria-label', label);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  const observer = new MutationObserver(apply);
  document.querySelector('#language-toggle').onclick = () => {
    language = language === 'en' ? 'zh-Hant' : 'en';
    try {
      localStorage.setItem('chick-language', language);
    } catch {}
    apply();
  };
  apply();
})();
