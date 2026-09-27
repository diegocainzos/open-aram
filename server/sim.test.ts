// Headless sim smoke test: every ability and summoner fires without throwing, combat resolves, nexus ends the game.
import assert from "node:assert/strict";
import { CHAMPS, SPELLS, xpFor } from "../shared/data";
import { GameRoom } from "./GameRoom";
import { State } from "./schema";
import { Sim } from "./sim";

const events: string[] = [];
const s = new State();
s.phase = "game";
const sim = new Sim(s, t => events.push(t), () => {});
sim.setup(CHAMPS.map((c, i) => ({ id: c.id, name: c.name, team: i % 2, champ: c.id, spellD: "flash", spellF: "ignite", rune: "drake" })));
const run = (sec: number) => { for (let i = 0; i < sec * 30; i++) sim.tick(1 / 30); };

// everyone to mid, level up so R unlocks
for (const c of CHAMPS) { const rt = sim.rt.get(c.id)!; rt.u.x = rt.u.team ? 2 : -2; rt.u.z = 0; sim.xp(rt, 5000); }
run(1);
for (const c of CHAMPS)
  for (let slot = 0; slot < 4; slot++) {
    const rt = sim.rt.get(c.id)!;
    if (rt.u.dead) sim.respawn(rt);
    rt.ccs = []; rt.u.cds[slot] = 0; rt.u.mana = rt.u.maxMana;
    sim.cmdCast(c.id, slot, rt.u.team ? -3 : 3, 0);
    run(0.3);
  }
run(3);
assert.ok(events.includes("dmg"), "abilities dealt damage");
assert.ok(events.includes("kill"), "someone died in the brawl");

for (const key of Object.keys(SPELLS)) {
  const rt = sim.rt.get("garen")!;
  if (key !== "revive" && rt.u.dead) sim.respawn(rt);
  rt.u.spellD = key; rt.u.scds[0] = 0; rt.ccs = [];
  sim.cmdSpell("garen", 0, rt.u.x + 3, rt.u.z, undefined);
  run(0.5);
}

run(40);
assert.ok([...s.units.values()].some(u => u.kind === "melee"), "minion waves spawn");

const nexus = sim.rt.get("st13")!;
for (let i = 0; i < 3; i++) sim.rt.get(`st1${i}`)!.u.dead = true;
sim.damage(sim.rt.get("ezreal"), nexus, 1e9, "true");
assert.equal(s.phase, "end");
assert.equal(s.winner, 0);

// ---- regression tests: fresh 1v1 at mid, far from towers/fountains
const duel = (a: string, b: string) => {
  const st = new State(); st.phase = "game";
  const d = new Sim(st, () => {}, () => {});
  d.setup([{ id: "a", name: "A", team: 0, champ: a, spellD: "flash", spellF: "ignite", rune: "stonks" }, { id: "b", name: "B", team: 1, champ: b, spellD: "flash", spellF: "ignite", rune: "stonks" }]);
  const A = d.rt.get("a")!, B = d.rt.get("b")!;
  A.u.x = -1; B.u.x = 1; A.u.z = B.u.z = 3;
  return { d, A, B, run: (sec: number) => { for (let i = 0; i < sec * 30; i++) d.tick(1 / 30); } };
};

