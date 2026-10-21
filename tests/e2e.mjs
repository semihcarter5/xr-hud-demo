// HUD demosu uçtan uca testleri: kurulu Chrome'u görünmez (headless) çalıştırıp CDP ile sürer. Ek paket gerekmez (Node 22+).
// Kullanım:  node tests/e2e.mjs [adres] [çıktı-klasörü]
//   adres varsayılan: http://localhost:5393/   (canlı sürüm için: https://semihcarter5.github.io/xr-hud-demo/)
// Ekran görüntüleri çıktı klasörüne yazılır. Bir kontrol başarısızsa çıkış kodu 1 olur.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv[2] || 'http://localhost:5393/';
const OUT = process.argv[3] || join(tmpdir(), 'hud-e2e');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!CHROME) { console.error('Chrome veya Edge bulunamadı'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${join(OUT, 'profile')}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find(t => t.type === 'page'); } catch { /* tarayıcı açılıyor */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map(), errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async body => {
  const expr = `(async () => { const frames = n => new Promise(res => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }); const h = window.__hud; ${body} })()`;
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); };
const viewport = (width, height, mobile) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const touch = async on => {
  await send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: on ? 5 : 1 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: on, configuration: 'mobile' });
};
const open = async (query = '') => {
  await run('localStorage.clear()').catch(() => {});
  await send('Page.navigate', { url: BASE + query });
  for (let i = 0; i < 40; i++) { await sleep(250); if (await run('return !!h').catch(() => false)) break; }
};
const clickButton = async prefix => {
  const pos = await run(`const b = [...document.querySelectorAll('#ui button')].find(b => b.textContent.startsWith(${JSON.stringify(prefix)}));
    if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  if (!pos) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: pos[0], y: pos[1], button: 'left', clickCount: 1 });
  return true;
};

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); console.log(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`); };

await send('Runtime.enable');
await send('Page.enable');

// 1) Masaüstü: oyun döngüsü, kilitlenme ve ateş
await viewport(1280, 720, false);
await open();
const play = await run(`await frames(3); const d = h.drones[0];
  const id = setInterval(() => { const c = h.camera.position; h.aim(Math.atan2(-(d.position.x - c.x), -(d.position.z - c.z)), Math.atan2(d.position.y - c.y, Math.hypot(d.position.x - c.x, d.position.z - c.z))); }, 16);
  await new Promise(r => setTimeout(r, 1200)); const locked = h.state.locked; h.fire(); clearInterval(id); await frames(2);
  return { ctx: h.settings.context, locked, score: h.state.score };`);
check('Masaüstü ortamı algılandı', play.ctx === 'desktop', play.ctx);
check('Hedefe kilitlenip vuruldu', play.locked && play.score === 100, play);
await shot('1-masaustu.png');

// 2) Telefon dikey -> yatay -> dikey
await touch(true);
await viewport(393, 851, true);
await open();
const portrait = await run(`await frames(3); h.editor.setEditMode(true); await frames(2);
  h.editor.gestureStart(); h.editor.gestureUpdate(1.25, 0.2); h.editor.gestureEnd(); await frames(2);
  return { ctx: h.settings.context, tuned: h.settings.isTuned(), scale: h.panels.center.scale.x };`);
check('Dikey ekran algılandı', portrait.ctx === 'portrait', portrait.ctx);
check('İki parmak hareketi ince ayar oldu', portrait.tuned && portrait.scale === 1.25, portrait);
await shot('2-dikey.png');
await viewport(851, 393, true);
await sleep(1200);
const land = await run(`await frames(3); return { ctx: h.settings.context, tuned: h.settings.isTuned(), kept: Object.keys(h.settings.overrides.portrait) };`);
check('Çevirince yatay düzene geçti', land.ctx === 'landscape' && !land.tuned, land);
check('Dikeydeki ince ayar ayrı korundu', land.kept.includes('center'), land.kept);
await shot('3-yatay.png');

