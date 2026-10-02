import { decodeKValue, formatTimeAgo, getFilenameFromPath } from './utils.js?v=57';
import { loadVideo } from './cdn-loader.js?v=57';
import { isDbReady, getDb } from './db/index.js?v=57';

/* =========================================================
   CONFIGURATION
   =========================================================
   -----------------------------------------------------------------
   AD / MONETIZATION TOGGLES
   -----------------------------------------------------------------
   Set ENABLED: true/false for each ad type to control which ads are
   shown to visitors.

   Currently ACTIVE (ALL ADS ON for V1):
     - VAST (ExoClick preroll)        : ON  (idz=6044284)
     - DOWNLOAD_AD (ExoClick)         : ON  (zone 6044324)
     - POPUNDER (al5sm.com)           : ON  (zone 10918787)
     - TELEGRAM_POPUP                 : ON  (trigger @ 30s → t.co/GxYOaEnjGy)
     - SMARTLINK_REDIRECT             : ON  (video end + skip button → omg10.com)
     - HISTATS (analytics)            : ON

   Currently DISABLED:
     - BANNER (ExoClick 320x50)       : OFF (removed)
     - SHUFFLE_BOX (xylitesmash)      : OFF (replaced by POPUNDER)
   ----------------------------------------------------------------- */
const CFG = {
  /* VAST preroll video ad (ExoClick) — plays before main video */
  VAST: {
    ENABLED: true,
    AD_TAG_URL: 'https://s.magsrv.com/v1/vast.php?idz=6044284',
    SKIP_DELAY: 5,
    FETCH_TIMEOUT: 6000,
    AD_TIMEOUT: 30000
  },

  /* ExoClick banner — DISABLED (removed) */
  BANNER: {
    ENABLED: false,
    DELAY: 1500,
    SHOW_CLOSE: true,
    ZONE: 6044296,
    PROVIDER_SCRIPT: 'https://a.magsrv.com/ad-provider.js',
    CONTAINER_CLASS: 'eas6a97888e10'
  },

  /* ExoClick download ad (replaces old download button) */
  DOWNLOAD_AD: {
    ENABLED: true,
    ZONE: 6044324,
    PROVIDER_SCRIPT: 'https://a.magsrv.com/ad-provider.js',
    CONTAINER_CLASS: 'eas6a97888e20'
  },

  /* Popunder (al5sm.com) — replaces Shuffle Box, fires on user click */
  POPUNDER: {
    ENABLED: true,
    ZONE: '10918787',
    SCRIPT_URL: 'https://al5sm.com/tag.min.js'
  },

  /* Telegram popup — visible overlay at TRIGGER_TIME seconds, redirects to Telegram */
  TELEGRAM_POPUP: {
    ENABLED: true,
    TRIGGER_TIME: 30,
    REDIRECT_URL: 'https://t.co/GxYOaEnjGy',
    TITLE: 'Continue watching?',
    DESCRIPTION: 'Press continue to keep watching the video.',
    BUTTON_TEXT: 'Continue Watching'
  },

  /* Smartlink redirect — fires on (a) video end, (b) skip button (button mode). */
  SMARTLINK_REDIRECT: {
    ENABLED: true,
    URL: 'https://omg10.com/4/10410353'
  },

  /* Histats analytics (s10.histats.com) */
  HISTATS: {
    ENABLED: true,
    SITE_ID: '4996898'
  },

  /* =========================================================
     LEGACY FIELDS — kept for backwards compat with existing logic
     ========================================================= */
  REDIRECT_URL: 'https://omg10.com/4/10410353',
  MONETIZATION_MODE: 'banner',
  SHOW_SKIP_BTN: false,
  BUTTON_TEXT: 'Click here to watch full video!',

  /* VIDEO CDN — tambahkan field `key` untuk matching dengan k-value */
  VIDEO_CDNS: [
    { key: 'slicedrive', name: 'Slicedrive', base: 'https://cdn.slicedrive.com' },
    { key: 'videy',      name: 'Videy',      base: 'https://cdn2.videy.co' },
    { key: 'aceimg',     name: 'Aceimg',     base: 'https://cdn.aceimg.com' },
    { key: 'xxfollow',   name: 'Xxfollow',   base: 'https://www.xxxfollow.com' },
    { key: 'xfree',      name: 'Xfree',      base: 'https://cdn.xfree.com' }
  ],

  FALLBACK: 'voDWqx8K1.mp4',
  CDN_TIMEOUT: 5000
};


/* =========================================================
   HELPERS
   ========================================================= */
function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';

  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);

  return m + ':' + String(s).padStart(2, '0');
}

function escapeHTML(str) {
  if (!str) return '';

  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));

  return div.innerHTML;
}


/* =========================================================
   RENDER PLAYER
   ========================================================= */
