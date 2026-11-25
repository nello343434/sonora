// Sonora — recherche YouTube « sans clé » (NON OFFICIEL).
// Lit la page publique de résultats de YouTube et en extrait les vidéos. Aucun quota, aucune clé.
// ⚠ Contraire aux conditions d'utilisation de YouTube (accès automatisé hors API) et fragile : YouTube peut
//   changer sa page ou bloquer l'adresse IP à tout moment. L'appli ne l'utilise qu'en dernier recours
//   (après clé personnelle, puis relais). Désactivable : "publicSearch": false dans sonora.config.json.
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// « 3:45 » ou « 1:02:03 » -> secondes
function parseLength(s) {
  if (!s || !/^\d+(:\d{1,2}){1,2}$/.test(s)) return 0;
  return s.split(':').reduce((a, n) => a * 60 + (+n), 0);
}

// extrait l'objet JSON ytInitialData d'une page (en comptant les accolades, sans deviner la fin)
function extractData(html) {
  const marks = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];
  let i = -1, m = '';
  for (const k of marks) { i = html.indexOf(k); if (i >= 0) { m = k; break; } }
  if (i < 0) return null;
  let p = html.indexOf('{', i + m.length);
  if (p < 0) return null;
  let depth = 0, str = false, esc = false;
  for (let k = p; k < html.length; k++) {
    const c = html[k];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(p, k + 1)); } catch { return null; } }
  }
  return null;
}

// Nouveau format des résultats YouTube (« lockupViewModel ») : on le ramène à la forme de l'ancien videoRenderer
function findDuration(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return '';
  if (Array.isArray(node)) { for (const x of node) { const d = findDuration(x, depth + 1); if (d) return d; } return ''; }
  for (const k in node) {
    const v = node[k];
    if ((k === 'text' || k === 'content' || k === 'simpleText') && typeof v === 'string' && /^\d+(:\d{1,2}){1,2}$/.test(v.trim())) return v.trim();
    const d = findDuration(v, depth + 1); if (d) return d;
  }
  return '';
}
function fromLockup(l) {
  if (!l || !l.contentId || (l.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO')) return null;
  const md = (l.metadata && l.metadata.lockupMetadataViewModel) || {};
  const title = (md.title && (md.title.content || txt(md.title))) || '';
  let channel = '';
  try {
    const rows = md.metadata.contentMetadataViewModel.metadataRows || [];
    for (const r of rows) { for (const p of r.metadataParts || []) { const t = p.text && (p.text.content || txt(p.text)); if (t && !/vues|views|il y a|ago|^\d/.test(t)) { channel = t; break; } } if (channel) break; }
  } catch { /* pas de chaîne */ }
  return { videoId: l.contentId, title: { simpleText: title }, lengthText: { simpleText: findDuration(l.contentImage || l) }, ownerText: { simpleText: channel } };
}

function collect(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40) return;
  if (Array.isArray(node)) { for (const x of node) collect(x, out, depth + 1); return; }
  if (node.videoRenderer && node.videoRenderer.videoId) out.push(node.videoRenderer);
  if (node.lockupViewModel) { const v = fromLockup(node.lockupViewModel); if (v) out.push(v); }
  for (const k in node) if (k !== 'videoRenderer' && k !== 'lockupViewModel') collect(node[k], out, depth + 1);
}

// journal (terminal) quand YouTube répond sans aucune vidéo reconnue : quels blocs contient la réponse ?
function describe(j) {
  const seen = new Map();
  (function walk(n, d) {
    if (!n || typeof n !== 'object' || d > 30) return;
    if (Array.isArray(n)) { n.forEach((x) => walk(x, d + 1)); return; }
    for (const k in n) { if (/Renderer$|ViewModel$/.test(k)) seen.set(k, (seen.get(k) || 0) + 1); walk(n[k], d + 1); }
  })(j, 0);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => k + '×' + n).join(', ') || 'aucun bloc';
}

const txt = (o) => (o && (o.simpleText || (o.runs && o.runs.map((r) => r.text).join('')))) || '';

