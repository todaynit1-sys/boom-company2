// Elevator arrivals: the player steps out of the car on their own, the camera starts in the car behind them
// looking out (level, not at the floor or the car ceiling) and dollies out with them. Checked on every floor
// incl. the low B2 ceiling and the open roof; screenshots at 0 / 0.4 / 1.0 / 1.6 s after arrival.
// node tools/drive.mjs tools/sc-arrive.mjs <out> 1280x720
export default async ({ ev, shot, log, step }) => {
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  await ev('__ppg.start("free", { floor: "office" })');
  let s = await step(20);
  const along = `(() => { const ev = __ppg.G.S.F.elevators.reduce((a, e) => e.front.distanceTo(__ppg.P.pos) < a.front.distanceTo(__ppg.P.pos) ? e : a); const d = __ppg.P.pos.clone().sub(ev.front); return +d.dot(ev.fwd).toFixed(2); })()`;
  for (const id of ['lobby', 'parking', 'roof', 'exec', 'hall', 'pub', 'office']) {
    await ev('__ppg.auto(true)');
    await ev(`__ppg.ride(${JSON.stringify(id)})`);
    for (let i = 0; i < 200 && (s.floor !== id || s.busy); i++) s = await step(5, 5);
    await ev('__ppg.auto(false)');
    expect(s.floor === id, `reached ${id}`);
    if (s.floor !== id) continue;
    const ceil = await ev('__ppg.G.S.F.ceilY');
    const rows = [];
    for (const [k, n] of [[0, 1], [1, 23], [2, 36], [3, 36]]) {
      s = await step(n, n);
      const f = await ev('__ppg.feel()'), d = await ev('__ppg.camDir()'), a = await ev(along);
      rows.push({ k, cabin: f.cabin, arrive: f.arrive, camY: f.cam[1], dirY: d[1], pitch: f.pitch, along: a });
      await shot(`ar-${id}-${k}`);
    }
    log(id, 'ceil', ceil, JSON.stringify(rows));
    expect(rows[0].cabin && rows[0].along < 0, `${id}: arrival starts in the car with the camera behind the player`);
    expect(rows.every((r) => r.dirY > -0.42 && r.dirY < 0.05), `${id}: camera never looks at the floor or the ceiling (dir.y ${rows.map((r) => r.dirY).join(', ')})`);
    expect(rows.every((r) => r.camY < ceil - 0.1 && r.camY > 0.8), `${id}: camera height within the room (${rows.map((r) => r.camY).join(', ')} < ${ceil})`);
    expect(rows[3].along > 1.0 && !rows[3].arrive, `${id}: walked out of the car (${rows[3].along} m in front of the doors)`);
  }
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
