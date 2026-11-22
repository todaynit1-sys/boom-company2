// 회사 뿌개기 — audio module
// Everything is synthesised at runtime with the Web Audio API: no files, no speech.
// Characters never "talk" with voices; 'mumble' / 'yelp' etc. are abstract cartoon blips.
//
// Structure
//   helpers (tone / noise / bell)  -> SFX builders  (ctx, out, t, P) => endTime
//   INST / DRUM                    -> TRACKS (small pattern tables) -> Player (lookahead scheduler)
//   createEngine(ctx)              -> works on a live AudioContext or an OfflineAudioContext
//   audio                          -> the public live API (see bottom)
//   audioLab                       -> offline render helpers for tools/audio-test.html

const M = Math.max;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ------------------------------------------------------------------ helpers */

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

// gain envelope: 0 -> v (a) -> hold (h) -> exp decay (d)
function envelope(param, t, a, h, d, v) {
  v = M(v, 0.0002);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(v, t + a);
  if (h > 0) param.setValueAtTime(v, t + a + h);
  param.exponentialRampToValueAtTime(0.0001, t + a + h + d);
  return t + a + h + d;
}

function sweep(param, t, list, lin) {
  for (const [dt, f] of list) {
    if (lin) param.linearRampToValueAtTime(f, t + dt);
    else param.exponentialRampToValueAtTime(M(5, f), t + dt);
  }
}

function addFilter(ctx, node, t, o, span) {
  const type = o.lp ? 'lowpass' : o.bp ? 'bandpass' : o.hp ? 'highpass' : null;
  if (!type) return node;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(o.lp || o.bp || o.hp, t);
  if (o.ffs) sweep(fl.frequency, t, o.ffs);
  else if (o.ff1) fl.frequency.exponentialRampToValueAtTime(M(20, o.ff1), t + (o.fg ?? span));
  fl.Q.value = o.q ?? 0.7;
  node.connect(fl);
  return fl;
}

// Oscillator voice. o: {type,f,f1,g,fs,vib:[rate,depthHz],detune,a,h,d,v,lp|bp|hp,q,ff1,ffs}
function tone(ctx, out, t, o) {
  const a = M(0.001, o.a ?? 0.003), h = M(0, o.h ?? 0), d = M(0.005, o.d ?? 0.2);
  const span = a + h + d, end = t + span;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(M(5, o.f), t);
  if (o.fs) sweep(osc.frequency, t, o.fs, o.lin);
  else if (o.f1) osc.frequency.exponentialRampToValueAtTime(M(5, o.f1), t + (o.g ?? span));
  if (o.detune) osc.detune.value = o.detune;
  if (o.vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
    l.connect(lg); lg.connect(osc.frequency);
    l.start(t); l.stop(end + 0.03);
  }
  const node = addFilter(ctx, osc, t, o, span);
  const g = ctx.createGain();
  envelope(g.gain, t, a, h, d, o.v ?? 0.5);
  node.connect(g); g.connect(out);
  osc.start(t); osc.stop(end + 0.03);
  return end;
}

// Filtered noise burst. o: {lp|bp|hp (freq), q, ff1, ffs, a,h,d,v, rate}
function noise(ctx, out, t, o) {
  const a = M(0.001, o.a ?? 0.002), h = M(0, o.h ?? 0), d = M(0.005, o.d ?? 0.1);
  const span = a + h + d, end = t + span;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx); src.loop = true;
  src.playbackRate.value = o.rate || 1;
  const node = addFilter(ctx, src, t, o.lp || o.bp || o.hp ? o : { ...o, bp: 1000 }, span);
  const g = ctx.createGain();
  envelope(g.gain, t, a, h, d, o.v ?? 0.4);
  node.connect(g); g.connect(out);
  src.start(t, Math.random() * 1.8); src.stop(end + 0.03);
  return end;
}

const thump = (c, o, t, f0, f1, d, v) => tone(c, o, t, { f: f0, f1, d, v, a: 0.002 });

function bell(c, o, t, f, { d = 1, v = 0.3, ratios = [1, 2.76, 5.4, 8.93], amps = [1, 0.45, 0.2, 0.1], a = 0.002 } = {}) {
  let e = 0;
  ratios.forEach((r, i) => { e = M(e, tone(c, o, t, { f: f * r, a, d: d / (1 + i * 0.7), v: v * (amps[i] ?? 0.1) })); });
  return e;
}

// n events spread over `span`, denser at the start; fn(time, k) where k fades 1 -> ~0.3
function scatter(t, n, span, fn) {
  let e = t;
  for (let i = 0; i < n; i++) {
    const tt = t + span * Math.pow(Math.random(), 1.7);
    const k = 1 - 0.7 * ((tt - t) / span);
    e = M(e, fn(tt, k, i));
  }
  return e;
}

/* ------------------------------------------------------------------ impacts */

function hit(c, o, t, p, mat) {
  switch (mat) {
    case 'wood': return M(
      tone(c, o, t, { type: 'triangle', f: 220 * p, f1: 150 * p, d: 0.14, v: 0.45 }),
      tone(c, o, t, { f: 470 * p, d: 0.06, v: 0.14 }),
      noise(c, o, t, { bp: 1800 * p, q: 1.4, d: 0.045, v: 0.55 }),
      thump(c, o, t, 100 * p, 48, 0.14, 0.6));
    case 'metal': return M(
      bell(c, o, t, 520 * p, { d: 0.75, v: 0.22, ratios: [1, 2.41, 3.87, 5.93], amps: [1, 0.6, 0.35, 0.2] }),
      noise(c, o, t, { hp: 3500, d: 0.035, v: 0.4 }),
      thump(c, o, t, 120 * p, 60, 0.1, 0.45));
    case 'glass': return M(
      tone(c, o, t, { f: 1900 * p, d: 0.3, v: 0.12 }),
      tone(c, o, t, { f: 2870 * p, d: 0.22, v: 0.1 }),
      tone(c, o, t, { f: 4230 * p, d: 0.14, v: 0.08 }),
      noise(c, o, t, { hp: 5500, d: 0.05, v: 0.3 }),
      thump(c, o, t, 160 * p, 80, 0.06, 0.3));
    case 'plastic': return M(
      tone(c, o, t, { type: 'square', f: 320 * p, f1: 250 * p, lp: 1800, d: 0.06, v: 0.22 }),
      noise(c, o, t, { bp: 2600 * p, q: 2, d: 0.03, v: 0.45 }),
      thump(c, o, t, 110 * p, 60, 0.09, 0.45));
    case 'soft': return M(
      noise(c, o, t, { lp: 500 * p, d: 0.15, v: 0.6, a: 0.004 }),
      thump(c, o, t, 75 * p, 45, 0.18, 0.7));
    case 'paper': return M(
      noise(c, o, t, { bp: 3200 * p, q: 0.8, d: 0.09, v: 0.4 }),
      noise(c, o, t + 0.03, { hp: 6000, d: 0.05, v: 0.18 }),
      thump(c, o, t, 90 * p, 60, 0.05, 0.3));
    case 'ceramic': return M(
      tone(c, o, t, { f: 1150 * p, d: 0.22, v: 0.15 }),
      tone(c, o, t, { f: 2550 * p, d: 0.16, v: 0.11 }),
      tone(c, o, t, { f: 3900 * p, d: 0.1, v: 0.08 }),
      noise(c, o, t, { bp: 3500, q: 1, d: 0.03, v: 0.45 }),
      thump(c, o, t, 140 * p, 70, 0.08, 0.45));
    case 'plant': return M(
      scatter(t, 5, 0.22, (tt, k) => noise(c, o, tt, { bp: rand(2500, 4200), q: 1.2, a: 0.006, d: 0.05, v: 0.22 * k })),
      tone(c, o, t, { type: 'triangle', f: 300 * p, d: 0.05, v: 0.2 }),
      thump(c, o, t, 150 * p, 90, 0.1, 0.45));
  }
  return t;
}

