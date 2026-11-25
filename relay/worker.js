// Relais YouTube pour Sonora — à déployer sur Cloudflare Workers (gratuit). Voir relay/README.md.
// La clé YouTube reste secrète sur le serveur : les utilisateurs de l'appli n'ont rien à configurer.
// - une même recherche n'est payée qu'une fois pour TOUS les utilisateurs du monde (mémoire partagée KV, si elle est branchée) ;
// - 60 recherches non déjà en cache par heure et par adresse IP, pour protéger ton quota.
// Les règles de l'API YouTube interdisent de conserver ses données plus de 30 jours : la mémoire est donc limitée à 25 jours.

const MAX_PER_HOUR = 60;
const CACHE_SECONDS = 7 * 24 * 3600;      // cache local au serveur Cloudflare le plus proche
const KV_SECONDS = 25 * 24 * 3600;        // mémoire partagée (KV), toujours sous la limite des 30 jours
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...HEADERS, ...extra } });


// ---------- Comptes Sonora (facultatif, nécessite la mémoire KV « CACHE ») ----------
// Un compte = pseudo + e-mail + mot de passe. Le mot de passe n'est jamais stocké : seulement une empreinte PBKDF2 salée.
// L'e-mail n'est stocké que sous forme d'empreinte (SHA-256) : il sert d'identifiant de connexion, on ne peut pas le relire.
// Les données (titres aimés, playlists, réglages…) sont sauvegardées pour être retrouvées après une réinstallation.
const enc = new TextEncoder();
const toB64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha = async (s) => toB64(await crypto.subtle.digest('SHA-256', enc.encode(s))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
const hashPw = async (pw, salt) => {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return toB64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256));
};
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const NAME_RE = /^[\p{L}\p{N}_.\- ]{3,24}$/u, MAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MAX_AVATAR = 4200000, MAX_DATA = 12 * 1024 * 1024, TOKEN_TTL = 120 * 24 * 3600;

async function newSession(env, id) {
  const raw = crypto.getRandomValues(new Uint8Array(32)), token = toB64(raw).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
  await env.CACHE.put('acct:t:' + await sha(token), id, { expirationTtl: TOKEN_TTL });
  return token;
}
const userOf = (u, id) => ({ id, name: u.name, color: u.color || null, hasAv: !!u.hasAv });

