// AR bilgi etiketleri: telefon kamerasında gerçek yüzeylere, AR olmayan cihazlarda stüdyo ışıklı bir mağaza köşesine kart yerleştirir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setupCompat } from '../compat.js?v=11';

// ?emulate: Meta IWER emülatörü (gözlük/telefon olmadan AR testi)
if (new URLSearchParams(location.search).has('emulate')) {
  const { XRDevice, metaQuest3 } = await import('https://cdn.jsdelivr.net/npm/iwer@2.4.0/build/iwer.module.js');
  window.__xrDevice = new XRDevice(metaQuest3);
  window.__xrDevice.installRuntime({ forceInstall: true });
}

const CHAIR_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/SheenChair.glb';
const LAMP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/LightsPunctualLamp.glb';

// --- Etiket türleri: renk, ikon, başlık ve örnek yazı ---
const TYPES = {
  info: { name: 'Bilgi', color: '#39e6ff', glyph: 'i', title: 'BİLGİ', sample: 'Dimmerlı · 2700K sıcak ışık' },
  price: { name: 'Fiyat', color: '#7dffb0', glyph: '₺', title: 'FİYAT', sample: '12.900 TL · Stokta' },
  warn: { name: 'Uyarı', color: '#ffb347', glyph: '!', title: 'DİKKAT', sample: 'Ampul sıcak olabilir' },
};
let currentType = 'info';
const TOUCH = matchMedia('(pointer: coarse)').matches;
const MAX_LABELS = 30;

const hint = document.getElementById('hint');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}
const textInput = document.getElementById('labelText');

// --- Render: film tonu, ortam ışığı, yumuşak gölge ---
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 100);
camera.position.set(0.2, 1.45, 1.5);
scene.add(camera);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;

function backdrop() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#07090c'); gr.addColorStop(0.55, '#232a31'); gr.addColorStop(1, '#07090c');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BG = backdrop();
scene.background = BG;

// --- Mağaza köşesi (AR'da gizlenir): zemin, sehpa, koltuk, lamba ---
const room = new THREE.Group();
scene.add(room);
const surfaces = [];
const fade = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#999'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
})();
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 96), new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.5, alphaMap: fade, transparent: true, depthWrite: false, envMapIntensity: 0.35 }));
floor.rotation.x = -Math.PI / 2; floor.position.z = -0.6;
floor.receiveShadow = true;
room.add(floor); surfaces.push(floor);
// Halı: sıcak tonlu yuvarlak alan, ürünleri bir arada toplar
const rug = new THREE.Mesh(new THREE.CircleGeometry(1.15, 96), new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.95, envMapIntensity: 0.4 }));
rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.004, -0.75);
rug.receiveShadow = true;
room.add(rug); surfaces.push(rug);

// Sehpa: mermer görünümlü cilalı tabla + siyah metal ayak
const TABLE = new THREE.Vector3(0.62, 0, -0.55), TABLE_TOP = 0.56;
const marble = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#cfcac3'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(70,64,58,0.55)';
  for (let i = 0; i < 28; i++) {
    g.lineWidth = 0.6 + Math.random() * 2.2; g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (Math.random() - 0.3) * 90; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const tabletop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 64), new THREE.MeshPhysicalMaterial({ map: marble, roughness: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 0.4 }));
tabletop.position.set(TABLE.x, TABLE_TOP - 0.0125, TABLE.z);
tabletop.castShadow = tabletop.receiveShadow = true;
room.add(tabletop); surfaces.push(tabletop);
const metal = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.9, roughness: 0.35 });
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, TABLE_TOP - 0.04, 24), metal);
stem.position.set(TABLE.x, (TABLE_TOP - 0.04) / 2 + 0.015, TABLE.z); stem.castShadow = true;
const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.015, 48), metal);
foot.position.set(TABLE.x, 0.0075, TABLE.z); foot.castShadow = foot.receiveShadow = true;
room.add(stem, foot);

// Işıklar
const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
key.position.set(1.6, 3, 1.2); key.target.position.set(0, 0, -0.7);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 7 });
key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
const fill = new THREE.DirectionalLight(0x9fd8ff, 0.6);
fill.position.set(-2, 1.5, -2.5);
scene.add(key, key.target, fill);

// Gerçek ürün modelleri
const loader = new GLTFLoader();
let loaded = 0;
function addModel(url, setup) {
  loader.load(url, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; surfaces.push(o); } });
    setup(gltf.scene);
    room.add(gltf.scene);
    if (++loaded === 2) { toast('Mağaza köşesi hazır · bir ürüne dokun, etiket koy'); seedLabels(); }
  }, undefined, () => toast('Bir model yüklenemedi; internet bağlantısını kontrol et', 5000));
}
toast('Ürün modelleri yükleniyor…', 20000);
addModel(CHAIR_URL, s => { s.position.set(-0.3, 0.004, -0.85); s.rotation.y = 0.35; });
addModel(LAMP_URL, s => {
  // Lamba modelini sehpaya oturt: boyunu ~45 cm'ye ölçekle, tabanını tablaya koy
  const box = new THREE.Box3().setFromObject(s), size = box.getSize(new THREE.Vector3());
  s.scale.setScalar(0.45 / size.y);
  box.setFromObject(s);
  s.position.set(TABLE.x - (box.min.x + box.max.x) / 2 + 0.05, TABLE_TOP - box.min.y, TABLE.z - (box.min.z + box.max.z) / 2 - 0.05);
  s.traverse(o => { if (o.isLight) o.intensity *= 0.02; }); // modelin kendi ışığı sahneyi patlatmasın
});

