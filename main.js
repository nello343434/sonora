const { app, BrowserWindow, ipcMain, dialog, shell, session, net, screen, globalShortcut, desktopCapturer, protocol } = require('electron');
const path = require('path');
const ytPublic = require('./ytpublic');
const ytTv = require('./yt-tv');
const ytStream = require('./yt-stream');
const DiscordRPC = require('./discord-rpc');
// adresse interne du flux audio YouTube (voir yt-stream.js) : lisible en continu, avec avance rapide, et autorisée par la
// règle de sécurité de la page (sinon « media-src * » ne couvre pas un schéma propre à l'appli)
protocol.registerSchemesAsPrivileged([{ scheme: 'sonora-yt', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } }]);
const fs = require('fs');
const { pathToFileURL } = require('url');

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.opus', '.aac']);
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const ALLOWED_HOSTS = new Set(['api.jamendo.com', 'archive.org', 'www.googleapis.com', 'api.deezer.com', 'open.spotify.com', 'music.apple.com', 'rss.applemarketingtools.com', 'api.github.com']);
// Clé YouTube Data API : jamais dans le code. Variable d'environnement SONORA_YT_KEY, ou fichier sonora.config.json
// (à la racine du projet ou dans le dossier de données de l'appli). Voir README.md.
function ytKey() {
  if (process.env.SONORA_YT_KEY) return process.env.SONORA_YT_KEY.trim();
  for (const f of [path.join(app.getPath('userData'), 'sonora.config.json'), path.join(__dirname, 'sonora.config.json')]) {
    try { const k = JSON.parse(fs.readFileSync(f, 'utf8')).youtubeApiKey; if (k && !/^colle/i.test(k)) return String(k).trim(); } catch { /* fichier absent ou illisible */ }
  }
  throw new Error('NO_YT_KEY');
}

function scan(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p, out, depth + 1);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

function toTrack(p) {
  const base = path.basename(p, path.extname(p)).replace(/_/g, ' ').trim();
  let artist = path.basename(path.dirname(p)) || 'Artiste inconnu';
  let title = base;
  const parts = base.split(' - ');
  if (parts.length >= 2) {
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }
  return { id: 'l:' + p, title, artist, src: pathToFileURL(p).href, source: 'local' };
}

