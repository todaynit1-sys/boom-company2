// 12층 임원층 — plush executive floor: 사장실 (west, dark-wood panelling, CEO desk, portrait, safe, vase on its
// pedestal, liquor cabinet, putting mat), 전망 라운지 (middle, the boss's aquarium, sofas facing the skyline),
// 대회의실 (east, glass walls, board table with ten leather chairs, TV) and the 비서실 / elevator hall (south).
// The whole north side is a window wall with breakable panes (throw things — and the portrait — out of it).
// Story: 「임원 보고」 at 오전 11:20 (called up from 7층, kept waiting outside the boardroom, slide rejected
// over the font). Contract: js/floors/README.md (reference floor: parking.js).
const PI = Math.PI;

// layout (metres). Room 24 × 16, ceiling 3.2. Window wall along z = −8.
const W = 24, D = 16, H = 3.2;
const CEO_X = -4;   // 사장실 east partition (x), room x ∈ [−12, −4], z ∈ [−8, 1]
const CEO_Z = 1;    // 사장실 south partition (z)
const BR_X = 4;     // 대회의실 west glass (x), room x ∈ [4, 12], z ∈ [−8, 0.5]
const BR_Z = 0.5;   // 대회의실 south glass (z)
const CEO_DOOR = [-4.6, -2.4];   // 사장실 double door (z range on x = −4)
const BR_DOOR_S = [5.4, 6.8];    // 대회의실 door from the hall (x range on z = 0.5)
const BR_DOOR_W = [-1.5, -0.1];  // 대회의실 door from the lounge (z range on x = 4)
const CHAIR_X = [6.0, 7.0, 8.0, 9.0, 10.0];

const CEO_LINES = ['자네, 연봉 얘기 다시 해 보세!', '내 책상 뒤는 안전하겠지…', '비서! 비서 어딨어!', '이건 다 회사 재산이야!', '골프 약속 취소해!', '우리 가족 같은 회사잖아…'];

