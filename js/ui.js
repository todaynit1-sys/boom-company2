// 회사 뿌개기 — 화면 UI (HUD, 메뉴, 터치 조작)
// 다른 프로젝트 모듈이나 three.js를 가져오지 않는다.

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();

/* ---------- 설정 ---------- */
const SKEY = 'ppg.settings';
const settings = { sfx: true, bgm: true, vibe: true, calm: false, gender: 'm', storyLen: 'short' };
try {
  const saved = JSON.parse(localStorage.getItem(SKEY) || 'null');
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(settings)) if (k in saved && typeof saved[k] === typeof settings[k]) settings[k] = saved[k];
  }
} catch (e) { /* 저장소를 못 쓰면 기본값 */ }
if (settings.gender !== 'f') settings.gender = 'm';
if (settings.storyLen !== 'long') settings.storyLen = 'short';
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* 무시 */ } }

/* ---------- 터치 기기 판별 ---------- */
const qs = new URLSearchParams(location.search);
const mq = (q) => !!(window.matchMedia && matchMedia(q).matches);
let isTouch = mq('(pointer: coarse)') || (mq('(hover: none)') && navigator.maxTouchPoints > 0);
if (qs.get('touch') === '1') isTouch = true;
if (qs.get('touch') === '0') isTouch = false;
root.classList.toggle('touch', isTouch);
root.classList.toggle('calm', !!settings.calm);

/* ---------- 내부 상태 ---------- */
let H = {};
function call(name, ...args) {
  const f = H && H[name];
  if (typeof f === 'function') { try { return f(...args); } catch (e) { console.error('[ui] handler', name, e); } }
}
function blurActive() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
let vw = innerWidth, vh = innerHeight;
function anim(el, frames, opts) {
  if (!el || !el.animate) return null;
  try { return el.animate(frames, opts); } catch (e) { return null; }
}
function later(fn, ms) { return setTimeout(fn, ms); }

/* ---------- 요소 ---------- */
const E = {};
function grab() {
  for (const id of ['hud', 'mission', 'm-title', 'm-sub', 'm-quote', 'm-note', 'tasks', 'stress', 'stress-fill', 'stress-pct',
    'timer', 'money', 'money-lbl', 'money-val', 'btn-pause', 'combo', 'keys', 'world', 'prompt', 'vignette', 'touch', 'joy',
    'joy-knob', 'tbtns', 'subtitle', 'toast', 'banner', 'flash', 'elevator', 'ev-list', 'ev-close', 'title', 't-days',
    't-best', 't-gender', 't-help', 'pause', 'p-resume', 'p-skip', 'p-quit', 'p-title', 'p-keys', 'bill', 'r-co', 'r-meta',
    'r-items', 'r-total', 'r-best', 'r-relief', 'r-relief-bar', 'r-rank', 'r-comment', 'b-retry', 'b-share', 'b-title',
    'fade', 'f-time', 'f-title', 'f-sub', 'boot']) E[id] = $(id);
  E.stressIn = E.stress && E.stress.querySelector('.s-in b');
  E.promptKey = E.prompt && E.prompt.querySelector('.kc b');
  E.promptText = E.prompt && E.prompt.querySelector('.pt');
  E.tSpecial = E.tbtns && E.tbtns.querySelector('.t-special');
}
grab();

/* ---------- 스트레스 (부드럽게) ---------- */
let sTarget = 0, sShown = 0, sRaf = 0, sLast = 0, sTxt = '';
function drawStress() {
  const v = sShown;
  E['stress-fill'].style.width = v.toFixed(2) + '%';
  const t = Math.round(v) + '%';
  if (t !== sTxt) { sTxt = t; E['stress-pct'].textContent = t; }
  if (E.stressIn) E.stressIn.textContent = Math.round(sTarget >= 100 ? 100 : v) + '%';
  E.stress.classList.toggle('hot', v >= 80 && sTarget < 100);
}
function stressTick(t) {
  const dt = sLast ? Math.min(0.1, (t - sLast) / 1000) : 0.016;
  sLast = t;
  const diff = sTarget - sShown;
  const step = Math.max(Math.abs(diff) * (1 - Math.exp(-dt * 8)), 45 * dt);
  sShown = Math.abs(diff) <= step ? sTarget : sShown + Math.sign(diff) * step;
  drawStress();
  if (sShown !== sTarget) sRaf = requestAnimationFrame(stressTick);
  else { sRaf = 0; sLast = 0; }
}

