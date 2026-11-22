// Bill balance per floor: the bot rampages SEC seconds on each floor (free mode, fresh start each time) and we log
// the damage, its per-minute rate, the biggest bill lines and how often bigMoney / comboUp rang.
// node tools/drive.mjs tools/sc-balance.mjs <out> 1280x720 [sec=30]
export default async ({ ev, log, step }) => {
  const sec = +(process.env.BAL_SEC || 30);
  const floors = (process.env.BAL_FLOORS || 'office,lobby,parking,roof,exec,hall,pub').split(',');
  const out = {};
  for (const id of floors) {
    await ev(`__ppg.start("free", { floor: ${JSON.stringify(id)} })`);
    await step(20);
    await ev('__ppg.sfxLog(true)');
    await ev('__ppg.auto(true)');
    let s;
    for (let t = 0; t < sec * 60; t += 300) s = await step(300, 30);
    await ev('__ppg.auto(false)');
    const c = await ev('__ppg.sfxCount()');
    const items = await ev('[...__ppg.G.items.values()].sort((a, b) => b.amount - a.amount).slice(0, 6).map(i => i.name + (i.count > 1 ? "×" + i.count : "") + " " + i.amount)');
    const rate = Math.round(s.money / (sec / 60));
    out[id] = { money: s.money, perMin: rate, bigMoney: c.bigMoney || 0, coin: c.coin || 0, comboUp: c.comboUp || 0, bonus: c.bonus || 0, crash: c.crash || 0, specials: s.counts.special || 0 };
    log(id, JSON.stringify(out[id]), JSON.stringify(items));
  }
  log(JSON.stringify(out));
};
