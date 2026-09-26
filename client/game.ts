import type { Room } from "@colyseus/sdk";
import * as THREE from "three";
import { BRIDGE, BUSHES, CHAMPS, FOUNTAIN_X, ITEMS, RELICS, RUNES, SHOP_RADIUS, SPELLS, champ, inBush, item, side, xpFor } from "../shared/data";
import { music, sfx, speak, startMusic, stopMusic, vol, applyVolume } from "./audio";
import { esc, h, splash } from "./main";
import { type Rig, bushModel, champModel, inhibModel, loadChampModels, mercadonaModel, mesh, nexusModel, pigeonModel, relicModel, shopModel, stoneTex, textSprite, toon, towerModel } from "./models";

const ICONS: Record<string, string[]> = {
  ezreal: ["✴️", "🔮", "⚡", "🌊", "💫"], annie: ["🔥", "🌋", "🛡️", "🧸", "🎀"], ryze: ["📜", "⛓️", "🔵", "🌀", "📘"],
  jhin: ["💣", "🌸", "🪷", "🎭", "4️⃣"], caitlyn: ["🔫", "🪤", "🕸️", "🎯", "🎩"], garen: ["⚔️", "🛡️", "🌪️", "⚖️", "💪"],
  darius: ["🪓", "🦵", "🪝", "🗡️", "🩸"], rammus: ["🏐", "🐢", "😤", "💥", "🦔"], illaoi: ["🐙", "🦘", "👻", "🗿", "🦑"],
  karma: ["🔥", "⛓️", "💨", "🧘", "☯️"], torrente: ["🤮", "🚔", "🥐", "👕", "🥃"], kanye: ["📱", "👟", "⚡", "👑", "🐦"],
  epstein: ["✉️", "🛏️", "💼", "💀", "✈️"], diddy: ["🍼", "🎉", "🕺", "🪩", "🫗"], mortadelo: ["🎭", "🧪", "🔄", "🔨", "🥿"],
};
const EMOTES: Record<string, string> = { drake: "🙅‍♂️➡️👍", torrente: "😁🦷", f: "🔥🇫🔥", psoe: "🌹🚩", pigeon: "🐦🥖", kanye: "🕶️😎" };
const PINGS: Record<string, { icon: string; color: string; sound: string; label: string }> = {
  danger: { icon: "⚠️", color: "#ff4040", sound: "pop", label: "¡Peligro!" },
  omw: { icon: "🏃", color: "#4aa8ff", sound: "whistle", label: "¡Voy de camino!" },
  assist: { icon: "🆘", color: "#40ff80", sound: "pop", label: "¡Ayuda!" },
  missing: { icon: "❓", color: "#ffd400", sound: "whistle", label: "¡Enemigo desaparecido!" },
};
const CC_TEXT: Record<string, string> = { stun: "💫 ATURDIDO", root: "⛓️ ENRAIZADO", slow: "🐌", silence: "🤐 SILENCIADO", taunt: "😤 PROVOCADO", charm: "💌 HECHIZADO", fear: "😱 ATERRADO", blind: "🎉 CEGADO", suppress: "🪩 ¡A BAILAR!", knockup: "🌪️ POR LOS AIRES" };
const TEAMCOL = [0x3a8cff, 0xff4545];

let R: Room<any, any>;
let me = "";
let myTeam = 0;
let flip = 1;
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight;
let alive = false, raf = 0;
const clock = new THREE.Timer();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Raycaster();
const mouse = { x: 0, y: 0, ndc: new THREE.Vector2(), world: new THREE.Vector3() };

interface View {
  id: string; kind: string; team: number; obj: THREE.Object3D; rig?: Rig; bar: HTMLElement; x: number; z: number; rot: number;
  atk: number; atkT: number; dead: boolean; vis: boolean; ring?: THREE.Mesh; stars?: THREE.Object3D; shirtless?: number; exploded?: boolean;
  zzz?: THREE.Sprite; pot?: THREE.Object3D; amogus?: THREE.Object3D; bubble?: THREE.Mesh; lastBar?: string;
}
const views = new Map<string, View>();
const projViews = new Map<string, THREE.Object3D>();
const tweens: { t: number; dur: number; fn: (k: number, dt: number) => void; end?: () => void }[] = [];
const relicObjs: THREE.Object3D[] = [];
const bushObjs: { g: THREE.Group; mat: THREE.MeshToonMaterial }[] = [];
let merc: THREE.Object3D | undefined;
const hud: Record<string, HTMLElement> = {};
let camZoom = 1, deathZoom = 0, wobbleUntil = 0, slowmoUntil = 0, focusOverride: { x: number; z: number; until: number } | undefined;
let chatOpen = false, shopOpen = false, statsOpen = false, menuOpen = false;
let hovered: string | undefined;
let lastDeadState = false;
const keysDown = new Set<string>();
let chatLogRef: any[] = [];

export const running = () => alive;

// ---------------------------------------------------------------- scene setup
export async function prepare(room: Room<any, any>, report: (p: number) => void) {
  R = room;
  me = room.sessionId;
  const myP = room.state.players.get(me);
  myTeam = myP?.team ?? 0;
  flip = myTeam ? -1 : 1;
  const canvas = document.getElementById("gl") as HTMLCanvasElement;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120a24);
  scene.fog = new THREE.Fog(0x1a0f33, 30, 75);
  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 300);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a2a4a, 1.3));
  sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
  scene.add(sun, sun.target);
  await tick();
  report(60);
  buildMap();
  report(80);
  await loadChampModels();
  // warm up shader compile with one of each model
  for (const c of CHAMPS) { const r = champModel(c.id, c.color, c.accent); r.root.position.set(0, -50, 0); scene.add(r.root); tweens.push({ t: 0, dur: 0.1, fn: () => {}, end: () => scene.remove(r.root) }); }
  renderer.compile(scene, camera);
  report(95);
}
const tick = () => new Promise(r => setTimeout(r, 30));

function buildMap() {
  const tex = stoneTex();
  tex.repeat.set(28, 4);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE.maxX * 2 + 4, 2, BRIDGE.halfW * 2 + 2), toon(0xffffff, { map: tex }));
  bridge.position.y = -1;
  bridge.receiveShadow = true;
  scene.add(bridge);
  // walls / railings with streetlamps
  for (const s of [-1, 1]) {
    const wall = mesh(new THREE.BoxGeometry(BRIDGE.maxX * 2 + 4, 0.8, 0.6), 0x6e6a78);
    wall.position.set(0, 0.4, s * (BRIDGE.halfW + 0.7));
    scene.add(wall);
    for (let x = -60; x <= 60; x += 15) {
      const lamp = new THREE.Group();
      lamp.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), 0x222222));
      lamp.children[0].position.y = 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
      bulb.position.set(0, 4, -s * 0.4);
      lamp.add(bulb);
      lamp.position.set(x, 0.8, s * (BRIDGE.halfW + 0.7));
      scene.add(lamp);
    }
  }
  // abyss: rocks, void glow and stars
  const rockMat = toon(0x3a3350);
  for (let i = 0; i < 70; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 2.5), rockMat);
    const s = Math.random() < 0.5 ? -1 : 1;
    r.position.set((Math.random() - 0.5) * 160, -6 - Math.random() * 25, s * (14 + Math.random() * 30));
    r.userData.bob = Math.random() * 6;
    scene.add(r);
    tweens.push({ t: 0, dur: Infinity, fn: (_k, dt) => { r.userData.bob += dt * 0.4; r.position.y += Math.sin(r.userData.bob) * dt * 0.3; r.rotation.y += dt * 0.05; } });
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshBasicMaterial({ color: 0x5a1a8a, transparent: true, opacity: 0.5 }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -45;
  scene.add(glow);
  const stars = new THREE.BufferGeometry();
  stars.setAttribute("position", new THREE.Float32BufferAttribute(Array.from({ length: 1500 }, (_, i) => (i % 3 === 1 ? -20 - Math.random() * 60 : (Math.random() - 0.5) * 300)), 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xc8b8ff, size: 0.4, fog: false })));
  // fountains + shops
  for (const team of [0, 1]) {
    const x = side(team) * FOUNTAIN_X;
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(SHOP_RADIUS + 1, SHOP_RADIUS + 1, 0.3, 40), toon(team ? 0x5a2a2a : 0x2a3a5a));
    plat.position.set(x, 0.05, 0);
    plat.receiveShadow = true;
    scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(SHOP_RADIUS, 0.12, 6, 60), new THREE.MeshBasicMaterial({ color: TEAMCOL[team] }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.25, 0);
    scene.add(ring);
    const shop = shopModel();
    shop.position.set(x + side(team) * 3, 0, -5.5);
    shop.rotation.y = side(team) * -0.6;
    scene.add(shop);
  }
  for (const b of BUSHES) { const g = bushModel(b.w, b.d); g.position.set(b.x, 0, b.z); scene.add(g); bushObjs.push({ g, mat: g.userData.mat }); }
  for (const r of RELICS) {
    const o = relicModel();
    o.position.set(r.x, 0, r.z);
    o.visible = false;
    scene.add(o);
    relicObjs.push(o);
  }
}

