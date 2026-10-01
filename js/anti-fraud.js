/* Anti-Fraud Module — Adblock, Bot, VPN, Proxy Detection
   ----------------------------------------------------------------
   Detects:
   - Adblock: bait element detection (DOM check)
   - Bot: navigator.webdriver + user agent patterns + missing features
   - VPN/Proxy: ipinfo.io API + heuristic on `org` field + known ASNs
   ----------------------------------------------------------------
   When violation detected, shows full-screen overlay blocking the player.
   User can click "Retry" to re-run checks (e.g. after disabling adblock).
   ---------------------------------------------------------------- */

var _fraudOverlayShown = false;
var _geoCache = null;

/* =========================================================
   AD BLOCK DETECTION
   ========================================================= */
async function checkAdblock() {
  return new Promise(function (resolve) {
    /* Create bait element with common adblock target classes */
    var bait = document.createElement('div');
    bait.className = 'ad-banner adsterra ad-pla ads adsbygoogle google-ad ad-slot';
    bait.setAttribute('data-ad-slot', '1');
    bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;font-size:1px;';
    bait.innerHTML = '&nbsp;';
    document.body.appendChild(bait);

    /* Wait for adblocker to act (if present) */
    setTimeout(function () {
      var blocked = false;
      try {
        var style = window.getComputedStyle(bait);
        if (
          bait.offsetParent === null ||
          bait.offsetHeight === 0 ||
          bait.offsetWidth === 0 ||
          bait.clientHeight === 0 ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0'
        ) {
          blocked = true;
        }
      } catch (e) {
        blocked = true;
      }

      try { document.body.removeChild(bait); } catch (e) {}
      resolve(blocked);
    }, 150);
  });
}

/* =========================================================
   BOT DETECTION
   ========================================================= */
function checkBot() {
  /* Headless browser detection (Chrome/Selenium/WebDriver) */
  if (navigator.webdriver === true) return true;

  /* PhantomJS / Nightmare.js / old headless */
  if (window._phantom || window.__nightmare || window.callPhantom) return true;

  /* Missing languages (headless Chrome often has empty languages array) */
  if (!navigator.languages || navigator.languages.length === 0) return true;

  /* Permissions API check (headless often has weird permission state) */
  /* (skipped — too many false positives on mobile) */

  /* User agent patterns */
  var ua = (navigator.userAgent || '').toLowerCase();
  var botPatterns = [
    'bot', 'crawl', 'spider', 'scrap', 'slurp',
    'googlebot', 'bingbot', 'yandexbot', 'duckduckbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'whatsapp', 'telegrambot', 'applebot',
    'headless', 'puppeteer', 'selenium', 'phantomjs',
    'webdriver', 'chromedriver', 'geckodriver', 'iedriver',
    'apache-httpclient', 'python-requests', 'python-urllib',
    'curl', 'wget', 'httpclient', 'node-fetch', 'got/',
    'java/', 'okhttp', 'perl/', 'ruby/', 'php/'
  ];

  for (var i = 0; i < botPatterns.length; i++) {
    if (ua.indexOf(botPatterns[i]) !== -1) return true;
  }

  return false;
}

/* =========================================================
   VPN / PROXY DETECTION (via ipinfo.io + heuristic)
   ========================================================= */
async function checkVpnProxy() {
  if (_geoCache !== null) return _geoCache;

  try {
    var res = await fetch('https://ipinfo.io/json');
    if (!res.ok) {
      _geoCache = { vpn: false, proxy: false, country: '', org: '', ip: '' };
      return _geoCache;
    }
    var data = await res.json();

    var org = (data.org || '').toLowerCase();
    var asn = data.asn ? String(data.asn).toLowerCase() : '';

    /* Extract ASN from org if not provided directly (e.g., "AS9009 M247...") */
    if (!asn) {
      var match = org.match(/as(\d+)/);
      if (match) asn = 'as' + match[1];
    }

    /* Heuristic: check org field for VPN/hosting/datacenter keywords */
    var vpnKeywords = [
      'vpn', 'hosting', 'data center', 'datacenter', 'data-center',
      'cloud', 'server', 'colocation', 'colo', 'dedicated',
      'virtual private', 'vps', 'dedicated server', 'isp'
    ];
    var isVpn = false;
    var keywordMatched = '';
    for (var i = 0; i < vpnKeywords.length; i++) {
      if (org.indexOf(vpnKeywords[i]) !== -1) {
        isVpn = true;
        keywordMatched = vpnKeywords[i];
        break;
      }
    }

    /* Known VPN/proxy/hosting ASNs */
    var knownVpnAsns = [
      'as9009',   // M247 Europe
      'as14618',  // Amazon AWS
      'as16509',  // Amazon AWS
      'as15169',  // Google
      'as8075',   // Microsoft Azure
      'as8068',   // Microsoft
      'as19679',  // Dropbox
      'as13335',  // Cloudflare
      'as24940',  // Hetzner
      'as14061',  // DigitalOcean
      'as62567',  // DigitalOcean
      'as396982', // Google Cloud
      'as16509',  // Amazon
      'as714',    // Apple
      'as32934',  // Facebook
      'as29073',  // Quasi Networks (often used for proxy)
      'as46562',  // Performive (datacenter)
      'as396982'  // Google LLC
    ];
    for (var j = 0; j < knownVpnAsns.length; j++) {
      if (asn === knownVpnAsns[j] || org.indexOf(knownVpnAsns[j]) !== -1) {
        isVpn = true;
        keywordMatched = knownVpnAsns[j];
        break;
      }
    }

    _geoCache = {
      vpn: isVpn,
      proxy: isVpn,
      country: data.country || '',
      org: data.org || '',
      ip: data.ip || '',
      asn: asn,
      keywordMatched: keywordMatched
    };
    return _geoCache;
  } catch (e) {
    _geoCache = { vpn: false, proxy: false, country: '', org: '', ip: '' };
    return _geoCache;
  }
}

