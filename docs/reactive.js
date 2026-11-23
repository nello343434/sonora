// Sonora : fond animé du mode paroles qui réagit à la musique.
// Le son joué par Sonora (YouTube compris) est écouté via la capture audio du système (Electron « loopback »), analysé en local
// (graves / niveau) et appliqué aux nuages de couleur. Rien n'est enregistré ni envoyé. Si la capture est indisponible,
// un battement doux et régulier prend le relais pour que le fond bouge quand même avec la lecture.
(() => {
  'use strict';
  let ctx = null, an = null, buf = null, stream = null, state = 'idle';   // idle | starting | live | synth
  let spin = 0, vel = 0, prevTb = 0, avg = 0, prevB = 0, fAvg = 0, fPeak = 0.05, env = 0, lastBeat = 0, raf = 0, bass = 0, lvl = 0, mid = 0, quiet = 0, t0 = 0, beat = 0;
  const fsEl = () => document.getElementById('fs');
  const playing = () => { try { return typeof isPaused === 'function' ? !isPaused() : true; } catch (e) { return true; } };

  async function start() {
    if (state !== 'idle') return;
    state = 'starting';
    try {
      const md = navigator.mediaDevices;
      if (!md || !md.getDisplayMedia) throw new Error('indisponible');
      stream = await md.getDisplayMedia({ audio: true, video: true });
      stream.getVideoTracks().forEach((v) => v.stop());               // on ne garde que le son
      if (!stream.getAudioTracks().length) throw new Error('pas de son');
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.45;
      src.connect(an);                                                // jamais relié aux haut-parleurs : pas d'écho
      buf = new Uint8Array(an.frequencyBinCount);
      state = 'live';
    } catch (e) { state = 'synth'; }
  }

  function measure(now) {
    if (state === 'live' && an) {
      an.getByteFrequencyData(buf);
      let b = 0, m = 0, all = 0;
      for (let i = 1; i < 5; i++) b += buf[i];            // sub-graves (~25–110 Hz : la basse longue / 808)
      for (let i = 28; i < 160; i++) m += buf[i];         // médiums
      for (let i = 4; i < 480; i++) all += buf[i];
      b = b / 4 / 255; m = m / 132 / 255; all = all / 476 / 255;
      quiet = all < 0.02 ? quiet + 1 : 0;
      if (quiet > 240 && playing()) state = 'synth';      // ~4 s de silence alors que ça joue : la capture ne reçoit rien -> battement doux
      // détection de coups : on ne réagit qu'à la montée brusque des graves (un « boum »), jamais au niveau continu
      const flux = Math.max(0, b - prevB); prevB = b;
      avg += (b - avg) * 0.02; fAvg += (flux - fAvg) * 0.05; fPeak = Math.max(flux, fPeak * 0.99);
      if (flux > fAvg * 2.4 + 0.025 && b > avg * 1.08 && now - lastBeat > 260) { lastBeat = now; env = Math.max(env, 0.55 + 0.45 * Math.min(1, flux / Math.max(0.08, fPeak))); }
      env *= 0.9;                                          // retombée rapide : entre deux « boum » le fond redevient sombre
      return [env, Math.min(1, m * 1.6), Math.min(1, all * 2)];
    }
    // battement doux (≈ 100 bpm) avec un peu de variation
    const t = (now - t0) / 1000, ph = (t * 100 / 60) % 1;
    const kick = Math.pow(Math.max(0, 1 - ph * 3.2), 2);
    return [0.9 * kick, 0.3 + 0.2 * Math.sin(t * 1.7), 0.35 + 0.25 * kick];
  }

  function frame(now) {
    const f = fsEl();
    if (!f || f.classList.contains('hidden')) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (document.documentElement.classList.contains('mobile')) { if (now - (frame.l || 0) < 40) return; frame.l = now; }   // téléphone : ~25 images/s
    const bg = f.querySelector('.fs-bg'); if (!bg) return;
    let tb = 0, tm = 0, tl = 0;
    if (playing()) { const r = measure(now); if (S.settings.flash === false) r[0] = 0; tb = r[0]; tm = r[1]; tl = r[2]; }
    // attaque rapide, retombée douce
    vel += Math.max(0, tb - prevTb) * 1.6; prevTb = tb;                 // un « boum » = un coup d'élan (sens horaire)
    vel = Math.min(vel, 3.2) * 0.95; if (vel < 0.003) vel = 0; spin += vel;
    bass = tb > bass ? tb : bass + (tb - bass) * 0.25;                  // attaque immédiate, retombée rapide
    bg.style.setProperty('--spin', (spin % 360).toFixed(2)); mid += (tm - mid) * 0.15; lvl += (tl - lvl) * 0.2;
    bg.style.setProperty('--bass', bass.toFixed(3)); bg.style.setProperty('--mid', mid.toFixed(3)); bg.style.setProperty('--lvl', lvl.toFixed(3));
  }
  function ensureLoop() {
    const f = fsEl(), shown = f && !f.classList.contains('hidden');
    if (shown && !raf) { t0 = performance.now(); start(); raf = requestAnimationFrame(frame); }
  }
  setInterval(ensureLoop, 400);
  window.sonoraReactive = { state: () => state };
})();
