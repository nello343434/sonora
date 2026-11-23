// Sonora — fonds animés (Paramètres > Apparence > Fonds animés).
// Tout est dessiné en code (canvas) : décors pré-rendus avec du bruit fractal, parallaxe, lumières additives. Aucune image externe.
// ~30 images/s, en pause quand la fenêtre est cachée, une seule image fixe si « réduire les animations » est activé.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mixc = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mb = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ---------- bruit fractal ----------
  const hash = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, o, s) => { let a = .5, f = 1, sum = 0, n = 0; for (let i = 0; i < o; i++) { sum += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= .5; f *= 2.03; } return sum / n; };
  // image calculée pixel par pixel : fn(u, v, out) remplit out = [r,g,b,a] (0-255)
  function field(w, h, fn) {
    const c = cv(w, h), x = c.getContext('2d'), im = x.createImageData(c.width, c.height), d = im.data, o = [0, 0, 0, 0];
    let k = 0;
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { fn(i / c.width, j / c.height, o); d[k++] = o[0]; d[k++] = o[1]; d[k++] = o[2]; d[k++] = o[3]; }
    x.putImageData(im, 0, 0); return c;
  }
  const glowCache = new Map();
  function glowSprite(col, size = 96) {                       // halo doux réutilisable (dessiné avec drawImage)
    const k = col.join(',') + size; if (glowCache.has(k)) return glowCache.get(k);
    const c = cv(size, size), x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, rgba(col, 1)); g.addColorStop(.18, rgba(col, .55)); g.addColorStop(.5, rgba(col, .14)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, size, size); glowCache.set(k, c); return c;
  }
  const blit = (ctx, spr, x, y, r, a) => { ctx.globalAlpha = a; ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); };
  const vgrad = (ctx, W, H, stops, y0 = 0, y1 = H) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };

  // ---------- éléments de décor ----------
  function starLayer(W, H, seed, n, maxY, bright = 1) {
    const c = cv(W, H), x = c.getContext('2d'), r = mb(seed), u = Math.max(.6, H / 800);
    for (let i = 0; i < n; i++) {
      const m = Math.pow(r(), 4.5), t = r();
      const col = t < .14 ? [255, 205, 160] : t < .45 ? [255, 246, 238] : t < .8 ? [214, 228, 255] : [172, 200, 255];
      const sx = r() * W, sy = r() * maxY, rad = (.32 + m * 1.45) * u * .85;
      x.globalAlpha = clamp((.2 + .8 * m) * bright, 0, 1); x.fillStyle = rgba(col, 1);
      x.beginPath(); x.arc(sx, sy, rad, 0, TAU); x.fill();
      if (m > .8) { x.globalAlpha = (.18 + .3 * m) * bright; x.drawImage(glowSprite(col, 64), sx - rad * 7, sy - rad * 7, rad * 14, rad * 14); }
    }
    return c;
  }
  function ridge(ctx, W, H, base, amp, sc, seed, stops, jag = 1) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 4; x += 3) {
      const n = fbm(x / sc + seed * 7, seed, 5, seed) * 1.15 + fbm(x / (sc * .25) + seed, seed * 3, 3, seed + 5) * .18 * jag;
      ctx.lineTo(x, base - n * amp);
    }
    ctx.lineTo(W, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, base - amp * 1.1, 0, base + amp * .6);
    stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fill();
  }
  function pine(ctx, x, y, h, w, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - h);
    const tiers = 6;
    for (let i = 1; i <= tiers; i++) { const f = i / tiers, yy = y - h * (1 - f * .93), ww = w * (.18 + f * .82); ctx.lineTo(x + ww * .5, yy + h * .05); ctx.lineTo(x + ww * .22, yy + h * .02); }
    ctx.lineTo(x + w * .08, y); ctx.lineTo(x - w * .08, y);
    for (let i = tiers; i >= 1; i--) { const f = i / tiers, yy = y - h * (1 - f * .93), ww = w * (.18 + f * .82); ctx.lineTo(x - ww * .22, yy + h * .02); ctx.lineTo(x - ww * .5, yy + h * .05); }
    ctx.closePath(); ctx.fill();
  }
  function cloudSprite(w, h, seed, shade, lit, soft = 1) {
    const raw = cloudRaw(w, h, seed, shade, lit, soft), c = cv(w, h), x = c.getContext('2d');
    try { x.filter = 'blur(1.6px)'; } catch (e) {}
    x.drawImage(raw, 0, 0); x.filter = 'none'; return c;
  }
  function cloudRaw(w, h, seed, shade, lit, soft = 1) {
    return field(w, h, (u, v, o) => {
      const dx = (u - .5) * 2, dy = (v - .6) * 2.3;
      const m = 1 - (dx * dx * .95 + dy * dy * (dy > 0 ? 2.6 : 1.3));
      const n = fbm(u * 3 + seed, v * 2.4 + seed * 1.7, 4, seed | 0);
      const n2 = fbm(u * 3 + seed - .03, v * 2.4 + seed * 1.7 - .04, 4, seed | 0);
      const edge = Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 7), dens = sstep(.12, .12 + .5 * soft, m * 1.1 + (n - .5) * 1.5) * edge;
      const l = clamp(.62 - (n2 - n) * 4.5 + (.5 - v) * .5, 0, 1);
      const c = mixc(shade, lit, l);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = dens * 255;
    });
  }

  // ---------------------------------------------------------------- scènes
  const scenes = [];
  const add = (s) => scenes.push(s);

  // 1 — NUIT ÉTOILÉE : voie lactée, ciel qui tourne lentement, étoiles filantes, montagnes et sapins
  add({ id: 'etoiles', name: 'Nuit étoilée', preview: 'radial-gradient(circle at 70% 25%,#fff 0 1px,transparent 2px),linear-gradient(#04061a,#1b2f73)',
    make(W, H) {
      const u = H / 800, D = Math.round(Math.hypot(W / 2, H * 1.05) * 2.04), sky = cv(D, D), x = sky.getContext('2d');
      vgrad(x, D, D, [[0, '#02030c'], [.4, '#060b24'], [.62, '#0b1639'], [1, '#101e4a']]);
      const cx = D / 2, cy = D / 2 - H * .5, th = -.62, sg = H * .2;
      const mw = field(560, 560, (uu, vv, o) => {
        const X = uu * D, Y = vv * D, d = (X - cx) * Math.sin(th) - (Y - cy) * Math.cos(th), al = (X - cx) * Math.cos(th) + (Y - cy) * Math.sin(th);
        const wob = (fbm(uu * 5, vv * 5, 4, 3) - .5) * sg * 1.1, dd = (d + wob) / sg;
        let dens = Math.exp(-dd * dd) * (.55 + .7 * fbm(uu * 9, vv * 9, 5, 11));
        const lane = sstep(.5, .78, fbm(uu * 14 + 4, vv * 14, 4, 21)) * Math.exp(-dd * dd * 2.2);
        dens *= 1 - lane * .85; dens *= .6 + .6 * Math.exp(-1 * (al / (D * .22)) ** 2);
        const warm = clamp(Math.exp(-1 * (al / (D * .13)) ** 2) * 1.3 - .2, 0, 1), c = mixc([120, 150, 255], [255, 205, 170], warm);
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = clamp(dens * 210, 0, 255);
      });
      x.imageSmoothingEnabled = true; x.globalAlpha = .9; x.drawImage(mw, 0, 0, D, D); x.globalAlpha = 1;
      x.drawImage(starLayer(D, D, 7, Math.round(D * D / 560), D, 1), 0, 0);
      const tw = Array.from({ length: Math.round(W * H / 5200) }, () => ({ x: rnd(0, D), y: rnd(D / 2 - H * 1.1, D / 2 + H * .3), p: rnd(0, TAU), s: rnd(.7, 2.6), r: rnd(.5, 1.7) * Math.max(.7, u),
        c: Math.random() < .25 ? [255, 215, 170] : Math.random() < .5 ? [190, 210, 255] : [255, 255, 255] }));
      const fg = cv(W, H), f = fg.getContext('2d');
      const hz = f.createRadialGradient(W * .5, H * 1.02, 0, W * .5, H * 1.02, W * .7); hz.addColorStop(0, 'rgba(70,110,170,.42)'); hz.addColorStop(.5, 'rgba(40,70,130,.16)'); hz.addColorStop(1, 'rgba(40,70,130,0)');
      f.fillStyle = hz; f.fillRect(0, 0, W, H);
      ridge(f, W, H, H * .86, H * .2, W * .22, 3, [[0, '#1a2a52'], [1, '#0b1330']]);
      ridge(f, W, H, H * .93, H * .16, W * .16, 8, [[0, '#0d1731'], [1, '#050a1b']]);
      const r = mb(5); for (let i = 0; i < W / 26; i++) pine(f, r() * W * 1.04 - 10, H * (1.0 + r() * .02), (40 + r() * 70) * u * 1.3, (18 + r() * 16) * u * 1.3, '#03060f');
      return { sky, tw, D, fg, shoots: [], next: 1.5 };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.fillStyle = '#02030c'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W * .5, H * 1.05); ctx.rotate(t * .0032); ctx.translate(-st.D / 2, -st.D / 2);
      ctx.drawImage(st.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of st.tw) {
        const a = Math.pow(Math.sin(t * s.s + s.p) * .5 + .5, 2) * .9 + .1;
        blit(ctx, glowSprite(s.c, 64), s.x, s.y, s.r * (4 + 3 * a), a * .55);
        if (s.r > 1.3) { ctx.globalAlpha = a * .45; ctx.fillStyle = rgba(s.c, 1); ctx.fillRect(s.x - s.r * 6 * a, s.y - .4, s.r * 12 * a, .8); ctx.fillRect(s.x - .4, s.y - s.r * 6 * a, .8, s.r * 12 * a); }
      }
      ctx.restore(); ctx.globalAlpha = 1;
      st.next -= dt;
      if (st.next <= 0) { st.next = rnd(2.5, 6); const a = rnd(.35, .6); st.shoots.push({ x: rnd(W * .25, W * 1.0), y: rnd(0, H * .3), vx: -Math.cos(a) * rnd(700, 1100), vy: Math.sin(a) * rnd(700, 1100) * .55, age: 0, max: rnd(.8, 1.3), len: rnd(160, 300) }); }
      st.shoots = st.shoots.filter((s) => s.age < s.max);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of st.shoots) {
        s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt;
        const k = Math.min(1, s.age / s.max), a = Math.pow(Math.max(0, Math.sin(Math.PI * k)), 1.5), m = Math.hypot(s.vx, s.vy), tx = s.x - s.vx / m * s.len * a, ty = s.y - s.vy / m * s.len * a;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.25, `rgba(190,215,255,${a * .5})`); g.addColorStop(1, 'rgba(120,160,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
        blit(ctx, glowSprite([220, 235, 255]), s.x, s.y, 14, a * .9);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(st.fg, 0, 0);
    } });

  // 2 — CIEL BLEU ET NUAGES : cumulus modelés par la lumière, soleil, voile de brume
  add({ id: 'ciel', name: 'Ciel bleu et nuages', preview: 'radial-gradient(circle at 30% 70%,#fff 0 12%,transparent 13%),linear-gradient(#2272d8,#bfe3ff)',
    make(W, H) {
      const bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#1767d0'], [.35, '#3e8fe6'], [.7, '#8cc5f4'], [1, '#dcefff']]);
      const sx = W * .8, sy = H * .16;
      x.globalCompositeOperation = 'lighter';
      x.drawImage(glowSprite([255, 244, 214], 256), sx - W * .6, sy - W * .6, W * 1.2, W * 1.2); x.globalAlpha = .9;
      x.drawImage(glowSprite([255, 250, 235], 128), sx - 90, sy - 90, 180, 180); x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      const spr = [0, 1, 2, 3, 4].map((i) => cloudSprite(420, 210, 3 + i * 5.3, [112, 140, 190], [255, 255, 255]));
      const cir = field(480, 120, (uu, vv, o) => { const n = fbm(uu * 3, vv * 12, 5, 9); o[0] = 255; o[1] = 255; o[2] = 255; o[3] = sstep(.5, .85, n) * 110 * Math.exp(-1 * ((vv - .5) * 2.2) ** 2); });
      const clouds = Array.from({ length: 15 }, (_, i) => { const z = i / 14, sc = lerp(.55, 1.9, z); return { s: spr[i % 5], z, w: 420 * sc * (W / 1280), h: 210 * sc * (W / 1280), x: rnd(-300, W + 100), y: lerp(H * .14, H * .66, Math.pow(z, 1.2)) + rnd(-40, 40), v: lerp(5, 26, z) * (W / 1280), a: lerp(.5, .98, z), f: Math.random() < .5 }; })
        .sort((a, b) => a.z - b.z);
      const hz = cv(W, H), h = hz.getContext('2d'); vgrad(h, W, H, [[0, 'rgba(230,242,255,0)'], [.72, 'rgba(230,242,255,.0)'], [1, 'rgba(235,246,255,.7)']]);
      return { bgc, clouds, cir, hz, sx, sy };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      ctx.globalAlpha = .55; ctx.drawImage(st.cir, (t * 3) % (W * 1.3) - W * .3, H * .05, W * 1.2, H * .22); ctx.drawImage(st.cir, (t * 3) % (W * 1.3) - W * 1.6, H * .12, W * 1.2, H * .2);
      for (const c of st.clouds) {
        c.x += c.v * dt; if (c.x > W + 40) { c.x = -c.w - 40; c.y += rnd(-30, 30); }
        ctx.globalAlpha = c.a; ctx.drawImage(c.s, c.x, c.y + Math.sin(t * .2 + c.z * 9) * 4, c.w, c.h);
      }
      ctx.globalAlpha = 1; ctx.drawImage(st.hz, 0, 0);
    } });

  // 3 — AURORE BORÉALE : rideaux de lumière qui ondulent au-dessus d'un lac gelé
  add({ id: 'aurore', name: 'Aurore boréale', preview: 'linear-gradient(115deg,transparent 30%,#2dffa0 50%,#8a63ff 70%,transparent),linear-gradient(#02060f,#0a2038)',
    make(W, H) {
      const bgc = cv(W, H), x = bgc.getContext('2d'), u = H / 800;
      vgrad(x, W, H, [[0, '#01040a'], [.5, '#06142a'], [.78, '#0c2540'], [1, '#05101f']]);
      x.drawImage(starLayer(W, H, 21, Math.round(W * H / 1500), H * .75, .85), 0, 0);
      const wy = H * .84;
      ridge(x, W, H, wy, H * .17, W * .25, 12, [[0, '#2a4468'], [.18, '#122238'], [1, '#050c18']]);
      const r = mb(9); for (let i = 0; i < W / 22; i++) pine(x, r() * W, wy + r() * H * .012, (36 + r() * 80) * u * 1.25, (16 + r() * 15) * u * 1.25, '#030a12');
      x.fillStyle = '#071326'; x.fillRect(0, wy, W, H - wy);
      const ramp = (stops) => { const c = cv(1, 256), q = c.getContext('2d'), g = q.createLinearGradient(0, 0, 0, 256); stops.forEach(([o, col]) => g.addColorStop(o, col)); q.fillStyle = g; q.fillRect(0, 0, 1, 256); return c; };
      const ramps = [ramp([[0, 'rgba(110,70,255,0)'], [.35, 'rgba(70,200,255,.45)'], [.78, 'rgba(70,255,160,.95)'], [1, 'rgba(210,255,190,.0)']]),
        ramp([[0, 'rgba(255,90,200,0)'], [.4, 'rgba(150,90,255,.4)'], [.8, 'rgba(90,255,200,.8)'], [1, 'rgba(90,255,200,0)']])];
      const lw = Math.round(W / 3), lh = Math.round(H / 3), A = cv(lw, lh);
      return { bgc, wy, ramps, A, lw, lh, tw: Array.from({ length: 30 }, () => ({ x: rnd(0, W), y: rnd(0, H * .6), p: rnd(0, TAU), s: rnd(1, 3) })) };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      const a = st.A.getContext('2d'), lw = st.lw, lh = st.lh;
      a.clearRect(0, 0, lw, lh); a.globalCompositeOperation = 'lighter';
      [[0, .46, 1.0, .9], [1, .38, 1.4, .6], [0, .54, .7, .5]].forEach(([ri, by, fr, al], k) => {
        const ramp = st.ramps[ri];
        for (let X = 0; X < lw; X += 1.5) {
          const nx = X / lw, y0 = lh * (by + Math.sin(nx * 3.2 * fr + t * .21 + k * 2) * .06 + Math.sin(nx * 7.1 * fr - t * .33 + k) * .025 + (fbm(nx * 2 + t * .05, k * 3, 3, 4) - .5) * .12);
          const hh = lh * (.2 + .34 * sstep(.25, .8, fbm(nx * 3.2 + t * .08 + k * 9, t * .05, 3, 8 + k))) * (.7 + .3 * Math.sin(nx * 5 + t * .4 + k));
          const ray = .55 + .45 * vnoise(nx * 55 + k * 7, t * .5, 5);
          a.globalAlpha = al * ray * sstep(0, .08, nx) * sstep(1, .92, nx);
          a.drawImage(ramp, 0, 0, 1, 256, X, y0 - hh, 1.8, hh);
        }
      });
      ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1; ctx.drawImage(st.A, 0, 0, W, H);
      ctx.globalAlpha = .55; ctx.drawImage(st.A, -4, -2, W + 8, H + 4);
      // reflet sur le lac
      ctx.save(); ctx.beginPath(); ctx.rect(0, st.wy, W, H - st.wy); ctx.clip();
      ctx.globalAlpha = .5; ctx.translate(0, st.wy * 1.3); ctx.scale(1, -.3); ctx.drawImage(st.A, 0, 0, W, H);
      ctx.restore(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    } });

  // 4 — ORAGE DE NUIT : nuages lourds, pluie en profondeur, éclairs ramifiés qui éclairent le ciel
  add({ id: 'orage', name: 'Orage de nuit', preview: 'linear-gradient(110deg,transparent 48%,#cfe0ff 50%,transparent 52%),linear-gradient(#10151f,#2a3550)',
    make(W, H) {
      const u = H / 800, bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#070a12'], [.5, '#111827'], [1, '#1d2740']]);
      const spr = [0, 1, 2, 3].map((i) => cloudSprite(520, 240, 40 + i * 6.1, [14, 19, 30], [92, 106, 136], .9));
      const clouds = Array.from({ length: 14 }, (_, i) => ({ s: spr[i % 4], x: rnd(-300, W), y: rnd(-60, H * .42), w: rnd(520, 900) * (W / 1280), h: rnd(240, 400) * (W / 1280), v: rnd(6, 22), a: rnd(.7, 1) }));
      const fg = cv(W, H), f = fg.getContext('2d');
      ridge(f, W, H, H * .9, H * .12, W * .2, 31, [[0, '#0f1623'], [1, '#04070d']]);
      const r = mb(77); for (let i = 0; i < W / 40; i++) pine(f, r() * W, H * (1.0 + r() * .02), (50 + r() * 80) * u, (22 + r() * 18) * u, '#03060b');
      const layer = (n, len, sp, al, lw) => Array.from({ length: n }, () => ({ x: rnd(-100, W + 100), y: rnd(0, H), l: len * rnd(.7, 1.3), v: sp * rnd(.85, 1.15), al, lw }));
      const A = W * H / 7500;
      return { bgc, clouds, fg, drops: [layer(A * .7, 14 * u, 900, .22, 1), layer(A * .5, 22 * u, 1300, .32, 1.3), layer(A * .22, 36 * u, 1900, .45, 1.8)], bolts: [], flash: 0, next: 1.5 };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      for (const c of st.clouds) { c.x += c.v * dt; if (c.x > W + 50) c.x = -c.w - 50; ctx.globalAlpha = c.a; ctx.drawImage(c.s, c.x, c.y, c.w, c.h); }
      ctx.globalAlpha = 1;
      st.next -= dt;
      if (st.next <= 0) {
        st.next = rnd(3, 7); const x0 = rnd(W * .15, W * .85), segs = [];
        const bolt = (xa, ya, xb, yb, d, dep) => {
          if (d < 4) { segs.push([xa, ya, xb, yb, dep]); return; }
          const mx = (xa + xb) / 2 + (Math.random() - .5) * d, my = (ya + yb) / 2 + (Math.random() - .5) * d * .25;
          bolt(xa, ya, mx, my, d / 2, dep); bolt(mx, my, xb, yb, d / 2, dep);
          if (dep < 2 && Math.random() < .16) bolt(mx, my, mx + (Math.random() - .5) * d * 3.2, my + rnd(40, 220), d / 2.2, dep + 1);
        };
        bolt(x0, -10, x0 + rnd(-140, 140), H * rnd(.7, .88), 190, 0);
        st.bolts.push({ segs, age: 0, max: .55, x: x0 }); st.flash = 1;
        if (Math.random() < .6) setTimeout(() => { st.flash = Math.max(st.flash, .7); }, 140);
      }
      st.flash *= Math.pow(.02, dt);
      ctx.globalCompositeOperation = 'lighter';
      if (st.flash > .02) {
        const g = ctx.createLinearGradient(0, 0, 0, H * .8); g.addColorStop(0, `rgba(150,175,235,${st.flash * .42})`); g.addColorStop(1, 'rgba(150,175,235,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      st.bolts = st.bolts.filter((b) => b.age < b.max);
      for (const b of st.bolts) {
        b.age += dt; const k = b.age / b.max, a = (k < .12 ? 1 : k < .22 ? .35 : k < .3 ? .9 : Math.max(0, 1 - k) * .6);
        for (const [pass, lw, al, col] of [[0, 9, .12, '150,180,255'], [1, 3.4, .35, '190,210,255'], [2, 1.5, 1, '255,255,255']]) {
          ctx.strokeStyle = `rgba(${col},${al * a})`; ctx.lineCap = 'round'; ctx.beginPath();
          for (const s of b.segs) { ctx.lineWidth = lw * (s[4] ? .55 : 1); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(st.fg, 0, 0);
      const wind = -.2;
      st.drops.forEach((L, li) => {
        ctx.strokeStyle = `rgba(190,205,235,${L[0].al + st.flash * .12})`; ctx.lineWidth = L[0].lw; ctx.beginPath();
        for (const d of L) {
          d.y += d.v * dt; d.x += d.v * dt * wind; if (d.y > H) { d.y = -d.l; d.x = rnd(-100, W + 100); }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * wind, d.y - d.l);
        }
        ctx.stroke();
      });
    } });

  // 5 — COUCHER DE SOLEIL : ciel embrasé, nuages éclairés par-dessous, mer et reflet scintillant, oiseaux
  add({ id: 'couchant', name: 'Coucher de soleil', preview: 'linear-gradient(#2b1b5a,#c8456f 55%,#ffb26a 75%,#5a2a6a 76%,#1a1040)',
    make(W, H) {
      const hy = H * .66, bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#140e3d'], [.22, '#3a2073'], [.42, '#a43d7e'], [.58, '#ee6a62'], [.66, '#ffa95c'], [.66, '#ffd08a'], [1, '#7a2f6b']], 0, H);
      const sx = W * .5, sy = hy - H * .02;
      x.globalCompositeOperation = 'lighter';
      x.drawImage(glowSprite([255, 150, 80], 256), sx - W * .55, sy - W * .55, W * 1.1, W * 1.1); x.globalAlpha = .8;
      x.drawImage(glowSprite([255, 220, 150], 128), sx - H * .3, sy - H * .3, H * .6, H * .6); x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, H * .085); g.addColorStop(0, '#fff6d8'); g.addColorStop(.7, '#ffd38a'); g.addColorStop(1, '#ffb25f');
      x.save(); x.beginPath(); x.rect(0, 0, W, hy); x.clip(); x.fillStyle = g; x.beginPath(); x.arc(sx, sy, H * .085, 0, TAU); x.fill(); x.restore();
      ridge(x, W, H, hy + 2, H * .06, W * .3, 61, [[0, 'rgba(70,32,92,.95)'], [1, 'rgba(60,24,80,.95)']], 1.2);
      const sea = cv(W, H - hy), s = sea.getContext('2d');
      vgrad(s, W, H - hy, [[0, '#d0586c'], [.12, '#8f3a78'], [.5, '#4b1f66'], [1, '#1a0f3d']]);
      const spr = [0, 1, 2, 3].map((i) => cloudSprite(520, 160, 70 + i * 4.7, [110, 50, 110], [255, 170, 120], 1));
      const clouds = Array.from({ length: 10 }, (_, i) => { const z = i / 9; return { s: spr[i % 4], x: rnd(-200, W), y: lerp(H * .08, hy - H * .12, 1 - z) + rnd(-20, 20), w: lerp(420, 900, 1 - z) * (W / 1280), h: lerp(90, 200, 1 - z) * (W / 1280), v: lerp(4, 12, z), a: .95 }; });
      const birds = Array.from({ length: 7 }, (_, i) => ({ x: -60 - i * 40, y: H * .3 + Math.sin(i * 1.7) * 26 + i * 6, ph: i * .7 }));
      return { bgc, sea, hy, sx, clouds, birds, W };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0, W, H);
      for (const c of st.clouds) { c.x += c.v * dt; if (c.x > W + 30) c.x = -c.w - 30; ctx.globalAlpha = c.a; ctx.drawImage(c.s, c.x, c.y, c.w, c.h); }
      ctx.globalAlpha = 1; const hy = st.hy;
      ctx.drawImage(st.sea, 0, hy);
      ctx.globalCompositeOperation = 'lighter';
      // reflet : traînée de scintillements qui s'élargit vers le spectateur
      for (let i = 0; i < 90; i++) {
        const f = (i + 1) / 90, y = hy + f * f * (H - hy) * .98 + 2, wv = (8 + f * 230) * (W / 1280), nn = vnoise(i * 1.7, t * .9 + i, 3);
        const a = sstep(.35, .9, nn) * (1 - f * .55) * .8, off = (vnoise(i * .7, t * .3, 6) - .5) * wv * .5;
        ctx.fillStyle = `rgba(255,${190 + f * 30 | 0},${120 + f * 40 | 0},${a})`; ctx.fillRect(st.sx + off - wv * .5, y, wv, 1.4 + f * 3.2);
      }
      blit(ctx, glowSprite([255, 170, 100]), st.sx, hy + 6, H * .35, .22);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(25,10,40,.85)'; ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(30,12,48,.9)'; ctx.lineCap = 'round';
      for (const b of st.birds) {
        b.x += 46 * dt; if (b.x > W + 60) b.x = -80; const fl = Math.sin(t * 7 + b.ph) * 5 + 1;
        ctx.beginPath(); ctx.moveTo(b.x - 9, b.y - fl); ctx.quadraticCurveTo(b.x - 4, b.y - fl * .2 - 3, b.x, b.y); ctx.quadraticCurveTo(b.x + 4, b.y - fl * .2 - 3, b.x + 9, b.y - fl); ctx.stroke();
      }
    } });

  // 6 — FONDS MARINS : caustiques en temps réel, rayons de lumière, bancs de poissons, algues, bulles
  add({ id: 'ocean', name: 'Fonds marins', preview: 'linear-gradient(105deg,transparent 40%,rgba(160,230,255,.35) 50%,transparent 60%),linear-gradient(#0a5a86,#021226)',
    make(W, H) {
      const u = H / 800, bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#17a0c6'], [.18, '#0b7aa6'], [.55, '#064b78'], [1, '#020f26']]);
      const cw = 176, chh = Math.round(176 * H / W), C = cv(cw, chh);
      const sand = cv(W, H), s = sand.getContext('2d');
      ridge(s, W, H, H * .93, H * .06, W * .3, 41, [[0, '#0d3d57'], [1, '#04162b']]);
      const fish = []; for (let g = 0; g < 4; g++) { const n = 7 + (Math.random() * 6 | 0), cx = rnd(0, W), cy = rnd(H * .2, H * .68), v = rnd(30, 70) * (Math.random() < .5 ? -1 : 1), sz = rnd(.8, 1.7) * u * 1.15, d = rnd(.5, 1);
        for (let i = 0; i < n; i++) fish.push({ x: cx + rnd(-90, 90), y: cy + rnd(-45, 45), v: v * rnd(.9, 1.1), ph: rnd(0, TAU), sz: sz * rnd(.85, 1.15), d }); }
      const weeds = Array.from({ length: Math.round(W / 40) }, () => ({ x: rnd(0, W), h: rnd(.08, .24) * H, ph: rnd(0, TAU), w: rnd(4, 9) * u, c: Math.random() }));
      const bub = Array.from({ length: 36 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.5, 5.5) * u, v: rnd(24, 70), ph: rnd(0, TAU) }));
      const snow = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), v: rnd(4, 14), a: rnd(.1, .35), r: rnd(.6, 1.6) }));
      return { bgc, sand, C, cw, chh, fish, weeds, bub, snow, u };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      // rayons
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const bx = (i + .5) / 7 * W * 1.25 - W * .1 + Math.sin(t * .13 + i * 1.9) * 50, w = 70 + 60 * Math.sin(i * 3.1) ** 2, sk = H * .32, a = (.05 + .04 * Math.sin(t * .35 + i * 2.2)) * (W / 1280 > 1 ? 1 : 1);
        const g = ctx.createLinearGradient(0, 0, 0, H * .95); g.addColorStop(0, `rgba(170,240,255,${a * 2.1})`); g.addColorStop(.7, `rgba(120,200,240,${a * .6})`); g.addColorStop(1, 'rgba(120,200,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - w * .25, 0); ctx.lineTo(bx + w * .25, 0); ctx.lineTo(bx + w + sk, H * .95); ctx.lineTo(bx - w + sk, H * .95); ctx.closePath(); ctx.fill();
      }
      // caustiques
      const c = st.C.getContext('2d'), im = c.createImageData(st.cw, st.chh), d = im.data, T = t * .55;
      let k = 0;
      for (let j = 0; j < st.chh; j++) for (let i = 0; i < st.cw; i++) {
        let px = i / st.cw * 12 - 6, py = j / st.chh * 7 - 3.5, ix = px, iy = py, cc = 0;
        for (let n = 1; n <= 3; n++) { const tt = T * (1 - .5 / n); ix = px + Math.cos(tt - ix) + Math.sin(tt + iy); iy = py + Math.sin(tt - iy) + Math.cos(tt + ix); cc += 1 / Math.hypot(px / (Math.sin(ix + tt) * 2.2 + 3), py / (Math.cos(iy + tt) * 2.2 + 3)); }
        cc /= 3; const v = Math.pow(clamp(1.3 - cc * 1.05, 0, 1), 7) * (1 - j / st.chh * .75);
        d[k++] = 190; d[k++] = 245; d[k++] = 255; d[k++] = clamp(v * 400, 0, 200);
      }
      c.putImageData(im, 0, 0); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = .55; ctx.drawImage(st.C, 0, 0, W, H); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // poussière marine
      ctx.fillStyle = '#bfe9ff'; for (const p of st.snow) { p.y += p.v * dt; p.x += Math.sin(t * .4 + p.y * .01) * .15; if (p.y > H) p.y = 0; ctx.globalAlpha = p.a; ctx.fillRect(p.x, p.y, p.r, p.r); }
      // poissons
      for (const f of st.fish) {
        f.x += f.v * dt; if (f.v > 0 && f.x > W + 40) f.x = -40; if (f.v < 0 && f.x < -40) f.x = W + 40;
        const dir = Math.sign(f.v), yy = f.y + Math.sin(t * 1.6 + f.ph) * 6, s = f.sz * 9, wag = Math.sin(t * 9 + f.ph) * .5;
        ctx.globalAlpha = .28 + .5 * f.d; ctx.fillStyle = f.d > .75 ? '#0a2b45' : '#0e4568';
        ctx.save(); ctx.translate(f.x, yy); ctx.scale(dir, 1);
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * .38, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * .8, 0); ctx.lineTo(-s * 1.5, -s * (.34 + wag * .3)); ctx.lineTo(-s * 1.5, s * (.34 - wag * .3)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(180,235,255,.35)'; ctx.beginPath(); ctx.ellipse(s * .1, -s * .1, s * .62, s * .12, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.drawImage(st.sand, 0, 0);
      // algues
      for (const w of st.weeds) {
        const by = H * .975, col = w.c < .5 ? '#0b4a3c' : '#0a5a4a'; ctx.strokeStyle = col; ctx.lineWidth = w.w; ctx.lineCap = 'round'; ctx.globalAlpha = .9;
        ctx.beginPath(); ctx.moveTo(w.x, by);
        const sw = Math.sin(t * .8 + w.ph) * w.h * .22; ctx.bezierCurveTo(w.x + sw * .4, by - w.h * .35, w.x + sw, by - w.h * .65, w.x + sw * 1.3, by - w.h); ctx.stroke();
      }
      // bulles
      ctx.globalAlpha = 1;
      for (const b of st.bub) {
        b.y -= b.v * dt; if (b.y < -10) { b.y = H + 10; b.x = rnd(0, W); }
        const x = b.x + Math.sin(t * 1.2 + b.ph) * 7;
        ctx.strokeStyle = 'rgba(210,245,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(x - b.r * .35, b.y - b.r * .35, b.r * .25, 0, TAU); ctx.fill();
      }
      const vg = ctx.createRadialGradient(W / 2, H * .45, H * .3, W / 2, H * .5, H * .95); vg.addColorStop(0, 'rgba(0,10,30,0)'); vg.addColorStop(1, 'rgba(0,10,30,.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    } });

  // 7 — NEIGE : nuit d'hiver, flocons en trois plans (bokeh au premier plan), lune, cabane éclairée
  add({ id: 'neige', name: 'Neige', preview: 'radial-gradient(circle at 25% 30%,#fff 0 1.5px,transparent 2.5px),radial-gradient(circle at 70% 60%,#fff 0 1.5px,transparent 2.5px),linear-gradient(#0b1432,#4a70b0)',
    make(W, H) {
      const u = H / 800, bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#050a1e'], [.45, '#12234f'], [.75, '#2c4a86'], [1, '#4a6aa6']]);
      x.drawImage(starLayer(W, H, 5, Math.round(W * H / 3000), H * .6, .8), 0, 0);
      const mx = W * .24, my = H * .2; x.globalCompositeOperation = 'lighter';
      x.drawImage(glowSprite([170, 200, 255], 256), mx - 260 * u, my - 260 * u, 520 * u, 520 * u); x.globalCompositeOperation = 'source-over';
      const g = x.createRadialGradient(mx - 6, my - 6, 0, mx, my, 38 * u); g.addColorStop(0, '#fffef6'); g.addColorStop(1, '#d6e4ff'); x.fillStyle = g; x.beginPath(); x.arc(mx, my, 36 * u, 0, TAU); x.fill();
      ridge(x, W, H, H * .72, H * .12, W * .22, 51, [[0, '#7f9ad0'], [1, '#3a5388']]);
      ridge(x, W, H, H * .8, H * .1, W * .2, 52, [[0, '#9db4e0'], [.4, '#586fa6'], [1, '#2a3d70']]);
      const r = mb(3); for (let i = 0; i < W / 34; i++) pine(x, r() * W, H * (.83 + r() * .06), (36 + r() * 56) * u * 1.2, (16 + r() * 13) * u * 1.2, '#0c1a38');
      ridge(x, W, H, H * .9, H * .07, W * .26, 53, [[0, '#eaf2ff'], [.2, '#b9ccee'], [1, '#6b84b8']]);
      // cabane
      const hx = W * .72, hyy = H * .875, sz = u * 1.1;
      x.fillStyle = '#1a1a2e'; x.fillRect(hx, hyy - 34 * sz, 58 * sz, 34 * sz);
      x.beginPath(); x.moveTo(hx - 7 * sz, hyy - 34 * sz); x.lineTo(hx + 29 * sz, hyy - 62 * sz); x.lineTo(hx + 65 * sz, hyy - 34 * sz); x.closePath(); x.fillStyle = '#e9f0ff'; x.fill();
      x.fillStyle = '#ffc75f'; x.fillRect(hx + 10 * sz, hyy - 25 * sz, 14 * sz, 13 * sz); x.fillRect(hx + 36 * sz, hyy - 25 * sz, 12 * sz, 13 * sz);
      x.globalCompositeOperation = 'lighter'; x.drawImage(glowSprite([255, 170, 70], 96), hx - 18 * sz, hyy - 50 * sz, 100 * sz, 90 * sz); x.globalCompositeOperation = 'source-over';
      ridge(x, W, H, H * .965, H * .035, W * .3, 54, [[0, '#f4f8ff'], [1, '#9db3dc']]);
      const bk = glowSprite([255, 255, 255], 96);
      const flakes = (n, rmin, rmax, vmin, vmax, a) => Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(rmin, rmax) * u, v: rnd(vmin, vmax), ph: rnd(0, TAU), a: a * rnd(.6, 1) }));
      return { bgc, bk, L: [flakes(W * H / 9000, 1, 2.2, 28, 55, .75), flakes(W * H / 22000, 2.2, 4, 55, 95, .8), flakes(W * H / 90000, 8, 20, 90, 150, .22)] };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      st.L.forEach((L, li) => {
        for (const f of L) {
          f.y += f.v * dt; f.x += (Math.sin(t * .6 + f.ph) * 22 + 14 + li * 6) * dt; if (f.y > H + 20) { f.y = -20; f.x = rnd(-40, W); } if (f.x > W + 30) f.x = -30;
          blit(ctx, st.bk, f.x, f.y, f.r * (li === 2 ? 1 : 2.2), f.a * (li === 2 ? 1 : .9));
        }
      });
      ctx.globalAlpha = 1;
    } });

  // 8 — GALAXIE : spirale à deux bras (60 000 étoiles), poussière, nébuleuses, rotation lente
  add({ id: 'galaxie', name: 'Galaxie', preview: 'radial-gradient(ellipse 60% 25% at 50% 50%,#ffe9b8,#7a6bff 45%,transparent 70%),#05020f',
    make(W, H) {
      const R = Math.round(Math.min(W * .62, H * 1.05)), S = R * 2, gal = cv(S, S), g = gal.getContext('2d'), r = mb(99);
      g.globalCompositeOperation = 'lighter';
      const N = 70000;
      for (let i = 0; i < N; i++) {
        const rr = Math.pow(r(), .62) * R * .94, arm = (r() < .5 ? 0 : Math.PI), th = arm + rr / R * 5.6 + (r() + r() + r() - 1.5) * (.55 - rr / R * .22) + (r() < .08 ? r() * TAU : 0);
        const x = S / 2 + Math.cos(th) * rr, y = S / 2 + Math.sin(th) * rr, f = rr / R;
        let col = mixc([255, 232, 196], [150, 182, 255], sstep(.08, .6, f)); if (r() < .05 && f > .25) col = [255, 130, 190];
        g.fillStyle = rgba(col, (.1 + r() * .6) * (1 - f * .55)); const sz = r() < .05 ? 2.1 : r() < .3 ? 1.4 : .9; g.fillRect(x, y, sz, sz);
      }
      for (let i = 0; i < 360; i++) { const rr = Math.pow(r(), .8) * R * .8, th = (r() < .5 ? 0 : Math.PI) + rr / R * 5.6 + (r() - .5) * .5, x = S / 2 + Math.cos(th) * rr, y = S / 2 + Math.sin(th) * rr;
        g.globalAlpha = .1 + r() * .12; g.drawImage(glowSprite(r() < .6 ? [110, 150, 255] : [255, 120, 190], 64), x - 26, y - 26, 52, 52); }
      g.globalAlpha = 1;
      g.drawImage(glowSprite([255, 214, 150], 256), S / 2 - R * .42, S / 2 - R * .42, R * .84, R * .84);
      g.globalAlpha = .85; g.drawImage(glowSprite([255, 244, 220], 128), S / 2 - R * .14, S / 2 - R * .14, R * .28, R * .28); g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      const dust = field(256, 256, (uu, vv, o) => { const dx = (uu - .5) * 2, dy = (vv - .5) * 2, rr = Math.hypot(dx, dy); let th = Math.atan2(dy, dx); const sp = (th - rr * 5.6 * .94 + 40 * Math.PI) % Math.PI; const lane = Math.exp(-1 * ((sp - .32) / .13) ** 2);
        o[0] = 6; o[1] = 4; o[2] = 16; o[3] = lane * sstep(.12, .45, rr) * sstep(1, .6, rr) * (.4 + .6 * fbm(uu * 12, vv * 12, 4, 7)) * 150; });
      g.drawImage(dust, 0, 0, S, S);
      const bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#02010a'], [.5, '#06031a'], [1, '#0a0522']]);
      const neb = (seed, c1, c2) => field(300, 170, (uu, vv, o) => { const n = fbm(uu * 3 + seed, vv * 3, 5, seed | 0), m = Math.pow(sstep(.42, .8, n), 1.5), c = mixc(c1, c2, fbm(uu * 2, vv * 2, 3, 9 + seed)); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = m * 130; });
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = .5; x.imageSmoothingEnabled = true; x.drawImage(neb(2, [90, 40, 200], [200, 60, 170]), 0, 0, W, H); x.globalAlpha = .32; x.drawImage(neb(11.7, [30, 100, 220], [80, 40, 190]), 0, 0, W, H);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.drawImage(starLayer(W, H, 8, Math.round(W * H / 1700), H, .9), 0, 0);
      const tw = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), p: rnd(0, TAU), s: rnd(.6, 2.4), r: rnd(.7, 1.8) }));
      return { gal, S, bgc, tw, shoots: [], next: 4 };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of st.tw) blit(ctx, glowSprite([220, 230, 255], 48), s.x, s.y, s.r * 4, (Math.sin(t * s.s + s.p) * .5 + .5) * .55);
      ctx.save(); ctx.translate(W * .5, H * .5); ctx.rotate(-.42); ctx.scale(1, .5); ctx.rotate(t * .035); ctx.globalAlpha = .95; ctx.drawImage(st.gal, -st.S / 2, -st.S / 2); ctx.restore();
      st.next -= dt;
      if (st.next <= 0) { st.next = rnd(5, 11); st.shoots.push({ x: rnd(W * .3, W), y: rnd(0, H * .4), vx: -rnd(600, 900), vy: rnd(250, 450), age: 0, max: 1.1 }); }
      st.shoots = st.shoots.filter((s) => s.age < s.max);
      for (const s of st.shoots) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; const a = Math.max(0, Math.sin(Math.PI * Math.min(1, s.age / s.max))), m = Math.hypot(s.vx, s.vy), tx = s.x - s.vx / m * 220 * a, ty = s.y - s.vy / m * 220 * a;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(150,170,255,0)'); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    } });

  // 9 — FORÊT AUX LUCIOLES : troncs en profondeur, rayons de lune, brume, lucioles qui clignotent
  add({ id: 'lucioles', name: 'Forêt aux lucioles', preview: 'radial-gradient(circle at 30% 40%,#d9ff7a 0 2px,transparent 6px),radial-gradient(circle at 70% 55%,#d9ff7a 0 2px,transparent 6px),linear-gradient(#06141a,#0c2a26)',
    make(W, H) {
      const u = H / 800, bgc = cv(W, H), x = bgc.getContext('2d'), r = mb(14);
      vgrad(x, W, H, [[0, '#031014'], [.45, '#0a2a2e'], [.8, '#0d3a34'], [1, '#07201c']]);
      x.globalCompositeOperation = 'lighter'; x.drawImage(glowSprite([120, 200, 190], 256), W * .55 - W * .5, -H * .45, W, H * 1.2); x.globalCompositeOperation = 'source-over';
      const col = (k) => { const d = [[18, 66, 62], [11, 46, 44], [6, 30, 30], [3, 17, 18]][k]; return `rgb(${d[0]},${d[1]},${d[2]})`; };
      const lay = (k, n, wmin, wmax, hz) => {
        for (let i = 0; i < n; i++) {
          const px = (i + r() * .8) / n * (W + 120) - 60, w = (wmin + r() * (wmax - wmin)) * u, lean = (r() - .5) * 26 * u;
          const g = x.createLinearGradient(px - w, 0, px + w, 0); g.addColorStop(0, col(k)); g.addColorStop(1, `rgb(${[8, 6, 4, 2][k]},${[40, 30, 20, 12][k]},${[38, 28, 20, 12][k]})`);
          x.fillStyle = g; x.beginPath(); x.moveTo(px - w * .8 + lean, -10); x.lineTo(px + w * .8 + lean, -10); x.lineTo(px + w * 1.15, H + 10); x.lineTo(px - w * 1.15, H + 10); x.closePath(); x.fill();
        }
        // feuillage en haut
        for (let i = 0; i < n * 4; i++) { x.fillStyle = col(k); x.globalAlpha = .9; x.beginPath(); x.ellipse(r() * W, r() * H * (.1 + k * .03), (50 + r() * 90) * u, (14 + r() * 36) * u, 0, 0, TAU); x.fill(); }
        x.globalAlpha = 1;
      };
      lay(0, Math.round(W / 130), 8, 16); lay(1, Math.round(W / 190), 14, 26);
      const fog = x.createLinearGradient(0, H * .5, 0, H); fog.addColorStop(0, 'rgba(70,150,140,0)'); fog.addColorStop(1, 'rgba(70,150,140,.32)'); x.fillStyle = fog; x.fillRect(0, H * .5, W, H * .5);
      lay(2, Math.round(W / 280), 24, 42);
      const ground = x.createLinearGradient(0, H * .88, 0, H); ground.addColorStop(0, 'rgba(2,14,12,0)'); ground.addColorStop(1, 'rgba(2,12,10,.95)'); x.fillStyle = ground; x.fillRect(0, H * .88, W, H * .12);
      const mist = field(512, 128, (uu, vv, o) => { const n = fbm(uu * 4, vv * 3, 5, 3); o[0] = 130; o[1] = 210; o[2] = 200; o[3] = sstep(.4, .8, n) * 120 * Math.exp(-1 * ((vv - .55) * 2.4) ** 2); });
      const trunks = cv(W, H); trunks.getContext('2d').drawImage(bgc, 0, 0);
      const ff = Array.from({ length: Math.round(W * H / 14000) }, () => ({ x: rnd(0, W), y: rnd(H * .25, H * .95), a: rnd(40, 160), b: rnd(30, 90), fx: rnd(.1, .35), fy: rnd(.12, .3), ph: rnd(0, TAU), bl: rnd(.4, 1.2), s: rnd(.6, 1.6) * u }));
      const shafts = Array.from({ length: 5 }, (_, i) => ({ x: W * (.25 + i * .14) + rnd(-30, 30), w: rnd(50, 130), ph: rnd(0, TAU) }));
      return { bgc, mist, ff, shafts, W };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of st.shafts) { const a = .05 + .035 * Math.sin(t * .3 + s.ph); const g = ctx.createLinearGradient(0, 0, 0, H * .9); g.addColorStop(0, `rgba(170,240,220,${a * 1.7})`); g.addColorStop(1, 'rgba(170,240,220,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(s.x - s.w * .3, 0); ctx.lineTo(s.x + s.w * .3, 0); ctx.lineTo(s.x + s.w * 1.4 - 120, H * .9); ctx.lineTo(s.x - s.w * 1.2 - 120, H * .9); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = .55; ctx.drawImage(st.mist, (t * 6) % W - W, H * .55, W * 1.3, H * .4); ctx.drawImage(st.mist, (t * 6) % W, H * .55, W * 1.3, H * .4);
      ctx.globalAlpha = .35; ctx.drawImage(st.mist, -((t * 9) % W), H * .72, W * 1.5, H * .3); ctx.drawImage(st.mist, W * 1.5 - ((t * 9) % W) - W * .0, H * .72, W * 1.5, H * .3);
      for (const f of st.ff) {
        const x = f.x + Math.sin(t * f.fx + f.ph) * f.a, y = f.y + Math.sin(t * f.fy * 1.3 + f.ph * 2) * f.b * .5, bl = Math.pow(Math.max(0, Math.sin(t * f.bl + f.ph)), 3);
        if (bl < .03) continue;
        blit(ctx, glowSprite([200, 255, 110], 96), x, y, f.s * 13, bl * .9);
        blit(ctx, glowSprite([255, 255, 220], 48), x, y, f.s * 3.4, bl);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } });

  // 10 — NÉON RÉTRO : soleil strié, montagnes au néon, grille en perspective qui avance
  add({ id: 'neon', name: 'Néon rétro', preview: 'linear-gradient(#ffe45e,#ff2e88 45%,#12003a 46%,#2a0a55),repeating-linear-gradient(90deg,transparent 0 10px,rgba(255,79,216,.4) 10px 11px)',
    make(W, H) {
      const hy = H * .56, u = H / 800, bgc = cv(W, H), x = bgc.getContext('2d');
      vgrad(x, W, H, [[0, '#0b0225'], [.3, '#2a0a5e'], [.5, '#7a1b8f'], [.56, '#ff3e9a']], 0, hy);
      x.fillStyle = '#12012e'; x.fillRect(0, hy, W, H - hy);
      x.drawImage(starLayer(W, H, 33, Math.round(W * H / 2600), hy * .8, .9), 0, 0);
      x.globalCompositeOperation = 'lighter'; x.drawImage(glowSprite([255, 60, 160], 256), W * .5 - W * .45, hy - H * .5, W * .9, H * .9); x.globalCompositeOperation = 'source-over';
      const R = H * .21, cx = W * .5, cy = hy - R * .62;
      const sun = cv(R * 2.2, R * 2.2), s = sun.getContext('2d'), g = s.createLinearGradient(0, 0, 0, R * 2.2); g.addColorStop(0, '#ffe75a'); g.addColorStop(.5, '#ff8a3d'); g.addColorStop(1, '#ff2e93');
      s.fillStyle = g; s.beginPath(); s.arc(R * 1.1, R * 1.1, R, 0, TAU); s.fill();
      const mt = cv(W, H), m = mt.getContext('2d'); m.fillStyle = '#16033a'; m.strokeStyle = '#22e6ff'; m.lineWidth = 2 * u; m.shadowColor = '#22e6ff'; m.shadowBlur = 12 * u;
      const pts = []; for (let X = 0; X <= W; X += 6) { const n = fbm(X / (W * .1), 2, 4, 5), e = Math.abs(n - .5) * 2; pts.push([X, hy - Math.pow(1 - e, 1.4) * H * .13 * (.5 + .5 * Math.sin(X / W * 6 + 1)) * (Math.abs(X - W * .5) / (W * .5) * .9 + .1) - 2]); }
      m.beginPath(); m.moveTo(0, hy); pts.forEach((p) => m.lineTo(p[0], p[1])); m.lineTo(W, hy); m.closePath(); m.fill(); m.beginPath(); pts.forEach((p, i) => (i ? m.lineTo(p[0], p[1]) : m.moveTo(p[0], p[1]))); m.stroke();
      return { bgc, sun, mt, hy, R, cx, cy, u };
    },
    draw(ctx, st, t, dt, W, H) {
      const hy = st.hy, R = st.R;
      ctx.drawImage(st.bgc, 0, 0);
      // soleil découpé en bandes qui descendent
      const sc = st.tmp || (st.tmp = cv(st.sun.width, st.sun.height)), sx = sc.getContext('2d');
      sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, sc.width, sc.height); sx.drawImage(st.sun, 0, 0);
      sx.globalCompositeOperation = 'destination-out'; sx.fillStyle = '#000';
      const ph = (t * .18) % 1; for (let i = 0; i < 9; i++) { const f = (i + ph) / 9, y = R * 1.1 + R * (-.1 + f * 1.1), h = R * (.02 + f * .14); sx.fillRect(0, y, sc.width, h); }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip(); ctx.drawImage(sc, st.cx - R * 1.1, st.cy - R * 1.1); ctx.restore();
      ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(st.mt, 0, 0);
      // grille
      const gh = H - hy; ctx.save(); ctx.beginPath(); ctx.rect(0, hy, W, gh); ctx.clip();
      const fl = ctx.createLinearGradient(0, hy, 0, H); fl.addColorStop(0, '#2a0657'); fl.addColorStop(1, '#0e0126'); ctx.fillStyle = fl; ctx.fillRect(0, hy, W, gh);
      ctx.globalCompositeOperation = 'lighter';
      const lines = (lw, al) => {
        ctx.lineWidth = lw; ctx.strokeStyle = `rgba(255,70,220,${al})`; ctx.beginPath();
        for (let i = 0; i < 16; i++) { const f = ((i + (t * .5) % 1) / 16), y = hy + Math.pow(f, 2.3) * gh; ctx.moveTo(0, y); ctx.lineTo(W, y); }
        for (let i = -22; i <= 22; i++) { const xb = W * .5 + i * W * .16; ctx.moveTo(W * .5 + i * 6, hy); ctx.lineTo(xb, H); }
        ctx.stroke();
      };
      lines(5, .13); lines(1.8, .95);
      const hg = ctx.createLinearGradient(0, hy - 6, 0, hy + 46); hg.addColorStop(0, 'rgba(255,90,200,.65)'); hg.addColorStop(1, 'rgba(255,90,200,0)'); ctx.fillStyle = hg; ctx.fillRect(0, hy - 6, W, 52);
      ctx.restore(); ctx.globalCompositeOperation = 'source-over';
    } });

  // 11 — PÉTALES DE CERISIER : crépuscule rose, branche en fleurs, pétales qui tournoient en 3D
  add({ id: 'sakura', name: 'Pétales de cerisier', preview: 'radial-gradient(ellipse 5px 3px at 30% 35%,#ffd2df 99%,transparent),radial-gradient(ellipse 5px 3px at 65% 60%,#ffd2df 99%,transparent),linear-gradient(#241036,#8a3a6e 60%,#f2a1b5)',
    make(W, H) {
      const u = H / 800, bgc = cv(W, H), x = bgc.getContext('2d'), r = mb(88);
      vgrad(x, W, H, [[0, '#1b0f3a'], [.3, '#5a2a6e'], [.6, '#c05a86'], [.85, '#f7a9a0'], [1, '#ffd2b8']]);
      const mx = W * .7, my = H * .3; x.globalCompositeOperation = 'lighter'; x.drawImage(glowSprite([255, 200, 220], 256), mx - 330 * u, my - 330 * u, 660 * u, 660 * u); x.globalCompositeOperation = 'source-over';
      const mg = x.createRadialGradient(mx - 10, my - 10, 0, mx, my, 74 * u); mg.addColorStop(0, '#fff7f3'); mg.addColorStop(1, '#ffe0e6'); x.globalAlpha = .93; x.fillStyle = mg; x.beginPath(); x.arc(mx, my, 70 * u, 0, TAU); x.fill(); x.globalAlpha = 1;
      ridge(x, W, H, H * .84, H * .14, W * .26, 71, [[0, 'rgba(160,90,140,.85)'], [1, 'rgba(110,50,110,.9)']]);
      ridge(x, W, H, H * .93, H * .1, W * .22, 72, [[0, 'rgba(90,40,100,.95)'], [1, 'rgba(50,20,70,1)']]);
      const blossom = (bx, by, s) => {
        const n = 5, c = r() < .5 ? [255, 214, 226] : [255, 190, 212];
        x.globalAlpha = .9; x.drawImage(glowSprite([255, 190, 215], 64), bx - s * 2.2, by - s * 2.2, s * 4.4, s * 4.4); x.globalAlpha = 1;
        for (let i = 0; i < n; i++) { const a = i / n * TAU + r(); x.save(); x.translate(bx, by); x.rotate(a); const g = x.createRadialGradient(0, -s * .6, 0, 0, -s * .6, s); g.addColorStop(0, rgba(c, 1)); g.addColorStop(1, 'rgba(244,140,175,1)');
          x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-s * .8, -s * .5, -s * .5, -s * 1.15, 0, -s * 1.0); x.bezierCurveTo(s * .5, -s * 1.15, s * .8, -s * .5, 0, 0); x.fill(); x.restore(); }
        x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(bx, by, s * .16, 0, TAU); x.fill();
      };
      const branch = (bx, by, ang, len, w, d) => {
        if (d > 7 || len < 8) return;
        const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len, cx = (bx + ex) / 2 + (r() - .5) * len * .35, cy = (by + ey) / 2 + (r() - .5) * len * .35;
        x.strokeStyle = d < 3 ? '#2a1428' : '#3a1a36'; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(cx, cy, ex, ey); x.stroke();
        if (d >= 3) { const k = d > 5 ? 3 : 1; for (let i = 0; i < k; i++) blossom(ex + (r() - .5) * 30 * u, ey + (r() - .5) * 30 * u, (9 + r() * 7) * u); }
        const nb = d < 2 ? 2 : (r() < .6 ? 2 : 3);
        for (let i = 0; i < nb; i++) branch(ex, ey, ang + (r() - .5) * 1.1 + (i - .5) * .25, len * (.68 + r() * .12), w * .66, d + 1);
      };
      branch(-30 * u, H * .18, .05, 360 * u, 16 * u, 0); branch(W * 1.03, H * .08, Math.PI - .18, 340 * u, 14 * u, 0);
      branch(W * .33, -20, 1.2, 220 * u, 8 * u, 1);
      const petals = Array.from({ length: Math.round(W * H / 9000) }, () => { const z = Math.random(); return { x: rnd(0, W), y: rnd(-H * .1, H), z, s: lerp(5, 17, z) * u, v: lerp(26, 70, z), ph: rnd(0, TAU), sp: rnd(.8, 2.4), rot: rnd(0, TAU), rs: rnd(-1.2, 1.2), c: Math.random() };});
      return { bgc, petals };
    },
    draw(ctx, st, t, dt, W, H) {
      ctx.drawImage(st.bgc, 0, 0);
      for (const p of st.petals) {
        p.y += p.v * dt; p.x += (Math.sin(t * .5 + p.ph) * 28 + 22 + p.z * 22) * dt; p.rot += p.rs * dt;
        if (p.y > H + 30) { p.y = -30; p.x = rnd(-60, W); } if (p.x > W + 40) p.x = -40;
        const sq = Math.abs(Math.cos(t * p.sp + p.ph)) * .85 + .15, s = p.s;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, sq);
        ctx.globalAlpha = lerp(.45, .95, p.z); const g = ctx.createRadialGradient(0, -s * .2, 0, 0, 0, s); g.addColorStop(0, p.c < .5 ? '#fff0f5' : '#ffd6e4'); g.addColorStop(1, '#f58bb0');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, s * .9); ctx.bezierCurveTo(-s * .95, s * .35, -s * .7, -s * .8, -s * .12, -s * .9); ctx.lineTo(0, -s * .62); ctx.lineTo(s * .12, -s * .9); ctx.bezierCurveTo(s * .7, -s * .8, s * .95, s * .35, 0, s * .9); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } });

  // ---------------------------------------------------------------- moteur
  let canvas = null, ctx = null, cur = null, st = null, raf = 0, last = 0, time = 0, speed = 1, W = 0, H = 0;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas'); canvas.id = 'anim-bg';
    document.body.insertBefore(canvas, document.getElementById('bg-dim'));
    ctx = canvas.getContext('2d');
    let rt = 0; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (cur) fit(); }, 180); });
    document.addEventListener('visibilitychange', () => { if (cur && !document.hidden && !still) start(); });
  }
  function fit() {
    W = window.innerWidth; H = window.innerHeight;
    const k = Math.min(1, 1920 / W);                        // en 4K on dessine plus petit puis on étire : c'est un décor doux
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    st = cur.make(W, H);
    if (still) { time = 7; cur.draw(ctx, st, time, 0, W, H); }
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !cur) return;
    const ms = ts - last; if (ms < 30) return;              // ~30 images par seconde
    last = ts; const dt = Math.min(ms, 80) / 1000 * speed; time += dt;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    cur.draw(ctx, st, time, dt, W, H);
  }
  function start() { cancelAnimationFrame(raf); if (!still) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function set(id) {
    const sc = scenes.find((s) => s.id === id);
    if (!sc) { cur = null; cancelAnimationFrame(raf); if (canvas) canvas.style.display = 'none'; document.body.classList.remove('anim-on'); return; }
    ensureCanvas();
    if (cur !== sc) { cur = sc; time = rnd(0, 20); canvas.style.display = 'block'; fit(); start(); }
    document.body.classList.add('anim-on');
  }

  // ---------- vignettes : un vrai aperçu de chaque décor, calculé une fois en arrière-plan ----------
  const thumbs = {};
  function thumb(sc) {
    const c = cv(320, 190), x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    try { const s = sc.make(320, 190); sc.draw(x, s, 7.5, .03, 320, 190); sc.draw(x, s, 7.55, .03, 320, 190); thumbs[sc.id] = c.toDataURL('image/jpeg', .86); } catch (e) { /* vignette facultative */ }
  }
  let ti = 0;
  function nextThumb() {
    if (ti >= scenes.length) return;
    thumb(scenes[ti++]);
    document.querySelectorAll('.anim-card').forEach((el) => { const id = el.dataset.a, p = el.querySelector('.anim-prev'); if (p && thumbs[id]) p.style.background = `url(${thumbs[id]}) center/cover`; });
    setTimeout(nextThumb, 350);
  }
  setTimeout(nextThumb, 2500);

  window.sonoraAnim = {
    scenes: scenes.map((s) => ({ id: s.id, name: s.name, get preview() { return thumbs[s.id] ? `url(${thumbs[s.id]}) center/cover` : s.preview; } })),
    set, speed: (v) => { speed = Math.max(.2, Math.min(3, +v || 1)); }, thumbs
  };
  if (typeof applySettings === 'function') applySettings();   // applique le fond choisi dès que le moteur est prêt
})();
