// ============================================================
//  auth.js — Lógica de autenticación con Google
//  CreaTica 3D · Dashboard OPM
// ============================================================

import { auth } from './firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

/**
 * Redirige al usuario a la página de Google Sign-In.
 * No usa popup — evita bloqueos de CSP y problemas en móvil.
 * Al volver, Firebase procesa el resultado vía onAuthStateChanged.
 */
export async function signInWithGoogle() {
  await signInWithRedirect(auth, provider);
}

/**
 * Procesa el resultado del redirect al volver de Google.
 * Debe llamarse al inicio de la app (antes de mostrar cualquier pantalla).
 * Si no venimos de un redirect, retorna null silenciosamente.
 */
export async function checkRedirectResult() {
  try {
    return await getRedirectResult(auth);
  } catch (error) {
    console.error('[auth] Error en redirect de Google:', error.code);
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
