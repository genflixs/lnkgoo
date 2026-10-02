import { extractSlugFromPath, slugToK, decodeKValue } from './utils.js?v=57';
import { ShortStore } from './storage.js?v=57';

export function getRoute() {
  var stored = sessionStorage.getItem('spa_redirect');
  var path = '/';
  var search = '';

  if (stored) {
    sessionStorage.removeItem('spa_redirect');
    var qIdx = stored.indexOf('?');
    if (qIdx !== -1) {
      path = stored.substring(0, qIdx);
      search = stored.substring(qIdx);
    } else {
      path = stored;
    }
  }

  /* Fallback: baca langsung dari URL bar (untuk .htaccess / Laragon) */
  if (path === '/') path = window.location.pathname;
  if (!search) search = window.location.search;

  var params = new URLSearchParams(search);
  var kValue = null;
  var isShortRedirect = false;
  var shortSlug = null;
  var isSafelink = false;
  var safelinkSlug = null;
  var playerMode = null;  /* 'v1' (custom controls) or 'v2' (native controls) */

  /* Method 0: ?vid=slug — halaman safelink interstitial */
  if (params.has('vid')) {
    isSafelink = true;
    safelinkSlug = params.get('vid');
  }

  /* Method 1a: ?k= query param (player V1 — custom controls) */
  if (!isSafelink && params.has('k')) {
    kValue = params.get('k');
    playerMode = 'v1';
  }

  /* Method 1b: ?v= query param (player V2 — native HTML5 controls) */
  if (!isSafelink && !kValue && params.has('v')) {
    kValue = params.get('v');
    playerMode = 'v2';
  }

  /* Method 2: path-based (shortlink) */
  if (!isSafelink && !kValue && path && path !== '/') {
    var slug = extractSlugFromPath(path);
    if (slug && slug.length >= 5) {
      shortSlug = slug;
      isShortRedirect = true; /* Optimistik: slug 5+ char = potensi shortlink */

      /* Sync lookup: cek localStorage ShortStore */
      try {
        var storedK = ShortStore.get(slug);
        if (storedK) {
          kValue = storedK;
          playerMode = 'v1';  /* shortlink → safelink → player V1 (default) */
        }
      } catch (e) { /* ignore */ }

      /* Sync fallback: cek base64 decode (format lama) */
      if (!kValue) {
        try {
          var potentialK = slugToK(slug);
          if (potentialK) {
            var test = decodeKValue(potentialK);
            if (test.filename) {
              kValue = potentialK;
              playerMode = 'v1';
            }
          }
        } catch (e) { /* ignore */ }
      }
    }
  }

  return {
    path: path,
    params: params,
    kValue: kValue,
    shortSlug: shortSlug,
    isSafelink: isSafelink,
    safelinkSlug: safelinkSlug,
    playerMode: playerMode,
    isGenerator: !isSafelink && !kValue && !isShortRedirect,
    isPlayer: !!kValue && !isShortRedirect && !isSafelink,
    isShortRedirect: isShortRedirect
  };
}
