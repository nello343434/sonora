'use strict';
/* ───────────── utilitaires ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const fmt = s => { if (!isFinite(s) || s < 0) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const uid = () => Math.random().toString(36).slice(2, 10);

/* ───────────── état ───────────── */
const THEMES = { sombre: 'Sombre', clair: 'Clair', minuit: 'Minuit', foret: 'Forêt', sunset: 'Sunset', rose: 'Rose', oled: 'OLED noir' };
const ACCENTS = ['#7c9cff', '#9d7cff', '#ff7ac6', '#ff8a5c', '#ffd166', '#5fd39a', '#4dd0e1', '#ffffff'];
const PRESETS = {
  aurore: 'linear-gradient(135deg,#1d2671,#c33764)',
  ocean: 'linear-gradient(135deg,#0f2027,#2c5364)',
  braise: 'linear-gradient(135deg,#42275a,#734b6d)',
  foret: 'linear-gradient(135deg,#134e5e,#71b280)',
  brume: 'linear-gradient(135deg,#3a3d5c,#8e9eab)',
  nuit: 'linear-gradient(135deg,#000428,#004e92)'
};
const DEFAULTS = {
  theme: 'sombre', accent: null, bgType: 'none', bgPreset: 'aurore', bgImage: '', bgAnim: 'etoiles', animSpeed: 1,
  panelBlur: 18, bgBlur: 0, dim: 0.25, panelAlpha: 0.72, radius: 14, jamendoKey: ''
};
const SOURCE_NAMES = { archive: 'Archive', jamendo: 'Jamendo', youtube: 'YouTube' };

const S = {
  view: 'home', viewArg: null,
  settings: { ...DEFAULTS, ...load('sonora.settings', {}) },
  library: load('sonora.library', []),
  liked: load('sonora.liked', []),
  playlists: load('sonora.playlists', []),
  recent: load('sonora.recent', []),
  queue: [], qi: -1, shuffle: false, repeat: 0,
  searchSource: 'youtube', searchQ: '', searchRes: [], searching: false,
  libUI: { view: 'grid', filter: 'all', sort: 'recent', ...load('sonora.libui', {}) }, libQ: ''
};
let cur = { list: [] };
const audio = new Audio();
audio.volume = load('sonora.volume', 0.8);

const persist = () => {
  store('sonora.settings', S.settings); store('sonora.library', S.library);
  store('sonora.liked', S.liked); store('sonora.playlists', S.playlists);
  store('sonora.recent', S.recent);
};

/* ───────────── apparence ───────────── */
function applySettings() {
  const s = S.settings, root = document.documentElement;
  root.dataset.theme = s.theme;
  if (s.accent) { root.style.setProperty('--accent', s.accent); root.style.setProperty('--accent-text', '#0b0d12'); }
  else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-text'); }
  root.style.setProperty('--blur', s.panelBlur + 'px');
  root.style.setProperty('--pa', s.panelAlpha);
  root.style.setProperty('--radius', s.radius + 'px');
  const bg = $('#bg');
  let img = '';
  if (s.bgType === 'preset') img = PRESETS[s.bgPreset] || '';
  else if (s.bgType === 'image' && s.bgImage) img = 'url("' + s.bgImage.replace(/"/g, '%22') + '")';
  bg.style.backgroundImage = img;
  bg.style.filter = s.bgBlur ? `blur(${s.bgBlur}px)` : 'none';
  const anim = s.bgType === 'anim' && window.sonoraAnim;                 // fond animé (animated-bg.js)
  if (window.sonoraAnim) { window.sonoraAnim.speed(s.animSpeed); window.sonoraAnim.set(anim ? s.bgAnim : null); }
  $('#bg-dim').style.opacity = (img || anim) ? s.dim : 0;
}

/* ───────────── composants ───────────── */
function artStyle(t) { return t && t.image ? `style="background-image:url('${esc(t.image)}')"` : ''; }
const isLiked = t => S.liked.some(x => x.id === t.id);

/* petit égaliseur animé = « c'est ce titre que tu écoutes » */
const EQ = '<span class="eq"><i></i><i></i><i></i></span>';
const EQB = '<span class="eq-badge">' + EQ + '</span>';
const onNow = (t) => { const p = S.queue[S.qi]; return !!(p && t && sameTrack(p, t)); };

function trackRows(list, opts = {}) {
  cur.list = list;
  if (!list.length) return `<div class="empty">${opts.empty || 'Rien ici pour le moment.'}</div>`;
  const playing = S.queue[S.qi];
  return '<div class="tracks"><div class="track-head"><span>#</span><span></span><span>Titre</span><span>Artiste</span><span class="r">Durée</span><span></span><span></span></div>' + list.map((t, i) => `
    <div class="track ${onNow(t) ? 'playing' : ''}" data-i="${i}" data-act="play-row">
      <div class="num">${onNow(t) ? EQ : i + 1}</div>
      <div class="t-img" ${artStyle(t)}>${t.image ? '' : '♪'}</div>
      <div class="t-title">${esc(t.title)}${t.source !== 'local' ? `<span class="tag">${SOURCE_NAMES[t.source] || ''}</span>` : ''}</div>
      <div class="t-artist">${esc(t.artist)}</div>
      <div class="t-dur">${t.duration ? fmt(t.duration) : ''}</div>
      <button class="icon-btn ${isLiked(t) ? 'on' : ''}" data-act="like" data-i="${i}" title="J'aime">${isLiked(t) ? '♥' : '♡'}</button>
      <button class="icon-btn" data-act="more" data-i="${i}" title="Plus">⋯</button>
    </div>`).join('') + '</div>';
}

