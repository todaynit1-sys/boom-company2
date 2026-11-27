// 회사 뿌개기 — 난이도 (쉬움 · 보통 · 어려움). 저장: localStorage 'ppg-diff', 기본 '보통'.
// 싸움이 시작될 때(판 시작 · 층 만들기 · 난동 시작) fight.js 가 D() 를 읽어 맞춘다 — 싸움 도중에는 바뀌지 않는다.
//
//   import { DIFFS, getDiff, setDiff, D } from './diff.js';
//   DIFFS            — 메뉴용 목록 [{ id, n, sub }]
//   getDiff()        — 'easy' | 'normal' | 'hard'
//   setDiff(id)      — 저장 + window 'ppg-diff' 이벤트 (detail: { id })
//   D()              — 지금 난이도의 값 묶음 (아래 SET)
//
// D() 값 뜻
//   hp           주인공 최대 체력 (게이지 숫자)
//   dmgMul       맞을 때 깎이는 체력 배수 (기본 피해: 보스 36 · 중간보스 20 · 욱한 직원 15)
//   chip         그냥 막기(딱! 아님)로 막아도 들어오는 피해 비율 (0 = 안 깎임)
//   enemyHpMul   보스 · 중간보스 멘탈 배수
//   speedMul     적 걷는 속도 배수
//   windupMul    "!" 예고 길이 배수 (작을수록 빨리 휘두른다)
//   paceMul      헐떡이는 시간 · 다음 공격까지 쉬는 시간 배수 (작을수록 몰아친다)
//   comboAdd     연타(한 번 더!) 확률에 더하는 값
//   maxAttackers 동시에 덤비는 사람 수
//   invuln       맞은 뒤 깜박이며 안 맞는 시간(초)
//   regen        true / false — 가만히 있으면 체력이 차는지
//   regenDelay   마지막으로 맞은 뒤 차기 시작할 때까지(초)
//   regenRate    초당 차는 체력
//   perfect      딱!(완벽 막기) 판정 시간(초) — 막기를 이 안에 올리면 딱!
//   stun         딱! 맞은 상대가 어지러운 시간(초)
//   armorBoss / armorMid  주먹 몇 대마다 한 번 휘청하는지 (1 = 매번)
//   koRule       'getup' = 쓰러졌다 일어남(지금처럼) · 'retry' = 이 판 실패, 다시 하기 (main.js 가 처리)
//   moneyMul     어려울수록 더 주는 보상 배수 (딱! 보너스는 fight.js 가 이미 곱한다)
//   angryMul     층마다 욱해서 덤비는 평직원 수 배수 (보통 = 1명)
//   aggro        이 거리 안에 들어오면 덤빈다(m)
export const DIFFS = [
  { id: 'easy', n: '쉬움', sub: '천천히 · 체력 넉넉' },
  { id: 'normal', n: '보통', sub: '맞으면 쓰러졌다 일어남' },
  { id: 'hard', n: '어려움', sub: '졸라 어려움 · 쓰러지면 다시' },
];

const SET = {
  easy: {
    id: 'easy', n: '쉬움', hp: 150, dmgMul: 0.6, chip: 0, enemyHpMul: 0.7, speedMul: 0.8, windupMul: 1.35, paceMul: 1.5, comboAdd: -1,
    maxAttackers: 1, invuln: 0.9, regen: true, regenDelay: 3, regenRate: 18, perfect: 0.32, stun: 2.0, armorBoss: 2, armorMid: 1,
    koRule: 'getup', moneyMul: 1, angryMul: 0.5, aggro: 3.0,
  },
  normal: {
    id: 'normal', n: '보통', hp: 100, dmgMul: 1, chip: 0, enemyHpMul: 1, speedMul: 1, windupMul: 1, paceMul: 1, comboAdd: 0,
    maxAttackers: 2, invuln: 0.6, regen: true, regenDelay: 6, regenRate: 7, perfect: 0.25, stun: 1.5, armorBoss: 3, armorMid: 2,
    koRule: 'getup', moneyMul: 1, angryMul: 1, aggro: 3.4,
  },
  hard: {
    id: 'hard', n: '어려움', hp: 100, dmgMul: 1.55, chip: 0.3, enemyHpMul: 1.9, speedMul: 1.22, windupMul: 0.72, paceMul: 0.6, comboAdd: 0.3,
    maxAttackers: 3, invuln: 0.4, regen: true, regenDelay: 12, regenRate: 1.5, perfect: 0.25, stun: 2.2, armorBoss: 5, armorMid: 3,
    koRule: 'retry', moneyMul: 1.6, angryMul: 3, aggro: 4.4,
  },
};

const KEY = 'ppg-diff';
let cur = null;
function load() {
  try { const v = localStorage.getItem(KEY); if (v && SET[v]) return v; } catch (e) { /* 저장 못 읽음: 기본값 */ }
  return 'normal';
}
export function getDiff() { if (!cur) cur = load(); return cur; }
export function setDiff(id) {
  if (!SET[id]) return getDiff();
  cur = id;
  try { localStorage.setItem(KEY, id); } catch (e) { /* 저장 못 함: 이번 판만 */ }
  try { window.dispatchEvent(new CustomEvent('ppg-diff', { detail: { id } })); } catch (e) { /* 무시 */ }
  return id;
}
export function D() { return SET[getDiff()]; }
// 다른 난이도 값 보기 (시험 · 메뉴 설명용)
export function diffOf(id) { return SET[id] || SET.normal; }
