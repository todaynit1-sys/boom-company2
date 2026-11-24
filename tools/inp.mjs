// Real input through CDP (keyboard / mouse / touch) for the human-input scenarios (sc-in-*.mjs).
const KEYS = {
  KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyE: ['e', 69], KeyJ: ['j', 74], KeyK: ['k', 75], KeyQ: ['q', 81], KeyZ: ['z', 90], KeyX: ['x', 88],
  KeyP: ['p', 80], KeyF: ['f', 70], KeyC: ['c', 67], KeyL: ['l', 76], ShiftLeft: ['Shift', 16], Backspace: ['Backspace', 8], Enter: ['Enter', 13], Space: [' ', 32], Escape: ['Escape', 27], Digit1: ['1', 49], Digit7: ['7', 55], ArrowUp: ['ArrowUp', 38],
};
export function makeInput({ send, ev, sleep }) {
  const I = {
    async down(code) { const [key, vk] = KEYS[code]; await send('Input.dispatchKeyEvent', { type: key.length === 1 ? 'keyDown' : 'rawKeyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: key.length === 1 ? key : undefined }); },
    async up(code) { const [key, vk] = KEYS[code]; await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); },
    async tap(code) { await I.down(code); await I.up(code); },
    async move(x, y, buttons = 0) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, button: buttons & 1 ? 'left' : buttons & 2 ? 'right' : 'none' }); },
    async press(x, y, button = 'left') { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'left' ? 1 : 2, clickCount: 1 }); },
    async release(x, y, button = 'left') { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 }); },
    async click(x, y, button = 'left') { await I.move(x, y); await I.press(x, y, button); await I.release(x, y, button); },
    async drag(x0, y0, x1, y1, n = 8, button = 'left') {
      await I.move(x0, y0); await I.press(x0, y0, button);
      const b = button === 'left' ? 1 : 2;
      for (let i = 1; i <= n; i++) await I.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, b);
      await I.release(x1, y1, button);
    },
    async wheel(x, y, dy) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); },
    // centre of the first element matching the selector (null if hidden / missing)
    async rect(sel) {
      return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height || e.closest('[hidden]')) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; })()`);
    },
    async clickSel(sel) {
      const r = await I.rect(sel);
      if (!r) throw new Error('not clickable: ' + sel);
      // what is actually under the pointer there?
      const top = await ev(`(() => { const e = document.elementFromPoint(${r.x}, ${r.y}); const t = document.querySelector(${JSON.stringify(sel)}); return !!(e && t && (e === t || t.contains(e))); })()`);
      if (!top) throw new Error('covered: ' + sel);
      await I.click(r.x, r.y);
      return r;
    },
    // touch: points = [{x,y,id}]
    async touch(type, points) { await send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) }); },
    async waitFor(expr, ms = 15000, every = 150) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { const v = await ev(expr).catch(() => false); if (v) return v; await sleep(every); }
      throw new Error('waitFor timeout: ' + expr);
    },
  };
  return I;
}
