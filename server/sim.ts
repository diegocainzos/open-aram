// Server-authoritative ARAM simulation. Everything synced lives in the schema `State`;
// server-only runtime data (timers, buffs, targets) lives in `RT` objects keyed by unit id.
import {
  BRIDGE, CHAMPS, FOUNTAIN_X, MINIONS, MERCADONA_AT, RELICS, SHOP_RADIUS, SPELLS, START_GOLD, START_LEVEL,
  STRUCTURES, champ, item, side, xpFor, type Ability, type CC, type Champ, type MinionKind,
} from "../shared/data";
import { Projectile, Unit, type State } from "./schema";

type Emit = (type: string, msg: any) => void;
interface Buff { ms?: number; as?: number; ad?: number; armor?: number; mr?: number; dmgMult?: number; until: number }
interface CCe { type: CC; until: number; amt: number; src: string }
interface Dot { dps: number; until: number; src: string; dtype: "magic" | "true" | "phys" }
interface Dash { tx: number; tz: number; speed: number; ab?: Ability; hit: Set<string>; stop?: boolean; land?: boolean; forced?: boolean; onHit?: (t: RT) => void; onEnd?: () => void }
interface Proj {
  id: string; owner: RT; team: number; x: number; z: number; speed: number; radius: number;
  dx?: number; dz?: number; left?: number; pierce?: boolean; hit?: Set<string>; target?: string;
  onHit: (t: RT) => void; onMiss?: () => void;
}
export interface RT {
  id: string; u: Unit; c?: Champ; r: number; order?: number;
  mt?: { x: number; z: number }; target?: string; atkT: number; pending?: { slot: number; tid?: string; x: number; z: number };
  buffs: Buff[]; ccs: CCe[]; shields: { amt: number; until: number }[]; dots: Dot[]; dash?: Dash;
  assist: Map<string, number>; lastChamp?: string; lastChampT: number; combatT: number;
  hits: number; casts: number; marks: Map<string, number>; freak: { tid: string; n: number };
  rage: number; ez: { n: number; until: number }; spellshield: number; stealthUntil: number; plant: boolean;
  fakeUntil: number; manicInv: boolean; manicNext: number; invertUntil: number; siestaUntil: number;
  recallT: number; tpT: number; ccImmune: number; empowered?: Ability; form: "m" | "f"; twitter: boolean; swapT: number;
  stillT: number; amogus: boolean; papelNext: number; fineT: number; omniUntil: number; exhaustUntil: number; reflectUntil: number;
  shred: { amt: number; until: number }; multi: { n: number; until: number }; dodge: number; beef: boolean;
  lane?: number; retarget: number; relicChain: number;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const STRUCT_R: Record<string, number> = { tower: 1.4, inhib: 1.6, nexus: 3.2, mercadona: 2.6 };
const CC_RANK: CC[] = ["suppress", "stun", "knockup", "taunt", "charm", "fear", "root", "silence", "blind", "slow"];
const put = (u: any, k: string, v: any) => { if (u[k] !== v) u[k] = v; };

export class Sim {
  rt = new Map<string, RT>();
  proj = new Map<string, Proj>();
  later: { at: number; fn: () => void }[] = [];
  now = 0;
  seq = 0;
  wave = 0;
  nextWave = 5;
  relicAt = [20, 20, 20, 20];
  firstBlood = false;
  beefDone = false;
  mercSpawned = false;

  constructor(public s: State, public emit: Emit, public emitTeam: (team: number, type: string, msg: any) => void) {}

  // ---------------------------------------------------------------- setup
  setup(players: { id: string; name: string; team: number; champ: string; spellD: string; spellF: string; rune: string }[]) {
    this.s.relics.push(false, false, false, false);
    this.s.merc.push(0, 0);
    this.s.hacendado.push(0, 0);
    for (const team of [0, 1])
      STRUCTURES.forEach((st, i) => {
        const u = new Unit();
        Object.assign(u, { kind: st.kind, team, name: st.name, x: side(team) * st.x, z: 0, hp: st.hp, maxHp: st.hp, armor: 40, mr: 40, rot: team ? -Math.PI / 2 : Math.PI / 2 });
        this.add(`st${team}${i}`, u, STRUCT_R[st.kind]).order = i;
      });
    const counts = [0, 0];
    for (const p of players) {
      const c = champ(p.champ);
      const u = new Unit();
      const slot = counts[p.team]++;
      Object.assign(u, {
        kind: "champ", team: p.team, champ: c.id, name: p.name, level: START_LEVEL, gold: START_GOLD,
        x: side(p.team) * FOUNTAIN_X, z: (slot - 2) * 1.6, spellD: p.spellD, spellF: p.spellF, rune: p.rune,
      });
      u.cds.push(0, 0, 0, 0);
      u.scds.push(0, 0);
      const rt = this.add(p.id, u, 0.65);
      rt.c = c;
      this.stats(rt);
      u.hp = u.maxHp;
      u.mana = u.maxMana;
      u.rot = p.team ? -Math.PI / 2 : Math.PI / 2;
    }
  }

  add(id: string, u: Unit, r: number): RT {
    const rt: RT = {
      id, u, r, atkT: 0, buffs: [], ccs: [], shields: [], dots: [], assist: new Map(), lastChampT: -99, combatT: -99,
      hits: 0, casts: 0, marks: new Map(), freak: { tid: "", n: 0 }, rage: 0, ez: { n: 0, until: 0 }, spellshield: 0,
      stealthUntil: 0, plant: false, fakeUntil: 0, manicInv: false, manicNext: 0, invertUntil: 0, siestaUntil: 0,
      recallT: 0, tpT: 0, ccImmune: 0, form: "m", twitter: false, swapT: 15, stillT: 0, amogus: false, papelNext: 0,
      fineT: 0, omniUntil: 0, exhaustUntil: 0, reflectUntil: 0, shred: { amt: 0, until: 0 }, multi: { n: 0, until: 0 },
      dodge: 0, beef: false, retarget: 0, relicChain: 0,
    };
    this.rt.set(id, rt);
    this.s.units.set(id, u);
    return rt;
  }

  remove(id: string) {
    this.rt.delete(id);
    this.s.units.delete(id);
  }

