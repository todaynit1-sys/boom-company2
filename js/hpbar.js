// 회사 뿌개기 — 체력 게이지 (주인공 HP). 혼자 돌아간다: 자기 DOM 과 <style> 을 만들고, requestAnimationFrame 으로
// fight.js 의 gauge() 를 매 프레임 읽어 그린다. fight.js 가 createFight() 안에서 initHpBar(gauge) 를 부르므로
// main.js 는 아무것도 부를 필요 없다.
//
//   initHpBar(read)   read() → { show, hp, max, down, out, hitSeq, lastDmg, diff, diffName, paused }
//   updateHpBar(dt)   (선택) 직접 한 프레임 그리기 — rAF 가 멈춘 환경용
//
// 자리: 게임 HUD 의 가운데 위 칸(#hud .hud-tc, 스트레스 막대 아래)에 끼워 들어간다 — 그 칸을 못 찾으면 화면 위
// 가운데에 혼자 뜬다. 휴대폰 조이스틱 · 버튼(아래쪽)은 가리지 않는다.
// 보이는 때: 다칠 수 있는 동안(1분 난동 · 자유 난동 · 이야기 마지막 난동). 첫 화면 · 메뉴 · 영수증에서는 숨김.
// 맞으면: 빨갛게 번쩍 + 흔들림, 깎인 만큼 흰 덩어리가 남았다가 따라 줄어듦, "-31" 숫자가 튀어 오름.
// 25% 아래: 막대가 두근두근. 흔들림 줄이기(.calm)면 번쩍 · 흔들림 · 두근 없음.

const CSS = `
#hpbar { display: flex; align-items: center; gap: .55rem; box-sizing: border-box; height: 2.65rem; padding: 0 .75rem 0 .5rem;
  width: clamp(15rem, 34vw, 34rem); border-radius: .8rem; position: relative; pointer-events: none;
  background: var(--card, rgba(20, 22, 34, .72)); border: 1px solid var(--line, rgba(255, 255, 255, .18));
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); color: #fff; font-weight: 900;
  transition: opacity .25s, border-color .3s, box-shadow .3s; }
#hpbar[hidden] { display: none; }
#hpbar.float { position: fixed; z-index: 21; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 4.4rem); }
#hpbar .hpb-tag { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; gap: .12rem; min-width: 2.7rem; }
#hpbar .hpb-lbl { font-size: 1rem; letter-spacing: .02em; }
#hpbar .hpb-diff { font-size: .66rem; font-weight: 800; padding: .08rem .32rem .1rem; border-radius: .3rem; white-space: nowrap;
  background: rgba(255, 255, 255, .16); color: #dfe6ff; }
#hpbar[data-diff="easy"] .hpb-diff { background: #2fbf87; color: #fff; }
#hpbar[data-diff="hard"] .hpb-diff { background: linear-gradient(180deg, #ff5a63, #c4162f); color: #fff; }
#hpbar .hpb-bar { flex: 1 1 auto; position: relative; height: 1.35rem; border-radius: .45rem; overflow: hidden; min-width: 4rem;
  background: rgba(8, 10, 18, .62); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .85), 0 .12rem 0 rgba(0, 0, 0, .25); }
#hpbar .hpb-bar i { position: absolute; left: 2px; top: 2px; bottom: 2px; border-radius: .32rem; width: 0; }
#hpbar .hpb-lost { background: #fff; opacity: .92; }
#hpbar .hpb-fill { background: linear-gradient(180deg, #7ff0a8, #22c06c 55%, #13985a); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .14), inset 0 2px 0 rgba(255, 255, 255, .4); }
#hpbar.mid .hpb-fill { background: linear-gradient(180deg, #ffe777, #ffb21f 55%, #e8890c); }
#hpbar.low .hpb-fill { background: linear-gradient(180deg, #ff8a8a, #ff3d55 55%, #cc1531); }
#hpbar.down .hpb-fill { background: #9aa0b4; }
#hpbar .hpb-ticks { position: absolute; inset: 2px; border-radius: .32rem; pointer-events: none;
  background: repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), rgba(0, 0, 0, .28) calc(25% - 1px) 25%); }
#hpbar .hpb-num { flex: none; min-width: 2.2em; text-align: right; font-size: 1.45rem; font-variant-numeric: tabular-nums; line-height: 1;
  text-shadow: 0 2px 0 rgba(0, 0, 0, .35); }
#hpbar .hpb-num small { font-size: .62em; opacity: .7; font-weight: 800; }
#hpbar.low .hpb-num { color: #ff8796; }
#hpbar.out .hpb-num { color: #ff5a6a; }
#hpbar .hpb-dmg { position: absolute; right: .6rem; top: -.2rem; font-size: 1.2rem; font-weight: 900; color: #ff4d64; opacity: 0;
  text-shadow: 0 2px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff; font-variant-numeric: tabular-nums; }
#hpbar.low { border-color: rgba(255, 90, 106, .8); }
#hpbar.low:not(.down) .hpb-fill { animation: hpb-beat .8s ease-in-out infinite; }
#hpbar.low:not(.down) { animation: hpb-glow .8s ease-in-out infinite; }
@keyframes hpb-beat { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.55); } }
@keyframes hpb-glow { 0%, 100% { box-shadow: 0 0 0 rgba(255, 60, 80, 0); } 50% { box-shadow: 0 0 .9rem rgba(255, 60, 80, .85); } }
.calm #hpbar, .calm #hpbar .hpb-fill { animation: none !important; }
@media (max-aspect-ratio: 4/5) {
  #hpbar { width: auto; min-width: 0; height: 2.75rem; padding: 0 .6rem 0 .4rem; gap: .4rem; }
  #hpbar .hpb-bar { height: 1.45rem; }
  #hpbar .hpb-lbl { font-size: 1.05rem; }
  #hpbar .hpb-diff { font-size: .74rem; }
  #hpbar .hpb-num { font-size: 1.45rem; }
  #hpbar .hpb-num small { display: none; }
  #hpbar.float { width: min(22rem, calc(100vw - 2rem)); }
}
@media (max-height: 520px) and (min-aspect-ratio: 4/5) {
  #hpbar { height: 2.45rem; }
  #hpbar .hpb-bar { height: 1.25rem; }
  #hpbar .hpb-diff { font-size: .72rem; }
  #hpbar .hpb-num { font-size: 1.35rem; }
}
`;