let mainWin = null, ovlWin = null, ovlCfg = { on: false, pos: 'tc', key: 'Alt+Shift+O', onMin: true, top: true, opacity: 1 }, ovlState = {};
// ---- fenêtre sans cadre : boutons réduire / agrandir / fermer dessinés dans l'appli ----
ipcMain.on('win-cmd', (e, c) => { const w = BrowserWindow.fromWebContents(e.sender); if (!w) return; if (c === 'min') w.minimize(); else if (c === 'max') { w.isMaximized() ? w.unmaximize() : w.maximize(); } else if (c === 'close') w.close(); });
ipcMain.handle('win-is-max', (e) => { const w = BrowserWindow.fromWebContents(e.sender); return !!(w && w.isMaximized()); });
// ---- overlay : mini lecteur toujours au premier plan ----
let ovlForced = null, ovlKeyReg = '', ovlTimer = null, ovlHiding = false, ovlLoaded = false;
const OW = 330, OH = 70;
function ovlTarget() {
  const wa = screen.getPrimaryDisplay().workArea, g = 12, p = (ovlCfg.pos || 'tc');
  return { wa, x: p === 'tl' ? wa.x + g : p === 'tr' ? wa.x + wa.width - OW - g : Math.round(wa.x + (wa.width - OW) / 2), y: wa.y + g };
}
function placeOverlay() { if (!ovlWin || ovlTimer || ovlHiding) return; const t = ovlTarget(); ovlWin.setBounds({ x: t.x, y: t.y, width: OW, height: OH }); }
// l'overlay est visible : si « à la réduction » est actif, seulement quand Sonora est réduit ; sinon dès qu'il est activé. Le raccourci inverse l'état.
function ovlWanted() {
  if (!ovlCfg.on) return false;
  if (ovlForced !== null) return ovlForced;
  return ovlCfg.onMin ? !!(mainWin && (mainWin.isMinimized() || !mainWin.isVisible())) : true;
}
// animation : l'overlay « vole » depuis le bas jusqu'en haut. L'animation est jouée par la page de l'overlay (CSS, accélérée par la carte graphique,
// 60 images/s ou plus) : la fenêtre est seulement agrandie le temps du vol, jamais déplacée image par image.
const OTR = 280;
function flyOverlay(show, done) {
  if (!ovlWin || ovlWin.isDestroyed()) { if (done) done(); return; }
  if (ovlTimer) { clearTimeout(ovlTimer); ovlTimer = null; }
  const t = ovlTarget(), wc = ovlWin.webContents;
  if (show) {
    ovlHiding = false;
    ovlWin.setBounds({ x: t.x, y: t.y, width: OW, height: OH + OTR });
    try { ovlWin.setIgnoreMouseEvents(true); } catch { /* ignoré */ }
    wc.send('overlay-anim', 'prep');
    if (!ovlWin.isVisible()) ovlWin.showInactive();
    setTimeout(() => { if (ovlWin && !ovlWin.isDestroyed()) wc.send('overlay-anim', 'in'); }, 40);
    ovlTimer = setTimeout(() => { ovlTimer = null; if (!ovlWin || ovlWin.isDestroyed()) return; ovlWin.setBounds({ x: t.x, y: t.y, width: OW, height: OH }); try { ovlWin.setIgnoreMouseEvents(false); } catch { /* ignoré */ } if (done) done(); }, 700);
  } else {
    ovlHiding = true;
    try { ovlWin.setIgnoreMouseEvents(true); } catch { /* ignoré */ }
    wc.send('overlay-anim', 'out');
    ovlTimer = setTimeout(() => { ovlTimer = null; ovlHiding = false; if (ovlWin && !ovlWin.isDestroyed()) { ovlWin.hide(); ovlWin.setBounds({ x: t.x, y: t.y, width: OW, height: OH }); } if (done) done(); }, 300);
  }
}
function applyOverlay() {
  if (!ovlCfg.on) { if (ovlWin) { const w = ovlWin; ovlWin = null; if (ovlTimer) { clearTimeout(ovlTimer); ovlTimer = null; } try { w.close(); } catch { /* ignoré */ } } return; }
  if (!ovlWin) {
    ovlLoaded = false;
    ovlWin = new BrowserWindow({ width: OW, height: OH, frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: true, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false, webgl: false, devTools: false } });
    ovlWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
    ovlWin.webContents.on('did-finish-load', () => { ovlLoaded = true; if (ovlWin) { ovlWin.webContents.send('overlay-state', { ...ovlState, opacity: ovlCfg.opacity }); applyOverlay(); } });
    ovlWin.on('closed', () => { ovlWin = null; ovlLoaded = false; });
    return;
  }
  if (!ovlLoaded) return;
  try { ovlWin.setAlwaysOnTop(!!ovlCfg.top, 'screen-saver'); } catch { /* ignoré */ }
  const want = ovlWanted(), vis = ovlWin.isVisible() && !ovlHiding;
  if (want && !vis) flyOverlay(true);
  else if (!want && ovlWin.isVisible() && !ovlHiding) flyOverlay(false);
  else placeOverlay();
}
function ovlToggleKey() {
  if (!ovlCfg.on) return;
  ovlForced = !(ovlWin && ovlWin.isVisible() && !ovlHiding); applyOverlay();
}
function registerOvlKey() {
  try { if (ovlKeyReg) globalShortcut.unregister(ovlKeyReg); } catch { /* ignoré */ }
  ovlKeyReg = '';
  if (!ovlCfg.on || !ovlCfg.key) return;
  try { if (globalShortcut.register(ovlCfg.key, ovlToggleKey)) ovlKeyReg = ovlCfg.key; } catch { /* raccourci invalide ou déjà pris */ }
}
function syncOverlay() { applyOverlay(); registerOvlKey(); }
ipcMain.handle('overlay-config', (_e, c) => { const was = ovlCfg.onMin; ovlCfg = { ...ovlCfg, ...c }; if (c.reveal) ovlForced = true; if (was !== ovlCfg.onMin) ovlForced = null; syncOverlay(); if (ovlWin) ovlWin.webContents.send('overlay-state', { ...ovlState, opacity: ovlCfg.opacity }); return { ok: true, key: ovlKeyReg }; });
ipcMain.on('overlay-state', (_e, s) => { ovlState = s || {}; if (ovlWin && !ovlWin.isDestroyed()) ovlWin.webContents.send('overlay-state', { ...ovlState, opacity: ovlCfg.opacity }); });
ipcMain.on('overlay-cmd', (_e, c) => { if (mainWin) mainWin.webContents.send('overlay-cmd', c); });
// capture du son du système (loopback) pour que le fond du mode paroles réagisse à la musique : analysé en local, jamais enregistré
let capMode = 'system';
ipcMain.handle('capture-mode', (_e, m) => {
  capMode = m === 'yt' ? 'yt' : 'system';
  // sécurité : quand la capture n'est pas en cours, on s'assure que la fenêtre n'est jamais restée muette
  if (m === 'release') { try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.setAudioMuted(false); } catch (e) { /* ignoré */ } }
  return capMode;
});
app.whenReady().then(() => {
  try {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        if (capMode === 'yt' && mainWin && !mainWin.isDestroyed()) {
          // égaliseur : on capte uniquement le son de l'iframe YouTube (le son d'origine est coupé tant que la capture dure)
          const yf = mainWin.webContents.mainFrame.framesInSubtree.filter((f) => /youtube(-nocookie)?\.com/.test(f.url || ''));
          const fr = yf.find((f) => /\/embed\//.test(f.url)) || yf[yf.length - 1];
          if (fr) { callback({ video: request.frame, audio: fr }); return; }
          callback({}); return;
        }
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); callback({ video: sources[0], audio: 'loopback' });
      } catch (e) { callback({}); }
    });
  } catch (e) { /* version d'Electron sans cette API : le fond utilisera le battement doux */ }
});

