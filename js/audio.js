// 회사 뿌개기 — audio module
// Everything is synthesised at runtime with the Web Audio API: no files, no speech.
// Characters never "talk" with voices; 'mumble' / 'yelp' etc. are abstract cartoon blips.
//
// Structure
//   helpers (tone / noise / bell / crack / drive / spray) -> SFX builders (ctx, out, t, pitch, opts) => endTime
//   impacts = crack transient + saturated pitched body + sub thump + material layers (+ stereo debris for breaks)
//   engine: per-name rate limit (3 per 35 ms), round-robin timbre variants, sidechain music duck (DUCK table),
//           master = glue compressor -> fast limiter -> soft clipper (output < 1.0)
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
  // intrinsic value 0: a source can start one frame before `t` when t carries float error (0.30000000000000004),
  // and that frame would otherwise play at the GainNode default of 1 (a random full-scale click)
  param.value = 0;
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

// Sharp transient "crack": a 1–5 ms filtered noise burst with an instant (0.3 ms) attack. Clean, bright, loud.
function crack(c, o, t, { v = 0.9, d = 0.003, hp = 1800, bp = 0, q = 0.8 } = {}) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c); src.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = bp ? 'bandpass' : 'highpass'; fl.frequency.value = bp || hp; fl.Q.value = q;
  const g = c.createGain();
  g.gain.value = 0; g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.0003);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.0003 + d);
  src.connect(fl); fl.connect(g); g.connect(o);
  src.start(t, Math.random() * 1.8); src.stop(t + d + 0.02);
  return t + d;
}

// Light saturation for the "weight" layers (pitched body + sub): tanh with 0.5 pre-gain, output bounded ≈ ±1.
// Feeding it 1.0–1.5 gives a thick, slightly square sine whose harmonics keep the sub audible on small speakers.
const driveCache = new WeakMap();
function drive(c, o) {
  let curve = driveCache.get(c);
  if (!curve) {
    const n = 1024; curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(2 * x) / Math.tanh(2); }
    driveCache.set(c, curve);
  }
  const pre = c.createGain(); pre.gain.value = 0.5;
  const ws = c.createWaveShaper(); ws.curve = curve;
  pre.connect(ws); ws.connect(o);
  return pre;
}

// a stereo-placed sub-output (for debris grains); falls back to `o` where StereoPanner is missing
function panTo(c, o, x) {
  if (!c.createStereoPanner) return o;
  const pn = c.createStereoPanner(); pn.pan.value = clamp(x, -1, 1); pn.connect(o);
  return pn;
}
// like scatter(), but every grain lands somewhere random in the stereo field (spread 0..1)
function spray(c, o, t, n, span, spread, fn) {
  return scatter(t, n, span, (tt, k, i) => fn(panTo(c, o, rand(-spread, spread)), tt, k, i));
}

// pitched body that drops fast + sub thump, both through the saturator
function weight(c, o, t, { f0, f1, g = 0.08, d = 0.12, v = 1.1, type = 'sine', sub = 0, subD = 0.15, subV = 1 }) {
  const dr = drive(c, o);
  let e = tone(c, dr, t, { type, f: f0, f1, g, a: 0.0015, d, v });
  if (sub) e = M(e, tone(c, dr, t, { f: sub * 1.3, f1: sub, g: 0.025, a: 0.002, d: subD, v: subV }));
  return e;
}

// inharmonic clang (free-bar / plate modes) with a beating twin of the fundamental
function clang(c, o, t, f, { d = 1.1, v = 0.16, n = 7 } = {}) {
  const R = [1, 1.47, 2.09, 2.56, 3.43, 4.79, 6.32, 8.1], A = [1, 0.8, 0.7, 0.55, 0.45, 0.35, 0.25, 0.18];
  let e = tone(c, o, t, { f: f * 1.007, a: 0.001, d: d * 0.9, v: v * 0.6 });
  for (let i = 0; i < n; i++) e = M(e, tone(c, o, t, { f: f * R[i] * rand(0.99, 1.01), a: 0.001, d: d / (1 + i * 0.35), v: v * A[i] }));
  return e;
}

/* ------------------------------------------------------------------ impacts
   Every impact = (a) crack transient + (b) pitched body dropping fast + (c) sub thump (through drive()) + material layers.
   `vr` (0..2) picks a timbre variant so rapid repeats are never identical. */

const VAR = [{ c: 1, b: 1, w: 'sine' }, { c: 1.3, b: 0.92, w: 'triangle' }, { c: 0.8, b: 1.1, w: 'sine' }];

