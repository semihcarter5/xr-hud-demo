// HUD ayar şeması (hud-config.json ile aynı yapı).
// Düzen iki katmanlıdır: ortama göre hesaplanan OTOMATİK düzen + kullanıcının o ortam için yaptığı İNCE AYAR.
// Kaydedilen yalnızca ince ayarlardır (overrides); otomatik düzen her açılışta yeniden hesaplanır.

export const CONTEXTS = ['desktop', 'landscape', 'portrait', 'vr', 'ar'];
export const CONTEXT_NAMES = { desktop: 'Masaüstü', landscape: 'Telefon yatay', portrait: 'Dikey ekran', vr: 'VR', ar: 'AR' };
export const PANEL_SIZES = { compass: [0.8, 0.2], center: [0.8, 0.6], energy: [0.2, 0.6], stats: [0.5, 0.4] }; // metre

const P = (x, y, scale = 1, ry = 0) => ({ position: [x, y, 0], rotation: [0, ry, 0], scale, visible: true });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Kural tabanlı otomatik düzen: ortam, ekran oranı ve cihaz tipine göre
export function autoLayout(ctx, aspect, handheld) {
  switch (ctx) {
    case 'portrait': // üst üste; enerji ve skor başparmağın ulaştığı alt bölgede
      return { compass: P(0, 0.5), center: P(0, 0.05), energy: P(-0.3, -0.48, 0.6), stats: P(0.2, -0.47, 0.8) };
    case 'landscape': { // telefon yatay: yan paneller ekran kenarına, orta nişangâh açık
      const side = clamp(0.36 * aspect, 0.55, 0.85);
      return { compass: P(0, 0.36), center: P(0, -0.04, 0.9), energy: P(-side, -0.04, 0.85), stats: P(side, 0.02, 0.85) };
    }
    case 'vr': // ~1,5 m'de bakış merkezine yakın; yan paneller kullanıcıya dönük (kokpit kavisi)
      return { compass: P(0, 0.3, 0.9), center: P(0, -0.06), energy: P(-0.58, -0.1, 0.9, 20), stats: P(0.6, -0.06, 0.9, -20) };
    case 'ar': // gerçek dünya görünsün: küçük paneller, orta alan boş
      if (handheld) return { compass: P(0, 0.42, 0.6), center: P(0, 0, 0.55), energy: P(-0.32, -0.36, 0.5), stats: P(0.26, -0.36, 0.55) };
      return { compass: P(0, 0.34, 0.75), center: P(0, -0.04, 0.7), energy: P(-0.62, -0.25, 0.7, 20), stats: P(0.62, 0.22, 0.7, -20) };
    default: { // masaüstü: geniş ekranda yan paneller dışa açılır
      const side = clamp(0.34 * aspect, 0.55, 0.9);
      return { compass: P(0, 0.34), center: P(0, -0.06), energy: P(-side, -0.06), stats: P(side, 0) };
    }
  }
}

// Düzenin kapladığı alan (ekrana sığdırmak için)
export function layoutBounds(layout) {
  let w = 0, h = 0;
  for (const [k, p] of Object.entries(layout)) {
    const [pw, ph] = PANEL_SIZES[k];
    w = Math.max(w, Math.abs(p.position[0]) + pw * p.scale / 2);
    h = Math.max(h, Math.abs(p.position[1]) + ph * p.scale / 2);
  }
  return { w: 2 * w, h: 2 * h };
}

export function defaultSettings() {
  const s = {
    version: 3,
    hud: { distance: 1.5 },
    theme: { main: '#39e6ff', lock: '#ff3355', energy: '#7dffb0', glow: 8, opacity: 1, drone: '#ff7a3d' },
    overrides: Object.fromEntries(CONTEXTS.map(c => [c, {}])),
  };
  // Kaydedilmeyen çalışma durumu
  let ctx = 'desktop', auto = autoLayout('desktop', 16 / 9, false);
  Object.defineProperties(s, {
    context: { get: () => ctx },
    auto: { get: () => auto },
    // Etkin düzen: panelin ince ayarı varsa o, yoksa otomatik hali
    panels: { get: () => Object.fromEntries(Object.keys(auto).map(k => [k, s.overrides[ctx][k] || auto[k]])) },
    setContext: { value(c, aspect, handheld) { ctx = c; auto = autoLayout(c, aspect, handheld); } },
    // Paneli değiştirmeden önce çağrılır: bu ortam için ince ayar kaydı açar (otomatikten kopyalar)
    edit: { value(name) { return (s.overrides[ctx][name] ||= structuredClone(auto[name])); } },
    isTuned: { value() { return Object.keys(s.overrides[ctx]).length > 0; } },
    resetContext: { value() { s.overrides[ctx] = {}; } },
  });
  return s;
}

function cleanPanel(p) {
  if (!p || typeof p !== 'object') return null;
  if (!Array.isArray(p.position) || p.position.length !== 3 || !p.position.every(Number.isFinite)) return null;
  const rot = Array.isArray(p.rotation) && p.rotation.length === 3 && p.rotation.every(Number.isFinite) ? p.rotation : [0, 0, 0];
  return {
    position: [...p.position],
    rotation: [...rot],
    scale: Number.isFinite(p.scale) && p.scale > 0 ? p.scale : 1,
    visible: typeof p.visible === 'boolean' ? p.visible : true,
  };
}

// Dışarıdan gelen JSON'u doğrulayarak mevcut nesnenin içine yazar (GUI bağlantıları kopmasın diye theme/hud nesneleri korunur).
// Eski sürüm dosyalarındaki tam düzenler alınmaz; otomatik düzen onların yerini alır.
export function mergeSettings(base, src) {
  if (!src || typeof src !== 'object') return base;
  if (src.hud && Number.isFinite(src.hud.distance)) base.hud.distance = src.hud.distance;
  if (src.theme) for (const k of Object.keys(base.theme)) if (typeof src.theme[k] === typeof base.theme[k]) base.theme[k] = src.theme[k];
  if (src.overrides && typeof src.overrides === 'object') {
    for (const c of CONTEXTS) {
      const o = src.overrides[c];
      if (!o || typeof o !== 'object') continue;
      const out = {};
      for (const k of Object.keys(PANEL_SIZES)) { const p = cleanPanel(o[k]); if (p) out[k] = p; }
      base.overrides[c] = out;
    }
  }
  return base;
}
