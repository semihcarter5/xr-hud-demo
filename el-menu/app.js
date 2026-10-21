// Koltuk yapılandırıcı: stüdyo ışığında gerçek bir koltuk modeli + el menüsü.
// VR'da menü sol bileğin/kumandanın üstünde; telefonda ve bilgisayarda ekranda yüzer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setupCompat } from '../compat.js?v=10';

// ?emulate: Meta IWER emülatörü (gözlüksüz VR testi)
if (new URLSearchParams(location.search).has('emulate')) {
  const { XRDevice, metaQuest3 } = await import('https://cdn.jsdelivr.net/npm/iwer@2.4.0/build/iwer.module.js');
  window.__xrDevice = new XRDevice(metaQuest3);
  window.__xrDevice.installRuntime({ forceInstall: true });
}

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/SheenChair.glb';
const TOUCH = matchMedia('(pointer: coarse)').matches;
const hint = document.getElementById('hint');
const ui = document.getElementById('ui');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, ms = 2000) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

// --- Render: film tonu, gerçekçi ışık, yumuşak gölge ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.02, 60);
camera.position.set(0, 1.25, 0.55);
scene.add(camera);

// Stüdyo ortam ışığı (yansımalar ve dolgu ışığı bundan gelir)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// Arka plan: ortası açık, kenarları kararan stüdyo fonu
function backdrop(inner, outer) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, outer); gr.addColorStop(0.55, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Zemin ve döner platform
const STAGE = new THREE.Vector3(0, 0, -1.25);
const fade = (() => { // zemin kenara doğru saydamlaşıp fona karışsın (ufuk çizgisi görünmesin)
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#888'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
})();
const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 96), new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.42, metalness: 0, alphaMap: fade, transparent: true, depthWrite: false }));
floor.rotation.x = -Math.PI / 2;
floor.position.copy(STAGE).setY(0);
floor.receiveShadow = true;
scene.add(floor);
const platform = new THREE.Group();
platform.position.copy(STAGE);
scene.add(platform);
const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.75, 0.06, 96), new THREE.MeshStandardMaterial({ color: 0x161a1f, roughness: 0.45, metalness: 0.2 }));
disc.position.y = 0.03;
disc.receiveShadow = true; disc.castShadow = true;
platform.add(disc);
const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x39e6ff, emissiveIntensity: 2.2 });
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.735, 0.006, 12, 160), ringMat);
ring.rotation.x = Math.PI / 2; ring.position.y = 0.058;
platform.add(ring);
const turntable = new THREE.Group();
turntable.position.y = 0.06;
platform.add(turntable);

// Işıklar: ana ışık gölge düşürür, arka ışık konturu ayırır
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(1.6, 3.2, 0.4).add(STAGE);
key.target.position.copy(STAGE);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -1.2; key.shadow.camera.right = 1.2; key.shadow.camera.top = 1.2; key.shadow.camera.bottom = -1.2;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 7;
key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight(0x9fd8ff, 1.2);
rim.position.set(-1.8, 1.6, -2.6).add(STAGE);
rim.target.position.copy(STAGE);
scene.add(key, key.target, rim, rim.target);

// --- Seçenekler ve fiyat ---
const LIGHTS = [
  { name: 'Stüdyo', key: 0xffffff, keyI: 2.4, rim: 0x9fd8ff, rimI: 1.2, env: 1.0, bg: ['#26303a', '#07090c'], ring: 0x39e6ff, exposure: 1.05 },
  { name: 'Gün batımı', key: 0xffb27a, keyI: 3.0, rim: 0xff7a5c, rimI: 1.4, env: 0.55, bg: ['#3a2620', '#0b0706'], ring: 0xffa060, exposure: 1.0 },
  { name: 'Gece', key: 0x9db8ff, keyI: 0.9, rim: 0x39e6ff, rimI: 2.2, env: 0.25, bg: ['#0f1826', '#030507'], ring: 0x39e6ff, exposure: 1.15 },
];
const FABRICS = [{ name: 'Mango kadife', swatch: '#d38a3a', mat: 0, price: 0 }, { name: 'Tavus kadife', swatch: '#1f6a73', mat: 4, price: 500 }];
const WOODS = [{ name: 'Kahve', swatch: '#6b4a2e', mat: 1, price: 0 }, { name: 'Siyah', swatch: '#1d1d1f', mat: 5, price: 300 }];
const BASE_PRICE = 12900;
const state = { fabric: 0, wood: 0, spin: true, light: 0 };
const price = () => BASE_PRICE + FABRICS[state.fabric].price + WOODS[state.wood].price;
const tl = n => n.toLocaleString('tr-TR') + ' TL';

