// Sonora — champ « Clé YouTube » dans Apparence (tout en bas) : on colle la clé, l'appli la teste, puis l'enregistre.
(() => {
  'use strict';
  if (typeof VIEWS === 'undefined' || typeof S === 'undefined') return;
  const api = () => window.api || {};
  const $1 = (s) => document.querySelector(s);
  const ERR = {
    format: 'Ça ne ressemble pas à une clé YouTube (elle commence par « AIza » et fait une quarantaine de caractères).',
    invalid: 'Google refuse cette clé : vérifie que tu l’as copiée en entier.',
    api_disabled: 'La clé est bonne, mais « YouTube Data API v3 » n’est pas activée dans ton projet Google Cloud.',
    network: 'Impossible de joindre Google : vérifie ta connexion.'
  };
  const HELP = `<ol class="yk-help"><li>Ouvre la console Google Cloud et crée un projet.</li>
    <li>Active l’API « YouTube Data API v3 » (menu Bibliothèque).</li>
    <li>Identifiants → Créer des identifiants → Clé API, puis copie-la ici.</li></ol>
    <button class="btn ghost small" data-yk="console">Ouvrir Google Cloud</button>`;

  const yhtml = () => `<div class="set-group" id="ytkey-group"><h3>Clé YouTube (facultative)</h3>
      <p class="sub" style="margin:0 0 12px">Une clé YouTube gratuite rend la lecture plus fiable. Sans clé, Sonora utilise la lecture sans clé ci-dessus.</p>
      <div id="ytkey-box" class="yk-box">Chargement…</div></div>`;

  let helpOpen = false, msg = '';
  async function paint() {
    const box = $1('#ytkey-box');
    if (!box) return;
    let st = { has: false, relay: false };
    try { if (api().ytKeyStatus) st = await api().ytKeyStatus(); else { box.innerHTML = '<div class="empty" style="padding:6px 0">Cette fonction demande la dernière version de main.js et preload.js.</div>'; return; } } catch (e) { /* on affiche l'état « sans clé » */ }
    const state = st.has ? `<div class="yk-ok">✓ Clé enregistrée <span class="mut">(se termine par ${esc(st.tail)})</span></div>`
      : st.relay ? '<div class="yk-ok">✓ Un relais est configuré : les titres sont lus en entier sans clé personnelle.</div>'
        : '<div class="yk-no">Aucune clé personnelle.</div>';
    box.innerHTML = state +
      `<div class="yk-row"><input id="yk-in" class="text-input" type="password" autocomplete="off" spellcheck="false" placeholder="${st.has ? 'Coller une autre clé pour la remplacer' : 'Colle ta clé YouTube ici (AIza…)'}">` +
      '<button class="btn small" data-yk="save">Enregistrer et tester</button>' +
      (st.has && st.source === 'file' ? '<button class="btn ghost small" data-yk="clear">Retirer</button>' : '') + '</div>' +
      (msg ? `<div class="yk-msg">${msg}</div>` : '') +
      `<button class="yk-link" data-yk="help">${helpOpen ? 'Masquer l’aide' : 'Comment obtenir une clé gratuite ?'}</button>${helpOpen ? HELP : ''}`;
  }
  async function save() {
    const inp = $1('#yk-in'), v = inp ? inp.value.trim() : '';
    if (!v) { msg = 'Colle d’abord ta clé.'; paint(); return; }
    msg = 'Test de la clé…'; paint();
    let r;
    try { r = await api().ytKeySave(v); } catch (e) { r = { ok: false, error: 'network' }; }
    if (r.ok) { msg = ''; toast(r.quota ? 'Clé enregistrée (le quota du jour est atteint, ça reprendra demain)' : 'Clé YouTube enregistrée ✓ : les titres sont lus en entier'); }
    else msg = esc(ERR[r.error] || 'Clé refusée (' + r.error + ').');
    paint();
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-yk]');
    if (!b) return;
    const k = b.dataset.yk;
    if (k === 'save') save();
    else if (k === 'help') { helpOpen = !helpOpen; paint(); }
    else if (k === 'console') { if (api().openExternal) api().openExternal('https://console.cloud.google.com/apis/credentials'); }
    else if (k === 'clear') { await api().ytKeyClear(); msg = ''; toast('Clé retirée'); paint(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'yk-in') save(); });

  window.sonoraYtKey = { html: yhtml, paint, open() { if (window.sonoraSettings) window.sonoraSettings.open('youtube'); } };
})();
