// Rush mode (1분 난동) with the bot until the bill.
export default async ({ ev, shot, log, step }) => {
  await ev('__ppg.start("rush")');
  await ev('__ppg.auto(true)');
  let s = await step(10);
  log('start', JSON.stringify({ scene: s.scene, floor: s.floor, timeLeft: s.timeLeft, bodies: s.bodies, render: s.render }));
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    s = await step(30, 30);
    if (!seen.has('a') && s.timeLeft < 50) { seen.add('a'); await shot('r1-rush-10s'); log('t50', JSON.stringify({ money: s.money, stress: s.stress, counts: s.counts, tasks: s.tasks, npcs: s.npcs, bodies: s.bodies, render: s.render })); }
    if (!seen.has('b') && s.timeLeft < 30) { seen.add('b'); await shot('r2-rush-30s'); log('t30', JSON.stringify({ money: s.money, stress: s.stress, counts: s.counts, tasks: s.tasks, npcs: s.npcs, bodies: s.bodies, render: s.render })); }
    if (!seen.has('c') && s.timeLeft < 8) { seen.add('c'); await shot('r3-rush-52s'); log('t52', JSON.stringify({ money: s.money, stress: s.stress, special: s.special, counts: s.counts, npcs: s.npcs, bodies: s.bodies, render: s.render })); }
    if (s.scene === 'bill') { s = await step(80, 40); await shot('r4-bill'); break; }
  }
  log('final', JSON.stringify(s));
  if (s.scene !== 'bill') throw new Error('rush did not reach the bill');
  const save = await ev('localStorage.getItem("ppg.save")');
  log('save', save);
};
