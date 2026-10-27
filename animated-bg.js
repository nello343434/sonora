// Sonora — fonds animés (Apparence > Fonds animés). Tout est dessiné en code (canvas), aucune image externe.
// 30 images/s, en pause quand la fenêtre est cachée, une seule image fixe si « réduire les animations » est activé.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const vgrad = (ctx, y0, y1, W, stops) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
  };
  const glow = (ctx, x, y, r, c, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const hills = (ctx, W, H, base, amp, f, ph, color) => {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, base - (Math.sin(x * f + ph) * .6 + Math.sin(x * f * 2.3 + ph * 1.7) * .4) * amp);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  const makeStars = (n, maxY, W) => Array.from({ length: n }, () => ({
    x: rnd(0, W), y: rnd(0, maxY), r: rnd(.3, 1.5), p: rnd(0, TAU), s: rnd(.6, 2.4),
    c: Math.random() < .2 ? [255, 225, 180] : Math.random() < .35 ? [190, 210, 255] : [255, 255, 255]
  }));
  const drawStars = (ctx, stars, t, k = 1) => {
    stars.forEach((s) => {
      const a = (.35 + .65 * Math.pow(Math.sin(t * s.s + s.p) * .5 + .5, 2)) * k;
      ctx.fillStyle = rgba(s.c, a);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      if (s.r > 1.25) glow(ctx, s.x, s.y, s.r * 6, s.c, a * .35);
    });
  };

  // ---------------------------------------------------------------- scènes
  const scenes = [
    { id: 'etoiles', name: 'Nuit étoilée', preview: 'radial-gradient(circle at 70% 25%,#fff 0 1px,transparent 2px),linear-gradient(#04061a,#1b2f73)',
      make(W, H) { return { stars: makeStars(Math.round(W * H / 5200), H * .85, W), shoots: [], next: 1.2 }; },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#04061a'], [.55, '#0d1b4a'], [1, '#2a4684']]);
        ctx.save(); ctx.translate(W * .55, H * .38); ctx.rotate(-.5); ctx.scale(1, .18); glow(ctx, 0, 0, W * .75, [140, 150, 255], .17); ctx.restore();
        drawStars(ctx, st.stars, t);
        st.next -= dt;
        if (st.next <= 0) {
          st.next = rnd(2, 5);
          st.shoots.push({ x: rnd(W * .15, W * .95), y: rnd(0, H * .3), vx: -rnd(520, 920), vy: rnd(240, 460), age: 0, max: rnd(.9, 1.5) });
        }
        st.shoots = st.shoots.filter((s) => s.age < s.max);
        st.shoots.forEach((s) => {
          s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt;
          const a = Math.sin(Math.PI * s.age / s.max), len = 190, m = Math.hypot(s.vx, s.vy);
          const tx = s.x - s.vx / m * len, ty = s.y - s.vy / m * len;
          const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
          g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(160,190,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
          glow(ctx, s.x, s.y, 16, [220, 235, 255], a * .8);
        });
        hills(ctx, W, H, H * .92, H * .07, .004, 1.2, '#0a1334');
        hills(ctx, W, H, H * 1.0, H * .06, .006, 4.1, '#060b22');
      } },

    { id: 'ciel', name: 'Ciel bleu et nuages', preview: 'radial-gradient(circle at 30% 70%,#fff 0 12%,transparent 13%),linear-gradient(#2272d8,#bfe3ff)',
      make(W, H) {
        const clouds = Array.from({ length: 11 }, () => {
          const s = rnd(.7, 1.8), n = 7;
          return { x: rnd(-200, W), y: rnd(H * .05, H * .62), s, v: rnd(6, 20) * (.6 + s * .4),
            puffs: Array.from({ length: n }, (_, i) => ({ dx: (i / (n - 1)) * 170 - 85 + rnd(-12, 12), dy: -Math.sin(i / (n - 1) * Math.PI) * 30 + rnd(-8, 8), r: 30 + Math.sin(i / (n - 1) * Math.PI) * 26 + rnd(-6, 6) })) };
        });
        return { clouds };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#1d6bd2'], [.55, '#5fa9ee'], [1, '#d3ebff']]);
        glow(ctx, W * .82, H * .16, Math.max(W, H) * .55, [255, 246, 205], .75);
        glow(ctx, W * .82, H * .16, 90, [255, 255, 240], .95);
        st.clouds.sort((a, b) => a.s - b.s).forEach((c) => {
          c.x += c.v * dt; if (c.x - 240 * c.s > W) c.x = -260 * c.s;
          c.puffs.forEach((p) => {
            const r = p.r * c.s, x = c.x + p.dx * c.s, y = c.y + p.dy * c.s;
            glow(ctx, x, y + r * .38, r * 1.05, [150, 188, 228], .5);
          });
          c.puffs.forEach((p) => {
            const r = p.r * c.s, x = c.x + p.dx * c.s, y = c.y + p.dy * c.s;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,.96)'); g.addColorStop(.6, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          });
        });
      } },

    { id: 'aurore', name: 'Aurore boréale', preview: 'linear-gradient(115deg,transparent 30%,#2dffa0 50%,#8a63ff 70%,transparent),linear-gradient(#02060f,#0a2038)',
      make(W, H) {
        const sprite = (c) => {
          const o = document.createElement('canvas'); o.width = 1; o.height = 256;
          const g = o.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
          gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(.6, rgba(c, .22)); gr.addColorStop(.92, rgba(c, .85)); gr.addColorStop(1, rgba(c, 0));
          g.fillStyle = gr; g.fillRect(0, 0, 1, 256); return o;
        };
        return { stars: makeStars(Math.round(W * H / 9000), H * .7, W), sp: [sprite([61, 255, 160]), sprite([53, 214, 255]), sprite([157, 107, 255])] };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#02050d'], [.6, '#071a2e'], [1, '#0b2a3a']]);
        drawStars(ctx, st.stars, t, .8);
        ctx.globalCompositeOperation = 'lighter';
        st.sp.forEach((sp, j) => {
          const off = [.36, .30, .42][j], ph = j * 1.9, f = [.0042, .0036, .005][j];
          for (let x = -6; x < W + 6; x += 5) {
            const y0 = H * off + Math.sin(x * f + t * .35 + ph) * H * .07 + Math.sin(x * f * 2.6 - t * .5 + ph) * H * .025;
            const len = H * (.3 + .1 * Math.sin(x * .006 + t * .4 + ph));
            ctx.globalAlpha = .75 * (.5 + .5 * Math.sin(x * .011 + t * .7 + ph * 2));
            ctx.drawImage(sp, x, y0 - len, 6, len);
          }
        });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        hills(ctx, W, H, H * .96, H * .06, .005, 2.3, '#030a12');
      } },

    { id: 'orage', name: 'Orage de nuit', preview: 'linear-gradient(110deg,transparent 48%,#cfe0ff 50%,transparent 52%),linear-gradient(#10151f,#2a3550)',
      make(W, H) {
        return { drops: Array.from({ length: Math.round(W / 5) }, () => ({ x: rnd(0, W + 240), y: rnd(0, H), l: rnd(10, 24), v: rnd(900, 1500) })),
          clouds: Array.from({ length: 7 }, () => ({ x: rnd(0, W), y: rnd(-20, H * .28), r: rnd(W * .14, W * .28), v: rnd(5, 14) })),
          next: rnd(2.5, 5), flash: 0, bolt: null, boltT: 0, again: 0 };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#0c1018'], [.6, '#1b2434'], [1, '#2a364d']]);
        st.clouds.forEach((c) => { c.x += c.v * dt; if (c.x - c.r > W) c.x = -c.r; glow(ctx, c.x, c.y, c.r, [48, 58, 82], .9); });
        st.next -= dt;
        if (st.next <= 0) {
          st.next = rnd(4, 9); st.flash = 1; st.again = .13; st.boltT = .35;
          const x0 = rnd(W * .15, W * .85), pts = [];
          const gen = (ax, ay, bx, by, d, n) => { if (n === 0) { pts.push([bx, by]); return; } const mx = (ax + bx) / 2 + rnd(-d, d), my = (ay + by) / 2; gen(ax, ay, mx, my, d / 2, n - 1); gen(mx, my, bx, by, d / 2, n - 1); };
          pts.push([x0, 0]); gen(x0, 0, x0 + rnd(-120, 120), H * rnd(.55, .8), 90, 6);
          st.bolt = pts;
        }
        if (st.again > 0) { st.again -= dt; if (st.again <= 0) st.flash = .8; }
        if (st.flash > .01) { ctx.fillStyle = `rgba(200,215,255,${st.flash * .32})`; ctx.fillRect(0, 0, W, H); st.flash *= Math.max(0, 1 - 6 * dt); }
        if (st.boltT > 0 && st.bolt) {
          st.boltT -= dt; ctx.save(); ctx.strokeStyle = `rgba(240,245,255,${Math.min(1, st.boltT * 5)})`; ctx.lineWidth = 2.4; ctx.shadowBlur = 22; ctx.shadowColor = '#9bb8ff';
          ctx.beginPath(); st.bolt.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.restore();
        }
        ctx.strokeStyle = 'rgba(190,210,255,.28)'; ctx.lineWidth = 1.2; ctx.beginPath();
        st.drops.forEach((d) => {
          d.y += d.v * dt; d.x -= d.v * .18 * dt;
          if (d.y > H + 30) { d.y = -30; d.x = rnd(0, W + 240); }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * .18, d.y - d.l);
        });
        ctx.stroke();
      } },

    { id: 'couchant', name: 'Coucher de soleil', preview: 'linear-gradient(#2b1b5a,#c8456f 55%,#ffb26a 75%,#5a2a6a 76%,#1a1040)',
      make(W, H) {
        const hz = H * .72;
        return { hz, stars: makeStars(40, hz * .45, W), clouds: Array.from({ length: 7 }, () => ({ x: rnd(0, W), y: rnd(H * .12, hz * .8), w: rnd(220, 520), v: rnd(4, 12) })),
          glints: Array.from({ length: 90 }, () => ({ x: W / 2 + rnd(-W * .28, W * .28), y: hz + rnd(4, H - hz), w: rnd(8, 60), p: rnd(0, TAU), s: rnd(1, 3) })) };
      },
      draw(ctx, st, t, dt, W, H) {
        const hz = st.hz;
        vgrad(ctx, 0, hz, W, [[0, '#1c1250'], [.35, '#7a2f86'], [.65, '#ee5368'], [.85, '#ffa25a'], [1, '#ffd08a']]);
        drawStars(ctx, st.stars, t, .5);
        const sun = H * .06 * 0 + Math.min(W, H) * .12;
        glow(ctx, W / 2, hz - sun * .3, Math.max(W, H) * .5, [255, 170, 100], .5 + .08 * Math.sin(t * .6));
        const sg = ctx.createLinearGradient(0, hz - sun * 1.6, 0, hz); sg.addColorStop(0, '#fff2b0'); sg.addColorStop(1, '#ff8a4a');
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip(); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(W / 2, hz - sun * .35, sun, 0, TAU); ctx.fill(); ctx.restore();
        st.clouds.forEach((c) => {
          c.x += c.v * dt; if (c.x - c.w > W) c.x = -c.w;
          ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, .1); glow(ctx, 0, 0, c.w, [255, 150, 120], .6); ctx.restore();
        });
        vgrad(ctx, hz, H, W, [[0, '#8d3470'], [.4, '#4a1e66'], [1, '#150d3a']]);
        glow(ctx, W / 2, hz + 6, W * .26, [255, 180, 110], .35);
        st.glints.forEach((g) => {
          const a = Math.max(0, Math.sin(t * g.s + g.p)) * .55, fall = 1 - Math.abs(g.x - W / 2) / (W * .3);
          if (fall <= 0) return;
          ctx.fillStyle = `rgba(255,214,150,${a * fall})`; ctx.fillRect(g.x - g.w / 2, g.y, g.w, 1.6);
        });
      } },

    { id: 'ocean', name: 'Fonds marins', preview: 'linear-gradient(105deg,transparent 40%,rgba(160,230,255,.35) 50%,transparent 60%),linear-gradient(#0a5a86,#021226)',
      make(W, H) {
        return { bubbles: Array.from({ length: 70 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 5), v: rnd(18, 60), p: rnd(0, TAU) })),
          rays: Array.from({ length: 7 }, (_, i) => ({ x: (i + .5) / 7 * W + rnd(-60, 60), w: rnd(50, 140), p: rnd(0, TAU), s: rnd(.15, .35) })),
          jelly: Array.from({ length: 3 }, () => ({ x: rnd(W * .1, W * .9), y: rnd(H * .3, H), s: rnd(.7, 1.4), p: rnd(0, TAU), v: rnd(10, 22) })) };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#0b5e8c'], [.45, '#05355c'], [1, '#010a19']]);
        ctx.globalCompositeOperation = 'lighter';
        st.rays.forEach((r) => {
          const sw = Math.sin(t * r.s + r.p) * 90, g = ctx.createLinearGradient(0, 0, 0, H * .85);
          g.addColorStop(0, 'rgba(170,230,255,.16)'); g.addColorStop(1, 'rgba(170,230,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(r.x - r.w * .3, 0); ctx.lineTo(r.x + r.w * .3, 0); ctx.lineTo(r.x + sw + r.w * 1.2, H * .85); ctx.lineTo(r.x + sw - r.w * 1.2, H * .85); ctx.closePath(); ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
        st.jelly.forEach((j) => {
          j.y -= j.v * dt; if (j.y < -140 * j.s) { j.y = H + 120 * j.s; j.x = rnd(W * .1, W * .9); }
          const pulse = 1 + .1 * Math.sin(t * 2 + j.p), x = j.x + Math.sin(t * .5 + j.p) * 40;
          ctx.save(); ctx.translate(x, j.y); ctx.scale(j.s, j.s);
          glow(ctx, 0, 0, 90, [255, 150, 230], .22);
          ctx.beginPath(); ctx.ellipse(0, 0, 34 * pulse, 26 / pulse, 0, Math.PI, TAU); ctx.closePath();
          const bg = ctx.createRadialGradient(0, 0, 4, 0, 0, 36); bg.addColorStop(0, 'rgba(255,190,240,.75)'); bg.addColorStop(1, 'rgba(170,120,255,.25)');
          ctx.fillStyle = bg; ctx.fill();
          ctx.strokeStyle = 'rgba(255,200,245,.4)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 9, 2); for (let y = 6; y <= 60; y += 6) ctx.lineTo(i * 9 + Math.sin(t * 2 + y * .12 + i) * 6, y); ctx.stroke(); }
          ctx.restore();
        });
        ctx.strokeStyle = 'rgba(200,240,255,.45)'; ctx.lineWidth = 1;
        st.bubbles.forEach((b) => {
          b.y -= b.v * dt; b.x += Math.sin(t * 1.5 + b.p) * 10 * dt;
          if (b.y < -10) { b.y = H + 10; b.x = rnd(0, W); }
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
        });
      } },

    { id: 'neige', name: 'Neige', preview: 'radial-gradient(circle at 25% 30%,#fff 0 1.5px,transparent 2.5px),radial-gradient(circle at 70% 60%,#fff 0 1.5px,transparent 2.5px),linear-gradient(#0b1432,#4a70b0)',
      make(W, H) {
        return { flakes: Array.from({ length: Math.round(W * H / 8000) }, () => { const z = rnd(.25, 1); return { x: rnd(0, W), y: rnd(0, H), z, r: 1 + z * 2.6, v: 28 + z * 75, a: rnd(12, 40), p: rnd(0, TAU) }; }),
          pines: Array.from({ length: Math.round(W / 70) }, () => ({ x: rnd(0, W), h: rnd(60, 150) })) };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#0a1230'], [.6, '#27437f'], [1, '#7da0d8']]);
        glow(ctx, W * .8, H * .18, H * .4, [200, 220, 255], .35);
        hills(ctx, W, H, H * .86, H * .05, .004, .8, 'rgba(190,212,250,.55)');
        st.pines.forEach((p) => { ctx.fillStyle = '#0a1a3a'; for (let k = 0; k < 3; k++) { const y = H * .88 - k * p.h * .28, w = p.h * (.3 - k * .06); ctx.beginPath(); ctx.moveTo(p.x, y - p.h * .34); ctx.lineTo(p.x - w, y); ctx.lineTo(p.x + w, y); ctx.fill(); } });
        hills(ctx, W, H, H * .96, H * .05, .006, 3.4, 'rgba(225,238,255,.95)');
        st.flakes.forEach((f) => {
          f.y += f.v * dt; if (f.y > H + 6) { f.y = -6; f.x = rnd(0, W); }
          const x = f.x + Math.sin(t * .8 + f.p) * f.a;
          ctx.fillStyle = `rgba(255,255,255,${.35 + f.z * .55})`; ctx.beginPath(); ctx.arc(x, f.y, f.r, 0, TAU); ctx.fill();
        });
      } },

    { id: 'galaxie', name: 'Galaxie', preview: 'radial-gradient(ellipse 60% 25% at 50% 50%,#ffe9b8,#7a6bff 45%,transparent 70%),#05020f',
      make(W, H) {
        const R = Math.min(W, H) * .5, N = Math.min(2200, Math.round(W * H / 1100));
        return { R, stars: makeStars(Math.round(W * H / 9000), H, W), pts: Array.from({ length: N }, (_, i) => {
          const r = Math.pow(Math.random(), .62) * R, arm = i % 3, a = arm * TAU / 3 + (r / R) * 3.8 + (Math.random() + Math.random() - 1) * .55 * (1 - r / R * .5);
          const m = r / R, c = m < .3 ? [255, 235, 190] : Math.random() < .25 ? [255, 150, 220] : [150 + 60 * (1 - m), 175, 255];
          return { r, a, c, s: rnd(.8, 2), al: rnd(.4, .95) };
        }) };
      },
      draw(ctx, st, t, dt, W, H) {
        ctx.fillStyle = '#05020f'; ctx.fillRect(0, 0, W, H);
        glow(ctx, W * .3, H * .35, W * .35, [120, 40, 160], .25 + .05 * Math.sin(t * .3));
        glow(ctx, W * .75, H * .65, W * .3, [30, 110, 190], .22 + .05 * Math.cos(t * .25));
        drawStars(ctx, st.stars, t, .7);
        const cx = W / 2, cy = H / 2, tilt = -.35, ct = Math.cos(tilt), sn = Math.sin(tilt), rot = t * .045;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt); ctx.scale(1, .42); glow(ctx, 0, 0, st.R * .45, [255, 225, 160], .55); ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        st.pts.forEach((p) => {
          const a = p.a + rot * (1.4 - p.r / st.R * .8), x0 = Math.cos(a) * p.r, y0 = Math.sin(a) * p.r * .42;
          ctx.fillStyle = rgba(p.c, p.al); ctx.fillRect(cx + x0 * ct - y0 * sn, cy + x0 * sn + y0 * ct, p.s, p.s);
        });
        ctx.globalCompositeOperation = 'source-over';
      } },

    { id: 'lucioles', name: 'Forêt aux lucioles', preview: 'radial-gradient(circle at 30% 40%,#d9ff7a 0 2px,transparent 6px),radial-gradient(circle at 70% 55%,#d9ff7a 0 2px,transparent 6px),linear-gradient(#06141a,#0c2a26)',
      make(W, H) {
        const trees = (n, hmin, hmax) => Array.from({ length: n }, () => ({ x: rnd(-20, W + 20), h: rnd(hmin, hmax) }));
        return { far: trees(Math.round(W / 60), 120, 260), near: trees(Math.round(W / 110), 220, 420), stars: makeStars(70, H * .5, W),
          flies: Array.from({ length: 46 }, () => ({ x: rnd(0, W), y: rnd(H * .35, H), p: rnd(0, TAU), s: rnd(.3, .9), r: rnd(12, 26) })) };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#050e1a'], [.6, '#0a2226'], [1, '#0f3a32']]);
        drawStars(ctx, st.stars, t, .6);
        glow(ctx, W * .18, H * .2, 160, [210, 235, 255], .45);
        ctx.fillStyle = '#e8f1ff'; ctx.beginPath(); ctx.arc(W * .18, H * .2, 34, 0, TAU); ctx.fill();
        const tree = (x, h, col) => { ctx.fillStyle = col; for (let k = 0; k < 4; k++) { const y = H - k * h * .22, w = h * (.28 - k * .045); ctx.beginPath(); ctx.moveTo(x, y - h * .36); ctx.lineTo(x - w, y); ctx.lineTo(x + w, y); ctx.fill(); } };
        st.far.forEach((p) => tree(p.x, p.h, '#0a2a28'));
        ctx.save(); ctx.translate(Math.sin(t * .1) * 30, 0); glow(ctx, W * .5, H * .88, W * .6, [150, 200, 190], .12); ctx.restore();
        st.near.forEach((p) => tree(p.x, p.h, '#040f0e'));
        ctx.globalCompositeOperation = 'lighter';
        st.flies.forEach((f) => {
          f.x += Math.cos(t * .4 + f.p) * 22 * dt * f.s * 2; f.y += Math.sin(t * .5 + f.p * 1.3) * 16 * dt * f.s * 2;
          if (f.x < -30) f.x = W + 30; if (f.x > W + 30) f.x = -30; if (f.y < H * .25) f.y = H * .25; if (f.y > H) f.y = H;
          const a = Math.pow(Math.max(0, Math.sin(t * 1.7 * f.s + f.p)), 3);
          if (a > .02) { glow(ctx, f.x, f.y, f.r, [210, 255, 120], .55 * a); glow(ctx, f.x, f.y, 3, [255, 255, 200], a); }
        });
        ctx.globalCompositeOperation = 'source-over';
      } },

    { id: 'neon', name: 'Néon rétro', preview: 'linear-gradient(#ffe45e,#ff2e88 45%,#12003a 46%,#2a0a55),repeating-linear-gradient(90deg,transparent 0 10px,rgba(255,79,216,.4) 10px 11px)',
      make(W, H) {
        const hz = H * .58, R = Math.min(W, H) * .2, o = document.createElement('canvas'); o.width = o.height = Math.ceil(R * 2.2);
        const g = o.getContext('2d'), c = o.width / 2, gr = g.createLinearGradient(0, c - R, 0, c + R);
        gr.addColorStop(0, '#ffe45e'); gr.addColorStop(.55, '#ff6a5c'); gr.addColorStop(1, '#ff2e88');
        g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 9; i++) { const y = c + R * (.05 + i * .11), h = 2 + i * 1.3; g.fillRect(0, y, o.width, h); }
        const mt = []; for (let x = 0; x <= W; x += 14) mt.push(Math.max(0, Math.sin(x * .011) * 38 + Math.sin(x * .027 + 1) * 24 + (Math.abs(x - W / 2) > W * .22 ? 40 : -30)));
        return { hz, R, sun: o, stars: makeStars(70, hz * .8, W), mt };
      },
      draw(ctx, st, t, dt, W, H) {
        const hz = st.hz;
        vgrad(ctx, 0, hz, W, [[0, '#0d0030'], [.55, '#3b0a6e'], [1, '#ff3d8b']]);
        drawStars(ctx, st.stars, t, .8);
        glow(ctx, W / 2, hz - st.R * .5, st.R * 2.4, [255, 60, 150], .35 + .08 * Math.sin(t));
        ctx.drawImage(st.sun, W / 2 - st.sun.width / 2, hz - st.R * 1.1 - st.sun.height / 2 + st.R * .55);
        ctx.fillStyle = '#12002e'; ctx.beginPath(); ctx.moveTo(0, hz); st.mt.forEach((m, i) => ctx.lineTo(i * 14, hz - m)); ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
        vgrad(ctx, hz, H, W, [[0, '#2a0a55'], [1, '#07001a']]);
        ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = '#ff4fd8'; ctx.lineCap = 'round';
        const N = 16, sc = (t * .5) % 1;
        for (let i = 0; i < N; i++) {
          const z = (i + sc) / N, y = hz + (H - hz) * Math.pow(z, 2.2);
          ctx.strokeStyle = `rgba(255,79,216,${.15 + z * .75})`; ctx.lineWidth = .8 + z * 2.2;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(80,220,255,.65)'; ctx.lineWidth = 1.3; ctx.shadowColor = '#36dcff';
        for (let i = -22; i <= 22; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W * .012, hz); ctx.lineTo(W / 2 + i * W * .14, H); ctx.stroke(); }
        ctx.restore();
      } },

    { id: 'sakura', name: 'Pétales de cerisier', preview: 'radial-gradient(ellipse 5px 3px at 30% 35%,#ffd2df 99%,transparent),radial-gradient(ellipse 5px 3px at 65% 60%,#ffd2df 99%,transparent),linear-gradient(#241036,#8a3a6e 60%,#f2a1b5)',
      make(W, H) {
        return { petals: Array.from({ length: Math.round(W / 18) }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(5, 12), a: rnd(0, TAU), va: rnd(-1.6, 1.6), v: rnd(26, 60), sw: rnd(20, 60), p: rnd(0, TAU) })), stars: makeStars(60, H * .4, W) };
      },
      draw(ctx, st, t, dt, W, H) {
        vgrad(ctx, 0, H, W, [[0, '#221034'], [.5, '#76336a'], [1, '#f0a0b6']]);
        drawStars(ctx, st.stars, t, .5);
        glow(ctx, W * .2, H * .22, H * .5, [255, 220, 235], .4);
        ctx.fillStyle = 'rgba(255,238,244,.95)'; ctx.beginPath(); ctx.arc(W * .2, H * .22, Math.min(W, H) * .06, 0, TAU); ctx.fill();
        st.petals.forEach((p) => {
          p.y += p.v * dt; p.a += p.va * dt; if (p.y > H + 20) { p.y = -20; p.x = rnd(0, W); }
          const x = p.x + Math.sin(t * .7 + p.p) * p.sw;
          ctx.save(); ctx.translate(x, p.y); ctx.rotate(p.a); ctx.scale(1, .55 + .45 * Math.sin(t * 2 + p.p));
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.s); g.addColorStop(0, 'rgba(255,225,235,.95)'); g.addColorStop(1, 'rgba(255,170,200,.8)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * .55, 0, 0, TAU); ctx.fill(); ctx.restore();
        });
      } }
  ];

  // ---------------------------------------------------------------- moteur
  let canvas = null, ctx = null, cur = null, st = null, raf = 0, last = 0, time = 0, speed = 1, W = 0, H = 0;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'anim-bg';
    document.body.insertBefore(canvas, document.getElementById('bg-dim'));
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', () => { if (cur) fit(); });
    document.addEventListener('visibilitychange', () => { if (cur && !document.hidden && !still) start(); });
  }
  function fit() {
    W = window.innerWidth; H = window.innerHeight;
    const k = Math.min(1, 1600 / W);                       // en 4K on dessine plus petit puis on étire : c'est un décor doux
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    st = cur.make(W, H);
    if (still) { time = 6; cur.draw(ctx, st, time, 0, W, H); }
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !cur) return;
    const ms = ts - last;
    if (ms < 30) return;                                    // ~30 images par seconde
    last = ts;
    const dt = Math.min(ms, 80) / 1000 * speed;
    time += dt;
    cur.draw(ctx, st, time, dt, W, H);
  }
  function start() { cancelAnimationFrame(raf); if (!still) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function set(id) {
    const sc = scenes.find((s) => s.id === id);
    if (!sc) {
      cur = null; cancelAnimationFrame(raf);
      if (canvas) canvas.style.display = 'none';
      document.body.classList.remove('anim-on');
      return;
    }
    ensureCanvas();
    if (cur !== sc) { cur = sc; time = rnd(0, 20); canvas.style.display = 'block'; fit(); start(); }
    document.body.classList.add('anim-on');
  }

  window.sonoraAnim = { scenes: scenes.map(({ id, name, preview }) => ({ id, name, preview })), set, speed: (v) => { speed = Math.max(.2, Math.min(3, +v || 1)); } };
  if (typeof applySettings === 'function') applySettings();   // applique le fond choisi dès que le moteur est prêt
})();