/* en-tête de page : pochette, type, titre, infos, boutons */
function totalTime(list) {
  const s = list.reduce((a, t) => a + (t.duration || 0), 0);
  if (!s) return '';
  return ' · ' + (s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.round(s % 3600 / 60) + ' min' : Math.max(1, Math.round(s / 60)) + ' min');
}
function headCover(list, glyph, cls = '') {
  const ims = list.map(t => t.image).filter(Boolean);
  if (ims.length >= 4) return `<div class="ph-cover mosaic">${ims.slice(0, 4).map(u => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>`;
  if (ims.length) return `<div class="ph-cover" style="background-image:url('${esc(ims[0])}')"></div>`;
  return `<div class="ph-cover ${cls}">${glyph}</div>`;
}
function pageHead(kind, title, list, cover, actions) {
  const back = kind === 'En cours' ? '' : '<div class="row" style="margin-bottom:10px"><button class="btn ghost small" data-act="goto" data-view="collection">← Bibliothèque</button></div>';
  return `${back}<div class="page-head">${cover}<div class="ph-info"><div class="ph-kind">${kind}</div><h1>${title}</h1>
    <div class="ph-meta">${list.length} titre${list.length > 1 ? 's' : ''}${totalTime(list)}</div></div></div>
    <div class="row ph-actions">${actions}</div>`;
}

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2600);
}

function showMenu(x, y, items) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => `<button data-mi="${i}">${esc(it.label)}</button>`).join('');
  m.classList.remove('hidden');
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  m.onclick = e => {
    const b = e.target.closest('[data-mi]'); if (!b) return;
    m.classList.add('hidden'); items[+b.dataset.mi].fn();
  };
}
document.addEventListener('click', e => { if (!e.target.closest('#menu') && !e.target.closest('[data-act="more"]')) $('#menu').classList.add('hidden'); });

function askText(title, placeholder, cb) {
  const m = $('#modal');
  m.innerHTML = `<div class="box"><h3>${esc(title)}</h3>
    <input class="text-input" id="modal-in" placeholder="${esc(placeholder)}">
    <div class="row" style="margin:16px 0 0;justify-content:flex-end">
      <button class="btn ghost small" id="modal-cancel">Annuler</button>
      <button class="btn small" id="modal-ok">Valider</button></div></div>`;
  m.classList.remove('hidden');
  const input = $('#modal-in'); input.focus();
  const close = () => m.classList.add('hidden');
  const ok = () => { const v = input.value.trim(); close(); if (v) cb(v); };
  $('#modal-ok').onclick = ok; $('#modal-cancel').onclick = close;
  input.onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') close(); };
}

/* ───────────── lecteur YouTube ───────────── */
let ytPlayer = null, ytReady = false, ytPending = null, ytPlaying = false;

function createYT() {
  ytPlayer = new YT.Player('yt-player', {
    width: 220, height: 220,
    playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
    events: {
      onReady: () => {
        ytReady = true;
        ytPlayer.setVolume(Math.round(audio.volume * 100));
        if (audio.muted) ytPlayer.mute();
        if (ytPending) { const t = ytPending; ytPending = null; ytPlayer.loadVideoById(t.videoId); }
      },
      onStateChange: e => {
        const st = e.data;
        if (st === 1) ytPlaying = true;
        else if (st === 2 || st === 0) ytPlaying = false;
        if (st === 0 && isYT()) {
          if (S.repeat === 2) { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); }
          else next(true);
        }
        updatePlayer();
      },
      onError: () => { ytPlaying = false; toast('Cette vidéo ne peut pas être lue ici.'); updatePlayer(); }
    }
  });
}
if (window.YT && window.YT.Player) createYT();
else window.onYouTubeIframeAPIReady = createYT;

setInterval(() => {
  if (!ytReady || !isYT()) return;
  const d = ytPlayer.getDuration() || 0, c = ytPlayer.getCurrentTime() || 0;
  const seek = $('#seek');
  if (!seek.dataset.drag && d) { seek.value = c / d * 1000; fill(seek); }
  $('#t-cur').textContent = fmt(c);
  $('#t-dur').textContent = fmt(d);
}, 500);

/* ───────────── lecteur ───────────── */
const isYT = () => { const t = S.queue[S.qi]; return !!(t && t.source === 'youtube'); };
const isPaused = () => isYT() ? !ytPlaying : audio.paused;
const curTime = () => isYT() ? (ytReady ? ytPlayer.getCurrentTime() || 0 : 0) : audio.currentTime;
const curDur = () => isYT() ? (ytReady ? ytPlayer.getDuration() || 0 : 0) : audio.duration;

async function resolveTrack(t) {
  if (t.src) return t;
  if (t.source === 'archive') {
    const meta = await window.api.fetchJson('https://archive.org/metadata/' + encodeURIComponent(t.rawId));
    const files = (meta.files || []).filter(f => /\.(mp3|ogg|flac)$/i.test(f.name));
    const f = files.find(f => /mp3/i.test(f.format || '')) || files[0];
    if (!f) throw new Error('Aucun fichier audio');
    t.src = 'https://archive.org/download/' + encodeURIComponent(t.rawId) + '/' + f.name.split('/').map(encodeURIComponent).join('/');
    if (f.length) t.duration = parseFloat(f.length) || t.duration;
  }
  return t;
}

/* même titre ? (même id, même vidéo, ou même titre + artiste) */
const tkey = (t) => ((t.title || '') + '|' + (t.artist || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9|]+/g, '');
const sameTrack = (a, b) => a.id === b.id || (a.videoId && a.videoId === b.videoId) || tkey(a) === tkey(b);

/* ───────────── file d'attente façon Spotify ─────────────
   S.queue = tous les titres ; S.qi = titre en cours ; un titre ajouté à la main porte _q = true.
   Ordre de lecture : titre en cours, puis les titres ajoutés (_q), puis la suite de la liste d'où ça vient. */