// ---------------------------------------------------------------- start / stop
export function start(room: Room<any, any>, chatLog: any[]) {
  R = room;
  chatLogRef = chatLog;
  alive = true;
  (document.getElementById("gl") as HTMLElement).style.display = "block";
  buildHud();
  bindInput();
  bindMessages();
  const my = R.state.units.get(me);
  music.theme = my ? champ(my.champ).theme : "epic";
  startMusic();
  onResize();
  clock.update();
  loop();
  announce("¡Bienvenidos al Abismo del Bipartidismo!", "small");
  speak("¡Bienvenidos al Abismo del Bipartidismo!");
}

export function stop() {
  alive = false;
  cancelAnimationFrame(raf);
  stopMusic();
  document.getElementById("bars")!.innerHTML = "";
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("keyup", onKeyUp);
  document.getElementById("gl")!.classList.remove("dead");
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", () => renderer && onResize());

// ---------------------------------------------------------------- main loop
function loop() {
  if (!alive) return;
  raf = requestAnimationFrame(loop);
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now() / 1000;
  const slow = slowmoUntil > now ? 0.3 : 1;
  syncUnits(dt * slow);
  syncProjectiles(dt);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    tw.fn(Math.min(1, tw.t / tw.dur), dt);
    if (tw.t >= tw.dur) { tweens.splice(i, 1); tw.end?.(); }
  }
  R.state.relics.forEach((v: boolean, i: number) => { relicObjs[i].visible = v; relicObjs[i].rotation.y += dt; });
  updateCamera(dt, now);
  updateHud();
  renderer.render(scene, camera);
}

function myUnit() { return R.state.units.get(me); }

function updateCamera(dt: number, now: number) {
  const u = myUnit();
  const fv = views.get(me);
  let fx = fv?.x ?? side(myTeam) * FOUNTAIN_X, fz = fv?.z ?? 0;
  if (focusOverride && focusOverride.until > now) { fx = focusOverride.x; fz = focusOverride.z; }
  deathZoom += ((u?.dead ? 1 : 0) - deathZoom) * Math.min(1, dt * 1.5);
  const z = camZoom * (1 - deathZoom * 0.55);
  const target = new THREE.Vector3(fx, 0, fz);
  const want = new THREE.Vector3(fx, 19 * z, fz + 11 * z * flip);
  if (camera.position.distanceTo(want) > 30) camera.position.copy(want);
  else camera.position.lerp(want, Math.min(1, dt * 8));
  camera.lookAt(target);
  if (wobbleUntil > now) { camera.rotation.z += Math.sin(now * 3) * 0.08; camera.position.x += Math.sin(now * 2.1) * 0.6; }
  sun.position.set(fx + 12, 30, fz + 10);
  sun.target.position.copy(target);
}

// ---------------------------------------------------------------- units
function visibleToMe(u: any) {
  if (u.team === myTeam || u.team === 2) return true;
  if (u.stealth) return false;
  const b = inBush(u.x, u.z);
  if (b < 0) return true;
  let seen = false;
  R.state.units.forEach((a: any) => { if (!seen && a.team === myTeam && !a.dead && a.kind === "champ" && inBush(a.x, a.z) === b) seen = true; });
  return seen;
}

function createView(id: string, u: any): View {
  let obj: THREE.Object3D, rig: Rig | undefined, ring: THREE.Mesh | undefined;
  switch (u.kind) {
    case "champ": {
      const c = champ(u.champ);
      rig = champModel(c.id, c.color, c.accent);
      obj = rig.root;
      ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 28), new THREE.MeshBasicMaterial({ color: id === me ? 0xffd400 : TEAMCOL[u.team], side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      obj.add(ring);
      if (rig.extra.halo) rig.extra.halo.visible = false;
      if (rig.extra.sheet) rig.extra.sheet.visible = false;
      break;
    }
    case "tower": obj = towerModel(u.team); break;
    case "inhib": obj = inhibModel(); break;
    case "nexus": obj = nexusModel(u.team); break;
    case "mercadona": obj = mercadonaModel(); merc = obj; sfx("boom"); break;
    default: obj = pigeonModel(u.kind, u.team);
  }
  obj.position.set(u.x, 0, u.z);
  obj.rotation.y = u.rot;
  scene.add(obj);
  const struct = ["tower", "inhib", "nexus"].includes(u.kind);
  const cls = u.kind === "champ" ? (id === me ? "me" : u.team === myTeam ? "ally" : "enemy") : u.team === myTeam ? "ally" : "enemy";
  const bar = h(`<div class="hbar ${cls} ${u.kind === "champ" ? "" : struct ? "struct" : "small"}">
    ${u.kind === "champ" ? `<div class="nm">${esc(u.name)}</div><div class="cc"></div>` : ""}
    <div class="bx">${u.kind === "champ" ? `<div class="lv">${u.level}</div>` : ""}<div><div class="hp"><i></i><s></s><b></b></div>${u.kind === "champ" ? `<div class="mp"><i></i></div>` : ""}</div></div></div>`);
  if (u.kind === "mercadona") bar.style.display = "none";
  document.getElementById("bars")!.append(bar);
  return { id, kind: u.kind, team: u.team, obj, rig, ring, bar, x: u.x, z: u.z, rot: u.rot, atk: u.atk, atkT: 0, dead: u.dead, vis: true };
}

const _v = new THREE.Vector3();
function syncUnits(dt: number) {
  const seen = new Set<string>();
  const t = performance.now() / 1000;
  R.state.units.forEach((u: any, id: string) => {
    seen.add(id);
    let v = views.get(id);
    if (!v) views.set(id, (v = createView(id, u)));
    const k = 1 - Math.exp(-dt * 16);
    const jump = Math.hypot(u.x - v.x, u.z - v.z) > 4;
    v.x = jump ? u.x : v.x + (u.x - v.x) * k;
    v.z = jump ? u.z : v.z + (u.z - v.z) * k;
    let dr = u.rot - v.rot;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    v.rot += dr * Math.min(1, dt * 14);
    v.vis = visibleToMe(u);
    v.obj.visible = v.vis && !(u.kind === "champ" && u.fx.includes("fakedeath") && u.team !== myTeam);
    v.obj.position.set(v.x, 0, v.z);
    if (u.kind === "champ") animChamp(v, u, dt, t);
    else if (u.kind === "tower") { const c = (v.obj.userData.crystal as THREE.Object3D); c.rotation.y += dt; c.position.y = 8.4 + Math.sin(t * 2) * 0.2; c.visible = !u.dead; if (u.dead && !v.dead) collapse(v); }
    else if (u.kind === "inhib") { for (const b of v.obj.userData.ballots) { b.rotation.x += dt; b.rotation.y += dt * 0.7; b.position.y = 0.6 + ((b.position.y + dt * 0.3 - 0.6) % 1.8); } if (u.dead && !v.dead) collapse(v); }
    else if (u.kind === "nexus") { if (u.dead && !v.exploded) explodeNexus(v); }
    else if (u.kind !== "mercadona") animPigeon(v, u, dt, t);
    v.dead = u.dead;
    updateBar(v, u);
  });
  for (const [id, v] of views) if (!seen.has(id)) {
    scene.remove(v.obj);
    v.bar.remove();
    views.delete(id);
    if (v.kind === "mercadona") merc = undefined;
  }
}

function animChamp(v: View, u: any, dt: number, t: number) {
  const r = v.rig!;
  v.obj.rotation.y = v.rot;
  const fx: string = u.fx;
  if (u.atk !== v.atk) { v.atk = u.atk; v.atkT = 0.25; r.anim?.shot("attack"); }
  v.atkT = Math.max(0, v.atkT - dt);
  if (r.anim) { r.anim.state(u.dead ? "death" : fx.includes("recall") ? "recall" : u.moving ? "run" : "idle"); r.anim.mixer.update(dt); r.body.position.y = 0; }
  else {
    const walk = u.moving && !u.dead ? Math.sin(t * 12) : 0;
    r.body.position.y = u.moving ? Math.abs(walk) * 0.08 : Math.sin(t * 2) * 0.02;
    r.armL.rotation.x = walk * 0.6;
    r.armR.rotation.x = v.atkT > 0 ? -Math.sin((v.atkT / 0.25) * Math.PI) * 2 : -walk * 0.6;
  }
  // levitation (Kanye manic), death, siesta
  let lift = fx.includes("manic") ? 0.9 + Math.sin(t * 3) * 0.15 : 0;
  r.body.rotation.x = 0; r.body.rotation.z = 0;
  if (u.dead) { if (!r.anim) { r.body.rotation.x = -Math.PI / 2; lift = 0.3; } }
  else if (fx.includes("siesta")) { r.body.rotation.z = Math.PI / 2; lift = 0.3; }
  else if (u.cc === "knockup") lift = 1.2;
  else if (u.cc === "suppress") { r.body.rotation.y = t * 8; }
  if (u.cc !== "suppress") r.body.rotation.y = 0;
  r.body.position.y += lift;
  if (r.extra.halo) r.extra.halo.visible = fx.includes("manic");
  if (r.extra.sheet) r.extra.sheet.visible = fx.includes("sheet");
  if (r.extra.tank) r.extra.tank.visible = !(v.shirtless && v.shirtless > t);
  if (r.extra.orb0) for (let i = 0; i < 3; i++) { const a = t * 2 + (i * Math.PI * 2) / 3; r.extra["orb" + i].position.set(Math.cos(a) * 0.6, 1.3 + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.6); }
  if (r.extra.filemon) {
    const fil = fx.includes("filemon");
    r.extra.filemon.position.lerp(new THREE.Vector3(fil ? 0 : 0.7, 0, fil ? 0.9 : -0.6), Math.min(1, dt * 6));
    r.body.position.z = fil ? -0.6 : 0;
    if (r.extra.filArmR) r.extra.filArmR.rotation.x = v.atkT > 0 && fil ? -2 : 0;
  }
  // disguises
  const plant = fx.includes("plant"), amogus = fx.includes("amogus");
  if (plant && !v.pot) { v.pot = new THREE.Group(); v.pot.add(mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.6, 10), 0xb5542a)); const leaves = mesh(new THREE.SphereGeometry(0.6, 8, 6), 0x3a9a3a); leaves.position.y = 0.8; v.pot.add(leaves); v.pot.position.y = 0.3; v.obj.add(v.pot); }
  if (v.pot) v.pot.visible = plant;
  if (amogus && !v.amogus) { v.amogus = new THREE.Group(); const b = mesh(new THREE.CapsuleGeometry(0.45, 0.5, 4, 10), u.team ? 0xd33 : 0x33d); b.position.y = 0.8; v.amogus.add(b); const visor = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.2), 0x9fe8ff); visor.position.set(0, 1.05, 0.4); v.amogus.add(visor); v.obj.add(v.amogus); }
  if (v.amogus) v.amogus.visible = amogus;
  r.body.visible = !plant && !amogus;
  if (r.extra.filemon) r.extra.filemon.visible = !plant && !amogus;
  // stun stars / zzz / spell shield bubble / stealth ghosting for allies
  const stunned = ["stun", "knockup", "suppress"].includes(u.cc);
  if (stunned && !v.stars) { v.stars = textSprite("★ ★ ★", "#ffd400", 60); v.stars.scale.set(2, 0.5, 1); v.obj.add(v.stars); }
  if (v.stars) { v.stars.visible = stunned; v.stars.position.y = 2.3 + lift; }
  const nap = fx.includes("siesta");
  if (nap && !v.zzz) { v.zzz = textSprite("Zzz", "#9fd8ff", 70); v.zzz.scale.set(2, 0.5, 1); v.obj.add(v.zzz); }
  if (v.zzz) { v.zzz.visible = nap; v.zzz.position.y = 1.4 + Math.sin(t * 2) * 0.2; }
  const bub = fx.includes("spellshield") || fx.includes("recall") || u.stealth;
  if (bub && !v.bubble) { v.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.18, depthWrite: false })); v.bubble.position.y = 0.9; v.obj.add(v.bubble); }
  if (v.bubble) { v.bubble.visible = bub; (v.bubble.material as THREE.MeshBasicMaterial).color.set(u.stealth ? 0x888899 : fx.includes("recall") ? 0x4aa8ff : 0xffd400); }
  if (v.ring) (v.ring.material as THREE.MeshBasicMaterial).color.set(fx.includes("hacendado") ? 0x2e9e4f : v.id === me ? 0xffd400 : TEAMCOL[u.team]);
}