async function account(request, env, url) {
  if (!env.CACHE) return json({ error: 'no_storage' }, 501);
  const route = url.pathname.slice('/auth/'.length);
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const sessionId = async () => bearer ? env.CACHE.get('acct:t:' + await sha(bearer)) : null;
  let body = {};
  let rawBody = '';
  if (request.method === 'POST' || request.method === 'PUT') {
    const txt = await request.text();
    if (route === 'avatar') rawBody = txt;                   // la photo (GIF compris) arrive brute : pas de JSON, pour rester léger
    else {
      if (txt.length > MAX_DATA + 200000) return json({ error: 'too_big' }, 413);
      try { body = JSON.parse(txt || '{}'); } catch { return json({ error: 'bad_json' }, 400); }
    }
  }

  if (route === 'register' || route === 'login') {          // limite : 20 essais par heure et par adresse IP
    const rk = 'acct:rl:' + await sha(ip) + ':' + Math.floor(Date.now() / 3600000);
    const n = parseInt((await env.CACHE.get(rk)) || '0', 10) || 0;
    if (n >= 20) return json({ error: 'rate_limited' }, 429);
    await env.CACHE.put(rk, String(n + 1), { expirationTtl: 3700 });
  }

  if (route === 'register') {
    const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase(), pw = String(body.password || '');
    if (!NAME_RE.test(name)) return json({ error: 'bad_name' }, 400);
    if (!MAIL_RE.test(email)) return json({ error: 'bad_email' }, 400);
    if (pw.length < 8 || pw.length > 128) return json({ error: 'bad_password' }, 400);
    const ek = 'acct:e:' + await sha(email), nk = 'acct:n:' + await sha(name.toLowerCase());
    if (await env.CACHE.get(ek)) return json({ error: 'email_taken' }, 409);
    if (await env.CACHE.get(nk)) return json({ error: 'name_taken' }, 409);
    const id = toB64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, 'x'), salt = crypto.getRandomValues(new Uint8Array(16));
    const u = { name, salt: toB64(salt), hash: await hashPw(pw, salt), color: body.color || null, hasAv: false, eh: await sha(email), created: Date.now() };
    await env.CACHE.put('acct:u:' + id, JSON.stringify(u));
    await env.CACHE.put(ek, id); await env.CACHE.put(nk, id);
    return json({ token: await newSession(env, id), user: userOf(u, id) });
  }

  if (route === 'login') {
    const ident = String(body.identifier || '').trim().toLowerCase(), pw = String(body.password || '');
    if (!ident || !pw || pw.length > 128) return json({ error: 'bad_credentials' }, 401);
    const id = await env.CACHE.get(ident.includes('@') ? 'acct:e:' + await sha(ident) : 'acct:n:' + await sha(ident));
    const raw = id ? await env.CACHE.get('acct:u:' + id) : null;
    const u = raw ? JSON.parse(raw) : null;
    const h = await hashPw(pw, u ? fromB64(u.salt) : new Uint8Array(16));   // même durée que le compte existe ou non
    if (!u || !same(h, u.hash)) return json({ error: 'bad_credentials' }, 401);
    const data = await env.CACHE.get('acct:d:' + id);
    return json({ token: await newSession(env, id), user: userOf(u, id), data: data ? JSON.parse(data) : null });
  }

  const id = await sessionId();
  if (!id) return json({ error: 'unauthorized' }, 401);

  if (route === 'data' && request.method === 'GET') {
    const data = await env.CACHE.get('acct:d:' + id);
    return json({ data: data ? JSON.parse(data) : null });
  }
  if (route === 'data' && request.method === 'PUT') {
    const s = JSON.stringify(body.data || {});
    if (s.length > MAX_DATA) return json({ error: 'too_big' }, 413);
    await env.CACHE.put('acct:d:' + id, s);
    if (body.profile) {                                   // pseudo/couleur/photo suivent le compte
      const u = JSON.parse(await env.CACHE.get('acct:u:' + id));
      if (body.profile.color) u.color = String(body.profile.color).slice(0, 12);
      await env.CACHE.put('acct:u:' + id, JSON.stringify(u));
    }
    return json({ ok: true });
  }
  if (route === 'profile' && request.method === 'PUT') {   // pseudo, couleur, photo (GIF possible)
    const u = JSON.parse(await env.CACHE.get('acct:u:' + id) || 'null'); if (!u) return json({ error: 'unauthorized' }, 401);
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!NAME_RE.test(name)) return json({ error: 'bad_name' }, 400);
      if (name.toLowerCase() !== u.name.toLowerCase()) {
        const nk = 'acct:n:' + await sha(name.toLowerCase());
        const owner = await env.CACHE.get(nk);
        if (owner && owner !== id) return json({ error: 'name_taken' }, 409);
        await env.CACHE.delete('acct:n:' + await sha(u.name.toLowerCase())); await env.CACHE.put(nk, id);
      }
      u.name = name;
    }
    if (body.color) u.color = String(body.color).slice(0, 12);
    await env.CACHE.put('acct:u:' + id, JSON.stringify(u));
    return json({ user: userOf(u, id) });
  }
  if (route === 'avatar') {
    if (request.method === 'GET') {
      const a = await env.CACHE.get('acct:a:' + id);
      return a ? new Response(a, { headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } }) : json({ error: 'none' }, 404);
    }
    const u = JSON.parse(await env.CACHE.get('acct:u:' + id) || 'null'); if (!u) return json({ error: 'unauthorized' }, 401);
    if (request.method === 'PUT') {
      if (!/^data:image\/(png|jpe?g|gif|webp);base64,/.test(rawBody.slice(0, 40))) return json({ error: 'bad_image' }, 400);
      if (rawBody.length > MAX_AVATAR) return json({ error: 'too_big' }, 413);
      await env.CACHE.put('acct:a:' + id, rawBody); u.hasAv = true;
    } else { await env.CACHE.delete('acct:a:' + id); u.hasAv = false; }
    await env.CACHE.put('acct:u:' + id, JSON.stringify(u));
    return json({ ok: true });
  }
  if (route === 'logout') { if (bearer) await env.CACHE.delete('acct:t:' + await sha(bearer)); return json({ ok: true }); }
  if (route === 'delete') {                               // suppression définitive du compte
    const u = JSON.parse(await env.CACHE.get('acct:u:' + id) || 'null');
    if (u) { await env.CACHE.delete('acct:n:' + await sha(u.name.toLowerCase())); if (u.eh) await env.CACHE.delete('acct:e:' + u.eh); }
    await env.CACHE.delete('acct:u:' + id); await env.CACHE.delete('acct:d:' + id); await env.CACHE.delete('acct:a:' + id);
    await env.CACHE.delete('soc:f:' + id); await env.CACHE.delete('soc:p:' + id);
    if (bearer) await env.CACHE.delete('acct:t:' + await sha(bearer));
    return json({ ok: true });
  }
  if (route === 'social') return social(env, id, body);
  return json({ error: 'not_found' }, 404);
}

