// Mid-rampage cost: the bot smashes the office (rush) and we sample renderer.info, live fx counts and the CPU
// time of one fixed tick (median over 60 single steps) at 10 s / 20 s / 30 s.
// node tools/drive.mjs tools/sc-rampage-perf.mjs <out> 1280x720
export default async ({ ev, log, step, shot }) => {
  await ev('__ppg.start("rush")');
  await step(20);
  await ev('__ppg.auto(true)');
  const sample = async (tag) => {
    const ms = await ev(`(() => { const t = []; for (let i = 0; i < 60; i++) { const a = performance.now(); __ppg.step(1); t.push(performance.now() - a); } t.sort((a, b) => a - b); return +t[30].toFixed(2); })()`);
    const r = await ev('__ppg.render()');
    const s = await ev('__ppg.state()');
    const fxn = await ev('__ppg.fx.active ? __ppg.fx.active() : null');
    log(tag, JSON.stringify({ money: s.money, render: r, fxDebris: fxn, fxLive: __ppgFx(), awake: s.bodies && s.bodies.awake, stepMs: ms }));
    function __ppgFx() { return null; }
  };
  for (const t of [10, 20, 30]) {
    await step(600 - 60, 30);
    await sample('t' + t + 's');
    if (t === 20) await shot('perf-20s');
  }
};
