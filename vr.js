// VR/AR oturumu, kumandalar ve HUD panellerini VR'da elle tutup taşıma.
// Tetik veya el pinch'i bir panelin üzerindeyken paneli tutar (ateş etmez), boşluktayken basış anında ateş eder.
// Grip (yan tuş) her zaman tutmayı dener. Bırakınca yeni konum ayarlara kaydedilir.
// ?emulate parametresiyle Meta IWER Quest 3 emülatörü yüklenir (gözlüksüz test için).

const IWER_URL = 'https://cdn.jsdelivr.net/npm/iwer@2.4.0/build/iwer.module.js';

export async function setupVR({ THREE, renderer, scene, hudRig, panels, ui, env, BG, FOG, theme, onEnter, onFire, onGrab, onRelease }) {
  if (new URLSearchParams(location.search).has('emulate')) {
    const { XRDevice, metaQuest3 } = await import(IWER_URL);
    const device = new XRDevice(metaQuest3);
    device.installRuntime({ forceInstall: true });
    window.__xrDevice = device;
  }

  // --- Kumandalar, ışın çizgileri, tutma ---
  const ray = new THREE.Raycaster();
  const rot = new THREE.Matrix4(), m = new THREE.Matrix4(), scaleTmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const controllers = [];

  for (let i = 0; i < 2; i++) {
    const ctl = renderer.xr.getController(i);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: theme.main, transparent: true, opacity: 0.7, depthTest: false }));
    line.renderOrder = 30;
    line.visible = false;
    ctl.add(line);
    ctl.userData.line = line;
    ctl.userData.grab = null;
    // Ateş basış anında: panel üzerindeyse tut, değilse ateş et.
    // 'select' olayı kullanılmaz; çalışma zamanları onu farklı sırada gönderebiliyor (IWER basışta, Quest bırakışta).
    ctl.addEventListener('selectstart', () => { if (!tryGrab(ctl)) onFire(ctl); });
    ctl.addEventListener('squeezestart', () => tryGrab(ctl));
    ctl.addEventListener('selectend', () => release(ctl));
    ctl.addEventListener('squeezeend', () => release(ctl));
    scene.add(ctl);
    controllers.push(ctl);
  }

  function hit(ctl) {
    ctl.updateMatrixWorld(true);
    rot.identity().extractRotation(ctl.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(ctl.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(rot);
    return ray.intersectObjects(Object.values(panels).filter(p => p.visible), false)[0] || null;
  }

  const isGrabbed = panel => controllers.some(c => c.userData.grab?.panel === panel);

  // Panel tutulduysa true döner
  function tryGrab(ctl) {
    if (!renderer.xr.isPresenting) return false;
    if (ctl.userData.grab) return true;
    const h = hit(ctl);
    if (!h || isGrabbed(h.object)) return false;
    const panel = h.object;
    panel.updateMatrixWorld(true);
    // Panelin kumandaya göre konumu: taşırken bu bağ korunur
    const offset = new THREE.Matrix4().copy(ctl.matrixWorld).invert().multiply(panel.matrixWorld);
    ctl.userData.grab = { panel, offset };
    onGrab(panel);
    return true;
  }

  function release(ctl) {
    const g = ctl.userData.grab;
    if (!g) return;
    ctl.userData.grab = null;
    onRelease(g.panel);
  }

  // --- VR / AR butonları (cihaz destekliyorsa görünür) ---
  async function addButton(mode, label) {
    if (!navigator.xr) return;
    const ok = await navigator.xr.isSessionSupported(mode).catch(() => false);
    if (!ok) return;
    const btn = document.createElement('button');
    btn.textContent = label;
    ui.appendChild(btn);
    btn.onclick = async () => {
      if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
      onEnter();
      const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'hand-tracking'] });
      const ar = mode === 'immersive-ar';
      env.visible = !ar;
      scene.background = ar ? null : BG;
      scene.fog = ar ? null : FOG;
      session.addEventListener('end', () => {
        for (const c of controllers) release(c);
        for (const p of Object.values(panels)) p.userData.outline.visible = false;
        env.visible = true; scene.background = BG; scene.fog = FOG; btn.textContent = label;
      });
      await renderer.xr.setSession(session);
      btn.textContent = 'Çıkış';
    };
  }
  await Promise.all([addButton('immersive-vr', 'VR’a Gir'), addButton('immersive-ar', 'AR’da Aç')]);

  // Her karede: tutulan paneli kumandayla birlikte taşı, ışın ve vurgu çizimlerini güncelle
  function update() {
    if (!renderer.xr.isPresenting) return;
    hudRig.updateMatrixWorld(true);
    const hovered = new Set();
    for (const ctl of controllers) {
      const { line, grab } = ctl.userData;
      line.visible = true;
      line.material.color.set(theme.main);
      if (grab) {
        ctl.updateMatrixWorld(true);
        m.copy(hudRig.matrixWorld).invert().multiply(ctl.matrixWorld).multiply(grab.offset);
        m.decompose(grab.panel.position, grab.panel.quaternion, scaleTmp); // panel boyutu korunur
        grab.panel.updateMatrixWorld(true);
        line.scale.z = a.setFromMatrixPosition(ctl.matrixWorld).distanceTo(b.setFromMatrixPosition(grab.panel.matrixWorld));
        hovered.add(grab.panel);
        continue;
      }
      const h = hit(ctl);
      line.scale.z = h ? h.distance : 3;
      if (h) hovered.add(h.object);
    }
    for (const p of Object.values(panels)) {
      const o = p.userData.outline;
      o.visible = hovered.has(p);
      o.material.color.set(isGrabbed(p) ? theme.energy : '#ffd166');
      o.material.opacity = 0.95;
    }
  }

  return { update, controllers, isGrabbing: () => controllers.some(c => c.userData.grab) };
}
