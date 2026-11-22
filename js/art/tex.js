// 회사 뿌개기 — procedural canvas textures (cached). No external images.
import * as THREE from 'three';

const cache = new Map();

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function finishTex(c, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}

function noise(ctx, w, h, n, colors, rMin, rMax, r, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    const s = rMin + r() * (rMax - rMin);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

export const tex = {
  // office carpet tile: blue with fine fleck + subtle tile seams (one tile per texture; core sets repeat ~ per 0.6–1m)
  carpet(color = '#3f5a8c') {
    return cached('carpet' + color, () => {
      const c = canvas(256, 256), x = c.getContext('2d'), r = rng(11);
      x.fillStyle = color; x.fillRect(0, 0, 256, 256);
      noise(x, 256, 256, 9000, [shade(color, -0.08), shade(color, 0.07), shade(color, -0.14), shade(color, 0.12)], 1, 2, r, 0.55);
      // soft mottling
      for (let i = 0; i < 40; i++) {
        x.fillStyle = r() < 0.5 ? shade(color, -0.05) : shade(color, 0.04);
        x.globalAlpha = 0.12;
        x.beginPath(); x.arc(r() * 256, r() * 256, 10 + r() * 30, 0, 7); x.fill();
      }
      x.globalAlpha = 0.18; x.fillStyle = shade(color, -0.2);
      x.fillRect(0, 0, 256, 1); x.fillRect(0, 0, 1, 256);
      x.globalAlpha = 1;
      return finishTex(c);
    });
  },
  // lobby terrazzo: warm light grey with coloured chips
  terrazzo() {
    return cached('terrazzo', () => {
      const c = canvas(512, 512), x = c.getContext('2d'), r = rng(7);
      x.fillStyle = '#d9d3ca'; x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 60; i++) {
        x.fillStyle = r() < 0.5 ? '#e2ddd5' : '#cfc8be'; x.globalAlpha = 0.25;
        x.beginPath(); x.arc(r() * 512, r() * 512, 20 + r() * 50, 0, 7); x.fill();
      }
      x.globalAlpha = 1;
      const chips = ['#8d8680', '#a39a90', '#6e6a66', '#bfb5a8', '#f3efe8', '#9a8f84', '#c9b9a3', '#57534f'];
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = chips[(r() * chips.length) | 0];
        const s = 1 + r() * (r() < 0.08 ? 6 : 2.6);
        x.beginPath();
        const cx = r() * 512, cy = r() * 512;
        x.moveTo(cx, cy); x.lineTo(cx + s, cy + s * 0.3 * r()); x.lineTo(cx + s * 0.6, cy + s); x.lineTo(cx - s * 0.2, cy + s * 0.7);
        x.fill();
      }
      return finishTex(c);
    });
  },
  // large beige stone wall panels with faint veins and seams (1 texture = 2×2 panels)
  marbleWall() {
    return cached('marbleWall', () => {
      const c = canvas(512, 512), x = c.getContext('2d'), r = rng(23);
      x.fillStyle = '#d8cfc3'; x.fillRect(0, 0, 512, 512);
      noise(x, 512, 512, 6000, ['#cfc5b8', '#e0d8cd', '#c8bdb0'], 1, 3, r, 0.5);
      x.strokeStyle = '#b9ab9b'; x.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        x.globalAlpha = 0.25 + r() * 0.25;
        x.beginPath();
        let px = r() * 512, py = r() * 512; x.moveTo(px, py);
        for (let k = 0; k < 8; k++) { px += (r() - 0.3) * 70; py += (r() - 0.5) * 50; x.lineTo(px, py); }
        x.stroke();
      }
      x.globalAlpha = 1;
      x.fillStyle = '#a89a8a';
      x.fillRect(0, 255, 512, 3); x.fillRect(255, 0, 3, 512);
      x.fillRect(0, 0, 512, 1); x.fillRect(0, 0, 1, 512);
      return finishTex(c);
    });
  },
  // vertical oak slats (café counter front). 1 texture ≈ 0.5 m wide.
  woodSlat() {
    return cached('woodSlat', () => {
      const c = canvas(256, 256), x = c.getContext('2d'), r = rng(5);
      const n = 10, w = 256 / n;
      for (let i = 0; i < n; i++) {
        const base = ['#b07a4a', '#a8713f', '#b98352', '#a36d3d'][i % 4];
        x.fillStyle = base; x.fillRect(i * w, 0, w, 256);
        x.globalAlpha = 0.25;
        for (let k = 0; k < 14; k++) {
          x.fillStyle = r() < 0.5 ? '#8e5a30' : '#c99464';
          x.fillRect(i * w + 2 + r() * (w - 6), 0, 1 + r() * 1.5, 256);
        }
        x.globalAlpha = 1;
        const g = x.createLinearGradient(i * w, 0, i * w + w, 0);
        g.addColorStop(0, 'rgba(255,230,190,0.25)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,20,5,0.45)');
        x.fillStyle = g; x.fillRect(i * w, 0, w, 256);
        x.fillStyle = '#4a2c15'; x.fillRect(i * w + w - 2, 0, 2, 256);
      }
      return finishTex(c);
    });
  },
  // 600mm acoustic ceiling tile (one tile per texture)
  ceilingTile() {
    return cached('ceilingTile', () => {
      const c = canvas(128, 128), x = c.getContext('2d'), r = rng(3);
      x.fillStyle = '#efede8'; x.fillRect(0, 0, 128, 128);
      noise(x, 128, 128, 700, ['#d8d5cf', '#e4e1db', '#cfcbc4'], 1, 1.6, r, 0.8);
      x.fillStyle = '#bdb9b2'; x.fillRect(0, 0, 128, 2); x.fillRect(0, 0, 2, 128);
      x.fillStyle = '#fafaf7'; x.fillRect(2, 2, 124, 1); x.fillRect(2, 2, 1, 124);
      return finishTex(c);
    });
  },
  wallPaint(color = '#ece3d3') {
    return cached('wall' + color, () => {
      const c = canvas(128, 128), x = c.getContext('2d'), r = rng(9);
      x.fillStyle = color; x.fillRect(0, 0, 128, 128);
      noise(x, 128, 128, 1400, [shade(color, -0.03), shade(color, 0.02)], 1, 2, r, 0.5);
      return finishTex(c);
    });
  },
  // generic Korean city panorama (apartment blocks, hill with a tower). Wide; wrapS repeat.
  skyline(time = 'day') {
    return cached('sky' + time, () => {
      const W = 2048, H = 512;
      const c = canvas(W, H), x = c.getContext('2d'), r = rng(time === 'day' ? 41 : time === 'sunset' ? 42 : 43);
      const pal = {
        day: { sky: ['#7fb4e6', '#b9d8f2', '#e6f1f7'], hill: '#7f9a86', far: '#a9bccb', mid: '#c9d2da', near: '#e7e3dc', win: '#8fb0cc', lit: null, sun: null, tower: '#6d7f8a' },
        sunset: { sky: ['#4b5a92', '#d9809a', '#f7b276'], hill: '#5b4a62', far: '#8a6f86', mid: '#b48e93', near: '#d8aa98', win: '#6f5a73', lit: '#ffd08a', sun: '#ffd9a0', tower: '#3f344c' },
        night: { sky: ['#0b1430', '#1b2a55', '#3a3f6b'], hill: '#151a30', far: '#232946', mid: '#2c3354', near: '#383f60', win: '#1f2440', lit: '#ffd77a', sun: null, tower: '#10142a' },
      }[time] || {};
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, pal.sky[0]); g.addColorStop(0.55, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      if (time === 'day') {
        x.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < 14; i++) {
          const cx = r() * W, cy = 40 + r() * 120;
          for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(cx + k * 22 - 40, cy + (r() - 0.5) * 10, 30 + r() * 20, 10 + r() * 8, 0, 0, 7); x.fill(); }
        }
      }
      if (pal.sun) {
        const sg = x.createRadialGradient(W * 0.7, H * 0.62, 5, W * 0.7, H * 0.62, 260);
        sg.addColorStop(0, 'rgba(255,240,200,0.95)'); sg.addColorStop(0.15, 'rgba(255,200,140,0.6)'); sg.addColorStop(1, 'rgba(255,170,120,0)');
        x.fillStyle = sg; x.fillRect(0, 0, W, H);
      }
      if (time === 'night') {
        x.fillStyle = '#fff';
        for (let i = 0; i < 120; i++) { x.globalAlpha = r(); x.fillRect(r() * W, r() * H * 0.5, 1.5, 1.5); }
        x.globalAlpha = 1;
      }
      // hill with tower (wraps around: two hills)
      x.fillStyle = pal.hill;
      for (const hx of [W * 0.22, W * 0.78]) {
        x.beginPath(); x.moveTo(hx - 420, H * 0.72);
        x.bezierCurveTo(hx - 220, H * 0.42, hx - 80, H * 0.38, hx, H * 0.4);
        x.bezierCurveTo(hx + 90, H * 0.39, hx + 230, H * 0.45, hx + 420, H * 0.72); x.fill();
      }
      // tower on first hill
      const tx = W * 0.22, ty = H * 0.4;
      x.fillStyle = pal.tower;
      x.fillRect(tx - 3, ty - 95, 6, 95);
      x.fillRect(tx - 12, ty - 70, 24, 12);
      x.beginPath(); x.ellipse(tx, ty - 58, 16, 6, 0, 0, 7); x.fill();
      x.fillRect(tx - 1, ty - 130, 2, 36);
      if (time !== 'day') { x.fillStyle = '#ff5a5a'; x.fillRect(tx - 2, ty - 132, 4, 4); }
      // building layers
      const layer = (count, yBase, hMin, hMax, wMin, wMax, col, winCol, litP, apt) => {
        let px = -20;
        while (px < W + 20) {
          const w = wMin + r() * (wMax - wMin), h = hMin + r() * (hMax - hMin);
          x.fillStyle = col; x.fillRect(px, yBase - h, w, h + 200);
          // apartment roof label stripe / rooftop box
          if (apt && r() < 0.7) { x.fillRect(px + w * 0.3, yBase - h - 8, w * 0.4, 8); }
          // windows
          const rows = Math.floor(h / (apt ? 9 : 12)), cols = Math.max(2, Math.floor(w / (apt ? 8 : 10)));
          for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const lit = pal.lit && r() < litP;
            x.fillStyle = lit ? pal.lit : winCol;
            x.globalAlpha = lit ? 0.9 : 0.55;
            if (apt) x.fillRect(px + 3 + j * (w - 6) / cols, yBase - h + 6 + i * 9, (w - 6) / cols - 2, 4);
            else x.fillRect(px + 3 + j * (w - 6) / cols, yBase - h + 6 + i * 12, (w - 6) / cols - 3, 7);
          }
          x.globalAlpha = 1;
          px += w + (r() < 0.3 ? r() * 20 : 2);
        }
      };
      layer(0, H * 0.74, 40, 120, 30, 60, pal.far, pal.win, 0.15, true);
      layer(0, H * 0.86, 60, 180, 40, 90, pal.mid, pal.win, 0.25, r() < 2);
      layer(0, H * 1.0, 80, 230, 60, 130, pal.near, pal.win, 0.35, false);
      // haze
      const hz = x.createLinearGradient(0, H * 0.5, 0, H);
      hz.addColorStop(0, 'rgba(255,255,255,0)');
      hz.addColorStop(1, time === 'night' ? 'rgba(20,25,60,0.25)' : time === 'sunset' ? 'rgba(255,190,150,0.25)' : 'rgba(230,240,248,0.3)');
      x.fillStyle = hz; x.fillRect(0, 0, W, H);
      const t = finishTex(c);
      t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    });
  },
  // horizontal window blinds (alpha gaps; use with transparent:true or alphaTest)
  blinds() {
    return cached('blinds', () => {
      const c = canvas(64, 256), x = c.getContext('2d');
      x.clearRect(0, 0, 64, 256);
      for (let y = 0; y < 256; y += 16) {
        const g = x.createLinearGradient(0, y, 0, y + 11);
        g.addColorStop(0, '#f4f1ea'); g.addColorStop(1, '#cfcac0');
        x.fillStyle = g; x.fillRect(0, y, 64, 11);
      }
      return finishTex(c);
    });
  },
};

// helper used by props for one-off text/pattern textures (cached by key)
export function canvasTex(key, w, h, draw, opts) {
  return cached('ct:' + key, () => {
    const c = canvas(w, h);
    draw(c.getContext('2d'), w, h);
    return finishTex(c, Object.assign({ repeat: false }, opts));
  });
}

export const KFONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","NanumGothic",sans-serif';
