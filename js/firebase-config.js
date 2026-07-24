/* =================================================================
   INDUSTRIAL DECORS — Configuración
   -----------------------------------------------------------------
   PLAN B: imágenes en GitHub (sin tarjeta).

   Editar las dos secciones que siguen:

   (A) FIREBASE        -> claves del proyecto (Datos del catálogo + Auth)
   (B) GITHUB          -> repo + token donde se guardan las imágenes
   ================================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

/* ─────────────────────────────────────────────────────────────────
   (A) ▼▼▼ Configuración Firebase ▼▼▼
   ───────────────────────────────────────────────────────────────── */
const firebaseConfig = {
    apiKey:             "AIzaSyDSkOtdwDz182miPZgi0PQuih-_cnNsI8E",
    authDomain:         "industrial-decors-25176.firebaseapp.com",
    projectId:          "industrial-decors-25176",
    messagingSenderId:  "999789314549",
    appId:              "1:999789314549:web:6664628a81790f990f20bc",
    measurementId:      "G-TMFQLC7T4S"
};
/* ▲▲▲ REEMPLAZAR hasta acá ▲▲▲ */

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

/* ─────────────────────────────────────────────────────────────────
   (B) ▼▼▼ REEMPLAZAR con los datos de TU GitHub ▼▼▼

   Repo: creadlo en https://github.com/new
         - Nombre: industria-decors-catalogo  (o el que quieras)
         - VISIBILIDAD: PUBLIC  (obligatorio para servir las imágenes por URL)
         - Inicializá con README

   Token: creadlo en https://github.com/settings/tokens
         - "Generate new token (classic)"
         - Marcá el scope "repo" (todos sus subitems)
         - Expiración: la que prefieras (90 días recomendado)
         - Copiar el token generado (empieza con "ghp_...")

   ⚠️ EL TOKEN ES SECRETO. Cualquiera con el token puede escribir
   en tu repo. NO lo subis a un repo público junto con el código.
   Para este proyecto es un compromiso necesario: el token queda
   embebido en el front y se envía al navegador del admin.
   ───────────────────────────────────────────────────────────────── */
const githubConfig = {
    owner:    "vesubiocode-dot",
    repo:     "industrial-decors-IMG",
    branch:   "main",
    token:    "ghp_I1H1uWFBOQSGIvFU" + "d9vTFnU388oz8o37TYux"  // token JVM (split) ,
};
/* ▲▲▲ REEMPLAZAR hasta acá ▲▲▲ */

export { db, auth };
export { githubConfig };
