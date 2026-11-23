// Fenêtre cachée : reçoit le son capté de la vidéo YouTube, l'égalise et le joue elle-même.
// (La fenêtre principale est coupée pendant la capture, donc le son rejoué doit sortir d'une autre fenêtre.)
(() => {
  const FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  let ctx, pre, filters, an, buf, stream, src, holder, cfg = { gains: new Array(10).fill(0) };
  const send = (o) => { try { window.eqBridge.status(o); } catch (e) { /* ignoré */ } };
  function gains(c) {
    if (c) cfg = c; if (!ctx) return;
    filters.forEach((f, i) => f.gain.setTargetAtTime(cfg.gains[i] || 0, ctx.currentTime, 0.03));
    pre.gain.setTargetAtTime(Math.pow(10, -Math.max(0, ...cfg.gains) * 0.7 / 20), ctx.currentTime, 0.03);
  }
  window.eqGains = gains;
  window.eqStop = () => {
    try { if (src) src.disconnect(); } catch (e) { /* ignoré */ }
    if (holder) { holder.srcObject = null; holder = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    src = null; send({ state: 'stopped' });
  };
  window.eqStart = async (c) => {
    try {
      window.eqStop(); cfg = c || cfg;
      if (!ctx) {
        ctx = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 }); pre = ctx.createGain();
        filters = FREQS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking'; b.frequency.value = f; b.Q.value = 0.8; return b; });
        pre.connect(filters[0]); filters.reduce((a, b) => { a.connect(b); return b; });
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -2; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.12; // simple limiteur anti-saturation
        an = ctx.createAnalyser(); an.fftSize = 256; buf = new Uint8Array(an.frequencyBinCount);
        filters[9].connect(comp); comp.connect(ctx.destination); comp.connect(an);
      }
      await ctx.resume(); gains();
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 }, video: true });
      stream.getVideoTracks().forEach((v) => v.stop());
      // Chromium applique par défaut annulation d'écho / réduction de bruit / gain auto : ça étouffe la musique et ne garde que la voix
      try { await stream.getAudioTracks()[0].applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 }); } catch (e) { /* ignoré */ }
      if (!stream.getAudioTracks().length) throw new Error('pas de piste audio');
      const ms = new MediaStream(stream.getAudioTracks());
      holder = new Audio(); holder.muted = true; holder.srcObject = ms; try { await holder.play(); } catch (e) { /* ignoré */ }
      src = ctx.createMediaStreamSource(ms); src.connect(pre);
      return { ok: true };
    } catch (e) { window.eqStop(); return { ok: false, err: (e && (e.name + ' ' + e.message)) || 'erreur' }; }
  };
  setInterval(() => {
    if (!an || !src) return;
    an.getByteFrequencyData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i];
    const st = stream && stream.getAudioTracks()[0] ? stream.getAudioTracks()[0].getSettings() : {};
    send({ state: ctx.state, level: s, cfg: 'ech=' + st.echoCancellation + ' bruit=' + st.noiseSuppression + ' gain=' + st.autoGainControl + ' ' + (st.sampleRate || '?') + 'Hz ' + (st.channelCount || '?') + 'c / sortie ' + ctx.sampleRate + 'Hz', tracks: stream ? stream.getAudioTracks().map((t) => t.readyState).join(',') : '' });
  }, 600);
})();
