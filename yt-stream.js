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

// adresse audio directe d'une vidéo : { url, mime, bitrate }
async function getAudioUrl(videoId, opts = {}) {
  if (!/^[\w-]{11}$/.test(String(videoId))) throw new Error('Identifiant de vidéo invalide');
  const c = urls.get(videoId);
  if (!opts.fresh && c && Date.now() < c.expiresAt) return c;
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
    try { const n0 = new URL(fmt.url || new URLSearchParams(fmt.signatureCipher || fmt.cipher || '').get('url')).searchParams.get('n'), n1 = new URL(url).searchParams.get('n'); console.log('[sonora-yt]', videoId, cl.label, 'n :', n0 ? (n0 === n1 ? 'NON transformé' : 'transformé') : 'absent', '| client c =', new URL(url).searchParams.get('c')); } catch { /* journal seulement */ }
    f = { url, mime_type: fmt.mimeType, bitrate: fmt.bitrate, size: +fmt.contentLength || 0 }; used = cl; break;
  }
  if (!f) throw new Error('YouTube refuse le flux — ' + report.join(' | ') + ' — version TV ' + s.clientVersion + ', sts ' + (sts || '?'));
  preferred = used.id;
  const exp = Number(new URL(f.url).searchParams.get('expire')) * 1000;
  const out = { url: f.url, mime: f.mime_type || '', bitrate: f.bitrate || 0, size: f.size, via: used.label, visitorData: s.visitorData, expiresAt: (exp > Date.now() ? exp : Date.now() + 3 * 3600e3) - 10 * 60e3 };
  urls.set(videoId, out);
  if (urls.size > 200) urls.delete(urls.keys().next().value);
  return out;
}

// YouTube a refusé l'adresse ou la session : on repart de zéro au prochain titre
function reset() { urls.clear(); files.clear(); yt = null; ytToken = ''; ytTv.invalidateTvSession(); }

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

// ---- relais du flux : le lecteur de la page lit « sonora-yt://audio/<videoId> » ----
// Le serveur vidéo n'accepte que les téléchargements qui partent du début du fichier (une plage qui commence plus loin
// reçoit 403). Le processus principal télécharge donc le titre une fois, du début à la fin, en mémoire, et sert au
// lecteur les plages qu'il demande au fur et à mesure qu'elles arrivent : la lecture démarre tout de suite et l'avance
// rapide marche. On garde les 3 derniers titres.
const files = new Map();   // videoId -> { total, mime, buf, have, done, error, wake }
const KEEP = 3;

function fetchStream(url, range) {
  const ua = streamUserAgent(url);
  const headers = {};
  if (range) headers.Range = range;
  if (ua) headers['User-Agent'] = ua;
  // session à part et sans cache : sinon Chromium peut resservir les 2 octets de la vérification au lieu du fichier
  return session.fromPartition('sonora-yt-dl').fetch(url, { headers, credentials: 'omit', cache: 'no-store' });
}

// Le serveur vidéo refuse certains téléchargements (403) selon la façon de demander. On essaie plusieurs méthodes,
// dans l'ordre, en gardant ce qui est déjà arrivé ; la première qui va jusqu'au bout est retenue pour les titres suivants.
const MB = 1024 * 1024;
const STRATS = [
  { id: 'A', label: 'fichier entier', chunk: 0, how: 'header' },
  { id: 'B', label: 'morceaux de 1 Mo (en-tête Range)', chunk: MB, how: 'header' },
  { id: 'C', label: 'morceaux de 1 Mo (paramètre range=)', chunk: MB, how: 'query' },
  { id: 'D', label: 'un morceau par adresse neuve', chunk: MB, how: 'query', fresh: true },
  { id: 'E', label: 'paramètre range= avec jeton pot', chunk: MB, how: 'query', pot: true }
];
let bestStrategy = '';
let resolveUrl = (id, opts) => getAudioUrl(id, opts);

async function readInto(res, f, start) {
  const reader = res.body.getReader();
  let pos = start;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const n = Math.min(value.length, f.total - pos);
    if (n <= 0) { try { await reader.cancel(); } catch { /* ignoré */ } break; }
    Buffer.from(value.buffer, value.byteOffset, n).copy(f.buf, pos);
    pos += n;
    if (pos > f.have) { f.have = pos; f.wake(); }
  }
  return pos - start;
}