const shards = {
  wood: (c, o, tt, k, p) => M(
    tone(c, o, tt, { type: 'triangle', f: rand(500, 1100) * p, d: 0.04, v: 0.12 * k }),
    noise(c, o, tt, { bp: rand(1500, 3500), q: 2, d: 0.02, v: 0.2 * k })),
  glass: (c, o, tt, k, p) => tone(c, o, tt, { f: rand(2200, 6000) * p, d: rand(0.05, 0.2), v: 0.07 * k }),
  metal: (c, o, tt, k, p) => bell(c, o, tt, rand(700, 2200) * p, { d: 0.18, v: 0.06 * k, ratios: [1, 2.41, 3.87], amps: [1, 0.5, 0.3] }),
  plastic: (c, o, tt, k, p) => tone(c, o, tt, { type: 'square', f: rand(600, 1400) * p, lp: 2500, d: 0.025, v: 0.08 * k }),
  ceramic: (c, o, tt, k, p) => tone(c, o, tt, { f: rand(1500, 4500) * p, d: rand(0.04, 0.12), v: 0.09 * k }),
};

/* ------------------------------------------------------------------ SFX table */

const brass = (c, o, t, f, h, v) => M(
  tone(c, o, t, { type: 'sawtooth', f, detune: -6, a: 0.02, h, d: 0.18, v, lp: 700, ffs: [[0.05, 2600], [0.2 + h, 1400]] }),
  tone(c, o, t, { type: 'sawtooth', f, detune: 6, a: 0.02, h, d: 0.18, v, lp: 700, ffs: [[0.05, 2600], [0.2 + h, 1400]] }));

function mumble(c, o, t, p, base, syl, gap) {
  const n = 3 + Math.floor(Math.random() * 3);
  let tt = t, e = t;
  for (let i = 0; i < n; i++) {
    const f = base * p * rand(0.85, 1.25), up = Math.random() < 0.5;
    const len = syl * rand(0.8, 1.3);
    e = M(e, tone(c, o, tt, {
      type: 'sawtooth', f, fs: [[len, f * (up ? 1.25 : 0.8)]], a: 0.012, h: len * 0.4, d: len * 0.6, v: 0.2,
      bp: rand(500, 1100), q: 2.2, ffs: [[len, rand(700, 1600)]],
    }));
    tt += len + gap * rand(0.6, 1.4);
  }
  return e;
}