// --- Nişan halkası (AR'da yerleşecek nokta) ---
const reticle = new THREE.Group();
reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.04, 0.05, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x39e6ff, toneMapped: false })));
reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.008, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x39e6ff, toneMapped: false })));
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// --- Etiket kartı: cam görünümlü kart + ince bağlantı çizgisi + nabız gibi atan bağlantı noktası ---
const labels = [];
function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function cardTexture(type, text) {
  const t = TYPES[type], c = document.createElement('canvas');
  c.width = 960; c.height = 240;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 240);
  bg.addColorStop(0, 'rgba(26,36,44,0.94)'); bg.addColorStop(1, 'rgba(8,12,16,0.94)');
  rr(g, 4, 4, 952, 232, 40); g.fillStyle = bg; g.fill();
  g.strokeStyle = t.color + '99'; g.lineWidth = 3; g.stroke();
  // İkon dairesi
  g.beginPath(); g.arc(104, 120, 56, 0, Math.PI * 2); g.fillStyle = t.color + '26'; g.fill();
  g.lineWidth = 4; g.strokeStyle = t.color; g.stroke();
  g.fillStyle = t.color; g.font = '800 58px Montserrat, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(t.glyph, 104, 124);
  g.textAlign = 'left';
  g.fillStyle = t.color; g.font = '700 30px Montserrat, sans-serif'; g.fillText(t.title, 196, 84);
  g.fillStyle = '#eefbff'; g.font = '700 44px Montserrat, sans-serif';
  let s = text;
  while (g.measureText(s).width > 730 && s.length > 1) s = s.slice(0, -2) + '…';
  g.fillText(s, 196, 146);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function addLabel(matrix, type = currentType, forcedText) {
  if (labels.length >= MAX_LABELS) { toast(`En fazla ${MAX_LABELS} etiket`); return; }
  const text = forcedText || textInput.value.trim() || TYPES[type].sample;
  const color = new THREE.Color(TYPES[type].color);
  const anchor = new THREE.Group();
  matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
  anchor.quaternion.identity(); anchor.scale.set(1, 1, 1);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.009, 20, 14), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.2, 0)]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false }));
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), new THREE.MeshBasicMaterial({ map: cardTexture(type, text), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  card.position.y = 0.247;
  anchor.add(dot, pulse, line, card);
  anchor.userData = { card, pulse, type, text, born: clock.elapsedTime };
  scene.add(anchor);
  labels.push(anchor);
  if (!forcedText) toast(`${TYPES[type].name} etiketi eklendi`);
}
function removeLabel(a) {
  scene.remove(a);
  a.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
}
const m4 = new THREE.Matrix4();
// Sayfa ilk açıldığında örnek etiketlerle dolu gelsin (kullanıcı Temizle ile siler)
function seedLabels() {
  if (labels.length) return;
  addLabel(m4.makeTranslation(-0.3, 0.46, -0.78), 'price', 'Kadife koltuk · 12.900 TL');
  addLabel(m4.makeTranslation(TABLE.x + 0.04, TABLE_TOP + 0.43, TABLE.z - 0.05), 'info', 'Dimmerlı · 2700K sıcak ışık');
  addLabel(m4.makeTranslation(TABLE.x - 0.2, TABLE_TOP, TABLE.z + 0.12), 'warn', 'Mermer tabla · altlık kullan');
}

// --- Arayüz: tür seçimi, geri al, temizle ---
const typesEl = document.getElementById('types');
for (const [k, t] of Object.entries(TYPES)) {
  const b = document.createElement('button');
  b.textContent = t.name; b.dataset.type = k;
  b.onclick = () => { currentType = k; textInput.placeholder = t.sample; for (const x of typesEl.children) x.classList.toggle('on', x.dataset.type === k); };
  typesEl.appendChild(b);
}
typesEl.children[0].click();
document.getElementById('undo').onclick = () => { const a = labels.pop(); if (a) { removeLabel(a); toast('Son etiket silindi'); } };
document.getElementById('clear').onclick = () => { while (labels.length) removeLabel(labels.pop()); toast('Tüm etiketler silindi'); };
const ui = document.getElementById('ui');
document.getElementById('overlay').addEventListener('beforexrselect', e => e.preventDefault()); // AR'da arayüze dokunmak etiket koymasın

// --- Yedek modda bakma (sürükle, yumuşak) ve dokunarak yerleştirme ---
const compat = setupCompat({ THREE, renderer, ui, toast, touch: TOUCH });
// Dikey ekranda sahne ortalanır (kamera ayrıca geri çekilir, bkz. ana döngü)
let yaw = innerWidth < innerHeight ? 0 : 0.12, pitch = -0.36, drag = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  yaw -= dx * 0.003; pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -1.2, 0.6);
});
canvas.addEventListener('pointerup', e => {
  if (drag && drag.moved < 8 && !renderer.xr.isPresenting) {
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(surfaces, false)[0];
    if (hit) addLabel(m4.makeTranslation(hit.point.x, hit.point.y, hit.point.z));
  }
  drag = null;
});

