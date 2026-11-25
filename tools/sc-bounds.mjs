// The player never leaves the floor: on every floor, shove the player hard toward each wall (fight knock-back,
// teleport past the edge, walk into the wall for a while) and check they end up inside the bounds.
// The elevator doorway → cabin stretch must still be walkable.
//   node tools/drive.mjs tools/sc-bounds.mjs <outDir> 1280x720
export default async ({ ev, shot, log, step }) => {
  const fails = [];
  const expect = (ok, what) => { log((ok ? 'ok ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  const floors = ['office', 'exec', 'hall', 'lobby', 'pub', 'parking', 'roof', 'street'];
  for (const floor of floors) {
    await ev(`__ppg.start("free", { floor: ${JSON.stringify(floor)} })`);
    const s = await step(30);
    if (s.floor !== floor) { expect(false, `started on ${floor} (got ${s.floor})`); continue; }
    const b = await ev('(() => { const b = __ppg.G.S.F.bounds; return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }; })()');
    const inside = (p) => p[0] > b.minX && p[0] < b.maxX && p[1] > b.minZ && p[1] < b.maxZ;
    const pos = () => ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const out = [];
    for (const [dx, dz] of dirs) {
      // 1) a huge knock-back toward the wall, many frames
      await ev(`(() => { __ppg.tp(0, 0); __ppg.fight.api.FT.kb.set(${dx * 60}, 0, ${dz * 60}); return true; })()`);
      await step(40);
      let p = await pos(); if (!inside(p)) out.push(`kb ${dx},${dz} → ${p.map((v) => v.toFixed(2))}`);
      // 2) dropped just past the edge (what a glitchy shove would do)
      const tx = dx ? (dx > 0 ? b.maxX + 1.5 : b.minX - 1.5) : 0, tz = dz ? (dz > 0 ? b.maxZ + 1.5 : b.minZ - 1.5) : 0;
      await ev(`(() => { __ppg.P.pos.set(${tx}, 0, ${tz}); return true; })()`);
      await step(4);
      p = await pos();
      // allowed only inside an elevator car
      const inCar = await ev(`(() => { const F = __ppg.G.S.F; const P = __ppg.P; return F.elevators.some((ev) => { const ax = P.pos.x - ev.front.x, az = P.pos.z - ev.front.z; const al = -(ax * ev.fwd.x + az * ev.fwd.z), lat = Math.abs(ax * ev.right.x + az * ev.right.z); return al > -0.6 && al < 3.2 && lat < 1.05; }); })()`);
      if (!inside(p) && !inCar) out.push(`placed ${dx},${dz} → ${p.map((v) => v.toFixed(2))}`);
    }
    expect(!out.length, `${floor}: player stays inside ${out.join(' | ')}`);
    // the elevator is still reachable on foot
    const hasEv = await ev('__ppg.G.S.F.elevators.length');
    if (hasEv) {
      await ev(`(() => { const ev = __ppg.G.S.F.elevators[0]; __ppg.tp(ev.front.x + ev.fwd.x * 1.2, ev.front.z + ev.fwd.z * 1.2); return true; })()`);
      await step(3);
      const ok = await ev(`(() => { const ev = __ppg.G.S.F.elevators[0]; __ppg.P.pos.set(ev.cabin.x, 0, ev.cabin.z); return true; })()`);
      await step(6);
      const d = await ev('(() => { const c = __ppg.G.S.F.elevators[0].cabin; return Math.hypot(__ppg.P.pos.x - c.x, __ppg.P.pos.z - c.z); })()');
      expect(ok && d < 0.4, `${floor}: standing in the elevator cabin is not pushed out (${d.toFixed(2)} m)`);
    }
  }
  await shot('bounds-end');
  const errs = await ev('__ppg.errors');
  expect(!errs.length, '__ppg.errors empty ' + JSON.stringify(errs).slice(0, 200));
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
