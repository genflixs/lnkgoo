import { decodeLandingKValue, decodeKValue, escapeHtml } from './utils.js?v=59';
import { isDbReady, getDb } from './db/index.js?v=59';
import { ShortStore } from './storage.js?v=59';

const LANDING_CFG = {
  SMARTLINK_URL: 'https://t.co/qf09zzyREo',
  PAGE_TITLE: 'Videy.co — Video Player',
  LOGO_TEXT: 'Videy.co',
  FOOTER_TEXT: 'Powered by Videy CDN',
  DESCRIPTION: "Video is ready to play. If one link doesn't work, try another available link below \uD83D\uDC47",
  BUTTONS: [
    { name: '\u25B6 Play Video',   cls: 'primary' },
    { name: '\uD83D\uDD25 Video Link 2', cls: 'alt' },
    { name: '\uD83D\uDC8E Video Link 3', cls: 'alt' },
    { name: '\uD83C\uDFAC Video Link 4', cls: 'primary' }
  ]
};

export function renderLandingPage(container, slug) {
  document.body.classList.add('is-landing');
  document.body.classList.remove('is-player', 'is-feed', 'is-safelink', 'is-player-v2');

  document.title = LANDING_CFG.PAGE_TITLE;

  if (!slug) {
    console.warn('[Landing] No slug provided, redirecting to smartlink');
    redirectToSmartlink(container);
    return;
  }

  console.log('[Landing] Render for slug:', slug);
  container.innerHTML = renderLoading();

  loadAndRender(container, slug);
}

async function loadAndRender(container, slug) {
  var kValue = null;

  try {
    kValue = ShortStore.get(slug);
    if (kValue) {
      console.log('[Landing] k-value found in localStorage');
    }
  } catch (e) { }

  if (!kValue) {
    var tries = 0;
    while (!isDbReady() && tries < 50) {
      await new Promise(function(r) { setTimeout(r, 100); });
      tries++;
    }

    if (isDbReady()) {
      try {
        var db = getDb();
        var link = await db.getLinkByCode(slug);
        if (link && link.url) {
          kValue = link.url;
          console.log('[Landing] k-value found in DB, length:', kValue.length);
          db.incrementClicks(slug).catch(function() {});
        } else {
          console.warn('[Landing] Slug not found in DB:', slug);
        }
      } catch (e) {
        console.error('[Landing] DB lookup error:', e);
      }
    }
  }

  if (!kValue) {
    console.warn('[Landing] No k-value found for slug, redirecting to smartlink');
    redirectToSmartlink(container);
    return;
  }

  var decoded = decodeKValue(kValue);
  if (!decoded || decoded.type !== 'landing' || !decoded.videoKValue) {
    console.warn('[Landing] Invalid k-value (not LANDING type), redirecting to smartlink');
    redirectToSmartlink(container);
    return;
  }

  var videoDecoded = decodeKValue(decoded.videoKValue);
  if (!videoDecoded || !videoDecoded.filename) {
    console.warn('[Landing] Invalid video k-value inside landing, redirecting to smartlink');
    redirectToSmartlink(container);
    return;
  }

  console.log('[Landing] Valid k-value, video filename:', videoDecoded.filename);

  var videoUrl = '/?k=' + encodeURIComponent(decoded.videoKValue);
  var smartlinkUrl = LANDING_CFG.SMARTLINK_URL;

  var videoBtnIdx = Math.floor(Math.random() * LANDING_CFG.BUTTONS.length);
  console.log('[Landing] Video button position:', videoBtnIdx + 1);

  var buttons = LANDING_CFG.BUTTONS.map(function(btn, idx) {
    return {
      name: btn.name,
      cls: btn.cls,
      href: (idx === videoBtnIdx) ? videoUrl : smartlinkUrl,
      isVideo: (idx === videoBtnIdx)
    };
  });

  container.innerHTML = buildLandingHTML(buttons);
  setupButtons(container, buttons);
}

function redirectToSmartlink(container) {
  if (container) {
    container.innerHTML = renderLoading();
  }
  setTimeout(function() {
    window.location.href = LANDING_CFG.SMARTLINK_URL;
  }, 300);
}

function renderLoading() {
  return '' +
    '<div class="landing-loading">' +
      '<div class="landing-spinner"></div>' +
      '<p>Loading...</p>' +
    '</div>';
}

function buildLandingHTML(buttons) {
  var buttonsHTML = buttons.map(function(btn, idx) {
    var cls = 'landing-btn landing-btn-' + btn.cls;
    return '<a href="' + escapeHtml(btn.href) + '" ' +
           'class="' + cls + '" ' +
           'data-idx="' + idx + '" ' +
           'data-is-video="' + (btn.isVideo ? '1' : '0') + '">' +
           escapeHtml(btn.name) +
           '</a>';
  }).join('');

  return '' +
    '<div class="landing-page">' +
      '<div class="landing-inner">' +
        '<header class="landing-header">' +
          '<h1 class="landing-logo">' + escapeHtml(LANDING_CFG.LOGO_TEXT) + '</h1>' +
        '</header>' +
        '<main class="landing-main">' +
          '<p class="landing-desc">' + escapeHtml(LANDING_CFG.DESCRIPTION) + '</p>' +
          '<div class="landing-buttons">' + buttonsHTML + '</div>' +
        '</main>' +
        '<footer class="landing-footer">' +
          escapeHtml(LANDING_CFG.FOOTER_TEXT) +
        '</footer>' +
      '</div>' +
    '</div>';
}

function setupButtons(container, buttons) {
  var btns = container.querySelectorAll('.landing-btn');
  btns.forEach(function(btnEl) {
    btnEl.addEventListener('click', function(e) {
      var orig = btnEl.innerHTML;
      btnEl.classList.add('landing-btn-loading');
      btnEl.innerHTML = '<span class="landing-btn-spinner"></span> Loading...';
      setTimeout(function() {
        if (btnEl) {
          btnEl.innerHTML = orig;
          btnEl.classList.remove('landing-btn-loading');
        }
      }, 1500);
    });
  });
}
