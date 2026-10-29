import { JsonBinAdapter } from './jsonbin-adapter.js?v=59';
import { RestApiAdapter } from './rest-adapter.js?v=59';

var _adapter = null;
var _config = null;
var _ready = false;

var CONFIG_FILE = '/db-config.json';
var STORAGE_KEY = 'vgen_db_config';

function loadLocalConfig() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {   }
  return null;
}

function saveLocalConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {   }
}

function createAdapter(config) {
  switch (config.type) {
    case 'cpanel':
    case 'restapi':
      return new RestApiAdapter(config);
    case 'jsonbin':
      return new JsonBinAdapter(config);
    default:

      if (config.apiUrl) return new RestApiAdapter(config);
      return new JsonBinAdapter(config);
  }
}

export async function initDb() {
  if (_ready) return;

  try {
    if (typeof window !== 'undefined' && window.__VF_DB_CONFIG__ && window.__VF_DB_CONFIG__.type) {
      _config = window.__VF_DB_CONFIG__;
      _adapter = createAdapter(_config);
      _ready = true;
      saveLocalConfig(_config);
      console.log('[DB] Config loaded from Worker injection -> ' + _config.type + ' (' + (_config.domains ? _config.domains.length : 0) + ' domains)');
      return;
    }
  } catch (e) {   }

  try {
    var res = await fetch(CONFIG_FILE + '?v=11');
    if (res.ok) {
      var config = await res.json();
      if (config && config.type) {
        _config = config;
        _adapter = createAdapter(config);
        _ready = true;
        saveLocalConfig(config);
        console.log('[DB] Config loaded from ' + CONFIG_FILE + ' -> ' + config.type);
        return;
      }
    }
  } catch (e) {   }

  var localConfig = loadLocalConfig();
  if (localConfig && localConfig.type) {
    _config = localConfig;
    _adapter = createAdapter(localConfig);
    _ready = true;
    console.log('[DB] Config loaded from localStorage -> ' + localConfig.type);
    return;
  }

  console.log('[DB] No database configured. Shortlink hanya berlaku di browser ini.');
}

export function getDb() {
  return _adapter;
}

export function isDbReady() {
  return _ready && !!_adapter;
}

export function getDbConfig() {
  return _config;
}

export function getDbName() {
  if (!_adapter) return 'None';
  return _adapter.name || _config.type || 'Unknown';
}

export function getDomains() {
  if (_config && Array.isArray(_config.domains) && _config.domains.length > 0) {
    return _config.domains;
  }
  return [];
}
