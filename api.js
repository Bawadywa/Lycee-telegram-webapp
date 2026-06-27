/* ============================================================================
   Lycee Web App — tiny API client (shared by all tabs)
   ----------------------------------------------------------------------------
   Exposes a global `Lycee` object. Loaded AFTER config.js and the Telegram
   web-app script, BEFORE each page's inline script.

   Why a wrapper:
   - one place to prefix API_BASE and send the ngrok-skip-browser-warning header
     (free ngrok otherwise returns an HTML interstitial that breaks .json()),
   - attaches the signed Telegram initData as an `Authorization: tma …` header
     on every request, so the backend can verify it and authenticate the user,
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

  // --- Telegram user id resolution ----------------------------------------
  // We try HARD to find the REAL Telegram id, from three independent sources,
  // because initDataUnsafe.user can be empty depending on client/launch method:
  //   1. tg.initDataUnsafe.user.id          (the normal path)
  //   2. tg.initData                        (raw "user=<json>&hash=…" string)
  //   3. location.hash #tgWebAppData=…      (raw launch fragment)
  // The real id (only ever from Telegram) is cached in localStorage so the
  // fragment-less views keep using it after in-app navigation.
  //
  // There is intentionally NO fake fallback id anymore. If we can't find a real
  // Telegram id and no explicit ?uid= test override is given, userId stays 0 and
  // we DO NOT create a user — so a junk id like 123456789 can never be created.
  var UID_KEY = 'lycee_uid';
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, v); } catch(e){} }

  // Pull "user=<json>" out of a urlencoded initData string and return its id.
  function idFromInitDataString(s) {
    if (!s) return 0;
    try {
      var raw = new URLSearchParams(s).get('user');
      if (!raw) return 0;
      var user = JSON.parse(raw);
      return (user && user.id) ? Number(user.id) : 0;
    } catch (e) { return 0; }
  }

  function telegramUserId() {
    // 1) structured
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u && u.id) return Number(u.id);
    // 2) raw initData string
    var fromInit = idFromInitDataString(tg && tg.initData);
    if (fromInit) return fromInit;
    // 3) raw launch fragment (#tgWebAppData=<urlencoded initData>)
    var hash = (location.hash || '').replace(/^#/, '');
    var tgData = new URLSearchParams(hash).get('tgWebAppData');
    var fromHash = idFromInitDataString(tgData);
    if (fromHash) return fromHash;
    return 0;
  }

  function resolveUserId() {
    var live = telegramUserId();
    if (live) { lsSet(UID_KEY, String(live)); return { id: live, src: 'telegram' }; }

    var fromQuery = Number(new URLSearchParams(location.search).get('uid'));
    if (fromQuery) return { id: fromQuery, src: 'uid-param' };   // explicit testing override

    var stored = Number(lsGet(UID_KEY));
    if (stored) return { id: stored, src: 'stored-telegram' };   // real id seen earlier this device

    var dev = Number(cfg.DEV_USER_ID) || 0;                      // only if YOU set a real id in config
    if (dev) return { id: dev, src: 'config-dev-id' };

    return { id: 0, src: 'none' };                               // no real id → will NOT create a user
  }
  var resolved = resolveUserId();
  var userId = resolved.id;
  var userSrc = resolved.src;
  var inTelegram = (userSrc === 'telegram' || userSrc === 'stored-telegram');
  try {
    if (userSrc === 'none') {
      console.error('[Lycee] No Telegram user id found — app was not opened from Telegram ' +
        'and no ?uid= / DEV_USER_ID is set. NOT creating a user.');
    } else {
      console.info('[Lycee] user_id =', userId, '(source: ' + userSrc + ')');
    }
  } catch (e) {}

  // --- raw signed initData (the actual auth credential) -------------------
  // Unlike the user id above (which comes from initDataUnsafe and is spoofable),
  // the RAW initData string is signed by Telegram with the bot token. We send it
  // on every request in an `Authorization: tma <initData>` header; the backend
  // verifies the hash and derives the user from it (it must NOT trust a client
  // user_id). Single-page app, so we just read it live from the SDK each load
  // (or the launch fragment as a fallback) — no cross-page persistence needed.
  function rawInitData() {
    if (tg && tg.initData) return tg.initData;                  // normal path
    var hash = (location.hash || '').replace(/^#/, '');
    return new URLSearchParams(hash).get('tgWebAppData') || ''; // launch fragment fallback
  }
  var initData = rawInitData();

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

  // --- transactions cache (shared across tabs) ----------------------------
  // Transactions only change when the user creates or deletes them, so we cache
  // the last known list per user. Every tab paints its count badge (and the
  // table its rows) from this cache INSTANTLY on load — no flash to 0 and back.
  // A background fetch then reconciles silently and only updates if it differs.
  var TX_KEY = 'lycee_tx_' + (userId || 'anon');
  function getCachedTx() {
    try { var v = JSON.parse(localStorage.getItem(TX_KEY)); return Array.isArray(v) ? v : null; }
    catch (e) { return null; }
  }
  function setCachedTx(list) {
    try { localStorage.setItem(TX_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch (e) {}
  }
  function cachedCount() { var c = getCachedTx(); return c ? c.length : null; }

  // Paint the nav count badge from cache the moment the DOM is ready (all tabs).
  function paintBadgeFromCache() {
    var el = document.getElementById('countBadge');
    var c = cachedCount();
    if (el && c != null) el.textContent = c;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintBadgeFromCache);
  else paintBadgeFromCache();

  // core fetch: adds base, JSON + ngrok headers, throws on non-2xx
  async function req(path, opts) {
    opts = opts || {};
    if (!base) throw new Error('API_BASE is not set — edit config.js');
    var headers = Object.assign({
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    }, opts.headers || {});
    // Authenticate every request with the signed Telegram initData. The backend
    // verifies the hash and derives the user from it — don't trust client user_id.
    if (initData && !headers['Authorization']) {
      headers['Authorization'] = 'tma ' + initData;
    }
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

  // Build a query string from the extra params only. The user is identified by
  // the signed initData auth header (see req()), never by a client-sent user_id.
  var qp = function (extra) {
    var s = new URLSearchParams(extra || {}).toString();
    return s ? '?' + s : '';
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
        return await req('/user', { method: 'POST' }); // user derived from initData header
      } catch (e) { console.error('[Lycee] ensureUser failed', e); return null; }
    })();
    return _userPromise;
  }

  /* -------- reference data (dropdowns) -------- */
  // Categories are scoped to a transaction type — the backend requires type_id and
  // returns only the categories that belong to it. Pass the selected type's id.
  function getCategories(typeId) { return req('/categories' + qp({ type_id: typeId })); }
  function getCounterparties() { return req('/counterparties' + qp()); } // user from initData header
  function getTransactionTypes() { return req('/types' + qp()); }        // user from initData header

  /* -------- transactions -------- */
  // Every successful fetch refreshes the shared cache so other tabs render instantly.
  async function getTransactions() {
    var list = await req('/transactions' + qp());
    setCachedTx(list || []);
    return list || [];
  }
  function generateRandom(count) { return req('/transactions/random' + qp({ count: count || 5 }), { method: 'POST' }); }
  function createTransaction(data) {
    return req('/transaction', { method: 'POST', body: JSON.stringify(data) });
  }
  // PUT /transaction expects the full record incl. { id } (TransactionUpdate schema)
  function updateTransaction(data) {
    return req('/transaction', { method: 'PUT', body: JSON.stringify(data) });
  }
  // DELETE /transaction expects a JSON body { id } (TransactionDelete schema)
  function deleteTransaction(id) {
    return req('/transaction', { method: 'DELETE', body: JSON.stringify({ id: Number(id) }) });
  }
  // DELETE /transactions clears all transactions for the authenticated user
  function clearTransactions() { return req('/transactions' + qp(), { method: 'DELETE' }); }

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
    initData: initData,
    inTelegram: inTelegram,
    configured: !!base,
    ready: ready,
    req: req,
    ensureUser: ensureUser,
    getCategories: getCategories,
    getCounterparties: getCounterparties,
    getTransactionTypes: getTransactionTypes,
    getTransactions: getTransactions,
    cachedTransactions: getCachedTx,   // last known list (or null) — for instant render
    cachedCount: cachedCount,          // last known count (or null)
    setCachedTransactions: setCachedTx,// keep cache in sync after create/delete
    generateRandom: generateRandom,
    createTransaction: createTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    clearTransactions: clearTransactions,
    pickName: pickName
  };
})();
