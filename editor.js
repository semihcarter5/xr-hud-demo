// HUD düzenleme modu: X/Y/Z gizmosu, ayar paneli, kaydetme/yükleme.
// Ayarlar hud-config.json şemasındadır; geliştirici fareyle, AI ise dosyayı düzenleyerek aynı ayarlar üzerinde çalışır.
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import GUI from 'lil-gui';

const STORE_KEY = 'hud-demo-config-v1';
const PANEL_NAMES = { 'Pusula': 'compass', 'Nişangâh': 'center', 'Enerji': 'energy', 'Bilgi paneli': 'stats' };
const MODE_KEYS = { KeyW: 'translate', KeyT: 'rotate', KeyR: 'scale' };

export function createEditor({ THREE, scene, camera, renderer, panels, settings, applySettings, mergeSettings, defaultSettings, toast, onToggle }) {
  let editing = false, selected = null, saveTimer = 0;
  const r3 = v => Math.round(v * 1000) / 1000;
  const r1 = v => Math.round(v * 10) / 10;

  // --- X/Y/Z gizmosu ---
  const tc = new TransformControls(camera, renderer.domElement);
  tc.setSpace('local');
  tc.setSize(1.2);
  tc.traverse(o => { o.renderOrder = 100; }); // HUD panellerinin üstünde çizilsin
  scene.add(tc);

  let dragStartScale = 1;
  tc.addEventListener('mouseDown', () => { if (tc.object) dragStartScale = tc.object.scale.x; });
  tc.addEventListener('objectChange', () => {
    const o = tc.object;
    if (!o) return;
    const p = settings.panels[o.name];
    if (tc.mode === 'scale') {
      // Panel oranı bozulmasın: sürüklenen eksenin değerini (başlangıçtan en çok sapan) tüm eksenlere uygula
      const v = [o.scale.x, o.scale.y, o.scale.z].reduce((a, b) => (Math.abs(b - dragStartScale) > Math.abs(a - dragStartScale) ? b : a));
      o.scale.setScalar(THREE.MathUtils.clamp(v, 0.2, 4));
    }
    commit(o);
  });

  // Panelin sahnedeki konumunu ayarlara yazar (gizmo ve VR'da elle taşıma ortak kullanır)
  function commit(o) {
    const p = settings.panels[o.name];
    p.position = o.position.toArray().map(r3);
    p.rotation = [o.rotation.x, o.rotation.y, o.rotation.z].map(a => r1(THREE.MathUtils.radToDeg(a)));
    p.scale = r3(o.scale.x);
    syncProxy();
    scheduleSave();
  }

  // --- Ayar paneli ---
  const gui = new GUI({ title: 'HUD Düzenleyici' });
  gui.hide();
  const state = { panel: 'center', mode: 'translate' };
  const proxy = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, visible: true };

  const panelCtl = gui.add(state, 'panel', PANEL_NAMES).name('Panel').onChange(n => select(panels[n]));
  const modeCtl = gui.add(state, 'mode', { 'Taşı (W)': 'translate', 'Döndür (T)': 'rotate', 'Ölçekle (R)': 'scale' }).name('Araç').onChange(m => tc.setMode(m));

  const fp = gui.addFolder('Seçili panel');
  fp.add(proxy, 'x', -1.5, 1.5, 0.005).name('X (m)').onChange(fromProxy);
  fp.add(proxy, 'y', -1, 1, 0.005).name('Y (m)').onChange(fromProxy);
  fp.add(proxy, 'z', -1, 1, 0.005).name('Z derinlik (m)').onChange(fromProxy);
  fp.add(proxy, 'rx', -90, 90, 1).name('Dönüş X (°)').onChange(fromProxy);
  fp.add(proxy, 'ry', -90, 90, 1).name('Dönüş Y (°)').onChange(fromProxy);
  fp.add(proxy, 'rz', -90, 90, 1).name('Dönüş Z (°)').onChange(fromProxy);
  fp.add(proxy, 'scale', 0.2, 4, 0.01).name('Boyut').onChange(fromProxy);
  fp.add(proxy, 'visible').name('Görünür').onChange(fromProxy);

  const ft = gui.addFolder('Tema');
  ft.addColor(settings.theme, 'main').name('Ana renk').onChange(applyAndSave);
  ft.addColor(settings.theme, 'lock').name('Kilit rengi').onChange(applyAndSave);
  ft.addColor(settings.theme, 'energy').name('Enerji rengi').onChange(applyAndSave);
  ft.addColor(settings.theme, 'drone').name('Dron rengi').onChange(applyAndSave);
  ft.add(settings.theme, 'glow', 0, 30, 1).name('Parlama').onChange(applyAndSave);
  ft.add(settings.theme, 'opacity', 0.2, 1, 0.05).name('Opaklık').onChange(applyAndSave);
  ft.add(settings.hud, 'distance', 0.8, 3, 0.05).name('VR mesafesi (m)').onChange(applyAndSave);

  const actions = { saveToFile, copyJson, loadFromFile, loadProjectFile, reset };
  const fs = gui.addFolder('Kaydet / yükle');
  fs.add(actions, 'saveToFile').name('Dosyaya kaydet');
  fs.add(actions, 'copyJson').name('JSON kopyala');
  fs.add(actions, 'loadFromFile').name('Dosyadan yükle');
  fs.add(actions, 'loadProjectFile').name('Projedeki hud-config.json');
  fs.add(actions, 'reset').name('Varsayılana dön');
  ft.close();
  if (innerWidth < 700) gui.close(); // telefonda sahne görünsün, başlığa dokununca açılır

  function fromProxy() {
    if (!selected) return;
    const p = settings.panels[selected.name];
    p.position = [proxy.x, proxy.y, proxy.z];
    p.rotation = [proxy.rx, proxy.ry, proxy.rz];
    p.scale = proxy.scale;
    p.visible = proxy.visible;
    applyAndSave();
  }

  function syncProxy() {
    if (!selected) return;
    const p = settings.panels[selected.name];
    [proxy.x, proxy.y, proxy.z] = p.position;
    [proxy.rx, proxy.ry, proxy.rz] = p.rotation;
    proxy.scale = p.scale;
    proxy.visible = p.visible;
    fp.controllers.forEach(c => c.updateDisplay());
  }

  function refreshAll() {
    applySettings();
    syncProxy();
    gui.controllersRecursive().forEach(c => c.updateDisplay());
  }

  function applyAndSave() {
    applySettings();
    scheduleSave();
  }

  // Taslak her değişiklikte tarayıcıya kaydedilir; kalıcı paylaşım için dosyaya kaydet
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* gizli pencere vb. */ }
    }, 300);
  }

  function json() { return JSON.stringify(settings, null, 2); }

  async function saveToFile() {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'hud-config.json',
          types: [{ description: 'HUD ayarları', accept: { 'application/json': ['.json'] } }],
        });
        const w = await handle.createWritable();
        await w.write(json());
        await w.close();
        toast('Kaydedildi: ' + handle.name);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'hud-config.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('hud-config.json indirildi');
  }

  function copyJson() {
    navigator.clipboard.writeText(json())
      .then(() => toast('JSON panoya kopyalandı'))
      .catch(() => toast('Panoya kopyalanamadı'));
  }

  function loadFromFile() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        mergeSettings(settings, JSON.parse(await file.text()));
        refreshAll();
        scheduleSave();
        toast('Yüklendi: ' + file.name);
      } catch {
        toast('Geçersiz JSON dosyası');
      }
    };
    input.click();
  }

  // AI veya başka bir geliştirici dosyayı değiştirdiyse taslağı bırakıp onu yükler
  async function loadProjectFile() {
    try {
      const r = await fetch('hud-config.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      mergeSettings(settings, await r.json());
      try { localStorage.removeItem(STORE_KEY); } catch { /* yok say */ }
      refreshAll();
      toast('Projedeki hud-config.json yüklendi');
    } catch {
      toast('hud-config.json bulunamadı');
    }
  }

  function reset() {
    mergeSettings(settings, defaultSettings());
    try { localStorage.removeItem(STORE_KEY); } catch { /* yok say */ }
    refreshAll();
    toast('Varsayılan ayarlara dönüldü');
  }

  // --- Seçim ve mod ---
  function select(mesh) {
    selected = mesh;
    state.panel = mesh.name;
    panelCtl.updateDisplay();
    tc.attach(mesh);
    for (const m of Object.values(panels)) {
      const mat = m.userData.outline.material;
      mat.color.set(m === mesh ? '#ffd166' : '#ffffff');
      mat.opacity = m === mesh ? 0.95 : 0.35;
    }
    syncProxy();
  }

  function setEditMode(on) {
    if (on && renderer.xr.isPresenting) on = false;
    editing = on;
    for (const m of Object.values(panels)) m.userData.outline.visible = on;
    if (on) { gui.show(); select(selected || panels.center); }
    else { gui.hide(); tc.detach(); }
    onToggle(on);
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(Object.values(panels).filter(m => m.visible), false);
    if (hits.length) select(hits[0].object);
  }

  function handleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.code === 'KeyE') { setEditMode(!editing); return true; }
    if (!editing) return false;
    if (e.code === 'Escape') { setEditMode(false); return true; }
    const mode = MODE_KEYS[e.code];
    if (mode) { state.mode = mode; tc.setMode(mode); modeCtl.updateDisplay(); return true; }
    return false;
  }

  // Açılışta: önce tarayıcıdaki taslak, yoksa projedeki hud-config.json
  (async () => {
    let src = null;
    try { src = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* yok say */ }
    if (!src) {
      try {
        const r = await fetch('hud-config.json', { cache: 'no-store' });
        if (r.ok) src = await r.json();
      } catch { /* dosya yoksa varsayılanlar kalır */ }
    }
    if (src) { mergeSettings(settings, src); refreshAll(); }
  })();

  return {
    setEditMode,
    commit,
    isEditing: () => editing,
    isOverGizmo: () => editing && (tc.dragging || tc.axis !== null),
    pick,
    handleKey,
  };
}