function animPigeon(v: View, u: any, dt: number, t: number) {
  v.obj.rotation.y = v.rot;
  const body = v.obj.userData.body as THREE.Object3D;
  if (u.atk !== v.atk) { v.atk = u.atk; v.atkT = 0.3; }
  v.atkT = Math.max(0, v.atkT - dt);
  body.rotation.x = v.atkT > 0 ? Math.sin((v.atkT / 0.3) * Math.PI) * 0.7 : 0;
  body.position.y = (u.kind === "cannon" ? 0.55 : 0) + (u.moving ? Math.abs(Math.sin(t * 14 + v.x)) * 0.1 : 0);
  (v.obj.userData.apron as THREE.Object3D).visible = u.fx === "apron";
}

function updateBar(v: View, u: any) {
  const H = u.kind === "champ" ? 2.6 : u.kind === "tower" ? 9.5 : u.kind === "nexus" ? 5 : u.kind === "inhib" ? 3.3 : u.kind === "super" ? 2.2 : 1.4;
  _v.set(v.x, H + (u.fx?.includes?.("manic") ? 0.9 : 0), v.z).project(camera);
  const on = v.vis && !u.dead && _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && !(u.untargetable && u.team !== myTeam);
  v.bar.style.display = on && u.kind !== "mercadona" ? "" : "none";
  if (!on) return;
  v.bar.style.left = `${((_v.x + 1) / 2) * innerWidth}px`;
  v.bar.style.top = `${((1 - _v.y) / 2) * innerHeight}px`;
  const total = Math.max(u.maxHp, u.hp + u.shield);
  const key = `${Math.round(u.hp)}|${u.shield}|${Math.round(u.mana)}|${u.level}|${u.cc}`;
  if (key === v.lastBar) return;
  v.lastBar = key;
  const hp = v.bar.querySelector(".hp i") as HTMLElement, sh = v.bar.querySelector(".hp s") as HTMLElement;
  hp.style.width = `${(u.hp / total) * 100}%`;
  sh.style.left = `${(u.hp / total) * 100}%`;
  sh.style.width = `${(u.shield / total) * 100}%`;
  if (u.kind === "champ") {
    (v.bar.querySelector(".mp i") as HTMLElement).style.width = `${u.maxMana ? (u.mana / u.maxMana) * 100 : 0}%`;
    v.bar.querySelector(".lv")!.textContent = u.level;
    v.bar.querySelector(".cc")!.textContent = u.cc ? CC_TEXT[u.cc] ?? "" : "";
  }
}

function collapse(v: View) {
  sfx("boom");
  sfx("bell");
  burst(v.x, 3, v.z, 40, [0xf0ead8, 0xdcd5c0, 0x999999], 8, 1.5, 0.35);
  const o = v.obj;
  tweens.push({ t: 0, dur: 1.2, fn: k => { o.position.y = -k * 4; o.rotation.z = k * 0.4; }, end: () => { o.visible = true; } });
  focus(v.x, v.z, 1.5);
}

function explodeNexus(v: View) {
  v.exploded = true;
  focus(v.x, v.z, 5);
  slowmoUntil = performance.now() / 1000 + 3;
  sfx("boom"); setTimeout(() => sfx("boom"), 300); setTimeout(() => sfx("slam"), 600);
  const seats: THREE.Object3D[] = v.obj.userData.seats;
  for (const s of seats) {
    const w = new THREE.Vector3();
    s.getWorldPosition(w);
    v.obj.remove(s);
    s.position.copy(w);
    scene.add(s);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 16, 10 + Math.random() * 14, (Math.random() - 0.5) * 16), spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    tweens.push({ t: 0, dur: 6, fn: (_k, dt) => { vel.y -= 20 * dt; s.position.addScaledVector(vel, dt); s.rotation.x += spin.x * dt; s.rotation.y += spin.y * dt; if (s.position.y < 0.2 && Math.abs(s.position.z) < 10) { s.position.y = 0.2; vel.multiplyScalar(0.5); vel.y = Math.abs(vel.y) * 0.4; } }, end: () => scene.remove(s) });
  }
  const facade: THREE.Object3D = v.obj.userData.facade;
  tweens.push({ t: 0, dur: 2, fn: k => { facade.rotation.z = k * 1.4 * side(v.team); facade.position.y = 0.5 - k * 2; } });
  // paper sheets
  for (let i = 0; i < 80; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    p.position.set(v.x, 2, v.z);
    scene.add(p);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 10, 8 + Math.random() * 10, (Math.random() - 0.5) * 10);
    tweens.push({ t: 0, dur: 7, fn: (_k, dt) => { vel.y = Math.max(-1.2, vel.y - 12 * dt); vel.x *= 0.99; p.position.addScaledVector(vel, dt); p.position.x += Math.sin(p.position.y * 2 + i) * dt * 2; p.rotation.x += dt * 3; p.rotation.z += dt * 2; }, end: () => scene.remove(p) });
  }
  burst(v.x, 3, v.z, 80, [0xffd400, 0xff4040, 0x3a8cff, 0xffffff], 14, 2, 0.3);
}

