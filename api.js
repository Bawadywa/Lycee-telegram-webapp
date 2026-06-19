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

  // Initialise the Telegram WebApp as early as possible so initDataUnsafe.user
  // is populated before we read it.
  if (tg && typeof tg.ready === 'function') { try { tg.ready(); } catch (e) {} }

  var base = String(cfg.API_BASE || '').replace(/\/+$/, '');

  // --- user id resolution -------------------------------------------------
  // Telegram's signed launch data lives in the URL fragment (#tgWebAppData=…)
  // and is ONLY present on the page Telegram opened (index.html). As soon as the
  // user navigates to table.html / sheet.html the fragment is gone, so the real
  // user would be lost and we'd fall back to the dev id (e.g. 123456789). To
  // avoid that we persist the real Telegram id the first time we see it and
  // reuse it on the fragment-less pages.
  var UID_KEY = 'lycee_uid';
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, v); } catch(e){} }

  function resolveUserId() {
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u && u.id) {                                            // real Telegram user (launch page)
      lsSet(UID_KEY, String(u.id));
      return { id: Number(u.id), src: 'telegram' };
    }
    var fromQuery = Number(new URLSearchParams(location.search).get('uid'));
    if (fromQuery) return { id: fromQuery, src: 'uid-param' };  // explicit testing override
    var stored = Number(lsGet(UID_KEY));
    if (stored) return { id: stored, src: 'stored-telegram' };  // reused after in-app navigation
    return { id: Number(cfg.DEV_USER_ID) || 0, src: 'dev-fallback' }; // plain browser, no Telegram
  }
  var resolved = resolveUserId();
  var userId = resolved.id;
  var userSrc = resolved.src;
  var inTelegram = (userSrc === 'telegram' || userSrc === 'stored-telegram');
  try { console.info('[Lycee] user_id =', userId, '(source: ' + userSrc + ')'); } catch (e) {}

  // Carry the Telegram launch fragment across in-app navigation so initData stays
  // available on every tab (defence-in-depth alongside the persisted id above).
  function preserveHashOnLinks() {
    if (!location.hash) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href && /\.html($|\?)/.test(href) && href.indexOf('#') === -1) {
        links[i].setAttribute('href', href + location.hash);
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preserveHashOnLinks);
  else preserveHashOnLinks();

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

  /* -------- user --------
     The "create user" POST is fired immediately when the app opens (see the
     auto-call near the bottom). It's memoised, so each page's init can call
     ensureUser() / await Lycee.ready again without sending a second request. */
  var _userPromise = null;
  function ensureUser() {
    if (_userPromise) return _userPromise;
    _userPromise = (async function () {
      if (!userId) return null;
      if (!base) return null; // API_BASE not set yet — nothing to call
      try {
        return await req('/user', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
      } catch (e) { console.error('[Lycee] ensureUser failed', e); return null; }
    })();
    return _userPromise;
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

  // Immediately create the user the moment the web app opens.
  var ready = ensureUser();

  window.Lycee = {
    base: base,
    userId: userId,
    inTelegram: inTelegram,
    configured: !!base,
    ready: ready,
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