  // ---------------------------------------------------------------- helpers
  has(rt: RT, t: CC) { return rt.ccs.some(c => c.type === t); }
  isChamp(rt?: RT): rt is RT & { c: Champ } { return !!rt?.c; }
  isStruct(rt: RT) { return rt.order !== undefined; }
  canMove(rt: RT) {
    return !rt.u.dead && rt.fakeUntil <= this.now && rt.siestaUntil <= this.now && rt.tpT <= 0 &&
      !rt.ccs.some(c => ["stun", "root", "suppress", "knockup", "taunt", "charm", "fear"].includes(c.type));
  }
  canAct(rt: RT) {
    return !rt.u.dead && rt.fakeUntil <= this.now && rt.siestaUntil <= this.now && rt.tpT <= 0 &&
      !rt.ccs.some(c => ["stun", "suppress", "knockup", "taunt", "charm", "fear"].includes(c.type));
  }
  vulnerable(rt: RT) {
    if (!this.isStruct(rt)) return rt.u.kind !== "mercadona";
    if (rt.order === 0) return true;
    return !!this.rt.get(`st${rt.u.team}${rt.order! - 1}`)?.u.dead;
  }
  targetableBy(t: RT | undefined, by: RT): t is RT {
    if (!t || t.u.dead || t.u.untargetable || t.u.team === by.u.team || !this.vulnerable(t)) return false;
    if (t.u.stealth && dist(t.u, by.u) > 1.5) return false;
    return true;
  }
  enemies(of: RT, x: number, z: number, r: number, champsOnly = false) {
    const out: RT[] = [];
    for (const t of this.rt.values())
      if (t.u.team !== of.u.team && !t.u.dead && !t.u.untargetable && this.vulnerable(t) && (!champsOnly || t.c) && Math.hypot(t.u.x - x, t.u.z - z) <= r + t.r)
        out.push(t);
    return out;
  }
  champs(team?: number) { return [...this.rt.values()].filter(r => r.c && (team === undefined || r.u.team === team)); }
  lvlScale(rt: RT) { return 1 + 0.07 * (rt.u.level - 1); }
  abDamage(rt: RT, ab: Ability) {
    let d = (ab.dmg ?? 0) * this.lvlScale(rt) + (ab.ratio ?? 0) * (ab.dtype === "phys" ? rt.u.ad : rt.u.ap);
    if (rt.c?.id === "ryze") d += rt.u.maxMana * 0.03;
    return d;
  }
  addCC(t: RT, type: CC, dur: number, src: RT, amt = 0) {
    if (t.u.dead || t.ccImmune > this.now || t.fakeUntil > this.now || this.isStruct(t)) return;
    if (type === "slow" && t.u.items.includes("cunas") && amt < 0.3) return;
    const ten = t.u.items.includes("cunas") && type !== "knockup" && type !== "suppress" ? 0.7 : 1;
    t.ccs.push({ type, until: this.now + dur * ten, amt, src: src.id });
    if (["stun", "suppress", "knockup", "taunt", "charm", "fear", "root"].includes(type)) { t.recallT = 0; t.tpT = 0; }
    if (type === "taunt") t.target = src.id;
  }
  shield(t: RT, amt: number, dur: number) { t.shields.push({ amt, until: this.now + dur }); }
  heal(t: RT, amt: number) {
    if (t.u.dead) return;
    const h = Math.min(amt, t.u.maxHp - t.u.hp);
    t.u.hp += h;
    if (h > 5 && t.c) this.emit("dmg", { id: t.id, v: Math.round(h), t: "heal" });
  }
  buff(t: RT, b: Omit<Buff, "until">, dur: number) { t.buffs.push({ ...b, until: this.now + dur }); }
  dot(t: RT, total: number, dur: number, src: RT, dtype: Dot["dtype"] = "magic") {
    if (t.u.rune === "fine") return;
    t.dots.push({ dps: total / dur, until: this.now + dur, src: src.id, dtype });
  }
  push(t: RT, fx: number, fz: number, d: number, toward = false) {
    if (this.isStruct(t) || t.ccImmune > this.now) return;
    let dx = t.u.x - fx, dz = t.u.z - fz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const k = toward ? -Math.max(0, Math.min(d, l - 1.2)) : d;
    t.dash = { tx: t.u.x + dx * k, tz: t.u.z + dz * k, speed: 18, hit: new Set(), forced: true };
  }
  after(sec: number, fn: () => void) { this.later.push({ at: this.now + sec, fn }); }
  fx(k: string, o: any = {}) { this.emit("fx", { k, ...o }); }
  fountain(team: number) { return { x: side(team) * FOUNTAIN_X, z: 0 }; }
  clampPos(p: { x: number; z: number }) {
    p.x = clamp(p.x, BRIDGE.minX, BRIDGE.maxX);
    p.z = clamp(p.z, -BRIDGE.halfW, BRIDGE.halfW);
  }

  // ---------------------------------------------------------------- stats
  stats(rt: RT) {
    const { u, c } = rt;
    if (!c) return;
    const L = u.level - 1;
    const it = u.items.map(i => item(i)!).filter(Boolean);
    const sum = (k: string) => it.reduce((a, i) => a + ((i as any)[k] ?? 0), 0);
    const bsum = (k: keyof Buff) => rt.buffs.reduce((a, b) => a + ((b[k] as number) ?? 0), 0);
    const oldMax = u.maxHp;
    let maxHp = c.hp + 95 * L + sum("hp");
    let ad = c.ad + 3.5 * L + sum("ad") + bsum("ad");
    let ap = sum("ap");
    let armor = c.armor + 3.5 * L + sum("armor") + bsum("armor");
    let mr = c.mr + 1.5 * L + sum("mr") + bsum("mr");
    let as = c.as * (1 + 0.025 * L + sum("as") + bsum("as"));
    let ms = c.ms * (1 + bsum("ms")) + sum("ms");
    let range = c.range;
    const maxMana = c.mana ? c.mana + 40 * L + sum("mana") : 0;
    const hpPct = u.hp / (u.maxHp || 1);
    switch (c.id) {
      case "torrente": { const f = clamp((1 - hpPct) / 0.75, 0, 1) * 0.5; ad *= 1 + f; armor *= 1 + f; break; }
      case "kanye": if (rt.twitter) { armor = sum("armor"); mr = sum("mr"); ms *= 1.25; } else { armor += 30; mr += 30; } break;
      case "rammus": ad += armor * 0.25; break;
      case "mortadelo": if (rt.form === "m") { armor += 15; ms += 0.3; } else range = 5.5; ad *= 1 + 0.2 * rt.rage; break;
      case "ezreal": if (rt.ez.until > this.now) as *= 1 + 0.1 * rt.ez.n; break;
    }
    if (rt.beef) as *= 1.1;
    if (this.s.hacendado[u.team] > this.now) { maxHp *= 1.15; ad *= 1.15; ap *= 1.15; armor *= 1.15; mr *= 1.15; ms *= 1.15; }
    const slow = Math.max(0, ...rt.ccs.filter(x => x.type === "slow").map(x => x.amt));
    ms *= 1 - slow;
    if (maxHp > oldMax && oldMax > 1) u.hp += maxHp - oldMax;
    put(u, "maxHp", Math.round(maxHp));
    put(u, "hp", Math.min(u.hp, u.maxHp));
    put(u, "maxMana", maxMana);
    put(u, "ad", Math.round(ad));
    put(u, "ap", Math.round(ap));
    put(u, "armor", Math.round(armor));
    put(u, "mr", Math.round(mr));
    put(u, "as", Math.min(2.5, Math.round(as * 100) / 100));
    put(u, "ms", Math.max(1, Math.round(ms * 100) / 100));
    put(u, "range", range);
  }
  haste(rt: RT) { return rt.u.items.reduce((a, i) => a + (item(i)?.haste ?? 0), 0); }

  // ---------------------------------------------------------------- damage
  damage(src: RT | undefined, t: RT, raw: number, dtype: "phys" | "magic" | "true", o: { attack?: boolean; crit?: boolean; noReflect?: boolean; ability?: boolean } = {}) {
    if (t.u.dead || t.u.untargetable || !this.vulnerable(t) || raw <= 0) return 0;
    if (src) {
      raw *= 1 + src.buffs.reduce((a, b) => a + (b.dmgMult ?? 0), 0);
      if (src.exhaustUntil > this.now) raw *= 0.6;
      if (src.c?.id === "kanye" && src.u.cc === "" && t.c && t.c.id === "diddy" && src.beef) raw *= 1.05;
    }
    const shred = t.shred.until > this.now ? t.shred.amt : 0;
    let res = dtype === "phys" ? t.u.armor : dtype === "magic" ? t.u.mr : 0;
    res *= 1 - shred;
    if (dtype === "phys" && src?.c?.id === "kanye" && src.twitter) res -= 40;
    let d = raw * (res >= 0 ? 100 / (100 + res) : 2 - 100 / (100 - res));
    if (t.siestaUntil > this.now && src?.c) {
      t.siestaUntil = 0;
      this.addCC(t, "stun", 1.5, src);
      this.fx("text", { id: t.id, text: "¡¿QUÉ?! 😵" });
    }
    // shields
    let absorbed = 0;
    for (const s of t.shields) {
      const a = Math.min(s.amt, d - absorbed);
      s.amt -= a;
      absorbed += a;
    }
    t.shields = t.shields.filter(s => s.amt > 0);
    if (absorbed && t.reflectUntil > this.now && src && !o.noReflect && dist(src.u, t.u) < 4) this.damage(t, src, absorbed * 0.2, "magic", { noReflect: true });
    d -= absorbed;
    t.u.hp -= d;
    const total = d + absorbed;
    if (src?.c) src.u.dmgDealt += total;
    if (t.c) t.u.dmgTaken += total;
    t.recallT = 0;
    if (t.c && src?.c) {
      t.assist.set(src.id, this.now);
      t.lastChamp = src.id;
      t.lastChampT = this.now;
      this.enterCombat(t);
      this.enterCombat(src);
      for (const tw of this.rt.values())
        if (tw.u.kind === "tower" && !tw.u.dead && tw.u.team === t.u.team && dist(tw.u, src.u) < 8.5) tw.target = src.id;
    }
    if (src?.c && t.c === undefined) src.combatT = Math.max(src.combatT, this.now - 4);
    if (src && (src.c || t.c)) {
      const heal = (o.attack ? src.u.items.reduce((a, i) => a + (item(i)?.lifesteal ?? 0), 0) : 0) + (src.omniUntil > this.now ? 0.2 : 0);
      if (heal) this.heal(src, total * heal);
    }
    if (t.c?.id === "mortadelo" && d > t.u.maxHp * 0.1) t.rage = Math.min(3, t.rage + 1);
    if (t.c || src?.c) this.emit("dmg", { id: t.id, v: Math.round(total), t: dtype, crit: o.crit });
    if (t.u.hp <= 0) {
      if (t.c?.id === "epstein" && t.u.cds[3] <= 0 && t.u.level >= 6) {
        t.u.hp = 1;
        this.fakeDeath(t);
      } else this.kill(t, src);
    } else if (t.u.rune === "fine" && t.u.hp < t.u.maxHp * 0.2 && t.fineT < this.now) {
      t.fineT = this.now + 60;
      this.shield(t, t.u.maxHp * 0.3, 4);
      this.fx("fine", { id: t.id });
    }
    return total;
  }

