// Звуки корта синтезом (файлов нет): удар — щелчок, звон струн и «пок» мяча; отскок — глухой «тук» по грунту с песком;
// сетка, свист ракетки на замахе, шаги и шорох скольжения по грунту. Лёгкое эхо от ограждения, панорама по месту на корте.
export function makeSound() {
  let ctx = null, out = null, noise = null, slideGain = null, chargeOsc = null, chargeGain = null;
  const ready = () => {
    if (!ctx) {
      ctx = new AudioContext();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Эхо открытого корта: короткий затухающий шум, тихо.
      const ir = ctx.createBuffer(2, ctx.sampleRate * 0.5, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08)) * (i < ctx.sampleRate * 0.012 ? 0 : 1); }
      const verb = ctx.createConvolver(); verb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.18;
      const comp = ctx.createDynamicsCompressor();
      out = ctx.createGain(); out.gain.value = 0.9;
      out.connect(comp); out.connect(verb).connect(wet).connect(comp); comp.connect(ctx.destination);
      // Шорох скольжения — постоянный шум, громкость по скорости скольжения.
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
      slideGain = ctx.createGain(); slideGain.gain.value = 0;
      src.connect(bp).connect(slideGain).connect(out); src.start();
      // Тон накопления силы удара: тихий, растёт вместе с силой.
      chargeOsc = ctx.createOscillator(); chargeOsc.type = 'triangle'; chargeOsc.frequency.value = 160;
      chargeGain = ctx.createGain(); chargeGain.gain.value = 0;
      chargeOsc.connect(chargeGain).connect(out); chargeOsc.start();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const bus = (pan = 0) => { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(out); return p; };
  const env = (g, t, vol, attack, decay) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); };
  const tone = (dst, f0, f1, vol, decay, type = 'sine', attack = 0.001) => {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + decay);
    env(g, t, vol, attack, decay); o.connect(g).connect(dst); o.start(t); o.stop(t + attack + decay + 0.02);
  };
  const hiss = (dst, type, freq, q, vol, decay, attack = 0.001, sweep = 0) => {
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + attack + decay); f.Q.value = q;
    env(g, t, vol, attack, decay); s.connect(f).connect(g).connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + attack + decay + 0.02);
  };
  const on = (fn) => (...a) => { if (ctx) fn(...a); };
  return {
    unlock: () => { try { ready(); } catch { /* без звука */ } },
    // q — насколько чисто попал (0..1), spin > 0 — кручёный (шорох струн по мячу).
    // power — сила удержанием: громче, глуше и плотнее («тхвак»).
    hit: on(({ q = 1, vol = 1, pan = 0, spin = 0, power = 0 } = {}) => {
      const b = bus(pan), v = vol * (0.55 + 0.45 * q) * (1 + 0.25 * power);
      hiss(b, 'highpass', 3500, 0.7, 0.5 * v * (1 - 0.5 * power), 0.008); // щелчок
      if (power > 0.3) { tone(b, 130, 70, 0.5 * v * power, 0.1); hiss(b, 'lowpass', 900, 0.7, 0.3 * v * power, 0.08); }
      tone(b, 1350 + 250 * q, 950, 0.55 * v, 0.035);                   // «пок» мяча
      tone(b, 545, 520, 0.28 * v * q, 0.09);                           // звон струн, у чистого удара громче
      tone(b, 180, 120, 0.35 * v, 0.05);                               // тело удара
      if (spin > 150) hiss(b, 'bandpass', 2600, 1.2, 0.18 * v, 0.05);  // кручёный «шшш» по струнам
      if (spin < -150) hiss(b, 'lowpass', 1400, 0.8, 0.2 * v, 0.06);  // резаный — мягкий «чух» снизу
      if (q < 0.55) tone(b, 310, 260, 0.25 * v, 0.06, 'triangle');     // в обод — глухо и дребезжит
    }),
    bounce: on(({ vol = 1, pan = 0 } = {}) => {
      const b = bus(pan);
      tone(b, 210, 140, 0.4 * vol, 0.045);
      hiss(b, 'lowpass', 700, 0.8, 0.35 * vol, 0.04);
      hiss(b, 'highpass', 2500, 0.5, 0.06 * vol, 0.03);               // песок грунта
    }),
    net: on(({ pan = 0 } = {}) => {
      const b = bus(pan);
      hiss(b, 'lowpass', 380, 1, 0.5, 0.18);
      tone(b, 95, 70, 0.3, 0.2, 'triangle');
    }),
    whoosh: on(({ vol = 1, pan = 0 } = {}) => hiss(bus(pan), 'bandpass', 380, 1.4, 0.22 * vol, 0.16, 0.06, 3.2)),
    // Встал к удару с бега: упор кроссовками в грунт — глухой толчок и шарканье песка.
    plant: on(({ vol = 1, pan = 0 } = {}) => {
      const b = bus(pan);
      tone(b, 120, 70, 0.22 * vol, 0.07);
      hiss(b, 'bandpass', 900, 0.8, 0.22 * vol, 0.16, 0.01, 0.6);
      hiss(b, 'highpass', 2800, 0.6, 0.06 * vol, 0.08);
    }),
    step: on(({ vol = 1, pan = 0 } = {}) =>hiss(bus(pan), 'bandpass', 1300 + Math.random() * 500, 0.9, 0.07 * vol, 0.05)),
    slide: on((level) => slideGain.gain.setTargetAtTime(0.22 * level, ctx.currentTime, 0.05)),
    charge: on((level) => { // level < 0 — не копит
      chargeGain.gain.setTargetAtTime(level < 0 ? 0 : 0.012 + 0.03 * level, ctx.currentTime, 0.05);
      chargeOsc.frequency.setTargetAtTime(160 + 200 * Math.max(0, level), ctx.currentTime, 0.06);
    }),
  };
}