const SFX = {
  step: (c, o, t, p) => M(noise(c, o, t, { lp: 700 * p, d: 0.045, v: 0.35 }), thump(c, o, t, 90 * p, 55, 0.05, 0.3)),
  stepCarpet: (c, o, t, p) => M(noise(c, o, t, { lp: 350 * p, d: 0.06, v: 0.3, a: 0.004 }), thump(c, o, t, 70 * p, 45, 0.06, 0.2)),
  jump: (c, o, t, p) => M(tone(c, o, t, { f: 260 * p, f1: 620 * p, a: 0.005, d: 0.16, v: 0.3 }), noise(c, o, t, { bp: 1200, d: 0.06, v: 0.15 })),
  land: (c, o, t, p) => M(thump(c, o, t, 100 * p, 45, 0.12, 0.8), noise(c, o, t, { lp: 600 * p, d: 0.07, v: 0.45 })),
  whoosh: (c, o, t, p) => noise(c, o, t, { bp: 350 * p, q: 1.3, ffs: [[0.12, 1800 * p], [0.28, 600 * p]], a: 0.1, d: 0.18, v: 0.45 }),
  punch: (c, o, t, p) => M(
    noise(c, o, t, { bp: 800 * p, q: 1, ff1: 2500 * p, a: 0.025, d: 0.03, v: 0.25 }),
    thump(c, o, t + 0.03, 170 * p, 60, 0.13, 0.95),
    noise(c, o, t + 0.03, { bp: 1200 * p, q: 1, d: 0.045, v: 0.6 }),
    tone(c, o, t + 0.03, { type: 'triangle', f: 250 * p, f1: 120 * p, d: 0.06, v: 0.3 })),
  kick: (c, o, t, p) => M(
    noise(c, o, t, { bp: 600 * p, q: 1, ff1: 2000 * p, a: 0.04, d: 0.04, v: 0.25 }),
    thump(c, o, t + 0.05, 125 * p, 42, 0.19, 1),
    noise(c, o, t + 0.05, { lp: 1500 * p, d: 0.07, v: 0.6 }),
    tone(c, o, t + 0.05, { type: 'triangle', f: 200 * p, f1: 90 * p, d: 0.08, v: 0.3 })),

  hitWood: (c, o, t, p) => hit(c, o, t, p, 'wood'),
  hitMetal: (c, o, t, p) => hit(c, o, t, p, 'metal'),
  hitGlass: (c, o, t, p) => hit(c, o, t, p, 'glass'),
  hitPlastic: (c, o, t, p) => hit(c, o, t, p, 'plastic'),
  hitSoft: (c, o, t, p) => hit(c, o, t, p, 'soft'),
  hitPaper: (c, o, t, p) => hit(c, o, t, p, 'paper'),
  hitCeramic: (c, o, t, p) => hit(c, o, t, p, 'ceramic'),
  hitPlant: (c, o, t, p) => hit(c, o, t, p, 'plant'),

  breakWood: (c, o, t, p) => M(
    hit(c, o, t, p * 0.85, 'wood'),
    noise(c, o, t, { bp: 1100 * p, q: 3, d: 0.09, v: 0.65 }),
    scatter(t + 0.02, 9, 0.45, (tt, k) => shards.wood(c, o, tt, k, p)),
    thump(c, o, t + 0.13, 80 * p, 45, 0.1, 0.4)),
  breakGlass: (c, o, t, p) => M(
    hit(c, o, t, p, 'glass'),
    noise(c, o, t, { hp: 3000, d: 0.25, v: 0.45 }),
    noise(c, o, t + 0.02, { hp: 7000, d: 0.45, v: 0.13 }),
    scatter(t + 0.01, 22, 0.8, (tt, k) => shards.glass(c, o, tt, k, p))),
  breakMetal: (c, o, t, p) => M(
    hit(c, o, t, p * 0.9, 'metal'),
    noise(c, o, t, { bp: 2500, q: 0.8, d: 0.12, v: 0.35 }),
    scatter(t + 0.05, 10, 0.7, (tt, k) => shards.metal(c, o, tt, k, p)),
    thump(c, o, t + 0.25, 110 * p, 60, 0.08, 0.35),
    thump(c, o, t + 0.48, 120 * p, 65, 0.06, 0.2)),
  breakPlastic: (c, o, t, p) => M(
    hit(c, o, t, p, 'plastic'),
    noise(c, o, t, { bp: 2000 * p, q: 2, d: 0.06, v: 0.55 }),
    scatter(t + 0.03, 8, 0.4, (tt, k) => shards.plastic(c, o, tt, k, p))),
  breakCeramic: (c, o, t, p) => M(
    hit(c, o, t, p, 'ceramic'),
    noise(c, o, t, { bp: 4000, q: 0.8, d: 0.2, v: 0.25 }),
    scatter(t + 0.01, 16, 0.6, (tt, k) => shards.ceramic(c, o, tt, k, p))),
  crash: (c, o, t, p) => M(
    thump(c, o, t, 75 * p, 30, 0.9, 1),
    noise(c, o, t, { lp: 1400 * p, ff1: 250, a: 0.005, d: 1.4, v: 0.6 }),
    noise(c, o, t, { bp: 2500, q: 0.7, d: 0.3, v: 0.35 }),
    hit(c, o, t, p * 0.8, 'wood'),
    thump(c, o, t + 0.35, 60 * p, 35, 0.4, 0.45),
    scatter(t + 0.02, 26, 1.3, (tt, k, i) => shards[['glass', 'metal', 'wood', 'ceramic'][i % 4]](c, o, tt, k, p))),
  flip: (c, o, t, p) => M(
    noise(c, o, t, { bp: 300 * p, q: 1.2, ff1: 1500 * p, a: 0.12, d: 0.12, v: 0.35 }),
    thump(c, o, t + 0.3, 85 * p, 38, 0.35, 1),
    tone(c, o, t + 0.3, { type: 'triangle', f: 160 * p, f1: 100 * p, d: 0.2, v: 0.45 }),
    noise(c, o, t + 0.3, { lp: 900 * p, d: 0.2, v: 0.6 }),
    scatter(t + 0.36, 5, 0.45, (tt, k) => noise(c, o, tt, { bp: rand(2500, 5000), q: 1.5, a: 0.01, d: 0.06, v: 0.2 * k }))),
  paper: (c, o, t, p) => M(
    noise(c, o, t, { lp: 900, a: 0.08, d: 0.4, v: 0.12 }),
    scatter(t, 11, 0.7, (tt, k) => noise(c, o, tt, { bp: rand(2500, 5500) * p, q: 1.5, a: 0.01, d: rand(0.04, 0.09), v: rand(0.15, 0.35) * k }))),

  // the core reward: a bright two-note "bling", quantised to a major-pentatonic ladder so combos climb musically
  coin: (c, o, t, p) => {
    const semis = 12 * Math.log2(p), oct = Math.floor(semis / 12), r = semis - oct * 12;
    const pent = [0, 2, 4, 7, 9, 12];
    let best = 0; for (const s of pent) if (Math.abs(s - r) < Math.abs(best - r)) best = s;
    const q = Math.pow(2, (oct * 12 + best) / 12);
    const f1 = 988 * q, f2 = 1319 * q;
    return M(
      tone(c, o, t, { type: 'square', f: f1, lp: 5000, a: 0.002, d: 0.06, v: 0.12 }),
      tone(c, o, t, { type: 'triangle', f: f1, a: 0.002, d: 0.07, v: 0.2 }),
      tone(c, o, t + 0.055, { type: 'square', f: f2, lp: 6000, a: 0.002, h: 0.04, d: 0.28, v: 0.1 }),
      tone(c, o, t + 0.055, { type: 'triangle', f: f2, a: 0.002, h: 0.04, d: 0.35, v: 0.22 }),
      tone(c, o, t + 0.055, { f: f2 * 3, a: 0.002, d: 0.12, v: 0.05 }),
      tone(c, o, t + 0.09, { f: f2 * 2, a: 0.002, d: 0.2, v: 0.05 }));
  },
  ding: (c, o, t, p) => bell(c, o, t, 1319 * p, { d: 1.7, v: 0.3, ratios: [1, 2, 3.01, 4.2], amps: [1, 0.25, 0.12, 0.05] }),
  doorOpen: (c, o, t, p) => M(
    noise(c, o, t, { hp: 3000, d: 0.02, v: 0.2 }),
    tone(c, o, t, { type: 'sawtooth', f: 90 * p, lp: 300, a: 0.05, h: 0.45, d: 0.2, v: 0.12 }),
    noise(c, o, t, { lp: 700, ff1: 1600, a: 0.12, h: 0.3, d: 0.25, v: 0.28 })),
  doorClose: (c, o, t, p) => M(
    tone(c, o, t, { type: 'sawtooth', f: 90 * p, lp: 300, a: 0.05, h: 0.35, d: 0.15, v: 0.12 }),
    noise(c, o, t, { lp: 1600, ff1: 600, a: 0.1, h: 0.3, d: 0.15, v: 0.28 }),
    thump(c, o, t + 0.55, 90 * p, 50, 0.12, 0.6),
    noise(c, o, t + 0.55, { bp: 1500, q: 1, d: 0.03, v: 0.35 })),
  printerJam: (c, o, t, p) => {
    let e = t;
    for (let i = 0; i < 8; i++) {
      const tt = t + i * 0.075;
      e = M(e, tone(c, o, tt, { type: 'sawtooth', f: rand(60, 90) * p, lp: 800, a: 0.005, d: 0.05, v: 0.3 }),
        noise(c, o, tt, { bp: 1200, q: 1.5, d: 0.04, v: 0.3 }));
    }
    return M(e,
      thump(c, o, t + 0.65, 120 * p, 60, 0.09, 0.55), noise(c, o, t + 0.65, { bp: 900, q: 1, d: 0.05, v: 0.4 }),
      tone(c, o, t + 0.82, { type: 'square', f: 1046 * p, lp: 3000, a: 0.004, h: 0.05, d: 0.04, v: 0.13 }),
      tone(c, o, t + 0.97, { type: 'square', f: 1046 * p, lp: 3000, a: 0.004, h: 0.05, d: 0.04, v: 0.13 }));
  },
  printerBeep: (c, o, t, p) => M(
    tone(c, o, t, { type: 'square', f: 1568 * p, lp: 3500, a: 0.004, h: 0.05, d: 0.03, v: 0.15 }),
    tone(c, o, t + 0.14, { type: 'square', f: 1568 * p, lp: 3500, a: 0.004, h: 0.05, d: 0.03, v: 0.15 })),
  printerWhirr: (c, o, t, p) => {
    let e = M(
      tone(c, o, t, { type: 'sawtooth', f: 110 * p, f1: 160 * p, lp: 600, a: 0.06, h: 0.6, d: 0.2, v: 0.16 }),
      noise(c, o, t, { bp: 1800, q: 0.7, a: 0.06, h: 0.6, d: 0.2, v: 0.14 }));
    for (let i = 0; i < 4; i++) e = M(e, noise(c, o, t + 0.12 + i * 0.17, { hp: 3000, d: 0.015, v: 0.22 }));
    return e;
  },
  pickup: (c, o, t, p) => M(
    tone(c, o, t, { f: 420 * p, f1: 880 * p, a: 0.005, d: 0.11, v: 0.32 }),
    tone(c, o, t, { type: 'triangle', f: 210 * p, f1: 440 * p, a: 0.005, d: 0.08, v: 0.12 }),
    noise(c, o, t, { hp: 4000, d: 0.01, v: 0.15 })),
  drop: (c, o, t, p) => M(tone(c, o, t, { f: 600 * p, f1: 220 * p, d: 0.14, v: 0.25 }), thump(c, o, t + 0.04, 110 * p, 55, 0.1, 0.5)),
  pour: (c, o, t, p) => M(
    noise(c, o, t, { bp: 700 * p, q: 2, ff1: 1300 * p, a: 0.1, h: 0.7, d: 0.2, v: 0.25 }),
    scatter(t + 0.05, 16, 0.9, (tt, k) => { const f = rand(500, 1100) * p; return tone(c, o, tt, { f, f1: f * 1.6, a: 0.003, d: 0.04, v: 0.1 }); })),
  cupClink: (c, o, t, p) => M(
    tone(c, o, t, { f: 2700 * p, d: 0.18, v: 0.12 }), tone(c, o, t, { f: 3900 * p, d: 0.14, v: 0.09 }),
    tone(c, o, t, { f: 5200 * p, d: 0.08, v: 0.05 }), noise(c, o, t, { hp: 6000, d: 0.01, v: 0.15 })),
  register: (c, o, t, p) => {
    let e = t;
    for (let i = 0; i < 4; i++) e = M(e, noise(c, o, t + i * 0.03, { bp: 2500, q: 1.5, d: 0.02, v: 0.3 }),
      tone(c, o, t + i * 0.03, { type: 'square', f: 300, lp: 2000, d: 0.02, v: 0.08 }));
    return M(e,
      noise(c, o, t + 0.12, { lp: 600, a: 0.02, d: 0.2, v: 0.3 }), thump(c, o, t + 0.14, 110, 60, 0.08, 0.4),
      bell(c, o, t + 0.1, 2093 * p, { d: 0.9, v: 0.16, ratios: [1, 2.4, 3.9], amps: [1, 0.3, 0.1] }),
      bell(c, o, t + 0.17, 2637 * p, { d: 1.0, v: 0.16, ratios: [1, 2.4, 3.9], amps: [1, 0.3, 0.1] }));
  },

  ui: (c, o, t, p) => M(tone(c, o, t, { f: 1100 * p, d: 0.06, v: 0.22 }), tone(c, o, t, { type: 'triangle', f: 2200 * p, d: 0.025, v: 0.06 })),
  uiBack: (c, o, t, p) => tone(c, o, t, { f: 700 * p, f1: 480 * p, d: 0.09, v: 0.22 }),
  check: (c, o, t, p) => M(
    tone(c, o, t, { type: 'triangle', f: 1047 * p, d: 0.12, v: 0.25 }),
    tone(c, o, t + 0.08, { type: 'triangle', f: 1568 * p, h: 0.04, d: 0.3, v: 0.28 }),
    tone(c, o, t + 0.08, { f: 3136 * p, d: 0.15, v: 0.06 })),
  stressUp: (c, o, t, p) => M(
    tone(c, o, t, { type: 'sawtooth', f: 180 * p, fs: [[0.4, 330 * p]], lp: 1200, vib: [9, 12], a: 0.02, h: 0.2, d: 0.2, v: 0.18 }),
    tone(c, o, t, { f: 90 * p, f1: 135 * p, a: 0.02, h: 0.2, d: 0.2, v: 0.25 })),
  heartbeat: (c, o, t, p) => M(
    thump(c, o, t, 65 * p, 45, 0.14, 0.9), noise(c, o, t, { lp: 150, d: 0.08, v: 0.3 }),
    thump(c, o, t + 0.17, 55 * p, 40, 0.18, 0.7)),
  alarm: (c, o, t, p) => {
    let e = t;
    for (let i = 0; i < 4; i++) e = M(e, tone(c, o, t + i * 0.14, { type: 'square', f: (i % 2 ? 660 : 880) * p, lp: 2200, a: 0.005, h: 0.09, d: 0.04, v: 0.13 }));
    return e;
  },
  special: (c, o, t, p) => M(
    noise(c, o, t, { hp: 2000, d: 0.05, v: 0.55 }),
    thump(c, o, t, 140 * p, 32, 1.4, 1),
    noise(c, o, t, { lp: 2200, ff1: 180, a: 0.004, d: 1.2, v: 0.6 }),
    noise(c, o, t + 0.03, { bp: 3000, q: 0.8, ff1: 400, d: 0.6, v: 0.25 }),
    bell(c, o, t + 0.06, 1568 * p, { d: 0.7, v: 0.08, ratios: [1, 2], amps: [1, 0.3] }),
    bell(c, o, t + 0.12, 2093 * p, { d: 0.8, v: 0.08, ratios: [1, 2], amps: [1, 0.3] })),
  specialReady: (c, o, t, p) => {
    let e = t;
    [1047, 1319, 1568, 2093].forEach((f, i) => { e = M(e, tone(c, o, t + i * 0.06, { type: 'triangle', f: f * p, d: 0.25, v: 0.18 })); });
    return M(e, bell(c, o, t + 0.18, 2093 * p, { d: 0.9, v: 0.1, ratios: [1, 2, 3], amps: [1, 0.3, 0.1] }),
      noise(c, o, t + 0.1, { hp: 8000, a: 0.1, d: 0.4, v: 0.06 }));
  },
  mumble: (c, o, t, p) => mumble(c, o, t, p, 250, 0.075, 0.03),
  mumbleLow: (c, o, t, p) => mumble(c, o, t, p, 115, 0.11, 0.045),
  yelp: (c, o, t, p) => M(
    tone(c, o, t, { type: 'triangle', f: 500 * p, fs: [[0.06, 1100 * p], [0.18, 820 * p]], a: 0.005, h: 0.1, d: 0.08, v: 0.3 }),
    tone(c, o, t, { f: 1000 * p, fs: [[0.06, 2200 * p], [0.18, 1640 * p]], a: 0.005, h: 0.1, d: 0.08, v: 0.05 })),
  gasp: (c, o, t, p) => M(
    noise(c, o, t, { bp: 1300 * p, q: 2, ff1: 2400 * p, a: 0.18, d: 0.08, v: 0.35 }),
    tone(c, o, t, { f: 600 * p, f1: 900 * p, a: 0.15, d: 0.05, v: 0.04 })),
  sigh: (c, o, t, p) => M(
    noise(c, o, t, { bp: 1400 * p, q: 1.2, ff1: 500 * p, a: 0.12, h: 0.2, d: 0.6, v: 0.3 }),
    noise(c, o, t, { lp: 800 * p, a: 0.1, d: 0.7, v: 0.18 })),
  clockTick: (c, o, t, p) => M(noise(c, o, t, { hp: 3500, d: 0.012, v: 0.35 }), tone(c, o, t, { f: 2400 * p, d: 0.02, v: 0.15 })),
  tickLast: (c, o, t, p) => M(
    tone(c, o, t, { f: 1400 * p, d: 0.06, v: 0.32 }), tone(c, o, t, { f: 2800 * p, d: 0.03, v: 0.14 }),
    noise(c, o, t, { hp: 3000, d: 0.015, v: 0.4 }), thump(c, o, t, 200 * p, 120, 0.05, 0.25)),
  whistle: (c, o, t, p) => M(
    tone(c, o, t, { f: 2700 * p, vib: [28, 120], a: 0.01, h: 0.12, d: 0.05, v: 0.25 }),
    noise(c, o, t, { bp: 2700 * p, q: 4, a: 0.01, h: 0.12, d: 0.05, v: 0.15 }),
    tone(c, o, t + 0.24, { f: 2700 * p, vib: [28, 120], a: 0.01, h: 0.55, d: 0.12, v: 0.25 }),
    noise(c, o, t + 0.24, { bp: 2700 * p, q: 4, a: 0.01, h: 0.55, d: 0.1, v: 0.15 })),
  stamp: (c, o, t, p) => M(
    thump(c, o, t, 140 * p, 60, 0.12, 0.9), noise(c, o, t, { bp: 1500, q: 0.8, d: 0.05, v: 0.55 }),
    noise(c, o, t, { lp: 400, d: 0.1, v: 0.4 }), tone(c, o, t, { type: 'triangle', f: 90 * p, d: 0.1, v: 0.25 })),
  fanfare: (c, o, t, p) => {
    let e = t;
    [523, 659, 784].forEach((f, i) => { e = M(e, brass(c, o, t + i * 0.12, f * p, 0.06, 0.08)); });
    [523, 659, 784, 1047].forEach((f) => { e = M(e, brass(c, o, t + 0.4, f * p, 0.6, 0.06)); });
    return M(e, bell(c, o, t + 0.4, 2093 * p, { d: 1, v: 0.06, ratios: [1, 2], amps: [1, 0.3] }));
  },
  newRecord: (c, o, t, p) => {
    let e = t;
    [784, 880, 1047, 1175, 1319, 1568, 1760, 2093].forEach((f, i) => { e = M(e, tone(c, o, t + i * 0.045, { type: 'triangle', f: f * p, d: 0.18, v: 0.15 })); });
    [1047, 1319, 1568].forEach((f) => { e = M(e, bell(c, o, t + 0.4, f * p, { d: 1.3, v: 0.1, ratios: [1, 2, 3], amps: [1, 0.3, 0.1] })); });
    [523, 659, 784].forEach((f) => { e = M(e, brass(c, o, t + 0.4, f * p, 0.5, 0.05)); });
    return M(e, noise(c, o, t + 0.4, { hp: 8000, a: 0.05, d: 0.8, v: 0.06 }));
  },
};

