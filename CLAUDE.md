# CLAUDE.md — Dashboard OPM · CreaTica 3D

This file provides guidance to Claude Code when working in this repository.

## Project Overview

Single-Page Application for managing **Purchases, Operations and Inventory** of CreaTica 3D, a 3D printing business. No build step — runs directly in the browser via ES Modules and CDN libraries.

## Stack

- **Frontend**: HTML5 + Tailwind CSS (Play CDN) + Vanilla JS (ES Modules, no bundler)
- **Database**: Firebase Firestore (web modular v10)
- **Auth**: Firebase Authentication — Google Sign-In only
- **Charts**: Chart.js 4 (CDN global `Chart`)
- **Hosting**: Vercel / Netlify / GitHub Pages (static)

## File Structure

```
dashboard-OPM/
├── index.html              # Entire SPA: loading screen, login, dashboard, modals
├── firestore.rules         # Firestore security rules
└── js/
    ├── firebase-config.js  # Firebase init — exports db, auth
    ├── auth.js             # signInWithGoogle(), logOut()
    └── app.js              # All app logic: auth listener, CRUD, KPIs, charts, CSV
```

## Running Locally

ES Modules require an HTTP server — `file://` will not work.

```bash
python -m http.server 8080   # then open http://localhost:8080
# or
npx serve .
```

## Architecture

**Auth flow**: `onAuthStateChanged` in `app.js` drives screen visibility.
- Loading → checks session → shows `#screen-login` or `#screen-dashboard`
- On login: user photo/name set via `textContent`, `subscribeInventario()` starts
- On logout: Firestore `unsubscribeSnapshot()` called before `signOut()`

**Data layer**: Single Firestore collection `inventario`. All documents include a `uid` field matching `auth.currentUser.uid`. Query always filters `where('uid', '==', currentUser.uid)` — users never see each other's data.

**Real-time sync**: `onSnapshot` subscription updates state array `inventarioItems` and re-renders the entire UI on every Firestore change. No manual refresh needed.

**Reactive render pipeline**: every Firestore update calls `updateUI()` → `renderKPIs()` + `renderChartGasto()` + `renderChartInventario()` + `renderTable()`.

**Charts**: Chart.js instances are stored in `chartGasto` and `chartInventario`. Both are destroyed and recreated on each data update to avoid stale data. Chart.js is loaded as a CDN global — import is NOT needed.

**Table rendering**: Built entirely with DOM API (`createElement`, `textContent`) — no `innerHTML` with user data to prevent XSS. Event delegation on `<tbody>` handles edit/delete button clicks via `data-action` and `data-id` attributes.

**CSV export**: Includes UTF-8 BOM (`\uFEFF`) so Excel opens the file with correct encoding. All cell values are double-quote escaped.

## Firestore Data Model

Collection: `inventario`

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Owner's Firebase Auth UID — used for all security rules |
| `nombre` | string | Item name |
| `categoria` | string | `Filamento PLA`, `Filamento PETG`, `Resina`, `Repuestos`, `Equipos` |
| `cantidad` | number | Current stock |
| `costoUnitario` | number | Unit cost in MXN |
| `proveedor` | string | Supplier name |
| `nivelMinimo` | number | Alert threshold |
| `createdAt` | timestamp | Set on create via `serverTimestamp()` |
| `updatedAt` | timestamp | Set on every write via `serverTimestamp()` |

## Security Rules

`firestore.rules` enforces:
- `read` — `resource.data.uid == request.auth.uid`
- `create` — `request.resource.data.uid == request.auth.uid`
- `update` — existing `uid` matches AND new `uid` cannot be changed
- `delete` — `resource.data.uid == request.auth.uid`
- All other collections: `allow read, write: if false`

## Credentials Setup

`js/firebase-config.js` is in `.gitignore` — it is never committed to git.

To set up locally:
```bash
cp js/firebase-config.example.js js/firebase-config.js
# then fill in the real values from Firebase Console
```

`firebase-config.example.js` is the public template (committed). `firebase-config.js` is the private local file (ignored).

## Key Constants to Customize

- `PRESUPUESTO` in `app.js` — monthly budget reference for the KPI card (default: `50_000` MXN)
- `PALETA` in `app.js` — doughnut chart color array
- Categories — `<option>` tags in `index.html` (modal + filter select) and `BADGE` map in `app.js`

## Branches

- `main` — stable, production-ready
- `dev` — active development; open PRs into `main`

## Deployment

```bash
vercel --prod     # Vercel (recommended)
# or drag folder to app.netlify.com/drop
# or enable GitHub Pages from repo Settings → Pages → main / root
```
