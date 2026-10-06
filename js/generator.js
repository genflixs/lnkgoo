import {
  getDomain,
  getProtocol,
  getRandomDomain,
  extractFilenameFromUrl,
  detectCdn,
  extractPathFromUrl,
  generateKValue,
  generateSmartlinkKValue,
  generateRandomFilename,
  generateShortId,
  kValueToSlug,
  decodeKValue,
  escapeHtml,
  formatTimeAgo,
  showToast,
  copyText
} from './utils.js?v=57';
import { isDbReady, getDb, getDomains } from './db/index.js?v=57';
import History, { ShortStore } from './storage.js?v=57';

export function renderGenerator(container) {
  var domain = getDomain();
  var protocol = getProtocol();
  var domains = getDomains();
  var extensions = ['mp4', 'mpeg', 'mkv', 'avi', 'mov', 'wmv'];
  var selectedExt = 'mp4';
  var useExt = true;
  var currentFilename = '';
  var currentKValue = '';
  var currentKValue2 = '';
  var currentShortId = '';
  var currentShortId2 = '';
  var currentSmartId = '';

  /* DB Status badge */
  var dbStatusHtml = '';
  if (isDbReady()) {
    dbStatusHtml = '<span class="gen-db-badge ok"><i class="fa-solid fa-cloud"></i> DB Connected</span>';
  } else {
    dbStatusHtml = '<span class="gen-db-badge off"><i class="fa-solid fa-cloud-arrow-up"></i> Local Only</span>';
  }

  /* Multi-domain badge */
  var multiDomainHtml = '';
  if (domains.length > 0) {
    multiDomainHtml = '<div class="gen-domain-bar" style="margin-top:6px"><i class="fa-solid fa-globe" style="color:var(--accent-blue)"></i><span>Multi-domain:</span><strong>' + domains.length + ' domain (random)</strong></div>';
  }

  container.innerHTML =
    '<div class="gen-header">' +
      '<div class="gen-badge">GENERATOR TOOL</div>' +
      '<h1 class="gen-title">Video <span class="highlight">Player</span> Generator</h1>' +
      '<p class="gen-subtitle">Buat shortlink video player dengan CDN fallback otomatis. Salin URL video, generate, dan bagikan.</p>' +
      '<div class="gen-domain-bar">' +
        '<i class="fa-solid fa-circle-check"></i>' +
        '<span>Current domain:</span>' +
        '<strong>' + escapeHtml(domain) + '</strong>' +
        dbStatusHtml +
      '</div>' +
      multiDomainHtml +
      '<button class="btn-clear-cache" id="btn-clear-cache"><i class="fa-solid fa-broom"></i> Clear Cache</button>' +
    '</div>' +
    '<div class="gen-section">' +
      '<div class="gen-card">' +
        '<div class="gen-card-title"><i class="fa-solid fa-link red"></i> Input URL Video</div>' +
        '<div class="gen-input-group">' +
          '<div class="gen-input-wrap">' +
            '<i class="fa-solid fa-film"></i>' +
            '<input type="text" id="gen-url-input" placeholder="https://cdn2.videy.co/id.mp4" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<button class="btn-generate" id="gen-btn-generate">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate' +
          '</button>' +
        '</div>' +
        '<div class="gen-cdn-tags">' +
          '<span class="gen-cdn-tag primary" data-cdn="https://cdn.slicedrive.com/voDWqx8K1.mp4">Primary: Slicedrive</span>' +
          '<span class="gen-cdn-tag fallback" data-cdn="https://cdn2.videy.co/spedEuuF1.mp4">Videy</span>' +
          '<span class="gen-cdn-tag fallback" data-cdn="https://cdn.aceimg.com/YXJZMWePL.mp4">Aceimg</span>' +
          '<span class="gen-cdn-tag fallback" data-cdn="https://www.xxxfollow.com/media/fans/post_public/0/947/548197.mp4">Xxfollow</span>' +
          '<span class="gen-cdn-tag fallback" data-cdn="https://cdn.xfree.com/xfree-prod/4/f/7/4f7fc72e-24a0-411a-8abc-c82098507d12/full.mp4">Xfree</span>' +
        '</div>' +
        '<div class="gen-detected" id="gen-detected">' +
          '<i class="fa-solid fa-circle-check"></i>' +
          '<span>Filename:</span>' +
          '<span class="filename" id="gen-detected-name"></span>' +
        '</div>' +
        '<div class="gen-cdn-detected" id="gen-cdn-detected"></div>' +
        '<div class="gen-opt-row">' +
          '<label class="gen-ext-toggle">' +
            '<input type="checkbox" id="gen-ext-check" checked>' +
            '<span class="toggle-track"></span>' +
            '<span>Ekstensi</span>' +
          '</label>' +
          '<div class="gen-ext-buttons" id="gen-ext-buttons">' +
            extensions.map(function(ext) {
              return '<button class="gen-ext-btn' + (ext === selectedExt ? ' active' : '') + '" data-ext="' + ext + '">.' + ext + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="gen-section gen-output" id="gen-output">' +
      '<div class="gen-card">' +
        '<div class="gen-short-results" id="gen-short-results"></div>' +
        '<button class="btn-copy-all" id="btn-copy-all"><i class="fa-regular fa-copy"></i> Copy All</button>' +
      '</div>' +
    '</div>' +
    '<div class="gen-section" id="gen-history-section">' +
    '</div>' +
    '<a href="/" class="gen-back-link"><i class="fa-solid fa-arrow-left"></i> Kembali ke Home</a>';

  var urlInput = document.getElementById('gen-url-input');
  var btnGenerate = document.getElementById('gen-btn-generate');
  var detectedBar = document.getElementById('gen-detected');
  var detectedName = document.getElementById('gen-detected-name');
  var outputSection = document.getElementById('gen-output');
  var shortResults = document.getElementById('gen-short-results');
  var copyAllBtn = document.getElementById('btn-copy-all');
  var extButtonsContainer = document.getElementById('gen-ext-buttons');
  var extCheck = document.getElementById('gen-ext-check');
  var historySection = document.getElementById('gen-history-section');

  /* ---- Clear cache / cookie ---- */
  var clearCacheBtn = document.getElementById('btn-clear-cache');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', function() {
      try { localStorage.clear(); } catch(e) {}
      try { sessionStorage.clear(); } catch(e) {}
      showToast('Cache & cookie berhasil dihapus! Refresh halaman untuk efek penuh.', false);
    });
  }

  /* ---- CDN tag auto-fill ---- */
  container.querySelectorAll('.gen-cdn-tag[data-cdn]').forEach(function(tag) {
    tag.addEventListener('click', function() {
      var cdnBase = tag.getAttribute('data-cdn');
      urlInput.value = cdnBase;
      urlInput.focus();
      urlInput.dispatchEvent(new Event('input'));
    });
  });

  var EMOJIS = ['\u{1F449}','\u27A1\uFE0F','\u{1F517}','\u25B6\uFE0F','\u{1F3A5}','\u{1F3AC}','\u{1F4F9}','\u{1F4FA}','\u{1F39E}\uFE0F','\u{1F310}','\u{1F4F2}','\u{1F4F1}','\u{1F680}','\u2728','\u{1F4A5}','\u{1F525}','\u{1F3AF}','\u{1F534}','\u{1F519}','\u{1F4AB}','\u2611\uFE0F','\u2705','\u{1F51E}','\u{1F4AF}','\u{1F440}'];
  function pickEmoji() { return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]; }

  /* Shortlink URL: random 8-char ID + random domain */
  function getShortUrl(shortId) {
    if (!shortId) return '';
    var ext = useExt ? ('.' + selectedExt) : '';
    var shortDomain = getRandomDomain(domains);
    return protocol + '://' + shortDomain + '/' + shortId + ext;
  }

  /* Build DIRECT player URL with ?k= or ?v= parameter (bypass safelink) */
  function getDirectPlayerUrl(shortId, kValue, param) {
    if (!shortId || !kValue) return '';
    var ext = useExt ? ('.' + selectedExt) : '';
    var shortDomain = getRandomDomain(domains);
    return protocol + '://' + shortDomain + '/' + shortId + ext + '?' + param + '=' + encodeURIComponent(kValue);
  }

  function refreshShortResults() {
    if (!shortResults || !currentShortId || !currentShortId2 || !currentSmartId) return;
    var player1Url = getShortUrl(currentShortId);
    var player2Url = getShortUrl(currentShortId2);
    var smartUrl = getShortUrl(currentSmartId);
    var e1 = pickEmoji();
    var e2 = pickEmoji();
    var e3 = pickEmoji();
    shortResults.innerHTML =
      '<div class="gen-short-line" data-url="' + escapeHtml(player1Url) + '">' + e1 + '  ' + escapeHtml(player1Url) + '</div>' +
      '<div class="gen-short-line" data-url="' + escapeHtml(player2Url) + '">' + e2 + '  ' + escapeHtml(player2Url) + '</div>' +
      '<div class="gen-short-line" data-url="' + escapeHtml(smartUrl) + '">' + e3 + '  ' + escapeHtml(smartUrl) + '</div>';
  }

  function setExtension(ext) {
    selectedExt = ext;
    var extBtns = extButtonsContainer.querySelectorAll('.gen-ext-btn');
    extBtns.forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-ext') === ext);
    });
    refreshShortResults();
  }

  urlInput.addEventListener('input', function() {
    var val = urlInput.value.trim();
    var filename = extractFilenameFromUrl(val);
    var cdnDetectedEl = document.getElementById('gen-cdn-detected');
    if (filename) {
      currentFilename = filename;
      detectedName.textContent = filename;
      detectedBar.classList.add('visible');
    } else {
      currentFilename = '';
      detectedBar.classList.remove('visible');
    }
    /* Tampilkan badge CDN sumber yang terdeteksi */
    if (cdnDetectedEl) {
      var cdn = detectCdn(val);
      if (cdn && filename) {
        cdnDetectedEl.innerHTML =
          '<i class="fa-solid fa-server" style="color:var(--accent-blue)"></i>' +
          '<span>Source CDN:</span>' +
          '<strong>' + escapeHtml(cdn.name) + '</strong>';
        cdnDetectedEl.classList.add('visible');
      } else {
        cdnDetectedEl.classList.remove('visible');
        cdnDetectedEl.innerHTML = '';
      }
    }
  });

  urlInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      doGenerate();
    }
  });

  extButtonsContainer.addEventListener('click', function(e) {
    if (!useExt) return;
    var btn = e.target.closest('.gen-ext-btn');
    if (!btn) return;
    setExtension(btn.getAttribute('data-ext'));
  });

  extCheck.addEventListener('change', function() {
    useExt = extCheck.checked;
    extButtonsContainer.classList.toggle('disabled', !useExt);
    refreshShortResults();
  });

  /* Copy: klik per-baris atau Copy All */
  container.addEventListener('click', function(e) {
    /* Klik baris individual */
    var line = e.target.closest('.gen-short-line');
    if (line) {
      var url = line.getAttribute('data-url');
      if (url) copyText(url, line);
      return;
    }
    /* Tombol Copy All */
    if (e.target.closest('#btn-copy-all')) {
      var lines = shortResults.querySelectorAll('.gen-short-line');
      var allText = [];
      lines.forEach(function(l) { allText.push(l.textContent.trim()); });
      if (allText.length > 0) {
        copyText(allText.join('\n'), copyAllBtn);
      }
      return;
    }
  });

  btnGenerate.addEventListener('click', doGenerate);

  async function doGenerate() {
    var val = urlInput.value.trim();
    if (val.length < 3) {
      showToast('URL terlalu pendek (minimal 3 karakter)', true);
      return;
    }
    if (!val.includes('.')) {
      showToast('URL harus mengandung titik (.)', true);
      return;
    }
    var filename = extractFilenameFromUrl(val);
    if (!filename) {
      showToast('Tidak dapat mendeteksi filename dari URL', true);
      return;
    }

    /* Simpan sourceUrl ASLI dari input — ini akan di-encode ke k-value
       (format V3) sehingga player bisa langsung akses URL lengkap.
       Cocok untuk xxfollow/xfree yang punya path multi-segment. */
    var sourceUrl = '';
    try {
      /* Validasi: pastikan URL valid & punya protocol */
      var testUrl = new URL(val);
      if (testUrl && (testUrl.protocol === 'http:' || testUrl.protocol === 'https:')) {
        sourceUrl = testUrl.href;
      }
    } catch (e) {
      /* Input bukan URL absolut — coba tambah https:// */
      try {
        var testUrl2 = new URL('https://' + val);
        if (testUrl2) sourceUrl = testUrl2.href;
      } catch (e2) {
        /* Bukan URL sama sekali — biarkan sourceUrl kosong */
      }
    }

    currentFilename = filename;
    /* Generate 2 k-values: V1 (custom controls) and V2 (native controls)
       Both point to same video but have different random components + V2 prefix */
    currentKValue = generateKValue(filename, sourceUrl, undefined, undefined, 'v1');
    currentKValue2 = generateKValue(filename, sourceUrl, undefined, undefined, 'v2');

    /* Smartlink k-value (generated BEFORE slugs since slug = kValueToSlug(k-value)) */
    var smartKValue = generateSmartlinkKValue(
      'https://omg10.com/4/10410353'
    );

    /* Slugs = random 5-char ID (clean, short URL). K-value saved to DB + localStorage for lookup. */
    currentShortId = generateShortId(5);
    currentShortId2 = generateShortId(5);
    currentSmartId = generateShortId(5);

    /* Simpan ke localStorage */
    ShortStore.set(currentShortId, currentKValue);
    ShortStore.set(currentShortId2, currentKValue2);
    ShortStore.set(currentSmartId, smartKValue);

    /* Player Link — simpan URL ASLI sebagai playerUrl agar:
       1. History re-generation bisa pakai URL asli (bukan fake URL)
       2. DB lookup bisa fallback ke URL asli bila k-value format lama */
    var playerUrl = sourceUrl || val;
    if (!playerUrl.startsWith('http')) {
      /* Fallback: pakai fake URL bila sourceUrl kosong */
      var fakeName = generateRandomFilename();
      var playerDomain = getRandomDomain(domains);
      playerUrl = protocol + '://' + playerDomain + '/' + fakeName + '?k=' + currentKValue;
    }

    /* Player 1 safelink URL (via safelink → V1 custom controls) */
    var player1Url = getShortUrl(currentShortId);
    /* Player 2 safelink URL (via safelink → V2 native controls) */
    var player2Url = getShortUrl(currentShortId2);
    /* Smartlink safelink URL (via safelink → omg10.com) */
    var smartUrl = getShortUrl(currentSmartId);

    /* Tampilkan hasil: 3 baris tanpa label */
    var e1 = pickEmoji();
    var e2 = pickEmoji();
    var e3 = pickEmoji();
    shortResults.innerHTML =
      '<div class="gen-short-line" data-url="' + escapeHtml(player1Url) + '">' + e1 + '  ' + escapeHtml(player1Url) + '</div>' +
      '<div class="gen-short-line" data-url="' + escapeHtml(player2Url) + '">' + e2 + '  ' + escapeHtml(player2Url) + '</div>' +
      '<div class="gen-short-line" data-url="' + escapeHtml(smartUrl) + '">' + e3 + '  ' + escapeHtml(smartUrl) + '</div>';

    /* Simpan ke Database */
    if (isDbReady()) {
      try {
        var db = getDb();

        /* === STEP 1: Create PLAYER link === */
        var playerResult = await db.createLink(currentShortId, currentKValue, playerUrl, player1Url);
        console.log('[Generator] Player createLink result:', playerResult);

        /* Determine player code (new or existing if duplicate) */
        var playerCode = currentShortId;
        var playerDisplayPlayerUrl = playerUrl;
        var isPlayerDuplicate = false;

        if (playerResult && playerResult.duplicate) {
          /* Always use NEW slug code (base64 k-value) — works in any browser via base64 fallback */
          playerCode = currentShortId;
          isPlayerDuplicate = true;
          console.log('[Generator] Player duplicate detected, using NEW slug code:', playerCode);
        } else {
          console.log('[Generator] Player new entry created, code:', playerCode);
        }

        /* Save player k-value to ShortStore (BOTH codes for safety) */
        ShortStore.set(playerCode, currentKValue);
        if (playerCode !== currentShortId) {
          ShortStore.set(currentShortId, currentKValue);
        }

        /* === STEP 1b: Create PLAYER 2 link (different slug, V2 k-value with V2| prefix)
           Pass empty player_url to avoid DB duplicate detection overwriting Player 1 entry === */
        var player2Result = await db.createLink(currentShortId2, currentKValue2, '', player2Url);
        console.log('[Generator] Player 2 createLink result:', player2Result);

        if (player2Result && player2Result.duplicate) {
          console.log('[Generator] Player 2 duplicate detected, using NEW slug code:', currentShortId2);
        }

        ShortStore.set(currentShortId2, currentKValue2);

        /* === STEP 2: Create SMARTLINK link (ALWAYS, even if player is duplicate) === */
        var smartResult = await db.createLink(currentSmartId, smartKValue, '', smartUrl);
        console.log('[Generator] Smartlink createLink result:', smartResult);

        var smartCode = currentSmartId;
        var isSmartDuplicate = false;

        if (smartResult && smartResult.duplicate) {
          /* Always use NEW slug code (base64 k-value) — works in any browser via base64 fallback */
          smartCode = currentSmartId;
          isSmartDuplicate = true;
          console.log('[Generator] Smartlink duplicate detected, using NEW slug code:', smartCode);
        } else {
          console.log('[Generator] Smartlink new entry created, code:', smartCode);
        }

        /* Save smartlink k-value to ShortStore (BOTH codes for safety) */
        ShortStore.set(smartCode, smartKValue);
        if (smartCode !== currentSmartId) {
          ShortStore.set(currentSmartId, smartKValue);
        }

        /* === STEP 3: Build safelink URLs with correct codes === */
        var finalPlayer1Url = getShortUrl(playerCode);
        var finalPlayer2Url = getShortUrl(currentShortId2);
        var finalSmartUrl = getShortUrl(smartCode);
        console.log('[Generator] Final player 1 URL (safelink → V1):', finalPlayer1Url);
        console.log('[Generator] Final player 2 URL (safelink → V2):', finalPlayer2Url);
        console.log('[Generator] Final smartlink URL:', finalSmartUrl);

        /* === STEP 4: Verify entries exist in DB === */
        var playerVerified = false;
        var smartVerified = false;
        try {
          var verifyPlayer = await db.getLinkByCode(playerCode);
          if (verifyPlayer && verifyPlayer.url) {
            console.log('[Generator] ✓ Player verified in DB, url length:', verifyPlayer.url.length);
            playerVerified = true;
          } else {
            console.error('[Generator] ✗ Player NOT found in DB! Trying to re-create...');
            /* Try to re-create with current code */
            await db.createLink(playerCode, currentKValue, playerUrl, finalPlayer1Url);
            ShortStore.set(playerCode, currentKValue);
            playerVerified = true;
          }
        } catch (verifyErr) {
          console.warn('[Generator] Player verify failed:', verifyErr);
        }

        try {
          var verifySmart = await db.getLinkByCode(smartCode);
          if (verifySmart && verifySmart.url) {
            console.log('[Generator] ✓ Smartlink verified in DB, url length:', verifySmart.url.length);
            smartVerified = true;
          } else {
            console.error('[Generator] ✗ Smartlink NOT found in DB! Trying to re-create...');
            await db.createLink(smartCode, smartKValue, '', finalSmartUrl);
            ShortStore.set(smartCode, smartKValue);
            smartVerified = true;
          }
        } catch (verifyErr) {
          console.warn('[Generator] Smartlink verify failed:', verifyErr);
        }

        /* === STEP 5: Display results (no labels) === */
        var e1 = pickEmoji();
        var e2 = pickEmoji();
        var e3 = pickEmoji();
        shortResults.innerHTML =
          '<div class="gen-short-line" data-url="' + escapeHtml(finalPlayer1Url) + '">' + e1 + '  ' + escapeHtml(finalPlayer1Url) + '</div>' +
          '<div class="gen-short-line" data-url="' + escapeHtml(finalPlayer2Url) + '">' + e2 + '  ' + escapeHtml(finalPlayer2Url) + '</div>' +
          '<div class="gen-short-line" data-url="' + escapeHtml(finalSmartUrl) + '">' + e3 + '  ' + escapeHtml(finalSmartUrl) + '</div>';

        outputSection.classList.add('visible');
        setTimeout(function() {
          outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        History.add(filename, finalPlayer1Url, playerDisplayPlayerUrl);
        renderHistory();

        /* === STEP 6: Notification === */
        if (isPlayerDuplicate && isSmartDuplicate) {
          showToast('✓ Video sudah pernah di-generate. Shortlink yang sama ditampilkan kembali.', false);
        } else if (isPlayerDuplicate) {
          showToast('✓ Player duplicate! Shortlink sebelumnya ditampilkan kembali.', false);
        } else if (playerVerified && smartVerified) {
          showToast('✓ Shortlink berhasil dibuat & tersimpan ke DB!', false);
        } else {
          showToast('⚠ Shortlink dibuat tapi ada issue verifikasi. Cek console.', true);
        }
        return;
      } catch (e) {
        console.error('[Generator] DB error:', e);
        /* Fallback: still save to ShortStore so shortlink works in this browser */
        ShortStore.set(currentShortId, currentKValue);
        ShortStore.set(currentSmartId, smartKValue);
        showToast('Gagal simpan ke DB, shortlink hanya berlaku di browser ini', true);
      }
    } else {
      console.warn('[Generator] DB not ready, shortlink only valid in this browser');
      ShortStore.set(currentShortId, currentKValue);
      ShortStore.set(currentSmartId, smartKValue);
    }

    outputSection.classList.add('visible');

    /* Auto-scroll ke output */
    setTimeout(function() {
      outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    History.add(filename, player1Url, playerUrl);
    renderHistory();
    showToast('Shortlink berhasil dibuat!', false);
  }

  function renderHistory() {
    var items = History.getAll();
    var html = '<div class="gen-card">';
    html += '<div class="gen-history-header">';
    html += '<h3>Riwayat<span class="gen-history-count">(' + items.length + ')</span></h3>';
    if (items.length > 0) {
      html += '<button class="btn-clear-all" id="gen-clear-all">Hapus Semua</button>';
    }
    html += '</div>';
    if (items.length === 0) {
      html += '<div class="gen-history-empty"><i class="fa-regular fa-folder-open"></i>Belum ada riwayat generate</div>';
    } else {
      html += '<div class="gen-history-list">';
      items.forEach(function(item, idx) {
        html += '<div class="gen-history-item" data-index="' + idx + '">';
        html += '<span class="gen-history-num">' + (idx + 1) + '</span>';
        html += '<div class="gen-history-info">';
        html += '<div class="gen-history-filename">' + escapeHtml(item.filename) + '</div>';
        html += '<div class="gen-history-meta"><span class="short-id">' + escapeHtml(item.shortId) + '</span><span>' + formatTimeAgo(item.createdAt) + '</span></div>';
        html += '</div>';
        html += '<button class="btn-delete-item" data-del="' + idx + '"><i class="fa-solid fa-xmark"></i></button>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    historySection.innerHTML = html;

    var clearAllBtn = document.getElementById('gen-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function() {
        History.clear();
        renderHistory();
        showToast('Riwayat dihapus', false);
      });
    }

    historySection.querySelectorAll('.gen-history-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.btn-delete-item')) return;
        var index = parseInt(item.getAttribute('data-index'), 10);
        var data = History.getAll()[index];
        if (!data) return;
        urlInput.value = data.playerUrl || '';
        urlInput.dispatchEvent(new Event('input'));
        doGenerate();
      });
    });

    historySection.querySelectorAll('.btn-delete-item').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var index = parseInt(btn.getAttribute('data-del'), 10);
        History.remove(index);
        renderHistory();
        showToast('Item dihapus', false);
      });
    });
  }

  renderHistory();
}
