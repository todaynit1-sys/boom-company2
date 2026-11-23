// 3층 대강당 — the company auditorium dressed for the anniversary town hall: a raised stage you can walk up on
// (the player controller only knows y = 0, so the stage height is handled in hooks.onTick), curtains, a big
// town-hall screen on trusses, a podium to flip, speakers on tripods, spotlights, a banner across the top,
// wreaths by the elevators, balloon bunches, ~40 folding chairs in rows with a red-carpet centre aisle and a
// refreshment table at the back. Story: 「타운홀 의자 깔기」 (오후 2:00) — set out the last chairs, then sit
// through the CEO's "한 말씀만 더…".
const PI = Math.PI;

// layout constants (metres). Room 22 × 18, ceiling 4.6. Stage along the north wall, elevators in the south wall.
const W = 22, D = 18, H = 4.6;
const ST = { x: 0, z: -7.3, w: 12, d: 3.4, h: 0.45 };               // stage (front edge z = -5.6)
const ST_FRONT = ST.z + ST.d / 2;
const STAIR = { x0: 4.95, x1: 5.85 };                                 // stage prop's built-in stairs (front-right)
const ROWS = [-3.4, -2.3, -1.2, -0.1];                                // chair rows (z), chairs face the stage (−z)
const COLS = [1.2, 1.9, 2.6, 3.3, 4.0];                          // per side (x = ±)
const SLOTS = [[-3.3, -3.4], [-4.0, -3.4], [4.0, -3.4]];           // empty front-row places (story: set chairs here)
const BAL = ['#ff5c8a', '#ffd84d', '#4f8ef7'];

// ground height under (x, z): stage top, the two steps, else the floor
function heightAt(x, z) {
  if (z < ST_FRONT && z > -D / 2 - 0.1 && Math.abs(x - ST.x) < ST.w / 2) return ST.h;
  if (x > STAIR.x0 && x < STAIR.x1) {
    if (z >= ST_FRONT && z < ST_FRONT + 0.2) return ST.h * 2 / 3;
    if (z >= ST_FRONT + 0.2 && z < ST_FRONT + 0.52) return ST.h / 3;
  }
  return 0;
}

// story helpers: carry a folding chair (hold E), set it down on an empty front-row place
let carried = null, carriedSlot = -1, carriedS = null;
let screenOff = null; // material for the smashed town-hall screen (made in build)
function pickChair(game, i) {
  const rec = game.rec('setChair' + i);
  if (!rec || rec.removed || rec.held) return;
  game.S.phys.detach(rec);
  rec.group.matrixAutoUpdate = true;
  game.P.char.hold(rec.group, { both: true });
  rec.group.position.set(0, -0.55, 0.28);
  rec.group.rotation.set(-0.25, PI, 0);
  game.P.carry = rec.group; game.P.carryKind = 'chair';
  carried = rec; carriedSlot = i; carriedS = game.S;
  game.sfx('pickup', { vol: 0.6 });
}
function placeChair(game) {
  const rec = carried;
  if (!rec) return;
  carried = null;
  const P = game.P;
  if (P.carry === rec.group) { P.carry = null; P.carryKind = null; }
  if (rec.group.parent) rec.group.parent.remove(rec.group);
  game.F.group.add(rec.group);
  const s = game.anchor('slot' + carriedSlot) || P.pos;
  rec.group.matrixAutoUpdate = false;
  rec.group.position.set(s.x, 0, s.z); rec.group.rotation.set(0, PI, 0); rec.group.updateMatrix();
  game.S.phys.reattach(rec, { x: s.x, y: rec.hy + 0.005, z: s.z }, { x: 0, y: 1, z: 0, w: 0 });
  game.sfx('drop', { vol: 0.55 });
}

