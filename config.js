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

   DEV_USER_ID  Fallback Telegram user id used only when the app is opened
                OUTSIDE Telegram (plain browser / ngrok testing), where
                Telegram.WebApp.initDataUnsafe.user.id is not available.
                You can also override per-open with a ?uid=123 query param.
   ============================================================================ */
window.LYCEE_CONFIG = {
  API_BASE: '',
  DEV_USER_ID: 123456789
};
