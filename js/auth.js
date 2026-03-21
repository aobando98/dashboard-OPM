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
 * Si el usuario cierra el popup sin autenticarse, la función
 * retorna silenciosamente (no lanza error).
 */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    // El usuario cerró el popup — no es un error real
    if (error.code === 'auth/popup-closed-by-user') return;
    console.error('[auth] Error al iniciar sesión:', error);
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
