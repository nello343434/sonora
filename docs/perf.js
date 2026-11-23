// Économie de ressources : quand la fenêtre n'est pas au premier plan (jeu, autre appli) ou est réduite,
// les animations du fond sont mises en pause. La musique, l'overlay et les paroles continuent normalement.
(() => {
  'use strict';
  const upd = () => { try { document.body.classList.toggle('idle', document.hidden || !document.hasFocus()); } catch (e) { /* ignoré */ } };
  window.addEventListener('blur', upd); window.addEventListener('focus', upd); document.addEventListener('visibilitychange', upd);
  document.addEventListener('DOMContentLoaded', upd); upd();
})();