// --- Koltuk modeli ---
let chair = null, parser = null, fabricMesh = null, woodMesh = null;
const mats = {};
async function material(i) { return (mats[i] ||= await parser.getDependency('material', i)); }
toast('Koltuk modeli yükleniyor…', 20000);
new GLTFLoader().load(MODEL_URL, async gltf => {
  chair = gltf.scene; parser = gltf.parser;
  chair.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (o.name.includes('fabric')) fabricMesh = o;
    if (o.name.includes('wood')) woodMesh = o;
  });
  chair.scale.setScalar(1.0);
  turntable.add(chair);
  await applyChoices();
  toast('Koltuk hazır · menüden kumaşı ve ahşabı değiştir');
}, undefined, () => toast('Model yüklenemedi; internet bağlantısını kontrol et', 6000));

async function applyChoices() {
  if (!chair) return;
  fabricMesh.material = await material(FABRICS[state.fabric].mat);
  woodMesh.material = await material(WOODS[state.wood].mat);
  parser.assignFinalMaterial?.(fabricMesh); parser.assignFinalMaterial?.(woodMesh);
  applyLight();
}
function applyLight() {
  const L = LIGHTS[state.light];
  key.color.set(L.key); key.intensity = L.keyI;
  rim.color.set(L.rim); rim.intensity = L.rimI;
  ringMat.emissive.set(L.ring);
  renderer.toneMappingExposure = L.exposure;
  scene.traverse(o => { if (o.isMesh && o.material?.envMapIntensity !== undefined) o.material.envMapIntensity = L.env; });
  floor.material.envMapIntensity = L.env * 0.35; // zemin parlak yansımayla gri görünmesin
  if (!renderer.xr.isPresenting) scene.background = backdrop(...L.bg);
}
applyLight();

// --- Menü: cam panel + 4 düğme (ikon, değer, renk örneği) ---
const BUTTONS = [
  { id: 'fabric', label: 'Kumaş', icon: 'swatch', value: () => FABRICS[state.fabric].name, swatch: () => FABRICS[state.fabric].swatch,
    press() { state.fabric = (state.fabric + 1) % FABRICS.length; applyChoices(); } },
  { id: 'wood', label: 'Ahşap', icon: 'swatch', value: () => WOODS[state.wood].name, swatch: () => WOODS[state.wood].swatch,
    press() { state.wood = (state.wood + 1) % WOODS.length; applyChoices(); } },
  { id: 'spin', label: 'Döndür', icon: 'spin', value: () => (state.spin ? 'Açık' : 'Kapalı'), press() { state.spin = !state.spin; } },
  { id: 'light', label: 'Işık', icon: 'sun', value: () => LIGHTS[state.light].name, press() { state.light = (state.light + 1) % LIGHTS.length; applyLight(); } },
];
const menu = new THREE.Group();
scene.add(menu);
const BW = 0.084, BH = 0.05, GAP = 0.007, HEADER = 0.032, PW = 2 * BW + 3 * GAP, PH = 2 * BH + 2 * GAP + HEADER;
const panelCanvas = document.createElement('canvas');
panelCanvas.width = 1024; panelCanvas.height = Math.round(1024 * PH / PW);
const panelTex = new THREE.CanvasTexture(panelCanvas);
panelTex.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, toneMapped: false }));
panel.position.set(0, (HEADER - GAP) / 2, -0.003);
menu.add(panel);
function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function drawPanel() {
  const g = panelCanvas.getContext('2d'), W = panelCanvas.width, H = panelCanvas.height;
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(22,32,40,0.92)'); bg.addColorStop(1, 'rgba(8,12,16,0.92)');
  rr(g, 2, 2, W - 4, H - 4, 48); g.fillStyle = bg; g.fill();
  g.strokeStyle = 'rgba(160,230,255,0.28)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#8fb2bf'; g.font = '700 30px Montserrat, sans-serif'; g.textBaseline = 'middle';
  const ty = H * (HEADER / 2) / PH; // başlık bandının ortası
  g.fillText('KOLTUK · YAPILANDIR', 48, ty);
  g.textAlign = 'right'; g.fillStyle = '#e8fbff'; g.font = '800 44px Montserrat, sans-serif';
  g.fillText(tl(price()), W - 48, ty);
  g.textAlign = 'left';
  panelTex.needsUpdate = true;
}

