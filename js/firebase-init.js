// ============================================================
//  firebase-init.js — Inicialización auto-detectada de Firebase
//  CreaTica 3D · Dashboard OPM
//
//  En Firebase Hosting (y `firebase serve` en local), la URL reservada
//  /__/firebase/init.json provee la configuración automáticamente, sin
//  necesidad de ningún archivo de credenciales.
//
//  En localhost plano (python -m http.server), hace fallback al archivo
//  js/firebase-config.js (gitignored, con credenciales reales).
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

let db, auth;

try {
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error('init.json no disponible');
  const cfg = await res.json();
  const app = initializeApp(cfg);
  db   = getFirestore(app);
  auth = getAuth(app);
} catch {
  // Fallback: archivo local de credenciales (solo para desarrollo con python http.server)
  ({ db, auth } = await import('./firebase-config.js'));
}

export { db, auth };
