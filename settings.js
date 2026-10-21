// HUD ayar şeması: hud-config.json ile aynı yapı.
const PANEL_DEFAULTS = {
  compass: [0, 0.34, 0],
  center: [0, -0.06, 0],
  energy: [-0.62, -0.06, 0],
  stats: [0.6, 0, 0],
};

export function defaultSettings() {
  const panels = {};
  for (const [k, pos] of Object.entries(PANEL_DEFAULTS)) panels[k] = { position: [...pos], rotation: [0, 0, 0], scale: 1, visible: true };
  return {
    version: 1,
    hud: { distance: 1.5 },
    theme: { main: '#39e6ff', lock: '#ff3355', energy: '#7dffb0', glow: 8, opacity: 1, drone: '#ff7a3d' },
    panels,
  };
}

// Dışarıdan gelen JSON'u doğrulayarak mevcut nesnenin içine yazar (GUI bağlantıları kopmasın diye nesne değiştirilmez)
export function mergeSettings(base, src) {
  if (!src || typeof src !== 'object') return base;
  if (src.hud && Number.isFinite(src.hud.distance)) base.hud.distance = src.hud.distance;
  if (src.theme) for (const k of Object.keys(base.theme)) if (typeof src.theme[k] === typeof base.theme[k]) base.theme[k] = src.theme[k];
  if (src.panels) for (const k of Object.keys(base.panels)) {
    const p = src.panels[k], b = base.panels[k];
    if (!p) continue;
    if (Array.isArray(p.position) && p.position.length === 3 && p.position.every(Number.isFinite)) b.position = [...p.position];
    if (Array.isArray(p.rotation) && p.rotation.length === 3 && p.rotation.every(Number.isFinite)) b.rotation = [...p.rotation];
    if (Number.isFinite(p.scale) && p.scale > 0) b.scale = p.scale;
    if (typeof p.visible === 'boolean') b.visible = p.visible;
  }
  return base;
}
