import * as THREE from 'three';
import { addFadeToMaterial } from './weapons.js';

// The hero's great sword and its sheath, built from the look's numbers (FOUNDRY_LOOK.armour.player.greatsword).
// The wardrobe gives the sword and the scabbard only their mount points (weapons.js makeFrame); the game hangs these
// meshes on them (look/armour.js), the figure preview in the menu shows the same sword.

function std(o) {
  return new THREE.MeshStandardMaterial(o);
}

/**
 * The blade, guard, grip and pommel, standing on the guard at y = G.guardY.
 * @param {any} G the look's greatsword numbers
 * @param {any} [fade] the kit's fade uniforms
 * @returns {{ group: THREE.Group, blade: THREE.MeshStandardMaterial, iron: THREE.MeshStandardMaterial,
 *   hot: THREE.MeshStandardMaterial, tipY: number }}
 */
export function buildGreatsword(G, fade) {
  const blade = std({
    color: new THREE.Color(...G.blade),
    metalness: G.bladeMetal !== undefined ? G.bladeMetal : 0.7,
    roughness: G.bladeRough !== undefined ? G.bladeRough : 0.4,
  });
  blade.name = 'look.greatsword.blade';
  if (G.bladeEnv) blade.envMapIntensity = G.bladeEnv;
  const iron = std({ color: new THREE.Color(...G.iron), metalness: 0.85, roughness: 0.55 });
  iron.name = 'look.greatsword.iron';
  const wrap = std({ color: new THREE.Color(...G.wrap), metalness: 0, roughness: 0.85 });
  wrap.name = 'look.greatsword.wrap';
  const hot = std({
    color: 0x080402,
    emissive: new THREE.Color(...G.glow),
    emissiveIntensity: G.glowStrength,
    roughness: 0.5,
  });
  hot.name = 'look.greatsword.hot';
  const y0 = G.guardY,
    L = G.length,
    W = G.width,
    back = -W * 0.38,
    edge = W * 0.62,
    T = G.thick;
  const sh = new THREE.Shape();
  sh.moveTo(back, y0);
  sh.lineTo(edge, y0);
  sh.lineTo(edge, y0 + L);
  sh.lineTo(back, y0 + L - W * 1.05);
  sh.lineTo(back, y0);
  const bg = new THREE.ExtrudeGeometry(sh, {
    depth: T,
    bevelEnabled: true,
    bevelThickness: T * 0.35,
    bevelSize: T * 0.45,
    bevelSegments: 1,
    curveSegments: 1,
  });
  bg.translate(0, 0, -T / 2);
  const g = new THREE.Group();
  g.name = 'look:greatsword';
  g.add(new THREE.Mesh(bg, blade));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.004, L * 0.8, T * 0.5), hot);
  strip.position.set(edge + T * 0.42, y0 + L * 0.55, 0);
  g.add(strip);
  const blockH = W * 1.15;
  const block = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, blockH, T * 1.9), iron);
  block.position.set((back + edge) / 2, y0 + blockH / 2, 0);
  g.add(block);
  for (let k = 0; k < 3; k++)
    for (const z of [1, -1]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, blockH * 0.09, 0.004), hot);
      slot.position.set((back + edge) / 2, y0 + blockH * (0.28 + k * 0.22), z * T * 0.96);
      g.add(slot);
    }
  for (const fx of [-0.4, 0.4])
    for (const fy of [0.12, 0.88])
      for (const z of [1, -1]) {
        const r = new THREE.Mesh(new THREE.SphereGeometry(W * 0.045, 8, 6), iron);
        r.position.set((back + edge) / 2 + fx * W, y0 + blockH * fy, z * T * 0.98);
        g.add(r);
      }
  const guard = new THREE.Mesh(new THREE.BoxGeometry(W * 1.45, 0.05, T * 2.6), iron);
  guard.position.set((back + edge) / 2, y0 - 0.02, 0);
  g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, G.grip, 10), wrap);
  grip.position.set(0, y0 - 0.045 - G.grip / 2, 0);
  g.add(grip);
  for (let k = 0; k < 7; k++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.004, 4, 12), wrap);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, y0 - 0.06 - ((k + 0.5) * G.grip) / 7, 0);
    g.add(band);
  }
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 10), iron);
  pommel.position.set(0, y0 - 0.045 - G.grip - 0.025, 0);
  g.add(pommel);
  g.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
      if (fade) addFadeToMaterial(n.material, fade);
      n.userData.kit = true;
    }
  });
  return { group: g, blade, iron, hot, tipY: y0 + L - W * 0.1 };
}

/**
 * The leather sheath with iron fittings, hanging down from its mouth at y = 0.
 * @param {any} G the look's greatsword numbers (G.sheath set)
 * @param {THREE.Material} iron the sword's iron
 * @param {any} [fade] the kit's fade uniforms
 */
export function buildSheath(G, iron, fade) {
  const L = G.length,
    W = G.width,
    T = G.thick,
    back = -W * 0.38,
    edge = W * 0.62;
  const S = G.sheath,
    leather = std({ color: new THREE.Color(...S.leather), metalness: 0, roughness: 0.8 });
  leather.name = 'look.sheath.leather';
  const len = L + 0.05,
    cx = (back + edge) / 2,
    sw2 = W + 0.035,
    st = T + 0.035;
  const shp = new THREE.Shape();
  shp.moveTo(cx - sw2 / 2, 0);
  shp.lineTo(cx + sw2 / 2, 0);
  shp.lineTo(cx + sw2 / 2, -len);
  shp.lineTo(cx - sw2 / 2, -len + sw2 * 0.9);
  shp.lineTo(cx - sw2 / 2, 0);
  const sg = new THREE.ExtrudeGeometry(shp, {
    depth: st,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
  });
  sg.translate(0, 0, -st / 2);
  const sheath = new THREE.Group();
  sheath.name = 'look:sheath';
  sheath.add(new THREE.Mesh(sg, leather));
  const throat = new THREE.Mesh(new THREE.BoxGeometry(sw2 + 0.02, 0.07, st + 0.02), iron);
  throat.position.set(cx, -0.035, 0);
  sheath.add(throat);
  for (const f of [0.35, 0.65]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(sw2 + 0.016, 0.03, st + 0.016), iron);
    band.position.set(cx, -len * f, 0);
    sheath.add(band);
  }
  const chape = new THREE.Mesh(new THREE.BoxGeometry(0.02, Math.hypot(sw2, sw2 * 0.9), st + 0.016), iron);
  chape.position.set(cx, -len + sw2 * 0.45, 0);
  chape.rotation.z = Math.atan2(sw2, sw2 * 0.9) - Math.PI / 2;
  sheath.add(chape);
  for (const fy of [0.1, 0.5, 0.9])
    for (const z of [1, -1]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), iron);
      r.position.set(cx + sw2 * 0.3, -0.035 - (len - 0.1) * fy * 0.02 - 0.0, z * (st / 2 + 0.01));
      sheath.add(r);
    }
  sheath.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
      if (fade) addFadeToMaterial(n.material, fade);
      n.userData.kit = true;
    }
  });
  return sheath;
}
