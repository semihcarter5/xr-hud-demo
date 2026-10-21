// Cihaz uyumluluğu: hareketle bakma (jiroskop), zayıf cihazlarda otomatik kalite, grafik bağlantısı kopunca toparlama.

export function setupCompat({ THREE, renderer, ui, toast, touch }) {
  // --- Hareketle bak: telefonu çevirerek etrafa bakma. WebXR olmayan telefonlarda (iPhone dahil) de çalışır. ---
  const motion = { active: false, yaw: 0, pitch: 0, roll: 0 };
  const deg = THREE.MathUtils.degToRad;
  const euler = new THREE.Euler(), out = new THREE.Euler(), q = new THREE.Quaternion(), q0 = new THREE.Quaternion();
  const zee = new THREE.Vector3(0, 0, 1);
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // kamera ekranın arkasına baksın
  let yawBase = null, gotEvent = false;

  function onOrient(e) {
    if (e.alpha == null) return;
    gotEvent = true;
    const screenAngle = deg(screen.orientation?.angle ?? window.orientation ?? 0);
    euler.set(deg(e.beta), deg(e.alpha), -deg(e.gamma), 'YXZ');
    q.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -screenAngle));
    out.setFromQuaternion(q, 'YXZ');
    if (yawBase === null) yawBase = out.y; // açıldığı anda bakılan yön "ileri" olsun
    motion.yaw = out.y - yawBase;
    motion.pitch = out.x;
    motion.roll = out.z;
  }

  const btn = document.createElement('button');
  btn.textContent = 'Hareketle bak';
  btn.hidden = !(touch && 'DeviceOrientationEvent' in window);
  ui.appendChild(btn);

  function disable() {
    removeEventListener('deviceorientation', onOrient);
    motion.active = false;
    btn.textContent = 'Hareketle bak';
  }
  async function enable() {
    // iPhone/iPad: izin, kullanıcı dokunuşuyla istenmeli
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') { toast('Hareket izni verilmedi'); return; }
      } catch { toast('Hareket izni alınamadı'); return; }
    }
    yawBase = null; gotEvent = false;
    addEventListener('deviceorientation', onOrient);
    motion.active = true;
    btn.textContent = 'Hareketi kapat';
    toast('Telefonu çevirerek etrafa bak · parmakla sağa sola da kaydırabilirsin');
    setTimeout(() => { if (motion.active && !gotEvent) { disable(); toast('Bu cihazda hareket sensörü bulunamadı'); } }, 1500);
  }
  btn.onclick = () => (motion.active ? disable() : enable());

  // --- Otomatik kalite: hız ~40 fps altına düşerse çözünürlüğü kademeli düşür ---
  const quality = { pixelRatio: renderer.getPixelRatio(), drops: 0 };
  let acc = 0, frames = 0, warmup = 3;
  function tick(dt) {
    if (renderer.xr.isPresenting) return;
    if (warmup > 0) { warmup -= dt; return; } // açılıştaki yükleme takılmalarını sayma
    acc += dt; frames++;
    if (acc < 2) return;
    const avg = acc / frames;
    acc = 0; frames = 0;
    if (avg > 1 / 40 && quality.pixelRatio > 0.75) {
      quality.pixelRatio = Math.max(0.75, quality.pixelRatio - 0.5);
      renderer.setPixelRatio(quality.pixelRatio);
      quality.drops++;
    }
  }

  // --- Telefon arka plana alınınca grafik bağlantısı koparsa toparla ---
  const canvas = renderer.domElement;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('Grafik bağlantısı koptu, toparlanıyor…'); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  return { motion, quality, tick };
}