function hit(c, o, t, p, mat, vr = 0) {
  const X = VAR[vr % 3];
  switch (mat) {
    case 'wood': return M(
      crack(c, o, t, { bp: 2600 * X.c, q: 0.9, v: 0.95, d: 0.004 }),
      weight(c, o, t, { f0: 240 * p * X.b, f1: 140 * p, g: 0.06, d: 0.12, v: 1.1, type: 'triangle', sub: 62, subD: 0.14, subV: 1.0 }),
      noise(c, o, t, { bp: 760 * p * X.b, q: 6, a: 0.001, d: 0.1, v: 0.9 }), // hollow box knock
      tone(c, o, t, { f: 520 * p * X.b, d: 0.05, v: 0.2 }),
      spray(c, o, t + 0.004, 6, 0.07, 0.4, (d, tt, k) => noise(c, d, tt, { bp: rand(3000, 6500), q: 1.5, a: 0.001, d: 0.006, v: 0.45 * k }))); // splinters
    case 'metal': return M(
      crack(c, o, t, { hp: 3000 * X.c, v: 0.95, d: 0.003 }),
      noise(c, o, t + 0.004, { hp: 6500, a: 0.002, d: 0.16, v: 0.7 }), // metallic sizzle, just after the crack
      clang(c, o, t, 480 * p * X.b, { d: 1.1, v: 0.15, n: 8 }),
      tone(c, o, t, { f: 480 * p * X.b * 11.7, a: 0.001, d: 0.35, v: 0.06 }), // high shimmer partials
      tone(c, o, t, { f: 480 * p * X.b * 15.3, a: 0.001, d: 0.25, v: 0.05 }),
      weight(c, o, t, { f0: 200 * p, f1: 90, g: 0.05, d: 0.09, v: 0.9, sub: 66, subD: 0.12, subV: 0.85 }));
    case 'glass': return M(
      crack(c, o, t, { hp: 4000 * X.c, v: 1, d: 0.004 }),
      noise(c, o, t, { hp: 5000, a: 0.001, d: 0.08, v: 0.6 }),
      tone(c, o, t, { f: 2100 * p * X.b, d: 0.35, v: 0.17 }),
      tone(c, o, t, { f: 3170 * p * X.b, d: 0.25, v: 0.13 }),
      tone(c, o, t, { f: 4650 * p * X.b, d: 0.18, v: 0.1 }),
      weight(c, o, t, { f0: 300 * p, f1: 150, g: 0.03, d: 0.05, v: 0.35, sub: 70, subD: 0.1, subV: 0.45 }),
      spray(c, o, t + 0.03, 14, 0.7, 0.6, (d, tt, k) => M( // tinkle cascade
        tone(c, d, tt, { f: rand(3500, 9000) * p, a: 0.001, d: rand(0.05, 0.14), v: 0.16 * k }),
        noise(c, d, tt, { hp: 7000, a: 0.001, d: 0.005, v: 0.22 * k }))),
      spray(c, o, t + 0.5, 3, 0.25, 0.7, (d, tt) => tone(c, d, tt, { f: rand(4000, 8000) * p, a: 0.001, d: 0.12, v: 0.07 }))); // last stragglers
    case 'plastic': return M(
      crack(c, o, t, { bp: 3200 * X.c, q: 1.2, v: 0.95, d: 0.003 }),
      noise(c, o, t, { hp: 6000, a: 0.001, d: 0.02, v: 0.55 }), // snap
      tone(c, o, t, { type: 'square', f: 380 * p * X.b, f1: 260 * p, lp: 2500, d: 0.05, v: 0.3 }),
      weight(c, o, t, { f0: 170 * p * X.b, f1: 70, g: 0.05, d: 0.08, v: 1.0, sub: 62, subD: 0.12, subV: 0.8 }),
      spray(c, o, t + 0.02, 5, 0.12, 0.5, (d, tt, k) => M( // rattle
        tone(c, d, tt, { type: 'square', f: rand(900, 1600) * p, lp: 3000, a: 0.001, d: 0.015, v: 0.18 * k }),
        noise(c, d, tt, { bp: 2500, q: 1.5, a: 0.001, d: 0.01, v: 0.25 * k }))));
    case 'soft': return M(
      crack(c, o, t, { bp: 1200 * X.c, q: 0.7, v: 0.5, d: 0.004 }),
      noise(c, o, t, { lp: 380 * p, a: 0.003, d: 0.18, v: 1.0 }), // dull whump
      weight(c, o, t, { f0: 110 * p * X.b, f1: 48, g: 0.08, d: 0.2, v: 1.3, sub: 50, subD: 0.22, subV: 1.0 }),
      tone(c, o, t + 0.03, { type: 'sawtooth', f: 220 * p, fs: [[0.06, 330 * p], [0.2, 260 * p]], vib: [14, 25], bp: 900, q: 3, a: 0.02, d: 0.22, v: 0.2 }), // spring creak
      tone(c, o, t + 0.03, { type: 'triangle', f: 300 * p, fs: [[0.07, 520 * p], [0.22, 340 * p]], a: 0.01, d: 0.2, v: 0.1 }));
    case 'paper': return M(
      crack(c, o, t, { hp: 3000 * X.c, v: 0.6, d: 0.003 }),
      weight(c, o, t, { f0: 140 * p, f1: 70, g: 0.04, d: 0.05, v: 0.5, sub: 65, subD: 0.1, subV: 0.5 }),
      spray(c, o, t + 0.006, 9, 0.22, 0.35, (d, tt, k) => M( // riffle
        noise(c, d, tt, { bp: rand(2000, 4500) * p, q: 1, a: 0.002, d: 0.018, v: 0.55 * k }),
        noise(c, d, tt, { hp: 6500, a: 0.001, d: 0.01, v: 0.3 * k }))));
    case 'ceramic': return M(
      crack(c, o, t, { hp: 3500 * X.c, v: 1, d: 0.004 }),
      noise(c, o, t, { bp: 4500, q: 0.7, a: 0.001, d: 0.08, v: 0.6 }),
      tone(c, o, t, { f: 1250 * p * X.b, d: 0.25, v: 0.16 }),
      tone(c, o, t, { f: 2730 * p * X.b, d: 0.18, v: 0.12 }),
      tone(c, o, t, { f: 4100 * p * X.b, d: 0.12, v: 0.09 }),
      weight(c, o, t, { f0: 220 * p, f1: 100, g: 0.04, d: 0.06, v: 0.8, sub: 68, subD: 0.1, subV: 0.7 }),
      spray(c, o, t + 0.015, 6, 0.25, 0.5, (d, tt, k) => M( // chips
        tone(c, d, tt, { f: rand(3000, 7000) * p, a: 0.001, d: 0.03, v: 0.12 * k }),
        noise(c, d, tt, { hp: 6000, a: 0.001, d: 0.004, v: 0.3 * k }))));
    case 'plant': return M(
      crack(c, o, t, { bp: 1800 * X.c, q: 1, v: 0.85, d: 0.004 }), // pot crack
      tone(c, o, t, { f: 900 * p * X.b, d: 0.06, v: 0.25 }),
      noise(c, o, t, { bp: 2600, q: 2, a: 0.001, d: 0.03, v: 0.4 }),
      weight(c, o, t, { f0: 180 * p, f1: 80, g: 0.05, d: 0.07, v: 0.9, sub: 60, subD: 0.12, subV: 0.7 }),
      spray(c, o, t + 0.01, 12, 0.35, 0.6, (d, tt, k) => M( // rustle
        noise(c, d, tt, { bp: rand(2500, 6000), q: 1.5, a: 0.004, d: 0.04, v: 0.3 * k }),
        noise(c, d, tt, { hp: 6500, a: 0.003, d: 0.03, v: 0.3 * k }))));
  }
  return t;
}

const shards = {
  wood: (c, o, tt, k, p) => M(
    tone(c, o, tt, { type: 'triangle', f: rand(420, 1100) * p, a: 0.001, d: 0.045, v: 0.18 * k }),
    noise(c, o, tt, { bp: rand(1500, 4000), q: 2, a: 0.001, d: 0.02, v: 0.3 * k })),
  glass: (c, o, tt, k, p) => M(
    tone(c, o, tt, { f: rand(2500, 8000) * p, a: 0.001, d: rand(0.04, 0.2), v: 0.13 * k }),
    noise(c, o, tt, { hp: 7000, a: 0.001, d: 0.004, v: 0.15 * k })),
  metal: (c, o, tt, k, p) => bell(c, o, tt, rand(700, 2400) * p, { d: rand(0.15, 0.4), v: 0.08 * k, ratios: [1, 2.41, 3.87, 5.3], amps: [1, 0.55, 0.35, 0.2], a: 0.001 }),
  plastic: (c, o, tt, k, p) => M(
    tone(c, o, tt, { type: 'square', f: rand(600, 1500) * p, lp: 3000, a: 0.001, d: 0.025, v: 0.12 * k }),
    noise(c, o, tt, { bp: rand(2000, 3500), q: 1.5, a: 0.001, d: 0.012, v: 0.25 * k })),
  ceramic: (c, o, tt, k, p) => M(
    tone(c, o, tt, { f: rand(1800, 6000) * p, a: 0.001, d: rand(0.04, 0.12), v: 0.12 * k }),
    noise(c, o, tt, { hp: 5000, a: 0.001, d: 0.005, v: 0.25 * k })),
};

// a break = the hit (a bit lower) + second crunch crack + air/pressure release + extra sub
//          + a long stereo debris tail + settling bounces. Always longer and heavier than the hit.
function smash(c, o, t, p, mat, vr, { n, span, extra, low = 1 }) {
  return M(
    hit(c, o, t, p * 0.88, mat, vr),
    crack(c, o, t + 0.012, { hp: 2200, v: 0.7, d: 0.005 }),
    noise(c, o, t + 0.004, { bp: 600, q: 0.7, ffs: [[0.05, 2400], [0.16, 900]], a: 0.012, d: 0.14, v: 0.45 }), // air whoosh
    noise(c, o, t, { lp: 1300, ff1: 200, a: 0.002, d: 0.35, v: 0.65 * low }),                                // blast body
    weight(c, o, t, { f0: 95 * p, f1: 40, g: 0.12, d: 0.26, v: 1.0 * low, sub: 50, subD: 0.26, subV: 1.1 * low }),
    spray(c, o, t + 0.03, n, span, 0.85, (d, tt, k) => shards[mat](c, d, tt, k, p)),
    spray(c, o, t + 0.18 + rand(0, 0.12), 1, 0.01, 0.6, (d, tt) => weight(c, d, tt, { f0: 130 * p, f1: 60, d: 0.07, v: 0.55 })),
    extra ? extra() : t);
}

// many small things jangling on a desk that just slammed
const rattle = (c, o, t, n, span, p) => spray(c, o, t, n, span, 0.9, (d, tt, k, i) => shards[['plastic', 'metal', 'wood', 'glass', 'ceramic'][i % 5]](c, d, tt, k * 0.9, p));

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

