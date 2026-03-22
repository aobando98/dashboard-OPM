# CLAUDE.md — Dashboard OPM · CreaTica 3D

This file provides guidance to Claude Code when working in this repository.

## Project Overview

Single-Page Application for managing **Purchases, Operations and Inventory** of CreaTica 3D, a 3D printing business. No build step — runs directly in the browser via ES Modules and CDN libraries.

## Stack

- **Frontend**: HTML5 + Tailwind CSS (Play CDN) + Vanilla JS (ES Modules, no bundler)
- **Database**: Firebase Firestore (web modular v10)
- **Auth**: Firebase Authentication — Google Sign-In via `signInWithPopup`
- **Charts**: Chart.js 4 (CDN global `Chart`)
- **Hosting**: Firebase Hosting (primary) — `firebase deploy` deploys hosting + Firestore rules together

## File Structure

```
dashboard-OPM/
├── index.html                  # Entire SPA: loading screen, login, dashboard, modals
├── firebase.json               # Firebase Hosting config + Firestore rules deploy
├── firestore.rules             # Firestore security rules (field-level validation)
└── js/
    ├── firebase-init.js        # Auto-detects environment, exports db + auth
    ├── firebase-config.js      # Local credentials (gitignored — never committed)
    ├── firebase-config.example.js  # Public template for firebase-config.js
    ├── auth.js                 # signInWithGoogle(), logOut()
    └── app.js                  # All app logic: auth listener, CRUD, KPIs, charts, CSV
```

## Firebase Initialization — firebase-init.js

`firebase-init.js` is the single entry point for Firebase. It auto-detects the environment:

- **Firebase Hosting / `firebase serve`**: fetches `/__/firebase/init.json` (reserved URL auto-served by Firebase with project credentials — no file needed)
- **Local `python -m http.server`**: falls back to `firebase-config.js` (gitignored local file)

`app.js` and `auth.js` both import `{ db, auth }` from `./firebase-init.js` — never directly from `firebase-config.js`.

## Running Locally

ES Modules require an HTTP server — `file://` will not work.

```bash
# Option A: Firebase CLI (recommended — uses /__/firebase/init.json automatically)
firebase serve

# Option B: Python (requires js/firebase-config.js with real credentials)
python -m http.server 8080   # then open http://localhost:8080
```

## Deployment

```bash
npm install -g firebase-tools   # once
firebase login                  # once
firebase init                   # once — select Hosting + Firestore, public dir: .
firebase deploy                 # deploys hosting + Firestore rules together
```

App is available at `https://creaticaopm.web.app`.

**Important**: `js/firebase-config.js` is gitignored but is deployed by `firebase deploy` (Firebase CLI reads from filesystem, not git). The file must exist locally before deploying with python http.server fallback.

## Architecture

**Auth flow**: `onAuthStateChanged` in `app.js` drives screen visibility.
- Loading → checks session → shows `#screen-login` or `#screen-dashboard`
- On login: user photo/name set via `textContent`, `subscribeInventario()` starts
- On logout: Firestore `unsubscribeSnapshot()` called before `signOut()`
- Uses `signInWithPopup` (not redirect) — popup doesn't require complex CSP frame-src for result handling

**Data layer**: Single Firestore collection `inventario`. All documents include a `uid` field matching `auth.currentUser.uid`. Query always filters `where('uid', '==', currentUser.uid)` — users never see each other's data.

**Real-time sync**: `onSnapshot` subscription updates state array `inventarioItems` and re-renders the entire UI on every Firestore change. No manual refresh needed.

**Reactive render pipeline**: every Firestore update calls `updateUI()` → `renderKPIs()` + `renderChartGasto()` + `renderChartInventario()` + `renderTable()` + `renderComparacion()`.

**Charts**: Chart.js instances are stored in `chartGasto` and `chartInventario`. Both are destroyed and recreated on each data update to avoid stale data. Chart.js is loaded as a CDN global — import is NOT needed.

**Table rendering**: Built entirely with DOM API (`createElement`, `textContent`) — no `innerHTML` with user data to prevent XSS. Event delegation on `<tbody>` handles edit/delete button clicks via `data-action` and `data-id` attributes.

**Tab navigation**: Two tabs in the dashboard — "Dashboard" (KPIs + charts + table) and "Comparar Proveedores". `switchTab(name)` in `app.js` toggles visibility and styles. Active tab state stored in `activeTab` variable.

**Supplier comparison** (`renderComparacion()`): Groups `inventarioItems` by `nombre.toLowerCase()`. Shows comparison cards only for groups with 2+ distinct suppliers, ranked by `costoUnitario` ascending. Cheapest supplier highlighted green; savings potential shown in card header. BADGE map is module-level (shared by `renderTable` and `renderComparacion`).

