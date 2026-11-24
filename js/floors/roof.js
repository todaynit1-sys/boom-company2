// R · 옥상 — open-air rooftop of the office tower. Low parapet + railing all round (things can be thrown over it,
// people cannot), the stair-house with the elevator pair, the water tank, solar rows, a column of AC units, the
// smokers' pergola, 부장님's lettuce beds, a helipad and a sky panorama with clouds and neighbouring rooftops.
// Contract: js/floors/README.md (reference floor: parking.js).
const PI = Math.PI;

// layout (metres). Roof 28 × 18, x east, z south. Stair-house (elevators) on the west edge, centred on z = 0.
const W = 28, D = 18, H = 6;          // H = physics lid / camera ceiling (open air, nothing is drawn there)
const HW = W / 2, HD = D / 2;
const EDGE = 0.24;                     // parapet thickness (railing prop)
const IN_X = HW - EDGE, IN_Z = HD - EDGE; // inner faces of the parapet
const SX = -12.3, SZ = 2.92, SH = 3.2; // stair-house front plane, half width, height
const ZSEG = (2 * IN_Z) / 9;           // railing segment length on the short sides (1.9467)

// sky panorama: one mesh per floor build, its material swapped by the time of day (hooks)
let skyMesh = null;
const SKYMAT = {};

