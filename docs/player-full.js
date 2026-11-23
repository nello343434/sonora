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
  const words = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
  const sim = (a, b) => { const A = words(a), B = words(b); if (!A.length || !B.length) return 0; const sb = new Set(B); let c = 0; for (const w of new Set(A)) if (sb.has(w)) c++; return c / Math.max(new Set(A).size, sb.size); };
  function cleanTitle(x) {
    return (x || '').replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ').replace(/\s*[|｜].*$/, '')
      .replace(/\b(official\s+)?(music\s+|lyric\s+|audio\s+|hd\s+)?(video|audio|lyrics?|visuali[sz]er|clip\s+officiel|clip|4k|hq)\b/gi, ' ')
      .replace(/\s+-\s+(remaster|live|radio|single|version|edit|clip|official).*$/i, '')
      .replace(/\s+(feat\.?|ft\.?)\s.*$/i, '').replace(/\s+/g, ' ').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').trim();
  }
  // plusieurs lectures possibles du couple (artiste, titre) : les titres YouTube sont souvent « Artiste - Titre » ou « Titre - Artiste »
  function variants(t) {
    const artist = (t.artist || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
    const a1 = artist.split(/,|\bfeat\.?\b|\bft\.?\b| & | x /i)[0].trim();
    const title = cleanTitle(t.title), out = [];
    const add = (ar, ti) => { ti = (ti || '').trim(); ar = (ar || '').trim(); if (ti && !out.some((o) => o.artist === ar && o.title === ti)) out.push({ artist: ar, title: ti }); };
    const parts = title.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      const first = parts[0], rest = parts.slice(1).join(' - ');
      if (sim(first, a1) >= .5) add(first, rest);
      else if (sim(parts[parts.length - 1], a1) >= .5) add(parts[parts.length - 1], parts.slice(0, -1).join(' - '));
      add(a1, title); add(first, rest); add(parts[parts.length - 1], parts.slice(0, -1).join(' - '));
    } else add(a1, title);
    add('', out[0] ? out[0].title : title);
    return out;
  }
  const clean = (t) => { const v = variants(t)[0] || { artist: '', title: '' }; return v; };
  function parseLRC(s) {
    const out = [];
    for (const raw of String(s || '').split('\n')) {
      const m = raw.match(/^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/);
      if (!m) continue;
      const text = m[2].trim();                                   // une ligne vide = pause instrumentale (on garde son horodatage)
      for (const ts of m[1].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) out.push({ t: +ts[1] * 60 + +ts[2], text });
    }
    out.sort((a, b) => a.t - b.t);
    while (out.length && !out[0].text) out.shift();
    return out;
  }

  // ---------- LRCLIB ----------
  const cache = new Map();
  async function jget(url) { const r = await fetch(url); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
  async function fetchLyrics(t) {
    const vs = variants(t); if (!vs.length) return null;
    const dur0 = Math.round(dur() || t.duration || 0);
    const cands = new Map(), add = (x) => { if (x && x.id != null && !cands.has(x.id)) cands.set(x.id, x); };
    const search = async (qs) => { const j = await jget('https://lrclib.net/api/search?' + qs); (Array.isArray(j) ? j : []).forEach(add); };
    const goodEnough = () => { for (const c of cands.values()) if ((c.syncedLyrics || c.plainLyrics) && best(c, vs, 0) >= 2.2) return true; return false; };
    let netErr = null;
    const step = async (fn) => { try { await fn(); } catch (e) { netErr = e; } };
    if (dur0 > 0 && vs[0].artist) await step(async () => add(await jget('https://lrclib.net/api/get?artist_name=' + enc(vs[0].artist) + '&track_name=' + enc(vs[0].title) + '&duration=' + dur0)));
    for (const v of vs) {
      if (goodEnough()) break;
      if (v.artist) await step(() => search('track_name=' + enc(v.title) + '&artist_name=' + enc(v.artist)));
      if (!goodEnough()) await step(() => search('q=' + enc((v.artist + ' ' + v.title).trim())));
    }
    if (!cands.size && netErr) throw netErr;
    return { cands: [...cands.values()], vs };
  }
  // note d'un résultat : ressemblance du titre (obligatoire) + de l'artiste + écart de durée (si connue)
  function best(c, vs, d) {
    let b = -9;
    for (const v of vs) {
      const ts = sim(c.trackName || c.name, v.title); if (ts < .5) continue;
      const as = v.artist ? sim(c.artistName, v.artist) : .5;
      b = Math.max(b, ts * 2 + as + (c.syncedLyrics ? .3 : 0));
    }
    if (b < 0) return b;
    if (d > 0 && c.duration) { const x = Math.abs(c.duration - d); b += x <= 2 ? 1 : x <= 5 ? .6 : x <= 10 ? .2 : x <= 20 ? -.3 : -1; }
    return b;
  }
  function choose(res, d) {
    if (!res) return null;
    if (res.instrumental) return res;
    const all = res.cands.filter((c) => c.syncedLyrics || c.plainLyrics || c.instrumental);
    if (!all.length) return null;
    const scored = all.map((c) => ({ c, s: best(c, res.vs, d) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
    if (!scored.length) return null;
    const syncOk = scored.find((x) => x.c.syncedLyrics && (!(d > 0 && x.c.duration) || Math.abs(x.c.duration - d) <= 60));
    const pickS = syncOk || null;
    if (pickS) { const lines = parseLRC(pickS.c.syncedLyrics); if (lines.length) return { id: pickS.c.id, synced: true, lines }; }
    const pl = scored.find((x) => x.c.plainLyrics);
    if (pl) return { id: pl.c.id, synced: false, lines: pl.c.plainLyrics.split('\n').map((x) => ({ text: x.trim() })) };
    const sy = scored.find((x) => x.c.syncedLyrics);
    if (sy) { const lines = parseLRC(sy.c.syncedLyrics); if (lines.length) return { id: sy.c.id, synced: true, lines }; }
    if (scored.some((x) => x.c.instrumental)) return { instrumental: true };
    return null;
  }

  // ---------- interface ----------
  let userScroll = 0;   // dernier geste de l'utilisateur sur les paroles (on arrête alors le défilement automatique 4 s)
  let lineWords = null, sm = { t: 0, at: 0, last: -1 };
  let curRes = null, pickedDur = false, retry = 0;
  let el = null, open = false, mode = 'lyrics', key = '', ly = null, tok = 0, idx = -2, lit = -1, raf = 0, drag = false, off = 0;
  const hiRes = (u) => (u && /dzcdn\.net/.test(u) ? u.replace(/\/\d+x\d+-/, '/1000x1000-') : u);

  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'fs'; el.className = 'hidden';
    el.innerHTML = `<div class="fs-bg"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div><div class="fs-shade"></div>
      <button class="fs-close" title="Réduire (Échap)">${I.chevDown}</button>
      <div class="fs-sync hidden"><button data-o="-0.5" title="Paroles plus tôt">−</button><span class="fs-off">0.0 s</span><button data-o="0.5" title="Paroles plus tard">+</button></div>
      <div class="fs-main">
        <section class="fs-left">
          <div class="fs-cover"></div>
          <div class="fs-meta"><div class="fs-title"></div><div class="fs-artist"><i class="fs-aph"></i><span></span></div></div>
          <div class="fs-seek"><span class="fs-cur">0:00</span><input class="fs-range" type="range" min="0" max="1000" value="0"><span class="fs-dur">0:00</span></div>
          <div class="fs-ctrl"><button data-c="btn-shuffle"></button><button data-c="btn-prev"></button><button class="fs-play" data-c="btn-play"></button><button data-c="btn-next"></button><button data-c="btn-repeat"></button></div>
          <div class="fs-vol"><span>${I.volHigh}</span><input class="fs-vrange" type="range" min="0" max="100"></div>
        </section>
        <section class="fs-lyrics"><div class="fs-ly-in"></div><div class="fs-msg"></div></section>
      </div>
      <button class="fs-ly-btn" title="Afficher / masquer les paroles"></button>
      <button class="fs-flash" title="Flash blanc sur les basses"><svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg></button>
      <div class="pillg fs-wctl">${(document.getElementById('wctl') || {}).innerHTML || ''}</div>`;
    const lyBox = el.querySelector('.fs-lyrics'); ['wheel', 'touchstart', 'pointerdown'].forEach((ev) => lyBox.addEventListener(ev, () => { userScroll = Date.now(); }, { passive: true }));
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    el.querySelector('.fs-close').onclick = close;
    { const fb = el.querySelector('.fs-flash'), paint = () => { fb.classList.toggle('off', S.settings.flash === false); fb.title = S.settings.flash === false ? 'Flash blanc : désactivé' : 'Flash blanc : activé'; };
      paint(); fb.onclick = () => { S.settings.flash = S.settings.flash === false; try { persist(); } catch (e) { /* ignoré */ } paint(); }; }
    { const wc = el.querySelector('.fs-wctl'), api = () => window.api || {};            // boutons de fenêtre (réduire / agrandir / fermer) aussi dans ce mode
      wc.addEventListener('click', (e) => { const b = e.target.closest('[data-wc]'); if (b && api().winCmd) api().winCmd(b.dataset.wc); setTimeout(() => { const m = document.getElementById('wc-max'), mine = wc.querySelector('[data-wc="max"]'); if (m && mine) { mine.innerHTML = m.innerHTML; mine.title = m.title; } }, 250); });
      const mine = wc.querySelector('[data-wc="max"]'); if (mine) mine.removeAttribute('id'); }
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
  const time = () => {
    const raw = (typeof curTime === 'function' ? curTime() : 0) || 0, now = performance.now();
    const playing = typeof isPaused === 'function' ? !isPaused() : true;
    if (raw !== sm.last) { sm.last = raw; sm.t = raw; sm.at = now; }        // nouvelle mesure
    if (!playing) { sm.t = raw; sm.at = now; return raw; }
    const est = sm.t + (now - sm.at) / 1000;                                   // entre deux mesures : on avance avec l'horloge
    return Math.abs(est - raw) > .6 ? raw : Math.max(raw, est);
  };
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

  function loadTrack(t, again) {
    key = norm((t.artist || '') + '|' + (t.title || ''));
    off = OFFS[key] || 0; showOff();
    const img = hiRes(t.image || t.fbimg);
    const cv = el.querySelector('.fs-cover'); cv.dataset.real = t.image && t.hq !== false ? '1' : '';
    cv.style.backgroundImage = img ? `url('${img}')` : '';
    cv.innerHTML = img ? '' : I.note;
    // pochette grise : si la version HD ne charge pas (ou est le gris par défaut), on retombe sur l'image d'origine
    if (img) { const raw = t.image || t.fbimg, im = new Image(); const bad = () => { if (raw && raw !== img && cv.style.backgroundImage.indexOf(img) > -1) cv.style.backgroundImage = `url('${raw}')`; }; im.onerror = bad; im.onload = () => { if (im.naturalWidth && im.naturalWidth <= 130 && raw !== img) bad(); }; im.src = img; }
    try { if (!t.image && window.sonoraCover) window.sonoraCover.ensure(t, true); } catch (e) { /* ignoré */ }
    if (window.sonoraAmbient) window.sonoraAmbient.update(true);
    el.querySelector('.fs-title').textContent = t.title || '';
    el.querySelector('.fs-artist span').textContent = t.artist || '';
    { const fa = el.querySelector('.fs-artist'); if (t.artist) { fa.dataset.aopen = t.artist; fa.title = 'Voir l’artiste'; } else { delete fa.dataset.aopen; fa.title = ''; } }
    const ph = el.querySelector('.fs-aph'); ph.style.backgroundImage = ''; ph.style.display = 'none';
    if (window.dzArtist) window.dzArtist(t.artist).then((u) => { if (u && key === norm((t.artist || '') + '|' + (t.title || ''))) { if (!img && !cv.dataset.real) { cv.style.backgroundImage = `url('${u}')`; cv.innerHTML = ''; } ph.style.backgroundImage = `url('${u}')`; ph.style.display = 'inline-block'; } });
    ly = null; idx = -2; lit = -1;
    renderLyrics('Recherche des paroles…');
    const my = ++tok, k = key; curRes = null; pickedDur = false; clearTimeout(retry);
    const done = (r, err) => {
      if (my !== tok) return;
      if (!err) cache.set(k, r || null);
      curRes = r || null; pickedDur = dur() > 0;
      const c = choose(r, dur());
      ly = c && c.lines ? c : null;
      renderLyrics(c && c.instrumental ? 'Instrumental' : c ? '' : err ? 'Connexion impossible, nouvelle tentative…' : 'Paroles introuvables pour ce titre');
      setMode(mode);
      if (err) retry = setTimeout(() => { if (my === tok && open) loadTrack(t, true); }, 4000);
    };
    if (cache.has(k)) done(cache.get(k));
    else fetchLyrics(t).then((r) => done(r), (e) => done(null, e || true));
  }

  function renderLyrics(msg) {
    prevAct = null;
    const box = el.querySelector('.fs-lyrics'), inn = el.querySelector('.fs-ly-in');
    el.querySelector('.fs-msg').textContent = msg || '';
    box.classList.toggle('plain', !!(ly && !ly.synced));
    if (!ly) { inn.innerHTML = ''; inn.style.transform = ''; return; }
    inn.innerHTML = ly.lines.map((l, i) => l.text
      ? `<p class="ly" data-i="${i}">${l.text.split(/\s+/).map((w) => `<span class="w" data-n="${w.length + 1}" data-w="${esc(w)}">${esc(w)}</span>`).join(' ')}</p>`
      : '<p class="ly gap"></p>').join('');
  }

  let prevAct = null;
  function activate(i) {
    const lines = el.querySelectorAll('.ly');
    // on ne touche qu'aux lignes proches de l'ancienne et de la nouvelle ligne (les autres ont déjà le même aspect lointain) : bien moins de travail à chaque changement de ligne
    const lo = prevAct === null ? 0 : Math.max(0, Math.min(prevAct, i) - 6), hi = prevAct === null ? lines.length - 1 : Math.min(lines.length - 1, Math.max(prevAct, i) + 6);
    prevAct = i;
    for (let n = lo; n <= hi; n++) {
      const p = lines[n], d = Math.abs(n - i), isOn = n === i, past = n < i;
      if (p.classList.contains('on') !== isOn) p.classList.toggle('on', isOn);
      if (p.classList.contains('past') !== past) p.classList.toggle('past', past);
      p.style.setProperty('--o', isOn ? 1 : Math.max(.16, .55 - d * .08));
      p.style.setProperty('--bl', isOn ? '0px' : Math.min(4, d * .9).toFixed(1) + 'px');
      if (!isOn) p.querySelectorAll('.w').forEach((w) => { if (w.dataset.f !== undefined) { w.style.removeProperty('--f'); delete w.dataset.f; } });
    }
    const box = el.querySelector('.fs-lyrics'), inn = el.querySelector('.fs-ly-in');
    const cur = lines[Math.max(0, i)];
    if (cur) inn.style.transform = `translateY(${Math.round(box.clientHeight * .42 - (cur.offsetTop + cur.offsetHeight / 2))}px)`;
    lit = -1;
  }

  const MOB = document.documentElement.classList.contains('mobile'); let lastT = 0;
  function tick() {
    if (!open) return;
    raf = requestAnimationFrame(tick);
    if (MOB) { const nw = performance.now(); if (nw - lastT < 30) return; lastT = nw; }   // téléphone : ~30 images/s suffisent pour les paroles et allègent le processeur
    const t = S.queue[S.qi];
    if (t && norm((t.artist || '') + '|' + (t.title || '')) !== key) loadTrack(t);
    const c = time(), d = dur();
    if (!drag) {
      const rg = el.querySelector('.fs-range'); rg.value = d ? Math.min(1000, c / d * 1000) : 0; if (typeof fill === 'function') fill(rg);
      const cu = el.querySelector('.fs-cur'), ct = fmt(c); if (cu.textContent !== ct) cu.textContent = ct;
    }
    { const du = el.querySelector('.fs-dur'), dt = fmt(d); if (du.textContent !== dt) du.textContent = dt; }
    const pb = g('btn-play'), fp = el.querySelector('.fs-play');
    if (pb && fp.innerHTML !== pb.innerHTML) fp.innerHTML = pb.innerHTML;
    ['btn-shuffle', 'btn-repeat'].forEach((id) => { const s = g(id), b = el.querySelector(`[data-c="${id}"]`); if (s && b) b.classList.toggle('on', s.classList.contains('on')); });
    if (curRes && !pickedDur && d > 0) {                    // la durée vient d'être connue : on choisit la version qui colle le mieux
      pickedDur = true; const c = choose(curRes, d);
      if (c && c.lines && (!ly || c.id !== ly.id)) { ly = c; renderLyrics(''); setMode(mode); }
    }
    if (mode === 'lyrics' && ly && !ly.synced) {            // paroles sans minutage : défilement automatique approximatif selon l'avancement du titre
      const box = el.querySelector('.fs-lyrics');
      if (d > 0 && Date.now() - userScroll > 4000) {
        const max = box.scrollHeight - box.clientHeight, p = Math.min(1, Math.max(0, (c - d * .04) / (d * .88)));
        const target = p * max; box.scrollTop += (target - box.scrollTop) * .06;
      }
      return;
    }
    if (mode !== 'lyrics' || !ly || !ly.synced) return;
    const tt = c + off, L = ly.lines;
    let lo = 0, hi = L.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].t <= tt) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i !== idx) { idx = i; lineWords = null; activate(i); }
    if (i >= 0) {
      let n = i + 1; while (n < L.length && L[n].t === L[i].t) n++;
      const end = n < L.length ? Math.min(L[n].t, L[i].t + 8) : L[i].t + 5;
      // le chanteur finit un peu avant la ligne suivante : on termine le remplissage à 92 % de l'intervalle
      const p = Math.min(1, Math.max(0, (tt - L[i].t) / Math.max(.5, (end - L[i].t) * .92)));
      const ws = lineWords || (lineWords = [...el.querySelectorAll('.ly.on .w')]);
      if (ws.length) {
        let tot = 0; for (const w of ws) tot += +w.dataset.n || 3;
        let acc = 0;
        for (const w of ws) {
          const wl = (+w.dataset.n || 3) / tot, f = Math.min(1, Math.max(0, (p - acc) / wl)); acc += wl;
          const fs = f.toFixed(2); if (w.dataset.f !== fs) { w.dataset.f = fs; w.style.setProperty('--f', fs); }
        }
      }
    }
  }

  function openFS(m) {
    const t = S.queue[S.qi];
    if (!t) { if (typeof toast === 'function') toast('Lance d’abord un titre'); return; }
    build();
    ['btn-shuffle', 'btn-prev', 'btn-play', 'btn-next', 'btn-repeat'].forEach((id) => { const s = g(id), b = el.querySelector(`[data-c="${id}"]`); if (s && b) b.innerHTML = s.innerHTML; });
    const lb = g('btn-lyrics'); if (lb) el.querySelector('.fs-ly-btn').innerHTML = lb.innerHTML || I.edit;
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

  document.addEventListener('sonora:cover', (e) => { if (!open || !el) return; const t = S.queue[S.qi]; if (t && e.detail && e.detail.track && norm(e.detail.track.title) === norm(t.title)) { const u = hiRes(e.detail.url); el.querySelector('.fs-cover').style.backgroundImage = `url('${u}')`; el.querySelector('.fs-cover').innerHTML = ''; el.querySelector('.fs-cover').dataset.real = '1'; } });
  window.sonoraFS = { open: openFS, close, parseLRC, clean };
})();