const qcopy = (t, q) => { const c = { ...t }; if (q) c._q = true; else delete c._q; return c; };
const shuffled = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const queuedEnd = () => { let i = S.qi + 1; while (i < S.queue.length && S.queue[i]._q) i++; return i; };
const queueChanged = () => { if (window.sonoraQueueUI) window.sonoraQueueUI(); };
function queueNext(t) {
  if (S.qi < 0 || !S.queue.length) { playFrom([t], 0, 'Lecture'); return; }
  S.queue.splice(S.qi + 1, 0, qcopy(t, true)); queueChanged(); toast('Lu ensuite');
}
function queueAdd(t) {
  if (S.qi < 0 || !S.queue.length) { S.queue.push(qcopy(t, true)); toast('Ajouté à la file d’attente'); queueChanged(); return; }
  S.queue.splice(queuedEnd(), 0, qcopy(t, true)); queueChanged(); toast('Ajouté à la file d’attente');
}
function setShuffle(on) {
  S.shuffle = on;
  const a = Math.max(S.qi + 1, 0), head = S.queue.slice(0, a), tail = S.queue.slice(a);
  const qd = tail.filter(t => t._q), ctx = tail.filter(t => !t._q);
  const order = S.ctxOrder || [];
  const out = on ? shuffled(ctx) : ctx.sort((x, y) => { const ix = order.indexOf(x), iy = order.indexOf(y); return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy); });
  S.queue = [...head, ...qd, ...out]; queueChanged();
}
function ctxLabel() {
  if (S.view === 'playlist') { const p = S.playlists.find(x => x.id === S.viewArg); return p ? p.name : 'Playlist'; }
  return { liked: 'Titres aimés', library: 'Ma musique', home: 'Écoutés récemment', search: 'Résultats de recherche', collection: 'Bibliothèque' }[S.view] || 'Lecture';
}

async function playIndex(i) {
  const t = S.queue[i]; if (!t) return;
  S.qi = i;
  try {
    if (t.source === 'youtube') {
      audio.pause();
      if (ytReady) ytPlayer.loadVideoById(t.videoId);
      else { ytPending = t; toast('Chargement du lecteur YouTube…'); }
    } else {
      ytPending = null; ytPlaying = false;
      if (ytReady) ytPlayer.stopVideo();
      await resolveTrack(t);
      audio.src = t.src;
      await audio.play();
    }
  } catch (e) {
    toast('Lecture impossible : ' + (e.message || 'erreur'));
  }
  S.recent = [qcopy(t, false), ...S.recent.filter(x => !sameTrack(x, t))].slice(0, 20); persist();   // le titre qu'on vient de lancer passe en tête
  updatePlayer(); refreshPlayingMarks();
  if (S.view === 'home') render();                                                       // la liste « Écoutés récemment » se réordonne tout de suite
}
function playFrom(list, i, name) {
  const base = list.map(t => qcopy(t, false));
  S.ctxOrder = base.slice(); S.ctxName = name || ctxLabel();
  if (S.shuffle && base.length > 1) { S.queue = [base[i], ...shuffled(base.filter((_, k) => k !== i))]; i = 0; }   // aléatoire : le titre cliqué d'abord, puis le reste mélangé
  else S.queue = base.slice();
  playIndex(i);
}
function next(auto) {
  if (!S.queue.length) return;
  let n;
  n = S.qi + 1;                                              // l'ordre aléatoire est déjà dans la file (voir setShuffle)
  if (n >= S.queue.length) { if (S.repeat === 1) n = 0; else if (auto) { updatePlayer(); return; } else n = S.queue.length - 1; }
  playIndex(n);
}
function prev() {
  if (curTime() > 3 || S.qi <= 0) {
    if (isYT()) { if (ytReady) ytPlayer.seekTo(0, true); } else audio.currentTime = 0;
    return;
  }
  playIndex(S.qi - 1);
}
function togglePlay() {
  const t = S.queue[S.qi];
  if (!t) { if (S.queue.length) playIndex(0); return; }
  if (isYT()) {
    if (!ytReady) return;
    ytPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    return;
  }
  if (!audio.src) { playIndex(Math.max(S.qi, 0)); return; }
  audio.paused ? audio.play() : audio.pause();
}

function fill(el) { const p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--fill', p + '%'); }
function updatePlayer() {
  const t = S.queue[S.qi];
  $('#np-title').textContent = t ? t.title : 'Rien en lecture';
  $('#np-artist').textContent = t ? t.artist : '';
  const art = $('#np-art'); art.style.backgroundImage = t && t.image ? `url('${t.image}')` : '';
  $('#np-like').textContent = t && isLiked(t) ? '♥' : '♡';
  $('#np-like').classList.toggle('on', !!(t && isLiked(t)));
  $('#btn-play').textContent = isPaused() ? '▶' : '⏸';
  document.body.classList.toggle('is-playing', !isPaused());      // fait bouger l'égaliseur seulement quand ça joue
  $('#btn-shuffle').classList.toggle('on', S.shuffle);
  $('#btn-repeat').classList.toggle('on', S.repeat > 0);
  $('#btn-repeat').textContent = S.repeat === 2 ? '⟲¹' : '⟲';
  if (t) document.title = t.title + ' · ' + t.artist; else document.title = 'Sonora';
  if ('mediaSession' in navigator && t) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, artwork: t.image ? [{ src: t.image }] : [] });
  }
}
function refreshPlayingMarks() {
  // listes de titres : l'égaliseur remplace le numéro du titre en cours
  document.querySelectorAll('#main .track').forEach(el => {
    const i = +el.dataset.i, t = cur.list[i], on = onNow(t);
    el.classList.toggle('playing', on);
    const num = el.querySelector('.num');
    if (num && on !== !!num.querySelector('.eq')) num.innerHTML = on ? EQ : String(i + 1);
  });
  // accueil : pastille sur la pochette
  document.querySelectorAll('#main .card[data-act="play-recent"]').forEach(el => {
    const on = onNow(S.recent[+el.dataset.i]), art = el.querySelector('.art'), b = el.querySelector('.eq-badge');
    el.classList.toggle('playing', on);
    if (on && !b && art) art.insertAdjacentHTML('beforeend', EQB);
    else if (!on && b) b.remove();
  });
  if (window.sonoraMarks) window.sonoraMarks();   // résultats de recherche
  queueChanged();                                  // panneau de la file d'attente
}