// ---- égaliseur : fenêtre cachée qui égalise et rejoue le son capté de YouTube ----
let eqWin = null, eqIdle = null;
function ensureEqWin() {
  if (eqWin && !eqWin.isDestroyed()) return eqWin;
  eqWin = new BrowserWindow({ show: false, width: 300, height: 200, webPreferences: { preload: path.join(__dirname, 'eq-host-preload.js'), contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  eqWin.loadFile(path.join(__dirname, 'renderer', 'eq-host.html'));
  eqWin.on('closed', () => { eqWin = null; });
  return eqWin;
}
ipcMain.on('eq-host-status', (_e, o) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('eq-host-status', o); });
ipcMain.handle('eq-host', async (_e, cmd, payload) => {
  try {
    const w = ensureEqWin();
    if (w.webContents.isLoading()) await new Promise((r) => w.webContents.once('did-finish-load', r));
    const js = JSON.stringify(payload || null);
    if (cmd === 'start') {
      clearTimeout(eqIdle);
      capMode = 'yt';
      try { return await w.webContents.executeJavaScript('window.eqStart(' + js + ')', true); }
      finally { capMode = 'system'; }
    }
    if (cmd === 'gains') return await w.webContents.executeJavaScript('window.eqGains(' + js + ')', true);
    if (cmd === 'stop') {
      await w.webContents.executeJavaScript('window.eqStop()', true);
      clearTimeout(eqIdle); eqIdle = setTimeout(() => { try { if (eqWin && !eqWin.isDestroyed()) eqWin.close(); } catch (e) { /* ignoré */ } }, 45000);
      try { if (mainWin && !mainWin.isDestroyed()) setTimeout(() => { try { mainWin.webContents.setAudioMuted(false); } catch (e) { /* ignoré */ } }, 300); } catch (e) { /* ignoré */ }
      return true;
    }
  } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
});
// ---- mise à jour automatique (electron-updater + GitHub Releases) ----
// Dans l'appli installée : Sonora cherche, télécharge, puis propose « Redémarrer pour installer ».
// Sans electron-updater (lancement en développement), on se contente de comparer avec la dernière version publiée.
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true; autoUpdater.logger = null; } catch { autoUpdater = null; }
const sendUpd = (o) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-status', o); };
if (autoUpdater) {
  autoUpdater.on('update-available', (i) => sendUpd({ state: 'downloading', version: i.version, pct: 0 }));
  autoUpdater.on('update-not-available', () => sendUpd({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpd({ state: 'downloading', pct: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (i) => sendUpd({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => sendUpd({ state: 'error', error: String((e && e.message) || e).slice(0, 160) }));
}
const verNewer = (latest, cur) => { const n = (v) => String(v).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0), a = n(latest), b = n(cur); for (let i = 0; i < 3; i++) { if ((a[i] || 0) > (b[i] || 0)) return true; if ((a[i] || 0) < (b[i] || 0)) return false; } return false; };
ipcMain.handle('check-update', async () => {
  const cur = app.getVersion();
  if (autoUpdater && app.isPackaged) {
    try {
      const r = await autoUpdater.checkForUpdates();
      const latest = r && r.updateInfo && r.updateInfo.version;
      return { ok: true, auto: true, current: cur, latest, newer: !!latest && verNewer(latest, cur) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }
  try {
    const r = await net.fetch('https://api.github.com/repos/nello343434/sonora/releases/latest', { headers: { 'User-Agent': 'Sonora', Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return { ok: true, none: true };
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
    const j = await r.json(), latest = String(j.tag_name || '').replace(/^v/i, '');
    return { ok: true, latest, current: cur, newer: verNewer(latest, cur), url: j.html_url };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('update-install', () => { if (autoUpdater) { setImmediate(() => autoUpdater.quitAndInstall(false, true)); return true; } return false; });
app.whenReady().then(() => { if (autoUpdater && app.isPackaged) setTimeout(() => { autoUpdater.checkForUpdates().catch(() => { /* hors ligne */ }); }, 9000); });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    frame: false,
    autoHideMenuBar: true,
    title: 'Sonora',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false          // l'overlay et les paroles restent fluides même quand la fenêtre est réduite
    }
  });
  win.setMenuBarVisibility(false);
  mainWin = win;
  let closing = false;
  win.on('close', (e) => {
    if (closing || !ovlWin || !ovlWin.isVisible()) return;
    e.preventDefault(); closing = true;
    flyOverlay(false, () => { try { win.close(); } catch { /* ignoré */ } });
  });
  win.on('minimize', () => { ovlForced = null; applyOverlay(); });
  win.on('restore', () => { ovlForced = null; applyOverlay(); });
  win.on('show', () => { ovlForced = null; applyOverlay(); });
  win.on('maximize', () => win.webContents.send('win-state', true));
  win.on('unmaximize', () => win.webContents.send('win-state', false));
  win.on('closed', () => {
    mainWin = null;
    // ferme aussi les fenêtres cachées (overlay, égaliseur, BotGuard) : sinon le processus reste en vie et l'appli ne se rouvre plus
    for (const w of [ovlWin, eqWin]) { if (w && !w.isDestroyed()) { try { w.destroy(); } catch { /* ignoré */ } } }
    try { ytStream.dispose(); ytTv.dispose(); } catch { /* ignoré */ }
    try { if (eqIdle) clearTimeout(eqIdle); } catch { /* ignoré */ }
    app.quit();
    setTimeout(() => app.exit(0), 2500);   // filet de sécurité : on force l'arrêt si quelque chose bloque
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return [];
  return scan(r.filePaths[0]).map(toTrack);
});

ipcMain.handle('pick-files', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'opus', 'aac'] }]
  });
  if (r.canceled) return [];
  return r.filePaths.map(toTrack);
});

ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXT }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return pathToFileURL(r.filePaths[0]).href;
});

ipcMain.handle('pick-image-data', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: IMAGE_EXT }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0], buf = fs.readFileSync(f);
  if (buf.length > 20 * 1024 * 1024) throw new Error('Image trop lourde');
  const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
  return 'data:image/' + ext + ';base64,' + buf.toString('base64');
});