export default {
  id: 'roof', label: 'R', key: 'KeyR', name: 'R · 옥상', sub: '물탱크와 하늘 정원',
  size: { w: W, d: D, h: H },
  // open air: follow the time of day, but with a clear, far haze (fog colour = horizon colour of the panorama)
  light: (t) => (t === 'sunset'
    ? { preset: 'sunset', fog: '#e7a98f', fogNear: 45, fogFar: 150 }
    : { preset: t === 'noon' ? 'noon' : 'day', fog: '#d9e8f4', fogNear: 45, fogFar: 160, hemiI: 1.05, env: 0.42 }),
  music: 'lobby', stepSfx: 'step',

  build(ctx) {
    const { M, tex2, V, THREE } = ctx;
    const A = ctx.anchors;

    // ---------------- roof surface
    ctx.floor(M.tex('roofFloor', tex2.asphaltRoof(), W / 2, D / 2, { roughness: 0.9 }), W, D);

    // ---------------- parapet + railing all round (decor; our own colliders: low body for props, tall rect for people)
    for (let i = 0; i < 14; i++) {
      const x = -HW + 1 + i * 2;
      ctx.prop('railing', x, -HD + EDGE / 2, 0, { w: 2, as: 'decor', solid: false });
      ctx.prop('railing', x, HD - EDGE / 2, PI, { w: 2, as: 'decor', solid: false });
    }
    for (let i = 0; i < 9; i++) {
      const z = -IN_Z + ZSEG / 2 + i * ZSEG;
      ctx.prop('railing', HW - EDGE / 2, z, PI / 2, { w: ZSEG, as: 'decor', solid: false });
      if (Math.abs(z) > SZ) ctx.prop('railing', -HW + EDGE / 2, z, -PI / 2, { w: ZSEG, as: 'decor', solid: false });
    }
    const edge = (x, z, hx, hz) => { ctx.collider(x, z, hx, hz, 0.6); ctx.rect(x, z, hx + 0.06, hz + 0.06, 0, H); };
    edge(0, -HD + EDGE / 2, HW, EDGE / 2);
    edge(0, HD - EDGE / 2, HW, EDGE / 2);
    edge(HW - EDGE / 2, 0, EDGE / 2, HD);
    edge(-HW + EDGE / 2, -(HD + SZ) / 2, EDGE / 2, (HD - SZ) / 2);
    edge(-HW + EDGE / 2, (HD + SZ) / 2, EDGE / 2, (HD - SZ) / 2);
    const OUT = '옥상 밖으로!';
    ctx.outZone({ axis: 'z', at: -IN_Z, side: -1, from: -HW, to: HW, label: OUT });
    ctx.outZone({ axis: 'z', at: IN_Z, side: 1, from: -HW, to: HW, label: OUT });
    ctx.outZone({ axis: 'x', at: IN_X, side: 1, from: -HD, to: HD, label: OUT });
    ctx.outZone({ axis: 'x', at: -IN_X, side: -1, from: -HD, to: -SZ, label: OUT });
    ctx.outZone({ axis: 'x', at: -IN_X, side: -1, from: SZ, to: HD, label: OUT });

    // ---------------- the building under us, the city around, the sky
    const facade = M.tex('roofFacade', facadeTex(ctx, 'own', '#dfe7ee', '#7fa9c9', '#c3ced8'), 7, 11, { roughness: 0.5 });
    ctx.box(W + 0.4, 44.9, D + 0.4, facade, 0, -45, 0, { cast: false, receive: false });
    ctx.box(W + 0.5, 0.14, D + 0.5, M.std('roofLedge', { color: '#cfc9bf', roughness: 0.85 }), 0, -0.6, 0, { cast: false, receive: false });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), M.std('roofGround', { color: '#9aa39a', roughness: 1 }));
    ground.rotation.x = -PI / 2; ground.position.set(0, -45, 0); ground.receiveShadow = false; ground.castShadow = false;
    ctx.add(ground);
    const fA = M.tex('nbA', facadeTex(ctx, 'a', '#efe6d6', '#8fb0cc', '#d9cdb8'), 3, 9, { roughness: 0.8 });
    const fB = M.tex('nbB', facadeTex(ctx, 'b', '#a9c4dc', '#5f88ad', '#8fb0cc'), 3, 9, { roughness: 0.35, metalness: 0.15 });
    const fC = M.tex('nbC', facadeTex(ctx, 'c', '#e6c7b4', '#7f97b0', '#d2b29c'), 3, 9, { roughness: 0.85 });
    const topM = M.std('nbTop', { color: '#b8bcbf', roughness: 0.95 });
    // [x, z, w, d, top, material]  (tops mostly below our roof → you look down onto them)
    const NB = [[-38, -30, 14, 12, -7, fA], [-6, -38, 16, 12, -12, fC], [28, -38, 12, 12, 7, fB], [44, -6, 12, 16, -4, fA],
      [38, 24, 14, 12, -14, fC], [8, 36, 16, 12, -6, fA], [-24, 38, 12, 12, 9, fB], [-44, 8, 12, 14, -10, fC], [-58, -20, 10, 10, 14, fB], [58, 40, 12, 12, 18, fB]];
    for (const [x, z, w, d, top, m] of NB) {
      ctx.box(w, top + 45, d, m, x, -45, z, { cast: false, receive: false });
      ctx.box(w + 0.4, 0.5, d + 0.4, topM, x, top, z, { cast: false, receive: false });
      ctx.box(w * 0.3, 1.6, d * 0.25, topM, x + w * 0.18, top + 0.5, z - d * 0.2, { cast: false, receive: false });
    }
    // panorama cylinder (horizon ≈ 62 % down the texture → put it near eye level) + a lid in the top colour
    const R = 82, HS = 90, Y0 = 1.6 - 0.38 * HS;
    const skyG = new THREE.CylinderGeometry(R, R, HS, 48, 1, true);
    skyMat(THREE, tex2, 'dusk'); // both built up front; hooks swap them by the light preset
    skyMesh = new THREE.Mesh(skyG, skyMat(THREE, tex2, 'day'));
    skyMesh.position.set(0, Y0 + HS / 2, 0); skyMesh.renderOrder = -1; skyMesh.userData.kind = 'day';
    skyMesh.castShadow = false; skyMesh.receiveShadow = false; skyMesh.frustumCulled = false;
    ctx.add(skyMesh, { decor: false }); ctx.dispose(skyG);
    // cartoon clouds drifting high above the city (decor: one merged draw)
    [[-30, -40, 16, 5, 1], [18, -52, 20, 6, 2], [52, -18, 14, 4.5, 3], [44, 30, 18, 5.5, 4], [-12, 48, 15, 5, 5], [-50, 16, 19, 6, 6], [6, -30, 24, 3.6, 7]]
      .forEach(([x, z, y, s, seed]) => ctx.prop('cloud', x, z, seed * 0.7, { y, scale: s, seed, solid: false }));

    // ---------------- stair-house with the elevator pair (west edge, facing +x)
    const houseM = M.tex('stairWall', tex2.concrete(), 1.6, 2.4, { roughness: 0.92, color: '#f6efe2' });
    const trimM = M.std('stairTrim', { color: '#4f9aa8', roughness: 0.6 });
    ctx.wall('z', SX, -1, -SZ, SZ, SH, houseM, [{ a0: -2.1, a1: -1.1, top: 2.1 }, { a0: 1.1, a1: 2.1, top: 2.1 }]);
    ctx.wall('x', -SZ, 1, -HW, SX - 0.2, SH, houseM);
    ctx.wall('x', SZ, -1, -HW, SX - 0.2, SH, houseM);
    ctx.box(0.2, SH, 2 * SZ - 0.4, houseM, -HW + 0.1, 0, 0, { cast: false });
    ctx.box(HW + SX + 0.34, 0.2, 2 * SZ + 0.3, M.tex('stairRoof', tex2.concrete(), 1.4, 4, { roughness: 1, color: '#d8d2c8' }), (SX + 0.17 - HW) / 2, SH, 0);
    ctx.box(0.05, 0.3, 2 * SZ + 0.1, trimM, SX + 0.025, SH - 0.3, 0, { cast: false });
    for (const s of [-1, 1]) ctx.box(HW + SX + 0.02, 0.3, 0.05, trimM, (SX - HW) / 2, SH - 0.3, s * (SZ + 0.025), { cast: false });
    ctx.box(0.05, 0.16, 2 * SZ + 0.1, trimM, SX + 0.025, 0, 0, { cast: false });
    [-1.6, 1.6].forEach((z, i) => ctx.elevator(SX, z, PI / 2, 'R', i));
    ctx.decorProp('floorSign', SX + 0.015, 1.55, 0, PI / 2, { text: 'R', h: 0.42 });
    ctx.decorProp('floorSign', SX + 0.015, 2.47, 0, PI / 2, { text: '옥상', h: 0.34, color: '#2f6f7c', underline: false }, { cast: false });
    // stair door on the north face + sign; garden sign on the south face
    ctx.box(0.95, 2.05, 0.05, M.std('stairDoor', { color: '#7d93a8', roughness: 0.5, metalness: 0.2 }), -13.25, 0, -SZ - 0.025, { cast: false });
    ctx.box(0.12, 0.03, 0.04, M.std('stairKnob', { color: '#d9dde2', roughness: 0.3, metalness: 0.7 }), -12.9, 1.0, -SZ - 0.07, { cast: false });
    ctx.decorProp('floorSign', -13.25, 2.18, -SZ - 0.06, PI, { text: '계단실', h: 0.22, underline: false }, { cast: false });
    ctx.decorProp('floorSign', -13.15, 1.75, SZ + 0.012, 0, { text: '옥상 텃밭', h: 0.3, color: '#3f7a3a' }, { cast: false });

    // ---------------- helipad (centre) + painted walkway from the elevators
    ctx.prop('helipad', 2.2, 0.6, PI / 2, { r: 2.8 }); // H reads upright from the elevators
    for (let x = -10.6; x < -1.2; x += 1.2) ctx.decal(x, 0, 0.6, 0.12, { color: '#f2c21b', key: 'roofDash' });

    // ---------------- water tank (NE) on a hatched pad
    ctx.decal(9.6, -6.3, 3.4, 3.4, { map: hatchTex(ctx), key: 'roofHatch' });
    ctx.prop('watertank', 9.6, -6.4, 0, { tag: 'watertank' });
    for (const [x, z] of [[7.6, -4.3], [11.6, -4.3], [9.6, -3.9]]) ctx.prop('cone', x, z);

    // ---------------- solar rows (north, facing south toward the middle of the roof)
    let sn = 0;
    for (const z of [-7.5, -5.6]) for (const x of [-4.4, -2.4, -0.4, 1.6]) {
      ctx.prop('solar', x, z, 0, sn === 6 ? { tag: 'solarFix' } : {});
      sn++;
    }

    // ---------------- AC units: one long column along the east parapet, fans facing the roof
    for (let i = 0; i < 8; i++) ctx.prop('acunit', IN_X - 0.2, -3.3 + i * 1.12, -PI / 2);

    // ---------------- vents, antenna
    for (const [x, z] of [[-6.6, -7.4], [4.9, -7.5], [6.3, 2.9], [-5.6, 3.4]]) ctx.prop('vent', x, z);
    ctx.prop('antenna', 12.5, -7.9, 0.3);

    // ---------------- smokers' pergola (SE): wooden frame, benches, ashtrays, vending machine
    const wood = M.std('pergolaWood', { color: '#c58e55', roughness: 0.7 });
    const PX0 = 7.3, PX1 = 11.5, PZ0 = 6.55, PZ1 = 8.55;
    for (const x of [PX0, PX1]) for (const z of [PZ0, PZ1]) ctx.box(0.12, 2.4, 0.12, wood, x, 0, z, { collide: true });
    for (const z of [PZ0, PZ1]) ctx.box(PX1 - PX0 + 0.4, 0.14, 0.12, wood, (PX0 + PX1) / 2, 2.4, z);
    for (let i = 0; i < 10; i++) ctx.box(0.08, 0.06, PZ1 - PZ0 + 0.5, wood, PX0 - 0.1 + i * (PX1 - PX0 + 0.2) / 9, 2.54, (PZ0 + PZ1) / 2);
    ctx.prop('bench', 8.4, 8.15, PI);
    ctx.prop('bench', 10.4, 8.15, PI);
    ctx.prop('ashtray', 7.0, 7.7);
    ctx.prop('ashtray', 11.95, 6.9);
    ctx.prop('vending', IN_X - 0.42, 7.75, -PI / 2);
    ctx.prop('extinguisher', IN_X - 0.25, 5.85, -PI / 2);

    // ---------------- 부장님 텃밭 (SW): raised beds on a wooden deck, styrofoam lettuce boxes
    ctx.decal(-9.55, 7.05, 4.0, 3.2, { map: deckTex(ctx), key: 'roofDeck' });
    const bedM = M.std('bedWood', { color: '#a8754a', roughness: 0.8 });
    const lx = [-10.5, -9.9, -9.3, -8.7];
    for (const [bz, row] of [[6.3, 0], [7.75, 1]]) {
      ctx.box(2.6, 0.3, 0.7, bedM, -9.6, 0, bz, { collide: true });
      lx.forEach((x, i) => ctx.prop('lettuce', x, bz, (i % 2 ? 0.05 : -0.05), { y: 0.3, tag: row === 0 && i === 2 ? 'lettuceW' : row === 1 && i === 3 ? 'lettuceBoss' : null }));
    }
    ctx.prop('trashcan', -7.6, 8.25);

    // ---------------- break corner (south middle): table under a striped parasol, megaphone on the table
    ctx.prop('roundTable', -2.6, 5.8);
    ctx.prop('cafeChair', -1.85, 5.8, -PI / 2, { color: '#d6a23b' });
    ctx.prop('cafeChair', -3.35, 5.9, PI / 2, { color: '#d6a23b' });
    ctx.prop('megaphone', -2.5, 5.7, 0.7, { y: 0.74, tag: 'megaphone' });
    parasol(ctx, -3.5, 4.95);
    ctx.prop('trashcan', -0.9, 7.9);

    // ---------------- throwables & greenery
    for (const [x, z, y, r] of [[-11.5, -4.1, 0, 0.1], [-11.05, -4.15, 0, -0.15], [-11.3, -4.1, 0.3, 0.3], [-10.6, -4.6, 0, 0.5]]) ctx.prop('box', x, z, r, { y });
    ctx.prop('parcel', -10.2, -3.9, 0.3);
    ctx.prop('parcel', 5.6, -5.0, -0.4);
    ctx.prop('plantBig', -12.0, -3.55);
    ctx.prop('plantBig', -12.0, 3.6);
    ctx.prop('plant', 12.7, -4.6);
    ctx.prop('plant', -0.4, 8.25);
    ctx.prop('extinguisher', -11.8, -3.45, PI / 2);
    // the secret smoking spot between the stair-house and the garden
    ctx.prop('ashtray', -10.7, 4.0);

    // ---------------- people (on a break; they flee when the rampage starts)
    ctx.npc('workerM2', -9.75, 4.25, { rotY: -2.4, anim: 'armsCrossed', role: 'smoker', rank: 'mid', face: 'relief', variantSeed: 91,
      lines: ['여기서 부장님 얘기하면 안 돼…', '한 대만 피고 갈게~', '옥상 바람이 최고야'] });
    ctx.npc('workerF1', -7.7, 7.0, { rotY: -PI / 2, anim: 'offer', role: 'gardener', face: 'smile', variantSeed: 92,
      lines: ['부장님 상추 건드리면 큰일 나요!', '물은 하루 한 번만~', '이게 다 부장님 거래요…'] });
    ctx.npc('workerF2', 9.4, 6.95, { rotY: 0.5, anim: 'phone', role: 'worker', variantSeed: 93, lines: ['점심 뭐 먹었어요?', '옥상 오면 살 것 같아…'] });
    ctx.npc('glasses', 4.2, 7.9, { rotY: 0.2, anim: 'stretch', role: 'worker', face: 'relief', variantSeed: 94, lines: ['으아~ 허리야', '하늘 본 지 얼마 만이지'] });

    // ---------------- anchors
    ctx.spawn(-8.6, 0, PI / 2);
    ctx.anchor('smokeBlock', -10.6, 3.35);
    ctx.anchor('smokeCorner', 10.9, 7.15);
    ctx.anchor('waterSpot', -9.3, 5.4);
    ctx.anchor('solarSpot', 1.6, -4.55);
    ctx.hide(-12.8, -7.8); ctx.hide(12.6, -2.2); ctx.hide(5.8, 7.9); ctx.hide(-6.2, -5.8);
    A.titleCam = { pos: V(-6.5, 2.5, 3.8), look: V(6, 1.0, -4.5) };
    void V;
  },

  challenges: [
    { id: 'r1', text: '옥상에서 10개 던지기', kind: 'out', n: 10, bonus: 80000 },
    { id: 'r2', text: '물탱크 터뜨리기', kind: 'break', tag: 'watertank', bonus: 100000 },
    { id: 'r3', text: '태양광 패널 6장 깨기', kind: 'break', type: 'solar', n: 6, bonus: 70000 },
    { id: 'r4', text: '실외기 5대 부수기', kind: 'break', type: 'acunit', n: 5, bonus: 70000 },
    { id: 'r5', text: '확성기로 5번 소리 지르기', kind: 'shout', n: 5, bonus: 50000 },
    { id: 'r6', text: '부장님 상추 옥상 밖으로', kind: 'out', type: 'lettuce', bonus: 100000 },
  ],

  // story: after lunch the boss sends you up to water his lettuce (between 12:10 coffee and B2's 3:00)
  scene: {
    id: 'roofLettuce', time: '오후 1:10', title: '옥상 상추 물 주기', sub: '“내 상추 물 좀 주고 와~”',
    start: { floor: 'office', seat: 'playerSeat', preset: 'day', music: 'office', stress: 46 },
    steps: [
      { mission: { title: '옥상 상추 물 주기', sub: '7층 · 오후 1:10', quote: '김 대리, 옥상 가서 내 상추 물 좀 줘~' } },
      { tasks: ['옥상 가기', '상추에 물 주기', '태양광 패널 각도 맞추기'] },
      { wait: 0.6 },
      { sub: ['부장', '김 대리~ 밥 먹었으면 옥상 가서 내 상추 물 좀 주고 와. 태양광 패널도 하나 삐뚤던데?', 3400], sfx: 'mumbleLow' },
      { wait: 3.0 },
      { unseat: true },
      { stress: 3, face: ['endure', 1.2], toast: '엘리베이터를 타고 옥상으로' },
      { goto: 'roof' },
      { done: 0, mission: { title: '옥상 상추 물 주기', sub: '옥상 · 오후 1:15', quote: '김 대리, 옥상 가서 내 상추 물 좀 줘~' } },
      { sub: ['나', '…바람 좋다. 상추는 텃밭 쪽이지.', 2200], face: ['relief', 2] },
      { wait: 1.6 },
      { walk: { to: 'smokeBlock', r: 1.3 } },
      { say: ['smoker', '어, 김 대리~ 한 대 피고 가~ 여기가 명당이야.', 2.8], npc: { who: 'smoker', look: 'player', anim: 'talk' } },
      { wait: 1.4 },
      { hold: { who: 'smoker', text: '좀 비켜 달라고 하기', sec: 0.8 } },
      { say: ['smoker', '아 미안미안~ 연기는 저쪽 가서 피울게.', 2.6], npc: { who: 'smoker', walk: 'smokeCorner', speed: 1.3, anim: 'walk', arrive: 'armsCrossed' }, stress: 3 },
      { hold: { tag: 'lettuceW', at: 'waterSpot', text: '상추에 물 주기', sec: 1.6 } },
      { sfx: 'pour', done: 1, sub: ['나', '(쪼르륵—) 잘 자라라, 부장님 상추…', 2200] },
      { wait: 1.2 },
      { say: ['gardener', '어… 그 상자 맞아요?', 2.2] },
      { wait: 1.0 },
      { hold: { tag: 'solarFix', at: 'solarSpot', text: '패널 각도 맞추기', sec: 1.2 } },
      { done: 2, sub: ['나', '…이 정도면 됐겠지.', 1800] },
      { wait: 1.0 },
      { sfx: 'beep', sub: ['부장 (전화)', '김 대리! 거기 김 과장 상추잖아! 내 건 맨 끝 상자라고! 패널은 또 왜 만져?', 3600] },
      { stress: 8, face: ['endure', 2.5] },
      { wait: 2.2 },
      { say: ['gardener', '…부장님 상추는 저 뒷줄 끝이에요. 크크', 2.6] },
      { wait: 2.8 },
    ],
  },

  hooks: {
    onEnter(game) { syncSky(game); windT = 0.6; },
    // open-air ambience: a soft gust every 4–7 s while you are up here
    onTick(game, dt) { syncSky(game); windT -= dt; if (windT <= 0) { windT = 4 + Math.random() * 3; game.sfx('wind', { vol: 0.32 + Math.random() * 0.15, pitch: 0.85 + Math.random() * 0.3 }); } },
    onDestroy(game, rec) {
      if (rec.tag === 'watertank') { const n = game.npc('worker'); if (n) game.say(n, '물탱크가!! 오늘 물 끊겨요!', 2.6); }
      else if (rec.type === 'lettuce') { const n = game.npc('gardener'); if (n) game.say(n, '부장님 상추가…!', 2.4); }
    },
  },
};