// per-sound trim, measured with the offline render check (raw builder peak kept under ~0.9)
const LEVEL = {
  punch: 0.8, kick: 0.75, breakGlass: 0.72, crash: 0.4, flip: 0.85, special: 0.52, stamp: 0.72,
  coin: 1.8, check: 1.6, ding: 1.5, whistle: 1.6, fanfare: 1.6, newRecord: 1.5, specialReady: 1.5,
  pour: 1.8, paper: 1.8, printerBeep: 1.6, alarm: 2.2, sigh: 1.7, gasp: 1.7, mumble: 1.7, mumbleLow: 1.7,
  clockTick: 0.75, doorOpen: 1.4, tickLast: 0.85, hitMetal: 0.88, hitWood: 0.92, breakMetal: 0.8, breakWood: 0.8,
};

// sounds whose pitch must not be randomly jittered (musical / UI)
const TUNED = new Set(['coin', 'ding', 'check', 'ui', 'uiBack', 'fanfare', 'newRecord', 'specialReady', 'printerBeep', 'register', 'alarm', 'clockTick', 'tickLast', 'whistle']);

/* ------------------------------------------------------------------ music: instruments */

const INST = {
  ep: (c, o, t, f, d, v) => M(
    tone(c, o, t, { f, a: 0.006, d: d + 0.45, v: v * 0.5 }),
    tone(c, o, t, { f: f * 2, a: 0.003, d: 0.25, v: v * 0.12 }),
    tone(c, o, t, { f: f * 4.01, a: 0.002, d: 0.06, v: v * 0.04 })),
  vibes: (c, o, t, f, d, v) => M(tone(c, o, t, { f, a: 0.004, d: 1.3, v: v * 0.5, vib: [5, f * 0.004] }), tone(c, o, t, { f: f * 4, a: 0.002, d: 0.25, v: v * 0.07 })),
  bell: (c, o, t, f, d, v) => bell(c, o, t, f, { d: 1.1, v: v * 0.4, ratios: [1, 2, 3.01], amps: [1, 0.25, 0.08] }),
  pluck: (c, o, t, f, d, v) => M(
    tone(c, o, t, { type: 'triangle', f, a: 0.003, d: 0.25 + d * 0.3, v: v * 0.45 }),
    tone(c, o, t, { type: 'sawtooth', f, a: 0.003, d: 0.15, v: v * 0.12, lp: 2600, ff1: 500 })),
  piano: (c, o, t, f, d, v) => M(
    tone(c, o, t, { type: 'triangle', f, a: 0.004, d: 1.2 + d * 0.3, v: v * 0.4, lp: 3000 }),
    tone(c, o, t, { f: f * 2, a: 0.003, d: 0.5, v: v * 0.1 })),
  pad: (c, o, t, f, d, v) => M(
    tone(c, o, t, { type: 'sawtooth', f, detune: -8, a: 0.35, h: M(0, d - 0.35), d: 0.8, v: v * 0.09, lp: 1000 }),
    tone(c, o, t, { type: 'sawtooth', f, detune: 8, a: 0.35, h: M(0, d - 0.35), d: 0.8, v: v * 0.09, lp: 1000 })),
  bass: (c, o, t, f, d, v) => M(
    tone(c, o, t, { type: 'triangle', f, a: 0.005, h: M(0, d - 0.06), d: 0.12, v: v * 0.55, lp: 900 }),
    tone(c, o, t, { f, a: 0.005, h: M(0, d - 0.06), d: 0.12, v: v * 0.35 })),
  rbass: (c, o, t, f, d, v) => M(
    tone(c, o, t, { type: 'sawtooth', f, a: 0.004, h: M(0, d - 0.05), d: 0.08, v: v * 0.3, lp: 1400, ff1: 500 }),
    tone(c, o, t, { f, a: 0.004, h: M(0, d - 0.05), d: 0.08, v: v * 0.4 })),
  tuba: (c, o, t, f, d, v) => tone(c, o, t, { type: 'square', f, a: 0.02, h: M(0, d * 0.6), d: 0.1, v: v * 0.3, lp: 550 }),
  brass: (c, o, t, f, d, v) => brass(c, o, t, f, M(0, d - 0.04), v * 0.14),
  square: (c, o, t, f, d, v) => tone(c, o, t, { type: 'square', f, a: 0.005, h: M(0, d - 0.03), d: 0.08, v: v * 0.16, lp: 3500, vib: [5.5, f * 0.008] }),
  clar: (c, o, t, f, d, v) => tone(c, o, t, { type: 'square', f, a: 0.012, h: M(0, d * 0.5), d: 0.07, v: v * 0.18, lp: 1500, vib: [5, f * 0.006] }),
  pizz: (c, o, t, f, d, v) => tone(c, o, t, { type: 'triangle', f, a: 0.002, d: 0.18, v: v * 0.45, lp: 2000 }),
};

