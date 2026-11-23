// Sonora : barre du haut (précédent / suivant, boutons de fenêtre), recherche depuis le rail, thème « Système ».
(() => {
  'use strict';
  const api = () => window.api || {};
  // logo en haut du rail (comme la référence)
  { const sb = document.getElementById('sidebar'), br = document.querySelector('#topbar .brand'); if (sb && br) sb.insertBefore(br, sb.firstChild); }
  // ---------- historique de navigation ----------
  const Hs = { st: [['home', undefined]], i: 0, skip: false };
  const back = document.getElementById('nav-back'), fwd = document.getElementById('nav-fwd');
  const upd = () => { back.disabled = Hs.i <= 0; fwd.disabled = Hs.i >= Hs.st.length - 1; };
  const baseGo = go;
  go = function (view, arg) {
    if (view !== 'settings' && !Hs.skip) {
      const last = Hs.st[Hs.i];
      if (!last || last[0] !== view || last[1] !== arg) { Hs.st = Hs.st.slice(0, Hs.i + 1); Hs.st.push([view, arg]); Hs.i = Hs.st.length - 1; if (Hs.st.length > 100) { Hs.st.shift(); Hs.i--; } }
    }
    const r = baseGo(view, arg); upd(); return r;
  };
  const jump = (d) => { const n = Hs.i + d; if (n < 0 || n >= Hs.st.length) return; Hs.i = n; Hs.skip = true; try { go(Hs.st[n][0], Hs.st[n][1]); } finally { Hs.skip = false; } upd(); };
  back.onclick = () => jump(-1); fwd.onclick = () => jump(1);
  window.addEventListener('mouseup', (e) => { if (e.button === 3) jump(-1); else if (e.button === 4) jump(1); });
  upd();

  // ---------- boutons de fenêtre ----------
  const MAX = '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  const RES = '<svg viewBox="0 0 24 24"><rect x="4.5" y="8.5" width="11" height="11" rx="2"/><path d="M8.500 8.500V6.500a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"/></svg>';
  const mx = document.getElementById('wc-max'), setMax = (v) => { if (mx) { mx.innerHTML = v ? RES : MAX; mx.title = v ? 'Restaurer' : 'Agrandir'; } };
  document.getElementById('wctl').addEventListener('click', (e) => { const b = e.target.closest('[data-wc]'); if (b && api().winCmd) api().winCmd(b.dataset.wc); });
  if (api().winIsMax) api().winIsMax().then(setMax).catch(() => {});
  if (api().onWinState) api().onWinState(setMax);
  if (!api().winCmd) document.getElementById('wctl').style.display = 'none';   // navigateur : pas de fenêtre à piloter
  document.getElementById('topbar').addEventListener('dblclick', (e) => { if (e.target.closest('button, input, .tb-search, .pillg')) return; if (api().winCmd) api().winCmd('max'); });

  // clic sur le flou : on referme la recherche
  { const bl = document.getElementById('search-blur'); if (bl) bl.addEventListener('mousedown', () => { const si = document.getElementById('search-input'); if (window.sonoraSearchPop) window.sonoraSearchPop.close(); if (si) si.blur(); }); }
  // ---------- recherche depuis le rail ----------
  document.getElementById('nav-search').addEventListener('click', () => { const i = document.getElementById('search-input'); if (i) { i.focus(); i.select(); } });

  // ---------- thème : Système / Clair / Sombre ----------
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (S.settings.theme === 'system') applySettings(); });
})();
