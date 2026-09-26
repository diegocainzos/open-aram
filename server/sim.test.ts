// Headless sim smoke test: every ability and summoner fires without throwing, combat resolves, nexus ends the game.
import assert from "node:assert/strict";
import { CHAMPS, SPELLS } from "../shared/data";
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
console.log("sim ok:", events.length, "events");
