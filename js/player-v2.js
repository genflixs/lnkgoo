import { decodeKValue, getFilenameFromPath } from './utils.js?v=57';
import { loadVideo } from './cdn-loader.js?v=57';
import { isDbReady, getDb } from './db/index.js?v=57';

/* =========================================================
   PLAYER V2 — Native HTML5 Controls
   =========================================================
   Same backend logic as player.js (VAST preroll, multi-CDN,
   ExoClick banner, Shuffle box, Histats, smartlink redirect,
   block seeking) but uses NATIVE browser controls instead of
   custom UI (matches minimalist screenshot).
   ========================================================= */

const CFG = {
  VAST: {
    ENABLED: false,
    AD_TAG_URL: 'https://s.magsrv.com/v1/vast.php?idz=6044284',
    SKIP_DELAY: 5,
    FETCH_TIMEOUT: 6000,
    AD_TIMEOUT: 30000
  },
  BANNER: {
    ENABLED: false,
    DELAY: 1500,
    SHOW_CLOSE: true,
    ZONE: 6044296,
    PROVIDER_SCRIPT: 'https://a.magsrv.com/ad-provider.js',
    CONTAINER_CLASS: 'eas6a97888e10'
  },
  TELEGRAM_POPUP: {
    ENABLED: true,
    TRIGGER_TIME: 10,
    REDIRECT_URL: 'https://omg10.com/4/10410353',
    TITLE: 'Continue watching?',
    DESCRIPTION: 'Press continue to keep watching the video.',
    BUTTON_TEXT: 'Continue Watching'
  },
  /* Popunder (al5sm.com) — OFF in V2 (only Telegram popup active) */
  POPUNDER: {
    ENABLED: true,
    ZONE: '10918787',
    SCRIPT_URL: 'https://al5sm.com/tag.min.js'
  },
  SMARTLINK_REDIRECT: {
    ENABLED: false,
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
  let bannerClosed = false;

  /* HTML — full-screen video with native controls + VAST overlay + banner */
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

        /* VAST PREROLL OVERLAY */
        '<div class="plr-vast-wrap" id="plr-v2-vast-wrap">' +
          '<video id="plr-v2-ad-video" playsinline webkit-playsinline></video>' +
          '<div class="plr-vast-info">Ad</div>' +
          '<button class="plr-vast-skip" id="plr-v2-vast-skip" type="button">Skip Ad</button>' +
          '<div class="plr-vast-progress"><div class="plr-vast-progress-filled" id="plr-v2-vast-progress-filled"></div></div>' +
        '</div>' +

        /* MONETIZATION (banner — OFF in V2 by default) */
        '<div class="plr-monetization-wrap plr-v2-monetization-wrap" id="plr-v2-monetization-wrap"></div>' +

        /* TELEGRAM POPUP OVERLAY (appears at TRIGGER_TIME seconds = 20s) */
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
  const monetizationWrap = document.getElementById('plr-v2-monetization-wrap');
  const vastWrap = document.getElementById('plr-v2-vast-wrap');
  const adVideo = document.getElementById('plr-v2-ad-video');
  const vastSkipBtn = document.getElementById('plr-v2-vast-skip');
  const vastProgressFilled = document.getElementById('plr-v2-vast-progress-filled');
  const tgPopup = document.getElementById('plr-v2-tg-popup');
  const tgBtn = document.getElementById('plr-v2-tg-btn');


  /* =========================================================
     INLINE BANNER STYLES (same as V1)
     ========================================================= */
  function addBannerStyles() {
    if (document.getElementById('plr-ad-banner-styles')) return;
    var style = document.createElement('style');
    style.id = 'plr-ad-banner-styles';
    style.textContent =
      '.plr-v2-container{position:relative;}' +
      '.plr-monetization-wrap.plr-ad-banner-wrap{' +
        'position:absolute;left:50%;bottom:60px;' +
        'transform:translateX(-50%);width:320px;' +
        'max-width:calc(100% - 20px);height:50px;z-index:50;' +
      '}' +
      '.plr-ad-banner{position:relative;width:320px;max-width:100%;height:50px;margin:0 auto;}' +
      '.plr-ad-content{width:320px;height:50px;max-width:100%;overflow:hidden;}' +
      '.plr-ad-label{position:absolute;left:0;top:-12px;font-size:8px;line-height:10px;opacity:.55;pointer-events:none;z-index:60;}' +
      '.plr-ad-close{position:absolute;top:-9px;right:-9px;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.85);color:#fff;font-size:17px;line-height:22px;cursor:pointer;z-index:100;}' +
      '@media(max-width:480px){' +
        '.plr-monetization-wrap.plr-ad-banner-wrap{bottom:50px;max-width:calc(100% - 16px);}' +
        '.plr-ad-banner{max-width:100%;}' +
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
     BLOCK SEEKING — DISABLED in V2 (native controls allow seeking)
     Reverting currentTime causes buffering artifacts with native
     progress bar. Allow native seeking for smooth playback.
     ========================================================= */
  /* videoEl.addEventListener('seeking', function () {
    if (videoEl._lastSeekable !== undefined) {
      videoEl.currentTime = videoEl._lastSeekable;
    }
  }); */

  /* BLOCK PLAYBACK RATE — softened (no currentTime reset to prevent restart/buffering) */
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

    /* Telegram popup trigger at TRIGGER_TIME seconds (default 20s) */
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
     EXOCLICK BANNER HELPERS
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
    triggerExoClickServe();
    setTimeout(triggerExoClickServe, 500);
    setTimeout(triggerExoClickServe, 1500);
  }


  /* =========================================================
     POPUNDER (al5sm.com) — replaces Shuffle Box
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


  /* =========================================================
     VAST PREROLL (same logic as V1)
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

    var wrapper = doc.querySelector('VASTAdTagURI');
    if (wrapper) {
      var wrappedUrl = (wrapper.textContent || '').trim();
      if (wrappedUrl) return fetchVastAd(wrappedUrl, depth + 1);
    }

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
        console.warn('[V2 VAST] Overlay or ad video missing');
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
        var p = adVideo.play();
        if (p && p.catch) {
          p.then(function () {}).catch(function () {
            adVideo.muted = true;
            adVideo.play().catch(function () {
              console.warn('[V2 VAST] Autoplay blocked even muted');
              cleanup(false);
            });
          });
        }
      }

      function onEnded() { cleanup(true); }
      function onError(e) {
        console.warn('[V2 VAST] Ad video error:', e);
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

      vastWrap.classList.add('visible');
      if (vastSkipBtn) {
        vastSkipBtn.style.display = 'block';
        vastSkipBtn.textContent = 'Ad loading...';
        vastSkipBtn.disabled = true;
      }

      fetchTimeout = setTimeout(function () {
        console.warn('[V2 VAST] Fetch timeout');
        cleanup(false);
      }, CFG.VAST.FETCH_TIMEOUT);

      adHardTimeout = setTimeout(function () {
        if (!resolved) {
          console.warn('[V2 VAST] Ad play hard timeout');
          cleanup(true);
        }
      }, CFG.VAST.AD_TIMEOUT);

      fetchVastAd(CFG.VAST.AD_TAG_URL).then(function (ad) {
        if (resolved) return;
        if (fetchTimeout) {
          clearTimeout(fetchTimeout);
          fetchTimeout = null;
        }
        console.log('[V2 VAST] Got ad:', ad.mediaUrl.substring(0, 80), 'skip:', ad.skipDelay);
        skipDelay = ad.skipDelay;
        adVideo.src = ad.mediaUrl;
        adVideo.load();
      }).catch(function (err) {
        console.warn('[V2 VAST] Preroll failed:', err && err.message);
        cleanup(false);
      });
    });
  }


  /* =========================================================
     CREATE BANNER
     ========================================================= */
  function createBanner() {
    if (!monetizationWrap || bannerClosed) return;
    monetizationWrap.innerHTML = '';
    monetizationWrap.className = 'plr-monetization-wrap plr-ad-banner-wrap';

    var bannerBox = document.createElement('div');
    bannerBox.className = 'plr-ad-banner';

    var adContent = document.createElement('div');
    adContent.className = 'plr-ad-content';
    bannerBox.appendChild(adContent);

    if (CFG.BANNER.SHOW_CLOSE) {
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'plr-ad-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Close advertisement');
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
     SETUP MONETIZATION (banner only, no skip button in V2)
     ========================================================= */
  function setupMonetization() {
    if (!CFG.BANNER.ENABLED) return;
    setTimeout(function () {
      if (!bannerClosed) {
        createBanner();
      }
    }, CFG.BANNER.DELAY);
  }

  setupMonetization();
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

    /* VAST PREROLL */
    try {
      await playVastPreroll();
    } catch (e) {
      console.warn('[V2 VAST] preroll unexpected error:', e);
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
