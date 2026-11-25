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
    C = Constants;
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

// ---- clients essayés, dans l'ordre (celui qui a marché passe en premier la fois suivante) ----
// TV : le client de la session BotGuard. VR (Quest) et iOS : clients que YouTube sert sans attestation du navigateur.
let C = null;   // constantes de youtubei.js (versions et User-Agents à jour avec la bibliothèque)
function clients(s, sts) {
  const vr = C.CLIENTS.ANDROID_VR, ios = C.CLIENTS.IOS;
  const tv = { clientName: 'TVHTML5', clientVersion: s.clientVersion, userAgent: ytTv.TV_USER_AGENT, visitorData: s.visitorData, hl: 'fr', gl: 'FR' };
  return [
    { id: 'tv', label: 'TV', nameId: '7', ua: ytTv.TV_USER_AGENT, client: tv, token: 'video', sts, web: true },
    { id: 'tv2', label: 'TV (forme appli)', nameId: '7', ua: ytTv.TV_USER_AGENT, client: { ...tv, clientScreen: 'WATCH', platform: 'TV', clientFormFactor: 'UNKNOWN_FORM_FACTOR', deviceMake: 'Unknown', deviceModel: 'Unknown', osName: 'Unknown', osVersion: 'Unknown' }, token: 'video', sts, web: false },
    { id: 'vr', label: 'VR', nameId: '28', ua: vr.USER_AGENT, client: { clientName: vr.NAME, clientVersion: vr.VERSION, userAgent: vr.USER_AGENT, deviceMake: vr.DEVICE_MAKE, deviceModel: vr.DEVICE_MODEL, androidSdkVersion: vr.SDK_VERSION, osName: 'Android', osVersion: '12L', platform: 'MOBILE', clientFormFactor: 'SMALL_FORM_FACTOR', visitorData: s.visitorData, hl: 'fr', gl: 'FR' }, token: '', sts: 0, web: false },
    { id: 'ios', label: 'iOS', nameId: '5', ua: ios.USER_AGENT, client: { clientName: ios.NAME, clientVersion: ios.VERSION, userAgent: ios.USER_AGENT, deviceMake: 'Apple', deviceModel: ios.DEVICE_MODEL, osName: ios.OS_NAME, osVersion: ios.OS_VERSION, platform: 'MOBILE', visitorData: s.visitorData, hl: 'fr', gl: 'FR' }, token: '', sts: 0, web: false }
  ];
}
let preferred = '';