/* =========================================================
   FRAUD OVERLAY (blocking UI)
   ========================================================= */
function showFraudOverlay(title, message) {
  if (_fraudOverlayShown) return;
  _fraudOverlayShown = true;

  /* Add overlay styles if not present */
  if (!document.getElementById('anti-fraud-styles')) {
    var style = document.createElement('style');
    style.id = 'anti-fraud-styles';
    style.textContent =
      '#anti-fraud-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.97);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,-apple-system,sans-serif;animation:antiFraudFade 0.3s ease}' +
      '@keyframes antiFraudFade{from{opacity:0}to{opacity:1}}' +
      '.af-box{background:#1a1d29;border:1px solid #fe2c55;border-radius:12px;padding:32px;max-width:400px;width:90%;text-align:center;box-shadow:0 12px 48px rgba(254,44,85,0.3)}' +
      '.af-icon{font-size:48px;margin-bottom:16px;line-height:1}' +
      '.af-title{color:#fe2c55;font-size:20px;font-weight:700;margin-bottom:12px}' +
      '.af-msg{color:#c8cad4;font-size:14px;line-height:1.6;margin-bottom:20px}' +
      '.af-btn{background:#22d3ee;color:#1a1d29;border:0;border-radius:6px;padding:12px 24px;font-weight:700;font-size:14px;cursor:pointer;width:100%;font-family:inherit;transition:background 0.2s ease,transform 0.1s ease}' +
      '.af-btn:hover{background:#06b6d4}' +
      '.af-btn:active{transform:scale(0.97)}' +
      '@media(max-width:480px){.af-box{padding:24px 18px}.af-icon{font-size:40px}.af-title{font-size:18px}.af-msg{font-size:13px}}';
    document.head.appendChild(style);
  }

  var overlay = document.createElement('div');
  overlay.id = 'anti-fraud-overlay';
  overlay.innerHTML =
    '<div class="af-box">' +
      '<div class="af-icon">&#9888;&#65039;</div>' +
      '<h3 class="af-title">' + title + '</h3>' +
      '<p class="af-msg">' + message + '</p>' +
      '<button class="af-btn" id="anti-fraud-retry" type="button">Retry</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var retryBtn = document.getElementById('anti-fraud-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      _fraudOverlayShown = false;
      try { document.body.removeChild(overlay); } catch (e) {}
      runAntiFraudChecks();
    });
  }
}

/* =========================================================
   MAIN ANTI-FRAUD ENTRY POINT
   Returns: { adblock, bot, vpn, proxy, country, org, ip, blocked }
   ========================================================= */
export async function runAntiFraudChecks() {
  var results = {
    adblock: false,
    bot: false,
    vpn: false,
    proxy: false,
    country: '',
    org: '',
    ip: '',
    blocked: false
  };

  /* 1. Bot check (fast, synchronous) */
  try {
    if (checkBot()) {
      results.bot = true;
      results.blocked = true;
      console.warn('[Anti-Fraud] Bot detected — UA:', navigator.userAgent);
      showFraudOverlay(
        'Bot Traffic Detected',
        'Access from automated bots, scrapers, or headless browsers is not allowed. Please use a real browser to watch this video.'
      );
      return results;
    }
  } catch (e) { /* ignore */ }

  /* 2. VPN/Proxy check (async, slow — fetches IP info) */
  try {
    var vpnResult = await checkVpnProxy();
    results.vpn = vpnResult.vpn;
    results.proxy = vpnResult.proxy;
    results.country = vpnResult.country;
    results.org = vpnResult.org;
    results.ip = vpnResult.ip;

    if (vpnResult.vpn || vpnResult.proxy) {
      results.blocked = true;
      console.warn('[Anti-Fraud] VPN/Proxy detected — org:', vpnResult.org, '— reason:', vpnResult.keywordMatched);
      showFraudOverlay(
        'VPN/Proxy Detected',
        'Access via VPN, proxy, or datacenter IP is not allowed. Please disable your VPN/proxy and reload the page. (Detected: ' + (vpnResult.org || 'unknown') + ')'
      );
      return results;
    }
  } catch (e) { /* ignore */ }

  /* 3. Adblock check (needs DOM, async — runs after page renders) */
  try {
    results.adblock = await checkAdblock();
    if (results.adblock) {
      results.blocked = true;
      console.warn('[Anti-Fraud] Adblock detected');
      showFraudOverlay(
        'Adblocker Detected',
        'Please disable your adblocker (uBlock Origin, AdGuard, Brave Shields, etc.) and click Retry to continue watching.'
      );
      return results;
    }
  } catch (e) { /* ignore */ }

  console.log('[Anti-Fraud] All checks passed', results);
  return results;
}
