# Bug hunt #1 — shared/data.ts

**Datos vs implementación**
Alcance: `shared/data.ts (317 líneas)`
Agente: `bug-hunter` (solo lectura) · Fecha: 2026-09-27
Estado: pendiente de arreglar. Marca `- [ ]` → `- [x]` al corregir.

---
## Findings
- [ ] **[high]** `server/sim.ts:688` (promised by `shared/data.ts:289`) - `revive` is unreachable: the gate `if (u.dead !== (key === "revive")) return;` lets a dead player past, but the very next line `if (key !== "cleanse" && !this.canAct(rt)) return;` bails because `canAct` requires `!rt.u.dead`. Dead players can never cast it (verified at runtime: `scds[0]` stays 0, unit stays dead). INIT.md:249 explicitly says "revive (usable while dead)". `sim.test.ts:41` fires it but asserts nothing, so it passes silently. Fix: `if (key !== "cleanse" && key !== "revive" && !this.canAct(rt)) return;` (and add an assert in sim.test.ts: dead Garen + `cmdSpell` → `!u.dead && hp === 0.35*maxHp`).
- [ ] **[med]** `shared/data.ts:153` and `shared/data.ts:164` vs `server/sim.ts:135` - the `ratio` on `dtype: "true"` abilities is applied to **AP** (`ab.dtype === "phys" ? u.ad : u.ap`). Demacian Justice (0.6) and Noxian Guillotine (0.75) belong to Garen/Darius, who stack AD — measured: at 20 AP the 0.6 ratio adds 12 damage; at 0 AP it adds nothing. Both ratios are dead scaling (0.75 is exactly LoL's Darius-R bonus-AD ratio). Fix: use `rt.u.ad` for `dtype: "true"` in `abDamage`, or drop `ratio` from those two abilities and say so in the `desc`.
- [ ] **[low]** `client/game.ts:674` - `onSpellFx` has no case for `exhaust`, `cleanse`, `smite` (3 of the 13 `SPELLS` keys at `shared/data.ts:281-293`); their casts are visually silent client-side. Fix: add three one-line cases (ring/text).
- [ ] **[low]** `shared/data.ts:262,270,276` - `Item.passive` and `Item.tenacity` are dead data: no sim code reads them (`muleta`'s dodge, `cunas`'s 0.7 tenacity and slow-immunity are hardcoded by item id at `server/sim.ts:141-142,843`). Works today, but the next item with `passive`/`tenacity` will be silently ignored. Fix: consume `item(i)?.passive` / a summed `tenacity` in `addCC`/`basicAttack`, or delete both fields.
- [ ] **[low]** `server/sim.ts:623` - DoT totals re-add the ability's AP ratio (`ab.dot * lvlScale + ab.ratio * u.ap`) on top of the full `abDamage` ratio already dealt by `hit()`, so Torrente Q / Diddy W / aceite burns double-dip `ratio`. Fix: drop the `+ (ab.ratio ?? 0) * rt.u.ap` term, or zero `ratio` in the data on dot abilities.
- [ ] **[low]** `shared/data.ts:287` - Cleanse `desc` says "Remove all crowd control", but `sim.ts:715` keeps `suppress` (`filter(c => c.type === "suppress")`). Fix the desc: "…except suppression."
- [ ] **[low]** `shared/data.ts:183` - Illaoi Q `desc` says "Delayed line slam" but has no `delay` and is an instant 15° cone. Fix the desc ("line slam") or add `delay`.
- [ ] **[low]** `shared/data.ts:115` - Ryze passive `desc` says "bonus mana", `sim.ts:136` uses `u.maxMana * 0.03` (includes base mana). Fix the desc to "mana" or subtract `c.mana`.
- [ ] **[low]** `shared/data.ts:52` - comment says damage "scales +8%/level", `lvlScale` (`sim.ts:172`) and INIT.md:184 say 7%. Fix the comment.
- [ ] **[low]** `server/sim.ts:1094` - minion spawns at `±53` sit inside the enemy-side… own nexus collider (nexus at ±56, r 3.2 vs spawn distance 3.0): every unit spawns overlapped and is shoved out on its first `pushOut`. Harmless today, but spawn at `±52` (or call `pushOut` at spawn) to make it deterministic.

No findings for: rune keys (all 6 have real `u.rune ===` paths), SPELLS↔`cmdSpell` case coverage (all 13 cased — only the revive gate above breaks one), duplicate ids / 4-ability tuples / missing required fields / CC-dtype unions (script-checked, clean), map geometry (structure ids `st{team}0-3` correct, bushes/relics inside the bridge, no impassable walls), and `clash`/targeting fields (no such concept exists in this repo). Illaoi's unimplemented passive and instant-AoE Tibbers are excluded per INIT.md §"Kits" known simplifications.

## Verdict
fix first (the dead `revive` summoner; the true-damage ratio question is a quick decision, then ship)
