// Sonora : bouton volume avec curseur vertical (0 à 100 %), accessible partout dans la barre du bas.
// Survol ou clic sur le haut-parleur = le curseur s'ouvre ; molette = ±5 % ; clic sur l'icône = muet.
(() => {
  'use strict';
  const btn = document.getElementById('btn-mute'), vol = document.getElementById('volume');
  if (!btn || !vol || typeof audio === 'undefined') return;
  const pop = document.createElement('div'); pop.id = 'vol-pop'; pop.className = 'vol-pop hidden';
  pop.innerHTML = '<button class="vp-ic" title="Muet"></button><div class="vp-track" tabindex="0" role="slider" aria-label="Volume" aria-valuemin="0" aria-valuemax="100"><div class="vp-fill"></div></div><div class="vp-pct">0%</div>';
  document.body.appendChild(pop);
  const ic = pop.querySelector('.vp-ic'), track = pop.querySelector('.vp-track'), fillEl = pop.querySelector('.vp-fill'), pct = pop.querySelector('.vp-pct');
  const cur = () => (audio.muted ? 0 : Math.round(audio.volume * 100));
  function paint() {
    const v = cur(); fillEl.style.height = v + '%'; pct.textContent = v + '%'; track.setAttribute('aria-valuenow', v);
    const html = audio.muted || audio.volume === 0 ? I.volMute : audio.volume < 0.5 ? I.volLow : I.volHigh; if (ic.dataset.h !== html.length + '') { ic.innerHTML = html; ic.dataset.h = html.length + ''; }
  }
  function setVol(p) {
    p = Math.max(0, Math.min(100, Math.round(p)));
    if (p > 0 && audio.muted) { audio.muted = false; if (typeof ytReady !== 'undefined' && ytReady) ytPlayer.unMute(); }
    vol.value = p; vol.dispatchEvent(new Event('input'));          // réutilise la logique existante (mémorisation, YouTube, icône)
    paint();
  }
  const place = () => { const r = btn.getBoundingClientRect(); pop.style.left = Math.round(Math.max(8, Math.min(innerWidth - 72, r.left + r.width / 2 - 32))) + 'px'; pop.style.bottom = Math.round(innerHeight - r.top + 10) + 'px'; };
  let tOpen = 0, tClose = 0;
  const open = () => { clearTimeout(tClose); if (!pop.classList.contains('hidden')) return; paint(); place(); pop.classList.remove('hidden'); };
  const close = (d = 260) => { clearTimeout(tOpen); clearTimeout(tClose); tClose = setTimeout(() => { if (!drag) pop.classList.add('hidden'); }, d); };
  btn.addEventListener('mouseenter', () => { clearTimeout(tClose); tOpen = setTimeout(open, 90); });
  btn.addEventListener('mouseleave', () => close()); pop.addEventListener('mouseenter', () => clearTimeout(tClose)); pop.addEventListener('mouseleave', () => close());
  btn.addEventListener('click', () => { open(); setTimeout(paint, 0); });           // le clic garde son rôle (muet) et ouvre aussi le curseur
  ic.addEventListener('click', () => { btn.click(); paint(); });
  const wheel = (e) => { e.preventDefault(); setVol(cur() + (e.deltaY < 0 ? 5 : -5)); };
  btn.addEventListener('wheel', wheel, { passive: false }); pop.addEventListener('wheel', wheel, { passive: false });
  // curseur : glisser n'importe où sur la barre, de 0 % (bas) à 100 % (haut)
  let drag = false;
  const fromY = (y) => { const r = track.getBoundingClientRect(), p = (r.bottom - y) / r.height * 100; return p >= 97 ? 100 : p <= 3 ? 0 : p; };   // les bords collent à 100 % et 0 %
  track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); setVol(fromY(e.clientY)); });
  track.addEventListener('pointermove', (e) => { if (drag) setVol(fromY(e.clientY)); });
  const end = () => { drag = false; close(900); }; track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  track.addEventListener('keydown', (e) => { const k = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 10, PageDown: -10 }[e.key]; if (k) { e.preventDefault(); setVol(cur() + k); } else if (e.key === 'Home') setVol(0); else if (e.key === 'End') setVol(100); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.classList.add('hidden'); });
  audio.addEventListener('volumechange', paint); window.addEventListener('resize', () => { if (!pop.classList.contains('hidden')) place(); });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#vol-pop') && !e.target.closest('#btn-mute')) pop.classList.add('hidden'); });
  vol.addEventListener('input', paint);
  paint();
})();