audio.addEventListener('play', updatePlayer);
audio.addEventListener('pause', updatePlayer);
audio.addEventListener('ended', () => { if (S.repeat === 2) { audio.currentTime = 0; audio.play(); } else next(true); });
audio.addEventListener('timeupdate', () => {
  if (isYT()) return;
  const seek = $('#seek');
  if (!seek.dataset.drag && audio.duration) { seek.value = audio.currentTime / audio.duration * 1000; fill(seek); }
  $('#t-cur').textContent = fmt(audio.currentTime);
});
audio.addEventListener('loadedmetadata', () => { if (!isYT()) $('#t-dur').textContent = fmt(audio.duration); });
audio.addEventListener('error', () => { if (audio.src && !isYT()) toast('Ce fichier ne peut pas être lu.'); });

$('#seek').addEventListener('input', e => { e.target.dataset.drag = '1'; fill(e.target); $('#t-cur').textContent = fmt(e.target.value / 1000 * curDur()); });
$('#seek').addEventListener('change', e => {
  delete e.target.dataset.drag;
  const d = curDur(); if (!d) return;
  const pos = e.target.value / 1000 * d;
  if (isYT()) { if (ytReady) ytPlayer.seekTo(pos, true); } else audio.currentTime = pos;
});
$('#volume').value = audio.volume * 100; fill($('#volume'));
$('#volume').addEventListener('input', e => {
  audio.volume = e.target.value / 100; fill(e.target); store('sonora.volume', audio.volume);
  if (ytReady) ytPlayer.setVolume(Math.round(audio.volume * 100));
  $('#btn-mute').textContent = audio.volume === 0 ? '🔇' : '🔊';
});
$('#btn-mute').onclick = () => {
  audio.muted = !audio.muted;
  if (ytReady) { audio.muted ? ytPlayer.mute() : ytPlayer.unMute(); }
  $('#btn-mute').textContent = audio.muted ? '🔇' : '🔊';
};
$('#btn-play').onclick = togglePlay;
$('#btn-next').onclick = () => next(false);
$('#btn-prev').onclick = prev;
$('#btn-shuffle').onclick = () => { setShuffle(!S.shuffle); updatePlayer(); };
$('#btn-repeat').onclick = () => { S.repeat = (S.repeat + 1) % 3; updatePlayer(); };
$('#btn-queue').onclick = () => { if (window.toggleQueuePanel) window.toggleQueuePanel(); };
$('#np-like').onclick = () => { const t = S.queue[S.qi]; if (t) { toggleLike(t); updatePlayer(); render(); } };

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', togglePlay);
  navigator.mediaSession.setActionHandler('pause', togglePlay);
  navigator.mediaSession.setActionHandler('nexttrack', () => next(false));
  navigator.mediaSession.setActionHandler('previoustrack', prev);
}
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); togglePlay(); }
});

/* ───────────── données ───────────── */
function toggleLike(t) {
  const i = S.liked.findIndex(x => x.id === t.id);
  if (i >= 0) S.liked.splice(i, 1); else S.liked.unshift(t);
  persist();
}
function addToPlaylist(pl, t) {
  if (pl.tracks.some(x => x.id === t.id)) return toast('Déjà dans « ' + pl.name + ' »');
  const c = { ...t, addedAt: Date.now() }; delete c._q;
  pl.tracks.push(c); persist(); renderPlaylists(); toast('Ajouté à « ' + pl.name + ' »');
}
function addToLibrary(tracks) {
  const known = new Set(S.library.map(t => t.id));
  const fresh = tracks.filter(t => !known.has(t.id));
  S.library.push(...fresh); persist();
  toast(fresh.length + ' titre(s) ajouté(s)');
}

