// Sonora — comptes Google : chaque personne a ses propres playlists, titres aimés, recherches récentes…
// Les données sont rangées par compte sur l'ordinateur (voir KP dans app.js) et synchronisées avec le Google Drive de la personne.
(() => {
  'use strict';
  const btn = document.getElementById('acct');
  if (!btn) return;
  const api = window.api || {};
  const SYNC_KEYS = ['sonora.playlists', 'sonora.liked', 'sonora.recent', 'sonora.libui', 'sonora.lyoffs', 'sonora.sh'];
  const prefix = typeof KP === 'string' ? KP : '';
  const profile = typeof SESSION !== 'undefined' ? SESSION : null;
  const G = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.55 21.3 7.62 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.62 0 3.55 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>';

  const $m = () => document.getElementById('modal');
  const closeModal = () => $m().classList.add('hidden');
  function modal(html) {
    const m = $m();
    m.innerHTML = '<div class="box acct-box">' + html + '</div>';
    m.classList.remove('hidden');
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    return m;
  }
  const byId = (id) => document.getElementById(id);

  // ---------- bouton du compte (barre de gauche) ----------
  function renderBtn() {
    if (profile) {
      btn.title = profile.name || profile.email || 'Mon compte';
      btn.innerHTML = profile.picture
        ? `<img class="acct-img" alt="" referrerpolicy="no-referrer" src="${esc(profile.picture)}">`
        : `<span class="acct-img acct-ini">${esc((profile.name || '?').slice(0, 1).toUpperCase())}</span>`;
    } else {
      btn.title = 'Se connecter avec Google';
      btn.innerHTML = G;
    }
  }
  renderBtn();
  btn.addEventListener('click', () => { if (profile) openAccount(); else login(); });

  // ---------- connexion ----------
  let warned = false;
  function cloudWarn(e, force) {
    if (warned && !force) return;
    warned = true;
    const m = String((e && e.message) || e);
    toast(/403|accessNotConfigured|DRIVE/.test(m) ? 'Synchronisation impossible : active « Google Drive API » dans ton projet Google Cloud.' : 'Synchronisation Google Drive indisponible pour le moment.');
  }
  function setupHelp() {
    modal(`<h3>Connexion Google</h3>
      <div class="sub" style="margin:0">Il manque l’identifiant Google de ton appli. À faire une seule fois :</div>
      <ol class="acct-steps">
        <li>Ouvre la console Google Cloud et crée un projet.</li>
        <li>Active l’API « Google Drive ».</li>
        <li>Écran de consentement OAuth : type « Externe », ajoute ton e-mail comme utilisateur test.</li>
        <li>Identifiants → Créer → ID client OAuth → « Application de bureau ».</li>
        <li>Copie l’ID client et le code secret dans <b>google-config.js</b> (à côté de main.js), puis relance Sonora.</li>
      </ol>
      <div class="row" style="justify-content:center;margin:18px 0 0"><button class="btn small" id="ac-open">Ouvrir Google Cloud</button><button class="btn ghost small" id="ac-close">Fermer</button></div>`);
    byId('ac-close').onclick = closeModal;
    byId('ac-open').onclick = () => { if (api.openExternal) api.openExternal('https://console.cloud.google.com/apis/credentials'); };
  }
  const guestHasData = () => SYNC_KEYS.concat(['sonora.library']).some((k) => { const v = localStorage.getItem(k); return v && v !== '[]' && v !== 'null'; });
  function askImport() {
    return new Promise((resolve) => {
      modal(`<h3>Données déjà présentes sur cet ordinateur</h3>
        <div class="sub" style="margin:0 0 16px">Veux-tu les ajouter à ce compte (playlists, titres aimés, ma musique) ou partir de zéro ?</div>
        <div class="row" style="justify-content:center;margin:0"><button class="btn small" id="ac-yes">Les importer</button><button class="btn ghost small" id="ac-no">Partir de zéro</button></div>`);
      byId('ac-yes').onclick = () => { closeModal(); resolve(true); };
      byId('ac-no').onclick = () => { closeModal(); resolve(false); };
    });
  }
  function applyCloud(pre, c) {
    const local = +localStorage.getItem(pre + 'sonora.updatedAt') || 0;
    if (!c || !c.data || (c.updatedAt || 0) <= local) return false;
    SYNC_KEYS.forEach((k) => { if (c.data[k] != null) localStorage.setItem(pre + k, c.data[k]); });
    localStorage.setItem(pre + 'sonora.updatedAt', String(c.updatedAt || 0));
    return true;
  }
  async function login() {
    if (!api.googleLogin || !api.googleState) { toast('Connexion Google indisponible : remplace aussi preload.js et main.js.'); return; }
    try {
      const st = await api.googleState();
      if (!st.configured) { setupHelp(); return; }
      toast('Connexion à Google… termine dans ton navigateur.');
      const p = await api.googleLogin();
      const pre = 'u.' + p.sub + '.';
      let cloud = null;
      try { cloud = await api.cloudPull(); } catch (e) { cloudWarn(e); }
      const got = applyCloud(pre, cloud);
      const accountHasData = SYNC_KEYS.some((k) => localStorage.getItem(pre + k) != null);
      if (!got && !accountHasData && guestHasData() && await askImport()) {
        SYNC_KEYS.concat(['sonora.library', 'sonora.settings', 'sonora.volume']).forEach((k) => { const v = localStorage.getItem(k); if (v != null) localStorage.setItem(pre + k, v); });
      }
      localStorage.setItem('sonora.session', JSON.stringify(p));
      location.reload();
    } catch (e) {
      const m = String((e && e.message) || e);
      if (m.includes('NO_CONFIG')) setupHelp();
      else if (m.includes('TIMEOUT')) toast('Connexion expirée, réessaie.');
      else toast('Connexion annulée ou refusée.');
    }
  }
  async function logout() {
    try { if (api.googleLogout) await api.googleLogout(); } catch (e) { /* ignore */ }
    localStorage.removeItem('sonora.session');
    location.reload();
  }
  function openAccount() {
    modal(`${profile.picture ? `<img alt="" referrerpolicy="no-referrer" src="${esc(profile.picture)}">` : ''}
      <div class="nm">${esc(profile.name || '')}</div><div class="em">${esc(profile.email || '')}</div>
      <div class="sub" style="margin-bottom:16px">Tes playlists, titres aimés et recherches récentes sont propres à ce compte et synchronisés avec ton Google Drive.</div>
      <div class="row" style="justify-content:center;margin:0"><button class="btn ghost small" id="ac-sync">Synchroniser maintenant</button><button class="btn small" id="ac-out">Se déconnecter</button></div>
      <div class="row" style="justify-content:center;margin:12px 0 0"><button class="btn ghost small" id="ac-close">Fermer</button></div>`);
    byId('ac-close').onclick = closeModal;
    byId('ac-out').onclick = logout;
    byId('ac-sync').onclick = async () => { try { await pushNow(); toast('Synchronisé avec Google Drive'); } catch (e) { cloudWarn(e, true); } };
  }

  // ---------- synchronisation (Google Drive, dossier privé de l'appli) ----------
  async function pushNow() {
    const data = {};
    SYNC_KEYS.forEach((k) => { const v = localStorage.getItem(prefix + k); if (v != null) data[k] = v; });
    await api.cloudPush({ updatedAt: +localStorage.getItem(prefix + 'sonora.updatedAt') || Date.now(), data });
  }
  let timer = 0;
  window.sonoraSync = (k) => {            // appelée par store() dans app.js à chaque enregistrement
    if (!profile || !SYNC_KEYS.includes(k)) return;
    localStorage.setItem(prefix + 'sonora.updatedAt', String(Date.now()));
    clearTimeout(timer);
    timer = setTimeout(() => pushNow().catch(cloudWarn), 5000);
  };
  async function startupSync() {
    if (!profile || !api.cloudPull) return;
    try {
      const c = await api.cloudPull();
      const local = +localStorage.getItem(prefix + 'sonora.updatedAt') || 0;
      if (c && c.data && (c.updatedAt || 0) > local) {
        applyCloud(prefix, c);
        if (!sessionStorage.getItem('sonora.synced')) { sessionStorage.setItem('sonora.synced', '1'); location.reload(); }
      } else if (!c || (c.updatedAt || 0) < local) await pushNow();
    } catch (e) { cloudWarn(e); }
  }
  setTimeout(startupSync, 2500);
})();
