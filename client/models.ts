// Procedural cel-shaded models built from primitives (no external assets).
import * as THREE from "three";

const grad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const mats = new Map<string, THREE.Material>();
export const toon = (color: number, o: THREE.MeshToonMaterialParameters = {}) => {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color, gradientMap: grad, ...o }));
  return mats.get(k) as THREE.MeshToonMaterial;
};
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
outlineMat.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = position + normal * 0.035;"); };

export function mesh(geo: THREE.BufferGeometry, color: number, o: THREE.MeshToonMaterialParameters = {}, outline = true) {
  const m = new THREE.Mesh(geo, toon(color, o));
  m.castShadow = true;
  if (outline && !o.transparent) m.add(new THREE.Mesh(geo, outlineMat));
  return m;
}
const at = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.setScalar(s); return o;
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, s = 14) => new THREE.SphereGeometry(r, s, s * 0.75);
const cyl = (rt: number, rb: number, h: number, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r: number, h: number, s = 10) => new THREE.ConeGeometry(r, h, s);

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function textSprite(text: string, color = "#fff", size = 64, stroke = "#000") {
  const tex = canvasTex(512, 128, c => {
    c.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 10; c.strokeStyle = stroke; c.strokeText(text, 256, 64);
    c.fillStyle = color; c.fillText(text, 256, 64);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(4, 1, 1);
  s.renderOrder = 999;
  return s;
}

// ---------------------------------------------------------------- champions
export interface Rig { root: THREE.Group; body: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; extra: Record<string, THREE.Object3D> }

function humanoid(o: { skin?: number; shirt: number; pants?: number; height?: number; girth?: number; head?: number }): Rig {
  const root = new THREE.Group(), body = new THREE.Group();
  const h = o.height ?? 1, g = o.girth ?? 1, skin = o.skin ?? 0xf1c27d;
  root.add(body);
  body.add(at(mesh(new THREE.CapsuleGeometry(0.32 * g, 0.5 * h, 4, 10), o.shirt), 0, 0.85 * h, 0));
  body.add(at(mesh(sph(0.26 * (o.head ?? 1)), skin), 0, 1.45 * h, 0));
  for (const s of [-1, 1]) body.add(at(mesh(new THREE.CapsuleGeometry(0.1, 0.35, 3, 6), o.pants ?? 0x2a2a3a), 0.14 * s, 0.3, 0));
  const arm = (s: number) => {
    const piv = at(new THREE.Group(), (0.36 * g + 0.05) * s, 1.1 * h, 0);
    piv.add(at(mesh(new THREE.CapsuleGeometry(0.08, 0.4, 3, 6), o.shirt), 0, -0.25, 0));
    piv.add(at(mesh(sph(0.09), skin), 0, -0.5, 0));
    body.add(piv);
    return piv;
  };
  return { root, body, armL: arm(-1), armR: arm(1), extra: {} };
}
const shades = (y: number, color = 0x111111) => { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(at(mesh(box(0.17, 0.09, 0.05), color, {}, false), 0.1 * s, y, 0.23)); g.add(at(mesh(box(0.3, 0.02, 0.02), color, {}, false), 0, y + 0.03, 0.24)); return g; };
const eyes = (y: number) => { const g = new THREE.Group(); for (const s of [-1, 1]) g.add(at(mesh(sph(0.04, 6), 0x111111, {}, false), 0.09 * s, y, 0.23)); return g; };
const chain = (y: number) => at(mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16), 0xffd24a, { emissive: 0x553300 }), 0, y, 0.08, 1.2);