// ---------- Amis : demandes, liste, profil partagé ----------
// soc:f:<id> = { friends: [ids], in: [ids reçues], out: [ids envoyées] } ; soc:p:<id> = carte publique (ce que la personne choisit de montrer)
const MAX_FRIENDS = 300, MAX_CARD = 600000;
const getRel = async (env, id) => Object.assign({ friends: [], in: [], out: [] }, JSON.parse((await env.CACHE.get('soc:f:' + id)) || '{}'));
const putRel = (env, id, r) => env.CACHE.put('soc:f:' + id, JSON.stringify(r));
const without = (a, x) => a.filter((y) => y !== x);
const pub = async (env, id) => { const u = JSON.parse((await env.CACHE.get('acct:u:' + id)) || 'null'); return u ? { id, name: u.name, color: u.color || null, hasAv: !!u.hasAv } : null; };
async function social(env, me, body) {
  const op = String(body.op || ''), other = String(body.id || '');
  if (op === 'list') {
    const r = await getRel(env, me);
    const map = async (ids, card) => (await Promise.all(ids.slice(0, MAX_FRIENDS).map(async (x) => {
      const p = await pub(env, x); if (!p) return null;
      if (card) { const c = JSON.parse((await env.CACHE.get('soc:p:' + x)) || 'null'); p.discord = c && c.vis && c.vis.discord ? c.discord || null : null; p.listening = c && c.vis && c.vis.recent && c.recent && c.recent[0] ? c.recent[0] : null; }
      return p;
    }))).filter(Boolean);
    return json({ friends: await map(r.friends, true), incoming: await map(r.in), outgoing: await map(r.out) });
  }
  if (op === 'request') {
    const name = String(body.name || '').trim().toLowerCase(); if (!name) return json({ error: 'bad_name' }, 400);
    const to = await env.CACHE.get('acct:n:' + await sha(name));
    if (!to) return json({ error: 'not_found' }, 404);
    if (to === me) return json({ error: 'self' }, 400);
    const a = await getRel(env, me), b = await getRel(env, to);
    if (a.friends.includes(to)) return json({ ok: true, state: 'friends' });
    if (a.friends.length >= MAX_FRIENDS) return json({ error: 'too_many' }, 400);
    if (a.in.includes(to)) {                                       // elle m'avait déjà demandé : on devient amis tout de suite
      a.in = without(a.in, to); b.out = without(b.out, me); a.friends.push(to); b.friends.push(me);
      await putRel(env, me, a); await putRel(env, to, b); return json({ ok: true, state: 'friends' });
    }
    if (!a.out.includes(to)) a.out.push(to); if (!b.in.includes(me)) b.in.push(me);
    if (b.in.length > 200) b.in = b.in.slice(-200);
    await putRel(env, me, a); await putRel(env, to, b); return json({ ok: true, state: 'sent' });
  }
  if (op === 'accept' || op === 'decline' || op === 'cancel' || op === 'remove') {
    if (!other) return json({ error: 'bad_id' }, 400);
    const a = await getRel(env, me), b = await getRel(env, other);
    if (op === 'accept') { if (!a.in.includes(other)) return json({ error: 'no_request' }, 404); a.in = without(a.in, other); b.out = without(b.out, me); if (!a.friends.includes(other)) a.friends.push(other); if (!b.friends.includes(me)) b.friends.push(me); }
    if (op === 'decline') { a.in = without(a.in, other); b.out = without(b.out, me); }
    if (op === 'cancel') { a.out = without(a.out, other); b.in = without(b.in, me); }
    if (op === 'remove') { a.friends = without(a.friends, other); b.friends = without(b.friends, me); }
    await putRel(env, me, a); await putRel(env, other, b); return json({ ok: true });
  }
  if (op === 'publish') {                                          // la carte publique : seulement ce que la personne a choisi de montrer
    const s = JSON.stringify(body.card || {}); if (s.length > MAX_CARD) return json({ error: 'too_big' }, 413);
    await env.CACHE.put('soc:p:' + me, s); return json({ ok: true });
  }
  if (op === 'view' || op === 'avatar') {                          // réservé aux amis
    const a = await getRel(env, me); if (!a.friends.includes(other)) return json({ error: 'not_friends' }, 403);
    if (op === 'avatar') { const av = await env.CACHE.get('acct:a:' + other); return json({ avatar: av || null }); }
    const c = JSON.parse((await env.CACHE.get('soc:p:' + other)) || 'null'), p = await pub(env, other);
    if (!p) return json({ error: 'not_found' }, 404);
    const v = (c && c.vis) || {};
    return json({ user: p, card: c ? { vis: v, discord: v.discord ? c.discord : null, stats: v.tops ? c.stats : null, artists: v.tops ? c.artists : null, tracks: v.tops ? c.tracks : null, recent: v.recent ? c.recent : null, playlists: v.playlists ? c.playlists : null, updated: c.updated } : null });
  }
  return json({ error: 'bad_op' }, 400);
}