export default {
  id: 'hall', label: '3', key: 'Digit3', name: '3층 · 대강당', sub: '창립 기념 타운홀 준비 중',
  size: { w: W, d: D, h: H },
  // windowless: warm interior look, a touch brighter and rosier than the default
  light: { preset: 'indoor', hemiI: 1.2, exposure: 1.04, fog: '#3d3038', fogNear: 22, fogFar: 60 },
  music: 'lobby', stepSfx: 'step',

  build(ctx) {
    const { M, tex2, V } = ctx;
    const A = ctx.anchors;
    const hw = W / 2, hd = D / 2;

    // ---------------- shell: polished wood floor, cream walls, elevators in the back (south) wall
    ctx.room({
      floor: M.tex('hallFloorT', tex2.hallFloor(), W / 2.2, D / 2.2, { roughness: 0.38, metalness: 0.02 }),
      wall: M.std('hallWallC', { color: '#efe3cf', roughness: 0.9 }),
      ceiling: M.std('hallCeil', { color: '#f1ebe2', roughness: 1 }),
      elevators: { wall: 'south', at: [-1.6, 1.6], label: '3F' },
      lights: 3,
    });
    // wood wainscot + gold trim on the side and back walls
    const wood = M.tex('hallWains', tex2.darkWood(), 6, 0.6, { roughness: 0.55, color: '#b07848' });
    const trim = M.std('hallTrim', { color: '#d9ad4a', roughness: 0.35, metalness: 0.55 });
    for (const sx of [-1, 1]) {
      ctx.box(0.04, 1.05, D, wood, sx * (hw - 0.02), 0, 0, { cast: false });
      ctx.box(0.06, 0.05, D, trim, sx * (hw - 0.03), 1.05, 0, { cast: false });
    }
    for (const [x0, x1] of [[-hw, -2.2], [-1.0, 1.0], [2.2, hw]]) {
      ctx.box(x1 - x0, 1.05, 0.04, wood, (x0 + x1) / 2, 0, hd - 0.02, { cast: false });
      ctx.box(x1 - x0, 0.05, 0.06, trim, (x0 + x1) / 2, 1.05, hd - 0.03, { cast: false });
    }
    // side-wall pilasters with warm sconces (emissive → bloom)
    const pil = M.std('hallPil', { color: '#e2cfb2', roughness: 0.8 });
    const sconce = M.std('hallSconce', { color: '#fff4dc', emissive: '#ffcf86', emissiveIntensity: 1.6, roughness: 0.5 });
    for (const sx of [-1, 1]) for (const z of [-4.5, 0.5, 5.5]) {
      ctx.box(0.16, H, 0.6, pil, sx * (hw - 0.08), 0, z, { cast: false });
      ctx.box(0.08, 0.34, 0.2, sconce, sx * (hw - 0.2), 2.35, z, { cast: false });
    }

    // ---------------- stage: decor shell + a physics body (props rest on it) whose walking rect is switched
    // off — the player and people step up onto it through hooks.onTick (heightAt)
    ctx.prop('stage', ST.x, ST.z, 0, { w: ST.w, d: ST.d, h: ST.h, as: 'decor', solid: false, noCast: true });
    ctx.collider(ST.x, ST.z, ST.w / 2, ST.d / 2, ST.h);
    ctx.F.rects[ctx.F.rects.length - 1].off = true;
    // backdrop between the curtains: navy panel with gold sparkles + a lit gold frame
    const bd = ctx.canvasTex('hallBackdrop', 512, 320, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#22346e'); g.addColorStop(1, '#162350');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,${200 + r() * 40 | 0},${90 + r() * 80 | 0},${0.25 + r() * 0.5})`; const px = r() * w, py = r() * h, rr = 1 + r() * 2.5; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(242,194,27,0.35)'; x.lineWidth = 3;
      for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(w / 2, h * 0.55); x.lineTo(i * w / 8, 0); x.stroke(); }
    });
    ctx.box(6.4, 4.0, 0.04, M.std('hallBackdropM', { map: bd, roughness: 0.85, emissive: '#1a2550', emissiveIntensity: 0.25 }), 0, ST.h, -hd + 0.03, { cast: false });
    const goldGlow = M.std('hallGoldGlow', { color: '#ffe2a0', emissive: '#ffc04a', emissiveIntensity: 1.5, roughness: 0.4 });
    for (const sx of [-1, 1]) ctx.box(0.06, 4.0, 0.05, goldGlow, sx * 3.2, ST.h, -hd + 0.06, { cast: false });
    ctx.box(6.46, 0.06, 0.05, goldGlow, 0, ST.h + 4.0 - 0.06, -hd + 0.06, { cast: false });
    // proscenium pilasters either side of the stage
    for (const sx of [-1, 1]) {
      ctx.box(0.5, H, 0.6, M.std('hallPros', { color: '#7a2630', roughness: 0.85 }), sx * (ST.w / 2 + 0.25), 0, -hd + 0.3, { collide: true, cast: false });
      ctx.box(0.06, H - 0.4, 0.05, goldGlow, sx * (ST.w / 2 + 0.25), 0.2, -hd + 0.62, { cast: false });
    }
    // curtains (fixtures, breakable) + the town-hall screen on its trusses
    for (const sx of [-1, 1]) ctx.prop('curtain', sx * 4.6, -hd, 0, { w: 2.8, h: 4.0, y: ST.h, noCast: true });
    ctx.prop('hallScreen', 0, -8.4, 0, { tag: 'hallScreen', hp: 8, noCast: true });
    screenOff = M.std('hallScreenOff', { roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.22, map: ctx.canvasTex('hallScreenOff', 512, 290, (x, w, h) => {
      x.fillStyle = '#10131c'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { x.fillStyle = ['#ff3b6b', '#3bff8a', '#3b8aff', '#ffffff'][i % 4]; x.globalAlpha = 0.35; x.fillRect(0, (i * 37) % h, w, 3); }
      x.globalAlpha = 1; x.strokeStyle = 'rgba(230,236,255,0.85)'; x.lineWidth = 2;
      const cx = 300, cy = 120; for (let i = 0; i < 11; i++) { const a = i * 0.57 + 0.2; let px = cx, py = cy; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += Math.cos(a + (k % 2 ? 0.3 : -0.25)) * 60; py += Math.sin(a + (k % 2 ? 0.3 : -0.25)) * 60; x.lineTo(px, py); } x.stroke(); }
      x.fillStyle = '#c9d2e6'; x.font = 'bold 40px ' + ctx.KFONT; x.textAlign = 'center'; x.fillText('신호 없음', w / 2, h - 46);
    }) });
    // podium (flip it!), MC's mic stand, megaphone, spotlights on the stage
    ctx.prop('podium', -2.0, -6.25, 0, { y: ST.h, tag: 'podium' });
    ctx.prop('micStand', -3.7, -6.15, 0.2, { y: ST.h });
    ctx.prop('megaphone', 3.6, -5.95, -0.4, { y: ST.h });
    ctx.prop('spotlight', -5.5, -8.3, Math.atan2(5.5, 2.7), { y: ST.h });
    ctx.prop('spotlight', 5.5, -8.3, Math.atan2(-5.5, 2.7), { y: ST.h });
    // floor: spotlights aimed at the stage, speakers on tripods either side
    ctx.prop('spotlight', -8.2, -3.4, Math.atan2(8.2, -3.9));
    ctx.prop('spotlight', 8.2, -3.4, Math.atan2(-8.2, -3.9));
    ctx.prop('speaker', -6.9, -6.5, 0.3, { tag: 'spkL', hp: 4 });
    ctx.prop('speaker', 6.9, -6.5, -0.3, { tag: 'spkR', hp: 4 });
    // the banner across the top of the stage (hung from the ceiling on two wires)
    ctx.prop('banner', 0, -5.45, 0, { text: '창립 30주년 기념 전사 타운홀', w: 7.2, h: 0.62, y: 3.15 });
    const wire = M.std('hallWire', { color: '#c9ced4', roughness: 0.4, metalness: 0.6 });
    for (const sx of [-1, 1]) ctx.box(0.012, H - 3.77, 0.012, wire, sx * 3.5, 3.77, -5.42, { cast: false });
    // side-wall slogans
    ctx.prop('banner', -hw, -1.0, PI / 2, { text: '열정! 도전! 혁신!', w: 3.6, h: 0.56, y: 2.95 });
    ctx.prop('banner', hw, -1.0, -PI / 2, { text: '열정! 도전! 혁신!', w: 3.6, h: 0.56, y: 2.95 });
    // warm pools of light on the stage + the back
    ctx.light(-2.6, 3.7, -5.9, { color: '#ffd7a0', intensity: 9, distance: 9, decay: 1.5 });
    ctx.light(2.8, 3.7, -5.9, { color: '#ffe2bc', intensity: 8, distance: 9, decay: 1.5 });
    ctx.light(7.6, 2.6, 7.2, { color: '#ffc98c', intensity: 5, distance: 6.5, decay: 1.6 });

    // ---------------- red-carpet aisle from the elevators to the stage
    ctx.decal(0, 1.6, 1.5, 14.0, { color: '#a32f3a', key: 'hallRunner' });
    for (const sx of [-1, 1]) ctx.decal(sx * 0.78, 1.6, 0.06, 14.0, { color: '#e2b43c', key: 'hallRunnerEdge' });

    // ---------------- folding chairs: 4 rows × 10, centre aisle; three front-row places left empty (story)
    const slotKey = new Set(SLOTS.map(([x, z]) => x + ',' + z));
    for (const z of ROWS) for (const s of [-1, 1]) for (const c of COLS) {
      const x = s * c;
      if (slotKey.has(x + ',' + z)) continue;
      ctx.prop('foldchair', x, z, PI);
    }
    SLOTS.forEach(([x, z], i) => ctx.anchor('slot' + i, x, z));
    // the last three chairs, still by the storage corner (story: carry them to the front)
    [[-7.6, 7.75, PI + 0.15], [-7.0, 7.85, PI - 0.1], [-6.4, 7.7, PI + 0.3]].forEach(([x, z, r], i) => ctx.prop('foldchair', x, z, r, { tag: 'setChair' + i }));
    ctx.anchor('stackPick', -7.0, 6.95);
    for (const [x, z, y, r] of [[-8.9, 8.45, 0, 0.1], [-8.35, 8.5, 0, -0.15], [-8.65, 8.45, 0.3, 0.35], [-9.6, 8.4, 0, 0.2]]) ctx.prop('box', x, z, r, { y });

    // ---------------- wreaths by the elevators (each text is its own draw — four is the budget)
    [[-4.8, '축 창립 30주년', '대표이사'], [-3.8, '축 발전', '거래처 일동'], [3.8, '축 타운홀', '노동조합'], [4.8, '축 대박', '인사팀 일동']]
      .forEach(([x, text, from]) => ctx.prop('wreath', x, 8.35, PI, { text, from }));

    // ---------------- balloon bunches (fixed = anchored to a little weight; one hit pops them)
    const weight = M.std('hallBalWeight', { color: '#d9ad4a', roughness: 0.35, metalness: 0.6 });
    const bunch = (x, z, k = 0) => {
      [[0, 0], [0.27, 0.09], [0.08, -0.26]].forEach(([dx, dz], i) => ctx.prop('balloon', x + dx, z + dz, i * 1.3, { color: BAL[(i + k) % 3], as: 'fixed', solid: false, scale: 1.3 }));
      ctx.box(0.14, 0.08, 0.14, weight, x + 0.12, 0, z - 0.05, { cast: false });
    };
    bunch(-4.9, -5.25, 0); bunch(3.9, -5.25, 1); bunch(-7.9, -5.0, 2); bunch(7.9, -5.0, 0);
    bunch(-10.4, -3.0, 1); bunch(10.2, -3.0, 2); bunch(-10.4, 3.2, 0); bunch(10.2, 3.2, 1);
    bunch(-5.9, 8.2, 2); bunch(5.7, 8.2, 0);

    // ---------------- refreshment table at the back (east)
    ctx.prop('meetingTable', 7.8, 7.9, 0);
    for (const [x, z] of [[6.95, 7.7], [7.15, 7.95], [7.35, 7.72], [8.8, 8.05]]) ctx.prop('hotCoffee', x, z, x, { y: 0.75 });
    ctx.prop('cupStack', 8.4, 7.75, 0, { y: 0.75 });
    ctx.prop('cupStack', 8.8, 7.65, 0.6, { y: 0.75 });
    ctx.prop('box', 7.9, 8.1, 0.2, { y: 0.75 });
    ctx.prop('box', 7.85, 7.65, -0.15, { y: 0.75 });
    ctx.prop('waterCooler', 9.8, 8.55, PI);
    ctx.prop('trashcan', 6.2, 8.6);

    // ---------------- safety + plants + toys on the walls
    for (const x of [-8, -3, 3, 8]) for (const z of [-3.2, 2.8]) ctx.prop('sprinkler', x, z);
    ctx.prop('alarmBell', -hw, 2.0, PI / 2, { y: 1.3 });
    ctx.prop('extinguisher', -10.8, 6.6, PI / 2);
    ctx.prop('extinguisher', 10.8, -6.8, -PI / 2);
    for (const [x, z] of [[-10.3, 8.3], [10.3, -8.3], [-10.3, -8.3], [10.3, 5.8]]) ctx.prop('plantBig', x, z);

    // ---------------- people
    // MC on the stage by the mic stand
    ctx.npc('workerF1', -3.7, -6.7, { rotY: 0.15, anim: 'talk', role: 'mc', face: 'smile', variantSeed: 301,
      look: { suit: '#c8372b', pants: '#2a2c33' },
      lines: ['곧 시작합니다~ 착석해 주세요!', '휴대폰은 무음으로 부탁드려요~', '앞자리부터 채워 주세요!'] });
    // 사장님 in the front row (aisle seat), the audience scattered and bored
    const sitAt = (preset, x, z, o) => ctx.npc(preset, x, z + 0.08, Object.assign({ rotY: PI, anim: 'sit' }, o));
    sitAt('boss', -1.15, ROWS[0], { role: 'ceo', face: 'smug', variantSeed: 302, lines: ['에헴, 오늘 할 말이 좀 많아~', '자네도 앞으로 와서 앉게!'] });
    sitAt('workerM2', 1.77, ROWS[1], { face: 'normal', variantSeed: 303, lines: ['이거 몇 시에 끝나요?'] });
    sitAt('workerM1', -2.39, ROWS[2], { face: 'sleepy', variantSeed: 304, lines: ['(꾸벅…)'] });
    sitAt('workerF2', 2.39, ROWS[2], { anim: 'stretch', face: 'sleepy', variantSeed: 305 });
    sitAt('chubby', -1.77, ROWS[3], { face: 'sleepy', variantSeed: 306, lines: ['다과는 언제 줘요…?'] });
    ctx.npc('workerF2', -5.2, 4.6, { rotY: 2.4, anim: 'phone', face: 'normal', variantSeed: 307, lines: ['출석 체크만 하고 가야지…'] });
    ctx.npc('glasses', 7.2, -1.6, { rotY: -2.3, anim: 'lookUp', face: 'sleepy', variantSeed: 308, lines: ['풍선 누가 다 불었대…?'] });

    // ---------------- anchors
    ctx.spawn(0, 6.7, PI);
    ctx.anchor('podiumBack', -2.0, -6.95);
    ctx.anchor('mcAside', -4.6, -6.6);
    ctx.anchor('listenSpot', 0.0, 1.8);
    ctx.hide(-10, -6.6); ctx.hide(10, -6.6); ctx.hide(-9.8, 1.0); ctx.hide(9.6, 2.0);
    A.titleCam = { pos: V(6.5, 2.3, 3.2), look: V(-1.0, 1.4, -6.5) };
  },

  challenges: [
    { id: 'h1', text: '단상 엎기', kind: 'flip', type: 'podium', bonus: 80000 },
    { id: 'h2', text: '풍선 10개 터뜨리기', kind: 'break', type: 'balloon', n: 10, bonus: 50000 },
    { id: 'h3', text: '대형 화면 부수기', kind: 'break', tag: 'hallScreen', bonus: 120000 },
    { id: 'h4', text: '접이식 의자 20개 부수기', kind: 'break', type: 'foldchair', n: 20, bonus: 60000 },
    { id: 'h5', text: '화환 4개 부수기', kind: 'break', type: 'wreath', n: 4, bonus: 60000 },
    { id: 'h6', text: '스피커 2대 터뜨리기', kind: 'break', type: 'speaker', n: 2, bonus: 70000 },
  ],

  // story: after lunch, before B2's 오후 3:00
  scene: {
    id: 'hallSetup', time: '오후 2:00', title: '타운홀 의자 깔기', sub: '“김 대리, 3층에 의자 좀 깔아 줘”',
    start: { floor: 'office', seat: 'playerSeat', preset: 'day', music: 'office', stress: 48 },
    steps: [
      { mission: { title: '타운홀 의자 깔기', sub: '7층 · 오후 2:00', quote: '김 대리, 3층에 의자 좀 깔아 줘' } },
      { tasks: ['3층 대강당 가기', '접이식 의자 3개 펴기', '사장님 말씀 듣기'] },
      { wait: 0.6 },
      { sub: ['부장', '김 대리~ 타운홀 30분 남았는데 3층 의자가 모자란대. 가서 좀 깔아!', 3000], sfx: 'mumbleLow' },
      { wait: 2.6 },
      { unseat: true },
      { face: ['endure', 1.2], toast: '엘리베이터를 타고 3층으로' },
      { goto: 'hall' },
      { done: 0, mission: { title: '타운홀 의자 깔기', sub: '3층 · 오후 2:05', quote: '김 대리, 3층에 의자 좀 깔아 줘' } },
      { say: ['mc', '아, 오셨어요? 뒤에 남은 의자, 앞줄 빈자리에 깔아 주세요~', 3.0] },
      { hold: { tag: 'setChair0', at: 'stackPick', text: '의자 들기', sec: 0.5 } },
      { call: (g) => pickChair(g, 0) },
      { hold: { at: 'slot0', text: '의자 펴기', sec: 0.7 } },
      { call: (g) => placeChair(g), sfx: 'hitMetal' },
      { hold: { tag: 'setChair1', at: 'stackPick', text: '의자 들기', sec: 0.5 } },
      { call: (g) => pickChair(g, 1) },
      { hold: { at: 'slot1', text: '의자 펴기', sec: 0.7 } },
      { call: (g) => placeChair(g), sfx: 'hitMetal' },
      { hold: { tag: 'setChair2', at: 'stackPick', text: '의자 들기', sec: 0.5 } },
      { call: (g) => pickChair(g, 2) },
      { hold: { at: 'slot2', text: '의자 펴기', sec: 0.7 } },
      { call: (g) => placeChair(g), sfx: 'hitMetal', done: 1, stress: 1 },
      { sub: ['나', '(…의자는 왜 항상 내가 까는 걸까)', 2000] },
      { say: ['mc', '자, 지금부터 창립 기념 타운홀을 시작하겠습니다! 박수~', 2.8], sfx: 'clap' },
      { walk: { to: 'listenSpot', r: 0.9 } },
      { npc: { who: 'mc', walk: 'mcAside', speed: 1.2, anim: 'walk' } },
      { npc: { who: 'ceo', walk: 'podiumBack', speed: 1.25, anim: 'walk', arrive: 'talk' } },
      { wait: 4.2 },
      { mission: { title: '타운홀 의자 깔기', sub: '3층 · 오후 2:10', quote: '사장님 말씀이 있겠습니다' }, sub: ['사장님', '에… 우리 회사가 말이야, 30년 전 단칸방에서 시작했어.', 3000], sfx: 'mumbleLow' },
      { wait: 3.2 },
      { mission: { title: '타운홀 의자 깔기', sub: '3층 · 오후 2:24', quote: '사장님 말씀이 있겠습니다' }, sub: ['사장님', '그래서 내가 그때 뭐라 그랬냐면… 가족 같은 회사!', 3000], sfx: 'mumbleLow' },
      { wait: 3.2 },
      { sub: ['사장님', '마지막으로 딱 한 말씀만 더…', 2600], sfx: 'clockTick', stress: 2, face: ['endure', 1.5] },
      { wait: 2.8 },
      { mission: { title: '타운홀 의자 깔기', sub: '3층 · 오후 2:38', quote: '사장님 말씀이 있겠습니다' }, sub: ['나', '(…시계가 멈춘 것 같다)', 2000] },
      { wait: 2.2 },
      { sub: ['사장님', '아, 그리고 정말 한 말씀만 더…', 2600], sfx: 'clockTick', stress: 2, face: ['endure', 1.5] },
      { wait: 2.8 },
      { say: ['mc', '(사장님, 시간이…)', 2.0] },
      { mission: { title: '타운홀 의자 깔기', sub: '3층 · 오후 2:52', quote: '사장님 말씀이 있겠습니다' }, sub: ['사장님', '진짜 마지막으로, 한 말씀만 더 하자면…!', 2800], sfx: 'sigh', stress: 3, face: ['endure', 2.5] },
      { wait: 3.0, done: 2 },
    ],
  },

  hooks: {
    // stage height for the player and for people (the core only knows y = 0)
    onTick(game, dt) {
      const P = game.P, S = game.S;
      if (!P || !S) return;
      // a chair carried in the story but dropped by a skip / rampage start → put it on its place
      if (carried && carriedS !== S) carried = null;            // a new run rebuilt the floor
      if (carried && P.carry !== carried.group) placeChair(game);
      if (!P.seated) {
        const h = heightAt(P.pos.x, P.pos.z);
        if (P.onGround) {
          if (h > P.y + 1e-3) P.y = h;                          // step up (stage edge or stairs)
          else if (h < P.y - 1e-3) {
            if (P.y - h <= 0.2) P.y = h;                        // step down a stair
            else { P.onGround = false; P.vy = 0; }              // walk off the stage → fall
          }
        } else if (h > 0 && P.vy <= 0 && P.y <= h && P.y > h - 0.4) { P.y = h; P.vy = 0; P.onGround = true; }
      }
      for (const n of S.npcs) {
        if (n.gone || n.state === 'air') continue;
        const h = heightAt(n.pos.x, n.pos.z);
        if (n.y !== h) n.y = h > n.y ? h : Math.max(h, n.y - dt * 3.5);
      }
    },
    onDestroy(game, rec) {
      // the smashed screen loses its slide: static + cracks
      if (rec.tag === 'hallScreen' && screenOff) rec.group.traverse((m) => { if (m.isMesh && m.material && m.material.map) m.material = screenOff; }); // (the slide is the only textured part)
      const mc = game.npc('mc');
      if (!mc || mc.gone) return;
      if (rec.tag === 'hallScreen') game.say(mc, '화… 화면이!! 발표 자료가!!', 2.6);
      else if (rec.type === 'speaker') game.say(mc, '아, 아, 마이크 테스트… 소리가 안 나요!', 2.4);
    },
  },
};
