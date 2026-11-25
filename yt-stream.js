// ---- Lecture directe de l'audio YouTube (sans le lecteur intégré) ----
// On demande le flux au client « YouTube TV » avec le PO Token de yt-tv.js, puis youtubei.js décode l'adresse
// (signature et paramètre « n ») à partir du code du lecteur YouTube. Ce code vient d'internet : il est exécuté
// dans une fenêtre Chromium cachée et isolée (sandbox), jamais dans le processus principal qui a accès au disque.
// En cas d'échec, l'appli retombe sur le lecteur intégré : rien n'est cassé si YouTube change quelque chose.
const { BrowserWindow, session } = require('electron');
const ytTv = require('./yt-tv');

const PARTITION = 'sonora-yt-tv';
let yt = null, ytToken = '', ytCreating = null;
let evalWin = null, evalReady = null;
const urls = new Map();   // videoId -> { url, mime, bitrate, expiresAt }

// ---- exécution isolée du code du lecteur YouTube ----
function evalWindow() {
  if (evalWin && !evalWin.isDestroyed() && evalReady) return evalReady;
  evalWin = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: { partition: 'sonora-yt-eval', contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: true, spellcheck: false, devTools: false, backgroundThrottling: false } });
  evalWin.on('closed', () => { evalWin = null; evalReady = null; });
  evalReady = evalWin.loadURL('about:blank').then(() => evalWin);
  evalReady.catch(() => { evalReady = null; });
  return evalReady;
}
async function sandboxEval(code) {
  const w = await evalWindow();
  // le script de youtubei.js se termine par « return process(...) » : on l'enveloppe dans une fonction
  return w.webContents.executeJavaScript('(function () {\n' + code + '\n})()', true);
}

// ---- requêtes : même session que yt-tv.js (cookies cohérents) et User-Agent TV sur youtube.com ----
async function tvFetch(input, init = {}) {
  const req = typeof input === 'object' && input && !(input instanceof URL) && 'url' in input ? input : null;
  const url = req ? req.url : String(input instanceof URL ? input.href : input);
  const headers = new Headers(req ? req.headers : undefined);
  if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (/(^|\.)youtube\.com$/.test(new URL(url).hostname)) headers.set('User-Agent', ytTv.TV_USER_AGENT);
  const method = init.method || (req && req.method) || 'GET';
  let body = init.body;
  if (body === undefined && req && req.body && method !== 'GET' && method !== 'HEAD') body = await req.text();
  return session.fromPartition(PARTITION).fetch(url, {
    method, body, headers: Object.fromEntries(headers.entries()),
    redirect: init.redirect || (req && req.redirect) || 'follow', signal: init.signal || (req && req.signal) || undefined
  });
}

async function client() {
  const s = await ytTv.getTvSession();
  if (yt && ytToken === s.poToken) return yt;
  if (ytCreating) return ytCreating;
  ytCreating = (async () => {
    const { Innertube, Platform } = await import('youtubei.js');
    Platform.shim.eval = (data) => sandboxEval(data.output);
    const inst = await Innertube.create({
      client_type: 'TVHTML5', po_token: s.poToken, visitor_data: s.visitorData, player_id: s.playerId,
      user_agent: ytTv.TV_USER_AGENT, fetch: tvFetch, retrieve_player: true, enable_session_cache: false, lang: 'fr', location: 'FR'
    });
    yt = inst; ytToken = s.poToken; urls.clear();
    return inst;
  })().finally(() => { ytCreating = null; });
  return ytCreating;
}

// adresse audio directe d'une vidéo : { url, mime, bitrate }
async function getAudioUrl(videoId) {
  if (!/^[\w-]{11}$/.test(String(videoId))) throw new Error('Identifiant de vidéo invalide');
  const c = urls.get(videoId);
  if (c && Date.now() < c.expiresAt) return c;
  const inst = await client();
  const f = await inst.getStreamingData(videoId, { type: 'audio', quality: 'best', format: 'any', client: 'TV' });
  if (!f || !f.url) throw new Error('Aucun flux audio');
  const exp = Number(new URL(f.url).searchParams.get('expire')) * 1000;
  const out = { url: f.url, mime: f.mime_type || '', bitrate: f.bitrate || 0, expiresAt: (exp > Date.now() ? exp : Date.now() + 3 * 3600e3) - 10 * 60e3 };
  urls.set(videoId, out);
  if (urls.size > 200) urls.delete(urls.keys().next().value);
  return out;
}

// YouTube a refusé l'adresse ou la session : on repart de zéro au prochain titre
function reset() { urls.clear(); yt = null; ytToken = ''; ytTv.invalidateTvSession(); }

function dispose() { const w = evalWin; evalWin = null; evalReady = null; if (w && !w.isDestroyed()) { try { w.destroy(); } catch { /* ignoré */ } } }

module.exports = { getAudioUrl, reset, dispose };