// ---------- Passerelle pour la version web (iPhone) : un navigateur n'a pas le droit d'appeler ces sites directement (CORS) ----------
const PROXY_HOSTS = new Set(['api.deezer.com', 'lrclib.net', 'itunes.apple.com', 'rss.applemarketingtools.com', 'www.youtube.com', 'archive.org', 'api.jamendo.com', 'open.spotify.com', 'music.apple.com']);
const PCORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Expose-Headers': 'Content-Type' };
async function proxy(request, url) {
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method' }, 405);
  let t; try { t = new URL(url.searchParams.get('u') || ''); } catch { return json({ error: 'bad_url' }, 400); }
  if (t.protocol !== 'https:' || !PROXY_HOSTS.has(t.hostname)) return json({ error: 'host_not_allowed' }, 403);
  const h = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };
  const ct = request.headers.get('Content-Type'); if (ct && request.method === 'POST') h['Content-Type'] = ct;
  if (t.hostname === 'www.youtube.com') { h['Cookie'] = 'SOCS=CAI; CONSENT=YES+cb'; h['X-YouTube-Client-Name'] = '1'; h['X-YouTube-Client-Version'] = '2.20250101.00.00'; }
  let r; try { r = await fetch(t.toString(), { method: request.method, headers: h, body: request.method === 'POST' ? await request.text() : undefined, redirect: 'follow' }); } catch { return json({ error: 'upstream' }, 502); }
  return new Response(await r.arrayBuffer(), { status: r.status, headers: { ...PCORS, 'Content-Type': r.headers.get('Content-Type') || 'text/plain' } });
}

// ---------- Sonora Connect : les appareils d'un même compte se voient et se contrôlent ----------
// Un « Hub » (Durable Object) par compte : il ne garde rien, il relaie les messages entre les appareils connectés.
async function connect(request, env, url) {
  if (!env.CACHE || !env.HUB) return json({ error: 'no_hub' }, 501);
  if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'ws_only' }, 426);
  const t = url.searchParams.get('t') || '';
  const id = t ? await env.CACHE.get('acct:t:' + await sha(t)) : null;
  if (!id) return json({ error: 'unauthorized' }, 401);
  const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (url.searchParams.has('room') && room.length < 4) return json({ error: 'bad_room' }, 400);
  return env.HUB.get(env.HUB.idFromName(room ? 'jam:' + room : id)).fetch(request);
}

