// 반격 · 막기 · 기력 · 이름 정하기 — with REAL key / mouse / touch events where the player acts (C guard, Z punch,
// W walk, typing into the name panel, tapping the 막기 button). Fighter swings are triggered with
// __ppg.fight.attack() so the timing is exact; their own AI is held off with a long cool-down where that matters.
//   desktop: node tools/drive.mjs tools/sc-fight.mjs <out> 1280x720            (PART=n,a,b,c,d,e,f,g,h)
//   touch:   node tools/drive.mjs tools/sc-fight.mjs <out> 844x390 touch=1     (runs the touch part)
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step, W, H }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const touch = await ev('document.documentElement.classList.contains("touch")');
  const npc = (q) => ev(`__ppg.npc(${JSON.stringify(q)})`);
  const fst = () => ev('__ppg.fight.state()');
  const st = () => ev('__ppg.state()');
  const fresh = async (floor = 'office') => { await ev(`__ppg.start("free", { floor: ${JSON.stringify(floor)} })`); await step(40); };
  const idx = (rank) => ev(`__ppg.state().fighters.find((f) => f.rank === ${JSON.stringify(rank)}).i`);
  // keep a fighter's own AI from swinging (attack() ignores the cool-down)
  const hold = (i) => ev(`(() => { const n = __ppg.G.S.npcs[${i}]; n.aiHold = true; return true; })()`);
  // stand `dist` in front of npc i, facing it; the npc faces the player and stands still
  const face = async (i, dist = 1.1) => { await ev(`(() => { const n = __ppg.G.S.npcs[${i}]; n.path = null; __ppg.faceNpc(${i}, ${dist}); n.yaw = Math.atan2(__ppg.P.pos.x - n.pos.x, __ppg.P.pos.z - n.pos.z); return true; })()`); await step(2); };
  // the open aisle of 7층 (x −4.2, z −1.95): npc i there facing east, the player `dist` m east of it facing it
  const arena = async (i, dist = 0.95) => { await ev(`(() => { const n = __ppg.G.S.npcs[${i}]; n.standUp(true); n.path = null; n.onArrive = null; if (!n.fighting) { n.state = 'idle'; n.char.setAnim('idle'); } n.pos.set(-4.2, 0, -1.95); n.yaw = Math.PI / 2; n.place(); __ppg.tp(-4.2 + ${dist}, -1.95); __ppg.yaw(-Math.PI / 2); return true; })()`); await step(2); };
  const aimAt = (i) => ev(`(() => { const n = __ppg.G.S.npcs[${i}], P = __ppg.P; const y = Math.atan2(n.pos.x - P.pos.x, n.pos.z - P.pos.z); __ppg.yaw(y); return Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z); })()`);
  const stepUntil = async (cond, max = 240, chunk = 2) => { for (let k = 0; k < max; k += chunk) { await step(chunk); if (await ev(cond)) return true; } return false; };
  const parts = (process.env.PART || (touch ? 't' : 'n,a,b,c,d,e,f,g,h')).split(',');

  await I.waitFor('!document.getElementById("title").hidden && document.getElementById("boot").hidden', 20000);

  // ---------------------------------------------------------------- N: names via the title panel (real clicks + typing), persist, link
  if (parts.includes('n')) {
    await ev('localStorage.removeItem("ppg.names"); true');
    await I.clickSel('#t-names');
    await sleep(200);
    expect(await ev('!document.getElementById("names").hidden'), '이름 정하기 opens the panel');
    const type = async (sel, text) => { await I.clickSel(sel); await ev(`document.querySelector(${JSON.stringify(sel)}).select(); true`); await send('Input.insertText', { text }); };
    await type('#n-boss', '김부장');
    await type('#n-mid', '박과장');
    // the field itself stops at 8 characters (pasted / typed past it)
    await type('#n-me', '홍길동대리님입니다아아');
    const capped = await ev('document.getElementById("n-me").value');
    expect(Array.from(capped).length === 8, `input capped at 8 characters ("${capped}")`);
    await type('#n-me', '<홍길동>');
    await shot('fn-0-panel');
    await I.clickSel('#n-save');
    await sleep(200);
    const saved = await ev('JSON.parse(localStorage.getItem("ppg.names") || "null")');
    log('saved', JSON.stringify(saved));
    expect(saved && saved.boss === '김부장' && saved.mid === '박과장', 'typed names saved ' + JSON.stringify(saved));
    expect(saved && saved.me === '홍길동', `angle brackets stripped ("${saved && saved.me}")`);
    expect(await ev('document.getElementById("names").hidden'), '저장 closes the panel');
    const sub = await ev('document.getElementById("t-names-sub").textContent');
    expect(/김부장/.test(sub) && /박과장/.test(sub), 'title shows the names: ' + sub);
    // persist across a reload
    await send('Page.reload', {});
    await sleep(600);
    await I.waitFor('!!window.__ppg && !document.getElementById("title").hidden && document.getElementById("boot").hidden', 20000);
    const re = await ev('__ppg.names()');
    expect(re.boss === '김부장' && re.mid === '박과장', 'names persist after reload ' + JSON.stringify(re));
    // a friend's link (#nb=…): plain text, length-limited, this session only (not saved over ours)
    await ev(`location.hash = "debug&nb=" + encodeURIComponent("철수<img src=x>아주아주긴이름") + "&nm=" + encodeURIComponent("영희"); true`);
    await send('Page.reload', {});
    await sleep(600);
    await I.waitFor('!!window.__ppg && !document.getElementById("title").hidden && document.getElementById("boot").hidden', 20000);
    const ln = await ev('({ n: __ppg.names(), saved: JSON.parse(localStorage.getItem("ppg.names")), imgs: document.querySelectorAll("img").length })');
    log('link names', JSON.stringify(ln));
    expect(ln.n.boss === Array.from('철수img src=x아주아주긴이름').slice(0, 8).join('') && ln.n.mid === '영희' && ln.saved.boss === '김부장' && ln.imgs === 0, 'link names: plain text, ≤ 8, not saved ' + JSON.stringify(ln.n));
    await ev('history.replaceState(null, "", location.pathname + location.search + "#debug"); true');
    await send('Page.reload', {});
    await sleep(600);
    await I.waitFor('!!window.__ppg && !document.getElementById("title").hidden && document.getElementById("boot").hidden', 20000);
    // 1분 난동 by click: goal text, tags, money pop, bill lines
    await I.clickSel('#title [data-mode="rush"]');
    await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
    let s = await step(5);
    expect(s.challenges.some((c) => c.text === '김부장 기절시키기'), 'rush goal "김부장 기절시키기" ' + JSON.stringify(s.challenges.map((c) => c.text)));
    const bi = await idx('boss'), mi = await idx('mid');
    await hold(bi); await hold(mi);
    await face(bi, 2.4); await step(20);
    const bn = await npc(bi);
    expect(bn.tag === '김부장' && bn.tagShown, `boss name tag "${bn.tag}" shown ${bn.tagShown}`);
    await ev('__ppg.look(__ppg.P.yaw, 0.25)'); await step(2);
    await shot('fn-1-tag-boss');
    // KO the boss (1 멘탈 left) with a real punch
    await ev(`__ppg.G.S.npcs[${bi}].mental = 1`);
    await arena(bi);
    await I.tap('KeyZ');
    await stepUntil(`__ppg.npc(${bi}).state === "ko"`, 400, 6);
    await step(4);
    const pops = await ev('[...document.querySelectorAll("#world .pop span")].map((e) => e.textContent)');
    expect(pops.some((t) => /김부장 위자료 120,000원/.test(t)), 'money pop "+김부장 위자료 120,000원" ' + JSON.stringify(pops.filter((t) => /위자료/.test(t))));
    await shot('fn-2-boss-ko');
    // the mid-boss
    await ev(`__ppg.G.S.npcs[${mi}].mental = 1`);
    await face(mi, 2.4); await step(10);
    const mn = await npc(mi);
    expect(mn.tag === '박과장' && mn.tagShown, `mid-boss name tag "${mn.tag}"`);
    await shot('fn-3-tag-mid');
    await arena(mi);
    await I.tap('KeyZ');
    await stepUntil(`__ppg.npc(${mi}).state === "ko"`, 400, 6);
    await step(4);
    await ev('__ppg.quit()'); await step(80, 40); await sleep(300);
    const bill = await ev('__ppg.state().bill');
    const meta = await ev('document.getElementById("r-meta").textContent');
    log('bill people', JSON.stringify(bill.people), meta);
    expect(bill.people.some((p) => p.name === '김부장 기절 — 위자료' && p.amount === 120000), 'bill line "김부장 기절 — 위자료" 120,000');
    expect(bill.people.some((p) => p.name === '박과장 기절 — 위자료' && p.amount === 60000), 'bill line "박과장 기절 — 위자료" 60,000');
    expect(/청구 대상 /.test(meta), 'bill names the player: ' + meta);
    await shot('fn-4-bill');
    await I.clickSel('#b-title');
    await sleep(300);
    // restore the defaults for the parts below (names checked: done)
    await ev('__ppg.names({ boss: "", mid: "", me: "" }, true)');
  }

  // ---------------------------------------------------------------- A: guard (held C) blocks a hit: no heart lost, push back, block sfx, no stun
  if (parts.includes('a')) {
    await fresh();
    const bi = await idx('boss');
    await hold(bi);
    await arena(bi, 1.15);
    await I.down('KeyC'); await step(30); // raised well before the blow: an ordinary block
    let f = await fst();
    expect(f.guard && (await ev('__ppg.P.char.anim')) === 'guard', 'holding C raises the guard (pose "guard")');
    await ev('__ppg.sfxLog(true)');
    const p0 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
    await ev(`__ppg.fight.attack(${bi})`);
    await step(30);
    await shot('fa-0-windup-guard');
    await ev('__ppg.look(__ppg.P.yaw - 1.95, 0.22)'); await step(1);
    await shot('fa-1-guard-front');
    await ev('__ppg.look(__ppg.P.yaw + 1.6, 0.18)'); await step(1);
    await shot('fa-2-windup-side');
    await ev('__ppg.yaw(-Math.PI / 2)');
    expect((await npc(bi)).bang, '"!" over the head while winding up');
    await stepUntil(`__ppg.npc(${bi}).state === "recover"`, 120, 2);
    f = await fst();
    const p1 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
    const sl = (await ev('__ppg.sfxLog()')).map((e) => e.n);
    log('block', JSON.stringify(f), 'moved', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2), sl.join(','));
    expect(f.hearts === 5 && f.blocks === 1 && f.perfects === 0, `guard: no heart lost (hearts ${f.hearts}, blocks ${f.blocks}, perfects ${f.perfects})`);
    expect(sl.includes('windup') && sl.includes('block') && !sl.includes('hurt'), 'windup + block sfx, no hurt sfx');
    expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.1, 'small push back');
    expect((await npc(bi)).state !== 'stun', 'an ordinary block does not stun');
    // can't punch while guarding
    const m0 = (await st()).money;
    await I.tap('KeyZ'); await step(20);
    expect((await ev('__ppg.P.attackT')) <= 0 && (await st()).money === m0, 'no swing while guarding');
    // walking in guard is slower
    const spd = async () => { const a = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]'); await I.down('KeyS'); await step(30); await I.up('KeyS'); const b = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]'); await step(20); return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    const g1 = await spd();
    await I.up('KeyC'); await step(4);
    const g0 = await spd();
    log('walk 0.5 s guarding', g1.toFixed(2), 'normal', g0.toFixed(2));
    expect(g1 < g0 * 0.65 && g1 > 0.1, `slower walk while guarding (${g1.toFixed(2)} vs ${g0.toFixed(2)} m)`);
    expect(!(await fst()).guard, 'releasing C drops the guard');
  }

  // ---------------------------------------------------------------- B: perfect guard (C pressed in the last 0.25 s) stuns the attacker
  if (parts.includes('b')) {
    await fresh();
    const bi = await idx('boss');
    await hold(bi);
    await face(bi, 1.15);
    const m0 = (await st()).money;
    await ev('__ppg.sfxLog(true)');
    await ev(`__ppg.fight.attack(${bi})`);
    // wait until ~0.12 s before the swing lands (wind-up 0.9 s + 0.08 s), then press C
    await stepUntil(`__ppg.npc(${bi}).t >= 0.84`, 120, 1);
    await I.down('KeyC');
    await stepUntil(`__ppg.npc(${bi}).state === "stun"`, 60, 1);
    await step(6);
    const f = await fst(), n = await npc(bi), s = await st();
    const sl = (await ev('__ppg.sfxLog()')).map((e) => e.n);
    log('perfect', JSON.stringify(f), n.state, n.anim, s.money - m0, s.combo);
    expect(f.perfects === 1 && f.hearts === 5, `perfect guard counted (perfects ${f.perfects}, hearts ${f.hearts})`);
    expect(n.state === 'stun' && n.stars, `attacker dizzy with stars (${n.state}, stars ${n.stars})`);
    expect(s.money - m0 >= 5000 && sl.includes('perfect'), `"딱!" bonus +${s.money - m0} and perfect sfx`);
    await I.up('KeyC');
    await ev('__ppg.look(__ppg.P.yaw + 0.5, 0.3)'); await step(2);
    await shot('fb-0-stunned');
    // stunned ≈ 1.5 s: free hits
    let t = 0; while ((await npc(bi)).state === 'stun' && t < 200) { await step(5); t += 5; }
    log('stun lasted', ((t + 8) / 60).toFixed(2), 's');
    expect(t / 60 > 1.1 && t / 60 < 1.8, `stun lasts ~1.5 s (${((t + 8) / 60).toFixed(2)} s)`);
  }

  // ---------------------------------------------------------------- C: an unguarded hit costs exactly one heart + ~1 s invulnerability
  if (parts.includes('c')) {
    await fresh();
    const bi = await idx('boss');
    await hold(bi);
    await face(bi, 1.15);
    await ev('__ppg.sfxLog(true)');
    await ev(`__ppg.fight.attack(${bi})`);
    await stepUntil('__ppg.fight.state().hitsTaken > 0', 120, 2);
    let f = await fst();
    await shot('fc-0-hit');
    expect(f.hearts === 4 && f.invuln > 0.7, `one heart lost (hearts ${f.hearts}), invulnerable ${f.invuln}s`);
    const again = await ev(`__ppg.fight.hitPlayer(${bi})`);
    f = await fst();
    expect(again === 'none' && f.hearts === 4, `a second blow during invulnerability does nothing (${again}, hearts ${f.hearts})`);
    expect((await ev('__ppg.sfxLog()')).some((e) => e.n === 'hurt'), 'hurt sfx');
    expect(!(await ev('document.getElementById("hearts").hidden')) && (await ev('document.querySelectorAll("#hearts i.on").length')) === 4, 'HUD shows 4 hearts');
    await step(70);
    f = await fst();
    expect(f.invuln === 0, 'invulnerability ends after ~1 s');
    expect((await ev('__ppg.P.char.group.visible')) === true, 'player visible again after the blink');
    // combo broken by the hit
    expect((await st()).combo === 0, 'combo reset');
    // hearts refill when left alone
    await ev(`__ppg.tp(0, 0)`);
    await step(60 * 7);
    f = await fst();
    expect(f.hearts === 5, `기력 refills after a few quiet seconds (${f.hearts})`);
  }

  // ---------------------------------------------------------------- D: hearts at 0 → flop ~2 s → up with full hearts (no game over)
  if (parts.includes('d')) {
    await fresh();
    const bi = await idx('boss');
    await hold(bi);
    await face(bi, 1.15);
    await ev('__ppg.fight.hearts(1)');
    const tl = (await st()).scene;
    await ev(`__ppg.fight.attack(${bi})`);
    await stepUntil('__ppg.fight.state().down', 120, 2);
    let f = await fst();
    const anim = await ev('__ppg.P.char.anim');
    await step(20);
    await ev('__ppg.look(__ppg.P.yaw + 1.2, 0.55)'); await step(2);
    await shot('fd-0-flop');
    const bub = await ev('[...document.querySelectorAll("#world .bubble")].filter((b) => !b.hidden).map((b) => b.textContent)');
    log('flop', JSON.stringify(f), anim, JSON.stringify(bub));
    expect(f.down && f.hearts === 0 && anim === 'ko', `flops over at 0 hearts (${anim})`);
    expect(bub.includes('아이고…'), 'bubble 아이고…');
    // no moving / punching while down
    const p0 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
    await I.down('KeyW'); await step(20); await I.up('KeyW'); await I.tap('KeyZ'); await step(4);
    const p1 = await ev('[__ppg.P.pos.x, __ppg.P.pos.z]');
    expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 0.05 && (await ev('__ppg.P.attackT')) <= 0, 'cannot move or swing while flat');
    const t0 = await ev('__ppg.G.rtime');
    await stepUntil('!__ppg.fight.state().down && !__ppg.fight.state().gettingUp', 400, 5);
    const t1 = await ev('__ppg.G.rtime');
    f = await fst();
    const s = await st();
    log('up after', (t1 - t0 + 0.4).toFixed(2), 's', JSON.stringify(f));
    expect(f.hearts === 5 && (t1 - t0) > 1.8 && (t1 - t0) < 3.4, `back up with full 기력 after ~${(t1 - t0 + 0.4).toFixed(1)} s`);
    expect(s.scene === 'free' && tl === 'free', 'no game over');
    await shot('fd-1-up');
  }

  // ---------------------------------------------------------------- E: a punch-masher (Z + W only, never guarding) beats the mid-boss and the boss
  // (+ the same with C pressed when a "!" is about to land, and 회식 B1 where the boss and the mid-boss come together)
  if (parts.includes('e')) {
    const runs = +(process.env.RUNS || 4);
    const res = {};
    // fight until every target is KO'd (nearest first); guard = press C in the last ~0.2 s of a nearby wind-up
    const fightRun = async (floor, ranks, guard) => {
      await fresh(floor);
      const T = [];
      for (const r of ranks) T.push(await idx(r));
      await face(T[0], 3.2);
      let frames = 0, cDown = false;
      while (frames < 60 * 60) {
        const live = [];
        for (const i of T) { const n = await npc(i); if (!n.ko && !n.beaten) live.push(i); }
        if (!live.length) break;
        let ti = live[0], bd = 1e9;
        for (const i of live) { const d = await ev(`__ppg.G.S.npcs[${i}].pos.distanceTo(__ppg.P.pos)`); if (d < bd) { bd = d; ti = i; } }
        if (guard) {
          const danger = await ev(`__ppg.G.S.npcs.some((n) => n.fighter && ((n.state === 'windup' && n.atk !== 'throw' && n.t > __ppg.fight.tune().RANK[n.fighter.rank].windup - 0.2) || (n.state === 'swing' && n.t < 0.2)) && n.pos.distanceTo(__ppg.P.pos) < 2.6)`);
          if (danger && !cDown) { await I.down('KeyC'); cDown = true; }
          if (cDown) { await step(6); frames += 6; if (!danger) { await I.up('KeyC'); cDown = false; } continue; }
        }
        const d = await aimAt(ti);
        if (d > 1.35) { await I.down('KeyW'); await step(6); await I.up('KeyW'); frames += 6; }
        else { await I.tap('KeyZ'); await step(10); frames += 10; }
      }
      if (cDown) await I.up('KeyC');
      let won = true;
      for (const i of T) { const n = await npc(i); if (!(n.ko || n.beaten)) won = false; }
      const f = await fst();
      return { won, sec: +(frames / 60).toFixed(1), heartsLost: f.hitsTaken, flops: f.flops, perfects: f.perfects, blocks: f.blocks };
    };
    const plan = [['mid', 'office', ['mid'], false, runs], ['boss', 'office', ['boss'], false, runs], ['boss+guard', 'office', ['boss'], true, Math.max(2, runs >> 1)], ['pub boss+mid', 'pub', ['boss', 'mid'], false, Math.max(2, runs >> 1)]];
    for (const [k, floor, ranks, guard, n] of plan) {
      res[k] = [];
      for (let r = 0; r < n; r++) {
        res[k].push(await fightRun(floor, ranks, guard));
        log(k, 'run', r, JSON.stringify(res[k][r]));
        if (r === 0 && k === 'boss') await shot('fe-boss-mash');
        if (r === 0 && k === 'pub boss+mid') await shot('fe-pub-mash');
      }
    }
    const sum = Object.fromEntries(Object.entries(res).map(([k, L]) => [k, { win: L.filter((x) => x.won).length / L.length, sec: +(L.reduce((a, x) => a + x.sec, 0) / L.length).toFixed(1), heartsLost: +(L.reduce((a, x) => a + x.heartsLost, 0) / L.length).toFixed(2), flops: +(L.reduce((a, x) => a + x.flops, 0) / L.length).toFixed(2), perfects: +(L.reduce((a, x) => a + x.perfects, 0) / L.length).toFixed(2) }]));
    log('MASH', JSON.stringify(sum));
    expect(sum.mid.win >= 0.75 && sum.boss.win >= 0.75 && sum['pub boss+mid'].win >= 0.5, `mash-only wins: mid ${sum.mid.win * 100}% boss ${sum.boss.win * 100}% pub both ${sum['pub boss+mid'].win * 100}%`);
    expect(sum['boss+guard'].heartsLost <= sum.boss.heartsLost, `guarding costs fewer hearts (${sum['boss+guard'].heartsLost} vs ${sum.boss.heartsLost})`);
  }

  // ---------------------------------------------------------------- F: never more than two attacking at once (six fighters around)
  if (parts.includes('f')) {
    await fresh();
    await ev('__ppg.tp(-2.3, -1.95)');
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047;
      const i = await ev(`__ppg.spawnNpc(${-2.3 + Math.cos(a) * 2.2}, ${-1.95 + Math.sin(a) * 2.2}, { rotY: ${a} })`);
      await ev(`__ppg.fight.make(${i}, "mid")`);
    }
    await ev('__ppg.fight.resetMax()');
    let maxA = 0, samples = 0;
    for (let k = 0; k < 120; k++) { await step(5); const f = await fst(); maxA = Math.max(maxA, f.attackers); samples++; if (k === 30) await shot('ff-crowd'); }
    const f = await fst();
    log('crowd', JSON.stringify(f), 'max sampled', maxA);
    expect(f.maxAttackers <= 2 && f.maxAttackers >= 1, `at most 2 attackers at once (max ${f.maxAttackers}, sampled ${maxA})`);
    expect(f.hitsTaken >= 1, 'they did attack');
  }

  // ---------------------------------------------------------------- G: non-fighters still flee; the hot-head snaps
  if (parts.includes('g')) {
    await fresh();
    const wi = await ev('__ppg.G.S.npcs.findIndex((n) => n.role === "worker" && !n.fighter && !n.hothead && !n.seated && !n.gone)');
    const hi = await ev('__ppg.G.S.npcs.findIndex((n) => n.hothead)');
    log('worker', wi, 'hothead', hi);
    if (wi >= 0) {
      await arena(wi);
      await I.tap('KeyZ'); await step(70);
      const n = await npc(wi);
      expect(!n.fighter && ['flee', 'cower', 'leave', 'dizzy', 'stumble', 'down'].includes(n.state), `an ordinary coworker flees (${n.state})`);
    }
    if (hi >= 0) {
      await ev(`(() => { const n = __ppg.G.S.npcs[${hi}]; n.standUp(true); return true; })()`);
      await arena(hi);
      await I.tap('KeyZ'); await step(8);
      const b = (await npc(hi)).bubble;
      await step(60);
      const n = await npc(hi);
      log('hothead', JSON.stringify({ state: n.state, fighter: n.fighter, b }));
      expect(n.fighter === 'angry' && b === '참을 만큼 참았어요!', `the hot-head snaps: "${b}" → ${n.fighter} (${n.state})`);
    }
  }

  // ---------------------------------------------------------------- H: the boss's slipper: side-step it, or take it; guard blocks it
  if (parts.includes('h')) {
    await fresh();
    const bi = await idx('boss');
    await hold(bi);
    // the open aisle: boss at x −6.5, player 5 m east of him
    const place = async () => { await ev(`(() => { const n = __ppg.G.S.npcs[${bi}]; n.state = 'fight'; n.t = 0; n.path = null; n.pos.set(-6.5, 0, -1.95); n.yaw = Math.PI / 2; n.place(); __ppg.tp(-1.5, -1.95); __ppg.yaw(-Math.PI / 2); return true; })()`); await step(2); };
    const face = async () => place();
    await place();
    await ev(`__ppg.fight.attack(${bi}, "throw")`);
    await stepUntil('__ppg.fight.state().shots > 0', 90, 2);
    await step(8);
    await ev('__ppg.look(__ppg.P.yaw + 1.3, 0.25)'); await step(1);
    await shot('fh-0-slipper');
    await ev(`__ppg.yaw(__ppg.P.yaw)`);
    // side-step: hold D (strafe)
    await I.down('KeyD'); await step(40); await I.up('KeyD'); await step(40);
    let f = await fst();
    expect(f.hitsTaken === 0, `side-stepped the slipper (hits ${f.hitsTaken})`);
    // stand still: it lands
    await face();
    await ev(`__ppg.fight.attack(${bi}, "throw")`); await step(130);
    f = await fst();
    expect(f.hitsTaken === 1 && f.hearts === 4, `standing still the slipper hits (hearts ${f.hearts})`);
    await step(80);
    // guard (held early) blocks it
    await face();
    await I.down('KeyC'); await step(20);
    await ev(`__ppg.fight.attack(${bi}, "throw")`); await step(130);
    await I.up('KeyC');
    f = await fst();
    expect(f.blocks >= 1 && f.hitsTaken === 1, `guard blocks the slipper (blocks ${f.blocks})`);
  }

  // ---------------------------------------------------------------- T: phone: 막기 button placement + real touch; the name panel on a phone
  if (parts.includes('t')) {
    const tag = W > H ? 'land' : 'port';
    const tapAt = async (x, y, id = 9) => { await I.touch('touchStart', [{ x, y, id }]); await I.touch('touchEnd', []); };
    const nb = await I.rect('#t-names');
    expect(!!nb, '이름 정하기 visible on the phone title');
    if (nb) {
      await tapAt(nb.x, nb.y); await sleep(250);
      const card = await I.rect('.n-card');
      const ok = card && card.l >= 0 && card.t >= 0 && card.l + card.w <= W + 0.5 && card.t + card.h <= H + 0.5;
      expect(ok, 'name panel fits the screen ' + JSON.stringify(card));
      const btns = await ev('[...document.querySelectorAll(".n-btns .btn")].map((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.height >= 36; })');
      expect(btns.every(Boolean), 'panel buttons on screen and tappable ' + JSON.stringify(btns));
      await shot(`ft-${tag}-0-names`);
      const cl = await I.rect('#n-close'); await tapAt(cl.x, cl.y); await sleep(200);
    }
    await shot(`ft-${tag}-1-title`);
    const rb = await I.rect('#title [data-mode="rush"]');
    await tapAt(rb.x, rb.y);
    await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy; })()', 20000);
    await step(5);
    const bi = await idx('boss');
    await hold(bi);
    await face(bi, 1.15);
    await ev(`__ppg.fight.attack(${bi})`); await stepUntil('__ppg.fight.state().hitsTaken > 0', 120, 2); // a hit: the hearts show up
    await step(70);
    const ov = await ev(`(() => {
      const R = (e) => e.getBoundingClientRect();
      const pads = [...document.querySelectorAll('#tbtns .tbtn'), document.getElementById('joy-base')].map(e => [e.className || e.id, R(e)]);
      const hud = ['#mission', '#tasks', '#stress', '#hearts', '#timer', '#money', '#btn-pause', '#combo'].map(s => document.querySelector(s)).filter(e => e && !e.hidden && e.getBoundingClientRect().width).map(e => [e.id, R(e)]);
      const hit = (p, h) => p.left < h.right && p.right > h.left && p.top < h.bottom && p.bottom > h.top;
      const hits = [];
      for (const [a, p] of pads) for (const [b, h] of hud) if (hit(p, h)) hits.push(a + '×' + b);
      for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) if ((/t-guard/.test(pads[i][0]) || /t-guard/.test(pads[j][0])) && hit(pads[i][1], pads[j][1])) hits.push(pads[i][0] + '×' + pads[j][0]);
      const off = pads.filter(([a, p]) => p.left < 0 || p.top < 0 || p.right > innerWidth || p.bottom > innerHeight).map(([a]) => a);
      const hh = [...hud].filter(([a]) => a === 'hearts').map(([a, h]) => h)[0];
      const hudHits = [];
      for (const [a, p] of hud) for (const [b, h] of hud) if (a < b && hit(p, h)) hudHits.push(a + '×' + b);
      return { hits, off, hudHits, hearts: hh ? { l: hh.left, t: hh.top, w: hh.width, h: hh.height } : null };
    })()`);
    log('touch layout', JSON.stringify(ov));
    expect(!ov.hits.length && !ov.off.length && !ov.hudHits.length && ov.hearts, '막기 button / hearts: no overlap, on screen ' + JSON.stringify(ov));
    const gb = await I.rect('.t-guard');
    expect(gb && gb.w >= 40, '막기 button big enough ' + JSON.stringify(gb));
    await face(bi, 1.15);
    await I.touch('touchStart', [{ x: gb.x, y: gb.y, id: 4 }]);
    await step(20);
    let f = await fst();
    const anim = await ev('__ppg.P.char.anim');
    expect(f.guard && anim === 'guard', `holding 막기 guards (pose ${anim})`);
    await shot(`ft-${tag}-2-guard`);
    const b0 = f.blocks;
    await ev(`__ppg.fight.attack(${bi})`); await stepUntil(`__ppg.npc(${bi}).state === "recover"`, 120, 2);
    f = await fst();
    expect(f.blocks === b0 + 1 && f.hearts >= 4, `blocked with the touch guard (blocks ${f.blocks})`);
    await I.touch('touchEnd', []);
    await step(4);
    expect(!(await fst()).guard, 'lifting the finger drops the guard');
    await shot(`ft-${tag}-3-play`);
  }

  const errs = await ev('__ppg.errors');
  expect(!errs.length, '__ppg.errors empty ' + JSON.stringify(errs).slice(0, 300));
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