const DRUM = {
  kick: (c, o, t, v) => M(tone(c, o, t, { f: 150, f1: 45, g: 0.12, d: 0.25, v: v * 0.9 }), noise(c, o, t, { hp: 2000, d: 0.01, v: v * 0.12 })),
  snare: (c, o, t, v) => M(noise(c, o, t, { bp: 1800, q: 0.7, d: 0.16, v: v * 0.45 }), tone(c, o, t, { type: 'triangle', f: 190, f1: 160, d: 0.08, v: v * 0.28 })),
  clap: (c, o, t, v) => M(
    noise(c, o, t, { bp: 1200, q: 1, d: 0.02, v: v * 0.35 }), noise(c, o, t + 0.012, { bp: 1200, q: 1, d: 0.02, v: v * 0.35 }),
    noise(c, o, t + 0.024, { bp: 1200, q: 1, d: 0.13, v: v * 0.4 })),
  hat: (c, o, t, v) => noise(c, o, t, { hp: 7500, d: 0.04, v: v * 0.22 }),
  ohat: (c, o, t, v) => noise(c, o, t, { hp: 7000, d: 0.25, v: v * 0.16 }),
  rim: (c, o, t, v) => M(tone(c, o, t, { type: 'triangle', f: 1700, d: 0.03, v: v * 0.22 }), noise(c, o, t, { bp: 2500, q: 2, d: 0.015, v: v * 0.25 })),
  shaker: (c, o, t, v) => noise(c, o, t, { hp: 5000, a: 0.01, d: 0.05, v: v * 0.14 }),
  ride: (c, o, t, v) => M(noise(c, o, t, { hp: 6000, d: 0.35, v: v * 0.08 }), tone(c, o, t, { f: 3200, d: 0.4, v: v * 0.025 }), tone(c, o, t, { f: 4810, d: 0.3, v: v * 0.02 })),
  brush: (c, o, t, v) => noise(c, o, t, { bp: 3000, q: 0.6, a: 0.06, d: 0.18, v: v * 0.09 }),
  tick: (c, o, t, v) => M(tone(c, o, t, { f: 2600, d: 0.015, v: v * 0.25 }), noise(c, o, t, { hp: 4000, d: 0.01, v: v * 0.25 })),
  block: (c, o, t, v) => M(tone(c, o, t, { f: 950, d: 0.05, v: v * 0.25 }), tone(c, o, t, { f: 1900, d: 0.02, v: v * 0.08 })),
  tom: (c, o, t, v) => tone(c, o, t, { f: 140, f1: 90, d: 0.25, v: v * 0.6 }),
};

/* ------------------------------------------------------------------ music: tracks
   Patterns are 16 steps per bar.
   drum:  '.' rest, 'o' ghost, 'x' hit, 'X' accent
   bass:  r root, 3 third, 5 fifth, 7 seventh, o octave, l low fifth, '-' sustain;  'walk' = generative walking bass
   chord: 'x' full chord, '?' chord with 50% chance, digits 0-9 = single chord tone (arpeggio), '-' sustain
   lead:  per-bar strings of scale degrees (0-9, a-e), '-' sustain, '.' rest.
          The lead rotates main / variation / sparse-generative / main every progression cycle so it breathes. */

const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], '6': [0, 4, 7, 9] };

