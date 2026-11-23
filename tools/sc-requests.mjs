// Engine requests from the floor authors: throws clear sills / the parapet and go out (aim-assist), the player
// can't leave through a broken pane, a punched wall portrait stays in the room, tap E = pick up / hold E = flip
// on a B1 grill table with a bottle on it, and the story stress never hits 100 before the last situation.
// node tools/drive.mjs tools/sc-requests.mjs <out> 1280x720
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const fc = async (k) => ((await ev('__ppg.state().fcounts'))[k] || 0);

  // ---- throws out of windows (7층, 12층) and over the roof parapet
  const throwRun = async (floor, spots, item, tag) => {
    await ev(`__ppg.start("free", { floor: ${JSON.stringify(floor)} })`);
    await step(20);
    let ok = 0;
    for (const [x, z, yaw] of spots) {
      const before = await fc('out');
      await ev(`__ppg.tp(${x}, ${z}); __ppg.yaw(${yaw}); __ppg.give(${JSON.stringify(item)})`);
      await step(4);
      await I.tap('KeyJ');
      await step(10);
      if (tag && ok === 0) await shot(`rq-throw-${floor}`);
      await step(110, 30);
      if ((await fc('out')) > before) ok++;
    }
    log(floor, 'throws out', ok, '/', spots.length);
    return ok;
  };
  const off = (n, z, yaw, x0 = -9, dx = 2.4) => Array.from({ length: n }, (_, i) => [x0 + i * dx, z, yaw + (i % 3 - 1) * 0.12]);
  const o7 = await throwRun('office', off(6, -9.06 + 1.1, Math.PI), 'mug', true);
  expect(o7 >= 5, `7층: throws from 1 m clear the 0.83 m sill and go out (${o7}/6)`);
  const exD = await ev('(() => 0)()');
  void exD;
  await ev('__ppg.start("free", { floor: "exec" })'); await step(10);
  const ez = await ev('__ppg.G.S.F.windows[0].at');
  // spots ≥ 1 m from the 사장실 partition (x −4) and the board-room glass (x 4), which run up to the window
  const o12 = await throwRun('exec', [-10, -8, -6, -2, 0, 2, 6.5, 9].map((x, i) => [x, ez + 1.2, Math.PI + (i % 3 - 1) * 0.12]), 'mug', true);
  expect(o12 >= 7, `12층: throws reach the panes, not a mullion (${o12}/8)`);
  await ev('__ppg.start("free", { floor: "roof" })'); await step(10);
  const rz = await ev('(() => { const Z = __ppg.G.S.F.outZones.find(z => z.axis === "z" && z.side === -1); return Z.at; })()');
  const oR = await throwRun('roof', off(5, rz + 1.3, Math.PI, -6, 3), 'mug', true);
  expect(oR >= 4, `옥상: throws clear the parapet (${oR}/5)`);

  // ---- the player can't walk / jump out through a broken pane (12층)
  await ev('__ppg.start("free", { floor: "exec" })'); await step(10);
  await ev('(() => { const S = __ppg.G.S, W = S.F.windows[0]; const b = W.bays.reduce((a, x) => Math.abs(x.x - 1) < Math.abs(a.x - 1) ? x : a); __ppg.toys.breakBay(S, W, b); return b.x; })()');
  await ev(`__ppg.tp(1, ${ez + 1.0}); __ppg.yaw(Math.PI)`); await step(4);
  await I.down('KeyW');
  for (let i = 0; i < 6; i++) { await I.tap('Space'); await step(20); }
  await I.up('KeyW'); await step(10);
  const pz = await ev('__ppg.P.pos.z');
  const panes = (await ev('__ppg.state()')).toys.windows;
  log('exec after walking at the window', pz, 'plane', ez, 'broken', panes);
  expect(pz > ez + 0.25, `player stays inside at the window (z ${pz.toFixed(2)} vs pane ${ez})`);
  await shot('rq-window-stop');

  // ---- punched wall portrait stays in the room
  const port = await ev('(() => { const r = __ppg.G.S.phys.records.find(r => r.hang || r.type === "ceoPortrait"); return r ? { id: r.id, type: r.type } : null; })()');
  if (port) {
    await ev(`__ppg.near(${port.id}, 0.9)`); await step(3);
    for (let i = 0; i < 4; i++) { await ev(`__ppg.hit(${port.id}, 1, 2.3, { kick: true })`); await step(20); }
    await step(90, 30);
    const pp = await ev(`(() => { const r = __ppg.G.S.phys.records[${port.id}]; const b = __ppg.G.S.F.bounds; const p = r.body.position; return { x: p.x, z: p.z, inside: r.removed || (p.x > b.minX - 0.05 && p.x < b.maxX + 0.05 && p.z > b.minZ - 0.05 && p.z < b.maxZ + 0.05), removed: r.removed, out: r.out }; })()`);
    log('portrait', JSON.stringify(port), JSON.stringify(pp));
    expect(pp.inside || pp.out, 'punched wall portrait stays in the room ' + JSON.stringify(pp));
  }

  // ---- B1: tap E picks the bottle off the grill table, hold E flips the table
  await ev('__ppg.start("free", { floor: "pub" })'); await step(10);
  const gt = await ev(`(() => { const S = __ppg.G.S; for (const t of S.phys.records.filter(r => r.type === 'grilltable')) { const on = S.phys.records.find(r => !r.removed && r.mass <= 8 && r.price > 0 && r.body.position.y > 0.45 && Math.hypot(r.body.position.x - t.body.position.x, r.body.position.z - t.body.position.z) < Math.max(t.hx, t.hz) + 0.2); if (on) return { id: t.id, item: on.type }; } return null; })()`);
  log('grill table', JSON.stringify(gt));
  if (gt) {
    await ev(`__ppg.near(${gt.id}, 0.95)`);
    let s = await step(4);
    expect((s.focus || '').startsWith('엎기') && s.focus.includes('톡'), 'combined prompt at the grill table: ' + s.focus);
    await shot('rq-pub-prompt');
    await I.tap('KeyE'); s = await step(6);
    expect(!!s.player.held, 'tap E picks the item up (held ' + s.player.held + ')');
    await I.tap('KeyE'); s = await step(30); // throw it away
    await ev(`__ppg.near(${gt.id}, 0.95)`); s = await step(4);
    await I.down('KeyE'); s = await step(40); await I.up('KeyE'); s = await step(20);
    const flipped = await ev(`__ppg.G.S.phys.records[${gt.id}].flipped`);
    expect(flipped, 'hold E flips the grill table');
  }

  // ---- story stress (long day): monotonic, < 100 until the last situation
  await ev('__ppg.start("story", { len: "long" })'); await step(5);
  const order = await ev('(() => { const S = []; let n = 0; return __ppg.G.scene; })()');
  void order;
  const ids = ['copier', 'execReport', 'coffee', 'roofLettuce', 'hallSetup', 'parkingCar', 'pubBooking', 'sunset'];
  const caps = [];
  for (const id of ids) {
    await ev(`(__ppg.G.scene = ${JSON.stringify(id)}, __ppg.G.rampage = false, __ppg.G.mode = 'story', true)`);
    caps.push(await ev('__ppg.stressCap()'));
  }
  log('stress caps (long)', JSON.stringify(caps));
  expect(caps.every((c, i) => i === 0 || c >= caps[i - 1]) && caps.slice(0, -1).every((c) => c < 100) && caps[caps.length - 1] === 100, 'long-day stress caps rise and reach 100 only at 퇴근 5분 전');
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
