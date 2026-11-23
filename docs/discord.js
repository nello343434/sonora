// Discord Rich Presence : envoie le titre en cours (état, pochette, barre de progression) au processus principal.
(() => {
  const api = () => window.api || {};
  const val = (k, d) => (S.settings[k] === undefined ? d : S.settings[k]);
  const R = window.sonoraRpc = { status: { state: 'off', user: null, error: null }, clientId: '', auth: null, builtIn: false, busy: false, msg: '' };
  const sig = { k: '', start: 0 };
  const clean = (s) => String(s || '').split(/,|\bfeat\.?\b|\bft\.?\b/i)[0].trim();
  const cut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  const badge = {};
  function badgeFor(artist) {
    if (!artist) return '';
    if (!(artist in badge)) { badge[artist] = ''; if (window.dzArtist) window.dzArtist(artist).then((u) => { badge[artist] = u || ''; sig.k = ''; }).catch(() => {}); }
    return badge[artist];
  }
  const REPO = 'https://github.com/nello343434/sonora';
  function listenUrl(t) {
    if (t.videoId) return 'https://www.youtube.com/watch?v=' + encodeURIComponent(t.videoId);
    const dz = t.dzid || (/^dz:/.test(String(t.id)) ? String(t.id).slice(3) : '');
    if (dz) return 'https://www.deezer.com/track/' + encodeURIComponent(dz);
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent((t.artist || '') + ' ' + (t.title || ''));
  }
  function build() {
    const t = S.queue && S.queue[S.qi];
    if (!val('rpcOn', false) || !t) return null;
    const paused = isPaused();
    if (paused && !val('rpcPause', true)) return null;
    const fmt = val('rpcFmt', 'split'), title = cut(t.title, 120) || 'Titre inconnu', artist = cut(t.artist, 120);
    const a = { type: 2 };
    if (fmt === 'inline') a.details = cut((artist ? artist + ' - ' : '') + title, 128);
    else if (fmt === 'title') { a.details = title; }
    else { a.details = title; if (artist) a.state = artist; }
    if (paused) a.state = 'En pause';
    if (val('rpcCover', true) && t.image && /^https:\/\//.test(t.image)) { a.assets = { large_image: t.image, large_text: cut(t.album || t.title, 100) }; }
    if (a.assets && val('rpcBadge', true)) { const b = badgeFor(clean(t.artist)); if (b && /^https:\/\//.test(b)) { a.assets.small_image = b; a.assets.small_text = cut(t.artist, 100); } }
    const btns = [];
    if (val('rpcBtnListen', true)) btns.push({ label: 'Écouter sur Sonora', url: listenUrl(t) });
    if (val('rpcBtnDl', true)) btns.push({ label: 'Télécharger Sonora', url: REPO + '/releases' });
    if (btns.length) a.buttons = btns;
    if (val('rpcProg', true) && !paused) {
      const pos = curTime() || 0, dur = curDur() || 0, now = Date.now();
      if (isFinite(pos)) { a.timestamps = { start: Math.round(now - pos * 1000) }; if (dur > 1 && isFinite(dur)) a.timestamps.end = Math.round(now + (dur - pos) * 1000); }
    }
    return a;
  }
  function tick(force) {
    if (!api().rpcActivity) return;
    const a = build();
    const k = a ? [S.queue[S.qi].id, isPaused(), a.details, a.state, a.assets && a.assets.large_image, a.assets && a.assets.small_image, (a.buttons || []).length, !!a.timestamps].join('|') : 'none';
    let drift = false;
    if (a && a.timestamps) { drift = Math.abs(a.timestamps.start - sig.start) > 2500; }
    if (force || k !== sig.k || drift) { sig.k = k; sig.start = a && a.timestamps ? a.timestamps.start : 0; api().rpcActivity(a); }
  }
  R.sync = async () => {
    if (!api().rpcConfig) return;
    try { R.status = (await api().rpcConfig(!!val('rpcOn', false), R.clientId)) || R.status; } catch (e) { /* ignoré */ }
    sig.k = ''; tick(true); if (window.sonoraSettings && window.sonoraSettings.repaint) window.sonoraSettings.repaint();
  };
  const repaint = () => { if (window.sonoraSettings && window.sonoraSettings.repaint) window.sonoraSettings.repaint(); };
  R.login = async () => {
    if (R.busy || !api().rpcLogin) return;
    R.busy = true; R.msg = 'Discord s’ouvre : accepte la demande d’autorisation dans l’appli Discord…'; repaint();
    let r; try { r = await api().rpcLogin(R.clientId); } catch (e) { r = { ok: false, error: 'Mets à jour main.js, preload.js et discord-rpc.js' }; }
    R.busy = false;
    if (r.ok) { R.auth = r.auth; R.msg = ''; S.settings.rpcOn = true; persist(); R.status = r.status || R.status; await R.sync(); if (window.toast) toast(r.note || 'Connecté à Discord'); }
    else { R.msg = r.cancelled ? 'Autorisation annulée.' : (r.error || 'Connexion impossible'); }
    repaint();
  };
  R.logout = async () => { try { await api().rpcLogout(); } catch (e) { /* ignoré */ } R.auth = null; R.msg = ''; S.settings.rpcOn = false; persist(); R.status = { state: 'off', user: null }; sig.k = ''; repaint(); if (window.toast) toast('Déconnecté de Discord'); };
  R.setId = (id) => { R.clientId = String(id || '').trim(); return R.sync(); };
  async function init() {
    if (!api().rpcGet) return;
    try { const g = await api().rpcGet(); R.clientId = g.clientId || ''; R.auth = g.auth || null; R.builtIn = !!g.builtIn; R.status = g.status || R.status; } catch (e) { return; }
    if (api().onRpcStatus) api().onRpcStatus((st) => { R.status = st; if (window.sonoraSettings && window.sonoraSettings.repaint) window.sonoraSettings.repaint(); });
    if (val('rpcOn', false)) R.sync();
    setInterval(() => tick(false), 1500);
  }
  R.ready = init();
  window.addEventListener('load', () => {});
})();
