// Shared game data: map layout, champions, items, summoners, runes.
// Units: 1 world unit ≈ 100 LoL units. Bridge runs along X, blue (team 0) at -X, red (team 1) at +X.

export const TICK = 1 / 30;
export const BRIDGE = { minX: -66, maxX: 66, halfW: 9 };
export const FOUNTAIN_X = 63;
export const SHOP_RADIUS = 7;
export const START_GOLD = 1400;
export const START_LEVEL = 3;
export const MERCADONA_AT = 15 * 60;
export const MODES = ["1v1", "2v2", "3v3", "4v4", "5v5"] as const;
export const SELECT_MODES = { aram: "Pure ARAM (Random)", three: "1 of 3 Random", draft: "Free Draft" } as const;

export const side = (team: number) => (team === 0 ? -1 : 1);

// Structures per team, from lane to base. Each only becomes targetable once the previous one falls.
export const STRUCTURES = [
  { kind: "tower", x: 24, hp: 3000, name: "Torre exterior" },
  { kind: "tower", x: 40, hp: 3500, name: "Torre interior" },
  { kind: "inhib", x: 48, hp: 2500, name: "Urna" },
  { kind: "nexus", x: 56, hp: 5000, name: "Congreso" },
] as const;

export const RELICS = [
  { x: -12, z: 6.5 }, { x: 12, z: -6.5 }, { x: -30, z: -6.5 }, { x: 30, z: 6.5 },
];
export const BUSHES = [
  { x: -6, z: -7, w: 5, d: 3.5 }, { x: 6, z: 7, w: 5, d: 3.5 },
  { x: -20, z: 7, w: 4, d: 3.5 }, { x: 20, z: -7, w: 4, d: 3.5 },
];
export const inBush = (x: number, z: number) =>
  BUSHES.findIndex(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);

export const MINIONS = {
  melee: { hp: 480, ad: 14, range: 1.4, as: 1.2, ms: 3.2, gold: 22, armor: 0, r: 0.5 },
  caster: { hp: 300, ad: 24, range: 5.5, as: 0.66, ms: 3.2, gold: 16, armor: 0, r: 0.45 },
  cannon: { hp: 900, ad: 40, range: 6.5, as: 1, ms: 3.2, gold: 60, armor: 20, r: 0.8 },
  super: { hp: 1800, ad: 90, range: 1.8, as: 0.85, ms: 3.4, gold: 60, armor: 60, r: 0.9 },
} as const;
export type MinionKind = keyof typeof MINIONS;

export type CC = "stun" | "root" | "slow" | "silence" | "taunt" | "charm" | "fear" | "blind" | "suppress" | "knockup";
type AbilityKind = "shot" | "aoe" | "self" | "dash" | "blink" | "target" | "cone";

export interface Ability {
  name: string;
  desc: string;
  kind: AbilityKind;
  cd: number;
  mana: number;
  range: number;
  dmg?: number; // base damage (scales +8%/level)
  ratio?: number; // bonus ratio of AD (phys) or AP (magic/true)
  dtype?: "phys" | "magic" | "true";
  radius?: number; // aoe / cone / projectile width
  speed?: number; // projectile speed
  delay?: number; // aoe delay
  pierce?: boolean;
  cc?: { type: CC; dur: number; amt?: number };
  shield?: number; // fraction of max HP
  heal?: number; // fraction of max HP
  buff?: { ms?: number; as?: number; ad?: number; armor?: number; mr?: number; dmgMult?: number; dur: number };
  dot?: number; // total magic damage over 2s, applied to hits
  execute?: boolean; // damage scales up with target missing HP
  stealth?: number; // seconds of stealth for the caster
  pull?: boolean;
  shred?: number; // resist reduction fraction
  special?: string; // champion-specific hook, handled in sim
  fx: string; // visual/audio cue name
  color?: number;
}

export interface Champ {
  id: string;
  name: string;
  title: string;
  meme?: boolean;
  role: string;
  color: number;
  accent: number;
  hp: number; mana: number; ad: number; armor: number; mr: number; as: number; ms: number; range: number;
  passive: { name: string; desc: string };
  abilities: [Ability, Ability, Ability, Ability];
  theme: "hiphop" | "pasodoble" | "chiptune" | "epic" | "disco" | "dark";
}

const Y = 0xffe04a, B = 0x4aa8ff, R = 0xff4a3d, G = 0x55ff88, P = 0xd46bff, W = 0xffffff;