export function champModel(id: string, color: number, accent: number): Rig {
  let r: Rig;
  switch (id) {
    case "ezreal": r = humanoid({ shirt: color }); r.body.add(at(mesh(cone(0.3, 0.35, 8), 0xf2c94c), 0, 1.68, -0.02, -0.3)); r.armR.add(at(mesh(sph(0.15), 0xf2c94c, { emissive: 0x886600 }), 0, -0.52, 0)); r.body.add(eyes(1.48)); break;
    case "annie": r = humanoid({ shirt: 0xe06aa8, height: 0.75, head: 1.1 }); r.body.add(at(mesh(cone(0.4, 0.6, 10), 0xe06aa8), 0, 0.55, 0)); r.body.add(at(mesh(sph(0.28), 0xc0392b), 0, 1.15, -0.05)); const bear = new THREE.Group(); bear.add(mesh(sph(0.12), 0x7a3b1d)); bear.add(at(mesh(sph(0.08), 0x7a3b1d), 0, 0.15, 0)); r.armL.add(at(bear, 0, -0.6, 0.1)); r.body.add(eyes(1.12)); break;
    case "ryze": r = humanoid({ shirt: 0x7a5a2a, skin: 0x5aa0e0 }); r.body.add(at(mesh(cyl(0.12, 0.12, 1.1), 0xf1e6c8), 0, 1.0, -0.35, 0, 0, 0.3)); r.body.add(eyes(1.48)); break;
    case "jhin": r = humanoid({ shirt: 0xe8e0cf, pants: 0x6a1a1a }); r.body.add(at(mesh(box(0.34, 0.3, 0.1), 0xf5f0e0), 0, 1.47, 0.2)); r.armR.add(at(mesh(cyl(0.04, 0.05, 1.3), 0xc0a060), 0, -0.4, 0.4, Math.PI / 2)); break;
    case "caitlyn": r = humanoid({ shirt: color }); r.body.add(at(mesh(cyl(0.2, 0.2, 0.4), 0x3a1f5a), 0, 1.8, 0)); r.body.add(at(mesh(cyl(0.34, 0.34, 0.04), 0x3a1f5a), 0, 1.62, 0)); r.armR.add(at(mesh(cyl(0.04, 0.05, 1.5), 0x333333), 0, -0.4, 0.5, Math.PI / 2)); r.body.add(eyes(1.48)); break;
    case "garen": r = humanoid({ shirt: color, girth: 1.3, height: 1.15 }); for (const s of [-1, 1]) r.body.add(at(mesh(sph(0.22), 0xe8c14c), 0.45 * s, 1.35, 0)); r.armR.add(at(mesh(box(0.12, 1.4, 0.04), 0xdddddd), 0, -0.9, 0.2)); r.body.add(eyes(1.7)); break;
    case "darius": r = humanoid({ shirt: color, girth: 1.3, height: 1.15, pants: 0x222222 }); for (const s of [-1, 1]) r.body.add(at(mesh(cone(0.18, 0.35, 6), 0x222222), 0.45 * s, 1.45, 0)); { const axe = new THREE.Group(); axe.add(mesh(cyl(0.04, 0.04, 1.4), 0x3a2a1a)); axe.add(at(mesh(cyl(0.4, 0.4, 0.05, 12), 0x999999), 0.2, 0.6, 0, Math.PI / 2)); r.armR.add(at(axe, 0, -0.6, 0.2)); } r.body.add(eyes(1.7)); break;
    case "rammus": { r = humanoid({ shirt: 0x8a6a3a, height: 0.7, girth: 1.4, skin: 0xb89060 }); const shell = mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a6a3a); r.body.add(at(shell, 0, 0.75, -0.05)); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; r.body.add(at(mesh(cone(0.08, 0.3, 5), 0xd7b56d), Math.cos(a) * 0.45, 1.05, Math.sin(a) * 0.45 - 0.05, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)); } r.body.add(eyes(1.0)); break; }
    case "illaoi": r = humanoid({ shirt: color, skin: 0x9a6b40, girth: 1.2 }); r.armR.add(at(mesh(box(0.35, 0.35, 0.35), 0xe8c14c, { emissive: 0x443300 }), 0, -0.6, 0.1)); r.body.add(eyes(1.48)); break;
    case "karma": r = humanoid({ shirt: color, skin: 0xd9a066 }); r.body.add(at(mesh(cone(0.45, 0.8, 10), color), 0, 0.5, 0)); for (let i = 0; i < 3; i++) r.body.add(r.extra["orb" + i] = at(mesh(sph(0.1), 0x5affff, { emissive: 0x228888 }, false), 0, 1.3, 0)); r.body.add(eyes(1.48)); break;
    case "torrente": {
      r = humanoid({ shirt: 0x5a6b4a, girth: 1.55, height: 0.95, head: 1.15, pants: 0x333333 });
      r.body.add(r.extra.belly = at(mesh(sph(0.45), 0xf1c27d), 0, 0.72, 0.12));
      r.body.add(r.extra.tank = at(mesh(new THREE.SphereGeometry(0.47, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0xf1f1e0), 0, 0.78, 0.12));
      r.body.add(shades(1.42, 0x3a2a10));
      r.body.add(at(mesh(box(0.3, 0.04, 0.2), 0x222222, {}, false), 0.05, 1.67, 0, 0, 0, 0.3)); // combover
      r.body.add(at(mesh(cyl(0.008, 0.008, 0.2, 4), 0xe0c080, {}, false), 0.1, 1.28, 0.3, Math.PI / 2, 0.5));
      r.armL.add(at(mesh(cyl(0.07, 0.06, 0.15), 0x8a4a10, { transparent: true, opacity: 0.8 }), 0, -0.6, 0.05));
      break;
    }
    case "kanye": r = humanoid({ shirt: 0x222222, skin: 0x7a4a2a, pants: 0x3a3a3a }); r.body.add(shades(1.48)); r.body.add(chain(1.15)); r.body.add(r.extra.halo = at(mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 20), 0xffe04a, { emissive: 0xaa8800 }, false), 0, 1.85, 0, Math.PI / 2)); r.armR.add(at(mesh(box(0.1, 0.18, 0.02), 0x33c3ff, { emissive: 0x114466 }), 0, -0.55, 0.05)); break;
    case "epstein": r = humanoid({ shirt: 0x1c2240, skin: 0xe8c0a0, pants: 0x1c2240 }); r.body.add(at(mesh(box(0.14, 0.4, 0.02), 0xffffff, {}, false), 0, 1.05, 0.31)); r.body.add(at(mesh(sph(0.27), 0xcccccc), 0, 1.58, -0.05)); r.armR.add(at(mesh(box(0.3, 0.2, 0.02), 0xffd24a, { emissive: 0x443300 }), 0, -0.55, 0.1)); r.body.add(r.extra.sheet = at(mesh(box(1.4, 1.8, 0.05), 0xf8f8f8, { transparent: true, opacity: 0.85 }, false), 0, 1, 0.6)); r.body.add(eyes(1.48)); break;
    case "diddy": r = humanoid({ shirt: 0xf4f4f4, skin: 0x6a3a1a, pants: 0xf4f4f4 }); r.body.add(shades(1.48)); r.body.add(chain(1.15)); r.armR.add(at(mesh(cyl(0.06, 0.08, 0.25), 0xfff7c0, { transparent: true, opacity: 0.8 }), 0, -0.6, 0.05)); break;
    case "mortadelo": {
      r = humanoid({ shirt: 0x151515, height: 1.35, girth: 0.8, pants: 0x151515 });
      r.body.add(at(mesh(cone(0.08, 0.45, 8), 0xf1c27d), 0, 1.92, 0.35, Math.PI / 2 + 0.3)); // big nose
      r.body.add(eyes(2.0));
      for (const s of [-1, 1]) r.body.add(at(mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 12), 0x111111, {}, false), 0.09 * s, 1.98, 0.24));
      const fil = humanoid({ shirt: 0xd33b2c, height: 0.72, girth: 1.4, pants: 0x151515, head: 1.1 });
      for (const s of [-1, 1]) fil.body.add(at(mesh(cyl(0.01, 0.01, 0.35, 3), 0x111111, {}, false), 0.06 * s, 1.35, 0, 0, 0, 0.3 * s));
      fil.body.add(eyes(1.08));
      fil.armR.add(at(mesh(box(0.1, 0.12, 0.25), 0x3a2a1a), 0, -0.55, 0.1)); // slipper
      r.root.add(at(fil.root, 0.7, 0, -0.6));
      r.extra.filemon = fil.root;
      r.extra.filArmR = fil.armR;
      break;
    }
    default: r = humanoid({ shirt: color });
  }
  return r;
}