export class Hub {
  constructor(state) {
    this.state = state;
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) { /* ignoré */ }
  }
  open() { return this.state.getWebSockets().filter((w) => w.readyState === 1); }
  devs() {
    const list = this.open().map((w) => w.deserializeAttachment()).filter(Boolean);
    const m = JSON.stringify({ t: 'devs', list });
    for (const w of this.open()) { try { w.send(m); } catch (e) { /* ignoré */ } }
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('ws', { status: 426 });
    const u = new URL(request.url), id = (u.searchParams.get('id') || '').replace(/[^\w-]/g, '').slice(0, 24) || 'x';
    for (const w of this.state.getWebSockets()) {
      const a = w.deserializeAttachment();
      if (a && a.id === id) { try { w.close(1000, 'remplace'); } catch (e) { /* ignoré */ } }
    }
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id, name: (u.searchParams.get('name') || 'Appareil').slice(0, 40), kind: u.searchParams.get('kind') === 'phone' ? 'phone' : 'pc' });
    this.devs();
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 65536) return;
    let o; try { o = JSON.parse(msg); } catch (e) { return; }
    if (!o || ['state', 'cmd', 'handoff', 'xfer'].indexOf(o.t) < 0) return;
    const me = ws.deserializeAttachment() || {};
    o.from = me.id;
    const out = JSON.stringify(o);
    for (const w of this.open()) {
      if (w === ws) continue;
      const a = w.deserializeAttachment() || {};
      if (o.to && o.to !== a.id) continue;
      try { w.send(out); } catch (e) { /* ignoré */ }
    }
  }
  webSocketClose(ws, code) { try { ws.close(code && code !== 1005 ? code : 1000); } catch (e) { /* ignoré */ } this.devs(); }
  webSocketError() { this.devs(); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('Sonora relay : OK', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
    if (url.pathname.startsWith('/auth/')) return account(request, env, url);
    if (url.pathname === '/p') return proxy(request, url);
    if (url.pathname === '/connect') return connect(request, env, url);
    if (url.pathname !== '/yt') return json({ error: 'not_found' }, 404);

    const q = (url.searchParams.get('q') || '').trim().slice(0, 150);
    if (!q) return json({ error: 'missing_q' }, 400);
    if (!env.YT_KEY) return json({ error: 'missing_key' }, 500);

    const cache = caches.default;
    const cacheKey = new Request('https://cache.sonora.invalid/yt2?q=' + encodeURIComponent(q.toLowerCase()));
    const kvKey = 'yt2:' + q.toLowerCase().replace(/\s+/g, ' ');   // « yt2 » : résultats filtrés (lisibles dans l'appli)
    if (env.CACHE) {                                              // mémoire partagée entre tous les serveurs
      const kv = await env.CACHE.get(kvKey);
      if (kv) return new Response(kv, { status: 200, headers: { ...HEADERS, 'X-Cache': 'KV' } });
    }
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, { status: 200, headers: { ...HEADERS, 'X-Cache': 'HIT' } });

    // limite par adresse IP (approximative, sans stockage payant)
    const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
    const rlKey = new Request(`https://cache.sonora.invalid/rl/${encodeURIComponent(ip)}/${Math.floor(Date.now() / 3600000)}`);
    const rl = await cache.match(rlKey);
    const used = rl ? parseInt(await rl.text(), 10) || 0 : 0;
    if (used >= MAX_PER_HOUR) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '3600' });
    ctx.waitUntil(cache.put(rlKey, new Response(String(used + 1), { headers: { 'Cache-Control': 'max-age=3700' } })));

    // videoEmbeddable=true : seulement les vidéos que leur propriétaire autorise à lire dans une autre appli (sinon « ne peut pas être lue ici »)
    const s = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=20&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(env.YT_KEY));
    if (!s.ok) return json({ error: s.status === 403 ? 'quota' : 'youtube_' + s.status }, s.status === 403 ? 503 : 502);
    const sj = await s.json();
    const items = (sj.items || []).filter((i) => i.id && i.id.videoId);

    const dur = {};                                               // durées (1 unité de quota) : permet à l'appli de choisir la bonne vidéo
    try {
      const v = await fetch('https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=' + items.map((i) => i.id.videoId).join(',') + '&key=' + encodeURIComponent(env.YT_KEY));
      if (v.ok) for (const x of (await v.json()).items || []) {
        const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(x.contentDetails.duration || '');
        if (m) dur[x.id] = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
      }
    } catch { /* facultatif */ }

    const out = items.map((i) => ({
      videoId: i.id.videoId, title: i.snippet.title, artist: i.snippet.channelTitle,
      cover: (i.snippet.thumbnails && i.snippet.thumbnails.medium && i.snippet.thumbnails.medium.url) || '', duration: dur[i.id.videoId] || 0
    }));
    const body = JSON.stringify(out);
    if (out.length) {
      ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Cache-Control': 'public, max-age=' + CACHE_SECONDS } })));
      if (env.CACHE) ctx.waitUntil(env.CACHE.put(kvKey, body, { expirationTtl: KV_SECONDS }));
    }
    return new Response(body, { status: 200, headers: { ...HEADERS, 'X-Cache': 'MISS' } });
  }
};