async function playerRequest(cl, s, videoId, poToken) {
  const body = {
    context: { client: cl.client }, videoId, contentCheckOk: true, racyCheckOk: true,
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', ...(cl.sts ? { signatureTimestamp: cl.sts } : {}) } }
  };
  if (poToken) body.serviceIntegrityDimensions = { poToken };
  const headers = { 'Content-Type': 'application/json', 'User-Agent': cl.ua, 'X-Youtube-Client-Name': cl.nameId, 'X-Youtube-Client-Version': cl.client.clientVersion, 'X-Goog-Visitor-Id': s.visitorData };
  if (cl.web) { headers.Origin = 'https://www.youtube.com'; headers.Referer = 'https://www.youtube.com/tv'; }
  const res = await session.fromPartition(PARTITION).fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', credentials: cl.web ? 'include' : 'omit', signal: AbortSignal.timeout(15000), headers, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// télécharge les 2 premiers octets du flux avec le User-Agent du client qui l'a obtenu : renvoie le code HTTP (0 = réseau)
async function probe(url) {
  try {
    const ua = streamUserAgent(url);
    const res = await session.fromPartition('sonora-yt-probe').fetch(url, { headers: Object.assign({ Range: 'bytes=0-1' }, ua ? { 'User-Agent': ua } : {}), credentials: 'omit', signal: AbortSignal.timeout(10000) });
    try { await res.arrayBuffer(); } catch { /* ignoré */ }
    return res.status;
  } catch { return 0; }
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
  let list = clients(s, sts);
  if (preferred) list = [...list.filter((x) => x.id === preferred), ...list.filter((x) => x.id !== preferred)];
  const report = [];
  let f = null, used = null;
  for (const cl of list) {
    let tok = '';
    if (cl.token === 'video') tok = await ytTv.mintFor(videoId).catch(() => '');
    let j;
    try { j = await playerRequest(cl, s, videoId, tok); } catch (e) { report.push(cl.label + ' : ' + e.message); continue; }
    const ps = j.playabilityStatus || {};
    if (ps.status !== 'OK' || !j.streamingData) { report.push(cl.label + ' : ' + [ps.status || '?', ps.reason].filter(Boolean).join(' ')); continue; }
    const audios = (j.streamingData.adaptiveFormats || []).filter((x) => /^audio\//.test(x.mimeType || '') && !x.drmFamilies);
    if (!audios.length) { report.push(cl.label + ' : aucun flux audio'); continue; }
    audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const fmt = audios[0];
    let url = '';
    try { url = await player.decipher(fmt.url, fmt.signatureCipher, fmt.cipher); } catch (e) { report.push(cl.label + ' : décodage impossible (' + e.message + ')'); continue; }
    // le serveur vidéo accepte-t-il vraiment cette adresse ? (quelques octets suffisent)
    const st = await probe(url);
    if (st !== 200 && st !== 206) { report.push(cl.label + ' : adresse obtenue mais flux refusé (' + (st || 'réseau') + ')'); continue; }
    f = { url, mime_type: fmt.mimeType, bitrate: fmt.bitrate }; used = cl; break;
  }
  if (!f) throw new Error('YouTube refuse le flux — ' + report.join(' | ') + ' — version TV ' + s.clientVersion + ', sts ' + (sts || '?'));
  preferred = used.id;
  const exp = Number(new URL(f.url).searchParams.get('expire')) * 1000;
  const out = { url: f.url, mime: f.mime_type || '', bitrate: f.bitrate || 0, via: used.label, expiresAt: (exp > Date.now() ? exp : Date.now() + 3 * 3600e3) - 10 * 60e3 };
  urls.set(videoId, out);
  if (urls.size > 200) urls.delete(urls.keys().next().value);
  return out;
}

// YouTube a refusé l'adresse ou la session : on repart de zéro au prochain titre
function reset() { urls.clear(); yt = null; ytToken = ''; ytTv.invalidateTvSession(); }

function dispose() { const w = evalWin; evalWin = null; evalReady = null; if (w && !w.isDestroyed()) { try { w.destroy(); } catch { /* ignoré */ } } }

// googlevideo vérifie que le lecteur qui télécharge le flux ressemble au client qui l'a demandé
function streamUserAgent(url) {
  if (!C) return '';
  let c = '';
  try { c = new URL(url).searchParams.get('c') || ''; } catch { return ''; }
  if (c === 'ANDROID_VR') return C.CLIENTS.ANDROID_VR.USER_AGENT;
  if (c === 'IOS') return C.CLIENTS.IOS.USER_AGENT;
  if (c.startsWith('TVHTML5')) return ytTv.TV_USER_AGENT;
  return '';
}

// ---- relais du flux : le lecteur de la page lit « sonora-yt://audio/<videoId> » et c'est le processus principal
// qui télécharge le son chez YouTube, avec les mêmes en-têtes que la vérification qui a réussi (pas de cookies,
// pas d'en-têtes de navigateur que le serveur vidéo refuse). Les demandes de plage (Range) passent telles quelles.
async function fetchStream(url, range) {
  const ua = streamUserAgent(url);
  const headers = {};
  if (range) headers.Range = range;
  if (ua) headers['User-Agent'] = ua;
  return session.fromPartition('sonora-yt-probe').fetch(url, { headers, credentials: 'omit' });
}
async function handleStream(req) {
  let id = '';
  try { id = new URL(req.url).pathname.replace(/^\/+/, '').slice(0, 11); } catch { /* ignoré */ }
  if (!/^[\w-]{11}$/.test(id)) return new Response('', { status: 400 });
  const range = req.headers.get('range') || '';
  let res;
  try {
    res = await fetchStream((await getAudioUrl(id)).url, range);
    if (res.status === 403 || res.status === 410) { urls.delete(id); res = await fetchStream((await getAudioUrl(id)).url, range); }   // adresse expirée : une nouvelle
  } catch { return new Response('', { status: 502 }); }
  const headers = new Headers();
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) { const v = res.headers.get(k); if (v) headers.set(k, v); }
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
  return new Response(res.body, { status: res.status, headers });
}

module.exports = { getAudioUrl, reset, dispose, streamUserAgent, handleStream };
