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
    credentials: 'include', redirect: init.redirect || (req && req.redirect) || 'follow', signal: init.signal || (req && req.signal) || undefined
  });
}

async function client() {
  const s = await ytTv.getTvSession();
  if (yt && ytToken === s.poToken) return yt;
  if (ytCreating) return ytCreating;
  ytCreating = (async () => {
    const { Innertube, Platform, Constants } = await import('youtubei.js');
    Platform.shim.eval = (data) => sandboxEval(data.output);
    // la version du client TV intégrée à youtubei.js vieillit : YouTube répond alors « La page doit être actualisée ».
    // On annonce la version réelle lue sur youtube.com/tv, et le même User-Agent que celui de la session.
    if (Constants && Constants.CLIENTS && Constants.CLIENTS.TV) {
      if (s.clientVersion) Constants.CLIENTS.TV.VERSION = s.clientVersion;
      Constants.CLIENTS.TV.USER_AGENT = ytTv.TV_USER_AGENT;
    }
    const inst = await Innertube.create({
      client_type: 'TVHTML5', po_token: s.poToken, visitor_data: s.visitorData, player_id: s.playerId,
      user_agent: ytTv.TV_USER_AGENT, fetch: tvFetch, retrieve_player: true, enable_session_cache: false, lang: 'fr', location: 'FR'
    });
    yt = inst; ytToken = s.poToken; urls.clear();
    return inst;
  })().finally(() => { ytCreating = null; });
  return ytCreating;
}

// requête /player telle que l'envoie l'appli YouTube TV
async function playerRequest(s, videoId, sts, poToken) {
  const body = {
    context: { client: { clientName: 'TVHTML5', clientVersion: s.clientVersion, userAgent: ytTv.TV_USER_AGENT, visitorData: s.visitorData, hl: 'fr', gl: 'FR' } },
    videoId, contentCheckOk: true, racyCheckOk: true,
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', ...(sts ? { signatureTimestamp: sts } : {}) } }
  };
  if (poToken) body.serviceIntegrityDimensions = { poToken };
  const res = await session.fromPartition(PARTITION).fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json', 'User-Agent': ytTv.TV_USER_AGENT, 'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/tv',
      'X-Youtube-Client-Name': '7', 'X-Youtube-Client-Version': s.clientVersion, 'X-Goog-Visitor-Id': s.visitorData
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// adresse audio directe d'une vidéo : { url, mime, bitrate }
async function getAudioUrl(videoId) {
  if (!/^[\w-]{11}$/.test(String(videoId))) throw new Error('Identifiant de vidéo invalide');
  const c = urls.get(videoId);
  if (c && Date.now() < c.expiresAt) return c;
  const inst = await client();
  const s = await ytTv.getTvSession();
  const player = inst.session.player;
  const sts = player && player.signature_timestamp;
  // trois essais : jeton lié à la vidéo (comme l'appli TV), jeton de session, sans jeton
  const vtok = await ytTv.mintFor(videoId).catch(() => '');
  const report = [];
  let data = null;
  for (const [label, tok] of [['jeton vidéo', vtok], ['jeton session', s.poToken], ['sans jeton', '']]) {
    if (label !== 'sans jeton' && !tok) { report.push(label + ' : indisponible'); continue; }
    let j;
    try { j = await playerRequest(s, videoId, sts, tok); } catch (e) { report.push(label + ' : ' + e.message); continue; }
    const ps = j.playabilityStatus || {};
    if (ps.status === 'OK' && j.streamingData) { data = j; break; }
    report.push(label + ' : ' + [ps.status || '?', ps.reason].filter(Boolean).join(' '));
  }
  if (!data) throw new Error('YouTube refuse le flux — ' + report.join(' | ') + ' — version ' + s.clientVersion + ', sts ' + (sts || '?'));
  const audios = (data.streamingData.adaptiveFormats || []).filter((x) => /^audio\//.test(x.mimeType || '') && !x.drmFamilies);
  if (!audios.length) throw new Error('Aucun flux audio dans la réponse');
  audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const fmt = audios[0];
  const f = { url: await player.decipher(fmt.url, fmt.signatureCipher, fmt.cipher), mime_type: fmt.mimeType, bitrate: fmt.bitrate };
  if (!f.url) throw new Error('Aucun flux audio');
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