// ---------------------------------------------------------------- pigeons
export function pigeonModel(kind: string, team: number) {
  const g = new THREE.Group(), s = kind === "super" ? 1.7 : kind === "cannon" ? 1.1 : 1;
  const body = new THREE.Group();
  body.add(at(mesh(sph(0.35), 0x8a8f9a), 0, 0.45, 0, 0, 0, 0));
  body.children[0].scale.set(1, 0.85, 1.35);
  body.add(at(mesh(sph(0.2), 0x5a7a8a), 0, 0.82, 0.3)); // iridescent neck/head
  body.add(at(mesh(cone(0.06, 0.18, 6), 0xffa040), 0, 0.8, 0.55, Math.PI / 2));
  body.add(at(mesh(sph(0.04, 6), 0xff5500, {}, false), 0.1, 0.9, 0.44));
  body.add(at(mesh(sph(0.04, 6), 0xff5500, {}, false), -0.1, 0.9, 0.44));
  for (const x of [-1, 1]) body.add(at(mesh(sph(0.22, 8), 0x6a6f7a), 0.28 * x, 0.5, -0.05));
  for (const x of [-1, 1]) body.add(at(mesh(cyl(0.03, 0.03, 0.25, 4), 0xff7aa0), 0.12 * x, 0.12, 0));
  body.add(at(mesh(box(0.35, 0.05, 0.3), 0x5a5f6a), 0, 0.5, -0.45, -0.3));
  if (kind === "caster") body.add(at(mesh(cyl(0.06, 0.06, 0.6, 6), 0xd9a441), 0.3, 0.6, 0.35, Math.PI / 2.5, 0, 0.3));
  if (kind === "super") body.add(at(mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x888888, { emissive: 0x222222 }), 0, 0.92, 0.3));
  if (kind === "cannon") {
    const cart = new THREE.Group();
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(box(1, 0.6, 1.3)), new THREE.LineBasicMaterial({ color: 0xcccccc }));
    cart.add(at(wire, 0, 0.5, 0));
    for (const [x, z] of [[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.5], [0.4, 0.5]]) cart.add(at(mesh(cyl(0.1, 0.1, 0.06, 8), 0x222222), x, 0.1, z, 0, 0, Math.PI / 2));
    cart.add(at(mesh(cyl(0.12, 0.15, 0.8, 8), 0x333333), 0, 0.85, 0.4, Math.PI / 2.3));
    g.add(cart);
    body.position.y = 0.55;
  }
  body.add(g.userData.apron = at(mesh(box(0.4, 0.4, 0.02), 0x2e9e4f, {}, false), 0, 0.4, 0.46));
  g.userData.apron.visible = false;
  g.add(body);
  g.add(at(new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 20), new THREE.MeshBasicMaterial({ color: team ? 0xff4040 : 0x3a8cff, side: THREE.DoubleSide })), 0, 0.03, 0, -Math.PI / 2));
  g.scale.setScalar(s);
  g.userData.body = body;
  return g;
}