function icon(g, kind, x, y, s, color, sw) {
  g.save(); g.translate(x, y); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = s * 0.12; g.lineCap = 'round';
  if (kind === 'swatch') {
    g.beginPath(); g.arc(0, 0, s * 0.5, 0, Math.PI * 2); g.fillStyle = sw; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = s * 0.08; g.stroke();
  } else if (kind === 'spin') {
    g.beginPath(); g.arc(0, 0, s * 0.42, -0.4, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.moveTo(s * 0.42, -s * 0.36); g.lineTo(s * 0.42, s * 0.02); g.lineTo(s * 0.1, -s * 0.12); g.closePath(); g.fill();
  } else {
    g.beginPath(); g.arc(0, 0, s * 0.22, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * s * 0.34, Math.sin(a) * s * 0.34); g.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5); g.stroke(); }
  }
  g.restore();
}

const buttons = BUTTONS.map((b, i) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = Math.round(512 * BH / BW);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  mesh.position.set((i % 2 ? 1 : -1) * (BW + GAP) / 2, (i < 2 ? 1 : -1) * (BH + GAP) / 2, 0);
  mesh.userData = { ...b, canvas, tex, hover: false, hoverK: 0, pressT: 0, base: mesh.position.clone() };
  menu.add(mesh);
  return mesh;
});
function drawButton(m) {
  const u = m.userData, g = u.canvas.getContext('2d'), W = u.canvas.width, H = u.canvas.height;
  const on = u.pressT > 0;
  g.clearRect(0, 0, W, H);
  rr(g, 3, 3, W - 6, H - 6, 34);
  g.fillStyle = on ? '#39e6ff' : `rgba(57,230,255,${0.07 + u.hoverK * 0.16})`; g.fill();
  g.strokeStyle = `rgba(57,230,255,${0.35 + u.hoverK * 0.55})`; g.lineWidth = 4; g.stroke();
  const ink = on ? '#03141e' : '#e8fbff';
  icon(g, u.icon, 74, H / 2, 70, ink, u.swatch?.());
  g.textBaseline = 'middle'; g.fillStyle = on ? '#03141e' : '#8fb2bf'; g.font = '700 34px Montserrat, sans-serif';
  g.fillText(u.label.toLocaleUpperCase('tr-TR'), 138, H / 2 - 30);
  g.fillStyle = ink; g.font = '700 46px Montserrat, sans-serif';
  let v = u.value(); while (g.measureText(v).width > W - 160 && v.length > 2) v = v.slice(0, -2) + '…';
  g.fillText(v, 138, H / 2 + 24);
  u.tex.needsUpdate = true;
}

// Basış: düğme içeri çöker, kısa ses, fiyat ve değer güncellenir
let audio = null;
function click() {
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
    o.type = 'triangle'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    v.gain.setValueAtTime(0.07, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(v).connect(audio.destination); o.start(t); o.stop(t + 0.1);
  } catch { /* ses yoksa sessiz devam */ }
}
function pressButton(m) {
  if (m.userData.pressT > 0) return;
  m.userData.press();
  m.userData.pressT = 0.22;
  click();
  toast(`${m.userData.label}: ${m.userData.value()} · ${tl(price())}`);
}