  enterCombat(rt: RT) {
    if (this.now - rt.combatT > 5) {
      if (rt.u.rune === "drake") {
        rt.omniUntil = this.now + 5;
        for (const e of this.enemies(rt, rt.u.x, rt.u.z, 3)) this.push(e, rt.u.x, rt.u.z, 2.5);
        this.fx("drake", { id: rt.id });
      }
    }
    rt.combatT = this.now;
    rt.amogus = false;
  }

  kill(t: RT, src?: RT) {
    const u = t.u;
    u.hp = 0;
    u.dead = true;
    t.dash = undefined;
    const killer = src?.c ? src : t.lastChampT > this.now - 10 ? this.rt.get(t.lastChamp ?? "") : undefined;
    if (this.isStruct(t)) {
      for (const c of this.champs(1 - u.team)) this.gold(c, u.kind === "nexus" ? 0 : 150);
      this.emit("announce", { text: u.kind === "inhib" ? `¡Urna del ${u.team ? "PP" : "PSOE"} destruida! Llegan las Súper-Palomas` : `${u.name} (${u.team ? "PP" : "PSOE"}) destruida`, sound: "tower" });
      if (u.kind === "nexus") {
        this.s.winner = 1 - u.team;
        this.s.phase = "end";
        this.emit("end", { winner: this.s.winner });
      }
      return;
    }
    if (!t.c) {
      // minion or neutral
      const xpTargets = this.champs(1 - u.team).filter(c => !c.u.dead && dist(c.u, u) < 12);
      for (const c of xpTargets) this.xp(c, (MINIONS[u.kind as MinionKind]?.gold ?? 20) * 2.2 / Math.max(1, xpTargets.length * 0.7));
      if (src?.c) {
        const g = (MINIONS[u.kind as MinionKind]?.gold ?? 20) * (src.u.rune === "stonks" ? 1.3 : 1);
        this.gold(src, g);
        src.u.cs++;
        if (!this.champs(src.u.team).some(c => c !== src && dist(c.u, src.u) < 12) && !this.champs(1 - src.u.team).some(c => !c.u.dead && dist(c.u, src.u) < 12)) src.u.minionKillsSolo++;
        this.emitTeam(src.u.team, "gold", { id: t.id, v: Math.round(g) });
      }
      this.fx("feathers", { x: u.x, z: u.z, big: u.kind === "cannon" || u.kind === "super" });
      this.remove(t.id);
      return;
    }
    // champion death
    u.deaths++;
    u.respawn = 5 + u.level * 1.3;
    u.recall = 0;
    t.ccs = []; t.dots = []; t.buffs = []; t.shields = []; t.mt = undefined; t.target = undefined; t.recallT = 0; t.tpT = 0;
    const assists = [...t.assist].filter(([id, at]) => at > this.now - 10 && id !== killer?.id).map(([id]) => this.rt.get(id)!).filter(Boolean);
    t.assist.clear();
    let multi = 0;
    if (killer?.c) {
      killer.u.kills++;
      this.gold(killer, 300);
      killer.multi = killer.multi.until > this.now ? { n: killer.multi.n + 1, until: this.now + 10 } : { n: 1, until: this.now + 10 };
      multi = killer.multi.n;
      if (killer.c.id === "darius" && t.lastChamp === killer.id) killer.u.cds[3] = 0;
      if (killer.c.id === "kanye") this.kanyeSwap(killer);
      if (killer.u.rune === "stonks") this.fx("stonks", { id: killer.id });
    }
    for (const a of assists) { a.u.assists++; this.gold(a, 150); if (a.c?.id === "kanye") this.kanyeSwap(a); if (a.u.rune === "stonks") this.fx("stonks", { id: a.id }); }
    for (const c of [killer, ...assists]) if (c?.c) this.xp(c, (140 + 35 * u.level) / (1 + assists.length * 0.5));
    if (u.rune === "pressf") for (const a of this.champs(u.team)) if (a !== t && !a.u.dead) { a.u.cds[3] = Math.max(0, a.u.cds[3] - 15); this.shield(a, 150 + 20 * a.u.level, 3); this.fx("pressf", { id: a.id }); }
    const first = !this.firstBlood && !!killer?.c;
    if (first) this.firstBlood = true;
    this.emit("kill", {
      killer: killer?.id ?? src?.id ?? "", victim: t.id, killerName: killer?.u.name ?? src?.u.name ?? "Palomas", victimName: u.name,
      killerChamp: killer?.c?.id ?? "", victimChamp: t.c.id, team: killer?.u.team ?? src?.u.team ?? 1 - u.team, multi, first, x: u.x, z: u.z,
    });
  }

