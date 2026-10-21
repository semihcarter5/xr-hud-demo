// HUD panelleri: her panel bir canvas dokusu + düzlem. İki kat çözünürlükte çizilir (keskin yazı ve çizgi).
// Çizim koordinatları 1x'tir (ör. pusula 512x128); prep() ölçeği ayarlar.

const PX_PER_M = 640, SCALE = 2;
const AMBER = '#ffb347';
const COMPASS = { 0: 'K', 90: 'D', 180: 'G', 270: 'B' };

export function createPanels({ THREE, hudRig, theme: T, game }) {
  const panels = {};

  function makePanel(name, w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w * SCALE; canvas.height = h * SCALE;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(w / PX_PER_M, h / PX_PER_M);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    mesh.name = name;
    mesh.renderOrder = 20;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ transparent: true, depthTest: false }));
    outline.renderOrder = 21;
    outline.visible = false;
    mesh.add(outline);
    mesh.userData = { ctx: canvas.getContext('2d'), tex, draw, outline, w, h };
    hudRig.add(mesh);
    panels[name] = mesh;
  }

  // --- Çizim yardımcıları ---
  function prep(c, w, h) {
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    c.clearRect(0, 0, w, h);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowBlur = T.glow;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    ink(c, T.main);
  }
  function ink(c, color) { c.strokeStyle = color; c.fillStyle = color; c.shadowColor = color; }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  // Yarı saydam cam panel: koyu dolgu + ince kenar; arkasına (destination-over) çizilebilir
  function plate(c, x, y, w, h, r = 14, behind = false) {
    c.save();
    if (behind) c.globalCompositeOperation = 'destination-over';
    c.shadowBlur = 0;
    rr(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(10,28,38,0.55)'); g.addColorStop(1, 'rgba(3,10,16,0.45)');
    c.fillStyle = g; c.fill();
    c.globalAlpha = 0.45; c.strokeStyle = T.main; c.lineWidth = 1; c.stroke();
    c.restore();
  }
  // Kenarları yumuşakça kaybolan bölge (pusula şeridi, yunuslama merdiveni)
  function fadeEdges(c, x, y, w, h, horizontal) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.shadowBlur = 0;
    const g = horizontal ? c.createLinearGradient(x, 0, x + w, 0) : c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.restore();
  }
  function pill(c, x, y, text, color, filled) {
    c.save();
    c.font = '700 15px Montserrat, sans-serif';
    const w = c.measureText(text).width + 28;
    rr(c, x - w / 2, y - 13, w, 26, 13);
    c.shadowBlur = filled ? T.glow : 0;
    if (filled) { ink(c, color); c.fill(); c.fillStyle = '#03141e'; c.shadowBlur = 0; }
    else { c.fillStyle = 'rgba(3,12,18,0.6)'; c.fill(); ink(c, color); c.lineWidth = 1.2; c.stroke(); }
    c.fillText(text, x, y + 1);
    c.restore();
  }

  // --- Pusula: kenarları kaybolan yön şeridi + yön kutusu ---
  makePanel('compass', 512, 128, (c, s) => {
    const cx = 256, top = 16, bottom = 64, span = 100, ppd = 440 / span;
    c.save();
    c.beginPath(); c.rect(36, top, 440, bottom - top + 4); c.clip();
    for (let d = Math.floor((s.heading - span / 2) / 5) * 5; d <= s.heading + span / 2; d += 5) {
      const x = cx + (d - s.heading) * ppd, dd = ((d % 360) + 360) % 360;
      const major = dd % 15 === 0, card = dd % 90 === 0;
      c.globalAlpha = major ? 1 : 0.55;
      c.beginPath(); c.moveTo(x, bottom); c.lineTo(x, bottom - (card ? 18 : major ? 13 : 7)); c.stroke();
      if (major) {
        c.font = card ? '800 19px Montserrat, sans-serif' : '600 13px Montserrat, sans-serif';
        c.fillText(COMPASS[dd] ?? String(dd).padStart(3, '0'), x, top + 12);
      }
    }
    c.restore();
    fadeEdges(c, 36, top, 440, bottom - top + 4, true);
    plate(c, 36, top - 6, 440, bottom - top + 14, 12, true);
    // Yön kutusu ve ok
    c.beginPath(); c.moveTo(cx, bottom + 4); c.lineTo(cx - 7, bottom + 14); c.lineTo(cx + 7, bottom + 14); c.closePath(); c.fill();
    plate(c, cx - 40, bottom + 18, 80, 30, 8);
    c.font = '700 18px Montserrat, sans-serif';
    c.fillText(String(Math.round(s.heading) % 360).padStart(3, '0') + '°', cx, bottom + 34);
  });

  // --- Merkez: yunuslama merdiveni, dönen nişangâh, kilit ilerleme yayı, durum hapı ---
  makePanel('center', 512, 384, (c, s) => {
    const W = 512, H = 384, mx = W / 2, my = H / 2 - 8;
    c.globalAlpha = 0.7;
    for (const [x, y, sx, sy] of [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]]) {
      c.beginPath(); c.moveTo(x + sx * 34, y); c.lineTo(x, y); c.lineTo(x, y + sy * 24); c.stroke();
    }
    c.globalAlpha = 1;
    // Yunuslama merdiveni (uçlarda ufka dönük işaretler)
    c.save();
    c.beginPath(); c.rect(mx - 236, my - 140, 472, 280); c.clip();
    c.font = '600 12px Montserrat, sans-serif';
    for (let p = -60; p <= 60; p += 10) {
      const y = my + (s.pitchDeg - p) * 6;
      if (y < my - 150 || y > my + 150) continue;
      const half = p === 0 ? 200 : 120, gap = p === 0 ? 70 : 56, tick = p > 0 ? 8 : p < 0 ? -8 : 0;
      c.globalAlpha = p === 0 ? 0.9 : 0.6;
      c.setLineDash(p < 0 ? [7, 6] : []);
      c.beginPath();
      c.moveTo(mx - half, y + tick); c.lineTo(mx - half, y); c.lineTo(mx - gap, y);
      c.moveTo(mx + gap, y); c.lineTo(mx + half, y); c.lineTo(mx + half, y + tick);
      c.stroke();
      c.setLineDash([]);
      if (p !== 0) { c.fillText(String(Math.abs(p)), mx - half - 16, y); c.fillText(String(Math.abs(p)), mx + half + 16, y); }
    }
    c.restore();
    fadeEdges(c, mx - 236, my - 140, 472, 280, false);
    // Nişangâh: merkez noktası, dönen dört yay, kilit ilerlemesi
    const lockCol = game.locked ? T.lock : T.main;
    c.beginPath(); c.arc(mx, my, 3, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(mx, my); c.rotate(s.t * 0.5);
    for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, 0, 30, i * Math.PI / 2 + 0.28, (i + 1) * Math.PI / 2 - 0.28); c.stroke(); }
    c.restore();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.beginPath(); c.moveTo(mx + dx * 40, my + dy * 40); c.lineTo(mx + dx * 52, my + dy * 52); c.stroke(); }
    if (game.candidate) {
      ink(c, lockCol); c.lineWidth = 3;
      c.beginPath(); c.arc(mx, my, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * game.lockT); c.stroke();
      c.lineWidth = 1.6; ink(c, T.main);
    }
    // Durum hapı
    if (game.locked) pill(c, mx, my + 92, 'HEDEF KİLİTLENDİ', T.lock, Math.floor(s.t * 4) % 2 === 0);
    else if (game.candidate) pill(c, mx, my + 92, 'KİLİTLENİYOR · ' + Math.round(game.lockT * 100) + '%', T.main, false);
    else { c.globalAlpha = 0.75; pill(c, mx, my + 92, 'TARANIYOR', T.main, false); c.globalAlpha = 1; }
    // Anlık mesaj
    if (game.flashT > 0) {
      c.globalAlpha = Math.min(1, game.flashT * 2);
      pill(c, mx, H - 30, game.flash, game.flash.startsWith('ENERJİ') ? AMBER : T.energy, true);
      c.globalAlpha = 1;
    }
  });

  // --- Enerji: cam panelde degrade dolgulu dikey bar ---
  makePanel('energy', 128, 384, (c, s) => {
    const e = game.energy, col = e > 40 ? T.energy : e > 20 ? AMBER : T.lock;
    const low = e <= 20 && Math.floor(s.t * 3) % 2 === 0;
    plate(c, 8, 8, 112, 368, 16);
    c.font = '700 13px Montserrat, sans-serif'; c.globalAlpha = 0.8;
    c.fillText('ENERJİ', 64, 32);
    c.globalAlpha = 1;
    const x = 46, y0 = 52, h = 262, w = 36;
    rr(c, x, y0, w, h, 10); c.save(); c.shadowBlur = 0; c.fillStyle = 'rgba(57,230,255,0.08)'; c.fill(); c.restore();
    const fh = h * e / 100;
    if (fh > 1) {
      c.save(); rr(c, x, y0 + h - fh, w, fh, 10);
      c.fillStyle = col; c.shadowColor = col; c.globalAlpha = low ? 0.45 : 0.9; c.fill();
      // Cam parıltısı: sol kenarda ince açık şerit
      c.shadowBlur = 0; c.globalAlpha = low ? 0.15 : 0.3; c.fillStyle = '#ffffff'; c.fillRect(x + 5, y0 + h - fh + 4, 7, Math.max(0, fh - 8));
      c.restore();
    }
    c.save(); c.shadowBlur = 0; c.strokeStyle = 'rgba(3,12,18,0.85)'; c.lineWidth = 2;
    for (let i = 1; i < 10; i++) { const yy = y0 + h * i / 10; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    c.restore();
    ink(c, col);
    c.font = '800 24px Montserrat, sans-serif';
    c.fillText(Math.round(e) + '%', 64, y0 + h + 30);
  });

  // --- Bilgi paneli: skor, kalan hedef noktaları, satırlar ---
  makePanel('stats', 320, 256, (c, s) => {
    plate(c, 8, 8, 304, 240, 16);
    c.textAlign = 'left'; c.font = '700 12px Montserrat, sans-serif'; c.globalAlpha = 0.75;
    c.fillText('SKOR', 28, 34);
    c.globalAlpha = 1; c.font = '800 34px Montserrat, sans-serif';
    c.fillText(String(game.score).padStart(6, '0'), 28, 68);
    // Kalan hedefler: dolu/boş noktalar
    for (let i = 0; i < 7; i++) {
      c.beginPath(); c.arc(214 + i * 13, 38, 4.2, 0, Math.PI * 2);
      if (i < game.alive) c.fill(); else { c.globalAlpha = 0.35; c.stroke(); c.globalAlpha = 1; }
    }
    c.save(); c.globalAlpha = 0.3; c.shadowBlur = 0; c.beginPath(); c.moveTo(28, 92); c.lineTo(292, 92); c.stroke(); c.restore();
    const rows = [['HEDEF', `${game.alive} / 7`], ['İRTİFA', s.altitude.toFixed(1) + ' m'], ['YUNUS', (s.pitchDeg >= 0 ? '+' : '') + s.pitchDeg.toFixed(0) + '°'], ['SÜRE', Math.floor(s.t) + ' s']];
    rows.forEach(([label, value], i) => {
      const y = 118 + i * 32;
      c.textAlign = 'left'; c.globalAlpha = 0.7; c.font = '600 14px Montserrat, sans-serif'; c.fillText(label, 28, y);
      c.textAlign = 'right'; c.globalAlpha = 1; c.font = '700 16px Montserrat, sans-serif'; c.fillText(value, 292, y);
    });
  });

  return {
    panels,
    draw(s) {
      for (const mesh of Object.values(panels)) {
        if (!mesh.visible) continue;
        const { ctx, tex, draw, w, h } = mesh.userData;
        prep(ctx, w, h);
        draw(ctx, s);
        tex.needsUpdate = true;
      }
    },
  };
}
