// Sonora : overlay (mini lecteur flottant). Envoie l'état du lecteur à la fenêtre overlay et exécute ses boutons.
(() => {
  'use strict';
  const api = () => window.api || {};
  const val = (k, d) => (S.settings[k] === undefined ? d : S.settings[k]);
  let last = '', timer = 0;
  const state = () => {
    const t = S.queue && S.queue[S.qi];
    return t ? { title: t.title, artist: t.artist, image: t.image || '', pos: curTime() || 0, dur: curDur() || t.duration || 0, playing: !isPaused(), liked: typeof isLiked === 'function' ? !!isLiked(t) : false } : { title: '', artist: '', image: '', pos: 0, dur: 0, playing: false };
  };
  function push() {
    if (!api().overlayState || !val('ovlOn', false)) return;
    const s = state(), k = [s.title, s.artist, s.image, s.playing, s.liked].join('|');
    if (k !== last) { last = k; api().overlayState(s); }
  }
  const sync = async (reveal) => {
    if (!api().overlayConfig) return;
    await api().overlayConfig({ on: !!val('ovlOn', false), pos: val('ovlPos', 'tc'), key: val('ovlKey', 'Alt+Shift+O'), onMin: !!val('ovlMin', true), top: !!val('ovlTop', true), opacity: 1, reveal: reveal === true });
    last = ''; push();
  };
  window.sonoraOverlay = { sync };
  if (api().onOverlayCmd) api().onOverlayCmd((c) => { const b = document.getElementById({ prev: 'btn-prev', play: 'btn-play', next: 'btn-next', like: 'np-like' }[c]); if (b) b.click(); });
  window.addEventListener('load', () => { sync(); timer = setInterval(push, 700); });
  document.addEventListener('click', () => setTimeout(() => { last = ''; push(); }, 150), true);
})();