**CSV export**: Includes UTF-8 BOM (`\uFEFF`) so Excel opens the file with correct encoding. All cell values are double-quote escaped.

## Security — Three-Layer Input Hardening

### Layer 1 — HTML (`index.html`)
- `maxlength="100"` on text inputs (`field-nombre`, `field-proveedor`)
- `max="999999"` on numeric inputs (`field-cantidad`, `field-costo`, `field-minimo`)
- Per-field `<p id="err-field-*">` error elements wired to `showFieldErrors()`
- Content Security Policy meta tag (see CSP section below)

### Layer 2 — JavaScript (`app.js`)
- `sanitizeStr(val)` — trims, coerces to string, caps at 100 chars
- `sanitizeInt(val)` / `sanitizeFloat(val)` — clamps to 0–999999, returns -1 on invalid
- `CATEGORIAS_VALIDAS` — `Set` of allowed category strings
- `readForm()` — reads all fields through sanitizers
- `validateForm(data)` — returns `{ valid, errors }` with per-field messages
- `showFieldErrors(errors)` / `clearFieldErrors()` — inline UX feedback
- All DOM rendering uses `createElement`/`textContent` — zero `innerHTML` with variable data

### Layer 3 — Firestore Rules (`firestore.rules`)
- `camposValidos()` function: enforces field types, string length ≤100, numbers 0–999999, category whitelist
- Applied on every `create` and `update` — server-side, cannot be bypassed by clients

## Content Security Policy

The CSP meta tag in `index.html` allows these origins (required for Firebase + Tailwind CDN):

| Directive | Allowed origins |
|---|---|
| `script-src` | `'self'` `'unsafe-eval'` `sha256-...` (Tailwind inline) `cdn.tailwindcss.com` `cdn.jsdelivr.net` `www.gstatic.com` `apis.google.com` |
| `style-src` | `'self'` `'unsafe-inline'` |
| `connect-src` | `'self'` `*.googleapis.com` `*.google.com` `*.firebaseio.com` `wss://*.firebaseio.com` `*.cloudfunctions.net` `cdn.jsdelivr.net` `www.gstatic.com` |
| `img-src` | `'self'` `*.googleusercontent.com` `data:` `blob:` |
| `frame-src` | `accounts.google.com` `creaticaopm.firebaseapp.com` |
| `font-src` | `'self'` |
| `object-src` | `'none'` |

**Notes**:
- `unsafe-eval` is required by Tailwind Play CDN at runtime
- `unsafe-inline` in `style-src` is required by Tailwind's style injection
- `sha256-...` in `script-src` allows only the exact Tailwind config inline script — any other injected inline script is blocked
- `apis.google.com` is required by Firebase Auth's `signInWithPopup` GAPI loader
- `creaticaopm.firebaseapp.com` in `frame-src` is required by Firebase Auth for the popup result iframe
- If the hash needs updating (Tailwind config script changed), the browser console shows the new hash in the CSP error message

## Firestore Data Model

Collection: `inventario`

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Owner's Firebase Auth UID — used for all security rules |
| `nombre` | string | Item name, max 100 chars |
| `categoria` | string | Must be one of 5 valid values (whitelist enforced in JS + Firestore rules) |
| `cantidad` | number | Current stock, 0–999999 |
| `costoUnitario` | number | Unit cost in USD, 0–999999 |
| `proveedor` | string | Supplier name, max 100 chars |
| `nivelMinimo` | number | Alert threshold, 0–999999 |
| `createdAt` | timestamp | Set on create via `serverTimestamp()` |
| `updatedAt` | timestamp | Set on every write via `serverTimestamp()` |

Valid categories: `Filamento PLA`, `Filamento PETG`, `Resina`, `Repuestos`, `Equipos`

## Credentials Setup

`js/firebase-config.js` is in `.gitignore` — never committed to git.

```bash
cp js/firebase-config.example.js js/firebase-config.js
# fill in real values from Firebase Console → ⚙️ Settings → General → Web app
```

## Key Constants to Customize

- `PRESUPUESTO` in `app.js` — monthly budget reference for the KPI card (default: `50_000` USD)
- `PALETA` in `app.js` — doughnut chart color array
- Categories — `<option>` tags in `index.html` (modal + filter select), `BADGE` map in `app.js`, `CATEGORIAS_VALIDAS` Set in `app.js`, and `camposValidos()` list in `firestore.rules` — must be updated in all four places

## Branches

- `main` — stable, production-ready
- `dev` — active development; merge into `main` after testing
