// Sonora : recherche en direct (au fil de la frappe) avec vraies pochettes, singles, albums, artistes certifiés.
// Source : API Deezer (gratuite, sans clé), appelée via le processus principal (main.js).
// La lecture reste faite par YouTube : on cherche la vidéo seulement quand on lance un titre.
(() => {
  'use strict';
  if (typeof S === 'undefined' || !window.api || !window.api.fetchJson) return;

  const TYPE = { single: 'Single', ep: 'EP', album: 'Album', compile: 'Compilation' };
  // Deezer n'expose pas de « compte vérifié » : le badge est attribué aux artistes ayant au moins ce nombre de fans.
  const VERIFIED_MIN_FANS = 25000;
  const VER = new Map();
  const BADGE = '<svg class="vf" viewBox="0 0 24 24" role="img"><title>Artiste certifié</title><circle cx="12" cy="12" r="11" fill="#2d8cff"/><path d="M7.2 12.4l3.1 3.1 6.5-6.7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const isVer = (a) => !!a && (a.nb_fan || 0) >= VERIFIED_MIN_FANS;
  const setVer = (a) => { if (a && a.id != null) VER.set(String(a.id), isVer(a)); };
  const nameB = (name, id) => esc(name) + (id != null && VER.get(String(id)) ? BADGE : '');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const cleanT = (s) => (s || '').replace(/[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/\b(official|officiel)\b.*$/i, ' ').replace(/\s+/g, ' ').trim();
  const cleanA = (s) => (s || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n);
  const bg = (u) => (u ? `style="background-image:url('${esc(u)}')"` : '');

  // ---------- API Deezer (cache mémoire) ----------
  const cache = new Map();
  const errText = (e) => {
    const m = String((e && e.message) || e);
    if (/TIMEOUT/.test(m)) return 'Deezer ne répond pas (délai dépassé).';
    if (/quota|limit/i.test(m)) return 'Deezer limite les requêtes, réessaie dans quelques secondes.';
    return 'Deezer est injoignable (' + m.replace(/^Error: /, '').slice(0, 80) + ').';
  };
  async function dz(path) {
    if (cache.has(path)) return cache.get(path);
    const d = await Promise.race([
      window.api.fetchJson('https://api.deezer.com' + path),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 12000))     // plus jamais de « Chargement… » sans fin
    ]);
    if (!d || d.error) throw new Error(d && d.error ? 'Deezer : ' + (d.error.message || d.error.type || 'erreur') : 'Deezer');
    cache.set(path, d);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return d;
  }
  const mk = (r, alb) => {
    const a = alb || r.album || {};
    return { id: 'dz:' + r.id, title: r.title_short || r.title, artist: (r.artist && r.artist.name) || '', artistId: r.artist && r.artist.id,
      image: a.cover_big || a.cover_medium, duration: r.duration, source: 'youtube', lazy: true, hq: true, album: a.title };
  };
  // on vérifie les artistes des titres/albums trouvés (4 requêtes max par recherche)
  async function resolveVer(ids) {
    const todo = [...new Set(ids.filter((x) => x != null).map(String))].filter((id) => !VER.has(id)).slice(0, 4);
    if (!todo.length) return;
    await Promise.all(todo.map((id) => dz('/artist/' + id).then(setVer).catch(() => {})));
    refresh();
  }

  // ---------- état de la recherche ----------
  // recherches récentes (propres à chaque compte) : le dernier élément cliqué passe en tête
  const HK = 'sonora.sh';
  let HIST = (typeof load === 'function' ? load(HK, []) : []) || [];
  const saveHist = () => { if (typeof store === 'function') store(HK, HIST); };
  const addHist = (it) => { HIST = [it, ...HIST.filter((h) => !(h.kind === it.kind && String(h.id) === String(it.id)))].slice(0, 12); saveHist(); };

  const LV = { q: '', tok: 0, artists: null, tracks: null, albums: null, loading: false, page: null, prev: null, play: [], t: 0, filter: 'all' };

  const row = (kind, id, img, title, sub, o = {}) =>
    `<div class="lv-row" data-lv="${kind}"${id != null ? ` data-id="${id}"` : ''}><div class="lv-img${o.round ? ' round' : ''}" ${bg(img)}></div>` +
    `<div class="lv-tx"><div class="lv-t">${title}</div><div class="lv-s">${sub}</div></div></div>`;
  const artistRow = (a) => row('artist', a.id, a.picture_big || a.picture_medium, nameB(a.name, a.id),
    (VER.get(String(a.id)) ? 'Artiste certifié' : 'Artiste') + (a.nb_fan ? ' · ' + fmtN(a.nb_fan) + ' fans' : ''), { round: true });
  const albumRow = (al) => row('album', al.id, al.cover_big || al.cover_medium, esc(al.title),
    (TYPE[al.record_type] || 'Album') + (al.release_date ? ' · ' + al.release_date.slice(0, 4) : '') + (al.artist ? ' · ' + nameB(al.artist.name, al.artist.id) : ''));
  function rows(list, num) {
    LV.play = list;
    return '<div class="lv-rows">' + list.map((t, i) =>
      `<div class="lv-row${onNow(t) ? ' playing' : ''}" data-lv="track" data-i="${i}">${num ? `<span class="lv-n">${i + 1}</span>` : ''}<div class="lv-img" ${bg(t.image)}>${onNow(t) ? EQB : ''}</div>` +
      `<div class="lv-tx"><div class="lv-t">${esc(t.title)}</div><div class="lv-s">${nameB(t.artist, t.artistId)}${t.album && !num ? ' · ' + esc(t.album) : ''}</div></div>` +
      `<div class="lv-d">${t.duration ? fmt(t.duration) : ''}</div></div>`).join('') + '</div>';
  }
  const card = (kind, id, img, title, sub) =>
    `<div class="lv-card" data-lv="${kind}" data-id="${id}"><div class="lv-cover" ${bg(img)}></div><div class="lv-ct">${esc(title)}</div><div class="lv-cs">${sub}</div></div>`;
  const albumCard = (al) => card('album', al.id, al.cover_big || al.cover_medium, al.title, (TYPE[al.record_type] || 'Album') + (al.release_date ? ' · ' + al.release_date.slice(0, 4) : ''));
  const grid = (items) => '<div class="lv-grid">' + items.join('') + '</div>';

  function pageHTML() {
    const p = LV.page;
    const back = '<button class="btn ghost small" data-lv="back">← Retour</button>';
    if (p.loading) return back + '<div class="empty">Chargement…</div>';
    if (p.error) return back + `<div class="empty">${esc(p.error)}<br><button class="btn small" data-lv="retry" style="margin-top:14px">Réessayer</button></div>`;
    if (p.type === 'artist') {
      const a = p.a, ver = VER.get(String(a.id));
      const part = (title, state, items, html) => state === 'load' ? `<h2>${title}</h2><div class="empty" style="padding:14px 0">Chargement…</div>`
        : state === 'err' ? `<h2>${title}</h2><div class="empty" style="padding:14px 0">Impossible de charger cette partie. <button class="btn small" data-lv="retry">Réessayer</button></div>`
        : items.length ? `<h2>${title}</h2>` + html() : '';
      return back + `<div class="lv-head"><div class="lv-cover round big" ${bg(a.picture_xl || a.picture_big)}></div><div><div class="mut">${ver ? 'Artiste certifié' : 'Artiste'}</div>` +
        `<h1>${nameB(a.name, a.id)}</h1><div class="mut">${a.nb_fan ? fmtN(a.nb_fan) + ' fans' : ''}</div></div></div>` +
        part('Titres populaires', p.topState, p.top, () => rows(p.top, true)) +
        part('Albums', p.albState, p.albums, () => grid(p.albums.map(albumCard))) +
        (p.albState === 'ok' && p.singles.length ? '<h2>Singles et EP</h2>' + grid(p.singles.map(albumCard)) : '');
    }
    const al = p.al;
    const n = al.tracks ? al.tracks.length : 0;
    return back + `<div class="lv-head"><div class="lv-cover big" ${bg(al.cover_xl || al.cover_big)}></div><div><div class="mut">${TYPE[al.record_type] || 'Album'}</div>` +
      `<h1>${esc(al.title)}</h1><div class="mut"><span class="lv-link" data-lv="artist" data-id="${al.artist.id}">${nameB(al.artist.name, al.artist.id)}</span>` +
      `${al.release_date ? ' · ' + al.release_date.slice(0, 4) : ''} · ${n} titre${n > 1 ? 's' : ''}</div></div></div>` + rows(p.tracks, true);
  }

  function importCard(imp) {
    return `<div class="lv-import"><div class="lv-imp-ico">⇩</div><div class="lv-tx"><div class="lv-t">Importer cette ${imp.type === 'album' ? 'album' : 'playlist'} ${imp.svc === 'spotify' ? 'Spotify' : 'Apple Music'}</div>` +
      `<div class="lv-s">Elle doit être publique. Les titres seront retrouvés sur YouTube au moment de les lire.</div></div><button class="btn" data-lv="import">Importer dans Sonora</button></div>`;
  }

  function liveHTML() {
    if (LV.page) return pageHTML();
    const imp = window.sonoraImport && window.sonoraImport.detect(LV.q);
    if (imp) return importCard(imp);
    if (!LV.q) {
      if (HIST.length) {
        return '<div class="lv-hh"><h2>Recherches récentes</h2><button class="lv-clear" data-lv="hclear">Effacer tout</button></div><div class="lv-rows">' +
          HIST.map((h, i) => `<div class="lv-row" data-lv="hist" data-i="${i}"><div class="lv-img${h.round ? ' round' : ''}" ${bg(h.img)}>${h.img ? '' : '⌕'}</div>` +
            `<div class="lv-tx"><div class="lv-t">${esc(h.title)}</div><div class="lv-s">${esc(h.sub || '')}</div></div>` +
            `<button class="lv-x" data-lv="hrm" data-i="${i}" title="Retirer de la liste">✕</button></div>`).join('') + '</div>';
      }
      return '<div class="empty">Tape le nom d’un titre, d’un single, d’un album ou d’un artiste.<br>Tu peux aussi coller le lien d’une playlist Spotify ou Apple Music pour l’importer.</div>';
    }
    const f = LV.filter, all = f === 'all';
    const albs = (LV.albums || []).filter((x) => x.record_type !== 'single' && x.record_type !== 'ep');
    const sings = (LV.albums || []).filter((x) => x.record_type === 'single' || x.record_type === 'ep');
    const list = (title, items, cap, fn) => items && items.length ? `<h2>${title}</h2><div class="lv-rows">${items.slice(0, all ? cap : 50).map(fn).join('')}</div>` : '';
    let h = '';
    if (all || f === 'artists') h += list('Artistes', LV.artists, 5, artistRow);
    if ((all || f === 'tracks') && LV.tracks && LV.tracks.length) h += '<h2>Titres</h2>' + rows(LV.tracks.slice(0, all ? 6 : 50));
    if (all || f === 'albums') h += list('Albums', albs, 5, albumRow);
    if (all || f === 'singles') h += list('Singles et EP', sings, 5, albumRow);
    if (!h) return `<div class="empty">${LV.loading ? 'Recherche…' : 'Aucun résultat'}</div>`;
    const chips = [['all', 'Tout'], ['artists', 'Artistes'], ['tracks', 'Titres'], ['albums', 'Albums'], ['singles', 'Singles']]
      .map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-lv="filter" data-f="${k}">${n}</button>`).join('');
    return `<div class="chips lv-chips">${chips}</div>` + h;
  }
  function refresh() { const b = $('#live-results'); if (b) b.innerHTML = liveHTML(); }
  // met à jour le repère « en cours d'écoute » sans tout redessiner
  window.sonoraMarks = () => {
    document.querySelectorAll('#live-results .lv-row[data-lv="track"]').forEach((el) => {
      const on = onNow(LV.play[+el.dataset.i]), img = el.querySelector('.lv-img'), b = el.querySelector('.eq-badge');
      el.classList.toggle('playing', on);
      if (on && !b && img) img.insertAdjacentHTML('beforeend', EQB);
      else if (!on && b) b.remove();
    });
  };

  // ---------- recherche au fil de la frappe ----------
  function run(q) {
    const my = ++LV.tok;
    const prev = LV.q;
    LV.q = q;
    if (!q || (window.sonoraImport && window.sonoraImport.detect(q))) { LV.artists = LV.tracks = LV.albums = null; LV.loading = false; refresh(); return; }
    LV.loading = true;
    if (q !== prev) LV.artists = LV.tracks = LV.albums = null;   // plus de mélange avec la recherche précédente
    refresh();
    const enc = encodeURIComponent(q);
    let pending = 3;
    const job = (path, fn) => dz(path).then((d) => { if (my === LV.tok) { fn(d.data || []); refresh(); } })
      .catch(() => { if (my === LV.tok) fn([]); }).finally(() => { if (--pending === 0 && my === LV.tok) { LV.loading = false; refresh(); } });
    job('/search/artist?limit=8&q=' + enc, (d) => {
      d.forEach(setVer);
      LV.artists = d.slice().sort((a, b) => (VER.get(String(b.id)) ? 1 : 0) - (VER.get(String(a.id)) ? 1 : 0)); // certifiés d'abord
    });
    job('/search?limit=12&q=' + enc, (d) => { LV.tracks = d.map((r) => mk(r)); resolveVer(LV.tracks.map((t) => t.artistId)); });
    job('/search/album?limit=30&q=' + enc, (d) => {
      const seen = new Set();
      LV.albums = d.filter((x) => { const k = norm(x.title + (x.artist ? x.artist.name : '')); if (seen.has(k)) return false; seen.add(k); return true; });
      resolveVer(LV.albums.map((x) => x.artist && x.artist.id));
    });
  }

  async function openArtist(id) {
    LV.prev = LV.page;
    const me = (LV.page = { type: 'artist', loading: true, id, top: [], albums: [], singles: [], topState: 'load', albState: 'load' });
    refresh();
    try {
      const a = await dz('/artist/' + id);
      if (LV.page !== me) return;
      setVer(a); me.a = a; me.loading = false; refresh();
    } catch (e) { if (LV.page === me) { me.loading = false; me.error = errText(e); refresh(); } return; }
    // titres populaires et albums : chargés séparément, l'un ne bloque pas l'autre
    dz('/artist/' + id + '/top?limit=10').then((top) => {
      if (LV.page !== me) return;
      me.top = (top.data || []).map((r) => mk(r)); me.topState = 'ok'; refresh();
    }).catch(() => { if (LV.page === me) { me.topState = 'err'; refresh(); } });
    dz('/artist/' + id + '/albums?limit=100').then((albs) => {
      if (LV.page !== me) return;
      const seen = new Set();
      const all = (albs.data || []).filter((x) => { const k = norm(x.title) + x.record_type; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((x, y) => (y.release_date || '').localeCompare(x.release_date || ''));
      me.albums = all.filter((x) => x.record_type === 'album' || x.record_type === 'compile');
      me.singles = all.filter((x) => x.record_type === 'single' || x.record_type === 'ep');
      me.albState = 'ok'; refresh();
    }).catch(() => { if (LV.page === me) { me.albState = 'err'; refresh(); } });
  }
  async function openAlbum(id) {
    LV.prev = LV.page;
    const me = (LV.page = { type: 'album', loading: true });
    refresh();
    try {
      const al = await dz('/album/' + id);
      if (LV.page !== me) return;
      if (al.artist) { try { setVer(await dz('/artist/' + al.artist.id)); } catch (e) { /* badge facultatif */ } }
      al.tracks = ((al.tracks && al.tracks.data) || []).map((r) => mk(r, al));
      Object.assign(me, { loading: false, al, tracks: al.tracks });
    } catch (e) { if (LV.page === me) { LV.page = LV.prev; LV.prev = null; toast('Album introuvable'); } }
    refresh();
  }

  function recArtist(id) {
    const a = (LV.artists || []).find((x) => String(x.id) === String(id)) || (LV.page && LV.page.a && String(LV.page.a.id) === String(id) ? LV.page.a : null);
    if (a) addHist({ kind: 'artist', id: a.id, title: a.name, sub: VER.get(String(a.id)) ? 'Artiste certifié' : 'Artiste', img: a.picture_medium || a.picture_big, round: true });
  }
  function recAlbum(id) {
    const pool = [...(LV.albums || []), ...((LV.page && LV.page.albums) || []), ...((LV.page && LV.page.singles) || [])];
    const al = pool.find((x) => String(x.id) === String(id));
    if (al) addHist({ kind: 'album', id: al.id, title: al.title, sub: (TYPE[al.record_type] || 'Album') + (al.artist ? ' • ' + al.artist.name : ''), img: al.cover_medium || al.cover_big });
  }
  function openHist(i) {
    const h = HIST[i];
    if (!h) return;
    addHist(h);                                                   // l'élément cliqué remonte tout en haut
    if (h.kind === 'track') { playFrom([h.track], 0); refresh(); }
    else if (h.kind === 'artist') openArtist(h.id);
    else if (h.kind === 'album') openAlbum(h.id);
    else if (h.kind === 'q') { const si = document.getElementById('search-input'); if (si) si.value = h.title; S.searchQ = h.title; run(h.title); }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-lv]');
    if (!el || !$('#live-results')) return;
    const k = el.dataset.lv;
    if (k === 'artist') { recArtist(el.dataset.id); openArtist(el.dataset.id); }
    else if (k === 'album') { recAlbum(el.dataset.id); openAlbum(el.dataset.id); }
    else if (k === 'back') { LV.page = LV.prev; LV.prev = null; refresh(); }
    else if (k === 'filter') { LV.filter = el.dataset.f; refresh(); }
    else if (k === 'retry') { const p = LV.page; if (p && p.type === 'artist') { LV.page = LV.prev; LV.prev = null; openArtist(p.id); } }
    else if (k === 'import') { if (window.sonoraImport) window.sonoraImport.run(LV.q); }
    else if (k === 'track') {
      const t = LV.play[+el.dataset.i];
      if (t) addHist({ kind: 'track', id: t.id, title: t.title, sub: 'Titre • ' + t.artist, img: t.image, track: { ...t } });
      playFrom(LV.play, +el.dataset.i);
    }
    else if (k === 'hist') openHist(+el.dataset.i);
    else if (k === 'hrm') { HIST.splice(+el.dataset.i, 1); saveHist(); refresh(); }          // une seule recherche à la fois
    else if (k === 'hclear') { HIST = []; saveHist(); refresh(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'search-input' || S.searchSource !== 'youtube') return;
    S.searchQ = e.target.value;
    if (S.view !== 'search') { go('search'); }
    LV.page = null; LV.prev = null;
    clearTimeout(LV.t);
    if (!S.searchQ.trim()) { run(''); return; }
    LV.t = setTimeout(() => run(S.searchQ.trim()), 320);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'search-input' || e.key !== 'Enter' || S.searchSource !== 'youtube') return;
    e.stopPropagation(); e.preventDefault();
    if (S.view !== 'search') go('search');
    clearTimeout(LV.t); LV.page = null; LV.prev = null; S.searchQ = e.target.value; run(S.searchQ.trim());
    const qq = S.searchQ.trim();
    if (qq && !(window.sonoraImport && window.sonoraImport.detect(qq))) addHist({ kind: 'q', id: norm(qq), title: qq, sub: 'Recherche', img: '' });
  }, true);

  // vue « Rechercher » : on remplace la zone de résultats pour la source YouTube
  const baseSearch = VIEWS.search;
  VIEWS.search = function () {
    const html = baseSearch.call(this);
    if (S.searchSource !== 'youtube') return html;
    return html.replace(/<div style="margin-top:20px">[\s\S]*<\/div>\s*$/, '<div id="live-results" style="margin-top:20px">' + liveHTML() + '</div>');
  };
  const baseDoSearch = doSearch;
  doSearch = function () {
    if (S.searchSource !== 'youtube') return baseDoSearch();
    S.searchRes = []; S.searching = false;
    run(S.searchQ.trim());
    return Promise.resolve();
  };

  // ---------- lecture : on retrouve la vidéo YouTube au moment de lancer le titre ----------
  // mots qui indiquent une autre version que l'originale (on les évite sauf si le titre les contient)
  const BAD = ['cover', 'remix', 'live', 'instrumental', 'karaoke', 'reaction', 'slowed', 'spedup', 'speedup', 'nightcore', '8d', 'reverb', 'tutorial', 'mashup', 'bassboosted', 'loop', 'hour'];
  function scoreVideo(v, t) {
    const vt = norm(v.title), ch = norm(v.artist), tt = norm(cleanT(t.title)), ta = norm(cleanA(t.artist)), ot = norm(t.title);
    let s = 0;
    if (tt && vt.includes(tt)) s += 40;
    if (ta && (vt.includes(ta) || ch.includes(ta))) s += 30;
    if (ch.includes('topic')) s += 12;                                   // « Artiste - Topic » = audio officiel
    if (ch.includes('vevo')) s += 6;
    if (/officialaudio|audioofficiel|officialvideo|clipofficiel/.test(vt)) s += 6;
    BAD.forEach((w) => { if (vt.includes(w) && !ot.includes(w)) s -= 30; });
    if (t.duration && v.duration) {
      const d = Math.abs(v.duration - t.duration);
      s += d <= 3 ? 40 : d <= 8 ? 25 : d <= 20 ? 5 : d > 60 ? -25 : -10;
    }
    return s;
  }
  async function resolveVideo(t) {
    const res = await window.api.ytSearch((cleanA(t.artist) + ' ' + cleanT(t.title)).trim());
    if (!res || !res.length) throw new Error('none');
    let best = res[0], bs = -1e9;
    res.forEach((v) => { const s = scoreVideo(v, t); if (s > bs) { bs = s; best = v; } });   // à score égal, l'ordre de YouTube gagne
    return best;
  }
  const basePlayIndex = playIndex;
  let playTok = 0;
  playIndex = async function (i) {
    const t = S.queue[i];
    const my = ++playTok;                                  // chaque clic annule les précédents
    if (t && t.lazy && !t.videoId) {
      try {
        toast('Recherche de la vidéo…');
        const v = await resolveVideo(t);
        if (my !== playTok || S.queue[i] !== t) return;    // un autre titre a été demandé entre-temps
        t.videoId = v.videoId; t.id = 'y:' + v.videoId;
        if (!t.duration && v.duration) t.duration = v.duration;
      } catch (e) {
        if (my === playTok) toast(/NO_YT_KEY/.test(String((e && e.message) || e)) ? 'Clé YouTube manquante : voir le README (sonora.config.json)' : 'Aucune vidéo trouvée pour ce titre');
        return;
      }
    }
    if (my !== playTok) return;
    return basePlayIndex(i);
  };

  // ---------- anciens titres et titres importés : on remplace les miniatures par les vraies pochettes ----------
  let upBusy = false;
  async function upgrade() {
    if (upBusy) return;
    upBusy = true;
    const all = [...S.recent, ...S.liked, ...S.playlists.flatMap((p) => p.tracks || [])]
      .filter((t) => t && t.source === 'youtube' && !t.hq && !(t.hqTry && Date.now() - t.hqTry < 6048e5));
    let changed = false;
    for (const t of all.slice(0, 150)) {
      try {
        const q = (cleanT(t.title).replace(/[-–—|]/g, ' ') + ' ' + cleanA(t.artist)).trim();
        const d = await dz('/search?limit=6&q=' + encodeURIComponent(q));
        const hay = norm(t.title + ' ' + t.artist);
        let hit = null;
        for (const r of d.data || []) {
          const tn = norm((r.title || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ''));
          const an = norm(r.artist && r.artist.name);
          if (tn.length >= 2 && an && hay.includes(tn) && hay.includes(an)) { hit = r; break; }
        }
        if (hit && hit.album && hit.album.cover_big) { t.image = hit.album.cover_big; t.hq = true; changed = true; }
        else t.hqTry = Date.now();
      } catch (e) { /* réseau : on réessaiera */ }
      await sleep(300);
    }
    if (changed || all.length) persist();
    if (changed && ['home', 'liked', 'library', 'playlist', 'queue', 'collection'].includes(S.view)) { renderPlaylists(); render(); }
    upBusy = false;
  }
  window.sonoraUpgrade = upgrade;
  window.sonoraDZ = { dz, mk, norm, VER, TYPE, nameB };            // utilisé par la page de playlist (ajout de titres)
  setTimeout(upgrade, 1500);
  setInterval(upgrade, 90000);

  // ---------- photo d'artiste (utilisée par le panneau « en cours de lecture ») ----------
  const photos = new Map();
  window.dzArtist = (name) => {
    const n = cleanA(name), k = norm(n);
    if (!k) return Promise.resolve(null);
    if (!photos.has(k)) {
      photos.set(k, dz('/search/artist?limit=3&q=' + encodeURIComponent(n))
        .then((d) => { const a = (d.data || []).find((x) => norm(x.name) === k); return a ? (a.picture_xl || a.picture_big) : null; })
        .catch(() => { photos.delete(k); return null; }));
    }
    return photos.get(k);
  };
})();
