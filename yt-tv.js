// ---- Session « YouTube TV » : PO Token + identifiants du client TV (Cobalt) ----
// Sert à interroger YouTube comme le ferait l'appli des téléviseurs connectés (moins de blocages « bot »).
// Tout passe par une session Chromium séparée, en mémoire : pas de cookies mélangés avec ceux de l'appli
// et pas d'en-tête Referer ajouté par le filtre de la fenêtre principale.
const { session } = require('electron');
const botguard = require('./botguard');

const ORIGIN = 'https://www.youtube.com';
const PARTITION = 'sonora-yt-tv';
const TV_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)';
const TV_API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';   // clé publique du client TV, embarquée dans la page youtube.com/tv

let cached = null, pending = null;
const ses = () => session.fromPartition(PARTITION);

function capture(source, pattern, label) {
  const m = pattern.exec(source);
  if (!m || !m[1]) throw new Error('La page YouTube TV ne contient pas : ' + label);
  return m[1].replace(/\\u003d/g, '=');
}

async function fetchText(url) {
  const res = await ses().fetch(url, { headers: { 'User-Agent': TV_USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' }, credentials: 'include', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(url.replace(ORIGIN, '') + ' a répondu ' + res.status);
  return res.text();
}

function readTvChallenge(config) {
  const requestKey = capture(config, /"challengeRequestKey":"(.*?)"/, 'clé de défi');
  const m = /"challengeParams":\{"R":"(.*?[^\\])","T"/s.exec(config);
  if (!m) throw new Error('La configuration YouTube TV ne contient pas de défi');
  const raw = JSON.parse(JSON.parse('{"r":"' + m[1] + '"}').r);
  return { requestKey, challenge: botguard.readChallenge(raw.bgChallenge) };
}

async function generateTvIntegrityToken(requestKey, botguardResponse) {
  const res = await ses().fetch(ORIGIN + '/api/jnn/v1/GenerateIT', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json+protobuf', 'x-goog-api-key': TV_API_KEY, 'User-Agent': TV_USER_AGENT },
    body: JSON.stringify([requestKey, botguardResponse]),
    credentials: 'include',
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('GenerateIT (TV) a répondu ' + res.status);
  const [token, ttlSeconds] = await res.json();
  if (typeof token !== 'string') throw new Error('GenerateIT (TV) n’a pas renvoyé de jeton');
  return typeof ttlSeconds === 'number' ? { token, ttlSeconds } : { token };
}

async function createSession() {
  // l'une après l'autre : la page /tv pose le cookie visiteur, la config le réutilise (une seule identité)
  const page = await fetchText(ORIGIN + '/tv');
  const config = await fetchText(ORIGIN + '/tv_config?action_get_config=true&client=lb4&theme=cl');
  const livingRoomPoTokenId = capture(page, /"LIVING_ROOM_PO_TOKEN_ID":"(.*?)"/, 'identifiant salon');
  const { requestKey, challenge } = readTvChallenge(config);
  const entry = await botguard.createMinter(challenge, (r) => generateTvIntegrityToken(requestKey, r),
    { fetchText, partition: PARTITION, userAgent: TV_USER_AGENT, origin: ORIGIN });
  const s = {
    poToken: await entry.minter.mintAsWebsafeString(livingRoomPoTokenId),
    livingRoomPoTokenId,
    visitorData: capture(page, /"visitorData":"(.*?)"/, 'visitorData'),
    clientVersion: capture(page, /"INNERTUBE_CLIENT_VERSION":"(.*?)"/, 'version du client'),
    playerId: capture(page, /\/s\/player\/([\w-]+)\//, 'identifiant du lecteur'),
    userAgent: TV_USER_AGENT
  };
  return { session: s, minter: entry.minter, expiresAt: entry.expiresAt };
}

// renvoie la session en cache tant qu'elle est valide ; les appels simultanés partagent la même création
async function getTvSession() {
  if (cached && Date.now() < cached.expiresAt) return cached.session;
  pending = pending || createSession()
    .then((next) => { cached = next; return next; })
    .finally(() => { pending = null; });
  return (await pending).session;
}

// PO Token lié à un contenu précis (ex. l'identifiant d'une vidéo), fabriqué avec le minter de la session en cours
async function mintFor(identifier) {
  await getTvSession();
  return cached.minter.mintAsWebsafeString(String(identifier));
}

// à appeler si YouTube refuse la session (403, « confirm you're not a bot »…) : la prochaine demande en recrée une
function invalidateTvSession() { cached = null; }

function dispose() { cached = null; botguard.dispose(); }

module.exports = { getTvSession, mintFor, invalidateTvSession, dispose, TV_USER_AGENT };
