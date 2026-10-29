import { getRoute } from './router.js?v=60';
import { renderGenerator } from './generator.js?v=60';
import { renderPlayer } from './player.js?v=60';
import { renderPlayerV2 } from './player-v2.js?v=60';
import { renderFeed } from './feed.js?v=60';
import { renderSafelink } from './safelink.js?v=60';
import { renderLandingPage } from './landing-page.js?v=60';
import { generateRandomFilename } from './utils.js?v=60';
import { initDb } from './db/index.js?v=60';

(async function() {
  var app = document.getElementById('app');
  if (!app) return;

  var pageMode = document.documentElement.getAttribute('data-mode') || 'main';

  if (pageMode === 'generator') {
    await initDb();
    renderGenerator(app);
    return;
  }

  var dbPromise = initDb();
  var storedRedirect = sessionStorage.getItem('spa_redirect');
  var originalPathAndQuery = storedRedirect || '';
  var route = getRoute();

  if (route.isLandingRedirect) {
    var getSearch = '?get=' + encodeURIComponent(route.landingSlug);
    console.log('[App] Landing redirect → /?get=' + route.landingSlug);
    window.location.href = '/' + getSearch;
    return;
  }

  if (route.isLanding) {
    renderLandingPage(app, route.landingSlug);
    dbPromise.catch(function() {});
    return;
  }

  var safelinkSlug = route.safelinkSlug || route.shortSlug;
  if (safelinkSlug && (route.isSafelink || route.isShortRedirect)) {

    try {
      var vidParam = 'vid=' + encodeURIComponent(safelinkSlug);
      if (window.location.search !== '?' + vidParam) {
        history.replaceState(null, '', '/?' + vidParam);
      }
    } catch (e) { }

    renderSafelink(app, safelinkSlug);
    dbPromise.catch(function() {});
    return;
  }

  var isTrending = route.params && route.params.has('trending');

  if (route.isPlayer) {
    if (route.playerMode === 'v2') {
      renderPlayerV2(app, route);
      pushPlayerUrlV2(route.kValue, originalPathAndQuery);
    } else {
      renderPlayer(app, route);
      pushPlayerUrl(route.kValue, originalPathAndQuery);
    }
    dbPromise.catch(function() {});
    return;
  }

  await dbPromise;
  renderFeed(app, isTrending ? 'trending' : 'feed');

})();

function pushPlayerUrl(kValue, originalUrl) {
  try {
    if (originalUrl && originalUrl.includes('?k=')) {
      history.replaceState(null, '', originalUrl);
    } else if (kValue) {
      var fakeName = generateRandomFilename();
      history.replaceState(null, '', '/' + fakeName + '?k=' + kValue);
    }
  } catch (e) {}
}

function pushPlayerUrlV2(kValue, originalUrl) {
  try {
    if (originalUrl && originalUrl.includes('?v=')) {
      history.replaceState(null, '', originalUrl);
    } else if (kValue) {
      var fakeName = generateRandomFilename();
      history.replaceState(null, '', '/' + fakeName + '?v=' + kValue);
    }
  } catch (e) {}
}