// ---------------------------------------------------------------- map
const PARTY = [
  { bg: "#e30613", fg: "#fff", name: "PSOE" },
  { bg: "#1d84ce", fg: "#fff", name: "PP" },
];
export function bannerTex(team: number) {
  const p = PARTY[team];
  return canvasTex(256, 512, c => {
    c.fillStyle = p.bg; c.fillRect(0, 0, 256, 512);
    c.fillStyle = "rgba(255,255,255,0.15)"; for (let i = 0; i < 512; i += 32) c.fillRect(0, i, 256, 4);
    c.fillStyle = p.fg;
    if (team === 0) { // fist and rose
      c.beginPath(); c.arc(128, 170, 60, 0, Math.PI * 2); c.fill();
      c.fillStyle = p.bg; c.beginPath(); c.arc(128, 170, 38, 0, Math.PI * 2); c.fill();
      c.fillStyle = p.fg; c.fillRect(118, 220, 20, 90);
    } else { // gull
      c.lineWidth = 18; c.strokeStyle = p.fg; c.beginPath(); c.moveTo(40, 200); c.quadraticCurveTo(90, 120, 128, 190); c.quadraticCurveTo(166, 120, 216, 200); c.stroke();
    }
    c.font = "900 90px Impact, sans-serif"; c.textAlign = "center"; c.fillText(p.name, 128, 420);
  });
}