async function searchJamendo(q) {
  const key = S.settings.jamendoKey;
  if (!key) throw new Error('NOKEY');
  const base = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(key)}&format=json&limit=40&audioformat=mp32&include=musicinfo`;
  const url = q ? base + '&search=' + encodeURIComponent(q) : base + '&order=popularity_week';
  const data = await window.api.fetchJson(url);
  return (data.results || []).map(r => ({
    id: 'j:' + r.id, title: r.name, artist: r.artist_name, duration: r.duration,
    src: r.audio, image: r.image, source: 'jamendo'
  }));
}
async function searchArchive(q) {
  const query = `(${q}) AND mediatype:(audio)`;
  const url = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(query) +
    '&fl[]=identifier&fl[]=title&fl[]=creator&rows=30&output=json&sort[]=downloads+desc';
  const data = await window.api.fetchJson(url);
  return (data.response?.docs || []).map(d => ({
    id: 'a:' + d.identifier, rawId: d.identifier, title: d.title || d.identifier,
    artist: Array.isArray(d.creator) ? d.creator.join(', ') : (d.creator || 'Internet Archive'),
    image: 'https://archive.org/services/img/' + d.identifier, source: 'archive'
  }));
}
async function searchYouTube(q) {
  const res = await window.api.ytSearch(q);
  const dec = document.createElement('textarea');
  const clean = s => { dec.innerHTML = s || ''; return dec.value; };
  return res.map(r => ({
    id: r.id, videoId: r.videoId, title: clean(r.title), artist: clean(r.artist),
    image: r.cover, source: 'youtube'
  }));
}

/* ───────────── navigation / vues ───────────── */
function go(view, arg = null) { S.view = view; S.viewArg = arg; render(); }

function renderPlaylists() {
  const likedBtn = `<button class="nav ${S.view === 'liked' ? 'active' : ''}" data-view="liked" title="Titres aimés"><i class="pl-cover liked">♥</i> <span>Titres aimés</span></button>`;
  $('#playlists').innerHTML = likedBtn + S.playlists.map(p => {
    const im = p.cover || (p.tracks.find(t => t.image) || {}).image;
    return `<button class="nav ${S.view === 'playlist' && S.viewArg === p.id ? 'active' : ''}" data-act="open-playlist" data-id="${p.id}" title="${esc(p.name)}">${im ? `<i class="pl-cover" style="background-image:url('${esc(im)}')"></i>` : '♪'} <span>${esc(p.name)}</span></button>`;
  }).join('');
}

function render() {
  const actView = (S.view === 'playlist' || S.view === 'library') ? 'collection' : S.view;
  document.querySelectorAll('.nav[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === actView));
  renderPlaylists();
  const main = $('#main');
  const v = VIEWS[S.view] || VIEWS.home;
  main.innerHTML = v();
  const si = $('#search-input'); if (si && document.activeElement !== si && si.value !== S.searchQ) si.value = S.searchQ;
  $('#tb-clear').classList.toggle('hidden', !S.searchQ);
  if (window.sonoraAfterRender) window.sonoraAfterRender();
  refreshPlayingMarks();
}

/* ───────────── bibliothèque (playlists, titres aimés, fichiers) ───────────── */
function libItems() {
  return [
    { id: 'liked', kind: 'playlist', view: 'liked', title: 'Titres aimés', sub: 'Playlist', tracks: S.liked, cls: 'liked', pinned: true },
    { id: 'local', kind: 'local', view: 'library', title: 'Ma musique', sub: 'Fichiers', tracks: S.library, glyph: '▤', pinned: true },
    ...S.playlists.map(p => ({ id: p.id, kind: 'playlist', view: 'playlist', arg: p.id, title: p.name, sub: 'Playlist', tracks: p.tracks, glyph: '♪', cover: p.cover }))
  ];
}
function libCover(it) {
  if (it.cover) return `<div class="lib-cover" style="background-image:url('${esc(it.cover)}')"></div>`;
  if (it.cls === 'liked') return '<div class="lib-cover liked"><svg viewBox="0 0 24 24" width="46%" height="46%" fill="#fff"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>';
  const ims = it.tracks.map(t => t.image).filter(Boolean);
  if (ims.length >= 4) return `<div class="lib-cover mosaic">${ims.slice(0, 4).map(u => `<i style="background-image:url('${esc(u)}')"></i>`).join('')}</div>`;
  if (ims.length) return `<div class="lib-cover" style="background-image:url('${esc(ims[0])}')"></div>`;
  return `<div class="lib-cover">${it.glyph}</div>`;
}
function libGrid() {
  const ui = S.libUI, q = S.libQ.trim().toLowerCase();
  let items = libItems().filter(it => ui.filter === 'all' || (ui.filter === 'playlists' && it.kind === 'playlist') || (ui.filter === 'local' && it.kind === 'local'));
  if (q) items = items.filter(it => it.title.toLowerCase().includes(q));
  const pinned = items.filter(i => i.pinned);
  let rest = items.filter(i => !i.pinned);
  rest = ui.sort === 'name' ? rest.sort((a, b) => a.title.localeCompare(b.title, 'fr')) : rest.reverse();
  items = [...pinned, ...rest];
  if (!items.length) return '<div class="empty">Aucun résultat.</div>';
  return items.map(it => `<div class="lib-card" data-act="lib-open" data-id="${esc(it.id)}">${libCover(it)}
    <button class="lib-play" data-act="lib-play" data-id="${esc(it.id)}" title="Lire">▶</button>
    <div class="lib-txt"><div class="lib-t">${esc(it.title)}</div><div class="lib-s">${it.sub} · ${it.tracks.length} titre${it.tracks.length > 1 ? 's' : ''}</div></div></div>`).join('');
}

const hello = () => { const h = new Date().getHours(); return h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir'; };

const VIEWS = {
  home() {
    const recent = S.recent.length ? `<h2>Écoutés récemment</h2><div class="cards">${S.recent.slice(0, 12).map((t, i) =>
      `<div class="card" data-act="play-recent" data-i="${i}"><button class="rm" data-act="remove-recent" data-i="${i}" title="Retirer des écoutés récemment">✕</button><div class="art" ${artStyle(t)}></div><div class="c-title">${esc(t.title)}</div><div class="c-sub">${esc(t.artist)}</div></div>`).join('')}</div>` : '';
    return `<h1>${hello()}</h1><p class="sub">Ta musique, sans pub, sans abonnement.</p>
      <div class="row">
        <button class="btn" data-act="add-folder">Ajouter un dossier</button>
        <button class="btn ghost" data-act="add-files">Ajouter des fichiers</button>
        <button class="btn ghost" data-act="goto" data-view="search">Découvrir de la musique</button>
      </div>${recent}
      ${S.library.length || S.recent.length ? '' : '<div class="empty">Commence par ajouter ton dossier de musique ou cherche un titre.</div>'}`;
  },

  search() {
    const src = S.searchSource;
    const tabs = [['youtube', 'YouTube'], ['jamendo', 'Jamendo'], ['archive', 'Internet Archive'], ['local', 'Ma musique']]
      .map(([k, n]) => `<button class="btn small ${src === k ? '' : 'ghost'}" data-act="source" data-s="${k}">${n}</button>`).join('');
    let body = '';
    if (S.searching) body = '<div class="empty">Recherche…</div>';
    else if (src === 'jamendo' && !S.settings.jamendoKey)
      body = `<div class="empty">Jamendo (musique libre, gratuite et légale) demande une clé API gratuite.<br><br>
        <button class="btn small" data-act="open-ext" data-url="https://devportal.jamendo.com/">Obtenir ma clé</button>
        <button class="btn small ghost" data-act="goto" data-view="settings">Saisir ma clé</button></div>`;
    else body = trackRows(S.searchRes, { empty: 'Lance une recherche (Entrée).' });
    return `<div class="row">${tabs}</div>
      <div style="margin-top:20px">${body}</div>`;
  },

  collection() {
    const ui = S.libUI;
    const chip = (k, n) => `<button class="chip ${ui.filter === k ? 'on' : ''}" data-act="lib-filter" data-f="${k}">${n}</button>`;
    return `<div class="lib-top"><h1>Bibliothèque</h1><div class="lib-btns"><button class="btn ghost" data-act="import-playlist" title="Depuis un lien Spotify ou Apple Music">⇩ Importer</button><button class="btn" data-act="new-playlist">＋ Créer</button></div></div>
      <div class="lib-bar"><div class="chips">${ui.filter !== 'all' ? '<button class="chip" data-act="lib-filter" data-f="all" title="Tout afficher">✕</button>' : ''}${chip('all', 'Tout')}${chip('playlists', 'Playlists')}${chip('local', 'Ma musique')}</div>
        <div class="lib-tools"><input id="lib-q" class="lib-q" placeholder="Rechercher…" value="${esc(S.libQ)}">
          <button class="chip ghost" data-act="lib-sort" title="Trier">${ui.sort === 'recent' ? 'Récents' : 'A–Z'}</button>
          <button class="icon-btn" data-act="lib-view" title="Affichage">${ui.view === 'grid' ? '☰' : '▦'}</button></div></div>
      <div id="lib-grid" class="lib-grid ${ui.view === 'list' ? 'list' : ''}">${libGrid()}</div>`;
  },

  library() {
    const l = S.library;
    return pageHead('Bibliothèque', 'Ma musique', l, headCover(l, '▤'),
      `<button class="btn" data-act="add-folder">Ajouter un dossier</button>
       <button class="btn ghost" data-act="add-files">Ajouter des fichiers</button>
       ${l.length ? '<button class="btn ghost" data-act="play-all">▶ Tout lire</button><button class="btn ghost" data-act="shuffle-all">⤮ Aléatoire</button><button class="btn ghost" data-act="clear-lib">Vider</button>' : ''}`)
      + trackRows(l, { empty: 'Ajoute un dossier contenant tes MP3, FLAC, etc.' });
  },

  liked() {
    const l = S.liked;
    return pageHead('Playlist', 'Titres aimés', l, '<div class="ph-cover liked">♥</div>',
      l.length ? '<button class="btn" data-act="play-all">▶ Lire</button><button class="btn ghost" data-act="shuffle-list">⤮ Aléatoire</button>' : '')
      + trackRows(l, { empty: 'Clique sur ♡ pour garder un titre ici.' });
  },

  queue() {
    return pageHead('En cours', 'File d’attente', S.queue, headCover(S.queue, '≡'), '')
      + trackRows(S.queue, { empty: 'La file est vide.' });
  },

  playlist() {
    const p = S.playlists.find(x => x.id === S.viewArg);
    if (!p) return '<div class="empty">Playlist introuvable.</div>';
    return pageHead('Playlist', esc(p.name), p.tracks, headCover(p.tracks, '♪'),
      `${p.tracks.length ? '<button class="btn" data-act="play-all">▶ Lire</button><button class="btn ghost" data-act="shuffle-list">⤮ Aléatoire</button>' : ''}
       <button class="btn ghost" data-act="rename-playlist" data-id="${p.id}">Renommer</button>
       <button class="btn ghost" data-act="delete-playlist" data-id="${p.id}">Supprimer</button>`)
      + trackRows(p.tracks, { empty: 'Ajoute des titres via le menu ⋯.' });
  },

  settings() {
    const s = S.settings;
    const range = (k, label, min, max, step, unit = '') =>
      `<div class="set-row"><label>${label}</label><input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-unit="${unit}"><span>${s[k]}${unit}</span></div>`;
    return `<h1>Apparence</h1><p class="sub">Tout se règle ici, en direct.</p>
      <div class="set-group"><h3>Thème</h3><div class="themes">${Object.entries(THEMES).map(([k, n]) =>
        `<button class="theme-chip panel ${s.theme === k ? 'active' : ''}" data-act="theme" data-t="${k}" data-theme="${k}" style="background:var(--panel-solid);color:var(--text)"><span style="color:var(--accent)">●</span> ${n}</button>`).join('')}</div>
        <div class="set-row" style="margin-top:16px"><label>Couleur d'accent</label><div class="swatches">
          <button class="swatch ${!s.accent ? 'active' : ''}" data-act="accent" data-c="" title="Par défaut" style="background:conic-gradient(#7c9cff,#ff7ac6,#ffd166,#5fd39a,#7c9cff)"></button>
          ${ACCENTS.map(c => `<button class="swatch ${s.accent === c ? 'active' : ''}" data-act="accent" data-c="${c}" style="background:${c}"></button>`).join('')}
        </div></div></div>
      <div class="set-group"><h3>Fond d'écran</h3>
        <div class="row">
          <button class="btn small ${s.bgType === 'none' ? '' : 'ghost'}" data-act="bg-none">Aucun</button>
          <button class="btn small ${s.bgType === 'image' ? '' : 'ghost'}" data-act="pick-image">Choisir une image…</button>
        </div>
        <div class="set-row"><label>Ou une image en ligne</label><input class="text-input" id="bg-url" placeholder="https://…" value="${s.bgType === 'image' && /^https?:/.test(s.bgImage) ? esc(s.bgImage) : ''}"><button class="btn small" data-act="bg-url">OK</button></div>
        <div class="presets">${Object.entries(PRESETS).map(([k, g]) =>
          `<div class="preset ${s.bgType === 'preset' && s.bgPreset === k ? 'active' : ''}" data-act="preset" data-p="${k}" style="background:${g}" title="${k}"></div>`).join('')}</div>
      </div>
      <div class="set-group"><h3>Fonds animés</h3>
        <p class="sub" style="margin:0 0 12px">Un décor qui bouge derrière l'appli. Baisse l'opacité des panneaux (plus bas) pour mieux le voir.</p>
        <div class="anims">${((window.sonoraAnim && window.sonoraAnim.scenes) || []).map(a =>
          `<button class="anim-card ${s.bgType === 'anim' && s.bgAnim === a.id ? 'active' : ''}" data-act="anim" data-a="${a.id}" title="${esc(a.name)}"><span class="anim-prev" style="background:${a.preview}"></span><span class="anim-name">${esc(a.name)}</span></button>`).join('')}</div>
        ${range('animSpeed', 'Vitesse de l\'animation', 0.3, 2, 0.1)}
      </div>
      <div class="set-group"><h3>Flou et transparence</h3>
        ${range('panelBlur', 'Flou des panneaux', 0, 40, 1, ' px')}
        ${range('bgBlur', 'Flou du fond', 0, 30, 1, ' px')}
        ${range('panelAlpha', 'Opacité des panneaux', 0.2, 1, 0.02)}
        ${range('dim', 'Assombrir le fond', 0, 0.8, 0.05)}
        ${range('radius', 'Arrondi des angles', 0, 28, 1, ' px')}
      </div>
      <div class="set-group"><h3>Jamendo</h3>
        <div class="set-row"><label>Clé API (gratuite)</label><input class="text-input" id="jkey" placeholder="client_id" value="${esc(s.jamendoKey)}"><button class="btn small" data-act="save-key">OK</button></div>
        <p class="sub" style="margin:0">Jamendo propose des centaines de milliers de titres libres et légaux.</p>
      </div>
      <button class="btn ghost" data-act="reset-settings">Réinitialiser l'apparence</button>`;
  }
};

