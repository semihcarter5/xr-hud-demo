// HUD ayar şeması: hud-config.json ile aynı yapı.
// Yatay ve dikey ekran için ayrı panel düzenleri tutulur; settings.panels o anki yönün düzenini verir.

// [konum (m), boyut] — HUD merkezine göre
const LAYOUT_DEFAULTS = {
  landscape: {
    compass: [[0, 0.34, 0], 1],
    center: [[0, -0.06, 0], 1],
    energy: [[-0.62, -0.06, 0], 1],
    stats: [[0.6, 0, 0], 1],
  },
  portrait: {
    compass: [[0, 0.5, 0], 1],
    center: [[0, 0.05, 0], 1],
    energy: [[-0.3, -0.48, 0], 0.6],
    stats: [[0.2, -0.47, 0], 0.8],
  },
};

// Ekrana sığdırırken düzenin kapladığı alan (m)
export const LAYOUT_BOUNDS = { landscape: { w: 1.6, h: 0.8 }, portrait: { w: 0.9, h: 1.4 } };

export function defaultSettings() {
  const layouts = {};
  for (const [o, def] of Object.entries(LAYOUT_DEFAULTS)) {
    layouts[o] = {};
    for (const [k, [pos, scale]] of Object.entries(def)) layouts[o][k] = { position: [...pos], rotation: [0, 0, 0], scale, visible: true };
  }
  const s = {
    version: 2,
    hud: { distance: 1.5 },
    theme: { main: '#39e6ff', lock: '#ff3355', energy: '#7dffb0', glow: 8, opacity: 1, drone: '#ff7a3d' },
    layouts,
  };
  // Kaydedilmeyen çalışma durumu: aktif ekran yönü ve onun panelleri
  let orientation = 'landscape';
  Object.defineProperties(s, {
    orientation: { get: () => orientation, set: v => { orientation = v; } },
    panels: { get: () => s.layouts[orientation] },
  });
  return s;
}

function mergePanels(dst, src) {
  if (!src || typeof src !== 'object') return;
  for (const k of Object.keys(dst)) {
    const p = src[k], b = dst[k];
    if (!p) continue;
    if (Array.isArray(p.position) && p.position.length === 3 && p.position.every(Number.isFinite)) b.position = [...p.position];
    if (Array.isArray(p.rotation) && p.rotation.length === 3 && p.rotation.every(Number.isFinite)) b.rotation = [...p.rotation];
    if (Number.isFinite(p.scale) && p.scale > 0) b.scale = p.scale;
    if (typeof p.visible === 'boolean') b.visible = p.visible;
  }
}

// Dışarıdan gelen JSON'u doğrulayarak mevcut nesnenin içine yazar (GUI bağlantıları kopmasın diye nesne değiştirilmez)
export function mergeSettings(base, src) {
  if (!src || typeof src !== 'object') return base;
  if (src.hud && Number.isFinite(src.hud.distance)) base.hud.distance = src.hud.distance;
  if (src.theme) for (const k of Object.keys(base.theme)) if (typeof src.theme[k] === typeof base.theme[k]) base.theme[k] = src.theme[k];
  if (src.layouts) for (const o of Object.keys(base.layouts)) mergePanels(base.layouts[o], src.layouts[o]);
  else if (src.panels) mergePanels(base.layouts.landscape, src.panels); // sürüm 1 dosyaları: tek düzen = yatay
  return base;
}
