// Sonora : couleurs ambiantes tirées de la pochette. Le fond (animé, derrière l'interface et le mode paroles) change de couleurs
// en douceur à chaque nouveau titre. Réglages : « Verre liquide » et « Fond adapté à la musique » (Apparence).
(() => {
  'use strict';
  const root = document.documentElement;
  const val = (k, d) => (S.settings[k] === undefined ? d : S.settings[k]);
  const amb = document.createElement('div'); amb.id = 'ambient';
  amb.innerHTML = '<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i>';
  const bg = document.getElementById('bg-dim'); if (bg && bg.parentNode) bg.parentNode.insertBefore(amb, bg.nextSibling); else document.body.prepend(amb);

  const hsl2 = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  function seedPalette(str) {
    let x = 0; for (const c of String(str || 'sonora')) x = (x * 31 + c.charCodeAt(0)) >>> 0;
    const h = x % 360; return [hsl2(h, .7, .5), hsl2(h + 38, .75, .45), hsl2(h + 190, .65, .45), hsl2(h + 300, .7, .4)];
  }
  function fromImage(url) {
    return new Promise((res) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, 40, 40);
          const d = x.getImageData(0, 0, 40, 40).data, px = [];
          for (let i = 0; i < d.length; i += 4) { const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); if (l > .08 && l < .94) px.push([h, s, l]); }
          if (px.length < 40) return res(null);
          // grandes familles de teintes (12 secteurs), pondérées par la saturation
          const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
          for (const [h, s, l] of px) { const b = bins[Math.floor(h / 30) % 12], w = .15 + s * s; b.w += w; b.h += h * w; b.s += s * w; b.l += l * w; }
          const cand = bins.filter((b) => b.w > 0).map((b) => ({ h: b.h / b.w, s: b.s / b.w, l: b.l / b.w, w: b.w })).sort((a, b) => b.w - a.w);
          const out = [];
          for (const k of cand) { if (out.every((o) => hueDist(o.h, k.h) > 28)) out.push(k); if (out.length === 4) break; }
          if (!out.length) return res(null);
          while (out.length < 4) { const b = out[out.length % out.length]; out.push({ h: b.h + 25 * out.length, s: b.s, l: b.l }); }
          res(out.map((k) => hsl2(k.h, Math.min(.92, Math.max(.45, k.s * 1.15)), Math.min(.58, Math.max(.34, k.l)))));
        } catch (e) { res(null); }                    // image « tainted » (pas de CORS) : couleurs de secours
      };
      im.onerror = () => res(null); im.src = url;
    });
  }
  let lastKey = '', tok = 0;
  function set(p) { p.forEach((c, i) => root.style.setProperty('--amb' + (i + 1), c)); }
  async function update(force) {
    const t = S.queue && S.queue[S.qi]; if (!t) return;
    const k = (t.image || '') + '|' + t.title; if (!force && k === lastKey) return; lastKey = k; const my = ++tok;
    const p = (t.image && await fromImage(t.image.replace(/\/\d+x\d+-/, '/250x250-'))) || seedPalette(t.artist + t.title);
    const go = () => { if (my === tok) { set(p); document.body.classList.add('has-amb'); } };
    if (document.documentElement.classList.contains('mobile') && !force) setTimeout(go, 450); else go();   // téléphone : on laisse d'abord la lecture démarrer, le repeint du fond vient après
  }
  function applyClasses() {
  }
  window.sonoraAmbient = { update, apply: applyClasses };
  const baseApply = applySettings; applySettings = function () { baseApply(); applyClasses(); };
  document.addEventListener('sonora:cover', () => update(true));
  applyClasses(); set(['#3b3a8f', '#7a3b7a', '#27527f', '#4a3a8a']);   // palette discrète tant que rien ne joue
  setInterval(() => { try { update(false); } catch (e) { /* ignoré */ } }, 500);
})();
