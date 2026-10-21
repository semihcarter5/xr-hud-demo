// Fare, dokunmatik ve klavye girişi.
// Oyun: bir parmak sürükleyerek bakar; o sırada ikinci parmağın dokunuşu anında ateş eder. Tek dokunuş da ateş eder.
// Düzenleme: dokunuş paneli seçer; iki parmakla sıkıştırma boyutu, çevirme yatırmayı değiştirir; fare tekerleği boyut.

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

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, .lil-gui')) return;
    if (editor.handleKey(e)) return;
    if (e.code === 'Space' && !editor.isEditing()) { e.preventDefault(); fire(); }
  });
}
