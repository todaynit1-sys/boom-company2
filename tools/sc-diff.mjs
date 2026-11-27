// 난이도 (쉬움 · 보통 · 어려움) + 체력 게이지 시험.
//   node tools/drive.mjs tools/sc-diff.mjs <out> 1280x720            (PART=a,i,w  DIFFS=easy,normal,hard  RUNS=2)
//   node tools/drive.mjs tools/sc-diff.mjs <out> 390x844 touch=1     (PART=a: 휴대폰 세로에서 게이지 자리)
//   a: diff.js 저장 · 값, 게이지가 난동 중에만 보이고 맞으면 줄어드는지, 다른 HUD · 버튼과 안 겹치는지 (+ 스크린샷)
//   i: 가만히 서 있으면 몇 초 만에 쓰러지나 — 사무실 보스 1명 / 통로에서 보스 + 중간보스 둘 + 욱한 직원
//   w: 보스를 이기나, 몇 초, 체력 얼마 잃나 — pro(매번 딱!) · human(막는 시점 들쭉날쭉 + 가끔 못 봄) · mash(주먹만)
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const parts = (process.env.PART || 'a,i,w').split(',');
  const DIFFS = (process.env.DIFFS || 'easy,normal,hard').split(',');
  const runs = +(process.env.RUNS || 2);
  const fst = () => ev('__ppg.fight.state()');
  const setD = (id) => ev(`(async () => { const m = await import('/js/diff.js'); m.setDiff(${JSON.stringify(id)}); return m.getDiff(); })()`);
  const fresh = async (floor = 'office') => { await ev(`__ppg.start("free", { floor: ${JSON.stringify(floor)} })`); await step(40); };
  const idx = (rank) => ev(`(__ppg.state().fighters.find((f) => f.rank === ${JSON.stringify(rank)}) || {}).i`);
  const hp = () => ev('(() => { const e = document.getElementById("hpbar"); if (!e) return null; const r = e.getBoundingClientRect(); return { shown: !e.hidden && !e.closest("[hidden]") && r.width > 0, num: e.querySelector(".hpb-num").textContent, diff: e.querySelector(".hpb-diff").textContent, cls: e.className, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()');

  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 20000);

  // ---------------------------------------------------------------- A: API · 저장 · 게이지
  if (parts.includes('a')) {
    const api = await ev(`(async () => { const m = await import('/js/diff.js'); return { ids: m.DIFFS.map((d) => d.id + ':' + d.n), cur: m.getDiff(), keys: Object.keys(m.D()) }; })()`);
    log('diff api', JSON.stringify(api));
    expect(api.ids.join() === 'easy:쉬움,normal:보통,hard:어려움', 'DIFFS 세 가지');
    for (const k of ['hp', 'dmgMul', 'enemyHpMul', 'speedMul', 'windupMul', 'maxAttackers', 'regen', 'koRule', 'moneyMul', 'angryMul']) expect(api.keys.includes(k), 'D().' + k);
    expect((await hp()) && !(await hp()).shown, '첫 화면: 체력 게이지 숨김');
    await setD('hard');
    expect(await ev('localStorage.getItem("ppg-diff")') === 'hard', "저장: localStorage 'ppg-diff' = hard");
    for (const id of DIFFS) {
      await setD(id);
      await fresh();
      const f = await fst(), g = await hp();
      log(id, 'fight', JSON.stringify({ hp: f.hp, hpMax: f.hpMax, diff: f.diff, koRule: f.koRule }), 'gauge', JSON.stringify(g));
      expect(f.diff === id && f.hp === f.hpMax, `${id}: 판 시작 때 난이도 읽음, 체력 가득 (${f.hp}/${f.hpMax})`);
      expect(g && g.shown && g.num.startsWith(String(f.hpMax)), `${id}: 난동 중 게이지 보임 (${g && g.num}, ${g && g.diff})`);
      const bi = await idx('boss');
      await ev(`__ppg.fight.hitPlayer(${bi})`);
      await step(4);
      const f2 = await fst();
      const R = await ev('__ppg.fight.tune().RANK.boss.dmg');
      expect(Math.abs(f2.hp - (f.hpMax - R)) < 0.01, `${id}: 보스 한 대 = ${R} (체력 ${f2.hp})`);
      await sleep(120);
      await shot(`da-${id}-hit`);
      await sleep(700);
      await step(2);
      await shot(`da-${id}-drained`);
    }
    // 25% 아래: 두근두근 (low)
    await ev('(() => { __ppg.fight.api.FT.hp = 18; return true; })()'); await step(2); await sleep(200);
    const low = await hp();
    expect(/low/.test(low.cls), '25% 아래면 low (' + low.cls + ')');
    await shot('da-low');
    // 옛 이름 hearts 는 HP 환산으로 계속 됨
    const h = await ev('__ppg.fight.hearts(1)');
    const f3 = await fst();
    expect(h === 1 && Math.abs(f3.hp - f3.hpMax / 5) < 0.01, `hearts(1) → 체력 20% (${f3.hp})`);
    // HUD · 버튼과 겹치지 않음
    const ov = await ev(`(() => {
      const R = (e) => e.getBoundingClientRect(), g = document.getElementById('hpbar'), a = R(g);
      const over = (b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const els = ['#mission', '#tasks', '#stress', '#timer', '#money', '#btn-pause', '#combo', '#joy', '.tbtn', '#keys > *'].flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e !== g && !e.closest('[hidden]') && R(e).width);
      return { box: [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height)], vw: innerWidth, vh: innerHeight, hits: els.filter((e) => over(R(e))).map((e) => e.id || e.className) };
    })()`);
    log('overlap', JSON.stringify(ov));
    expect(!ov.hits.length && ov.box[0] >= 0 && ov.box[0] + ov.box[2] <= ov.vw, '게이지가 다른 HUD · 버튼과 안 겹침 ' + JSON.stringify(ov.hits));
    await ev('__ppg.quit()'); await step(10); await sleep(200);
    expect(!(await hp()).shown, '영수증: 게이지 숨김');
  }

  // ---------------------------------------------------------------- I: 가만히 서 있기 — 몇 초 만에 쓰러지나
  const idle = async (id, crowd) => {
    await setD(id);
    await fresh();
    if (crowd) {
      // 7층 통로 (x −2.3, z −1.95): 보스 · 중간보스 둘 · 욱한 직원 하나가 둘러쌈 (진짜 보스는 멀리 둠)
      await ev('__ppg.tp(-2.3, -1.95)');
      const ranks = ['boss', 'mid', 'mid', 'angry'];
      for (let k = 0; k < ranks.length; k++) {
        const a = k * 1.571 + 0.3;
        const i = await ev(`__ppg.spawnNpc(${-2.3 + Math.cos(a) * 2.0}, ${-1.95 + Math.sin(a) * 2.0}, { rotY: ${a} })`);
        await ev(`__ppg.fight.make(${i}, ${JSON.stringify(ranks[k])})`);
      }
    } else {
      const bi = await idx('boss');
      await ev(`__ppg.faceNpc(${bi}, 1.3)`);
    }
    await ev('__ppg.fight.resetMax()');
    let frames = 0;
    const max = 60 * 60;
    let f = await fst();
    while (frames < max) {
      await step(15); frames += 15;
      f = await fst();
      if (f.flops > 0 || f.out) break;
    }
    if (crowd && id === 'hard') await shot('di-hard-crowd');
    return { ko: f.flops > 0, sec: f.flops > 0 ? +(frames / 60).toFixed(1) : null, hits: f.hitsTaken, dmg: f.dmgTaken, maxAtk: f.maxAttackers, out: f.out };
  };
  const IDLE = {};
  if (parts.includes('i')) {
    for (const id of DIFFS) {
      IDLE[id] = { boss: await idle(id, false), crowd: await idle(id, true) };
      log('IDLE', id, JSON.stringify(IDLE[id]));
    }
    const t = (id, k) => (IDLE[id] && IDLE[id][k].ko ? IDLE[id][k].sec : 99);
    if (IDLE.hard) {
      expect(t('hard', 'boss') <= 12, `어려움: 가만히 있으면 보스 혼자에게 금방 쓰러짐 (${t('hard', 'boss')} s)`);
      expect(t('hard', 'crowd') <= 6, `어려움: 여럿에게 둘러싸이면 몇 초 만에 쓰러짐 (${t('hard', 'crowd')} s)`);
      expect(IDLE.hard.boss.out || IDLE.hard.crowd.out, "어려움: 쓰러지면 'retry' (판 실패) 상태");
      expect(IDLE.hard.crowd.maxAtk <= 3, `어려움: 동시에 덤비는 사람 3명까지 (${IDLE.hard.crowd.maxAtk})`);
    }
    if (IDLE.easy && IDLE.normal) {
      expect(t('easy', 'boss') >= t('normal', 'boss') * 1.8, `쉬움: 보통보다 훨씬 오래 버팀 (${t('easy', 'boss')} vs ${t('normal', 'boss')} s)`);
      expect(IDLE.easy.crowd.maxAtk <= 1, `쉬움: 한 번에 한 명만 덤빔 (${IDLE.easy.crowd.maxAtk})`);
    }
    if (IDLE.normal && IDLE.hard) expect(t('hard', 'boss') < t('normal', 'boss'), `어려움이 보통보다 빨리 쓰러짐 (${t('hard', 'boss')} vs ${t('normal', 'boss')} s)`);
  }

  // ---------------------------------------------------------------- W: 보스를 이기나 — 잘하는 사람(딱! 막기) / 주먹만
  if (parts.includes('w')) {
    // pro: 매번 딱! 시점에 막음. human: 막는 시점이 들쭉날쭉(일찍 = 그냥 막기, 늦으면 맞음) + 10%는 아예 못 봄
    await ev(`window.__sk = (T, human) => {
      const G = __ppg.G, P = __ppg.P, L = G.S.npcs, R = __ppg.fight.tune().RANK, f = __ppg.fight.state();
      let danger = false, soon = 9;
      for (const n of L) {
        if (!n.fighter || n.gone || n.isKo) continue;
        if (n.pos.distanceTo(P.pos) > 2.8) continue;
        if (n.state === 'windup' && n.atk !== 'throw') {
          const key = Math.round((G.rtime - n.t) * 100);
          if (n._skKey !== key) { n._skKey = key; n._skThr = !human ? 0.2 : Math.random() < 0.1 ? -1 : 0.03 + Math.random() * 0.3; }
          const left = (n.wlen || R[n.fighter.rank].windup) - n.t + 0.08; soon = Math.min(soon, left); if (left <= n._skThr) danger = true;
        }
        if (n.state === 'swing' && n.t < 0.12 && n._skThr >= 0) danger = true;
      }
      if (__ppg.fight.api.incoming(2.0)) danger = true;
      const live = T.map((i) => L[i]).filter((n) => !n.isKo && !n.beaten && !n.gone);
      let tgt = null, bd = 1e9;
      for (const n of live) { const d = n.pos.distanceTo(P.pos); if (d < bd) { bd = d; tgt = n; } }
      if (tgt && !danger) __ppg.yaw(Math.atan2(tgt.pos.x - P.pos.x, tgt.pos.z - P.pos.z));
      return { danger, soon: +soon.toFixed(3), live: live.length, d: +bd.toFixed(2), out: f.out };
    }; true`);
    const fightRun = async (id, mode) => {
      const guard = mode !== 'mash';
      await setD(id);
      await fresh();
      const T = [await idx('boss')];
      await ev(`__ppg.faceNpc(${T[0]}, 3.0)`);
      let frames = 0, cDown = false, won = false;
      while (frames < 60 * 60) {
        const s = await ev(`__sk(${JSON.stringify(T)}, ${mode === 'human'})`);
        if (!s.live) { won = true; break; }
        if (s.out) break;
        if (guard && s.danger) { if (!cDown) { await I.down('KeyC'); cDown = true; } await step(3); frames += 3; continue; }
        if (cDown) { await I.up('KeyC'); cDown = false; }
        if (guard && s.soon < 0.34) { await step(2); frames += 2; continue; }
        if (s.d > 1.35) { await I.down('KeyW'); await step(6); await I.up('KeyW'); frames += 6; }
        else { await I.tap('KeyZ'); await step(guard ? 6 : 10); frames += guard ? 6 : 10; }
      }
      if (cDown) await I.up('KeyC');
      const f = await fst();
      return { won, sec: +(frames / 60).toFixed(1), dmg: f.dmgTaken, hits: f.hitsTaken, flops: f.flops, out: f.out, perfects: f.perfects, blocks: f.blocks };
    };
    const W = {};
    for (const id of DIFFS) {
      W[id] = { human: [], mash: [] };
      if (id === 'hard') { W[id].pro = [await fightRun(id, 'pro')]; log('WIN', id, 'pro', JSON.stringify(W[id].pro[0])); }
      for (let r = 0; r < runs; r++) {
        W[id].human.push(await fightRun(id, 'human')); log('WIN', id, 'human', r, JSON.stringify(W[id].human[r]));
        if (r === 0) await shot(`dw-${id}-human`);
        W[id].mash.push(await fightRun(id, 'mash')); log('WIN', id, 'mash', r, JSON.stringify(W[id].mash[r]));
      }
    }
    const rate = (L) => L.filter((x) => x.won).length / L.length;
    const avg = (L, k) => +(L.reduce((a, x) => a + (x[k] || 0), 0) / L.length).toFixed(1);
    const part = (L) => L ? { win: rate(L), sec: avg(L, 'sec'), dmg: avg(L, 'dmg'), perfects: avg(L, 'perfects'), blocks: avg(L, 'blocks') } : undefined;
    const sum = Object.fromEntries(Object.entries(W).map(([id, o]) => [id, { pro: part(o.pro), human: part(o.human), mash: { win: rate(o.mash), sec: avg(o.mash, 'sec'), dmg: avg(o.mash, 'dmg'), flops: avg(o.mash, 'flops') } }]));
    log('WINSUM', JSON.stringify(sum));
    if (sum.easy) expect(sum.easy.mash.win === 1, `쉬움: 주먹만 마구 눌러도 이김 (${sum.easy.mash.win * 100}%)`);
    if (sum.normal) expect(sum.normal.human.win >= 0.5, `보통: 막기 섞어 싸우면 이김 (${sum.normal.human.win * 100}%)`);
    if (sum.hard) expect(sum.hard.pro.win === 1, `어려움: 딱! 막기를 매번 맞추면 이김 (${sum.hard.pro.win * 100}%)`);
    if (sum.hard) log(`어려움 · 사람처럼 들쭉날쭉 막기: 승률 ${sum.hard.human.win * 100}%`);
    if (sum.hard && sum.normal) expect(sum.hard.mash.win <= sum.normal.mash.win, `어려움: 주먹만으로는 보통보다 덜 이김 (${sum.hard.mash.win * 100}% vs ${sum.normal.mash.win * 100}%)`);
  }

  await setD('normal');
  log(fails.length ? `FAILED ${fails.length}` : 'ALL OK');
  if (fails.length) throw new Error(fails.join(' | '));
};
