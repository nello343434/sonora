// Sonora : vue "en cours de lecture" façon Spotify (panneau de droite) + vraies pochettes d'album.
// Ce fichier ne modifie pas app.js. Il lit le titre / l'artiste affichés dans le lecteur,
// retrouve le morceau sur l'API iTunes (gratuite, sans clé), puis :
//   1. affiche un panneau à droite : pochette, titre, artiste, aperçu des paroles,
//      titres et albums de l'artiste ;
//   2. remplace les miniatures YouTube des cartes et du lecteur par la pochette de l'album.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const app = $('app');
  if (!app) return;

  // ---------- style ----------
  const CSS = `
#np-panel{grid-area:np;display:none;overflow-y:auto;min-height:0;padding:16px 18px 28px;border-left:1px solid var(--border);user-select:none}
body.np-open #np-panel{display:block}
body.np-open #app{grid-template-columns:78px 1fr 360px;grid-template-rows:64px 1fr 84px;grid-template-areas:"side top top" "side main np" "side player player"}
body.compact.np-open #app{grid-template-columns:0 1fr 360px}
.npp-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.npp-album{font-weight:800;font-size:15px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.npp-cover{width:100%;aspect-ratio:1;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);background:linear-gradient(135deg,var(--accent),#444) center/cover no-repeat}
.npp-title{font-size:24px;font-weight:800;margin-top:16px;line-height:1.2}
.npp-artist{color:var(--muted);margin-top:4px;font-size:15px}
.npp-card{background:var(--hover);border-radius:12px;padding:14px;margin-top:18px}
.npp-card h4{font-size:15px;font-weight:800;margin-bottom:10px}
.npp-lyrics{cursor:pointer}
.npp-lyrics p{font-size:17px;font-weight:700;line-height:1.5}
.npp-about{display:flex;gap:12px;align-items:center}
.npp-about img{width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0}
.npp-about .n{font-weight:800;font-size:16px}
.npp-about .m{color:var(--muted);font-size:13px;margin-top:2px}
.npp-sec{font-size:16px;font-weight:800;margin:22px 0 10px}
.npp-row{display:flex;align-items:center;gap:12px;padding:6px;border-radius:8px;cursor:pointer}
.npp-row:hover{background:var(--hover)}
.npp-row img{width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0}
.npp-row .tx{min-width:0}
.npp-row .t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.npp-row .s{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.npp-albums{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
.npp-alb{flex:0 0 120px;cursor:pointer}
.npp-alb img{width:120px;height:120px;border-radius:8px;object-fit:cover;display:block}
.npp-alb .t{font-weight:700;font-size:13px;margin-top:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.npp-alb .s{color:var(--muted);font-size:12px}
.npp-note{color:var(--muted);font-size:12px;margin-top:18px}
`;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  // ---------- petits outils ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const img = (src) => {
    const i = document.createElement('img');
    i.src = src; i.alt = ''; i.loading = 'lazy'; i.draggable = false;
    i.referrerPolicy = 'no-referrer';
    return i;
  };
  const ICON = {
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
  };
  const svg = (n, s) =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  const txt = (id) => { const e = $(id); return e ? (e.textContent || '').trim() : ''; };

  const norm = (s) => (s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const cleanTitle = (s) => (s || '')
    .replace(/[\(\[][^\)\]]*\b(official|officiel|clip|video|vidéo|audio|lyrics?|paroles|visuali[sz]er|hd|4k|hq|live|remaster(ed)?)\b[^\)\]]*[\)\]]/gi, ' ')
    .replace(/\b(official|officiel)\b.*$/i, ' ')
    .replace(/\s*[-–—|]\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const cleanArtist = (s) => (s || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  const metaKey = (t, a) => norm(cleanTitle(t)) + '|' + norm(cleanArtist(a));

  // ---------- file d'attente réseau (iTunes limite à ~20 requêtes / minute) ----------
  const GAP = 3200;
  const queue = [];
  let busy = false;
  let nextAt = 0;
  function enqueue(fn, priority) {
    return new Promise((resolve) => {
      const job = { fn, resolve };
      if (priority) queue.unshift(job); else queue.push(job);
      pump();
    });
  }
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const wait = nextAt - Date.now();
      if (wait > 0) await sleep(wait);
      const job = queue.shift();
      let out = null;
      try { out = await job.fn(); } catch (e) { out = null; }
      nextAt = Math.max(nextAt, Date.now() + GAP);
      job.resolve(out);
    }
    busy = false;
  }
  async function itunes(url) {
    try {
      const r = await fetch(url);
      if (r.status === 403 || r.status === 429) { nextAt = Date.now() + 30000; return null; }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  // ---------- cache (mémoire + localStorage) ----------
  const STORE = 'sonora.meta.v1';
  const NEG_TTL = 3 * 864e5;
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { meta = {}; }
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const ks = Object.keys(meta);
        if (ks.length > 700) {
          ks.sort((a, b) => meta[a].t - meta[b].t).slice(0, ks.length - 600).forEach((k) => delete meta[k]);
        }
        localStorage.setItem(STORE, JSON.stringify(meta));
      } catch (e) { /* stockage plein ou indisponible */ }
    }, 800);
  };
  const peek = (key) => {
    const e = meta[key];
    if (!e) return undefined;
    if (!e.r && Date.now() - e.t > NEG_TTL) return undefined;
    return e;
  };
  const inflight = new Map();
  const fails = {};

  // ---------- retrouver le morceau sur iTunes ----------
  function pick(results, title, artist) {
    const hay = norm(title + ' ' + artist);
    const nTitle = norm(title);
    for (const r of results) {
      const tnFull = norm(r.trackName);
      const tn = norm((r.trackName || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ''));
      const an = norm((r.artistName || '').split(/,|&| feat\.?| x /i)[0]);
      if (!tn || !an) continue;
      if (tn.length < 3 && nTitle !== tn) continue;
      if ((hay.includes(tn) || hay.includes(tnFull)) && hay.includes(an)) return r;
    }
    return null;
  }
  const big = (u, n) => (u || '').replace('100x100bb', n + 'x' + n + 'bb');
  const toRec = (r) => ({
    t: r.trackName, a: r.artistName, aid: r.artistId, cid: r.collectionId,
    c: r.collectionName, g: r.primaryGenreName,
    y: (r.releaseDate || '').slice(0, 4), u: big(r.artworkUrl100, 600)
  });

  function getTrack(title, artist, priority) {
    const key = metaKey(title, artist);
    const hit = peek(key);
    if (hit !== undefined) return Promise.resolve(hit.r);
    if (inflight.has(key)) return inflight.get(key);
    if (fails[key] && fails[key] > Date.now()) return Promise.resolve(null);
    if (norm(cleanTitle(title)).length < 2) return Promise.resolve(null);
    const q = (cleanTitle(title) + ' ' + cleanArtist(artist)).trim();
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(q) +
      '&media=music&entity=song&limit=6&country=FR';
    const p = enqueue(() => itunes(url), priority).then((d) => {
      inflight.delete(key);
      if (!d) { fails[key] = Date.now() + 60000; return null; }
      const r = pick(d.results || [], cleanTitle(title), cleanArtist(artist));
      meta[key] = { r: r ? toRec(r) : null, t: Date.now() };
      save();
      return meta[key].r;
    });
    inflight.set(key, p);
    return p;
  }

  // ---------- titres et albums de l'artiste ----------
  const artistCache = new Map();
  function getArtist(aid) {
    if (!aid) return Promise.resolve(null);
    if (artistCache.has(aid)) return artistCache.get(aid);
    const p = (async () => {
      const s = await enqueue(() => itunes('https://itunes.apple.com/lookup?id=' + aid + '&entity=song&limit=12&country=FR'), true);
      const a = await enqueue(() => itunes('https://itunes.apple.com/lookup?id=' + aid + '&entity=album&limit=20&country=FR'), true);
      if (!s && !a) { artistCache.delete(aid); return null; }
      const seenS = new Set();
      const songs = [];
      for (const x of (s && s.results) || []) {
        if (x.wrapperType !== 'track' || x.kind !== 'song') continue;
        const k = norm(x.trackName);
        if (!k || seenS.has(k)) continue;
        seenS.add(k);
        songs.push({ t: x.trackName, a: x.artistName, c: x.collectionName, u: big(x.artworkUrl100, 200) });
        if (songs.length >= 6) break;
      }
      const seenA = new Set();
      const albums = [];
      for (const x of (a && a.results) || []) {
        if (x.wrapperType !== 'collection') continue;
        const k = norm((x.collectionName || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s*-\s*(single|ep)$/i, ''));
        if (!k || seenA.has(k)) continue;
        seenA.add(k);
        albums.push({ c: x.collectionName, a: x.artistName, y: (x.releaseDate || '').slice(0, 4), u: big(x.artworkUrl100, 300) });
        if (albums.length >= 10) break;
      }
      return { songs, albums };
    })();
    artistCache.set(aid, p);
    return p;
  }

  // ---------- aperçu des paroles (LRCLIB) ----------
  async function lyricsPreview(query) {
    try {
      const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(query));
      const list = await r.json();
      const hit = Array.isArray(list) ? list.find((x) => x.plainLyrics) : null;
      if (!hit) return null;
      return hit.plainLyrics.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    } catch (e) { return null; }
  }

  // ---------- lancer une recherche dans Sonora (clic sur un titre / un album) ----------
  function searchFor(q) {
    const nav = document.querySelector('.nav[data-view="search"]');
    if (nav) nav.click();
    setTimeout(() => {
      const inp = document.querySelector('.search-box');
      if (!inp) return;
      inp.focus();
      inp.value = q;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }, 250);
  }

  // ---------- panneau de droite ----------
  const panel = el('aside');
  panel.id = 'np-panel';
  panel.className = 'panel';
  app.appendChild(panel);

  const PREF = 'sonora.npOpen';
  const getPref = () => { try { return localStorage.getItem(PREF) !== '0'; } catch (e) { return true; } };
  const setPref = (v) => { try { localStorage.setItem(PREF, v ? '1' : '0'); } catch (e) { /* ignore */ } };
  let hasTrack = false;

  const right = document.querySelector('#player .right');
  const btn = el('button', 'icon-btn');
  btn.id = 'btn-view';
  btn.title = 'Vue en cours de lecture';
  btn.innerHTML = svg('panel', 20);
  if (right) {
    const ref = $('btn-mini');
    right.insertBefore(btn, ref && ref.parentNode === right ? ref : right.firstChild);
  }
  const applyOpen = () => {
    const open = hasTrack && getPref() && window.innerWidth > 1000;
    document.body.classList.toggle('np-open', open);
    btn.classList.toggle('on', open);
  };
  btn.addEventListener('click', () => {
    setPref(!(hasTrack && getPref()));
    applyOpen();
  });
  window.addEventListener('resize', applyOpen);

  const npArtUrl = () => {
    const a = $('np-art');
    if (!a) return '';
    const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(a).backgroundImage || '');
    return m ? m[1] : '';
  };

  function header(name) {
    const t = el('div', 'npp-top');
    t.appendChild(el('div', 'npp-album', name || 'En cours de lecture'));
    const x = el('button', 'icon-btn');
    x.title = 'Fermer';
    x.innerHTML = svg('close', 18);
    x.addEventListener('click', () => { setPref(false); applyOpen(); });
    t.appendChild(x);
    return t;
  }

  function build(title, artist, rec, data, lyr) {
    const keep = panel.scrollTop;
    panel.textContent = '';
    panel.appendChild(header(rec && rec.c));

    const cover = el('div', 'npp-cover');
    const u = (rec && rec.u) || npArtUrl();
    if (u) cover.style.backgroundImage = 'url("' + u + '")';
    panel.appendChild(cover);
    panel.appendChild(el('div', 'npp-title', rec ? rec.t : title));
    panel.appendChild(el('div', 'npp-artist', rec ? rec.a : artist));

    if (lyr && lyr.length) {
      const c = el('div', 'npp-card npp-lyrics');
      c.appendChild(el('h4', null, 'Aperçu des paroles'));
      lyr.forEach((line) => c.appendChild(el('p', null, line)));
      c.addEventListener('click', () => { const b = $('btn-lyrics'); if (b) b.click(); });
      panel.appendChild(c);
    }

    if (rec) {
      const c = el('div', 'npp-card');
      c.appendChild(el('h4', null, "À propos de l'artiste"));
      const row = el('div', 'npp-about');
      const first = data && data.albums[0];
      const ap = img(first ? first.u : '');
      if (first) row.appendChild(ap);
      if (window.dzArtist) window.dzArtist(rec.a).then((u) => { if (!u) return; ap.src = u; if (!ap.parentNode) row.insertBefore(ap, row.firstChild); });
      const info = el('div');
      info.appendChild(el('div', 'n', rec.a));
      const sub = [rec.g, rec.y ? 'Sorti en ' + rec.y : ''].filter(Boolean).join(' · ');
      if (sub) info.appendChild(el('div', 'm', sub));
      if (data && data.albums.length) {
        const n = data.albums.length;
        info.appendChild(el('div', 'm', n + ' sortie' + (n > 1 ? 's' : '')));
      }
      row.appendChild(info);
      c.appendChild(row);
      panel.appendChild(c);
    }

    if (data && data.songs.length) {
      panel.appendChild(el('div', 'npp-sec', 'Titres de ' + (rec ? rec.a : artist)));
      data.songs.forEach((s) => {
        const r = el('div', 'npp-row');
        r.title = 'Rechercher ce titre';
        r.appendChild(img(s.u));
        const tx = el('div', 'tx');
        tx.appendChild(el('div', 't', s.t));
        tx.appendChild(el('div', 's', s.c || ''));
        r.appendChild(tx);
        r.addEventListener('click', () => searchFor(s.a + ' ' + s.t));
        panel.appendChild(r);
      });
    }

    if (data && data.albums.length) {
      panel.appendChild(el('div', 'npp-sec', 'Albums'));
      const row = el('div', 'npp-albums');
      data.albums.forEach((al) => {
        const c = el('div', 'npp-alb');
        c.title = 'Rechercher cet album';
        c.appendChild(img(al.u));
        c.appendChild(el('div', 't', al.c));
        c.appendChild(el('div', 's', al.y || ''));
        c.addEventListener('click', () => searchFor(al.a + ' ' + al.c));
        row.appendChild(c);
      });
      panel.appendChild(row);
    }
    panel.scrollTop = keep;
  }

  let curKey = '';
  let token = 0;
  async function refresh() {
    const title = txt('np-title');
    const artist = txt('np-artist');
    const has = !!title && title !== 'Rien en lecture';
    hasTrack = has;
    if (!has) { curKey = ''; panel.textContent = ''; applyOpen(); return; }
    const key = title + '|' + artist;
    if (key === curKey) { applyOpen(); return; }
    curKey = key;
    const my = ++token;
    panel.scrollTop = 0;
    build(title, artist, null, null, null);
    applyOpen();

    const rec = await getTrack(title, artist, true);
    if (my !== token) return;
    build(title, artist, rec, null, null);

    const lyrQ = rec ? rec.t + ' ' + rec.a : cleanTitle(title) + ' ' + cleanArtist(artist);
    const [data, lyr] = await Promise.all([rec ? getArtist(rec.aid) : null, lyricsPreview(lyrQ.trim())]);
    if (my !== token) return;
    build(title, artist, rec, data, lyr);
  }

  // ---------- vraies pochettes à la place des miniatures YouTube ----------
  const setArt = (a, url) => {
    if (a.tagName === 'IMG') { if (a.src !== url) a.src = url; return; }
    const v = 'url("' + url + '")';
    if (a.style.backgroundImage !== v) a.style.backgroundImage = v;
  };
  function eligible(a) {
    const cur = a.tagName === 'IMG' ? (a.currentSrc || a.src || '') : (getComputedStyle(a).backgroundImage || '');
    if (/mzstatic\.com/.test(cur)) return true;
    if (/ytimg|youtube|ggpht|googleusercontent/i.test(cur)) return true;
    if (a.tagName === 'IMG') return !cur;
    return !/url\(/.test(cur);
  }
  function visible(a) {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.bottom > -200 && r.top < window.innerHeight + 200 &&
      r.right > -200 && r.left < window.innerWidth + 200;
  }
  function scan() {
    document.querySelectorAll('.art').forEach((a) => {
      if (a.closest('#np-panel')) return;
      const ctx = a.closest('.card, .h-card, .shortcut, .np');
      if (!ctx || !visible(a)) return;
      let tEl, aEl;
      if (ctx.classList.contains('np')) { tEl = ctx.querySelector('#np-title'); aEl = ctx.querySelector('#np-artist'); }
      else if (ctx.classList.contains('shortcut')) { tEl = ctx.querySelector('.s-title'); aEl = null; }
      else { tEl = ctx.querySelector('.c-title'); aEl = ctx.querySelector('.c-sub'); }
      const title = tEl ? tEl.textContent.trim() : '';
      const artist = aEl ? aEl.textContent.trim() : '';
      if (!title || title === 'Rien en lecture' || !eligible(a)) return;
      const key = metaKey(title, artist);
      a.dataset.ck = key;
      const hit = peek(key);
      if (hit && hit.r) setArt(a, hit.r.u);
      else if (hit === undefined) {
        getTrack(title, artist, false).then((rec) => {
          if (rec && a.dataset.ck === key && a.isConnected) setArt(a, rec.u);
        });
      }
    });
  }

  let scanTimer = 0;
  const scheduleScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 200); };
  new MutationObserver((muts) => {
    const outside = muts.some((m) => {
      const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      return !(n && n.closest && n.closest('#np-panel'));
    });
    if (outside) scheduleScan();
  }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src'] });
  document.addEventListener('scroll', scheduleScan, true);

  // ---------- suivre le morceau en cours ----------
  let refTimer = 0;
  const scheduleRefresh = () => { clearTimeout(refTimer); refTimer = setTimeout(refresh, 400); };
  ['np-title', 'np-artist'].forEach((id) => {
    const e = $(id);
    if (e) new MutationObserver(scheduleRefresh).observe(e, { childList: true, characterData: true, subtree: true });
  });
  refresh();
  scan();
})();
