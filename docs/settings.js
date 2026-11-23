// Sonora — fenêtre Paramètres (menu à gauche, réglages à droite) + réglages de lecture + raccourcis clavier.
(() => {
  'use strict';
  if (typeof S === 'undefined' || typeof VIEWS === 'undefined') return;
  const api = () => window.api || {};
  const REPO = 'https://github.com/nello343434/sonora';
  const modal = document.getElementById('settings-modal');
  const ICN = window.I;
  const val = (k, d) => (S.settings[k] === undefined ? d : S.settings[k]);
  const ic = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    overlay: ic('<rect x="3" y="13" width="11" height="7" rx="2"/><rect x="3" y="4" width="18" height="15" rx="3" opacity=".45"/>'),
    user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>'),
    discord: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
    play: ic('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
    kbd: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    look: ic('<path d="M12 3a9 9 0 100 18c1.4 0 2-1 2-2 0-1.5-1-1.7-1-3 0-1 1-2 2-2h3a3 3 0 003-3c0-4.4-4-8-9-8z"/><path d="M7.5 11h.01M10 7.5h.01M15 7.5h.01"/>'),
    yt: ic('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>'),
    db: ic('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    book: ic('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 002 2h13"/>'),
    help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2.2M12 17h.01"/>')
  };

  // ---------- éléments de réglage ----------
  const srow = (title, desc, ctrl) => `<div class="srow"><div class="sr-tx"><div class="sr-t">${title}</div>${desc ? `<div class="sr-d">${desc}</div>` : ''}</div><div class="sr-c">${ctrl}</div></div>`;
  const tog = (k, d) => `<button class="sw ${val(k, d) ? 'on' : ''}" role="switch" aria-checked="${!!val(k, d)}" data-st="tog" data-k="${k}"><i></i></button>`;
  const seg = (k, d, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${val(k, d) === v ? 'on' : ''}" data-st="seg" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const btn = (label, act, extra = '', cls = 'ghost') => `<button class="btn ${cls} small" data-st="act" data-a="${act}" ${extra}>${label}</button>`;

  // ---------- état asynchrone ----------
  const X = { capKey: false, pub: true, ytTest: '', cacheSize: null, info: null, confirm: false };
  async function loadAsync() {
    try { if (api().ytKeyStatus) { const s = await api().ytKeyStatus(); X.pub = s.pub !== false; } } catch (e) { /* valeur par défaut */ }
    try { if (api().cacheInfo) { const ci = await api().cacheInfo(); X.cacheSize = ci.size; X.free = ci.free; } } catch (e) { /* ignoré */ }
    try { if (api().appInfo) X.info = await api().appInfo(); } catch (e) { /* ignoré */ }
    paintContent();
  }
  const mb = (n) => n == null ? '…' : n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.round(n / 1024) + ' Ko';

  // ---------- panneaux ----------
  const KEYS = [['Espace', 'Lecture / pause'], ['Ctrl + →', 'Titre suivant'], ['Ctrl + ←', 'Titre précédent'], ['Ctrl + ↑ / ↓', 'Volume + / −'],
    ['M', 'Couper / rétablir le son'], ['S', 'Lecture aléatoire'], ['R', 'Répéter'], ['L', 'Aimer le titre en cours'], ['Ctrl + K', 'Rechercher'], ['Ctrl + ,', 'Ouvrir les paramètres'], ['Échap', 'Fermer la recherche / les paramètres']];
  // ---------- Apparence : Système / Clair / Sombre ----------
  function themeHTML() {
    const cur = S.settings.theme || 'system';
    const mock = (c) => `<div class="mk ${c}"><i class="dots"><u></u><u></u><u></u></i><div class="sb"><b></b><b></b><b></b><s></s></div><div class="ct"><b></b><b></b><b></b><b></b></div></div>`;
    const card = (k, label, pv) => `<button class="thc ${cur === k ? 'on' : ''}" data-act="theme" data-t="${k}" aria-pressed="${cur === k}"><div class="thp">${pv}<span class="ck"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.500"/></svg></span></div><span class="thl">${label}</span></button>`;
    return '<div class="thx">' + card('system', 'Système', mock('d') + '<div class="half">' + mock('l') + '</div>') + card('clair', 'Clair', mock('l')) + card('sombre', 'Sombre', mock('d')) + '</div>' +
      '<div class="sr-d" style="margin:10px 2px 0">« Système » suit automatiquement le thème clair ou sombre de Windows.</div>';
  }
  // ---------- Overlay ----------
  function overlayHTML() {
    const key = val('ovlKey', 'Alt+Shift+O'), cap = X.capKey;
    const chip = `<button class="kchip ${cap ? 'cap' : ''}" data-st="act" data-a="ovl-key">${cap ? 'Appuie sur les touches…' : esc(key.split('+').join(' + '))}</button>`;
    return '<div class="sgroup">' +
      srow('Activer l’overlay', 'Affiche un lecteur miniature flottant au-dessus des autres fenêtres.', tog('ovlOn', false)) +
      srow('Position', 'Choisissez où l’overlay apparaît sur votre bureau.', seg('ovlPos', 'tc', [['tl', 'En haut à gauche'], ['tc', 'En haut au centre'], ['tr', 'En haut à droite']])) +
      srow('Raccourci global', 'Affiche ou masque l’overlay depuis n’importe quelle application du système.', chip) +
      srow('Afficher à la réduction', 'Affiche automatiquement l’overlay quand Sonora est réduit.', tog('ovlMin', true)) +
      srow('Toujours au premier plan', 'Garde l’overlay au-dessus des autres fenêtres.', tog('ovlTop', true)) + '</div>';
  }
  // ---------- À propos ----------
  const AB = { msg: '', busy: false, st: null };
  try { if (window.api && window.api.onUpdate) window.api.onUpdate((s) => { AB.st = s; try { if (window.sonoraUpdNotif) window.sonoraUpdNotif(s); } catch (e) { /* ignoré */ } try { if (typeof paintContent === 'function' && document.querySelector('.about')) paintContent(); } catch (e) { /* ignoré */ } }); } catch (e) { /* ignoré */ }
  function updBlock() {
    const s = AB.st; if (!s) return '';
    if (s.state === 'downloading') return `<div class="ab-msg">Version ${esc(s.version || '')} trouvée : téléchargement ${s.pct || 0} %…</div>`;
    if (s.state === 'ready') return `<button class="ab-btn" data-st="act" data-a="update-install">Redémarrer pour installer la version ${esc(s.version || '')}</button>`;
    if (s.state === 'none') return '<div class="ab-msg">Tu as la dernière version.</div>';
    if (s.state === 'error') return `<div class="ab-msg">Mise à jour impossible : ${esc(s.error || '')}</div>`;
    return '';
  }
  function aboutHTML() {
    const i = X.info || {}, logo = (document.querySelector('.brand .logo') || {}).innerHTML || '';
    return `<div class="about"><div class="ab-logo">${logo}</div><div class="ab-name">Sonora</div><div class="ab-ver"><i></i>v${esc(i.version || '…')}</div>
      <div class="ab-info">Client ${esc(i.version || '…')} · Electron ${esc(i.electron || '…')} · Chromium ${esc(i.chrome || '…')}</div>
      <button class="ab-btn" data-st="act" data-a="update" ${AB.busy ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.400-5.700M20 4v4.500h-4.500"/></svg>${AB.busy ? 'Recherche…' : 'Rechercher des mises à jour'}</button>
      ${AB.msg && !AB.st ? `<div class="ab-msg">${AB.msg}</div>` : ''}${updBlock()}</div>
      <div class="ab-links"><button data-st="act" data-a="open" data-url="${REPO}">${ICN.github || ''}GitHub</button><button data-st="act" data-a="open" data-url="${REPO}#readme">${ICON.book}Documentation</button><button data-st="act" data-a="open" data-url="${REPO}/issues/new">${ICON.help}Signaler un problème</button></div>`;
  }
  // ---------- carte profil (bas de la navigation) ----------
  function userCard() {
    const PF = window.sonoraProfile, p = PF && PF.get();
    if (!p) return `<div class="set-user"><div class="who" data-st="pane" data-p="compte"><b>Créer un compte</b><span>Profil local</span></div></div>`;
    const handle = '@' + String(p.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
    return `<div class="set-user"><div class="av">${PF.avatar(p, 'sm')}${p.discord ? '<i></i>' : ''}</div><div class="who" data-st="pane" data-p="compte" title="Modifier mon profil"><b>${esc(p.name)}</b><span>${esc(handle)}</span></div>` +
      `<button class="lo" data-st="act" data-a="acc-out" title="Se déconnecter">${ICN.logout || ''}</button></div>`;
  }
  // ---------- Compte ----------
  async function doRename(v) {
    const p = window.sonoraProfile.get(); if (!p || String(v).trim() === p.name) { X.nameMsg = ''; return; }
    const r = await window.sonoraProfile.rename(v); X.nameMsg = r.ok ? '' : r.error; if (r.ok && window.toast) toast('Pseudo modifié'); paintContent();
  }
  function accountHTML() {
    const PF = window.sonoraProfile, p = PF && PF.get(), R = window.sonoraRpc || {};
    if (!p) return srow('Aucun compte', 'Crée un compte pour sauvegarder tes titres aimés, tes playlists et tes réglages.', btn('Créer un compte', 'acc-new'));
    const online = PF.online && PF.online(), gif = PF.isGif && PF.isGif(p.avatar);
    const kind = p.discord ? 'Compte lié à Discord' : online ? 'Compte Sonora · sauvegardé en ligne' : p.guest ? 'Invité' : 'Profil local';
    return `<div class="rpc-card">${PF.avatar(p, 'lg')}<div style="flex:1;min-width:0"><div class="nm">${esc(p.name)}</div><div class="stt">${kind}</div></div></div>` +
      '<div class="stg-h">Profil</div><div class="sgroup">' +
      srow('Pseudo', X.nameMsg ? `<span style="color:#ff6b6b">${esc(X.nameMsg)}</span>` : online ? 'Unique : personne d’autre ne peut avoir le même.' : 'Affiché sur l’accueil et dans le menu.',
        `<input id="acc-name" class="rpc-in" maxlength="24" value="${esc(p.name)}" spellcheck="false"> ${btn('Enregistrer', 'acc-name-save')}`) +
      srow('Photo de profil', 'JPG, PNG ou GIF animé (3 Mo maximum).', btn('Changer la photo', 'acc-photo') + (p.avatar ? (gif ? '' : ' ' + btn('Ajuster', 'acc-adjust')) + ' ' + btn('Retirer', 'acc-nophoto') : '')) +
      srow('Couleur', 'Utilisée quand tu n’as pas de photo.', `<div class="onb-cols" style="margin:0">${PF.COLORS.map((c) => `<button class="onb-col ${c === p.color ? 'on' : ''}" style="background:${c}" data-st="act" data-a="acc-color" data-c="${c}"></button>`).join('')}</div>`) +
      '</div><div class="stg-h">Connexions</div><div class="sgroup">' +
      srow('Discord', R.auth ? 'Connecté en tant que ' + esc(R.auth.name || 'ton compte') + '.' : 'Affiche ton écoute sur Discord et garde ton profil Discord.', R.auth ? btn('Déconnecter', 'acc-discord-out') : btn('Se connecter', 'acc-discord-in')) +
      (online ? srow('Sauvegarde en ligne', X.syncMsg || 'Titres aimés, playlists et réglages sont sauvegardés automatiquement.', btn('Sauvegarder maintenant', 'acc-sync')) : '') +
      '</div><div class="stg-h">Session</div><div class="sgroup">' +
      srow('Se déconnecter', online ? 'Sauvegarde ton compte puis efface tes données de cet ordinateur. Tu les retrouves en te reconnectant.' : 'Efface ce profil de cet ordinateur et relance l’écran de bienvenue (tes playlists et titres aimés restent).', btn('Se déconnecter', 'acc-out', '', 'danger')) +
      (online ? srow('Supprimer mon compte', X.delAsk ? 'Définitif : le compte et ses sauvegardes seront effacés. Clique encore pour confirmer.' : 'Efface définitivement ton compte et ses sauvegardes en ligne.', btn(X.delAsk ? 'Oui, supprimer' : 'Supprimer', X.delAsk ? 'acc-del-ok' : 'acc-del', '', 'danger')) : '') +
      '</div>';
  }
  // ---------- Discord RPC ----------
  const RPC_TXT = { off: ['Désactivé', ''], noid: ['ID d’application manquant', 'bad'], connecting: ['Connexion à Discord…', 'wait'], waiting: ['Discord introuvable : nouvel essai toutes les 8 s', 'wait'], ready: ['Prêt', 'ok'], error: ['Erreur', 'bad'] };
  function rpcHTML() {
    const R = window.sonoraRpc || { status: { state: 'off' }, clientId: '' }, st = R.status || { state: 'off' }, tx = RPC_TXT[st.state] || RPC_TXT.off;
    const hasApi = !!(api().rpcConfig);
    const u = st.user || R.auth, av = u && u.id && u.avatar ? `<img src="https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128" alt="">` : ICN.discord;
    const logged = !!R.auth, sub = R.busy ? 'En attente de l’autorisation…' : tx[0] + (st.error ? ' : ' + esc(st.error) : '');
    const act = logged ? btn('Se déconnecter', 'rpc-logout') : `<button class="btn primary small" data-st="act" data-a="rpc-login" ${R.busy ? 'disabled' : ''}>${R.busy ? 'En cours…' : 'Connexion'}</button>`;
    return `<div class="rpc-card"><div class="av">${av}</div><div style="flex:1;min-width:0"><div class="nm">${u && u.name ? esc(u.name) : 'Discord'}</div><div class="stt"><span class="dot ${R.busy ? 'wait' : logged && st.state === 'ready' ? 'ok' : tx[1]}"></span>${sub}</div></div>${act}</div>` +
      (R.msg ? `<div class="rpc-msg">${esc(R.msg)}</div>` : '') +
      (hasApi ? '' : '<div class="srow"><div class="sr-tx"><div class="sr-d">Mets à jour main.js, preload.js et discord-rpc.js, puis relance Sonora.</div></div></div>') +
      '<div class="sgroup">' + srow('Discord Rich Presence', 'Diffusez votre écoute musicale en cours sur votre profil Discord.', tog('rpcOn', false)) + '</div>' +
      (R.builtIn ? '' : '<div class="sgroup">' + srow('ID d’application Discord (avancé)', 'Cette version n’a pas d’ID Discord intégré : crée une application sur discord.com/developers et colle son « Application ID ».',
        `<input id="rpc-id" class="rpc-in" placeholder="123456789012345678" value="${esc(R.clientId || '')}" inputmode="numeric" autocomplete="off" spellcheck="false"> ${btn('Portail', 'open', 'data-url="https://discord.com/developers/applications"')}`) + '</div>') +
      '<div class="set-group">Options d’affichage</div><div class="sgroup">' +
      srow('Format du statut', 'Choisissez ce qui apparaît dans l’en-tête du statut « Écoute… » sur Discord.', `<select class="sel" data-st="sel" data-k="rpcFmt">${[['split', 'Titre / Artiste'], ['inline', 'Artiste - Titre'], ['title', 'Titre seul']].map(([v, l]) => `<option value="${v}" ${val('rpcFmt', 'split') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`) +
      srow('Barre de progression', 'Affiche une barre de progression interactive avec le temps écoulé et restant.', tog('rpcProg', true)) +
      srow('Pochette du titre', 'Affiche la pochette du titre ou de l’album sur la carte d’activité Discord.', tog('rpcCover', true)) +
      srow('Badge photo de l’artiste', 'Affiche la photo de l’artiste dans un petit badge circulaire au coin inférieur.', tog('rpcBadge', true)) +
      srow('Afficher en pause', 'Garde le statut visible sur Discord avec un indicateur de pause lorsque la musique est en pause.', tog('rpcPause', true)) + '</div>' +
      '<div class="set-group">Boutons du profil</div><div class="sgroup">' +
      srow('Bouton « Écouter sur Sonora »', 'Ajoute un bouton interactif renvoyant vers le titre (YouTube ou Deezer).', tog('rpcBtnListen', true)) +
      srow('Bouton « Télécharger Sonora »', 'Ajoute un bouton interactif renvoyant vers la page du projet pour télécharger l’application.', tog('rpcBtnDl', true)) + '</div>';
  }

  // ---------- Cache et stockage ----------
  const gb = (n) => n == null ? '…' : n >= 1073741824 ? (n / 1073741824).toFixed(0) + ' Go' : mb(n);
  function dataBytes() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sonora\./.test(k)) n += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { /* ignoré */ } return n; }
  function storageHTML() {
    const cache = X.cacheSize || 0, data = dataBytes(), tot = cache + data, max = Number(val('cacheMax', '3')) || 0;
    const big = tot > 1048576 ? (tot / 1048576).toFixed(1).replace('.', ',') : Math.max(1, Math.round(tot / 1024)), unit = tot > 1048576 ? 'Mo' : 'Ko';
    const pd = tot ? Math.max(2, Math.round(data / tot * 100)) : 0, pc = tot ? 100 - pd : 0;
    const nb = S.playlists.reduce((a, p) => a + p.tracks.length, 0);
    const grp = (title, rows) => `<div class="stg-h">${title}</div><div class="sgroup">${rows}</div>`;
    return `<div class="stor"><div class="stor-top"><div class="stor-n"><b>${big}</b> <span>${unit}</span></div><div class="stor-free">${X.free ? gb(X.free) + ' libres' : ''}</div></div>
      <div class="stor-bar"><i class="a" style="width:${pd}%"></i><i class="b" style="width:${pc}%"></i></div>
      <div class="stor-leg"><span><i class="a"></i>Tes données ${mb(data)}</span><span><i class="b"></i>Cache ${mb(cache)}</span></div></div>` +
      grp('Données',
        srow('Titres aimés', S.liked.length + ' titre' + (S.liked.length > 1 ? 's' : ''), '') +
        srow('Playlists', S.playlists.length + ' playlist' + (S.playlists.length > 1 ? 's' : '') + ' · ' + nb + ' titres', '') +
        srow('Musique locale', S.library.length + ' fichier' + (S.library.length > 1 ? 's' : '') + ' importé' + (S.library.length > 1 ? 's' : ''), '') +
        srow('Recherches récentes', 'Les artistes, albums et titres du menu de recherche.', btn('Vider', 'clear-hist')) +
        srow('Écoutés récemment', S.recent.length + ' titre' + (S.recent.length > 1 ? 's' : '') + ' sur l’accueil.', btn('Vider', 'clear-recent'))) +
      grp('Cache',
        srow('Images, paroles et pochettes', 'Enregistrées pendant que tu écoutes. Sonora les récupère à nouveau quand il en a besoin.', `<span class="stor-chip">${mb(cache)}</span>` + btn('Vider', 'clear-cache')) +
        srow('Taille maximale du cache', 'Les plus anciens fichiers sont supprimés en premier. Pris en compte au prochain lancement.', seg('cacheMax', '3', [['1', '1 Go'], ['3', '3 Go'], ['10', '10 Go'], ['0', 'Aucune limite']]))) +
      grp('Outils',
        srow('Importer une playlist depuis un fichier', 'CSV (Exportify, TuneMyMusic…), M3U, TXT « Artiste - Titre » ou JSON : jusqu’à 20 000 titres par playlist.', btn('Choisir un fichier', 'import-file')) +
        srow('Sauvegarde', 'Télécharge un fichier avec tes playlists, titres aimés et réglages.', btn('Exporter mes données', 'export')) +
        srow('Tout réinitialiser', 'Efface playlists, titres aimés, historique et réglages de Sonora.', X.confirm ? btn('Confirmer l’effacement', 'reset-all', '', 'danger') : btn('Réinitialiser…', 'reset-ask')));
  }

  const PANES = [
    { g: 'Compte', id: 'compte', label: 'Mon compte', icon: 'user', sub: 'Pseudo, photo, connexions et sauvegarde de ton compte.', html: () => accountHTML() },
    { g: 'Lecteur', id: 'lecture', label: 'Lecture', icon: 'play', sub: 'Comportement de la file d’attente, actions au clic et sortie audio.', html: () =>
      srow('Lecture automatique de titres similaires', 'Quand la file se termine, Sonora ajoute des titres du même univers (artiste et proches).', tog('autoSimilar', true)) +
      srow('Double-clic sur un titre', 'Un clic sélectionne la ligne, un double-clic fait l’action choisie (le bouton lecture sur le numéro lit toujours).', seg('dblAction', 'play', [['play', 'Lire immédiatement'], ['queue', 'Ajouter à la file d’attente']])) +
      srow('Contexte de lecture par défaut', 'Restaurer la dernière file d’attente au démarrage ou commencer à vide.', seg('ctxRestore', 'last', [['last', 'Reprendre la dernière file'], ['empty', 'Commencer à vide']])) +
      srow('Pause au changement de périphérique', 'Met la musique en pause quand un casque ou une enceinte est branché ou débranché.', tog('pauseOnDevice', true)) +
      srow('Flash blanc sur les basses', 'Dans le mode paroles, le fond s’éclaire brièvement à chaque basse. Désactive-le si tu le trouves trop lumineux.', tog('flash', true)) },
    { g: 'Lecteur', id: 'raccourcis', label: 'Raccourcis', icon: 'kbd', sub: 'Raccourcis clavier disponibles dans toute l’appli.', html: () =>
      '<div class="keys">' + KEYS.map(([k, d]) => `<div class="srow"><div class="sr-tx"><div class="sr-t">${d}</div></div><div class="sr-c">${k.split(' + ').map((x) => `<kbd>${esc(x)}</kbd>`).join('<span class="plus">+</span>')}</div></div>`).join('') + '</div>' },
    { g: 'Interface', id: 'apparence', label: 'Apparence', icon: 'look', sub: 'Choisis le thème de l’application.', html: () => themeHTML() },
    { g: 'Interface', id: 'overlay', label: 'Overlay', icon: 'overlay', sub: 'Comportement de l’overlay, raccourci global et position.', html: () => overlayHTML() },
    { g: 'Intégrations', id: 'youtube', label: 'YouTube', icon: 'yt', sub: 'Comment Sonora retrouve les titres en entier.', html: () =>
      srow('Lecture sans clé (non officiel)', 'Retrouve les vidéos sans clé ni compte. Contraire aux conditions de YouTube et peut cesser de fonctionner : en cas d’échec, Sonora joue des extraits de 30 s.', tog('__pub', X.pub).replace('data-st="tog" data-k="__pub"', 'data-st="pub"')) +
      srow('Tester la connexion', X.ytTest || 'Vérifie que la recherche sans clé fonctionne depuis ce PC.', btn('Tester', 'yt-test')) +
      (window.sonoraYtKey ? window.sonoraYtKey.html() : '') },
    { g: 'Intégrations', id: 'discord', label: 'Discord', icon: 'discord', sub: 'Affiche ce que tu écoutes sur Discord, avec la pochette et la barre de progression.', html: () => rpcHTML() },
    { g: 'Application', id: 'cache', label: 'Cache et stockage', icon: 'db', sub: 'Répartition du stockage, statistiques du cache local et fichiers multimédias.', html: () => storageHTML() },
    { g: 'Application', id: 'apropos', label: 'À propos', icon: 'info', sub: 'Lecteur de streaming musical moderne pour ordinateur, avec des paroles synchronisées à la syllabe.', html: () => aboutHTML() },
    { g: 'Aide', id: 'doc', label: 'Documentation', icon: 'book', sub: 'Guides pour installer, configurer et contribuer.', html: () =>
      srow('Guide d’installation et d’utilisation', 'README du projet.', btn('Ouvrir', 'open', 'data-url="' + REPO + '#readme"')) +
      srow('Contribuer au projet', 'Comment proposer une amélioration.', btn('Ouvrir', 'open', 'data-url="' + REPO + '/blob/main/CONTRIBUTING.md"')) +
      srow('Raccourcis clavier', 'La liste complète.', btn('Voir', 'goto', 'data-p="raccourcis"')) },
    { g: 'Aide', id: 'aide', label: 'Assistance', icon: 'help', sub: 'Un problème ? Une idée ?', html: () =>
      srow('Signaler un problème', 'Ouvre la page des tickets sur GitHub.', btn('Signaler', 'open', 'data-url="' + REPO + '/issues/new"')) +
      srow('Copier les infos de diagnostic', 'À coller dans ton message : version, système, réglages de lecture.', btn('Copier', 'diag')) }
  ];
  const GROUPS = ['Compte', 'Lecteur', 'Interface', 'Intégrations', 'Application', 'Aide'];

  // ---------- affichage ----------
  const ST = { pane: 'lecture', q: '' };
  const isOpen = () => !modal.classList.contains('hidden');
  function shell() {
    modal.innerHTML = `<div class="set-win" role="dialog" aria-label="Paramètres">
      <nav class="set-nav"><div class="set-q"><span>${ICN.search}</span><input id="set-q" placeholder="Rechercher dans les paramètres…" autocomplete="off" spellcheck="false"></div>
        <div class="set-navlist" id="set-navlist"></div>
        <div class="set-foot"><div id="set-foot-user" class="set-userw">${userCard()}</div></div></nav>
      <section class="set-main"><button class="set-x" data-st="close" title="Fermer (Échap)">${ICN.close}</button><div class="set-scroll" id="set-scroll"></div></section></div>`;
    paintNav(); paintContent();
  }
  function paintNav() {
    const nl = document.getElementById('set-navlist'); if (!nl) return;
    nl.innerHTML = GROUPS.map((g) => `<div class="sn-g">${g}</div><div class="sn-box">` + PANES.filter((p) => p.g === g).map((p) =>
      `<button class="sn-i ${ST.pane === p.id && !ST.q ? 'on' : ''}" data-st="pane" data-p="${p.id}">${ICON[p.icon]}<span>${p.label}</span></button>`).join('') + '</div>').join('');
  }
  function paintContent() {
    const sc = document.getElementById('set-scroll'); if (!sc || !isOpen()) return;
    const top = sc.scrollTop;
    sc.innerHTML = PANES.map((p) => `<section class="sp ${p.id === ST.pane ? 'cur' : ''}" data-p="${p.id}"><h2>${p.label}</h2><p class="sub">${p.sub}</p><div class="sp-body">${p.html()}</div></section>`).join('') + '<div class="empty sp-none hidden">Aucun paramètre ne correspond.</div>';
    sc.querySelectorAll('.sp-body').forEach((b) => {                     // lignes consécutives → une seule carte arrondie
      let run = [];
      const flush = () => { if (run.length) { const g = document.createElement('div'); g.className = 'sgroup'; run[0].before(g); run.forEach((r) => g.appendChild(r)); run = []; } };
      [...b.children].forEach((ch) => { if (ch.classList.contains('srow')) run.push(ch); else flush(); }); flush();
    });
    sc.scrollTop = top;
    if (window.sonoraYtKey) window.sonoraYtKey.paint();
    applyFilter();
  }
  function applyFilter() {
    const sc = document.getElementById('set-scroll'); if (!sc) return;
    const q = ST.q.trim().toLowerCase(); let any = false;
    sc.classList.toggle('searching', !!q);
    sc.querySelectorAll('.sp').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll('.srow, .set-group').forEach((r) => { const ok = !q || (r.textContent + ' ' + sec.querySelector('h2').textContent).toLowerCase().includes(q); r.classList.toggle('nomatch', !ok); if (ok) n++; });
      sec.classList.toggle('nomatch', !!q && n === 0);
      if (q && n) any = true;
    });
    sc.querySelector('.sp-none').classList.toggle('hidden', !q || any);
  }
  function open(pane) {
    if (pane) ST.pane = pane;
    ST.q = ''; X.confirm = false;
    modal.classList.remove('hidden'); shell(); loadAsync();
    setTimeout(() => { const f = document.getElementById('set-q'); if (f) f.blur(); }, 0);
  }
  function close() { modal.classList.add('hidden'); modal.innerHTML = ''; }
  window.sonoraSettings = { open, close, refreshUser: () => { const f = document.getElementById('set-foot-user'); if (f) f.innerHTML = userCard(); }, repaint: () => { if (isOpen() && !(document.activeElement && document.activeElement.id === 'rpc-id')) paintContent(); } };

  // « go('settings') » (menu latéral, ancien code) ouvre la fenêtre sans quitter la page en cours
  const baseGo = go;
  go = function (view, arg) { if (view === 'settings') return open(); return baseGo(view, arg); };
  const prevAfter = window.sonoraAfterRender;
  window.sonoraAfterRender = () => { if (prevAfter) prevAfter(); if (isOpen()) paintContent(); };

  // ---------- clics dans la fenêtre ----------
  const dl = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const shrinkImg = (url) => new Promise((res) => { const im = new Image(); im.onload = () => { const m = Math.min(im.width, im.height), c = document.createElement('canvas'); c.width = c.height = Math.min(256, m); c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .86)); }; im.onerror = () => res(url); im.src = url; });
  modal.addEventListener('change', (e) => {
    const sl = e.target.closest && e.target.closest('select[data-st="sel"]');
    if (sl) { const k = sl.dataset.k, v = sl.value; S.settings[k] = /^ovlOpacity$/.test(k) ? parseFloat(v) : v; persist(); if (/^rpc/.test(k) && window.sonoraRpc) window.sonoraRpc.sync(); if (/^ovl/.test(k) && window.sonoraOverlay) window.sonoraOverlay.sync(); paintContent(); return; } if (e.target.id === 'acc-name') doRename(e.target.value); if (e.target.id === 'rpc-id' && window.sonoraRpc) window.sonoraRpc.setId(e.target.value); });
  // saisie du raccourci global : au moins une touche Ctrl / Alt / Maj + une touche
  window.addEventListener('keydown', (e) => {
    if (!X.capKey) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { X.capKey = false; paintContent(); return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    let k = e.key.length === 1 ? e.key.toUpperCase() : ({ ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[e.key] || e.key);
    if (!mods.length) { toast('Ajoute Ctrl, Alt ou Maj au raccourci'); return; }
    S.settings.ovlKey = [...mods, k].join('+'); X.capKey = false; persist(); paintContent();
    if (window.sonoraOverlay) window.sonoraOverlay.sync();
  }, true);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
  modal.addEventListener('input', (e) => { if (e.target.id === 'set-q') { ST.q = e.target.value; paintNav(); applyFilter(); } });
  modal.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    const k = b.dataset.st;
    if (k === 'close') close();
    else if (k === 'pane') { ST.pane = b.dataset.p; ST.q = ''; const f = document.getElementById('set-q'); if (f) f.value = ''; paintNav(); paintContent(); document.getElementById('set-scroll').scrollTop = 0; }
    else if (k === 'tog') { S.settings[b.dataset.k] = !val(b.dataset.k, DEFAULTS[b.dataset.k]); persist(); paintContent(); if (/^rpc/.test(b.dataset.k) && window.sonoraRpc) window.sonoraRpc.sync(); if (/^ovl/.test(b.dataset.k) && window.sonoraOverlay) window.sonoraOverlay.sync(b.dataset.k === 'ovlOn' && !!S.settings.ovlOn); }
    else if (k === 'seg') { S.settings[b.dataset.k] = b.dataset.v; persist(); paintContent(); if (b.dataset.k === 'cacheMax' && api().setCacheLimit) api().setCacheLimit(Number(b.dataset.v) * 1073741824); if (/^rpc/.test(b.dataset.k) && window.sonoraRpc) window.sonoraRpc.sync(); if (/^ovl/.test(b.dataset.k) && window.sonoraOverlay) window.sonoraOverlay.sync(); }
    else if (k === 'pub') {
      X.pub = !X.pub; paintContent();
      try { if (api().ytPublicSet) await api().ytPublicSet(X.pub); else toast('Demande la dernière version de main.js et preload.js'); } catch (err) { /* ignoré */ }
    }
    else if (k === 'act') {
      const a = b.dataset.a;
      if (a === 'ovl-key') { X.capKey = !X.capKey; paintContent(); }
      else if (a === 'update-install') { try { await api().installUpdate(); } catch (err) { toast('Installation impossible'); } }
      else if (a === 'update') {
        AB.st = null;
        AB.busy = true; AB.msg = ''; paintContent();
        let r; try { r = await api().checkUpdate(); } catch (err) { r = { ok: false, error: 'indisponible (mets à jour main.js et preload.js)' }; }
        AB.busy = false;
        AB.msg = r.ok && r.auto ? (r.newer ? 'Version ' + esc(r.latest) + ' trouvée : téléchargement en cours…' : 'Tu as la dernière version.') : !r.ok ? 'Vérification impossible : ' + esc(r.error || '?') : r.none ? 'Aucune version publiée pour l’instant : tu as la dernière version.' : r.newer ? `Version ${esc(r.latest)} disponible. <a href="#" data-st="act" data-a="open" data-url="${esc(r.url)}" style="color:var(--text)">Télécharger</a>` : 'Tu as la dernière version (v' + esc(r.current) + ').';
        paintContent();
      }
      else if (a === 'import-file') { close(); if (window.sonoraImport) window.sonoraImport.pickFile(); }
      else if (a === 'acc-new') window.sonoraProfile.open();
      else if (a === 'acc-adjust') { const p = window.sonoraProfile.get(); if (p && p.avatar) { const v = await window.sonoraProfile.editPhoto(p.avatar); if (v) window.sonoraProfile.set({ avatar: v }); } }
      else if (a === 'acc-name-save') { const i = document.getElementById('acc-name'); if (i) await doRename(i.value); }
      else if (a === 'acc-discord-in') { if (window.sonoraRpc) await window.sonoraRpc.login(); window.sonoraProfile.refresh(); paintContent(); }
      else if (a === 'acc-discord-out') { if (window.sonoraRpc) await window.sonoraRpc.logout(); window.sonoraProfile.refresh(); paintContent(); }
      else if (a === 'acc-sync') { X.syncMsg = 'Sauvegarde…'; paintContent(); const ok = await window.sonoraProfile.push(true); X.syncMsg = ok ? '✓ Sauvegardé à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '✗ Échec : vérifie ta connexion.'; paintContent(); }
      else if (a === 'acc-del') { X.delAsk = true; paintContent(); setTimeout(() => { if (X.delAsk) { X.delAsk = false; paintContent(); } }, 6000); }
      else if (a === 'acc-del-ok') { X.delAsk = false; const ok = await window.sonoraProfile.deleteAccount(); if (!ok) { toast('Suppression impossible'); paintContent(); } }
      else if (a === 'acc-photo') { try { const u = await api().pickImageData(); if (u) { const v = await window.sonoraProfile.editPhoto(u); if (v) window.sonoraProfile.set({ avatar: v }); } } catch (err) { toast('Image impossible à lire'); } }
      else if (a === 'acc-nophoto') window.sonoraProfile.set({ avatar: null });
      else if (a === 'acc-color') window.sonoraProfile.set({ color: b.dataset.c });
      else if (a === 'acc-out') { close(); window.sonoraProfile.reset(); }
      else if (a === 'rpc-login') { if (window.sonoraRpc) window.sonoraRpc.login(); }
      else if (a === 'rpc-logout') { if (window.sonoraRpc) window.sonoraRpc.logout(); }
      else if (a === 'open') api().openExternal && api().openExternal(b.dataset.url);
      else if (a === 'goto') { ST.pane = b.dataset.p; paintNav(); paintContent(); }
      else if (a === 'clear-hist') { if (window.sonoraClearHist) window.sonoraClearHist(); else store('sonora.sh', []); toast('Recherches récentes effacées'); }
      else if (a === 'clear-recent') { S.recent = []; persist(); render(); paintContent(); toast('Écoutés récemment vidé'); }
      else if (a === 'clear-cache') { const ok = api().cacheClear ? await api().cacheClear() : false; try { X.cacheSize = (await api().cacheInfo()).size; } catch (err) { /* ignoré */ } toast(ok ? 'Cache vidé' : 'Impossible de vider le cache'); paintContent(); }
      else if (a === 'export') {
        const out = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (/^sonora\./.test(key)) out[key] = localStorage.getItem(key); }
        dl('sonora-sauvegarde.json', JSON.stringify(out, null, 2)); toast('Sauvegarde exportée');
      }
      else if (a === 'reset-ask') { X.confirm = true; paintContent(); setTimeout(() => { if (X.confirm) { X.confirm = false; paintContent(); } }, 5000); }
      else if (a === 'reset-all') { Object.keys(localStorage).filter((x) => /^sonora\./.test(x)).forEach((x) => localStorage.removeItem(x)); location.reload(); }
      else if (a === 'yt-test') {
        X.ytTest = 'Test en cours…'; paintContent();
        let r; try { r = await api().ytPublicTest(); } catch (err) { r = { ok: false, error: 'indisponible (mets à jour main.js et preload.js)' }; }
        X.ytTest = r.ok ? '✓ Ça fonctionne (' + r.count + ' vidéos trouvées).' : '✗ Échec : ' + r.error + '. Les titres seront lus en extraits de 30 s.'; paintContent();
      }
      else if (a === 'diag') {
        const i = X.info || {};
        const txt = ['Sonora ' + (i.version || '?'), 'Electron ' + (i.electron || '?') + ' / Chromium ' + (i.chrome || '?'), 'Système : ' + (i.platform || navigator.platform),
          'Lecture sans clé : ' + (X.pub ? 'oui' : 'non'), 'Titres similaires : ' + (val('autoSimilar', true) ? 'oui' : 'non')].join('\n');
        try { await navigator.clipboard.writeText(txt); toast('Infos copiées'); } catch (err) { toast('Copie impossible'); }
      }
    }
  });

  // ---------- réglages de lecture ----------
  // 1) titres similaires quand la file se termine (radio de l'artiste, Deezer)
  let simBusy = false;
  async function similar() {
    const D = window.sonoraDZ, last = S.queue[S.qi]; if (!D || !last) return false;
    let id = last.artistId;
    if (!id) {
      const r = await D.dz('/search/artist?limit=1&q=' + encodeURIComponent(String(last.artist || '').replace(/\s*-\s*Topic$/i, '')));
      id = r.data && r.data[0] && r.data[0].id;
    }
    if (!id) return false;
    const d = await D.dz('/artist/' + id + '/radio?limit=25');
    const fresh = (d.data || []).map((r) => { const t = D.mk(r); if (!t.image) t.hq = false; return t; }).filter((t) => !S.queue.some((x) => sameTrack(x, t)));
    if (!fresh.length) return false;
    S.queue.push(...fresh); queueChanged(); toast('Titres similaires ajoutés à la file');
    return true;
  }
  const baseNext = next;
  next = function (auto) {
    if (auto && val('autoSimilar', true) && S.repeat !== 1 && S.queue.length && S.qi >= S.queue.length - 1 && !simBusy) {
      simBusy = true;
      similar().then((ok) => { simBusy = false; if (ok) playIndex(S.qi + 1); else baseNext(auto); }).catch(() => { simBusy = false; baseNext(auto); });
      return;
    }
    return baseNext(auto);
  };

  // 2) reprise de la dernière file au démarrage
  let saveT = 0;
  const baseUpdate = updatePlayer;
  updatePlayer = function () {
    baseUpdate();
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (S.queue.length) store('sonora.lastq', { q: S.queue.slice(0, 200), i: S.qi }); }, 800);
  };
  if (val('ctxRestore', 'last') === 'last') {
    const d = load('sonora.lastq', null);
    if (d && Array.isArray(d.q) && d.q.length && !S.queue.length) {
      S.queue = d.q.map((t) => { if (t.preview30) { delete t.src; delete t.preview30; if (!t.videoId) t.source = 'youtube'; else t.source = 'youtube'; } return t; });
      S.qi = Math.max(0, Math.min(d.i, S.queue.length - 1)); S.restored = true;
      baseUpdate(); refreshPlayingMarks();
    }
  } else store('sonora.lastq', null);

  // 3) pause quand le périphérique audio change
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => { if (val('pauseOnDevice', true) && !isPaused()) togglePlay(); });
  }

  // ---------- raccourcis clavier ----------
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape' && isOpen()) { close(); return; }
    if (ctrl && e.key === ',') { e.preventDefault(); isOpen() ? close() : open(); return; }
    const a = document.activeElement, typing = a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable);
    if (typing || isOpen()) return;
    const vol = (d) => { const v = $('#volume'); v.value = Math.max(0, Math.min(100, +v.value + d)); v.dispatchEvent(new Event('input', { bubbles: true })); };
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (ctrl && e.key === 'ArrowRight') { e.preventDefault(); next(false); }
    else if (ctrl && e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (ctrl && e.key === 'ArrowUp') { e.preventDefault(); vol(5); }
    else if (ctrl && e.key === 'ArrowDown') { e.preventDefault(); vol(-5); }
    else if (!ctrl && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'm') $('#btn-mute').click();
      else if (k === 's') $('#btn-shuffle').click();
      else if (k === 'r') $('#btn-repeat').click();
      else if (k === 'l') { const t = S.queue[S.qi]; if (t) { toggleLike(t); updatePlayer(); render(); } }
    }
  });
})();
