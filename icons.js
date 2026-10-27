// Sonora : vraies icônes (SVG) pour la barre de lecture et la barre latérale.
// Ce fichier ne touche pas à la logique de app.js : il remplace seulement les
// symboles texte des boutons par des icônes, et suit leur état (lecture/pause,
// muet, aimé...) en observant ce que app.js écrit dans les boutons.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- jeu d'icônes (style Feather, trait arrondi) ----------
  const P = {
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    prev: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
    next: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
    play: '<polygon points="7 4 20 12 7 20 7 4"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    repeat1: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/>',
    plusCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    checkCircle: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><polyline points="7.5 12.5 10.5 15.5 16.5 9" style="stroke:var(--accent-text)"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    vol2: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    vol1: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    volx: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    pip: '<rect x="2" y="4" width="20" height="14" rx="2"/><rect x="12" y="11" width="7" height="4" rx="1" fill="currentColor"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
  };
  const SOLID = new Set(['prev', 'next', 'play', 'pause']);
  const svg = (name, size = 20) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${SOLID.has(name) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;

  // remplace le contenu d'un bouton, et le remet si app.js l'a réécrit en emoji
  const put = (el, name, size) => {
    if (!el) return;
    const cur = el.firstElementChild;
    const ok = el.dataset.ic === name && el.childNodes.length === 1 &&
      cur && cur.tagName.toLowerCase() === 'svg';
    if (ok) return;
    el.innerHTML = svg(name, size);
    el.dataset.ic = name;
  };

  // observe un bouton : quand app.js y réécrit du texte / une classe, on remet l'icône
  const watch = (el, fn) => {
    if (!el) return;
    const obs = new MutationObserver(() => { fn(); obs.takeRecords(); });
    obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    fn();
    obs.takeRecords();
  };

  // ---------- barre de lecture ----------
  const keep = (id, name, size) => watch($(id), () => put($(id), name, size));
  keep('btn-shuffle', 'shuffle', 20);
  keep('btn-prev', 'prev', 20);
  keep('btn-next', 'next', 20);
  keep('btn-queue', 'list', 20);
  keep('btn-lyrics', 'pen', 20);
  keep('new-playlist', 'plus', 20);

  // lecture / pause
  watch($('btn-play'), () => {
    const el = $('btn-play');
    const t = el.textContent.trim();
    let playing = el.dataset.playing === '1';
    if (t) playing = /⏸|⏹|‖|❚|pause/i.test(t);
    el.dataset.playing = playing ? '1' : '0';
    put(el, playing ? 'pause' : 'play', 20);
  });

  // répéter (tout / un titre)
  watch($('btn-repeat'), () => {
    const el = $('btn-repeat');
    const t = el.textContent.trim();
    let one = el.dataset.one === '1';
    if (t) one = /[¹1]|🔂/.test(t);
    el.dataset.one = one ? '1' : '0';
    put(el, one ? 'repeat1' : 'repeat', 20);
  });

  // j'aime : cercle + / cercle coché
  watch($('np-like'), () => {
    const el = $('np-like');
    const t = el.textContent.trim();
    let liked = el.dataset.liked === '1';
    if (t) liked = /[♥❤]/.test(t);
    else if (el.classList.contains('on') || el.classList.contains('liked')) liked = true;
    el.dataset.liked = liked ? '1' : '0';
    el.classList.toggle('liked', liked);
    put(el, liked ? 'checkCircle' : 'plusCircle', 22);
  });

  // volume / muet
  const vol = $('volume');
  const fill = (r) => {
    if (!r) return;
    const min = Number(r.min || 0), max = Number(r.max || 100);
    r.style.setProperty('--fill', ((r.value - min) / (max - min)) * 100 + '%');
  };
  const muteIcon = () => {
    const el = $('btn-mute');
    if (!el) return;
    const t = el.textContent.trim();
    let muted = el.dataset.muted === '1';
    if (t) muted = /🔇|🔈/.test(t);
    el.dataset.muted = muted ? '1' : '0';
    const v = vol ? Number(vol.value) : 100;
    put(el, muted || v === 0 ? 'volx' : v < 50 ? 'vol1' : 'vol2', 20);
  };
  watch($('btn-mute'), muteIcon);
  if (vol) {
    fill(vol);
    vol.addEventListener('input', () => { fill(vol); muteIcon(); });
  }
  // la barre de progression : on garde le remplissage à jour
  setInterval(() => fill($('seek')), 250);

  // ---------- plein écran / mode compact ----------
  const full = $('btn-full');
  const syncFull = () => put(full, document.fullscreenElement ? 'minimize' : 'maximize', 20);
  watch(full, syncFull);
  if (full) {
    full.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', syncFull);
  }
  const mini = $('btn-mini');
  if (mini) {
    watch(mini, () => put(mini, 'pip', 20));
    mini.addEventListener('click', () => {
      const on = document.body.classList.toggle('compact');
      mini.classList.toggle('on', on);
    });
  }

  // ---------- paroles (LRCLIB) ----------
  const panel = document.createElement('aside');
  panel.id = 'lyrics-panel';
  panel.className = 'hidden';
  document.body.appendChild(panel);
  let lastKey = '';

  const clean = (s) => (s || '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|video|audio|lyrics?|clip|visualizer|hd|4k)\b/gi, ' ')
    .replace(/\s+-\s+Topic$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const render = (title, artist, text) => {
    panel.textContent = '';
    const head = document.createElement('div');
    head.className = 'ly-head';
    const info = document.createElement('div');
    const h = document.createElement('div'); h.className = 'ly-title'; h.textContent = title;
    const a = document.createElement('div'); a.className = 'ly-artist'; a.textContent = artist;
    info.append(h, a);
    const x = document.createElement('button');
    x.className = 'icon-btn'; x.title = 'Fermer'; x.innerHTML = svg('close', 20);
    x.addEventListener('click', () => toggleLyrics(false));
    head.append(info, x);
    const body = document.createElement('div');
    body.className = 'ly-text';
    body.textContent = text;
    panel.append(head, body);
  };

  async function loadLyrics() {
    const title = ($('np-title').textContent || '').trim();
    const artist = ($('np-artist').textContent || '').trim();
    if (!title || title === 'Rien en lecture') {
      lastKey = '';
      render('Paroles', '', 'Lance un titre pour voir ses paroles.');
      return;
    }
    const key = title + '|' + artist;
    if (key === lastKey) return;
    lastKey = key;
    render(title, artist, 'Chargement…');
    try {
      const q = encodeURIComponent((clean(title) + ' ' + clean(artist)).trim());
      const res = await fetch('https://lrclib.net/api/search?q=' + q);
      const list = await res.json();
      if (key !== lastKey) return;
      const hit = Array.isArray(list) ? list.find((x) => x.plainLyrics) : null;
      render(title, artist, hit ? hit.plainLyrics : 'Paroles introuvables pour ce titre.');
    } catch (e) {
      if (key === lastKey) render(title, artist, 'Impossible de charger les paroles.');
    }
  }

  function toggleLyrics(show) {
    const on = typeof show === 'boolean' ? show : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !on);
    const b = $('btn-lyrics');
    if (b) b.classList.toggle('on', on);
    if (on) { lastKey = ''; loadLyrics(); }
  }
  const lb = $('btn-lyrics');
  if (lb) lb.addEventListener('click', () => toggleLyrics());
  // si le titre change pendant que le panneau est ouvert, on recharge
  const np = $('np-title');
  if (np) new MutationObserver(() => { if (!panel.classList.contains('hidden')) loadLyrics(); })
    .observe(np, { childList: true, characterData: true, subtree: true });

  // ---------- barre latérale ----------
  const NAV = { home: 'home', search: 'search', library: 'library', collection: 'library', liked: 'heart', queue: 'list', settings: 'sliders' };
  const navIcons = () => {
    document.querySelectorAll('.nav[data-view]').forEach((b) => {
      const name = NAV[b.dataset.view];
      if (!name) return;
      const first = b.firstElementChild;
      if (first && first.tagName.toLowerCase() === 'svg') return;
      const label = b.dataset.label || (b.querySelector('span') || {}).textContent || b.title || '';
      b.dataset.label = label;
      b.innerHTML = svg(name, 24);
      const sp = document.createElement('span');
      sp.textContent = label;
      b.appendChild(sp);
    });
  };
  navIcons();
  const side = $('sidebar');
  if (side) new MutationObserver(navIcons).observe(side, { childList: true, subtree: true });
})();