// --- Telefon / bilgisayar: sürükleyerek etrafında dön (yumuşak ataletli), dokun / tıkla ---
const compat = setupCompat({ THREE, renderer, ui, toast, touch: TOUCH });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let orbit = 0, orbitV = 0, drag = null;
const canvas = renderer.domElement;
function screenHit(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(buttons, false)[0]?.object || null;
}
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, moved: 0 }; orbitV = 0; });
canvas.addEventListener('pointermove', e => {
  if (!renderer.xr.isPresenting && e.pointerType === 'mouse') { const h = screenHit(e); for (const b of buttons) b.userData.hover = b === h; }
  if (!drag) return;
  const dx = e.clientX - drag.x;
  drag.moved += Math.abs(dx); drag.x = e.clientX;
  orbitV = -dx * 0.006; orbit += orbitV;
});
canvas.addEventListener('pointerup', e => {
  if (drag && drag.moved < 8 && !renderer.xr.isPresenting) { const h = screenHit(e); if (h) pressButton(h); }
  drag = null;
});

// --- VR: menü sol ele / sol kumandaya bağlı; sağ ışın + tetik/pinch ya da parmakla dokunarak basılır ---
const hands = [0, 1].map(i => renderer.xr.getHand(i));
const ctrls = [0, 1].map(i => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  c.addEventListener('connected', e => { c.userData.handedness = e.data.handedness; c.userData.isHand = !!e.data.hand; });
  c.addEventListener('disconnected', () => { c.userData.handedness = null; });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.7 }));
  line.visible = false; c.add(line); c.userData.line = line;
  c.addEventListener('selectstart', () => { const h = c.userData.hover; if (h) pressButton(h); });
  scene.add(c, grip, hands[i]);
  return { c, grip, hand: hands[i] };
});
const rot = new THREE.Matrix4(), tmp = new THREE.Vector3(), camPos = new THREE.Vector3(), bp = new THREE.Vector3();
function rayHit(c) {
  rot.identity().extractRotation(c.matrixWorld);
  ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
  ray.ray.direction.set(0, 0, -1).applyMatrix4(rot);
  return ray.intersectObjects(buttons, false)[0] || null;
}
function updateXR() {
  const left = ctrls.find(x => x.c.userData.handedness === 'left'), right = ctrls.find(x => x.c.userData.handedness === 'right');
  const wrist = left?.hand.joints?.wrist;
  const anchor = wrist && left.c.userData.isHand ? wrist : left?.grip;
  if (anchor) { anchor.getWorldPosition(menu.position).add(tmp.set(0, 0.1, 0)); menu.lookAt(camPos); menu.visible = true; }
  else menu.visible = false;
  for (const x of ctrls) { x.c.userData.hover = null; x.c.userData.line.visible = false; }
  if (right) {
    const tip = right.hand.joints?.['index-finger-tip'];
    if (tip && right.c.userData.isHand) {
      tip.getWorldPosition(tmp);
      for (const b of buttons) {
        const d = b.getWorldPosition(bp).distanceTo(tmp);
        if (d < 0.025 && !b.userData.poked) { b.userData.poked = true; pressButton(b); }
        else if (d > 0.04) b.userData.poked = false;
      }
    }
    const h = rayHit(right.c);
    right.c.userData.hover = h?.object || null;
    right.c.userData.line.visible = true;
    right.c.userData.line.scale.z = h ? h.distance : 1;
  }
  for (const b of buttons) b.userData.hover = ctrls.some(x => x.c.userData.hover === b);
}

