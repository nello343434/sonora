// Sonora — page de playlist façon Spotify, entièrement personnalisable :
// photo de couverture, nom, description, couleur, tri, recherche dans la playlist, affichage liste/compact,
// réordonner par glisser-déposer, ajout de titres depuis la page.
(() => {
  'use strict';
  if (typeof VIEWS === 'undefined' || typeof S === 'undefined') return;

  const SORTS = { custom: 'Ordre personnalisé', title: 'Titre', artist: 'Artiste', album: 'Album', added: 'Date d’ajout', dur: 'Durée' };
  const COLORS = ['#e8115b', '#ff6b3d', '#ffc233', '#1ed760', '#1fb6c9', '#4a6bff', '#9d7cff', '#ff7ac6', '#8b93a7'];
  const PV = { q: '', find: '', res: [], msg: '', t: 0, drag: -1 };
  const $1 = (s) => document.querySelector(s);
  const curPl = () => S.playlists.find((x) => x.id === S.viewArg);
  const nz = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dateFr = (ts) => (ts ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const totalTime = (list) => { const s = list.reduce((a, t) => a + (t.duration || 0), 0); return !s ? '' : ' · ' + (s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.round(s % 3600 / 60) + ' min' : Math.max(1, Math.round(s / 60)) + ' min'); };

  // ---------- liste affichée (tri + recherche) ----------
  function shown(p) {
    let list = p.tracks.map((t, k) => ({ t, k }));
    const q = nz(PV.q).trim();
    if (q) list = list.filter(({ t }) => nz(t.title + ' ' + t.artist + ' ' + (t.album || '')).includes(q));
    const by = p.sort || 'custom', dir = p.dir === 'desc' ? -1 : 1;
    if (by !== 'custom') {
      const key = { title: (t) => nz(t.title), artist: (t) => nz(t.artist), album: (t) => nz(t.album || ''), added: (t) => t.addedAt || 0, dur: (t) => t.duration || 0 }[by];
      list.sort((a, b) => { const x = key(a.t), y = key(b.t); return (x < y ? -1 : x > y ? 1 : a.k - b.k) * dir; });
    }
    return list;
  }
  function rowsHTML(p) {
    const list = shown(p);
    cur.list = list.map((x) => x.t);
    if (!list.length) return PV.q ? '<div class="empty">Aucun titre ne correspond à « ' + esc(PV.q) + ' ».</div>' : '<div class="empty">Cette playlist est vide.<br>Cherche des titres à ajouter juste en dessous.</div>';
    const drag = (p.sort || 'custom') === 'custom' && !PV.q;
    return list.map(({ t, k }, i) => `<div class="track plp-track${onNow(t) ? ' playing' : ''}" data-act="play-row" data-i="${i}" data-k="${k}"${drag ? ' draggable="true"' : ''}>` +
      `<div class="num">${onNow(t) ? EQ : i + 1}</div><div class="t-img" ${artStyle(t)}>${t.image ? '' : '♪'}</div>` +
      `<div class="plp-tx"><div class="t-title">${esc(t.title)}</div><div class="t-artist">${esc(t.artist)}</div></div>` +
      `<div class="t-artist plp-album">${esc(t.album || '')}</div><div class="t-artist plp-date">${dateFr(t.addedAt)}</div>` +
      `<button class="icon-btn ${isLiked(t) ? 'on' : ''}" data-act="like" data-i="${i}" title="J'aime">${isLiked(t) ? '♥' : '♡'}</button>` +
      `<div class="t-dur">${t.duration ? fmt(t.duration) : ''}</div><button class="icon-btn" data-act="more" data-i="${i}" title="Plus">⋯</button></div>`).join('');
  }
  const refreshList = (p) => { const l = $1('#plp-list'); if (l) l.innerHTML = rowsHTML(p); const m = $1('#plp-meta'); if (m) m.textContent = metaText(p); };
  const metaText = (p) => p.tracks.length + ' titre' + (p.tracks.length > 1 ? 's' : '') + totalTime(p.tracks);

  // ---------- ajout de titres depuis la page ----------
  function findHTML(p) {
    if (PV.msg) return `<div class="empty" style="padding:18px 0">${esc(PV.msg)}</div>`;
    return PV.res.map((t, i) => {
      const has = p.tracks.some((x) => sameTrack(x, t));
      return `<div class="plp-fr"><div class="t-img" ${artStyle(t)}>${t.image ? '' : '♪'}</div><div class="plp-tx"><div class="t-title">${esc(t.title)}</div><div class="t-artist">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</div></div>` +
        `<button class="btn ghost small" data-pl="add" data-i="${i}"${has ? ' disabled' : ''}>${has ? 'Ajouté ✓' : 'Ajouter'}</button></div>`;
    }).join('');
  }
  const paintFind = () => { const r = $1('#plp-find-res'), p = curPl(); if (r && p) r.innerHTML = findHTML(p); };
  function runFind(q) {
    const my = ++PV.t, DZ = window.sonoraDZ;
    if (!q.trim()) { PV.res = []; PV.msg = ''; paintFind(); return; }
    if (!DZ) { PV.msg = 'Recherche indisponible.'; paintFind(); return; }
    PV.msg = 'Recherche…'; paintFind();
    DZ.dz('/search?limit=8&q=' + encodeURIComponent(q.trim())).then((d) => { if (my !== PV.t) return; PV.res = (d.data || []).map((r) => DZ.mk(r)); PV.msg = PV.res.length ? '' : 'Aucun résultat'; paintFind(); })
      .catch(() => { if (my === PV.t) { PV.res = []; PV.msg = 'Impossible de joindre Deezer, réessaie.'; paintFind(); } });
  }

  // ---------- la page ----------
  function coverHTML(p) {
    const ims = p.tracks.map((t) => t.image).filter(Boolean);
    let cls = 'plp-cover', style = '', inner = '';
    if (p.cover) style = ` style="background-image:url('${esc(p.cover)}')"`;
    else if (ims.length >= 4) { cls += ' mosaic'; inner = ims.slice(0, 4).map((u) => `<i style="background-image:url('${esc(u)}')"></i>`).join(''); }
    else if (ims.length) style = ` style="background-image:url('${esc(ims[0])}')"`;
    else inner = '♪';
    return `<div class="${cls}" data-pl="edit"${style} title="Modifier les détails">${inner}<span class="plp-cover-edit"><b>✎</b>Choisir une photo</span></div>`;
  }
  VIEWS.playlist = function () {
    const p = curPl();
    if (!p) return '<div class="empty">Playlist introuvable.</div>';
    if (PV.id !== p.id) { PV.id = p.id; PV.q = ''; PV.find = ''; PV.res = []; PV.msg = ''; }   // autre playlist : on repart de zéro
    const n = p.name.length, fs = n <= 12 ? 64 : n <= 22 ? 48 : n <= 36 ? 34 : 26;
    const by = p.sort || 'custom', label = SORTS[by] + (by !== 'custom' ? (p.dir === 'desc' ? ' ↓' : ' ↑') : '');
    return `<div class="row" style="margin-bottom:10px"><button class="btn ghost small" data-act="goto" data-view="collection">← Bibliothèque</button></div>
      <div class="plp-head">${coverHTML(p)}<div class="plp-info"><div class="ph-kind">Playlist</div>
        <h1 class="plp-title" data-pl="edit" style="font-size:${fs}px" title="Modifier les détails">${esc(p.name)}</h1>
        ${p.desc ? `<div class="plp-desc">${esc(p.desc)}</div>` : ''}<div class="ph-meta" id="plp-meta">${metaText(p)}</div></div></div>
      <div class="plp-bar">
        <button class="plp-play" data-pl="play" title="Lire">▶</button>
        <button class="icon-btn plp-ib" data-pl="shuffle" title="Aléatoire">⤮</button>
        <button class="icon-btn plp-ib" data-pl="menu" title="Plus d’options">⋯</button>
        <span class="plp-grow"></span>
        <label class="plp-search"><span>⌕</span><input id="plp-q" placeholder="Rechercher dans la playlist" value="${esc(PV.q)}" autocomplete="off"></label>
        <button class="plp-sort" data-pl="sort" title="Trier">${label} ▾</button>
        <button class="icon-btn plp-ib" data-pl="view" title="Affichage">${p.view === 'compact' ? '▤' : '☰'}</button>
      </div>
      <div class="plp-hrow"><span>#</span><span></span><span>Titre</span><span class="plp-album">Album</span><span class="plp-date">Date d’ajout</span><span></span><span class="r">Durée</span><span></span></div>
      <div id="plp-list" class="${p.view === 'compact' ? 'plp-compact' : ''}">${rowsHTML(p)}</div>
      <div class="plp-find"><h2>Ajoutons du contenu à ta playlist</h2>
        <label class="plp-search big"><span>⌕</span><input id="plp-find" placeholder="Rechercher des titres à ajouter" value="${esc(PV.find)}" autocomplete="off"></label>
        <div id="plp-find-res">${findHTML(p)}</div></div>`;
  };
  // couleur de la playlist sur le fond de la page
  window.sonoraAfterRender = () => {
    const m = document.getElementById('main'); if (!m) return;
    const p = S.view === 'playlist' ? curPl() : null;
    m.classList.toggle('plp-view', !!p);
    if (p && p.color) m.style.setProperty('--plp-c', p.color); else m.style.removeProperty('--plp-c');
  };

  // ---------- fenêtre « Modifier les détails » ----------
  const shrink = (src, max) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .86)); };
    im.onerror = rej; im.src = src;
  });
  async function pickCover() {
    try {
      const api = window.api || {};
      const u = api.pickImageData ? await api.pickImageData() : await api.pickImage();
      if (!u) return null;
      return u.startsWith('data:') ? await shrink(u, 600) : u;
    } catch (e) { toast('Impossible de charger cette image'); return null; }
  }
  function openDetails(p) {
    let cover = p.cover || '', color = p.color || '';
    const m = document.getElementById('modal');
    const close = () => m.classList.add('hidden');
    const paintCover = () => { const c = $1('#pe-cover'); c.style.backgroundImage = cover ? `url('${cover}')` : ''; c.classList.toggle('has', !!cover); };
    const paintColors = () => $1('#pe-colors').innerHTML = `<button class="swatch auto ${color ? '' : 'active'}" data-c="" title="Automatique">A</button>` + COLORS.map((c) => `<button class="swatch ${c === color ? 'active' : ''}" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
    m.innerHTML = `<div class="box plp-edit"><h3>Modifier les détails</h3>
      <div class="plp-edit-grid"><div><div id="pe-cover" class="plp-edit-cover" title="Choisir une photo"><span>✎<br>Choisir une photo</span></div>
        <button class="btn ghost small" id="pe-nocover" style="margin-top:8px;width:100%">Retirer la photo</button></div>
        <div class="plp-edit-fields"><input id="pe-name" class="text-input" placeholder="Nom de la playlist" maxlength="80" value="${esc(p.name)}">
          <textarea id="pe-desc" class="text-input" rows="5" maxlength="300" placeholder="Ajoute une description facultative">${esc(p.desc || '')}</textarea></div></div>
      <div class="sub" style="margin:14px 0 8px">Couleur de la playlist</div><div class="swatches" id="pe-colors"></div>
      <div class="row" style="justify-content:flex-end;margin:20px 0 0"><button class="btn ghost small" id="pe-cancel">Annuler</button><button class="btn small" id="pe-save">Enregistrer</button></div></div>`;
    m.classList.remove('hidden'); m.onclick = (e) => { if (e.target === m) close(); };
    paintCover(); paintColors();
    $1('#pe-cover').onclick = async () => { const u = await pickCover(); if (u) { cover = u; paintCover(); } };
    $1('#pe-nocover').onclick = () => { cover = ''; paintCover(); };
    $1('#pe-colors').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { color = b.dataset.c; paintColors(); } };
    $1('#pe-cancel').onclick = close;
    $1('#pe-save').onclick = () => {
      p.name = $1('#pe-name').value.trim() || p.name; p.desc = $1('#pe-desc').value.trim();
      if (cover) p.cover = cover; else delete p.cover;
      if (color) p.color = color; else delete p.color;
      persist(); renderPlaylists(); close(); render(); toast('Playlist mise à jour');
    };
    setTimeout(() => $1('#pe-name').select(), 30);
  }

  // ---------- actions ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-pl]');
    if (!el || S.view !== 'playlist') return;
    const p = curPl(); if (!p) return;
    const r = el.getBoundingClientRect();
    switch (el.dataset.pl) {
      case 'edit': openDetails(p); break;
      case 'play': { const l = shown(p).map((x) => x.t); if (l.length) playFrom(l, 0); else toast('Playlist vide'); break; }
      case 'shuffle': { const l = shown(p).map((x) => x.t); if (l.length) { S.shuffle = true; playFrom(l, Math.floor(Math.random() * l.length)); } else toast('Playlist vide'); break; }
      case 'view': p.view = p.view === 'compact' ? 'list' : 'compact'; persist(); render(); break;
      case 'sort':
        showMenu(r.left, r.bottom + 4, Object.keys(SORTS).map((k) => ({ label: ((p.sort || 'custom') === k ? '✓ ' : '') + SORTS[k], fn: () => {
          if ((p.sort || 'custom') === k && k !== 'custom') p.dir = p.dir === 'desc' ? 'asc' : 'desc'; else { p.sort = k; p.dir = 'asc'; }
          persist(); render();
        } })));
        break;
      case 'menu':
        showMenu(r.left, r.bottom + 4, [
          { label: 'Modifier les détails', fn: () => openDetails(p) },
          { label: 'Ajouter à la file d’attente', fn: () => { if (p.tracks.length) p.tracks.forEach((t) => queueAdd(t)); } },
          { label: 'Dupliquer la playlist', fn: () => { const c = { ...p, id: uid(), name: p.name + ' (copie)', tracks: p.tracks.map((t) => ({ ...t })) }; S.playlists.push(c); persist(); go('playlist', c.id); toast('Playlist dupliquée'); } },
          { label: 'Supprimer la playlist', fn: () => { if (confirm('Supprimer « ' + p.name + ' » ?')) { S.playlists = S.playlists.filter((x) => x.id !== p.id); persist(); go('collection'); } } }
        ]);
        break;
      case 'add': {
        const t = PV.res[+el.dataset.i];
        if (!t || p.tracks.some((x) => sameTrack(x, t))) break;
        const c = { ...t, addedAt: Date.now() }; delete c._q;
        p.tracks.push(c); persist(); renderPlaylists(); refreshList(p); paintFind(); break;
      }
    }
  });
  document.addEventListener('input', (e) => {
    if (S.view !== 'playlist') return;
    if (e.target.id === 'plp-q') { PV.q = e.target.value; const p = curPl(); if (p) refreshList(p); }
    else if (e.target.id === 'plp-find') { PV.find = e.target.value; clearTimeout(PV.timer); PV.timer = setTimeout(() => runFind(PV.find), 350); }
  });

  // ---------- réordonner (ordre personnalisé, sans recherche) ----------
  const marks = () => document.querySelectorAll('.plp-track.drop-before,.plp-track.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  const rowOf = (e) => e.target.closest && e.target.closest('.plp-track[draggable="true"]');
  document.addEventListener('dragstart', (e) => { const r = rowOf(e); if (!r) return; PV.drag = +r.dataset.k; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'plp'); r.classList.add('dragging'); });
  document.addEventListener('dragover', (e) => {
    if (PV.drag < 0) return; const r = rowOf(e); if (!r) return;
    e.preventDefault(); marks(); const b = r.getBoundingClientRect();
    r.classList.add(e.clientY > b.top + b.height / 2 ? 'drop-after' : 'drop-before');
  });
  document.addEventListener('drop', (e) => {
    if (PV.drag < 0) return; const r = rowOf(e); if (!r) return; e.preventDefault();
    const p = curPl(); if (!p) return;
    const b = r.getBoundingClientRect(), k = +r.dataset.k, from = PV.drag;
    let to = e.clientY > b.top + b.height / 2 ? k + 1 : k;
    const [it] = p.tracks.splice(from, 1); if (to > from) to--;
    p.tracks.splice(to, 0, it); persist(); refreshList(p);
  });
  document.addEventListener('dragend', () => { PV.drag = -1; marks(); document.querySelectorAll('.plp-track.dragging').forEach((x) => x.classList.remove('dragging')); });

})();