export function towerModel(team: number) {
  const g = new THREE.Group();
  g.add(at(mesh(box(2.6, 0.5, 2.6), 0xe8e2d0), 0, 0.25, 0));
  g.add(at(mesh(box(2.2, 0.3, 2.2), 0xdcd5c0), 0, 0.65, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.75, 0.9, 6, 16), 0xf0ead8), 0, 3.8, 0));
  g.add(at(mesh(cyl(1.1, 0.8, 0.4, 16), 0xe8e2d0), 0, 6.95, 0));
  g.add(at(mesh(box(2.3, 0.35, 2.3), 0xdcd5c0), 0, 7.3, 0));
  const crystal = at(mesh(new THREE.OctahedronGeometry(0.6), team ? 0xff4a3d : 0x4aa8ff, { emissive: team ? 0x661a10 : 0x103a66 }), 0, 8.4, 0);
  g.add(crystal);
  g.userData.crystal = crystal;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.6, 8, 1), new THREE.MeshToonMaterial({ map: bannerTex(team), gradientMap: grad, side: THREE.DoubleSide }));
  for (const s of [-1, 1]) g.add(at(banner.clone(), 0, 4.8, 0.95 * s, 0, s < 0 ? Math.PI : 0));
  g.userData.banner = banner;
  return g;
}

export function inhibModel() {
  const g = new THREE.Group();
  g.add(at(mesh(box(2.4, 0.3, 2.4), 0x444455), 0, 0.15, 0));
  g.add(at(new THREE.Mesh(box(2, 2.4, 2), new THREE.MeshPhysicalMaterial({ color: 0xddeeff, transparent: true, opacity: 0.25, roughness: 0.05, transmission: 0.6 })), 0, 1.5, 0));
  g.add(at(new THREE.LineSegments(new THREE.EdgesGeometry(box(2, 2.4, 2)), new THREE.LineBasicMaterial({ color: 0x222222 })), 0, 1.5, 0));
  g.add(at(mesh(box(0.8, 0.05, 0.12), 0x111111, {}, false), 0, 2.72, 0));
  const ballots: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const b = at(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffffff : 0xf5e6b0, side: THREE.DoubleSide })), (Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4, Math.random() * 3, Math.random() * 3);
    ballots.push(b); g.add(b);
  }
  g.userData.ballots = ballots;
  return g;
}

export function nexusModel(team: number) {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(4, 4.3, 0.6, 32), 0xd8d0bc), 0, 0.3, 0));
  const seats: THREE.Object3D[] = [];
  for (let row = 0; row < 4; row++) {
    const r = 1.4 + row * 0.6, n = 8 + row * 3;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i / (n - 1)) - Math.PI / 2;
      const seat = new THREE.Group();
      seat.add(mesh(box(0.35, 0.18, 0.3), 0xb0282b));
      seat.add(at(mesh(box(0.35, 0.35, 0.08), 0xb0282b), 0, 0.2, -0.12));
      seat.position.set(-Math.cos(a) * r * side0(team), 0.75 + row * 0.22, Math.sin(a) * r);
      seat.lookAt(0, seat.position.y, 0);
      seats.push(seat); g.add(seat);
    }
  }
  // podium + facade
  g.add(at(mesh(box(0.9, 0.9, 1.6), 0x6a4a2a), 0.6 * side0(team), 1, 0));
  const facade = new THREE.Group();
  facade.add(at(mesh(box(1, 0.4, 6), 0xe8e2d0), 0, 0.2, 0));
  for (let i = 0; i < 6; i++) facade.add(at(mesh(cyl(0.2, 0.22, 3, 10), 0xf0ead8), 0, 1.9, -2.5 + i));
  facade.add(at(mesh(box(1, 0.4, 6.2), 0xe8e2d0), 0, 3.6, 0));
  const ped = new THREE.Shape([new THREE.Vector2(-3.1, 0), new THREE.Vector2(3.1, 0), new THREE.Vector2(0, 1.3)]);
  facade.add(at(mesh(new THREE.ExtrudeGeometry(ped, { depth: 0.8, bevelEnabled: false }), 0xe8e2d0), -0.4, 3.8, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) facade.add(at(mesh(sph(0.35), 0x9a7a3a), 0.6, 0.65, 3.4 * s)); // lions
  g.add(at(facade, 3.2 * side0(team), 0.5, 0));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshToonMaterial({ map: bannerTex(team), gradientMap: grad, side: THREE.DoubleSide }));
  g.add(at(mesh(cyl(0.04, 0.04, 3), 0x999999), 3.2 * side0(team), 6.5, 0));
  g.add(at(flag, 3.2 * side0(team), 7.5, 0.72));
  g.userData.seats = seats;
  g.userData.facade = facade;
  return g;
}
const side0 = (team: number) => (team === 0 ? -1 : 1);

