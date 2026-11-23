// Sonora : gestion complète des playlists — clic droit (barre de gauche et titres), sélection multiple, suppression,
// doublons, inversion, export, import dans une playlist existante, réorganisation.
(() => {
  'use strict';
  if (typeof S === 'undefined' || typeof showMenu !== 'function') return;
  const $1 = (s) => document.querySelector(s);
  const curPl = () => S.playlists.find((x) => x.id === S.viewArg);
  const PM = { on: false, sel: new Set() };
  const plural = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');
  const done = (p, msg) => { persist(); renderPlaylists(); if (S.view === 'playlist' && S.viewArg === (p && p.id)) render(); if (msg) toast(msg); };
  const tk = (t) => ((t.title || '') + '|' + (t.artist || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9|]+/g, '');
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const csv = (p) => '﻿Titre,Artiste,Album,Durée (s)\n' + p.tracks.map((t) => [t.title, t.artist, t.album || '', t.duration || ''].map((x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\n');
  const safe = (n) => String(n || 'playlist').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);

  function removeIdx(p, idxs) {
    const s = new Set(idxs); const n = p.tracks.length;
    p.tracks = p.tracks.filter((_, k) => !s.has(k));
    done(p, plural(n - p.tracks.length, 'titre') + ' retiré' + (n - p.tracks.length > 1 ? 's' : ''));
  }
  function deletePlaylist(p) {
    if (!confirm('Supprimer « ' + p.name + ' » ? Les ' + plural(p.tracks.length, 'titre') + ' de cette playlist ne seront plus dans Sonora.')) return;
    S.playlists = S.playlists.filter((x) => x.id !== p.id); persist(); renderPlaylists();
    if (S.view === 'playlist' && S.viewArg === p.id) go('collection'); else render();
    toast('Playlist supprimée');
  }
  function rename(p) { askText('Renommer la playlist', 'Nom', (n) => { p.name = n.trim().slice(0, 80) || p.name; done(p, 'Playlist renommée'); }); const i = document.getElementById('modal-in'); if (i) { i.value = p.name; i.select(); } }
  function move(p, d) { const i = S.playlists.indexOf(p), j = i + d; if (j < 0 || j >= S.playlists.length) return; S.playlists.splice(i, 1); S.playlists.splice(j, 0, p); persist(); renderPlaylists(); }
  function dedupe(p) { const seen = new Set(); const n = p.tracks.length; p.tracks = p.tracks.filter((t) => { const k = tk(t); if (seen.has(k)) return false; seen.add(k); return true; }); done(p, n === p.tracks.length ? 'Aucun doublon' : plural(n - p.tracks.length, 'doublon') + ' supprimé' + (n - p.tracks.length > 1 ? 's' : '')); }
  function importInto(p) {
    const r = { left: innerWidth / 2 - 130, bottom: innerHeight / 2 - 40 };
    showMenu(r.left, r.bottom, [
      { label: 'Depuis un lien (Spotify, Deezer, Apple Music)', fn: () => askText('Ajouter à « ' + p.name + ' »', 'Lien Spotify, Deezer ou Apple Music', (u) => window.sonoraImport && window.sonoraImport.run(u, p.id)) },
      { label: 'Depuis un fichier (CSV, M3U, TXT, JSON)', fn: () => window.sonoraImport && window.sonoraImport.pickFile(p.id) }]);
  }
  function items(p, ctx) {
    const l = [];
    l.push({ label: 'Lire', fn: () => { if (p.tracks.length) playFrom(p.tracks, 0, p.name); else toast('Playlist vide'); } });
    l.push({ label: 'Lecture aléatoire', fn: () => { if (p.tracks.length) { S.shuffle = true; playFrom(p.tracks, Math.floor(Math.random() * p.tracks.length), p.name); } else toast('Playlist vide'); } });
    l.push({ label: 'Ajouter à la file d’attente', fn: () => { p.tracks.forEach((t) => queueAdd(t)); } });
    l.push({ label: 'Renommer', fn: () => rename(p) });
    if (ctx === 'side') l.push({ label: 'Modifier les détails (photo, couleur…)', fn: () => { go('playlist', p.id); setTimeout(() => { const e = $1('[data-pl="edit"]'); if (e) e.click(); }, 120); } });
    l.push({ label: 'Importer des titres dans cette playlist…', fn: () => importInto(p) });
    l.push({ label: 'Supprimer les doublons', fn: () => dedupe(p) });
    l.push({ label: 'Inverser l’ordre', fn: () => { p.tracks.reverse(); p.sort = 'custom'; done(p, 'Ordre inversé'); } });
    l.push({ label: 'Dupliquer', fn: () => { const c = { ...p, id: uid(), name: p.name + ' (copie)', tracks: p.tracks.map((t) => ({ ...t })) }; S.playlists.push(c); persist(); renderPlaylists(); go('playlist', c.id); toast('Playlist dupliquée'); } });
    l.push({ label: 'Exporter en CSV', fn: () => { dl(safe(p.name) + '.csv', csv(p), 'text/csv'); toast('Fichier exporté'); } });
    if (ctx === 'side') { l.push({ label: 'Monter dans la liste', fn: () => move(p, -1) }); l.push({ label: 'Descendre dans la liste', fn: () => move(p, 1) }); }
    if (p.tracks.length) l.push({ label: 'Vider la playlist', fn: () => { if (confirm('Retirer les ' + plural(p.tracks.length, 'titre') + ' de « ' + p.name + ' » ?')) { p.tracks = []; done(p, 'Playlist vidée'); } } });
    l.push({ label: 'Supprimer la playlist', fn: () => deletePlaylist(p) });
    return l;
  }
  window.sonoraPM = { items, deletePlaylist, rename };

  // ---------- clic droit : barre de gauche ----------
  document.getElementById('playlists').addEventListener('contextmenu', (e) => {
    const b = e.target.closest('[data-act="open-playlist"]'); if (!b) return;
    const p = S.playlists.find((x) => x.id === b.dataset.id); if (!p) return;
    e.preventDefault(); showMenu(e.clientX + 4, e.clientY, items(p, 'side'));
  });

  // clic droit sur une carte de la Bibliothèque
  document.addEventListener('contextmenu', (e) => {
    const c = e.target.closest('.lib-card'); if (!c) return;
    const p = S.playlists.find((x) => x.id === c.dataset.id); if (!p) return;
    e.preventDefault(); showMenu(e.clientX + 4, e.clientY, items(p, 'side'));
  });

  // ---------- clic droit sur un titre de playlist ----------
  document.addEventListener('contextmenu', (e) => {
    if (S.view !== 'playlist') return;
    const row = e.target.closest('.plp-track'); if (!row) return;
    const p = curPl(); if (!p) return; const k = +row.dataset.k, t = p.tracks[k]; if (!t) return;
    e.preventDefault();
    const sel = PM.on && PM.sel.size ? [...PM.sel] : [k];
    showMenu(e.clientX + 4, e.clientY, [
      { label: 'Lire', fn: () => playFrom(p.tracks, k, p.name) },
      { label: 'Lire ensuite', fn: () => queueNext(t) },
      { label: 'Ajouter à la file d’attente', fn: () => queueAdd(t) },
      { label: isLiked(t) ? 'Retirer des titres aimés' : 'Ajouter aux titres aimés', fn: () => { toggleLike(t); updatePlayer(); render(); } },
      ...S.playlists.filter((x) => x.id !== p.id).slice(0, 12).map((x) => ({ label: 'Ajouter à « ' + x.name + ' »', fn: () => addToPlaylist(x, t) })),
      { label: 'Déplacer en haut', fn: () => { const [it] = p.tracks.splice(k, 1); p.tracks.unshift(it); p.sort = 'custom'; done(p); } },
      { label: 'Déplacer en bas', fn: () => { const [it] = p.tracks.splice(k, 1); p.tracks.push(it); p.sort = 'custom'; done(p); } },
      { label: PM.on ? 'Quitter la sélection' : 'Sélectionner plusieurs titres', fn: () => toggleMode(!PM.on, k) },
      { label: sel.length > 1 ? 'Retirer ' + sel.length + ' titres de la playlist' : 'Retirer de la playlist', fn: () => { removeIdx(p, sel); PM.sel.clear(); paintBar(); } }
    ]);
  });

  // ---------- sélection multiple ----------
  const bar = document.createElement('div'); bar.id = 'pm-bar'; bar.className = 'pm-bar hidden'; document.body.appendChild(bar);
  function paintSel() { document.querySelectorAll('.plp-track').forEach((r) => r.classList.toggle('picked', PM.on && PM.sel.has(+r.dataset.k))); document.body.classList.toggle('pm-on', PM.on); const b = $1('[data-pm="mode"]'); if (b) b.classList.toggle('on', PM.on); }
  function paintBar() {
    const p = curPl();
    if (!PM.on || S.view !== 'playlist' || !p) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    bar.innerHTML = `<b>${PM.sel.size ? plural(PM.sel.size, 'sélectionné') : 'Choisis des titres'}</b><button data-keepmenu data-pm="all">${PM.sel.size === p.tracks.length && p.tracks.length ? 'Tout désélectionner' : 'Tout sélectionner'}</button>` +
      `<button data-keepmenu data-pm="queue" ${PM.sel.size ? '' : 'disabled'}>File d’attente</button><button data-keepmenu data-pm="moveto" ${PM.sel.size ? '' : 'disabled'}>Déplacer vers…</button>` +
      `<button class="danger" data-pm="del" ${PM.sel.size ? '' : 'disabled'}>Retirer</button><button data-pm="end">Terminer</button>`;
    paintSel();
  }
  function toggleMode(on, first) { PM.on = on; PM.sel.clear(); if (on && first != null) PM.sel.add(first); paintBar(); paintSel(); }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pm]'); if (!b || b.disabled) return; const p = curPl(); if (!p) return;
    const a = b.dataset.pm, picked = [...PM.sel].sort((x, y) => x - y);
    if (a === 'end') toggleMode(false);
    else if (a === 'all') { if (PM.sel.size === p.tracks.length) PM.sel.clear(); else p.tracks.forEach((_, k) => PM.sel.add(k)); paintBar(); }
    else if (a === 'queue') { picked.forEach((k) => queueAdd(p.tracks[k])); }
    else if (a === 'del') { removeIdx(p, picked); PM.sel.clear(); paintBar(); }
    else if (a === 'moveto') {
      const r = b.getBoundingClientRect(), others = S.playlists.filter((x) => x.id !== p.id);
      if (!others.length) { toast('Crée d’abord une autre playlist'); return; }
      showMenu(r.left, r.top - 8 - Math.min(others.length, 10) * 36, others.map((x) => ({ label: x.name, fn: () => {
        const have = new Set(x.tracks.map(tk)); const mv = picked.map((k) => p.tracks[k]);
        mv.forEach((t) => { if (!have.has(tk(t))) x.tracks.push({ ...t, addedAt: Date.now() }); });
        removeIdx(p, picked); PM.sel.clear(); paintBar(); toast(plural(mv.length, 'titre') + ' déplacé' + (mv.length > 1 ? 's' : '') + ' vers « ' + x.name + ' »');
      } })));
    }
  });
  // en mode sélection, un clic sur une ligne coche / décoche au lieu de lancer la lecture
  document.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-pm="mode"]'); if (sw) { toggleMode(!PM.on); e.stopPropagation(); return; }
    if (!PM.on || S.view !== 'playlist') return;
    const row = e.target.closest('.plp-track'); if (!row || e.target.closest('button')) return;
    e.stopPropagation(); e.preventDefault();
    const k = +row.dataset.k; PM.sel.has(k) ? PM.sel.delete(k) : PM.sel.add(k); paintBar();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!PM.on || S.view !== 'playlist' || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
    if (e.key === 'Escape') toggleMode(false);
    else if (e.key === 'Delete' && PM.sel.size) { const p = curPl(); if (p) { removeIdx(p, [...PM.sel]); PM.sel.clear(); paintBar(); } }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); const p = curPl(); if (p) { p.tracks.forEach((_, k) => PM.sel.add(k)); paintBar(); } }
  });
  // bouton « Sélectionner » dans la barre de la playlist
  const baseView = VIEWS.playlist;
  VIEWS.playlist = function () { return baseView().replace('<span class="plp-grow">', '<button class="plp-sort pm-mode" data-pm="mode" title="Sélectionner plusieurs titres">Sélectionner</button><span class="plp-grow">'); };
  const baseMarks = window.sonoraMarks; window.sonoraMarks = () => { if (baseMarks) baseMarks(); paintSel(); };
  const baseAfter = window.sonoraAfterRender; window.sonoraAfterRender = () => { if (baseAfter) baseAfter(); if (S.view !== 'playlist' && PM.on) toggleMode(false); else { paintBar(); paintSel(); } };
})();