// 2b) iPhone gibi: WebXR yok, hareketle bakma (jiroskop) çalışmalı
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
const noXr = await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true });` });
await viewport(390, 844, true);
await open();
const ios = await run(`await frames(3); const labels = [...document.querySelectorAll('#ui button')].filter(b => !b.hidden).map(b => b.textContent);
  return { ctx: h.settings.context, labels };`);
check('iPhone: VR/AR butonu yok, hareketle bak var', !ios.labels.some(l => /VR|AR/.test(l)) && ios.labels.includes('Hareketle bak'), ios);
// Dokunmatik emülasyonda fare olayı takılabiliyor; bu buton izin istemediği (Chrome) için sayfa içinden tıklanır
check('iPhone: hareketle bak butonu açıldı', await run(`const b = [...document.querySelectorAll('#ui button')].find(b => b.textContent === 'Hareketle bak');
  b?.click(); await frames(2); return h.compat.motion.active;`));
const gyro = await run(`const fire = o => dispatchEvent(Object.assign(new Event('deviceorientation'), o));
  fire({ alpha: 0, beta: 90, gamma: 0 }); await frames(3);
  const flat = { pitch: +h.camera.rotation.x.toFixed(2), yaw: +h.camera.rotation.y.toFixed(2) };
  fire({ alpha: 30, beta: 120, gamma: 0 }); await frames(3);
  const tilted = { pitch: +(h.camera.rotation.x * 180 / Math.PI).toFixed(0), yaw: +(h.camera.rotation.y * 180 / Math.PI).toFixed(0) };
  return { active: h.compat.motion.active, flat, tilted };`);
check('Jiroskop: dik tutunca ileri bakıyor', gyro.active && Math.abs(gyro.flat.pitch) < 0.05 && Math.abs(gyro.flat.yaw) < 0.05, gyro.flat);
check('Jiroskop: yukarı eğip sola çevirince kamera dönüyor', Math.abs(gyro.tilted.pitch - 30) <= 2 && Math.abs(gyro.tilted.yaw - 30) <= 2, gyro.tilted);
await shot('3b-iphone.png');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noXr.result.identifier });
await send('Emulation.setUserAgentOverride', { userAgent: '' });
await touch(false);

// 2c) Oyun kumandası ve ok tuşları (PC, TV, tablet)
await viewport(1280, 720, false);
const padStub = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pad = null; navigator.getGamepads = () => [window.__pad];` });
await open();
const pad = await run(`await frames(3); const y0 = h.camera.rotation.y, e0 = h.state.energy;
  const btn = p => ({ pressed: p, value: p ? 1 : 0 });
  window.__pad = { connected: true, axes: [0.8, 0, 0, 0], buttons: Array.from({ length: 16 }, () => btn(false)) };
  await new Promise(r => setTimeout(r, 400)); const turned = h.camera.rotation.y < y0 - 0.1;
  window.__pad.axes = [0, 0, 0, 0]; window.__pad.buttons[0] = btn(true); await frames(3);
  window.__pad.buttons[0] = btn(false); await frames(3); window.__pad = null;
  return { turned, fired: h.state.energy < e0 - 10 };`);
check('Kumanda: çubuk sağa çevirdi', pad.turned, pad);
check('Kumanda: A tuşu ateş etti', pad.fired, pad);
const y0 = await run('return h.camera.rotation.y');
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(400);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 });
const y1 = await run('return h.camera.rotation.y');
check('Ok tuşu: sola döndü', y1 > y0 + 0.1, { önce: +y0.toFixed(2), sonra: +y1.toFixed(2) });
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: padStub.result.identifier });
console.log('Bilgi: otomatik kalite', JSON.stringify(await run('return h.compat.quality')));

// 3) VR (IWER Quest 3 emülatörü): otomatik düzen + kumandayla tutup taşıma
await viewport(1280, 720, false);
await open('?emulate');
check('VR butonu göründü', await clickButton('VR'));
await sleep(2500);
const vr = await run(`await frames(10); const R = __xrDevice.controllers.right; const ctx = h.settings.context;
  const sp = h.panels.stats; sp.updateMatrixWorld(true); const wp = sp.getWorldPosition(sp.position.clone());
  R.position.set(wp.x, wp.y, wp.z + 1); await frames(10);
  const e0 = h.state.energy; R.updateButtonValue('trigger', 1); await frames(8); const grabbing = h.vr.isGrabbing();
  R.position.set(wp.x, wp.y - 0.2, wp.z + 1); await frames(12); R.updateButtonValue('trigger', 0); await frames(8);
  return { ctx, grabbing, fired: h.state.energy < e0 - 5, saved: h.settings.overrides.vr.stats?.position, desktop: Object.keys(h.settings.overrides.desktop).length };`);
check('VR ortamı algılandı', vr.ctx === 'vr', vr.ctx);
check('Panel tutuldu, ateş edilmedi', vr.grabbing && !vr.fired, vr);
check('Taşıma sadece VR düzenine kaydedildi', vr.saved && vr.desktop === 0, vr.saved);
await shot('4-vr.png');

// 4) AR (emülatör): AR profili, ortam gizli, paneller saydamlaşır
await open('?emulate');
const arButton = await clickButton('AR');
check('AR butonu göründü', arButton);
if (arButton) {
  await sleep(2500);
  const ar = await run(`await frames(10); const p = h.panels.center;
    return { ctx: h.settings.context, envHidden: !h.panels.center.parent.parent.children.find(o => o.type === 'Group' && o.children.some(c => c.type === 'GridHelper'))?.visible,
      opacity: +p.material.opacity.toFixed(2), centerScale: p.scale.x, mode: h.vr.mode() };`);
  check('AR ortamı algılandı', ar.ctx === 'ar' && ar.mode === 'immersive-ar', ar);
  check('AR profili: küçük ve saydam paneller', ar.centerScale < 1 && ar.opacity < 1, ar);
  check('AR: sanal ortam (yıldız, zemin) gizlendi', ar.envHidden, ar.envHidden);
  await shot('5-ar.png');
}

check('Konsolda hata yok', errors.length === 0, errors);
console.log(`\n${checks.filter(c => c.ok).length}/${checks.length} kontrol geçti · ekran görüntüleri: ${OUT}`);
ws.close();
proc.kill();
process.exit(checks.every(c => c.ok) ? 0 : 1);