/* ---------- 월드 표시: 행동 안내 ---------- */
const P = { vis: false, text: null, key: null, w: 0, h: 0, hold: -1, tx: '' };
/* 말풍선 */
const bubbles = new Map();
/* 금액 팝업 */
const pops = [];
let popIdx = 0;
function makePops() {
  for (let i = 0; i < 14; i++) {
    const w = document.createElement('div');
    w.className = 'pop'; w.hidden = true;
    const s = document.createElement('span');
    w.appendChild(s);
    E.world.appendChild(w);
    pops.push({ w, s, a: null });
  }
}
makePops();

function remeasure() {
  vw = innerWidth; vh = innerHeight;
  P.w = 0;
  for (const b of bubbles.values()) b.w = 0;
}
addEventListener('resize', remeasure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

/* ---------- 타이머 ---------- */
let tLast = null;
function fmtTime(s) {
  const n = Math.max(0, Math.ceil(s));
  const m = Math.floor(n / 60), r = n % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

/* ---------- 필살기 ---------- */
let qCap = null, spRatio = 0;
function drawSpecial() {
  const r = spRatio, ready = r >= 1;
  if (qCap) { qCap.style.setProperty('--c', r); qCap.classList.toggle('ready', ready); }
  if (E.tSpecial) { E.tSpecial.style.setProperty('--c', r); E.tSpecial.classList.toggle('ready', ready); }
}

/* ---------- 자막 / 알림 / 배너 ---------- */
const timers = {};
function showFor(key, el, ms) {
  clearTimeout(timers[key]);
  el.hidden = false;
  if (ms > 0 && ms < Infinity) {
    timers[key] = later(() => {
      const a = anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
      timers[key] = later(() => { el.hidden = true; if (a) a.cancel(); }, 220);
    }, ms);
  }
}

/* ---------- 장면 전환 ---------- */
let fadeAnim = null, fadeShownAt = 0, fadeMs = 0, handA = 0, minA = 0;
function setClock(time) {
  const m = /(\d{1,2})\s*[:시]\s*(\d{1,2})/.exec(time || '');
  if (!m) return;
  const hh = +m[1] % 12, mm = +m[2];
  const tM = mm * 6, tH = hh * 30 + mm * 0.5;
  minA += ((tM - (minA % 360)) + 720) % 360 + 360;
  handA += ((tH - (handA % 360)) + 720) % 360;
  const [h, mi] = E.fade.querySelectorAll('.clock i');
  h.style.transform = `rotate(${handA}deg)`;
  mi.style.transform = `rotate(${minA}deg)`;
}

/* ---------- 터치 조작 ---------- */
const joy = { x: 0, y: 0 };
const look = { dx: 0, dy: 0 };
const T = { joyId: null, lookId: null, cx: 0, cy: 0, lx: 0, ly: 0, R: 50, pressed: new Map(), bound: false };
function joyReset() {
  T.joyId = null; joy.x = 0; joy.y = 0;
  if (E.joy) { E.joy.classList.remove('on'); E.joy.style.transform = ''; }
  if (E['joy-knob']) E['joy-knob'].style.transform = '';
}
function releaseButtons() {
  for (const [btn, name] of T.pressed) { btn.classList.remove('on'); call('action', name, false); }
  T.pressed.clear();
}
function bindTouch() {
  if (T.bound || !E.touch) return;
  T.bound = true;
  const layer = E.touch;
  const stop = (e) => e.preventDefault();
  layer.addEventListener('contextmenu', stop);
  document.addEventListener('gesturestart', stop, { passive: false });
  layer.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.tbtn')) return;
    e.preventDefault();
    if (innerWidth !== vw || innerHeight !== vh) remeasure();
    const x = e.clientX, y = e.clientY;
    if (T.joyId === null && x < vw * 0.45 && y > vh * 0.28) {
      T.joyId = e.pointerId;
      E.joy.style.transform = '';
      const r = E.joy.getBoundingClientRect();
      T.R = r.width / 2;
      const hx = r.left + T.R, hy = r.top + T.R;
      const cx = clamp(x, T.R + 6, vw - T.R - 6), cy = clamp(y, T.R + 6, vh - T.R - 6);
      T.cx = cx; T.cy = cy;
      E.joy.style.transform = `translate3d(${cx - hx}px,${cy - hy}px,0)`;
      E.joy.classList.add('on');
      moveJoy(x, y);
    } else if (T.lookId === null) {
      T.lookId = e.pointerId; T.lx = x; T.ly = y;
    } else return;
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === T.joyId) { e.preventDefault(); moveJoy(e.clientX, e.clientY); }
    else if (e.pointerId === T.lookId) {
      e.preventDefault();
      look.dx += e.clientX - T.lx; look.dy += e.clientY - T.ly;
      T.lx = e.clientX; T.ly = e.clientY;
    }
  });
  const end = (e) => {
    if (e.pointerId === T.joyId) joyReset();
    if (e.pointerId === T.lookId) T.lookId = null;
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);
  layer.addEventListener('lostpointercapture', end);

  for (const btn of E.tbtns.querySelectorAll('.tbtn')) {
    const name = btn.dataset.act;
    btn.addEventListener('contextmenu', stop);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (T.pressed.has(btn)) return;
      T.pressed.set(btn, name);
      btn.classList.add('on');
      call('action', name, true);
    });
    const up = (e) => {
      if (e) e.stopPropagation();
      if (!T.pressed.has(btn)) return;
      T.pressed.delete(btn);
      btn.classList.remove('on');
      call('action', name, false);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }
}
function moveJoy(x, y) {
  let dx = x - T.cx, dy = y - T.cy;
  const d = Math.hypot(dx, dy), R = T.R || 50;
  if (d > R) { dx *= R / d; dy *= R / d; }
  E['joy-knob'].style.transform = `translate3d(${dx}px,${dy}px,0)`;
  let jx = dx / R, jy = -dy / R;
  const m = Math.hypot(jx, jy);
  if (m < 0.12) { jx = 0; jy = 0; }
  joy.x = jx; joy.y = jy;
}

