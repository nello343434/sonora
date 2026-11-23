/* Sonora mobile : comportements propres au téléphone */
(function () {
  const Cap = window.Capacitor;
  // bouton « retour » d'Android : ferme le plein écran / une fenêtre, sinon revient à l'écran précédent, sinon réduit l'appli
  try {
    const App = Cap && Cap.Plugins && Cap.Plugins.App;
    if (App && App.addListener) App.addListener('backButton', () => {
      const sm = document.getElementById('settings-modal');
      if (sm && !sm.classList.contains('hidden')) { if (sm.classList.contains('m-pane')) { sm.classList.remove('m-pane'); sm.classList.add('m-list'); } else { const x = sm.querySelector('.set-x'); if (x) x.click(); } return; }
      const fsx = document.getElementById('fs');
      if (fsx && !fsx.classList.contains('hidden') && !fsx.classList.contains('cover')) { delete fsx.dataset.ly; const lb = fsx.querySelector('.fs-ly-btn'); if (lb) lb.click(); return; }
      const sp = document.getElementById('search-pop');
      if (sp && !sp.classList.contains('hidden')) { sp.classList.add('hidden'); const si = document.getElementById('search-input'); if (si) si.blur(); document.documentElement.classList.remove('srch'); return; }
      const fs = window.sonoraFS;
      if (fs && document.getElementById('fs') && !document.getElementById('fs').hidden && document.getElementById('fs').classList.contains('open')) { try { fs.close(); return; } catch (e) { /* suite */ } }
      const bk = document.querySelector('#main [data-lv=back], #main > .row:first-child .btn');
      if (bk) { bk.click(); return; }
      if (typeof S !== 'undefined' && S.view && S.view !== 'home') { go('home'); return; }
      App.minimizeApp && App.minimizeApp();
    });
  } catch (e) { /* hors Android */ }
  // un tap sur le mini-lecteur (hors cœur) ouvre le lecteur en grand
  document.addEventListener('click', (e) => {
    const np = e.target.closest('#player .np'); if (!np || e.target.closest('#np-like')) return;
    const b = document.getElementById('btn-full'); if (b) b.click();
  });

  // --- barre d'état : le contenu commence sous l'heure/batterie (sinon le haut de l'appli est inaccessible)
  const root = document.documentElement;
  (async () => {
    try {
      const SB = Cap && Cap.Plugins && Cap.Plugins.StatusBar;
      if (SB) { try { await SB.setOverlaysWebView({ overlay: false }); } catch (e) { /* ignoré */ } try { await SB.setBackgroundColor({ color: '#0b0b0f' }); } catch (e) { /* ignoré */ } }
    } catch (e) { /* hors Android */ }
    // si le système laisse quand même la page passer sous la barre d'état, on ajoute une marge de secours
    try {
      const SB = Cap && Cap.Plugins && Cap.Plugins.StatusBar, info = SB && SB.getInfo ? await SB.getInfo() : null;
      const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden';
      document.body.appendChild(probe); const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0; probe.remove();
      if (Cap && Cap.isNativePlatform && Cap.isNativePlatform() && !inset && (!info || info.overlays !== false)) root.style.setProperty('--sat-js', '34px');
    } catch (e) { /* ignoré */ }
  })();
  // --- vue courante (pour masquer l'en-tête sur les pages détail)
  setInterval(() => { try { if (typeof S !== 'undefined' && root.dataset.v !== S.view) root.dataset.v = S.view; } catch (e) { /* ignoré */ } }, 250);
  // --- clavier : on masque les barres du bas seulement quand il est vraiment ouvert
  const vh = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  let maxH = vh();
  const chkKb = () => { maxH = Math.max(maxH, vh()); root.classList.toggle('kb', vh() < maxH - 140); };
  window.addEventListener('resize', chkKb); if (window.visualViewport) window.visualViewport.addEventListener('resize', chkKb);
  // --- mode recherche : champ en grand, pas d'avatar
  const isField = (el) => el && el.id === 'search-input';
  const updSrch = () => { const p = document.getElementById('search-pop'); root.classList.toggle('srch', !!(p && !p.classList.contains('hidden')) || isField(document.activeElement)); };
  document.addEventListener('focusin', () => setTimeout(updSrch, 0));
  document.addEventListener('focusout', () => setTimeout(updSrch, 150));
  setInterval(updSrch, 400);
  // le mode recherche suit l'ouverture/fermeture du panneau IMMÉDIATEMENT (sinon la page du dessous clignote une fraction de seconde)
  (function () { const p = document.getElementById('search-pop'); if (p) new MutationObserver(updSrch).observe(p, { attributes: true, attributeFilter: ['class'] }); })();
  // le clavier se ferme dès qu'on fait défiler les résultats
  document.addEventListener('touchmove', (e) => { if (e.target.closest && e.target.closest('#search-pop') && isField(document.activeElement)) document.activeElement.blur(); }, { passive: true });
  // un onglet du bas ferme la recherche
  document.addEventListener('click', (e) => {
    const n = e.target.closest('#sidebar .nav'); if (!n) return;
    const smm = document.getElementById('settings-modal');
    if (smm && !smm.classList.contains('hidden')) { const xb = smm.querySelector('[data-st=close]'); if (xb && !n.matches('.bottom, #nav-settings')) xb.click(); }
    if (n.id === 'nav-search') return;
    const i = document.getElementById('search-input'); if (i) { i.blur(); }
    const p = document.getElementById('search-pop'); if (p) p.classList.add('hidden');
    setTimeout(updSrch, 50);
  }, true);
  // --- « Recherches récentes » de l'accueil : égaliseur à droite du titre en cours de lecture
  setInterval(() => {
    try {
      const hh = (window.sonoraHist && window.sonoraHist.get && window.sonoraHist.get()) || [];
      document.querySelectorAll('#home-root .rs-t').forEach((el) => {
        const x = hh[+el.dataset.i]; let on = !!(x && x.kind === 'track' && x.track && typeof onNow === 'function' && onNow(x.track));
        if (!on && x && x.kind === 'album' && typeof S !== 'undefined' && S.queue && S.qi >= 0) {
          const c = S.queue[S.qi], nz = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
          on = !!c && ((c.albumId != null && String(c.albumId) === String(x.id)) || (!!c.album && nz(c.album) === nz(x.title)));
        }
        if (el.classList.contains('m-playing') !== on) el.classList.toggle('m-playing', on);
      });
    } catch (e) { /* ignoré */ }
  }, 500);
  // --- pastilles à droite de l'avatar : Tout / Nouveautés / Tendances (filtrent l'accueil)
  (function () {
    const CH = [['all', 'Tout'], ['new', 'Nouveautés'], ['trend', 'Tendances']];
    let F = 'all';
    const mk = () => {
      const tb = document.getElementById('topbar'); if (!tb || tb.querySelector('.m-chips')) return;
      const w = document.createElement('div'); w.className = 'm-chips';
      CH.forEach(([v, t]) => { const b = document.createElement('button'); b.className = 'm-chip'; b.dataset.f = v; b.textContent = t; w.appendChild(b); });
      w.addEventListener('click', (e) => {
        const b = e.target.closest('.m-chip'); if (!b) return;
        F = b.dataset.f;
        if (typeof S !== 'undefined' && S.view !== 'home' && typeof go === 'function') go('home');
        const m = document.getElementById('main'); if (m) m.scrollTop = 0;
        apply();
      });
      tb.appendChild(w);
    };
    const apply = () => {
      const r = document.getElementById('home-root'); if (r && r.dataset.f !== F) r.dataset.f = F;
      const home = document.documentElement.dataset.v === 'home';
      document.querySelectorAll('.m-chip').forEach((b) => b.classList.toggle('on', home && b.dataset.f === F));
    };
    mk(); setInterval(() => { mk(); apply(); }, 250);
  })();
  // --- le bouton compte (avatar) va dans l'en-tête, comme sur Spotify
  const placeDock = () => {
    const d = document.getElementById('acct-dock') || window.__dockRef, tb = document.getElementById('topbar'), lt = document.querySelector('#main .lib-top');
    if (d) window.__dockRef = d;
    if (lt && !lt.querySelector('.m-lsearch')) {
      const b = document.createElement('button'); b.className = 'm-lsearch'; b.setAttribute('aria-label', 'Rechercher');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';
      b.onclick = () => { const n = document.getElementById('nav-search'); if (n) n.click(); };
      lt.insertBefore(b, lt.querySelector('.lib-btns'));
    }
    const tgt = lt || tb;
    if (d && tgt && (d.parentNode !== tgt || !document.contains(d))) tgt.insertBefore(d, tgt.firstChild);
  };
  try { if (!localStorage.getItem('m.libl') && typeof S !== 'undefined') { S.libUI.view = 'list'; localStorage.setItem('sonora.libui', JSON.stringify(S.libUI)); localStorage.setItem('m.libl', '1'); } } catch (e) { /* ignoré */ }
  placeDock(); new MutationObserver(placeDock).observe(document.body, { childList: true, subtree: true }); setInterval(placeDock, 700);
  // --- l'onglet « Recherche » met le curseur dans le champ
  // l'onglet « Recherche » ouvre la page de recherche SANS clavier ; le clavier n'apparaît qu'en touchant le champ
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nav-search')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const i = document.getElementById('search-input'); if (i) i.blur();
    resetSearch();
    if (window.sonoraSearchPop) window.sonoraSearchPop.open();
    root.classList.add('srch');
  }, true);

  // la fenêtre de résultats de recherche sort de l'en-tête pour pouvoir couvrir l'écran
  const liftPop = () => { const p = document.getElementById('search-pop'), a = document.getElementById('app'); if (p && a && p.parentNode !== a) a.appendChild(p); };
  liftPop(); new MutationObserver(liftPop).observe(document.body, { childList: true, subtree: true });

  // taper sur un résultat ne doit pas fermer la fenêtre avant le clic (sinon le clic tombe sur l'accueil)
  document.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('#search-pop')) e.stopPropagation(); }, true);
  // la recherche se vide à chaque fois : on repart de zéro et les recherches récentes reviennent
  const resetSearch = () => {
    const i = document.getElementById('search-input'); if (!i || !i.value) return;
    i.value = ''; try { if (typeof S !== 'undefined') S.searchQ = ''; } catch (e) { /* ignoré */ }
    i.dispatchEvent(new Event('input', { bubbles: true }));
    if (window.sonoraSearchPop) window.sonoraSearchPop.close();
    updSrch();
  };
  setInterval(() => { const p = document.getElementById('search-pop'); if (p && p.classList.contains('hidden')) { if (isField(document.activeElement)) document.activeElement.blur(); resetSearch(); } }, 300);
  // ---- téléphone un peu ancien : mode léger automatique (sans flous coûteux) si le téléphone est faible ou si ça saccade
  (function () {
    try {
      if (localStorage.getItem('m.lite') === '0') return;            // effets de verre forcés par toi (Paramètres → Apparence)
      if (localStorage.getItem('m.lite') === '1') { root.classList.add('lite'); return; }
      const weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      if (weak) { root.classList.add('lite'); return; }
    } catch (e) { /* ignoré */ }
    let busy = false, strikes = 0; const t0 = performance.now();
    setInterval(() => {
      const fsx = document.getElementById('fs'), fsOpen = fsx && !fsx.classList.contains('hidden');
      if (busy || document.hidden || root.classList.contains('lite') || !(performance.now() - t0 < 90000 || fsOpen)) return;
      busy = true; let n = 0; const s = performance.now();
      const f = () => { n++; if (performance.now() - s < 1500) requestAnimationFrame(f); else { busy = false; const fps = n / ((performance.now() - s) / 1000); if (fps < 40) { if (++strikes >= 2) { root.classList.add('lite'); try { localStorage.setItem('m.lite', '1'); } catch (e) { /* ignoré */ } } } else strikes = 0; } };
      requestAnimationFrame(f);
    }, 4000);
  })();

  // appui : gris seulement pour un tap bref (jamais en glissant ni en appui long)
  (function () {
    const SEL = '.track,.lv-row,.lib-card,.plp-track,.queue-row,.rs-t,.hm-trow';
    let el = null, sx = 0, sy = 0, t0 = 0;
    document.addEventListener('touchstart', (e) => { const x = e.target.closest && e.target.closest(SEL); el = x || null; if (!x) return; const p = e.touches[0]; sx = p.clientX; sy = p.clientY; t0 = Date.now(); }, { passive: true, capture: true });
    document.addEventListener('touchmove', (e) => { if (!el) return; const p = e.touches[0]; if (Math.abs(p.clientX - sx) > 8 || Math.abs(p.clientY - sy) > 8) el = null; }, { passive: true, capture: true });
    document.addEventListener('touchend', () => { const x = el; el = null; if (x && Date.now() - t0 < 350) { x.classList.add('m-tap'); setTimeout(() => x.classList.remove('m-tap'), 140); } }, { passive: true, capture: true });
    ['touchcancel', 'contextmenu'].forEach((ev) => document.addEventListener(ev, () => { el = null; document.querySelectorAll('.m-tap').forEach((n) => n.classList.remove('m-tap')); }, { passive: true, capture: true }));
  })();
  // couleur de la playlist (fond de page + titre en cours) et état lecture pour l'égaliseur
  setInterval(() => {
    try {
      const m = document.getElementById('main'), c = m && m.style.getPropertyValue('--plp-c');
      if (c) root.style.setProperty('--m-pc', c); else root.style.removeProperty('--m-pc');
      const pl = typeof isPaused === 'function' && !isPaused(); if (pl) { window.__plT = Date.now(); root.classList.add('m-pl'); } else if (Date.now() - (window.__plT || 0) > 2500) root.classList.remove('m-pl');   // pause très brève (chargement du titre suivant) : l'égaliseur ne s'arrête pas
    } catch (e) { /* ignoré */ }
  }, 400);
  // fond d'ambiance : fondu doux entre deux palettes (opacité seulement, rien n'est repeint pendant le fondu)
  (function () {
    const host = document.createElement('div'); host.id = 'm-amb'; document.body.insertBefore(host, document.body.firstChild);
    let last = '', cur = null;
    const upd = () => {
      const cs = getComputedStyle(root), v = [1, 2, 3, 4].map((i) => cs.getPropertyValue('--amb' + i).trim()), k = v.join('|');
      if (!v[0] || k === last) return; last = k;
      const n = document.createElement('div'); n.className = 'm-amb-l' + (cur ? '' : ' first');
      v.forEach((c, i) => n.style.setProperty('--a' + (i + 1), c)); host.appendChild(n);
      if (!cur) n.style.opacity = '1'; else requestAnimationFrame(() => requestAnimationFrame(() => { n.style.opacity = '1'; }));
      const old = cur; cur = n; if (old) setTimeout(() => old.remove(), 1600);
      while (host.children.length > 3) host.firstChild.remove();
    };
    setInterval(upd, 300); upd();
  })();
  // bibliothèque : la playlist en cours de lecture est marquée
  setInterval(() => {
    const cn = (typeof S !== 'undefined' && S.queue && S.queue.length) ? S.ctxName : null;
    document.querySelectorAll('#main .lib-card').forEach((c) => { const t = c.querySelector('.lib-t'); c.classList.toggle('m-playing', !!cn && !!t && t.textContent.trim() === cn); });
  }, 600);

  // file d'attente (panneau de bureau caché sur téléphone) : on ne la redessine pas à chaque changement de titre
  try { const q = window.sonoraQueueUI; if (typeof q === 'function') window.sonoraQueueUI = function () { const p = document.getElementById('queue-panel'); if (p && p.offsetParent !== null) return q.apply(this, arguments); }; } catch (e) { /* ignoré */ }
  // ---- paramètres : liste de sections puis page de la section (comme Spotify)
  (function () {
    const sm = document.getElementById('settings-modal'); if (!sm) return;
    const BACK = '<button class="m-back" aria-label="Retour"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>';
    const setMode = (m) => { sm.classList.toggle('m-pane', m === 'pane'); sm.classList.toggle('m-list', m !== 'pane'); };
    const sync = () => {
      const open = !sm.classList.contains('hidden');
      root.classList.toggle('m-setopen', open);
      // #app est un bloc à part (fixed) : pendant les paramètres, l'île passe au niveau de la page pour rester au-dessus
      const sb = document.getElementById('sidebar'), ap = document.getElementById('app');
      if (sb && ap) {
        if (open && sb.parentNode === ap) { sm._sbNext = sb.nextSibling; document.body.appendChild(sb); }
        else if (!open && sb.parentNode === document.body) ap.insertBefore(sb, sm._sbNext && sm._sbNext.parentNode === ap ? sm._sbNext : null);
      }
      // le mini-lecteur reste visible dans les paramètres (même passage au niveau de la page)
      const pl = document.getElementById('player');
      if (pl && ap) {
        if (open && pl.parentNode === ap) { sm._plNext = pl.nextSibling; document.body.appendChild(pl); }
        else if (!open && pl.parentNode === document.body) ap.insertBefore(pl, sm._plNext && sm._plNext.parentNode === ap ? sm._plNext : null);
      }
      if (open && !sm.dataset.mo) { sm.dataset.mo = '1'; setMode('list'); }
      if (!open) delete sm.dataset.mo;
      const win = sm.querySelector('.set-win');
      if (win && !win.querySelector('.m-back')) win.insertAdjacentHTML('beforeend', BACK);
    };
    new MutationObserver(sync).observe(sm, { attributes: true, attributeFilter: ['class'], childList: true });
    sm.addEventListener('click', (e) => {
      if (e.target.closest('.m-back')) { setMode('list'); const l = sm.querySelector('.set-navlist'); if (l) l.scrollTop = l.scrollTop; return; }
      if (e.target.closest('.sn-i')) { setMode('pane'); const sc = sm.querySelector('.set-scroll'); if (sc) sc.scrollTop = 0; }
    });
    sync();
  })();

  // ---- lecteur plein écran façon Spotify : barre du haut, cœur, menu « … », vue artiste sous le lecteur
  (function () {
    const DOTS = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    let wasOpen = false;
    const tick = () => {
      const fs = document.getElementById('fs'); if (!fs) return;
      if (!fs.dataset.m) {
        fs.dataset.m = '1';
        const top = document.createElement('div'); top.className = 'm-fs-top'; top.textContent = 'En cours de lecture'; fs.appendChild(top);
        const more = document.createElement('button'); more.className = 'm-fs-more'; more.setAttribute('data-keepmenu', '1'); more.innerHTML = DOTS; more.setAttribute('aria-label', 'Plus'); fs.appendChild(more);
        const like = document.createElement('button'); like.className = 'm-fs-like'; like.setAttribute('aria-label', "J'aime");
        const meta = fs.querySelector('.fs-meta'); if (meta) meta.appendChild(like);
        like.addEventListener('click', () => { const s = document.getElementById('np-like'); if (s) s.click(); });
        more.addEventListener('click', () => {
          const t = (typeof S !== 'undefined') && S.queue && S.queue[S.qi]; if (!t) return;
          const r = more.getBoundingClientRect();
          const items = [
            { label: isLiked(t) ? 'Retirer des titres aimés' : 'Ajouter aux titres aimés', fn: () => { const s = document.getElementById('np-like'); if (s) s.click(); } },
            { label: 'Ajouter à la file d’attente', fn: () => queueAdd(t) },
            ...S.playlists.map((p) => ({ label: 'Ajouter à « ' + p.name + ' »', fn: () => addToPlaylist(p, t) })),
            { label: 'Nouvelle playlist…', fn: () => askText('Nouvelle playlist', 'Nom', (n) => { const p = { id: uid(), name: n, tracks: [] }; S.playlists.push(p); addToPlaylist(p, t); }) },
            { label: 'Accéder à la file d’attente', fn: () => { const b = document.getElementById('btn-queue'); if (b) b.click(); } },
            { label: 'Voir l’artiste', fn: () => { try { window.sonoraFS.close(); } catch (e) { /* ignoré */ } if (window.sonoraOpenArtist) window.sonoraOpenArtist(t.artist); } }
          ];
          window.__mh = { title: t.title, sub: (t.artist || '') + (t.album ? ' • ' + t.album : ''), img: t.image || '' };
          showMenu(r.right - 240, r.bottom + 6, items);
        });
        const pnl = document.getElementById('np-panel'), main = fs.querySelector('.fs-main');
        if (pnl && main) main.appendChild(pnl);
        fs.addEventListener('click', (e) => {
          if (e.target.closest('.fs-close') && !fs.classList.contains('cover')) { e.stopImmediatePropagation(); e.preventDefault(); delete fs.dataset.ly; const b = fs.querySelector('.fs-ly-btn'); if (b) b.click(); return; }
          if (fs._prog) return;
          if (e.target.closest('.npp-lyrics')) { fs.dataset.ly = '1'; const b = fs.querySelector('.fs-ly-btn'); if (b && fs.classList.contains('cover')) { fs._prog = true; try { b.click(); } finally { fs._prog = false; } } e.stopPropagation(); }
          else if (e.target.closest('.fs-ly-btn')) { delete fs.dataset.ly; }
        }, true);
      }
      const open = !fs.classList.contains('hidden');
      if (open && !wasOpen) fs.scrollTop = 0;
      if (!open) delete fs.dataset.ly;
      if (open && !fs.classList.contains('cover') && !fs.dataset.ly) { const b = fs.querySelector('.fs-ly-btn'); if (b) b.click(); }
      wasOpen = open;
      const like = fs.querySelector('.m-fs-like'), src = document.getElementById('np-like');
      if (like && src) { const h = src.innerHTML; if (like.innerHTML !== h) like.innerHTML = h; like.classList.toggle('on', src.classList.contains('on')); }
      const pnl = document.getElementById('np-panel'), main = fs.querySelector('.fs-main');
      if (pnl && main && pnl.parentNode !== main) main.appendChild(pnl);
      // titres de l'artiste : défilement horizontal
      if (pnl) pnl.querySelectorAll('.npp-row').forEach((r) => {
        if (r.parentNode.classList.contains('m-hrow')) return;
        const w = document.createElement('div'); w.className = 'm-hrow'; r.parentNode.insertBefore(w, r);
        let n = r; while (n && n.classList && n.classList.contains('npp-row')) { const nx = n.nextElementSibling; w.appendChild(n); n = nx; }
      });
      // le titre de la barre : « Playlist » / « Album » si on le connaît, sinon « En cours de lecture »
      const top = fs.querySelector('.m-fs-top'); if (top) { const b = document.querySelector('#np-panel .npp-album'); const n = b && b.textContent && b.textContent.trim(); const v = n || 'En cours de lecture'; if (top.textContent !== v) top.textContent = v; }
    };
    setInterval(tick, 500);
  })();

  // ---- menus : feuille du bas façon Spotify (icônes, gros boutons, playlists regroupées)
  (function () {
    const orig = window.showMenu; if (typeof orig !== 'function') return;
    { const mm = document.getElementById('menu'); if (mm && mm.parentNode !== document.body) document.body.appendChild(mm); }
    const P = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    const IC = {
      heart: P('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
      plus: P('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
      queue: P('<path d="M4 7h10M4 12h10M4 17h16M18 5v6M15 8h6"/>'),
      list: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
      user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
      x: P('<path d="M6 6l12 12M18 6L6 18"/>'),
      note: P('<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/>'),
      lib: P('<path d="M5 4v16M10 4v16M15 5l4 15"/>')
    };
    const iconFor = (l) => /aimé|like/i.test(l) ? IC.heart : /playlist/i.test(l) ? IC.plus : /Accéder/i.test(l) ? IC.list : /file d/i.test(l) || /ensuite/i.test(l) ? IC.queue : /artiste/i.test(l) ? IC.user : /retirer|supprimer/i.test(l) ? IC.x : /Ma musique/i.test(l) ? IC.lib : IC.note;
    const esc2 = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function present(x, y, items) {
      const head = window.__mh; window.__mh = null;
      orig(x, y, items);
      const m = document.getElementById('menu'); if (!m) return;
      m.classList.add('m-sheet');
      m.querySelectorAll('[data-mi]').forEach((b, i) => { const l = items[i] ? items[i].label : b.textContent; b.innerHTML = iconFor(l) + '<span>' + esc2(l) + '</span>'; });
      let h = '<div class="m-sh-handle"></div>';
      if (head) h += '<div class="m-sh-head">' + (head.img ? '<i style="background-image:url(\'' + esc2(head.img) + '\')"></i>' : '<i></i>') + '<div><b>' + esc2(head.title) + '</b><small>' + esc2(head.sub) + '</small></div></div>';
      m.insertAdjacentHTML('afterbegin', h);
    }
    // feuille « Sauvegarder dans » : on coche toutes les playlists voulues puis Terminé
    function saveSheet(head, pl) {
      const old = document.getElementById('m-save'); if (old) old.remove();
      const adds = pl.filter((i) => /^Ajouter à « /.test(i.label)), newOne = pl.find((i) => /^Nouvelle playlist/.test(i.label));
      const rows = adds.map((it) => { const nm = it.label.replace(/^Ajouter à « (.*) »$/, '$1'); const p = (S.playlists || []).find((q) => q.name === nm); const tr = (p && p.tracks) || []; const hd = head || {}, ar = String(hd.sub || '').split(' • ')[0].toLowerCase(); const has = !!hd.title && tr.some((x) => String(x.title).toLowerCase() === String(hd.title).toLowerCase() && (!ar || String(x.artist || '').toLowerCase() === ar)); return { it, nm, n: tr.length, has, imgs: [...new Set(tr.map((t) => t.image).filter(Boolean))].slice(0, 4) }; });
      const sel = new Set();
      const el = document.createElement('div'); el.id = 'm-save';
      el.innerHTML = '<div class="ms-bg"></div><div class="ms-card"><div class="m-sh-handle"></div>' +
        '<div class="ms-top"><button data-k="cancel">Annuler</button><button data-k="done">Terminé</button></div>' +
        '<div class="ms-ttl"><h2>Sauvegarder dans</h2><button data-k="new">Nouvelle playlist</button></div>' +
        '<div class="ms-find"><label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input placeholder="Trouver une playlist"></label></div>' +
        '<div class="ms-list">' + rows.map((r, i) => '<div class="ms-row' + (r.has ? ' has on' : '') + '" data-i="' + i + '"><i' + (r.imgs.length >= 4 ? ' class="mos">' + r.imgs.map((u) => '<s style="background-image:url(\'' + esc2(u) + '\')"></s>').join('') : (r.imgs.length ? ' style="background-image:url(\'' + esc2(r.imgs[0]) + '\')">' : '>')) + '</i><div><b>' + esc2(r.nm) + '</b><small>' + (r.has ? 'Déjà dans cette playlist' : r.n + ' titre' + (r.n > 1 ? 's' : '')) + '</small></div><span class="ms-add"></span></div>').join('') + '</div>' +
        '<button class="ms-ok" data-k="done">Terminé</button></div>';
      document.body.appendChild(el);
      const close = () => el.remove();
      const apply = () => { sel.forEach((i) => { try { rows[i].it.fn(); } catch (e) { /* ignoré */ } }); close(); };
      el.addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]'), r = e.target.closest('.ms-row');
        if (e.target.classList.contains('ms-bg') || (k && k.dataset.k === 'cancel')) return close();
        if (k && k.dataset.k === 'done') return apply();
        if (k && k.dataset.k === 'new') { close(); if (newOne) newOne.fn(); return; }
        if (r && !r.classList.contains('has')) { const i = +r.dataset.i; if (sel.has(i)) sel.delete(i); else sel.add(i); r.classList.toggle('on', sel.has(i)); }
      });
      el.querySelector('input').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.ms-row').forEach((r) => { r.style.display = rows[+r.dataset.i].nm.toLowerCase().includes(q) ? '' : 'none'; }); });
    }
    window.showMenu = function (x, y, items) {
      const pl = items.filter((i) => /^Ajouter à « /.test(i.label) || /^Nouvelle playlist/.test(i.label));
      let its = items;
      if (pl.length) {
        const first = items.findIndex((i) => pl.includes(i)), rest = items.filter((i) => !pl.includes(i));
        const head = window.__mh;
        const entry = { label: 'Ajouter à la playlist', fn: () => setTimeout(() => { window.__mh = head; saveSheet(head, pl); }, 0) };
        its = [...rest.slice(0, first), entry, ...rest.slice(first)];
      }
      present(x, y, its);
    };
    // quel titre a été touché ? (pour l'en-tête de la feuille)
    document.addEventListener('click', (e) => {
      window.__mh = null;
      const b = e.target.closest && e.target.closest('[data-act="more"]'); if (!b) return;
      try { const t = cur.list[+b.dataset.i]; if (t) window.__mh = { title: t.title, sub: (t.artist || '') + (t.album ? ' • ' + t.album : ''), img: t.image || '' }; } catch (er) { /* ignoré */ }
    }, true);
  })();

  // ---- pages album / playlist : couleur de la pochette en haut, barre d'actions
  (function () {
    const cache = new Map();
    function colorOf(url) {
      if (cache.has(url)) return Promise.resolve(cache.get(url));
      return new Promise((res) => {
        const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => {
          try {
            const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, 16, 16);
            const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0, w = 0;
            for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), k = 0.3 + (mx - mn) / 255; r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k; }
            const f = 0.62, col = 'rgb(' + Math.round(r / w * f) + ',' + Math.round(g / w * f) + ',' + Math.round(b / w * f) + ')';
            cache.set(url, col); res(col);
          } catch (e) { res(null); }
        };
        im.onerror = () => res(null); im.src = url;
      });
    }
    let last = null;
    const urlOf = (el) => { const m = /url\(["']?(.*?)["']?\)/.exec((el.style && el.style.backgroundImage) || getComputedStyle(el).backgroundImage || ''); return m ? m[1] : ''; };
    const SVG = {
      dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
      shuf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3c5 0 5 10 10 10h5M3 17h3c1.5 0 2.600-.700 3.600-1.800M14 8c.8-.6 1.700-1 3-1h4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
      play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
    };
    setInterval(() => {
      const root = document.documentElement, v = root.dataset.v;
      if (v === 'playlist' || v === 'mix' || v === 'lvpage') {
        const el = document.querySelector('#main .lv-cover.big, #main .plp-cover, #main .ph-cover');
        let url = el ? urlOf(el) : '';
        if (el && !url) { const i = el.querySelector('i'); if (i) url = urlOf(i); }
        if (url !== last) { last = url; if (!url) root.style.setProperty('--pg', '#2c3550'); else colorOf(url).then((c) => { if (c && last === url) root.style.setProperty('--pg', c); }); }
      } else last = null;
      // barre d'actions sur les pages album
      const pg = document.getElementById('lv-page');
      if (pg) {
        const head = pg.querySelector('.lv-head'), cv = pg.querySelector('.lv-cover.big');
        if (head && cv && !cv.classList.contains('round') && !pg.querySelector('.m-actbar')) {
          head.insertAdjacentHTML('afterend', '<div class="m-actbar"><button class="m-ab" data-m="more" data-keepmenu="1" aria-label="Plus">' + SVG.dots + '</button><span class="m-grow"></span><button class="m-ab" data-m="shuf" aria-label="Aléatoire">' + SVG.shuf + '</button><button class="m-ab play" data-m="play" aria-label="Lire">' + SVG.play + '</button></div>');
        }
      }
    }, 300);
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.m-ab'); if (!b) return;
      const rows = [...document.querySelectorAll('#lv-page .lv-row[data-lv="track"]')];
      if (b.dataset.m === 'play' && rows[0]) rows[0].click();
      else if (b.dataset.m === 'shuf' && rows.length) { if (typeof S !== 'undefined' && !S.shuffle) { const sb = document.getElementById('btn-shuffle'); if (sb) sb.click(); } rows[Math.floor(Math.random() * rows.length)].click(); }
      else if (b.dataset.m === 'more') {
        const r = b.getBoundingClientRect(), items = [];
        const a = document.querySelector('#lv-page [data-lv="artist"]');
        if (a) items.push({ label: 'Voir l’artiste', fn: () => a.click() });
        const h = document.querySelector('#lv-page .lv-head h1'), im = document.querySelector('#lv-page .lv-cover.big');
        window.__mh = { title: h ? h.textContent : '', sub: 'Album', img: im ? urlOf(im) : '' };
        if (items.length) showMenu(r.left, r.bottom + 6, items);
      }
    });
  })();
})();