// import de playlists longues (Spotify / Apple Music) en faisant défiler la page publique dans une fenêtre invisible
ipcMain.handle('import-scrape', async (_e, svc, url) => { try { return { ok: true, tracks: await require('./import-scrape').scrape(svc, url) }; } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120) }; } });
ipcMain.handle('fetch-json', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('Hôte non autorisé');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);          // une requête qui ne répond pas ne bloque plus l'appli
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if ((res.headers.get('content-type') || '').includes('json')) return await res.json();
    return { __text: await res.text() };   // pages HTML (import Spotify / Apple Music)
  } finally { clearTimeout(timer); }
});

// Relais (facultatif) : un petit serveur qui garde la clé YouTube secrète pour les utilisateurs. Voir relay/README.md.
// Mets son adresse ici une fois déployé, ou dans sonora.config.json ("relayUrl"), ou dans la variable SONORA_RELAY_URL.
const DEFAULT_RELAY = 'https://sonora.akapzz007.workers.dev';
function relayUrl() {
  let u = (process.env.SONORA_RELAY_URL || '').trim();
  if (!u) {
    for (const f of [path.join(__dirname, 'sonora.config.json'), path.join(app.getPath('userData'), 'sonora.config.json')]) {
      try { const v = JSON.parse(fs.readFileSync(f, 'utf8')).relayUrl; if (v) { u = String(v).trim(); break; } } catch { /* absent */ }
    }
  }
  u = (u || DEFAULT_RELAY).replace(/\/+$/, '');
  return /^https:\/\/[^\s]+$/.test(u) ? u : '';
}
async function relaySearch(base, q) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(base + '/yt?q=' + encodeURIComponent(q), { signal: ctl.signal });
    if (!res.ok) throw new Error('RELAY_' + res.status);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('RELAY_FORMAT');
    return list.slice(0, 20).filter(v => v && /^[\w-]{11}$/.test(String(v.videoId))).map(v => ({
      id: 'y:' + v.videoId, videoId: v.videoId,
      title: String(v.title || '').slice(0, 200), artist: String(v.artist || '').slice(0, 120),
      cover: typeof v.cover === 'string' && v.cover.startsWith('https://') ? v.cover : '',
      duration: Number.isFinite(+v.duration) && +v.duration > 0 ? +v.duration : undefined, source: 'youtube'
    }));
  } finally { clearTimeout(timer); }
}