async function runStrategy(id, f, st) {
  let info = await resolveUrl(id, { fresh: true });   // adresse neuve pour chaque méthode
  const pot = st.pot ? await ytTv.mintFor(info.visitorData) : '';
  while (f.have < f.total) {
    const a = f.have, b = st.chunk ? Math.min(f.total - 1, a + st.chunk - 1) : f.total - 1;
    if (st.fresh && a > 0) info = await resolveUrl(id, { fresh: true });
    let url = info.url;
    if (st.how === 'query') url += '&range=' + a + '-' + b;
    if (pot) url += '&pot=' + encodeURIComponent(pot);
    const res = await fetchStream(url, st.how === 'header' ? 'bytes=' + a + '-' + b : '');
    console.log('[sonora-yt]', id, st.id, a + '-' + b, '->', res.status);
    if (res.status !== 200 && res.status !== 206) { try { await res.arrayBuffer(); } catch { /* ignoré */ } throw new Error('HTTP ' + res.status + ' à l’octet ' + a); }
    const got = await readInto(res, f, a);
    if (got <= 0) throw new Error('réponse vide à l’octet ' + a);
  }
}

async function download(id, f) {
  try {
    const info = await resolveUrl(id, {});
    if (!info.size) throw new Error('taille du fichier inconnue');
    f.total = info.size;
    f.mime = (info.mime || 'audio/webm').split(';')[0];
    f.buf = Buffer.alloc(f.total);
    f.wake();
    const order = bestStrategy ? [...STRATS.filter((x) => x.id === bestStrategy), ...STRATS.filter((x) => x.id !== bestStrategy)] : STRATS;
    for (const st of order) {
      try {
        await runStrategy(id, f, st);
        bestStrategy = st.id;
        console.log('[sonora-yt]', id, 'OK avec la méthode', st.id, '(' + st.label + ') :', f.have, '/', f.total, 'octets');
        break;
      } catch (e) {
        console.log('[sonora-yt]', id, 'méthode', st.id, '(' + st.label + ') échoue :', e.message, '— reçu', f.have, '/', f.total);
      }
    }
    if (f.have < f.total) throw new Error('aucune méthode n’a permis de tout télécharger');
    f.done = true;
  } catch (e) {
    f.error = e; console.log('[sonora-yt]', id, 'erreur de téléchargement :', e.message);
    files.delete(id);   // la prochaine demande recommencera
  }
  f.wake();
}

function openFile(id) {
  let f = files.get(id);
  if (f) { files.delete(id); files.set(id, f); return f; }   // passe en « récent »
  f = { total: 0, mime: '', buf: null, have: 0, done: false, error: null, waiters: [] };
  f.wake = () => { const w = f.waiters; f.waiters = []; w.forEach((r) => r()); };
  f.until = (cond) => new Promise((resolve) => { const check = () => (cond() || f.error || f.done) ? resolve() : f.waiters.push(check); check(); });
  files.set(id, f);
  while (files.size > KEEP) files.delete(files.keys().next().value);
  download(id, f);
  return f;
}

async function handleStream(req) {
  let id = '';
  try { id = new URL(req.url).pathname.replace(/^\/+/, '').slice(0, 11); } catch { /* ignoré */ }
  if (!/^[\w-]{11}$/.test(id)) return new Response('', { status: 400 });
  const f = openFile(id);
  await f.until(() => f.total > 0);
  if (!f.total) return new Response('', { status: 502 });
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') || '');
  const start = m ? +m[1] : 0;
  if (start >= f.total) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + f.total } });
  await f.until(() => f.have > start);                       // attend que le début de la plage soit arrivé
  if (f.have <= start) return new Response('', { status: 502 });
  const want = m && m[2] !== '' ? Math.min(+m[2], f.total - 1) : f.total - 1;
  const end = Math.min(want, f.have - 1, start + 4 * 1024 * 1024 - 1);   // ce qui est déjà là (4 Mo max par réponse)
  const body = f.buf.subarray(start, end + 1);
  return new Response(body, { status: 206, headers: {
    'Content-Type': f.mime, 'Content-Length': String(body.length), 'Content-Range': 'bytes ' + start + '-' + end + '/' + f.total, 'Accept-Ranges': 'bytes'
  } });
}

module.exports = { getAudioUrl, reset, dispose, streamUserAgent, handleStream, _setResolver: (fn) => { resolveUrl = fn; } };
