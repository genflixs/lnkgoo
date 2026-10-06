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

   ExoClick ads (VAST preroll, banner, download ad, popunder script)
   have been REMOVED from this build.

   Currently ACTIVE:
     - POPUNDER (al5sm.com)           : ON  (zone 10918787)
     - TELEGRAM_POPUP                 : ON  (trigger @ 30s → omg10.com)
     - SMARTLINK_REDIRECT             : ON  (video end + skip button → omg10.com)
     - HISTATS (analytics)            : ON
   ----------------------------------------------------------------- */
const CFG = {
  /* Popunder (al5sm.com) — replaces Shuffle Box, fires on user click */
  POPUNDER: {
    ENABLED: true,
    ZONE: '10918787',
    SCRIPT_URL: 'https://al5sm.com/tag.min.js'
  },

  /* Telegram popup — visible overlay at TRIGGER_TIME seconds, redirects to smartlink */
  TELEGRAM_POPUP: {
    ENABLED: true,
    TRIGGER_TIME: 30,
    REDIRECT_URL: 'https://omg10.com/4/10410353',
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


  /* =========================================================
     PLAYER HTML
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

          /* MONETIZATION AREA — kept as a placeholder
             (ExoClick banner removed; wrap is empty by default). */
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

  /* Standard UI elements */
  const bigPlayBtn = document.getElementById('plr-big-play');
  const progressBar = document.getElementById('plr-progress');
  const progressFilled = document.getElementById('plr-progress-filled');
  const progressBuffered = document.getElementById('plr-progress-buffered');
  const tgPopup = document.getElementById('plr-tg-popup');
  const tgBtn = document.getElementById('plr-tg-btn');


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

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      (videoEl && videoEl.webkitDisplayingFullscreen)
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
            if (videoEl && videoEl.webkitEnterFullscreen) {
              try { videoEl.webkitEnterFullscreen(); } catch (e) {}
            }
          });
        }
        return;
      } catch (e) {
        /* fall through to iOS fallback */
      }
    }

    /* 2. iOS Safari — only video element can go fullscreen */
    if (videoEl && videoEl.webkitEnterFullscreen) {
      try { videoEl.webkitEnterFullscreen(); } catch (e) {}
    }
  }

  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (videoEl && videoEl.webkitExitFullscreen) {
      try { videoEl.webkitExitFullscreen(); } catch (e) {}
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
     Video auto-pauses when popup appears. Button redirects to smartlink.
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

    /* BANNER MODE — banner removed; just hide skip button. */
    skipBtn.style.display = 'none';
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

      if (videoEl.paused) {
        videoEl.play().catch(function () {});
      }
    } catch (err) {
      setTimeout(doRedirect, 3000);
      return;
    }

  })();
}