// ---------------------------------------------------------------- projectiles
function projMesh(fx: string, color: number): THREE.Object3D {
  const g = new THREE.Group();
  const glow = (r: number, c = color) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: c }));
  switch (fx) {
    case "tower": g.add(glow(0.4)); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 }))); break;
    case "baguette": { const m = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), 0xd9a441); m.rotation.x = Math.PI / 2; g.add(m); g.add(glow(0.1, 0x66ff44)); break; }
    case "cannonball": g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), 0x222222)); break;
    case "slipper": g.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.4), 0x5a3a1a)); break;
    case "phone": g.add(mesh(new THREE.BoxGeometry(0.25, 0.04, 0.45), 0x33c3ff)); break;
    case "envelope": g.add(mesh(new THREE.BoxGeometry(0.5, 0.04, 0.35), 0xffd24a, { emissive: 0x664400 })); break;
    case "wave": { const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 0.5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })); g.add(m); break; }
    case "beam": { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5, 6), new THREE.MeshBasicMaterial({ color })); m.rotation.x = Math.PI / 2; g.add(m); break; }
    default: g.add(glow(fx === "atk" ? 0.15 : 0.3));
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
  return g;
}
function syncProjectiles(dt: number) {
  const seen = new Set<string>();
  R.state.projectiles.forEach((p: any, id: string) => {
    seen.add(id);
    let o = projViews.get(id);
    if (!o) { o = projMesh(p.fx, p.color); o.position.set(p.x, 1.1, p.z); scene.add(o); projViews.set(id, o); if (p.fx !== "atk" && p.fx !== "tower") sfx("pew", 0.4); }
    o.position.x += (p.x - o.position.x) * Math.min(1, dt * 20);
    o.position.z += (p.z - o.position.z) * Math.min(1, dt * 20);
    o.rotation.y = p.rot;
    if (p.fx === "phone" || p.fx === "slipper") o.rotation.y += performance.now() / 60;
  });
  for (const [id, o] of projViews) if (!seen.has(id)) { scene.remove(o); projViews.delete(id); }
}

// ---------------------------------------------------------------- effects
function burst(x: number, y: number, z: number, n: number, colors: number[], speed: number, life: number, size = 0.15, gravity = 14) {
  const geo = new THREE.BoxGeometry(size, size, size * 0.3);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
    m.position.set(x, y, z);
    scene.add(m);
    const vel = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
    tweens.push({ t: 0, dur: life * (0.6 + Math.random() * 0.4), fn: (k, dt) => { vel.y -= gravity * dt; m.position.addScaledVector(vel, dt); m.rotation.x += dt * 8; (m.material as THREE.MeshBasicMaterial).opacity = 1 - k; }, end: () => scene.remove(m) });
  }
}
function ring(x: number, z: number, r: number, color: number, dur = 0.6, delay = 0, fill = 0.35) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false }));
  const edge = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  disc.rotation.x = edge.rotation.x = -Math.PI / 2;
  g.add(disc, edge);
  g.position.set(x, 0.08, z);
  scene.add(g);
  if (delay) tweens.push({ t: 0, dur: delay, fn: k => { disc.scale.setScalar(k); } });
  setTimeout(() => tweens.push({ t: 0, dur, fn: k => { (disc.material as THREE.MeshBasicMaterial).opacity = fill * (1 - k); (edge.material as THREE.MeshBasicMaterial).opacity = 1 - k; g.scale.setScalar(1 + k * 0.15); }, end: () => scene.remove(g) }), delay * 1000);
  return g;
}
function sprite3d(text: string, x: number, y: number, z: number, color = "#ffd400", dur = 1.5, scale = 1) {
  const s = textSprite(text, color, 72);
  s.scale.multiplyScalar(scale);
  s.position.set(x, y, z);
  scene.add(s);
  tweens.push({ t: 0, dur, fn: k => { s.position.y = y + k * 1.5; s.material.opacity = 1 - k * k; const p = k < 0.15 ? k / 0.15 : 1; s.scale.set(4 * scale * p, scale * p, 1); }, end: () => scene.remove(s) });
}
function floatText(id: string, text: string, cls: string) {
  const v = views.get(id);
  if (!v || !v.vis) return;
  _v.set(v.x + (Math.random() - 0.5) * 0.8, 2.2, v.z).project(camera);
  if (_v.z > 1) return;
  const el = h(`<div class="float ${cls}">${esc(text)}</div>`);
  el.style.left = `${((_v.x + 1) / 2) * innerWidth}px`;
  el.style.top = `${((1 - _v.y) / 2) * innerHeight}px`;
  document.getElementById("bars")!.append(el);
  setTimeout(() => el.remove(), 1800);
}
function focus(x: number, z: number, sec: number) { focusOverride = { x, z, until: performance.now() / 1000 + sec }; }
function distToMe(x: number, z: number) { const v = views.get(me); return v ? Math.hypot(v.x - x, v.z - z) : 0; }
const spatial = (x: number, z: number) => Math.max(0.1, 1 - distToMe(x, z) / 40);