// ---------------- sky: tex2 panorama on a cylinder, day / dusk by the current light preset
function skyMat(THREE, tex2, kind) {
  if (!SKYMAT[kind]) {
    const t = (kind === 'dusk' ? tex2.skyDusk() : tex2.skyDay()).clone();
    t.repeat.set(2, 1); t.needsUpdate = true;
    SKYMAT[kind] = new THREE.MeshBasicMaterial({ map: t, fog: false, side: THREE.BackSide, depthWrite: false });
  }
  return SKYMAT[kind];
}
let windT = 1;
function syncSky(game) {
  if (!skyMesh || !skyMesh.parent) return;
  const want = game.G && game.G.preset === 'sunset' ? 'dusk' : 'day';
  if (skyMesh.userData.kind === want) return;
  if (!SKYMAT[want]) return;
  skyMesh.material = SKYMAT[want];
  skyMesh.userData.kind = want;
}

// ---------------- small builders / canvas textures (cached through ctx.canvasTex)
function parasol(ctx, x, z) {
  const { THREE, M } = ctx;
  const canopyT = ctx.canvasTex('roofParasol', 256, 64, (c, w, h) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f6f1e6' : '#e0573f'; c.fillRect(i * w / 8, 0, w / 8, h); }
  });
  const cg = new THREE.ConeGeometry(1.45, 0.55, 8, 1, true);
  const canopy = new THREE.Mesh(cg, M.std('roofParasolC', { map: canopyT, roughness: 0.8, side: THREE.DoubleSide }));
  canopy.position.set(x, 2.25, z); canopy.castShadow = true; canopy.receiveShadow = false;
  ctx.add(canopy);
  const pole = M.std('roofParasolP', { color: '#e9e6df', roughness: 0.4, metalness: 0.3 });
  ctx.box(0.05, 2.5, 0.05, pole, x, 0, z);
  ctx.box(0.5, 0.08, 0.5, M.std('roofParasolB', { color: '#55595f', roughness: 0.7 }), x, 0, z);
  ctx.collider(x, z, 0.12, 0.12, 2.0);
}
function facadeTex(ctx, key, base, win, band) {
  return ctx.canvasTex('roofFacade:' + key, 256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) {
      x.fillStyle = band; x.fillRect(0, j * 64, w, 8);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = win; x.fillRect(i * 64 + 8, j * 64 + 16, 48, 38);
        x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(i * 64 + 10, j * 64 + 18, 14, 34);
      }
    }
  }, { repeat: true });
}
function hatchTex(ctx) {
  return ctx.canvasTex('roofHatch', 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(242,194,27,0.9)'; x.lineWidth = 10; x.strokeRect(6, 6, w - 12, h - 12);
    x.save(); x.beginPath(); x.rect(6, 6, w - 12, h - 12); x.clip();
    x.fillStyle = 'rgba(242,194,27,0.35)';
    for (let i = -h; i < w; i += 40) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 14, h); x.lineTo(i + 14 + h, 0); x.lineTo(i + h, 0); x.fill(); }
    x.restore();
  });
}
function deckTex(ctx) {
  return ctx.canvasTex('roofDeck', 256, 256, (x, w, h) => {
    const cols = ['#b98757', '#a97a4d', '#c49261', '#b07f51'];
    for (let i = 0; i < 8; i++) {
      x.fillStyle = cols[i % 4]; x.fillRect(0, i * 32, w, 32);
      x.fillStyle = 'rgba(70,40,15,0.45)'; x.fillRect(0, i * 32, w, 3);
      x.fillStyle = 'rgba(60,35,15,0.6)'; x.fillRect(((i * 97) % 200) + 20, i * 32 + 14, 4, 4);
    }
  });
}