// ---- clé YouTube saisie dans l'appli (Apparence > Lecture des titres) : enregistrée dans le dossier de données de l'utilisateur ----
const userCfgPath = () => path.join(app.getPath('userData'), 'sonora.config.json');
function readUserCfg() { try { return JSON.parse(fs.readFileSync(userCfgPath(), 'utf8')); } catch { return {}; } }
function writeUserCfg(o) { fs.mkdirSync(path.dirname(userCfgPath()), { recursive: true }); fs.writeFileSync(userCfgPath(), JSON.stringify(o, null, 2)); }
// teste une clé auprès de Google (1 unité de quota) : { ok, error?, quota? }
async function checkYtKey(key) {
  if (!/^[\w-]{20,80}$/.test(key)) return { ok: false, error: 'format' };
  let res;
  try { res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(12000) }); }
  catch { return { ok: false, error: 'network' }; }
  if (res.ok) return { ok: true };
  let reason = '';
  try { const j = await res.json(); reason = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status)) || ''; } catch { /* corps illisible */ }
  if (res.status === 403 && /quota/i.test(reason)) return { ok: true, quota: true };            // clé valide, quota du jour atteint
  if (res.status === 400) return { ok: false, error: 'invalid' };
  if (res.status === 403) return { ok: false, error: 'api_disabled' };
  return { ok: false, error: 'http_' + res.status };
}
ipcMain.handle('yt-key-status', () => {
  let key = '', source = null;
  if (process.env.SONORA_YT_KEY) { key = process.env.SONORA_YT_KEY.trim(); source = 'env'; }
  else { try { key = ytKey(); source = 'file'; } catch { /* aucune clé */ } }
  return { has: !!key, source, tail: key ? key.slice(-4) : '', relay: !!relayUrl(), pub: publicSearchEnabled() };
});
ipcMain.handle('yt-key-save', async (_e, raw) => {
  const key = String(raw || '').trim();
  const r = await checkYtKey(key);
  if (r.ok) { const cfg = readUserCfg(); cfg.youtubeApiKey = key; writeUserCfg(cfg); }
  return r;
});
ipcMain.handle('yt-key-clear', () => { const cfg = readUserCfg(); delete cfg.youtubeApiKey; writeUserCfg(cfg); return true; });