function onFx(m: any) {
  const v = m.id ? views.get(m.id) : undefined;
  if (m.champ && m.slot !== undefined) v?.rig?.anim?.shot("spell", m.slot); // doCast fx
  const x = m.x ?? v?.x ?? 0, z = m.z ?? v?.z ?? 0, vol = spatial(x, z);
  const col = m.color ?? 0xffffff;
  const dir = () => { const dx = m.tx - x, dz = m.tz - z, l = Math.hypot(dx, dz) || 1; return { dx: dx / l, dz: dz / l, l }; };
  const aoeAt = () => { const { dx, dz, l } = dir(); const d = m.range ? Math.min(l, m.range) : 0; return { cx: x + dx * d, cz: z + dz * d }; };
  switch (m.k) {
    case "cone": case "vomit": case "tentacle": {
      const { dx, dz } = dir();
      const len = m.range ?? 5, ang = ((m.r ?? 45) * Math.PI) / 180;
      const geo = new THREE.CircleGeometry(len, 24, -ang / 2, ang);
      const c = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = Math.atan2(-dz, dx);
      c.position.set(x, 0.1, z);
      scene.add(c);
      tweens.push({ t: 0, dur: 0.6, fn: k => { (c.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k); }, end: () => scene.remove(c) });
      if (m.k === "vomit") { burst(x, 1.4, z, 30, [0xb5c43a, 0x8a9a20, 0xd9e070], 6, 0.8, 0.18, 8); sfx("fire", vol); speak("Buaaaargh", { rate: 0.6, pitch: 0.3 }); }
      else sfx("fire", vol);
      break;
    }
    case "trap": case "sneaker": case "oil": case "party": case "flask": {
      const { cx, cz } = aoeAt();
      ring(cx, cz, m.r ?? 2, col, m.k === "party" ? 2 : 1.2, m.delay ?? 0);
      if (m.k === "party") { burst(cx, 1, cz, 40, [0xff3cac, 0xffe03c, 0x3cf0ff, 0xd46bff], 6, 2, 0.12, 2); sfx("gospel", vol); }
      if (m.k === "sneaker") sprite3d("👟", cx, 1, cz, "#fff", 1.2, 0.7);
      sfx("slam", vol * 0.5);
      break;
    }
    case "tibbers": {
      const { cx, cz } = aoeAt();
      ring(cx, cz, m.r, 0xff4a1a, 1.4);
      const bear = new THREE.Group();
      const b = mesh(new THREE.SphereGeometry(1.1, 12, 10), 0x5a3a2a); b.position.y = 1.2; bear.add(b);
      const hd = mesh(new THREE.SphereGeometry(0.6, 10, 8), 0x5a3a2a); hd.position.set(0, 2.5, 0.2); bear.add(hd);
      for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.2, 8, 6), 0x5a3a2a); e.position.set(0.4 * s, 3, 0.1); bear.add(e); }
      bear.position.set(cx, 8, cz);
      scene.add(bear);
      tweens.push({ t: 0, dur: 4, fn: k => { bear.position.y = Math.max(0, 8 - k * 60); }, end: () => scene.remove(bear) });
      burst(cx, 0.5, cz, 40, [0xff7a1a, 0xffd400, 0xff3c1a], 10, 1);
      sfx("boom", vol);
      speak("¡Tibbers!", { pitch: 1.6 });
      break;
    }
    case "disco": {
      const { cx, cz } = aoeAt();
      ring(cx, cz, m.r, 0xffffff, 2, m.delay);
      const ball = mesh(new THREE.IcosahedronGeometry(1.2, 1), 0xdddddd, { emissive: 0x444444 });
      ball.position.set(cx, 14, cz);
      scene.add(ball);
      tweens.push({ t: 0, dur: 3.5, fn: k => { ball.position.y = Math.max(4, 14 - k * 40); ball.rotation.y += 0.1; }, end: () => scene.remove(ball) });
      setTimeout(() => burst(cx, 4, cz, 60, [0xffffff, 0xff3cac, 0x3cf0ff, 0xffe03c], 10, 1.5, 0.15, 4), 600);
      sfx("gospel", vol);
      break;
    }
    case "spotlight": {
      if (!v) break;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 12, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(0, 6, 0);
      v.obj.add(beam);
      setTimeout(() => v.obj.remove(beam), 2500);
      break;
    }
    case "shirtless":
      if (v) v.shirtless = performance.now() / 1000 + 10;
      ring(x, z, m.r, 0xfff1c0, 1.2);
      burst(x, 1.5, z, 20, [0xf1f1e0, 0xffffff], 8, 1.5, 0.3);
      sfx("slam", vol);
      break;
    case "spin": case "slam": case "boom": case "healzone": case "gas": {
      const r = m.r ?? 3;
      const c = m.k === "healzone" ? 0x55ff88 : m.k === "gas" ? 0xa0ff40 : col;
      const { cx, cz } = m.k === "spin" || m.tx === undefined ? { cx: x, cz: z } : m.k === "slam" && m.slot !== undefined ? { cx: x, cz: z } : aoeAt();
      ring(cx, cz, r, c, m.k === "gas" ? 2 : 0.7);
      if (m.k === "boom") {
        burst(cx, 1, cz, 40, [0xffaa00, 0xff4400, 0xffffff], 12, 1);
        sprite3d(m.text ?? ["¡¡BOOM!!", "¡¡ZASCA!!", "¡¡CATAPLOF!!", "¡¡PATAPUM!!"][Math.floor(Math.random() * 4)], cx, 3, cz, "#ffd400", 1.8, 1.2);
        sfx("boom", vol);
      } else if (m.k === "gas") { burst(cx, 0.5, cz, 30, [0xa0ff40, 0xd0ff90], 3, 2, 0.4, 0); sprite3d("😭 GAS", cx, 2, cz, "#a0ff40"); }
      else if (m.k === "healzone") { burst(cx, 0.3, cz, 20, [0x55ff88, 0xffffff], 4, 1, 0.12, -4); sfx("levelup", vol * 0.5); }
      else sfx(m.k === "spin" ? "fire" : "slam", vol);
      break;
    }
    case "smoke": for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random(), 8, 6), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.6, depthWrite: false })); s.position.set(x + (Math.random() - 0.5) * 3, 0.8 + Math.random(), z + (Math.random() - 0.5) * 3); scene.add(s); tweens.push({ t: 0, dur: 3, fn: k => { (s.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k); s.scale.setScalar(1 + k); }, end: () => scene.remove(s) }); } sfx("fire", vol); break;
    case "blink": case "warp": burst(x, 1, z, 20, [col, 0xffffff], 5, 0.6, 0.12, 0); if (m.tx !== undefined) burst(m.tx, 1, m.tz, 20, [col, 0xffffff], 5, 0.6, 0.12, 0); sfx("pew", vol); break;
    case "roll": case "dash": case "moonwalk": case "god": case "shield": case "badge": case "sheet": case "swap": case "disguise": case "rune": case "fire": case "sword": case "taunt": case "snipe": case "torpedo": case "envelope": case "phone": case "bolt": case "beam": case "wave":
      if (m.k === "moonwalk") burst(x, 1, z, 30, [0xff3cac, 0xffe03c, 0x3cf0ff], 6, 1.2, 0.1);
      if (m.k === "god") { sfx("gospel", vol); if (v) sprite3d("I AM A GOD", x, 3.5, z, "#ffe04a", 2); }
      if (m.k === "shield" || m.k === "badge") ring(x, z, 1.3, col, 0.5);
      if (m.k === "badge") sprite3d("🚔 ¡ALTO!", x, 3, z, "#ffd400");
      if (m.k === "torpedo") { sprite3d("¡¡MORTADELOOOO!!", x, 3.5, z, "#ff4040", 2); speak("¡Mortadelooo!", { pitch: 1.3, rate: 1.2 }); }
      if (m.k === "snipe" || m.k === "sword" || m.k === "fire" || m.k === "rune") { const tv = views.get(nearestView(m.tx, m.tz)); if (tv) burst(tv.x, 1.2, tv.z, 16, [col, 0xffffff], 5, 0.5); }
      sfx(["sword", "snipe"].includes(m.k) ? "hit" : m.k === "fire" ? "fire" : "pew", vol);
      break;
    case "feathers": burst(x, 0.7, z, m.big ? 40 : 18, [0xffffff, 0xeeeeee, 0xd9a441, 0xc8a060], 5, 1.6, 0.14, 3); sfx("coo", vol * 0.6); break;
    case "levelup": if (v) ring(v.x, v.z, 1.3, 0xffd400, 0.8); if (m.id === me) sfx("levelup"); break;
    case "recall": if (v) ring(v.x, v.z, 1.2, 0x4aa8ff, 8, 0, 0.15); break;
    case "text": floatText(m.id, m.text, "txt"); break;
    case "fakedeath": {
      const u = R.state.units.get(m.id);
      if (u) { const decoy = champModel(u.champ, champ(u.champ).color, 0).root; decoy.position.set(x, 0.3, z); decoy.rotation.x = -Math.PI / 2; scene.add(decoy); setTimeout(() => scene.remove(decoy), 3500); }
      sprite3d("💀 RIP", x, 2.5, z, "#fff", 2.5);
      break;
    }
    case "stonks": if (v) { burst(v.x, 2, v.z, 30, [0x2e9e4f, 0x7cff7c], 5, 2, 0.3, 2); sprite3d("📈 STONKS", v.x, 3, v.z, "#7cff7c"); } sfx("stonks", vol); break;
    case "drake": if (v && v.vis) { showOver(m.id, `<div class="drake"><div>🙅‍♂️</div><span>NO (onda expansiva)</span><div>👍</div><span>SÍ (+20% omnivamp)</span></div>`); sfx("boom", vol * 0.5); } break;
    case "pressf": if (v) sprite3d("🇫", v.x, 3, v.z, "#fff", 2); break;
    case "fine": if (v) { sprite3d("☕🔥 This is fine", v.x, 3, v.z, "#ff9a3c", 2); burst(v.x, 1, v.z, 20, [0xff7a1a, 0xffd400], 3, 1.5, 0.15, -3); } break;
    case "buy": if (m.id === me) sfx("buy"); break;
    case "bell": sfx("bell", vol * 0.35); break;
    case "spell": onSpellFx(m, vol); break;
    default: if (m.tx !== undefined && m.r) ring(m.tx, m.tz, m.r, col);
  }
}
function onSpellFx(m: any, vol: number) {
  const x = m.x, z = m.z;
  switch (m.spell) {
    case "flash": burst(x, 1, z, 20, [0xffe04a, 0xffffff], 6, 0.5, 0.12, 0); sfx("pew", vol); break;
    case "heal": ring(x, z, 2, 0x55ff88); sfx("levelup", vol * 0.6); break;
    case "barrier": ring(x, z, 1.4, 0xffd400); break;
    case "ghost": burst(x, 1, z, 12, [0xbbbbff], 3, 1, 0.2, -2); break;
    case "ignite": sfx("fire", vol); break;
    case "revive": sprite3d("⚰️ ¡RESUCITADO!", x, 3, z, "#fff"); break;
    case "siesta": sprite3d("😴 Siesta", x, 3, z, "#9fd8ff"); break;
    case "rocket": sprite3d("🚀 ¡COHETE!", x, 3, z, "#ff7a1a"); { const dx = m.tx - x, dz = m.tz - z, l = Math.hypot(dx, dz) || 1; for (let i = 0; i < 15; i++) setTimeout(() => burst(x + (dx / l) * i, 0.3, z + (dz / l) * i, 6, [0xff7a1a, 0xffd400, 0xff3c1a], 2, 1.2, 0.2, -2), i * 28); } sfx("firework", vol); break;
    case "punch": sfx("slam", vol); break;
    case "teleport": ring(x, z, 1.2, 0xb05aff, 3); break;
  }
}
function nearestView(x: number, z: number) {
  let best = "", bd = 3;
  for (const [id, v] of views) { const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = id; } }
  return best;
}
function showOver(id: string, html: string) {
  const v = views.get(id);
  if (!v) return;
  _v.set(v.x, 3, v.z).project(camera);
  const el = h(html);
  el.style.left = `${((_v.x + 1) / 2) * innerWidth}px`;
  el.style.top = `${((1 - _v.y) / 2) * innerHeight}px`;
  document.getElementById("bars")!.append(el);
  setTimeout(() => el.remove(), 2500);
}

// ---------------------------------------------------------------- messages
const ANN: Record<number, string> = { 2: "¡Doblete que te crió!", 3: "¡TRIPLE KILL, QUE TE CAGAS!", 4: "¡Madre de Dios, cuatro al hoyo!", 5: "¡¡PENTAKILL!! Esto no me lo creo ni yo, macho... ¡¡A celebrarlo al puticlub!!" };
const KILLNAME: Record<number, string> = { 2: "¡DOBLETE!", 3: "¡TRIPLE KILL!", 4: "¡CUÁDRUPLE!", 5: "¡¡PENTAKILL!!" };
function bindMessages() {
  R.onMessage("fx", onFx);
  R.onMessage("dmg", m => floatText(m.id, String(m.v), m.crit ? "crit" : m.t));
  R.onMessage("gold", m => floatText(me, `+${m.v} 🪙`, "gold"));
  R.onMessage("voice", m => speak(m.text, { lang: /[a-z] A GOD/i.test(m.text) || m.text.startsWith("I ") ? "en-US" : "es-ES", pitch: 0.6 }));
  R.onMessage("relic", m => {
    const r = RELICS[m.i];
    sfx("tsss", spatial(r.x, r.z));
    sprite3d("¡TSSSS! 🍺", r.x, 2.5, r.z, "#f2a515");
    if (m.id === me && m.chain >= 3) { wobbleUntil = performance.now() / 1000 + 6; announce("🍺🍺🍺 Vas un poco pedo...", "small"); }
  });
  R.onMessage("ping", m => {
    const p = PINGS[m.type] ?? PINGS.danger;
    sfx(p.sound);
    const s = textSprite(p.icon, p.color, 90);
    s.position.set(m.x, 2.5, m.z);
    scene.add(s);
    ring(m.x, m.z, 1.5, parseInt(p.color.slice(1), 16), 2);
    setTimeout(() => scene.remove(s), 2500);
    pingMarks.push({ x: m.x, z: m.z, color: p.color, until: performance.now() + 3000 });
    addFeed(`${esc(m.from)}: ${p.icon} ${p.label}`, p.color);
  });
  R.onMessage("emote", m => {
    showOver(m.id, `<div class="emote">${EMOTES[m.e] ?? "❓"}</div>`);
    if (m.e === "pigeon") sfx("coo");
  });
  R.onMessage("announce", m => {
    announce(m.text);
    if (m.sound === "mercadona") { sfx("jingle"); speak("¡Mercadoooona, Mercadona!", { rate: 0.8, pitch: 1.1 }); }
    else if (m.sound === "beef") { const el = h(`<div class="beef">¡BEEF DETECTED!</div>`); document.body.append(el); setTimeout(() => el.remove(), 3000); sfx("boom"); }
    else sfx("bell");
  });
  R.onMessage("kill", onKill);
  R.onMessage("end", m => {
    const win = m.winner === myTeam;
    announce(win ? "¡VICTORIA!" : "DERROTA");
    if (win) sfx("fanfare");
  });
}
let pingMarks: { x: number; z: number; color: string; until: number }[] = [];

