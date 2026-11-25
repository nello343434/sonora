// ---- BotGuard (système anti-robot de Google) exécuté dans une fenêtre Chromium cachée ----
// Le programme BotGuard a besoin d'un vrai navigateur : on le fait tourner dans une BrowserWindow invisible,
// puis on garde la fonction de « frappe » (minter) vivante dans cette page pour fabriquer les PO Tokens.
const { BrowserWindow } = require('electron');

let win = null, winReady = null, generation = 0;

// normalise le défi tel que YouTube le renvoie (champs « privateDoNotAccessOrElse… » enveloppés)
function readChallenge(bg) {
  if (!bg || typeof bg !== 'object') throw new Error('Défi BotGuard absent');
  const url = (bg.interpreterUrl && bg.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue) || (typeof bg.interpreterUrl === 'string' ? bg.interpreterUrl : '');
  const js = (bg.interpreterJavascript && bg.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue) || (typeof bg.interpreterJavascript === 'string' ? bg.interpreterJavascript : '');
  if (!bg.program || !bg.globalName || (!url && !js)) throw new Error('Défi BotGuard incomplet');
  return { program: bg.program, globalName: bg.globalName, interpreterHash: bg.interpreterHash || '', interpreterUrl: url ? (url.startsWith('//') ? 'https:' + url : url) : '', interpreterJavascript: js };
}

function ensureWindow({ partition, userAgent, origin }) {
  if (win && !win.isDestroyed() && winReady) return winReady;
  win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false, devTools: false } });
  win.on('closed', () => { win = null; winReady = null; });
  if (userAgent) win.webContents.setUserAgent(userAgent);
  // une page légère de l'origine YouTube : BotGuard voit le bon « location » sans charger tout le site
  winReady = win.loadURL(origin + '/robots.txt').catch(() => win && !win.isDestroyed() && win.loadURL('about:blank')).then(() => win);
  winReady.catch(() => { winReady = null; });
  return winReady;
}

const run = (w, code) => w.webContents.executeJavaScript(code, true);

// challenge : résultat de readChallenge ; fetchIT(botguardResponse) -> { token, ttlSeconds? }
// opts : { fetchText(url) -> string, partition, userAgent, origin }
async function createMinter(challenge, fetchIT, opts) {
  const w = await ensureWindow(opts);
  const gen = ++generation;
  const interpreter = challenge.interpreterJavascript || await opts.fetchText(challenge.interpreterUrl);
  if (!interpreter) throw new Error('Interpréteur BotGuard introuvable');
  await run(w, 'delete window.__sonoraBg;');
  await run(w, interpreter + '\n;void 0;');

  const response = await run(w, `(async () => {
    const vm = window[${JSON.stringify(challenge.globalName)}];
    if (!vm || typeof vm.a !== 'function') throw new Error('VM BotGuard introuvable');
    const limit = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(new Error('BotGuard : délai dépassé (' + what + ')')), ms));
    const fns = await Promise.race([limit(10000, 'chargement'), new Promise((res) => {
      vm.a(${JSON.stringify(challenge.program)}, (asyncSnapshot, shutdown, passEvent, checkCamera) => res({ asyncSnapshot, shutdown, passEvent, checkCamera }), true, undefined, () => {}, [[], []]);
    })]);
    const webPoSignalOutput = [];
    const r = await Promise.race([limit(10000, 'instantané'), new Promise((res) => fns.asyncSnapshot(res, [undefined, undefined, webPoSignalOutput, undefined]))]);
    window.__sonoraBg = { gen: ${gen}, fns, webPoSignalOutput };
    return r;
  })()`);
  if (typeof response !== 'string' || !response) throw new Error('BotGuard n’a rien répondu');

  const it = await fetchIT(response);
  await run(w, `(async () => {
    const st = window.__sonoraBg;
    if (!st || st.gen !== ${gen}) throw new Error('Session BotGuard remplacée');
    const getMinter = st.webPoSignalOutput[0];
    if (typeof getMinter !== 'function') throw new Error('BotGuard : pas de générateur de jeton');
    let b = ${JSON.stringify(it.token)}.replace(/-/g, '+').replace(/_/g, '/').replace(/\\./g, '=');
    while (b.length % 4) b += '=';
    const mint = await getMinter(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    if (typeof mint !== 'function') throw new Error('BotGuard : jeton d’intégrité refusé');
    st.mint = mint;
    return true;
  })()`);

  const ttl = typeof it.ttlSeconds === 'number' && it.ttlSeconds > 0 ? it.ttlSeconds : 3600;
  return {
    expiresAt: Date.now() + Math.max(60, ttl - 300) * 1000,   // marge de 5 min avant l'expiration réelle
    minter: {
      async mintAsWebsafeString(identifier) {
        if (!win || win.isDestroyed()) throw new Error('Fenêtre BotGuard fermée');
        return run(win, `(async () => {
          const st = window.__sonoraBg;
          if (!st || st.gen !== ${gen} || !st.mint) throw new Error('Générateur BotGuard périmé');
          const out = await st.mint(new TextEncoder().encode(${JSON.stringify(String(identifier))}));
          if (!(out instanceof Uint8Array)) throw new Error('BotGuard : jeton invalide');
          let s = ''; for (const c of out) s += String.fromCharCode(c);
          return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_');
        })()`);
      }
    }
  };
}

function dispose() { const w = win; win = null; winReady = null; if (w && !w.isDestroyed()) { try { w.destroy(); } catch { /* ignoré */ } } }

module.exports = { readChallenge, createMinter, dispose };
