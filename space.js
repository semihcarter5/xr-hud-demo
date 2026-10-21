// Uzay sahnesi: bulutsu gökyüzü, parlayan yıldızlar, gezegen, dronlar, lazer, patlama ve hedef kilit halkası.
// AR modunda `env` (gökyüzü, yıldız, gezegen) gizlenir; dronlar gerçek dünyada uçmaya devam eder.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createSpace({ THREE, scene, renderer }) {
  // Metal yüzeyler için ortam yansıması
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0x6fa8ff, 0x0a0612, 0.35));
  const sun = new THREE.DirectionalLight(0xffd2a8, 2.2);
  sun.position.set(60, 25, 10); // gezegenin bize dönük yüzünü dörtte üç aydınlatır
  scene.add(sun);

  const env = new THREE.Group();
  scene.add(env);

  // --- Bulutsu gökyüzü (gürültü tabanlı shader, yavaşça değişir) ---
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform float uTime;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float n = fbm(d * 2.3 + vec3(0.0, 0.0, uTime * 0.004));
        float n2 = fbm(d * 4.6 + 11.0);
        float band = smoothstep(0.6, 0.0, abs(d.y - 0.12 + (n - 0.5) * 0.55));
        vec3 col = vec3(0.003, 0.006, 0.014);
        col += vec3(0.055, 0.02, 0.11) * smoothstep(0.38, 0.86, n) * 1.7;
        col += vec3(0.0, 0.075, 0.095) * smoothstep(0.42, 0.9, n2) * band * 2.0;
        col += vec3(0.11, 0.05, 0.025) * pow(band, 3.0) * n * 1.4;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), skyMat);
  sky.renderOrder = -10;
  env.add(sky);

  // --- Yıldızlar: farklı boy ve renk, hafif titreşim, ek parlama ---
  {
    const n = 3200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const tints = [[1, 1, 1], [0.7, 0.85, 1], [1, 0.85, 0.65], [0.75, 1, 1]];
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), r = 120;
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
      col.set(tints[(Math.random() * tints.length) | 0], i * 3);
      size[i] = 0.6 + Math.pow(Math.random(), 6) * 3.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: skyMat.uniforms.uTime },
      vertexShader: `attribute float size; attribute vec3 color; uniform float uTime; varying vec3 vColor;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (320.0 / -mv.z) * (0.75 + 0.25 * sin(uTime * 1.7 + position.x * 0.37));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * 1.8, a); }`,
    });
    env.add(new THREE.Points(g, starMat));
  }

  // --- Gezegen: bantlı yüzey + atmosfer ışıltısı ---
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    for (let y = 0; y < 256; y++) {
      const v = 0.5 + 0.5 * Math.sin(y * 0.11 + Math.sin(y * 0.031) * 4);
      g.fillStyle = `rgb(${170 + v * 70 | 0}, ${120 + v * 70 | 0}, ${90 + v * 60 | 0})`; g.fillRect(0, y, 512, 1); // sıcak tonlu gaz devi bantları
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, envMapIntensity: 0.15 }));
    planet.position.set(-58, 26, -112); // ileri bakınca sol üstte tamamen görünür, HUD panellerine denk gelmez
    planet.rotation.z = 0.35;
    // Atmosfer: gezegenin çevresinde dışa doğru sönen yumuşak hale (sert kenar çizgisi yok)
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(20, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ float f = pow(max(0.0, 0.62 - dot(vN, vec3(0.0, 0.0, 1.0))), 4.0); gl_FragColor = vec4(vec3(1.0, 0.62, 0.35) * f * 1.4, 1.0); }',
    }));
    atmo.position.copy(planet.position);
    env.add(planet, atmo);
  }

  // --- Dronlar: metal gövde, dönen ışık halkası, parlayan çekirdek ---
  const bodyGeo = new THREE.SphereGeometry(0.3, 32, 20).scale(1, 0.55, 1);
  const ringGeo = new THREE.TorusGeometry(0.44, 0.022, 12, 72);
  const coreGeo = new THREE.SphereGeometry(0.1, 20, 14);
  const finGeo = new THREE.BoxGeometry(0.05, 0.02, 0.26);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b323b, metalness: 0.9, roughness: 0.28 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x39e6ff, emissiveIntensity: 2.6 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a3d, emissiveIntensity: 5 });
  const drones = [];
  function spawn(d) {
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
    Object.assign(d.userData, { center: new THREE.Vector3(Math.cos(a) * r, 1.5 + Math.random() * 5, Math.sin(a) * r),
      phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.5, alive: true, dieT: 0 });
    d.scale.setScalar(1);
  }
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Group();
    d.add(new THREE.Mesh(bodyGeo, bodyMat));
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = Math.PI / 2; d.add(ring);
    d.add(new THREE.Mesh(coreGeo, coreMat));
    for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(finGeo, bodyMat); f.rotation.y = k * Math.PI * 2 / 3; f.position.set(Math.sin(k * 2.094) * 0.3, 0, Math.cos(k * 2.094) * 0.3); d.add(f); }
    d.userData.ring = ring;
    spawn(d);
    scene.add(d);
    drones.push(d);
  }

  // --- Lazer ışını (parlayan silindir) ve patlama parçacıkları ---
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffb0).multiplyScalar(4), transparent: true, depthWrite: false, toneMapped: false }));
  beam.visible = false;
  scene.add(beam);
  let beamT = 0;
  const bursts = [];
  function explode(at) {
    const n = 48, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i * 3); vel.push(new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 4)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(0xffa060).multiplyScalar(3), size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    scene.add(p);
    bursts.push({ p, vel, t: 0 });
  }

  // --- Hedef kilit işareti: dönen yay parçaları + köşe çerçeveleri ---
  const reticle = new THREE.Group();
  const retMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.83, 32, 1, i * Math.PI / 2 + 0.25, Math.PI / 2 - 0.5), retMat);
    arc.renderOrder = 10; reticle.add(arc);
  }
  const corners = new THREE.Group();
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.035), retMat); h.position.set(x * 0.52, y * 0.6, 0);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.22), retMat); v.position.set(x * 0.6, y * 0.52, 0);
    h.renderOrder = v.renderOrder = 10; corners.add(h, v);
  }
  reticle.add(corners);
  reticle.visible = false;
  scene.add(reticle);

  const tmp = new THREE.Vector3();
  return {
    env, drones,
    setColors(main, drone) { ringMat.emissive.set(main); coreMat.emissive.set(drone); },
    fireBeam(from, to) {
      beam.position.copy(from);
      beam.lookAt(to);
      beam.scale.set(1, 1, from.distanceTo(to));
      beamT = 1; beam.visible = true;
    },
    kill(d) { d.userData.alive = false; d.userData.dieT = 0; explode(d.position); },
    updateReticle(target, lockT, locked, camQ, t, color) {
      reticle.visible = !!target;
      if (!target) return;
      reticle.position.copy(target.position);
      reticle.quaternion.copy(camQ);
      for (const arc of reticle.children.slice(0, 4)) arc.rotation.z = t * (locked ? 0.4 : 2.4); // kilitlenince yavaşlar
      corners.rotation.z = (1 - lockT) * 0.8;
      reticle.scale.setScalar(1.7 - 0.7 * lockT);
      retMat.color.set(color);
    },
    // Dron hareketi, ölüm animasyonu, ışın ve patlama sönümü
    update(dt, t) {
      skyMat.uniforms.uTime.value = t;
      for (const d of drones) {
        const u = d.userData;
        if (u.alive) {
          const ph = t * u.speed + u.phase;
          d.position.set(u.center.x + Math.cos(ph) * 2.5, u.center.y + Math.sin(ph * 1.7) * 0.8, u.center.z + Math.sin(ph) * 2.5);
          d.rotation.y += dt * 0.6;
          u.ring.rotation.z += dt * 3;
          d.rotation.z = Math.sin(ph * 2) * 0.15;
        } else {
          u.dieT += dt;
          d.scale.setScalar(Math.max(0.001, 1 - u.dieT * 4));
          if (u.dieT > 1.5) spawn(d);
        }
      }
      if (beamT > 0) { beamT -= dt * 5; beam.material.opacity = Math.max(0, beamT); beam.visible = beamT > 0; }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.t += dt;
        const a = b.p.geometry.attributes.position;
        b.vel.forEach((v, k) => { tmp.fromBufferAttribute(a, k).addScaledVector(v, dt); a.setXYZ(k, tmp.x, tmp.y, tmp.z); v.multiplyScalar(1 - dt * 1.5); });
        a.needsUpdate = true;
        b.p.material.opacity = Math.max(0, 1 - b.t / 0.9);
        if (b.t > 0.9) { scene.remove(b.p); b.p.geometry.dispose(); b.p.material.dispose(); bursts.splice(i, 1); }
      }
    },
  };
}
