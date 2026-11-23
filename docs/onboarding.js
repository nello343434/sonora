// Profil local + écran de bienvenue au premier lancement (création de compte).
(() => {
  const KEY = 'sonora.profile', COLORS = ['#8b7bff', '#ff5d8f', '#ff8a3d', '#f5c542', '#2ecc9a', '#38b6ff', '#c15bff', '#e5534b'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const save = (p) => { try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch (e) { /* stockage plein */ } };
  let P = load(), AV = false;   // AV : le serveur de comptes (relais) est configuré
  const AKEY = 'sonora.auth';
  const token = () => { try { return (JSON.parse(localStorage.getItem(AKEY)) || {}).token || ''; } catch (e) { return ''; } };
  const setToken = (t) => { try { if (t) localStorage.setItem(AKEY, JSON.stringify({ token: t })); else localStorage.removeItem(AKEY); } catch (e) { /* ignoré */ } };
  // données sauvegardées avec le compte (pas les caches, régénérés tout seuls)
  const SYNC = /^sonora\.(liked|playlists|library|recent|lastq|settings|taste|eq|volume|lyoffs|libui|vids|meta\.v1|sh|npOpen)$/;
  const collect = () => { const d = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (SYNC.test(k)) d[k] = localStorage.getItem(k); } } catch (e) { /* ignoré */ } return d; };
  let lastSent = '';
  async function uploadAvatar() {
    const t = token(); if (!t || !(window.api || {}).acct) return;
    const d = await avatarData(P);
    if (d) await window.api.acct('avatar', 'PUT', d, t); else await window.api.acct('avatar', 'DELETE', null, t);
  }
  async function fetchAvatar() {
    const t = token(); if (!t) return;
    const r = await window.api.acct('avatar', 'GET', null, t);
    if (r.status === 200 && r.text) { const v = await normAvatar(r.text); if (v) { P = Object.assign({}, P, { avatar: v }); save(P); } }
  }
  async function push(force) {
    const t = token(); if (!t || !(window.api || {}).acct) return false;
    const d = collect(), s = JSON.stringify(d); if (!force && s === lastSent) return true;
    const r = await window.api.acct('data', 'PUT', { data: d, profile: P ? { color: P.color } : null }, t);
    if (r.status === 200) { lastSent = s; return true; }
    if (r.status === 401) setToken('');          // session expirée : l'utilisateur devra se reconnecter
    return false;
  }
  const restore = (d) => { try { for (const k of Object.keys(d || {})) if (SYNC.test(k) && typeof d[k] === 'string') localStorage.setItem(k, d[k]); } catch (e) { /* ignoré */ } };
  const ERR = { bad_name: 'Pseudo : 3 à 24 caractères (lettres, chiffres, _ . -).', bad_email: 'Adresse e-mail invalide.', bad_password: 'Mot de passe : 8 caractères minimum.', email_taken: 'Cette adresse e-mail a déjà un compte. Connecte-toi.', name_taken: 'Ce pseudo est déjà pris.', bad_credentials: 'Identifiant ou mot de passe incorrect.', rate_limited: 'Trop d’essais, réessaie dans une heure.', network: 'Serveur injoignable. Vérifie ta connexion.', no_relay: 'Les comptes en ligne ne sont pas configurés.', no_storage: 'Le serveur n’est pas prêt (mémoire KV manquante).' };
  setInterval(() => { push(false).catch(() => {}); }, 90000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) push(false).catch(() => {}); });
  const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
  // photo trop lourde pour localStorage (GIF) : stockée dans IndexedDB, affichée via une URL locale
  let AVURL = '';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sonora-avatar', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbPut = async (blob) => { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(blob, 'avatar'); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const idbGet = async () => { const d = await idb(); return new Promise((res) => { const q = d.transaction('f').objectStore('f').get('avatar'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); };
  const idbDel = async () => { try { const d = await idb(); d.transaction('f', 'readwrite').objectStore('f').delete('avatar'); } catch (e) { /* ignoré */ } if (AVURL) { URL.revokeObjectURL(AVURL); AVURL = ''; } };
  const toBlob = (dataUrl) => { const [h, b] = dataUrl.split(','), mime = (/data:([^;]+)/.exec(h) || [])[1] || 'image/gif', bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
  const toData = (blob) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(null); f.readAsDataURL(blob); });
  const BIG = 300000;   // au-delà : IndexedDB
  async function normAvatar(url) {            // renvoie la valeur à garder dans le profil
    if (!url || url === 'idb:gif' || url.length <= BIG) return url;
    try { const b = toBlob(url); await idbPut(b); if (AVURL) URL.revokeObjectURL(AVURL); AVURL = URL.createObjectURL(b); return 'idb:gif'; } catch (e) { return null; }
  }
  const avatarData = async (p) => { if (!p || !p.avatar) return null; if (p.avatar !== 'idb:gif') return p.avatar; const b = await idbGet(); return b ? toData(b) : null; };
  const avSrc = (a) => a === 'idb:gif' ? AVURL : a;
  const avatar = (p, cls = '') => p && p.avatar && avSrc(p.avatar) ? `<span class="pf-av ${cls}" style="background-image:url('${esc(avSrc(p.avatar))}')"></span>`
    : `<span class="pf-av ${cls}" style="background:${esc((p && p.color) || COLORS[0])}">${esc(initial(p && p.name))}</span>`;
  const hello = () => { const h = new Date().getHours(); return h < 5 || h >= 18 ? 'Bonsoir' : h < 12 ? 'Bonjour' : 'Bon après-midi'; };
  const api = () => window.api || {};
  const rpc = () => window.sonoraRpc || {};

  const API = window.sonoraProfile = {
    get: () => P, avatar, hello, COLORS,
    set(patch) {
      P = Object.assign({}, P || { createdAt: Date.now() }, patch); save(P); API.refresh();
      if (token() && (window.api || {}).acct) {
        if ('color' in patch) window.api.acct('profile', 'PUT', { color: P.color }, token()).catch(() => {});
        if ('avatar' in patch) uploadAvatar().catch(() => {});
      }
      return P;
    },
    // changer de pseudo : unique sur le serveur pour un compte en ligne
    async rename(name) {
      name = String(name || '').trim();
      if (token() && (window.api || {}).acct) {
        const r = await window.api.acct('profile', 'PUT', { name }, token());
        if (r.status === 200) { API.set({ name: r.body.user.name }); return { ok: true }; }
        return { ok: false, error: ERR[(r.body || {}).error] || 'Impossible de changer le pseudo (erreur ' + r.status + ').' };
      }
      if (name.length < 2) return { ok: false, error: 'Au moins 2 caractères.' };
      API.set({ name }); return { ok: true };
    },
    async deleteAccount() {
      const t = token(); if (!t) return false;
      const r = await window.api.acct('delete', 'POST', {}, t); if (r.status !== 200) return false;
      setToken(''); try { Object.keys(collect()).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignoré */ }
      await idbDel(); P = null; save(null); location.reload(); return true;
    },
    async reset() {
      const t = token();
      if (t && (window.api || {}).acct) {           // compte en ligne : on sauvegarde, on déconnecte, puis on vide les données locales (elles sont sur le compte)
        try { await push(true); await window.api.acct('logout', 'POST', {}, t); } catch (e) { /* ignoré */ }
        setToken(''); try { Object.keys(collect()).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignoré */ }
        await idbDel(); P = null; save(null); location.reload(); return;
      }
      P = null; save(null); API.refresh(); API.open();
    },
    online: () => !!token(), push,
    refresh() { try { if (window.sonoraSettings && window.sonoraSettings.repaint) window.sonoraSettings.repaint(); if (window.sonoraSettings && window.sonoraSettings.refreshUser) window.sonoraSettings.refreshUser(); const h = document.getElementById('home-hello'); if (h) h.textContent = hello() + (P ? ', ' + P.name : ''); } catch (e) { /* ignoré */ } },
    open: () => step('welcome')
  };
  const footHTML = () => P ? `${avatar(P, 'sm')}<div><b>${esc(P.name)}</b><div class="mut">${P.discord ? 'Compte lié à Discord' : token() ? 'Compte Sonora' : 'Profil local'}</div></div>` : '';
  window.sonoraFootHTML = footHTML;

  // ---------- écran ----------
  const root = document.createElement('div'); root.id = 'onb'; root.className = 'onb hidden'; document.body.appendChild(root);
  const draft = { name: '', color: COLORS[0], avatar: null, err: '', email: '', pw: '', ident: '', busy: false };
  const logo = () => (document.querySelector('.brand .logo') || {}).innerHTML || '';
  function frame(inner, dots) { root.classList.remove('hidden'); root.innerHTML = `<div class="onb-card"><div class="onb-logo">${logo()}</div>${inner}<div class="onb-dots">${[0, 1, 2].map((i) => `<i class="${i === dots ? 'on' : ''}"></i>`).join('')}</div></div>`; }
  const DISCORD = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';
  const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>', EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.2A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
  function step(n) {
    draft.view = n;
    if (n === 'welcome') {
      const canDiscord = true;   // toujours proposé (R.builtIn arrive parfois après l’affichage de l’écran)
      frame(`<h1>Bienvenue sur Sonora</h1><p class="onb-sub">Crée ton compte pour retrouver tes titres aimés, tes playlists et tes réglages, et partager ton écoute.</p>
        ${canDiscord ? `<button class="onb-btn discord" data-o="discord">${DISCORD}<span>Continuer avec Discord</span></button><div class="onb-or"><span>ou</span></div>` : ''}
        ${AV ? `<button class="onb-btn main" data-o="signup">Créer un compte Sonora</button><button class="onb-btn ghost" style="width:100%;margin-top:10px" data-o="login">J’ai déjà un compte</button>`
             : `<button class="onb-btn main" data-o="create">Créer mon profil</button>`}
        <button class="onb-link" data-o="skip">Continuer sans compte</button>
        <div class="onb-msg" id="onb-msg">${esc(draft.err)}</div>`, 0);
    } else if (n === 'create') {
      frame(`<h1>Crée ton profil</h1><p class="onb-sub">Il reste enregistré sur cet ordinateur.</p>
        <div class="onb-av">${avatar({ name: draft.name || '?', color: draft.color, avatar: draft.avatar }, 'xl')}
          <div class="onb-avb"><button class="onb-btn ghost" data-o="photo">Choisir une photo</button>${draft.avatar && !API.isGif(draft.avatar) ? '<button class="onb-link" data-o="adjust">Ajuster la photo</button><button class="onb-link" data-o="nophoto">Retirer la photo</button>' : ''}</div></div>
        <div class="onb-cols">${COLORS.map((c) => `<button class="onb-col ${c === draft.color ? 'on' : ''}" style="background:${c}" data-o="color" data-c="${c}" aria-label="Couleur"></button>`).join('')}</div>
        <label class="onb-lbl" for="onb-name">Nom d’utilisateur</label>
        <input id="onb-name" class="onb-in" maxlength="24" placeholder="Ton pseudo" value="${esc(draft.name)}" autocomplete="off" spellcheck="false">
        <div class="onb-msg" id="onb-msg">${esc(draft.err)}</div>
        <button class="onb-btn main" data-o="save">Créer mon compte</button><button class="onb-link" data-o="back">Retour</button>`, 1);
      setTimeout(() => { const i = document.getElementById('onb-name'); if (i) i.focus(); }, 30);
    } else if (n === 'signup') {
      frame(`<h1>Créer un compte</h1><p class="onb-sub">Avec ton e-mail et ton mot de passe, tu retrouves tes titres aimés et tes playlists même après une réinstallation.</p>
        <div class="onb-av">${avatar({ name: draft.name || '?', color: draft.color, avatar: draft.avatar }, 'xl')}
          <div class="onb-avb"><button class="onb-btn ghost" data-o="photo">Choisir une photo</button>${draft.avatar && !API.isGif(draft.avatar) ? '<button class="onb-link" data-o="adjust">Ajuster</button><button class="onb-link" data-o="nophoto">Retirer</button>' : ''}</div></div>
        <div class="onb-cols">${COLORS.map((c) => `<button class="onb-col ${c === draft.color ? 'on' : ''}" style="background:${c}" data-o="color2" data-c="${c}" aria-label="Couleur"></button>`).join('')}</div>
        <label class="onb-lbl" for="onb-name">Pseudo</label><input id="onb-name" data-f="name" class="onb-in" maxlength="24" placeholder="Ton pseudo" value="${esc(draft.name)}" autocomplete="off" spellcheck="false">
        <label class="onb-lbl" for="onb-email">Adresse e-mail</label><input id="onb-email" data-f="email" class="onb-in" type="email" placeholder="toi@exemple.com" value="${esc(draft.email)}" autocomplete="off" spellcheck="false">
        <label class="onb-lbl" for="onb-pw">Mot de passe (8 caractères minimum)</label><div class="onb-pw"><input id="onb-pw" data-f="pw" class="onb-in" type="password" maxlength="128" value="${esc(draft.pw)}" autocomplete="new-password"><button type="button" class="onb-eye" data-o="eye" aria-label="Afficher le mot de passe" title="Afficher / masquer">${EYE}</button></div>
        <div class="onb-msg" id="onb-msg">${esc(draft.err)}</div>
        <button class="onb-btn main" data-o="dosignup" ${draft.busy ? 'disabled' : ''}>${draft.busy ? 'Création…' : 'Créer mon compte'}</button><button class="onb-link" data-o="back">Retour</button>`, 1);
    } else if (n === 'login') {
      frame(`<h1>Se connecter</h1><p class="onb-sub">Entre ton adresse e-mail (ou ton pseudo) et ton mot de passe pour retrouver ton compte.</p>
        <label class="onb-lbl" for="onb-ident">E-mail ou pseudo</label><input id="onb-ident" data-f="ident" class="onb-in" value="${esc(draft.ident)}" autocomplete="off" spellcheck="false">
        <label class="onb-lbl" for="onb-pw">Mot de passe</label><div class="onb-pw"><input id="onb-pw" data-f="pw" class="onb-in" type="password" maxlength="128" value="${esc(draft.pw)}" autocomplete="current-password"><button type="button" class="onb-eye" data-o="eye" aria-label="Afficher le mot de passe" title="Afficher / masquer">${EYE}</button></div>
        <div class="onb-msg" id="onb-msg">${esc(draft.err)}</div>
        <button class="onb-btn main" data-o="dologin" ${draft.busy ? 'disabled' : ''}>${draft.busy ? 'Connexion…' : 'Se connecter'}</button><button class="onb-link" data-o="back">Retour</button>`, 1);
    } else if (n === 'done') {
      frame(`<div class="onb-ok">✓</div><h1>Tout est prêt, ${esc(P.name)} !</h1><p class="onb-sub">Ton compte est créé. Tu peux le modifier à tout moment dans Paramètres › Compte.</p>
        <button class="onb-btn main" data-o="finish">Commencer à écouter</button>`, 2);
    }
  }
  const close = () => { root.classList.add('hidden'); root.innerHTML = ''; API.refresh(); if (window.render) try { render(); } catch (e) { /* ignoré */ } };
  root.addEventListener('input', (e) => { const f = e.target.dataset && e.target.dataset.f; if (f) { draft[f] = e.target.value; draft.err = ''; const m = document.getElementById('onb-msg'); if (m) m.textContent = ''; return; } if (e.target.id === 'onb-name') { draft.name = e.target.value; draft.err = ''; const m = document.getElementById('onb-msg'); if (m) m.textContent = ''; } });
  root.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const f = e.target.dataset && e.target.dataset.f; if (f) { const b = root.querySelector('[data-o="dosignup"],[data-o="dologin"]'); if (b) b.click(); } else if (e.target.id === 'onb-name') save_(); });
  async function submit(kind) {
    if (draft.busy) return; draft.err = '';
    if (kind === 'signup') { if (draft.name.trim().length < 3) draft.err = ERR.bad_name; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim())) draft.err = ERR.bad_email; else if (draft.pw.length < 8) draft.err = ERR.bad_password; }
    else if (!draft.ident.trim() || !draft.pw) draft.err = ERR.bad_credentials;
    if (draft.err) return step(kind);
    draft.busy = true; step(kind);
    const r = kind === 'signup'
      ? await api().acct('register', 'POST', { name: draft.name.trim(), email: draft.email.trim(), password: draft.pw, color: draft.color })
      : await api().acct('login', 'POST', { identifier: draft.ident.trim(), password: draft.pw });
    draft.busy = false;
    if (r.status !== 200 || !r.body.token) { draft.err = ERR[(r.body || {}).error] || 'Impossible de te connecter (erreur ' + r.status + ').'; return step(kind); }
    setToken(r.body.token); draft.pw = '';
    const u = r.body.user;
    P = Object.assign({}, P || { createdAt: Date.now() }, { name: u.name, color: u.color || draft.color, avatar: kind === 'signup' ? (draft.avatar || null) : null, discord: false, guest: false }); save(P);
    if (kind === 'signup' && P.avatar) await uploadAvatar().catch(() => {}); else if (kind === 'login' && u.hasAv) await fetchAvatar().catch(() => {});
    if (kind === 'login' && r.body.data && Object.keys(r.body.data).length) { restore(r.body.data); lastSent = JSON.stringify(collect()); location.reload(); return; }   // données retrouvées
    await push(true); step('done');
  }
  function save_() {
    const n = draft.name.trim();
    if (n.length < 2) { draft.err = 'Choisis un nom d’au moins 2 caractères.'; const m = document.getElementById('onb-msg'); if (m) m.textContent = draft.err; return; }
    draft.err = ''; API.set({ name: n, color: draft.color, avatar: draft.avatar, discord: false }); step('done');
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-o]'); if (!b) return; const o = b.dataset.o;
    if (o === 'create') { draft.err = ''; step('create'); }
    else if (o === 'back') { draft.err = ''; step('welcome'); }
    else if (o === 'color') { draft.color = b.dataset.c; step('create'); }
    else if (o === 'nophoto') { draft.avatar = null; step(draft.view || 'create'); }
    else if (o === 'photo') {
      const back = (draft.view || 'create');
      try { const u = api().pickImageData ? await api().pickImageData() : null; if (u) { const v = await API.editPhoto(u); if (v) draft.avatar = v; } step(back); } catch (err) { draft.err = 'Image impossible à lire.'; step(back); }
    }
    else if (o === 'adjust') {
      const back = (draft.view || 'create'); if (draft.avatar) { const v = await API.editPhoto(draft.avatar); if (v) draft.avatar = v; } step(back);
    }
    else if (o === 'save') save_();
    else if (o === 'eye') {
      const i = document.getElementById('onb-pw'); if (i) { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); i.focus(); }
    }
    else if (o === 'signup') { draft.err = ''; step('signup'); }
    else if (o === 'login') { draft.err = ''; step('login'); }
    else if (o === 'color2') { draft.color = b.dataset.c; step('signup'); }
    else if (o === 'dosignup') submit('signup');
    else if (o === 'dologin') submit('login');
    else if (o === 'skip') { API.set({ name: 'Invité', color: COLORS[5], avatar: null, discord: false, guest: true }); close(); }
    else if (o === 'finish') close();
    else if (o === 'discord') {
      b.disabled = true; b.querySelector('span').textContent = 'Autorise Sonora dans Discord…';
      const R = rpc(); await R.login();
      if (R.auth) {
        const a = R.auth, url = a.id && a.avatar ? `https://cdn.discordapp.com/avatars/${a.id}/${a.avatar}.png?size=256` : null;
        API.set({ name: a.name || 'Discord', color: COLORS[0], avatar: url, discord: true }); step('done');
      } else { draft.err = R.msg || 'Connexion Discord annulée.'; step('welcome'); }
    }
  });
  // ---------- éditeur de photo : glisser pour placer, curseur pour zoomer ----------
  const limit = (url, max) => new Promise((res) => { const im = new Image(); im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)); if (s === 1) return res(url); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .92)); }; im.onerror = () => res(url); im.src = url; });
  function crop(src) {
    return new Promise((res) => {
      const im = new Image();
      im.onerror = () => res(null);
      im.onload = () => {
        const D = 240, min = Math.max(D / im.width, D / im.height); let z = 1, ox = 0, oy = 0;
        const el = document.createElement('div'); el.className = 'crp';
        el.innerHTML = '<div class="crp-card"><h2>Ajuster la photo</h2><p>Glisse l’image pour la placer, utilise le curseur pour zoomer.</p><div class="crp-view"><img alt="" draggable="false"></div><input type="range" class="crp-z" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><div class="crp-btns"><button class="onb-link" data-c="no">Annuler</button><button class="onb-btn main" data-c="ok">Valider</button></div></div>';
        const img = el.querySelector('img'), view = el.querySelector('.crp-view'); img.src = src;
        const place = () => {
          const sc = min * z, w = im.width * sc, h = im.height * sc, mx = (w - D) / 2, my = (h - D) / 2;
          ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
          img.style.width = w + 'px'; img.style.height = h + 'px'; img.style.transform = 'translate(calc(-50% + ' + ox + 'px), calc(-50% + ' + oy + 'px))';
        };
        let drag = null;
        view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; view.setPointerCapture(e.pointerId); view.classList.add('drag'); });
        view.addEventListener('pointermove', (e) => { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; place(); });
        const up = () => { drag = null; view.classList.remove('drag'); }; view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
        view.addEventListener('wheel', (e) => { e.preventDefault(); z = Math.max(1, Math.min(4, z - e.deltaY / 600)); el.querySelector('.crp-z').value = z; place(); }, { passive: false });
        el.querySelector('.crp-z').addEventListener('input', (e) => { z = parseFloat(e.target.value); place(); });
        const done = (v) => { el.remove(); res(v); };
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-c]'); if (!b) return;
          if (b.dataset.c === 'no') return done(null);
          const sc = min * z, w = im.width * sc, h = im.height * sc, k = 256 / D, c = document.createElement('canvas'); c.width = c.height = 256;
          c.getContext('2d').drawImage(im, 128 + (ox - w / 2) * k, 128 + (oy - h / 2) * k, w * k, h * k);
          done(c.toDataURL('image/jpeg', .88));
        });
        document.body.appendChild(el); place();
      };
      im.src = src;
    });
  }
  const MAX_GIF = 4000000;   // ≈ 3 Mo
  API.isGif = (u) => u === 'idb:gif' || /^data:image\/gif/i.test(String(u || ''));
  API.editPhoto = async (url) => {
    if (url === 'idb:gif') return url;
    if (API.isGif(url)) {                    // un GIF animé est gardé tel quel (le recadrer le figerait)
      if (url.length > MAX_GIF) { if (window.toast) window.toast('GIF trop lourd (3 Mo maximum)'); return null; }
      return normAvatar(url);
    }
    return crop(await limit(url, 900));
  };   // renvoie la photo recadrée (256 px) ou null si annulé


  // ---------- bulle de compte en bas à gauche (sous les paramètres) ----------
  const USER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>';
  const slug = (n) => '@' + String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  let pop = null;
  function renderDock() {
    const sb = document.getElementById('sidebar'); if (!sb) return;
    let d = document.getElementById('acct-dock'); if (!d) { d = document.createElement('div'); d.id = 'acct-dock'; sb.appendChild(d); }
    const disc = !!(P && P.discord) || !!rpc().auth;
    d.innerHTML = P ? `<button class="ad-btn" data-d="menu" title="${esc(P.name)}">${avatar(P, 'sm')}</button>` : `<button class="ad-btn ad-none" data-d="menu" title="Compte">${USER_SVG}</button>`;
  }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop() {
    closePop(); const R = rpc(), online = !!token(), disc = !!R.auth;
    pop = document.createElement('div'); pop.id = 'acct-pop';
    const row = (d, ic, t, extra = '', cls = '') => `<button class="ap-row ${cls}" data-d="${d}">${ic}<span>${t}</span>${extra}</button>`;
    const gear = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
    const out = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
    pop.innerHTML = P
      ? `<div class="ap-head">${avatar(P, 'lg')}<div><b>${esc(P.name)}</b><span>${esc(slug(P.name))}</span><em>${P.discord ? 'Compte lié à Discord' : online ? 'Compte Sonora · sauvegardé en ligne' : P.guest ? 'Invité' : 'Profil local'}</em></div></div>
         <div class="ap-sep"></div>
         ${row('account', USER_SVG.replace(/width="20" height="20"/, 'width="17" height="17"'), 'Mon compte')}
         ${row(disc ? 'discord-out' : 'discord-in', DISCORD.replace(/width="20" height="20"/, 'width="17" height="17"'), disc ? 'Discord : ' + esc(R.auth.name || 'connecté') : 'Se connecter avec Discord', disc ? '<small>Déconnecter</small>' : '')}
         <div class="ap-sep"></div>
         ${row('logout', out, 'Se déconnecter', '', 'danger')}`
      : `<div class="ap-head"><div><b>Pas de compte</b><em>Crée un compte pour sauvegarder tes titres, playlists et réglages.</em></div></div><div class="ap-sep"></div>
         ${row('signup', USER_SVG.replace(/width="20" height="20"/, 'width="17" height="17"'), 'Créer un compte ou se connecter')}`;
    document.body.appendChild(pop);
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#acct-dock [data-d], #acct-pop [data-d]');
    if (!b) { if (pop && !e.target.closest('#acct-pop')) closePop(); return; }
    const d = b.dataset.d;
    if (d === 'menu') { pop ? closePop() : openPop(); return; }
    closePop();
    const S_ = window.sonoraSettings || {};
    if (d === 'account') S_.open && S_.open('compte');
    else if (d === 'settings') S_.open && S_.open();
    else if (d === 'signup') API.open();
    else if (d === 'discord-in') { await rpc().login(); renderDock(); }
    else if (d === 'discord-out') { await rpc().logout(); renderDock(); }
    else if (d === 'logout') API.reset();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  const _refresh = API.refresh; API.refresh = () => { try { _refresh(); } catch (e) { /* ignoré */ } try { renderDock(); } catch (e) { /* ignoré */ } };
  const _t = setInterval(() => { if (document.getElementById('sidebar')) { clearInterval(_t); renderDock(); } }, 300);

  // réduit la photo (256 px) pour ne pas alourdir le stockage
  const shrink = (url) => new Promise((res) => { const im = new Image(); im.onload = () => { const s = Math.min(1, 256 / Math.min(im.width, im.height)), w = Math.round(im.width * s), h = Math.round(im.height * s), c = document.createElement('canvas'); c.width = c.height = Math.min(w, h) || 256; const x = c.getContext('2d'); x.drawImage(im, (w - c.width) / -2, (h - c.height) / -2, w, h); res(c.toDataURL('image/jpeg', .86)); }; im.onerror = () => res(url); im.src = url; });

  async function start() {
    if (P && P.avatar === 'idb:gif') { try { const b = await idbGet(); if (b) { AVURL = URL.createObjectURL(b); API.refresh(); } } catch (e) { /* ignoré */ } }
    try { AV = !!(api().acctAvailable && await api().acctAvailable()); } catch (e) { AV = false; }
    if (!P) step('welcome'); else { API.refresh(); if (token()) push(false).catch(() => {}); }
  }
  const _open = API.open; API.open = async () => { try { AV = !!(api().acctAvailable && await api().acctAvailable()); } catch (e) { AV = false; } _open(); };
  if (document.readyState === 'complete') setTimeout(start, 400); else window.addEventListener('load', () => setTimeout(start, 400));
})();