export const CHAMPS: Champ[] = [
  {
    id: "ezreal", name: "Ezreal", title: "Mystic Marksman", role: "Tirador", color: 0x3b6fd6, accent: 0xf2c94c,
    hp: 1100, mana: 700, ad: 70, armor: 30, mr: 30, as: 0.75, ms: 3.25, range: 5.5, theme: "epic",
    passive: { name: "Rising Spell Force", desc: "Hitting abilities grants stacking attack speed." },
    abilities: [
      { name: "Mystic Shot", desc: "Skillshot that deals physical damage.", kind: "shot", cd: 4, mana: 30, range: 11, dmg: 90, ratio: 1.3, dtype: "phys", radius: 0.6, speed: 32, fx: "bolt", color: Y },
      { name: "Essence Flux", desc: "Magic orb that marks and damages.", kind: "shot", cd: 10, mana: 60, range: 11, dmg: 120, ratio: 0.8, dtype: "magic", radius: 0.8, speed: 24, pierce: true, fx: "bolt", color: P },
      { name: "Arcane Shift", desc: "Blink a short distance and fire a bolt.", kind: "blink", cd: 18, mana: 90, range: 4.75, dmg: 80, ratio: 0.6, dtype: "magic", fx: "blink", color: Y },
      { name: "Trueshot Barrage", desc: "Global energy wave.", kind: "shot", cd: 90, mana: 100, range: 150, dmg: 350, ratio: 1.0, dtype: "magic", radius: 1.8, speed: 26, pierce: true, fx: "wave", color: Y },
    ],
  },
  {
    id: "annie", name: "Annie", title: "The Dark Child", role: "Maga", color: 0xe06aa8, accent: 0x7a3b1d,
    hp: 1050, mana: 800, ad: 50, armor: 25, mr: 30, as: 0.6, ms: 3.35, range: 6.25, theme: "dark",
    passive: { name: "Pyromania", desc: "Every 4th ability stuns for 1.5s." },
    abilities: [
      { name: "Disintegrate", desc: "Targeted fireball.", kind: "target", cd: 4, mana: 50, range: 6.25, dmg: 150, ratio: 0.8, dtype: "magic", fx: "fire", color: 0xff7a1a },
      { name: "Incinerate", desc: "Cone of fire.", kind: "cone", cd: 8, mana: 70, range: 6, dmg: 170, ratio: 0.85, dtype: "magic", radius: 50, fx: "cone", color: 0xff7a1a },
      { name: "Molten Shield", desc: "Shield and move speed.", kind: "self", cd: 14, mana: 40, range: 0, shield: 0.15, buff: { ms: 0.3, dur: 2 }, fx: "shield", color: 0xff7a1a },
      { name: "Summon: Tibbers", desc: "Tibbers slams down in an area.", kind: "aoe", cd: 90, mana: 100, range: 6, dmg: 400, ratio: 0.75, dtype: "magic", radius: 3.2, fx: "tibbers", color: 0xff4a1a, special: "tibbers" },
    ],
  },
  {
    id: "ryze", name: "Ryze", title: "Rune Mage", role: "Mago", color: 0x3f7fcf, accent: 0x9fd6ff,
    hp: 1150, mana: 1000, ad: 55, armor: 30, mr: 30, as: 0.65, ms: 3.4, range: 5.5, theme: "epic",
    passive: { name: "Arcane Mastery", desc: "Ability damage scales with bonus mana." },
    abilities: [
      { name: "Overload", desc: "Rune skillshot.", kind: "shot", cd: 3, mana: 40, range: 10, dmg: 110, ratio: 0.55, dtype: "magic", radius: 0.6, speed: 30, fx: "bolt", color: B },
      { name: "Rune Prison", desc: "Roots the target.", kind: "target", cd: 12, mana: 70, range: 6, dmg: 90, ratio: 0.6, dtype: "magic", cc: { type: "root", dur: 1.5 }, fx: "rune", color: B },
      { name: "Spell Flux", desc: "Orb that splashes nearby enemies.", kind: "target", cd: 4, mana: 40, range: 6, dmg: 80, ratio: 0.45, dtype: "magic", radius: 3, fx: "rune", color: B },
      { name: "Realm Warp", desc: "Short teleport to a location.", kind: "blink", cd: 90, mana: 100, range: 12, fx: "warp", color: B },
    ],
  },
  {
    id: "jhin", name: "Jhin", title: "The Virtuoso", role: "Tirador", color: 0xe8e0cf, accent: 0xc0392b,
    hp: 1100, mana: 600, ad: 85, armor: 28, mr: 30, as: 0.7, ms: 3.3, range: 5.5, theme: "dark",
    passive: { name: "Whisper", desc: "Every 4th basic attack is a guaranteed crit." },
    abilities: [
      { name: "Dancing Grenade", desc: "Bouncing grenade.", kind: "target", cd: 7, mana: 50, range: 5.5, dmg: 130, ratio: 0.8, dtype: "phys", radius: 3, fx: "bolt", color: 0xffd27a },
      { name: "Deadly Flourish", desc: "Long-range line that roots.", kind: "shot", cd: 12, mana: 60, range: 22, dmg: 140, ratio: 0.5, dtype: "phys", radius: 0.5, speed: 60, pierce: true, cc: { type: "root", dur: 1.5 }, fx: "beam", color: 0xff4a4a },
      { name: "Captive Lotus", desc: "Trap that explodes and slows.", kind: "aoe", cd: 14, mana: 30, range: 7.5, dmg: 120, ratio: 1.0, dtype: "magic", radius: 2.2, delay: 1, cc: { type: "slow", dur: 2, amt: 0.35 }, fx: "trap", color: 0xff4a4a },
      { name: "Curtain Call", desc: "Four long-range sniper shells.", kind: "shot", cd: 90, mana: 100, range: 30, dmg: 170, ratio: 0.3, dtype: "phys", radius: 0.9, speed: 45, fx: "bolt", color: 0xff4a4a, special: "curtain" },
    ],
  },
  {
    id: "caitlyn", name: "Caitlyn", title: "Sheriff of Piltover", role: "Tiradora", color: 0x6b3fa0, accent: 0x23213a,
    hp: 1080, mana: 600, ad: 72, armor: 28, mr: 30, as: 0.7, ms: 3.25, range: 6.5, theme: "epic",
    passive: { name: "Headshot", desc: "Every 6th attack deals 60% bonus damage." },
    abilities: [
      { name: "Piltover Peacemaker", desc: "Long piercing line shot.", kind: "shot", cd: 8, mana: 50, range: 13, dmg: 140, ratio: 1.3, dtype: "phys", radius: 0.7, speed: 40, pierce: true, fx: "beam", color: Y },
      { name: "Yordle Snap Trap", desc: "Trap that roots.", kind: "aoe", cd: 12, mana: 20, range: 8, dmg: 60, ratio: 0.4, dtype: "phys", radius: 1.4, delay: 0.8, cc: { type: "root", dur: 1.5 }, fx: "trap", color: Y },
      { name: "90 Caliber Net", desc: "Net that slows; recoil backwards.", kind: "shot", cd: 14, mana: 70, range: 8, dmg: 90, ratio: 0.8, dtype: "magic", radius: 0.7, speed: 32, cc: { type: "slow", dur: 1, amt: 0.5 }, fx: "bolt", color: W, special: "recoil" },
      { name: "Ace in the Hole", desc: "Targeted sniper shot.", kind: "target", cd: 80, mana: 100, range: 30, dmg: 400, ratio: 2.0, dtype: "phys", fx: "snipe", color: Y },
    ],
  },
  {
    id: "garen", name: "Garen", title: "The Might of Demacia", role: "Luchador", color: 0x2f5fb0, accent: 0xe8c14c,
    hp: 1500, mana: 0, ad: 75, armor: 40, mr: 35, as: 0.65, ms: 3.4, range: 1.75, theme: "epic",
    passive: { name: "Perseverance", desc: "Regenerates quickly out of combat." },
    abilities: [
      { name: "Decisive Strike", desc: "Sprint; empowered hit that silences.", kind: "self", cd: 8, mana: 0, range: 0, buff: { ms: 0.35, dur: 1.5 }, dmg: 60, ratio: 0.5, dtype: "phys", cc: { type: "silence", dur: 1.5 }, fx: "shield", color: Y, special: "nexthit" },
      { name: "Courage", desc: "Shield and damage reduction.", kind: "self", cd: 18, mana: 0, range: 0, shield: 0.12, buff: { armor: 30, mr: 30, dur: 3 }, fx: "shield", color: Y },
      { name: "Judgment", desc: "Spins, damaging nearby enemies.", kind: "aoe", cd: 9, mana: 0, range: 0, dmg: 220, ratio: 1.4, dtype: "phys", radius: 3, fx: "spin", color: Y },
      { name: "Demacian Justice", desc: "True damage execute.", kind: "target", cd: 90, mana: 0, range: 4, dmg: 250, ratio: 0.6, dtype: "true", execute: true, fx: "sword", color: Y },
    ],
  },
  {
    id: "darius", name: "Darius", title: "The Hand of Noxus", role: "Luchador", color: 0x7a1f1f, accent: 0x222222,
    hp: 1550, mana: 400, ad: 78, armor: 42, mr: 32, as: 0.63, ms: 3.4, range: 1.75, theme: "epic",
    passive: { name: "Hemorrhage", desc: "Attacks and abilities apply a bleed." },
    abilities: [
      { name: "Decimate", desc: "Axe spin; heals per champion hit.", kind: "aoe", cd: 8, mana: 30, range: 0, dmg: 160, ratio: 1.2, dtype: "phys", radius: 3.5, heal: 0.06, fx: "spin", color: R },
      { name: "Crippling Strike", desc: "Next hit slows heavily.", kind: "target", cd: 6, mana: 30, range: 2, dmg: 80, ratio: 1.4, dtype: "phys", cc: { type: "slow", dur: 1, amt: 0.9 }, fx: "sword", color: R },
      { name: "Apprehend", desc: "Pulls enemies in a cone.", kind: "cone", cd: 20, mana: 45, range: 5.3, dmg: 20, ratio: 0.3, dtype: "phys", radius: 50, pull: true, cc: { type: "slow", dur: 1, amt: 0.4 }, fx: "cone", color: R },
      { name: "Noxian Guillotine", desc: "True damage execute; resets on kill.", kind: "target", cd: 90, mana: 100, range: 4.6, dmg: 250, ratio: 0.75, dtype: "true", execute: true, fx: "sword", color: R, special: "reset" },
    ],
  },
  {
    id: "rammus", name: "Rammus", title: "The Armordillo", role: "Tanque", color: 0x8a6a3a, accent: 0xd7b56d,
    hp: 1600, mana: 500, ad: 60, armor: 55, mr: 35, as: 0.65, ms: 3.35, range: 1.5, theme: "chiptune",
    passive: { name: "Spiked Shell", desc: "Gains AD from armor." },
    abilities: [
      { name: "Powerball", desc: "Rolls forward and knocks up.", kind: "dash", cd: 12, mana: 60, range: 10, dmg: 150, ratio: 1.0, dtype: "magic", radius: 1.5, cc: { type: "knockup", dur: 0.75 }, fx: "roll", color: 0xd7b56d },
      { name: "Defensive Ball Curl", desc: "Big armor and MR boost.", kind: "self", cd: 8, mana: 40, range: 0, buff: { armor: 60, mr: 40, dur: 4 }, fx: "shield", color: 0xd7b56d },
      { name: "Frenzying Taunt", desc: "Taunts the target.", kind: "target", cd: 12, mana: 50, range: 3.25, cc: { type: "taunt", dur: 1.6 }, fx: "taunt", color: R },
      { name: "Soaring Slam", desc: "Leap and slam an area.", kind: "dash", cd: 70, mana: 100, range: 8, dmg: 250, ratio: 0.6, dtype: "magic", radius: 3.5, cc: { type: "slow", dur: 1.5, amt: 0.4 }, fx: "slam", color: 0xd7b56d, special: "landaoe" },
    ],
  },
  {
    id: "illaoi", name: "Illaoi", title: "The Kraken Priestess", role: "Luchadora", color: 0x3a6b3a, accent: 0xe8c14c,
    hp: 1500, mana: 400, ad: 72, armor: 38, mr: 32, as: 0.6, ms: 3.4, range: 1.75, theme: "epic",
    passive: { name: "Prophet of an Elder God", desc: "Tentacles slam around her." },
    abilities: [
      { name: "Tentacle Smash", desc: "Delayed line slam.", kind: "cone", cd: 9, mana: 40, range: 8, dmg: 180, ratio: 1.2, dtype: "phys", radius: 15, fx: "tentacle", color: G },
      { name: "Harsh Lesson", desc: "Leap onto the target.", kind: "dash", cd: 5, mana: 30, range: 3.5, dmg: 70, ratio: 0.6, dtype: "phys", radius: 1.2, fx: "slam", color: G },
      { name: "Test of Spirit", desc: "Pulls the enemy spirit, slowing them.", kind: "shot", cd: 16, mana: 35, range: 9, dmg: 80, ratio: 0.4, dtype: "magic", radius: 0.7, speed: 24, cc: { type: "slow", dur: 2, amt: 0.4 }, fx: "bolt", color: G },
      { name: "Leap of Faith", desc: "Slams an area; big damage.", kind: "aoe", cd: 90, mana: 100, range: 0, dmg: 350, ratio: 0.8, dtype: "phys", radius: 4.5, fx: "slam", color: G },
    ],
  },
  {
    id: "karma", name: "Karma", title: "The Enlightened One", role: "Soporte", color: 0x3aa0a0, accent: 0xe8c14c,
    hp: 1150, mana: 800, ad: 55, armor: 30, mr: 30, as: 0.63, ms: 3.35, range: 5.25, theme: "epic",
    passive: { name: "Gathering Fire", desc: "Ability hits reduce R cooldown." },
    abilities: [
      { name: "Inner Flame", desc: "Explosive skillshot that slows.", kind: "shot", cd: 7, mana: 50, range: 9.5, dmg: 150, ratio: 0.7, dtype: "magic", radius: 0.8, speed: 26, cc: { type: "slow", dur: 1.5, amt: 0.35 }, fx: "bolt", color: 0x5affff },
      { name: "Focused Resolve", desc: "Tether that roots.", kind: "target", cd: 12, mana: 50, range: 6.75, dmg: 80, ratio: 0.5, dtype: "magic", cc: { type: "root", dur: 1.6 }, fx: "rune", color: 0x5affff },
      { name: "Inspire", desc: "Shield and speed burst.", kind: "self", cd: 10, mana: 50, range: 0, shield: 0.14, buff: { ms: 0.4, dur: 1.5 }, fx: "shield", color: 0x5affff },
      { name: "Mantra", desc: "Resets Q and empowers you.", kind: "self", cd: 40, mana: 0, range: 0, buff: { ms: 0.2, dmgMult: 0.25, dur: 6 }, fx: "shield", color: 0x5affff, special: "mantra" },
    ],
  },
  // ---------------- MEME CHAMPIONS ----------------
  {
    id: "torrente", name: "Torrente", title: "El Brazo Tonto de la Ley", meme: true, role: "Tanque borracho", color: 0x5a6b4a, accent: 0xf1f1e0,
    hp: 1700, mana: 400, ad: 70, armor: 45, mr: 35, as: 0.62, ms: 3.3, range: 1.6, theme: "pasodoble",
    passive: { name: "¿Nos hacemos unas pajillas?", desc: "Lower HP → more AD and armor (up to +50% below 25% HP)." },
    abilities: [
      { name: "Vómito de Soberano", desc: "Cone of bile: damage over time and 40% slow for 2s.", kind: "cone", cd: 8, mana: 50, range: 5, dmg: 60, ratio: 0.4, dtype: "magic", radius: 60, dot: 140, cc: { type: "slow", dur: 2, amt: 0.4 }, fx: "vomit", color: 0xb5c43a },
      { name: "¡Alto a la Autoridad!", desc: "Taunts an enemy champion 1.5s and shields 15% max HP.", kind: "target", cd: 14, mana: 60, range: 4, shield: 0.15, cc: { type: "taunt", dur: 1.5 }, fx: "badge", color: Y },
      { name: "Croqueta Policial", desc: "Sideways roll that blocks the next skillshot.", kind: "dash", cd: 10, mana: 30, range: 5, dmg: 40, ratio: 0.3, dtype: "phys", radius: 1.4, fx: "roll", color: 0xc8a060, special: "spellshield" },
      { name: "Desmadre Descamisado", desc: "Rips off his wifebeater: stuns nearby enemies 2s and shreds resistances 30%.", kind: "aoe", cd: 100, mana: 100, range: 0, dmg: 150, ratio: 0.5, dtype: "magic", radius: 5, cc: { type: "stun", dur: 2 }, shred: 0.3, fx: "shirtless", color: 0xfff1c0, special: "torrenteR" },
    ],
  },
  {
    id: "kanye", name: "Kanye West", title: "Ye", meme: true, role: "Asesino bipolar", color: 0x222222, accent: 0xe8c14c,
    hp: 1150, mana: 500, ad: 80, armor: 30, mr: 30, as: 0.68, ms: 3.4, range: 1.75, theme: "hiphop",
    passive: { name: "Ego Bipolar", desc: "Swaps every 15s: Meek Ye (+30 armor/MR) ↔ Twitter Ye (+40 lethality, 0 defenses, +25% MS)." },
    abilities: [
      { name: "Tweet Polémico", desc: "Spinning phone: heavy damage and 1s silence.", kind: "shot", cd: 7, mana: 50, range: 9, dmg: 170, ratio: 1.1, dtype: "phys", radius: 0.7, speed: 28, cc: { type: "silence", dur: 1 }, fx: "phone", color: 0x33c3ff },
      { name: "Yeezy Drop", desc: "Sneakers: enemies rooted 1.2s, allies get +50% MS.", kind: "aoe", cd: 14, mana: 50, range: 7, dmg: 40, ratio: 0.3, dtype: "phys", radius: 2.2, delay: 0.5, cc: { type: "root", dur: 1.2 }, fx: "sneaker", color: 0xf1e6c8, special: "yeezy" },
      { name: "I Wonder Dash", desc: "Lightning dash through enemies.", kind: "dash", cd: 10, mana: 40, range: 6, dmg: 110, ratio: 0.8, dtype: "phys", radius: 1.3, fx: "dash", color: P },
      { name: "Episodio Maníaco", desc: "6s: doubled attack speed and damage, but controls randomly invert every 2s. I AM A GOD!", kind: "self", cd: 90, mana: 100, range: 0, buff: { as: 1.0, dmgMult: 1.0, dur: 6 }, fx: "god", color: Y, special: "manic" },
    ],
  },
  {
    id: "epstein", name: "Jeffrey Epstein", title: "El Bruiser Conspiranoico", meme: true, role: "Luchador conspiranoico", color: 0x1c2240, accent: 0xe8c14c,
    hp: 1450, mana: 450, ad: 72, armor: 38, mr: 32, as: 0.65, ms: 3.4, range: 1.75, theme: "dark",
    passive: { name: "Registro de Vuelo", desc: "Hits stack Covert Connection (3). At 3 stacks your next Q teleports you behind them." },
    abilities: [
      { name: "Invitación a la Isla", desc: "Gold envelope: magic damage + charm 1.4s.", kind: "shot", cd: 10, mana: 60, range: 9, dmg: 120, ratio: 0.7, dtype: "magic", radius: 0.7, speed: 22, cc: { type: "charm", dur: 1.4 }, fx: "envelope", color: 0xffd24a },
      { name: "Sábanas de la Prisión", desc: "Bedsheet barrier: blocks damage 2s, reflects 20%.", kind: "self", cd: 16, mana: 50, range: 0, shield: 0.25, buff: { dur: 2 }, fx: "sheet", color: W, special: "reflect" },
      { name: "Maletín de Pruebas", desc: "Smoke cloud: invisible while inside.", kind: "self", cd: 20, mana: 60, range: 0, stealth: 3, fx: "smoke", color: 0x777777 },
      { name: "Epstein no se suicidó", desc: "On lethal damage (or cast): untargetable 3s, fake death, reappear behind the farthest enemy at 40% HP.", kind: "self", cd: 120, mana: 0, range: 0, fx: "fakedeath", color: 0xffd24a, special: "fakedeath" },
    ],
  },
  {
    id: "diddy", name: "Diddy", title: "Puff Daddy", meme: true, role: "Mago de control fiestero", color: 0xf4f4f4, accent: 0xe8c14c,
    hp: 1100, mana: 800, ad: 55, armor: 28, mr: 30, as: 0.63, ms: 3.35, range: 5.5, theme: "disco",
    passive: { name: "Freak Off", desc: "Every 3rd hit on the same target Fears it 1s." },
    abilities: [
      { name: "Botella de Aceite de Bebé", desc: "Slippery puddle: 60% slow.", kind: "aoe", cd: 9, mana: 60, range: 8, dmg: 110, ratio: 0.6, dtype: "magic", radius: 2.4, delay: 0.4, cc: { type: "slow", dur: 2, amt: 0.6 }, fx: "oil", color: 0xfff7c0 },
      { name: "Fiesta en la Mansión", desc: "VIP zone: continuous damage to enemies.", kind: "aoe", cd: 14, mana: 70, range: 7, dmg: 60, ratio: 0.3, dtype: "magic", radius: 3.2, dot: 220, fx: "party", color: P },
      { name: "Moonwalk Evasivo", desc: "Glide backwards, CC immune; confetti blinds.", kind: "dash", cd: 12, mana: 40, range: 5, radius: 2.5, cc: { type: "blind", dur: 1.5 }, fx: "moonwalk", color: P, special: "moonwalk" },
      { name: "The White Party", desc: "Disco ball: heavy AoE and suppresses the richest enemy 2.5s.", kind: "aoe", cd: 100, mana: 100, range: 8, dmg: 300, ratio: 0.8, dtype: "magic", radius: 4, delay: 0.6, fx: "disco", color: W, special: "whiteparty" },
    ],
  },
  {
    id: "mortadelo", name: "Mortadelo y Filemón", title: "Agencia T.I.A.", meme: true, role: "Dúo tag-team", color: 0x222222, accent: 0xd33b2c,
    hp: 1250, mana: 600, ad: 65, armor: 32, mr: 30, as: 0.7, ms: 3.4, range: 1.75, theme: "chiptune",
    passive: { name: "Chapuzas de la T.I.A.", desc: "When Mortadelo misses or takes heavy damage, Filemón rages: +20% AD (3 stacks)." },
    abilities: [
      { name: "Disfraz Inesperado", desc: "Random disguise: Potted Plant (stealth), Charging Bull (knockup dash) or Bomb Box (AoE, hurts you a bit).", kind: "self", cd: 9, mana: 50, range: 7, dmg: 160, ratio: 0.8, dtype: "magic", radius: 3, fx: "disguise", color: Y, special: "disguise" },
      { name: "Invento del Profesor Bacterio", desc: "Flask: 50% heal allies 25% max HP, 50% tear gas reversing everyone's controls.", kind: "aoe", cd: 16, mana: 70, range: 7, radius: 3, delay: 0.5, fx: "flask", color: G, special: "bacterio" },
      { name: "Cambio de Agente", desc: "Swap leader: Mortadelo (melee, fast, armored) ↔ Filemón (ranged revolvers).", kind: "self", cd: 3, mana: 0, range: 0, fx: "swap", color: W, special: "swap" },
      { name: "¡¡MORTADELOOOO!!", desc: "Filemón mallets Mortadelo into a torpedo. Stuns 1.8s on impact. ¡¡ZASCA!!", kind: "shot", cd: 90, mana: 100, range: 25, dmg: 280, ratio: 0.8, dtype: "magic", radius: 1.2, speed: 30, cc: { type: "stun", dur: 1.8 }, fx: "torpedo", color: 0xd33b2c, special: "torpedo" },
    ],
  },
];
export const champ = (id: string) => CHAMPS.find(c => c.id === id)!;

