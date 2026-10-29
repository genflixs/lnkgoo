/**
 * Landing Page (Videy.co style) — Output 2 dari generator
 * -----------------------------------------------------------------------
 * Halaman ini muncul setelah user klik shortlink Output 2 → safelink
 * interstitial (artikel + countdown) → setelah countdown selesai,
 * safelink.js doContinue() detect type='landing' → redirect ke:
 *   domain.com/?lp=<encoded-landing-k-value>
 *
 * Router detect ?lp= param → render landing page (file ini).
 *
 * K-value di-decode untuk mendapatkan videoKValue (V1 k-value player).
 * Halaman menampilkan 4 button dengan nama fix:
 *   1. ▶ Play Video    (primary — biru)
 *   2. 🔥 Video Link 2  (gray)
 *   3. 💎 Video Link 3  (gray)
 *   4. 🎬 Video Link 4  (blue)
 *
 * Setiap page load, posisi link di-acak:
 *   - 1 button (random position) → /?k=<videoKValue>  (player V1)
 *   - 3 button lainnya           → smartlink URL
 *
 * Jika k-value invalid / missing → auto-redirect ke smartlink.
 */

import { decodeLandingKValue, decodeKValue, escapeHtml } from './utils.js?v=58';

/* =========================================================
   CONFIG — EDIT HERE
   ========================================================= */
const LANDING_CFG = {
  /* Smartlink URL — target untuk 3 button "smartlink".
     URL yang sama dipakai di seluruh app (player.js, safelink.js, dll). */
  SMARTLINK_URL: 'https://t.co/qf09zzyREo',

  /* Page title (tab label) */
  PAGE_TITLE: 'Videy.co — Video Player',

  /* Logo text */
  LOGO_TEXT: 'Videy.co',

  /* Footer text */
  FOOTER_TEXT: 'Powered by Videy CDN',

  /* Deskripsi di bawah logo */
  DESCRIPTION: "Video is ready to play. If one link doesn't work, try another available link below \uD83D\uDC47",

  /* Button definitions — NAMA TIDAK BERUBAH, hanya href yang di-shuffle.
     Class `primary` dan `alt` dipakai untuk styling (warna sesuai screenshot). */
  BUTTONS: [
    { name: '\u25B6 Play Video',   cls: 'primary' }, /* biru highlight */
    { name: '\uD83D\uDD25 Video Link 2', cls: 'alt' },     /* gray */
    { name: '\uD83D\uDC8E Video Link 3', cls: 'alt' },     /* gray */
    { name: '\uD83C\uDFAC Video Link 4', cls: 'primary' }  /* biru */
  ]
};


/* =========================================================
   RENDER LANDING PAGE
   ========================================================= */
export function renderLandingPage(container, landingKValue) {
  document.body.classList.add('is-landing');
  document.body.classList.remove('is-player', 'is-feed', 'is-safelink', 'is-player-v2');

  /* Set document title */
  document.title = LANDING_CFG.PAGE_TITLE;

  /* ---- Validasi k-value ---- */
  if (!landingKValue) {
    console.warn('[Landing] No ?video= param, redirecting to smartlink');
    redirectToSmartlink();
    return;
  }

  var decoded = decodeLandingKValue(landingKValue);
  if (!decoded || !decoded.videoKValue) {
    console.warn('[Landing] Invalid landing k-value, redirecting to smartlink');
    redirectToSmartlink();
    return;
  }

  /* Validate inner video k-value (must contain filename) */
  var videoDecoded = decodeKValue(decoded.videoKValue);
  if (!videoDecoded || !videoDecoded.filename) {
    console.warn('[Landing] Invalid video k-value inside landing, redirecting to smartlink');
    redirectToSmartlink();
    return;
  }

  console.log('[Landing] Valid k-value, video filename:', videoDecoded.filename);

  /* ---- Build URLs ---- */
  /* Video URL: player V1 dengan custom controls (popunder, telegram popup,
     smartlink redirect on video end — semua fitur monetisasi aktif).
     Player V1 di-route via ?k= param. */
  var videoUrl = '/?k=' + encodeURIComponent(decoded.videoKValue);

  /* Smartlink URL: target monetisasi langsung (t.co/qf09zzyREo). */
  var smartlinkUrl = LANDING_CFG.SMARTLINK_URL;

  /* ---- Shuffle button destinations ---- */
  /* Pilih 1 posisi random untuk video, 3 posisi lainnya untuk smartlink.
     Nama button tetap di urutan yang sama, hanya href yang berubah. */
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

  /* ---- Render HTML ---- */
  container.innerHTML = buildLandingHTML(buttons);

  /* ---- Setup button click handlers ---- */
  setupButtons(container, buttons);
}


/* =========================================================
   REDIRECT TO SMARTLINK (fallback when k-value invalid)
   ========================================================= */
function redirectToSmartlink() {
  /* Tampilkan loading state sebentar lalu redirect.
     Delay singkat agar console log sempat terlihat saat debugging. */
  container_renderLoading();
  setTimeout(function() {
    window.location.href = LANDING_CFG.SMARTLINK_URL;
  }, 300);
}

function container_renderLoading() {
  /* No-op: loading ditangani oleh CSS body.is-landing + loader bawaan.
     Tapi kalau container ada, isi dengan spinner kecil agar tidak blank. */
  var app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<div class="landing-loading">' +
        '<div class="landing-spinner"></div>' +
        '<p>Redirecting...</p>' +
      '</div>';
  }
}


/* =========================================================
   HTML BUILDER
   ========================================================= */
function buildLandingHTML(buttons) {
  /* Build button list HTML */
  var buttonsHTML = buttons.map(function(btn, idx) {
    var cls = 'landing-btn landing-btn-' + btn.cls;
    /* Tambahkan target=_blank supaya smartlink buka di tab baru?
       Tidak — biarkan di tab yang sama agar flow tetap mulus. */
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


/* =========================================================
   BUTTON HANDLERS
   ========================================================= */
function setupButtons(container, buttons) {
  /* Klik button = navigasi biasa (href sudah di-set).
     Tapi kita tambahkan loading indicator pada button yang diklik
     supaya user dapat feedback visual. */
  var btns = container.querySelectorAll('.landing-btn');
  btns.forEach(function(btnEl) {
    btnEl.addEventListener('click', function(e) {
      /* Biarkan navigasi default terjadi (href), tapi kasih feedback visual */
      var orig = btnEl.innerHTML;
      btnEl.classList.add('landing-btn-loading');
      btnEl.innerHTML = '<span class="landing-btn-spinner"></span> Loading...';
      /* Set timeout untuk restore kalau navigasi gagal (mis. popunder block) */
      setTimeout(function() {
        if (btnEl) {
          btnEl.innerHTML = orig;
          btnEl.classList.remove('landing-btn-loading');
        }
      }, 1500);
    });
  });
}
