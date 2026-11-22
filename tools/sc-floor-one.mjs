// One floor, quickly: free mode on ?floor=<id>, renderer.info untouched, four look-around shots, then the bot
// smashes for ~10 s (600 steps) and plays with toys; final shot + challenge progress.
//   node tools/drive.mjs tools/sc-floor-one.mjs <outDir> 1280x720 floor=hall
export default async ({ ev, shot, log, step }) => {
  const floor = (await ev('new URLSearchParams(location.search).get("floor")')) || 'parking';
  await ev(`__ppg.start("free", { floor: ${JSON.stringify(floor)} })`);
  let s = await step(30);
  if (s.floor !== floor) throw new Error(`did not start on ${floor} (got ${s.floor})`);
  await step(3);
  const r1 = await ev('__ppg.render()'); const r2 = await ev('__ppg.render()');
  log('untouched', floor, JSON.stringify({ render: r2, quality: s.quality, post: s.post, bodies: s.bodies, npcs: s.npcs, build: s.floorsBuilt }));
  void r1;
  await shot(`one-${floor}-0-spawn`);
  const yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (let i = 0; i < yaws.length; i++) { await ev(`__ppg.look(${yaws[i]}, 0.32)`); await step(2); await shot(`one-${floor}-${i + 1}-look`); }
  await ev('__ppg.look(0, 0.3); __ppg.G.manual = true; true');
  await ev('__ppg.auto(true)');
  s = await step(600, 30);
  await shot(`one-${floor}-5-smashed`);
  log('after bot', JSON.stringify({ money: s.money, counts: s.counts, toys: s.toys, challenges: s.challenges, render: s.render, errors: s.errors }));
  await ev('__ppg.auto(false)');
  if (s.errors) throw new Error('errors: ' + JSON.stringify(await ev('__ppg.errors')));
};