interface Item {
  id: string; name: string; tier: 1 | 2 | 3; cost: number; icon: string; desc: string;
  ad?: number; ap?: number; hp?: number; as?: number; armor?: number; mr?: number; ms?: number; mana?: number;
  regen?: number; lifesteal?: number; haste?: number; tenacity?: number; passive?: string;
}
export const ITEMS: Item[] = [
  { id: "navaja", name: "Navaja de Albacete", tier: 1, cost: 350, icon: "🔪", desc: "+15 AD", ad: 15 },
  { id: "litrona", name: "Litrona de Mahou", tier: 1, cost: 400, icon: "🍺", desc: "+150 HP", hp: 150 },
  { id: "pipas", name: "Pipas Tijuana", tier: 1, cost: 300, icon: "🌻", desc: "+10% Attack Speed", as: 0.1 },
  { id: "nenuco", name: "Colonia Nenuco", tier: 1, cost: 435, icon: "🧴", desc: "+20 AP", ap: 20 },
  { id: "tortilla", name: "Tortilla de Patatas (con cebolla)", tier: 2, cost: 1000, icon: "🥔", desc: "+300 HP, +15 HP/s", hp: 300, regen: 15 },
  { id: "muleta", name: "Muleta de Torero", tier: 2, cost: 1000, icon: "🟥", desc: "+40 Armor. Dodges 1 in 8 basic attacks.", armor: 40, passive: "dodge" },
  { id: "gafas", name: "Gafas de Gasolinera", tier: 2, cost: 1100, icon: "🕶️", desc: "+35 AP, +10% CDR", ap: 35, haste: 0.1 },
  { id: "chorizo", name: "Chorizo de Cantimpalo", tier: 2, cost: 1200, icon: "🌭", desc: "+30 AD, +10% Life Steal", ad: 30, lifesteal: 0.1 },
  { id: "jamon", name: "Jamón 5 Jotas", tier: 3, cost: 3200, icon: "🍖", desc: "+65 AD, +400 HP. Hits deal 3% max HP true damage.", ad: 65, hp: 400, passive: "jamon" },
  { id: "papel", name: "Megapack Papel Higiénico", tier: 3, cost: 3000, icon: "🧻", desc: "+80 Armor, +60 MR. 500 HP shield every 45s.", armor: 80, mr: 60, passive: "papel" },
  { id: "aceite", name: "Garrafa de AOVE", tier: 3, cost: 3100, icon: "🫒", desc: "+90 AP, +250 Mana. Spells burn and slow.", ap: 90, mana: 250, passive: "aceite" },
  { id: "cunas", name: "Bambas de Cuña del Mercadillo", tier: 3, cost: 2500, icon: "👟", desc: "+60 MS, +30% Tenacity. Ignores minor slows.", ms: 0.6, tenacity: 0.3, passive: "cunas" },
];
export const item = (id: string) => ITEMS.find(i => i.id === id);

