(function () {
  if (window.top !== window.self) return;
  if (!/\/html\/shell\.html$/i.test(window.location.pathname)) return;

  var MUSIC_SRC = window.NORDLUXE_MUSIC_SRC || '/assets/audio/WhatsApp-Video-2026-03-31-at-5.59.56-PM.mp3';
  var STORAGE_KEY = 'nordluxeMusicEnabled';
  var VOLUME_KEY = 'nordluxeMusicVolume';
  var TIME_KEY = 'nordluxeMusicTime';
  var PLAYING_KEY = 'nordluxeMusicPlaying';

  function getStoredVolume() {
    var v = parseFloat(localStorage.getItem(VOLUME_KEY) || '0.32');
    if (!Number.isFinite(v)) return 0.32;
    return Math.max(0, Math.min(1, v));
  }

  function isEnabled() {
    var value = localStorage.getItem(STORAGE_KEY);
    return value !== 'false';
  }

  function setEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  }

  function getSavedTime() {
    var t = parseFloat(sessionStorage.getItem(TIME_KEY) || '0');
    if (!Number.isFinite(t) || t < 0) return 0;
    return t;
  }

  function saveTime() {
    if (Number.isFinite(audio.currentTime)) {
      sessionStorage.setItem(TIME_KEY, String(audio.currentTime));
    }
  }

  function setPlaying(playing) {
    sessionStorage.setItem(PLAYING_KEY, playing ? 'true' : 'false');
  }

  function wasPlaying() {
    return sessionStorage.getItem(PLAYING_KEY) === 'true';
  }

  var audio = document.createElement('audio');
  audio.src = MUSIC_SRC;
  audio.loop = false;
  audio.preload = 'auto';
  audio.volume = getStoredVolume();
  audio.setAttribute('playsinline', '');
  document.body.appendChild(audio);

  var resumeTime = getSavedTime();
  if (resumeTime > 0) {
    audio.currentTime = resumeTime;
  }

  var button = document.createElement('button');
  button.type = 'button';
  button.id = 'nordluxe-audio-toggle';
  button.setAttribute('aria-label', 'Toggle background music');
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = '' +
    '<span class="nordluxe-audio-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
        '<path d="M10 4.5v10.2a3.8 3.8 0 1 1-1.6-3.1V7.3l9.2-2.4v8.8a3.8 3.8 0 1 1-1.6-3.1V2.8L10 4.5z"></path>' +
      '</svg>' +
    '</span>';

  var style = document.createElement('style');
  style.textContent = '' +
    '#nordluxe-audio-toggle{' +
      'position:fixed;' +
      'right:18px;' +
      'bottom:calc(18px + env(safe-area-inset-bottom, 0px));' +
      'z-index:2147483647;' +
      'width:46px;' +
      'height:46px;' +
      'border:1px solid rgba(209,155,72,0.55);' +
      'background:rgba(255,250,242,0.94);' +
      'color:#8f6928;' +
      'border-radius:50%;' +
      'cursor:pointer;' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'pointer-events:auto;' +
      'touch-action:manipulation;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.16);' +
      'transition:transform 0.18s ease, box-shadow 0.22s ease, background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;' +
    '}' +
    '#nordluxe-audio-toggle:hover{transform:translateY(-1px);}' +
    '#nordluxe-audio-toggle:active{transform:translateY(0) scale(0.97);}' +
    '#nordluxe-audio-toggle .nordluxe-audio-icon{' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'width:22px;' +
      'height:22px;' +
    '}' +
    '#nordluxe-audio-toggle .nordluxe-audio-icon svg{' +
      'display:block;' +
      'width:22px;' +
      'height:22px;' +
      'fill:currentColor;' +
    '}' +
    '#nordluxe-audio-toggle.off{' +
      'background:rgba(255,250,242,0.92);' +
      'color:#947c52;' +
      'border-color:rgba(145,124,82,0.35);' +
      'box-shadow:0 6px 18px rgba(0,0,0,0.12);' +
    '}' +
    '#nordluxe-audio-toggle.is-on{' +
      'background:radial-gradient(circle at 32% 30%, #ffe6b2 0%, #d19b48 62%, #b17a28 100%);' +
      'color:#ffffff;' +
      'border-color:#d19b48;' +
      'box-shadow:0 0 0 2px rgba(209,155,72,0.25), 0 0 18px rgba(209,155,72,0.55), 0 10px 24px rgba(70,45,12,0.3);' +
    '}';

  document.head.appendChild(style);
  document.body.appendChild(button);

  function updateButtonState() {
    var on = !audio.paused;
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', on ? 'Turn background music off' : 'Turn background music on');
    button.title = on ? 'Music on' : 'Music off';
    button.classList.toggle('is-on', on);
    button.classList.toggle('off', !on);
  }

  async function tryPlay() {
    if (!isEnabled()) {
      setPlaying(false);
      updateButtonState();
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch (err) {
      // Autoplay may be blocked; playback will retry on first user interaction.
      setPlaying(false);
    }

    updateButtonState();
  }

  button.addEventListener('click', async function () {
    if (audio.paused) {
      setEnabled(true);
      await tryPlay();
    } else {
      saveTime();
      audio.pause();
      setEnabled(false);
      setPlaying(false);
      updateButtonState();
    }
  });

  audio.addEventListener('timeupdate', saveTime);

  audio.addEventListener('pause', function () {
    saveTime();
    setPlaying(false);
    updateButtonState();
  });

  audio.addEventListener('play', function () {
    setPlaying(true);
    updateButtonState();
  });

  audio.addEventListener('ended', function () {
    sessionStorage.removeItem(TIME_KEY);
    setPlaying(false);
    setEnabled(false);
    updateButtonState();
  });

  window.addEventListener('beforeunload', function () {
    saveTime();
    setPlaying(!audio.paused && isEnabled());
  });

  var firstInteractionHandler = async function () {
    if (isEnabled() && audio.paused) {
      await tryPlay();
    }
    document.removeEventListener('click', firstInteractionHandler);
    document.removeEventListener('keydown', firstInteractionHandler);
    document.removeEventListener('touchstart', firstInteractionHandler);
  };

  document.addEventListener('click', firstInteractionHandler, { passive: true });
  document.addEventListener('keydown', firstInteractionHandler, { passive: true });
  document.addEventListener('touchstart', firstInteractionHandler, { passive: true });

  if (isEnabled() && wasPlaying()) {
    tryPlay();
  } else {
    updateButtonState();
  }
})();
