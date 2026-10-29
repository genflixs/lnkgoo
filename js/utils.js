export function getDomain() {
  return window.location.hostname;
}

export function getProtocol() {
  return window.location.protocol.replace(':', '');
}

export function getRandomDomain(domains) {
  if (!domains || domains.length === 0) return getDomain();
  return domains[Math.floor(Math.random() * domains.length)];
}

export function extractFilenameFromUrl(input) {
  if (!input || typeof input !== 'string') return '';
  let url;
  try {
    url = new URL(input);
  } catch {
    const parts = input.split('/');
    const last = parts[parts.length - 1];
    if (last && last.includes('.')) {
      return decodeURIComponent(last.split('?')[0].split('#')[0]);
    }
    return '';
  }
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  const last = parts[parts.length - 1];
  return decodeURIComponent(last.split('?')[0].split('#')[0]);
}

export const KNOWN_CDNS = [
  { key: 'slicedrive', name: 'Slicedrive', base: 'https://cdn.slicedrive.com' },
  { key: 'videy',      name: 'Videy',      base: 'https://cdn.videy.co' },
  { key: 'videy',      name: 'Videy',      base: 'https://cdn2.videy.co' },
  { key: 'aceimg',     name: 'Aceimg',     base: 'https://cdn.aceimg.com' },
  { key: 'xxfollow',   name: 'Xxfollow',   base: 'https://www.xxxfollow.com' },
  { key: 'xfree',      name: 'Xfree',      base: 'https://cdn.xfree.com' }
];

export function detectCdn(input) {
  if (!input || typeof input !== 'string') return null;
  var hostname = '';
  try {
    hostname = new URL(input).hostname.toLowerCase();
  } catch (e) {

    var lower = input.toLowerCase();
    for (var i = 0; i < KNOWN_CDNS.length; i++) {
      if (lower.indexOf(KNOWN_CDNS[i].base.toLowerCase()) !== -1) {
        return KNOWN_CDNS[i];
      }
    }
    return null;
  }
  for (var j = 0; j < KNOWN_CDNS.length; j++) {
    var cdnHost = '';
    try { cdnHost = new URL(KNOWN_CDNS[j].base).hostname.toLowerCase(); }
    catch (e2) { continue; }
    if (cdnHost === hostname) return KNOWN_CDNS[j];
  }
  return null;
}