// band-passed noise sweep with a doppler-ish playback-rate glide (approach → pass → recede)
function whoosh(c, o, t, p, kind) {
  const heavy = kind === 'kick';
  const T = heavy ? 0.22 : 0.13, pk = heavy ? 0.1 : 0.055;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
  src.playbackRate.setValueAtTime(0.7, t);
  src.playbackRate.linearRampToValueAtTime(1.45, t + pk);
  src.playbackRate.linearRampToValueAtTime(0.8, t + T);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = heavy ? 1.6 : 2.2;
  const f0 = (heavy ? 280 : 500) * p, f1 = (heavy ? 1500 : 2600) * p, f2 = (heavy ? 500 : 900) * p;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + pk);
  bp.frequency.exponentialRampToValueAtTime(f2, t + T);
  const g = c.createGain();
  g.gain.value = 0; g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(heavy ? 0.85 : 0.75, t + pk);
  g.gain.exponentialRampToValueAtTime(0.0005, t + T);
  src.connect(bp); bp.connect(g); g.connect(o);
  src.start(t, Math.random() * 1.5); src.stop(t + T + 0.03);
  let e = t + T;
  if (heavy) e = M(e, noise(c, o, t, { lp: 420 * p, a: pk, d: T - pk, v: 0.55 }), tone(c, o, t, { type: 'triangle', f: 150 * p, fs: [[pk, 240 * p], [T, 130 * p]], a: pk, d: T - pk, v: 0.08 }));
  else e = M(e, noise(c, o, t, { hp: 3500 * p, a: pk, d: T - pk, v: 0.18 }));
  return e;
}

// pentatonic snap of a pitch ratio (keeps the coin ladder musical)
function pentQ(p) {
  const semis = 12 * Math.log2(p), oct = Math.floor(semis / 12), r = semis - oct * 12;
  let best = 0; for (const s of [0, 2, 4, 7, 9, 12]) if (Math.abs(s - r) < Math.abs(best - r)) best = s;
  return Math.pow(2, (oct * 12 + best) / 12);
}

const SFX = {
  step: (c, o, t, p) => M(noise(c, o, t, { lp: 700 * p, d: 0.045, v: 0.35 }), thump(c, o, t, 90 * p, 55, 0.05, 0.3)),
  stepCarpet: (c, o, t, p) => M(noise(c, o, t, { lp: 350 * p, d: 0.06, v: 0.3, a: 0.004 }), thump(c, o, t, 70 * p, 45, 0.06, 0.2)),
  jump: (c, o, t, p) => M(tone(c, o, t, { f: 260 * p, f1: 620 * p, a: 0.005, d: 0.16, v: 0.3 }), noise(c, o, t, { bp: 1200, d: 0.06, v: 0.15 })),
  land: (c, o, t, p) => M(thump(c, o, t, 100 * p, 45, 0.12, 0.8), noise(c, o, t, { lp: 600 * p, d: 0.07, v: 0.45 })),
  // swing air. pitch >= 0.95 (punch: game passes 1.1) = short snappy swish; lower (kick 0.8, throw 0.85, toys 0.6) = longer heavy swoosh
  whoosh: (c, o, t, p, x) => whoosh(c, o, t, p, (x && x.kind) || (p >= 0.95 ? 'punch' : 'kick')),
  whooshPunch: (c, o, t, p) => whoosh(c, o, t, p * 1.1, 'punch'),
  whooshKick: (c, o, t, p) => whoosh(c, o, t, p * 0.8, 'kick'),
  // fist on a body: crack, smack, 180→60 Hz body in ~80 ms, 60 Hz sub. No lead-in: the swing has its own whoosh.
  punch: (c, o, t, p, x) => {
    const X = VAR[(x && x.variant) % 3 || 0];
    return M(
      crack(c, o, t, { bp: 3000 * X.c, q: 0.7, v: 1, d: 0.003 }),
      noise(c, o, t, { bp: 1150 * X.c, q: 1.1, a: 0.001, d: 0.05, v: 0.8 }), // slap
      noise(c, o, t, { hp: 6500, a: 0.001, d: 0.02, v: 0.3 }),
      weight(c, o, t, { f0: 180 * p * X.b, f1: 60, g: 0.08, d: 0.11, v: 1.2, type: X.w, sub: 60, subD: 0.13, subV: 1.0 }));
  },
  kick: (c, o, t, p, x) => {
    const X = VAR[(x && x.variant) % 3 || 0];
    return M(
      crack(c, o, t, { bp: 2200 * X.c, q: 0.7, v: 1, d: 0.004 }),
      noise(c, o, t, { lp: 1600 * X.c, a: 0.001, d: 0.09, v: 0.8 }),
      noise(c, o, t, { hp: 6000, a: 0.001, d: 0.025, v: 0.28 }),
      weight(c, o, t, { f0: 140 * p * X.b, f1: 45, g: 0.12, d: 0.2, v: 1.35, type: X.w, sub: 50, subD: 0.22, subV: 1.1 }));
  },

  hitWood: (c, o, t, p, x) => hit(c, o, t, p, 'wood', x && x.variant),
  hitMetal: (c, o, t, p, x) => hit(c, o, t, p, 'metal', x && x.variant),
  hitGlass: (c, o, t, p, x) => hit(c, o, t, p, 'glass', x && x.variant),
  hitPlastic: (c, o, t, p, x) => hit(c, o, t, p, 'plastic', x && x.variant),
  hitSoft: (c, o, t, p, x) => hit(c, o, t, p, 'soft', x && x.variant),
  hitPaper: (c, o, t, p, x) => hit(c, o, t, p, 'paper', x && x.variant),
  hitCeramic: (c, o, t, p, x) => hit(c, o, t, p, 'ceramic', x && x.variant),
  hitPlant: (c, o, t, p, x) => hit(c, o, t, p, 'plant', x && x.variant),

  breakWood: (c, o, t, p, x) => smash(c, o, t, p, 'wood', x && x.variant, {
    n: 16, span: 0.75,
    extra: () => M(
      noise(c, o, t, { bp: 1100 * p, q: 3, a: 0.001, d: 0.12, v: 0.8 }), // splitting crunch
      spray(c, o, t + 0.005, 12, 0.12, 0.7, (d, tt, k) => noise(c, d, tt, { bp: rand(2500, 6000), q: 1.4, a: 0.001, d: 0.007, v: 0.5 * k }))),
  }),
  breakGlass: (c, o, t, p, x) => smash(c, o, t, p, 'glass', x && x.variant, {
    n: 46, span: 1.2, low: 0.45,
    extra: () => M(
      noise(c, o, t, { hp: 3000, a: 0.001, d: 0.35, v: 0.8 }),
      noise(c, o, t + 0.02, { hp: 7000, a: 0.002, d: 0.7, v: 0.5 }),
      spray(c, o, t + 0.05, 30, 1.1, 0.9, (d, tt, k) => tone(c, d, tt, { f: rand(5000, 10000) * p, a: 0.001, d: rand(0.03, 0.1), v: 0.12 * k }))),
  }),
  breakMetal: (c, o, t, p, x) => smash(c, o, t, p, 'metal', x && x.variant, {
    n: 14, span: 1.1,
    extra: () => M(
      noise(c, o, t, { hp: 7000, a: 0.001, d: 0.3, v: 0.45 }), // metallic sizzle
      clang(c, o, t, 380 * p, { d: 1.7, v: 0.14 }),
      noise(c, o, t + 0.02, { bp: 2500, q: 2, ff1: 900, a: 0.01, d: 0.3, v: 0.25 }), // scrape
      spray(c, o, t + 0.25, 1, 0.01, 0.7, (d, tt) => clang(c, d, tt, 620 * p, { d: 0.5, v: 0.07, n: 5 })),
      spray(c, o, t + 0.5, 1, 0.01, 0.7, (d, tt) => clang(c, d, tt, 700 * p, { d: 0.4, v: 0.05, n: 5 })),
      spray(c, o, t + 0.7, 1, 0.01, 0.7, (d, tt) => clang(c, d, tt, 760 * p, { d: 0.35, v: 0.035, n: 4 }))),
  }),
  breakPlastic: (c, o, t, p, x) => smash(c, o, t, p, 'plastic', x && x.variant, {
    n: 16, span: 0.6,
    extra: () => noise(c, o, t, { bp: 2000 * p, q: 2, a: 0.001, d: 0.08, v: 0.7 }),
  }),
  breakCeramic: (c, o, t, p, x) => smash(c, o, t, p, 'ceramic', x && x.variant, {
    n: 28, span: 0.9,
    extra: () => noise(c, o, t, { hp: 3000, a: 0.001, d: 0.2, v: 0.55 }),
  }),
  // a desk slams down: crack, heavy double thud, sub drop, rattling contents, long mixed debris tail
  crash: (c, o, t, p) => M(
    crack(c, o, t, { hp: 1500, v: 1, d: 0.005 }),
    crack(c, o, t + 0.07, { hp: 1800, v: 0.75, d: 0.004 }),
    weight(c, o, t, { f0: 125 * p, f1: 40, g: 0.1, d: 0.4, v: 1.45, type: 'triangle' }),
    weight(c, o, t + 0.07, { f0: 95 * p, f1: 36, g: 0.1, d: 0.35, v: 1.2 }),
    weight(c, o, t, { f0: 70 * p, f1: 32, g: 0.6, d: 0.7, v: 1.4 }),
    noise(c, o, t, { lp: 1600 * p, ff1: 200, a: 0.002, d: 1.2, v: 0.85 }),
    noise(c, o, t, { bp: 600 * p, q: 5, a: 0.001, d: 0.2, v: 0.75 }), // hollow desk body
    noise(c, o, t, { hp: 5000, a: 0.001, d: 0.12, v: 0.35 }),
    rattle(c, o, t + 0.08, 24, 0.6, p),
    spray(c, o, t + 0.03, 30, 1.6, 0.9, (d, tt, k, i) => shards[['glass', 'metal', 'wood', 'ceramic'][i % 4]](c, d, tt, k, p)),
    spray(c, o, t + 0.45, 1, 0.01, 0.5, (d, tt) => weight(c, d, tt, { f0: 110 * p, f1: 50, d: 0.1, v: 0.6 })),
    spray(c, o, t + 0.8, 1, 0.01, 0.5, (d, tt) => weight(c, d, tt, { f0: 120 * p, f1: 55, d: 0.07, v: 0.35 }))),
  // desk flip: whoosh up (0–0.22) → 80 ms gap → heavy double thud at 0.30 / 0.37 + rattling contents
  flip: (c, o, t, p) => M(
    noise(c, o, t, { bp: 300 * p, q: 1.2, ffs: [[0.22, 1700 * p]], a: 0.19, d: 0.03, v: 0.6 }),
    tone(c, o, t, { type: 'triangle', f: 110 * p, f1: 260 * p, g: 0.22, a: 0.18, d: 0.04, v: 0.12 }),
    crack(c, o, t + 0.3, { hp: 1500, v: 1, d: 0.005 }),
    weight(c, o, t + 0.3, { f0: 115 * p, f1: 38, g: 0.1, d: 0.32, v: 1.45, type: 'triangle', sub: 55, subD: 0.35, subV: 1.1 }),
    crack(c, o, t + 0.37, { hp: 1800, v: 0.7, d: 0.004 }),
    weight(c, o, t + 0.37, { f0: 90 * p, f1: 36, g: 0.1, d: 0.28, v: 1.15 }),
    noise(c, o, t + 0.3, { lp: 900 * p, a: 0.002, d: 0.3, v: 0.75 }),
    rattle(c, o, t + 0.33, 16, 0.5, p)),
  paper: (c, o, t, p) => M(
    noise(c, o, t, { lp: 900, a: 0.08, d: 0.4, v: 0.12 }),
    scatter(t, 11, 0.7, (tt, k) => noise(c, o, tt, { bp: rand(2500, 5500) * p, q: 1.5, a: 0.01, d: rand(0.04, 0.09), v: rand(0.15, 0.35) * k }))),

  // the core reward: a bright two-note "bling", quantised to a major-pentatonic ladder so combos climb musically
  // "cha-ching": a metallic "cha" + two bright notes + a shimmer tail; all of it climbs the pentatonic ladder with combo pitch
  coin: (c, o, t, p) => {
    const q = pentQ(p), f1 = 988 * q, f2 = 1319 * q;
    return M(
      crack(c, o, t, { bp: 4500, q: 1.2, v: 0.5, d: 0.02 }),
      tone(c, o, t, { f: 3200 * q, a: 0.001, d: 0.02, v: 0.12 }),
      tone(c, o, t + 0.03, { type: 'square', f: f1, lp: 6000, a: 0.002, d: 0.06, v: 0.13 }),
      tone(c, o, t + 0.03, { type: 'triangle', f: f1, a: 0.002, d: 0.07, v: 0.22 }),
      tone(c, o, t + 0.08, { type: 'square', f: f2, lp: 7000, a: 0.002, h: 0.04, d: 0.3, v: 0.11 }),
      tone(c, o, t + 0.08, { type: 'triangle', f: f2, a: 0.002, h: 0.05, d: 0.38, v: 0.24 }),
      tone(c, o, t + 0.08, { f: f2 * 2.76, a: 0.001, d: 0.15, v: 0.05 }),
      spray(c, o, t + 0.12, 6, 0.4, 0.7, (d, tt, k) => tone(c, d, tt, { f: f2 * [2, 2.5, 3, 4][Math.floor(rand(0, 4))], a: 0.002, d: 0.09, v: 0.06 * k })));
  },
  // combo milestone stinger (10/20/30…): quick rising arpeggio + sparkle + small punch. pitch scales it.
  comboUp: (c, o, t, p) => {
    const q = pentQ(p), b = 784 * q;
    let e = M(
      noise(c, o, t, { bp: 1500, q: 1, ffs: [[0.16, 6000]], a: 0.14, d: 0.04, v: 0.25 }),
      weight(c, o, t + 0.15, { f0: 160, f1: 60, d: 0.1, v: 0.8, sub: 60, subD: 0.1, subV: 0.6 }));
    [0, 4, 7, 12].forEach((s, i) => {
      const f = b * Math.pow(2, s / 12), tt = t + i * 0.045, last = i === 3;
      e = M(e,
        tone(c, o, tt, { type: 'square', f, lp: 6000, a: 0.002, h: last ? 0.08 : 0, d: last ? 0.25 : 0.06, v: 0.11, vib: last ? [7, f * 0.01] : null }),
        tone(c, o, tt, { type: 'triangle', f, a: 0.002, h: last ? 0.08 : 0, d: last ? 0.3 : 0.07, v: 0.2 }));
    });
    return M(e, spray(c, o, t + 0.16, 8, 0.3, 0.8, (d, tt, k) => tone(c, d, tt, { f: b * rand(3, 6), a: 0.001, d: 0.07, v: 0.06 * k })));
  },
  // a big single payout: drawer "ka-chunk", fat chord cha-ching, then a spill of coins scattering in stereo
  bigMoney: (c, o, t, p) => M(
    crack(c, o, t, { bp: 2500, q: 0.9, v: 0.7, d: 0.004 }),
    weight(c, o, t, { f0: 130, f1: 55, d: 0.12, v: 1.1, sub: 55, subD: 0.16, subV: 0.9 }),
    noise(c, o, t, { lp: 700, a: 0.001, d: 0.1, v: 0.5 }),
    bell(c, o, t + 0.06, 2093 * p, { d: 0.5, v: 0.12, ratios: [1, 2.4, 3.9], amps: [1, 0.3, 0.1] }),
    ...[659, 988, 1319].map((f) => M(
      tone(c, o, t + 0.09, { type: 'square', f: f * p, lp: 5000, a: 0.002, h: 0.06, d: 0.4, v: 0.07 }),
      tone(c, o, t + 0.09, { type: 'triangle', f: f * p, a: 0.002, h: 0.06, d: 0.45, v: 0.14 }))),
    bell(c, o, t + 0.17, 2637 * p, { d: 0.9, v: 0.13, ratios: [1, 2.4, 3.9], amps: [1, 0.3, 0.1] }),
    bell(c, o, t + 0.17, 3951 * p, { d: 0.7, v: 0.07, ratios: [1, 2.4], amps: [1, 0.3] }),
    spray(c, o, t + 0.15, 28, 1.0, 0.9, (d, tt, k) => {
      const f = rand(2600, 5200) * p;
      return M(tone(c, d, tt, { f, a: 0.001, d: 0.06, v: 0.09 * k }), tone(c, d, tt, { f: f * 1.5, a: 0.001, d: 0.04, v: 0.05 * k }),
        noise(c, d, tt, { hp: 5000, a: 0.001, d: 0.005, v: 0.2 * k }));
    })),
  // challenge complete: "ta-da-DAAA" with brass, a bright bell and sparkle
  bonus: (c, o, t, p) => {
    let e = t;
    [[0, 784], [0.09, 784], [0.18, 1047]].forEach(([dt, f]) => {
      e = M(e, brass(c, o, t + dt, f * p, 0.03, 0.08), tone(c, o, t + dt, { type: 'square', f: f * p, lp: 5000, a: 0.002, d: 0.07, v: 0.08 }));
    });
    [523, 659, 784, 1047].forEach((f) => { e = M(e, brass(c, o, t + 0.3, f * p, 0.32, 0.06)); });
    return M(e,
      weight(c, o, t + 0.3, { f0: 150, f1: 55, d: 0.12, v: 0.9, sub: 55, subD: 0.14, subV: 0.7 }),
      crack(c, o, t + 0.3, { hp: 5000, v: 0.4, d: 0.02 }),
      bell(c, o, t + 0.3, 2093 * p, { d: 1.0, v: 0.1, ratios: [1, 2, 3], amps: [1, 0.3, 0.1] }),
      spray(c, o, t + 0.32, 10, 0.5, 0.8, (d, tt, k) => tone(c, d, tt, { f: rand(3000, 6000) * p, a: 0.001, d: 0.08, v: 0.06 * k })));
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
  // shockwave: suck-in riser (opts.at seconds, default 0.35) → massive boom (sub 90→30 Hz, noise blast, metal ring-out 1.5 s)
  special: (c, o, t, p, x) => {
    const L = clamp(x && Number.isFinite(x.at) ? x.at : 0.35, 0.1, 1.5), T = t + L;
    // riser: noise swelling with a band sweeping up, plus a rising tone; cut 15 ms before the hit so the boom lands on silence
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(4000, T - 0.015);
    const g = c.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.7, T - 0.02); g.gain.linearRampToValueAtTime(0, T - 0.005);
    src.connect(bp); bp.connect(g); g.connect(o); src.start(t, Math.random()); src.stop(T + 0.02);
    const rs = c.createOscillator(); rs.type = 'sawtooth';
    rs.frequency.setValueAtTime(150 * p, t); rs.frequency.exponentialRampToValueAtTime(1100 * p, T - 0.015);
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 2500;
    const rg = c.createGain();
    rg.gain.value = 0; rg.gain.setValueAtTime(0.001, t); rg.gain.exponentialRampToValueAtTime(0.18, T - 0.02); rg.gain.linearRampToValueAtTime(0, T - 0.005);
    rs.connect(rl); rl.connect(rg); rg.connect(o); rs.start(t); rs.stop(T + 0.02);
    return M(T,
      crack(c, o, T, { hp: 1500, v: 1, d: 0.006 }),
      crack(c, o, T + 0.018, { hp: 2500, v: 0.7, d: 0.004 }),
      weight(c, o, T, { f0: 90 * p, f1: 30, g: 0.8, d: 1.0, v: 1.5 }),
      weight(c, o, T, { f0: 170 * p, f1: 45, g: 0.15, d: 0.4, v: 1.0, type: 'triangle' }),
      noise(c, o, T, { lp: 3000, ff1: 150, a: 0.002, d: 1.3, v: 0.9 }),
      noise(c, o, T, { hp: 4000, a: 0.001, d: 0.25, v: 0.5 }),
      clang(c, o, T + 0.02, 220 * p, { d: 1.6, v: 0.09 }),
      clang(c, o, T + 0.05, 331 * p, { d: 1.4, v: 0.06 }),
      spray(c, o, T + 0.04, 20, 1.5, 0.95, (d, tt, k) => shards.metal(c, d, tt, k, p)),
      spray(c, o, T + 0.03, 16, 1.0, 0.95, (d, tt, k, i) => shards[['glass', 'wood', 'ceramic', 'plastic'][i % 4]](c, d, tt, k, p)));
  },
  // charged up: power-up sweep → fast arpeggio → sparkling chord with a whomp under it
  specialReady: (c, o, t, p) => {
    let e = M(
      tone(c, o, t, { type: 'sawtooth', f: 200 * p, f1: 1600 * p, g: 0.3, lp: 600, ffs: [[0.3, 5000]], a: 0.28, d: 0.04, v: 0.12 }),
      noise(c, o, t, { bp: 800, q: 1, ffs: [[0.3, 7000]], a: 0.28, d: 0.04, v: 0.18 }));
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => {
      e = M(e, tone(c, o, t + 0.12 + i * 0.045, { type: 'square', f: f * p, lp: 6000, a: 0.002, d: 0.1, v: 0.07 }),
        tone(c, o, t + 0.12 + i * 0.045, { type: 'triangle', f: f * p, a: 0.002, d: 0.18, v: 0.15 }));
    });
    const T = t + 0.33;
    [1047, 1319, 1568].forEach((f) => { e = M(e, tone(c, o, T, { type: 'triangle', f: f * p, a: 0.003, h: 0.15, d: 0.5, v: 0.12, vib: [6, f * 0.008] })); });
    return M(e,
      weight(c, o, T, { f0: 140, f1: 55, d: 0.14, v: 0.9, sub: 55, subD: 0.16, subV: 0.7 }),
      crack(c, o, T, { hp: 5000, v: 0.45, d: 0.02 }),
      bell(c, o, T, 2093 * p, { d: 1.0, v: 0.12, ratios: [1, 2, 3], amps: [1, 0.3, 0.1] }),
      spray(c, o, T, 12, 0.6, 0.9, (d, tt, k) => tone(c, d, tt, { f: rand(3000, 7000) * p, a: 0.001, d: 0.08, v: 0.07 * k })));
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
  // ---- toys (floors port)
  jingle: (c, o, t, p) => M(
    noise(c, o, t, { hp: 6500, a: 0.002, d: 0.18, v: 0.35 }),
    scatter(t, 7, 0.16, (tt, k) => tone(c, o, tt, { f: rand(3800, 6200) * p, d: 0.09, v: 0.06 * k })),
    thump(c, o, t, 220 * p, 140, 0.05, 0.3)),
  horn: (c, o, t, p) => M( // megaphone blare (a buzzy "와아아" without words)
    tone(c, o, t, { type: 'sawtooth', f: 330 * p, fs: [[0.08, 420 * p], [0.5, 380 * p]], lp: 1800, vib: [7, 18], a: 0.02, h: 0.45, d: 0.12, v: 0.22 }),
    tone(c, o, t, { type: 'square', f: 660 * p, fs: [[0.08, 840 * p], [0.5, 760 * p]], lp: 2400, vib: [7, 30], a: 0.02, h: 0.45, d: 0.12, v: 0.07 }),
    noise(c, o, t, { bp: 1500 * p, q: 1.2, a: 0.02, h: 0.45, d: 0.12, v: 0.12 })),
  spray: (c, o, t, p) => noise(c, o, t, { hp: 2500 * p, a: 0.02, h: 0.18, d: 0.08, v: 0.32 }),
  splash: (c, o, t, p) => M(
    noise(c, o, t, { lp: 2400 * p, ff1: 600, a: 0.005, d: 0.5, v: 0.5 }),
    scatter(t + 0.05, 12, 0.6, (tt, k) => tone(c, o, tt, { f: rand(700, 1600) * p, f1: rand(1800, 2600) * p, a: 0.003, d: 0.05, v: 0.1 * k })),
    thump(c, o, t, 90 * p, 50, 0.15, 0.5)),
  // rooftop gust (~2.5 s): band of noise swelling up and falling away + a whistling upper band + low rumble.
  // Callable again and again as ambience (soft, no transient).
  wind: (c, o, t, p) => M(
    noise(c, o, t, { bp: 380 * p, q: 0.9, ffs: [[0.9, 900 * p], [1.7, 560 * p], [2.4, 320 * p]], a: 0.9, h: 0.5, d: 1.1, v: 0.5 }),
    noise(c, o, t + 0.2, { bp: 1400 * p, q: 2.5, ffs: [[0.8, 2300 * p], [1.8, 1100 * p]], a: 0.8, h: 0.3, d: 1.0, v: 0.1 }),
    noise(c, o, t, { lp: 180 * p, a: 0.7, h: 0.6, d: 1.1, v: 0.32 })),
  // audience applause burst (~1.2 s): dozens of hand claps scattered in stereo over a soft crowd wash
  clap: (c, o, t, p) => M(
    noise(c, o, t, { bp: 1500 * p, q: 0.6, a: 0.06, h: 0.55, d: 0.55, v: 0.16 }),
    spray(c, o, t, 46, 1.0, 0.85, (d, tt, k) => noise(c, d, tt, { bp: rand(900, 2300) * p, q: 1.2, a: 0.001, d: rand(0.012, 0.03), v: 0.55 * k }))),
  pop: (c, o, t, p) => M(noise(c, o, t, { bp: 1800 * p, q: 0.7, a: 0.001, d: 0.06, v: 0.8 }), thump(c, o, t, 180 * p, 90, 0.05, 0.5)),
  boom: (c, o, t, p) => M(
    crack(c, o, t, { hp: 1500, v: 1, d: 0.005 }),
    weight(c, o, t, { f0: 80 * p, f1: 28, g: 0.5, d: 0.9, v: 1.4 }),
    noise(c, o, t, { lp: 1800 * p, ff1: 200, a: 0.003, d: 1.1, v: 0.75 }),
    scatter(t + 0.05, 14, 0.9, (tt, k) => shards.metal(c, o, tt, k, p))),
  fallWhistle: (c, o, t, p) => tone(c, o, t, { f: 1500 * p, fs: [[0.9, 420 * p]], a: 0.03, h: 0.7, d: 0.15, v: 0.14 }),
  farCrash: (c, o, t, p) => M(
    thump(c, o, t, 55 * p, 28, 0.7, 0.8),
    noise(c, o, t, { lp: 700 * p, ff1: 150, a: 0.01, d: 0.9, v: 0.5 }),
    scatter(t + 0.03, 10, 0.6, (tt, k, i) => shards[['glass', 'metal', 'wood'][i % 3]](c, o, tt, k * 0.5, p * 0.8))),
  carAlarm: (c, o, t, p) => {
    let e = t;
    for (let i = 0; i < 6; i++) e = M(e, tone(c, o, t + i * 0.16, { type: 'square', f: (i % 2 ? 1250 : 1650) * p, lp: 3000, a: 0.005, h: 0.1, d: 0.03, v: 0.12 }));
    return e;
  },
  beep: (c, o, t, p) => M(tone(c, o, t, { type: 'square', f: 1180 * p, lp: 3000, a: 0.004, h: 0.12, d: 0.03, v: 0.12 }), tone(c, o, t + 0.3, { type: 'square', f: 1180 * p, lp: 3000, a: 0.004, h: 0.12, d: 0.03, v: 0.12 })),
  fireBell: (c, o, t, p) => {
    let e = t;
    for (let i = 0; i < 14; i++) e = M(e, bell(c, o, t + i * 0.055, 1960 * p, { d: 0.06, v: 0.05, ratios: [1, 2.7], amps: [1, 0.4] }));
    return e;
  },
  engine: (c, o, t, p) => M(tone(c, o, t, { type: 'sawtooth', f: 55 * p, lp: 380, vib: [16, 6], a: 0.05, h: 0.35, d: 0.12, v: 0.16 }), noise(c, o, t, { lp: 300, a: 0.05, h: 0.35, d: 0.1, v: 0.12 })),
  // ---- people (깨꼬닥)
  // KO: a descending slide-whistle (x.at s, default 0.5 = when the body lands) → floppy thud → a little twinkle of stars
  ko: (c, o, t, p, x) => {
    const L = clamp(x && Number.isFinite(x.at) ? x.at : 0.5, 0.2, 1.5), T = t + L;
    let e = M(
      tone(c, o, t, { f: 1900 * p, fs: [[L * 0.92, 330 * p]], vib: [7, 28], a: 0.015, h: L - 0.05, d: 0.05, v: 0.2 }),
      tone(c, o, t, { type: 'triangle', f: 950 * p, fs: [[L * 0.92, 165 * p]], vib: [7, 14], a: 0.015, h: L - 0.05, d: 0.05, v: 0.07 }),
      noise(c, o, t, { bp: 1900 * p, q: 6, ffs: [[L * 0.92, 330 * p]], a: 0.02, h: L - 0.06, d: 0.05, v: 0.05 }),
      weight(c, o, T, { f0: 120, f1: 42, g: 0.1, d: 0.18, v: 1.0, sub: 48, subD: 0.2, subV: 0.8 }),
      noise(c, o, T, { lp: 520, a: 0.002, d: 0.12, v: 0.55 }),
      noise(c, o, T, { bp: 900, q: 0.8, a: 0.001, d: 0.04, v: 0.3 }));
    [2093, 2637, 3136, 3951, 4699].forEach((f, i) => { e = M(e, bell(c, o, T + 0.1 + i * 0.065, f * p, { d: 0.45, v: 0.07, ratios: [1, 2.4], amps: [1, 0.25] })); });
    return e;
  },
  // ---- 막기 / 반격
  // a blocked blow: wood-block "탁" + a soft thud on the forearms
  block: (c, o, t, p) => M(
    crack(c, o, t, { bp: 1800 * p, q: 1.4, v: 0.8, d: 0.004 }),
    tone(c, o, t, { type: 'triangle', f: 640 * p, f1: 470 * p, a: 0.001, d: 0.07, v: 0.4 }),
    weight(c, o, t, { f0: 150 * p, f1: 70, d: 0.09, v: 0.7 })),
  // perfect guard "딱!": a bright clack + a two-note sparkle
  perfect: (c, o, t, p) => M(
    crack(c, o, t, { hp: 2500, v: 1, d: 0.003 }),
    tone(c, o, t, { type: 'square', f: 1760 * p, lp: 5000, a: 0.001, d: 0.05, v: 0.16 }),
    weight(c, o, t, { f0: 210 * p, f1: 80, d: 0.08, v: 0.8 }),
    bell(c, o, t + 0.03, 2637 * p, { d: 0.6, v: 0.13, ratios: [1, 2.4, 3.9], amps: [1, 0.3, 0.1] }),
    bell(c, o, t + 0.1, 3520 * p, { d: 0.55, v: 0.11, ratios: [1, 2.4, 3.9], amps: [1, 0.3, 0.1] })),
  // a fighter rearing back: a rising cartoon whistle over a little ratchet (~0.7 s)
  windup: (c, o, t, p) => M(
    tone(c, o, t, { type: 'triangle', f: 300 * p, fs: [[0.68, 920 * p]], vib: [14, 18], a: 0.03, h: 0.55, d: 0.1, v: 0.16 }),
    scatter(t, 9, 0.6, (tt, k) => noise(c, o, tt, { bp: 2600 * p, q: 3, a: 0.001, d: 0.012, v: 0.28 * k }))),
  // the player gets bonked: thud + springy boing (no voice)
  hurt: (c, o, t, p) => M(
    weight(c, o, t, { f0: 160 * p, f1: 60, d: 0.12, v: 1.0 }),
    noise(c, o, t, { bp: 1100, q: 1, a: 0.001, d: 0.05, v: 0.6 }),
    tone(c, o, t + 0.01, { f: 330 * p, fs: [[0.08, 540 * p], [0.3, 250 * p]], vib: [16, 40], a: 0.005, h: 0.08, d: 0.22, v: 0.2 })),
  // arms up: a short cloth swish
  guardUp: (c, o, t, p) => noise(c, o, t, { bp: 1500 * p, q: 0.8, ffs: [[0.06, 2600 * p]], a: 0.01, d: 0.06, v: 0.3 }),
  // a cartoon bonk on a limp body: wood-block tock + springy boing
  bonk: (c, o, t, p) => M(
    crack(c, o, t, { bp: 2200 * p, q: 1.2, v: 0.5, d: 0.003 }),
    tone(c, o, t, { type: 'triangle', f: 560 * p, f1: 400 * p, g: 0.05, a: 0.001, d: 0.09, v: 0.45 }),
    tone(c, o, t + 0.01, { f: 210 * p, fs: [[0.08, 330 * p], [0.22, 250 * p]], vib: [19, 38], a: 0.005, h: 0.05, d: 0.2, v: 0.16 })),
  // the little soul puff rising (airy whoo) / sucked back in (fwip)
  soul: (c, o, t, p) => M(
    tone(c, o, t, { f: 480 * p, fs: [[0.45, 880 * p]], vib: [6, 22], a: 0.18, h: 0.25, d: 0.35, v: 0.12 }),
    noise(c, o, t, { bp: 1300 * p, q: 3, ff1: 2200 * p, a: 0.18, h: 0.2, d: 0.3, v: 0.06 })),
  soulBack: (c, o, t, p) => M(
    tone(c, o, t, { f: 950 * p, f1: 330 * p, g: 0.17, a: 0.01, d: 0.2, v: 0.14 }),
    noise(c, o, t, { bp: 1800 * p, q: 2, ff1: 600, a: 0.01, d: 0.18, v: 0.08 }),
    thump(c, o, t + 0.17, 220 * p, 120, 0.05, 0.25)),
};

// per-sound trim, measured with the offline render check (raw builder peak kept under ~0.9)
const LEVEL = {
  stamp: 0.72,
  check: 1.6, ding: 1.5, whistle: 1.6, fanfare: 1.6, newRecord: 1.5,
  pour: 1.8, paper: 1.8, printerBeep: 1.6, alarm: 2.2, sigh: 1.7, gasp: 1.7, mumble: 1.7, mumbleLow: 1.7,
  clockTick: 0.75, doorOpen: 1.4, tickLast: 0.85,
  // impacts: trimmed so the worst-case variant peaks ≈ 0.95 raw (the crack layer is what reaches full scale)
  whoosh: 1.3, whooshPunch: 1.3, whooshKick: 1.3, punch: 0.67, kick: 0.58,
  hitWood: 0.83, hitMetal: 0.52, hitGlass: 0.64, hitPlastic: 0.61, hitSoft: 0.8, hitPaper: 1.0, hitCeramic: 0.64, hitPlant: 0.79,
  breakWood: 0.43, breakGlass: 0.35, breakMetal: 0.3, breakPlastic: 0.36, breakCeramic: 0.32, crash: 0.385, flip: 0.62, special: 0.36, boom: 0.67,
  clap: 1.6, wind: 1.0,
  coin: 1.8, comboUp: 0.78, bigMoney: 0.78, bonus: 0.7, specialReady: 0.62,
  ko: 0.8, bonk: 1.6, soul: 2.5, soulBack: 2.5,
  block: 0.8, perfect: 0.62, windup: 1.4, hurt: 0.75, guardUp: 1.3,
};

// sounds whose pitch must not be randomly jittered (musical / UI)
const TUNED = new Set(['coin', 'comboUp', 'bigMoney', 'bonus', 'ding', 'check', 'ui', 'uiBack', 'fanfare', 'newRecord', 'specialReady', 'printerBeep', 'register', 'alarm', 'clockTick', 'tickLast', 'whistle']);

// sidechain-style music duck per sfx: [dB, hold s, offset s] (scaled by vol); special is two-stage (riser, then boom)
const DUCK = {
  punch: [4.5, 0.12], kick: [5, 0.12],
  hitWood: [4, 0.12], hitMetal: [4, 0.12], hitGlass: [4, 0.12], hitPlastic: [4, 0.12], hitSoft: [4, 0.12], hitPaper: [3, 0.1], hitCeramic: [4, 0.12], hitPlant: [3, 0.1],
  breakWood: [6, 0.15], breakGlass: [6, 0.15], breakMetal: [6, 0.18], breakPlastic: [5, 0.14], breakCeramic: [6, 0.15],
  flip: [6, 0.35, 0.3], crash: [9, 0.35], boom: [9, 0.4], farCrash: [4, 0.2], bigMoney: [3, 0.15], splash: [3, 0.15],
  special: (x) => { const L = clamp(x && Number.isFinite(x.at) ? x.at : 0.35, 0.1, 1.5); return [[4, L, 0], [14, 1.0, L]]; },
  ko: (x) => [[4, 0.2, clamp(x && Number.isFinite(x.at) ? x.at : 0.5, 0.2, 1.5)]], // dips under the thud
};
// impacts get round-robin timbre variants + wider pitch jitter on quick repeats
const VARIED = new Set(['punch', 'kick', ...Object.keys(DUCK).filter((k) => /^(hit|break)/.test(k))]);

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
  // gritty rampage bass: detuned saws + sub square, filter pluck, through the saturator
  gbass: (c, o, t, f, d, v) => {
    const dr = drive(c, o), h = M(0, d * 0.5 - 0.02); // short, so the kick and snap punch through the gaps
    return M(
      tone(c, dr, t, { type: 'sawtooth', f, detune: -9, a: 0.003, h, d: 0.07, v: v * 0.55, lp: 2200, ff1: 500, fg: 0.12 }),
      tone(c, dr, t, { type: 'sawtooth', f, detune: 9, a: 0.003, h, d: 0.07, v: v * 0.55, lp: 2200, ff1: 500, fg: 0.12 }),
      tone(c, dr, t, { type: 'square', f: f / 2, a: 0.003, h, d: 0.07, v: v * 0.35, lp: 300 }));
  },
  // bright lead stab (square + saw, open filter, little octave sparkle)
  stab: (c, o, t, f, d, v) => M(
    tone(c, o, t, { type: 'square', f, a: 0.003, h: M(0, d * 0.55), d: 0.07, v: v * 0.12, lp: 6500, vib: [5.5, f * 0.006] }),
    tone(c, o, t, { type: 'sawtooth', f, detune: 7, a: 0.003, h: M(0, d * 0.45), d: 0.07, v: v * 0.08, lp: 5000 }),
    tone(c, o, t, { type: 'triangle', f: f * 2, a: 0.002, d: 0.06, v: v * 0.05 })),
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
  // punchy rampage kick: click + saturated 180→48 Hz body
  pkick: (c, o, t, v) => M(
    crack(c, o, t, { hp: 2500, v: v * 0.35, d: 0.004 }),
    weight(c, o, t, { f0: 180, f1: 48, g: 0.07, d: 0.24, v: v * 1.3 })),
  // backbeat: snare + 3-burst clap layered, bright
  snap: (c, o, t, v) => M(
    noise(c, o, t, { bp: 2200, q: 0.6, a: 0.001, d: 0.15, v: v * 0.5 }),
    noise(c, o, t, { hp: 6000, a: 0.001, d: 0.06, v: v * 0.25 }),
    tone(c, o, t, { type: 'triangle', f: 210, f1: 170, d: 0.07, v: v * 0.32 }),
    noise(c, o, t, { bp: 1400, q: 1.2, a: 0.001, d: 0.012, v: v * 0.35 }), noise(c, o, t + 0.011, { bp: 1400, q: 1.2, a: 0.001, d: 0.012, v: v * 0.35 }),
    noise(c, o, t + 0.022, { bp: 1400, q: 1.2, a: 0.001, d: 0.11, v: v * 0.4 })),
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
    bpm: 164, key: 52, scale: MAJ, gain: 0.66,
    prog: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']],
    parts: [
      { type: 'drum', inst: 'pkick', pat: ['x...x...x...x.x.', 'x...x...x..xx...'], v: 1.15 },
      { type: 'drum', inst: 'snap', pat: ['....X.......X...', '....X.......X..o'], v: 0.9 },
      { type: 'drum', inst: 'hat', pat: 'x.x.x.x.x.x.x.x.', v: 0.8 },
      { type: 'drum', inst: 'ohat', pat: ['..............x.', '................'], v: 0.6 },
      { type: 'bass', inst: 'gbass', pat: 'r.or.or.r.or5.o.', oct: -1, v: 0.7 },
      { type: 'chord', inst: 'brass', pat: '..x...x...x...x.', oct: 0, v: 0.45, len: 1 },
      { type: 'lead', inst: 'stab', oct: 1, v: 0.75, bars: ['0.2.4.7-4.2.4---', '3.5.7.a-9.7.5---', '4.6.8.b-8.6.4---', '7-5-3-5-7---9-7-'] },
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
          if (P.inst === 'kick' || P.inst === 'pkick') hasKick = true;
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

const VOICE_CAP = 28;
const SAME_WINDOW = 0.035, SAME_MAX = 3; // per name: at most 3 voices per 35 ms (extra ones get quieter), distinct names never block each other

// final safety clipper: linear to 0.75, tanh knee to a 0.95 ceiling (input pre-scaled by 0.5, curve covers ±2).
// The ceiling leaves room for the 2x-oversampling filter overshoot, so the output stays < 1.0.
function makeSoftClip(ctx) {
  const ws = ctx.createWaveShaper(), n = 4096, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(s);
    curve[i] = Math.sign(s) * (a < 0.75 ? a : 0.75 + 0.2 * Math.tanh((a - 0.75) / 0.2));
  }
  ws.curve = curve; ws.oversample = '2x';
  return ws;
}

export function createEngine(ctx, opts = {}) {
  const live = !!opts.live;
  const e = {
    ctx, live, inten: 0, sfxOn: true, bgmOn: true, voices: [], last: new Map(), rep: new Map(), warned: new Set(),
    player: null, dying: [], want: null, sdEnd: -1, sdLvl: 1,
  };
  // master: sfx + music -> gentle glue compressor (slow attack lets transients through)
  //         -> fast limiter (1.5 ms attack, 60 ms release) -> soft clipper (0.98 ceiling) -> out
  const master = ctx.createGain(); master.gain.value = opts.masterGain ?? 0.8;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18; glue.knee.value = 10; glue.ratio.value = 2.2; glue.attack.value = 0.015; glue.release.value = 0.18;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.0015; lim.release.value = 0.06;
  const pre = ctx.createGain(); pre.gain.value = 0.5;
  const clip = makeSoftClip(ctx);
  if (opts.raw) master.connect(ctx.destination);
  else { master.connect(glue); glue.connect(lim); lim.connect(pre); pre.connect(clip); clip.connect(ctx.destination); }

  e.sfxBus = ctx.createGain(); e.sfxBus.gain.value = 1.0; e.sfxBus.connect(master);
  e.musicIn = ctx.createGain();
  e.musicFilter = ctx.createBiquadFilter(); e.musicFilter.type = 'lowpass'; e.musicFilter.frequency.value = 4500; e.musicFilter.Q.value = 0.5;
  e.duckGain = ctx.createGain();   // explicit audio.duck()
  e.sideGain = ctx.createGain();   // automatic sidechain duck from impacts
  e.musicVol = ctx.createGain();
  e.musicLevel = opts.musicLevel ?? 0.15; // ≈ -16.5 dB under the sfx bus
  e.musicVol.gain.value = e.musicLevel;
  e.musicIn.connect(e.musicFilter); e.musicFilter.connect(e.duckGain); e.duckGain.connect(e.sideGain); e.sideGain.connect(e.musicVol); e.musicVol.connect(master);

  e.warnOnce = (k, msg) => { if (!e.warned.has(k)) { e.warned.add(k); console.warn('[audio] ' + msg); } };

  // sidechain-style duck at time t: fast (5 ms) dip by dB, hold, ~60 ms release. A shallower duck never cuts a deeper one short.
  e.sideDuck = (t, dB, hold) => {
    const lvl = Math.pow(10, -dB / 20), g = e.sideGain.gain;
    if (t < e.sdEnd && lvl > e.sdLvl + 1e-4) return;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(lvl, t, 0.005);
    g.setTargetAtTime(1, t + hold, 0.06);
    e.sdEnd = t + hold; e.sdLvl = lvl;
  };

  e.sfxAt = (name, o = {}, when) => {
    if (!e.sfxOn) return false;
    const b = SFX[name];
    if (!b) { e.warnOnce('sfx:' + name, 'unknown sfx "' + name + '" (ignored)'); return false; }
    const t = M(when ?? 0, ctx.currentTime) + (live ? 0.005 : 0);
    // same-name rate limit: up to SAME_MAX in a 35 ms window (each extra one 3 dB quieter); other names are independent
    const recent = (e.last.get(name) || []).filter((lt) => Math.abs(t - lt) < SAME_WINDOW);
    if (recent.length >= SAME_MAX) return false;
    recent.push(t); e.last.set(name, recent);
    const crowd = Math.pow(0.7, recent.length - 1);
    // quick repeats of the same sound: rotate timbre variant (never the same twice in a row) and widen pitch jitter
    const rp = e.rep.get(name);
    let variant = 0;
    if (rp && t - rp.t < 0.6) variant = (rp.v + 1 + Math.floor(Math.random() * 2)) % 3;
    e.rep.set(name, { t, v: variant });
    e.voices = e.voices.filter((v) => v.end > t);
    while (e.voices.length >= VOICE_CAP) { // steal oldest
      const v = e.voices.shift();
      try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.008); } catch (err) { /* ignore */ }
    }
    const vol = clamp(Number.isFinite(o.vol) ? o.vol : 1, 0, 2);
    let p = clamp(Number.isFinite(o.pitch) && o.pitch > 0 ? o.pitch : 1, 0.25, 4);
    if (!TUNED.has(name)) p *= 1 + (Math.random() - 0.5) * (VARIED.has(name) ? 0.12 : 0.08);
    const dk = DUCK[name];
    if (dk && vol > 0.05) {
      const k = clamp(vol / 0.8, 0.4, 1.2);
      const list = typeof dk === 'function' ? dk(o) : [dk];
      for (const [dB, hold, off = 0] of list) e.sideDuck(t + off, dB * k, hold);
    }
    const g = ctx.createGain(); g.gain.value = vol * crowd * (LEVEL[name] ?? 1);
    let tail = g;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner(); pn.pan.value = clamp(Number.isFinite(o.pan) ? o.pan : 0, -1, 1);
      g.connect(pn); tail = pn;
    }
    tail.connect(e.sfxBus);
    let end;
    try { end = b(ctx, g, t, p, { ...o, variant: VARIED.has(name) ? variant : 0 }); } catch (err) { e.warnOnce('err:' + name, 'sfx "' + name + '" failed: ' + err.message); return false; }
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
  async renderSfx(name, { pitch = 1, seconds = 3, sr = 44100, level = true, ...x } = {}) {
    const c = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const g = c.createGain(); g.gain.value = level ? LEVEL[name] ?? 1 : 1; g.connect(c.destination);
    SFX[name](c, g, 0.01, pitch, { variant: 0, ...x });
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
    const c = new OfflineAudioContext(2, sr * 4, sr);
    const e = createEngine(c, {});
    e.music(music, 0); e.pump(4);
    const names = ['breakGlass', 'breakWood', 'breakMetal', 'breakCeramic', 'breakPlastic', 'crash', 'hitMetal', 'hitWood', 'punch', 'coin'];
    let accepted = 0, maxVoices = 0;
    for (let i = 0; i < 40; i++) { if (e.sfxAt(names[i % names.length], { vol: 1.5 }, 1.0)) accepted++; maxVoices = M(maxVoices, e.voices.length); }
    for (let i = 0; i < 80; i++) { if (e.sfxAt(names[i % names.length], { vol: 1.5, pan: rand(-1, 1) }, 1.05 + i * 0.006)) accepted++; maxVoices = M(maxVoices, e.voices.length); }
    const buf = await c.startRendering();
    return { buf, accepted, calls: 120, maxVoices };
  },
};