export default {
  id: 'exec', label: '12', key: 'Digit2', name: '12층 · 임원층', sub: '사장실과 대회의실',
  size: { w: W, d: D, h: H },
  light: null, // window wall → follows the time of day like 7층
  music: 'office', stepSfx: 'stepCarpet',

  build(ctx) {
    const { M, tex, tex2, V } = ctx;
    const A = ctx.anchors;
    const hw = W / 2, hd = D / 2;

    // ---------------- materials
    const po = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const parquet = M.tex('execParquet', tex2.darkWood(), W / 0.75, D / 0.75, { roughness: 0.42, metalness: 0.02 });
    const carpetR = M.tex('execCarpetR', tex.carpet('#6e2632'), 8, 9, Object.assign({ roughness: 0.97 }, po));
    const carpetG = M.tex('execCarpetG', tex.carpet('#27493c'), 8, 8.5, Object.assign({ roughness: 0.97 }, po));
    const carpetL = M.tex('execCarpetL', tex.carpet('#6e2632'), 8, 9, Object.assign({ roughness: 0.97 }, po));
    const panel = M.std('execWalnut', { color: '#4a2c1d', roughness: 0.6 });
    const pFull = panelMat(ctx, 'full'), pLow = panelMat(ctx, 'low');
    const cream = M.tex('execWall', tex.wallPaint('#efe1c9'), 6, 2, { roughness: 0.9 });
    const brass = M.std('execBrass', { color: '#c79a3c', roughness: 0.32, metalness: 0.7 });
    const bronze = M.std('execMullion', { color: '#3b2f27', roughness: 0.45, metalness: 0.3 });
    const cove = M.std('execCove', { color: '#fff1d6', emissive: '#ffc982', emissiveIntensity: 1.5, roughness: 0.4 });

    // ---------------- floors: parquet everywhere, carpets in the rooms (decals: no z-fighting)
    ctx.floor(parquet, W, D);
    ctx.decal(-8, -3.5, 8, 9, { material: carpetR, y: 0.004 });
    ctx.decal(8, -3.75, 8, 8.5, { material: carpetG, y: 0.004 });
    ctx.decal(0, -3.5, 7.6, 8.6, { material: carpetL, y: 0.004 });
    ctx.ceiling(M.ceilLobby(), W, D, H);

    // ---------------- outer walls
    const evX = [-1.6, 1.6];
    ctx.wall('x', hd, 1, -hw - 0.2, hw + 0.2, H, cream, evX.map((x) => ({ a0: x - 0.5, a1: x + 0.5, top: 2.1 })));
    ctx.wall('z', -hw, -1, -hd, hd, H, panel);      // west: wood panelling (사장실 + reception)
    ctx.wall('z', hw, 1, -hd, hd, H, cream);
    skin(ctx, pFull, 'z', -hw, -hd, hd, 0, H, PI / 2, H);
    // wainscot (walnut panels + brass rail) on the cream walls
    for (const [x0, x1] of [[-hw, -2.1], [-1.1, 1.1], [2.1, hw]]) {
      skin(ctx, pLow, 'x', hd, x0, x1, 0, 1.0, PI, 1.0);
      ctx.box(x1 - x0, 0.04, 0.04, brass, (x0 + x1) / 2, 1.0, hd - 0.02, { cast: false });
    }
    skin(ctx, pLow, 'z', hw, -hd, hd, 0, 1.0, -PI / 2, 1.0);
    ctx.box(0.04, 0.04, D, brass, hw - 0.02, 1.0, 0, { cast: false });
    // crown moulding all round
    ctx.box(W, 0.12, 0.06, panel, 0, H - 0.12, hd - 0.03, { cast: false });
    ctx.box(0.06, 0.12, D, panel, hw - 0.03, H - 0.12, 0, { cast: false });

    // ---------------- north window wall: wood sill, bronze mullions, breakable panes, skyline
    const bays = 12, bw = W / bays;
    ctx.box(W + 0.4, 0.78, 0.22, panel, 0, 0, -hd - 0.11, { collide: true });
    skin(ctx, pLow, 'x', -hd, -hw, hw, 0, 0.78, 0, 0.78);
    ctx.box(W + 0.4, 0.05, 0.3, brass, 0, 0.78, -hd - 0.05);
    ctx.box(W + 0.4, 0.45, 0.22, cream, 0, H - 0.45, -hd - 0.11);
    for (let i = 0; i <= bays; i++) ctx.box(0.1, H - 0.45 - 0.83, 0.12, bronze, -hw + i * bw, 0.83, -hd - 0.02);
    ctx.box(W, 0.06, 0.1, bronze, 0, H - 0.5, -hd - 0.02);
    ctx.window({ axis: 'z', at: -hd - 0.06, side: -1, from: -hw, to: hw, bays, y0: 0.83, y1: H - 0.5, label: '12층 창밖으로!' });
    ctx.sky('day', { radius: 40, y0: -16, h: 46, center: PI, span: 2.7 });

    // ---------------- 사장실 partitions (dark wood both sides, double door to the lounge)
    ctx.wall('z', CEO_X, 1, -hd, CEO_Z, H, panel, [{ a0: CEO_DOOR[0], a1: CEO_DOOR[1], top: 2.35 }]);
    ctx.wall('x', CEO_Z, 1, -hw, CEO_X + 0.2, H, panel);
    for (const [xf, face] of [[CEO_X, -PI / 2], [CEO_X + 0.2, PI / 2]]) {
      skin(ctx, pFull, 'z', xf, -hd, CEO_DOOR[0], 0, H, face, H);
      skin(ctx, pFull, 'z', xf, CEO_DOOR[1], CEO_Z + (face > 0 ? 0.2 : 0), 0, H, face, H);
      skin(ctx, pFull, 'z', xf, CEO_DOOR[0], CEO_DOOR[1], 2.35, H, face, H);
    }
    skin(ctx, pFull, 'x', CEO_Z, -hw, CEO_X, 0, H, PI, H);
    skin(ctx, pFull, 'x', CEO_Z + 0.2, -hw, CEO_X + 0.2, 0, H, 0, H);
    // door frame (brass) + gold sign over the door, lounge side
    ctx.box(0.06, 2.35, 0.08, brass, CEO_X + 0.2, 0, CEO_DOOR[0] - 0.03, { cast: false });
    ctx.box(0.06, 2.35, 0.08, brass, CEO_X + 0.2, 0, CEO_DOOR[1] + 0.03, { cast: false });
    ctx.box(0.06, 0.06, CEO_DOOR[1] - CEO_DOOR[0] + 0.14, brass, CEO_X + 0.2, 2.33, (CEO_DOOR[0] + CEO_DOOR[1]) / 2, { cast: false });
    wallSign(ctx, '대표이사실', CEO_X + 0.215, 2.72, (CEO_DOOR[0] + CEO_DOOR[1]) / 2, PI / 2, 1.1);
    wallSign(ctx, '대표이사실', -7.2, 1.85, CEO_Z + 0.215, 0, 1.0);
    // cove light strips round the 사장실 ceiling
    ctx.box(8, 0.04, 0.12, cove, -8, H - 0.1, -hd + 0.25, { cast: false });
    ctx.box(8, 0.04, 0.12, cove, -8, H - 0.1, CEO_Z - 0.15, { cast: false });
    ctx.box(0.12, 0.04, 8.6, cove, -hw + 0.15, H - 0.1, -3.5, { cast: false });
    ctx.box(0.12, 0.04, 8.6, cove, CEO_X - 0.15, H - 0.1, -3.5, { cast: false });

    // ---------------- 대회의실 glass walls
    const glass = (x, z, rotY, w) => ctx.decorProp('glassWall', x, 0, z, rotY, { w, h: H }, { collide: true, cast: false });
    glass(BR_X, (-hd + BR_DOOR_W[0]) / 2, PI / 2, BR_DOOR_W[0] + hd);
    glass(BR_X, (BR_DOOR_W[1] + BR_Z) / 2, PI / 2, BR_Z - BR_DOOR_W[1]);
    glass((BR_X + BR_DOOR_S[0]) / 2, BR_Z, 0, BR_DOOR_S[0] - BR_X);
    glass((BR_DOOR_S[1] + hw) / 2, BR_Z, 0, hw - BR_DOOR_S[1]);
    wallSign(ctx, '대회의실', 9.4, 2.55, BR_Z + 0.05, 0, 1.0);

    // ---------------- ceiling: light panels + sprinklers
    const cl = (x, z) => ctx.decorProp('ceilingLight', x, H, z, 0, {}, { rotX: PI, cast: false });
    for (let x = -10.8; x <= 10.9; x += 2.4) for (const z of [3.2, 6.0]) cl(x, z);
    for (const x of [-2.2, 0, 2.2]) for (const z of [-6.4, -3.6, -0.9]) cl(x, z);
    for (const x of [5.6, 8.0, 10.4]) for (const z of [-6.6, -1.0]) cl(x, z);
    for (const [x, z] of [[-10, -6.4], [-6, -6.4], [-10, -0.6], [-6, -0.6]]) cl(x, z);
    for (const [x, z] of [[-8, 4.6], [-3, 4.6], [3, 4.6], [8, 4.6], [0, -4.8], [-8, -5.8], [-7, -1.2], [8, -6.4], [8, -1.2]]) ctx.prop('sprinkler', x, z);
    // warm pools of light (≤ 4)
    ctx.light(-8.6, 2.7, -3.4, { color: '#ffcf96', intensity: 7, distance: 8.5 });
    ctx.light(8.0, 2.7, -3.8, { color: '#ffe2b8', intensity: 6, distance: 8 });
    ctx.light(-0.5, 2.7, -4.6, { color: '#ffd7a4', intensity: 5, distance: 7 });
    ctx.light(-6.0, 2.6, 4.4, { color: '#ffd29a', intensity: 6, distance: 8 });

    // ================= 사장실
    ctx.prop('rug', -8.5, -3.5, PI / 2, { w: 4.2, d: 3.2 });
    ctx.prop('ceoDesk', -9.0, -3.5, PI / 2, { tag: 'ceoDesk' });
    ctx.prop('ceoChair', -10.2, -3.5, PI / 2, { tag: 'ceoChair' });
    ctx.prop('nameplate', -8.62, -3.5, PI / 2, { y: 0.78, text: '대표이사', tag: 'ceoPlate' });
    ctx.prop('laptop', -9.25, -2.75, -PI / 2 + 0.25, { y: 0.78 });
    ctx.prop('phone', -9.2, -4.4, -PI / 2, { y: 0.78 });
    ctx.prop('paperStack', -8.95, -4.0, 0.3, { y: 0.78 });
    ctx.prop('mug', -9.05, -2.25, 0, { y: 0.78 });
    // visitor chairs
    for (const z of [-4.15, -2.85]) ctx.prop('boardChair', -7.75, z, -PI / 2 + (z < -3.5 ? 0.15 : -0.15));
    // the founder's portrait behind the desk (falls when hit; pick it up and throw it out of a window)
    ctx.prop('ceoPortrait', -hw, -3.5, PI / 2, { y: 1.45, tag: 'portrait', hp: 8 });
    for (const z of [-4.75, -2.25]) ctx.prop('wallLamp', -hw, z, PI / 2, { y: 1.75 });
    ctx.prop('bookcase', -hw + 0.22, -6.35, PI / 2, { noCast: true });
    ctx.prop('bookcase', -hw + 0.22, -0.65, PI / 2, { noCast: true });
    ctx.prop('globe', -10.85, -7.35, 0.6);
    ctx.prop('golfSet', -6.7, -6.85, PI / 2, { tag: 'golfSet' });
    ctx.prop('curtain', -11.5, -hd, 0, { w: 0.9, h: 2.95, y: 0.05 });
    ctx.prop('curtain', -4.5, -hd, 0, { w: 0.9, h: 2.95, y: 0.05 });
    // the chairman's celadon jar on its marble pedestal
    ctx.prop('pedestal', -5.0, -7.05, 0, { tag: 'pedestal' });
    ctx.prop('vase', -5.0, -7.05, 0.4, { pedestal: false, y: 0.885, tag: 'vase' });
    // south wall: liquor cabinet, trophy sideboard, the safe
    ctx.prop('liquorCabinet', -10.75, CEO_Z - 0.24, PI, { noCast: true });
    ctx.box(1.9, 0.8, 0.46, panel, -8.55, 0, CEO_Z - 0.24, { collide: true });
    ctx.box(1.96, 0.04, 0.5, brass, -8.55, 0.8, CEO_Z - 0.24, { cast: false });
    for (const x of [-9.2, -8.55, -7.9]) ctx.prop('trophy', x, CEO_Z - 0.26, PI + (x + 8.55) * 0.6, { y: 0.84 });
    ctx.prop('ceoSafe', -5.35, CEO_Z - 0.38, PI, { tag: 'ceoSafe' });
    ctx.prop('plantBig', -6.55, CEO_Z - 0.35);
    for (const x of [-7.2]) ctx.prop('wallLamp', x, CEO_Z, PI, { y: 1.95 });
    for (const z of [-6.4, -0.9]) ctx.prop('wallLamp', CEO_X, z, -PI / 2, { y: 1.75 });
    ctx.npc('boss', -10.05, -2.35, {
      name: 'ceo', role: 'boss', rotY: PI / 2 + 0.3, anim: 'phone', face: 'smug', variantSeed: 120,
      look: { suit: '#262a3a', vest: null, pants: '#262a3a', shirt: '#f7f4ee', tie: '#9a2030', hair: '#cfcac2', hair2: '#efece6', hairStyle: 'old', glasses: false, belly: 0.95, scale: 1.08 },
      lines: ['어, 그래. 주말 라운딩은 그대로 하고…', '요즘 젊은 친구들은 말이야…', '우리 회사는 가족 같은 회사야.', '자네 이름이 뭐였더라?'],
    });

    // ================= 전망 라운지 (between the two rooms, facing the skyline)
    ctx.prop('aquarium', CEO_X + 0.51, -6.3, PI / 2, { tag: 'aquarium', noCast: true });
    ctx.prop('rug', 0.9, -6.35, 0, { w: 3.4, d: 2.4 });
    ctx.prop('sofa', 0.6, -5.15, PI);
    ctx.prop('sofa', 3.05, -6.4, -PI / 2);
    ctx.prop('roundTable', 0.7, -6.6, 0);
    ctx.prop('hotCoffee', 0.6, -6.55, 0, { y: 0.74 });
    ctx.prop('plantBig', 3.45, -7.55);
    ctx.prop('plantBig', -3.4, -0.4);
    ctx.prop('plant', 3.5, -2.6);

    // ================= 대회의실
    ctx.prop('boardTable', 8.0, -3.8, 0, { w: 5.6, noCast: true });
    for (const x of CHAIR_X) {
      ctx.prop('boardChair', x, -5.25, 0, { tag: 'boardChair' });
      ctx.prop('boardChair', x, -2.35, PI, { tag: 'boardChair' });
    }
    for (const [x, z, r] of [[6.0, -4.3, 0.2], [8.0, -4.35, -0.3], [10.0, -3.3, 2.9]]) ctx.prop('laptop', x, z, r, { y: 0.76 });
    for (const [x, z] of [[7.0, -3.3], [9.0, -4.3]]) ctx.prop('paperStack', x, z, 0.4, { y: 0.76 });
    ctx.prop('tv', hw - 0.4, -3.8, -PI / 2, { tag: 'boardTv' });
    ctx.prop('banner', hw, -3.8, -PI / 2, { y: 2.35, text: '3분기 경영 실적 보고', w: 2.6, h: 0.42 });
    ctx.prop('whiteboard', 11.35, -7.05, -PI / 2 - 0.45);
    ctx.prop('plantBig', 4.5, -7.5);
    ctx.prop('plantBig', 11.5, 0.0);
    for (const z of [-6.4, -1.3]) ctx.prop('wallLamp', hw, z, -PI / 2, { y: 1.8 });
    const execLook = { lanyard: false };
    ctx.npc('glasses', 7.0, -5.25, {
      name: 'exec1', role: 'exec', rotY: 0, anim: 'sit', face: 'smug', variantSeed: 121,
      look: Object.assign({ suit: '#3b3f4a', pants: '#3b3f4a', tie: '#7a1f2a', hair: '#8a857e' }, execLook),
      lines: ['이번 분기 숫자가 왜 이래?', '그건 사장님 생각이 아니고 내 생각이야.'],
    });
    ctx.npc('chubby', 9.0, -2.35, {
      name: 'exec2', role: 'exec', rotY: PI, anim: 'sit', face: 'normal', variantSeed: 122,
      look: Object.assign({ suit: '#2e3440', pants: '#2e3440', tie: '#c9a24a', hair: '#3a3532' }, execLook),
      lines: ['커피 좀 더 가져와 봐요.', '회의는 길게, 결론은 다음에.'],
    });

    // ================= 비서실 · 엘리베이터 홀
    evX.forEach((x, i) => ctx.elevator(x, hd, PI, '12F', i));
    ctx.decorProp('floorSign', 0, 1.6, hd - 0.015, PI, { text: '12', h: 0.5, underline: false, color: '#9b7a32' });
    const sec = ctx.desk(-6.3, 3.0, PI, { occupied: true });
    ctx.npc('workerF2', sec.x, sec.z, {
      name: 'secretary', role: 'secretary', rotY: sec.rotY, anim: 'type', face: 'normal', seat: sec, variantSeed: 123,
      look: { suit: '#6b2a36', shirt: '#f6efe4', pants: '#2d2a33', glasses: false, lanyard: false },
      lines: ['사장님 계시니 조용히 다니세요.', '사장님, 1시 골프 약속 잡혀 있습니다.', '결재 서류는 여기 두고 가세요.'],
    });
    ctx.prop('plantBig', -7.75, 1.75);
    ctx.prop('plantBig', -4.6, 1.75);
    ctx.prop('cabinet', -9.0, CEO_Z + 0.48, 0);
    ctx.prop('cabinet', -9.5, CEO_Z + 0.48, 0);
    ctx.prop('binders', -9.25, CEO_Z + 0.48, 0, { y: 0.72, n: 5, seed: 12 });
    // waiting corner (west) on a rug
    ctx.prop('rug', -10.1, 5.9, 0, { w: 3.2, d: 2.6 });
    ctx.prop('sofa', -10.2, 7.45, PI);
    ctx.prop('sofa', -11.45, 5.4, PI / 2);
    ctx.box(1.0, 0.4, 0.6, panel, -9.9, 0, 5.7, { collide: true });
    ctx.prop('hotCoffee', -9.75, 5.75, 0, { y: 0.4 });
    ctx.prop('plantBig', -11.5, 7.5);
    for (const z of [3.0, 5.8]) ctx.prop('wallLamp', -hw, z, PI / 2, { y: 1.85 });
    ctx.decorProp('frame', -hw + 0.015, 1.5, 2.0, PI / 2, {}, { cast: false });
    // east side of the hall: second waiting corner
    ctx.prop('sofa', 9.3, 7.45, PI);
    ctx.prop('roundTable', 9.3, 6.2, 0);
    ctx.prop('plantBig', 11.5, 7.5);
    ctx.prop('plantBig', 7.6, 7.55);
    ctx.prop('waterCooler', 11.62, 3.6, -PI / 2);
    for (const x of [-7.5, 6.0]) ctx.prop('wallLamp', x, hd, PI, { y: 1.85 });
    ctx.decorProp('frame', -5.0, 1.55, hd - 0.015, PI, {}, { cast: false });
    ctx.decorProp('frame', 4.6, 1.55, hd - 0.015, PI, {}, { cast: false });
    ctx.prop('alarmBell', -3.3, hd, PI, { y: 1.25 });
    ctx.prop('extinguisher', 3.0, hd - 0.22, PI);
    ctx.prop('plantBig', -2.7, 7.55);
    ctx.prop('plantBig', 2.6, 7.55);

    // ---------------- anchors
    ctx.spawn(0.4, -3.1, -PI / 2 - 0.12);
    ctx.anchor('waitSpot', 6.1, 1.45);       // outside the boardroom glass door
    ctx.anchor('presentSpot', 11.0, -1.55);  // next to the screen
    ctx.anchor('ceoBoard', 4.85, -3.8);      // the CEO presides from the far end
    ctx.anchor('ceoHome', -10.05, -2.35);
    ctx.hide(-10.9, -4.75);   // behind his own desk
    ctx.hide(11.3, -0.35);
    ctx.hide(-11.2, 2.0);
    ctx.hide(3.3, -4.4);
    A.titleCam = { pos: V(2.6, 2.1, -1.6), look: V(-6.5, 1.1, -3.6) };
  },

  challenges: [
    { id: 'e1', text: '사장님 수족관 깨기', kind: 'break', type: 'aquarium', bonus: 120000 },
    { id: 'e2', text: '회장님 도자기 깨기', kind: 'break', tag: 'vase', bonus: 100000 },
    { id: 'e3', text: '사장실 금고 털기', kind: 'break', type: 'ceoSafe', bonus: 150000 },
    { id: 'e4', text: '대회의실 의자 8개 부수기', kind: 'break', tag: 'boardChair', n: 8, bonus: 80000 },
    { id: 'e5', text: '사장님 초상화 창밖으로', kind: 'out', tag: 'portrait', bonus: 120000 },
    { id: 'e6', text: '12층 창밖으로 10개 던지기', kind: 'out', n: 10, bonus: 100000 },
  ],

  // story: called up to report to the executives (between the 10:30 copier and the 12:10 coffee run)
  scene: {
    id: 'execReport', time: '오전 11:20', title: '임원 보고', sub: '“사장님 앞에서 3쪽까지”',
    start: { floor: 'office', seat: 'playerSeat', preset: 'day', music: 'office', stress: 40 },
    steps: [
      { mission: { title: '임원 보고', sub: '7층 · 오전 11:20', quote: '사장님 앞에서 3쪽까지' } },
      { tasks: ['12층 대회의실 가기', '회의실 앞에서 기다리기', '보고하기'] },
      { wait: 0.6 },
      { sub: ['부장', '김 대리! 12층 임원 보고, 자네가 해. 사장님 들어가셨다, 빨리!', 3000], sfx: 'mumbleLow' },
      { wait: 2.8 },
      { unseat: true },
      { stress: 3, face: ['endure', 1.2], toast: '엘리베이터를 타고 12층으로' },
      { goto: 'exec' },
      { done: 0, mission: { title: '임원 보고', sub: '12층 · 오전 11:25', quote: '사장님 앞에서 3쪽까지' } },
      { say: ['secretary', '회의 중이세요. 회의실 앞에서 잠깐 기다리세요.', 3.0], npc: { who: 'ceo', walk: 'ceoBoard', speed: 1.25, anim: 'walk', arrive: 'armsCrossed' } },
      { walk: { to: 'waitSpot', r: 0.85 } },
      { sub: ['나', '(…기다리라더니 안에서 웃음소리만 들린다)', 2600], npc: { who: 'exec1', anim: 'talk', say: '하하, 그래서 그 골프장이 말이야~' } },
      { wait: 3.0 },
      { npc: { who: 'exec2', anim: 'talk', say: '이번 주말에 한 번 더 나가시죠~' } },
      { wait: 3.0 },
      { stress: 3, face: ['endure', 1.6], sub: ['나', '(…20분째 서 있다)', 2200] },
      { wait: 2.6 },
      { say: ['ceo', '거기 밖에 자네. 들어와.', 2.4], done: 1 },
      { wait: 1.2 },
      { walk: { to: 'presentSpot', r: 0.8 } },
      { hold: { tag: 'boardTv', at: 'presentSpot', text: '보고 시작하기', sec: 1.0 }, sfx: 'beep' },
      { sub: ['나', '3분기 실적 보고 드리겠습니다. 첫 장은…', 2400] },
      { wait: 2.4 },
      { say: ['ceo', '잠깐. 폰트가 마음에 안 드네.', 2.8], sfx: 'mumbleLow' },
      { wait: 3.0 },
      { say: ['exec1', '글씨가 좀 가볍죠? 사장님 말씀이 맞습니다.', 2.8] },
      { wait: 3.0 },
      { say: ['ceo', '처음부터 다시 해 와. 오늘 안으로.', 3.0], stress: 10, face: ['endure', 2.6], done: 2 },
      { wait: 2.6 },
      { sub: ['나', '(…첫 장도 못 넘겼는데)', 2400] },
      { wait: 2.8 },
    ],
  },

  hooks: {
    onEnter(game) {
      // board chairs sit higher than office chairs: lift the seated executives onto the cushions
      for (const n of game.npcs('exec')) if (n.seated) { n.sitY = 0.11; n.place(); }
    },
    onTick(game, dt) {
      if (!game.rampage) return;
      const ceo = game.npc('ceo');
      if (ceo && !ceo.gone) {
        if (ceo.state === 'flee' && !ceo._execSaid) { ceo._execSaid = true; game.say(ceo, '내 책상 뒤로…! 비켜!', 2.2); }
        if (ceo.state === 'cower' && (!ceo.bubble || ceo.bubble.until < game.time) && Math.random() < dt * 0.45) game.say(ceo, CEO_LINES[(Math.random() * CEO_LINES.length) | 0], 2.6);
      }
      // the portrait leaving the building gets its own reaction
      const p = game.S && game.S.phys.records.find((r) => r.tag === 'portrait');
      if (p && p.out && !p._execSaid) { p._execSaid = true; if (ceo && !ceo.gone) game.say(ceo, '아버님 초상화가!! 12층에서!!', 2.8); }
    },
    onDestroy(game, rec) {
      const ceo = game.npc('ceo');
      if (!ceo || ceo.gone) return;
      const line = rec.type === 'aquarium' ? '내 금붕어들!! 한 마리에 얼만데!' : rec.tag === 'vase' ? '회장님 도자기를!! 그거 고려 거야!' : rec.type === 'ceoSafe' ? '그건 비상금… 아니 회사 돈이야!' : rec.tag === 'ceoDesk' ? '내 책상!!' : null;
      if (line) game.say(ceo, line, 2.8);
    },
  },
};