// --- AR oturumu: hit-test ile gerçek yüzeylere yerleştirme ---
let hitSource = null, hitPending = false, arMode = false;
const controller = renderer.xr.getController(0);
controller.addEventListener('select', () => {
  if (reticle.visible) addLabel(reticle.matrix);
  else { const p = new THREE.Vector3(0, 0, -1).applyMatrix4(controller.matrixWorld); addLabel(m4.makeTranslation(p.x, p.y - 0.25, p.z)); }
});
scene.add(controller);
const PLAY_HINT = TOUCH ? 'Bir ürüne ya da yüzeye dokun: etiket koy · Sürükle: bak' : 'Bir ürüne ya da yüzeye tıkla: etiket koy · Sürükle: bak';
hint.textContent = PLAY_HINT;
async function addARButton() {
  if (!navigator.xr) return;
  const timeout = new Promise(r => setTimeout(() => r(false), 3000));
  if (!await Promise.race([navigator.xr.isSessionSupported('immersive-ar').catch(() => false), timeout])) return;
  const b = document.createElement('button');
  b.textContent = 'Kamerada Aç (AR)';
  ui.prepend(b);
  b.onclick = async () => {
    if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
    const session = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['hit-test', 'dom-overlay', 'local-floor'], domOverlay: { root: document.getElementById('overlay') },
    });
    arMode = true; room.visible = false; scene.background = null; hitPending = true;
    session.addEventListener('end', () => {
      arMode = false; room.visible = true; scene.background = BG;
      hitSource?.cancel?.(); hitSource = null; reticle.visible = false; b.textContent = 'Kamerada Aç (AR)'; hint.textContent = PLAY_HINT;
    });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    b.textContent = 'Çıkış';
    hint.textContent = 'Telefonu masaya/zemine doğrult · halka görününce ekrana dokun';
  };
}
await addARButton();

// --- Ana döngü ---
const clock = new THREE.Clock();
const camPos = new THREE.Vector3();
let curYaw = yaw, curPitch = pitch;
renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (!renderer.xr.isPresenting) {
    compat.tick(dt);
    const k = 1 - Math.exp(-dt * 10); // bakış yumuşak takip etsin
    curYaw += (yaw - curYaw) * k; curPitch += (pitch - curPitch) * k;
    const portrait = camera.aspect < 1;
    camera.position.set(portrait ? 0.16 : 0.2, portrait ? 2.0 : 1.45, portrait ? 3.3 : 1.5);
    const mo = compat.motion;
    if (mo.active) camera.rotation.set(mo.pitch, mo.yaw + yaw, mo.roll, 'YXZ');
    else camera.rotation.set(curPitch, curYaw, 0, 'YXZ');
  }
  if (frame && arMode) {
    const session = renderer.xr.getSession(), refSpace = renderer.xr.getReferenceSpace();
    if (hitPending && session.requestHitTestSource) {
      hitPending = false;
      session.requestReferenceSpace('viewer').then(space => session.requestHitTestSource({ space }))
        .then(src => { hitSource = src; }).catch(() => toast('Bu cihazda yüzey algılama yok; etiketler önüne yerleşecek'));
    }
    const results = hitSource ? frame.getHitTestResults(hitSource) : [];
    reticle.visible = results.length > 0;
    if (reticle.visible) reticle.matrix.fromArray(results[0].getPose(refSpace).transform.matrix);
  }
  (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(camPos);
  for (const a of labels) {
    const { card, pulse, born } = a.userData, age = t - born;
    card.lookAt(camPos.x, a.position.y + card.position.y, camPos.z);
    const s = Math.min(1, age * 3.2); // kart açılırken hafif büyüyüp yerine oturur
    card.scale.setScalar(0.7 + 0.3 * (1 - Math.pow(1 - s, 3)));
    card.material.opacity = s;
    const p = (t * 0.8 + born) % 1; // bağlantı noktası nabız gibi atar
    pulse.scale.setScalar(1 + p * 2.5); pulse.material.opacity = 0.8 * (1 - p);
  }
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Otomatik test kancası ---
window.__hud = {
  labels, camera, compat,
  tableTop: new THREE.Vector3(TABLE.x - 0.12, TABLE_TOP, TABLE.z + 0.14),
  get ready() { return loaded === 2; },
  addLabelAt: (x, y, z) => addLabel(m4.makeTranslation(x, y, z)),
  aim(y, p) { yaw = curYaw = y; pitch = curPitch = p; },
  get arMode() { return arMode; },
};
document.getElementById('boot').hidden = true;
