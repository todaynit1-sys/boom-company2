// Free mode across the building: start on 7층, the bot rides the elevator to every floor (R → B2), smashes
// ~10 s on each, screenshots each floor (arrival = untouched renderer.info, then wrecked), comes back to 7층
// to check its wreckage persisted, quits to the bill.
export default async ({ ev, shot, log, step }) => {
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const wrecked = (id) => ev(`(() => { const S = __ppg.G.floors[${JSON.stringify(id)}]; return S ? S.phys.records.filter(r => r.destroyed || r.removed).length : -1; })()`);
  await ev('__ppg.start("free", { floor: "office" })');
  let s = await step(20);
  expect(s.floor === 'office' && s.scene === 'free', 'free mode starts on 7층');
  const floors = (await ev('__ppg.floors()')).map((f) => f.id);
  expect(floors.join() === 'roof,exec,office,hall,lobby,pub,parking', 'seven floors registered ' + floors.join());
  await ev('__ppg.auto(true)');
  s = await step(600, 30);
  await shot('fl-office');
  const office0 = await wrecked('office');
  log('office smashed', office0, JSON.stringify({ money: s.money, render: s.render }));
  const order = ['roof', 'exec', 'hall', 'lobby', 'pub', 'parking', 'office'];
  const perFloor = {};
  for (const id of order) {
    await ev(`__ppg.ride(${JSON.stringify(id)})`);
    for (let i = 0; i < 90 && s.floor !== id; i++) s = await step(30, 30);
    expect(s.floor === id, `elevator reaches ${id} (at ${s.floor})`);
    if (s.floor !== id) break;
    s = await step(12);
    // untouched numbers right after arrival (bot paused for the measurement)
    await ev('__ppg.auto(false)');
    const info = await ev('__ppg.render()');
    await shot(`fl-${id}-arrive`);
    await ev('__ppg.auto(true)');
    if (id === 'office') break;
    s = await step(600, 30);
    const w = await wrecked(id);
    perFloor[id] = { untouched: info, wrecked: w, money: s.money, tasks: s.tasks, after: s.render };
    log(id, JSON.stringify(perFloor[id]));
    expect(w > 0, `bot smashed something on ${id} (${w})`);
    await shot(`fl-${id}-wrecked`);
  }
  const officeAgain = await wrecked('office');
  expect(officeAgain >= office0 && office0 > 0, `7층 wreckage persisted (${office0} → ${officeAgain})`);
  const kept = await ev('Object.keys(__ppg.G.floors).length');
  expect(kept === 7, 'all seven floors kept in memory for the session (' + kept + ')');
  await ev('__ppg.auto(false)');
  await ev('__ppg.quit()');
  s = await step(60, 30);
  await shot('fl-bill');
  const bill = await ev('[...document.querySelectorAll("#r-items tr")].map(r => r.textContent).slice(0, 12)');
  log('bill', JSON.stringify(s.bill), JSON.stringify(bill));
  expect(s.scene === 'bill' && s.bill && s.bill.total > 0, 'bill after the tour');
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
