import { extractSlugFromPath, slugToK, decodeKValue } from './utils.js?v=60';
import { ShortStore } from './storage.js?v=60';

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

  if (path === '/') path = window.location.pathname;
  if (!search) search = window.location.search;

  var params = new URLSearchParams(search);
  var kValue = null;
  var isShortRedirect = false;
  var shortSlug = null;
  var isSafelink = false;
  var safelinkSlug = null;
  var playerMode = null;
  var isLanding = false;
  var landingSlug = null;
  var isLandingRedirect = false;

  if (params.has('vid')) {
    isSafelink = true;
    safelinkSlug = params.get('vid');
  }

  if (!isSafelink && params.has('get')) {
    isLanding = true;
    landingSlug = params.get('get') || '';
  }

  if (!isSafelink && !isLanding && params.has('k')) {
    kValue = params.get('k');
    playerMode = 'v1';
  }

  if (!isSafelink && !isLanding && !kValue && params.has('v')) {
    kValue = params.get('v');
    playerMode = 'v2';
  }

  if (!isSafelink && !isLanding && !kValue && path && path !== '/') {
    var slug = extractSlugFromPath(path);
    if (slug && slug.length >= 5) {
      shortSlug = slug;
      isShortRedirect = true;

      try {
        var storedK = ShortStore.get(slug);
        if (storedK) {
          var testDecoded = decodeKValue(storedK);
          if (testDecoded && testDecoded.type === 'landing') {
            isLandingRedirect = true;
            landingSlug = slug;
            isShortRedirect = false;
          } else {
            kValue = storedK;
            playerMode = 'v1';
          }
        }
      } catch (e) { }

      if (!kValue && !isLandingRedirect) {
        try {
          var potentialK = slugToK(slug);
          if (potentialK) {
            var test = decodeKValue(potentialK);
            if (test.filename) {
              kValue = potentialK;
              playerMode = 'v1';
            }
          }
        } catch (e) { }
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
    isGenerator: !isSafelink && !kValue && !isShortRedirect && !isLanding && !isLandingRedirect,
    isPlayer: !!kValue && !isShortRedirect && !isSafelink && !isLanding && !isLandingRedirect,
    isShortRedirect: isShortRedirect,
    isLanding: isLanding,
    landingSlug: landingSlug,
    isLandingRedirect: isLandingRedirect
  };
}
