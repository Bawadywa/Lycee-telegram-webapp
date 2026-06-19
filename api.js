/* ============================================================================
   Lycee Web App — tiny API client (shared by all tabs)
   ----------------------------------------------------------------------------
   Exposes a global `Lycee` object. Loaded AFTER config.js and the Telegram
   web-app script, BEFORE each page's inline script.

   Why a wrapper:
   - one place to prefix API_BASE and send the ngrok-skip-browser-warning header
     (free ngrok otherwise returns an HTML interstitial that breaks .json()),
   - resolves the Telegram user id (with a browser/dev fallback),
   - keeps the 3 HTML pages small and consistent.
   ============================================================================ */
(function () {
  var cfg = window.LYCEE_CONFIG || {};
  var tg = (window.Telegram && window.Telegram.WebApp) || null;

  var base = String(cfg.API_BASE || '').replace(/\/+$/, '');

  // user id: Telegram first, then ?uid= override, then dev fallback
  function resolveUserId() {
    var fromTg = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
    if (fromTg) return Number(fromTg);
    var fromQuery = Number(new URLSearchParams(location.search).get('uid'));
    if (fromQuery) return fromQuery;
    return Number(cfg.DEV_USER_ID) || 0;
  }
  var userId = resolveUserId();

  // core fetch: adds base, JSON + ngrok headers, throws on non-2xx
  async function req(path, opts) {
    opts = opts || {};
    if (!base) throw new Error('API_BASE is not set — edit config.js');
    var headers = Object.assign({
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    }, opts.headers || {});
    if (opts.body != null && typeof opts.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }
    var res = await fetch(base + path, Object.assign({}, opts, { headers: headers }));
    if (!res.ok) {
      var detail = '';
      try { detail = ' — ' + (await res.text()).slice(0, 200); } catch (e) {}
      throw new Error('HTTP ' + res.status + detail);
    }
    var text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  var qp = function (extra) {
    var p = new URLSearchParams(Object.assign({ user_id: userId }, extra || {}));
    return '?' + p.toString();
  };

  /* -------- user -------- */
  // POST /user on every open; guarded so it runs once per session per user.
  async function ensureUser() {
    if (!userId) return null;
    var flag = 'lycee_user_' + userId;
    if (sessionStorage.getItem(flag)) return null;
    var out = await req('/user', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    sessionStorage.setItem(flag, '1');
    return out;
  }

  /* -------- reference data (dropdowns) -------- */
  function getCategories() { return req('/categories' + qp()); }
  function getCounterparties() { return req('/counterparties' + qp()); } // backend requires user_id
  function getTransactionTypes() { return req('/transaction_types' + qp()); }

  /* -------- transactions -------- */
  function getTransactions() { return req('/transactions' + qp()); }
  function generateRandom(count) { return req('/transactions/random' + qp({ count: count || 5 }), { method: 'POST' }); }
  function createTransaction(data) {
    var body = Object.assign({ user_id: userId }, data);
    return req('/transaction', { method: 'POST', body: JSON.stringify(body) });
  }
  function deleteTransaction(id) { return req('/transaction/' + encodeURIComponent(id) + qp(), { method: 'DELETE' }); }
  function clearTransactions() { return req('/transactions' + qp(), { method: 'DELETE' }); }

  /* -------- google sheet -------- */
  function getSheetUrl() { return req('/google_sheet' + qp()); }
  function createSheet() { return req('/google_sheet' + qp(), { method: 'POST' }); }

  /* -------- helpers -------- */
  // localized label for {name_en, name_uk} reference objects
  function pickName(obj, lang) {
    if (!obj) return '';
    return (lang === 'uk' ? (obj.name_uk || obj.name_en) : (obj.name_en || obj.name_uk)) || '';
  }

  window.Lycee = {
    base: base,
    userId: userId,
    configured: !!base,
    req: req,
    ensureUser: ensureUser,
    getCategories: getCategories,
    getCounterparties: getCounterparties,
    getTransactionTypes: getTransactionTypes,
    getTransactions: getTransactions,
    generateRandom: generateRandom,
    createTransaction: createTransaction,
    deleteTransaction: deleteTransaction,
    clearTransactions: clearTransactions,
    getSheetUrl: getSheetUrl,
    createSheet: createSheet,
    pickName: pickName
  };
})();