export function onChat(m: any) {
  if (!hud.chatlog) return;
  hud.chatlog.append(h(`<div>${m.sys ? `<i style="color:#ffd400">${esc(m.text)}</i>` : `<b style="color:${m.team ? "#ff8a8a" : "#7ab8ff"}">${esc(m.from)}:</b> ${esc(m.text)}`}</div>`));
  while (hud.chatlog.children.length > 12) hud.chatlog.firstChild!.remove();
}

function onKill(m: any) {
  const kTeam = m.team, mine = kTeam === myTeam;
  addFeed(`${m.killerChamp ? ICONS[m.killerChamp]?.[4] ?? "" : "🐦"} ${esc(m.killerName)} ⚔️ ${esc(m.victimName)}`, mine ? "#3a8cff" : "#ff4545");
  // firecrackers and confetti
  for (let i = 0; i < 6; i++) setTimeout(() => { burst(m.x + (Math.random() - 0.5) * 2, 1, m.z + (Math.random() - 0.5) * 2, 15, [0xff3cac, 0xffe03c, 0x3cf0ff, 0xff3c3c, 0x7cff7c], 8, 1.2, 0.12); sfx("firework", spatial(m.x, m.z) * 0.7); }, i * 120);
  let line = "";
  if (m.first) line = "¡PRIMERA SANGRE, CHAVAL! ¡A ver si espabilamos!";
  else if (m.multi >= 2) line = ANN[Math.min(5, m.multi)];
  else if (m.victim === me) line = "";
  else if (!mine) line = "Vaya paquete te has buscao...";
  else line = "¡Uno menos, chaval!";
  if (m.multi >= 2) { announce(KILLNAME[Math.min(5, m.multi)]); screenFireworks(m.multi * 6); }
  else if (m.first) announce("¡PRIMERA SANGRE!");
  if (line) speak(line, { pitch: 0.55, rate: 1.1 });
  if (m.multi === 5 && m.killerChamp === "torrente" && R.state.banter) {
    stopMusic();
    speechSynthesis.cancel();
    sfx("fanfare");
    setTimeout(() => { speak(ANN[5], { pitch: 0.5 }); startMusic(); }, 3500);
  }
  if (m.victim === me) {
    slowmoUntil = performance.now() / 1000 + 2.5;
    document.getElementById("gl")!.classList.add("dead");
    sfx("wasted");
    const w = h(`<div class="death nopoint"><div class="wasted">WASTED</div></div>`);
    hud.score.before(w); // inside the HUD, under the Tab scoreboard
    setTimeout(() => w.remove(), 3500);
  }
}
function screenFireworks(n: number) {
  const fw = h(`<div class="fireworks"></div>`);
  document.body.append(fw);
  for (let b = 0; b < n; b++) setTimeout(() => {
    const x = Math.random() * innerWidth, y = Math.random() * innerHeight * 0.6, col = `hsl(${Math.random() * 360},100%,60%)`;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = 60 + Math.random() * 80; fw.append(h(`<i style="left:${x}px;top:${y}px;background:${col};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px"></i>`)); }
    sfx("firework", 0.6);
  }, b * 180);
  setTimeout(() => fw.remove(), n * 180 + 1600);
}
function announce(text: string, cls = "") {
  if (!hud.announce) return;
  const el = h(`<div class="${cls}">${esc(text)}</div>`);
  hud.announce.innerHTML = "";
  hud.announce.append(el);
}
function addFeed(html: string, color: string) {
  if (!hud.feed) return;
  const el = h(`<div style="border-color:${color}">${html}</div>`);
  hud.feed.append(el);
  setTimeout(() => el.remove(), 8000);
}

// ---------------------------------------------------------------- input
function groundAt(cx: number, cy: number) {
  mouse.ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse.ndc, camera);
  const p = new THREE.Vector3();
  ray.ray.intersectPlane(ground, p);
  return p;
}
function hoverAt(cx: number, cy: number) {
  let best: string | undefined, bd = Infinity;
  for (const [id, v] of views) {
    if (v.team === myTeam || v.team === 2 || !v.vis || v.dead) continue;
    const u = R.state.units.get(id);
    if (!u || u.untargetable) continue;
    const H = v.kind === "champ" ? 1 : v.kind === "tower" ? 3 : v.kind === "nexus" ? 1.5 : 0.5;
    _v.set(v.x, H, v.z).project(camera);
    const px = ((_v.x + 1) / 2) * innerWidth, py = ((1 - _v.y) / 2) * innerHeight;
    const r = v.kind === "champ" ? 45 : ["tower", "nexus", "inhib"].includes(v.kind) ? 80 : 28;
    const d = Math.hypot(px - cx, py - cy);
    if (d < r && d < bd) { bd = d; best = id; }
  }
  return best;
}

function bindInput() {
  const cv = document.getElementById("gl")!;
  cv.oncontextmenu = e => e.preventDefault();
  cv.onmousemove = e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.world.copy(groundAt(e.clientX, e.clientY));
    hovered = hoverAt(e.clientX, e.clientY);
    cv.style.cursor = hovered ? "crosshair" : "default";
  };
  cv.onmousedown = e => {
    if (hud.wheel.style.display !== "none") { hud.wheel.style.display = "none"; return; }
    const p = groundAt(e.clientX, e.clientY);
    if (e.button === 0 && e.altKey) return sendPing("danger", p);
    if (e.button !== 2) return;
    const t = hoverAt(e.clientX, e.clientY);
    if (t) R.send("attack", { id: t });
    else { R.send("move", { x: p.x, z: p.z }); clickMarker(p); }
  };
  let dragging = false;
  cv.addEventListener("mousedown", e => { if (e.button === 2) dragging = true; });
  window.addEventListener("mouseup", () => dragging = false);
  let lastDrag = 0;
  cv.addEventListener("mousemove", e => {
    if (!dragging || performance.now() - lastDrag < 120 || hovered) return;
    lastDrag = performance.now();
    const p = groundAt(e.clientX, e.clientY);
    R.send("move", { x: p.x, z: p.z });
  });
  cv.onwheel = e => { camZoom = Math.max(0.6, Math.min(1.5, camZoom + Math.sign(e.deltaY) * 0.08)); };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
}
function clickMarker(p: THREE.Vector3) {
  ring(p.x, p.z, 0.5, 0x40ff80, 0.4, 0, 0.1);
}
function sendPing(type: string, p = mouse.world) { R.send("ping", { x: p.x, z: p.z, type }); }

function onKey(e: KeyboardEvent) {
  if (!alive) return;
  const k = e.key.toLowerCase();
  if (chatOpen) {
    if (e.key === "Escape") closeChat();
    return;
  }
  if (e.key === "Enter") { e.preventDefault(); return openChat(); }
  if (e.key === "Tab") { e.preventDefault(); hud.score.style.display = ""; renderScore(); return; }
  if (e.key === "Escape") { if (shopOpen) return toggleShop(); menuOpen = !menuOpen; hud.menu.style.display = menuOpen ? "" : "none"; hud.wheel.style.display = "none"; return; }
  if (keysDown.has(k)) return;
  keysDown.add(k);
  const p = mouse.world;
  const slot = "qwer".indexOf(k);
  if (slot >= 0) return R.send("cast", { slot, x: p.x, z: p.z, id: hovered });
  if (k === "d" || k === "f") return R.send("spell", { slot: k === "d" ? 0 : 1, x: p.x, z: p.z, id: hovered });
  if (k === "b") return R.send("recall");
  if (k === "s") return R.send("stop");
  if (k === "p") return toggleShop();
  if (k === "c") { statsOpen = !statsOpen; hud.stats.classList.toggle("hide", !statsOpen); return; }
  if (k === "t") { hud.wheel.style.display = ""; hud.wheel.style.left = `${mouse.x}px`; hud.wheel.style.top = `${mouse.y}px`; return; }
  const pingKey = { z: "danger", x: "omw", v: "assist", g: "missing" }[k];
  if (pingKey) return sendPing(pingKey);
  if (k === "y" || k === " ") { const v = views.get(me); if (v) focus(v.x, v.z, 0); }
}
function onKeyUp(e: KeyboardEvent) {
  keysDown.delete(e.key.toLowerCase());
  if (e.key === "Tab") hud.score.style.display = "none";
}
function openChat() { chatOpen = true; hud.chat.classList.add("open"); hud.chatlog.classList.add("open"); const i = hud.chat.querySelector("input")!; i.focus(); }
function closeChat() { chatOpen = false; hud.chat.classList.remove("open"); hud.chatlog.classList.remove("open"); (hud.chat.querySelector("input") as HTMLInputElement).blur(); }
function toggleShop() { shopOpen = !shopOpen; hud.shop.style.display = shopOpen ? "" : "none"; if (shopOpen) renderShop(); }