function parseResults(html) {
  const data = extractData(html);
  if (!data) return null;
  const raw = [];
  collect(data, raw);
  const seen = new Set(), out = [];
  for (const v of raw) {
    const id = String(v.videoId || '');
    if (!/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const dur = parseLength(txt(v.lengthText));
    if (!dur) continue;                                   // direct en cours, bande-annonce sans durée…
    out.push({
      id: 'y:' + id, videoId: id,
      title: txt(v.title).slice(0, 200),
      artist: txt(v.ownerText || v.longBylineText || v.shortBylineText).slice(0, 120),
      cover: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      duration: dur, source: 'youtube'
    });
    if (out.length >= 20) break;
  }
  return out;
}

const cache = new Map();
let blockedUntil = 0;

function toList(raw) {
  const seen = new Set(), out = [];
  for (const v of raw) {
    const id = String(v.videoId || '');
    if (!/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const dur = parseLength(txt(v.lengthText));
    if (!dur) continue;
    out.push({
      id: 'y:' + id, videoId: id,
      title: txt(v.title).slice(0, 200),
      artist: txt(v.ownerText || v.longBylineText || v.shortBylineText).slice(0, 120),
      cover: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      duration: dur, source: 'youtube'
    });
    if (out.length >= 20) break;
  }
  return out;
}

// Méthode 1 : l'API interne utilisée par le site web YouTube (JSON propre, pas de page de consentement).
// La clé ci-dessous est la clé publique intégrée au site YouTube lui-même, pas une clé personnelle.
const WEB_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
// version du site annoncée à YouTube : celle de youtubei.js si elle est installée (tenue à jour), sinon une version récente
let webVersion = '2.20260623.01.00';
import('youtubei.js').then((m) => { const v = m.Constants && m.Constants.CLIENTS && m.Constants.CLIENTS.WEB && m.Constants.CLIENTS.WEB.VERSION; if (v && v > webVersion) webVersion = v; }).catch(() => { /* pas installée */ });
async function viaInnerTube(q, fetchFn) {
  const res = await fetchFn('https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=' + WEB_KEY, {
    method: 'POST',
    signal: AbortSignal.timeout(7000),
    headers: {
      'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://www.youtube.com',
      'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': webVersion
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: webVersion, hl: 'en', gl: 'US' } },
      query: q, params: 'EgIQAQ=='
    })
  });
  if (res.status === 429) throw new Error('PUBLIC_BLOCKED');
  if (!res.ok) throw new Error('PUBLIC_INNERTUBE_' + res.status);
  let j; try { j = await res.json(); } catch { throw new Error('PUBLIC_INNERTUBE_JSON'); }
  const raw = []; collect(j, raw);
  const list = toList(raw);
  if (!list.length) console.log('[ytpublic] API : aucune vidéo reconnue (' + raw.length + ' brutes) — blocs :', describe(j));
  return list;
}

// Méthode 2 : la page de résultats (HTML) avec cookie de consentement.
async function viaHtml(q, fetchFn) {
  const res = await fetchFn('https://www.youtube.com/results?hl=en&gl=US&sp=EgIQAQ%253D%253D&search_query=' + encodeURIComponent(q), {
    signal: AbortSignal.timeout(7000),
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=PENDING+987' }
  });
  if (res.status === 429) throw new Error('PUBLIC_BLOCKED');
  if (!res.ok) throw new Error('PUBLIC_HTML_' + res.status);
  const html = await res.text();
  const list = parseResults(html);
  if (list === null) throw new Error('PUBLIC_FORMAT');
  if (!list.length) console.log('[ytpublic] page : aucune vidéo reconnue — blocs :', describe(extractData(html)));
  return list;
}

async function search(query, fetchFn = fetch) {
  const q = String(query || '').trim().slice(0, 150);
  if (!q) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600 * 1000) return hit.v;
  if (Date.now() < blockedUntil) throw new Error('PUBLIC_BLOCKED');
  let list = null, err = null;
  for (const m of [viaInnerTube, viaHtml]) {
    try { list = await m(q, fetchFn); if (list.length) break; }
    catch (e) {
      err = e;
      if (e.message === 'PUBLIC_BLOCKED') { blockedUntil = Date.now() + 10 * 60 * 1000; break; }
    }
  }
  if (!list || !list.length) throw err || new Error('PUBLIC_EMPTY');
  cache.set(key, { t: Date.now(), v: list });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return list;
}

module.exports = { search, parseResults, parseLength, extractData, toList, collect };
