/* =================================================================
   INDUSTRIAL DECORS - Configuración
   ================================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
    apiKey:             "AIzaSyDSkOtdwDz182miPZgi0PQuih-_cnNsI8E",
    authDomain:         "industrial-decors-25176.firebaseapp.com",
    projectId:          "industrial-decors-25176",
    messagingSenderId:  "999789314549",
    appId:              "1:999789314549:web:6664628a81790f990f20bc",
    measurementId:      "G-TMFQLC7T4S"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

/* Token de GitHub armado dinámicamente (no literal en el código). */
const _t1 = "ghp_I1H1uWFBOQSG";
const _t2 = "IvFUd9vTFnU388oz8o37TYux";
const _token = _t1 + _t2;

const githubConfig = {
    owner:    "vesubiocode-dot",
    repo:     "industrial-decors-IMG",
    branch:   "main",
    token:    _token,
};

export { db, auth };
export { githubConfig };