let read = null, el = null, fillEl, lostEl, numEl, dmgEl, diffEl, raf = 0, lastT = 0, mountN = 0;
// what is drawn (fractions 0..1)
const V = { fill: 1, lost: 1, hold: 0, seq: -1, shown: false, cls: '', num: '', diff: '' };

function build() {
  if (!document.getElementById('hpbar-css')) {
    const st = document.createElement('style'); st.id = 'hpbar-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  el = document.createElement('div');
  el.id = 'hpbar'; el.hidden = true;
  el.setAttribute('role', 'meter'); el.setAttribute('aria-label', '체력'); el.setAttribute('aria-valuemin', '0');
  el.innerHTML = '<span class="hpb-tag"><span class="hpb-lbl">체력</span><span class="hpb-diff"></span></span>' +
    '<span class="hpb-bar"><i class="hpb-lost"></i><i class="hpb-fill"></i><span class="hpb-ticks"></span></span>' +
    '<b class="hpb-num"></b><span class="hpb-dmg"></span>';
  fillEl = el.querySelector('.hpb-fill'); lostEl = el.querySelector('.hpb-lost');
  numEl = el.querySelector('.hpb-num'); dmgEl = el.querySelector('.hpb-dmg'); diffEl = el.querySelector('.hpb-diff');
  mount();
}
// into the HUD's top-centre column, right under the stress bar (where the old hearts row sat); else float
function mount() {
  if (!el) return;
  const tc = document.querySelector('#hud .hud-tc');
  if (tc) {
    if (el.parentNode !== tc) {
      const after = document.getElementById('hearts') || document.getElementById('stress');
      if (after && after.parentNode === tc) tc.insertBefore(el, after.nextSibling); else tc.insertBefore(el, tc.firstChild);
    }
    el.classList.remove('float');
  } else if (!el.parentNode || el.parentNode !== document.body) { document.body.appendChild(el); el.classList.add('float'); }
}
const calm = () => document.documentElement.classList.contains('calm');
function pct(f) { return `calc(${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)}% - ${f > 0 ? 4 : 0}px)`; }

// one frame of the gauge; dt left out = measured from the last call (fight.frame() and our own rAF both call this —
// whichever comes first in a frame draws it, so a throttled rAF (background tab, headless) never leaves it stale)
export function updateHpBar(dt) {
  if (!el || !read) return;
  const now = performance.now();
  if (dt == null) dt = lastT ? Math.min(0.1, Math.max(0, (now - lastT) / 1000)) : 1 / 60;
  lastT = now;
  draw(dt);
}
function draw(dt) {
  if (++mountN % 90 === 0) mount();
  let s = null;
  try { s = read(); } catch (e) { s = null; }
  const show = !!(s && s.show);
  if (show !== V.shown) {
    V.shown = show; el.hidden = !show;
    if (show) { V.fill = V.lost = s.max ? s.hp / s.max : 1; V.seq = s.hitSeq; V.hold = 0; }
  }
  if (!show) return;
  const f = s.max ? Math.max(0, Math.min(1, s.hp / s.max)) : 0;
  // a new blow: flash + shake + "-31"
  if (s.hitSeq !== V.seq) {
    const fresh = V.seq >= 0 && s.hitSeq > V.seq;
    V.seq = s.hitSeq;
    if (fresh) {
      V.hold = 0.45; V.lost = Math.max(V.lost, V.fill);
      if (s.lastDmg > 0) {
        dmgEl.textContent = '-' + Math.round(s.lastDmg);
        if (dmgEl.animate) dmgEl.animate([{ opacity: 1, transform: 'translateY(.2rem) scale(1.35)' }, { opacity: 1, transform: 'translateY(-.9rem) scale(1)', offset: 0.35 }, { opacity: 0, transform: 'translateY(-1.6rem) scale(.9)' }], { duration: 750, easing: 'ease-out' });
      }
      if (!calm() && el.animate) {
        el.animate([{ transform: 'translateX(-7px)', background: 'rgba(255, 60, 80, .85)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
          { duration: 330, easing: 'ease-out', composite: el.classList.contains('float') ? 'add' : 'replace' });
      }
    }
  }
  // the green part snaps down on a hit, fills up smoothly when 체력 comes back
  if (f < V.fill) V.fill = f; else V.fill = Math.min(f, V.fill + Math.max(0.6, (f - V.fill) * 6) * dt);
  // the white "lost" chunk waits a moment, then catches up
  if (V.hold > 0) V.hold -= dt;
  else if (V.lost > V.fill) V.lost = Math.max(V.fill, V.lost - Math.max(0.35, (V.lost - V.fill) * 3.5) * dt);
  if (V.lost < V.fill) V.lost = V.fill;
  fillEl.style.width = pct(V.fill);
  lostEl.style.width = pct(V.lost);
  const cls = (s.out ? 'out down ' : s.down ? 'down ' : '') + (f < 0.25 ? 'low' : f < 0.5 ? 'mid' : '');
  if (cls !== V.cls) {
    V.cls = cls;
    el.classList.toggle('low', f < 0.25); el.classList.toggle('mid', f >= 0.25 && f < 0.5);
    el.classList.toggle('down', !!s.down); el.classList.toggle('out', !!s.out);
  }
  const num = s.out ? 'KO' : String(Math.ceil(s.hp - 1e-6));
  const label = s.out ? num : `${num}<small>/${Math.round(s.max)}</small>`;
  if (label !== V.num) { V.num = label; numEl.innerHTML = label; el.setAttribute('aria-valuenow', String(Math.max(0, Math.ceil(s.hp)))); el.setAttribute('aria-valuemax', String(Math.round(s.max))); }
  if (s.diff !== V.diff) { V.diff = s.diff; el.dataset.diff = s.diff || ''; diffEl.textContent = s.diffName || ''; }
}
function loop() {
  raf = requestAnimationFrame(loop);
  if (performance.now() - lastT >= 10) updateHpBar();
}
export function initHpBar(source) {
  if (typeof document === 'undefined') return;
  read = source;
  if (!el) build();
  if (!raf) raf = requestAnimationFrame(loop);
}