/* ---------- 첫 화면 ---------- */
function syncTitleOpts() {
  for (const b of E['t-gender'].querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.g === settings.gender));
  for (const b of E.title.querySelectorAll('.tg')) b.setAttribute('aria-pressed', String(!!settings[b.dataset.set]));
  for (const b of E.title.querySelectorAll('[data-len]')) b.setAttribute('aria-pressed', String(b.dataset.len === settings.storyLen));
  const sub = document.getElementById('t-len-sub');
  if (sub) sub.textContent = settings.storyLen === 'long' ? '하루 이야기 · 상황 8개 · 약 9분' : '하루 이야기 · 상황 3개 · 약 4분';
}
function helpHTML() {
  if (isTouch) return '왼쪽 아래를 끌어 걷고, 오른쪽 화면을 끌어 둘러봐요. 오른쪽 버튼으로 때리고 집고 뛰어요.';
  const k = (t, s) => `<span class="hi"><span class="kc"><b>${t}</b></span>${s}</span>`;
  return [k('WASD', '이동'), '<span class="hi">마우스 시점</span>', k('E', '행동'), k('Z', '·좌클릭 때리기'), k('X', '발차기'), k('Q', '필살기'), k('ESC', '멈춤')].join(' · ');
}
const PAUSE_KEYS_DESK = [['WASD', '이동'], ['마우스', '시점'], ['SPACE', '점프'], ['좌클릭/Z/J', '때리기'], ['우클릭/X/K', '발차기'], ['E', '행동(집기·엎기)'], ['Q', '필살기'], ['ESC/P', '멈춤']];
const PAUSE_KEYS_TOUCH = [['왼쪽 아래', '끌어서 이동'], ['오른쪽 화면', '끌어서 시점'], ['때리기', '때리기'], ['행동', '집기·엎기'], ['점프', '점프'], ['필살기', '게이지가 차면']];