export const SPELLS: Record<string, { name: string; icon: string; cd: number; desc: string }> = {
  flash: { name: "Flash", icon: "✨", cd: 300, desc: "Blink a short distance." },
  teleport: { name: "Teleport", icon: "🌀", cd: 240, desc: "Channel 3s, teleport to your frontmost tower." },
  heal: { name: "Heal", icon: "💚", cd: 240, desc: "Heal you and nearest ally, +30% MS." },
  barrier: { name: "Barrier", icon: "🛡️", cd: 180, desc: "Shield for 2s." },
  ignite: { name: "Ignite", icon: "🔥", cd: 180, desc: "True damage over 5s to target." },
  exhaust: { name: "Exhaust", icon: "😮‍💨", cd: 210, desc: "Slow 30% and -40% damage dealt for 3s." },
  cleanse: { name: "Cleanse", icon: "🧼", cd: 210, desc: "Remove all crowd control." },
  ghost: { name: "Ghost", icon: "👻", cd: 210, desc: "+40% move speed for 10s." },
  revive: { name: "Revive", icon: "⚰️", cd: 300, desc: "Instantly respawn at fountain with 35% HP and a speed boost." },
  smite: { name: "Smite", icon: "⚡", cd: 60, desc: "600 true damage to a minion or Mercadona." },
  punch: { name: "Puñetazo", icon: "👊", cd: 120, desc: "Melee punch: knockback 5 and 50% slow." },
  siesta: { name: "Siesta", icon: "😴", cd: 240, desc: "Nap 3s restoring 60% HP/mana. Champion damage wakes you stunned." },
  rocket: { name: "Cohete", icon: "🚀", cd: 180, desc: "Blast forward at supersonic speed leaving fire." },
};

