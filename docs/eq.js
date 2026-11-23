// Sonora : égaliseur (10 bandes) avec préréglages Jazz, Rock, Pop, Hip-Hop, Électro, Classique, Basses+, Voix, Acoustique, Ordinateur.
// • Titres YouTube : Sonora capte le son de la vidéo (capture audio Electron de l'iframe), le fait passer dans l'égaliseur puis le rejoue.
// • Ta musique locale : branchée directement sur l'égaliseur.
// L'égaliseur est désactivé par défaut. Si la capture échoue ou reste muette, il s'éteint tout seul et le son d'origine revient.
(() => {
  'use strict';
  if (typeof S === 'undefined') return;
  const FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  const PRESETS = [
    ['Normal', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], ['Jazz', [2, 2, 1, 3, -1, -1, 0, 2, 3, 4]], ['Rock', [5, 4, 3, 1, -1, -1, 1, 3, 4, 5]],
    ['Pop', [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2]], ['Hip-Hop', [6, 5, 3, 3, -1, -1, 2, 0, 2, 3]], ['Électro', [5, 4, 1, 0, -2, 2, 1, 2, 4, 5]],
    ['Classique', [0, 0, 0, 0, 0, 0, -2, -2, -2, -4]], ['Basses+', [7, 6, 5, 3, 1, 0, 0, 0, 0, 0]], ['Voix', [-2, -2, -1, 1, 3, 4, 4, 3, 1, 0]],
    ['Acoustique', [4, 4, 3, 1, 2, 2, 3, 3, 3, 2]], ['Ordinateur', [5, 5, 4, 2, 0, 0, 1, 2, 3, 2]], ['Casque', [4, 3, 2, 0, -1, 0, 1, 2, 3, 3]]
  ].map((p) => [p[0], p[0] === 'Normal' ? p[1] : p[1].map((g) => Math.max(-12, Math.min(12, Math.round(g * 1.15))))]);
  const cfg = Object.assign({ on: false, custom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preset: 'Normal', gains: PRESETS[0][1].slice() }, (typeof load === 'function' ? load('sonora.eq', null) : null) || {});
  cfg.on = false; // toujours éteint au démarrage
  const save = () => { try { if (typeof store === 'function') store('sonora.eq', cfg); } catch (e) { /* ignoré */ } };

  let ctx = null, filters = [], comp = null, an = null, anBuf = null, mode = '', stream = null, holder = null, pre = null, srcNode = null, mediaSrc = null, starting = false, quiet = 0;
  const ENABLE_YT = true; // la capture du son YouTube coupe le son sur certaines installations : désactivée tant qu'elle n'est pas fiable
  const cur = () => S.queue && S.queue[S.qi];
  const kind = (t) => (!t ? '' : t.source === 'youtube' ? 'yt' : t.source === 'local' ? 'local' : 'other');
  const playing = () => { try { return typeof isPaused === 'function' ? !isPaused() : true; } catch (e) { return true; } };

  function ensureGraph() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    filters = FREQS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === FREQS.length - 1 ? 'highshelf' : 'peaking'; b.frequency.value = f; b.Q.value = 1.1; b.gain.value = 0; return b; });
    pre = ctx.createGain(); pre.connect(filters[0]);
    filters.reduce((a, b) => { a.connect(b); return b; });
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -6; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    an = ctx.createAnalyser(); an.fftSize = 256; anBuf = new Uint8Array(an.frequencyBinCount);
    filters[filters.length - 1].connect(comp); comp.connect(ctx.destination); comp.connect(an);
    applyGains();
  }
  function applyGains() { if (mode === 'yt' && window.api && window.api.eqHost) window.api.eqHost('gains', cfg.on ? gainPayload() : { gains: new Array(10).fill(0) });
    if (!ctx) return;
    if (pre) pre.gain.setTargetAtTime(cfg.on ? Math.pow(10, -Math.max(0, ...cfg.gains) * 0.7 / 20) : 1, ctx.currentTime, 0.03); filters.forEach((f, i) => { f.gain.setTargetAtTime(cfg.on ? cfg.gains[i] : 0, ctx.currentTime, 0.03); }); }

  let hostSt = null;
  if (window.api && window.api.onEqHost) window.api.onEqHost((s) => { hostSt = s; });
  const gainPayload = () => ({ gains: cfg.gains.slice() });
  function stopCapture() {
    if (mode === 'yt') { try { window.api.eqHost('stop'); } catch (e) { /* ignoré */ } }
    if (mode === 'yt') mode = '';
    hostSt = null;
  }
  async function startYT() {
    if (starting) return; starting = true;
    try {
      if (!window.api || !window.api.eqHost) throw new Error('nécessite la nouvelle version');
      const r = await window.api.eqHost('start', gainPayload());
      if (!r || !r.ok) throw new Error((r && r.err) || 'échec');
      mode = 'yt'; quiet = 0;
    } catch (e) { const why = (e && (e.name + ' ' + e.message)) || 'erreur'; stopCapture(); fail('Capture impossible (' + why + ') : le son d’origine est conservé.'); }
    finally { starting = false; }
  }
  function startLocal() {
    try {
      ensureGraph(); if (ctx.state === 'suspended') ctx.resume();
      if (!mediaSrc && typeof audio !== 'undefined') { mediaSrc = ctx.createMediaElementSource(audio); mediaSrc.connect(pre); }
      mode = 'local';
    } catch (e) { fail('Égaliseur indisponible pour ce fichier.'); }
  }
  function fail(msg) { cfg.on = false; save(); diag = msg; setNote(msg); try { if (typeof toast === 'function') toast(msg); } catch (e) { /* ignoré */ } applyGains(); paintUI(); }

  // adapte la capture au titre en cours
  async function sync() {
    const t = cur(), k = kind(t);
    if (!cfg.on) { if (mode === 'yt') stopCapture(); applyGains(); return; }
    if (k === 'yt' && !ENABLE_YT) { if (mode === 'yt') stopCapture(); setNote('Pas encore disponible pour les titres YouTube (le son d’origine est conservé). Fonctionne sur ta musique locale.'); }
    else if (k === 'yt') { if (mode !== 'yt') { if (mode === 'local') { /* l'élément audio reste branché mais en pause */ } await startYT(); } }
    else if (k === 'local') { if (mode === 'yt') stopCapture(); if (mode !== 'local') startLocal(); }
    else { if (mode === 'yt') stopCapture(); setNote(t ? 'L’égaliseur agit sur les titres YouTube et ta musique locale.' : ''); }
    applyGains();
  }
  // capture muette alors que ça joue : on tente une fois de la relancer, sinon on éteint l'égaliseur (le son d'origine revient)
  let retried = false;
  function watch() {
    if (!cfg.on || mode !== 'yt' || !playing()) { quiet = 0; return; }
    const s = hostSt && typeof hostSt.level === 'number' ? hostSt.level : -1;
    setNote('Capture YouTube : ' + (hostSt ? hostSt.state : '…') + ', niveau ' + s + (hostSt && hostSt.tracks ? ', pistes ' + hostSt.tracks : '') + (hostSt && hostSt.cfg ? ' | ' + hostSt.cfg : ''));
    quiet = s >= 0 && s < 8 ? quiet + 1 : 0;
    if (quiet > 5) { quiet = 0; if (!retried) { retried = true; stopCapture(); sync(); } else { retried = false; stopCapture(); fail('Le son n’a pas pu être capté : égaliseur désactivé, le son d’origine est conservé.'); } }
    else if (quiet === 0 && s > 8) retried = false;
  }
  setInterval(watch, 600);
  let lastKey = '';
  setInterval(() => { const t = cur(), k = (t ? t.id : '') + '|' + kind(t); if (k !== lastKey) { lastKey = k; if (cfg.on) sync(); } }, 800);

  // ---------- interface ----------
  let pop = null, noteEl = null, diag = '';
  const setNote = (m) => { if (noteEl) noteEl.textContent = m || ''; };
  function build() {
    pop = document.createElement('div'); pop.id = 'eq-pop'; pop.className = 'hidden';
    pop.innerHTML = `<div class="eq-head"><b>Égaliseur</b><label class="eq-sw"><input type="checkbox" id="eq-on"><i></i></label></div>
      <div class="eq-presets">${PRESETS.map((p) => `<button data-p="${p[0]}">${p[0]}</button>`).join('')}<button data-p="Perso">★ Perso</button></div>
      <div class="eq-bands">${FREQS.map((f, i) => `<div class="eq-b"><span class="eq-v" data-v="${i}">0</span><input type="range" min="-12" max="12" step="1" value="0" data-i="${i}" orient="vertical"><span class="eq-l">${LABELS[i]}</span></div>`).join('')}</div>
      <div class="eq-foot"><span class="eq-note"></span><button class="eq-reset">Réinitialiser</button></div>`;
    document.body.appendChild(pop); noteEl = pop.querySelector('.eq-note');
    pop.querySelector('#eq-on').addEventListener('change', (e) => { cfg.on = e.target.checked; if (cfg.on && cfg.preset === 'Normal' && cfg.gains.every((g) => g === 0)) { /* rien à égaliser : on propose un préréglage */ setNote('Choisis un préréglage ou règle les bandes.'); } save(); applyGains(); retried = false; sync(); paintUI(); });
    pop.querySelectorAll('.eq-presets button').forEach((b) => b.addEventListener('click', () => { const p = b.dataset.p === 'Perso' ? ['Perso', (cfg.custom || []).slice()] : PRESETS.find((x) => x[0] === b.dataset.p); cfg.preset = p[0]; cfg.gains = p[1].slice(); if (p[0] !== 'Normal' && !cfg.on) { cfg.on = true; retried = false; } save(); applyGains(); sync(); paintUI(); }));
    pop.querySelectorAll('.eq-bands input').forEach((r) => r.addEventListener('input', () => { cfg.gains[+r.dataset.i] = +r.value; cfg.preset = 'Perso'; cfg.custom = cfg.gains.slice(); applyGains(); paintUI(true); }));
    pop.querySelectorAll('.eq-bands input').forEach((r) => r.addEventListener('change', save));
    pop.querySelector('.eq-reset').addEventListener('click', () => { cfg.preset = 'Normal'; cfg.gains = PRESETS[0][1].slice(); save(); applyGains(); paintUI(); });
    paintUI();
  }
  function paintUI(keepSliders) {
    if (!pop) return;
    pop.querySelector('#eq-on').checked = !!cfg.on;
    pop.classList.toggle('off', !cfg.on);
    pop.querySelectorAll('.eq-presets button').forEach((b) => b.classList.toggle('on', b.dataset.p === cfg.preset));
    pop.querySelectorAll('.eq-bands input').forEach((r) => { const v = cfg.gains[+r.dataset.i]; if (!keepSliders || document.activeElement !== r) r.value = v; });
    pop.querySelectorAll('.eq-v').forEach((s) => { const v = cfg.gains[+s.dataset.v]; s.textContent = (v > 0 ? '+' : '') + v; });
    const b = document.getElementById('btn-eq'); if (b) b.classList.toggle('on', !!cfg.on);
  }
  function place() {
    const b = document.getElementById('btn-eq'); if (!b || !pop) return;
    const r = b.getBoundingClientRect(), w = pop.offsetWidth || 440;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    pop.style.bottom = (window.innerHeight - r.top + 10) + 'px';
  }
  function toggle(show) {
    if (!pop) build();
    const open = show === undefined ? pop.classList.contains('hidden') : show;
    pop.classList.toggle('hidden', !open);
    if (open) { place(); paintUI(); const t = cur(); if (t && kind(t) === 'other') setNote('L’égaliseur agit sur les titres YouTube et ta musique locale.'); else setNote(''); if (diag) setNote(diag); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#btn-eq');
    if (b) { e.stopPropagation(); toggle(); return; }
    if (pop && !pop.classList.contains('hidden') && !e.target.closest('#eq-pop')) toggle(false);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop && !pop.classList.contains('hidden')) toggle(false); });
  window.addEventListener('resize', () => { if (pop && !pop.classList.contains('hidden')) place(); });
  document.addEventListener('DOMContentLoaded', () => paintUI());
  setTimeout(() => { paintUI(); if (cfg.on) sync(); }, 2500);
  window.sonoraEQ = { cfg, PRESETS, toggle, sync };
})();