const TRACKS = {
  title: {
    bpm: 118, key: 60, scale: MAJ, gain: 0.72,
    prog: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, '7']],
    parts: [
      { type: 'drum', inst: 'kick', pat: 'x...x...x...x...', v: 0.8 },
      { type: 'drum', inst: 'clap', pat: '....x.......x...', v: 0.6 },
      { type: 'drum', inst: 'hat', pat: '..x...x...x...x.', v: 0.8 },
      { type: 'drum', inst: 'shaker', pat: 'o.o.o.o.o.o.o.o.', v: 0.8 },
      { type: 'bass', inst: 'bass', pat: 'r..r..5.r..o..5.', oct: -2, v: 0.8 },
      { type: 'chord', inst: 'pluck', pat: '..x...x...x...x.', oct: 0, v: 0.5 },
      { type: 'lead', inst: 'bell', oct: 1, v: 0.6, bars: ['4.2.4.7-6-4.2---', '5.4.2.0---2.4---', '3.5.7.9-8-7.5---', '6.5.4.3-4-6.7---'] },
    ],
  },
  office: { // lazy bossa / lo-fi: a little bored
    bpm: 92, key: 65, scale: MAJ, swing: 0.12, gain: 0.72,
    prog: [[0, 'maj7'], [2, 'm7'], [4, 'm7'], [2, 'm7']],
    parts: [
      { type: 'drum', inst: 'kick', pat: 'x..x....x..x....', v: 0.55 },
      { type: 'drum', inst: 'rim', pat: ['..x..x....x..x..', '..x...x...x..x..'], v: 0.7 },
      { type: 'drum', inst: 'shaker', pat: 'x.o.x.o.x.o.x.o.', v: 0.8 },
      { type: 'bass', inst: 'bass', pat: 'r-.5-.r.r-.5-.5.', oct: -2, v: 0.75 },
      { type: 'chord', inst: 'ep', pat: '..x-.x-...x-.x-.', oct: 0, v: 0.42 },
      { type: 'lead', inst: 'vibes', oct: 1, v: 0.5, bars: ['4---2-..........', '....3-4-5---....', '6---5-4-2---....', '..........1-0---'] },
    ],
  },
  lobby: { // café jazz, swung, airy
    bpm: 96, key: 58, scale: MAJ, swing: 0.3, swingUnit: 8, gain: 0.55,
    prog: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, '7']],
    parts: [
      { type: 'drum', inst: 'ride', pat: 'x...x.x.x...x.x.', v: 0.9 },
      { type: 'drum', inst: 'hat', pat: '....o.......o...', v: 1 },
      { type: 'drum', inst: 'brush', pat: 'x.......x.......', v: 0.9 },
      { type: 'drum', inst: 'kick', pat: 'o.......o.......', v: 0.5 },
      { type: 'bass', inst: 'bass', pat: 'walk', oct: -2, v: 0.8 },
      { type: 'chord', inst: 'ep', pat: '?.....?...?..?..', oct: 0, v: 0.36, len: 2 },
      { type: 'lead', inst: 'vibes', oct: 1, v: 0.45, bars: ['1-.2.3-.4-.3.2..', '6-5-4-3-2---....', '0-.2.4.6-5---...', '5-4-3-1---......'] },
    ],
  },
  sunset: { // wistful, almost home
    bpm: 72, key: 62, scale: MAJ, gain: 0.66,
    prog: [[5, 'maj7'], [7, '7'], [4, 'm7'], [9, 'm7']],
    parts: [
      { type: 'drum', inst: 'kick', pat: 'o.......o.......', v: 0.7 },
      { type: 'drum', inst: 'shaker', pat: '..o...o...o...o.', v: 0.8 },
      { type: 'chord', inst: 'pad', pat: 'x---------------', oct: -1, v: 0.7 },
      { type: 'chord', inst: 'piano', pat: '0.1.2.3.4.3.2.1.', oct: 0, v: 0.32 },
      { type: 'bass', inst: 'bass', pat: 'r-------5---r---', oct: -2, v: 0.6 },
      { type: 'lead', inst: 'piano', oct: 1, v: 0.5, bars: ['9---8-7-5-------', '6---4---8---7-6-', '4---2---1---2-4-', '5-------........'] },
    ],
  },
  tense: { // building pressure (not horror)
    bpm: 100, key: 57, scale: MIN, gain: 0.62, tick: 0.5,
    prog: [[0, 'min'], [0, 'min'], [8, 'maj'], [7, 'maj']],
    parts: [
      { type: 'drum', inst: 'kick', pat: 'x.......x..x....', v: 0.75 },
      { type: 'drum', inst: 'snare', pat: '............o...', v: 0.6 },
      { type: 'drum', inst: 'hat', pat: 'oxoxoxoxoxoxoxox', v: 0.6 },
      { type: 'bass', inst: 'bass', pat: 'r.r.r.r.r.r.r.r.', oct: -2, v: 0.7 },
      { type: 'chord', inst: 'pluck', pat: '0.2.1.2.0.2.1.2.', oct: 0, v: 0.35 },
      { type: 'chord', inst: 'pad', pat: 'x---------------', oct: -1, v: 0.5 },
      { type: 'lead', inst: 'bell', oct: 1, v: 0.4, bars: ['................', '7-------........', '................', '6-------5-------'] },
    ],
  },
  rage: { // the 60-second rampage: fast ska-punk romp, cartoon-fun
    bpm: 164, key: 52, scale: MAJ, gain: 0.8,
    prog: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']],
    parts: [
      { type: 'drum', inst: 'kick', pat: 'x...x...x...x.x.', v: 0.7 },
      { type: 'drum', inst: 'snare', pat: '....X.......X...', v: 0.62 },
      { type: 'drum', inst: 'hat', pat: 'x.x.x.x.x.x.x.x.', v: 0.8 },
      { type: 'drum', inst: 'ohat', pat: ['..............x.', '................'], v: 0.6 },
      { type: 'bass', inst: 'rbass', pat: 'r.r.r.r.r.r.5.o.', oct: -1, v: 0.8 },
      { type: 'chord', inst: 'brass', pat: '..x...x...x...x.', oct: 0, v: 0.6, len: 1 },
      { type: 'lead', inst: 'square', oct: 1, v: 0.6, bars: ['0.2.4.7-4.2.4---', '3.5.7.a-9.7.5---', '4.6.8.b-8.6.4---', '7-5-3-5-7---9-7-'] },
    ],
  },
  bill: { // cheeky, relieved oom-pah
    bpm: 126, key: 55, scale: MAJ, swing: 0.22, swingUnit: 8, gain: 1.0,
    prog: [[0, 'maj'], [7, '7'], [5, 'maj'], [7, '7']],
    parts: [
      { type: 'drum', inst: 'kick', pat: 'x.......x.......', v: 0.55 },
      { type: 'drum', inst: 'snare', pat: '....o.......o...', v: 0.6 },
      { type: 'drum', inst: 'block', pat: ['x.....x.........', 'x.....x...x.....'], v: 0.7 },
      { type: 'bass', inst: 'tuba', pat: 'r.......5.......', oct: -1, v: 1.3 },
      { type: 'chord', inst: 'pizz', pat: '....x.......x...', oct: 0, v: 0.75 },
      { type: 'lead', inst: 'clar', oct: 1, v: 0.85, bars: ['0.2.4.2.0...4.7.', '6.5.4.3.4...1...', '3.4.5.7.9.7.5.4.', '4.6.8.6.4...0...'] },
    ],
  },
};

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const sustainOf = (pat, s) => { let n = 1; while (s + n < pat.length && pat[s + n] === '-') n++; return n; };