/* ───────────── actions ───────────── */
async function doSearch() {
  const q = S.searchQ.trim();
  if (S.searchSource === 'local') {
    const l = q.toLowerCase();
    S.searchRes = S.library.filter(t => (t.title + ' ' + t.artist).toLowerCase().includes(l));
    return render();
  }
  if ((S.searchSource === 'archive' || S.searchSource === 'youtube') && !q) { S.searchRes = []; return render(); }
  S.searching = true; render();
  try {
    if (S.searchSource === 'jamendo') S.searchRes = await searchJamendo(q);
    else if (S.searchSource === 'youtube') S.searchRes = await searchYouTube(q);
    else S.searchRes = await searchArchive(q);
    if (!S.searchRes.length) toast('Aucun résultat');
  } catch (e) {
    S.searchRes = [];
    toast(e.message === 'NOKEY' ? 'Clé Jamendo manquante' : 'Erreur : ' + e.message);
  }
  S.searching = false; render();
}

/* barre du haut : recherche au centre */
$('#topbar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'goto') go(b.dataset.view);
  else if (b.dataset.act === 'clear-search') { const si = $('#search-input'); si.value = ''; S.searchQ = ''; S.searchRes = []; si.focus(); si.dispatchEvent(new Event('input', { bubbles: true })); }
});
$('#topbar').addEventListener('keydown', e => { if (e.target.id === 'search-input' && e.key === 'Enter') { S.searchQ = e.target.value; doSearch(); } });
document.addEventListener('input', e => { if (e.target.id === 'search-input') { S.searchQ = e.target.value; $('#tb-clear').classList.toggle('hidden', !e.target.value); } });
document.addEventListener('focusin', e => { if (e.target.id === 'search-input' && S.view !== 'search') go('search'); });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search-input').focus(); } });
$('#sidebar').addEventListener('click', e => {
  const n = e.target.closest('.nav[data-view]'); if (n) return go(n.dataset.view);
  const p = e.target.closest('[data-act="open-playlist"]'); if (p) go('playlist', p.dataset.id);
});
$('#new-playlist').onclick = () => askText('Nouvelle playlist', 'Nom de la playlist', name => {
  const p = { id: uid(), name, tracks: [] }; S.playlists.push(p); persist(); go('playlist', p.id);
});

