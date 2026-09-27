# Bug hunt #4 — sim.ts habilidades

**Campeones, hechizos, items y runas**
Alcance: `server/sim.ts (doCast / champTick / onHitPassives / cmdSpell)`
Agente: `bug-hunter` (solo lectura) · Fecha: 2026-09-27
Estado: pendiente de arreglar. Marca `- [ ]` → `- [x]` al corregir.

---
## Findings

- [ ] **[high]** `server/sim.ts:688` - **Revive is dead code: it can never be cast.** `if (key !== "cleanse" && !this.canAct(rt)) return;` blocks it while dead (`canAct` requires `!rt.u.dead`), and `u.dead !== (key === "revive")` blocks it while alive. Verified with a headless harness: casting revive while dead leaves `dead=true, scd=0`; while alive nothing happens. Spec (data + INIT §9): "Instantly respawn at fountain… usable while dead". `server/sim.test.ts:32` deliberately skips the respawn for revive but never asserts it worked, so `npm test` passes. Fix: `if (key !== "cleanse" && key !== "revive" && !this.canAct(rt)) return;` (revive already self-gates on `u.dead`).

- [ ] **[med]** `server/sim.ts:415` - **Mortadelo's plant stealth survives attack-approach movement.** `rt.plant` is only cleared in `cmdMove` (407), `doCast` (479) and `basicAttack` (827) — `cmdAttack` → `attackLogic` → `stepToward` and the pending-cast chase move the unit without dropping it, so a disguised Mortadelo walks up to a target invisible (`u.stealth` stays true → `targetableBy` rejects him) and gets a free opener. Fix: clear `rt.plant`/`rt.stealthUntil` in `stepToward` (or in `cmdAttack` + the pending branch at 987).

- [ ] **[med]** `server/sim.ts:631` - **Champion passives that spec "hits" only proc on champions.** `if (!rt.c || !t.c) { … return; }` early-outs before the switch, so Ezreal's AS stacks, Karma's R-CD refund and Diddy's fear counter never trigger on minions/wards — only Darius' bleed was special-cased to also work there. Data/INIT say "Hitting abilities grants stacking attack speed", "Ability hits reduce R cooldown", "Every 3rd hit on the same target Fears it". Fix: run the `switch` for any non-structure `t` (keep the `!t.c` early return only for the Darius special or drop it).

- [ ] **[med]** `server/sim.ts:572` - **Moonwalk dashes toward the cursor, not backwards.** Only `recoil` negates the direction (`tdx = recoil ? -dx : dx`); data says "Glide backwards, CC immune; confetti blinds" (Caitlyn's E is the in-repo precedent for a reverse hop). Same ability: the blind is additionally restricted to melee champs (`e.u.range < 3`) in a 2.5 radius at the cast point, which the data text doesn't state. Fix: `const tdx = recoil || ab.special === "moonwalk" ? -dx : dx`, and drop the `range < 3` filter unless intended (then document it in `desc`).

- [ ] **[low]** `server/sim.ts:543` - `whiteparty` grants the caster a hard-coded 25% max-HP shield (`this.shield(rt, rt.u.maxHp * 0.25, 3)`). Not in the ability's `desc`, and no `shield` field on the data ability (looks copied from Epstein's W `shield: 0.25`). Fix: delete the line, or add `shield: 0.25` to the data ability and use `ab.shield`.

- [ ] **[low]** `server/sim.ts:623` - DoT damage deviates from the data contract: `dot` is documented "total magic damage over 2s", but `hit()` computes `ab.dot * lvlScale + ab.ratio * ap`, applying the ability's AP ratio twice (once in `dmg`, once in the dot) and scaling a flat number by level (Torrente Q: 140 → up to ~280 + 0.4·AP over 2s). Fix: `this.dot(t, ab.dot, 2, rt)` (or document the scaling in the `dot` comment).

- [ ] **[low]** `server/sim.ts:340` - Darius R reset fires on **any** Darius kill (`killer.c.id === "darius"`), not just a Noxian Guillotine kill; `special: "reset"` is never read anywhere in `sim.ts` (dead hook, `tibbers` is fine since generic `aoe` covers it). Fix: set a flag in `doCast`/`hit` when `ab.special === "reset"` lands the killing blow and reset `cds[3]` from that.

- [ ] **[low]** `server/sim.ts:839` - Garen's Q empowered hit (`rt.empowered`) is consumed at swing start but applied in `land()` — a muleta dodge (`sim.ts:844`) or the target dying mid-flight drops the silence + damage silently. Fix: clear `rt.empowered` inside `land()` on a successful hit (like blind already keeps it).

- [ ] **[low]** `server/sim.ts:631` - Darius' bleed stacks unbounded: every hit pushes a fresh 5 s DoT (a 2.5 AS cap means ~10 concurrent bleeds). Cap at ~5 concurrent dots (or refresh one dot's `until`) to match "apply a bleed".

- [ ] **[low]** `server/sim.ts:217` - Meek Ye silently gets a 30 % mana-cost discount (`ab.mana * 0.7`). Neither the passive text (data) nor INIT §8 mentions it — passive says only "+30 armor/MR". Fix: remove, or add to the passive `desc`.

- [ ] **[low]** `server/sim.ts:401` - Kanye's "controls randomly invert every 2s" only inverts **move** commands (`inverted()` is used solely in `cmdMove`); attack-move and casts keep normal orientation. Fix if full inversion is intended: mirror the target point in `cmdAttack`/`cmdCast` too.

- [ ] **[low]** `server/sim.ts:1052` - Homing projectiles don't re-check `untargetable`, so a bolt in flight still lands on fake-death Epstein: `damage()` correctly returns 0, but `hit()` (614-626) still applies CC-pre-check passives/dots — Ezreal AS stack, Karma R refund, Epstein marks, Diddy fear stack, DoT application (`dot()` ignores `untargetable`). Same for `basicAttack`'s `land()` (845). Fix: early-return in `hit()`/`land()` when `t.u.untargetable`.

- [ ] **[low]** `server/sim.ts:702` - `cleanse` keeps `suppress` (`filter(c => c.type === "suppress")`), but the data text says "Remove all crowd control" — vs Diddy's R the spell is a no-op. Fix the filter (or the desc).

- [ ] **[low]** `server/sim.ts:697` - Heal summoner picks the **lowest-HP** ally in 8 units, spec says "nearest ally". Fix: sort by `dist(a.u, u)`.

- [ ] **[low]** `server/sim.ts:390` - Contract nit: ability code writes HP directly (`t.u.hp = Math.max(t.u.hp, t.u.maxHp * 0.4)` in `fakeDeath`; also `t.u.hp = 1` at 271 inside `damage()`). Route through `heal()` to keep the HP-write surface at `damage`/`heal`/`kill`.

Clean categories: all damage routes through `Sim.damage()` (dots, fountain, bomb self-hit included) and all deaths through `Sim.kill()`; all CC goes through `addCC()`; no `u.ad` writes outside `stats()`. No ability-id/name typos — every `special` in `shared/data.ts` is reachable (`tibbers` = generic aoe, `reset` handled in `kill()`; only `special: "stop"` in `sim.ts:574` is an unused branch). Client `onFx`/`onSpellFx` covers every fx kind the sim emits with matching payloads (missing `exhaust`/`cleanse`/`smite` cases fall to no-op, which is fine).

## Verdict

fix first (the dead `revive` spell, plus the plant-stealth walk and champion-only passives)
