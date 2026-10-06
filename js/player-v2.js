import { decodeKValue, getFilenameFromPath } from './utils.js?v=57';
import { loadVideo } from './cdn-loader.js?v=57';
import { isDbReady, getDb } from './db/index.js?v=57';

/* =========================================================
   PLAYER V2 — Native HTML5 Controls
   =========================================================
   Same backend logic as player.js (multi-CDN, Popunder,
   Telegram popup, Histats, smartlink redirect, block seeking)
   but uses NATIVE browser controls instead of custom UI
   (matches minimalist screenshot).

   ExoClick ads (VAST preroll, banner, popunder script) have
   been REMOVED from this build.
   ========================================================= */

const CFG = {
  TELEGRAM_POPUP: {
    ENABLED: true,
    TRIGGER_TIME: 30,
    REDIRECT_URL: 'https://omg10.com/4/10410353',
    TITLE: 'Continue watching?',
    DESCRIPTION: 'Press continue to keep watching the video.',
    BUTTON_TEXT: 'Continue Watching'
  },
  /* Popunder (al5sm.com) */
  POPUNDER: {
    ENABLED: true,
    ZONE: '10918787',
    SCRIPT_URL: 'https://al5sm.com/tag.min.js'
  },
  SMARTLINK_REDIRECT: {
    ENABLED: true,
    URL: 'https://omg10.com/4/10410353'
  },
  HISTATS: {
    ENABLED: true,
    SITE_ID: '4996898'
  },
  REDIRECT_URL: 'https://omg10.com/4/10410353',
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
function escapeHTML(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}


/* =========================================================
   RENDER PLAYER V2
   ========================================================= */
export function renderPlayerV2(container, route) {
  document.body.classList.add('is-player-v2');
  document.body.classList.remove('is-player', 'is-feed');

  let redirectUrl = CFG.REDIRECT_URL;

  /* HTML — full-screen video with native controls + Telegram popup */
  container.innerHTML =
    '<div class="plr-v2-page" id="plr-v2-page">' +
      '<div class="plr-v2-container" id="plr-v2-container">' +
        '<video ' +
          'id="plr-v2-video" ' +
          'controls ' +
          'autoplay ' +
          'preload="auto" ' +
          'playsinline ' +
          'muted ' +
          'disablePictureInPicture ' +
          'controlsList="nodownload noplaybackrate">' +
        '</video>' +

        /* TELEGRAM POPUP OVERLAY (appears at TRIGGER_TIME seconds = 30s) */
        '<div class="plr-tg-popup" id="plr-v2-tg-popup">' +
          '<div class="plr-tg-box">' +
            '<h3>' + escapeHTML(CFG.TELEGRAM_POPUP.TITLE) + '</h3>' +
            '<p>' + escapeHTML(CFG.TELEGRAM_POPUP.DESCRIPTION) + '</p>' +
            '<button class="plr-tg-btn" id="plr-v2-tg-btn" type="button">' + escapeHTML(CFG.TELEGRAM_POPUP.BUTTON_TEXT) + '</button>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</div>' +
    '<div class="toast" id="toast"></div>';


  /* =========================================================
     ELEMENTS
     ========================================================= */
  const containerEl = document.getElementById('plr-v2-container');
  const videoEl = document.getElementById('plr-v2-video');
  const tgPopup = document.getElementById('plr-v2-tg-popup');
  const tgBtn = document.getElementById('plr-v2-tg-btn');


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
      (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(hs);
    })();
  }


  /* =========================================================
     DISABLE RIGHT CLICK
     ========================================================= */
  containerEl.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });


  /* =========================================================
     BLOCK PLAYBACK RATE — softened (no currentTime reset to prevent restart/buffering) */
  videoEl.addEventListener('ratechange', function () {
    if (videoEl.playbackRate !== 1) {
      videoEl.playbackRate = 1;
      /* Don't reset currentTime — causes restart/buffering appearance */
    }
  });

  /* BLOCK KEYBOARD SEEK / SPEED */
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    var blockedKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', '<', '>', ',', '.'];
    if (blockedKeys.indexOf(e.key) !== -1) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  /* Track current time for seek-block + Telegram popup trigger */
  var tgPopupShown = false;

  function showTelegramPopup() {
    if (!CFG.TELEGRAM_POPUP.ENABLED) return;
    if (tgPopupShown) return;
    if (!tgPopup) return;
    tgPopupShown = true;
    tgPopup.classList.add('active');
    try { videoEl.pause(); } catch (e) {}
    console.log('[V2 TG Popup] Shown at', videoEl.currentTime, 's');
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

  videoEl.addEventListener('timeupdate', function () {
    videoEl._lastSeekable = videoEl.currentTime;

    /* Telegram popup trigger at TRIGGER_TIME seconds (default 30s) */
    if (
      !tgPopupShown &&
      CFG.TELEGRAM_POPUP.ENABLED &&
      videoEl.currentTime >= CFG.TELEGRAM_POPUP.TRIGGER_TIME
    ) {
      showTelegramPopup();
    }
  });


  /* =========================================================
     SMARTLINK REDIRECT (on video ended)
     ========================================================= */
  function doRedirect() {
    if (!CFG.SMARTLINK_REDIRECT.ENABLED) return;
    if (!redirectUrl) return;
    window.location.href = redirectUrl;
  }

  videoEl.addEventListener('ended', function () {
    doRedirect();
  });


  /* =========================================================
     POPUNDER (al5sm.com)
     ========================================================= */
  function injectPopunder() {
    if (!CFG.POPUNDER.ENABLED) return;
    /* Exact popunder script format from al5sm.com */
    (function(s){
      s.dataset.zone = CFG.POPUNDER.ZONE;
      s.src = CFG.POPUNDER.SCRIPT_URL;
    })([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
    console.log('[V2 Popunder] Loaded zone', CFG.POPUNDER.ZONE);
  }

  injectPopunder();


  /* =========================================================
     INIT
     ========================================================= */
  (async function init() {
    const kParam = route.kValue;
    const decoded = decodeKValue(kParam) || {};
    let filename = decoded.filename;
    var sourceUrl = decoded.sourceUrl || '';
    var cdnKey = decoded.cdnKey || '';
    var cdnPath = decoded.cdnPath || '';

    if (!filename) {
      if (sourceUrl) {
        try {
          var u = new URL(sourceUrl);
          var parts = u.pathname.split('/').filter(Boolean);
          if (parts.length > 0) {
            filename = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
          }
        } catch (e) {}
      }
      if (!filename) filename = CFG.FALLBACK;
    }

    if (!sourceUrl && cdnPath) {
      var fnFromPath = getFilenameFromPath(cdnPath);
      if (fnFromPath) filename = fnFromPath;
    }

    /* LOAD VIDEO */
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
      if (videoEl.paused) {
        videoEl.play().catch(function () {});
      }
    } catch (err) {
      setTimeout(doRedirect, 3000);
      return;
    }
  })();
}