$('#main').addEventListener('keydown', e => {
  if (e.target.id === 'search-input' && e.key === 'Enter') { S.searchQ = e.target.value; doSearch(); }
});
$('#main').addEventListener('input', e => {
  if (e.target.id === 'lib-q') { S.libQ = e.target.value; $('#lib-grid').innerHTML = libGrid(); return; }
  const k = e.target.dataset.set; if (!k) return;
  S.settings[k] = parseFloat(e.target.value);
  e.target.nextElementSibling.textContent = e.target.value + (e.target.dataset.unit || '');
  applySettings(); persist();
});

$('#main').addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, i = +el.dataset.i, t = cur.list[i];
  switch (act) {
    case 'play-row': if (!e.target.closest('button')) playFrom(cur.list, i); break;
    case 'like': toggleLike(t); updatePlayer(); render(); break;
    case 'more': {
      const r = el.getBoundingClientRect();
      const items = [
        { label: 'Lire ensuite', fn: () => queueNext(t) },
        { label: 'Ajouter à la file d’attente', fn: () => queueAdd(t) },
        ...S.playlists.map(p => ({ label: '＋ ' + p.name, fn: () => addToPlaylist(p, t) })),
        { label: 'Nouvelle playlist…', fn: () => askText('Nouvelle playlist', 'Nom', n => { const p = { id: uid(), name: n, tracks: [] }; S.playlists.push(p); addToPlaylist(p, t); }) }
      ];
      if (t.source !== 'local' && S.view !== 'library') items.push({ label: 'Ajouter à Ma musique', fn: () => addToLibrary([t]) });
      if (S.view === 'library') items.push({ label: 'Retirer de Ma musique', fn: () => { S.library = S.library.filter(x => x.id !== t.id); persist(); render(); } });
      if (S.view === 'playlist') items.push({ label: 'Retirer de la playlist', fn: () => { const p = S.playlists.find(x => x.id === S.viewArg); p.tracks = p.tracks.filter(x => x.id !== t.id); persist(); render(); } });
      showMenu(r.left - 160, r.bottom + 4, items); break;
    }
    case 'play-recent': playFrom(S.recent, i); break;
    case 'remove-recent': S.recent.splice(i, 1); persist(); render(); break;
    case 'shuffle-list': if (cur.list.length) { S.shuffle = true; playFrom(cur.list, Math.floor(Math.random() * cur.list.length)); } break;
    case 'play-all': if (cur.list.length) playFrom(cur.list, 0); break;
    case 'shuffle-all': if (S.library.length) { S.shuffle = true; playFrom(S.library, Math.floor(Math.random() * S.library.length)); } break;
    case 'clear-lib': S.library = []; persist(); render(); break;
    case 'lib-open': { const it = libItems().find(x => x.id === el.dataset.id); if (it) go(it.view, it.arg || null); break; }
    case 'lib-play': { const it = libItems().find(x => x.id === el.dataset.id); if (it && it.tracks.length) playFrom(it.tracks, 0); else toast('Rien à lire ici'); break; }
    case 'lib-filter': S.libUI.filter = el.dataset.f; store('sonora.libui', S.libUI); render(); break;
    case 'lib-sort': S.libUI.sort = S.libUI.sort === 'recent' ? 'name' : 'recent'; store('sonora.libui', S.libUI); render(); break;
    case 'lib-view': S.libUI.view = S.libUI.view === 'grid' ? 'list' : 'grid'; store('sonora.libui', S.libUI); render(); break;
    case 'import-playlist': askText('Importer une playlist', 'Lien Spotify ou Apple Music', url => { if (window.sonoraImport) window.sonoraImport.run(url); }); break;
    case 'new-playlist': askText('Nouvelle playlist', 'Nom de la playlist', name => { const p = { id: uid(), name, tracks: [] }; S.playlists.push(p); persist(); go('playlist', p.id); }); break;
    case 'goto': go(el.dataset.view); break;
    case 'source': S.searchSource = el.dataset.s; S.searchRes = []; render(); if (S.searchQ || S.searchSource === 'jamendo') doSearch(); break;
    case 'open-ext': window.api.openExternal(el.dataset.url); break;
    case 'add-folder': { const l = await window.api.pickFolder(); if (l.length) { addToLibrary(l); go('library'); } else toast('Aucun fichier audio trouvé'); break; }
    case 'add-files': { const l = await window.api.pickFiles(); if (l.length) { addToLibrary(l); go('library'); } break; }
    case 'rename-playlist': askText('Renommer', 'Nouveau nom', n => { S.playlists.find(p => p.id === el.dataset.id).name = n; persist(); render(); }); break;
    case 'delete-playlist': S.playlists = S.playlists.filter(p => p.id !== el.dataset.id); persist(); go('collection'); break;
    case 'theme': S.settings.theme = el.dataset.t; applySettings(); persist(); render(); break;
    case 'accent': S.settings.accent = el.dataset.c || null; applySettings(); persist(); render(); break;
    case 'anim':
      S.settings.bgType = 'anim'; S.settings.bgAnim = el.dataset.a;
      if (S.settings.panelAlpha > 0.6) S.settings.panelAlpha = 0.5;          // sinon le décor serait presque caché
      applySettings(); persist(); render(); break;
    case 'bg-none': S.settings.bgType = 'none'; applySettings(); persist(); render(); break;
    case 'preset': S.settings.bgType = 'preset'; S.settings.bgPreset = el.dataset.p; applySettings(); persist(); render(); break;
    case 'pick-image': { const u = await window.api.pickImage(); if (u) { S.settings.bgType = 'image'; S.settings.bgImage = u; applySettings(); persist(); render(); } break; }
    case 'bg-url': { const v = $('#bg-url').value.trim(); if (/^https?:\/\//.test(v)) { S.settings.bgType = 'image'; S.settings.bgImage = v; applySettings(); persist(); render(); } else toast('URL invalide'); break; }
    case 'save-key': S.settings.jamendoKey = $('#jkey').value.trim(); persist(); toast('Clé enregistrée'); break;
    case 'reset-settings': S.settings = { ...DEFAULTS, jamendoKey: S.settings.jamendoKey }; applySettings(); persist(); render(); break;
  }
});

/* ───────────── démarrage ───────────── */
applySettings();
updatePlayer();
render();