// ---- île flottante (Android) : pilule par-dessus les autres applis quand Sonora est réduite (réglée par « Activer l'overlay »)
(function () {
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Island; if (!P) return;
  const isOn = () => { try { return !!S.settings.ovlOn; } catch (e) { return false; } };
  const send = () => {
    try {
      const t = S.queue && S.queue[S.qi];
      if (!t) { P.set({ enabled: false, playing: false }).catch(() => {}); return; }
      const yt = t.source === 'youtube';
      const pl = yt ? !!(typeof ytPlaying !== 'undefined' && ytPlaying) : !audio.paused;
      const pos = typeof curTime === 'function' ? curTime() : (audio.currentTime || 0);
      const ac = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      P.set({ enabled: isOn(), title: t.title || '', artist: t.artist || '', image: t.image || '', playing: pl, pos: pos || 0, accent: /^#[0-9a-f]{6}$/i.test(ac) ? ac : '' }).catch(() => {});
    } catch (e) { /* ignoré */ }
  };
  setInterval(send, 3000);
  ['play', 'pause', 'seeked', 'loadedmetadata'].forEach((ev) => { try { audio.addEventListener(ev, () => setTimeout(send, 150)); } catch (e) { /* ignoré */ } });
  try { P.addListener('cmd', (e) => { if (e && e.a === 'toggle' && typeof togglePlay === 'function') togglePlay(); }); } catch (e) { /* ignoré */ }
  const sm = document.getElementById('settings-modal'); if (!sm) return;
  // page « Overlay » : on ne garde que l'interrupteur (position, raccourci… n'existent que sur ordinateur)
  const tidy = () => {
    sm.querySelectorAll('.srow').forEach((r) => { if (r.querySelector('[data-k=ovlPos],[data-k=ovlMin],[data-k=ovlTop],[data-a=ovl-key]')) r.style.display = 'none'; });
    const d = sm.querySelector('.srow [data-k=ovlOn]'); const dd = d && d.closest('.srow') && d.closest('.srow').querySelector('.sr-d');
    if (dd && !dd.dataset.m) { dd.dataset.m = '1'; dd.textContent = 'Affiche une pilule par-dessus les autres applis quand Sonora est réduite.'; }
  };
  new MutationObserver(tidy).observe(sm, { childList: true, subtree: true }); tidy();
  sm.addEventListener('click', (e) => {
    if (!e.target.closest('[data-k=ovlOn]')) return;
    setTimeout(async () => {
      if (isOn()) {
        let ok = false; try { ok = (await P.can()).granted; } catch (x) { /* ignoré */ }
        if (!ok) { toast('Active « Afficher par-dessus les autres applis » pour Sonora, puis reviens'); try { P.ask(); } catch (x) { /* ignoré */ } }
      }
      send();
    }, 80);
  });
})();

// ---- musique en arrière-plan : si Android met le son en pause tout seul (appli réduite), on le relance, sauf si c'est toi qui as mis pause
(function () {
  let want = false, lastU = 0, bg = false, tries = 0, wasP = false;
  const touch = () => { lastU = Date.now(); };
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, touch, true));
  try { if (navigator.mediaSession) { const o = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (a, f) => o(a, f && ((...x) => { touch(); return f(...x); })); } } catch (e) { /* ignoré */ }
  try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A && A.addListener) A.addListener('appStateChange', (st) => { bg = !st.isActive; if (!bg) tries = 0; }); } catch (e) { /* ignoré */ }
  try { const I = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Island; if (I && I.addListener) I.addListener('cmd', touch); } catch (e) { /* ignoré */ }
  const yt = () => { try { const t = S.queue[S.qi]; return !!(t && t.source === 'youtube'); } catch (e) { return false; } };
  const playingNow = () => { try { return yt() ? !!ytPlaying : !audio.paused; } catch (e) { return false; } };
  const resume = () => {
    if (!want || !(bg || document.hidden) || tries >= 12 || Date.now() - lastU < 3000) return;
    if (!yt() && (audio.ended || !audio.src)) return;
    tries++;
    if (yt()) { if (typeof ytReady !== 'undefined' && ytReady && ytPlayer) ytPlayer.playVideo(); }
    else { const r = audio.play(); if (r && r.catch) r.catch(() => {}); }
  };
  window.sonoraYtPaused = () => { try { resume(); } catch (e) { /* ignoré */ } };         // relance immédiate (YouTube)
  try { audio.addEventListener('pause', () => { try { resume(); } catch (e) { /* ignoré */ } }); } catch (e) { /* ignoré */ }   // relance immédiate (mp3 / extraits)
  setInterval(() => {
    try {
      const pl = playingNow();
      if (pl) { want = true; tries = 0; return; }
      if (Date.now() - lastU < 3000) { want = false; return; }          // pause voulue par toi
      resume();
    } catch (e) { /* ignoré */ }
  }, 700);
})();

