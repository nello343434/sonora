// Icône « réglages » (leviers) en bas de la barre de gauche.
(() => {
  'use strict';
  const SVG = '<svg class="ico-lever" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M3 7h9M17 7h4M3 17h3M11 17h10"/><circle cx="14.5" cy="7" r="2.5" fill="currentColor"/><circle cx="8.5" cy="17" r="2.5" fill="currentColor"/></svg>';
  const btn = document.querySelector('.nav.bottom[data-view="settings"]');
  if (!btn) return;
  let busy = false;
  const apply = () => {
    if (busy || btn.querySelector('.ico-lever')) return;
    busy = true;
    btn.innerHTML = SVG + '<span>Apparence</span>';
    busy = false;
  };
  apply();
  // si un autre script redessine l'icône, on remet la nôtre
  new MutationObserver(apply).observe(btn, { childList: true, subtree: true });
})();