// ---------------- walnut panelling: one texture bay = 1.2 m wide. Full height (3.2 m: low panel, chair rail,
// tall upper panel, frieze) or wainscot (1.0 m). Skins are planes whose UVs are scaled to their size, so a single
// material covers every wall piece with seams that line up.
function grain(x, w, h, r, base) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const px = r() * w, a = 0.05 + r() * 0.12;
    x.strokeStyle = r() < 0.5 ? `rgba(30,14,6,${a})` : `rgba(140,82,44,${a * 0.7})`;
    x.lineWidth = 0.6 + r() * 1.6;
    x.beginPath(); x.moveTo(px, 0);
    for (let y = 0; y <= h; y += 24) x.lineTo(px + Math.sin(y * 0.02 + i) * 2.2, y);
    x.stroke();
  }
}
function bevelPanel(x, X, Y, w, h) {
  x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(X, Y, w, h);
  x.fillStyle = 'rgba(255,200,140,0.10)'; x.fillRect(X + 4, Y + 4, w - 8, h - 8);
  x.strokeStyle = 'rgba(20,9,4,0.65)'; x.lineWidth = 3; x.strokeRect(X + 2, Y + 2, w - 4, h - 4);
  x.strokeStyle = 'rgba(214,150,92,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(X + 6, Y + h - 6); x.lineTo(X + 6, Y + 6); x.lineTo(X + w - 6, Y + 6); x.stroke();
}
function rngT(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function panelMat(ctx, kind) {
  const full = kind === 'full';
  const t = ctx.canvasTex('execPanel:' + kind, 256, full ? 640 : 256, (x, w, h) => {
    const r = rngT(full ? 77 : 78);
    grain(x, w, h, r, '#5a3524');
    const py = (m) => h - (m / (full ? 3.2 : 1.0)) * h; // metres from the floor → canvas y
    // stile seams between bays
    x.fillStyle = 'rgba(15,6,2,0.55)'; x.fillRect(0, 0, 3, h); x.fillRect(w - 2, 0, 2, h);
    bevelPanel(x, 26, py(0.88), w - 52, py(0.12) - py(0.88));
    if (full) {
      x.fillStyle = '#3a2216'; x.fillRect(0, py(1.04), w, py(0.96) - py(1.04));      // chair rail
      x.fillStyle = 'rgba(230,170,90,0.35)'; x.fillRect(0, py(1.04), w, 3);
      bevelPanel(x, 26, py(2.78), w - 52, py(1.16) - py(2.78));
      x.fillStyle = '#3a2216'; x.fillRect(0, py(3.2), w, py(2.98) - py(3.2));        // frieze
    } else {
      x.fillStyle = '#3a2216'; x.fillRect(0, 0, w, py(0.95));                          // cap rail
    }
    x.fillStyle = '#2a170e'; x.fillRect(0, py(0.1), w, h - py(0.1));                   // skirting
  }, { repeat: true });
  return ctx.M.std('execPanelMat:' + kind, { map: t, roughness: 0.5, metalness: 0.03 });
}
// a skin on a wall face: runs along `axis` ('x' → along x at z = at, 'z' → along z at x = at) from a0 to a1,
// y0..y1, facing `face` (rotY of the plane's normal)
function skin(ctx, mat, axis, at, a0, a1, y0, y1, face, texH) {
  const len = a1 - a0, h = y1 - y0;
  const g = new ctx.THREE.PlaneGeometry(len, h);
  const uv = g.attributes.uv;
  // u runs with the world axis whichever way the plane faces, so neighbouring pieces line up
  const flip = axis === 'x' ? Math.cos(face) < 0 : Math.sin(face) > 0;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const wa = flip ? a1 - u * len : a0 + u * len;
    uv.setXY(i, wa / 1.2, (y0 + v * h) / texH);
  }
  const o = new ctx.THREE.Mesh(g, mat);
  const mid = (a0 + a1) / 2, off = 0.004;
  if (axis === 'x') o.position.set(mid, (y0 + y1) / 2, at + Math.cos(face) * off);
  else o.position.set(at + Math.sin(face) * off, (y0 + y1) / 2, mid);
  o.rotation.y = face; o.castShadow = false; o.receiveShadow = true;
  ctx.add(o);
}

// gold-on-walnut plate on a wall: (x, y, z) = centre of the plate's back on the wall, rotY faces the room
function wallSign(ctx, text, x, y, z, rotY, w = 1.0) {
  const h = w * 0.22;
  const t = ctx.canvasTex('execSign:' + text, 512, 112, (c, cw, ch) => {
    const g = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#3a2a1f'); g.addColorStop(1, '#251912');
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    c.strokeStyle = '#d4a845'; c.lineWidth = 6; c.strokeRect(8, 8, cw - 16, ch - 16);
    c.fillStyle = '#e8c068'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold 62px ${ctx.KFONT}`; c.fillText(text, cw / 2, ch / 2 + 4);
  });
  const m = ctx.M.std('execSignMat:' + text, { map: t, roughness: 0.45, metalness: 0.2 });
  const o = new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(w, h), m);
  o.position.set(x + Math.sin(rotY) * 0.006, y, z + Math.cos(rotY) * 0.006); o.rotation.y = rotY;
  o.castShadow = false; o.receiveShadow = false;
  ctx.add(o);
}
