// Sonora : vue plein écran « en lecture » — grande pochette, nom, et paroles synchronisées ligne par ligne et mot par mot.
// Ouverture : clic sur la pochette (barre du bas) = pochette en grand ; clic sur le crayon = paroles.
// Paroles : LRCLIB (gratuit, sans clé), déjà autorisé dans la CSP de index.html.
(() => {
  'use strict';
  if (typeof S === 'undefined') return;

  const g = (id) => document.getElementById(id);
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const enc = encodeURIComponent;
  const OFFS = (typeof load === 'function' ? load('sonora.lyoffs', {}) : {}) || {};

  // ---------- nettoyage titre / artiste pour la recherche de paroles ----------
  function clean(t) {
    let title = (t.title || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ').replace(/\s+-\s+(remaster|live|radio|single|version|edit|clip|official).*$/i, '').replace(/\s+/g, ' ').trim();
    let artist = (t.artist || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
    const parts = title.split(' - ');
    if (parts.length >= 2 && (norm(artist) && norm(parts[0]).includes(norm(artist)) || norm(artist).includes(norm(parts[0])))) { artist = parts[0].trim(); title = parts.slice(1).join(' - ').trim(); }
    artist = artist.split(/,|\bfeat\.?\b|\bft\.?\b| & | x /i)[0].trim();
    title = title.replace(/\s+(feat\.?|ft\.?)\s.*$/i, '').trim();
    return { artist, title };
  }
  function parseLRC(s) {
    const out = [];
    for (const raw of String(s || '').split('\n')) {
      const m = raw.match(/^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/);
      if (!m) continue;
      const text = m[2].trim();
      if (!text) continue;
      for (const ts of m[1].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) out.push({ t: +ts[1] * 60 + +ts[2], text });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // ---------- LRCLIB ----------
  const cache = new Map();
  async function fetchLyrics(t) {
    const { artist, title } = clean(t);
    if (!title) return null;
    const dur = Math.round((typeof curDur === 'function' ? curDur() : 0) || t.duration || 0);
    const search = async (qs) => { const r = await fetch('https://lrclib.net/api/search?' + qs); if (!r.ok) return []; const j = await r.json(); return Array.isArray(j) ? j : []; };
    let list = await search('track_name=' + enc(title) + (artist ? '&artist_name=' + enc(artist) : ''));
    if (!list.length) list = await search('q=' + enc((artist + ' ' + title).trim()));
    if (list.some((x) => x.instrumental) && !list.some((x) => x.syncedLyrics || x.plainLyrics)) return { instrumental: true };
    const close = (x) => Math.abs((x.duration || 0) - dur);
    const synced = list.filter((x) => x.syncedLyrics).sort((a, b) => close(a) - close(b));
    if (synced.length) { const lines = parseLRC(synced[0].syncedLyrics); if (lines.length) return { synced: true, lines }; }
    const plain = list.find((x) => x.plainLyrics);
    if (plain) return { synced: false, lines: plain.plainLyrics.split('\n').map((s) => ({ text: s.trim() })) };
    return null;
  }

  // ---------- interface ----------
  let el = null, open = false, mode = 'lyrics', key = '', ly = null, tok = 0, idx = -2, lit = -1, raf = 0, drag = false, off = 0;
  const hiRes = (u) => (u && /dzcdn\.net/.test(u) ? u.replace(/\/\d+x\d+-/, '/1000x1000-') : u);

  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'fs'; el.className = 'hidden';
    el.innerHTML = `<div class="fs-bg"></div><div class="fs-shade"></div>
      <button class="fs-close" title="Réduire (Échap)">⌄</button>
      <div class="fs-sync hidden"><button data-o="-0.5" title="Paroles plus tôt">−</button><span class="fs-off">0.0 s</span><button data-o="0.5" title="Paroles plus tard">+</button></div>
      <div class="fs-main">
        <section class="fs-left">
          <div class="fs-cover"></div>
          <div class="fs-meta"><div class="fs-title"></div><div class="fs-artist"><i class="fs-aph"></i><span></span></div></div>
          <div class="fs-seek"><span class="fs-cur">0:00</span><input class="fs-range" type="range" min="0" max="1000" value="0"><span class="fs-dur">0:00</span></div>
          <div class="fs-ctrl"><button data-c="btn-shuffle"></button><button data-c="btn-prev"></button><button class="fs-play" data-c="btn-play"></button><button data-c="btn-next"></button><button data-c="btn-repeat"></button></div>
          <div class="fs-vol"><span>🔊</span><input class="fs-vrange" type="range" min="0" max="100"></div>
        </section>
        <section class="fs-lyrics"><div class="fs-ly-in"></div><div class="fs-msg"></div></section>
      </div>
      <button class="fs-ly-btn" title="Afficher / masquer les paroles"></button>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    el.querySelector('.fs-close').onclick = close;
    el.querySelector('.fs-ly-btn').onclick = () => setMode(mode === 'lyrics' ? 'cover' : 'lyrics');
    el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { const s = g(b.dataset.c); if (s) s.click(); }; });
    el.querySelectorAll('.fs-sync button').forEach((b) => { b.onclick = () => { off = Math.round((off + +b.dataset.o) * 10) / 10; OFFS[key] = off; if (typeof store === 'function') store('sonora.lyoffs', OFFS); idx = -2; showOff(); }; });
    const range = q('.fs-range');
    range.addEventListener('input', () => { drag = true; if (typeof fill === 'function') fill(range); q('.fs-cur').textContent = fmt(range.value / 1000 * dur()); });
    range.addEventListener('change', () => { seek(range.value / 1000 * dur()); drag = false; });
    const vr = q('.fs-vrange');
    vr.addEventListener('input', () => { if (typeof fill === 'function') fill(vr); const v = g('volume'); if (v) { v.value = vr.value; v.dispatchEvent(new Event('input', { bubbles: true })); } });
    q('.fs-ly-in').addEventListener('click', (e) => { const p = e.target.closest('.ly[data-i]'); if (p && ly && ly.synced) seek(ly.lines[+p.dataset.i].t - off); });
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') close(); });
  }
  const dur = () => (typeof curDur === 'function' ? curDur() : 0) || 0;
  const time = () => (typeof curTime === 'function' ? curTime() : 0) || 0;
  function seek(sec) {
    if (typeof isYT === 'function' && isYT()) { if (typeof ytReady !== 'undefined' && ytReady) ytPlayer.seekTo(Math.max(0, sec), true); }
    else if (typeof audio !== 'undefined') audio.currentTime = Math.max(0, sec);
  }
  const showOff = () => { el.querySelector('.fs-off').textContent = (off >= 0 ? '+' : '−') + Math.abs(off).toFixed(1) + ' s'; };

  function setMode(m) {
    mode = m;
    el.classList.toggle('cover', m === 'cover');
    el.querySelector('.fs-ly-btn').classList.toggle('on', m === 'lyrics');
    el.querySelector('.fs-sync').classList.toggle('hidden', !(m === 'lyrics' && ly && ly.synced));
    idx = -2;
  }

  function loadTrack(t) {
    key = norm((t.artist || '') + '|' + (t.title || ''));
    off = OFFS[key] || 0; showOff();
    const img = hiRes(t.image);
    el.querySelector('.fs-cover').style.backgroundImage = img ? `url('${img}')` : '';
    el.querySelector('.fs-cover').textContent = img ? '' : '♪';
    el.querySelector('.fs-bg').style.backgroundImage = img ? `url('${img}')` : '';
    el.querySelector('.fs-title').textContent = t.title || '';
    el.querySelector('.fs-artist span').textContent = t.artist || '';
    const ph = el.querySelector('.fs-aph'); ph.style.backgroundImage = ''; ph.style.display = 'none';
    if (window.dzArtist) window.dzArtist(t.artist).then((u) => { if (u && key === norm((t.artist || '') + '|' + (t.title || ''))) { ph.style.backgroundImage = `url('${u}')`; ph.style.display = 'inline-block'; } });
    ly = null; idx = -2; lit = -1;
    renderLyrics('Recherche des paroles…');
    const my = ++tok, k = key;
    const done = (r) => { if (my !== tok) return; cache.set(k, r || null); ly = r && r.lines ? r : null; renderLyrics(r && r.instrumental ? 'Instrumental' : r ? '' : 'Paroles introuvables pour ce titre'); setMode(mode); };
    if (cache.has(k)) done(cache.get(k));
    else fetchLyrics(t).then(done).catch(() => done(null));
  }

  function renderLyrics(msg) {
    const box = el.querySelector('.fs-lyrics'), inn = el.querySelector('.fs-ly-in');
    el.querySelector('.fs-msg').textContent = msg || '';
    box.classList.toggle('plain', !!(ly && !ly.synced));
    if (!ly) { inn.innerHTML = ''; inn.style.transform = ''; return; }
    inn.innerHTML = ly.lines.map((l, i) => l.text
      ? `<p class="ly" data-i="${i}">${l.text.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ')}</p>`
      : '<p class="ly gap"></p>').join('');
  }

  function activate(i) {
    const lines = el.querySelectorAll('.ly');
    lines.forEach((p, n) => {
      const d = Math.abs(n - i);
      p.classList.toggle('on', n === i);
      p.classList.toggle('past', n < i);
      p.style.setProperty('--o', n === i ? 1 : Math.max(.14, .5 - d * .07));
      if (n !== i) p.querySelectorAll('.w.on').forEach((w) => w.classList.remove('on'));
    });
    const box = el.querySelector('.fs-lyrics'), inn = el.querySelector('.fs-ly-in');
    const cur = lines[Math.max(0, i)];
    if (cur) inn.style.transform = `translateY(${Math.round(box.clientHeight * .42 - (cur.offsetTop + cur.offsetHeight / 2))}px)`;
    lit = -1;
  }

  function tick() {
    if (!open) return;
    raf = requestAnimationFrame(tick);
    const t = S.queue[S.qi];
    if (t && norm((t.artist || '') + '|' + (t.title || '')) !== key) loadTrack(t);
    const c = time(), d = dur();
    if (!drag) {
      const rg = el.querySelector('.fs-range'); rg.value = d ? Math.min(1000, c / d * 1000) : 0; if (typeof fill === 'function') fill(rg);
      el.querySelector('.fs-cur').textContent = fmt(c);
    }
    el.querySelector('.fs-dur').textContent = fmt(d);
    const pb = g('btn-play'), fp = el.querySelector('.fs-play');
    if (pb && fp.innerHTML !== pb.innerHTML) fp.innerHTML = pb.innerHTML;
    ['btn-shuffle', 'btn-repeat'].forEach((id) => { const s = g(id), b = el.querySelector(`[data-c="${id}"]`); if (s && b) b.classList.toggle('on', s.classList.contains('on')); });
    if (mode !== 'lyrics' || !ly || !ly.synced) return;
    const tt = c + off, L = ly.lines;
    let lo = 0, hi = L.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].t <= tt) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i !== idx) { idx = i; activate(i); }
    if (i >= 0) {
      let n = i + 1; while (n < L.length && L[n].t === L[i].t) n++;
      const end = n < L.length ? Math.min(L[n].t, L[i].t + 7) : L[i].t + 5;
      const p = Math.min(1, Math.max(0, (tt - L[i].t) / Math.max(.4, end - L[i].t)));
      const ws = el.querySelectorAll('.ly.on .w'), k = Math.ceil(p * ws.length - .15);
      if (k !== lit) { lit = k; ws.forEach((w, x) => w.classList.toggle('on', x < k)); }
    }
  }

  function openFS(m) {
    const t = S.queue[S.qi];
    if (!t) { if (typeof toast === 'function') toast('Lance d’abord un titre'); return; }
    build();
    ['btn-shuffle', 'btn-prev', 'btn-play', 'btn-next', 'btn-repeat'].forEach((id) => { const s = g(id), b = el.querySelector(`[data-c="${id}"]`); if (s && b) b.innerHTML = s.innerHTML; });
    const lb = g('btn-lyrics'); if (lb) el.querySelector('.fs-ly-btn').innerHTML = lb.innerHTML || '✎';
    const v = g('volume'); if (v) { const vr = el.querySelector('.fs-vrange'); vr.value = v.value; if (typeof fill === 'function') fill(vr); }
    el.classList.remove('hidden'); open = true;
    key = ''; mode = m; el.classList.toggle('cover', m === 'cover');
    loadTrack(t); setMode(m);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function close() { if (!el) return; open = false; cancelAnimationFrame(raf); el.classList.add('hidden'); }

  // clic sur la pochette / le titre (barre du bas) = pochette en grand ; clic sur le crayon = paroles
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-lyrics')) { e.stopImmediatePropagation(); e.preventDefault(); if (open) setMode(mode === 'lyrics' ? 'cover' : 'lyrics'); else openFS('lyrics'); return; }
    if (e.target.closest('#np-art') || e.target.closest('.np-text')) { if (!open) openFS('cover'); }
  }, true);

  window.sonoraFS = { open: openFS, close, parseLRC, clean };
})();
