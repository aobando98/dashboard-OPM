// ============================================================
//  auth.js — Lógica de autenticación con Google
//  CreaTica 3D · Dashboard OPM
// ============================================================

import { auth } from './firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

/**
 * Abre el popup de Google Sign-In.
 * Requiere que el CSP permita apis.google.com (script-src) y
 * creaticaopm.firebaseapp.com (frame-src) — ambos ya configurados.
 */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request') return;
    console.error('[auth] Error al iniciar sesión:', error.code);
    throw error;
  }
}

/**
 * Cierra la sesión del usuario actual.
 */
export async function logOut() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('[auth] Error al cerrar sesión:', error);
    throw error;
  }
}