// Lecture publique sans clé : active par défaut. Désactivable avec "publicSearch": false dans sonora.config.json ou SONORA_PUBLIC_SEARCH=0.
function publicSearchEnabled() {
  if (process.env.SONORA_PUBLIC_SEARCH === '0') return false;
  for (const f of [path.join(app.getPath('userData'), 'sonora.config.json'), path.join(__dirname, 'sonora.config.json')]) {
    try { const v = JSON.parse(fs.readFileSync(f, 'utf8')).publicSearch; if (typeof v === 'boolean') return v; } catch { /* absent */ }   // le réglage fait dans l'appli prime
  }
  return true;
}
ipcMain.handle('yt-public-set', (_e, on) => { const cfg = readUserCfg(); cfg.publicSearch = !!on; writeUserCfg(cfg); return !!on; });
ipcMain.handle('yt-public-test', async () => {
  try { const r = await ytPublic.search('daft punk get lucky', (u, o) => net.fetch(u, o)); return { ok: r.length > 0, count: r.length }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e).replace(/^Error: /, '') }; }
});
// ---- session « YouTube TV » (PO Token BotGuard) : voir yt-tv.js ----
// renvoie { ok, session: { poToken, livingRoomPoTokenId, visitorData, clientVersion, playerId, userAgent } } ou { ok: false, error }
ipcMain.handle('yt-tv-session', async (_e, opts) => {
  try {
    if (opts && opts.fresh) ytTv.invalidateTvSession();
    return { ok: true, session: await ytTv.getTvSession() };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
});
// YouTube a refusé la session (403, « confirm you're not a bot ») : la prochaine demande en fabrique une neuve
ipcMain.handle('yt-tv-reset', () => { ytTv.invalidateTvSession(); return true; });
// adresse audio directe d'une vidéo YouTube (voir yt-stream.js) : { ok, url, mime } ou { ok: false, error }
// Désactivé par défaut : le serveur vidéo de YouTube ne sert que le premier Mo sans attestation de l'appareil (403 ensuite).
// Pour réessayer : "directAudio": true dans sonora.config.json, ou la variable d'environnement SONORA_DIRECT_AUDIO=1.
function directAudioEnabled() {
  if (process.env.SONORA_DIRECT_AUDIO === '1') return true;
  return readUserCfg().directAudio === true;
}
ipcMain.handle('yt-audio', async (_e, videoId) => {
  if (!directAudioEnabled()) return { ok: false, error: 'audio direct désactivé' };
  try { const r = await ytStream.getAudioUrl(videoId); return { ok: true, url: 'sonora-yt://audio/' + videoId, direct: r.url, mime: r.mime, via: r.via }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 600) }; }
});
// l'adresse a été refusée pendant la lecture : on oublie les adresses et la session
ipcMain.handle('yt-audio-reset', () => { ytStream.reset(); return true; });
ipcMain.handle('app-info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform }));
ipcMain.handle('cache-info', async () => {
  let size = 0, free = 0;
  try { size = await session.defaultSession.getCacheSize(); } catch { /* ignoré */ }
  try { const st = fs.statfsSync(app.getPath('userData')); free = st.bavail * st.bsize; } catch { /* ignoré */ }
  return { size, free };
});
ipcMain.handle('cache-limit', (_e, bytes) => { try { fs.writeFileSync(path.join(app.getPath('userData'), 'cache-limit.json'), JSON.stringify({ bytes: Math.max(0, Number(bytes) || 0) })); return true; } catch { return false; } });
// ---------- comptes Sonora (via le relais) ----------
ipcMain.handle('acct-available', () => !!relayUrl());
ipcMain.handle('acct', async (_e, route, method, body, token) => {
  const base = relayUrl();
  if (!base) return { status: 0, body: { error: 'no_relay' } };
  if (!/^[a-z]{3,10}$/.test(String(route))) return { status: 0, body: { error: 'bad_route' } };
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await net.fetch(base + '/auth/' + route, {
      method: ['GET', 'PUT', 'DELETE'].includes(method) ? method : 'POST', signal: ctl.signal,
      headers: Object.assign({ 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: method === 'GET' || method === 'DELETE' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body || {}))
    });
    const txt = await res.text(); let j = {}; try { j = JSON.parse(txt); } catch { /* texte brut (photo) */ }
    return { status: res.status, body: j, text: route === 'avatar' ? txt : undefined };
  } catch { return { status: 0, body: { error: 'network' } }; } finally { clearTimeout(timer); }
});
ipcMain.handle('cache-clear', async () => { try { await session.defaultSession.clearCache(); return true; } catch { return false; } });

