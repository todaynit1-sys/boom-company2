// Headless Chrome driver for 회사 뿌개기 (CDP, no extra deps).
// usage: node tools/drive.mjs <scenario.mjs> <outDir> [WxH] [query]
//   scenario default export: async ({ ev, shot, sleep, log, step }) => {}
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [scenarioPath, outDir, size = '1280x720', query = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const [W, H] = size.split('x').map(Number);
const mobile = Math.min(W, H) < 600;
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(process.env.SCRATCH || tmpdir(), 'cdp-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars', `--window-size=${W},${H}`,
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch (e) { /* wait */ }
  await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning' || d.params.type === 'warn')) logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 600));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('LOG: ' + d.params.entry.text.slice(0, 300) + ' ' + (d.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const url = `http://localhost:4260/${query ? '?' + query : ''}#debug`;
await send('Page.navigate', { url });

async function ev(expr, timeout = 120000) {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    sleep(timeout).then(() => ({ timeout: true })),
  ]);
  if (r.timeout) throw new Error('timeout: ' + expr.slice(0, 80));
  if (r.result && r.result.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
}
const log = (...a) => console.log(...a);
async function step(n, chunk = 30) {
  let s;
  for (let k = 0; k < n; k += chunk) s = await ev(`__ppg.step(${Math.min(chunk, n - k)})`);
  return s;
}
// wait for boot
for (let i = 0; i < 100; i++) { const ok = await ev('!!window.__ppg').catch(() => false); if (ok) break; await sleep(300); }
const mod = await import(pathToFileURL(resolve(scenarioPath)).href);
let failed = false;
try { await mod.default({ ev, shot, sleep, log, step, W, H, send, outDir }); }
catch (e) { failed = true; console.log('SCENARIO FAILED:', e.message); try { await shot('_failure'); } catch (err) { /* ignore */ } }
const errs = await ev('JSON.stringify(__ppg.errors)').catch(() => '[]');
console.log('ppg.errors:', errs);
console.log('console errors/exceptions:', logs.length ? '\n' + logs.join('\n') : 'none');
ws.close(); chrome.kill();
process.exit(failed ? 1 : 0);
