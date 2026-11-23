// Sonora : recherche en direct (au fil de la frappe) avec vraies pochettes, singles, albums, artistes certifiés.
// Source : API Deezer (gratuite, sans clé), appelée via le processus principal (main.js).
// La lecture reste faite par YouTube : on cherche la vidéo seulement quand on lance un titre.
(() => {
  'use strict';
  if (typeof S === 'undefined' || !window.api || !window.api.fetchJson) return;

  const TYPE = { single: 'Single', ep: 'EP', album: 'Album', compile: 'Compilation' };
  // Deezer n'expose pas de « compte vérifié » : le badge est attribué aux artistes ayant au moins ce nombre de fans.
  const VERIFIED_MIN_FANS = 20000;
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
  const dz_forget = (k) => cache.delete(k);
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
    if (/^\/album\/\d+$/.test(path) && !(d.tracks && d.tracks.data && d.tracks.data.length)) return d;   // réponse sans titres : on ne la garde pas en mémoire
    cache.set(path, d);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return d;
  }
  const mk = (r, alb) => {
    const a = alb || r.album || {};
    return { id: 'dz:' + r.id, title: r.title_short || r.title, artist: (r.artist && r.artist.name) || '', artistId: r.artist && r.artist.id,
      image: a.cover_big || a.cover_medium, duration: r.duration, source: 'youtube', lazy: true, hq: true, album: a.title, albumId: a.id, preview: r.preview, dzid: r.id };
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
  HIST = HIST.filter((h) => h && h.kind !== 'q');
  const saveHist = () => { if (typeof store === 'function') store(HK, HIST); try { document.dispatchEvent(new Event('sonora:hist')); } catch (e) { /* ignoré */ } };
  const addHist = (it) => { try { const T = window.sonoraTaste; if (T) { if (it.kind === 'artist') T.search(it.title, 3); else if (it.kind === 'track') T.search(it.track && it.track.artist, 2); else if (it.kind === 'album') T.search(String(it.sub || '').split('•')[1], 2); else if (it.kind === 'q') T.search(it.title, 1, true); } } catch (e) { /* ignoré */ } HIST = [it, ...HIST.filter((h) => !(h.kind === it.kind && String(h.id) === String(it.id)))].slice(0, 12); saveHist(); };

  const LV = { q: '', tok: 0, artists: null, tracks: null, albums: null, loading: false, page: null, prev: null, play: [], t: 0, filter: 'all' };

  const row = (kind, id, img, title, sub, o = {}) =>
    `<div class="lv-row" data-lv="${kind}"${id != null ? ` data-id="${id}"` : ''}><div class="lv-img${o.round ? ' round' : ''}" ${bg(img)}></div>` +
    `<div class="lv-tx"><div class="lv-t">${title}</div><div class="lv-s">${sub}</div></div></div>`;
  const artistRow = (a) => row('artist', a.id, a.picture_big || a.picture_medium, nameB(a.name, a.id),
    (VER.get(String(a.id)) ? 'Artiste certifié' : 'Artiste') + (a.nb_fan ? ' · ' + fmtN(a.nb_fan) + ' fans' : ''), { round: true });
  const albumRow = (al) => row('album', al.id, al.cover_big || al.cover_medium, esc(al.title),
    (TYPE[al.record_type] || 'Album') + (al.release_date ? ' · ' + al.release_date.slice(0, 4) : '') + (al.artist ? ' · ' + nameB(al.artist.name, al.artist.id) : ''));
  function rows(list, num) {
    if (num) LV.pplay = list; else LV.play = list;            // liste du menu de recherche / liste de la page artiste ou album
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
    const back = `<button class="btn ghost small" data-lv="back">${I.arrowLeft} Retour</button>`;
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
      `${al.release_date ? ' · ' + al.release_date.slice(0, 4) : ''} · ${n} titre${n > 1 ? 's' : ''}</div></div></div>` + (n ? rows(p.tracks, true) : '<div class="empty" style="padding:14px 0">Les titres n’ont pas pu être chargés. <button class="btn small" data-lv="retry">Réessayer</button></div>');
  }

  function importCard(imp) {
    return `<div class="lv-import"><div class="lv-imp-ico">${I.download}</div><div class="lv-tx"><div class="lv-t">Importer cette ${imp.type === 'album' ? 'album' : 'playlist'} ${imp.svc === 'spotify' ? 'Spotify' : 'Apple Music'}</div>` +
      `<div class="lv-s">Elle doit être publique. Les titres seront retrouvés sur YouTube au moment de les lire.</div></div><button class="btn" data-lv="import">Importer dans Sonora</button></div>`;
  }

  function liveHTML() {
    const imp = window.sonoraImport && window.sonoraImport.detect(LV.q);
    if (imp) return importCard(imp);
    if (!LV.q) {
      if (HIST.length) {
        return '<div class="lv-hh"><h2>Recherches récentes</h2><button class="lv-clear" data-lv="hclear">Effacer tout</button></div><div class="lv-rows">' +
          HIST.map((h, i) => `<div class="lv-row" data-lv="hist" data-i="${i}"><div class="lv-img${h.round ? ' round' : ''}" ${bg(h.img)}>${h.img ? '' : I.search}</div>` +
            `<div class="lv-tx"><div class="lv-t">${esc(h.title)}</div><div class="lv-s">${esc(h.sub || '')}</div></div>` +
            `<button class="lv-x lv-m" data-lv="hmore" data-keepmenu="1" data-i="${i}" title="Plus">${I.more}</button>` +
            `<button class="lv-x" data-lv="hrm" data-i="${i}" title="Retirer de la liste">${I.close}</button></div>`).join('') + '</div>';
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
  function refresh() {
    const b = $('#live-results'); if (b) b.innerHTML = liveHTML();
    const pg = $('#lv-page'); if (pg) pg.innerHTML = LV.page ? pageHTML() : '';
  }
  // ----- menu de recherche sous la barre du haut -----
  const pop = () => $('#search-pop');
  function openPop() { const p = pop(); if (!p) return; p.classList.remove('hidden'); refresh(); }
  function closePop() { const p = pop(); if (p) p.classList.add('hidden'); }
  window.sonoraSearchPop = { open: openPop, close: closePop };
  // affiche la page artiste / album dans la zone principale
  function showPage() {
    const p0 = pop(), wasOpen = !!(p0 && !p0.classList.contains('hidden'));
    closePop();
    if (S.view !== 'lvpage') { LV.from = { view: S.view, arg: S.viewArg }; LV.fromSearch = wasOpen; go('lvpage'); } else refresh();
  }
  function goBack() {
    if (LV.prev) { LV.page = LV.prev; LV.prev = null; refresh(); return; }
    LV.page = null; const f = LV.from || { view: 'home' }, back2search = !!LV.fromSearch; LV.from = null; LV.fromSearch = false;
    if (back2search) openPop();                                    // on revient dans la recherche, résultats conservés : ouverte AVANT le changement de page pour ne pas voir la page du dessous clignoter
    go(f.view === 'lvpage' ? 'home' : f.view, f.arg);
  }
  VIEWS.lvpage = () => '<div id="lv-page">' + (LV.page ? pageHTML() : '') + '</div>';
  // met à jour le repère « en cours d'écoute » sans tout redessiner
  window.sonoraMarks = () => {
    document.querySelectorAll('#live-results .lv-row[data-lv="track"], #lv-page .lv-row[data-lv="track"]').forEach((el) => {
      const on = onNow((el.closest('#lv-page') ? LV.pplay : LV.play)[+el.dataset.i]), img = el.querySelector('.lv-img'), b = el.querySelector('.eq-badge');
      el.classList.toggle('playing', on);
      if (on && !b && img) img.insertAdjacentHTML('beforeend', EQB);
      else if (!on && b) b.remove();
    });
  };

  // ---------- recherche au fil de la frappe ----------
  // lien YouTube collé dans la recherche : le titre apparaît directement et se lance dans l'appli
  const ytIdOf = (q) => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})(?![\w-])/i.exec(String(q || '')); return m ? m[1] : null; };
  async function runLink(id, my) {
    const base = { id: 'y:' + id, videoId: id, title: 'Vidéo YouTube', artist: 'YouTube', image: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', source: 'youtube', duration: 0 };
    LV.artists = LV.albums = null; LV.tracks = [base]; LV.loading = false; refresh();
    try {
      const r = await Promise.race([fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id)), new Promise((_, rj) => setTimeout(() => rj(new Error('T')), 5000))]);
      if (r.ok) {
        const j = await r.json();
        if (my !== LV.tok) return;
        const nm = String(j.title || '').trim(), au = String(j.author_name || '').replace(/\s*-\s*Topic$/i, '').trim();
        const sp = /^(.+?)\s+[-–]\s+(.+)$/.exec(nm);                    // « Artiste - Titre » : on sépare comme sur YouTube Musique
        LV.tracks = [{ ...base, title: sp ? sp[2] : (nm || base.title), artist: sp ? sp[1] : (au || base.artist), image: j.thumbnail_url || base.image }];
        refresh();
      }
    } catch (e) { /* on garde le titre générique : la lecture marche quand même */ }
  }
  function run(q) {
    const my = ++LV.tok;
    const prev = LV.q;
    LV.q = q;
    const yid = ytIdOf(q);
    if (yid) { runLink(yid, my); return; }
    if (!q || (window.sonoraImport && window.sonoraImport.detect(q))) { LV.artists = LV.tracks = LV.albums = null; LV.loading = false; refresh(); return; }
    LV.loading = true;
    if (q !== prev) LV.artists = LV.tracks = LV.albums = null;   // plus de mélange avec la recherche précédente
    refresh();
    const enc = encodeURIComponent(q);
    let pending = 3;
    const job = (path, fn) => dz(path).then((d) => { if (my === LV.tok) { fn(d.data || []); refresh(); } })
      .catch(() => { if (my === LV.tok) fn([]); }).finally(() => { if (--pending === 0 && my === LV.tok) { LV.loading = false; refresh(); } });
    job('/search/artist?limit=6&q=' + enc, (d) => {
      d.forEach(setVer);
      LV.artists = d.slice().sort((a, b) => (VER.get(String(b.id)) ? 1 : 0) - (VER.get(String(a.id)) ? 1 : 0)); // certifiés d'abord
    });
    job('/search?limit=10&q=' + enc, (d) => { LV.tracks = d.map((r) => mk(r)); resolveVer(LV.tracks.map((t) => t.artistId)); });
    job('/search/album?limit=16&q=' + enc, (d) => {
      const seen = new Set();
      LV.albums = d.filter((x) => { const k = norm(x.title + (x.artist ? x.artist.name : '')); if (seen.has(k)) return false; seen.add(k); return true; });
      resolveVer(LV.albums.map((x) => x.artist && x.artist.id));
    });
  }

  async function openArtist(id) {
    LV.prev = LV.page;
    const me = (LV.page = { type: 'artist', loading: true, id, top: [], albums: [], singles: [], topState: 'load', albState: 'load' });
    showPage();
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
    const me = (LV.page = { type: 'album', id, loading: true });
    showPage();
    try {
      const al = await dz('/album/' + id);
      if (LV.page !== me) return;
      if (al.artist) { try { setVer(await dz('/artist/' + al.artist.id)); } catch (e) { /* badge facultatif */ } }
      let raw = (al.tracks && al.tracks.data) || [];
      if (!raw.length) { try { const t2 = await dz('/album/' + id + '/tracks?limit=100'); raw = t2.data || []; } catch (e) { /* on retentera ci-dessous */ } }
      if (!raw.length) { try { cache.delete('/album/' + id); const al2 = await dz('/album/' + id); raw = (al2.tracks && al2.tracks.data) || []; } catch (e) { /* ignoré */ } }
      if (LV.page !== me) return;
      al.tracks = raw.map((r) => mk(r, al));
      Object.assign(me, { loading: false, al, tracks: al.tracks });
    } catch (e) { if (LV.page === me) { toast('Album introuvable'); goBack(); return; } }
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
    if (h.kind !== 'q' && !document.documentElement.classList.contains('mobile')) closePop();      // sur téléphone, showPage() ferme la recherche et retient qu'on vient d'elle
    if (h.kind === 'track') { playFrom([h.track], 0, 'Recherches récentes'); refresh(); }
    else if (h.kind === 'artist') openArtist(h.id);
    else if (h.kind === 'album') openAlbum(h.id);
    else if (h.kind === 'q') { const si = document.getElementById('search-input'); if (si) si.value = h.title; S.searchQ = h.title; run(h.title); }
  }

  // ouvrir la page d'un artiste depuis n'importe où (plein écran, panneau « en lecture ») : par identifiant Deezer ou par nom
  window.sonoraOpenArtist = async (idOrName) => {
    let id = /^\d+$/.test(String(idOrName)) ? String(idOrName) : null;
    if (!id && window.dzArtistInfo) { try { const a = await window.dzArtistInfo(idOrName); if (a && a.id) id = String(a.id); } catch (e) { /* ignoré */ } }
    if (!id) { if (window.toast) toast('Artiste introuvable'); return; }
    try { if (window.sonoraFS && window.sonoraFS.close) window.sonoraFS.close(); } catch (e) { /* ignoré */ }
    recArtist(id); openArtist(id);
  };
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-aopen]'); if (el && el.dataset.aopen) { e.preventDefault(); window.sonoraOpenArtist(el.dataset.aopen); } });
  window.sonoraHist = { get: () => HIST.slice(), open: (i) => openHist(i), remove: (i) => { HIST.splice(i, 1); saveHist(); }, clear: () => { HIST = []; saveHist(); } };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-lv]');
    if (!el || !($('#live-results') || $('#lv-page'))) return;
    const k = el.dataset.lv;
    if (k === 'artist') { recArtist(el.dataset.id); openArtist(el.dataset.id); }
    else if (k === 'album') { recAlbum(el.dataset.id); openAlbum(el.dataset.id); }
    else if (k === 'back') goBack();
    else if (k === 'filter') { LV.filter = el.dataset.f; refresh(); }
    else if (k === 'retry') { const p = LV.page; if (p && p.type === 'artist') { LV.page = LV.prev; LV.prev = null; openArtist(p.id); } else if (p && p.type === 'album' && p.id != null) { LV.page = LV.prev; LV.prev = null; dz_forget('/album/' + p.id); openAlbum(p.id); } }
    else if (k === 'import') { closePop(); if (window.sonoraImport) window.sonoraImport.run(LV.q); }
    else if (k === 'track') {
      const inPage = !!el.closest('#lv-page'), arr = inPage ? LV.pplay : LV.play, t = arr[+el.dataset.i];
      if (!inPage && t) addHist({ kind: 'track', id: t.id, title: t.title, sub: 'Titre • ' + t.artist, img: t.image, track: { ...t } });
      if (!inPage && !document.documentElement.classList.contains('mobile')) closePop();      // sur téléphone la recherche reste ouverte
      playFrom(arr, +el.dataset.i, inPage ? undefined : 'Résultats de recherche');
    }
    else if (k === 'hmore') {
      const i = +el.dataset.i, h = HIST[i]; if (!h) return;
      const r = el.getBoundingClientRect();
      showMenu(r.left - 150, r.bottom + 4, [
        { label: 'Ouvrir', fn: () => openHist(i) },
        { label: 'Retirer de la liste', fn: () => { HIST.splice(i, 1); saveHist(); refresh(); } }
      ]);
    }
    else if (k === 'hist') openHist(+el.dataset.i);
    else if (k === 'hrm') { HIST.splice(+el.dataset.i, 1); saveHist(); refresh(); }          // une seule recherche à la fois
    else if (k === 'hclear') { HIST = []; saveHist(); refresh(); }
  });
  window.sonoraClearHist = () => { HIST = []; saveHist(); refresh(); };
  // ouvrir / fermer le menu de recherche
  document.addEventListener('focusin', (e) => { if (e.target.id === 'search-input') openPop(); });
  document.addEventListener('mousedown', (e) => {
    const p = pop(); if (!p || p.classList.contains('hidden')) return;
    if (!e.target.closest('.tb-search') && !e.target.closest('#menu') && !e.target.closest('#player') && !e.target.closest('#fs') && !e.target.closest('#m-save')) closePop();   // le lecteur ne ferme pas la recherche
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); const si = $('#search-input'); if (si && document.activeElement === si) si.blur(); } });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'search-input' || S.searchSource !== 'youtube') return;
    S.searchQ = e.target.value;
    openPop();
    clearTimeout(LV.t);
    if (!S.searchQ.trim()) { run(''); return; }
    LV.t = setTimeout(() => run(S.searchQ.trim()), 120);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'search-input' || e.key !== 'Enter' || S.searchSource !== 'youtube') return;
    e.stopPropagation(); e.preventDefault();
    openPop();
    clearTimeout(LV.t); S.searchQ = e.target.value; run(S.searchQ.trim());
    const qq = S.searchQ.trim();
    // les simples mots recherchés ne sont plus gardés : seuls les titres, albums, singles et artistes ouverts apparaissent dans les recherches récentes
  }, true);

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
  // mémoire des vidéos déjà trouvées : un titre déjà lancé démarre tout de suite, sans nouvelle recherche
  const VK = 'sonora.vids'; let vmap = null;
  const vload = () => { if (!vmap) { try { vmap = JSON.parse(localStorage.getItem(VK) || '{}'); } catch (_) { vmap = {}; } } return vmap; };
  const vsave = () => { try { const k = Object.keys(vmap); if (k.length > 4000) k.slice(0, k.length - 3000).forEach((x) => delete vmap[x]); localStorage.setItem(VK, JSON.stringify(vmap)); } catch (_) { /* plein */ } };
  const vkey = (t) => norm(cleanA(t.artist) + cleanT(t.title));
  // vérifie (sans lancer la vidéo) que YouTube autorise son intégration dans une appli ; en cas de doute (réseau…) on suppose que oui
  const EMB = {};
  async function embOK(id) {
    if (id in EMB) return EMB[id];
    try {
      const c = new AbortController(), to = setTimeout(() => c.abort(), 3500);
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: c.signal });
      clearTimeout(to);
      return (EMB[id] = !(r.status === 401 || r.status === 403 || r.status === 404));
    } catch (_) { return true; }
  }
  async function resolveVideo(t) {
    let c = vload()[vkey(t)];
    if (c && c.v && !c.e) {                                           // vidéo mémorisée avant la vérification d'intégration : on la contrôle une fois
      if (await embOK(c.v)) { c.e = 1; vsave(); } else { delete vload()[vkey(t)]; vsave(); c = null; }
    }
    if (c && c.v) { t._alts = (c.a || []).filter((x) => x !== c.v); return { videoId: c.v, duration: c.d }; }
    // plusieurs formulations : si « Artiste + titre » ne donne rien (accents, featuring…), on retente avec le seul premier artiste, puis le titre seul
    const a1 = String(cleanA(t.artist) || '').split(/\s*(?:,| & | feat\.?| ft\.?| x )\s*/i)[0], tt = cleanT(t.title);
    const qs = [...new Set([(cleanA(t.artist) + ' ' + tt).trim(), (tt + ' ' + a1).trim(), (tt + ' audio').trim()])];
    let res = null, lastErr = null;
    for (const q of qs) {
      try { const r = await window.api.ytSearch(q); if (r && r.length) { res = r; break; } } catch (e) { lastErr = e; }
    }
    if (!res || !res.length) throw lastErr || new Error('none');
    const sc = res.map((v) => ({ v, s: scoreVideo(v, t) })).sort((x, y) => y.s - x.s);   // à score égal, l'ordre de YouTube gagne (tri stable)
    const top = sc.slice(0, 6), oks = await Promise.all(top.map((x) => embOK(x.v.videoId)));
    const good = top.filter((x, i) => oks[i]);
    const ordered = good.length ? good.concat(sc.slice(6)) : sc;                                // aucune vidéo « intégrable » détectée : on garde l'ordre d'origine
    const best = ordered[0].v;
    t._alts = ordered.slice(1, 5).map((x) => x.v.videoId);                                      // vidéos de secours si celle-ci refuse de se lancer
    vload()[vkey(t)] = { v: best.videoId, d: best.duration, a: [best.videoId, ...t._alts], e: good.length ? 1 : 0 }; vsave();
    return best;
  }
  // pendant qu'un titre joue, on prépare le suivant
  function prefetchNext() {
    const n = S.queue[S.qi + 1];
    if (!n || n.videoId || n.src || !n.lazy || vload()[vkey(n)]) return;
    resolveVideo({ ...n }).catch(() => { /* sans importance */ });
  }
  // Sans clé ni relais : extrait officiel de 30 s fourni par Deezer (gratuit, sans compte)
  let notedPreview = false;
  async function previewFallback(t) {
    const id = t.dzid || (/^dz:/.test(String(t.id)) ? String(t.id).slice(3) : '');
    let url = '';
    if (id) { try { const d = await dz('/track/' + id); url = d && d.preview; } catch (_) { /* on essaie l'adresse mémorisée */ } }   // l'adresse d'un extrait expire : on la redemande
    if (!url && !t.preview30) url = t.preview;
    if (!url) {                                                   // titre venu d'ailleurs (import…) : on le retrouve par son nom
      const d = await dz('/search?limit=5&q=' + encodeURIComponent((cleanA(t.artist) + ' ' + cleanT(t.title)).trim()));
      const tn = norm(cleanT(t.title)), an = norm(cleanA(t.artist));
      const hit = (d.data || []).find((r) => r.preview && (norm(r.title_short || r.title).includes(tn) || tn.includes(norm(r.title_short || r.title))) &&
        (!an || norm(r.artist && r.artist.name).includes(an) || an.includes(norm(r.artist && r.artist.name))));
      url = hit && hit.preview;
    }
    if (!url) return false;
    t.src = url; t.source = 'local'; t.preview30 = true; t.preview = url;
    return true;
  }
  const basePlayIndex = playIndex;
  let playTok = 0;
  const useVideo = (t, id) => { t.videoId = id; t.id = 'y:' + id; t.source = 'youtube'; delete t.src; delete t.preview30; };
  // la vidéo refuse de se lancer (intégration interdite, indisponible…) : on essaie la suivante, puis l'extrait de 30 s
  // le clip officiel n'est souvent pas lisible dans une appli (intégration interdite) : on cherche d'autres versions (audio, paroles, « Topic »)
  async function moreAlts(t) {
    if (t._moreDone) return; t._moreDone = true;
    const base = (cleanA(t.artist) + ' ' + cleanT(t.title)).trim(), tried = new Set([t.videoId, ...(t._alts || []), ...(t._failed || [])]);
    const lists = await Promise.all([base + ' audio', base + ' lyrics', cleanA(t.artist) + ' - ' + cleanT(t.title) + ' topic'].map((q) => window.api.ytSearch(q).catch(() => [])));
    const seen = new Set(), c = [];
    lists.flat().forEach((v) => { if (v && v.videoId && !tried.has(v.videoId) && !seen.has(v.videoId)) { seen.add(v.videoId); c.push({ v, s: scoreVideo(v, t) }); } });
    c.sort((x, y) => y.s - x.s);
    const cand = c.filter((x) => x.s >= 20).slice(0, 8), oks = await Promise.all(cand.map((x) => embOK(x.v.videoId)));
    t._alts = cand.filter((x, i) => oks[i]).slice(0, 6).map((x) => x.v.videoId);
  }
  async function failover(t, why) {
    const i = S.queue.indexOf(t); if (i < 0 || S.queue[S.qi] !== t) return;
    if (t.videoId) t._failed = (t._failed || []).concat(t.videoId);
    let alt = ytReady ? (t._alts || []).shift() : null;
    if (!alt && ytReady && !t._moreDone) { try { await moreAlts(t); } catch (_) { /* ignoré */ } if (S.queue[S.qi] !== t) return; alt = (t._alts || []).shift(); }
    if (alt) {
      useVideo(t, alt); toast('Vidéo indisponible, j’en essaie une autre…');
      try { vload()[vkey(t)] = { v: alt, d: t.duration, a: [alt, ...(t._alts || [])] }; vsave(); } catch (_) { /* ignoré */ }      // la prochaine fois, on commence par celle qui marche
      const r = basePlayIndex(i); watchStart(t); return r;
    }
    let ok = false; try { ok = await previewFallback(t); } catch (_) { ok = false; }
    if (S.queue[S.qi] !== t) return;
    if (ok) { toast('Lecture complète impossible : extrait de 30 s'); return basePlayIndex(i); }
    toast('Titre indisponible, passage au suivant'); setTimeout(() => { if (S.queue[S.qi] === t) next(true); }, 1200);
  }
  window.sonoraYtError = (code) => { const t = S.queue[S.qi]; if (t && t.source === 'youtube') failover(t, code); };
  // surveille le démarrage : si rien ne se lance au bout de quelques secondes, on bascule
  function watchStart(t) {
    const tok = playTok;
    setTimeout(() => {
      if (tok !== playTok || S.queue[S.qi] !== t || t.source !== 'youtube') return;
      let st = -9; try { st = ytReady ? ytPlayer.getPlayerState() : -9; } catch (_) { /* ignoré */ }
      if (st === -9 || st === -1 || st === 5) failover(t, 'timeout');
    }, 9000);
  }
  playIndex = async function (i) {
    const t = S.queue[i];
    const my = ++playTok;                                  // chaque clic annule les précédents
    if (t && t.fileId && window.api && window.api.fileURL) {   // fichier importé depuis le téléphone : on retrouve son adresse à chaque lancement
      try { t.src = await window.api.fileURL(t.fileId); t.source = 'local'; } catch (e) { toast('Fichier introuvable : ajoute-le de nouveau'); return; }
      if (my !== playTok) return;
    }
    if (t && t.lazy && !t.videoId) {
      try {
        const v = await resolveVideo(t);
        if (my !== playTok || S.queue[i] !== t) return;    // un autre titre a été demandé entre-temps
        useVideo(t, v.videoId);
        if (!t.duration && v.duration) t.duration = v.duration;
      } catch (e) {
        if (my !== playTok) return;
        const emsg = String((e && e.message) || e); const noKey = /NO_YT_KEY/.test(emsg);
        const why = (/RELAY_\w+.*PUBLIC_\w+|PUBLIC_\w+|RELAY_\w+|HTTP \d+/.exec(emsg) || [''])[0];
        let ok = false;
        try { ok = await previewFallback(t); } catch (_) { ok = false; }
        if (my !== playTok || S.queue[i] !== t) return;
        if (!ok) { toast('Aucune vidéo trouvée pour ce titre'); return; }
        if (!notedPreview) { notedPreview = true; toast(noKey ? 'Extrait de 30 s (lecture complète indisponible : clé YouTube dans Paramètres › YouTube)' : 'YouTube injoignable' + (why ? ' (' + why + ')' : '') + ' : extrait de 30 s'); }
      }
    }
    if (my !== playTok) return;
    const r = basePlayIndex(i);
    if (t && t.source === 'youtube') { watchStart(t); setTimeout(() => { if (my === playTok) prefetchNext(); }, 2500); }
    return r;
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
  // infos artiste (Deezer) pour le panneau « en cours de lecture » quand iTunes ne connaît pas le titre
  const ainfo = new Map();
  window.dzArtistInfo = (name) => {
    const n = cleanA(name), k = norm(n);
    if (!k) return Promise.resolve(null);
    if (!ainfo.has(k)) ainfo.set(k, dz('/search/artist?limit=10&q=' + encodeURIComponent(n)).then((d) => { const l = d.data || [], ex = l.filter((x) => norm(x.name) === k), a = (ex.length ? ex : l).slice().sort((x, y) => (y.nb_fan || 0) - (x.nb_fan || 0))[0]; return a ? { id: a.id, name: a.name, pic: a.picture_xl || a.picture_big || '', fans: a.nb_fan || 0 } : null; }).catch(() => { ainfo.delete(k); return null; }));
    return ainfo.get(k);
  };
  window.dzArtistTop = (id) => dz('/artist/' + id + '/top?limit=12').then((d) => (d.data || []).map((r) => ({ t: r.title_short || r.title, a: r.artist && r.artist.name, u: (r.album && (r.album.cover_medium || r.album.cover)) || '', c: (r.album && r.album.title) || '' }))).catch(() => []);
  window.dzArtist = (name) => {
    const n = cleanA(name), k = norm(n);
    if (!k) return Promise.resolve(null);
    if (!photos.has(k)) {
      photos.set(k, dz('/search/artist?limit=10&q=' + encodeURIComponent(n))
        .then((d) => { const a = (d.data || []).filter((x) => norm(x.name) === k).sort((x, y) => (y.nb_fan || 0) - (x.nb_fan || 0))[0]; return a ? (a.picture_xl || a.picture_big) : null; })
        .catch(() => { photos.delete(k); return null; }));
    }
    return photos.get(k);
  };
})();