class Player {
  constructor(eng, name) {
    const c = eng.ctx;
    this.e = eng; this.c = c; this.name = name; this.tr = TRACKS[name];
    this.seed = hashStr(name);
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(eng.musicIn);
    this.step = 0; this.next = c.currentTime + 0.06; this.stopAt = Infinity;
    // tension shimmer (detuned fifth + octave, slow beating) that fades in with stress
    const t0 = c.currentTime;
    this.dg = c.createGain(); this.dg.gain.value = 0; this.dg.connect(this.out);
    this.drone = [7, 12].map((iv, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(this.tr.key + 24 + iv); o.detune.value = i ? 4 : -4;
      o.connect(this.dg); o.start(t0); return o;
    });
    this.setIntensity(eng.inten, true);
  }
  setIntensity(v, now) {
    const t = this.c.currentTime, target = clamp((v - 0.55) / 0.45, 0, 1) * 0.035;
    if (now) this.dg.gain.value = target; else this.dg.gain.setTargetAtTime(target, t, 0.6);
  }
  fadeIn(sec) {
    const g = this.out.gain, t = this.c.currentTime, lvl = this.tr.gain ?? 1;
    g.cancelScheduledValues(t); g.setValueAtTime(sec > 0 ? 0 : lvl, t);
    if (sec > 0) g.linearRampToValueAtTime(lvl, t + sec);
  }
  fadeOut(sec) {
    const g = this.out.gain, t = this.c.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + sec);
    this.stopAt = t + sec;
  }
  dispose() {
    try { this.drone.forEach((o) => o.stop()); } catch (e) { /* already stopped */ }
    try { this.out.disconnect(); } catch (e) { /* ignore */ }
  }
  stepDur() { return 60 / (this.tr.bpm * (1 + 0.12 * this.e.inten)) / 4; }
  tick(until) {
    // if the timer stalled (throttled), skip ahead instead of firing a burst of late notes
    if (this.e.live && this.next < this.c.currentTime - 0.05) {
      const sd = this.stepDur(), missed = Math.ceil((this.c.currentTime + 0.02 - this.next) / sd);
      this.next += missed * sd; this.step += missed;
    }
    let guard = 0;
    while (this.next < until && this.next < this.stopAt && guard++ < 256) {
      const sd = this.stepDur();
      this.play(this.step, this.next, sd);
      this.next += sd; this.step++;
    }
  }
  play(step, t, sd) {
    const { c, out, tr } = this, I = this.e.inten;
    const s = step % 16, bar = Math.floor(step / 16), nb = tr.prog.length;
    const cyc = Math.floor(bar / nb), bi = bar % nb;
    const [root, qn] = tr.prog[bi], Q = QUAL[qn];
    const rng = mulberry((this.seed ^ Math.imul(step + 1, 2654435761)) >>> 0);
    if (tr.swing) {
      const unit8 = tr.swingUnit === 8;
      if (unit8 ? s % 4 === 2 : s % 2 === 1) t += tr.swing * sd * (unit8 ? 2 : 1);
    }
    const key = tr.key;
    let hasKick = false, hasHat = false;
    for (const P of tr.parts) {
      const pat = Array.isArray(P.pat) ? P.pat[bar % P.pat.length] : P.pat;
      const v = P.v ?? 0.7;
      if (P.type === 'drum') {
        if (P.inst === 'hat') hasHat = true;
        const ch = pat[s];
        if (ch && ch !== '.') {
          if (P.inst === 'kick') hasKick = true;
          const vel = ch === 'X' ? 1 : ch === 'o' ? 0.45 : 0.75;
          DRUM[P.inst](c, out, t, vel * v * (0.9 + rng() * 0.2));
        }
      } else if (P.type === 'bass') {
        let semi = null, len = 1;
        if (pat === 'walk') {
          if (s % 4 === 0) {
            const beat = s / 4; len = 4;
            if (beat === 0) semi = 0;
            else if (beat === 1) semi = [Q[1], Q[2], 2][Math.floor(rng() * 3)];
            else if (beat === 2) semi = [Q[2], Q[1], 5, 9][Math.floor(rng() * 4)];
            else {
              let nr = tr.prog[(bi + 1) % nb][0] - root; nr = ((nr % 12) + 12) % 12; if (nr > 6) nr -= 12;
              semi = nr + (rng() < 0.5 ? -1 : 1);
            }
          }
        } else {
          const ch = pat[s];
          const map = { r: 0, 3: Q[1], 5: Q[2], 7: Q[3] ?? 10, o: 12, l: Q[2] - 12 };
          if (ch in map) { semi = map[ch]; len = sustainOf(pat, s); }
        }
        if (semi !== null) INST[P.inst](c, out, t, mtof(key + root + semi + (P.oct ?? -2) * 12), len * sd, v);
      } else if (P.type === 'chord') {
        const ch = pat[s];
        if (!ch || ch === '.' || ch === '-') continue;
        const base = key + root + (P.oct ?? 0) * 12;
        const len = P.len ?? sustainOf(pat, s);
        if (ch === 'x' || (ch === '?' && rng() < 0.5)) {
          const vv = v / Math.sqrt(Q.length) * (0.9 + rng() * 0.2);
          for (const iv of Q) INST[P.inst](c, out, t + rng() * 0.008, mtof(base + iv), len * sd, vv);
        } else if (ch >= '0' && ch <= '9') {
          const i = +ch, iv = Q[i % Q.length] + 12 * Math.floor(i / Q.length);
          INST[P.inst](c, out, t, mtof(base + iv), len * sd, v * (0.9 + rng() * 0.2));
        }
      } else if (P.type === 'lead') {
        const mode = ['main', 'var', 'sparse', 'main'][cyc % 4];
        const base = key + (P.oct ?? 1) * 12;
        const deg2semi = (d) => tr.scale[d % 7] + 12 * Math.floor(d / 7);
        if (mode === 'sparse') {
          if (s % 4 === 0 && rng() < 0.3) {
            const iv = Q[Math.floor(rng() * Q.length)];
            INST[P.inst](c, out, t, mtof(key + root + iv + (P.oct ?? 1) * 12), 2 * sd, v * 0.7);
          }
          continue;
        }
        const mel = P.bars[bar % P.bars.length], ch = mel[s];
        if (!ch || ch === '.' || ch === '-') continue;
        let d = parseInt(ch, 36);
        if (Number.isNaN(d)) continue;
        if (mode === 'var') {
          if (rng() < 0.15) continue;
          if (rng() < 0.15) d = M(0, d + (rng() < 0.5 ? -1 : 1));
        }
        INST[P.inst](c, out, t, mtof(base + deg2semi(d)), sustainOf(mel, s) * sd, v * (0.9 + rng() * 0.2));
      }
    }
    // stress layers: ticking clock, tighter hats, extra kick drive
    const tickV = (tr.tick ?? 0) + clamp((I - 0.25) / 0.75, 0, 1) * 0.6;
    if (s % 4 === 0 && tickV > 0.02) DRUM.tick(c, out, t, tickV * (s === 0 ? 1 : 0.7));
    if (hasHat && I > 0.55 && s % 2 === 1) DRUM.hat(c, out, t, 0.35 * I);
    if (I > 0.8 && s % 4 === 0 && !hasKick) DRUM.kick(c, out, t, 0.4 * I);
  }
}

/* ------------------------------------------------------------------ engine */

const VOICE_CAP = 24;

function makeSoftClip(ctx) {
  const ws = ctx.createWaveShaper(), n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = ((i / (n - 1)) * 2 - 1) * 2; // shaper input is pre-scaled by 0.5 -> covers ±2
    const a = Math.abs(s);
    curve[i] = Math.sign(s) * (a < 0.65 ? a : 0.65 + 0.28 * Math.tanh((a - 0.65) / 0.28));
  }
  ws.curve = curve; ws.oversample = '2x';
  return ws;
}

