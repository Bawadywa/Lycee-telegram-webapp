# Lycee-telegram-webapp

Telegram Web App front-end for the Lycee finance bot — three static tabs:

- **`index.html`** — *New*: create a transaction, or generate random ones (server-side).
- **`table.html`** — *Transactions*: lists transactions fetched from the backend.
- **`sheet.html`** — *Google Sheet*: embeds the published Google Sheet whose URL comes from the backend.

These are plain static files (hosted on GitHub Pages). All data comes from the FastAPI
backend (the **Lycee Bot** repo).

## Setup

1. **Point the app at your backend** — edit **`config.js`**:
   ```js
   window.LYCEE_CONFIG = {
     API_BASE: 'https://abcd-12-34.ngrok-free.app', // your backend origin, no trailing slash
     DEV_USER_ID: 123456789                          // fallback id for plain-browser testing
   };
   ```
   This is the only place the URL lives. With free ngrok the URL changes on each restart —
   update it here and re-push.

2. **Run the backend and expose it** (in the Lycee Bot repo):
   ```bash
   uvicorn app.main:app --port 8000
   ngrok http 8000
   ```
   Paste the `https://…ngrok-free.app` URL into `config.js` as `API_BASE`.

3. **Open the app** via the bot's web-app button (or in a browser with `?uid=<id>` for testing).

## How it talks to the backend

A tiny shared client (`api.js`, exposed as `window.Lycee`) handles every request:

- prefixes `API_BASE`,
- sends **`ngrok-skip-browser-warning: true`** so free ngrok returns JSON instead of its
  interstitial HTML page,
- resolves the user id from `Telegram.WebApp.initDataUnsafe.user.id` (falling back to
  `?uid=` then `DEV_USER_ID`),
- **on open, `POST /user`** to create the user (idempotent; once per session).

Endpoints used (no `/api` prefix — matches the FastAPI routes):

| Tab | Calls |
|---|---|
| New | `POST /user` · `GET /categories?user_id=` · `GET /counterparties` · `GET /transaction_types` · `POST /transaction` · `POST /transactions/random?user_id=&count=` |
| Transactions | `GET /transactions?user_id=` · `DELETE /transaction/{id}?user_id=` · `DELETE /transactions?user_id=` |
| Google Sheet | `GET /google_sheet?user_id=` · `POST /google_sheet?user_id=` |

> **Backend requirements:** CORS must allow the page origin (or `*`) and the
> `ngrok-skip-browser-warning` request header (`allow_headers=["*"]`), and the routes above
> must exist. Reference data (categories / counterparties / transaction types) must be seeded
> for the dropdowns and random generator to work.