// ---- paramètres adaptés au téléphone : on retire ce qui n'existe que sur ordinateur, et on ajoute le réglage des effets de verre
(function () {
  const sm = document.getElementById('settings-modal'); if (!sm) return;
  const HIDE = ['Double-clic sur un titre', 'Pause au changement de périphérique', 'Sauvegarde', 'Taille maximale du cache'];
  const root = document.documentElement;
  const mode = () => { try { return localStorage.getItem('m.lite'); } catch (e) { return null; } };
  const tidy = () => {
    sm.querySelectorAll('[data-p=raccourcis],[data-p=discord],[data-p=doc]').forEach((b) => { b.style.display = 'none'; });
    sm.querySelectorAll('.srow').forEach((r) => { const t = r.querySelector('.sr-t'); if (t && HIDE.indexOf(t.textContent.trim()) >= 0) r.style.display = 'none'; });
    sm.querySelectorAll('.stg-h').forEach((h) => { if (h.textContent.trim() === 'Cache') { h.style.display = 'none'; if (h.nextElementSibling) h.nextElementSibling.style.display = 'none'; } });
    const fr = sm.querySelector('.stor-free'); if (fr) fr.style.display = 'none';
    sm.querySelectorAll('.ab-btn').forEach((b) => { if (/mises à jour/.test(b.textContent)) b.style.display = 'none'; });
    sm.querySelectorAll('.sr-d').forEach((d) => { if (/depuis ce PC/.test(d.textContent)) d.textContent = d.textContent.replace('depuis ce PC', 'depuis ce téléphone'); });
    // Apparence : effets de verre
    const on = sm.querySelector('.sn-i.on[data-p=apparence]'), sc = document.getElementById('set-scroll');
    if (on && sc && !document.getElementById('m-fx')) {
      const m = mode(), cur = m === '0' ? 'on' : m === '1' ? 'off' : 'auto';
      const d = document.createElement('div'); d.className = 'srow'; d.id = 'm-fx';
      d.innerHTML = '<div class="sr-tx"><div class="sr-t">Effets de verre (flou)</div><div class="sr-d">Donne le style « glace » mais consomme plus de batterie. « Auto » s’adapte à ton téléphone.</div></div><div class="sr-c"><div class="seg">' +
        [['auto', 'Auto'], ['on', 'Oui'], ['off', 'Non']].map(([v, l]) => '<button data-fx="' + v + '" class="' + (cur === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>';
      sc.insertBefore(d, sc.firstChild);
    }
  };
  new MutationObserver(tidy).observe(sm, { childList: true, subtree: true }); tidy();
  sm.addEventListener('click', (e) => {
    const b = e.target.closest('#m-fx [data-fx]'); if (!b) return;
    const v = b.dataset.fx;
    try { if (v === 'auto') localStorage.removeItem('m.lite'); else localStorage.setItem('m.lite', v === 'on' ? '0' : '1'); } catch (x) { /* ignoré */ }
    root.classList.toggle('lite', v === 'off');
    b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (v === 'auto') toast('Réglage automatique au prochain lancement');
  });
})();
