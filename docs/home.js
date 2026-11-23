// Sonora — page d'accueil « ce que les gens écoutent » : top albums, titres du moment, mixes par genre, artistes populaires.
// Source : classements Deezer (gratuits, sans clé). Les titres se lisent ensuite comme les autres (vidéo retrouvée au moment de lire).
(() => {
  'use strict';
  if (typeof S === 'undefined' || typeof VIEWS === 'undefined' || !window.sonoraDZ) return;
  const { dz, mk, VER, nameB } = window.sonoraDZ;
  const bgs = (u) => (u ? `style="background-image:url('${esc(u)}')"` : '');

  // id = genre Deezer ; short = nom affiché sur la pochette
  const MIXES = [
    { id: 132, name: 'Mix Pop', short: 'Pop', c: '#ff5fa2' }, { id: 116, name: 'Mix Rap & Hip-Hop', short: 'Rap', c: '#f5a524' },
    { id: 152, name: 'Mix Rock', short: 'Rock', c: '#e5484d' }, { id: 113, name: 'Mix Dance', short: 'Dance', c: '#3ec1d3' },
    { id: 165, name: 'Mix R&B', short: 'R&B', c: '#8e6bff' }, { id: 106, name: 'Mix Électro', short: 'Électro', c: '#2dd4a7' },
    { id: 197, name: 'Mix Latino', short: 'Latino', c: '#ff7a45' }, { id: 85, name: 'Mix Indé & Alternatif', short: 'Indé', c: '#6b8cff' },
    { id: 144, name: 'Mix Reggae', short: 'Reggae', c: '#3fb950' }, { id: 129, name: 'Mix Jazz', short: 'Jazz', c: '#d4a24c' },
    { id: 464, name: 'Mix Metal', short: 'Metal', c: '#9aa0a6' }
  ];
  const H = { albums: null, news: null, tracks: null, artists: null, mixes: {}, err: {}, started: false };
  const retryBtn = (k) => `<div class="empty" style="padding:14px 0">${esc(H.err[k])} <button class="btn small" data-hm="retry">Réessayer</button></div>`;

  function section(key, icon, title, body) {
    const h = `<div class="hm-h"><span class="hm-i">${icon}</span><h2>${title}</h2></div>`;
    if (H.err[key]) return h + retryBtn(key);
    if (!H[key]) return h + '<div class="hm-skel">' + '<i></i>'.repeat(6) + '</div>';
    return h + body();
  }
  const albumCard = (al) => `<div class="hm-album" data-lv="album" data-id="${al.id}"><div class="hm-cover" ${bgs(al.cover_big || al.cover_medium)}></div>` +
    `<div class="hm-ct">${esc(al.title)}</div><div class="hm-cs">${esc(al.artist ? al.artist.name : '')}</div></div>`;
  const newsCard = (al, i) => al.ap ? `<div class="hm-album" data-hm="apal" data-i="${i}"><div class="hm-cover" ${bgs(al.cover_big)}></div><div class="hm-ct">${esc(al.title)}</div><div class="hm-cs">${esc(al.artist ? al.artist.name : '')}</div></div>` : albumCard(al);
  const trackRow = (t, i) => `<div class="hm-trow${onNow(t) ? ' playing' : ''}" data-hm="trk" data-i="${i}">` +
    `<div class="hm-img" data-hm="playtrk" data-i="${i}" ${bgs(t.image)}>${onNow(t) ? EQB : `<span class="hm-play">${I.play}</span>`}</div>` +
    `<div class="hm-tx"><div class="hm-t">${esc(t.title)}</div><div class="hm-s">${nameB(t.artist, t.artistId)}</div></div>` +
    `<div class="hm-d">${t.duration ? fmt(t.duration) : ''}</div>` +
    `<button class="icon-btn" data-hm="more" data-keepmenu="1" data-i="${i}" title="Plus">${I.more}</button></div>`;
  const mixCard = (m) => {
    const tr = H.mixes[m.id], ims = tr ? tr.map((t) => t.image).filter(Boolean).slice(0, 4) : [];
    const mosaic = ims.length >= 4 ? `<div class="hm-mosaic">${ims.map((u) => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>` : '';
    return `<div class="hm-mix" data-hm="mix" data-id="${m.id}" style="--mc:${m.c}"><div class="hm-mixc">${mosaic}<span class="mb"><i></i><b>${esc(m.name)}</b></span></div>` +
      `<div class="hm-cs">${tr ? esc(tr.slice(0, 3).map((t) => t.artist).filter((v, i, a) => a.indexOf(v) === i).join(', ')) + '…' : 'Chargement…'}</div></div>`;
  };
  const artistCard = (a) => `<div class="hm-artist" data-lv="artist" data-id="${a.id}"><div class="hm-cover round" ${bgs(a.picture_big || a.picture_medium)}></div>` +
    `<div class="hm-ct" style="text-align:center">${nameB(a.name, a.id)}</div><div class="hm-cs" style="text-align:center">Artiste</div></div>`;

  // Mix quotidiens : 4 mixes par genre qui changent chaque jour
  const day = () => Math.floor(Date.now() / 864e5);
  // ----- mixes personnalisés : uniquement d'après les artistes qu'on RECHERCHE et les titres écoutés EN ENTIER -----
  const PAL = ['#ff5fa2', '#f5a524', '#3ec1d3', '#8e6bff', '#2dd4a7', '#ff7a45', '#6b8cff', '#e5484d', '#3fb950', '#d4a24c'];
  const PM = {};
  const getMix = (id) => MIXES.find((x) => String(x.id) === String(id)) || PM[id] || (H.plan || []).find((x) => x && String(x.id) === String(id));   // le plan du jour peut venir du cache : PM est alors vide
  const firstArtist = (s) => String(s || '').split(/,|&| feat\.?| ft\.?| x /i)[0].trim();
  const nrm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  // mémoire du goût : { clé: { n: nom, s: recherches, l: écoutes complètes, q: vrai si ça vient d'un texte tapé } }
  let TASTE = (typeof load === 'function' ? load('sonora.taste', {}) : {}) || {};
  const saveTaste = () => { try { store('sonora.taste', TASTE); } catch (e) { /* ignoré */ } };
  const bump = (raw, f, w, q) => { const n = firstArtist(raw), k = nrm(n); if (!k || n.length < 2) return; const o = TASTE[k] || (TASTE[k] = { n, s: 0, l: 0, q: !!q }); o[f] += w; if (!q) o.q = false; saveTaste(); };
  window.sonoraTaste = { search: (name, w, q) => bump(name, 's', w || 3, q), listen: (name) => bump(name, 'l', 3) };
  // un titre écoulé jusqu'au bout (passage automatique au suivant) compte comme « écouté en entier »
  try { const _next = next; next = function (auto) { try { if (auto === true) { const t = S.queue[S.qi]; if (t && t.artist) window.sonoraTaste.listen(t.artist); } } catch (e) { /* ignoré */ } return _next.apply(this, arguments); }; } catch (e) { /* ignoré */ }
  // première fois : on reprend les recherches déjà faites
  try { if (!Object.keys(TASTE).length && window.sonoraHist) window.sonoraHist.get().forEach((x) => { if (x.kind === 'artist') window.sonoraTaste.search(x.title, 3); else if (x.kind === 'track') window.sonoraTaste.search(x.track && x.track.artist, 2); else if (x.kind === 'album') window.sonoraTaste.search(String(x.sub || '').split('•')[1], 2); else if (x.kind === 'q') window.sonoraTaste.search(x.title, 1, true); }); } catch (e) { /* ignoré */ }
  const GNAME = { 'Rap/Hip Hop': 'Rap', 'Electro': 'Électro', 'Latin Music': 'Latino', 'Alternative': 'Indé', 'Variété française': 'Variété', 'Films/Games': 'BO' };
  let GEN = (typeof load === 'function' ? load('sonora.genre2', {}) : {}) || {};
  async function genreOf(k, n) {
    if (GEN[k]) return GEN[k];
    const info = window.dzArtistInfo ? await window.dzArtistInfo(n) : null; if (!info || !info.id) return null;
    const top = await dz('/artist/' + info.id + '/top?limit=3'), al = (top.data || []).map((r) => r.album && r.album.id).find(Boolean);
    let g = 'Pop', gid = 132; if (al) { const d = await dz('/album/' + al); const x = d.genres && d.genres.data && d.genres.data[0]; if (x && x.name) { g = x.name; gid = x.id; } }
    GEN[k] = { id: info.id, name: info.name, genre: GNAME[g] || g, gid }; try { store('sonora.genre2', GEN); } catch (e) { /* ignoré */ } return GEN[k];
  }
  // plan du jour : 4 à 5 mixes, un par style que tu écoutes vraiment
  const pool = async (n, items, fn) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]; try { await fn(x); } catch (e) { /* ignoré */ } } })); };
  async function planMixes() {
    const list = Object.entries(TASTE).map(([k, o]) => ({ k, o, w: o.s + o.l })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w).slice(0, 8);
    if (!list.length) return null;
    const gres = new Map(); await pool(4, list, async (x) => { gres.set(x.k, await genreOf(x.k, x.o.n)); });
    const groups = new Map();
    for (const x of list) {
      const g = gres.get(x.k) || null;
      if (!g) continue;
      if (x.o.q && nrm(g.name) !== x.k) continue;                          // un texte tapé qui n'est pas vraiment un artiste : ignoré
      const grp = groups.get(g.genre) || { genre: g.genre, gid: g.gid, w: 0, seeds: [] }; grp.w += x.w; grp.seeds.push({ id: g.id, name: g.name, w: x.w }); groups.set(g.genre, grp);
    }
    const k = day(), gl = [...groups.values()].sort((a, b) => b.w - a.w), out = [];
    const mkMix = (g, i, disc) => {
      const s = g.seeds.slice(), off = s.length ? k % s.length : 0, seeds = [...s.slice(off), ...s.slice(0, off)].slice(0, 4), id = 'g:' + g.genre + (disc ? ':d' : '');
      return PM[id] = { id, name: 'Mix ' + g.genre + (disc ? ' Découverte' : ''), short: g.genre + (disc ? ' Découverte' : ''), c: PAL[(i + k + (disc ? 4 : 0)) % PAL.length], pers: true, disc, gid: g.gid, seeds, who: g.seeds.map((z) => z.name) };
    };
    gl.slice(0, 5).forEach((g, i) => out.push(mkMix(g, i, false)));
    // moins de 4 styles : on ajoute des mixes « Découverte » (artistes proches, sans tes artistes) pour tes styles préférés
    for (let i = 0; out.length < 4 && gl.length && i < gl.length * 2; i++) { const g = gl[i % gl.length], id = 'g:' + g.genre + ':d'; if (!out.some((m) => m.id === id)) out.push(mkMix(g, out.length, true)); }
    return out.length ? out : null;
  }
  const DAILY = () => {
    const k = day(), out = (H.plan || []).map((m, i) => ({ m, n: i + 1 }));
    for (let i = 0; out.length < 6 && (!H.plan || out.length < 4); i++) out.push({ m: MIXES[(k * 3 + i) % MIXES.length], n: out.length + 1 });   // pas encore de goût connu : mixes par genre
    return out;
  };
  // titres d'un mix : les meilleurs titres des artistes choisis + ceux d'artistes proches dans le même style
  async function loadPers(m) {
    const lists = [], seedN = new Set(m.seeds.map((s) => nrm(s.name))), rel = new Map();
    for (const s of m.seeds) {
      if (!m.disc) { try { const d = await dz('/artist/' + s.id + '/top?limit=7'); lists.push((d.data || []).map((r) => mk(r))); } catch (e) { /* ignoré */ } }
      try { const r = await dz('/artist/' + s.id + '/related?limit=8'); (r.data || []).forEach((a) => { if (!seedN.has(nrm(a.name)) && rel.size < 12) rel.set(a.id, a); }); } catch (e) { /* ignoré */ }
    }
    for (const a of rel.values()) { try { const d = await dz('/artist/' + a.id + '/top?limit=5'); lists.push((d.data || []).map((r) => mk(r))); } catch (e) { /* ignoré */ } }
    if (m.gid) { try { const d = await dz('/chart/' + m.gid + '/tracks?limit=30'); const off = m.disc ? 0 : 10; lists.push((d.data || []).map((r) => mk(r)).slice(0, m.disc ? 30 : 12)); void off; } catch (e) { /* ignoré */ } }
    const seen = new Set(), res = [];
    for (let i = 0; i < 12; i++) lists.forEach((l) => { const t = l[i]; const key = t && (t.id || t.title + t.artist); if (t && !seen.has(key) && !(m.disc && seedN.has(nrm(t.artist)))) { seen.add(key); res.push(t); } });
    return res.slice(0, 45);
  }
  const dmCard = ({ m, n }) => {
    const tr = H.mixes[m.id] || [], who = tr.length ? tr.map((t) => t.artist).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4).join(', ') : 'Chargement…';
    // pochettes des 4 premiers titres du mix (nettes, sans flou)
    const seen = new Set(), ims = []; for (const t of tr) { if (t.image && !seen.has(t.image)) { seen.add(t.image); ims.push(t.image); if (ims.length === 4) break; } }
    const grid = ims.length ? `<div class="hm-dmg n${Math.min(ims.length, 4)}">${ims.map((u) => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>` : '';
    const logo = (document.querySelector('.brand .logo') || {}).innerHTML || '';
    return `<div class="hm-dm" data-hm="mix" data-id="${m.id}"><div class="hm-dmc" style="background-color:${m.c}55">${grid}<span class="mb" style="--mc:${m.c}"><i></i><b>Mix ${esc(m.short)}</b></span></div>` +
      `<div class="hm-ct" style="margin-top:10px">${m.pers ? 'Mix ' + esc(m.short) : 'Mix quotidien ' + esc(m.short)}</div><div class="hm-cs">${esc(who)}</div></div>`;
  };
  // « Recherches récentes » en tête de l'accueil (grille de tuiles compactes)
  const histSection = () => {
    const hh = (window.sonoraHist && window.sonoraHist.get()) || []; if (!hh.length) return '';
    return `<div class="rs-h"><h2>Recherches récentes</h2><button class="rs-clear" data-hm="hclear">Effacer</button></div><div class="rs-grid">` +
      hh.slice(0, 10).map((x, i) => `<div class="rs-t" data-hm="hist" data-i="${i}" title="${esc(x.title)}"><div class="rs-i${x.round ? ' round' : ''}" style="background-image:url('${esc(x.img || '')}')"></div>` +
        `<div class="rs-x"><div class="rs-n">${esc(x.title)}</div><div class="rs-s">${esc(x.sub || '')}</div></div><button class="rs-rm" data-hm="hrm" data-i="${i}" title="Retirer">×</button></div>`).join('') + '</div>';
  };
  const DAILY_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9z"/><path d="M18.5 12.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".9"/><path d="M18 3l.6 1.6L20.2 5.2l-1.6.6L18 7.4l-.6-1.6-1.6-.6 1.6-.6z" opacity=".8"/></svg>';
  const dailySection = () => `<div class="hm-h"><span class="hm-i col">${DAILY_ICON}</span><h2>Mix quotidiens</h2></div><div class="hm-scroll">${DAILY().map(dmCard).join('')}</div>`;
  function homeHTML() {
    const W = (g, h) => `<div class="hm-sec" data-g="${g}">${h}</div>`;
    return W('base', histSection() + dailySection()) +
      W('new', section('news', I.sparkle, 'Nouveautés', () => `<div class="hm-wrap"><button class="hm-arrow l" data-hm="scroll" data-d="-1">‹</button><div class="hm-scroll">${H.news.map(newsCard).join('')}</div><button class="hm-arrow r" data-hm="scroll" data-d="1">›</button></div>`)) +
      W('trend', section('tracks', I.flame, 'En écoute en ce moment', () => `<div class="hm-tracks">${H.tracks.slice(0, 12).map(trackRow).join('')}</div>`) +
      section('albums', I.album, 'Top albums', () => `<div class="hm-wrap"><button class="hm-arrow l" data-hm="scroll" data-d="-1">‹</button><div class="hm-scroll">${H.albums.map(albumCard).join('')}</div><button class="hm-arrow r" data-hm="scroll" data-d="1">›</button></div>`)) +
      W('base',`<div class="hm-h"><span class="hm-i">${I.sparkle}</span><h2>Mixes</h2></div><div class="hm-scroll hm-mixes">${MIXES.map(mixCard).join('')}</div>`);
  }
  const paint = () => { const r = document.getElementById('home-root'); if (r) { r.innerHTML = homeHTML(); if (window.sonoraMarks) window.sonoraMarks(); } };
  document.addEventListener('sonora:hist', () => paint());
  VIEWS.home = () => '<div id="home-root">' + homeHTML() + '</div>';

  const job = (key, path, fn) => dz(path).then((d) => { H[key] = fn(d.data || []); delete H.err[key]; })
    .catch((e) => { if (H[key]) return; H.err[key] = 'Impossible de charger (' + String((e && e.message) || e).replace(/^Error: /, '').slice(0, 60) + ').'; }).finally(paint);
  // cache de l'accueil : au lancement on affiche tout de suite la dernière version connue, puis on rafraîchit en arrière-plan
  const HCK = 'sonora.homecache';
  let HC = (typeof load === 'function' ? load(HCK, {}) : {}) || {};
  const saveHC = () => { try { store(HCK, HC); } catch (e) { /* ignoré */ } };
  // Nouveautés de novembre 2026 enregistrées dans l'app : affichées tout de suite au lancement (à mettre à jour chaque mois)
  const NEWS_SEED = [['Fresh', 'Lil Baby'], ['The Fork & Knife', 'Skepta'], ['Sweet Action II', 'Jack Harlow'], ['FINAL GIRL', 'Dove Cameron'],
    ['O My Beloved', 'Kings of Leon'], ['Dream Fatigue', 'Rex Orange County'], ['OTIS', 'Conway the Machine'], ['HEELMATIC', 'Westside Gunn']];
  const seedItems = () => NEWS_SEED.map(([t, a], i) => ({ ap: true, seed: true, id: 'sd' + i, title: t, artist: { name: a }, cover_big: ((HC.seed || {})[i] || {}).c || '', did: ((HC.seed || {})[i] || {}).d, q: [t, a] }));
  const seedCovers = () => {
    if (!H.news || !H.news.some((x) => x.seed && !x.cover_big)) return;
    H.news.forEach((x, i) => { if (!x.seed || x.cover_big) return;
      dz('/search/album?limit=1&q=' + encodeURIComponent('artist:"' + x.q[1] + '" album:"' + x.q[0] + '"')).then((d) => {
        const a = d.data && d.data[0]; if (!a) return; x.cover_big = a.cover_big || a.cover_medium || ''; x.did = a.id;
        HC.seed = HC.seed || {}; HC.seed[i] = { c: x.cover_big, d: a.id }; saveHC(); paint();
      }).catch(() => {});
    });
  };
  function loadHome(force) {
    if (H.started && !force) return;
    H.started = true;
    for (const k of Object.keys(H.err)) { delete H.err[k]; H[k] = null; }
    if (HC.albums && !H.albums) H.albums = HC.albums;
    if (HC.tracks && !H.tracks) H.tracks = HC.tracks;
    const fresh = !force && HC.day === day() && HC.plan !== undefined;
    if (fresh) { H.plan = HC.plan; Object.assign(H.mixes, HC.mixes || {}); }
    paint();
    if (force || !HC.albums || Date.now() - (HC.ts || 0) > 6 * 36e5) {
      job('albums', '/chart/0/albums?limit=20', (d) => d).then(() => { if (H.albums) { HC.albums = H.albums; HC.ts = Date.now(); saveHC(); } });
      job('tracks', '/chart/0/tracks?limit=20', (d) => d.map((r) => mk(r))).then(() => { if (H.tracks) { HC.tracks = H.tracks; saveHC(); } });
    }
    if (!H.news) { H.news = (HC.news && HC.news.length) ? HC.news : seedItems(); paint(); seedCovers(); }
    if (force || Date.now() - (HC.nts || 0) > 10 * 36e5) (async () => {
      try {
        // sorties récentes d'Apple Music (FR + US) : affichées tout de suite, l'album Deezer n'est retrouvé qu'au clic
        const lim = Date.now() - 75 * 864e5;
        const lists = await Promise.all(['fr', 'us'].map((c) => Promise.race([window.api.fetchJson('https://rss.applemarketingtools.com/api/v2/' + c + '/music/most-played/100/albums.json'), new Promise((_, rj) => setTimeout(() => rj(new Error('T')), 6000))]).then((d) => (d && d.feed && d.feed.results) || []).catch(() => [])));
        const rec = [], k0 = new Set();
        lists.flat().forEach((r) => { const t = Date.parse(r.releaseDate); const k = (r.artistName + '|' + r.name).toLowerCase(); if (t >= lim && !k0.has(k)) { k0.add(k); rec.push(r); } });
        rec.sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));
        const out = rec.slice(0, 24).map((r) => ({
          ap: true, id: 'ap' + r.id, title: r.name, artist: { name: r.artistName }, cover_big: String(r.artworkUrl100 || '').replace(/\/\d+x\d+(bb)?\./, '/400x400bb.'),
          q: [String(r.name).replace(/\s*[-(\[].*(deluxe|edition|version|expanded|ep|single).*$/i, '').replace(/"/g, ''), String(r.artistName).split(/ & |, | feat/i)[0].replace(/"/g, '')]
        }));
        if (out.length) { H.news = out; H.newsApple = true; delete H.err.news; paint(); }
        else {
          const rs = await Promise.all([0, 116, 132, 466].map((g) => dz('/editorial/' + g + '/releases?limit=10').then((d) => d.data || []).catch(() => [])));
          const o = []; for (let n = 0; n < 10; n++) rs.forEach((r) => { if (r[n]) o.push(r[n]); });
          if (!H.news || !H.news.length) { if (o.length) { H.news = o; delete H.err.news; } else if (H.albums) { H.news = H.albums.slice(0, 12); delete H.err.news; } else H.err.news = 'Aucune nouveauté pour le moment.'; }
          paint();
        }
      } catch (e) { if (!H.news) H.err.news = 'Impossible de charger les nouveautés.'; paint(); }
    })().then(() => { if (H.newsApple && H.news && H.news.length) { HC.news = H.news; HC.nts = Date.now(); saveHC(); } });
    const one = async (m) => {
      if (H.mixes[m.id] && H.mixes[m.id].length) return;
      try { if (m.pers) H.mixes[m.id] = await loadPers(m); else { const d = await dz('/chart/' + m.id + '/tracks?limit=30'); H.mixes[m.id] = (d.data || []).map((r) => mk(r)); } paint(); } catch (e) { if (m.pers) H.mixes[m.id] = []; }
    };
    (async () => {
      if (!fresh) { const p = await planMixes().catch(() => null); H.plan = p; HC.plan = p; HC.day = day(); HC.mixes = {}; paint(); }
      await pool(2, DAILY().map((x) => x.m), one);                       // d'abord ceux de l'accueil
      MIXES.forEach((m) => { if (H.mixes[m.id]) HC.mixes[m.id] = H.mixes[m.id]; });
      DAILY().forEach((x) => { if (H.mixes[x.m.id]) HC.mixes[x.m.id] = H.mixes[x.m.id]; }); saveHC();
      setTimeout(async () => { await pool(2, MIXES, one); MIXES.forEach((m) => { if (H.mixes[m.id]) HC.mixes[m.id] = H.mixes[m.id]; }); saveHC(); }, 2500);   // la section « Mixes » plus tard
    })();
  }
  const prevAfter = window.sonoraAfterRender;
  window.sonoraAfterRender = () => { if (prevAfter) prevAfter(); if (S.view === 'home') loadHome(); };
  // le chargement a pu être demandé avant le chargement de ce fichier
  if (S.view === 'home') render();


  // ouverture d'un mix : la page s'ouvre tout de suite ; si le mix n'est pas encore chargé on le charge (2 essais, 12 s max chacun)
  const FAILED = {}, LOADING = {};
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), ms))]);
  async function openMix(id) {
    const m = getMix(id); if (!m) { toast('Mix introuvable'); return; }
    go('mix', m.id);
    if ((H.mixes[m.id] || []).length || LOADING[m.id]) return;
    LOADING[m.id] = true; delete FAILED[m.id];
    let l = [];
    for (let n = 0; n < 2 && !l.length; n++) {
      try { l = await withTimeout(m.pers ? loadPers(m) : dz('/chart/' + m.id + '/tracks?limit=30').then((d) => (d.data || []).map((r) => mk(r))), 12000); } catch (e) { l = []; }
    }
    delete LOADING[m.id];
    if (l && l.length) { H.mixes[m.id] = l; try { HC.mixes = HC.mixes || {}; HC.mixes[m.id] = l; saveHC(); } catch (e) { /* ignoré */ } } else FAILED[m.id] = true;
    if (S.view === 'mix' && String(S.viewArg) === String(m.id)) render(); else paint();
  }
  // ----- page d'un mix -----
  VIEWS.mix = () => {
    const m = getMix(S.viewArg), l = (m && H.mixes[m.id]) || [];
    const back = `<div class="row" style="margin-bottom:10px"><button class="btn ghost small" data-act="goto" data-view="home">${I.arrowLeft} Accueil</button></div>`;
    if (!m) return back + '<div class="empty">Mix introuvable.</div>';
    if (!l.length) return back + (FAILED[m.id] ? '<div class="empty">Impossible de charger ce mix.<div style="margin-top:12px"><button class="btn" data-hm="retrymix">Réessayer</button></div></div>' : '<div class="empty">Chargement du mix…</div>');
    const seen = new Set(), ims = []; for (const t of l) { if (t.image && !seen.has(t.image)) { seen.add(t.image); ims.push(t.image); if (ims.length === 4) break; } }
    const cover = ims.length >= 4 ? `<div class="ph-cover mosaic">${ims.map((u) => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>` : headCover(l, I.sparkle);
    return back + pageHead('Mix', 'Mix quotidien ' + esc(m.short || m.name), l, cover, `<button class="btn" data-act="play-all">${I.play} Lire</button><button class="btn ghost" data-act="shuffle-list">${I.shuffle} Aléatoire</button>`) + trackRows(l, {});
  };

  // ----- clics sur l'accueil -----
  const rowAct = (i) => { const t = H.tracks[i]; if (!t) return; if (S.settings.dblAction === 'queue') queueAdd(t); else playFrom(H.tracks, i, 'En écoute en ce moment'); };
  const main = document.getElementById('main');
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hm]'); if (!b) return;
    const k = b.dataset.hm, i = +b.dataset.i;
    if (k === 'retry') loadHome(true);
    else if (k === 'apal') {
      const al = H.news && H.news[i]; if (!al || b.dataset.busy) return; b.dataset.busy = '1'; b.style.opacity = '.6';
      const done = (id) => { b.dataset.busy = ''; b.style.opacity = ''; if (!id) { if (typeof toast === 'function') toast('Album introuvable'); return; } const t = document.createElement('div'); t.dataset.lv = 'album'; t.dataset.id = id; main.appendChild(t); t.click(); t.remove(); };
      if (al.did) return done(al.did);
      dz('/search/album?limit=1&q=' + encodeURIComponent('artist:"' + al.q[1] + '" album:"' + al.q[0] + '"')).then((d) => { const a = d.data && d.data[0]; if (a) al.did = a.id; done(a && a.id); })
        .catch(() => dz('/search/album?limit=1&q=' + encodeURIComponent(al.q[1] + ' ' + al.q[0])).then((d) => { const a = d.data && d.data[0]; if (a) al.did = a.id; done(a && a.id); }).catch(() => done(null)));
    }
    else if (k === 'hist') { if (window.sonoraHist) window.sonoraHist.open(i); }
    else if (k === 'hrm') { e.stopPropagation(); if (window.sonoraHist) window.sonoraHist.remove(i); }
    else if (k === 'hclear') { if (window.sonoraHist) window.sonoraHist.clear(); }
    else if (k === 'scroll') { const sc = b.parentElement.querySelector('.hm-scroll'); sc.scrollBy({ left: b.dataset.d * sc.clientWidth * 0.85, behavior: 'smooth' }); }
    else if (k === 'playtrk') playFrom(H.tracks, i, 'En écoute en ce moment');
    else if (k === 'trk') { main.querySelectorAll('.hm-trow.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); rowAct(i); }
    else if (k === 'more') {
      const t = H.tracks[i]; if (!t) return;
      const r = b.getBoundingClientRect();
      showMenu(r.left - 170, r.bottom + 4, [
        { label: 'Lire maintenant', fn: () => playFrom(H.tracks, i, 'En écoute en ce moment') },
        { label: 'Lire ensuite', fn: () => queueNext(t) },
        { label: 'Ajouter à la file d’attente', fn: () => queueAdd(t) },
        { label: isLiked(t) ? 'Retirer des titres aimés' : 'Ajouter aux titres aimés', fn: () => { toggleLike(t); updatePlayer(); } },
        ...S.playlists.map((p) => ({ label: 'Ajouter à « ' + p.name + ' »', fn: () => addToPlaylist(p, t) }))
      ]);
    }
    else if (k === 'mix' || k === 'retrymix') { openMix(k === 'mix' ? b.dataset.id : S.viewArg); }
  });
  const baseMarks = window.sonoraMarks;
  window.sonoraMarks = () => {
    if (baseMarks) baseMarks();
    document.querySelectorAll('#home-root .hm-trow').forEach((el) => {
      const on = onNow(H.tracks && H.tracks[+el.dataset.i]), img = el.querySelector('.hm-img'), badge = el.querySelector('.eq-badge');
      el.classList.toggle('playing', on);
      if (on && !badge && img) { const p = img.querySelector('.hm-play'); if (p) p.remove(); img.insertAdjacentHTML('beforeend', EQB); }
      else if (!on && badge) { badge.remove(); if (!img.querySelector('.hm-play')) img.insertAdjacentHTML('beforeend', `<span class="hm-play">${I.play}</span>`); }
    });
  };
})();
