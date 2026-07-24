/* =================================================================
   INDUSTRIAL DECORS — Catálogo
   PLAN B: imágenes en GitHub API (repo público)

     - Firestore  → datos del catálogo (colección "items")
     - GitHub API → imágenes (en un repo público, sin servidor)
     - Auth       → acceso del administrador (email + clave)
   ================================================================= */

import { db, auth, githubConfig } from './firebase-config.js';

import {
    collection, query, orderBy, onSnapshot,
    addDoc, deleteDoc, doc, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

(function () {
    'use strict';

    const COL = 'items';                  // colección en Firestore
    const IMG_PATH = 'catalog';            // carpeta dentro del repo de GitHub

    /* ---------- DOM ---------- */
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

    const els = {
        grid:        $('#catalogGrid'),
        emptyState:  $('#emptyState'),
        adminToggle: $('#adminToggleBtn'),
        adminToggleText: $('#adminToggleText'),
        adminControls: $('#adminControls'),
        body:        document.body,

        loginModal:  $('#loginModal'),
        loginForm:   $('#loginForm'),
        loginEmail:  $('#adminEmail'),
        loginPass:   $('#adminPass'),
        loginError:  $('#loginError'),

        formModal:   $('#formModal'),
        itemForm:    $('#itemForm'),
        itemName:    $('#itemName'),
        itemDesc:    $('#itemDesc'),
        itemImages:  $('#itemImages'),
        dropzone:    $('#dropzone'),
        thumbs:      $('#thumbsPreview'),
        openFormBtn: $('#openFormBtn'),
        logoutBtn:   $('#logoutBtn'),

        lightbox:    $('#lightbox'),
        lbImage:     $('#lbImage'),
        lbClose:     $('#lbClose'),
        lbPrev:      $('#lbPrev'),
        lbNext:      $('#lbNext'),
        lbCounter:   $('#lbCounter'),
        lbName:      $('#lbName'),
        lbDesc:      $('#lbDesc'),
        lbThumbs:    $('#lbThumbs'),

        toast:       $('#toast'),
        year:        $('#year'),
        header:      $('.site-header'),
    };

    /* ---------- Estado ---------- */
    let items = [];
    let isAdmin = false;
    let currentUser = null;
    let pendingImages = [];        // {file, name, previewUrl} pendientes de subir
    let lbState = { urls: [], idx: 0 };

    /* ===============================================================
       INICIALIZACIÓN
    =============================================================== */
    function init() {
        els.year.textContent = new Date().getFullYear();

        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            isAdmin = !!user;
            reflectAdminState();
            if (user && els.loginModal.classList.contains('is-open')) {
                closeModal(els.loginModal);
            }
        });

        listenCatalog();
        bindEvents();
        bindScrollHeader();
    }

    /* ===============================================================
       CATÁLOGO — Firestore onSnapshot (tiempo real)
    =============================================================== */
    function listenCatalog() {
        const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
        onSnapshot(q,
            (snap) => {
                items = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: data.name || '',
                        desc: data.desc || '',
                        images: Array.isArray(data.images) ? data.images : [],
                        imagePaths: Array.isArray(data.imagePaths) ? data.imagePaths : [],
                        createdAt: data.createdAt instanceof Timestamp
                            ? data.createdAt.toMillis()
                            : (data.createdAt || 0),
                    };
                });
                renderCatalog();
            },
            (err) => {
                console.error('Firestore error:', err);
                showToast('No se pudo cargar el catálogo: ' + friendlyErr(err), 'error');
            }
        );
    }

    function renderCatalog() {
        els.grid.innerHTML = '';
        if (!items.length) {
            els.emptyState.hidden = false;
            els.grid.style.display = 'none';
            return;
        }
        els.emptyState.hidden = true;
        els.grid.style.display = '';
        items.forEach((item, i) => els.grid.appendChild(buildCard(item, i)));
    }

    function buildCard(item, idx) {
        const card = document.createElement('article');
        card.className = 'product-card';
        card.style.animationDelay = (idx * 0.06) + 's';

        const cover = item.images && item.images[0] ? item.images[0] : '';
        const more  = item.images.length > 1 ? `+${item.images.length} fotos` : '';
        const safeCover = cover || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>';

        card.innerHTML = `
            <div class="product-media">
                <img src="${safeCover}" alt="${escapeHtml(item.name)}" loading="lazy">
                ${more ? `<span class="product-count">${more}</span>` : ''}
            </div>
            <div class="product-body">
                <h3 class="product-name">${escapeHtml(item.name)}</h3>
                ${item.desc ? `<p class="product-desc">${escapeHtml(item.desc)}</p>` : ''}
            </div>
            <button class="product-delete" title="Eliminar" aria-label="Eliminar objeto">×</button>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.product-delete')) return;
            if (item.images.length) openLightbox(item, 0);
        });

        card.querySelector('.product-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDelete(item);
        });

        return card;
    }

    /* ===============================================================
       ADMIN — Login / Logout con Firebase Auth
    =============================================================== */
    function reflectAdminState() {
        if (isAdmin) {
            els.adminControls.hidden = false;
            els.adminToggleText.textContent = 'Salir';
            els.adminToggle.classList.add('is-active');
            els.body.classList.add('admin-active');
        } else {
            els.adminControls.hidden = true;
            els.adminToggleText.textContent = 'Admin';
            els.adminToggle.classList.remove('is-active');
            els.body.classList.remove('admin-active');
        }
    }

    function handleAdminToggle() {
        if (isAdmin) {
            logout();
        } else {
            openModal(els.loginModal);
            setTimeout(() => { els.loginEmail.focus(); }, 350);
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const email = els.loginEmail.value.trim();
        const pass = els.loginPass.value;
        if (!email || !pass) return;

        setLoginLoading(true);
        els.loginError.hidden = true;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            els.loginForm.reset();
        } catch (err) {
            console.warn('Login error:', err);
            els.loginError.textContent = friendlyErr(err) || 'Datos incorrectos. Intentá de nuevo.';
            els.loginError.hidden = false;
            els.loginPass.value = '';
            els.loginPass.focus();
        } finally {
            setLoginLoading(false);
        }
    }

    function setLoginLoading(loading) {
        const btn = els.loginForm.querySelector('button[type="submit"]');
        if (!btn) return;
        if (loading) {
            btn.disabled = true;
            btn.dataset.origText = btn.textContent;
            btn.textContent = 'Ingresando…';
        } else {
            btn.disabled = false;
            if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
        }
    }

    async function logout() {
        try {
            await signOut(auth);
            showToast('Sesión cerrada', 'success');
        } catch (err) {
            showToast('Error al cerrar sesión: ' + friendlyErr(err), 'error');
        }
    }

    function requireAdmin() {
        if (!isAdmin || !currentUser) {
            showToast('Necesitás acceder como administrador', 'error');
            openModal(els.loginModal);
            return false;
        }
        return true;
    }

    /* ===============================================================
       GITHUB API — subir / borrar imágenes
       Documentación:
         PUT  /repos/{owner}/{repo}/contents/{path}  → subir/crear
         GET  /repos/{owner}/{repo}/contents/{path}  → leer ( + sha )
         DELETE /repos/{owner}/{repo}/contents/{path} → borrar (con sha)
    =============================================================== */
    const GH_API = 'https://api.github.com';

    function ghHeaders() {
        return {
            'Authorization': `token ${githubConfig.token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    async function ghUploadImage(file, fileName) {
        const path = `${IMG_PATH}/${fileName}`;
        const base64 = await fileToBase64(file);

        const res = await fetch(
            `${GH_API}/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${encodeURIComponent(path)}`,
            {
                method: 'PUT',
                headers: ghHeaders(),
                body: JSON.stringify({
                    message: `catálogo: subir ${fileName}`,
                    content: base64,            // base64 SIN el prefijo data:...
                    branch: githubConfig.branch
                })
            }
        );

        if (!res.ok) {
            const errTxt = await safeErrText(res);
            throw new Error(`GitHub upload ${res.status}: ${errTxt}`);
        }

        const data = await res.json();
        // rawUrl: URL pública de la imagen (sirve para <img src>)
        return {
            url:  data.content.raw_url || data.content.download_url,
            path: data.content.path,
            sha:  data.content.sha
        };
    }

    async function ghDeleteImage(path, sha) {
        const res = await fetch(
            `${GH_API}/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${encodeURIComponent(path)}`,
            {
                method: 'DELETE',
                headers: ghHeaders(),
                body: JSON.stringify({
                    message: `catálogo: borrar ${path}`,
                    sha: sha,
                    branch: githubConfig.branch
                })
            }
        );
        if (!res.ok && res.status !== 404) {
            // 404 = ya no existe (ignorable)
            throw new Error(`GitHub delete ${res.status}: ${await safeErrText(res)}`);
        }
    }

    // Cuando guardamos en Firestore NO podemos guardar el SHA porque
    // cambiaría si alguien toca el repo a mano. Para borrar entonces
    // primero obtenemos el SHA actual del archivo via GET.
    async function ghGetFileSha(path) {
        const res = await fetch(
            `${GH_API}/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${encodeURIComponent(path)}?ref=${githubConfig.branch}`,
            { headers: ghHeaders() }
        );
        if (!res.ok) {
            if (res.status === 404) return null;     // no existe
            throw new Error(`GitHub get ${res.status}: ${await safeErrText(res)}`);
        }
        const data = await res.json();
        return data.sha || null;
    }

    async function safeErrText(res) {
        try { return (await res.text()).slice(0, 200); }
        catch { return res.statusText; }
    }

    /* ===============================================================
       FORMULARIO DE CARGA
    =============================================================== */
    function openItemForm() {
        if (!requireAdmin()) return;
        resetForm();
        openModal(els.formModal);
        setTimeout(() => els.itemName.focus(), 350);
    }

    function resetForm() {
        els.itemForm.reset();
        pendingImages = [];
        els.thumbs.innerHTML = '';
    }

    function handleImagesInput(files) {
        const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!valid.length) return;

        valid.forEach(file => {
            if (file.size > 4 * 1024 * 1024) {
                showToast(`"${file.name}" supera 4MB`, 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                pendingImages.push({ file, name: file.name, previewUrl: ev.target.result });
                renderThumbs();
            };
            reader.readAsDataURL(file);
        });
    }

    function renderThumbs() {
        els.thumbs.innerHTML = '';
        pendingImages.forEach((img, i) => {
            const t = document.createElement('div');
            t.className = 'thumb';
            t.innerHTML = `
                <img src="${img.previewUrl}" alt="">
                <button type="button" class="thumb-remove" title="Quitar" data-i="${i}">×</button>
            `;
            t.querySelector('.thumb-remove').addEventListener('click', () => {
                pendingImages.splice(i, 1);
                renderThumbs();
            });
            els.thumbs.appendChild(t);
        });
    }

    async function handleItemSubmit(e) {
        e.preventDefault();
        if (!requireAdmin()) return;

        const name = els.itemName.value.trim();
        if (!name) { showToast('Falta el nombre del objeto', 'error'); return; }
        if (!pendingImages.length) { showToast('Subí al menos una imagen', 'error'); return; }

        const submitBtn = els.itemForm.querySelector('button[type="submit"]');
        const origText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Subiendo…';

        try {
            // 1) Subir cada imagen a GitHub → obtener URLs públicas
            const uploaded = [];
            const stamp = Date.now();
            for (let i = 0; i < pendingImages.length; i++) {
                const p = pendingImages[i];
                const fileName = `${stamp}_${randSlug()}_${i}_${sanitizeFileName(p.name)}`;
                const info = await ghUploadImage(p.file, fileName);
                uploaded.push({ url: info.url, path: info.path });
                // feedback de progreso
                submitBtn.textContent = `Subiendo (${i + 1}/${pendingImages.length})…`;
            }

            // 2) Crear documento en Firestore con las URLs
            await addDoc(collection(db, COL), {
                name,
                desc: els.itemDesc.value.trim(),
                images: uploaded.map(u => u.url),
                imagePaths: uploaded.map(u => u.path),
                createdAt: serverTimestamp(),
                authorUid: currentUser.uid,
            });

            closeModal(els.formModal);
            showToast('Objeto publicado ✓', 'success');
        } catch (err) {
            console.error('Error al publicar:', err);
            showToast('No se pudo publicar: ' + friendlyErr(err), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
        }
    }

    /* ===============================================================
       ELIMINAR
    =============================================================== */
    async function confirmDelete(item) {
        const ok = window.confirm(`¿Eliminar "${item.name}" del catálogo?`);
        if (!ok) return;
        try {
            // 1) Borrar imágenes de GitHub (necesitamos sha actual)
            if (item.imagePaths && item.imagePaths.length) {
                for (const path of item.imagePaths) {
                    try {
                        const sha = await ghGetFileSha(path);
                        if (sha) await ghDeleteImage(path, sha);
                    } catch (e) {
                        console.warn('No se pudo borrar imagen', path, e);
                    }
                }
            }
            // 2) Borrar documento de Firestore
            await deleteDoc(doc(db, COL, item.id));
            showToast('Objeto eliminado', 'success');
        } catch (err) {
            console.error('Error al eliminar:', err);
            showToast('No se pudo eliminar: ' + friendlyErr(err), 'error');
        }
    }

    /* ===============================================================
       LIGHTBOX
    =============================================================== */
    function openLightbox(item, idx) {
        if (!item || !item.images || !item.images.length) return;
        lbState.item = item;
        lbState.urls = item.images;
        lbState.idx = idx || 0;
        // Info del objeto
        els.lbName.textContent = item.name || '';
        els.lbDesc.textContent = item.desc || '';
        buildLbThumbs();
        updateLightbox();
        els.lightbox.classList.add('is-open');
        els.lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
        els.lightbox.classList.remove('is-open');
        els.lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    // await image load before showing, so the first image never appears broken/cut
    function setImageWithFade(src) {
        els.lbImage.style.opacity = '0';
        const tmp = new Image();
        tmp.onload = () => {
            els.lbImage.src = src;
            requestAnimationFrame(() => { els.lbImage.style.opacity = '1'; });
        };
        tmp.onerror = () => { els.lbImage.src = src; els.lbImage.style.opacity = '1'; };
        tmp.src = src;
    }
    function updateLightbox() {
        const url = lbState.urls[lbState.idx] || '';
        els.lbCounter.textContent = `${lbState.idx + 1} / ${lbState.urls.length}`;
        const showNav = lbState.urls.length > 1;
        els.lbPrev.style.display = showNav ? 'flex' : 'none';
        els.lbNext.style.display = showNav ? 'flex' : 'none';
        // mark active thumb
        const t = els.lbThumbs.querySelectorAll('.lightbox-thumb');
        t.forEach((el, i) => el.classList.toggle('active', i === lbState.idx));
        setImageWithFade(url);
    }
    function buildLbThumbs() {
        els.lbThumbs.innerHTML = '';
        if (!lbState.urls || lbState.urls.length <= 1) return;
        lbState.urls.forEach((url, i) => {
            const div = document.createElement('div');
            div.className = 'lightbox-thumb';
            div.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
            div.addEventListener('click', () => { lbState.idx = i; updateLightbox(); });
            els.lbThumbs.appendChild(div);
        });
    }
    function lbStep(delta) {
        const n = lbState.urls.length;
        lbState.idx = (lbState.idx + delta + n) % n;
        updateLightbox();
    }

    /* ===============================================================
       MODALES
    =============================================================== */
    function openModal(modal) {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeModal(modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    /* ===============================================================
       TOAST
    =============================================================== */
    let toastTimer;
    function showToast(msg, type = '') {
        clearTimeout(toastTimer);
        els.toast.textContent = msg;
        els.toast.className = 'toast ' + type;
        els.toast.hidden = false;
        void els.toast.offsetWidth;
        els.toast.classList.add('show');
        toastTimer = setTimeout(() => {
            els.toast.classList.remove('show');
            setTimeout(() => { els.toast.hidden = true; }, 400);
        }, 3200);
    }

    /* ===============================================================
       HEADER scroll
    =============================================================== */
    function bindScrollHeader() {
        const onScroll = () => {
            if (window.scrollY > 30) els.header.classList.add('scrolled');
            else els.header.classList.remove('scrolled');
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ===============================================================
       EVENTOS
    =============================================================== */
    function bindEvents() {
        els.adminToggle.addEventListener('click', handleAdminToggle);
        els.loginForm.addEventListener('submit', handleLogin);
        els.openFormBtn.addEventListener('click', openItemForm);
        els.logoutBtn.addEventListener('click', logout);

        els.itemForm.addEventListener('submit', handleItemSubmit);
        els.dropzone.addEventListener('click', () => els.itemImages.click());
        els.dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.itemImages.click(); }
        });
        els.itemImages.addEventListener('change', (e) => {
            handleImagesInput(e.target.files);
            e.target.value = '';
        });
        ['dragenter', 'dragover'].forEach(ev => {
            els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(ev => {
            els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove('dragover'); });
        });
        els.dropzone.addEventListener('drop', (e) => {
            handleImagesInput(e.dataTransfer.files);
        });

        $$('[data-close]').forEach(el => {
            el.addEventListener('click', () => {
                const modal = el.closest('.modal');
                if (modal) closeModal(modal);
            });
        });

        els.lbClose.addEventListener('click', closeLightbox);
        els.lbPrev.addEventListener('click', () => lbStep(-1));
        els.lbNext.addEventListener('click', () => lbStep(1));
        els.lightbox.addEventListener('click', (e) => {
            if (e.target === els.lightbox) closeLightbox();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (els.lightbox.classList.contains('is-open')) { closeLightbox(); return; }
                const open = $('.modal.is-open');
                if (open) closeModal(open);
            }
            if (els.lightbox.classList.contains('is-open')) {
                if (e.key === 'ArrowLeft') lbStep(-1);
                if (e.key === 'ArrowRight') lbStep(1);
            }
        });
    }

    /* ===============================================================
       UTILS
    =============================================================== */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }
    function randSlug() {
        return Math.random().toString(36).slice(2, 8);
    }
    function sanitizeFileName(name) {
        return name
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 60);
    }
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                // ev.target.result = "data:image/jpeg;base64,XXXX"
                // Para GitHub hay que quitar el prefijo data:...
                const result = ev.target.result;
                const commaIdx = result.indexOf(',');
                resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
            };
            reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
            reader.readAsDataURL(file);
        });
    }
    function friendlyErr(err) {
        if (!err) return '';
        const msg = err.message || String(err);
        const code = err.code || msg;
        const map = {
            'auth/invalid-email':         'Email inválido.',
            'auth/user-not-found':        'Esa cuenta no existe.',
            'auth/wrong-password':        'Clave incorrecta.',
            'auth/invalid-credential':    'Email o clave incorrectos.',
            'auth/too-many-requests':     'Demasiados intentos. Esperá un momento.',
            'auth/network-request-failed':'Sin conexión a internet.',
            'permission-denied':          'Sin permiso para realizar esa acción.',
            'unavailable':                'Servicio no disponible momentáneamente.',
        };
        if (map[code]) return map[code];
        if (msg.includes('GitHub upload 401')) return 'Token de GitHub inválido. Revisá githubConfig.token.';
        if (msg.includes('GitHub upload 404')) return 'No se encontró el repo de GitHub. Revisá owner/repo en githubConfig.';
        if (msg.includes('GitHub upload')) return 'Error al subir la imagen a GitHub.';
        return msg;
    }

    /* GO */
    document.addEventListener('DOMContentLoaded', init);
})();
