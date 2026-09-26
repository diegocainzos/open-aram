import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  name: t.string().default(""),
  team: t.uint8().default(0),
  champ: t.string().default(""),
  options: t.array("string"), // 1-of-3 choices
  rerolls: t.uint8().default(0),
  spellD: t.string().default("flash"),
  spellF: t.string().default("heal"),
  rune: t.string().default("stonks"),
  loaded: t.uint8().default(0),
  connected: t.boolean().default(true),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Unit = schema({
  kind: t.string().default("champ"), // champ | melee | caster | cannon | super | tower | inhib | nexus | mercadona
  team: t.uint8().default(0), // 0 blue, 1 red, 2 neutral
  champ: t.string().default(""),
  name: t.string().default(""),
  x: t.float32().default(0),
  z: t.float32().default(0),
  rot: t.float32().default(0),
  hp: t.float32().default(1),
  maxHp: t.float32().default(1),
  mana: t.float32().default(0),
  maxMana: t.float32().default(0),
  shield: t.float32().default(0),
  level: t.uint8().default(1),
  xp: t.float32().default(0),
  dead: t.boolean().default(false),
  respawn: t.float32().default(0),
  stealth: t.boolean().default(false),
  untargetable: t.boolean().default(false),
  cc: t.string().default(""), // strongest active cc, for visuals
  fx: t.string().default(""), // comma-separated visual flags: manic,twitter,filemon,siesta,apron,plant,recall,hacendado
  atk: t.uint16().default(0), // increments per basic attack, drives animation
  moving: t.boolean().default(false),
  cds: t.array("float32"),
  scds: t.array("float32"),
  items: t.array("string"),
  gold: t.float32().default(0),
  kills: t.uint16().default(0),
  deaths: t.uint16().default(0),
  assists: t.uint16().default(0),
  cs: t.uint16().default(0),
  ad: t.float32().default(0),
  ap: t.float32().default(0),
  armor: t.float32().default(0),
  mr: t.float32().default(0),
  as: t.float32().default(0),
  ms: t.float32().default(0),
  range: t.float32().default(0),
  recall: t.float32().default(0),
  spellD: t.string().default(""),
  spellF: t.string().default(""),
  rune: t.string().default(""),
  // post-game stats
  dmgDealt: t.float32().default(0),
  dmgTaken: t.float32().default(0),
  goldEarned: t.float32().default(0),
  pings: t.uint16().default(0),
  minionKillsSolo: t.uint16().default(0),
}, "Unit");
export type Unit = SchemaType<typeof Unit>;

export const Projectile = schema({
  x: t.float32().default(0),
  z: t.float32().default(0),
  rot: t.float32().default(0),
  fx: t.string().default("bolt"),
  color: t.uint32().default(0xffffff),
  team: t.uint8().default(0),
}, "Projectile");
export type Projectile = SchemaType<typeof Projectile>;

export const State = schema({
  phase: t.string().default("lobby"), // lobby | select | loading | game | end
  roomName: t.string().default(""),
  host: t.string().default(""),
  mode: t.string().default("3v3"),
  selectMode: t.string().default("aram"),
  banter: t.boolean().default(true),
  mercadona: t.boolean().default(true),
  timer: t.float32().default(0),
  time: t.float32().default(0),
  winner: t.int8().default(-1),
  relics: t.array("boolean"),
  merc: t.array("float32"), // [blue channel progress, red channel progress]
  hacendado: t.array("float32"), // per-team buff expiry (game time)
  players: t.map(Player),
  units: t.map(Unit),
  projectiles: t.map(Projectile),
}, "State");
export type State = SchemaType<typeof State>;