/* ---------- 청구서 ---------- */
const MODE_LABEL = { story: '하루 이야기', rush: '1분 난동', free: '자유 난동' };
let lastBill = null;
async function shareBill() {
  const d = lastBill || {};
  const mode = MODE_LABEL[d.mode] || '회사 뿌개기';
  const url = location.origin + location.pathname.replace(/tools\/[^/]*$/, '');
  const text = `회사 뿌개기 ${mode} 피해 청구서: ${fmt(d.total)}원` +
    (d.title ? ` · 칭호 「${d.title}」` : '') +
    (d.relief != null ? ` · 스트레스 ${Math.round(d.relief)}% 해소` : '');
  if (navigator.share) {
    try { await navigator.share({ title: '회사 뿌개기', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const full = text + '\n' + url;
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(full); ok = true; } } catch (e) { /* 아래 방법으로 */ }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = full; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch (e) { ok = false; }
  }
  ui.toast(ok ? '청구서를 복사했어요. 붙여 넣어 자랑해 보세요' : '복사하지 못했어요. 화면을 캡처해 주세요', 2600);
}

/* ---------- 버튼 연결 ---------- */
let bound = false;
function bindUI() {
  if (bound) return;
  bound = true;
  const on = (el, fn) => el && el.addEventListener('click', (e) => { fn(e); blurActive(); });
  on(E['btn-pause'], () => call('pause'));
  for (const b of E.title.querySelectorAll('[data-mode]')) on(b, () => call('start', b.dataset.mode, { floor: 'office', gender: settings.gender, len: settings.storyLen }));
  for (const b of E.title.querySelectorAll('[data-len]')) on(b, () => { settings.storyLen = b.dataset.len === 'long' ? 'long' : 'short'; saveSettings(); syncTitleOpts(); });
  for (const b of E.title.querySelectorAll('[data-free]')) on(b, () => call('start', 'free', { floor: b.dataset.free, gender: settings.gender }));
  for (const b of E['t-gender'].querySelectorAll('button')) on(b, () => {
    settings.gender = b.dataset.g; saveSettings(); syncTitleOpts(); call('setting', 'gender', settings.gender);
  });
  for (const b of E.title.querySelectorAll('.tg')) on(b, () => {
    const k = b.dataset.set;
    settings[k] = !settings[k]; saveSettings(); syncTitleOpts();
    if (k === 'calm') root.classList.toggle('calm', settings.calm);
    call('setting', k, settings[k]);
  });
  on(E['p-resume'], () => call('resume'));
  on(E['p-skip'], () => call('skipTask'));
  on(E['p-quit'], () => call('quit'));
  on(E['p-title'], () => call('toTitle'));
  on(E['b-retry'], () => call('retry'));
  on(E['b-title'], () => call('toTitle'));
  on(E['b-share'], () => shareBill());
  on(E['ev-close'], () => { ui.elevator(null); call('elevator', null); });
  E['ev-list'].addEventListener('click', (e) => {
    const b = e.target.closest('.ev-btn');
    if (!b || b.classList.contains('cur')) return;
    blurActive();
    ui.elevator(null);
    call('elevator', b.dataset.id);
  });
  // 모달 안 스크롤만 허용, 바깥에서 길게 눌러 선택 막기
  document.addEventListener('selectstart', (e) => { if (!(e.target.closest && e.target.closest('input,textarea'))) e.preventDefault(); });
}

/* ================= 공개 API ================= */
export const ui = {
  settings,
  isTouch,
  joy,
  look,

  init(handlers = {}) {
    H = handlers || {};
    bindUI();
    if (isTouch) bindTouch();
    syncTitleOpts();
    E['t-help'].innerHTML = helpHTML();
    const boot = E.boot;
    if (boot && !boot.hidden) {
      boot.classList.add('out');
      later(() => { boot.hidden = true; }, 520);
    }
    return ui;
  },

  title(show, { best = null, days = 0 } = {}) {
    E.title.hidden = !show;
    if (!show) return;
    syncTitleOpts();
    E['t-help'].innerHTML = helpHTML();
    E['t-best'].textContent = best != null && best > 0 ? `최고 기록 ${fmt(best)}원` : '최고 기록 없음 · 첫 기록을 남겨 보세요';
    const dd = E['t-days'];
    if (days > 0) { dd.textContent = `퇴근 성공 ${days}일`; dd.hidden = false; } else dd.hidden = true;
  },

  hud(show) {
    E.hud.hidden = !show;
    const pad = !!(show && isTouch);
    if (!pad) { joyReset(); T.lookId = null; releaseButtons(); }
    E.touch.hidden = !pad;
  },

  mission(info) {
    const m = E.mission;
    if (!info) { m.hidden = true; return; }
    m.hidden = false;
    E['m-title'].textContent = info.title || '';
    E['m-sub'].textContent = info.sub || '';
    E['m-sub'].hidden = !info.sub;
    const q = info.quote ? String(info.quote) : '';
    E['m-quote'].textContent = q && !/^["“'‘]/.test(q) ? `“${q}”` : q;
    E['m-quote'].hidden = !q;
    E['m-note'].textContent = info.note || '';
    E['m-note'].hidden = !info.note;
    m.classList.toggle('rage', info.tone === 'rage');
  },

  tasks(list) {
    const ul = E.tasks;
    const prev = new Map([...ul.children].map((li) => [li.dataset.t, li.classList.contains('done')]));
    ul.textContent = '';
    for (const t of list || []) {
      const li = document.createElement('li');
      const text = String(t.text || '');
      li.dataset.t = text;
      if (t.plain) li.classList.add('plain');
      if (t.done) li.classList.add('done');
      if (!t.plain) { const cb = document.createElement('span'); cb.className = 'cb'; li.appendChild(cb); }
      const s = document.createElement('span'); s.className = 'tt'; s.textContent = text; li.appendChild(s);
      if (!prev.has(text)) li.classList.add('new');
      else if (t.done && !prev.get(text)) anim(li, [{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
      ul.appendChild(li);
    }
  },

  stress(pct, { pulse } = {}) {
    const v = clamp(Number(pct) || 0, 0, 100);
    sTarget = v;
    E.stress.classList.toggle('full', v >= 100);
    if (pulse && !root.classList.contains('calm')) {
      E.stress.classList.remove('pulse'); void E.stress.offsetWidth; E.stress.classList.add('pulse');
    }
    if (!sRaf) { sLast = 0; sRaf = requestAnimationFrame(stressTick); }
  },

  money(amount, label = '피해액') {
    const a = Math.round(Number(amount) || 0);
    const txt = fmt(a) + '원';
    if (E['money-lbl'].textContent !== label) E['money-lbl'].textContent = label;
    if (E['money-val'].textContent !== txt) {
      const grew = a > (ui._money || 0);
      E['money-val'].textContent = txt;
      if (grew) anim(E['money-val'], [{ transform: 'scale(1.22)', color: '#fff3a0' }, { transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    ui._money = a;
    E.money.classList.toggle('big', a > 0);
  },
  _money: 0,

  timer(seconds) {
    const el = E.timer;
    if (seconds == null) { el.hidden = true; tLast = null; return; }
    el.hidden = false;
    const n = Math.max(0, Math.ceil(seconds));
    if (n === tLast) return;
    tLast = n;
    el.textContent = fmtTime(n);
    const low = n <= 10;
    el.classList.toggle('low', low);
    if (low && n > 0) anim(el, [{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  },

  // grows with the count (tiers recolour it at 10 / 20 / 30); every hit kicks it, milestones kick harder
  combo(n) {
    const el = E.combo;
    if (!n || n < 2) { el.hidden = true; el.dataset.tier = '0'; return; }
    n = Math.round(n);
    el.hidden = false;
    el.innerHTML = `x<b>${n}</b> 연타`;
    const tier = n >= 30 ? 3 : n >= 20 ? 2 : n >= 10 ? 1 : 0;
    el.dataset.tier = String(tier);
    const cs = 1 + Math.min(n, 40) * 0.018;
    el.style.transform = `scale(${cs.toFixed(3)})`;
    const calm = root.classList.contains('calm');
    const big = n % 10 === 0;
    anim(el, calm ? [{ opacity: 0.6 }, { opacity: 1 }] : [
      { transform: `scale(${(cs * (big ? 1.7 : 1.32)).toFixed(3)}) rotate(${big ? -8 : (n % 2 ? -5 : 5)}deg)` },
      { transform: `scale(${(cs * 0.94).toFixed(3)}) rotate(0deg)`, offset: 0.55 },
      { transform: `scale(${cs.toFixed(3)})` },
    ], { duration: big ? 420 : 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
  },

  special(ratio) {
    const r = clamp(Number(ratio) || 0, 0, 1);
    if (Math.abs(r - spRatio) < 0.004 && (r >= 1) === (spRatio >= 1)) return;
    spRatio = r;
    drawSpecial();
  },

  keys(list) {
    const el = E.keys;
    qCap = null;
    el.textContent = '';
    if (!list || !list.length) { el.hidden = true; return; }
    el.hidden = false;
    for (const it of list) {
      const d = document.createElement('div'); d.className = 'kh';
      const kc = document.createElement('span'); kc.className = 'kc';
      const b = document.createElement('b'); b.textContent = it.k; kc.appendChild(b);
      const t = document.createElement('span'); t.textContent = it.t || '';
      d.append(kc, t); el.appendChild(d);
      if (String(it.k).toUpperCase() === 'Q') { qCap = kc; kc.classList.add('charge'); }
    }
    drawSpecial();
  },

  prompt(p) {
    const el = E.prompt;
    if (!p) { if (P.vis) { el.hidden = true; P.vis = false; } return; }
    if (innerWidth !== vw || innerHeight !== vh) remeasure();
    if (!P.vis) { el.hidden = false; P.vis = true; }
    const text = p.text || '';
    if (text !== P.text) { E.promptText.textContent = text; P.text = text; P.w = 0; }
    const key = p.key || 'E';
    if (key !== P.key) { E.promptKey.textContent = key; P.key = key; P.w = 0; }
    const hold = p.hold > 0 ? Math.min(1, Math.round(p.hold * 50) / 50) : 0;
    if (hold !== P.hold) {
      P.hold = hold;
      el.classList.toggle('hold', hold > 0);
      el.style.setProperty('--h', hold);
    }
    if (!P.w) { P.w = el.offsetWidth; P.h = el.offsetHeight; }
    const x = clamp(p.x - P.w / 2, 6, vw - P.w - 6), y = clamp(p.y - P.h / 2, 6, vh - P.h - 6);
    const tx = `translate3d(${x | 0}px,${y | 0}px,0)`;
    if (tx !== P.tx) { el.style.transform = tx; P.tx = tx; }
  },

  bubble(id, b) {
    let o = bubbles.get(id);
    if (!b) { if (o && o.vis) { o.el.hidden = true; o.vis = false; } return; }
    if (!o) {
      const el = document.createElement('div');
      el.className = 'bubble';
      E.world.appendChild(el);
      o = { el, text: null, w: 0, h: 0, vis: true, tx: '' };
      bubbles.set(id, o);
    }
    if (!o.vis) { o.el.hidden = false; o.vis = true; }
    const text = b.text || '';
    if (text !== o.text) {
      o.text = text; o.el.textContent = text; o.w = 0;
      o.el.classList.toggle('long', text.length > 22);
      if (o.vis) anim(o.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    }
    if (!o.w) { o.w = o.el.offsetWidth; o.h = o.el.offsetHeight; }
    const x = clamp(b.x - o.w / 2, 6, vw - o.w - 6), y = clamp(b.y - o.h - 10, 6, vh - o.h - 6);
    const tx = `translate3d(${x | 0}px,${y | 0}px,0)`;
    if (tx !== o.tx) { o.el.style.transform = tx; o.tx = tx; }
  },

  // size grows with the amount and the combo; colour steps at 10k / 50k / 200k (t1…t3)
  moneyPop(x, y, amount, combo = 0) {
    const p = pops[popIdx];
    popIdx = (popIdx + 1) % pops.length;
    if (p.a) p.a.cancel();
    const a = Math.round(Number(amount) || 0);
    p.s.textContent = (a >= 0 ? '+' : '') + fmt(a) + '원';
    const tier = a >= 200000 ? 3 : a >= 50000 ? 2 : a >= 10000 ? 1 : 0;
    p.w.classList.toggle('huge', tier >= 2);
    p.w.dataset.tier = String(tier);
    p.w.style.transform = `translate3d(${x | 0}px,${y | 0}px,0)`;
    p.w.hidden = false;
    const sc = Math.min(1.9, (0.72 + 0.2 * Math.log10(Math.max(1000, a) / 1000)) * (1 + Math.min(Number(combo) || 0, 30) * 0.012));
    const tilt = ((popIdx % 3) - 1) * 4 - 6, drift = ((popIdx % 5) - 2) * 9;
    const base = `translate(-50%,-50%) rotate(${tilt}deg)`;
    const calm = root.classList.contains('calm');
    const k = p.s.animate ? p.s.animate(calm ? [
      { transform: `${base} scale(${sc.toFixed(2)})`, opacity: 0 },
      { transform: `${base} scale(${sc.toFixed(2)})`, opacity: 1, offset: 0.15 },
      { transform: `${base} translateY(-50px) scale(${sc.toFixed(2)})`, opacity: 0 },
    ] : [
      { transform: `${base} translateY(14px) scale(${(sc * 0.3).toFixed(2)})`, opacity: 0 },
      { transform: `${base} translate(${drift * 0.3}px,-18px) scale(${(sc * 1.35).toFixed(2)})`, opacity: 1, offset: 0.13 },
      { transform: `${base} translate(${drift * 0.5}px,-4px) scale(${(sc * 0.9).toFixed(2)})`, opacity: 1, offset: 0.24 },
      { transform: `${base} translate(${drift * 0.6}px,-16px) scale(${(sc * 1.06).toFixed(2)})`, opacity: 1, offset: 0.34 },
      { transform: `${base} translate(${drift * 0.7}px,-12px) scale(${sc.toFixed(2)})`, opacity: 1, offset: 0.45 },
      { transform: `${base} translate(${drift}px,-80px) scale(${(sc * 0.92).toFixed(2)})`, opacity: 0 },
    ], { duration: 1150 + tier * 150, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }) : null;
    p.a = k;
    if (k) k.onfinish = () => { if (p.a === k) { p.w.hidden = true; p.a = null; } };
    else later(() => { p.w.hidden = true; }, 1100);
  },

  subtitle(speaker, text, ms = 2600) {
    const el = E.subtitle;
    if (!text) { clearTimeout(timers.sub); el.hidden = true; return; }
    el.querySelector('.sp').textContent = speaker || '';
    el.querySelector('.tx').textContent = text;
    const wasHidden = el.hidden;
    el.getAnimations && el.getAnimations().forEach((a) => a.cancel());
    showFor('sub', el, ms);
    if (wasHidden) anim(el, [{ opacity: 0, transform: 'translate(-50%, 8px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 180, easing: 'ease-out' });
  },

  toast(text, ms = 2000) {
    const el = E.toast;
    if (!text) { clearTimeout(timers.toast); el.hidden = true; return; }
    el.textContent = text;
    el.getAnimations && el.getAnimations().forEach((a) => a.cancel());
    showFor('toast', el, ms);
    anim(el, [{ opacity: 0, transform: 'translate(-50%, 10px) scale(.95)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: 200, easing: 'ease-out' });
  },

  banner(text, sub, ms = 1800) {
    const el = E.banner;
    if (!text) { clearTimeout(timers.banner); el.hidden = true; return; }
    el.querySelector('strong').textContent = text;
    el.querySelector('span').textContent = sub || '';
    el.getAnimations && el.getAnimations().forEach((a) => a.cancel());
    showFor('banner', el, ms);
    const calm = root.classList.contains('calm');
    anim(el.querySelector('strong'), calm
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'scale(2.2) rotate(-4deg)', opacity: 0 }, { transform: 'scale(.92) rotate(1deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(0)', opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1)' });
  },

  flash(color = '#fff', ms = 180) {
    const el = E.flash;
    el.style.background = color;
    const peak = root.classList.contains('calm') ? 0.3 : 0.75;
    anim(el, [{ opacity: peak }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  },

  // special wind-up: speed lines rushing in from the screen edges (calm: a soft vignette pulse instead)
  windup(ms = 500) {
    let el = E.speed;
    if (!el) { el = E.speed = document.createElement('div'); el.id = 'speed'; el.setAttribute('aria-hidden', 'true'); E.flash.parentNode.insertBefore(el, E.flash); }
    el.classList.toggle('soft', root.classList.contains('calm'));
    el.getAnimations && el.getAnimations().forEach((a) => a.cancel());
    el.style.display = 'block';
    const k = anim(el, [
      { opacity: 0, transform: 'scale(1.25)' },
      { opacity: 1, transform: 'scale(1.05)', offset: 0.35 },
      { opacity: 1, transform: 'scale(1)', offset: 0.9 },
      { opacity: 0, transform: 'scale(.98)' },
    ], { duration: ms, easing: 'ease-in' });
    if (k) k.onfinish = () => { el.style.display = 'none'; }; else later(() => { el.style.display = 'none'; }, ms);
  },

  vignette(level) {
    const l = clamp(Number(level) || 0, 0, 1);
    E.vignette.style.opacity = l;
    E.vignette.classList.toggle('beat', l > 0.55);
  },

  fade(info, ms = 1600) {
    const el = E.fade;
    el.classList.toggle('blank', !info);
    if (info) {
      E['f-time'].textContent = info.time || '';
      E['f-title'].textContent = info.title || '';
      E['f-sub'].textContent = info.sub || '';
    }
    const wasHidden = el.hidden;
    el.hidden = false;
    if (info && info.time) {
      if (wasHidden) requestAnimationFrame(() => setClock(info.time)); else setClock(info.time);
    }
    fadeMs = ms;
    if (fadeAnim) fadeAnim.cancel();
    const from = wasHidden ? 0 : Number(getComputedStyle(el).opacity) || 0;
    const dur = Math.round(Math.min(450, ms * 0.3) * (1 - from));
    return new Promise((res) => {
      const done = () => { el.style.opacity = 1; fadeShownAt = now(); res(); };
      if (dur < 16 || !el.animate) { done(); return; }
      el.style.opacity = from;
      const a = el.animate([{ opacity: from }, { opacity: 1 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
      fadeAnim = a;
      let settled = false;
      a.onfinish = () => { if (settled) return; settled = true; if (fadeAnim === a) fadeAnim = null; done(); };
      a.oncancel = () => { if (settled) return; settled = true; res(); };
      later(() => { if (!settled) { settled = true; if (fadeAnim === a) fadeAnim = null; a.cancel(); done(); } }, dur + 250);
    });
  },

  fadeOut() {
    const el = E.fade;
    if (el.hidden) return Promise.resolve();
    const wait = Math.max(0, fadeShownAt + fadeMs - now());
    return new Promise((res) => {
      later(() => {
        if (fadeAnim) fadeAnim.cancel();
        let doneOut = false;
        const finish = () => { if (doneOut) return; doneOut = true; el.hidden = true; el.style.opacity = 0; res(); };
        if (!el.animate) { finish(); return; }
        const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-in', fill: 'forwards' });
        fadeAnim = a;
        a.onfinish = () => { if (fadeAnim === a) fadeAnim = null; finish(); };
        a.oncancel = () => { if (!doneOut) { doneOut = true; res(); } };
        // never let a stalled animation clock (throttled frames) hold the game frozen behind the card
        later(() => { if (!doneOut) { if (fadeAnim === a) { fadeAnim = null; a.cancel(); } finish(); } }, 700);
      }, wait);
    });
  },

  elevator(panel) {
    const el = E.elevator;
    if (!panel) { el.hidden = true; return; }
    const list = E['ev-list'];
    list.textContent = '';
    for (const f of panel.floors || []) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ev-btn'; b.dataset.id = f.id;
      const cur = f.id === panel.current;
      if (cur) { b.classList.add('cur'); b.setAttribute('aria-disabled', 'true'); }
      if (panel.sel === f.id) b.classList.add('sel');
      const fl = document.createElement('span'); fl.className = 'fl' + (String(f.label || '').length > 1 ? ' long' : ''); fl.textContent = f.label || f.id;
      const tx = document.createElement('span'); tx.className = 'tx';
      const bb = document.createElement('b'); bb.textContent = f.name || f.label || '';
      const sm = document.createElement('small'); sm.textContent = cur ? '지금 여기' : (f.sub || '이 층으로 가기');
      tx.append(bb, sm); b.append(fl, tx);
      if (f.keyLabel) { const k = document.createElement('span'); k.className = 'kc ev-key'; const kb = document.createElement('b'); kb.textContent = f.keyLabel; k.appendChild(kb); b.appendChild(k); }
      list.appendChild(b);
    }
    el.hidden = false;
  },

  pause(show, { canSkip } = {}) {
    E.pause.hidden = !show;
    if (!show) return;
    E['p-skip'].hidden = !canSkip;
    const ul = E['p-keys'];
    ul.textContent = '';
    for (const [k, t] of isTouch ? PAUSE_KEYS_TOUCH : PAUSE_KEYS_DESK) {
      const li = document.createElement('li');
      const kc = document.createElement('span'); kc.className = 'kc';
      const b = document.createElement('b'); b.textContent = k; kc.appendChild(b);
      const s = document.createElement('span'); s.textContent = t;
      li.append(kc, s); ul.appendChild(li);
    }
    joyReset(); releaseButtons();
  },

  bill(data) {
    const el = E.bill;
    if (!data) { el.hidden = true; lastBill = null; return; }
    lastBill = data;
    E['r-co'].textContent = data.company || '(주)가족같은회사';
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    E['r-meta'].textContent = `${MODE_LABEL[data.mode] || '난동'} · ${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}` + (data.meta ? ` · ${data.meta}` : '');
    const tb = E['r-items'];
    tb.textContent = '';
    const items = data.items || [];
    if (!items.length) {
      const tr = document.createElement('tr'); tr.className = 'empty';
      const td = document.createElement('td'); td.colSpan = 3; td.textContent = '부순 물건이 없어요. 참 착한 직원이네요';
      tr.appendChild(td); tb.appendChild(tr);
    }
    for (const it of items) {
      const tr = document.createElement('tr');
      const n = document.createElement('td'); n.className = 'n'; n.textContent = it.name;
      const c = document.createElement('td'); c.className = 'c'; c.textContent = it.count > 1 ? `×${it.count}` : '';
      const a = document.createElement('td'); a.className = 'a'; a.textContent = fmt(it.amount) + '원';
      tr.append(n, c, a); tb.appendChild(tr);
    }
    E['r-total'].textContent = fmt(data.total) + '원';
    const best = E['r-best'];
    best.textContent = '';
    if (data.isBest) {
      const nb = document.createElement('span'); nb.className = 'nb'; nb.textContent = '신기록';
      best.append(nb, document.createTextNode(data.best > 0 && data.best !== data.total ? `이전 최고 ${fmt(data.best)}원` : '최고 기록 갱신'));
    } else if (data.best > 0) best.textContent = `최고 기록 ${fmt(data.best)}원`;
    best.hidden = !best.textContent;
    const r = clamp(Math.round(Number(data.relief) || 0), 0, 100);
    E['r-relief'].textContent = r + '%';
    E['r-relief-bar'].style.width = '0%';
    E['r-rank'].textContent = data.title || '';
    E['r-comment'].textContent = data.comment || '';
    el.hidden = false;
    el.querySelector('.r-scroll').scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { E['r-relief-bar'].style.width = r + '%'; }));
    joyReset(); releaseButtons();
  },
};

/* 화면 전환 시계가 처음 뜰 때 바늘을 돌리기 위한 초기값 */
handA = 0; minA = 0;

export default ui;
