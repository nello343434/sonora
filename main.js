const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.opus', '.aac']);
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const ALLOWED_HOSTS = new Set(['api.jamendo.com', 'archive.org', 'www.googleapis.com', 'api.deezer.com', 'open.spotify.com', 'music.apple.com']);
// Clé YouTube Data API : jamais dans le code. Variable d'environnement SONORA_YT_KEY, ou fichier sonora.config.json
// (à la racine du projet ou dans le dossier de données de l'appli). Voir README.md.
function ytKey() {
  if (process.env.SONORA_YT_KEY) return process.env.SONORA_YT_KEY.trim();
  for (const f of [path.join(__dirname, 'sonora.config.json'), path.join(app.getPath('userData'), 'sonora.config.json')]) {
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    title: 'Sonora',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
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

ipcMain.handle('fetch-json', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('Hôte non autorisé');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);          // une requête qui ne répond pas ne bloque plus l'appli
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

ipcMain.handle('yt-search', async (_e, q) => {
  const key = ytKey();
  const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=20&q='
    + encodeURIComponent(q) + '&key=' + encodeURIComponent(key);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
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
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
// cache du navigateur dans le dossier temporaire de Windows (toujours accessible en écriture)
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('temp'), 'sonora-cache'));

app.whenReady().then(() => {
  if (!gotLock) return;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*'] },
    (d, cb) => {
      d.requestHeaders['Referer'] = 'https://sonora.app/';
      cb({ requestHeaders: d.requestHeaders });
    }
  );
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });