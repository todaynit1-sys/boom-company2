// 느린 컴퓨터 진단: 화질 단계마다
//   (1) 그리기 한 장의 시간 — readPixels 로 GPU(소프트웨어 렌더러) 일이 끝날 때까지 기다린 값의 중앙값
//   (2) 그리기를 뺀 한 틱의 CPU — 갈래별 (물리 · 사람 · 효과 · 나머지)
//   (3) 실시간 fps (requestAnimationFrame 수)
// 장면: 1분 난동 사무실 (가만히 · 봇 난동 10초 뒤), 로비.
// PPG_BASE=http://localhost:4262 node tools/drive.mjs tools/sc-prof.mjs <out> 1280x720 [query]
//   PROF_LEVELS=0,1,2,3 (기본: 지금 단계 하나) · PROF_SEC=3 (실시간 재는 초)
export default async ({ ev, log, step, shot, sleep }) => {
  const levels = (process.env.PROF_LEVELS || '').split(',').filter((s) => s !== '').map(Number);
  const sec = +(process.env.PROF_SEC || 3);
  await ev(`(() => {
    const W = window.__prof = { phys: 0, npc: 0, fx: 0 };
    const gl = __ppg.gfx.renderer.getContext(); const px = new Uint8Array(4);
    W.sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const wrap = (o, k, slot) => { const f = o[k]; if (f.__w) return; const g = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { W[slot] += performance.now() - t; } }; g.__w = 1; o[k] = g; };
    wrap(__ppg.fx, 'update', 'fx');
    W.hook = () => {
      const S = __ppg.G.S; if (!S) return;
      wrap(S.phys, 'step', 'phys');
      for (const n of S.npcs) wrap(n, 'update', 'npc');
      for (const n of S.walkers) wrap(n, 'update', 'npc');
    };
    W.med = (a) => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
    return true;
  })()`);
  const prof = async (tag) => {
    await ev('__prof.hook()');
    const r = await ev(`(() => {
      const W = __prof, G = __ppg.gfx;
      // CPU: 틱만 (그리기는 잠깐 뺀다)
      const R = G.render; G.render = () => {};
      W.phys = W.npc = W.fx = 0;
      const t = [];
      for (let i = 0; i < 40; i++) { const a = performance.now(); __ppg.step(1); t.push(performance.now() - a); }
      const a = performance.now(); for (let i = 0; i < 40; i++) __ppg.state(); const st = (performance.now() - a) / 40;
      G.render = R;
      const tot = t.reduce((x, y) => x + y, 0) / 40 - st;
      // 그리기: 쌓인 일을 비우고, 한 장씩 끝까지
      W.sync(); W.sync();
      const g = []; for (let i = 0; i < 6; i++) { const b = performance.now(); __ppg.render(); W.sync(); g.push(performance.now() - b); }
      const f = (v) => +(v / 40).toFixed(2);
      return { renderMs: W.med(g), tickMs: +tot.toFixed(2), phys: f(W.phys), npc: f(W.npc), fx: f(W.fx), info: __ppg.info(), fxs: __ppg.fxStats(), awake: __ppg.G.S ? __ppg.G.S.phys.awake : 0 };
    })()`, 300000);
    log(tag, JSON.stringify(r));
  };
  const rt = async (tag) => {
    await ev('__prof.sync()');
    await ev('__ppg.realtime()');
    await sleep(500);
    const r = await ev(`new Promise((res) => {
      const d = []; let last = performance.now(); const t0 = last;
      const f = (now) => { d.push(now - last); last = now; if (now - t0 < ${sec * 1000}) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ fps: +(d.length / ((now - t0) / 1000)).toFixed(1), medMs: +d[d.length >> 1].toFixed(1), q: __ppg.gfx.level, post: __ppg.gfx.usingPost, pr: __ppg.gfx.renderer.getPixelRatio(), shadows: __ppg.gfx.sun.castShadow }); } };
      requestAnimationFrame(f);
    })`, (sec + 60) * 1000);
    log(tag, 'realtime', JSON.stringify(r));
    await ev('__ppg.G.manual = true');
    await ev('__prof.sync()');
  };
  const run = async (lv) => {
    const tag = 'L' + (lv == null ? 'cur' : lv);
    const q = async () => { if (lv != null) await ev(`__ppg.quality(${lv})`); };
    await q();
    await ev('__ppg.start("rush")'); await q();
    await step(20);
    await prof(tag + ' office-idle');
    await ev('__ppg.auto(true)');
    await step(600, 30);
    await prof(tag + ' office-rampage');
    await rt(tag + ' office-rampage');
    await shot(tag + '-rampage');
    await ev('__ppg.auto(false)');
    await ev('__ppg.start("free", { floor: "lobby" })'); await q();
    await step(20);
    await prof(tag + ' lobby');
    await rt(tag + ' lobby');
  };
  if (!levels.length) await run(null);
  for (const lv of levels) await run(lv);
};
