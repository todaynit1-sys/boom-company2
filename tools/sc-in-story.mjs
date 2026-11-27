// 본게임(레벨) played with REAL key events: a steering helper reads the nav path (read-only) and presses
// W/A/S/D like a person would, holds E on prompts, and clicks elevator floor buttons / level cards with the mouse.
// 레벨 1 (복합기) · 2 (임원 보고, 건너뛰기) · 3 (커피 심부름) · 8 (퇴근 5분 전). ALL=1 이면 층 상황 레벨 2 · 4~7 도 끝까지.
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const down = new Set();
  async function setKeys(want) {
    for (const k of [...down]) if (!want.has(k)) { await I.up(k); down.delete(k); }
    for (const k of want) if (!down.has(k)) { await I.down(k); down.add(k); }
  }
  const look = () => ev(`(() => { const v = new __ppg.camera.position.constructor(); __ppg.camera.getWorldDirection(v); const l = Math.hypot(v.x, v.z); const s = __ppg.state(); return { f: [v.x / l, v.z / l], s }; })()`);
  // overlap of the E prompt with HUD blocks
  const promptClear = () => ev(`(() => { const p = document.getElementById('prompt'); if (p.hidden) return null; const r = p.getBoundingClientRect(); const hit = []; for (const sel of ['.hud-tl', '.hud-tr', '.hud-tc', '#keys', '#subtitle', '#toast']) { const e = document.querySelector(sel); if (!e || e.hidden || e.closest('[hidden]')) continue; for (const c of (sel === '.hud-tl' ? e.children : [e])) { if (c.hidden) continue; const q = c.getBoundingClientRect(); if (q.width && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) hit.push(sel); } } return { inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit }; })()`);

  // walk to (x,z) with keys. stop when within `near` or when cond() true. returns final state
  async function walkTo(x, z, { near = 0.5, cond = null, maxSteps = 1800, tag = '' } = {}) {
    let path = null, pi = 0, lastPath = -99, n = 0, stuck = 0, lastP = null;
    while (n < maxSteps) {
      const { f, s } = await look();
      if (cond && (await cond(s))) { await setKeys(new Set()); return s; }
      const p = s.player;
      const dGoal = Math.hypot(x - p.x, z - p.z);
      if (dGoal < near) { await setKeys(new Set()); return s; }
      if (!path || n - lastPath > 40) {
        path = await ev(`__ppg.G.S.nav.path(${p.x}, ${p.z}, ${x}, ${z})`) || [[x, z]]; pi = 0; lastPath = n;
      }
      while (pi < path.length - 1 && Math.hypot(path[pi][0] - p.x, path[pi][1] - p.z) < 0.35) pi++;
      const [wx, wz] = path[pi];
      let dx = wx - p.x, dz = wz - p.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const fwd = dx * f[0] + dz * f[1], right = dx * -f[1] + dz * f[0];
      const want = new Set();
      if (fwd > -0.3) want.add('KeyW'); else if (Math.abs(right) < 0.6) want.add('KeyS');
      if (right > 0.3) want.add('KeyD'); else if (right < -0.3) want.add('KeyA');
      await setKeys(want);
      await step(4, 4); n += 4;
      if (lastP && Math.hypot(p.x - lastP[0], p.z - lastP[1]) < 0.002 && s.player && !s.busy) stuck += 4; else stuck = 0;
      lastP = [p.x, p.z];
      if (stuck > 240) { await setKeys(new Set()); log('STUCK', tag, JSON.stringify(p)); await shot('_stuck-' + tag); return s; }
    }
    await setKeys(new Set());
    log('walkTo timeout', tag);
    return (await look()).s;
  }
  async function holdE(maxSteps = 120) {
    await I.down('KeyE');
    let s; for (let i = 0; i < maxSteps; i += 6) { s = await step(6, 6); if (!s.focus) break; }
    await I.up('KeyE');
    return step(2);
  }
  async function waitScene(pred, ms = 30000) {
    const t0 = Date.now(); let s;
    ms = Math.max(ms, 120000); // swiftshader renders slowly; budget by game time, not wall time
    while (Date.now() - t0 < ms) { s = await step(s && s.busy ? 3 : 15, 15); if (await pred(s)) return s; await sleep(60); }
    const dbg = await ev('(() => { const f = document.getElementById("fade"); return { hidden: f.hidden, op: f.style.opacity, anims: f.getAnimations().map(a => a.playState + ":" + a.currentTime), transN: __ppg.G.transN, vis: document.visibilityState }; })()');
    throw new Error('waitScene timeout ' + JSON.stringify(s && { scene: s.scene, phase: s.phase, busy: s.busy }) + ' ' + JSON.stringify(dbg));
  }

  // situations contributed by floor modules: follow the marker with real keys / clicks until pred(s)
  const played = new Set();
  async function follow(pred, s) {
    for (let guard = 0; guard < 400; guard++) {
      if (await pred(s)) return s;
      if (s.scene) played.add(s.scene);
      const o = s.objective;
      if (s.busy || !o) { s = await step(15, 15); continue; }
      if (o.kind === 'elevator') {
        s = await walkTo(o.x, o.z, { near: 0.2, cond: () => ev('!document.getElementById("elevator").hidden'), tag: 'fs-elev' });
        s = await step(6);
        if (await ev('!document.getElementById("elevator").hidden')) {
          await I.clickSel(`#ev-list .ev-btn[data-id="${o.dest}"]`);
          s = await waitScene((st) => st.floor === o.dest && !st.busy, 30000);
        }
        continue;
      }
      if (o.kind === 'interact') {
        s = await walkTo(o.x, o.z, { near: 0.45, cond: (st) => !!st.focus, tag: 'fs-hold' });
        if (s.focus) s = await holdE(); else s = await step(10);
        continue;
      }
      s = await walkTo(o.x, o.z, { near: 0.5, cond: (st) => !st.objective || st.objective.x !== o.x || st.objective.z !== o.z, tag: 'fs-walk' });
    }
    return s;
  }
  // 레벨 판 끝내기: 난동 시계를 0으로 → 결과(청구서)까지
  async function endRun(tag) {
    await ev('__ppg.G.timeLeft = Math.min(__ppg.G.timeLeft || 0.2, 0.2); true');
    let st; for (let i = 0; i < 40; i++) { st = await step(15, 15); if (st.scene === 'bill') break; }
    st = await step(40, 20);
    expect(st.scene === 'bill' && st.bill && st.bill.level, `${tag}: result card with stars (${st.bill && st.bill.level && st.bill.level.stars}★)`);
    return st;
  }
  async function pickLevel(n) {
    if (await ev('document.getElementById("levels").hidden')) {
      if (await ev('!document.getElementById("bill").hidden')) await I.clickSel('#b-levels');
      else await I.clickSel('#t-story');
    }
    await I.waitFor('!document.getElementById("levels").hidden', 8000);
    await I.clickSel(`#lv-grid .lv-card[data-lv="${n}"]`);
  }
  // ALL=1: 층 상황 레벨(2 · 4 · 5 · 6 · 7)도 마커를 따라 진짜 키로
  const ALL = process.env.ALL === '1';
  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 15000);
  // ---- 레벨 1 · 복합기 용지 걸림 (출근하기 → 레벨 선택 → 레벨 1)
  await pickLevel(1);
  let s = await waitScene((s) => s.scene === 'copier' && s.phase === 'walk' && !s.busy);
  log('copier walk', JSON.stringify(s.player), JSON.stringify(s.objective), s.tasks);
  // ---- copier ×3
  for (let k = 0; k < 3; k++) {
    const pr = await ev('(() => { const r = __ppg.G.S.F.anchors.printer.rec.body.position; return [r.x, r.z]; })()');
    s = await walkTo(pr[0], pr[1] - 0.9, { near: 0.45, cond: (s) => s.focus === '용지 빼기', tag: 'printer' + k });
    if (k === 0) {
      s = await step(3);
      expect(s.focus === '용지 빼기', 'copier prompt appears near the printer');
      const pc = await promptClear();
      expect(pc && pc.inView && !pc.hit.length, 'copier prompt on screen, not under the HUD ' + JSON.stringify(pc));
      await shot('is-1-copier-prompt');
    }
    s = await holdE();
    expect(s.phase === 'pulled', `hold E pulls the paper (#${k + 1}) phase=${s.phase}`);
    if (k < 2) s = await waitScene((s) => s.phase === 'walk');
  }
  s = await waitScene((s) => s.scene === 'rampage' && !s.busy, 60000);
  expect(s.floor === 'office' && s.mode === 'story', 'level 1: copier → stress 100% → rampage on 7층');
  s = await endRun('level 1');

  // ---- 레벨 2 · 임원 보고 (다음 레벨 버튼) — ALL=1 이면 마커를 따라 끝까지
  await I.clickSel('#b-next');
  s = await waitScene((s) => s.scene === 'execReport' && !s.busy);
  expect(true, '다음 레벨 → level 2 (임원 보고)');
  if (ALL) {
    s = await follow((s) => s.scene === 'rampage' || s.phase === 'boil', s);
    s = await waitScene((s) => s.scene === 'rampage' && !s.busy, 20000);
    expect(s.floor === 'exec', 'level 2 rampage on 12층 (' + s.floor + ')');
  } else { await ev('__ppg.skip()'); s = await waitScene((s) => s.scene === 'rampage' && !s.busy, 20000); }
  s = await endRun('level 2');

  // ---- 레벨 3 · 커피 심부름 (레벨 선택 창에서 클릭)
  await pickLevel(3);
  s = await waitScene((s) => s.scene === 'coffee' && s.phase === 'toLobby' && !s.busy);
  await shot('is-2-coffee');
  // ---- to the elevator, panel, click 1층
  let evp = s.objective;
  s = await walkTo(evp.x, evp.z, { near: 0.2, cond: () => ev('!document.getElementById("elevator").hidden'), tag: 'elev1' });
  s = await step(10);
  const panelOpen = await ev('!document.getElementById("elevator").hidden');
  expect(panelOpen, 'walking into the elevator opens the floor panel');
  await shot('is-3-elevator-panel');
  await I.clickSel('#ev-list .ev-btn[data-id="lobby"]');
  s = await waitScene((s) => s.floor === 'lobby' && !s.busy, 30000);
  expect(s.floor === 'lobby', 'real click on 1층 rides down');
  // ---- queue → pickup
  s = await waitScene((s) => s.phase === 'queue' || s.phase === 'inQueue', 5000).catch(() => s);
  if (s.phase === 'queue') { const q = s.objective; s = await walkTo(q.x, q.z, { near: 0.5, cond: (s) => s.phase !== 'queue', tag: 'queue' }); }
  await shot('is-4-queue');
  for (let i = 0; i < 200 && s.phase !== 'pickup'; i++) s = await step(30, 30);
  expect(s.phase === 'pickup', 'queue served → pickup (' + s.phase + ')');
  const tp = s.objective;
  s = await walkTo(tp.x, tp.z, { near: 0.4, cond: (s) => s.focus === '커피 받기', tag: 'trays' });
  s = await holdE();
  expect(s.player.carry === 'coffee', 'hold E takes the coffee trays');
  await shot('is-5-carry');
  // ---- carry trays back through the elevator (keyboard shortcut 7 this time)
  evp = s.objective;
  s = await walkTo(evp.x, evp.z, { near: 0.2, cond: () => ev('!document.getElementById("elevator").hidden'), tag: 'elev2' });
  s = await step(6);
  expect(await ev('!document.getElementById("elevator").hidden'), 'elevator panel opens while carrying the trays');
  await I.tap('Digit7');
  s = await waitScene((s) => s.floor === 'office' && !s.busy, 30000);
  expect(s.floor === 'office' && s.player.carry === 'coffee', 'key 7 rides up, still carrying');
  // ---- deliver
  for (let i = 0; i < 10 && s.phase !== 'deliver'; i++) s = await step(10);
  const bp = s.objective;
  s = await walkTo(bp.x, bp.z, { near: 1.2, cond: (s) => s.focus === '커피 드리기', tag: 'boss' });
  s = await holdE();
  expect(s.phase === 'delivered', 'hold E delivers the coffee');
  s = await waitScene((s) => s.scene === 'rampage' && !s.busy, 60000);
  expect(s.floor === 'office', 'level 3: coffee delivered → rampage');
  const midN = (s.fighters || []).filter((f) => f.rank === 'mid').length, bossN = (s.fighters || []).filter((f) => f.rank === 'boss').length;
  expect(midN === 1 && bossN === 0, `level 3: 중간보스 fights, 보스 stays out (${JSON.stringify(s.fighters)})`);
  s = await endRun('level 3');

  // ---- ALL=1: 층 상황 레벨 4 ~ 7 (마커를 따라)
  if (ALL) {
    await ev('__ppg.unlock()');
    for (const [n, id, fl] of [[4, 'roofLettuce', 'roof'], [5, 'hallSetup', 'hall'], [6, 'parkingCar', 'parking'], [7, 'pubBooking', 'pub']]) {
      await pickLevel(n);
      s = await waitScene((s) => s.scene === id && !s.busy);
      s = await follow((s) => s.scene === 'rampage' || s.phase === 'boil', s);
      s = await waitScene((s) => s.scene === 'rampage' && !s.busy, 20000);
      expect(s.floor === fl, `level ${n} (${id}) → rampage on ${fl} (${s.floor})`);
      s = await endRun('level ' + n);
    }
  }

  // ---- 레벨 8 · 퇴근 5분 전 (최종 보스)
  await ev('__ppg.unlock()');
  await pickLevel(8);
  s = await waitScene((s) => s.scene === 'sunset' && s.phase === 'leave' && !s.busy, 40000);
  await shot('is-6-sunset');
  // ---- sunset: head for the elevator, get intercepted
  evp = s.objective;
  s = await walkTo(evp.x, evp.z, { near: 0.3, cond: (s) => s.phase === 'intercept', tag: 'leave' });
  expect(s.phase === 'intercept', 'boss intercepts on the way out');
  s = await step(90);
  await shot('is-7-intercept');
  // try to walk past the boss: elevators are locked, but the player must not get pinned
  const before = s.player;
  await I.down('KeyS'); s = await step(40); await I.up('KeyS');
  expect(Math.hypot(s.player.x - before.x, s.player.z - before.z) > 0.4, 'player can still move during the intercept');
  const b = s.objective;
  s = await walkTo(b.x, b.z, { near: 1.3, cond: (s) => s.focus === '서류 받기', tag: 'binders' });
  s = await holdE();
  expect(s.phase === 'boil', 'hold E takes the binders → boil');
  s = await waitScene((s) => s.scene === 'rampage', 20000);
  s = await step(30);
  expect((s.fighters || []).some((f) => f.rank === 'boss'), 'level 8: 보스 fights back');
  const r0 = s.player;
  await I.down('KeyW'); s = await step(60); await I.up('KeyW');
  expect(Math.hypot(s.player.x - r0.x, s.player.z - r0.z) > 1.0, 'free to run once the rampage starts');
  await I.tap('KeyJ'); await step(30);
  await shot('is-8-rampage');
  log('story keys final', JSON.stringify({ scene: s.scene, money: s.money, timeLeft: s.timeLeft }));
  s = await endRun('level 8');
  expect(!(await ev('!document.getElementById("b-next").hidden')), 'last level: no 다음 레벨 button');
  await sleep(900);
  await shot('is-9-last-result');
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
