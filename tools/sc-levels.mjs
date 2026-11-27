// 레벨 · 난이도 · 1분 난동(일반 · 보스전) — 첫 화면은 진짜 마우스 클릭, 판 진행은 __ppg 로 빨리.
//  1) 예전 저장(best · days · storyLen)으로 시작해도 첫 화면이 멀쩡한지
//  2) 난이도 칩 (쉬움 · 보통 · 어려움): 누르면 'ppg-diff' 저장, 다시 열어도 그대로
//  3) 출근하기 → 레벨 선택 (1만 열림, 2~8 잠김) → 레벨 1 시작 카드 → 상황 → 난동 → 결과(별) → 다음 레벨
//  4) 레벨 2 그만두기 = 조퇴 처리 (별 없음, 안 깸)
//  5) 어려움: 난동 중 쓰러지면 '퇴사 처리' (다시 도전 / 레벨 선택)
//  6) 1분 난동 · 보스전: 보스 · 중간보스 목표, 격파 보너스, 기록은 일반과 따로
import { makeInput } from './inp.mjs';
export default async ({ ev, shot, log, sleep, send, step }) => {
  const I = makeInput({ send, ev, sleep });
  const fails = [];
  const expect = (c, msg) => { if (!c) { fails.push(msg); log('FAIL', msg); } else log('ok', msg); };
  const st = () => ev('__ppg.state()');
  const titleUp = '!document.getElementById("title").hidden && document.getElementById("boot").hidden';

  // ---------------------------------------------------------------- 1. 예전 저장
  await I.waitFor(titleUp, 20000);
  await ev(`localStorage.setItem('ppg.save', JSON.stringify({ best: { rush: 123000, story: 'x' }, days: 3 })); localStorage.setItem('ppg.settings', JSON.stringify({ sfx: true, bgm: true, vibe: true, calm: false, gender: 'm', storyLen: 'long' })); localStorage.removeItem('ppg-diff'); true`);
  await send('Page.reload', {});
  await sleep(600);
  await I.waitFor('!!window.__ppg && ' + titleUp, 25000);
  let t = await ev(`({ best: document.getElementById('t-best').textContent, boss: document.getElementById('t-best-boss').textContent, sub: document.getElementById('t-lv-sub').textContent,
    chips: [...document.querySelectorAll('#t-diff .dchip')].map(b => b.dataset.diff + ':' + b.getAttribute('aria-checked') + ':' + b.querySelector('small').textContent), lenRow: !!document.getElementById('t-len'), errors: __ppg.errors.length })`);
  log('title', JSON.stringify(t));
  expect(t.best.includes('123,000') && t.boss === '기록 없음', 'old save: 일반 best kept, 보스전 empty ' + t.best + ' / ' + t.boss);
  expect(!t.lenRow, '짧게 · 길게 row is gone');
  expect(t.chips.length === 3 && t.chips[1].startsWith('normal:true') && t.chips.every((c) => c.split(':')[2].length > 0), 'three difficulty chips with sub text, 보통 picked ' + JSON.stringify(t.chips));
  expect(t.errors === 0, 'no errors after loading an old save');
  await shot('lv-0-title');

  // ---------------------------------------------------------------- 2. 난이도
  await I.clickSel('#t-diff [data-diff="easy"]');
  await sleep(150);
  let d = await ev(`({ saved: localStorage.getItem('ppg-diff'), now: __ppg.diff().id, checked: document.querySelector('#t-diff [data-diff="easy"]').getAttribute('aria-checked') })`);
  expect(d.saved === 'easy' && d.now === 'easy' && d.checked === 'true', '쉬움 click saves ' + JSON.stringify(d));
  await I.clickSel('#t-diff [data-diff="normal"]');
  await sleep(100);

  // ---------------------------------------------------------------- 3. 레벨 선택 → 레벨 1
  await I.clickSel('#t-story');
  await I.waitFor('!document.getElementById("levels").hidden', 5000);
  let lv = await ev(`[...document.querySelectorAll('#lv-grid .lv-card')].map(b => ({ n: +b.dataset.lv, locked: b.classList.contains('locked'), t: b.querySelector('.lv-tx b').textContent }))`);
  log('levels', JSON.stringify(lv));
  expect(lv.length === 8 && !lv[0].locked && lv.slice(1).every((x) => x.locked), 'level select: 8 levels, only 1 open');
  expect(lv[0].t === '복합기 용지 걸림' && lv[7].t === '퇴근 5분 전', 'levels follow the day (first copier, last 퇴근 5분 전)');
  await shot('lv-1-select');
  await I.clickSel('#lv-grid .lv-card[data-lv="2"]');
  await sleep(200);
  expect((await st()).mode === 'title', 'a locked level does not start');
  await I.clickSel('#lv-grid .lv-card[data-lv="1"]');
  const card = await I.waitFor('(() => { const f = document.getElementById("fade"); return !f.hidden && +getComputedStyle(f).opacity > 0.8 && document.getElementById("f-lv").textContent ? { lv: document.getElementById("f-lv").textContent, title: document.getElementById("f-title").textContent, goal: document.getElementById("f-goal").textContent } : null; })()', 10000);
  log('card', JSON.stringify(card));
  expect(card.lv === '레벨 1 · 7층 · 보통' && card.title === '복합기 용지 걸림' && card.goal.includes('목표'), 'level intro card ' + card.lv);
  await shot('lv-2-card');
  let s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "copier" && !s.busy ? s : null; })()', 20000);
  expect(s.mode === 'story', 'level 1 = copier situation');
  // 상황 건너뛰기 → 끓어오름 → 난동
  await ev('__ppg.skip()');
  for (let i = 0; i < 40 && s.scene !== 'rampage'; i++) s = await step(15, 15);
  expect(s.scene === 'rampage' && s.timeLeft > 55, 'after the situation: rage → 1-minute rampage (' + s.scene + ')');
  const mt = await ev('document.getElementById("m-title").textContent');
  expect(mt === '레벨 1 · 1분 난동', 'HUD title ' + mt);
  const fighters = s.fighters || [];
  expect(!fighters.some((f) => f.rank === 'boss' || f.rank === 'mid'), 'level 1: 보스 · 중간보스 stay out ' + JSON.stringify(fighters));
  await ev('__ppg.auto(true)');
  s = await step(240, 40);
  await shot('lv-3-rampage');
  await ev('__ppg.G.timeLeft = 0.2; true');
  for (let i = 0; i < 30 && s.scene !== 'bill'; i++) s = await step(20, 20);
  s = await step(60, 30);
  await ev('__ppg.auto(false)');
  let bill = await ev(`({ h: document.getElementById('r-h').textContent, stars: [...document.querySelectorAll('#r-stars .rs')].map(e => e.classList.contains('on')), next: !document.getElementById('b-next').hidden && document.getElementById('b-next').textContent, levels: !document.getElementById('b-levels').hidden, meta: document.getElementById('r-meta').textContent, lb: __ppg.state().bill.level })`);
  log('bill', JSON.stringify(bill));
  expect(s.scene === 'bill' && bill.h === '피해 청구서' && bill.stars.length === 3 && bill.stars[0], 'result: bill with stars, ★ clear');
  expect(bill.next && bill.next.includes('레벨 2'), 'result: 다음 레벨 (레벨 2 열림) ' + bill.next);
  let L = await ev('__ppg.levels()');
  expect(L.rows[0].clear && L.rows[0].stars >= 1 && L.rows[1].open && !L.rows[2].open, 'progress saved: 1 cleared, 2 open, 3 locked');
  const saved = await ev('JSON.parse(localStorage.getItem("ppg.save")).lv');
  expect(saved && saved[1] && saved[1].clear, 'progress in localStorage ' + JSON.stringify(saved));
  await shot('lv-4-result');

  // ---------------------------------------------------------------- 4. 다음 레벨 → 그만두기
  await I.clickSel('#b-next');
  s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "execReport" && !s.busy ? s : null; })()', 25000);
  expect(true, '다음 레벨 starts level 2 (임원 보고)');
  await I.tap('Escape'); await sleep(150);
  const pq = await ev('document.getElementById("p-quit").textContent');
  expect(pq.includes('조퇴'), 'pause: quit says 조퇴 ' + pq);
  await I.clickSel('#p-quit');
  await step(40, 20); // (청구서는 게임 시계로 0.3초 뒤)
  await I.waitFor('!document.getElementById("bill").hidden', 8000);
  bill = await ev(`({ h: document.getElementById('r-h').textContent, next: !document.getElementById('b-next').hidden, retry: document.getElementById('b-retry').textContent, stamp: document.getElementById('r-rank').textContent })`);
  expect(bill.h === '조퇴 처리 통지서' && !bill.next && bill.retry === '다시 도전', 'quit = 조퇴 처리, no next ' + JSON.stringify(bill));
  L = await ev('__ppg.levels()');
  expect(!L.rows[1].clear && !L.rows[2].open, 'quitting does not clear level 2');
  await shot('lv-5-quit');

  // ---------------------------------------------------------------- 5. 어려움: 쓰러지면 퇴사 처리
  await ev('__ppg.diff("hard")');
  await ev('__ppg.level(1)'); s = await step(5);
  await ev('__ppg.skip()');
  for (let i = 0; i < 40 && s.scene !== 'rampage'; i++) s = await step(15, 15);
  expect(s.scene === 'rampage' && (await ev('__ppg.koRule()')) === 'retry', 'hard level 1 rampage, koRule retry');
  for (let i = 0; i < 40 && !(await ev('__ppg.G.failed')); i++) { await ev('__ppg.fight.hitPlayer()'); await step(45, 45); }
  expect((await ev('__ppg.G.failed')) === 'ko', 'KO on 어려움 fails the level');
  await shot('lv-6-ko');
  for (let i = 0; i < 20 && s.scene !== 'bill'; i++) s = await step(20, 20);
  s = await step(40, 20); await sleep(900); // (영수증 인쇄 애니메이션)
  bill = await ev(`({ h: document.getElementById('r-h').textContent, retry: document.getElementById('b-retry').textContent, levels: !document.getElementById('b-levels').hidden, stars: [...document.querySelectorAll('#r-stars .rs.on')].length, stamp: document.getElementById('r-rank').textContent })`);
  expect(bill.h === '퇴사 처리 통지서' && bill.retry === '다시 도전' && bill.levels && bill.stars === 0 && bill.stamp === '퇴사 처리', 'KO result: 퇴사 처리 + 다시 도전 / 레벨 선택 ' + JSON.stringify(bill));
  await shot('lv-7-fail');
  await I.clickSel('#b-retry');
  s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "copier" && !s.busy ? s : null; })()', 25000);
  expect(true, '다시 도전 restarts level 1');
  await ev('__ppg.diff("normal")');

  // ---------------------------------------------------------------- 6. 보스전
  await I.tap('Escape'); await sleep(150);
  await I.clickSel('#p-title');
  await I.waitFor(titleUp, 8000);
  await I.clickSel('#title [data-mode="boss"]');
  s = await I.waitFor('(() => { const s = __ppg.state(); return s.scene === "rampage" && !s.busy && document.getElementById("fade").hidden ? s : null; })()', 25000);
  const bt = await ev('({ m: document.getElementById("m-title").textContent, tasks: document.getElementById("tasks").textContent })');
  log('boss', JSON.stringify(bt), JSON.stringify(s.fighters));
  expect(s.mode === 'boss' && bt.m === '1분 보스전', 'boss mode starts (' + bt.m + ')');
  expect(/쓰러뜨리기/.test(bt.tasks), 'boss + mid-boss goals shown first: ' + bt.tasks);
  s = await step(90, 30);
  await shot('lv-8-boss');
  await ev('__ppg.hitNpc("boss", "kick", 1)');
  s = await step(200, 40); // (날아가서 바닥에 닿을 때 보너스)
  const items = await ev('[...__ppg.G.items.keys()]');
  expect(items.some((k) => k.includes('격파 보너스')), 'boss KO pays the 격파 보너스 ' + JSON.stringify(items));
  await ev('__ppg.G.timeLeft = 0.2; true');
  for (let i = 0; i < 30 && s.scene !== 'bill'; i++) s = await step(20, 20);
  s = await step(60, 30);
  const best = await ev('JSON.parse(localStorage.getItem("ppg.save")).best');
  expect(best.boss > 0 && best.rush === 123000, 'boss record saved apart from 일반 ' + JSON.stringify(best));
  await shot('lv-9-boss-bill');
  await I.clickSel('#b-title');
  await I.waitFor(titleUp, 8000);
  t = await ev(`({ boss: document.getElementById('t-best-boss').textContent, days: document.getElementById('t-days').textContent })`);
  expect(t.boss.startsWith('최고'), 'title shows 보스전 best ' + t.boss + ' · ' + t.days);
  const errs = await ev('__ppg.errors');
  expect(!errs.length, 'no errors ' + JSON.stringify(errs).slice(0, 300));
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join(' | '));
};