export function tarpTex() {
  return canvasTex(512, 256, c => {
    c.fillStyle = "#2f7d4a"; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 2;
    for (let i = 0; i < 512; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); }
    for (let i = 0; i < 256; i += 8) { c.beginPath(); c.moveTo(0, i); c.lineTo(512, i); c.stroke(); }
    const tags = ["OBRAS", "LAURA TQM", "VOX NO", "ACAB", "PERRO SANXE", "FEIJOO KE", "CHUPITOS 1€", "EL NANO 33"];
    for (let i = 0; i < 4; i++) {
      c.save(); c.translate(60 + i * 120, 60 + (i % 2) * 110); c.rotate((Math.random() - 0.5) * 0.4);
      c.font = `900 ${34 + Math.random() * 16}px Impact`; c.lineWidth = 6; c.strokeStyle = "#111";
      c.fillStyle = ["#ff3cac", "#ffe03c", "#3cf0ff", "#ff7a1a"][i];
      const t = tags[Math.floor(Math.random() * tags.length)];
      c.strokeText(t, 0, 0); c.fillText(t, 0, 0); c.restore();
    }
  });
}
export function bushModel(w: number, d: number) {
  const g = new THREE.Group(), h = 2.4;
  const tex = tarpTex();
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: grad, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  for (const s of [-1, 1]) {
    g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), 0, h / 2, (d / 2) * s));
    g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(d, h), mat), (w / 2) * s, h / 2, 0, 0, Math.PI / 2));
  }
  const pole = cyl(0.04, 0.04, h + 0.4, 6);
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) g.add(at(mesh(pole, 0x888888, {}, false), x, (h + 0.4) / 2, z));
  for (const y of [0.9, h]) for (const s of [-1, 1]) g.add(at(mesh(cyl(0.03, 0.03, w, 6), 0x888888, {}, false), 0, y, (d / 2) * s, 0, 0, Math.PI / 2));
  // yellow fence
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.add(at(mesh(box(1.1, 0.12, 0.05), 0xffd400), 0, 0.8, 0));
    f.add(at(mesh(box(1.1, 0.12, 0.05), 0xffd400), 0, 0.45, 0));
    for (const s of [-1, 1]) f.add(at(mesh(box(0.06, 0.9, 0.06), 0xffd400), 0.55 * s, 0.45, 0));
    g.add(at(f, -w / 2 + 0.6 + i * 1.3, 0, d / 2 + 0.35, 0, (Math.random() - 0.5) * 0.4));
  }
  g.userData.mat = mat;
  return g;
}

export function relicModel() {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(cyl(0.2, 0.16, 0.5, 14), new THREE.MeshToonMaterial({ color: 0xf2a515, gradientMap: grad, transparent: true, opacity: 0.85, emissive: 0x442200 })), 0, 0.45, 0));
  g.add(at(mesh(cyl(0.21, 0.21, 0.12, 14), 0xffffff), 0, 0.74, 0));
  g.add(at(mesh(cyl(0.35, 0.3, 0.04, 16), 0xffffff), 0.4, 0.2, 0.1));
  for (let i = 0; i < 5; i++) g.add(at(mesh(sph(0.06, 6), 0x6b8e23, {}, false), 0.4 + Math.cos(i) * 0.15, 0.26, 0.1 + Math.sin(i) * 0.15));
  g.add(at(new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.6, side: THREE.DoubleSide })), 0, 0.03, 0, -Math.PI / 2));
  return g;
}