export function createEngine(ctx, opts = {}) {
  const live = !!opts.live;
  const e = {
    ctx, live, inten: 0, sfxOn: true, bgmOn: true, voices: [], last: new Map(), warned: new Set(),
    player: null, dying: [], want: null,
  };
  // master: sfx + music -> glue compressor -> soft clipper -> out
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
  const pre = ctx.createGain(); pre.gain.value = 0.5;
  const clip = makeSoftClip(ctx);
  if (opts.raw) master.connect(ctx.destination);
  else { master.connect(comp); comp.connect(pre); pre.connect(clip); clip.connect(ctx.destination); }

  e.sfxBus = ctx.createGain(); e.sfxBus.gain.value = 0.9; e.sfxBus.connect(master);
  e.musicIn = ctx.createGain();
  e.musicFilter = ctx.createBiquadFilter(); e.musicFilter.type = 'lowpass'; e.musicFilter.frequency.value = 4500; e.musicFilter.Q.value = 0.5;
  e.duckGain = ctx.createGain();
  e.musicVol = ctx.createGain();
  e.musicLevel = opts.musicLevel ?? 0.18; // ≈ -15 dB under the sfx bus
  e.musicVol.gain.value = e.musicLevel;
  e.musicIn.connect(e.musicFilter); e.musicFilter.connect(e.duckGain); e.duckGain.connect(e.musicVol); e.musicVol.connect(master);

  e.warnOnce = (k, msg) => { if (!e.warned.has(k)) { e.warned.add(k); console.warn('[audio] ' + msg); } };

  e.sfxAt = (name, o = {}, when) => {
    if (!e.sfxOn) return false;
    const b = SFX[name];
    if (!b) { e.warnOnce('sfx:' + name, 'unknown sfx "' + name + '" (ignored)'); return false; }
    const t = M(when ?? 0, ctx.currentTime) + (live ? 0.005 : 0);
    const lt = e.last.get(name);
    if (lt !== undefined && Math.abs(t - lt) < 0.025) return false; // rate limit identical sfx
    e.last.set(name, t);
    e.voices = e.voices.filter((v) => v.end > t);
    while (e.voices.length >= VOICE_CAP) { // steal oldest
      const v = e.voices.shift();
      try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.008); } catch (err) { /* ignore */ }
    }
    const vol = clamp(Number.isFinite(o.vol) ? o.vol : 1, 0, 2);
    let p = clamp(Number.isFinite(o.pitch) && o.pitch > 0 ? o.pitch : 1, 0.25, 4);
    if (!TUNED.has(name)) p *= 1 + (Math.random() - 0.5) * 0.08;
    const g = ctx.createGain(); g.gain.value = vol * (LEVEL[name] ?? 1);
    let tail = g;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner(); pn.pan.value = clamp(Number.isFinite(o.pan) ? o.pan : 0, -1, 1);
      g.connect(pn); tail = pn;
    }
    tail.connect(e.sfxBus);
    let end;
    try { end = b(ctx, g, t, p); } catch (err) { e.warnOnce('err:' + name, 'sfx "' + name + '" failed: ' + err.message); return false; }
    e.voices.push({ g, end, name });
    if (live) setTimeout(() => { try { g.disconnect(); tail.disconnect(); } catch (err) { /* ignore */ } }, (end - ctx.currentTime + 0.4) * 1000);
    return true;
  };

  e.music = (name, fade = 1.2) => {
    if (name !== null && name !== undefined && !TRACKS[name]) { e.warnOnce('mus:' + name, 'unknown music "' + name + '" (ignored)'); return; }
    e.want = name ?? null;
    const target = e.bgmOn ? e.want : null;
    if ((e.player?.name ?? null) === target) return;
    if (e.player) { e.player.fadeOut(fade); e.dying.push(e.player); e.player = null; }
    if (target) { e.player = new Player(e, target); e.player.fadeIn(fade); }
  };

  e.setBgm = (on) => {
    e.bgmOn = !!on;
    const t = ctx.currentTime;
    e.musicVol.gain.cancelScheduledValues(t);
    e.musicVol.gain.setTargetAtTime(e.bgmOn ? e.musicLevel : 0, t, 0.15);
    const want = e.want; e.music(want, 0.6); e.want = want;
  };

  e.setIntensity = (v) => {
    e.inten = clamp(Number.isFinite(v) ? v : 0, 0, 1);
    const t = ctx.currentTime;
    e.musicFilter.frequency.setTargetAtTime(4500 * Math.pow(2, e.inten * 2), t, 0.5);
    if (e.player) e.player.setIntensity(e.inten);
  };

  e.duck = (amount = 0.5, ms = 400) => {
    const t = ctx.currentTime, g = e.duckGain.gain, a = clamp(amount, 0, 1);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(1 - a, t, 0.03);
    g.setTargetAtTime(1, t + M(0.05, ms / 1000), 0.18);
  };

  e.pump = (until) => {
    if (e.player) e.player.tick(until);
    e.dying = e.dying.filter((p) => {
      p.tick(until);
      if (ctx.currentTime > p.stopAt + 0.3) { p.dispose(); return false; }
      return true;
    });
  };

  e.activeVoices = () => e.voices.filter((v) => v.end > ctx.currentTime).length;
  return e;
}

/* ------------------------------------------------------------------ public live API */

let ctx = null, E = null, timer = null, worker = null, userSuspended = false, visBound = false;
const pending = { sfx: true, bgm: true, music: null, inten: 0 };
const LOOKAHEAD = 0.25;

function pumpLive() { if (E && ctx && ctx.state === 'running') E.pump(ctx.currentTime + LOOKAHEAD); }

function startTimer() {
  // a Worker timer keeps ticking at full rate even when the main thread is throttled
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},25)'], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = pumpLive;
  } catch (err) { worker = null; }
  timer = setInterval(pumpLive, worker ? 100 : 25);
}

function onVisibility() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else if (!userSuspended) ctx.resume().then(pumpLive).catch(() => {});
}

export const audio = {
  init() {
    try {
      if (!ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        ctx = new AC({ latencyHint: 'interactive' });
        E = createEngine(ctx, { live: true });
        E.sfxOn = pending.sfx;
        E.bgmOn = pending.bgm;
        if (!pending.bgm) E.musicVol.gain.value = 0;
        E.setIntensity(pending.inten);
        if (pending.music) E.music(pending.music);
        startTimer();
        if (!visBound && typeof document !== 'undefined') { document.addEventListener('visibilitychange', onVisibility); visBound = true; }
      }
      if (ctx.state !== 'running' && !userSuspended && !(typeof document !== 'undefined' && document.hidden)) {
        ctx.resume().then(pumpLive).catch(() => {});
      }
    } catch (err) { console.warn('[audio] init failed', err); }
  },
  setEnabled({ sfx, bgm } = {}) {
    if (typeof sfx === 'boolean') { pending.sfx = sfx; if (E) E.sfxOn = sfx; }
    if (typeof bgm === 'boolean') { pending.bgm = bgm; if (E) E.setBgm(bgm); }
  },
  music(name) {
    if (name !== null && name !== undefined && !TRACKS[name]) {
      if (E) E.music(name); else console.warn('[audio] unknown music "' + name + '" (ignored)');
      return;
    }
    pending.music = name ?? null;
    if (E) { E.music(pending.music); pumpLive(); }
  },
  intensity(v) { pending.inten = clamp(Number(v) || 0, 0, 1); if (E) E.setIntensity(pending.inten); },
  sfx(name, opts = {}) { if (!E) return; try { E.sfxAt(name, opts || {}); } catch (err) { /* never throw */ } },
  duck(amount = 0.5, ms = 400) { if (E) E.duck(amount, ms); },
  suspend() { userSuspended = true; if (ctx) ctx.suspend().catch(() => {}); },
  resume() {
    userSuspended = false;
    if (ctx && !(typeof document !== 'undefined' && document.hidden)) ctx.resume().then(pumpLive).catch(() => {});
  },
  state() {
    return {
      ready: !!(ctx && ctx.state === 'running'),
      music: E ? (E.player?.name ?? null) : pending.music,
      sfxOn: pending.sfx, bgmOn: pending.bgm,
      voices: E ? E.activeVoices() : 0,
    };
  },
};

/* ------------------------------------------------------------------ offline lab (tools/audio-test.html) */

export const audioLab = {
  sfxNames: Object.keys(SFX),
  trackNames: Object.keys(TRACKS),
  analyse(buf) {
    let peak = 0, sum = 0, n = 0, nan = false, last = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const x = d[i];
        if (Number.isNaN(x)) { nan = true; continue; }
        const a = Math.abs(x);
        if (a > peak) peak = a;
        sum += x * x; n++;
        if (a > 0.001 && i > last) last = i;
      }
    }
    return { peak, rms: Math.sqrt(sum / M(1, n)), dur: last / buf.sampleRate, nan };
  },
  // raw builder output (no compressor), so clipping in a builder is visible
  async renderSfx(name, { pitch = 1, seconds = 3, sr = 44100 } = {}) {
    const c = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const g = c.createGain(); g.gain.value = LEVEL[name] ?? 1; g.connect(c.destination);
    SFX[name](c, g, 0.01, pitch);
    return c.startRendering();
  },
  async renderMusic(name, { seconds = 8, intensity = 0, sr = 44100, raw = true } = {}) {
    const c = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const e = createEngine(c, { raw, musicLevel: raw ? 1 : undefined });
    e.setIntensity(intensity);
    e.musicFilter.frequency.value = 4500 * Math.pow(2, e.inten * 2);
    e.music(name, 0);
    e.pump(seconds);
    return c.startRendering();
  },
  // through the full master chain: 120 impact calls in 0.5 s (incl. 40 in the same instant) + music
  async renderStress({ sr = 44100, music = 'rage' } = {}) {
    const c = new OfflineAudioContext(2, sr * 3, sr);
    const e = createEngine(c, {});
    e.music(music, 0); e.pump(3);
    const names = ['breakGlass', 'breakWood', 'breakMetal', 'breakCeramic', 'breakPlastic', 'crash', 'hitMetal', 'hitWood', 'punch', 'coin'];
    let accepted = 0, maxVoices = 0;
    for (let i = 0; i < 40; i++) { if (e.sfxAt(names[i % names.length], { vol: 1.5 }, 0.2)) accepted++; maxVoices = M(maxVoices, e.voices.length); }
    for (let i = 0; i < 80; i++) { if (e.sfxAt(names[i % names.length], { vol: 1.5, pan: rand(-1, 1) }, 0.25 + i * 0.006)) accepted++; maxVoices = M(maxVoices, e.voices.length); }
    const buf = await c.startRendering();
    return { buf, accepted, calls: 120, maxVoices };
  },
};
