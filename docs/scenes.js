// Sonora : ambiances animées (ciel étoilé, aurores boréales, ciel bleu et nuages, etc.).
// Tout est dessiné en CSS + petits SVG générés ici : aucune image à télécharger.
// app.js appelle window.sonoraScenes.html(id) pour remplir le calque #scene, et affiche les aperçus dans Apparence.
(() => {
  'use strict';

  // ---------- petits outils de dessin ----------
  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const uri = (w, h, body) =>
    `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`)}')`;
  const memo = new Map();
  const once = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };
  const f1 = (n) => n.toFixed(1);

  // champ d'étoiles (graine fixe : c'est toujours le même ciel)
  const stars = (seed, n, r0, r1, cols) => once('st' + seed, () => {
    const r = rng(seed); let b = '';
    for (let i = 0; i < n; i++) b += `<circle cx="${f1(r() * 1200)}" cy="${f1(r() * 900)}" r="${(r0 + r() * (r1 - r0)).toFixed(2)}" fill="${cols[(r() * cols.length) | 0]}"/>`;
    return uri(1200, 900, b);
  });
  // rangée de sapins
  const pines = (seed, base, hMin, hMax, step, fill) => once('pi' + seed, () => {
    const r = rng(seed); let p = `M0 240 L0 ${240 - base} `;
    for (let x = 0; x < 1200; x += step) {
      const h = base + hMin + r() * (hMax - hMin), w = step * (1.1 + r() * 0.5);
      p += `L${f1(x)} ${240 - base} L${f1(x + w / 2)} ${f1(240 - h)} L${f1(x + w)} ${240 - base} `;
    }
    return uri(1200, 240, `<path d="${p}L1200 240Z" fill="${fill}"/>`);
  });
  // collines arrondies
  const hills = (seed, amp, base, fill) => once('hi' + seed, () => {
    const r = rng(seed), a = r() * 6, b = r() * 6, c = r() * 6; let p = 'M0 240 ';
    for (let x = 0; x <= 1200; x += 15) {
      const y = 240 - base - amp * (0.5 + 0.28 * Math.sin(x / 190 + a) + 0.2 * Math.sin(x / 83 + b) + 0.12 * Math.sin(x / 37 + c));
      p += `L${x} ${f1(y)} `;
    }
    return uri(1200, 240, `<path d="${p}L1200 240Z" fill="${fill}"/>`);
  });
  // flocons / bulles / gouttes / pétales : une tuile 600x600 qui se répète et défile
  const tile = (key, seed, n, draw) => once(key, () => {
    const r = rng(seed); let b = '';
    for (let i = 0; i < n; i++) b += draw(r, r() * 600, r() * 600);
    return uri(600, 600, b);
  });
  const flakes = (seed, n, r0, r1) => tile('fl' + seed, seed, n, (r, x, y) =>
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${(r0 + r() * (r1 - r0)).toFixed(2)}" fill="#fff" fill-opacity="${(0.45 + r() * 0.5).toFixed(2)}"/>`);
  const drops = (seed, n) => tile('dr' + seed, seed, n, (r, x, y) => {
    const l = 24 + r() * 46;
    return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(y + l)}" stroke="#c8d8ff" stroke-opacity="${(0.25 + r() * 0.45).toFixed(2)}" stroke-width="${(1 + r() * 1.2).toFixed(1)}" stroke-linecap="round"/>`;
  });
  const bubbles = (seed, n) => tile('bu' + seed, seed, n, (r, x, y) => {
    const rad = 4 + r() * 16;
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${rad.toFixed(1)}" fill="#bfeaff" fill-opacity=".08" stroke="#d8f4ff" stroke-opacity=".45" stroke-width="1.4"/>` +
      `<circle cx="${f1(x - rad * 0.35)}" cy="${f1(y - rad * 0.35)}" r="${(rad * 0.22).toFixed(1)}" fill="#fff" fill-opacity=".7"/>`;
  });
  const petals = (seed, n) => tile('pe' + seed, seed, n, (r, x, y) => {
    const s = 0.7 + r() * 1.1, a = r() * 360, c = ['#ffc6d9', '#ffb3cc', '#ffd9e6', '#ff9fbd'][(r() * 4) | 0];
    return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(a)}) scale(${s.toFixed(2)})"><path d="M0 0C5-9 17-8 20 1C16 11 5 11 0 0Z" fill="${c}" fill-opacity="${(0.65 + r() * 0.3).toFixed(2)}"/></g>`;
  });

  const I = (cls, style) => `<i class="${cls}"${style ? ` style="${style}"` : ''}></i>`;
  const wrap = (id, vars, inner) => `<div class="sc sc-${id}"${vars ? ` style="${vars}"` : ''}>${inner}</div>`;
  // couche qui défile (flocons, pluie, bulles, pétales) : --tw/--th = taille d'une tuile, --sp = durée d'un tour, --dx = dérive
  const fall = (img, tw, th, sp, dx, extra) =>
    I('fall', `background-image:${img};--tw:${tw}cqw;--th:${th}cqw;--sp:${sp}s;--dx:${dx}cqw${extra ? ';' + extra : ''}`);

  // ---------- les ambiances ----------
  const SCENES = [
    { id: 'etoile', name: 'Ciel étoilé', html: () => wrap('etoile',
      `--s1:${stars(11, 160, 0.8, 1.6, ['#fff', '#dfe8ff'])};--s2:${stars(23, 70, 1.4, 2.4, ['#fff', '#ffe9c7', '#cfe0ff'])};--s3:${stars(37, 14, 2.2, 3.4, ['#fff'])}`,
      I('mw') + I('mw m2') + I('st st1') + I('st st2') + I('st st3') + I('shoot a') + I('shoot b')) },

    { id: 'aurore', name: 'Aurores boréales', html: () => wrap('aurore',
      `--s1:${stars(51, 120, 0.7, 1.4, ['#fff', '#d6fff0'])};--s2:${stars(63, 40, 1.3, 2.1, ['#fff'])};--h1:${hills(7, 40, 10, '#031017')};--h2:${pines(9, 8, 14, 52, 15, '#01070b')}`,
      I('st st1') + I('st st2') + I('au a') + I('au b') + I('au rays') + I('au rays r2') + I('ground g1') + I('ground g2')) },

    { id: 'ciel', name: 'Ciel bleu et nuages', html: () => wrap('ciel', '',
      I('sunb') +
      [[34, 8, 150, -20, 12, 0.95], [22, 20, 190, -95, 30, 0.8], [40, 31, 130, -60, 4, 0.95], [26, 46, 170, -140, 52, 0.85],
        [46, 58, 120, -35, 20, 0.97], [24, 70, 200, -110, 66, 0.75], [30, 14, 210, -170, 76, 0.7]]
        .map(([w, t, d, dl, sx, o]) => I('cl', `--w:${w}cqw;top:${t}cqh;--d:${d}s;--dl:${dl}s;--sx:${sx}cqw;--o:${o}`)).join('')) },

    { id: 'couchant', name: 'Coucher de soleil', html: () => wrap('couchant',
      `--h1:${hills(21, 70, 18, '#2a1038')};--h2:${hills(33, 50, 6, '#12061c')};--s1:${stars(71, 50, 0.7, 1.3, ['#fff'])}`,
      I('st st1 top') + I('glow') + I('sunc') + I('streak a') + I('streak b') + I('streak c') + I('hills hl1') + I('hills hl2')) },

    { id: 'galaxie', name: 'Galaxie', html: () => wrap('galaxie',
      `--s1:${stars(81, 170, 0.7, 1.5, ['#fff', '#e8d9ff', '#cfe8ff'])};--s2:${stars(93, 60, 1.3, 2.3, ['#fff', '#ffd9f1'])};--s3:${stars(97, 12, 2.2, 3.2, ['#fff'])}`,
      I('neb a') + I('neb b') + I('neb c') + I('st st1') + I('st st2') + I('st st3')) },

    { id: 'ocean', name: 'Océan profond', html: () => wrap('ocean', '',
      I('orays') + I('orays o2') + fall(bubbles(3, 14), 40, 40, 26, 0, '--dir:-1') + fall(bubbles(5, 9), 70, 70, 40, 0, '--dir:-1;opacity:.7') + I('seabed')) },

    { id: 'brume', name: 'Forêt brumeuse', html: () => wrap('brume',
      `--h1:${pines(41, 4, 30, 110, 22, '#0e2a22')};--h2:${pines(43, 6, 40, 150, 28, '#0a1f19')};--h3:${pines(47, 8, 50, 190, 36, '#061410')}`,
      I('beam') + I('beam b2') + I('trees t1') + I('fog f1') + I('trees t2') + I('fog f2') + I('trees t3') + I('fog f3')) },

    { id: 'neon', name: 'Néon rétro', html: () => wrap('neon',
      `--s1:${stars(111, 60, 0.7, 1.3, ['#fff', '#ffd1f4'])}`,
      I('st st1 top') + I('sunn') + I('horizon') + I('floor') + I('scan')) },

    { id: 'pluie', name: 'Pluie de nuit', html: () => wrap('pluie', '',
      I('bokeh', 'left:8cqw;top:58cqh;width:16cqw;background:#ff5d8f') + I('bokeh', 'left:30cqw;top:66cqh;width:10cqw;background:#ffb04a') +
      I('bokeh', 'left:56cqw;top:60cqh;width:14cqw;background:#5db8ff') + I('bokeh', 'left:78cqw;top:68cqh;width:11cqw;background:#9a7bff') +
      I('bokeh', 'left:90cqw;top:55cqh;width:8cqw;background:#4be3b8') + I('window') +
      fall(drops(2, 26), 60, 60, 1.1, -4, '--dir:1;opacity:.55') + fall(drops(4, 20), 90, 90, 0.8, -6, '--dir:1;opacity:.85') + fall(drops(6, 12), 140, 140, 0.6, -9, '--dir:1;opacity:.5')) },

    { id: 'neige', name: 'Neige', html: () => wrap('neige', '',
      I('snowglow') + fall(flakes(1, 40, 1, 2.2), 50, 50, 14, -4, '--dir:1') + fall(flakes(2, 26, 1.8, 3.4), 80, 80, 10, 6, '--dir:1') + fall(flakes(3, 12, 3, 5.2), 120, 120, 7, -9, '--dir:1;filter:blur(.3cqw)') + I('snowground')) },

    { id: 'sakura', name: 'Cerisiers en fleurs', html: () => wrap('sakura',
      `--h1:${hills(61, 60, 14, '#4b1d44')};--h2:${hills(67, 40, 4, '#2a0f2a')}`,
      I('sakuramoon') + I('hills hl1') + I('hills hl2') + fall(petals(1, 9), 60, 60, 16, -8, '--dir:1') + fall(petals(2, 7), 95, 95, 11, 10, '--dir:1') + fall(petals(3, 5), 140, 140, 8, -12, '--dir:1;filter:blur(.25cqw)')) }
  ];

  window.sonoraScenes = {
    list: SCENES.map(({ id, name }) => ({ id, name })),
    html: (id) => { const s = SCENES.find((x) => x.id === id); return s ? s.html() : ''; }
  };
})();