  gold(rt: RT, g: number) { rt.u.gold += g; rt.u.goldEarned += g; }
  xp(rt: RT, v: number) {
    const u = rt.u;
    if (u.level >= 18) return;
    u.xp += v;
    while (u.level < 18 && u.xp >= xpFor(u.level)) {
      u.xp -= xpFor(u.level);
      u.level++;
      const before = u.maxHp;
      this.stats(rt);
      u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - before));
      this.fx("levelup", { id: rt.id });
    }
  }

  kanyeSwap(rt: RT) {
    rt.twitter = !rt.twitter;
    rt.swapT = 15;
    this.fx("text", { id: rt.id, text: rt.twitter ? "🐦 TWITTER YE" : "😇 MEEK YE" });
  }

  fakeDeath(t: RT) {
    t.u.cds[3] = t.c!.abilities[3].cd * (1 - this.haste(t));
    t.fakeUntil = this.now + 3;
    t.u.untargetable = true;
    t.ccs = []; t.dots = []; t.mt = undefined; t.target = undefined;
    this.fx("fakedeath", { id: t.id, x: t.u.x, z: t.u.z });
    this.emit("chat", { from: "SISTEMA", text: "Epstein didn't kill himself", sys: true });
    this.after(3, () => {
      if (t.u.dead || !this.rt.has(t.id)) return;
      const foes = this.champs(1 - t.u.team).filter(e => !e.u.dead);
      const far = foes.sort((a, b) => dist(b.u, t.u) - dist(a.u, t.u))[0];
      if (far) {
        t.u.x = far.u.x - Math.sin(far.u.rot) * 1.6;
        t.u.z = far.u.z - Math.cos(far.u.rot) * 1.6;
        this.clampPos(t.u);
      }
      t.u.hp = Math.max(t.u.hp, t.u.maxHp * 0.4);
      t.u.untargetable = false;
      this.fx("blink", { x: t.u.x, z: t.u.z, color: 0xffd24a });
    });
  }

  // ---------------------------------------------------------------- commands
  inverted(rt: RT) { return rt.invertUntil > this.now || (rt.buffs.length > 0 && rt.manicNext > this.now && rt.manicInv); }
  cmdMove(id: string, x: number, z: number) {
    const rt = this.rt.get(id);
    if (!rt || rt.u.dead) return;
    if (this.inverted(rt)) { x = 2 * rt.u.x - x; z = 2 * rt.u.z - z; }
    rt.mt = { x, z };
    this.clampPos(rt.mt);
    rt.target = rt.ccs.some(c => c.type === "taunt") ? rt.target : undefined;
    rt.pending = undefined;
    rt.recallT = 0;
    if (rt.plant) { rt.plant = false; rt.stealthUntil = 0; }
  }
  cmdAttack(id: string, tid: string) {
    const rt = this.rt.get(id), t = this.rt.get(tid);
    if (!rt || !t || rt.u.dead || !this.targetableBy(t, rt)) return;
    rt.target = tid;
    rt.mt = undefined;
    rt.pending = undefined;
    rt.recallT = 0;
  }
  cmdStop(id: string) { const rt = this.rt.get(id); if (rt) { rt.mt = undefined; rt.target = undefined; rt.pending = undefined; } }
  cmdRecall(id: string) {
    const rt = this.rt.get(id);
    if (!rt || rt.u.dead || !this.canAct(rt)) return;
    rt.mt = undefined; rt.target = undefined;
    rt.recallT = 8;
    this.fx("recall", { id });
  }
  cmdBuy(id: string, itemId: string) {
    const rt = this.rt.get(id), it = item(itemId);
    if (!rt || !it || !rt.c) return;
    if (!rt.u.dead && dist(rt.u, this.fountain(rt.u.team)) > SHOP_RADIUS + 3) return;
    if (rt.u.gold < it.cost || rt.u.items.length >= 6) return;
    rt.u.gold -= it.cost;
    rt.u.items.push(itemId);
    if (it.mana) rt.u.mana += it.mana;
    this.fx("buy", { id });
  }
  cmdSell(id: string, idx: number) {
    const rt = this.rt.get(id);
    if (!rt || !rt.c || !(idx >= 0 && idx < rt.u.items.length)) return;
    if (!rt.u.dead && dist(rt.u, this.fountain(rt.u.team)) > SHOP_RADIUS + 3) return;
    rt.u.gold += Math.round((item(rt.u.items[idx])?.cost ?? 0) * 0.7);
    rt.u.items.splice(idx, 1);
  }

  pickTarget(rt: RT, x: number, z: number, tid?: string, range = 99) {
    const t = tid ? this.rt.get(tid) : undefined;
    if (this.targetableBy(t, rt) && dist(t.u, rt.u) <= range + 20) return t;
    let best: RT | undefined, bd = 2.2;
    for (const e of this.rt.values()) {
      if (!this.targetableBy(e, rt)) continue;
      const d = Math.hypot(e.u.x - x, e.u.z - z) - (e.c ? 0.6 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  cmdCast(id: string, slot: number, x: number, z: number, tid?: string) {
    const rt = this.rt.get(id);
    if (!rt?.c || rt.u.dead || !(slot >= 0 && slot < 4)) return;
    const ab = rt.c.abilities[slot];
    if (slot === 3 && rt.u.level < 6) return;
    if (!this.canAct(rt) || this.has(rt, "silence") || rt.dash) return;
    if (rt.u.cds[slot] > 0 || rt.u.mana < ab.mana) return;
    if (ab.kind === "target") {
      const t = this.pickTarget(rt, x, z, tid, ab.range);
      if (!t) return;
      if (dist(t.u, rt.u) > ab.range + rt.r + t.r) { rt.pending = { slot, tid: t.id, x, z }; rt.target = undefined; rt.mt = undefined; return; }
      return this.doCast(rt, slot, t.u.x, t.u.z, t);
    }
    this.doCast(rt, slot, x, z);
  }

  doCast(rt: RT, slot: number, x: number, z: number, target?: RT) {
    const c = rt.c!, u = rt.u;
    let ab = c.abilities[slot];
    u.cds[slot] = ab.cd * (1 - this.haste(rt));
    u.mana -= ab.mana * (c.id === "kanye" && !rt.twitter ? 0.7 : 1);
    rt.pending = undefined;
    rt.recallT = 0;
    rt.amogus = false;
    if (rt.plant) { rt.plant = false; rt.stealthUntil = 0; }
    rt.stillT = 0;
    let dx = x - u.x, dz = z - u.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    u.rot = Math.atan2(dx, dz);
    if (c.id === "annie") {
      rt.casts++;
      if (rt.casts >= 4 && ab.dmg) { rt.casts = 0; ab = { ...ab, cc: { type: "stun", dur: 1.5 } }; this.fx("text", { id: rt.id, text: "🔥 STUN LISTO" }); }
    }
    if (rt.u.items.includes("aceite") && ab.dmg) {
      const base = ab;
      ab = { ...base, special: base.special, dot: (base.dot ?? 0) + 60 };
    }
    this.fx(ab.fx, { id: rt.id, x: u.x, z: u.z, tx: x, tz: z, color: ab.color, r: ab.radius, range: ab.range, slot, champ: c.id, delay: ab.delay });

    // champion-specific specials that replace the generic behaviour
    switch (ab.special) {
      case "fakedeath": return this.fakeDeath(rt);
      case "swap": rt.form = rt.form === "m" ? "f" : "m"; return this.fx("text", { id: rt.id, text: rt.form === "m" ? "¡MORTADELO AL FRENTE!" : "¡FILEMÓN AL FRENTE!" });
      case "disguise": return this.disguise(rt, dx, dz);
      case "bacterio": return this.bacterio(rt, x, z, ab);
      case "curtain":
        for (let i = 0; i < 4; i++) this.after(i * 0.7, () => { if (!u.dead) this.shot(rt, dx, dz, i === 3 ? { ...ab, dmg: ab.dmg! * 2 } : ab); });
        return;
    }
    // Epstein passive: Q teleports behind a fully marked target
    if (c.id === "epstein" && slot === 0) {
      const marked = [...rt.marks].find(([tid, n]) => n >= 3 && this.rt.get(tid) && !this.rt.get(tid)!.u.dead && dist(this.rt.get(tid)!.u, u) < 8);
      if (marked) {
        const t = this.rt.get(marked[0])!;
        rt.marks.delete(t.id);
        u.x = t.u.x - Math.sin(t.u.rot) * 1.3; u.z = t.u.z - Math.cos(t.u.rot) * 1.3;
        this.fx("blink", { x: u.x, z: u.z, color: 0xffd24a });
      }
    }
    switch (ab.kind) {
      case "shot": this.shot(rt, dx, dz, ab); break;
      case "target": if (target) this.hit(rt, target, ab); if (target && ab.radius) for (const e of this.enemies(rt, target.u.x, target.u.z, ab.radius)) if (e !== target) this.hit(rt, e, { ...ab, cc: undefined }, 0.6); break;
      case "cone": {
        const half = ((ab.radius ?? 45) * Math.PI) / 360;
        for (const e of this.enemies(rt, u.x, u.z, ab.range)) {
          const a = Math.atan2(e.u.x - u.x, e.u.z - u.z) - u.rot;
          const diff = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
          if (diff <= half || dist(e.u, u) < 1.2) { this.hit(rt, e, ab); if (ab.pull) this.push(e, u.x, u.z, 99, true); }
        }
        break;
      }
      case "aoe": {
        const d = Math.min(len, ab.range);
        const cx = ab.range ? u.x + dx * d : u.x, cz = ab.range ? u.z + dz * d : u.z;
        const go = () => {
          const hits = this.enemies(rt, cx, cz, ab.radius ?? 2);
          for (const e of hits) this.hit(rt, e, ab);
          if (ab.heal) this.heal(rt, rt.u.maxHp * ab.heal * hits.filter(h => h.c).length);
          if (ab.special === "yeezy") for (const a of this.champs(u.team)) if (dist(a.u, { x: cx, z: cz }) < (ab.radius ?? 2)) this.buff(a, { ms: 0.5 }, 2);
          if (ab.special === "whiteparty") {
            const rich = this.champs(1 - u.team).filter(e => !e.u.dead && !e.u.untargetable && dist(e.u, { x: cx, z: cz }) < 12).sort((a, b) => b.u.goldEarned - a.u.goldEarned)[0];
            if (rich) { this.addCC(rich, "suppress", 2.5, rt); this.fx("spotlight", { id: rich.id }); }
            this.shield(rt, rt.u.maxHp * 0.25, 3);
          }
          if (c.id === "mortadelo" && hits.length === 0) rt.rage = Math.min(3, rt.rage + 1);
        };
        ab.delay ? this.after(ab.delay, go) : go();
        if (ab.special === "torrenteR") this.emit("voice", { id: rt.id, text: "¡¿Pero qué invento es esto?!" });
        break;
      }
      case "self":
        if (ab.shield) this.shield(rt, u.maxHp * ab.shield, ab.buff?.dur ?? 3);
        if (ab.buff) this.buff(rt, ab.buff, ab.buff.dur);
        if (ab.stealth) { rt.stealthUntil = this.now + ab.stealth; this.fx("smoke", { x: u.x, z: u.z }); }
        if (ab.special === "nexthit") rt.empowered = ab;
        if (ab.special === "reflect") rt.reflectUntil = this.now + 2;
        if (ab.special === "mantra") u.cds[0] = 0;
        if (ab.special === "manic") { rt.manicNext = this.now + 2; rt.manicInv = false; this.emit("voice", { id: rt.id, text: "I AM A GOD!" }); }
        break;
      case "blink": {
        const d = Math.min(len, ab.range);
        u.x += dx * d; u.z += dz * d;
        this.clampPos(u);
        this.pushOut(rt);
        rt.mt = undefined;
        if (ab.dmg) {
          const t = this.enemies(rt, u.x, u.z, 7).sort((a, b) => dist(a.u, u) - dist(b.u, u))[0];
          if (t) this.homing(rt, t, 30, ab.fx, ab.color ?? 0xffffff, () => this.hit(rt, t, ab));
        }
        break;
      }
      case "dash": {
        let tdx = dx, tdz = dz;
        if (ab.special === "recoil") { tdx = -dx; tdz = -dz; }
        const d = ab.special === "torpedo" || ab.special === "stop" ? ab.range : Math.min(len, ab.range);
        if (ab.special === "moonwalk") { rt.ccImmune = this.now + 0.5; for (const e of this.enemies(rt, u.x, u.z, ab.radius ?? 2)) if (e.c && e.u.range < 3) this.addCC(e, "blind", 1.5, rt); }
        if (ab.special === "spellshield") rt.spellshield = this.now + 3;
        const land = ab.special === "land" || ab.special === "torpedo";
        const stop = ab.special === "stop" || ab.special === "torpedo" || c.id === "rammus" && slot === 0;
        rt.dash = {
          tx: u.x + tdx * d, tz: u.z + tdz * d, speed: ab.special === "torpedo" ? 32 : 20, hit: new Set(), ab: ab.cc?.type === "blind" ? undefined : ab, stop, land,
          onEnd: land ? () => {
            for (const e of this.enemies(rt, u.x, u.z, ab.radius ?? 2)) this.hit(rt, e, ab);
            this.fx(ab.special === "torpedo" ? "boom" : "slam", { x: u.x, z: u.z, r: ab.radius, color: ab.color });
          } : undefined,
        };
        rt.mt = undefined;
        break;
      }
    }
    if (ab.special === "recoil") this.shot(rt, dx, dz, ab);
  }

  shot(rt: RT, dx: number, dz: number, ab: Ability) {
    const id = `p${this.seq++}`;
    const u = rt.u;
    const p: Proj = {
      id, owner: rt, team: u.team, x: u.x + dx * 0.6, z: u.z + dz * 0.6, dx, dz, speed: ab.speed ?? 25, radius: ab.radius ?? 0.6,
      left: ab.range, pierce: ab.pierce, hit: new Set(),
      onHit: t => this.hit(rt, t, ab),
      onMiss: () => { if (rt.c?.id === "mortadelo") rt.rage = Math.min(3, rt.rage + 1); },
    };
    this.addProj(p, ab.fx, ab.color ?? 0xffffff, Math.atan2(dx, dz));
  }
  homing(rt: RT, t: RT, speed: number, fx: string, color: number, onHit: () => void) {
    const p: Proj = { id: `p${this.seq++}`, owner: rt, team: rt.u.team, x: rt.u.x, z: rt.u.z, speed, radius: 0.3, target: t.id, onHit };
    this.addProj(p, fx, color, rt.u.rot);
  }
  addProj(p: Proj, fx: string, color: number, rot: number) {
    this.proj.set(p.id, p);
    const s = new Projectile();
    Object.assign(s, { x: p.x, z: p.z, fx, color, team: p.team, rot });
    this.s.projectiles.set(p.id, s);
  }

  // Apply an ability's effects to a single enemy.
  hit(rt: RT, t: RT, ab: Ability, mult = 1) {
    if (t.u.dead) return;
    const d = this.abDamage(rt, ab) * mult;
    let dmg = d;
    if (ab.execute) dmg *= 1 + (1 - t.u.hp / t.u.maxHp);
    if (d > 0) this.damage(rt, t, dmg, ab.dtype ?? "magic", { ability: true });
    if (ab.cc && t.c !== undefined || ab.cc && ["slow", "root", "stun", "knockup"].includes(ab.cc.type)) this.addCC(t, ab.cc!.type, ab.cc!.dur, rt, ab.cc!.amt ?? 0);
    if (ab.dot) this.dot(t, ab.dot * this.lvlScale(rt) + (ab.ratio ?? 0) * rt.u.ap, 2, rt);
    if (ab.shred) t.shred = { amt: ab.shred, until: this.now + 4 };
    if (ab.shield && ab.kind === "target") this.shield(rt, rt.u.maxHp * ab.shield, 3);
    if (rt.u.items.includes("aceite")) this.addCC(t, "slow", 1, rt, 0.2);
    this.onHitPassives(rt, t, true);
  }

  onHitPassives(rt: RT, t: RT, ability: boolean) {
    if (!rt.c || !t.c) { if (rt.c?.id === "darius") this.dot(t, 20 + 4 * rt.u.level, 5, rt, "phys"); return; }
    switch (rt.c.id) {
      case "ezreal": if (ability) rt.ez = { n: Math.min(5, rt.ez.until > this.now ? rt.ez.n + 1 : 1), until: this.now + 6 }; break;
      case "karma": if (ability) rt.u.cds[3] = Math.max(0, rt.u.cds[3] - 2); break;
      case "darius": this.dot(t, 20 + 4 * rt.u.level, 5, rt, "phys"); break;
      case "epstein": rt.marks.set(t.id, Math.min(3, (rt.marks.get(t.id) ?? 0) + 1)); if (rt.marks.get(t.id) === 3) this.fx("text", { id: t.id, text: "✈️ LOLITA EXPRESS" }); break;
      case "diddy":
        rt.freak = rt.freak.tid === t.id ? { tid: t.id, n: rt.freak.n + 1 } : { tid: t.id, n: 1 };
        if (rt.freak.n >= 3) { rt.freak.n = 0; this.addCC(t, "fear", 1, rt); this.fx("text", { id: t.id, text: "🫗 FREAK OFF" }); }
        break;
    }
  }

  disguise(rt: RT, dx: number, dz: number) {
    const u = rt.u, ab = rt.c!.abilities[0];
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      rt.plant = true; rt.stealthUntil = this.now + 6;
      this.fx("text", { id: rt.id, text: "🪴 ¡Soy una maceta!" });
    } else if (roll === 1) {
      this.fx("text", { id: rt.id, text: "🐂 ¡TOROOO!" });
      rt.dash = { tx: u.x + dx * 7, tz: u.z + dz * 7, speed: 22, hit: new Set(), stop: true, ab: { ...ab, cc: { type: "knockup", dur: 1 } } };
    } else {
      this.fx("text", { id: rt.id, text: "📦 tic... tac..." });
      const x = u.x, z = u.z;
      this.after(1, () => {
        for (const e of this.enemies(rt, x, z, 3)) this.hit(rt, e, ab);
        if (dist(u, { x, z }) < 3) this.damage(undefined, rt, u.maxHp * 0.05, "true");
        this.fx("boom", { x, z, r: 3, color: 0xffaa00 });
      });
    }
  }

  bacterio(rt: RT, x: number, z: number, ab: Ability) {
    const u = rt.u;
    const len = Math.hypot(x - u.x, z - u.z), d = Math.min(len, ab.range);
    const cx = u.x + ((x - u.x) / (len || 1)) * d, cz = u.z + ((z - u.z) / (len || 1)) * d;
    this.after(0.5, () => {
      const good = Math.random() < 0.5;
      this.fx(good ? "healzone" : "gas", { x: cx, z: cz, r: 3 });
      for (const c of this.champs()) {
        if (c.u.dead || dist(c.u, { x: cx, z: cz }) > 3.5) continue;
        if (good && c.u.team === u.team) this.heal(c, c.u.maxHp * 0.25);
        if (!good) { c.invertUntil = this.now + 2; this.fx("text", { id: c.id, text: "🤪 ¡CONTROLES INVERTIDOS!" }); }
      }
    });
  }

  cmdSpell(id: string, slot: number, x: number, z: number, tid?: string) {
    const rt = this.rt.get(id);
    if (!rt?.c || !(slot === 0 || slot === 1)) return;
    const u = rt.u;
    const key = slot ? u.spellF : u.spellD;
    if (u.scds[slot] > 0 || !SPELLS[key]) return;
    if (u.dead !== (key === "revive")) return;
    if (key !== "cleanse" && !this.canAct(rt)) return;
    const done = () => { u.scds[slot] = SPELLS[key].cd; this.fx("spell", { id, spell: key, x: u.x, z: u.z, tx: x, tz: z }); };
    let dx = x - u.x, dz = z - u.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    switch (key) {
      case "flash": u.x += dx * Math.min(len, 4); u.z += dz * Math.min(len, 4); this.clampPos(u); this.pushOut(rt); rt.dash = undefined; rt.mt = undefined; break;
      case "ghost": this.buff(rt, { ms: 0.4 }, 10); break;
      case "heal": {
        const ally = this.champs(u.team).filter(a => a !== rt && !a.u.dead && dist(a.u, u) < 8).sort((a, b) => a.u.hp / a.u.maxHp - b.u.hp / b.u.maxHp)[0];
        for (const a of [rt, ally]) if (a) { this.heal(a, 90 + 15 * u.level); this.buff(a, { ms: 0.3 }, 1); }
        break;
      }
      case "barrier": this.shield(rt, 120 + 25 * u.level, 2); break;
      case "cleanse": rt.ccs = rt.ccs.filter(c => c.type === "suppress"); break;
      case "ignite": case "exhaust": case "punch": case "smite": {
        const range = key === "punch" ? 2.5 : key === "smite" ? 5 : 6;
        const t = key === "smite" ? this.smiteTarget(rt, x, z, tid) : this.pickTarget(rt, x, z, tid, range);
        if (!t || dist(t.u, u) > range + t.r + rt.r) return;
        if (key === "ignite") this.dot(t, 70 + 20 * u.level, 5, rt, "true");
        if (key === "exhaust") { t.exhaustUntil = this.now + 3; this.addCC(t, "slow", 3, rt, 0.3); }
        if (key === "punch") { this.damage(rt, t, 40 + 10 * u.level, "phys"); this.push(t, u.x, u.z, 5); this.addCC(t, "slow", 2, rt, 0.5); this.fx("boom", { x: t.u.x, z: t.u.z, r: 1, color: 0xffffff, text: "¡PUÑETAZO!" }); }
        if (key === "smite") { if (t.u.kind === "mercadona") this.captureMercadona(u.team, rt); else this.damage(rt, t, 600, "true"); }
        break;
      }
      case "teleport": {
        rt.tpT = 3; rt.mt = undefined; rt.target = undefined;
        const tw = [...this.rt.values()].filter(t => t.u.team === u.team && this.isStruct(t) && !t.u.dead).sort((a, b) => Math.abs(a.u.x) - Math.abs(b.u.x))[0];
        this.after(3, () => {
          if (rt.tpT <= 0 || u.dead) return;
          rt.tpT = 0;
          if (tw) { u.x = tw.u.x - side(u.team) * 3; u.z = 2; }
          this.fx("blink", { x: u.x, z: u.z, color: 0xb05aff });
        });
        break;
      }
      case "revive": {
        const f = this.fountain(u.team);
        this.respawn(rt);
        u.hp = u.maxHp * 0.35;
        u.x = f.x; u.z = f.z;
        for (let i = 0; i < 4; i++) this.buff(rt, { ms: 0.2 }, 2 + i * 2);
        break;
      }
      case "siesta": rt.siestaUntil = this.now + 3; rt.mt = undefined; rt.target = undefined; break;
      case "rocket": {
        rt.dash = { tx: u.x + dx * 15, tz: u.z + dz * 15, speed: 36, hit: new Set(), onHit: t => { this.damage(rt, t, 60 + 20 * u.level, "magic"); this.dot(t, 40 + 10 * u.level, 2, rt); } };
        rt.mt = undefined;
        break;
      }
    }
    done();
  }

  smiteTarget(rt: RT, x: number, z: number, tid?: string) {
    const t = tid ? this.rt.get(tid) : undefined;
    if (t && !t.c && !this.isStruct(t) && (t.u.team !== rt.u.team)) return t;
    return [...this.rt.values()].filter(e => !e.c && !this.isStruct(e) && e.u.team !== rt.u.team && !e.u.dead && Math.hypot(e.u.x - x, e.u.z - z) < 2.5)[0];
  }

  respawn(rt: RT) {
    const u = rt.u, f = this.fountain(u.team);
    u.dead = false;
    u.respawn = 0;
    u.x = f.x; u.z = f.z;
    this.stats(rt);
    u.hp = u.maxHp;
    u.mana = u.maxMana;
    rt.mt = undefined;
    rt.target = undefined;
  }

  captureMercadona(team: number, by?: RT) {
    const m = [...this.rt.values()].find(r => r.u.kind === "mercadona");
    if (!m) return;
    this.remove(m.id);
    this.s.hacendado[team] = this.now + 180;
    this.s.merc[0] = 0; this.s.merc[1] = 0;
    this.emit("announce", { text: `¡El ${team ? "PP" : "PSOE"} obtiene el PODER DE HACENDADO! +15% a todo`, sound: "mercadona", by: by?.u.name });
  }

  pushOut(rt: RT) {
    for (const s of this.rt.values()) {
      if (s === rt || !(this.isStruct(s) || s.u.kind === "mercadona")) continue;
      if (s.u.dead && s.u.kind !== "nexus") continue;
      const dx = rt.u.x - s.u.x, dz = rt.u.z - s.u.z, d = Math.hypot(dx, dz), min = s.r + rt.r;
      if (d < min) {
        const nx = d ? dx / d : 0, nz = d ? dz / d : 1;
        rt.u.x = s.u.x + nx * min;
        rt.u.z = s.u.z + nz * min;
      }
    }
    this.clampPos(rt.u);
  }

  stepToward(rt: RT, tx: number, tz: number, dt: number, stopAt = 0.05) {
    const u = rt.u;
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d <= stopAt) return true;
    const step = Math.min(d - stopAt + 0.01, u.ms * dt);
    u.x += (dx / d) * step;
    u.z += (dz / d) * step;
    u.rot = Math.atan2(dx, dz);
    u.moving = true;
    this.pushOut(rt);
    return d - step <= stopAt;
  }

  // ---------------------------------------------------------------- attacks
  attackLogic(rt: RT, dt: number) {
    const t = this.rt.get(rt.target ?? "");
    if (!t || !this.targetableBy(t, rt) || (rt.c && t.u.rune === "npc" && this.now - t.combatT < 2 && t.combatT > 0 && t.c && !this.has(rt, "taunt"))) {
      if (!this.has(rt, "taunt")) rt.target = undefined;
      return false;
    }
    const reach = rt.u.range + rt.r + t.r;
    if (dist(rt.u, t.u) > reach) {
      if (this.canMove(rt) || (this.has(rt, "taunt") && !this.has(rt, "stun") && !this.has(rt, "root"))) this.stepToward(rt, t.u.x, t.u.z, dt, reach - 0.1);
      return true;
    }
    rt.u.rot = Math.atan2(t.u.x - rt.u.x, t.u.z - rt.u.z);
    if (rt.atkT > 0) return true;
    rt.atkT = 1 / Math.max(0.2, rt.u.as || MINIONS[rt.u.kind as MinionKind]?.as || 1);
    this.basicAttack(rt, t);
    return true;
  }

  basicAttack(rt: RT, t: RT) {
    const u = rt.u;
    u.atk = (u.atk + 1) % 60000;
    rt.stillT = 0;
    if (rt.plant) { rt.plant = false; rt.stealthUntil = 0; }
    let dmg = u.ad || MINIONS[u.kind as MinionKind]?.ad || 0;
    let crit = false;
    if (rt.c) {
      rt.hits++;
      if (rt.c.id === "jhin" && rt.hits % 4 === 0) { dmg *= 1.75; crit = true; }
      if (rt.c.id === "caitlyn" && rt.hits % 6 === 0) { dmg *= 1.6; crit = true; this.fx("text", { id: rt.id, text: "🎯 HEADSHOT" }); }
      if (rt.amogus) { dmg *= 1.75; crit = true; rt.amogus = false; rt.stealthUntil = 0; }
      if (rt.u.items.includes("jamon") && t.c) this.after(0.05, () => this.damage(rt, t, t.u.maxHp * 0.03, "true"));
      rt.stealthUntil = Math.min(rt.stealthUntil, this.now);
    }
    if (u.kind === "tower") dmg = t.c ? 220 + this.now / 6 : t.u.maxHp * 0.45;
    if (this.has(rt, "blind")) { this.fx("text", { id: t.id, text: "MISS" }); return; }
    const emp = rt.empowered;
    rt.empowered = undefined;
    const land = () => {
      if (t.u.dead) return;
      if (t.u.items.includes("muleta") && ++t.dodge % 8 === 0) { this.fx("text", { id: t.id, text: "🟥 ¡OLÉ!" }); return; }
      this.damage(rt, t, dmg, "phys", { attack: true, crit });
      if (emp) this.hit(rt, t, emp);
      if (rt.c) this.onHitPassives(rt, t, false);
    };
    const ranged = u.range > 3 || u.kind === "tower";
    if (ranged) {
      const col = u.kind === "tower" ? (u.team ? 0xff5040 : 0x40a0ff) : rt.c?.accent ?? 0xffffff;
      this.homing(rt, t, u.kind === "tower" ? 22 : 28, u.kind === "tower" ? "tower" : u.kind === "caster" ? "baguette" : u.kind === "cannon" ? "cannonball" : rt.c?.id === "mortadelo" ? "slipper" : "atk", col, land);
      if (u.kind === "tower") this.fx("bell", { x: u.x, z: u.z });
    } else land();
  }

  // ---------------------------------------------------------------- tick
  tick(dt: number) {
    if (this.s.phase !== "game") return;
    this.now += dt;
    this.s.time = this.now;
    for (let i = this.later.length - 1; i >= 0; i--) if (this.later[i].at <= this.now) { const l = this.later[i]; this.later.splice(i, 1); l.fn(); }
    if (this.now >= this.nextWave) this.spawnWave();
    this.relics();
    this.mercadona(dt);
    this.banter();
    for (const rt of [...this.rt.values()]) {
      if (!this.rt.has(rt.id)) continue;
      rt.u.moving = false;
      rt.atkT -= dt;
      this.statusTick(rt, dt);
      if (rt.c) this.champTick(rt, dt);
      else if (MINIONS[rt.u.kind as MinionKind]) this.minionTick(rt, dt);
      else if (rt.u.kind === "tower" && !rt.u.dead) this.towerTick(rt);
      if (this.s.phase !== "game") return;
    }
    this.projTick(dt);
  }

  statusTick(rt: RT, dt: number) {
    const now = this.now;
    rt.ccs = rt.ccs.filter(c => c.until > now);
    rt.buffs = rt.buffs.filter(b => b.until > now);
    rt.shields = rt.shields.filter(s => s.until > now);
    for (const d of rt.dots) {
      if (d.until <= now || rt.u.dead) continue;
      this.damage(this.rt.get(d.src), rt, d.dps * dt, d.dtype === "phys" ? "magic" : d.dtype);
    }
    rt.dots = rt.dots.filter(d => d.until > now);
    const u = rt.u;
    let cc = "";
    for (const k of CC_RANK) if (rt.ccs.some(c => c.type === k)) { cc = k; break; }
    put(u, "cc", cc);
    put(u, "shield", Math.round(rt.shields.reduce((a, s) => a + s.amt, 0)));
    put(u, "stealth", rt.stealthUntil > now || rt.amogus);
    // dash (voluntary or forced)
    if (rt.dash && !u.dead) {
      const d = rt.dash;
      const dx = d.tx - u.x, dz = d.tz - u.z, l = Math.hypot(dx, dz) || 1, step = Math.min(l, d.speed * dt);
      u.x += (dx / l) * step; u.z += (dz / l) * step;
      if (l > 0.01) u.rot = Math.atan2(dx, dz);
      const bx = u.x, bz = u.z;
      this.pushOut(rt);
      let arrived = l - step < 0.05 || Math.hypot(bx - u.x, bz - u.z) > 0.01;
      if (!d.forced && (d.ab || d.onHit)) {
        for (const e of this.enemies(rt, u.x, u.z, (d.ab?.radius ?? 1) * 0.8)) {
          if (d.hit.has(e.id)) continue;
          d.hit.add(e.id);
          if (d.onHit) d.onHit(e);
          else if (!d.land) this.hit(rt, e, d.ab!);
          if (d.stop && e.c) { arrived = true; break; }
        }
      }
      if (arrived) { rt.dash = undefined; d.onEnd?.(); }
      u.moving = true;
    }
  }

  champTick(rt: RT, dt: number) {
    const u = rt.u, now = this.now;
    for (let i = 0; i < 4; i++) if (u.cds[i] > 0) u.cds[i] = Math.max(0, u.cds[i] - dt);
    for (let i = 0; i < 2; i++) if (u.scds[i] > 0) u.scds[i] = Math.max(0, u.scds[i] - dt);
    const f = this.fountain(u.team);
    if (u.dead) {
      u.respawn = Math.max(0, u.respawn - dt);
      if (u.respawn <= 0) this.respawn(rt);
      return;
    }
    this.gold(rt, 5 * dt);
    this.xp(rt, 2.5 * dt);
    this.stats(rt);
    // regen + fountain
    const inFountain = dist(u, f) < 8;
    let regen = u.maxHp * 0.004 + u.items.reduce((a, i) => a + (item(i)?.regen ?? 0), 0);
    if (rt.c!.id === "garen" && now - rt.combatT > 5) regen += u.maxHp * 0.02;
    if (inFountain) regen += u.maxHp * 0.12;
    if (rt.siestaUntil > now) regen += u.maxHp * 0.2;
    u.hp = Math.min(u.maxHp, u.hp + regen * dt);
    u.mana = Math.min(u.maxMana, u.mana + (u.maxMana * (inFountain ? 0.12 : 0.008) + (rt.siestaUntil > now ? u.maxMana * 0.2 : 0)) * dt);
    // enemy fountain laser
    if (dist(u, this.fountain(1 - u.team)) < 8) this.damage(undefined, rt, 800 * dt, "true");
    // item passives
    if (u.items.includes("papel") && rt.papelNext <= now) { rt.papelNext = now + 45; this.shield(rt, 500, 45); }
    // Kanye bipolar swap / manic invert
    if (rt.c!.id === "kanye" && (rt.swapT -= dt) <= 0) this.kanyeSwap(rt);
    if (rt.manicNext && rt.manicNext <= now && rt.buffs.some(b => b.dmgMult === 1)) { rt.manicNext = now + 2; rt.manicInv = Math.random() < 0.5; if (rt.manicInv) this.fx("text", { id: rt.id, text: "🙃 CONTROLES INVERTIDOS" }); }
    // Amogus
    if (u.rune === "amogus") {
      rt.stillT = u.moving || rt.target ? 0 : rt.stillT + dt;
      if (rt.stillT > 2 && !rt.amogus) { rt.amogus = true; this.fx("text", { id: rt.id, text: "📮 ඞ" }); }
    }
    // visual flags
    const flags = [
      rt.buffs.some(b => b.dmgMult === 1) && rt.c!.id === "kanye" && "manic",
      rt.c!.id === "kanye" && (rt.twitter ? "twitter" : "meek"),
      rt.c!.id === "mortadelo" && rt.form === "f" && "filemon",
      rt.siestaUntil > now && "siesta",
      rt.plant && "plant",
      rt.amogus && "amogus",
      rt.recallT > 0 && "recall",
      this.s.hacendado[u.team] > now && "hacendado",
      rt.fakeUntil > now && "fakedeath",
      rt.spellshield > now && "spellshield",
      rt.reflectUntil > now && "sheet",
      rt.invertUntil > now && "inverted",
    ].filter(Boolean).join(",");
    put(u, "fx", flags);
    if (rt.dash || rt.fakeUntil > now) return;
    // channels
    if (rt.recallT > 0) {
      rt.recallT -= dt;
      put(u, "recall", 1 - Math.max(0, rt.recallT) / 8);
      if (rt.recallT <= 0) { u.x = f.x; u.z = f.z; put(u, "recall", 0); this.fx("blink", { x: u.x, z: u.z, color: 0x66aaff }); }
      return;
    }
    put(u, "recall", 0);
    if (rt.tpT > 0) { rt.tpT -= dt; return; }
    // forced movement
    const forced = rt.ccs.find(c => c.type === "charm" || c.type === "fear");
    if (forced) {
      const src = this.rt.get(forced.src);
      if (src) {
        const dir = forced.type === "charm" ? 1 : -1;
        const dx = (src.u.x - u.x) * dir, dz = (src.u.z - u.z) * dir, l = Math.hypot(dx, dz) || 1;
        this.stepToward(rt, u.x + (dx / l) * 2, u.z + (dz / l) * 2, dt * 0.6);
      }
      return;
    }
    // pending targeted cast
    if (rt.pending && this.canAct(rt)) {
      const t = this.rt.get(rt.pending.tid ?? "");
      const ab = rt.c!.abilities[rt.pending.slot];
      if (!t || !this.targetableBy(t, rt)) rt.pending = undefined;
      else if (dist(t.u, u) <= ab.range + rt.r + t.r) this.doCast(rt, rt.pending.slot, t.u.x, t.u.z, t);
      else if (this.canMove(rt)) this.stepToward(rt, t.u.x, t.u.z, dt);
      return;
    }
    if (!this.canAct(rt) && !this.has(rt, "taunt")) return;
    if (rt.target && this.attackLogic(rt, dt)) return;
    if (rt.mt && this.canMove(rt)) if (this.stepToward(rt, rt.mt.x, rt.mt.z, dt)) rt.mt = undefined;
  }

  minionTick(rt: RT, dt: number) {
    const u = rt.u;
    if (u.dead) return;
    if ((rt.retarget -= dt) <= 0) {
      rt.retarget = 0.3;
      const cur = this.rt.get(rt.target ?? "");
      if (!cur || !this.targetableBy(cur, rt) || dist(cur.u, u) > 9) {
        let best: RT | undefined, bd = 7;
        for (const e of this.rt.values()) {
          if (!this.targetableBy(e, rt) || e.u.kind === "mercadona") continue;
          if (e.c && (e.u.rune === "npc" || e.u.stealth)) continue;
          const d = dist(e.u, u) + (e.c ? 2.5 : 0);
          if (d < bd) { bd = d; best = e; }
        }
        rt.target = best?.id;
      }
    }
    if (!this.canAct(rt)) return;
    if (rt.target && this.attackLogic(rt, dt)) return;
    // walk the lane toward the enemy base, drift back toward own lane offset
    const tx = side(1 - u.team) * 58;
    this.stepToward(rt, tx, rt.lane ?? 0, dt, 1);
    this.separate(rt);
  }

  separate(rt: RT) {
    for (const o of this.rt.values()) {
      if (o === rt || o.c || this.isStruct(o) || o.u.dead) continue;
      const dx = rt.u.x - o.u.x, dz = rt.u.z - o.u.z, d = Math.hypot(dx, dz), min = (rt.r + o.r) * 0.9;
      if (d > 0 && d < min) { rt.u.x += (dx / d) * (min - d) * 0.5; rt.u.z += (dz / d) * (min - d) * 0.5; }
    }
    this.clampPos(rt.u);
  }

  towerTick(rt: RT) {
    if (!this.targetableBy(this.rt.get(rt.target ?? ""), rt) || dist(this.rt.get(rt.target!)!.u, rt.u) > 8.5) {
      const cand = [...this.rt.values()].filter(e => this.targetableBy(e, rt) && dist(e.u, rt.u) <= 8.5 && e.u.kind !== "mercadona");
      cand.sort((a, b) => (a.c ? 100 : 0) + dist(a.u, rt.u) - (b.c ? 100 : 0) - dist(b.u, rt.u));
      rt.target = cand[0]?.id;
    }
    const t = this.rt.get(rt.target ?? "");
    if (t && rt.atkT <= 0) { rt.atkT = 1.1; this.basicAttack(rt, t); }
  }

  projTick(dt: number) {
    for (const p of this.proj.values()) {
      const s = this.s.projectiles.get(p.id)!;
      let done = false;
      if (p.target) {
        const t = this.rt.get(p.target);
        if (!t || t.u.dead) done = true;
        else {
          const dx = t.u.x - p.x, dz = t.u.z - p.z, l = Math.hypot(dx, dz);
          if (l < p.speed * dt + 0.3) { done = true; p.onHit(t); }
          else { p.x += (dx / l) * p.speed * dt; p.z += (dz / l) * p.speed * dt; s.rot = Math.atan2(dx, dz); }
        }
      } else {
        // sub-step so fast shots don't tunnel through targets
        const steps = Math.ceil((p.speed * dt) / 0.5);
        for (let i = 0; i < steps && !done; i++) {
          const step = Math.min((p.speed * dt) / steps, p.left!);
          p.x += p.dx! * step; p.z += p.dz! * step; p.left! -= step;
          for (const t of this.enemies(p.owner, p.x, p.z, p.radius)) {
            if (p.hit!.has(t.id) || t.u.kind === "mercadona") continue;
            p.hit!.add(t.id);
            if (t.spellshield > this.now) { t.spellshield = 0; this.fx("text", { id: t.id, text: "🥖 ¡ESQUIVADO!" }); done = true; break; }
            p.onHit(t);
            if (!p.pierce) { done = true; break; }
          }
          if (p.left! <= 0 || Math.abs(p.x) > 70) { if (!p.hit!.size) p.onMiss?.(); done = true; }
        }
      }
      if (done) { this.proj.delete(p.id); this.s.projectiles.delete(p.id); }
      else { s.x = p.x; s.z = p.z; }
    }
  }

  spawnWave() {
    this.wave++;
    this.nextWave = this.now + 30;
    for (const team of [0, 1]) {
      const enemyInhibDead = this.rt.get(`st${1 - team}2`)?.u.dead;
      const kinds: MinionKind[] = ["melee", "melee", "melee", "caster", "caster", "caster"];
      if (this.wave % 3 === 0) kinds.splice(3, 0, "cannon");
      if (enemyInhibDead) kinds.unshift("super");
      const apron = this.s.hacendado[team] > this.now;
      kinds.forEach((k, i) => this.after(i * 0.6, () => {
        const m = MINIONS[k];
        const u = new Unit();
        const hp = m.hp * (1 + this.wave * 0.02) * (apron ? 1.3 : 1);
        Object.assign(u, { kind: k, team, x: side(team) * 53, z: (i % 3 - 1) * 1.2, hp, maxHp: hp, ad: m.ad * (1 + this.wave * 0.015), armor: m.armor, as: m.as, ms: m.ms, range: m.range, rot: team ? -Math.PI / 2 : Math.PI / 2, fx: apron ? "apron" : "" });
        const rt = this.add(`m${this.seq++}`, u, m.r);
        rt.lane = (i % 3 - 1) * 1.8;
      }));
    }
  }

  relics() {
    RELICS.forEach((r, i) => {
      if (!this.s.relics[i]) {
        if (this.now >= this.relicAt[i]) this.s.relics[i] = true;
        return;
      }
      const c = this.champs().find(c => !c.u.dead && dist(c.u, r) < 1.3);
      if (!c) return;
      this.s.relics[i] = false;
      this.relicAt[i] = this.now + 40;
      c.relicChain = c.relicChain + 1;
      this.emit("relic", { i, id: c.id, chain: c.relicChain });
      this.after(2.5, () => {
        for (const a of this.champs(c.u.team)) if (!a.u.dead && dist(a.u, r) < 5) { this.heal(a, a.u.maxHp * 0.15 + 60); a.u.mana = Math.min(a.u.maxMana, a.u.mana + a.u.maxMana * 0.15); }
        this.fx("healzone", { x: r.x, z: r.z, r: 5 });
      });
    });
    // chain resets when a champion goes 20s without a relic
    for (const c of this.champs()) if (c.relicChain && this.relicAt.every(t => this.now - (t - 40) > 20)) c.relicChain = 0;
  }

  mercadona(dt: number) {
    if (!this.s.mercadona) return;
    if (!this.mercSpawned && this.now >= MERCADONA_AT) {
      this.mercSpawned = true;
      const u = new Unit();
      Object.assign(u, { kind: "mercadona", team: 2, name: "Mercadona", x: 0, z: 0, hp: 1, maxHp: 1 });
      this.add("mercadona", u, STRUCT_R.mercadona);
      for (const c of this.champs()) if (!c.u.dead && dist(c.u, u) < 3) this.pushOut(c);
      this.emit("announce", { text: "🛒 ¡MERCADOOOONA, MERCADONA! Canaliza la puerta 5s o usa Smite", sound: "mercadona" });
    }
    const m = this.rt.get("mercadona");
    if (!m) return;
    const near = [0, 1].map(t => this.champs(t).filter(c => !c.u.dead && dist(c.u, m.u) < 4.5 && !c.u.moving && !c.target));
    for (const t of [0, 1]) {
      if (near[t].length && !near[1 - t].length) this.s.merc[t] += dt;
      else if (this.s.merc[t]) this.s.merc[t] = 0;
      if (this.s.merc[t] >= 5) return this.captureMercadona(t, near[t][0]);
    }
  }

  banter() {
    if (!this.s.banter) return;
    const k = this.champs().find(c => c.c!.id === "kanye"), d = this.champs().find(c => c.c!.id === "diddy");
    if (!k || !d || k.u.team === d.u.team) return;
    const close = !k.u.dead && !d.u.dead && dist(k.u, d.u) < 10;
    k.beef = d.beef = close;
    if (close && !this.beefDone) {
      this.beefDone = true;
      this.emit("announce", { text: "🥩 ¡BEEF DETECTED! Kanye vs Diddy: +10% velocidad de ataque", sound: "beef" });
    }
  }
}

