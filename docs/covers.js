// Sonora : la bonne pochette d'album pour chaque titre.
// Les titres venus de YouTube / d'un import n'ont qu'une capture vidéo (ou rien) : on retrouve la vraie pochette de l'album
// (Deezer), uniquement pour les titres affichés ou en lecture, et on la mémorise.
(() => {
  'use strict';
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const BADIMG = /(ytimg\.com|ggpht\.com|googleusercontent\.com|youtube\.com\/vi)/i;
  const cache = load('sonora.covers', {});               // clé « artiste|titre » → url ('' = introuvable)
  const miss = load('sonora.covmiss', {}), fbc = load('sonora.covfb', {});   // miss : « rien trouvé » (ts) ; fbc : photo de l'artiste en dernier recours
  const RETRY = 6 * 3600e3;
  let dirty = false;
  const save = () => { if (dirty) { dirty = false; store('sonora.covers', cache); store('sonora.covmiss', miss); store('sonora.covfb', fbc); } };
  setInterval(save, 4000); window.addEventListener('beforeunload', save);

  const cl = (t) => { try { return window.sonoraFS ? window.sonoraFS.clean(t) : { artist: t.artist || '', title: t.title || '' }; } catch (e) { return { artist: t.artist || '', title: t.title || '' }; } };
  const keyOf = (t) => { const c = cl(t); return norm(c.artist) + '|' + norm(c.title); };
  const needs = (t) => !!t && t.source !== 'local' && !t.hq && (!t.image || BADIMG.test(t.image));
  const hi = (u) => u;

  // file d'attente : 2 requêtes en parallèle, espacées (l'API Deezer limite à ~50 requêtes / 5 s)
  const queue = [], inq = new Set(); let run = 0, backoff = 0;
  const dz = () => window.sonoraDZ && window.sonoraDZ.dz;
  const words = (x) => (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const artistsOverlap = (a, b) => { const A = words(a), B = new Set(words(b)); return A.some((w) => B.has(w)); };
  const base = (x) => norm((x || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ''));
  const titleOk = (rt, tn) => !!rt && !!tn && (rt === tn || (rt.length > 3 && (tn.includes(rt) || rt.includes(tn))));
  async function find(t) {
    const c = cl(t); if (!c.title) return {};
    const tn = norm(c.title), an = norm(c.artist);
    // 1) Deezer, recherche précise puis large (tous les artistes du titre)
    const strict = (r) => titleOk(base(r.title_short || r.title), tn) && (!an || norm(r.artist && r.artist.name).includes(an) || an.includes(norm(r.artist && r.artist.name)) || norm(t.artist).includes(norm(r.artist && r.artist.name)));
    const loose = (r) => titleOk(base(r.title_short || r.title), tn) && (!t.artist || artistsOverlap(t.artist, r.artist && r.artist.name));
    const qs = [c.artist && `artist:"${c.artist}" track:"${c.title}"`, (c.artist + ' ' + c.title).trim(), (String(t.artist || '') + ' ' + c.title).trim(), c.title].filter((x, i, z) => x && z.indexOf(x) === i);
    for (const q of qs) {
      const d = await dz()('/search?limit=10&q=' + encodeURIComponent(q));
      const list = (d.data || []).filter((r) => r.album && (r.album.cover_xl || r.album.cover_big));
      const hit = list.find(strict) || list.find(loose);
      if (hit) return { url: hit.album.cover_xl || hit.album.cover_big };
    }
    // 2) iTunes / Apple Music (gratuit, sans clé)
    try {
      const r = await fetch('https://itunes.apple.com/search?entity=song&limit=10&term=' + encodeURIComponent((c.artist + ' ' + c.title).trim()));
      if (r.ok) {
        const j = await r.json();
        const hit = (j.results || []).find((x) => x.artworkUrl100 && titleOk(base(x.trackName), tn) && (!t.artist || artistsOverlap(t.artist, x.artistName)));
        if (hit) return { url: hit.artworkUrl100.replace(/\/\d+x\d+(bb)?\./, '/640x640bb.') };
      }
    } catch (e) { /* iTunes limite ~20 requêtes/min : on passe au dernier recours */ }
    // 3) dernier recours : photo de l'artiste
    let fb = ''; try { if (window.dzArtist && c.artist) fb = (await window.dzArtist(c.artist)) || ''; } catch (e) { /* ignoré */ }
    return { fb };
  }
  // état d'un titre : 'real' (pochette trouvée), 'settled' (rien de mieux pour l'instant), 'todo' (à chercher)
  const state = (k) => (cache[k] ? 'real' : (miss[k] && Date.now() - miss[k] < RETRY ? 'settled' : 'todo'));
  const hue = (k) => { let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
  const gradient = (k) => { const h = hue(k); return `background-image:linear-gradient(135deg,hsl(${h} 55% 38%),hsl(${(h + 45) % 360} 60% 22%))`; };

  // pochettes des premiers titres d'une playlist (mosaïque 2×2) : on retrouve celles qui manquent, puis on rafraîchit l'affichage
  const waiting = new Map(); let refT = 0;
  function warm(tracks) {
    let have = 0, asked = 0;
    for (const t of (tracks || []).slice(0, 16)) {
      if (have + asked >= 4) break;
      if (!needs(t)) { if (t && t.image) have++; continue; }
      const k = keyOf(t); if (!k || k === '|') continue;
      const st = state(k);
      if (st === 'real') { t.image = cache[k]; t.hq = true; have++; continue; }
      if (st === 'settled') continue;
      (waiting.get(k) || waiting.set(k, []).get(k)).push(t); ensure(t); asked++;
    }
  }
  function paint(k, url, isFb) {
    document.querySelectorAll('[data-cv]').forEach((el) => {
      if (el.dataset.cv !== k) return;
      if (url) { el.style.backgroundImage = `url('${url}')`; if (el.classList.contains('t-img') || el.querySelector('svg')) el.innerHTML = ''; }
    });
  }
  function apply(k, url, fb) {
    const w = waiting.get(k);
    if (w) { waiting.delete(k); if (url) w.forEach((t) => { t.image = url; t.hq = true; }); clearTimeout(refT); refT = setTimeout(() => { try { persist(); renderPlaylists(); if (S.view === 'collection') render(); } catch (e) { /* ignoré */ } }, 700); }
    paint(k, url || fb);
    const cur = S.queue && S.queue[S.qi];
    if (!url && fb && cur && keyOf(cur) === k) { cur.fbimg = fb; try { updatePlayer(); } catch (e) { /* ignoré */ } }
    if (url && cur && keyOf(cur) === k) { cur.image = url; cur.hq = true; try { updatePlayer(); } catch (e) { /* ignoré */ } document.dispatchEvent(new CustomEvent('sonora:cover', { detail: { track: cur, url } })); }
  }
  async function pump() {
    while (run < 3 && queue.length && dz()) {
      if (backoff > Date.now()) { setTimeout(pump, backoff - Date.now() + 50); return; }
      const t = queue.shift(); run++;
      (async () => {
        const k = keyOf(t);
        try {
          const r = await find(t);
          if (r.url) { cache[k] = r.url; delete miss[k]; } else { miss[k] = Date.now(); if (r.fb) fbc[k] = r.fb; }
          dirty = true; apply(k, r.url, r.fb);
        } catch (e) { backoff = Date.now() + 4000; queue.unshift(t); }
        if (!queue.includes(t)) inq.delete(k);
        run--; setTimeout(pump, 160);
      })();
    }
  }
  function ensure(t, first) {
    if (!needs(t)) return;
    const k = keyOf(t); if (!k || k === '|') return;
    const st = state(k);
    if (st === 'real') { t.image = cache[k]; t.hq = true; return; }
    if (st === 'settled') { if (fbc[k]) t.fbimg = fbc[k]; return; }
    if (inq.has(k)) { if (first) { const i = queue.findIndex((x) => keyOf(x) === k); if (i > 0) queue.unshift(queue.splice(i, 1)[0]); } return; }
    inq.add(k); first ? queue.unshift(t) : queue.push(t); pump();
  }

  // les lignes de liste, cartes et la barre du bas passent toutes par artStyle() : jamais de pochette vide
  const baseArt = artStyle;
  artStyle = function (t) {
    if (!t) return baseArt(t);
    if (needs(t)) {
      const k = keyOf(t);
      if (!k || k === '|') return baseArt(t) || `style="${gradient(String(t.title || 'x'))}"`;
      const st = state(k);
      if (st === 'real') { t.image = cache[k]; t.hq = true; return baseArt(t); }
      if (st === 'todo') { ensure(t); const s = baseArt(t); return (s || `style="${gradient(k)}"`) + ` data-cv="${k}"`; }
      // 'settled' : on garde la miniature vidéo si on en a une, sinon la photo de l'artiste, sinon un dégradé de couleur
      if (t.image) return baseArt(t);
      if (fbc[k]) return `style="background-image:url('${esc(fbc[k])}')" data-cv="${k}"`;
      return `style="${gradient(k)}" data-cv="${k}"`;
    }
    return baseArt(t);
  };
  // titre lancé : pochette prioritaire
  const basePI = playIndex;
  playIndex = async function (i) { const t = S.queue[i]; if (needs(t)) ensure(t, true); return basePI(i); };

  // dernier recours pour le titre en cours : la miniature de sa vidéo YouTube (connue seulement une fois la vidéo trouvée)
  const ytThumb = (id) => new Promise((res) => {
    const hq = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', mx = 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg', im = new Image();
    im.onload = () => res(im.naturalWidth > 200 ? mx : hq); im.onerror = () => res(hq); im.src = mx;
  });
  const ytDone = {};
  setInterval(async () => {
    try {
      const cur = S.queue && S.queue[S.qi];
      if (!cur || cur.source === 'local' || cur.hq || cur.image || !/^[\w-]{11}$/.test(cur.videoId || '') || ytDone[cur.videoId]) return;
      ytDone[cur.videoId] = 1;
      const u = await ytThumb(cur.videoId);
      if (S.queue[S.qi] === cur && !cur.image && !cur.hq) { cur.image = u; try { updatePlayer(); } catch (e) { /* ignoré */ } document.dispatchEvent(new CustomEvent('sonora:cover', { detail: { track: cur, url: u } })); }
    } catch (e) { /* ignoré */ }
  }, 1500);
  window.sonoraCover = { ensure, keyOf, cache, needs, warm };
  setTimeout(() => { try { S.playlists.forEach((p) => warm(p.tracks)); } catch (e) { /* ignoré */ } }, 3000);
})();
