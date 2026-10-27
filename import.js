// Sonora : importer une playlist (ou un album) Spotify / Apple Music à partir de son lien public.
// Le lien est lu depuis le processus principal (main.js) ; les titres sont ensuite retrouvés sur YouTube à la lecture.
(() => {
  'use strict';
  const NAMES = { spotify: 'Spotify', apple: 'Apple Music' };

  function detect(txt) {
    txt = (txt || '').trim();
    if (!txt) return null;
    let m = txt.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]+)/i) || txt.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/i);
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

  async function run(text) {
    const d = detect(text);
    if (!d) { toast('Lien non reconnu : colle un lien Spotify ou Apple Music.'); return; }
    if (!window.api || !window.api.fetchJson) { toast('Import indisponible.'); return; }
    toast('Import depuis ' + NAMES[d.svc] + '…');
    try {
      const r = await window.api.fetchJson(d.svc === 'spotify' ? `https://open.spotify.com/embed/${d.type}/${d.id}` : d.url);
      if (!r || !r.__text) throw new Error('vide');
      const info = d.svc === 'spotify' ? parseSpotify(r.__text) : parseApple(r.__text);
      const seen = new Set();
      const tracks = info.tracks.filter((t) => { const k = (t.title + '|' + t.artist).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 300)
        .map((t) => ({ id: 'imp:' + uid(), title: t.title, artist: t.artist, duration: t.duration || undefined, source: 'youtube', lazy: true }));
      if (!tracks.length) throw new Error('vide');
      let name = info.name || 'Playlist importée';
      if (S.playlists.some((p) => p.name === name)) name += ' (' + NAMES[d.svc] + ')';
      const p = { id: uid(), name, tracks };
      S.playlists.push(p); persist(); renderPlaylists();
      go('playlist', p.id);
      toast('« ' + name + ' » importée : ' + tracks.length + ' titres');
      if (window.sonoraUpgrade) setTimeout(window.sonoraUpgrade, 400);
    } catch (e) {
      toast('Import impossible : la playlist doit être publique (lien de partage).');
    }
  }

  window.sonoraImport = { detect, run, parseSpotify, parseApple };
})();