export const RUNES: Record<string, { name: string; icon: string; desc: string }> = {
  drake: { name: "Drake Sí/No", icon: "🙅", desc: "Entering combat: +20% omnivamp for 5s and a shockwave that knocks away nearby enemies." },
  fine: { name: "This is Fine", icon: "☕", desc: "Immune to DoTs. Below 20% HP: 30% max HP shield (60s CD)." },
  stonks: { name: "Stonks", icon: "📈", desc: "+30% minion gold. Takedowns ring the Wall Street bell." },
  pressf: { name: "Press F", icon: "🇫", desc: "When you die, allies get -15s ultimate CD and a barrier." },
  amogus: { name: "Amogus", icon: "📮", desc: "Stand still 2s: disguise as a crewmate (stealth). Next attack crits." },
  npc: { name: "Modo NPC", icon: "🧍", desc: "Minions ignore you. Enemies can't basic-attack you for the first 2s of combat." },
};

export const LOADING_TIPS = [
  "¿Sabías que Epstein no se suicidó?",
  "Si Torrente falla una habilidad, la culpa es de la Unión Europea.",
  "Nunca hagas Flash hacia delante si juegas con el WiFi del tren.",
  "Las palomas del Congreso cobran dietas aunque no vengan.",
  "El Bazar de ElChino cierra a las 3 AM. Compra antes de morir.",
  "La tortilla con cebolla da +300 HP. Sin cebolla da -300 amigos.",
  "Diddy te invita a una fiesta. No vayas.",
  "El minuto 15 huele a Hacendado.",
];

// XP to reach level L+1 from L.
export const xpFor = (lvl: number) => 180 + 100 * lvl;