// ---------------------------------------------------------------- HUD
function buildHud() {
  const u = myUnit();
  const c = champ(u?.champ ?? "ezreal");
  const el = h(`<div class="hud">
    <div class="topbar nopoint"><span class="b" id="sb">0</span><span>⚔️</span><span class="r" id="sr">0</span><span id="clock">00:00</span></div>
    <div class="merc nopoint" id="merc" style="display:none">🛒 MERCADONA — canaliza la puerta 5s o usa Smite<div class="bar"><i class="b" id="mb"></i></div><div class="bar"><i class="r" id="mr"></i></div></div>
    <div class="announce nopoint" id="announce"></div>
    <div class="feed nopoint" id="feed"></div>
    <div class="hudchat" id="chat"><div class="log nopoint" id="chatlog"></div><input class="field" maxlength="200" placeholder="Enter para enviar · Esc para cerrar"></div>
    <div class="channel nopoint" id="channel" style="display:none"><span id="chlabel"></span><div class="bar"><i id="chbar"></i></div></div>
    <div class="respawn nopoint" id="respawn" style="left:50%;transform:translateX(-50%);display:none"></div>
    <div class="bottom">
      <div class="frame">
        <div class="stats ${statsOpen ? "" : "hide"}" id="stats"></div>
        <div class="portrait" style="background-image:url(${splash(c.id)})"><div class="xp" id="xp"></div><div class="lvl" id="lvl">1</div></div>
        <div class="mid">
          <div class="abil">
            <div class="slotb passive" title="${esc(c.passive.name)}: ${esc(c.passive.desc)}">${ICONS[c.id][4]}</div>
            ${c.abilities.map((a, i) => `<div><div class="slotb" id="ab${i}" title="${esc(a.name)}: ${esc(a.desc)}">${ICONS[c.id][i]}<span class="cost">${a.mana || ""}</span><span class="key">${"QWER"[i]}</span><div class="cdw"></div></div><div class="pips" id="pip${i}"></div></div>`).join("")}
            ${[0, 1].map(i => `<div class="slotb small" id="sp${i}" title="${SPELLS[i ? u.spellF : u.spellD]?.name}: ${esc(SPELLS[i ? u.spellF : u.spellD]?.desc ?? "")}">${SPELLS[i ? u.spellF : u.spellD]?.icon}<span class="key">${"DF"[i]}</span><div class="cdw"></div></div>`).join("")}
          </div>
          <div class="bars"><div class="bar h"><i id="hpb"></i><s id="shb"></s><span id="hpt"></span></div><div class="bar m"><i id="mpb"></i><span id="mpt"></span></div></div>
        </div>
        <div><div class="items" id="items"></div><div class="gold" id="gold" title="Tienda (P)">🪙 0</div></div>
      </div>
    </div>
    <canvas class="minimap" id="mm" width="200" height="200"></canvas>
    <div class="panel scoreboard" id="score" style="display:none"></div>
    <div class="panel shop" id="shop" style="display:none"></div>
    <div class="panel menu" id="menu" style="display:none">
      <h2>Menú</h2>
      <label>Volumen general <input type="range" min="0" max="1" step="0.05" value="${vol.master}" data-v="master"></label>
      <label>Efectos <input type="range" min="0" max="1" step="0.05" value="${vol.sfx}" data-v="sfx"></label>
      <label>Música <input type="range" min="0" max="1" step="0.05" value="${vol.music}" data-v="music"></label>
      <label>Banda sonora</label>
      <div class="seg" id="mmode"><button data-m="champion" class="${music.mode === "champion" ? "on" : ""}">Tema del campeón</button><button data-m="ambient" class="${music.mode === "ambient" ? "on" : ""}">Ambiente generativo</button><button data-m="off" class="${music.mode === "off" ? "on" : ""}">Off</button></div>
      <p class="kit" style="margin-top:12px">Clic derecho: mover/atacar · QWER: habilidades · D/F: hechizos · B: volver a base · P: tienda · TAB: marcador · T: emotes · Z/X/V/G: pings · Alt+clic: peligro · C: estadísticas · Enter: chat · Rueda: zoom</p>
      <div class="row"><button class="btn" id="resume">Continuar</button><button class="btn" id="quit">Abandonar partida</button></div>
    </div>
    <div class="wheel" id="wheel" style="display:none">${Object.entries(EMOTES).map(([k, e], i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return `<button data-e="${k}" style="left:${130 + Math.cos(a) * 90}px;top:${130 + Math.sin(a) * 90}px">${e.slice(0, 2)}</button>`; }).join("")}</div>
  </div>`);
  const app = document.getElementById("app")!;
  app.innerHTML = "";
  app.append(el);
  el.querySelectorAll<HTMLElement>("[id]").forEach(x => hud[x.id] = x);
  for (const m of chatLogRef.slice(-6)) onChat(m);
  const input = hud.chat.querySelector("input")!;
  input.onkeydown = e => {
    if (e.key === "Enter") { if (input.value.trim()) R.send("chat", { text: input.value }); input.value = ""; closeChat(); }
    e.stopPropagation();
    if (e.key === "Escape") closeChat();
  };
  hud.gold.onclick = toggleShop;
  hud.wheel.querySelectorAll<HTMLElement>("button").forEach(b => b.onclick = e => { e.stopPropagation(); R.send("emote", { e: b.dataset.e }); hud.wheel.style.display = "none"; });
  hud.menu.querySelectorAll<HTMLInputElement>("input[type=range]").forEach(r => r.oninput = () => { (vol as any)[r.dataset.v!] = +r.value; applyVolume(); });
  hud.mmode.querySelectorAll<HTMLElement>("button").forEach(b => b.onclick = () => { hud.mmode.querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); music.mode = b.dataset.m as any; startMusic(); });
  hud.resume.onclick = () => { menuOpen = false; hud.menu.style.display = "none"; };
  hud.quit.onclick = () => { if (confirm("¿Abandonar? Tu equipo te odiará.")) R.leave(); };
  hud.mm.oncontextmenu = e => e.preventDefault();
  hud.mm.onmousedown = e => { const p = fromMinimap(e.offsetX, e.offsetY); if (e.button === 2) R.send("move", p); else if (e.altKey) sendPing("danger", new THREE.Vector3(p.x, 0, p.z)); else focus(p.x, p.z, 2); };
  hud.items.oncontextmenu = e => e.preventDefault();
}

// Minimap: lane drawn diagonally, own base always bottom-left (like LoL ARAM).
const MM = { L: 160 * Math.SQRT2, k: 3 };
function toMinimap(x: number, z: number) {
  const along = (x * flip + 66) / 132, perp = z * flip * MM.k;
  return { px: 20 + along * 160 + perp * Math.SQRT1_2, py: 180 - along * 160 + perp * Math.SQRT1_2 };
}
function fromMinimap(px: number, py: number) {
  const vx = px - 20, vy = py - 180;
  const along = (vx - vy) * Math.SQRT1_2 / MM.L, perp = (vx + vy) * Math.SQRT1_2 / MM.k;
  return { x: (along * 132 - 66) * flip, z: perp * flip };
}
function drawMinimap() {
  const cv = hud.mm as HTMLCanvasElement, c = cv.getContext("2d")!;
  c.fillStyle = "#0b1020"; c.fillRect(0, 0, 200, 200);
  c.save();
  c.translate(20, 180); c.rotate(-Math.PI / 4);
  c.fillStyle = "#6e6a78"; c.fillRect(-8, -9 * MM.k, MM.L + 16, 18 * MM.k);
  c.restore();
  const now = performance.now();
  R.state.units.forEach((u: any, id: string) => {
    if (u.dead && u.kind !== "nexus") return;
    const v = views.get(id);
    if (v && !v.vis) return;
    if (u.kind === "champ" && u.team !== myTeam && u.rune === "amogus" && u.fx.includes("amogus")) return;
    const { px, py } = toMinimap(u.x, u.z);
    const col = u.team === 2 ? "#2e9e4f" : u.team === myTeam ? "#3a8cff" : "#ff4545";
    c.fillStyle = col;
    if (u.kind === "champ") { c.beginPath(); c.arc(px, py, 6, 0, 7); c.fill(); c.strokeStyle = id === me ? "#ffd400" : "#000"; c.lineWidth = 2; c.stroke(); }
    else if (["tower", "inhib", "nexus", "mercadona"].includes(u.kind)) { c.fillRect(px - 5, py - 5, 10, 10); c.strokeStyle = "#000"; c.strokeRect(px - 5, py - 5, 10, 10); }
    else c.fillRect(px - 1.5, py - 1.5, 3, 3);
  });
  pingMarks = pingMarks.filter(p => p.until > now);
  for (const p of pingMarks) { const { px, py } = toMinimap(p.x, p.z); c.strokeStyle = p.color; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 6 + ((now / 60) % 10), 0, 7); c.stroke(); }
}