ipcMain.handle('yt-search', async (_e, q) => {
  let key = '';
  try { key = ytKey(); } catch { /* pas de clé personnelle : on essaie le relais */ }
  if (!key) {
    // 1) relais (si configuré)  2) lecture publique sans clé (non officiel)  3) sinon l'appli retombe sur les extraits 30 s
    const relay = relayUrl();
    if (relay) { try { return await relaySearch(relay, q); } catch { /* on tente la suite */ } }
    if (publicSearchEnabled()) return ytPublic.search(q, (u, o) => net.fetch(u, o));
    throw new Error('NO_YT_KEY');
  }
  const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=20&q='
    + encodeURIComponent(q) + '&key=' + encodeURIComponent(key);
  const res = await fetch(url);
  if (!res.ok) {
    // quota dépassé (403) ou clé refusée : on bascule sur la lecture publique plutôt que de couper la musique
    if (publicSearchEnabled()) { try { return await ytPublic.search(q, (u, o) => net.fetch(u, o)); } catch { /* erreur d'origine ci-dessous */ } }
    throw new Error('HTTP ' + res.status);
  }
  const j = await res.json();
  // durées (1 unité de quota) : sert à choisir la bonne vidéo pour un titre
  const dur = {};
  try {
    const ids = j.items.map(i => i.id.videoId).join(',');
    const vr = await fetch('https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=' + ids + '&key=' + encodeURIComponent(key));
    if (vr.ok) {
      const vj = await vr.json();
      for (const v of vj.items || []) {
        const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(v.contentDetails.duration || '');
        if (m) dur[v.id] = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
      }
    }
  } catch { /* durées facultatives */ }
  return j.items.map(i => ({
    id: 'y:' + i.id.videoId,
    videoId: i.id.videoId,
    title: i.snippet.title,
    artist: i.snippet.channelTitle,
    cover: i.snippet.thumbnails.medium.url,
    duration: dur[i.id.videoId],
    source: 'youtube'
  }));
});

ipcMain.handle('open-external', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

// une seule instance à la fois (évite les erreurs « Accès refusé » sur le cache)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  const w = mainWin && !mainWin.isDestroyed() ? mainWin : null;
  if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
});
// cache du navigateur dans le dossier temporaire de Windows (toujours accessible en écriture)
try { app.setAppUserModelId('com.perso.sonora'); } catch { /* hors Windows */ }
app.commandLine.appendSwitch('ignore-gpu-blocklist'); app.commandLine.appendSwitch('enable-gpu-rasterization'); app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024');   // plafond large : évite seulement les dérives de mémoire
app.commandLine.appendSwitch('disable-features', 'Translate,MediaRouter,OptimizationHints');   // services Chromium inutiles ici
try { const cl = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'cache-limit.json'), 'utf8')); if (cl.bytes > 0) app.commandLine.appendSwitch('disk-cache-size', String(Math.floor(cl.bytes))); } catch { /* pas de limite enregistrée */ }
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('temp'), app.isPackaged ? 'sonora-cache' : 'sonora-cache-dev'));

// ---- stockage disque (gros jeux de données : playlists de milliers de titres) ----
const dbDir = () => path.join(app.getPath('userData'), 'db');
const dbFile = (k) => path.join(dbDir(), String(k).replace(/[^a-z0-9._-]/gi, '_') + '.json');
const dbTimers = new Map(), dbPending = new Map();
function dbFlush(k) {
  const v = dbPending.get(k); if (v === undefined) return; dbPending.delete(k);
  try { fs.mkdirSync(dbDir(), { recursive: true }); const f = dbFile(k), tmp = f + '.tmp'; fs.writeFileSync(tmp, v); fs.renameSync(tmp, f); } catch (e) { console.error('db', e.message); }
}
ipcMain.on('db-get', (e, k) => { try { e.returnValue = dbPending.has(k) ? dbPending.get(k) : (fs.existsSync(dbFile(k)) ? fs.readFileSync(dbFile(k), 'utf8') : null); } catch { e.returnValue = null; } });
ipcMain.on('db-set', (_e, k, v) => { dbPending.set(k, v); clearTimeout(dbTimers.get(k)); dbTimers.set(k, setTimeout(() => dbFlush(k), 500)); });
app.on('before-quit', () => { for (const k of [...dbPending.keys()]) dbFlush(k); });

