// ============================================================
//  firebase-config.js — Configuración e inicialización de Firebase
//  CreaTica 3D · Dashboard OPM
// ============================================================
//
//  INSTRUCCIONES:
//  1. Ve a https://console.firebase.google.com
//  2. Abre tu proyecto → Configuración del proyecto (ícono de engranaje)
//  3. En la sección "Tus apps", selecciona tu app web
//  4. Copia el objeto "firebaseConfig" y pégalo aquí reemplazando los valores
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ⚠️  REEMPLAZA ESTOS VALORES CON LOS DE TU PROYECTO FIREBASE
const firebaseConfig = {
  apiKey:            "PEGA_TU_API_KEY_AQUI",
  authDomain:        "PEGA_TU_AUTH_DOMAIN_AQUI",
  projectId:         "PEGA_TU_PROJECT_ID_AQUI",
  storageBucket:     "PEGA_TU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "PEGA_TU_MESSAGING_SENDER_ID_AQUI",
  appId:             "PEGA_TU_APP_ID_AQUI",
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