export function renderPlayer(container, route) {
  document.body.classList.add('is-player');
  document.body.classList.remove('is-feed');

  let btnShown = false;
  let redirectUrl = CFG.REDIRECT_URL;
  let controlsTimer = null;
  let bannerClosed = false;


  /* =========================================================
     PLAYER HTML
     Banner sekarang DI DALAM plr-container.
     ========================================================= */
  container.innerHTML =
    '<div class="plr-page" id="plr-page">' +

      '<div class="plr-player-wrap">' +

        '<div class="plr-container" id="plr-container">' +

          '<div class="plr-vignette"></div>' +

          '<video ' +
            'id="plr-video" ' +
            'autoplay ' +
            'playsinline ' +
            'muted ' +
            'disablePictureInPicture ' +
            'controlsList="nodownload noplaybackrate">' +
          '</video>' +

          /* VAST PREROLL OVERLAY (topmost — covers player during ad) */
          '<div class="plr-vast-wrap" id="plr-vast-wrap">' +
            '<video id="plr-ad-video" playsinline webkit-playsinline></video>' +
            '<div class="plr-vast-info">Ad</div>' +
            '<button class="plr-vast-skip" id="plr-vast-skip" type="button">Skip Ad</button>' +
            '<div class="plr-vast-progress"><div class="plr-vast-progress-filled" id="plr-vast-progress-filled"></div></div>' +
          '</div>' +

          /* BIG PLAY BUTTON (center, shown when paused) */
          '<button class="plr-big-play" id="plr-big-play" type="button">' +
            '<i class="fa-solid fa-play"></i>' +
          '</button>' +

          /* CONTROLS — bottom bar (progress + buttons row) */
          '<div class="plr-controls" id="plr-controls">' +

            '<div class="plr-progress-wrap">' +
              '<div class="plr-progress" id="plr-progress">' +
                '<div class="plr-progress-buffered" id="plr-progress-buffered"></div>' +
                '<div class="plr-progress-filled" id="plr-progress-filled"></div>' +
              '</div>' +
            '</div>' +

            '<div class="plr-controls-row">' +

              '<button class="plr-ctrl-btn" id="plr-btn-pp" title="Play/Pause">' +
                '<i class="fa-solid fa-pause"></i>' +
              '</button>' +

              '<div class="plr-vol-wrap">' +
                '<button class="plr-ctrl-btn" id="plr-btn-vol" title="Mute/Unmute">' +
                  '<i class="fa-solid fa-volume-xmark"></i>' +
                '</button>' +
                '<input type="range" class="plr-vol-slider" id="plr-vol-slider" min="0" max="1" step="0.05" value="0">' +
              '</div>' +

              '<span class="plr-time" id="plr-time">0:00 / 0:00</span>' +

              '<div class="plr-spacer"></div>' +

              '<button class="plr-ctrl-btn plr-fs-btn" id="plr-fs-btn" title="Fullscreen">' +
                '<i class="fa-solid fa-expand"></i>' +
              '</button>' +

            '</div>' +

          '</div>' +

          /*
           * MONETIZATION AREA
           * Banner akan diposisikan absolute bottom-center.
           */
          '<div class="plr-monetization-wrap" id="plr-monetization-wrap"></div>' +

          /* TELEGRAM POPUP OVERLAY (appears at TRIGGER_TIME seconds = 30s) */
          '<div class="plr-tg-popup" id="plr-tg-popup">' +
            '<div class="plr-tg-box">' +
              '<h3>' + escapeHTML(CFG.TELEGRAM_POPUP.TITLE) + '</h3>' +
              '<p>' + escapeHTML(CFG.TELEGRAM_POPUP.DESCRIPTION) + '</p>' +
              '<button class="plr-tg-btn" id="plr-tg-btn" type="button">' + escapeHTML(CFG.TELEGRAM_POPUP.BUTTON_TEXT) + '</button>' +
            '</div>' +
          '</div>' +

          /* SKIP BUTTON MODE */
          '<button class="plr-skip" id="plr-skip">' +
            '<i class="fa-solid fa-play"></i> ' +
            '<span>' + escapeHTML(CFG.BUTTON_TEXT) + '</span>' +
          '</button>' +

        '</div>' +

        /* DOWNLOAD AD (ExoClick zone 6044300 — replaces old download button) */
        '<div class="plr-download-ad" id="plr-download-ad"></div>' +

      '</div>' +

      /* RECOMMENDED */
      '<div class="plr-rec-section" id="plr-rec-section">' +

        '<div class="plr-rec-title">' +
          '<i class="fa-solid fa-clapperboard"></i> Recommended Videos' +
        '</div>' +

        '<div class="feed-grid" id="plr-rec-grid">' +
          '<div class="feed-loading-screen">' +
            '<div class="feed-spinner"></div>' +
          '</div>' +
        '</div>' +

      '</div>' +

    '</div>' +

    '<div class="toast" id="toast"></div>';


  /* =========================================================
     ELEMENTS
     ========================================================= */
  const containerEl = document.getElementById('plr-container');
  const videoEl = document.getElementById('plr-video');
  const skipBtn = document.getElementById('plr-skip');
  const controlsEl = document.getElementById('plr-controls');
  const btnPP = document.getElementById('plr-btn-pp');
  const btnVol = document.getElementById('plr-btn-vol');
  const volSlider = document.getElementById('plr-vol-slider');
  const timeDisplay = document.getElementById('plr-time');
  const monetizationWrap = document.getElementById('plr-monetization-wrap');

  /* VAST + standard UI elements */
  const bigPlayBtn = document.getElementById('plr-big-play');
  const progressBar = document.getElementById('plr-progress');
  const progressFilled = document.getElementById('plr-progress-filled');
  const progressBuffered = document.getElementById('plr-progress-buffered');
  const vastWrap = document.getElementById('plr-vast-wrap');
  const adVideo = document.getElementById('plr-ad-video');
  const vastSkipBtn = document.getElementById('plr-vast-skip');
  const vastProgressFilled = document.getElementById('plr-vast-progress-filled');
  const tgPopup = document.getElementById('plr-tg-popup');
  const tgBtn = document.getElementById('plr-tg-btn');


  /* =========================================================
     ADD INLINE CSS UNTUK BANNER
     Tidak perlu mengubah file CSS jika kamu belum mau.
     ========================================================= */
  function addBannerStyles() {
    if (document.getElementById('plr-ad-banner-styles')) return;

    var style = document.createElement('style');
    style.id = 'plr-ad-banner-styles';

    style.textContent =
      '.plr-container{position:relative;}' +

      '.plr-monetization-wrap.plr-ad-banner-wrap{' +
        'position:absolute;' +
        'left:50%;' +
        'bottom:12px;' +
        'transform:translateX(-50%);' +
        'width:320px;' +
        'max-width:calc(100% - 20px);' +
        'height:50px;' +
        'z-index:50;' +
      '}' +

      '.plr-ad-banner{' +
        'position:relative;' +
        'width:320px;' +
        'max-width:100%;' +
        'height:50px;' +
        'margin:0 auto;' +
      '}' +

      '.plr-ad-content{' +
        'width:320px;' +
        'height:50px;' +
        'max-width:100%;' +
        'overflow:hidden;' +
      '}' +

      '.plr-ad-label{' +
        'position:absolute;' +
        'left:0;' +
        'top:-12px;' +
        'font-size:8px;' +
        'line-height:10px;' +
        'opacity:.55;' +
        'pointer-events:none;' +
        'z-index:60;' +
      '}' +

      '.plr-ad-close{' +
        'position:absolute;' +
        'top:-9px;' +
        'right:-9px;' +
        'width:22px;' +
        'height:22px;' +
        'padding:0;' +
        'border:0;' +
        'border-radius:50%;' +
        'background:rgba(0,0,0,.85);' +
        'color:#fff;' +
        'font-size:17px;' +
        'line-height:22px;' +
        'cursor:pointer;' +
        'z-index:100;' +
      '}' +

      '@media(max-width:480px){' +
        '.plr-monetization-wrap.plr-ad-banner-wrap{' +
          'bottom:10px;' +
          'max-width:calc(100% - 16px);' +
        '}' +
        '.plr-ad-banner{' +
          'max-width:100%;' +
        '}' +
      '}';

    document.head.appendChild(style);
  }

  addBannerStyles();


  /* =========================================================
     HISTATS
     ========================================================= */
  if (CFG.HISTATS.ENABLED) {
    window._Hasync = window._Hasync || [];
    window._Hasync.push(['Histats.start', '1,' + CFG.HISTATS.SITE_ID + ',4,0,0,0,00010000']);
    window._Hasync.push(['Histats.fasi', '1']);
    window._Hasync.push(['Histats.track_hits', '']);

    (function () {
      var hs = document.createElement('script');
      hs.type = 'text/javascript';
      hs.async = true;
      hs.src = '//s10.histats.com/js15_as.js';

      (
        document.getElementsByTagName('head')[0] ||
        document.getElementsByTagName('body')[0]
      ).appendChild(hs);
    })();
  }


  /* =========================================================
     DISABLE RIGHT CLICK
     ========================================================= */
  containerEl.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });


  /* =========================================================
     CONTROLS
     ========================================================= */
  function showControls() {
    controlsEl.classList.add('visible');

    clearTimeout(controlsTimer);

    controlsTimer = setTimeout(hideControls, 3000);
  }

  function hideControls() {
    controlsEl.classList.remove('visible');
  }

  containerEl.addEventListener('mousemove', showControls);

  containerEl.addEventListener(
    'touchstart',
    showControls,
    { passive: true }
  );


  /* =========================================================
     PLAY / PAUSE
     ========================================================= */
  function updatePPIcon() {
    var icon = btnPP.querySelector('i');

    if (videoEl.paused) {
      icon.className = 'fa-solid fa-play';
    } else {
      icon.className = 'fa-solid fa-pause';
    }
  }

  btnPP.addEventListener('click', function (e) {
    e.stopPropagation();

    if (videoEl.paused) {
      videoEl.play().catch(function () {});
    } else {
      videoEl.pause();
    }

    updatePPIcon();
  });

  videoEl.addEventListener('play', updatePPIcon);
  videoEl.addEventListener('pause', updatePPIcon);

  /* =========================================================
     BIG PLAY BUTTON (center, shown when paused)
     ========================================================= */
  function showBigPlay() {
    if (bigPlayBtn) bigPlayBtn.classList.add('visible');
  }
  function hideBigPlay() {
    if (bigPlayBtn) bigPlayBtn.classList.remove('visible');
  }

  if (bigPlayBtn) {
    bigPlayBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (videoEl.paused) {
        videoEl.play().catch(function () {});
      } else {
        videoEl.pause();
      }
    });
  }

  videoEl.addEventListener('play', hideBigPlay);
  videoEl.addEventListener('playing', hideBigPlay);
  videoEl.addEventListener('pause', showBigPlay);
  videoEl.addEventListener('waiting', showBigPlay);
  videoEl.addEventListener('canplay', function () {
    if (!videoEl.paused) hideBigPlay();
  });


  /* =========================================================
     VOLUME
     ========================================================= */
  function updateVolIcon() {
    var icon = btnVol.querySelector('i');

    if (videoEl.muted || videoEl.volume === 0) {
      icon.className = 'fa-solid fa-volume-xmark';
    } else if (videoEl.volume < 0.5) {
      icon.className = 'fa-solid fa-volume-low';
    } else {
      icon.className = 'fa-solid fa-volume-high';
    }
  }

  btnVol.addEventListener('click', function (e) {
    e.stopPropagation();

    videoEl.muted = !videoEl.muted;

    volSlider.value = videoEl.muted
      ? 0
      : videoEl.volume;

    updateVolIcon();
  });

  volSlider.addEventListener('input', function (e) {
    e.stopPropagation();

    videoEl.volume = parseFloat(volSlider.value);
    videoEl.muted = videoEl.volume === 0;

    updateVolIcon();
  });

  volSlider.addEventListener('click', function (e) {
    e.stopPropagation();
  });


  /* =========================================================
     FULLSCREEN (cross-device — including iOS Safari)
     ========================================================= */
  const fsBtn = document.getElementById('plr-fs-btn');

  function getActiveVideoEl() {
    if (vastWrap && vastWrap.classList.contains('visible') && adVideo) {
      return adVideo;
    }
    return videoEl;
  }

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      (videoEl && videoEl.webkitDisplayingFullscreen) ||
      (adVideo && adVideo.webkitDisplayingFullscreen)
    );
  }

  function enterFullscreen() {
    /* 1. Standard Fullscreen API on container (desktop + Android) */
    var req = containerEl.requestFullscreen ||
              containerEl.webkitRequestFullscreen ||
              containerEl.webkitRequestFullScreen ||
              containerEl.msRequestFullscreen;

    if (req) {
      try {
        var p = req.call(containerEl);
        if (p && p.catch) {
          p.catch(function () {
            /* Fallback: iOS — only video element can go fullscreen */
            var v = getActiveVideoEl();
            if (v && v.webkitEnterFullscreen) {
              try { v.webkitEnterFullscreen(); } catch (e) {}
            }
          });
        }
        return;
      } catch (e) {
        /* fall through to iOS fallback */
      }
    }

    /* 2. iOS Safari — only video element can go fullscreen */
    var v2 = getActiveVideoEl();
    if (v2 && v2.webkitEnterFullscreen) {
      try { v2.webkitEnterFullscreen(); } catch (e) {}
    }
  }

  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else {
      var v = getActiveVideoEl();
      if (v && v.webkitExitFullscreen) {
        try { v.webkitExitFullscreen(); } catch (e) {}
      }
    }
  }

  function updateFsIcon() {
    if (!fsBtn) return;
    var icon = fsBtn.querySelector('i');
    if (isFullscreenActive()) {
      icon.className = 'fa-solid fa-compress';
    } else {
      icon.className = 'fa-solid fa-expand';
    }
  }

  if (fsBtn) {
    fsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isFullscreenActive()) {
        exitFullscreen();
      } else {
        enterFullscreen();
      }
      setTimeout(updateFsIcon, 100);
    });
  }

  document.addEventListener('fullscreenchange', updateFsIcon);
  document.addEventListener('webkitfullscreenchange', updateFsIcon);
  document.addEventListener('MSFullscreenChange', updateFsIcon);
  if (videoEl) {
    videoEl.addEventListener('webkitbeginfullscreen', updateFsIcon);
    videoEl.addEventListener('webkitendfullscreen', updateFsIcon);
    videoEl.addEventListener('webkitpresentationmodechanged', updateFsIcon);
  }
  if (adVideo) {
    adVideo.addEventListener('webkitbeginfullscreen', updateFsIcon);
    adVideo.addEventListener('webkitendfullscreen', updateFsIcon);
  }


  /* =========================================================
     BLOCK SEEKING
     ========================================================= */
  videoEl.addEventListener('seeking', function () {
    if (videoEl._lastSeekable !== undefined) {
      videoEl.currentTime = videoEl._lastSeekable;
    }
  });


  /* =========================================================
     BLOCK PLAYBACK RATE
     ========================================================= */
  videoEl.addEventListener('ratechange', function () {
    if (videoEl.playbackRate !== 1) {
      videoEl.playbackRate = 1;
      videoEl.currentTime = 0;

      if (!videoEl.paused) {
        videoEl.play().catch(function () {});
      }
    }
  });


  /* =========================================================
     BLOCK KEYBOARD SEEK / SPEED
     ========================================================= */
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') {
      return;
    }

    var blockedKeys = [
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      '<',
      '>',
      ',',
      '.'
    ];

    if (blockedKeys.indexOf(e.key) !== -1) {
      e.preventDefault();
      e.stopPropagation();
    }
  });


  /* =========================================================
     TIME DISPLAY + PROGRESS BAR
     (display-only — seeking intentionally blocked by existing handler)
     ========================================================= */
  function updateProgress() {
    if (!progressFilled || !videoEl.duration) return;
    var pct = (videoEl.currentTime / videoEl.duration) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    progressFilled.style.width = pct + '%';
  }

  function updateBuffered() {
    if (!progressBuffered || !videoEl.buffered || !videoEl.buffered.length) return;
    var buff = videoEl.buffered.end(videoEl.buffered.length - 1);
    if (videoEl.duration) {
      var pct = (buff / videoEl.duration) * 100;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      progressBuffered.style.width = pct + '%';
    }
  }

  videoEl.addEventListener('timeupdate', function () {
    videoEl._lastSeekable = videoEl.currentTime;

    timeDisplay.textContent =
      formatTime(videoEl.currentTime) +
      ' / ' +
      formatTime(videoEl.duration);

    updateProgress();

    /* Telegram popup trigger at TRIGGER_TIME seconds (default 30s) */
    if (
      !tgPopupShown &&
      CFG.TELEGRAM_POPUP.ENABLED &&
      videoEl.currentTime >= CFG.TELEGRAM_POPUP.TRIGGER_TIME
    ) {
      showTelegramPopup();
    }
  });

  videoEl.addEventListener('loadedmetadata', function () {
    timeDisplay.textContent =
      '0:00 / ' +
      formatTime(videoEl.duration);
    updateProgress();
    updateBuffered();
  });

  videoEl.addEventListener('progress', updateBuffered);


  /* =========================================================
     SMARTLINK REDIRECT
     ========================================================= */
  function doRedirect() {
    /* No-op when SMARTLINK_REDIRECT is disabled */
    if (!CFG.SMARTLINK_REDIRECT.ENABLED) return;
    if (!redirectUrl) return;

    window.location.href = redirectUrl;
  }


  /* =========================================================
     TELEGRAM POPUP — appears after TRIGGER_TIME seconds of playback
     Video auto-pauses when popup appears. Button redirects to Telegram.
     ========================================================= */
  var tgPopupShown = false;

  function showTelegramPopup() {
    if (!CFG.TELEGRAM_POPUP.ENABLED) return;
    if (tgPopupShown) return;
    if (!tgPopup) return;
    tgPopupShown = true;
    tgPopup.classList.add('active');
    try { videoEl.pause(); } catch (e) {}
    console.log('[TG Popup] Shown at', videoEl.currentTime, 's');
  }

  if (tgBtn) {
    tgBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (CFG.TELEGRAM_POPUP.REDIRECT_URL) {
        window.location.href = CFG.TELEGRAM_POPUP.REDIRECT_URL;
      }
    });
  }


  /* =========================================================
     BUTTON
     ========================================================= */
  function triggerButton() {
    if (btnShown) return;
    /* Don't show skip button if SMARTLINK_REDIRECT is disabled (no target) */
    if (!CFG.SMARTLINK_REDIRECT.ENABLED) return;

    btnShown = true;
    skipBtn.classList.add('visible');
  }


  /* =========================================================
     GET MODE
     ========================================================= */
  function getMonetizationMode() {
    var mode = String(
      CFG.MONETIZATION_MODE || ''
    ).toLowerCase();

    return mode === 'banner'
      ? 'banner'
      : 'button';
  }


  /* =========================================================
     SETUP MONETIZATION
     ========================================================= */
  function setupMonetization() {
    var mode = getMonetizationMode();

    if (mode === 'button') {
      monetizationWrap.style.display = 'none';
      skipBtn.style.display = '';

      if (!CFG.SHOW_SKIP_BTN) {
        skipBtn.style.display = 'none';
        return;
      }

      var btnDelay = 30000 + Math.random() * 10000;

      setTimeout(function () {
        triggerButton();
      }, btnDelay);

      return;
    }

    /* BANNER MODE */
    skipBtn.style.display = 'none';

    if (!CFG.BANNER.ENABLED) return;

    setTimeout(function () {
      if (!bannerClosed) {
        createBanner();
      }
    }, CFG.BANNER.DELAY);
  }


  /* =========================================================
     CREATE BANNER
     ========================================================= */
  function createBanner() {
    if (!monetizationWrap || bannerClosed) return;

    monetizationWrap.innerHTML = '';
    monetizationWrap.className =
      'plr-monetization-wrap plr-ad-banner-wrap';

    var bannerBox = document.createElement('div');
    bannerBox.className = 'plr-ad-banner';

    var adContent = document.createElement('div');
    adContent.className = 'plr-ad-content';

    bannerBox.appendChild(adContent);


    /* CLOSE BUTTON */
    if (CFG.BANNER.SHOW_CLOSE) {
      var closeBtn = document.createElement('button');

      closeBtn.type = 'button';
      closeBtn.className = 'plr-ad-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute(
        'aria-label',
        'Close advertisement'
      );

      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        bannerClosed = true;

        monetizationWrap.style.display = 'none';
        monetizationWrap.innerHTML = '';
      });

      bannerBox.appendChild(closeBtn);
    }

    monetizationWrap.appendChild(bannerBox);
    monetizationWrap.style.display = 'block';

    injectExoClickBanner(adContent, CFG.BANNER.ZONE);
  }


  /* =========================================================
     LOAD EXOCLICK BANNER (replaces old Adsterra injector)
     Uses ad-provider.js — loaded once, shared across all ExoClick zones.
     ========================================================= */
  var _exoProviderLoaded = false;
  function ensureExoClickProvider() {
    if (_exoProviderLoaded) return;
    if (document.querySelector('script[src*="a.magsrv.com/ad-provider.js"]')) {
      _exoProviderLoaded = true;
      return;
    }
    _exoProviderLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.type = 'application/javascript';
    s.src = CFG.BANNER.PROVIDER_SCRIPT;
    document.head.appendChild(s);
  }

  function triggerExoClickServe() {
    window.AdProvider = window.AdProvider || [];
    window.AdProvider.push({ serve: {} });
  }

  function createExoClickIns(zoneId, containerClass) {
    var ins = document.createElement('ins');
    ins.className = containerClass || CFG.BANNER.CONTAINER_CLASS;
    ins.setAttribute('data-zoneid', String(zoneId));
    return ins;
  }

  function injectExoClickBanner(target, zoneId) {
    if (!target) return;
    ensureExoClickProvider();
    var ins = createExoClickIns(zoneId, CFG.BANNER.CONTAINER_CLASS);
    target.appendChild(ins);
    /* Trigger AdProvider to serve — it queues internally if not ready yet */
    triggerExoClickServe();
    /* Re-trigger after delays in case ad-provider.js was still loading */
    setTimeout(triggerExoClickServe, 500);
    setTimeout(triggerExoClickServe, 1500);
  }

  /* Inject ExoClick ad into the download-ad container (zone 6044324) */
  function injectExoClickDownloadAd() {
    if (!CFG.DOWNLOAD_AD.ENABLED) return;
    var container = document.getElementById('plr-download-ad');
    if (!container) return;
    ensureExoClickProvider();
    var ins = createExoClickIns(CFG.DOWNLOAD_AD.ZONE, CFG.DOWNLOAD_AD.CONTAINER_CLASS);
    container.appendChild(ins);
    triggerExoClickServe();
    setTimeout(triggerExoClickServe, 500);
    setTimeout(triggerExoClickServe, 1500);
  }

  /* Inject Popunder (al5sm.com) — replaces Shuffle Box, fires on user click */
  function injectPopunder() {
    if (!CFG.POPUNDER.ENABLED) return;
    /* Exact popunder script format from al5sm.com */
    (function(s){
      s.dataset.zone = CFG.POPUNDER.ZONE;
      s.src = CFG.POPUNDER.SCRIPT_URL;
    })([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
    console.log('[Popunder] Loaded zone', CFG.POPUNDER.ZONE);
  }


  /* =========================================================
     INITIALIZE MONETIZATION
     ========================================================= */
  setupMonetization();

  /* Inject ExoClick download ad + Popunder (after setupMonetization) */
  injectExoClickDownloadAd();
  injectPopunder();


  /* =========================================================
     RECOMMENDATIONS
     ========================================================= */
  function loadRecommendations(currentFilename) {
    var recGrid =
      document.getElementById('plr-rec-grid');

    if (!recGrid) return;

    if (!isDbReady()) {
      setTimeout(function () {
        loadRecommendations(currentFilename);
      }, 1000);

      return;
    }

    var db = getDb();

    db.getAllLinks()
      .then(function (allLinks) {
        if (!allLinks || allLinks.length === 0) {
          recGrid.innerHTML = '';
          return;
        }

        var items = [];

        for (var i = 0; i < allLinks.length; i++) {
          var link = allLinks[i];

          if (!link || !link.url) continue;

          var decoded = decodeKValue(link.url);

          if (
            decoded &&
            decoded.filename &&
            decoded.filename !== currentFilename
          ) {
            /* Untuk display filename:
               - V3 (sourceUrl): pakai segment terakhir dari sourceUrl
               - V2 (cdnPath): pakai segment terakhir dari cdnPath
               - V1 (filename): pakai filename langsung */
            var displayFilename = decoded.filename;
            if (decoded.sourceUrl) {
              var fnFromSource = getFilenameFromPath(decoded.sourceUrl.replace(/^https?:\/\/[^/]+\//, ''));
              if (fnFromSource) displayFilename = fnFromSource;
            } else if (decoded.cdnPath) {
              var fnFromPath = getFilenameFromPath(decoded.cdnPath);
              if (fnFromPath) displayFilename = fnFromPath;
            }
            items.push({
              filename: displayFilename,
              kValue: link.url,  /* k-value untuk direct player link */
              sourceUrl: decoded.sourceUrl || '',
              cdnKey: decoded.cdnKey || '',
              cdnPath: decoded.cdnPath || '',
              code: link.code || '',
              clicks: link.clicks || 0,
              created_at: link.created_at || '',
              ext: getExt(displayFilename)
            });
          }
        }

        if (items.length === 0) {
          recGrid.innerHTML = '';
          return;
        }

        items.sort(function (a, b) {
          return b.clicks - a.clicks;
        });

        var show = items.slice(0, 12);
        var html = '';

        for (var j = 0; j < show.length; j++) {
          html += buildRecCard(show[j], j);
        }

        recGrid.innerHTML = html;
        lazyLoadRecThumbnails(recGrid);
      })
      .catch(function () {
        if (recGrid) {
          recGrid.innerHTML = '';
        }
      });
  }


  function buildRecCard(item, index) {
    var titleText =
      item.filename.replace(/\.[^.]+$/, '');

    if (titleText.length > 40) {
      titleText =
        titleText.substring(0, 40) + '...';
    }

    /* Direct player link — recommendations bypass safelink.
       Shortlink (/?vid=) tetap untuk URL yang di-share externally. */
    var href = item.kValue
      ? ('/?k=' + encodeURIComponent(item.kValue))
      : ('/' + escapeHTML(item.code || 'video') + '.' + (item.ext || 'mp4'));

    var ext =
      (item.ext || 'mp4').toUpperCase();

    var badgeClass = 'hd';
    var badgeText = 'HD';

    if (ext !== 'MP4' && ext !== 'MKV') {
      badgeClass = 'tv';
      badgeText = ext;
    }

    var timeStr = item.created_at
      ? formatTimeAgo(
          new Date(item.created_at).getTime()
        )
      : '';

    return (
      '<a href="' + href + '" ' +
        'class="feed-card" ' +
        'data-index="' + index + '" ' +
        'data-code="' + escapeHTML(item.code) + '" ' +
        'data-filename="' + escapeHTML(item.filename) + '" ' +
        'data-source-url="' + escapeHTML(item.sourceUrl || '') + '" ' +
        'data-cdn-key="' + escapeHTML(item.cdnKey || '') + '" ' +
        'data-cdn-path="' + escapeHTML(item.cdnPath || '') + '">' +

        '<div class="feed-card-thumb" ' +
          'data-filename="' +
          escapeHTML(item.filename) +
          '" ' +
          'data-source-url="' + escapeHTML(item.sourceUrl || '') + '" ' +
          'data-cdn-key="' + escapeHTML(item.cdnKey || '') + '" ' +
          'data-cdn-path="' + escapeHTML(item.cdnPath || '') + '">' +
          '<i class="fa-solid fa-film"></i>' +
        '</div>' +

        '<div class="feed-card-play">' +
          '<i class="fa-solid fa-play"></i>' +
        '</div>' +

        '<span class="feed-card-badge ' +
          badgeClass +
          '">' +
          badgeText +
        '</span>' +

        '<div class="feed-card-overlay">' +
          '<div class="feed-card-title">' +
            escapeHTML(titleText) +
          '</div>' +

          '<div class="feed-card-meta">' +
            '<i class="fa-solid fa-star"></i> ' +
            formatCount(item.clicks) +
            '<span class="meta-sep"></span>' +
            (timeStr || ext) +
          '</div>' +
        '</div>' +

      '</a>'
    );
  }


  /* =========================================================
     LAZY LOAD THUMBNAILS
     ========================================================= */
  function lazyLoadRecThumbnails(recContainer) {
    var cards =
      recContainer.querySelectorAll(
        '.feed-card[data-filename]'
      );

    if (!cards.length) return;

    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var card = entry.target;

          obs.unobserve(card);

          loadRecCardThumbnail(card);
        });
      },
      {
        rootMargin: '300px'
      }
    );

    cards.forEach(function (card) {
      obs.observe(card);
    });
  }


  function loadRecCardThumbnail(card) {
    var thumbEl =
      card.querySelector('.feed-card-thumb');

    if (
      !thumbEl ||
      thumbEl.classList.contains('thumb-loaded')
    ) {
      return;
    }

    var filename =
      card.getAttribute('data-filename');
    var sourceUrl =
      card.getAttribute('data-source-url') || '';
    var cdnKey =
      card.getAttribute('data-cdn-key') || '';
    var cdnPath =
      card.getAttribute('data-cdn-path') || '';

    if (!filename && !sourceUrl && !cdnPath) return;

    /* Susun urutan upaya:
       1. sourceUrl langsung (V3)
       2. cdnKey + cdnPath (V2)
       3. Semua CDN dengan filename (fallback) */
    var attempts = [];
    if (sourceUrl) {
      attempts.push({ url: sourceUrl });
    }
    if (cdnKey && cdnPath) {
      for (var k = 0; k < CFG.VIDEO_CDNS.length; k++) {
        if (CFG.VIDEO_CDNS[k].key === cdnKey) {
          var url2 = CFG.VIDEO_CDNS[k].base.replace(/\/+$/, '') + '/' + cdnPath.replace(/^\/+/, '');
          attempts.push({ url: url2 });
          break;
        }
      }
    }
    for (var m = 0; m < CFG.VIDEO_CDNS.length; m++) {
      var url3 = CFG.VIDEO_CDNS[m].base.replace(/\/+$/, '') + '/' + filename.replace(/^\/+/, '');
      attempts.push({ url: url3 });
    }

    /* Hilangkan duplikat */
    var seen = {};
    var unique = [];
    for (var d = 0; d < attempts.length; d++) {
      if (!seen[attempts[d].url]) {
        seen[attempts[d].url] = true;
        unique.push(attempts[d]);
      }
    }
    attempts = unique;

    var attemptIdx = 0;

    function tryNext() {
      if (attemptIdx >= attempts.length) {
        return;
      }
      var url = attempts[attemptIdx].url;

      var vid = document.createElement('video');

      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      vid.crossOrigin = 'anonymous';

      var seeked = false;

      vid.addEventListener('loadeddata', function () {
        try {
          vid.currentTime = 1;
        } catch (e) {}
      });

      vid.addEventListener('seeked', function () {
        if (seeked) return;

        seeked = true;

        try {
          var canvas =
            document.createElement('canvas');

          canvas.width =
            vid.videoWidth || 320;

          canvas.height =
            vid.videoHeight || 240;

          var ctx =
            canvas.getContext('2d');

          ctx.drawImage(
            vid,
            0,
            0,
            canvas.width,
            canvas.height
          );

          var dataUrl =
            canvas.toDataURL(
              'image/jpeg',
              0.7
            );

          thumbEl.style.backgroundImage =
            'url(' + dataUrl + ')';

          thumbEl.style.backgroundSize = 'cover';
          thumbEl.style.backgroundPosition = 'center';

          thumbEl.innerHTML = '';

          thumbEl.classList.add('thumb-loaded');

        } catch (e) {
          /* CORS fallback */
          thumbEl.innerHTML = '';
          thumbEl.classList.add('thumb-loaded');
        }

        vid.removeAttribute('src');
        vid.load();
      });

      vid.addEventListener('error', function () {
        attemptIdx++;
        tryNext();
      });

      vid.src = url;
    }

    tryNext();
  }


  /* =========================================================
     HELPERS
     ========================================================= */
  function getExt(filename) {
    if (!filename) return 'mp4';

    var parts = filename.split('.');

    if (parts.length > 1) {
      return parts.pop().toLowerCase();
    }

    return 'mp4';
  }

  function formatCount(n) {
    if (!n) return '0';

    if (n >= 1000000) {
      return (n / 1000000).toFixed(1) + 'M';
    }

    if (n >= 1000) {
      return (n / 1000).toFixed(1) + 'K';
    }

    return String(n);
  }


  /* =========================================================
     VAST PREROLL — ExoClick
     Fetch VAST XML, parse MediaFile, play preroll before main video.
     Skip button appears after SKIP_DELAY seconds (or VAST skipoffset).
     ========================================================= */
  async function fetchVastAd(adTagUrl, depth) {
    depth = depth || 0;
    if (depth > 3) throw new Error('VAST wrapper too deep');

    var sep = adTagUrl.indexOf('?') !== -1 ? '&' : '?';
    var url = adTagUrl + sep + 'ts=' + Date.now() + '&r=' + Math.random().toString(36).slice(2, 8);

    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('VAST HTTP ' + res.status);
    var xml = await res.text();
    var doc = new DOMParser().parseFromString(xml, 'application/xml');

    /* VAST Wrapper (redirect to another VAST tag) */
    var wrapper = doc.querySelector('VASTAdTagURI');
    if (wrapper) {
      var wrappedUrl = (wrapper.textContent || '').trim();
      if (wrappedUrl) return fetchVastAd(wrappedUrl, depth + 1);
    }

    /* Find best MediaFile (prefer progressive MP4 with largest width) */
    var mediaFiles = doc.querySelectorAll('MediaFile');
    if (!mediaFiles.length) throw new Error('No MediaFile in VAST');

    var best = null;
    var bestWidth = 0;

    for (var i = 0; i < mediaFiles.length; i++) {
      var mf = mediaFiles[i];
      var type = (mf.getAttribute('type') || '').toLowerCase();
      var delivery = (mf.getAttribute('delivery') || '').toLowerCase();
      var u = (mf.textContent || '').trim();
      if (!u) continue;

      var isMp4 = type.indexOf('mp4') !== -1 || /\.mp4(\?|$|#)/i.test(u);
      var isProgressive = delivery === 'progressive' || delivery === '';

      if (isMp4 && isProgressive) {
        var w = parseInt(mf.getAttribute('width') || '0', 10);
        if (!w) w = 640;
        if (!best || w > bestWidth) {
          best = u;
          bestWidth = w;
        }
      } else if (!best && isMp4) {
        best = u;
        bestWidth = 0;
      }
    }

    if (!best && mediaFiles.length > 0) {
      best = (mediaFiles[0].textContent || '').trim();
    }
    if (!best) throw new Error('No usable MediaFile URL');

    /* Parse skipoffset from <Linear skipoffset="..."> */
    var skipDelay = CFG.VAST.SKIP_DELAY;
    var linearEl = doc.querySelector('Linear');
    if (linearEl) {
      var so = linearEl.getAttribute('skipoffset');
      if (so) {
        var m = so.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
        if (m) {
          skipDelay = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
        } else if (/^\d+$/.test(so.trim())) {
          skipDelay = parseInt(so.trim(), 10);
        }
      }
    }

    return { mediaUrl: best, skipDelay: Math.max(0, skipDelay) };
  }

  function playVastPreroll() {
    return new Promise(function (resolve) {
      if (!CFG.VAST.ENABLED || !CFG.VAST.AD_TAG_URL) {
        resolve(false);
        return;
      }
      if (!vastWrap || !adVideo) {
        console.warn('[VAST] Overlay or ad video missing');
        resolve(false);
        return;
      }

      var resolved = false;
      var fetchTimeout = null;
      var adHardTimeout = null;
      var skipReady = false;
      var skipDelay = CFG.VAST.SKIP_DELAY;

      function cleanup(adPlayed) {
        if (resolved) return;
        resolved = true;

        if (fetchTimeout) clearTimeout(fetchTimeout);
        if (adHardTimeout) clearTimeout(adHardTimeout);

        try { adVideo.pause(); } catch (e) {}
        adVideo.removeAttribute('src');
        try { adVideo.load(); } catch (e) {}

        vastWrap.classList.remove('visible');
        if (vastSkipBtn) {
          vastSkipBtn.style.display = 'none';
          vastSkipBtn.disabled = true;
        }
        if (vastProgressFilled) vastProgressFilled.style.width = '0%';

        adVideo.removeEventListener('timeupdate', onTime);
        adVideo.removeEventListener('ended', onEnded);
        adVideo.removeEventListener('error', onError);
        adVideo.removeEventListener('loadedmetadata', onLoaded);
        if (vastSkipBtn) vastSkipBtn.removeEventListener('click', onSkip);

        resolve(adPlayed);
      }

      function onTime() {
        var t = adVideo.currentTime || 0;
        var remaining = Math.max(0, Math.ceil(skipDelay - t));

        if (vastSkipBtn) {
          if (remaining > 0) {
            vastSkipBtn.style.display = 'block';
            vastSkipBtn.textContent = 'Skip in ' + remaining + 's';
            vastSkipBtn.disabled = true;
            skipReady = false;
          } else {
            vastSkipBtn.textContent = 'Skip Ad \u2192';
            vastSkipBtn.disabled = false;
            skipReady = true;
          }
        }

        if (vastProgressFilled && adVideo.duration) {
          var pct = (t / adVideo.duration) * 100;
          if (pct < 0) pct = 0;
          if (pct > 100) pct = 100;
          vastProgressFilled.style.width = pct + '%';
        }
      }

      function onLoaded() {
        /* Ad metadata ready — try to play (unmuted first, fallback muted) */
        var p = adVideo.play();
        if (p && p.catch) {
          p.then(function () {
            /* playing unmuted */
          }).catch(function () {
            adVideo.muted = true;
            adVideo.play().catch(function () {
              console.warn('[VAST] Autoplay blocked even muted');
              cleanup(false);
            });
          });
        }
      }

      function onEnded() { cleanup(true); }
      function onError(e) {
        console.warn('[VAST] Ad video error:', e);
        cleanup(false);
      }
      function onSkip(e) {
        e.preventDefault();
        e.stopPropagation();
        if (skipReady) cleanup(true);
      }

      adVideo.addEventListener('timeupdate', onTime);
      adVideo.addEventListener('ended', onEnded);
      adVideo.addEventListener('error', onError);
      adVideo.addEventListener('loadedmetadata', onLoaded);
      if (vastSkipBtn) vastSkipBtn.addEventListener('click', onSkip);

      /* Show overlay immediately (loader state) */
      vastWrap.classList.add('visible');
      if (vastSkipBtn) {
        vastSkipBtn.style.display = 'block';
        vastSkipBtn.textContent = 'Ad loading...';
        vastSkipBtn.disabled = true;
      }

      fetchTimeout = setTimeout(function () {
        console.warn('[VAST] Fetch timeout');
        cleanup(false);
      }, CFG.VAST.FETCH_TIMEOUT);

      adHardTimeout = setTimeout(function () {
        if (!resolved) {
          console.warn('[VAST] Ad play hard timeout');
          cleanup(true);
        }
      }, CFG.VAST.AD_TIMEOUT);

      fetchVastAd(CFG.VAST.AD_TAG_URL).then(function (ad) {
        if (resolved) return;

        /* Fetch succeeded — clear fetch timeout, let AD_TIMEOUT run as hard limit */
        if (fetchTimeout) {
          clearTimeout(fetchTimeout);
          fetchTimeout = null;
        }

        console.log('[VAST] Got ad:', ad.mediaUrl.substring(0, 80), 'skip:', ad.skipDelay);
        skipDelay = ad.skipDelay;
        adVideo.src = ad.mediaUrl;
        adVideo.load();
      }).catch(function (err) {
        console.warn('[VAST] Preroll failed:', err && err.message);
        cleanup(false);
      });
    });
  }


  /* =========================================================
     INIT
     ========================================================= */
  (async function init() {
    const kParam = route.kValue;

    const decoded =
      decodeKValue(kParam) || {};

    let filename =
      decoded.filename;

    /* sourceUrl (format V3 — URL lengkap), cdnKey+cdnPath (format V2) */
    var sourceUrl = decoded.sourceUrl || '';
    var cdnKey = decoded.cdnKey || '';
    var cdnPath = decoded.cdnPath || '';

    if (!filename) {
      /* Jika ada sourceUrl, ekstrak filename dari sana */
      if (sourceUrl) {
        try {
          var u = new URL(sourceUrl);
          var parts = u.pathname.split('/').filter(Boolean);
          if (parts.length > 0) {
            filename = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
          }
        } catch (e) { /* ignore */ }
      }
      if (!filename) filename = CFG.FALLBACK;
    }

    /* Jika ada cdnPath, pastikan filename display = segment terakhir */
    if (!sourceUrl && cdnPath) {
      var fnFromPath = getFilenameFromPath(cdnPath);
      if (fnFromPath) filename = fnFromPath;
    }


    /* BUTTON CLICK */
    skipBtn.addEventListener(
      'click',
      function (e) {
        e.stopPropagation();
        doRedirect();
      }
    );


    /* VIDEO ENDED → SMARTLINK */
    videoEl.addEventListener(
      'ended',
      function () {
        doRedirect();
      }
    );


    /* LOAD RECOMMENDATIONS */
    loadRecommendations(filename);


    /* === VAST PREROLL === — runs before main video loads */
    try {
      await playVastPreroll();
    } catch (e) {
      console.warn('[VAST] preroll unexpected error:', e);
    }


    /* LOAD VIDEO - prioritas: sourceUrl > cdnKey+cdnPath > filename fallback */
    try {
      var videoInfo = {
        filename: filename,
        sourceUrl: sourceUrl,
        cdnKey: cdnKey,
        cdnPath: cdnPath
      };
      await loadVideo(
        videoEl,
        videoInfo,
        CFG.VIDEO_CDNS,
        null,
        CFG.CDN_TIMEOUT
      );

      /* Ensure main video starts after VAST + CDN load */
      if (videoEl.paused) {
        videoEl.play().catch(function () {});
      }
    } catch (err) {
      setTimeout(doRedirect, 3000);
      return;
    }

  })();
}