{ // level-up heals exactly the max-HP gained (not twice), and never revives a corpse's HP
  const { d, A } = duel("garen", "annie");
  A.u.hp = A.u.maxHp / 2;
  const hp0 = A.u.hp, max0 = A.u.maxHp;
  d.xp(A, xpFor(A.u.level));
  assert.ok(Math.abs(A.u.hp - hp0 - (A.u.maxHp - max0)) < 1, `level-up heal ${A.u.hp - hp0} vs maxHp gain ${A.u.maxHp - max0}`);
  d.kill(A);
  d.xp(A, xpFor(A.u.level));
  A.u.items.push("litrona"); d.stats(A);
  assert.equal(A.u.hp, 0, "dead champion keeps 0 hp");
}
{ // Jamón's true damage only lands with the basic attack: blinded attacks deal nothing
  const { d, A, B, run } = duel("garen", "annie");
  A.u.items.push("jamon"); d.stats(A);
  d.addCC(A, "blind", 2, B);
  const hp0 = B.u.hp;
  d.basicAttack(A, B);
  run(0.2);
  assert.ok(B.u.hp >= hp0 - 1, `blinded attack still dealt ${hp0 - B.u.hp}`);
}
{ // a queued out-of-range targeted cast respects silence and is dropped on death
  const { d, A, B, run } = duel("annie", "garen");
  B.u.x = 9;
  d.cmdCast("a", 0, B.u.x, B.u.z, "b");
  assert.ok(A.pending, "cast queued while out of range");
  d.addCC(A, "silence", 5, B);
  run(2);
  assert.equal(A.u.cds[0], 0, "silenced champion cast its queued ability");
  d.kill(A);
  assert.equal(A.pending, undefined, "queued cast survives death");
}
{ // fractional slot / item index from the wire: no crash, no free item deletion
  const { d, A } = duel("garen", "annie");
  assert.doesNotThrow(() => d.cmdCast("a", 0.5, 0, 0), "fractional ability slot throws");
  A.u.items.push("navaja"); A.u.dead = true;
  const g0 = A.u.gold;
  d.cmdSell("a", 0.5);
  assert.deepEqual([[...A.u.items], A.u.gold], [["navaja"], g0], "fractional sell index deleted an item");
}
{ // Kanye in Meek form can cast with 70% of the listed mana
  const { d, A } = duel("kanye", "annie");
  A.twitter = false; A.u.mana = A.c!.abilities[0].mana * 0.8;
  d.cmdCast("a", 0, 5, 3);
  assert.ok(A.u.cds[0] > 0, "meek Kanye blocked by the undiscounted mana cost");
}
{ // a stunned unit doesn't basic-attack its taunter
  const { d, A, B, run } = duel("garen", "annie");
  d.addCC(A, "taunt", 2, B); d.addCC(A, "stun", 2, B);
  const atk = A.u.atk;
  run(1);
  assert.equal(A.u.atk, atk, "stunned + taunted unit attacked");
}
{ // Darius' bleed is physical: mitigated by armor, not MR
  const { d, A, B, run } = duel("darius", "annie");
  B.u.x = 20; d.buff(B, { armor: 300 }, 10); d.stats(B);
  const hp0 = B.u.hp, armor = B.u.armor;
  d.dot(B, 100, 1, A, "phys");
  run(1.1);
  const want = 100 * 100 / (100 + armor);
  assert.ok(Math.abs(hp0 - B.u.hp - want) < 8, `bleed dealt ${hp0 - B.u.hp}, armor-mitigated ${want}`);
}
{ // Caitlyn E fires one net and recoils backwards
  const { d, A, run } = duel("caitlyn", "annie");
  const x0 = A.u.x, p0 = d.proj.size;
  d.cmdCast("a", 2, x0 + 5, 3);
  assert.equal(d.proj.size - p0, 1, "net count");
  run(0.5);
  assert.ok(A.u.x < x0 - 1, "Caitlyn recoiled backwards");
}
{ // Rammus R leaps: only the landing area is hit, not units under the flight path
  const { d, A, B, run } = duel("rammus", "annie");
  A.u.level = 6; B.u.x = A.u.x + 1.5; B.u.z = 3;
  const hp0 = B.u.hp;
  d.cmdCast("a", 3, A.u.x + 8, 3);
  run(1);
  assert.ok(B.u.hp >= hp0 - 1, "unit under the leap path was hit");
  const t = duel("rammus", "annie");
  t.A.u.level = 6; t.B.u.x = t.A.u.x + 8;
  const hp1 = t.B.u.hp;
  t.d.cmdCast("a", 3, t.B.u.x, 3);
  t.run(1);
  assert.ok(t.B.u.hp < hp1, "landing slam dealt no damage");
}
{ // Mortadelo R is a torpedo dash that stuns on impact
  const { d, A, B, run } = duel("mortadelo", "annie");
  A.u.level = 6; B.u.x = A.u.x + 10;
  const x0 = A.u.x;
  d.cmdCast("a", 3, B.u.x, B.u.z);
  run(0.6);
  assert.ok(A.u.x > x0 + 5, "Mortadelo didn't fly");
  assert.ok(d.has(B, "stun"), "torpedo impact didn't stun");
}
{ // Amogus needs standing still: walking doesn't disguise, and moving drops it
  const { d, A, run } = duel("garen", "annie");
  A.u.rune = "amogus"; d.nextWave = 1e9; A.u.x = -12;
  d.cmdMove("a", -20, 3); run(2);
  assert.equal(A.amogus, false, "disguised while walking");
  run(3); assert.ok(A.amogus, "no disguise after standing still");
  d.cmdMove("a", -12, 3); run(0.1);
  assert.equal(A.amogus, false, "disguise survives moving");
}
{ // Modo NPC only protects the first 2s of combat, even if the NPC keeps attacking
  const { d, A, B, run } = duel("garen", "garen");
  A.u.rune = "npc"; d.nextWave = 1e9;
  d.cmdAttack("a", "b"); d.cmdAttack("b", "a");
  const hp0 = A.u.hp; run(6);
  assert.ok(A.u.hp < hp0 - 100, `NPC rune took only ${hp0 - A.u.hp} in 6s of melee`);
}
{ // Epstein's marked Q teleports behind the target and the envelope still hits it
  const { d, A, B, run } = duel("epstein", "garen");
  d.nextWave = 1e9; A.u.x = -4; B.u.x = 0; B.u.rot = -Math.PI / 2; A.marks.set("b", 3);
  const hp0 = B.u.hp;
  d.cmdCast("a", 0, B.u.x, B.u.z); run(1);
  assert.ok(A.u.x > B.u.x, "no teleport behind the target");
  assert.ok(B.u.hp < hp0, "envelope flew away from the target");
}
{ // Twitter Ye's lethality can't take armor below 0 (no more-than-true damage)
  const { d, A, B } = duel("kanye", "kanye");
  A.twitter = B.twitter = true; d.stats(B);
  assert.equal(B.u.armor, 0);
  assert.ok(Math.abs(d.damage(A, B, 100, "phys") - 100) < 0.01, "lethality amplified damage on 0 armor");
}
{ // rooted champions can't dash or blink
  const { d, A, B } = duel("kanye", "annie");
  d.addCC(A, "root", 2, B);
  d.cmdCast("a", 2, 10, 3);
  assert.equal(A.dash, undefined, "rooted Kanye dashed");
  const e = duel("ezreal", "annie"), x0 = e.A.u.x;
  e.d.addCC(e.A, "root", 2, e.B);
  e.d.cmdCast("a", 2, -8, 3);
  assert.equal(e.A.u.x, x0, "rooted Ezreal blinked");
}
{ // targeted abilities and summoners can't hit structures (Caitlyn R sniping towers)
  const { d, A, run } = duel("caitlyn", "annie");
  A.u.level = 6; A.u.x = 0; A.u.z = 0; d.nextWave = 1e9;
  const tw = d.rt.get("st10")!, hp0 = tw.u.hp;
  d.cmdCast("a", 3, tw.u.x, tw.u.z, "st10");
  d.cmdSpell("a", 1, tw.u.x, tw.u.z, "st10");
  run(2);
  assert.equal(tw.u.hp, hp0, "tower took ability/ignite damage");
}
{ // Darius' bleed doesn't apply to structures
  const { d, A } = duel("darius", "annie");
  const tw = d.rt.get("st10")!;
  d.onHitPassives(A, tw, false);
  assert.equal(tw.dots.length, 0, "tower bleeds");
}
{ // Ezreal E's auto-bolt doesn't home onto stealthed champions
  const { d, A, B, run } = duel("ezreal", "epstein");
  B.stealthUntil = 99; run(0.1);
  const hp0 = B.u.hp;
  d.cmdCast("a", 2, -3, 3); run(1);
  assert.equal(B.u.hp, hp0, "bolt found the stealthed champion");
}
{ // dying clears disguises: Mortadelo doesn't respawn as a potted plant
  const { d, A } = duel("mortadelo", "annie");
  A.plant = true; A.stealthUntil = d.now + 6;
  d.kill(A); d.respawn(A); d.tick(1 / 30);
  assert.ok(!A.u.fx.includes("plant") && !A.u.stealth, `respawned with fx "${A.u.fx}"`);
}
{ // walking head-on into a tower slides around it instead of sticking forever
  const { d, A, run } = duel("garen", "annie");
  d.nextWave = 1e9; A.u.x = -20; A.u.z = 0;
  d.cmdMove("a", -30, 0); run(4);
  assert.ok(A.u.x < -28, `stuck on the tower at x=${A.u.x.toFixed(1)}`);
}
{ // Torrente's spell shield eats a piercing skillshot only for himself, not for allies behind him
  const st = new State(); st.phase = "game";
  const d = new Sim(st, () => {}, () => {});
  d.setup(["ezreal", "torrente", "annie"].map((c, i) => ({ id: c, name: c, team: i ? 1 : 0, champ: c, spellD: "flash", spellF: "ghost", rune: "stonks" })));
  const A = d.rt.get("ezreal")!, T = d.rt.get("torrente")!, N = d.rt.get("annie")!;
  d.nextWave = 1e9; A.u.level = 6;
  A.u.x = -4; T.u.x = 0; N.u.x = 3; A.u.z = T.u.z = N.u.z = 3;
  T.spellshield = 99;
  const hpT = T.u.hp, hpN = N.u.hp;
  d.cmdCast("ezreal", 3, 10, 3);
  for (let i = 0; i < 30; i++) d.tick(1 / 30);
  assert.equal(T.u.hp, hpT, "spell shield didn't block");
  assert.ok(N.u.hp < hpN, "piercing wave stopped at the spell shield");
  // summoner spells cancel the recall channel
  A.u.x = -40; d.cmdRecall("ezreal"); d.tick(1 / 30);
  d.cmdSpell("ezreal", 1, 0, 0);
  for (let i = 0; i < 270; i++) d.tick(1 / 30);
  assert.ok(A.u.x > -50, "recall finished after casting Ghost");
}
{ // "1 of 3" select: every player in a full 5v5 gets three distinct options
  const room = new GameRoom();
  (room as any)._listing = {};
  (room as any).lock = async () => {}; // needs the matchmaker driver
  room.onCreate({ mode: "5v5", selectMode: "three" });
  for (let i = 0; i < 10; i++) room.onJoin({ sessionId: `p${i}` } as any, { name: `p${i}` });
  room.startSelect();
  for (const p of room.state.players.values()) assert.equal(new Set(p.options).size, 3, `${p.name} got ${p.options.length} options`);
  room.setSimulationInterval();
}
{ // lobby messages: prototype keys and missing payloads are rejected
  const room = new GameRoom();
  (room as any)._listing = {}; // normally set by the matchmaker
  room.onCreate({ selectMode: "toString" });
  assert.equal(room.state.selectMode, "aram", "prototype key accepted as selectMode");
  room.onJoin({ sessionId: "a" } as any, { name: "x" });
  const send = (type: string, m: any) => (room as any).onMessageEvents.events[type].forEach((f: any) => f({ sessionId: "a" }, m));
  send("loadout", { spellD: "constructor", spellF: "toString", rune: "__proto__" });
  const p = room.state.players.get("a")!;
  assert.deepEqual([p.spellD, p.spellF, p.rune], ["flash", "heal", "stonks"], "prototype keys accepted in loadout");
  assert.doesNotThrow(() => send("loadout", undefined), "loadout without payload throws");
  room.setSimulationInterval();
}
console.log("sim ok:", events.length, "events");
