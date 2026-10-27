// Sonora : repère le titre qui joue en ce moment.
// Une petite icône « égaliseur » animée apparaît à gauche du titre (dans les listes, les résultats de recherche
// et les cartes). Elle bouge quand la musique joue et se fige en pause.
(() => {
  'use strict';
  if (typeof S === 'undefined') return;

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const EQ = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

  function current() {
    const t = S.queue[S.qi];
    return t ? { title: norm(t.title), artist: norm(t.artist) } : null;
  }
  const same = (c, title, artist) => !!c && norm(title) === c.title && (!c.artist || !artist || norm(artist).includes(c.artist) || c.artist.includes(norm(artist)));

  function setEq(host, on) {
    const has = host.querySelector(':scope > .eq');
    if (on && !has) host.insertAdjacentHTML('afterbegin', EQ);
    else if (!on && has) has.remove();
  }
  const txt = (root, sel) => { const e = root.querySelector(sel); return e ? e.textContent.trim() : ''; };

  function mark() {
    const c = current();
    // listes de titres (bibliothèque, playlists, file d'attente, titres aimés) : l'icône remplace le numéro
    document.querySelectorAll('#main .track').forEach((row) => {
      const on = row.classList.contains('playing');
      row.classList.toggle('now', on);
      const num = row.querySelector('.num');
      if (num) setEq(num, on);
    });
    // résultats de recherche (titres) : l'icône se superpose à la pochette ; numéro remplacé dans les albums
    document.querySelectorAll('#main .lv-row[data-lv="track"]').forEach((row) => {
      const t = txt(row, '.lv-t'), a = txt(row, '.lv-s');
      const on = same(c, t, a);
      row.classList.toggle('now', on);
      const n = row.querySelector('.lv-n'), im = row.querySelector('.lv-img');
      if (n) setEq(n, on); else if (im) setEq(im, on);
    });
    // cartes « Écoutés récemment »
    document.querySelectorAll('#main .card[data-act="play-recent"]').forEach((card) => {
      const on = same(c, txt(card, '.c-title'), txt(card, '.c-sub'));
      card.classList.toggle('now', on);
      const art = card.querySelector('.art');
      if (art) setEq(art, on);
    });
  }

  const sync = () => {
    document.body.classList.toggle('paused', typeof isPaused === 'function' ? isPaused() : true);
    mark();
  };

  // à chaque changement de lecture
  if (typeof updatePlayer === 'function') {
    const base = updatePlayer;
    updatePlayer = function () { const r = base.apply(this, arguments); sync(); return r; };
  }
  // à chaque nouvel affichage de la page (nous ne touchons que les éléments .eq, donc pas de boucle)
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); };
  const main = document.getElementById('main');
  if (main) new MutationObserver((muts) => {
    if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.classList.contains('eq')))) return;
    later();
  }).observe(main, { childList: true, subtree: true });
  if (typeof audio !== 'undefined') ['play', 'pause', 'ended'].forEach((ev) => audio.addEventListener(ev, sync));
  setInterval(sync, 700);
  sync();
})();