export function shopModel() {
  const g = new THREE.Group();
  g.add(at(mesh(box(3.2, 1.1, 1), 0x9a6a3a), 0, 0.55, 0));
  g.add(at(mesh(box(3.6, 3, 0.3), 0xcccccc), 0, 1.5, -1.6));
  const cols = [0xff3c3c, 0xffe03c, 0x3cb4ff, 0x3cff7a, 0xff9a3c, 0xd46bff];
  for (let y = 0; y < 3; y++) for (let i = 0; i < 8; i++) g.add(at(mesh(box(0.3, 0.4, 0.25), cols[(i + y * 3) % 6], {}, false), -1.4 + i * 0.4, 0.6 + y * 0.9, -1.35));
  for (let i = 0; i < 6; i++) g.add(at(mesh(box(0.2, 0.3, 0.15), cols[i], {}, false), -1.2 + i * 0.45, 1.25, 0.1));
  // voxel shopkeeper
  const k = new THREE.Group();
  k.add(at(mesh(box(0.8, 0.9, 0.5), 0x2255aa), 0, 1.45, 0));
  k.add(at(mesh(box(0.6, 0.6, 0.6), 0xf1c9a0), 0, 2.2, 0));
  k.add(at(mesh(box(0.64, 0.18, 0.64), 0x111111), 0, 2.52, 0));
  for (const s of [-1, 1]) k.add(at(mesh(box(0.2, 0.12, 0.04), 0x111111, {}, false), 0.14 * s, 2.24, 0.31));
  g.add(at(k, 0, 0, -0.8));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 104, c => { c.fillStyle = "#c8102e"; c.fillRect(0, 0, 512, 104); c.fillStyle = "#ffd400"; c.font = "900 44px Impact"; c.textAlign = "center"; c.fillText("BAZAR ALIMENTACIÓN", 256, 50); c.font = "700 26px Arial"; c.fillText("ElChino · abierto 24h", 256, 88); }),
  }));
  g.add(at(sign, 0, 3.4, -1.4));
  return g;
}

export function mercadonaModel() {
  const g = new THREE.Group();
  g.add(at(mesh(box(5, 2.8, 4), 0xf4f4f0), 0, 1.4, 0));
  g.add(at(mesh(box(5.05, 0.3, 4.05), 0x0a8a3a), 0, 2.2, 0));
  g.add(at(mesh(box(5.05, 0.15, 4.05), 0xf28c00), 0, 1.95, 0));
  g.add(at(mesh(box(1.6, 1.8, 0.1), 0x88bbcc, { transparent: true, opacity: 0.7 }), 0, 0.9, 2.02));
  g.add(at(mesh(box(1.6, 1.8, 0.1), 0x88bbcc, { transparent: true, opacity: 0.7 }), 0, 0.9, -2.02));
  const signTex = canvasTex(512, 128, c => { c.fillStyle = "#fff"; c.fillRect(0, 0, 512, 128); c.fillStyle = "#0a8a3a"; c.font = "900 80px Arial"; c.textAlign = "center"; c.fillText("MERCADONA", 256, 95); });
  for (const s of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: signTex })), 0, 3.3, 2 * s, 0, s < 0 ? Math.PI : 0));
  g.add(at(mesh(box(3.8, 1, 0.2), 0xffffff), 0, 3.3, 0));
  for (let i = 0; i < 6; i++) {
    const cart = new THREE.LineSegments(new THREE.EdgesGeometry(box(0.7, 0.5, 0.9)), new THREE.LineBasicMaterial({ color: 0xbbbbbb }));
    const a = Math.random() * Math.PI * 2;
    g.add(at(cart, Math.cos(a) * 3.8, 0.45, Math.sin(a) * 3.3, 0, Math.random() * 3, (Math.random() - 0.5) * 0.6));
  }
  return g;
}

export function stoneTex() {
  const t = canvasTex(512, 512, c => {
    c.fillStyle = "#8d8a86"; c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 125 + Math.random() * 30;
      c.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      c.fillRect(x * 64 + 2 + (y % 2) * 32, y * 64 + 2, 60, 60);
    }
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
