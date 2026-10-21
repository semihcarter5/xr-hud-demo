// Fare, dokunmatik ve klavye girişi.
// Oyun: bir parmak sürükleyerek bakar; o sırada ikinci parmağın dokunuşu anında ateş eder. Tek dokunuş da ateş eder.
// Düzenleme: dokunuş paneli seçer; iki parmakla sıkıştırma boyutu, çevirme yatırmayı değiştirir; fare tekerleği boyut.
// Klavye ok tuşları ve oyun kumandası da bakma/ateş için kullanılabilir.

export function setupInput({ el, editor, fire, onLook }) {
  const pointers = new Map(); // pointerId -> { x, y, moved }
  let lookId = null, gesture = null;

  function pair() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  el.addEventListener('pointerdown', e => {
    if (editor.isOverGizmo()) return; // gizmo kendi sürüklemesini yapar
    try { el.setPointerCapture(e.pointerId); } catch { /* sentetik olay */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 });
    if (editor.isEditing()) {
      if (pointers.size === 2) { gesture = pair(); lookId = null; editor.gestureStart(); }
      else if (lookId === null) lookId = e.pointerId;
      return;
    }
    if (lookId === null) lookId = e.pointerId;
    else fire(); // bakış parmağı ekrandayken ikinci parmak: anında ateş
  });

  el.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.moved += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;
    if (gesture) {
      if (pointers.size < 2) return;
      const g = pair();
      let da = g.ang - gesture.ang;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      editor.gestureUpdate(g.d / gesture.d, da);
      return;
    }
    if (e.pointerId === lookId) onLook(dx, dy);
  });

  function end(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (gesture) {
      // Hareket bitince kalan parmak bakışı zıplatmasın: o da kalkana kadar yok sayılır
      if (pointers.size < 2) { gesture = null; lookId = null; editor.gestureEnd(); }
      return;
    }
    if (e.pointerId !== lookId) return;
    lookId = null;
    if (e.type === 'pointerup' && p.moved < 8) {
      if (editor.isEditing()) editor.pick(e);
      else fire();
    }
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', e => {
    if (!editor.isEditing()) return;
    e.preventDefault();
    editor.gestureStart();
    editor.gestureUpdate(Math.exp(-e.deltaY * 0.001), 0);
    editor.gestureEnd();
  }, { passive: false });

  // Ok tuşları: fare olmadan bakma (dizüstü touchpad, TV klavyesi)
  const held = new Set();
  const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, .lil-gui')) return;
    if (ARROWS.includes(e.code)) { e.preventDefault(); held.add(e.code); return; }
    if (editor.handleKey(e)) return;
    if (e.code === 'Space' && !editor.isEditing()) { e.preventDefault(); fire(); }
  });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  // Her karede: ok tuşları ve oyun kumandası (sol/sağ çubuk bakar, A veya sağ tetik ateş eder)
  let padFire = false;
  const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
  function update(dt) {
    let x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    let y = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
    if (pad) {
      x += dz(pad.axes[0] || 0) + dz(pad.axes[2] || 0);
      y += dz(pad.axes[1] || 0) + dz(pad.axes[3] || 0);
      const pressed = !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed);
      if (pressed && !padFire && !editor.isEditing()) fire();
      padFire = pressed;
    }
    // onLook sürükleme mantığında: sağa sürüklemek sağa döndürür; çubuk/ok aynı yönde
    if (x || y) onLook(x * 450 * dt, y * 450 * dt);
  }
  return { update };
}
