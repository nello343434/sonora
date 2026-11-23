/* Sonora mobile : remplace window.api (normalement fourni par Electron) par des versions qui marchent dans l'appli Android. */
(function () {
  const RELAY = 'https://sonora.akapzz007.workers.dev';
  const HOSTS = new Set(['api.jamendo.com', 'archive.org', 'www.googleapis.com', 'api.deezer.com', 'open.spotify.com', 'music.apple.com', 'rss.applemarketingtools.com', 'api.github.com']);
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), ms))]);
  // version web (iPhone, navigateur) : pas de moteur natif, donc les appels vers ces sites passent par le relais (qui ajoute les droits CORS)
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!NATIVE && !window.__sonoraNoProxy) {
    const PROXY = new Set(['api.deezer.com', 'lrclib.net', 'itunes.apple.com', 'rss.applemarketingtools.com', 'www.youtube.com', 'archive.org', 'api.jamendo.com', 'open.spotify.com', 'music.apple.com']);
    const of = window.fetch.bind(window);
    window.fetch = (u, o) => {
      try {
        const s = typeof u === 'string' ? u : (u && u.url) || '';
        if (/^https:\/\//.test(s) && s.indexOf(RELAY) !== 0 && PROXY.has(new URL(s).hostname)) {
          const n = Object.assign({}, o || {}), h = n.headers || {}, ct = h['Content-Type'] || h['content-type'];
          n.headers = ct ? { 'Content-Type': ct } : undefined;
          return of(RELAY + '/p?u=' + encodeURIComponent(s), n);
        }
      } catch (e) { /* on tente l'appel direct */ }
      return of(u, o);
    };
  }
  const none = async () => null, no = async () => false;
  const ls = { get: (k) => { try { return localStorage.getItem('sonora.db.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('sonora.db.' + k, v); } catch (e) { /* plein */ } } };
  const ua = {};   // les requêtes passent par le moteur natif (CapacitorHttp) : pas de blocage CORS

  // téléphone : la bibliothèque s'ouvre en liste (comme Spotify) tant que tu n'as pas choisi autre chose
  try { if (!localStorage.getItem('sonora.libui')) localStorage.setItem('sonora.libui', JSON.stringify({ view: 'list', filter: 'all', sort: 'recent' })); } catch (e) { /* ignoré */ }

  // recherche publique YouTube (même méthode que la version PC), via le moteur natif : pas de CORS
  const dur = (t) => (t && /^\d+(:\d{1,2}){1,2}$/.test(t) ? t.split(':').reduce((a, n) => a * 60 + (+n), 0) : 0);
  const txt = (o) => (o && (o.simpleText || (o.runs && o.runs.map((r) => r.text).join('')))) || '';
  const collect = (n, out, d = 0) => { if (!n || typeof n !== 'object' || d > 40) return; if (Array.isArray(n)) { n.forEach((x) => collect(x, out, d + 1)); return; } if (n.videoRenderer && n.videoRenderer.videoId) out.push(n.videoRenderer);
    // nouveau format de résultats YouTube (lockupViewModel)
    if (n.lockupViewModel && /^[\w-]{11}$/.test(String(n.lockupViewModel.contentId || '')) && /VIDEO/.test(String(n.lockupViewModel.contentType || 'VIDEO'))) {
      const L = n.lockupViewModel, M = (L.metadata && L.metadata.lockupMetadataViewModel) || {}, found = [];
      const walk = (x, dd) => { if (!x || typeof x !== 'object' || dd > 30) return; if (typeof x.text === 'string' && /^\d+(:\d{1,2}){1,2}$/.test(x.text.trim())) found.push(x.text.trim()); for (const k in x) walk(x[k], dd + 1); };
      walk(L.contentImage, 0);
      let owner = ''; try { owner = M.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[0].text.content || ''; } catch (e) { /* ignoré */ }
      out.push({ videoId: L.contentId, title: { simpleText: (M.title && M.title.content) || '' }, lengthText: { simpleText: found[0] || '' }, ownerText: { simpleText: owner } });
    }
    for (const k in n) if (k !== 'videoRenderer') collect(n[k], out, d + 1); };
  // 2e méthode : la page de résultats YouTube (le cookie évite l'écran de consentement européen)
  async function htmlSearch(q) {
    const res = await timeout(fetch('https://www.youtube.com/results?hl=en&gl=BE&sp=EgIQAQ%253D%253D&search_query=' + encodeURIComponent(q), { headers: { 'Cookie': 'SOCS=CAI; CONSENT=YES+cb', 'Accept-Language': 'en-US,en;q=0.9' } }), 10000);
    if (!res.ok) throw new Error('PUBLIC_HTML_' + res.status);
    const h = await res.text(), i = h.indexOf('ytInitialData = ');
    if (i < 0) throw new Error('PUBLIC_HTML_NODATA');
    let j = null; try { const st = h.indexOf('{', i), en = h.indexOf(';</script>', st); j = JSON.parse(h.slice(st, en)); } catch (e) { throw new Error('PUBLIC_HTML_JSON'); }
    return packRaw(j);
  }
  async function innerTube(q) {
    const res = await timeout(fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': '2.20250101.00.00', 'Cookie': 'SOCS=CAI; CONSENT=YES+cb' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en', gl: 'US' } }, query: q, params: 'EgIQAQ==' })
    }), 9000);
    if (!res.ok) throw new Error('PUBLIC_INNERTUBE_' + res.status);
    const j = JSON.parse(await res.text());
    return packRaw(j);
  }
  function packRaw(j) {
    const raw = [], seen = new Set(), out = [];
    collect(j, raw);
    for (const v of raw) {
      const id = String(v.videoId || ''), d = dur(txt(v.lengthText));
      if (!/^[\w-]{11}$/.test(id) || seen.has(id) || !d) continue;
      seen.add(id);
      out.push({ id: 'y:' + id, videoId: id, title: txt(v.title).slice(0, 200), artist: txt(v.ownerText || v.longBylineText || v.shortBylineText).slice(0, 120), cover: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg', duration: d, source: 'youtube' });
      if (out.length >= 20) break;
    }
    if (!out.length) throw new Error('PUBLIC_EMPTY');
    return out;
  }

  // galerie du téléphone : sélecteur de fichier natif
  const pickImg = () => new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    let done = false; const fin = (v) => { if (done) return; done = true; res(v); setTimeout(() => i.remove(), 500); };
    i.onchange = () => { const f = i.files && i.files[0]; if (!f) return fin(null); const r = new FileReader(); r.onload = () => fin(typeof r.result === 'string' && r.result.startsWith('data:image') && r.result.length > 200 ? r.result : null); r.onerror = () => fin(null); r.readAsDataURL(f); };
    i.addEventListener('cancel', () => fin(null));
    document.body.appendChild(i); i.click();
  });

  // ---- fichiers audio du téléphone (import dans « Ma musique ») : stockés dans la mémoire de l'appli (IndexedDB)
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sonora-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbPut = async (k, blob) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('f', 'readwrite'); tx.objectStore('f').put(blob, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); };
  const idbGet = async (k) => { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('f').objectStore('f').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  const fileUrls = {};
  const fileURL = async (k) => { if (fileUrls[k]) return fileUrls[k]; const b = await idbGet(k); if (!b) throw new Error('FILE_MISSING'); return (fileUrls[k] = URL.createObjectURL(b)); };
  async function readTags(file) {
    const out = {};
    try {
      const buf = new Uint8Array(await file.slice(0, 1536 * 1024).arrayBuffer());
      if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
        const ver = buf[3], sz = ((buf[6] & 127) << 21) | ((buf[7] & 127) << 14) | ((buf[8] & 127) << 7) | (buf[9] & 127);
        const end = Math.min(buf.length, 10 + sz);
        const dec = (a) => { if (!a.length) return ''; const e = a[0], d = a.subarray(1); try { return new TextDecoder(e === 0 ? 'iso-8859-1' : e === 1 ? 'utf-16' : e === 2 ? 'utf-16be' : 'utf-8').decode(d).replace(/\0/g, '').trim(); } catch (x) { return ''; } };
        let p = 10;
        while (p + 10 <= end) {
          const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
          const fs = ver === 4 ? ((buf[p + 4] & 127) << 21) | ((buf[p + 5] & 127) << 14) | ((buf[p + 6] & 127) << 7) | (buf[p + 7] & 127) : buf[p + 4] * 16777216 + (buf[p + 5] << 16) + (buf[p + 6] << 8) + buf[p + 7];
          if (fs <= 0 || p + 10 + fs > buf.length) break;
          const body = buf.subarray(p + 10, p + 10 + fs);
          if (id === 'TIT2') out.title = dec(body); else if (id === 'TPE1') out.artist = dec(body); else if (id === 'TALB') out.album = dec(body);
          else if (id === 'APIC' && !out.pic) {
            const enc = body[0]; let i = 1; while (i < body.length && body[i] !== 0) i++; i += 2;
            if (enc === 0 || enc === 3) { while (i < body.length && body[i] !== 0) i++; i++; } else { while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2; i += 2; }
            if (i < body.length) out.pic = body.slice(i);
          }
          p += 10 + fs;
        }
      }
    } catch (e) { /* pas de tags : on utilisera le nom du fichier */ }
    return out;
  }
  async function smallCover(bytes) {
    try {
      const bmp = await createImageBitmap(new Blob([bytes])), S0 = 160, c = document.createElement('canvas'); c.width = c.height = S0;
      const m = Math.min(bmp.width, bmp.height), sx = (bmp.width - m) / 2, sy = (bmp.height - m) / 2;
      c.getContext('2d').drawImage(bmp, sx, sy, m, m, 0, 0, S0, S0); return c.toDataURL('image/jpeg', 0.72);
    } catch (e) { return ''; }
  }
  const audioDur = (url) => new Promise((res) => { const a = new Audio(); a.preload = 'metadata'; let d = false; const fin = (v) => { if (d) return; d = true; a.src = ''; res(v); }; a.onloadedmetadata = () => fin(isFinite(a.duration) ? Math.round(a.duration) : 0); a.onerror = () => fin(0); setTimeout(() => fin(0), 4000); a.src = url; });
  const pickAudio = () => new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus'; i.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    let done = false; const fin = (v) => { if (done) return; done = true; res(v); setTimeout(() => i.remove(), 500); };
    i.onchange = async () => {
      const files = [...(i.files || [])], out = [];
      for (const f of files) {
        try {
          const id = 'f:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          const tg = await readTags(f);
          const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '), sp = /^(.+?)\s+[-–]\s+(.+)$/.exec(base);
          await idbPut(id, f);
          const url = await fileURL(id);
          out.push({ id, fileId: id, title: tg.title || (sp ? sp[2] : base), artist: tg.artist || (sp ? sp[1] : 'Fichier audio'), album: tg.album || '', duration: await audioDur(url), image: tg.pic ? await smallCover(tg.pic) : '', source: 'local', src: url });
        } catch (e) { /* fichier illisible : ignoré */ }
      }
      fin(out);
    };
    i.addEventListener('cancel', () => fin([]));
    document.body.appendChild(i); i.click();
  });

  window.api = {
    isMobile: true,
    fetchJson: async (url) => {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw new Error('Hôte non autorisé');
      const res = await timeout(fetch(url, { headers: ua }), 9000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (e) { return { __text: txt }; }
    },
    ytSearch: async (q) => {
      // 1) ton relais (clé YouTube) ; 2) si quota épuisé / erreur : recherche publique YouTube directement depuis le téléphone
      try {
        let res = await timeout(fetch(RELAY + '/yt?q=' + encodeURIComponent(q)), 9000);
        if (res.status >= 500) { await new Promise((r) => setTimeout(r, 700)); res = await timeout(fetch(RELAY + '/yt?q=' + encodeURIComponent(q)), 9000); }   // une erreur serveur passagère : on réessaie une fois
        if (!res.ok) throw new Error('RELAY_' + res.status);
        const list = JSON.parse(await res.text());
        if (!Array.isArray(list)) throw new Error('RELAY_FORMAT');
        const out = list.slice(0, 20).filter((v) => v && /^[\w-]{11}$/.test(String(v.videoId))).map((v) => ({
          id: 'y:' + v.videoId, videoId: v.videoId, title: String(v.title || '').slice(0, 200), artist: String(v.artist || '').slice(0, 120),
          cover: typeof v.cover === 'string' && v.cover.startsWith('https://') ? v.cover : '',
          duration: Number.isFinite(+v.duration) && +v.duration > 0 ? +v.duration : undefined, source: 'youtube'
        }));
        if (out.length) return out;
        throw new Error('RELAY_EMPTY');
      } catch (e) {
        try { return await innerTube(q); } catch (e2) {
          try { return await htmlSearch(q); } catch (e3) { throw new Error(String(e && e.message || e) + ' + ' + String(e2 && e2.message || e2) + ' + ' + String(e3 && e3.message || e3)); }
        }
      }
    },
    openExternal: async (url) => { if (/^https:\/\//.test(url)) window.open(url, '_blank'); },
    // comptes Sonora (même relais que sur PC)
    acctAvailable: async () => true,
    acct: async (route, method, body, token) => {
      if (!/^[a-z]{3,10}$/.test(String(route))) return { status: 0, body: { error: 'bad_route' } };
      try {
        const m = ['GET', 'PUT', 'DELETE'].includes(method) ? method : 'POST';
        const res = await timeout(fetch(RELAY + '/auth/' + route, {
          method: m, headers: Object.assign({ 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
          body: m === 'GET' || m === 'DELETE' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body || {}))
        }), 15000);
        const txt = await res.text(); let j = {}; try { j = JSON.parse(txt); } catch (e) { /* texte brut (photo) */ }
        return { status: res.status, body: j, text: route === 'avatar' ? txt : undefined };
      } catch (e) { return { status: 0, body: { error: 'network' } }; }
    },
    // stockage
    dbGet: (k) => ls.get(k), dbSet: (k, v) => ls.set(k, v),
    appInfo: async () => ({ version: 'mobile', platform: 'android', electron: '', chrome: '', node: '' }),
    cacheInfo: async () => ({ size: 0, free: 0 }), cacheClear: async () => true, setCacheLimit: async () => true,
    // clé YouTube : le relais s'en occupe
    ytKeyStatus: async () => ({ pub: true, hasKey: false }), ytKeySave: no, ytKeyClear: no, ytPublicSet: no, ytPublicTest: no,
    // fonctions de bureau : sans objet sur téléphone
    pickFolder: none, pickFiles: pickAudio, fileURL, pickImage: pickImg, pickImageData: pickImg,
    winCmd: () => {}, winIsMax: no, onWinState: () => {},
    overlayConfig: none, overlayState: () => {}, onOverlayCmd: () => {},
    checkUpdate: async () => ({ ok: false, error: 'Mise à jour : télécharge le nouvel APK.' }), installUpdate: no, onUpdate: () => {},
    eqHost: none, onEqHost: () => {}, captureMode: none,
    scrapeImport: async () => { throw new Error('Import indisponible sur téléphone'); },
    rpcConfig: none, rpcLogin: none, rpcLogout: none, rpcGet: none, rpcActivity: none, onRpcStatus: () => {}
  };
})();
