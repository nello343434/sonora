// Notification « nouvelle version » en haut à droite : téléchargement, puis « Redémarrer pour installer ».
(function () {
  let el = null, shownVer = '', dismissed = '';
  function build() {
    el = document.createElement('div'); el.id = 'upd-notif'; el.className = 'upd hidden';
    el.innerHTML = '<div class="upd-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg></div>'
      + '<div class="upd-tx"><b class="upd-t"></b><span class="upd-s"></span><i class="upd-bar"><u></u></i></div>'
      + '<button class="upd-go hidden" data-keepmenu>Redémarrer</button><button class="upd-x" aria-label="Fermer" data-keepmenu>×</button>';
    document.body.appendChild(el);
    el.querySelector('.upd-x').onclick = () => { dismissed = shownVer; el.classList.add('hidden'); };
    el.querySelector('.upd-go').onclick = () => { try { window.api.installUpdate(); } catch (e) { /* ignoré */ } };
  }
  window.sonoraUpdNotif = function (s) {
    if (!s || (s.state !== 'downloading' && s.state !== 'ready')) return;
    if (!el) build();
    if (s.version) shownVer = s.version;
    if (dismissed && dismissed === shownVer && s.state !== 'ready') return;
    const ready = s.state === 'ready';
    if (ready) dismissed = '';
    el.querySelector('.upd-t').textContent = 'Nouvelle version ' + (shownVer || '') + (ready ? ' prête' : ' disponible');
    el.querySelector('.upd-s').textContent = ready ? 'Redémarre Sonora pour l’installer.' : 'Téléchargement… ' + (s.pct || 0) + ' %';
    el.querySelector('.upd-bar').style.display = ready ? 'none' : '';
    el.querySelector('.upd-bar u').style.width = (s.pct || 0) + '%';
    el.querySelector('.upd-go').classList.toggle('hidden', !ready);
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('show'));
  };
})();
