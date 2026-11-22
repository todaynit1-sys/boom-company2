// Price survey: every breakable record per floor (type, material, mass, price, hp) + the floor's potential total
// and its biggest single items. Used to balance the bill (see main.js → payout()).
// usage: node tools/drive.mjs tools/sc-prices.mjs out
export default async ({ ev, log, step }) => {
  const floors = (await ev('__ppg.floors()')).map((f) => f.id);
  const all = {};
  for (const id of floors) {
    await ev(`__ppg.start("free", { floor: ${JSON.stringify(id)} })`);
    await step(10);
    const recs = await ev(`__ppg.G.S.phys.records.filter(r => r.price > 0).map(r => ({ t: r.type, m: r.material, kg: +r.mass.toFixed(1), raw: r.rawPrice != null ? r.rawPrice : r.price, pay: r.price, hp: r.hpMax, fx: r.fixed, tag: r.tag }))`);
    const byType = {};
    for (const r of recs) { const k = r.t; const o = byType[k] || (byType[k] = { n: 0, raw: r.raw, pay: r.pay, m: r.m, kg: r.kg, hp: r.hp, fx: r.fx }); o.n++; }
    const rawSum = recs.reduce((a, r) => a + r.raw, 0), paySum = recs.reduce((a, r) => a + r.pay, 0);
    const top = Object.entries(byType).sort((a, b) => b[1].pay - a[1].pay).slice(0, 8).map(([t, o]) => `${t}×${o.n} ${o.raw}→${o.pay} (${o.m},${o.kg}kg,hp${o.hp}${o.fx ? ',fixed' : ''})`);
    const chal = (await ev('__ppg.chal()') || []).map((c) => c.id);
    const bonus = await ev('__ppg.G.taskPool.reduce((a, t) => a + (t.bonus || 0), 0)');
    all[id] = { n: recs.length, rawSum, paySum, bonus, chal: chal.length };
    log(`== ${id}: ${recs.length} items, raw ₩${rawSum.toLocaleString()} → paid ₩${paySum.toLocaleString()}, challenge bonuses ₩${bonus.toLocaleString()}`);
    for (const l of top) log('   ', l);
    log('   materials:', JSON.stringify(Object.fromEntries(Object.entries(byType).map(([t, o]) => [t, o.m]))));
  }
  log(JSON.stringify(all));
};