async function addVRButton() {
  if (!navigator.xr) return;
  const timeout = new Promise(r => setTimeout(() => r(false), 3000));
  if (!await Promise.race([navigator.xr.isSessionSupported('immersive-vr').catch(() => false), timeout])) return;
  const b = document.createElement('button');
  b.textContent = 'VR’a Gir';
  ui.prepend(b);
  b.onclick = async () => {
    if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
    scene.background = new THREE.Color(LIGHTS[state.light].bg[1]);
    session.addEventListener('end', () => { b.textContent = 'VR’a Gir'; menu.visible = true; applyLight(); });
    await renderer.xr.setSession(session);
    b.textContent = 'Çıkış';
  };
}
hint.textContent = TOUCH ? 'Menüden seç · Sağa sola kaydır: koltuğun etrafında dön' : 'Menüden seç · Sürükle: koltuğun etrafında dön';
await addVRButton();

// --- Parlama (bloom): sadece ekranda; VR'da ve zayıf cihazda kapalı ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// --- Ana döngü ---
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), down = new THREE.Vector3(), right3 = new THREE.Vector3(), look = new THREE.Vector3();
let frame = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const xr = renderer.xr.isPresenting;
  if (!xr) {
    compat.tick(dt);
    // Kamera platformun etrafında döner (bırakınca yavaşlayarak durur); hareketle bakma açıksa yön telefondan gelir
    if (!drag) { orbit += orbitV; orbitV *= Math.pow(0.04, dt); }
    const portrait = camera.aspect < 1, dist = portrait ? 3.5 : 2.15;
    camera.position.set(STAGE.x + Math.sin(orbit) * dist, portrait ? 1.55 : 1.25, STAGE.z + Math.cos(orbit) * dist);
    // Dikeyde koltuk üst yarıda (menü altta); yatayda koltuk sola kayar (menü sağda)
    look.copy(STAGE).setY(portrait ? 0.02 : 0.48);
    if (!portrait) look.addScaledVector(tmp.set(Math.cos(orbit), 0, -Math.sin(orbit)), 0.3);
    camera.lookAt(look);
    const mo = compat.motion;
    if (mo.active) camera.rotation.set(mo.pitch, mo.yaw + orbit, mo.roll, 'YXZ');
    camera.updateMatrixWorld();
    // Menü: yatayda sağda, dikeyde altta; ürünü kapatmaz
    camera.getWorldPosition(camPos); camera.getWorldDirection(fwd);
    down.set(0, -1, 0).applyQuaternion(camera.quaternion);
    right3.set(1, 0, 0).applyQuaternion(camera.quaternion);
    menu.position.copy(camPos).addScaledVector(fwd, 0.55).addScaledVector(down, portrait ? 0.11 : 0.04);
    // Sağa kaydır ama ekrandan taşırma: görünen yarı genişlik (0.55 m'de) − menünün yarısı − kenar payı
    if (!portrait) menu.position.addScaledVector(right3, Math.max(0, Math.min(0.24, 0.211 * camera.aspect - 0.15)));
    menu.quaternion.copy(camera.quaternion);
    menu.scale.setScalar(portrait ? 0.85 : 1.25);
  } else {
    renderer.xr.getCamera().getWorldPosition(camPos);
    menu.scale.setScalar(1);
    updateXR();
  }
  if (state.spin) turntable.rotation.y += dt * 0.35;
  ringMat.emissiveIntensity = 2 + Math.sin(t * 2) * 0.35;
  for (const b of buttons) {
    const u = b.userData;
    if (u.pressT > 0) u.pressT -= dt;
    u.hoverK += ((u.hover ? 1 : 0) - u.hoverK) * Math.min(1, dt * 12);
    b.position.z = u.pressT > 0 ? -0.004 : 0.002 * u.hoverK;
    b.scale.setScalar(1 + 0.04 * u.hoverK);
  }
  if (frame++ % 3 === 0) { buttons.forEach(drawButton); drawPanel(); }
  if (xr || compat.quality.drops > 0) renderer.render(scene, camera);
  else composer.render();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// --- Otomatik test kancası ---
window.__hud = {
  camera, buttons, menu, state, compat, price,
  get product() { return chair; },
  get materials() { return { fabric: fabricMesh?.material.name, wood: woodMesh?.material.name }; },
  press: id => pressButton(buttons.find(b => b.userData.id === id)),
  aim(y) { orbit = y; },
};
document.getElementById('boot').hidden = true;
