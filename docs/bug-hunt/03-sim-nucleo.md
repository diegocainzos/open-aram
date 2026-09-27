# Bug hunt #3 — sim.ts núcleo

**Tick, daño, muerte, CC, economía, IA**
Alcance: `server/sim.ts (pipeline base)`
Agente: `bug-hunter` (solo lectura) · Fecha: 2026-09-27
Estado: pendiente de arreglar. Marca `- [ ]` → `- [x]` al corregir.

---
## Findings
- [ ] **[med]** `server/sim.ts:205` - `stats()` compares **rounded** `u.maxHp` (`oldMax`, line 183) against **raw** `maxHp`; with Hacendado's `maxHp *= 1.15` (line 200) raw is fractional (e.g. 2708.25 vs stored 2708), so `u.hp += maxHp - oldMax` re-fires **every tick** → ~7.5 HP/s free self-heal per champ for the whole 180 s buff (verified numerically: +75 hp in 10 s of untouched out-of-combat time). Fix: round first — `const nMax = Math.round(maxHp); if (nMax > oldMax && oldMax > 1 && !u.dead) u.hp += nMax - oldMax;` and use `nMax` in the `put(u, "maxHp", …)`.
- [ ] **[med]** `server/sim.ts:869` - `rt.u.moving = false` is an unconditional schema write for every unit every tick (plus `u.hp`/`u.mana` at lines 938–939, which are exact no-ops when at full). Per CLAUDE.md rule 7 these no-op writes hit the wire every patch for ~50+ units. Fix: `put(u, "moving", false)`, `put(u, "hp", …)` / `put(u, "mana", …)` for the regen lines (or early-out when `regen === 0 && u.hp === u.maxHp`).
- [ ] **[med]** `server/sim.ts:887` - DoTs deal damage (and `emit("dmg")` at line 268) **every tick**: one Ignite = 150 `dmg` messages in 5 s, each `Math.round`ed to 0/1 noise, DoT kill credit/emits fine but the message flood is pure garbage. Fix: accumulate DoT into a per-dot `acc` and tick/emit once per 0.5–1 s (`if (now - (d.last ?? 0) >= 0.5)` applying `dps * elapsed`).
- [ ] **[low]** `server/sim.ts:429` - gold accrual `this.gold(rt, 5 * dt)` (line 929) into a `float32` schema field accumulates rounding error over a long game, so `rt.u.gold < it.cost` can reject a buy the HUD shows as affordable (e.g. 349.9998 vs 350). Fix: `if (rt.u.gold + 0.05 < it.cost …)` or keep gold as a double in `RT` and `put` a rounded value.
- [ ] **[low]** `server/sim.ts:222` - `raw <= 0` does **not** reject NaN (`NaN <= 0` is false); any NaN damage would set `hp = NaN`, after which the unit never dies (`hp <= 0` false) and heals clamp to NaN. Fix: `if (!(raw > 0)) return 0;`.
- [ ] **[low]** `server/sim.ts:154` - `buff()` always pushes, so same-stat buffs **sum** instead of refresh; any buff whose duration ≥ its cooldown stacks without bound (currently only reachable via `cmdSpell` revive's 4 stacked `ms: 0.2` buffs). Fix: replace an existing entry with the same non-zero keys (`t.buffs = t.buffs.filter(b => !(same keys))` before push).
- [ ] **[low]** `server/sim.ts:968` - `put(u, "fx", flags)` sits after the dead-branch `return` (line 923), so corpses keep their last live flags (`recall`, `siesta`, `manic`, …) until respawn. Fix: clear `u.fx = ""` in `kill()` or move the flags block above the dead return.

Categories with no findings: division by zero (all `/` sites guarded by `|| 1` / `Math.max` / `maxHp || 1`; res can't reach −100), level/XP curve off-by-one (`xpFor(u.level)` subtract-then-increment is correct), double-kill/re-entrancy (`u.dead` set first in `kill()`, reflect recursion `noReflect`-capped, AoE loops hold snapshots and `hit()`/`addCC`/`damage` all dead-guard), negative hp/mana/gold (clamped in `stats()`/`champTick`/`kill()`), unclamped positions (every displacement path — dash, `stepToward`, blink, flash, `push`, teleport — funnels through `pushOut()` which ends in `clampPos`), stale refs to deleted units (`rt.target`/`Proj.target` self-clear via `get()` misses, `assist` filtered with `.filter(Boolean)`, `d.src`/`p.owner` dangling refs are harmless-orphan writes; the `!.u` derefs in `towerTick`/`projTick` are short-circuit-safe), float precision beyond gold (time/xp/dmg counters stay far below float32 precision loss), tick-rate assumptions (everything is dt-scaled; `TICK` only lives in `GameRoom`), win conditions / nexus end / phase transitions (correct, `tick()` bails mid-loop on `phase !== "game"`); no surrender exists to check.

## Verdict
fix first (the `:205` hp-drift is live unintended healing; the rest is one-liners)
