// Sonora — file d'attente façon Spotify : panneau à droite (bouton ≡ du lecteur).
// « En cours de lecture », « File d'attente » (titres ajoutés, glisser-déposer, ✕), « À suivre : <liste> », et « Récemment écoutés ».
(() => {
  'use strict';
  const app = document.getElementById('app');
  if (!app || typeof S === 'undefined') return;
  const panel = document.createElement('aside');
  panel.id = 'queue-panel'; panel.className = 'panel';
  app.appendChild(panel);
  let tab = 'queue', sig = '', dragFrom = -1;
  const isOpen = () => document.body.classList.contains('q-open');

  const row = (t, idx, o = {}) =>
    `<div class="q-row${o.now ? ' now' : ''}" ${o.recent ? `data-qr="${idx}"` : `data-qi="${idx}"`}${o.drag ? ' draggable="true"' : ''}>` +
    `<div class="q-img" ${artStyle(t)}>${o.now ? EQB : (t.image ? '' : '♪')}</div>` +
    `<div class="q-tx"><div class="q-t">${esc(t.title)}</div><div class="q-s">${esc(t.artist || '')}</div></div>` +
    (o.rm ? `<button class="q-x" data-q="rm" data-qi="${idx}" title="Retirer de la file d’attente">✕</button>` : '') + '</div>';

  function draw(force) {
    if (!isOpen()) return;
    const q = S.queue, qi = S.qi;
    const s = [tab, qi, S.shuffle, S.ctxName, q.map((t) => t.id + (t._q ? '!' : '')).join(','), tab === 'recent' ? S.recent.map((t) => t.id).join(',') : ''].join('|');
    if (!force && s === sig) return;
    sig = s;
    let h = `<div class="q-tabs"><button class="q-tab${tab === 'queue' ? ' on' : ''}" data-q="tab" data-t="queue">File d’attente</button>` +
      `<button class="q-tab${tab === 'recent' ? ' on' : ''}" data-q="tab" data-t="recent">Récemment écoutés</button>` +
      '<button class="icon-btn q-close" data-q="close" title="Fermer">✕</button></div>';
    if (tab === 'recent') {
      h += S.recent.length ? '<div class="q-zone">' + S.recent.map((t, i) => row(t, i, { recent: true, now: onNow(t) })).join('') + '</div>'
        : '<div class="q-empty">Rien d’écouté pour le moment.</div>';
    } else {
      const cur = q[qi], queued = [], ctx = [];
      for (let k = qi + 1; k < q.length; k++) (q[k]._q ? queued : ctx).push(k);
      h += '<div class="q-sec">En cours de lecture</div>' + (cur ? row(cur, qi, { now: true }) : '<div class="q-empty">Rien en lecture pour le moment.</div>');
      if (queued.length) h += `<div class="q-sec"><span>File d’attente</span><button class="q-clear" data-q="clear">Vider la file</button></div><div class="q-zone">${queued.map((k) => row(q[k], k, { drag: true, rm: true })).join('')}</div>`;
      else h += '<div class="q-drop" data-zone="q">Glisse un titre ici pour l’ajouter à la file d’attente</div>';
      if (ctx.length) h += `<div class="q-sec">À suivre : ${esc(S.ctxName || 'Lecture')}</div><div class="q-zone">${ctx.slice(0, 150).map((k) => row(q[k], k, { drag: true, rm: true })).join('')}</div>`;
      if (!queued.length && !ctx.length && cur) h += '<div class="q-empty">La file d’attente est vide.<br>Ajoute des titres avec ⋯ → Ajouter à la file d’attente.</div>';
      h += '<div class="q-drop end" data-zone="end">Déposer à la fin de la liste</div>';
    }
    const top = panel.scrollTop;
    panel.innerHTML = h;
    panel.scrollTop = top;
  }

  function normalize() {      // titres ajoutés d'abord, puis la suite (l'ordre relatif ne change pas)
    const a = S.qi + 1, tail = S.queue.slice(a);
    S.queue = [...S.queue.slice(0, a), ...tail.filter((t) => t._q), ...tail.filter((t) => !t._q)];
  }
  function moveQueue(from, pos, zq) {
    const q = S.queue;
    if (from <= S.qi || from >= q.length) return;
    const [it] = q.splice(from, 1);
    if (pos > from) pos--;
    pos = Math.max(S.qi + 1, Math.min(pos, q.length));
    if (zq) it._q = true; else delete it._q;
    q.splice(pos, 0, it);
    normalize(); draw(true);
  }

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) {
      const k = b.dataset.q;
      if (k === 'tab') { tab = b.dataset.t; draw(true); }
      else if (k === 'close') window.toggleQueuePanel(false);
      else if (k === 'clear') { S.queue = S.queue.filter((t, i) => !(i > S.qi && t._q)); draw(true); }
      else if (k === 'rm') { const i = +b.dataset.qi; if (i > S.qi) { S.queue.splice(i, 1); draw(true); } }
      return;
    }
    const r = e.target.closest('.q-row');
    if (!r) return;
    if (r.dataset.qr != null) playFrom(S.recent, +r.dataset.qr, 'Écoutés récemment');
    else { const i = +r.dataset.qi; if (i === S.qi) togglePlay(); else playIndex(i); }
  });

  // ---- glisser-déposer pour réordonner ----
  const clearMarks = () => panel.querySelectorAll('.drop-before,.drop-after,.drop-on').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-on'));
  function target(e) {
    const r = e.target.closest('.q-row[draggable="true"], .q-drop');
    if (!r) return null;
    if (r.classList.contains('q-drop')) { const zq = r.dataset.zone === 'q'; return { el: r, pos: zq ? S.qi + 1 : S.queue.length, zq, mark: 'drop-on' }; }
    const i = +r.dataset.qi, rect = r.getBoundingClientRect(), after = e.clientY > rect.top + rect.height / 2;
    return { el: r, pos: after ? i + 1 : i, zq: !!(S.queue[i] && S.queue[i]._q), mark: after ? 'drop-after' : 'drop-before' };
  }
  panel.addEventListener('dragstart', (e) => {
    const r = e.target.closest('.q-row[draggable="true"]');
    if (!r) return;
    dragFrom = +r.dataset.qi;
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom));
    r.classList.add('drag'); document.body.classList.add('q-dragging');
  });
  panel.addEventListener('dragover', (e) => { if (dragFrom < 0) return; const t = target(e); if (!t) return; e.preventDefault(); clearMarks(); t.el.classList.add(t.mark); });
  panel.addEventListener('drop', (e) => { if (dragFrom < 0) return; const t = target(e); if (!t) return; e.preventDefault(); moveQueue(dragFrom, t.pos, t.zq); });
  panel.addEventListener('dragend', () => { dragFrom = -1; document.body.classList.remove('q-dragging'); clearMarks(); panel.querySelectorAll('.drag').forEach((x) => x.classList.remove('drag')); });

  window.sonoraQueueUI = () => draw(false);
  window.toggleQueuePanel = (force) => {
    const open = force != null ? !!force : !isOpen();
    document.body.classList.toggle('q-open', open);
    const b = document.getElementById('btn-queue'); if (b) b.classList.toggle('on', open);
    if (open) draw(true);
  };
  // le bouton « vue en cours de lecture » ramène le panneau habituel
  document.addEventListener('click', (e) => {
    if (isOpen() && e.target.closest('#btn-view')) { e.stopImmediatePropagation(); window.toggleQueuePanel(false); }
  }, true);
})();
