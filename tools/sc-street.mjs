// 회사 앞 거리 (street) with REAL key input for the moves under test (positioning between checks uses
// __ppg.tp / near / yaw): lobby → revolving door → street (the "I'm outside" arrival) → back in → out again,
// the six street challenges, the boss car through its stages, riding a scooter, wreckage persisting across
// leaving/re-entering, the soft bounds, things thrown out of 7층 lying on the plaza, the bot routing
// office → lobby → door → street, and the 퇴근 beat when the story rampage ends outside.
//   node tools/drive.mjs tools/sc-street.mjs <outDir> 1280x720
//   … 1280x720 pick=1                 title picker only (real click on 회사 앞), + touch=1 at 844x390 / 390x844
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const q = new URLSearchParams(await ev('location.search'));
  const done = () => { if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | ')); };

  // ---------------------------------------------------------------- title picker (real click), any size
  if (q.get('pick') === '1') {
    await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
    const fit = await ev(`(() => {
      const bs = [...document.querySelectorAll('#title .floors button')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.free, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, txt: b.textContent, cut: b.scrollWidth > b.clientWidth + 1 }; });
      const vw = innerWidth, vh = innerHeight;
      const inView = bs.every((b) => b.l >= 0 && b.t >= 0 && b.r <= vw + 0.5 && b.b <= vh + 0.5 && b.w > 20 && b.h > 20);
      let overlap = false; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], c = bs[j]; if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) overlap = true; }
      const panel = document.querySelector('#title .t-panel').getBoundingClientRect();
      return { n: bs.length, inView, overlap, cut: bs.filter((b) => b.cut).map((b) => b.id), street: bs.find((b) => b.id === 'street'), panelFits: panel.bottom <= vh + 0.5 && panel.right <= vw + 0.5 };
    })()`);
    log('picker', JSON.stringify(fit));
    expect(fit.n === 8 && fit.street && /회사 앞/.test(fit.street.txt), 'eight floor buttons incl. 밖 · 회사 앞');
    expect(fit.inView && !fit.overlap && !fit.cut.length, `picker fits ${W}x${H} (inView ${fit.inView}, overlap ${fit.overlap}, cut ${fit.cut})`);
    await shot('st-pick-title');
    await I.clickSel('#title [data-free="street"]');
    const s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "free" && !s.busy && document.getElementById("fade").hidden ? s : null; })()', 30000);
    expect(s.mode === 'free' && s.floor === 'street', '자유 난동 · 회사 앞 starts outside (' + s.floor + ')');
    await sleep(400);
    const m = await ev('[document.getElementById("m-title").textContent, document.getElementById("m-sub").textContent]');
    expect(m[1] === '회사 앞 거리', 'mission card names the street ' + JSON.stringify(m));
    await shot('st-pick-free');
    log('errors', JSON.stringify(await ev('__ppg.errors')));
    expect(!(await ev('__ppg.errors.length')), 'no errors');
    return done();
  }

  const fc = async (k) => ((await ev('__ppg.state().fcounts'))[k] || 0);
  const kick = async (n = 1) => { for (let i = 0; i < n; i++) { await I.tap('KeyK'); await step(34); } };
  const holdUntil = async (code, cond, max = 400, chunk = 6) => {
    await I.down(code);
    let s; for (let i = 0; i < max; i += chunk) { s = await step(chunk, chunk); if (await ev(cond)) break; }
    await I.up(code); return s;
  };
  const wrecked = (id) => ev(`(() => { const S = __ppg.G.floors[${JSON.stringify(id)}]; return S ? S.phys.records.filter(r => r.destroyed || r.removed).length : -1; })()`);

  // ---------------------------------------------------------------- 1. lobby → revolving door → street
  await ev('__ppg.start("free", { floor: "lobby" })');
  let s = await step(20);
  expect(s.floor === 'lobby' && s.scene === 'free', 'free mode on 1층');
  const panel = await ev('__ppg.floors().map(f => f.id).join()');
  expect(panel === 'roof,exec,office,hall,lobby,pub,parking', 'the street is not on the elevator panel (' + panel + ')');
  await ev('__ppg.tp(3.0, -5.2); __ppg.yaw(Math.PI); true');
  s = await step(3);
  s = await holdUntil('KeyW', '__ppg.state().floor === "street"', 300);
  s = await step(2);
  expect(s.floor === 'street', 'walking into the revolving door (W held) leads outside (' + s.floor + ')');
  expect(Math.abs(s.player.x) < 0.6 && s.player.z > -10.8 && s.player.z < -9.6, 'you come out of the tower door ' + JSON.stringify(s.player));
  const m1 = await ev('document.getElementById("m-sub").textContent');
  expect(m1 === '회사 앞 거리', 'mission card says 회사 앞 거리 (' + m1 + ')');
  await shot('st-1a-out-door');
  s = await step(40); await shot('st-1b-out-swing');
  s = await step(110);
  const cam = await ev('__ppg.feel()');
  expect(s.player.z > -9.2, 'stepped out on your own (z ' + s.player.z + ')');
  expect(cam.cam[2] < s.player.z, 'camera swung round behind you (cam z ' + cam.cam[2] + ' < player z ' + s.player.z + ')');
  await shot('st-1c-outside');
  const info = await ev('__ppg.render()');
  log('street arrival renderer', JSON.stringify(info));

  // ---------------------------------------------------------------- 2. back in through the same door, out again
  await ev('__ppg.yaw(Math.PI); true');
  s = await holdUntil('KeyW', '__ppg.state().floor === "lobby"', 300);
  s = await step(4);
  expect(s.floor === 'lobby' && s.player.z > -7.3 && Math.abs(s.player.x - 3) < 0.8, 'walking back into the entrance returns to the lobby ' + JSON.stringify(s.player));
  await shot('st-2-back-lobby');
  s = await step(80);
  await ev('__ppg.tp(3.0, -6.0); __ppg.yaw(Math.PI); true');
  s = await holdUntil('KeyW', '__ppg.state().floor === "street"', 300);
  expect(s.floor === 'street', 'and out again');
  s = await step(120);

  // ---------------------------------------------------------------- 3. wreckage persists across leaving/re-entering
  await ev('__ppg.near("streetBin", 0.9)');
  s = await step(3);
  let bin = await ev('__ppg.recs("streetBin")');
  for (let i = 0; i < 8 && (await ev('__ppg.recs("streetBin")')).length === bin.length; i++) await kick();
  const w0 = await wrecked('street');
  expect(w0 > 0, 'kicked a street bin to bits (' + w0 + ' wrecked)');

  // ---------------------------------------------------------------- 4. challenges
  // s1: the company name on the canopy — hold E at a canopy post
  await ev('__ppg.tp(-3.2, -8.75); __ppg.yaw(Math.PI); true');
  s = await step(4);
  expect(s.focus === '기둥 흔들기', 'canopy post prompt "기둥 흔들기" (' + s.focus + ')');
  await I.down('KeyE'); s = await step(40); await I.up('KeyE');
  s = await step(30); await ev('__ppg.look(-0.4, 0.15)'); await shot('st-4a-sign-falls');
  s = await step(150);
  expect((await fc('hit:logoLetter')) >= 6, 'all six sign letters knocked down (' + (await fc('hit:logoLetter')) + ')');
  // s2: the boss car through its stages (glass → dents → wheel off → wreck)
  await ev('__ppg.near("bossCar", 1.6, [0, -1])');
  s = await step(4);
  let car = await ev('__ppg.rec("bossCar")'), seen = new Set();
  for (let i = 0; i < 40 && car.stage < 4; i++) { await kick(); car = await ev('__ppg.rec("bossCar")'); seen.add(car.stage); if (car.stage === 2 && !seen.has('shot')) { seen.add('shot'); await shot('st-4b-bosscar-dented'); } }
  s = await step(40);
  expect(car.stage === 4 && car.destroyed && [1, 2, 3].every((k) => seen.has(k) || seen.has(4)), 'boss car wrecked through its stages ' + JSON.stringify([...seen]));
  await shot('st-4c-bosscar-wreck');
  // s3: fire hydrant bursts into a jet
  await ev('__ppg.near("hydrantN", 0.95)');
  s = await step(3);
  let hy = await ev('__ppg.rec("hydrantN")');
  for (let i = 0; i < 8 && !hy.destroyed; i++) { await kick(); hy = await ev('__ppg.rec("hydrantN")'); }
  s = await step(30);
  const fxs = await ev('__ppg.fxStats()');
  expect(hy.destroyed && (await fc('break:fireHydrant')) >= 1, 'hydrant burst (' + JSON.stringify(fxs) + ')');
  await ev('__ppg.tp(-2.9, -6.3); __ppg.look(Math.PI, 0.12)'); s = await step(6); await shot('st-4d-hydrant');
  // s4: bus stop
  await ev('__ppg.near("busStop", 1.25, [0, -1])');
  s = await step(3);
  for (let i = 0; i < 14 && !(await ev('__ppg.G.S.phys.records.find(r => r.type === "busStop").destroyed')); i++) await kick();
  s = await step(20);
  expect((await fc('break:busStop')) >= 1, 'bus stop smashed');
  await ev('__ppg.look(0, 0.25)'); await shot('st-4e-busstop');
  // s5: ride a delivery scooter (E) and ram things five times
  await ev('__ppg.near("scooter", 1.2)');
  s = await step(4);
  expect(s.focus && s.focus.includes('스쿠터'), 'prompt 배달 스쿠터 타기 (' + s.focus + ')');
  await I.tap('KeyE'); s = await step(6);
  expect(s.toys.ride && s.toys.ride.kind === 'scooter', 'E mounts the scooter ' + JSON.stringify(s.toys.ride));
  for (let k = 0; k < 10 && (await fc('ram:scooter')) < 5; k++) {
    // line up on the plaza 3 m behind a kerb bollard that is still standing (clear run) and go full throttle at it
    const t = await ev(`(() => {
      const c = __ppg.G.S.phys.records.find((r) => r.type === 'bollard' && !r.removed && !r.destroyed && !r.hitOnce && [-18.6, -15.2, -11.8, -5.0, 7.4, 18.8, 12.6].some((x) => Math.abs(r.body.position.x - x) < 0.2));
      if (!c) return null; return [c.body.position.x, c.body.position.z - 3.0, 0, c.type]; })()`);
    if (!t) break;
    await ev(`__ppg.tp(${t[0]}, ${t[1]}); __ppg.toys.T.ride.yaw = ${t[2]}; __ppg.toys.T.ride.vel.set(0,0,0); __ppg.yaw(${t[2]}); true`);
    await I.down('KeyW'); await step(60, 10); await I.up('KeyW'); await step(20);
    log('ram try', t[3], await fc('ram:scooter'));
  }
  s = await step(2);
  await shot('st-4f-scooter');
  expect((await fc('ram:scooter')) >= 5, 'rammed 5 times on the scooter (' + (await fc('ram:scooter')) + ')');
  await I.tap('KeyE'); s = await step(6);
  expect(!s.toys.ride, 'E gets off');
  // s6: knock three street lamps flat
  for (let k = 0; k < 6 && (await fc('topple:streetLamp')) < 3; k++) {
    const id = await ev('(__ppg.G.S.phys.records.find(r => r.type === "streetLamp" && !r.toppled && !r.removed) || {}).id');
    const r = id != null ? await ev('__ppg.near(' + id + ', 0.85)') : null;
    if (!r) break;
    await step(3);
    for (let i = 0; i < 4; i++) await kick();
    await step(60);
  }
  s = await step(30);
  expect((await fc('topple:streetLamp')) >= 3, 'three lamps knocked flat (' + (await fc('topple:streetLamp')) + ')');
  await ev('__ppg.look(0.6, 0.3)'); await shot('st-4g-lamps');
  const ch = await ev('__ppg.chal("street")');
  log('challenges', JSON.stringify(ch.map((c) => [c.id, c.done])));
  expect(ch.length === 6 && ch.every((c) => c.done), 'all six street challenges done');

  // ---------------------------------------------------------------- 5. bounds: walk / ride into every edge
  const edges = [[18.8, 0, Math.PI / 2], [-18.8, 0, -Math.PI / 2], [0, 9.2, 0], [9, -10.5, Math.PI], [-9, -10.6, Math.PI]]; // [x, z, walking direction]
  let maxOut = 0;
  for (const [x, z, yaw] of edges) {
    await ev(`__ppg.tp(${x}, ${z}); __ppg.yaw(${yaw}); true`);
    await I.down('KeyW'); s = await step(150, 30); await I.up('KeyW');
    const p = s.player;
    maxOut = Math.max(maxOut, Math.abs(p.x) - 20, p.z - 13, -12.4 - p.z);
    expect(Math.abs(p.x) <= 20 && p.z <= 10.6 && p.z >= -12.45 && s.floor === 'street', `held inside at edge ${x},${z} → ${p.x},${p.z} (${s.floor})`);
  }
  log('bounds max overshoot', maxOut.toFixed(2));

  // ---------------------------------------------------------------- 6. wreckage persists: in and out again
  const w1 = await wrecked('street');
  await ev('__ppg.tp(0, -8.0); __ppg.yaw(Math.PI); true');
  s = await holdUntil('KeyW', '__ppg.state().floor === "lobby"', 300);
  s = await step(100);
  await ev('__ppg.tp(3.0, -6.0); __ppg.yaw(Math.PI); true');
  s = await holdUntil('KeyW', '__ppg.state().floor === "street"', 300);
  s = await step(20);
  const w2 = await wrecked('street');
  const carAgain = await ev('__ppg.rec("bossCar")');
  expect(s.floor === 'street' && w2 >= w1 && w1 > 0 && carAgain && carAgain.stage === 4, `street wreckage persisted (${w1} → ${w2}, boss car stage ${carAgain && carAgain.stage})`);
  const trips = await ev('__ppg.G.doorTrips');
  log('door trips', trips);

  // ---------------------------------------------------------------- 7. thrown out of 7층 → lying on the plaza; bot routes via the door
  await ev('__ppg.start("free", { floor: "office" })');
  s = await step(20);
  const thrown = await ev(`(() => {
    const S = __ppg.G.S, Z = S.F.outZones[0];
    const r = S.phys.records.find((x) => !x.fixed && !x.removed && x.mass > 1 && x.mass < 30 && x.type !== 'chair');
    const at = Z.at + Z.side * 0.8, a = (Z.from + Z.to) / 2;
    if (Z.axis === 'z') r.body.position.set(a, 1.2, at); else r.body.position.set(at, 1.2, a);
    r.body.wakeUp(); return r.type;
  })()`);
  s = await step(100);
  const ow = await ev('(__ppg.G.outWrecks || []).map(w => w.type)');
  expect(ow.length === 1 && ow[0] === thrown, 'thrown-out ' + thrown + ' remembered (' + JSON.stringify(ow) + ')');
  await ev('__ppg.ride("street"); __ppg.auto(true)');
  for (let i = 0; i < 120 && s.floor !== 'street'; i++) s = await step(30, 30);
  expect(s.floor === 'street', 'bot rides office → lobby → door → street (' + s.floor + ')');
  await ev('__ppg.auto(false)');
  const wn = await ev('__ppg.G.S.F.wreckN || 0');
  expect(wn === 1, 'the ' + thrown + ' lies wrecked on the plaza (' + wn + ')');
  await ev('__ppg.tp(-3.5, -7.6); __ppg.look(-2.6, 0.35)'); s = await step(4); await shot('st-7-plaza-wreck');
  await ev('__ppg.ride("pub"); __ppg.auto(true)');
  for (let i = 0; i < 120 && s.floor !== 'pub'; i++) s = await step(30, 30);
  expect(s.floor === 'pub', 'bot finds its way back in and down to B1 (' + s.floor + ')');
  await ev('__ppg.auto(false)');

  // ---------------------------------------------------------------- 8. story: the 60 s rampage ends outside → 퇴근!
  await ev('__ppg.goto("rampage")');
  s = await step(20);
  await ev('__ppg.ride("street"); __ppg.auto(true)');
  for (let i = 0; i < 120 && s.floor !== 'street'; i++) { s = await step(30, 30); await ev('__ppg.G.timeLeft = Math.max(__ppg.G.timeLeft, 30); true'); }
  await ev('__ppg.auto(false)');
  expect(s.floor === 'street' && s.mode === 'story', 'story rampage reaches the street (' + s.floor + ')');
  s = await step(80);
  const z0 = s.player.z;
  await ev('__ppg.G.timeLeft = 0.2; true');
  s = await step(20);
  const ban = await ev('document.querySelector("#banner strong").textContent');
  await shot('st-8-toegeun');
  s = await step(30);
  expect(ban === '퇴근!' && s.player.z > z0 + 0.15, `퇴근! banner and a walk away from the tower (${ban}, z ${z0} → ${s.player.z})`);
  s = await step(200, 40);
  expect(s.scene === 'bill' && s.bill && s.bill.mode === 'story', 'bill follows as usual');
  await shot('st-9-bill');

  const errs = await ev('__ppg.errors');
  expect(!errs.length, 'no errors ' + JSON.stringify(errs).slice(0, 300));
  done();
};
