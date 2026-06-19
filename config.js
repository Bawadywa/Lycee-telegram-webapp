/* ============================================================================
   Lycee Web App — runtime config
   ----------------------------------------------------------------------------
   Edit THIS file only. It's the single place the front-end reads the backend
   location from, so when ngrok hands you a new URL you change it here once
   (not in every HTML page).

   API_BASE     Origin of your FastAPI backend, NO trailing slash.
                Local + ngrok example:  'https://abcd-12-34-56.ngrok-free.app'
                Plain local testing:    'http://localhost:8000'
                Leave '' to show a "configure me" hint instead of failing.

   DEV_USER_ID  Keep this 0. Inside Telegram the REAL user id is used automatically.
                Set it to YOUR OWN real Telegram id ONLY for plain-browser testing
                (never a made-up number like 123456789 — that just pollutes the DB).
                For one-off browser tests prefer the ?uid=<your id> query param.
   ============================================================================ */
window.LYCEE_CONFIG = {
  API_BASE: 'https://dominion-strenuous-wrongful.ngrok-free.dev',
  DEV_USER_ID: 0,
  // Flip to true to show the on-screen "🐞 logs" button + console panel (handy on
  // mobile where there's no devtools). Can also be enabled per-open with ?debug=1.
  DEBUG: false
};