let hudT = 0;
function updateHud() {
  const u = myUnit();
  if (!u) return;
  const c = champ(u.champ);
  // death state
  if (u.dead !== lastDeadState) { lastDeadState = u.dead; if (!u.dead) document.getElementById("gl")!.classList.remove("dead"); }
  hud.respawn.style.display = u.dead ? "" : "none";
  if (u.dead) hud.respawn.textContent = `Reapareces en ${Math.ceil(u.respawn)}s${u.spellD === "revive" || u.spellF === "revive" ? ` · pulsa ${u.spellD === "revive" ? "D" : "F"} para Revivir` : " · compra en la tienda (P)"}`;
  // abilities
  for (let i = 0; i < 4; i++) {
    const el = hud["ab" + i], cd = u.cds.at(i) ?? 0, a = c.abilities[i];
    const locked = i === 3 && u.level < 6;
    el.classList.toggle("locked", locked);
    el.classList.toggle("nomana", !locked && u.mana < a.mana);
    el.classList.toggle("ready", !locked && cd <= 0);
    const w = el.querySelector(".cdw") as HTMLElement;
    w.style.setProperty("--cd", cd > 0 ? `${(cd / a.cd) * 100}%` : "0%");
    w.textContent = cd > 0 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : "";
    const rank = i === 3 ? (u.level >= 16 ? 3 : u.level >= 11 ? 2 : u.level >= 6 ? 1 : 0) : Math.min(5, 1 + Math.floor((u.level - 1) / 3.4));
    const max = i === 3 ? 3 : 5;
    const pk = `${rank}`;
    if (hud["pip" + i].dataset.k !== pk) { hud["pip" + i].dataset.k = pk; hud["pip" + i].innerHTML = Array.from({ length: max }, (_, j) => `<i class="${j < rank ? "on" : ""}"></i>`).join(""); }
  }
  for (let i = 0; i < 2; i++) {
    const cd = u.scds.at(i) ?? 0, key = i ? u.spellF : u.spellD, w = hud["sp" + i].querySelector(".cdw") as HTMLElement;
    w.style.setProperty("--cd", cd > 0 ? `${(cd / SPELLS[key].cd) * 100}%` : "0%");
    w.textContent = cd > 0 ? String(Math.ceil(cd)) : "";
  }
  const total = Math.max(u.maxHp, u.hp + u.shield);
  hud.hpb.style.width = `${(u.hp / total) * 100}%`;
  hud.shb.style.left = `${(u.hp / total) * 100}%`;
  hud.shb.style.width = `${(u.shield / total) * 100}%`;
  hud.hpt.textContent = `${Math.round(u.hp)} / ${Math.round(u.maxHp)}${u.shield ? ` (+${Math.round(u.shield)})` : ""}`;
  hud.mpb.style.width = `${u.maxMana ? (u.mana / u.maxMana) * 100 : 0}%`;
  hud.mpt.textContent = u.maxMana ? `${Math.round(u.mana)} / ${Math.round(u.maxMana)}` : "Sin maná";
  hud.lvl.textContent = u.level;
  hud.xp.style.setProperty("--p", `${u.level >= 18 ? 100 : (u.xp / xpFor(u.level)) * 100}%`);
  // channels
  const channeling = u.recall > 0 ? "🏠 Volviendo a base" : u.fx.includes("siesta") ? "😴 Siesta" : "";
  hud.channel.style.display = channeling ? "" : "none";
  if (channeling) { hud.chlabel.textContent = channeling; hud.chbar.style.width = `${u.recall * 100}%`; }
  // throttled parts
  if ((hudT = (hudT + 1) % 6) !== 0) return;
  hud.gold.textContent = `🪙 ${Math.floor(u.gold)}`;
  const itemsKey = [...u.items].join();
  if (hud.items.dataset.k !== itemsKey) {
    hud.items.dataset.k = itemsKey;
    const its = [...u.items];
    hud.items.innerHTML = Array.from({ length: 6 }, (_, i) => { const it = item(its[i]); return `<div class="slotb" data-i="${i}" title="${it ? `${esc(it.name)}: ${esc(it.desc)} (clic der. para vender)` : ""}">${it?.icon ?? ""}</div>`; }).join("") + `<div class="slotb" title="Baratija: Barra de pan">🥖</div>`;
    hud.items.querySelectorAll<HTMLElement>("[data-i]").forEach(s => s.onmousedown = e => { if (e.button === 2 && its[+s.dataset.i!]) R.send("sell", { idx: +s.dataset.i! }); });
    if (shopOpen) renderShop();
  }
  hud.stats.innerHTML = [["⚔️ AD", u.ad], ["✨ AP", u.ap], ["🛡️ Arm", u.armor], ["🔮 MR", u.mr], ["⚡ AS", u.as.toFixed(2)], ["👟 MS", Math.round(u.ms * 100)], ["🎯 Rango", Math.round(u.range * 100)], ["💀 KDA", `${u.kills}/${u.deaths}/${u.assists}`]].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("");
  const kills = [0, 0];
  R.state.units.forEach((x: any) => { if (x.kind === "champ") kills[x.team] += x.kills; });
  hud.sb.textContent = String(kills[0]); hud.sr.textContent = String(kills[1]);
  const t = Math.floor(R.state.time);
  hud.clock.textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  hud.merc.style.display = R.state.units.get("mercadona") ? "" : "none";
  hud.mb.style.width = `${((R.state.merc.at(0) ?? 0) / 5) * 100}%`;
  hud.mr.style.width = `${((R.state.merc.at(1) ?? 0) / 5) * 100}%`;
  if (merc) merc.rotation.y += 0.002;
  drawMinimap();
  if (hud.score.style.display !== "none") renderScore();
  // teamfight detection drives the generative soundtrack intensity
  let fight = false;
  const mv = views.get(me);
  if (mv) R.state.units.forEach((x: any) => { if (x.kind === "champ" && x.team !== myTeam && !x.dead && Math.hypot(x.x - mv.x, x.z - mv.z) < 12) fight = true; });
  music.fight = fight;
  // bush tarps fade when my champion is inside
  const myBush = mv ? inBush(mv.x, mv.z) : -1;
  bushObjs.forEach((b, i) => { b.mat.opacity = i === myBush ? 0.35 : 0.93; });
}

function renderScore() {
  const rows = (team: number) => {
    let gold = 0;
    const r: string[] = [];
    R.state.units.forEach((u: any, id: string) => {
      if (u.kind !== "champ" || u.team !== team) return;
      gold += u.goldEarned;
      r.push(`<tr style="${id === me ? "background:#c8aa6e22" : ""}"><td><img src="${splash(u.champ)}" width="40" height="30" style="object-fit:cover;vertical-align:middle"> ${esc(u.name)} <small>(${champ(u.champ).name})</small></td><td>${u.level}</td><td>${u.kills}/${u.deaths}/${u.assists}</td><td>${u.cs}</td><td class="it">${[...u.items].map((i: string) => item(i)?.icon).join("")}</td><td>${SPELLS[u.spellD]?.icon}${SPELLS[u.spellF]?.icon} ${RUNES[u.rune]?.icon}</td></tr>`);
    });
    return `<tr><th colspan="6" style="color:${team ? "#ff8a8a" : "#7ab8ff"}">${team ? "PP" : "PSOE"} · 🪙 ${Math.round(gold)}</th></tr><tr><th>Campeón</th><th>Nv</th><th>KDA</th><th>CS</th><th>Objetos</th><th>Hechizos</th></tr>${r.join("")}`;
  };
  hud.score.innerHTML = `<table>${rows(myTeam)}${rows(1 - myTeam)}</table>`;
}

function renderShop() {
  const u = myUnit();
  if (!u) return;
  const near = u.dead || Math.hypot(u.x - side(u.team) * FOUNTAIN_X, u.z) < SHOP_RADIUS + 3;
  hud.shop.innerHTML = `<h2>🏪 El Bazar de Alimentación Chino <small style="font-size:14px;color:#ffd400">🪙 ${Math.floor(u.gold)}</small></h2>
    ${near ? "" : `<p style="color:#ff8a8a">ElChino solo atiende en la base. Vuelve con B.</p>`}
    <div class="tiers">${[1, 2, 3].map(t => `<div><h3>${["", "Básicos", "Avanzados", "Legendarios"][t]}</h3>${ITEMS.filter(i => i.tier === t).map(i => `<div class="icard ${u.gold < i.cost || !near || u.items.length >= 6 ? "no" : ""}" data-id="${i.id}"><span class="ic">${i.icon}</span><div><b>${esc(i.name)}</b><small>${esc(i.desc)}</small><span class="cost">🪙 ${i.cost}</span></div></div>`).join("")}</div>`).join("")}</div>
    <p class="kit">Clic para comprar · clic derecho en tu inventario para vender (70%) · P / Esc para cerrar</p>`;
  hud.shop.querySelectorAll<HTMLElement>(".icard").forEach(c => c.onclick = () => { R.send("buy", { item: c.dataset.id }); setTimeout(renderShop, 150); });
}
