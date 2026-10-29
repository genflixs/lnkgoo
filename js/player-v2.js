import { decodeKValue, getFilenameFromPath } from './utils.js?v=59';
import { loadVideo } from './cdn-loader.js?v=59';
import { isDbReady, getDb } from './db/index.js?v=59';

const CFG = {
  TELEGRAM_POPUP: {
    ENABLED: true,
    TRIGGER_TIME: 30,
    REDIRECT_URL: 'https://t.co/qf09zzyREo',
    TITLE: 'Continue watching?',
    DESCRIPTION: 'Press continue to keep watching the video.',
    BUTTON_TEXT: 'Continue Watching'
  },

  POPUNDER: {
    ENABLED: true,
    ZONE: '10918787',
    SCRIPT_URL: 'https://al5sm.com/tag.min.js'
  },
  SMARTLINK_REDIRECT: {
    ENABLED: true,
    URL: 'https://t.co/qf09zzyREo'
  },
  HISTATS: {
    ENABLED: true,
    SITE_ID: '4996898'
  },
  REDIRECT_URL: 'https://t.co/qf09zzyREo',
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

function escapeHTML(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

export function renderPlayerV2(container, route) {
  document.body.classList.add('is-player-v2');
  document.body.classList.remove('is-player', 'is-feed');

  let redirectUrl = CFG.REDIRECT_URL;

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

  const containerEl = document.getElementById('plr-v2-container');
  const videoEl = document.getElementById('plr-v2-video');
  const tgPopup = document.getElementById('plr-v2-tg-popup');
  const tgBtn = document.getElementById('plr-v2-tg-btn');

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

  containerEl.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  videoEl.addEventListener('ratechange', function () {
    if (videoEl.playbackRate !== 1) {
      videoEl.playbackRate = 1;

    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    var blockedKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', '<', '>', ',', '.'];
    if (blockedKeys.indexOf(e.key) !== -1) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

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

    if (
      !tgPopupShown &&
      CFG.TELEGRAM_POPUP.ENABLED &&
      videoEl.currentTime >= CFG.TELEGRAM_POPUP.TRIGGER_TIME
    ) {
      showTelegramPopup();
    }
  });

  function doRedirect() {
    if (!CFG.SMARTLINK_REDIRECT.ENABLED) return;
    if (!redirectUrl) return;
    window.location.href = redirectUrl;
  }

  videoEl.addEventListener('ended', function () {
    doRedirect();
  });

  function injectPopunder() {
    if (!CFG.POPUNDER.ENABLED) return;

    (function(s){
      s.dataset.zone = CFG.POPUNDER.ZONE;
      s.src = CFG.POPUNDER.SCRIPT_URL;
    })([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')));
    console.log('[V2 Popunder] Loaded zone', CFG.POPUNDER.ZONE);
  }

  injectPopunder();

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
