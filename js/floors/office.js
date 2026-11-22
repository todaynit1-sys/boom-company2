// 7층 사무실 — the story's home floor (desks, copier, boss corner, meeting room) + window wall you can
// throw things out of, a fire-alarm bell that sets off the sprinklers, and the boss's nameplate.
const PI = Math.PI;

export default {
  id: 'office', label: '7', key: 'Digit7', name: '7층 · 사무실', sub: '내 자리가 있는 층',
  size: { w: 26, d: 18, h: 3.0 },
  light: null, // follows the time of day (day / noon / sunset / title presets)
  music: 'office', stepSfx: 'stepCarpet',

  build(ctx) {
    const { M, V, low } = ctx;
    const F = ctx.F, A = ctx.anchors;
    const W = 26, D = 18, H = 3.0;
    ctx.floor(M.carpet(), W, D);
    ctx.ceiling(M.ceilOffice(), W, D, H);
    for (let x = -11.4; x <= 11.5; x += 2.4) for (let z = -7.2; z <= 7.3; z += 2.4) ctx.decorProp('ceilingLight', x, H, z, 0, {}, { rotX: PI, cast: false });
    // sprinkler heads between the light panels (the alarm bell sets them off)
    for (const x of [-10.2, -5.4, -0.6, 4.2, 9.0]) for (const z of [-6.0, 0.0, 6.0]) ctx.prop('sprinkler', x, z);

    // ---- walls
    const wall = M.wall();
    ctx.wall('x', 9, 1, -13.2, 13.2, H, wall);
    ctx.wall('z', 13, 1, -9, 9, H, wall);
    const evZ = [-1.6, 1.6];
    ctx.wall('z', -13, -1, -9, 9, H, wall, evZ.map((z) => ({ a0: z - 0.5, a1: z + 0.5, top: 2.1 })));
    ctx.box(26, 0.09, 0.03, M.skirting(), 0, 0, 8.985, { cast: false });
    ctx.box(0.03, 0.09, 18, M.skirting(), 12.985, 0, 0, { cast: false });
    // north window wall: sill, header, mullions, blinds — and breakable panes (throw things out!)
    ctx.box(26.4, 0.78, 0.22, wall, 0, 0, -9.11, { collide: true });
    ctx.box(26.4, 0.05, 0.3, M.sill(), 0, 0.78, -9.05);
    ctx.box(26.4, 0.45, 0.22, wall, 0, H - 0.45, -9.11);
    const bays = 16, bw = 26 / bays;
    for (let i = 0; i <= bays; i++) ctx.box(0.09, H - 0.45 - 0.83, 0.12, M.alu(), -13 + i * bw, 0.83, -9.02);
    ctx.box(26, 0.05, 0.1, M.alu(), 0, H - 0.5, -9.02);
    for (let i = 0; i < bays; i++) {
      const g = new ctx.THREE.PlaneGeometry(bw - 0.1, 0.72);
      const o = new ctx.THREE.Mesh(g, M.blinds());
      o.position.set(-13 + (i + 0.5) * bw, H - 0.5 - 0.36, -8.96);
      o.castShadow = true; o.receiveShadow = false;
      ctx.add(o);
    }
    ctx.window({ axis: 'z', at: -9.06, side: -1, from: -13, to: 13, bays, y0: 0.83, y1: H - 0.5, label: '7층 창밖으로!' });
    ctx.sky('day', { radius: 40, y0: -10, h: 40, center: PI, span: 2.6 });

    // ---- elevators (west wall, facing +X)
    evZ.forEach((z, i) => ctx.elevator(-13, z, PI / 2, '7F', i));
    ctx.decorProp('floorSign', -12.985, 1.55, 0, PI / 2, { text: '7층', h: 0.42 });
    ctx.prop('extinguisher', -12.8, 3.0, PI / 2);
    ctx.prop('alarmBell', -13, 4.75, PI / 2, { y: 1.25 });
    ctx.dynProp('plantBig', -12.45, 0, 3.7);
    ctx.dynProp('plantBig', -12.45, 0, -3.0);

    // ---- pillars
    const pillars = [[-7, -1.95], [-7, 4.6], [2.4, -1.95], [2.4, 4.6]];
    for (const [x, z] of pillars) ctx.decorProp('pillar', x, 0, z, 0, { h: H }, { collide: true });
    ctx.decorProp('floorSign', -7, 1.75, -1.95 + 0.305, 0, { text: '7층', h: 0.36 }, { cast: false });
    ctx.decorProp('floorSign', 2.4, 1.75, 4.6 + 0.305, 0, { text: '7층', h: 0.36 }, { cast: false });
    A.pillars = pillars.map(([x, z]) => V(x, 0, z));

    // ---- desk pods
    const clusters = [[-3.2, -1.65, -0.1], [3.9, 5.45, 7.0]];
    const pods = [-4.4, 0.4];
    const seatMap = {};
    for (let ci = 0; ci < clusters.length; ci++) for (let pi = 0; pi < pods.length; pi++) {
      const cz = pods[pi];
      for (let k = 0; k < 3; k++) {
        const x = clusters[ci][k];
        if (low && k === 2 && pi === 0) continue;
        ctx.dynProp('partition', x, 0, cz, 0, { w: 1.5, h: 1.15 }, 'partition');
        const key = `${ci}${pi}${k}`;
        seatMap[key + 'S'] = { x, z: cz + 0.42, rotY: 0 };
        seatMap[key + 'N'] = { x, z: cz - 0.42, rotY: PI };
      }
    }
    // who sits where (S = south side desk, worker faces −Z; N = north side, worker faces +Z)
    const occupants = {
      '011S': 'player',
      '010N': ['workerF2', 'type', 'normal'],
      '001N': ['workerM1', 'type', 'normal'],
      '100S': ['chubby', 'stretch', 'relief'],
      '112N': ['glasses', 'type', 'normal'],
      '110S': ['workerF1', 'sit', 'sleepy'],
    };
    for (const [key, d] of Object.entries(seatMap)) {
      const occ = occupants[key];
      const seat = ctx.desk(d.x, d.z, d.rotY, { occupied: !!occ });
      if (occ === 'player') { A.playerSeat = seat; seat.player = true; }
      else if (occ) ctx.addNpc({ preset: occ[0], x: seat.x, z: seat.z, rotY: seat.rotY, anim: occ[1], face: occ[2], seat, role: 'worker' });
    }
    for (const [x, z] of [[-4.25, -2.6], [0.95, 2.3], [8.3, -2.6], [3.0, -5.9]]) ctx.dynProp('trashcan', x, 0, z);

    // ---- printer corner (south wall, west part)
    const pr = ctx.dynProp('printer', -4.4, 0, 8.36, PI, {}, 'printer');
    pr.prop.set('ok');
    A.printer = pr;
    const pbh = ctx.makeProp('paperBox').size.y;
    ctx.dynProp('paperBox', -3.55, 0, 8.6, PI + 0.05);
    ctx.dynProp('paperBox', -3.55, pbh, 8.6, PI - 0.08);
    ctx.dynProp('paperBox', -3.0, 0, 8.62, PI + 0.2);
    ctx.dynProp('cabinetTall', -5.55, 0, 8.7, PI);
    ctx.decorProp('frame', -4.4, 1.45, 8.985, PI, {}, { cast: false });
    ctx.dynProp('plant', -2.45, 0, 8.55);
    ctx.dynProp('shelf', -1.3, 0, 8.76, PI, { seed: 5 });
    ctx.dynProp('whiteboard', 0.6, 0, 8.45, PI);
    ctx.dynProp('waterCooler', -8.2, 0, 8.68, PI);
    ctx.dynProp('trashcan', -7.6, 0, 8.7);
    for (let i = 0; i < 4; i++) ctx.dynProp('cabinet', 3.6 + i * 0.5, 0, 8.68, PI);
    ctx.dynProp('box', 3.85, 0.72, 8.66, PI + 0.1);
    ctx.dynProp('plantSmall', 4.7, 0.72, 8.7);
    ctx.dynProp('binders', 5.1, 0.72, 8.72, PI, { n: 4, seed: 2 });
    ctx.decorProp('frame', 6.6, 1.45, 8.985, PI, {}, { cast: false });
    ctx.decorProp('frame', -10.5, 1.45, 8.985, PI, {}, { cast: false });

    // ---- boss corner (south east)
    const bossDesk = ctx.desk(10.3, 4.4, PI / 2, { occupied: true });
    A.bossSeat = bossDesk;
    // the boss's nameplate on the visitor side of the desk (challenge: throw it out of the window)
    ctx.prop('nameplate', 9.94, 4.1, -PI / 2, { y: 0.75, tag: 'bossPlate', text: '부장' });
    ctx.dynProp('cabinetTall', 12.73, 0, 2.8, -PI / 2);
    ctx.dynProp('shelf', 12.78, 0, 6.2, -PI / 2, { seed: 7 });
    ctx.dynProp('plantBig', 12.4, 0, 7.9);
    ctx.decorProp('frame', 12.985, 1.5, 4.4, -PI / 2, {}, { cast: false });
    A.bossStand = V(11.05, 0, 4.4); A.bossStandYaw = -PI / 2;
    A.bossFront = V(8.75, 0, 4.4);
    ctx.addNpc({ preset: 'boss', x: 11.05, z: 4.4, rotY: -PI / 2, anim: 'idle', face: 'smug', role: 'boss' });

    // ---- meeting room (north east), glass walls
    ctx.decorProp('glassWall', 8.6, 0, -7.1, PI / 2, { w: 3.8, h: 2.7 }, { collide: true });
    ctx.decorProp('glassWall', 11.3, 0, -5.2, 0, { w: 3.4, h: 2.7 }, { collide: true });
    ctx.dynProp('meetingTable', 10.9, 0, -7.2, PI / 2);
    for (const [x, z, r] of [[10.05, -7.75, PI / 2], [10.05, -6.65, PI / 2], [11.75, -7.75, -PI / 2], [11.75, -6.65, -PI / 2]]) ctx.dynProp('chair', x, 0, z, r);
    ctx.dynProp('tv', 12.7, 0, -7.2, -PI / 2);
    ctx.dynProp('laptop', 10.8, 0.75, -7.5, 0.3);
    ctx.dynProp('paperStack', 11.0, 0.75, -6.8, 1.2);
    A.meeting = V(11.4, 0, -8.2);

    // ---- lounge / meeting corner (south west)
    ctx.dynProp('roundTable', -9.6, 0, 5.4);
    for (const [dx, dz, c] of [[0.75, 0, '#d6a23b'], [-0.55, 0.55, '#4f86c6'], [-0.2, -0.75, '#d6a23b']]) {
      ctx.dynProp('cafeChair', -9.6 + dx, 0, 5.4 + dz, Math.atan2(-dx, -dz), { color: c });
    }
    ctx.dynProp('mug', -9.5, 0.74, 5.35, 0.4);
    ctx.dynProp('sofa', -12.35, 0, 6.3, PI / 2);
    for (const x of [-10.5, -4.6, 0.9, 6.6]) ctx.dynProp('plant', x, 0, -8.45);
    ctx.dynProp('plantBig', -12.35, 0, -8.35);
    ctx.dynProp('plantBig', 12.35, 0, -4.6);
    ctx.dynProp('cabinet', -12.65, 0, -6.3, PI / 2);
    ctx.dynProp('cabinet', -12.65, 0, -5.8, PI / 2);
    ctx.dynProp('paperStack', -12.65, 0.72, -6.05, 0.3);

    // ---- standing coworkers
    ctx.addNpc({ preset: 'workerM2', x: -7.75, z: 7.55, rotY: 2.6, anim: 'talk', face: 'smile', role: 'worker' });
    ctx.addNpc({ preset: 'workerF2', x: -8.85, z: 7.35, rotY: 0.75, anim: 'armsCrossed', face: 'normal', role: 'worker', variantSeed: 9 });
    ctx.addNpc({ preset: 'workerM1', x: -2.2, z: -7.6, rotY: PI - 0.3, anim: 'phone', face: 'normal', role: 'worker', variantSeed: 12 });

    // ---- anchors
    ctx.spawn(-2.3, -1.95, -PI / 2);
    A.rushSpawn = V(-2.3, 0, -1.95); // camera behind lands at x≈1.5, clear of the pillar at x=2.4
    A.sunsetIntercept = V(-5.2, 0, -1.95);
    A.hide = [V(-7, 0, -2.55), V(2.4, 0, 5.2), V(-7, 0, 5.2), V(11.6, 0, -8.3)];
    A.exits = F.elevators.map((e) => e.front.clone().addScaledVector(e.fwd, 0.6));
    A.titleCam = { pos: V(1.2, 2.2, 4.6), look: V(-1.65, 0.9, 1.4) };
  },

  challenges: [
    { id: 'o1', text: '모니터 8대 박살', kind: 'break', type: 'monitor', n: 8, bonus: 60000 },
    { id: 'o2', text: '복합기 부수기', kind: 'break', type: 'printer', bonus: 80000 },
    { id: 'o3', text: '책상 5번 엎기', kind: 'flip', n: 5, bonus: 60000 },
    { id: 'o4', text: '부장님 명패 창밖으로', kind: 'out', tag: 'bossPlate', bonus: 100000 },
    { id: 'o5', text: '비상벨 눌러 스프링클러 켜기', kind: 'alarm', bonus: 50000 },
    { id: 'o6', text: '바퀴의자 타고 6번 들이받기', kind: 'ram', type: 'chair', n: 6, bonus: 60000 },
  ],
};
