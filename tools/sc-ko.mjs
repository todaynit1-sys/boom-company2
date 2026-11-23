// 깨꼬닥 (KO) — people react to being hit, with REAL key events (Z punch / X kick / E carry): staged bubbles as 멘탈
// runs out, KO on the expected hit, a frame sequence through the KO (stars, face, flat on the floor), KO ≥ 10 s then
// up and away, kick > punch distance, domino, seated people off their chairs, boss KO + payout, the bill's people
// section, calm mode, out-zones, nobody removed while KO'd, 40-person stress with the stars up (renderer.info).
// node tools/drive.mjs tools/sc-ko.mjs <out> 1280x720            (PART=a,b,… runs a subset)
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const parts = (process.env.PART || 'a,b,c,d,e,f,g,h,i').split(',');
  const npc = (i) => ev(`__ppg.npc(${JSON.stringify(i)})`);
  const fresh = async (floor = 'office') => { await ev(`__ppg.start("free", { floor: ${JSON.stringify(floor)} })`); await step(60); };
  // watch for a KO'd person ever being removed / hidden (all parts)
  const watchKo = async () => ev(`(() => { const bad = []; for (const n of __ppg.G.S.npcs) if (n.isKo && (n.gone || !n.group.visible || !n.group.parent)) bad.push(n.id); return bad; })()`);
  let koViolations = 0;
  const stepW = async (n, chunk = 10) => { let s; for (let k = 0; k < n; k += chunk) { s = await step(Math.min(chunk, n - k)); const b = await watchKo(); if (b.length) { koViolations++; log('KO VIOLATION', JSON.stringify(b)); } } return s; };
  // put them back on their spot (standing, facing the player) when they're up and about; KO'd bodies stay put
  const plant = (i, x, z, yaw) => ev(`(() => { const n = __ppg.G.S.npcs[${i}]; if (n.isKo || n.lying || n.state === 'air') return false; n.standUp(true); n.pos.set(${x}, 0, ${z}); n.yaw = ${yaw}; n.path = null; n.onArrive = null; if (n.state === 'flee' || n.state === 'walk' || n.state === 'cower' || n.state === 'shock' || n.state === 'idle') { n.state = 'idle'; n.char.setAnim('scared'); } n.place(); return true; })()`);
  const punchAt = async (i, key = 'KeyZ', dist = 0.95) => { await ev(`__ppg.faceNpc(${i}, ${dist})`); await step(2); await I.tap(key); return stepW(14, 7); };

  // ---------------------------------------------------------------- A: staged bubbles → KO on the 3rd punch, frames, ≥ 10 s, wake + leave
  if (parts.includes('a')) {
    await fresh();
    const i = await ev('__ppg.spawnNpc(-2.2, -1.95, { rotY: Math.PI / 2 })');
    await step(5);
    const lines = [];
    for (let h = 1; h <= 2; h++) {
      await plant(i, -2.2, -1.95, Math.PI / 2);
      await punchAt(i);
      const n = await npc(i);
      lines.push(n.bubble);
      log(`hit ${h}`, JSON.stringify({ state: n.state, mental: n.mental, bubble: n.bubble, face: n.face }));
      expect(n.mental === 3 - h, `punch ${h}: 멘탈 ${n.mental} (expected ${3 - h})`);
      expect(!n.ko, `punch ${h}: not KO yet`);
      await stepW(30);
    }
    expect(['아야!', '아얏!', '왜 나한테!', '앗 따거!'].includes(lines[0]), 'bubble 1 is an OUCH line: ' + lines[0]);
    expect(['살려 주세요…', '별이 보여요…', '띠용…', '머리가 빙글빙글…'].includes(lines[1]), 'bubble 2 (멘탈 1) is a HELP line: ' + lines[1]);
    const d1 = await npc(i);
    expect(d1.state === 'dizzy' || d1.face === 'dizzy' || d1.stars, `at 멘탈 1 they wobble dizzy (${d1.state}, ${d1.face})`);
    // the 3rd punch: KO
    await plant(i, -2.2, -1.95, Math.PI / 2);
    await ev(`__ppg.faceNpc(${i}, 0.95)`); await step(2);
    const m0 = (await ev('__ppg.state()')).money;
    await ev('__ppg.sfxLog(true); __ppg.feel(true)');
    await I.tap('KeyZ');
    await stepW(8, 4); // the blow lands (0.11 s); then step aside to watch from the side
    await ev('(() => { __ppg.tp(-1.6, -1.15); const y = -Math.PI / 2 - 0.3; __ppg.yaw(y); __ppg.look(y, 0.5); })()');
    const frames = [];
    const gaps = [3, 6, 8, 8, 8, 10, 14, 20, 30, 40];
    for (let f = 0; f < gaps.length; f++) {
      await stepW(gaps[f], 5);
      const n = await npc(i);
      frames.push({ f, state: n.state, anim: n.anim, face: n.face, y: n.y, rotX: n.rotX, stars: n.stars, ghost: n.ghost, bubble: n.bubble });
      await shot(`ko-a-${f}`);
      // once out cold: walk up close (player beside the head, looking down at the face)
      // (the player model is hidden for these close-ups so it does not block the view)
      if (f === 7) await ev(`(() => { const n = __ppg.G.S.npcs[${i}]; n.anchors(); const x = n.chest.x + 0.15, z = n.chest.z + 0.7; __ppg.tp(x, z); const y = Math.atan2(n.chest.x - x, n.chest.z - z); __ppg.yaw(y); __ppg.look(y, 0.9); __ppg.P.char.group.visible = false; })()`);
    }
    log('KO frames', JSON.stringify(frames));
    await ev('__ppg.P.char.group.visible = true');
    const n3 = await npc(i);
    expect(n3.ko && n3.state === 'ko', `3rd punch knocks out (${n3.state})`);
    expect(n3.face === 'ko' && (n3.anim === 'ko' || n3.anim === 'koFace'), `KO face + pose (${n3.face}, ${n3.anim})`);
    expect(n3.stars, 'stars on');
    expect(Math.abs(n3.y) < 0.02, `flat on the floor (y ${n3.y})`);
    const sl = await ev('__ppg.sfxLog(true)').then((l) => l.map((e) => e.n));
    expect(sl.includes('ko'), 'ko sfx played: ' + sl.join(','));
    const s3 = await ev('__ppg.state()');
    expect(s3.money - m0 >= 20000, `KO pays 치료비 (${s3.money - m0})`);
    expect(s3.npcs.ko >= 1, `state().npcs.ko counts it (${s3.npcs.ko})`);
    const ks = await ev('__ppg.koStats()');
    expect(ks.starsVisible && ks.rings >= 1, 'star ring visible ' + JSON.stringify(ks));
    // KO duration (game time, counted from the landing) and recovery
    if (!process.env.QUICK) {
    let t = (await npc(i)).koT, woke = null;
    for (let k = 0; k < 40 && !woke; k++) { await stepW(30, 30); t += 0.5; const n = await npc(i); if (n.state === 'wake') woke = t; }
    log('woke after', woke, 's');
    expect(woke != null && woke >= 9.5, `KO lasts ≥ 10 s (woke after ~${woke} s)`);
    await stepW(30); const w1 = await npc(i); await shot('ko-a-wake');
    log('waking', JSON.stringify(w1));
    expect(w1.anim === 'groggy' && (w1.face === 'sleepy' || w1.face === 'relief'), `wakes groggy (${w1.anim}, ${w1.face})`);
    let left = false;
    for (let k = 0; k < 40 && !left; k++) { await stepW(30, 15); const n = await npc(i); if (n.state === 'flee' || n.state === 'leave' || n.gone) left = n.state; }
    expect(!!left, 'then staggers off: ' + left);
    }
  }

  // ---------------------------------------------------------------- B: kick flies further than a punch
  if (parts.includes('b')) {
    const dist = async (key) => {
      await fresh();
      const i = await ev('__ppg.spawnNpc(-5.5, -1.95, { rotY: -Math.PI / 2 })'); // flies +x down the open aisle
      await step(3);
      await ev(`__ppg.faceNpc(${i}, 0.95)`); await step(2);
      const a = await npc(i);
      await I.tap(key);
      let n;
      for (let k = 0; k < 20; k++) { await step(4); n = await npc(i); if (k > 4 && (n.state === 'down' || n.state === 'dizzy' || n.state === 'flee' || n.state === 'shock' || n.state === 'cower')) break; }
      return Math.hypot(n.x - a.x, n.z - a.z);
    };
    const dp = await dist('KeyZ'), dk = await dist('KeyX');
    log('punch', dp.toFixed(2), 'kick', dk.toFixed(2));
    expect(dk > dp * 1.6 && dk > 2.2, `kick travels further (${dk.toFixed(2)} m vs punch ${dp.toFixed(2)} m)`);
  }

  // ---------------------------------------------------------------- C: a flying person knocks over a second one
  if (parts.includes('c')) {
    await fresh();
    const a = await ev('__ppg.spawnNpc(-4.0, -1.95, { rotY: Math.PI / 2 })');
    const b = await ev('__ppg.spawnNpc(-5.6, -1.95, { rotY: Math.PI / 2, preset: "workerF1" })');
    await step(3);
    await ev(`__ppg.faceNpc(${a}, 0.95)`); await step(2);
    await I.tap('KeyX');
    let hitB = false;
    for (let k = 0; k < 12; k++) { await step(4); const nb = await npc(b); if (nb.mental < 3) { hitB = nb; break; } if (k === 2) await shot('ko-c-domino'); }
    log('domino', JSON.stringify(hitB));
    expect(!!hitB && hitB.mental === 2, 'the kicked one knocks the second over (멘탈 −1)');
  }

  // ---------------------------------------------------------------- D: seated people get knocked off their chairs
  if (parts.includes('d')) {
    await fresh();
    const idx = await ev('__ppg.G.S.npcs.findIndex(n => n.seated && n.role === "worker" && n.seat && n.seat.chair && n.seat.chair.rec && n.state === "idle")');
    expect(idx >= 0, 'a seated worker exists (' + idx + ')');
    if (idx >= 0) {
      const c0 = await ev(`(() => { const r = __ppg.G.S.npcs[${idx}].seat.chair.rec.body.position; return [r.x, r.z]; })()`);
      // stand beside them (chair side), facing them
      await ev(`(() => { const n = __ppg.G.S.npcs[${idx}]; const sx = Math.cos(n.yaw), sz = -Math.sin(n.yaw); __ppg.tp(n.pos.x + sx * 0.9, n.pos.z + sz * 0.9); __ppg.yaw(Math.atan2(-sx, -sz)); })()`);
      await step(2);
      await I.tap('KeyX');
      let maxY = 0, n;
      for (let k = 0; k < 16; k++) { await step(3); n = await npc(idx); maxY = Math.max(maxY, n.y); if (k === 2) await shot('ko-d-chair'); }
      const c1 = await ev(`(() => { const r = __ppg.G.S.npcs[${idx}].seat.chair.rec.body.position; return [r.x, r.z]; })()`);
      log('seated', JSON.stringify({ n, maxY, c0, c1 }));
      expect(!n.seated && maxY > 0.3, `off the chair and airborne (seated ${n.seated}, max y ${maxY.toFixed(2)})`);
      expect(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 0.15, 'the chair skids away too');
    }
  }

  // ---------------------------------------------------------------- E: the boss KO (longer, glasses, 위자료, bigMoney) + bill
  if (parts.includes('e')) {
    await fresh();
    const bi = await ev('__ppg.G.S.npcs.findIndex(n => n.role === "boss")');
    await ev('__ppg.sfxLog(true)');
    const m0 = (await ev('__ppg.state()')).money;
    let n, kicks = 0, tries = 0, mBefore = m0;
    for (; tries < 8; tries++) {
      n = await npc(bi);
      if (n.ko) break;
      const mm = n.mental;
      mBefore = (await ev('__ppg.state()')).money;
      await plant(bi, -4.0, -1.95, -Math.PI / 2);
      await punchAt(bi, 'KeyX', 1.0);
      if ((await npc(bi)).mental < mm) kicks++;
      await stepW(40);
    }
    n = await npc(bi);
    log('boss after', kicks, 'kicks', JSON.stringify(n));
    expect(n.ko && kicks === 3, `boss (멘탈 5) goes down on the 3rd kick (${kicks})`);
    // the VIP flight is in slow motion: frames until he is flat out, then a close-up (player hidden)
    for (let f = 0; f < 12; f++) { await stepW(12, 6); if (f % 2 === 0) await shot(`ko-e-boss-${f / 2}`); if ((await npc(bi)).state === 'ko') break; }
    await stepW(40);
    await ev(`(() => { const n = __ppg.G.S.npcs[${bi}]; n.anchors(); const x = n.chest.x + 0.15, z = n.chest.z + 0.7; __ppg.tp(x, z); const y = Math.atan2(n.chest.x - x, n.chest.z - z); __ppg.yaw(y); __ppg.look(y, 0.9); __ppg.P.char.group.visible = false; })()`);
    await step(2); await shot('ko-e-boss-close'); await ev('__ppg.P.char.group.visible = true');
    n = await npc(bi);
    const st = await ev('__ppg.state()');
    const glassesOff = await ev(`__ppg.G.S.npcs[${bi}]._glasses != null`);
    const names = (await ev('__ppg.sfxLog(true)')).map((e) => e.n);
    log('boss KO', JSON.stringify({ bubble: n.bubble, money: st.money - mBefore, glassesOff, names: names.slice(-14) }));
    expect(st.money - mBefore >= 120000, `boss KO pays 위자료 ≥ 120,000 (${st.money - mBefore})`);
    expect(glassesOff, 'glasses flew off');
    expect(names.includes('bigMoney'), 'bigMoney rang');
    expect(/연봉|휴가|승진/.test(n.bubble || ''), 'boss KO bubble: ' + n.bubble);
    expect(n.koLen >= 12, `boss stays down longer (${n.koLen} s)`);
    // bill: people section + total
    await ev('__ppg.quit()'); await step(80, 40);
    const bill = await ev('__ppg.state().bill');
    const rows = await ev(`[...document.querySelectorAll('#r-items tr')].map(tr => tr.className + '|' + tr.textContent)`);
    const totalTxt = await ev(`document.getElementById('r-total').textContent`);
    const sum = await ev('[...__ppg.G.items.values()].reduce((a, i) => a + i.amount, 0)');
    log('bill', JSON.stringify(bill.people), totalTxt, 'sum', sum, 'money', bill.total);
    expect(bill.people.some((p) => /부장님 기절 — 위자료/.test(p.name)), 'bill line "부장님 기절 — 위자료"');
    expect(rows.some((r) => r.startsWith('sec|')), 'bill has a people section header');
    const ppl = bill.people.reduce((a, p) => a + p.amount, 0);
    expect(ppl === 120000 && bill.total >= ppl, `people lines = the KO pay, inside the total (${ppl} of ${bill.total}; all lines ${sum})`);
    await shot('ko-e-bill');
  }

  // ---------------------------------------------------------------- F: calm mode shortens the KO stop
  if (parts.includes('f')) {
    await fresh();
    await ev('__ppg.calm(true)');
    const i = await ev('__ppg.spawnNpc(-4.4, -1.95, { rotY: Math.PI / 2, mental: 1 })');
    await step(3);
    await ev(`__ppg.faceNpc(${i}, 0.95)`); await step(2);
    await ev('__ppg.feel(true)');
    await I.tap('KeyZ'); await step(12);
    const f = await ev('__ppg.feel()');
    log('calm feel', JSON.stringify({ hs: f.hs, slowT: f.slowT }));
    expect(f.hs.length && f.hs.every((h) => h.s <= 0.03 + 1e-9), 'calm: KO hit-stop ≤ 30 ms');
    expect(f.slowT <= 0.12, `calm: short slow-mo (${f.slowT})`);
    await ev('__ppg.calm(false)');
  }

  // ---------------------------------------------------------------- G: KO'd bodies never leave through windows / out-zones (kick + carry-throw)
  if (parts.includes('g')) {
    await fresh();
    const Z = await ev('(() => { const Z = __ppg.G.S.F.outZones[0]; return Z ? { axis: Z.axis, at: Z.at, side: Z.side, from: Z.from, to: Z.to } : null; })()');
    log('out-zone', JSON.stringify(Z));
    if (Z) {
      const a = Math.max(Z.from + 1, Math.min(Z.to - 1, 0));
      // a person 1.2 m inside the zone, facing in; the player between them and the room kicks outward
      const px = Z.axis === 'z' ? a : Z.at - Z.side * 1.2, pz = Z.axis === 'z' ? Z.at - Z.side * 1.2 : a;
      const i = await ev(`__ppg.spawnNpc(${px}, ${pz}, { mental: 1, rotY: ${Z.axis === 'z' ? (Z.side > 0 ? Math.PI : 0) : (Z.side > 0 ? -Math.PI / 2 : Math.PI / 2)} })`);
      await step(3);
      await ev(`__ppg.faceNpc(${i}, 0.95)`); await step(2);
      await I.tap('KeyX'); await stepW(160, 20);
      const inside = async () => { await ev(`__ppg.G.S.npcs[${i}].anchors()`); const n = await npc(i); const c = Z.axis === 'z' ? n.z : n.x, h = Z.axis === 'z' ? n.head[2] : n.head[0]; return { n, d: Math.max((c - Z.at) * Z.side, (h - Z.at) * Z.side) }; };
      let r = await inside();
      log('kicked at the window', JSON.stringify(r));
      expect(r.n.ko && r.d < 0, `KO'd body stays inside the out-zone (d ${r.d.toFixed(2)})`);
      // carry (E) and fling (E) it at the window
      await ev(`(() => { const n = __ppg.G.S.npcs[${i}]; n.anchors(); __ppg.tp(n.chest.x - ${Z.axis === 'z' ? 0 : Z.side} * 0.8, n.chest.z - ${Z.axis === 'z' ? Z.side : 0} * 0.8); __ppg.yaw(${Z.axis === 'z' ? (Z.side > 0 ? 0 : Math.PI) : (Z.side > 0 ? Math.PI / 2 : -Math.PI / 2)}); })()`);
      await step(3);
      const foc = (await ev('__ppg.state()')).focus;
      await I.tap('KeyE'); await step(10);
      const carry = (await ev('__ppg.state()')).player.carry;
      await shot('ko-g-carry');
      log('carry', foc, carry);
      expect(foc === '들기' && carry === 'person', `E 들기 picks up the KO'd body (${foc}, ${carry})`);
      await I.tap('KeyE'); await stepW(90, 15);
      r = await inside();
      log('thrown at the window', JSON.stringify(r));
      expect(r.n.ko && r.d < 0 && r.n.inScene && r.n.visible, `thrown body stays inside (d ${r.d.toFixed(2)}, ${r.n.state})`);
    }
  }

  // ---------------------------------------------------------------- H: 40 people, the special, stars up: draw calls stay flat
  if (parts.includes('h')) {
    await fresh();
    await ev(`(() => { const n0 = __ppg.G.S.npcs.length; for (let k = n0; k < 40; k++) { const a = k * 2.399, r = 1.3 + (k % 4) * 0.55; __ppg.spawnNpc(-2.3 + Math.cos(a) * r, -1.95 + Math.sin(a) * r, { rotY: a }); } })()`);
    await ev('__ppg.tp(-2.3, -1.95)');
    await step(20);
    const r0 = await ev('__ppg.render()');
    await ev('__ppg.G.special = 1');
    await I.tap('KeyQ');
    await step(360, 30);
    const s = await ev('__ppg.state()');
    const r1 = await ev('__ppg.render()');
    const ks = await ev('__ppg.koStats()');
    await shot('ko-h-stress');
    const t0 = Date.now(); await step(60, 60); const ms = (Date.now() - t0) / 60;
    // same scene with every star ring / soul puff switched off: the difference is what the KO fx cost
    await ev('for (const n of __ppg.G.S.npcs) { n.starsOn = false; n.ghostOn = false; }');
    await step(70, 35);
    const r2 = await ev('__ppg.render()'), ks2 = await ev('__ppg.koStats()');
    log('stress', JSON.stringify({ npcs: s.npcs, beforeSpecial: r0, withStars: r1, starsOff: r2, koStats: ks, koStatsOff: ks2, msPerTickSwiftshader: ms.toFixed(1) }));
    expect(s.npcs.total >= 40 && s.npcs.koTotal >= 8, `40 people, many KO'd (${s.npcs.koTotal})`);
    expect(ks.starsVisible && !ks2.starsVisible && r1.calls - r2.calls <= 8, `16 star rings (80 stars) cost one instanced mesh: ≤ 8 calls over all render passes (${r1.calls} vs ${r2.calls} without)`);
  }

  // ---------------------------------------------------------------- I: megaphone shout / extinguisher spray / ride feed 멘탈
  if (parts.includes('i')) {
    await fresh();
    const i = await ev('__ppg.spawnNpc(-3.6, -1.95, { rotY: Math.PI / 2 })');
    await ev('__ppg.tp(-2.3, -1.95); __ppg.yaw(-Math.PI / 2)');
    await ev('__ppg.give("megaphone")'); await step(5);
    await I.tap('KeyZ'); await step(10);
    let n = await npc(i);
    log('shout', JSON.stringify(n));
    expect(n.mental === 2 && n.anim === 'coverEars', `megaphone: covers ears, 멘탈 −1 (${n.anim}, ${n.mental})`);
  }

  log('KO violations', koViolations);
  expect(koViolations === 0, 'nobody removed / hidden while KO\'d');
  if (fails.length) throw new Error(fails.join(' | '));
};
