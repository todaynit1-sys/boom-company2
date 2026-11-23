// Full story run with the auto bot: start → copier → coffee (lobby + queue) → sunset → rampage → bill.
// STORY_LEN=long runs all eight situations (floor scenes too) and checks the stress curve.
export default async ({ ev, shot, log, step }) => {
  const long = process.env.STORY_LEN === 'long';
  await ev(`__ppg.start("story", { len: "${long ? 'long' : 'short'}" })`);
  await ev('__ppg.auto(true)');
  const seen = new Set();
  const want = {
    'copier:walk': '10-copier-walk', 'copier:pulled': '11-copier-pull', 'coffee:order': '20-coffee-order', 'coffee:queue': '21-lobby-arrive',
    'coffee:inQueue': '22-lobby-queue', 'coffee:pickup': '23-lobby-pickup', 'coffee:toOffice': '24-carry', 'coffee:deliver': '25-deliver', 'coffee:delivered': '26-receipt',
    'sunset:leave': '30-sunset', 'sunset:intercept': '31-intercept', 'sunset:boil': '32-boil',
  };
  let s, last = '', stall = 0, lastKey = '';
  const t0 = Date.now();
  for (let i = 0; i < (long ? 2400 : 900); i++) {
    s = await step(20, 20);
    const key = s.scene + ':' + s.phase;
    if (key !== lastKey) { log(`[${s.rtime}s] ${key} floor=${s.floor} stress=${s.stress} money=${s.money} p=(${s.player.x},${s.player.z}) obj=${JSON.stringify(s.objective)} focus=${s.focus}`); lastKey = key; stall = 0; }
    else stall++;
    if (want[key] && !seen.has(key)) {
      seen.add(key);
      // a few extra frames so the moment reads well
      s = await step(key.endsWith('pulled') ? 30 : key.endsWith('intercept') ? 70 : key.endsWith('boil') ? 130 : 25, 25);
      await shot(want[key]);
    }
    if (s.focus && !seen.has('focus:' + s.focus) && s.scene !== 'rampage') { seen.add('focus:' + s.focus); await shot('15-focus-' + s.scene + '-' + s.phase); }
    if (s.scene === 'rampage' && !seen.has('ramp1') && s.timeLeft != null && s.timeLeft < 45) { seen.add('ramp1'); await shot('40-rampage-a'); log('rampage@45', JSON.stringify({ money: s.money, counts: s.counts, npcs: s.npcs, bodies: s.bodies, render: s.render })); }
    if (s.scene === 'rampage' && !seen.has('ramp2') && s.timeLeft != null && s.timeLeft < 20) { seen.add('ramp2'); await shot('41-rampage-b'); log('rampage@20', JSON.stringify({ money: s.money, counts: s.counts, npcs: s.npcs, bodies: s.bodies, render: s.render })); }
    if (s.scene === 'bill') { s = await step(90, 30); await shot('50-bill'); break; }
    if (stall > 160 && s.scene !== 'rampage') { log('STALL at', key, JSON.stringify(s)); await shot('_stall'); break; }
    if (Date.now() - t0 > (long ? 2400000 : 900000)) { log('wall clock limit'); break; }
  }
  log('final', JSON.stringify(s));
  if (s.scene !== 'bill') throw new Error('story did not reach the bill');
  const sl = await ev('__ppg.stressLog()');
  log('stress by situation [scene, stress at its end, rtime]', JSON.stringify(sl), 'story seconds', s.bill && s.bill.storySec);
  const pre = sl.filter((e) => e[0] !== 'sunset' && e[0] !== 'rampage' && e[0] !== 'bill' && e[0] !== 'title');
  if (!pre.every((e, i) => i === 0 || e[1] >= pre[i - 1][1]) || pre.some((e) => e[1] >= 100)) throw new Error('stress curve not monotonic / hit 100 early: ' + JSON.stringify(sl));
};