// ---- Discord Rich Presence ----
// ID de l'application Discord « Sonora » : à créer UNE SEULE FOIS par le développeur sur discord.com/developers,
// puis à coller ici. Les utilisateurs n'ont alors plus rien à saisir. (Surchargeable via SONORA_DISCORD_ID.)
const DISCORD_APP_ID = '1573371132139278376';
const discordId = () => (process.env.SONORA_DISCORD_ID || DISCORD_APP_ID || readUserCfg().discordClientId || '').trim();
const rpc = new DiscordRPC((st) => { BrowserWindow.getAllWindows().forEach((w) => { try { w.webContents.send('rpc-status', st); } catch { /* fenêtre fermée */ } }); });
ipcMain.handle('rpc-config', (_e, enabled, clientId) => { if (!DISCORD_APP_ID && !process.env.SONORA_DISCORD_ID && clientId !== undefined) { const cfg = readUserCfg(); cfg.discordClientId = String(clientId || '').trim(); writeUserCfg(cfg); } return rpc.configure(enabled, discordId()); });
ipcMain.handle('rpc-get', () => ({ clientId: discordId(), builtIn: !!(DISCORD_APP_ID || process.env.SONORA_DISCORD_ID), auth: readUserCfg().discordAuth || null, status: rpc.status() }));
ipcMain.handle('rpc-login', async (_e, clientId) => {
  const cfg = readUserCfg(); if (!DISCORD_APP_ID && !process.env.SONORA_DISCORD_ID && clientId) { cfg.discordClientId = String(clientId).trim(); writeUserCfg(cfg); }
  const id = discordId();
  if (!/^\d{15,22}$/.test(id)) return { ok: false, error: 'Connexion Discord indisponible dans cette version (ID d’application non configuré).' };
  rpc.configure(true, id);
  if (!rpc.ready) { try { await shell.openExternal('discord://'); } catch { /* ignoré */ } }
  if (!(await rpc.waitReady(30000))) return { ok: false, error: 'Impossible de joindre Discord. Vérifie qu’il est installé et connecté.' };
  const r = await rpc.authorize();
  if (!r.ok && !rpc.user) return r;
  // Discord n'a pas confirmé l'autorisation (fenêtre fermée, application sans adresse de redirection…) mais il est bien ouvert
  // avec un compte connecté : on lie ce compte (Discord nous l'a donné dans sa réponse de connexion locale).
  const note = r.ok ? '' : (r.cancelled ? 'Autorisation non confirmée dans Discord : compte lié via Discord ouvert.' : 'Autorisation Discord indisponible (' + (r.error || '?') + ') : compte lié via Discord ouvert.');
  cfg.discordAuth = { id: rpc.user && rpc.user.id, name: rpc.user && rpc.user.name, avatar: rpc.user && rpc.user.avatar, at: Date.now() }; writeUserCfg(cfg);
  return { ok: true, auth: cfg.discordAuth, status: rpc.status(), note };
});
ipcMain.handle('rpc-logout', () => { const cfg = readUserCfg(); delete cfg.discordAuth; writeUserCfg(cfg); rpc.setActivity(null); rpc.configure(false, discordId()); return true; });
ipcMain.handle('rpc-activity', (_e, a) => { rpc.setActivity(a); return true; });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* ignoré */ } });
app.on('before-quit', () => { try { rpc.stop(); } catch { /* ignoré */ } });
app.on('before-quit', () => { try { ytStream.dispose(); ytTv.dispose(); } catch { /* ignoré */ } });

app.whenReady().then(() => {
  if (!gotLock) return;
  try { protocol.handle('sonora-yt', (req) => ytStream.handleStream(req)); } catch (e) { console.error('sonora-yt', e.message); }
  // un seul écouteur par session : YouTube (Referer du lecteur intégré) et googlevideo (User-Agent du client qui a obtenu le flux)
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*', 'https://*.googlevideo.com/*'] },
    (d, cb) => {
      if (/^https:\/\/www\.youtube\.com\//.test(d.url)) d.requestHeaders['Referer'] = 'https://sonora.app/';
      else { const ua = ytStream.streamUserAgent(d.url); if (ua) d.requestHeaders['User-Agent'] = ua; }
      cb({ requestHeaders: d.requestHeaders });
    }
  );
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