export function extractPathFromUrl(input, cdnBase) {
  if (!input || typeof input !== 'string') return '';
  if (!cdnBase) {

    try {
      var u = new URL(input);
      var p = u.pathname.replace(/^\/+/, '');
      return decodeURIComponent(p);
    } catch (e) {
      return '';
    }
  }
  var base = cdnBase.replace(/\/+$/, '');

  try {
    var url = new URL(input);
    var baseUrl;
    try { baseUrl = new URL(cdnBase); } catch (e) { return ''; }
    if (url.hostname.toLowerCase() === baseUrl.hostname.toLowerCase()) {
      var path = url.pathname.replace(/^\/+/, '');
      return decodeURIComponent(path);
    }

    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch (e2) {

    return input.replace(/^\/+/, '');
  }
}

export function getFilenameFromPath(path) {
  if (!path || typeof path !== 'string') return '';
  var clean = path.split('?')[0].split('#')[0];
  var parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  return decodeURIComponent(parts[parts.length - 1]);
}

function btoURLSafe(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromURLSafe(b64url) {
  var s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return s;
}

export function generateKValue(realFilename, sourceUrl, cdnKey, cdnRelativePath, playerVersion) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!';
  let rand10 = '';
  for (let i = 0; i < 10; i++) {
    rand10 += Math.floor(Math.random() * 10);
  }
  let rand6 = '';
  for (let i = 0; i < 6; i++) {
    rand6 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  var raw = realFilename + '|' + rand10 + '|' + rand6;
  if (sourceUrl) {

    raw += '|' + sourceUrl;
  } else if (cdnKey && cdnRelativePath) {

    raw += '|' + cdnKey + '|' + cdnRelativePath;
  }

  if (playerVersion === 'v2') {
    raw = 'V2|' + raw;
  }
  return btoa(raw);
}

export function filenameToSlug(filename) {
  if (!filename) return '';
  return btoURLSafe(btoa(filename));
}

export function kValueToSlug(kValue) {
  if (!kValue) return '';
  return btoURLSafe(kValue);
}

export function slugToK(slug) {
  if (!slug || typeof slug !== 'string') return null;
  try {
    return fromURLSafe(slug);
  } catch {
    return null;
  }
}

export function generateSmartlinkKValue(url) {

  var rand10 = String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
  var rand6 = Math.random().toString(36).slice(2, 8);
  var raw = 'SMARTLINK|' + rand10 + '|' + rand6 + '|' + url;
  return btoa(raw);
}

export function generateLandingKValue(videoKValue) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!';
  var rand10 = '';
  for (var i = 0; i < 10; i++) rand10 += Math.floor(Math.random() * 10);
  var rand6 = '';
  for (var j = 0; j < 6; j++) rand6 += chars.charAt(Math.floor(Math.random() * chars.length));
  var raw = 'LANDING|' + rand10 + '|' + rand6 + '|' + videoKValue;
  return btoa(raw);
}

export function decodeLandingKValue(k) {
  if (!k || typeof k !== 'string') return null;
  try {
    var decoded = atob(k);
    if (!/^[\x20-\x7E]+$/.test(decoded)) return null;
    var parts = decoded.split('|');
    if (parts.length < 4 || parts[0] !== 'LANDING') return null;
    var videoKValue = parts.slice(3).join('|');
    if (!videoKValue) return null;
    return { videoKValue: videoKValue };
  } catch (e) {
    return null;
  }
}

export function decodeKValue(k) {
  if (!k || typeof k !== 'string') return { filename: null };
  try {
    const decoded = atob(k);

    if (!/^[\x20-\x7E]+$/.test(decoded)) return { filename: null };
    const parts = decoded.split('|');
    const first = parts[0];
    if (!first) return { filename: null };

    if (first === 'SMARTLINK' && parts.length >= 2) {
      var smartUrl = parts[parts.length - 1];
      if (smartUrl) return { type: 'smartlink', url: smartUrl };
    }

    if (first === 'LANDING' && parts.length >= 4) {
      var landingVideoK = parts.slice(3).join('|');
      if (landingVideoK) return { type: 'landing', videoKValue: landingVideoK };
    }

    if (first === 'V2' && parts.length >= 5 && parts[1]) {
      var v2fn = parts[1];
      if (v2fn.includes('.') && v2fn.length >= 5 && v2fn.length <= 200) {

        if (parts.length === 5 && parts[4] && /^https?:\/\//i.test(parts[4])) {
          return { playerVersion: 'v2', filename: v2fn, sourceUrl: parts[4] };
        }

        if (parts.length >= 6 && parts[4] && parts[5]) {
          return { playerVersion: 'v2', filename: v2fn, cdnKey: parts[4], cdnPath: parts[5] };
        }

        return { playerVersion: 'v2', filename: v2fn };
      }
    }

    if (!first.includes('.')) return { filename: null };
    if (first.length < 5 || first.length > 200) return { filename: null };

    if (parts.length === 4 && parts[3] && /^https?:\/\//i.test(parts[3])) {
      return {
        filename: first,
        sourceUrl: parts[3]
      };
    }

    if (parts.length >= 5 && parts[3] && parts[4]) {
      return {
        filename: first,
        cdnKey: parts[3],
        cdnPath: parts[4]
      };
    }

    return { filename: first };
  } catch {
    return { filename: null };
  }
}

export function extractSlugFromPath(path) {
  if (!path) return '';
  var parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  var last = parts[parts.length - 1];

  var dot = last.lastIndexOf('.');
  if (dot > 0) {
    return last.substring(0, dot);
  }
  return last;
}

export function randomChar() {
  var chars = 'abcdefghijklmnopqrstuvwxyz';
  return chars.charAt(Math.floor(Math.random() * chars.length));
}

export function generateShortId(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateRandomFilename() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0; i < 8; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return name + '.mp4';
}

export function randomId(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

export function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm lalu';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'j lalu';
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return dd + '/' + mm + ' ' + HH + ':' + MM;
}

let toastTimer = null;

export function showToast(msg, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  el.classList.remove('err-toast');
  const iconClass = isError ? 'err' : 'ok';
  const iconName = isError ? 'fa-circle-xmark' : 'fa-circle-check';
  el.innerHTML = '<i class="fa-solid ' + iconName + ' ' + iconClass + '"></i>' + escapeHtml(msg);
  if (isError) el.classList.add('err-toast');
  el.classList.add('show');
  toastTimer = setTimeout(function() {
    el.classList.remove('show', 'err-toast');
    toastTimer = null;
  }, 3000);
}

export function copyText(text, btnElement) {
  function success() {
    if (btnElement) {
      var orig = btnElement.innerHTML;
      btnElement.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      btnElement.classList.add('copied');
      setTimeout(function() {
        btnElement.innerHTML = orig;
        btnElement.classList.remove('copied');
      }, 2000);
    }
    showToast('Berhasil disalin ke clipboard', false);
  }
  function fail() {

    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { success(); return; }
    } catch (e) {   }
    showToast('Gagal menyalin ke clipboard', true);
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(success).catch(fail);
  } else {
    fail();
  }
}
