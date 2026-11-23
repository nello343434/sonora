// Bouton flottant « Accueil » : apparaît quand on a défilé vers le bas dans une page autre que l'accueil.
(() => {
  'use strict';
  const main = document.getElementById('main'); if (!main) return;
  const b = document.createElement('button'); b.id = 'home-fab'; b.type = 'button'; b.className = 'btn ghost small'; b.title = 'Retour à l’accueil';
  b.innerHTML = (typeof I !== 'undefined' && I.arrowLeft ? I.arrowLeft : '←') + ' Accueil';
  document.body.appendChild(b);
  let t = 0;
  const upd = () => {
    cancelAnimationFrame(t);
    t = requestAnimationFrame(() => {
      const show = typeof S !== 'undefined' && S.view !== 'home' && main.scrollTop > 70;
      b.classList.toggle('on', show);
      const r = main.getBoundingClientRect(); b.style.left = Math.round(r.left + 32) + 'px'; b.style.top = Math.round(r.top + 12) + 'px';
    });
  };
  main.addEventListener('scroll', upd, { passive: true });
  window.addEventListener('resize', upd);
  new MutationObserver(upd).observe(main, { childList: true });
  b.addEventListener('click', () => { if (typeof go === 'function') go('home'); main.scrollTop = 0; b.classList.remove('on'); });
  setInterval(upd, 700);
})();
