// Sonora : importer une playlist (ou un album) Spotify / Apple Music à partir de son lien public.
// Le lien est lu depuis le processus principal (main.js) ; les titres sont ensuite retrouvés sur YouTube à la lecture.
(() => {
  'use strict';
  const NAMES = { spotify: 'Spotify', apple: 'Apple Music', deezer: 'Deezer' };

  function detect(txt) {
    txt = (txt || '').trim();
    if (!txt) return null;
    let m = txt.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album)\/(\d+)/i);
    if (m) return { svc: 'deezer', type: m[1].toLowerCase(), id: m[2] };
    m = txt.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]+)/i) || txt.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/i);
    if (m) return { svc: 'spotify', type: m[1].toLowerCase(), id: m[2] };
    m = txt.match(/https?:\/\/(?:embed\.)?music\.apple\.com\/[^\s"']+/i);
    if (m && /\/(playlist|album)\//i.test(m[0])) return { svc: 'apple', type: /\/playlist\//i.test(m[0]) ? 'playlist' : 'album', url: m[0].replace(/^http:/i, 'https:').replace('embed.music.apple.com', 'music.apple.com') };
    return null;
  }

  const isoSec = (s) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
  const unesc = (s) => String(s || '').replace(/\u00a0/g, ' ').trim();

  function parseSpotify(html) {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('format');
    const find = (o, d = 0) => {
      if (!o || typeof o !== 'object' || d > 14) return null;
      if (Array.isArray(o.trackList) && o.trackList.length) return o;
      for (const k in o) { const r = find(o[k], d + 1); if (r) return r; }
      return null;
    };
    const ent = find(JSON.parse(m[1]));
    if (!ent) throw new Error('vide');
    return {
      name: unesc(ent.name || ent.title),
      tracks: ent.trackList.map((t) => ({ title: unesc(t.title), artist: unesc(t.subtitle), duration: t.duration ? Math.round(t.duration / 1000) : 0 })).filter((t) => t.title)
    };
  }

  function parseApple(html) {
    const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    for (const b of blocks) {
      let j; try { j = JSON.parse(b[1]); } catch { continue; }
      for (const o of (Array.isArray(j) ? j : [j])) {
        if (!o || !Array.isArray(o.track) || !o.track.length) continue;
        const who = (a) => Array.isArray(a) ? a.map((x) => x.name).filter(Boolean).join(', ') : (a && a.name) || (typeof a === 'string' ? a : '');
        return {
          name: unesc(o.name),
          tracks: o.track.map((t) => ({ title: unesc(t.name), artist: unesc(who(t.byArtist) || who(o.byArtist)), duration: isoSec(t.duration) })).filter((t) => t.title)
        };
      }
    }
    throw new Error('format');
  }

  // ajoute des titres à une playlist existante (sans doublons) ou en crée une nouvelle
  function commit(name, list, label, into) {
    const seen = new Set(), keep = (t) => { const k = ((t.title || '') + '|' + (t.artist || '')).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; };
    const target = into && S.playlists.find((p) => p.id === into);
    if (target) {
      target.tracks.forEach(keep);
      const add = list.filter(keep).slice(0, Math.max(0, 20000 - target.tracks.length)).map((t) => ({ ...t, addedAt: Date.now() }));
      target.tracks.push(...add); persist(); renderPlaylists(); render(); if (window.sonoraCover) window.sonoraCover.warm(target.tracks);
      toast(add.length + ' titre' + (add.length > 1 ? 's' : '') + ' ajouté' + (add.length > 1 ? 's' : '') + ' à « ' + target.name + ' »' + (list.length - add.length > 0 ? ' (' + (list.length - add.length) + ' déjà présents)' : ''));
      return target;
    }
    const base = Date.now(), tracks = list.slice(0, 20000).map((t, i) => ({ addedAt: base + i, ...t }));   // même ordre que dans l'appli d'origine
    if (!tracks.length) throw new Error('vide');
    let nm = name || 'Playlist importée'; if (S.playlists.some((p) => p.name === nm)) nm += ' (' + label + ')';
    const p = { id: uid(), name: nm, tracks }; S.playlists.push(p); persist(); renderPlaylists(); go('playlist', p.id);
    toast('« ' + nm + ' » importée : ' + tracks.length + ' titres');
    if (window.sonoraCover) window.sonoraCover.warm(p.tracks);
    return p;
  }
  const lazyOf = (t) => ({ id: 'imp:' + uid(), title: t.title, artist: t.artist, duration: t.duration || undefined, source: 'youtube', lazy: true });
  // Deezer : l'API publique donne la liste complète (par pages), avec les vraies pochettes
  async function runDeezer(d, into) {
    const DZ = window.sonoraDZ; if (!DZ) throw new Error('dz');
    const base = 'https://api.deezer.com/' + d.type + '/' + d.id;
    const head = await window.api.fetchJson(base);
    if (!head || head.error) throw new Error('privé');
    const out = []; let index = 0, total = head.nb_tracks || head.nb_tracks === 0 ? head.nb_tracks : 20000;
    while (index < Math.min(total, 20000)) {
      let page; try { page = await window.api.fetchJson(base + '/tracks?limit=200&index=' + index); } catch (e) { if (out.length) break; throw e; }
      const data = (page && page.data) || []; if (!data.length) break;
      data.forEach((r) => { if (r && r.id) out.push(DZ.mk(r, d.type === 'album' ? head : undefined)); });
      index += data.length;
      if (!page.next) break;
      if (index % 1000 === 0) toast('Import Deezer… ' + index + ' titres');
    }
    return { name: head.title, tracks: out };
  }
  async function run(text, into) {
    const d = detect(text);
    if (!d) { toast('Lien non reconnu : colle un lien Spotify, Deezer ou Apple Music.'); return; }
    if (!window.api || !window.api.fetchJson) { toast('Import indisponible.'); return; }
    toast('Import depuis ' + NAMES[d.svc] + '…');
    try {
      if (d.svc === 'deezer') { const r = await runDeezer(d, into); commit(r.name, r.tracks, 'Deezer', into); return; }
      const r = await window.api.fetchJson(d.svc === 'spotify' ? `https://open.spotify.com/embed/${d.type}/${d.id}` : d.url);
      if (!r || !r.__text) throw new Error('vide');
      const info = d.svc === 'spotify' ? parseSpotify(r.__text) : parseApple(r.__text);
      let tracks = info.tracks, full = true;
      // la page publique ne donne que ~100 titres : pour les playlists plus longues, on fait défiler la page pour tout relever
      if (tracks.length >= 95 && window.api.scrapeImport && d.type !== 'track') {
        toast('Playlist longue : récupération de tous les titres… (jusqu’à une minute)');
        full = false;
        try {
          const sr = await window.api.scrapeImport(d.svc, d.svc === 'spotify' ? `https://open.spotify.com/${d.type}/${d.id}` : d.url);
          if (sr && sr.ok && sr.tracks && sr.tracks.length > tracks.length) {
            // garde-fou : les 100 premiers lus sur la page doivent être ceux du lien (même titres, même ordre), sinon on ne prend rien d'étranger
            const nk = (x) => String(x.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
            const head = tracks.map(nk), got = sr.tracks.slice(0, head.length).map(nk);
            const same = head.filter((k, i) => k && k === got[i]).length;
            if (same >= head.length * 0.8) { tracks = tracks.concat(sr.tracks.slice(head.length)); full = true; }
          }
        } catch (e) { /* on garde les 100 premiers */ }
      }
      commit(info.name, tracks.map(lazyOf), NAMES[d.svc], into);
      if (!full) setTimeout(() => toast('Seuls les 100 premiers titres ont pu être lus. Pour toute la playlist : exporte-la en CSV (Exportify) puis Importer › Fichier.'), 2600);
      if (window.sonoraUpgrade) setTimeout(window.sonoraUpgrade, 400);
    } catch (e) {
      toast(d.svc === 'deezer' ? 'Import Deezer impossible : la playlist doit être publique.' : 'Import impossible : la playlist doit être publique (lien de partage).');
    }
  }

  // ---------- import depuis un fichier (CSV Exportify/TuneMyMusic, M3U, TXT, JSON) : jusqu'à 20 000 titres ----------
  function csvRows(txt) {
    const rows = []; let row = [], cell = '', q = false;
    const h0 = txt.split('\n')[0], n = (r) => (h0.match(r) || []).length, sep = n(/\t/g) > Math.max(n(/;/g), n(/,/g)) ? '\t' : n(/;/g) > n(/,/g) ? ';' : ',';
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseFile(name, txt) {
    txt = String(txt || '').replace(/^\uFEFF/, '');
    const base = name.replace(/\.[^.]+$/, '');
    const split = (l) => { const m = l.split(/\s+[-–—]\s+/); return m.length >= 2 ? { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() } : { artist: '', title: l.trim() }; };
    let tracks = [];
    if (/\.json$/i.test(name) || /^\s*[\[{]/.test(txt)) {
      let j = JSON.parse(txt); if (!Array.isArray(j)) j = j.tracks || j.items || [];
      tracks = j.map((t) => ({ title: t.title || t.name || t.track || t.trackName, artist: Array.isArray(t.artists) ? t.artists.map((a) => a.name || a).join(', ') : (t.artist || t.artistName || ''), duration: t.duration ? (t.duration > 10000 ? Math.round(t.duration / 1000) : t.duration) : 0 }));
    } else if (/\.m3u8?$/i.test(name) || /^#EXTM3U/.test(txt)) {
      const L = txt.split(/\r?\n/);
      for (let i = 0; i < L.length; i++) { const m = L[i].match(/^#EXTINF:(-?\d+)[^,]*,(.*)$/); if (m) { const x = split(m[2]); tracks.push({ ...x, duration: Math.max(0, +m[1]) }); } }
      if (!tracks.length) tracks = L.filter((l) => l && l[0] !== '#').map((l) => split(l.split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '')));
    } else if (/\.csv$/i.test(name) || /^[^\n]*(,|;|\t)[^\n]*\n/.test(txt) && /(track|titre|title|name|artist|artiste)/i.test(txt.split('\n')[0])) {
      const rows = csvRows(txt), h = rows[0].map((x) => x.trim().toLowerCase());
      const col = (re) => h.findIndex((x) => re.test(x));
      const ti = col(/^(track name|track|title|titre|name|nom|song)/), ai = col(/^(artist|artiste|artists)/), di = col(/duration|dur[ée]e/);
      if (ti < 0) throw new Error('colonnes');
      tracks = rows.slice(1).filter((r) => r[ti]).map((r) => ({ title: r[ti], artist: ai >= 0 ? r[ai] : '', duration: di >= 0 ? (+r[di] > 10000 ? Math.round(+r[di] / 1000) : +r[di] || 0) : 0 }));
    } else tracks = txt.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#').map(split);
    return { name: base || 'Playlist importée', tracks: tracks.map((t) => ({ title: unesc(t.title), artist: unesc(String(t.artist || '').replace(/;/g, ', ')), duration: t.duration || 0 })).filter((t) => t.title) };
  }
  function addPlaylist(info, label, into) { commit(info.name, info.tracks.map(lazyOf), label, into); }
  // l'export Apple Music (Musique/iTunes) est en UTF-16 : on lit les octets et on détecte l'encodage
  async function readText(f) {
    const u = new Uint8Array(await f.arrayBuffer());
    if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u);
    if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u);
    return new TextDecoder('utf-8').decode(u);
  }
  function pickFile(into) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.m3u,.m3u8,.txt,.json'; inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      try { addPlaylist(parseFile(f.name, await readText(f)), 'fichier', into); } catch (e) { toast('Fichier non reconnu : CSV (titre, artiste), M3U, TXT « Artiste - Titre » ou JSON.'); }
    };
    inp.click();
  }

  window.sonoraImport = { pickFile, parseFile, detect, run, parseSpotify, parseApple };
})();
