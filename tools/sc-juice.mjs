// Game feel + sound wiring (polish pass): kicked chair skids > 3 m, punched monitor leaves the desk, hit-stop
// durations per impact (and ≤ 30 ms + smaller shake in calm mode), comboUp at 10 / 20 with rising pitch,
// bigMoney on a large payout (coin on small ones), bonus on a completed challenge, the special's boom sfx
// lands on the very tick of the shockwave. Frame-by-frame screenshots around the special and a car wreck.
// node tools/drive.mjs tools/sc-juice.mjs <out> 1280x720
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const sfxNames = async (clear = true) => (await ev(`__ppg.sfxLog(${clear})`));

  // ---------------------------------------------------------------- B2 aisle: kicked chair
  await ev('__ppg.start("free", { floor: "parking" })');
  let s = await step(20);
  const kickChair = async (tag) => {
    const id = await ev('__ppg.spawn("chair", 0, 0, Math.PI / 2)');
    await ev('__ppg.tp(-0.85, 0); __ppg.yaw(Math.PI / 2)');
    await step(3);
    await ev('__ppg.feel(true)');
    const p0 = await ev(`(() => { const p = __ppg.G.S.phys.records[${id}].body.position; return [p.x, p.z]; })()`);
    await I.tap('KeyX');
    let maxOff = 0, minScale = 1;
    for (let i = 0; i < 40; i++) {
      await step(1);
      const f = await ev('__ppg.feel()');
      maxOff = Math.max(maxOff, f.shakeOff);
      const sy = await ev(`__ppg.G.S.phys.records[${id}].group.scale.y`);
      minScale = Math.min(minScale, sy);
      if (i === 12 && tag === 'normal') await shot('j1-chair-kick');
    }
    await step(150, 30);
    const p1 = await ev(`(() => { const p = __ppg.G.S.phys.records[${id}].body.position; return [p.x, p.z]; })()`);
    const f = await ev('__ppg.feel()');
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    await ev(`(() => { const r = __ppg.G.S.phys.records[${id}]; if (!r.removed) __ppg.G.S.phys.remove(r); })()`);
    return { dist, hs: f.hs, maxOff, minScale };
  };
  const kn = await kickChair('normal');
  log('kick (normal)', JSON.stringify(kn));
  expect(kn.dist > 3, `kicked chair travels > 3 m (${kn.dist.toFixed(2)} m)`);
  expect(kn.hs.some((h) => h.kind === 'kick' && Math.abs(h.s - 0.06) < 1e-6), 'kick hit-stop 60 ms ' + JSON.stringify(kn.hs));
  expect(kn.minScale < 0.9, `struck chair squashes (min scale.y ${kn.minScale.toFixed(3)})`);
  const log1 = await sfxNames();
  expect(log1.some((e) => e.n === 'whooshKick'), 'kick swing plays whooshKick');
  expect(log1.some((e) => e.n === 'hitPlastic'), 'chair (plastic) hit plays hitPlastic ' + JSON.stringify(log1.map((e) => e.n)));

  await ev('__ppg.calm(true)');
  const kc = await kickChair('calm');
  log('kick (calm)', JSON.stringify(kc));
  expect(kc.hs.every((h) => h.s <= 0.03 + 1e-9), 'calm: every hit-stop ≤ 30 ms ' + JSON.stringify(kc.hs));
  expect(kc.maxOff < kn.maxOff * 0.6, `calm: smaller camera shake/kick (${kc.maxOff.toFixed(4)} vs ${kn.maxOff.toFixed(4)})`);
  await ev('__ppg.calm(false)');

  // ---------------------------------------------------------------- B2: car wreck sequence (staged payouts) + frames
  const car = await ev('(() => { const r = __ppg.G.S.phys.records.find(r => r.type === "car" && !r.removed && r.tag !== "bossCar"); return r ? { id: r.id, price: r.price, raw: r.rawPrice, hp: r.hp } : null; })()');
  log('car', JSON.stringify(car));
  await ev(`__ppg.near(${car.id}, 1.6)`);
  await step(3);
  await sfxNames();
  const m0 = (await ev('__ppg.state()')).money;
  const stagePay = [];
  let last = m0;
  for (let i = 0; i < 40; i++) {
    const r = await ev(`__ppg.hit(${car.id}, 1, 0)`);
    await step(4);
    const st = await ev(`__ppg.G.S.phys.records[${car.id}].stage`);
    const m = (await ev('__ppg.state()')).money;
    if (m > last) { stagePay.push([st, m - last]); last = m; }
    if (r.hp <= 1) break;
  }
  await sfxNames();
  // the last blow: frames around the wreck
  await ev(`__ppg.near(${car.id}, 1.6)`);
  await ev(`__ppg.hit(${car.id}, 2, 0, { kick: true, big: true })`);
  for (let i = 0; i < 6; i++) { await step(i < 3 ? 1 : 3); await shot('j2-car-wreck-' + i); }
  const mEnd = (await ev('__ppg.state()')).money;
  stagePay.push([4, mEnd - last]);
  const carLog = await sfxNames();
  const cf = await ev('__ppg.feel()');
  log('car payouts by stage', JSON.stringify(stagePay), 'total', mEnd - m0, 'sfx', JSON.stringify(carLog.map((e) => e.n)));
  expect(new Set(stagePay.map((p) => p[0])).size >= 3, 'car pays at several stages ' + JSON.stringify(stagePay));
  expect(mEnd - m0 <= car.price + 1, `car pays no more than its bill price (${mEnd - m0} ≤ ${car.price})`);
  expect(carLog.some((e) => e.n === 'boom') && carLog.some((e) => e.n === 'crash'), 'car wreck: boom + crash');
  expect(carLog.some((e) => e.n === 'bigMoney'), 'car wreck payout rings bigMoney');
  expect(cf.big >= 1 && cf.hs.some((h) => h.kind === 'crash' && Math.abs(h.s - 0.11) < 1e-6), 'car wreck = big moment (110 ms stop) ' + JSON.stringify(cf.hs.slice(-3)));

  // ---------------------------------------------------------------- 7층: monitor punch, combo, bigMoney/coin, bonus, special
  await ev('__ppg.start("free", { floor: "office" })');
  s = await step(20);
  const mon = await ev('__ppg.near("monitor", 0.75)');
  await step(3);
  const mp0 = await ev(`(() => { const p = __ppg.G.S.phys.records[${mon.id}].body.position; return [p.x, p.y, p.z]; })()`);
  await ev('__ppg.feel(true)'); await sfxNames();
  // a real punch picks the nearest desk clutter, so hit the monitor itself with the punch's power
  await ev(`(__ppg.P.char.playOnce('punch'), __ppg.hit(${mon.id}, 1, 1.25))`);
  await step(5);
  await shot('j3-monitor-punch');
  await step(90, 30);
  const mp1 = await ev(`(() => { const r = __ppg.G.S.phys.records[${mon.id}]; const p = r.body.position; return [p.x, p.y, p.z, r.removed]; })()`);
  const mf = await ev('__ppg.feel()');
  const mdist = Math.hypot(mp1[0] - mp0[0], mp1[2] - mp0[2]);
  log('monitor', JSON.stringify({ mp0, mp1, mdist }));
  expect(mdist > 1.0 || mp1[3], `punched monitor flies off the desk (${mdist.toFixed(2)} m, y ${mp0[1].toFixed(2)} → ${mp1[1].toFixed(2)})`);
  expect(mf.hs.some((h) => h.kind === 'punch' && Math.abs(h.s - 0.035) < 1e-6), 'punch hit-stop 35 ms ' + JSON.stringify(mf.hs));
  const ml = await sfxNames();
  expect(ml.some((e) => e.n === 'hitGlass'), 'monitor (glass) hit plays hitGlass ' + JSON.stringify(ml.map((e) => e.n)));
  // real key punch: whooshPunch
  await ev('__ppg.near("printer", 1.0)'); await step(30); await sfxNames();
  await I.tap('KeyJ'); await step(20);
  expect((await sfxNames()).some((e) => e.n === 'whooshPunch'), 'J punch swing plays whooshPunch');

  // combo milestones: 20 quick direct hits on the printer (0 damage)
  const pr = await ev('(() => { const r = __ppg.G.S.phys.records.find(r => r.type === "printer"); return r.id; })()');
  await ev(`__ppg.near(${pr}, 1.0)`);
  await ev('__ppg.feel(true)'); await sfxNames();
  for (let i = 0; i < 20; i++) { await ev(`__ppg.hit(${pr}, 0, 0)`); await step(2); }
  const cl = await sfxNames();
  const ups = cl.filter((e) => e.n === 'comboUp');
  const cfeel = await ev('__ppg.feel()');
  log('combo', JSON.stringify({ combo: (await ev('__ppg.state()')).combo, ups, miles: cfeel.comboMiles }));
  expect(ups.length === 2 && Math.abs(ups[0].p - 1.06) < 1e-6 && Math.abs(ups[1].p - 1.12) < 1e-6, 'comboUp at 10 and 20 with pitch 1.06 / 1.12');
  expect(JSON.stringify(cfeel.comboMiles) === '[10,20]', 'combo milestones 10, 20 (banner)');
  const bannerTxt = await ev('document.querySelector("#banner strong").textContent');
  expect(bannerTxt === '연타 x20!', 'milestone banner "연타 x20!" (' + bannerTxt + ')');

  // payouts: small thing → coin, the printer's last hit (≥ 40k) → bigMoney
  await step(100, 50);
  await sfxNames();
  const small = await ev('(() => { const r = __ppg.G.S.phys.records.find(r => r.type === "keyboard" && !r.removed && !r.destroyed); return r.id; })()');
  await ev(`__ppg.near(${small}, 0.8)`); await ev(`__ppg.hit(${small}, 9, 0)`); await step(2);
  let pl = await sfxNames();
  expect(pl.some((e) => e.n === 'coin') && !pl.some((e) => e.n === 'bigMoney'), 'small payout rings coin ' + JSON.stringify(pl.map((e) => e.n)));
  await ev(`__ppg.near(${pr}, 1.0)`);
  const prm0 = (await ev('__ppg.state()')).money;
  await ev(`__ppg.hit(${pr}, 99, 0)`); await step(2);
  pl = await sfxNames();
  const prm1 = (await ev('__ppg.state()')).money;
  expect(pl.some((e) => e.n === 'bigMoney') && pl.some((e) => e.n === 'crash'), `printer break (+${prm1 - prm0}) rings bigMoney + crash ` + JSON.stringify(pl.map((e) => e.n)));

  // challenge → bonus
  const ch = (await ev('__ppg.chal()')).find((c) => !c.done);
  const m = /^([a-zA-Z]+)(?::(\w+))?(?:#(\w+))?$/.exec(ch.key);
  if (m) {
    const rec = m[2] || m[3] ? `{ type: ${JSON.stringify(m[2] || null)}, tag: ${JSON.stringify(m[3] || null)} }` : 'null';
    if (m[1] === 'carStage') await ev(`__ppg.emit("carStage", ${rec}, 1, ${ch.need})`); else await ev(`__ppg.emit(${JSON.stringify(m[1])}, ${rec}, ${ch.need})`);
  }
  await step(3);
  const bl = await sfxNames();
  log('challenge', ch.key, JSON.stringify(bl.map((e) => e.n)));
  expect(bl.some((e) => e.n === 'bonus'), `challenge "${ch.text}" completes with the bonus sfx`);

  // special: boom sfx (at) lands on the shockwave tick; frames around it
  await ev('__ppg.tp(0, 0); __ppg.yaw(-Math.PI / 2); __ppg.G.special = 1');
  await step(2);
  await ev('__ppg.feel(true)'); await sfxNames();
  await I.tap('KeyQ');
  await step(1);
  const sp = (await sfxNames(false)).find((e) => e.n === 'special');
  // walk up to the boom one tick at a time, screenshots from 2 ticks before to 4 after
  let shock = null;
  for (let i = 0; i < 50 && !shock; i++) {
    const rt = await ev('__ppg.G.rtime');
    if (sp && rt > sp.t + sp.at - 3 / 60) await shot('j4-special-' + i);
    await step(1);
    shock = (await ev('__ppg.feel()')).lastShock;
  }
  for (let i = 0; i < 5; i++) { await shot('j5-special-after-' + i); await step(i < 2 ? 1 : 4); }
  const sf = await ev('__ppg.feel()');
  log('special', JSON.stringify({ sfx: sp, shock, hs: sf.hs.filter((h) => h.kind === 'special'), big: sf.big }));
  expect(sp && sp.at === 0.5, 'special sfx called with at = 0.5 s');
  expect(sp && shock && Math.abs(shock.t - (sp.t + sp.at)) <= 1 / 60 + 1e-3, `shockwave tick = sfx boom time (${shock && shock.t} vs ${sp && (sp.t + sp.at).toFixed(3)})`);
  expect(sf.hs.some((h) => h.kind === 'special' && Math.abs(h.s - 0.16) < 1e-6 && h.f === shock.f), 'special hit-stop 160 ms on the shockwave frame');
  const fxs = await ev('__ppg.fxStats()');
  log('fx live after special', JSON.stringify(fxs));
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
