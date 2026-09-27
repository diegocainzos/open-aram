# BUGS.md — bug log

Each fixed bug has a regression block in `server/sim.test.ts` that fails on the old code.
Status: **fixed** · **open** · **wontfix** (design question / known simplification).

## Champion interactions — round 2 (2026-09-27)

| # | Status | Area | Bug | Fix |
|---|---|---|---|---|
| 14 | fixed | Rune Amogus | Disguise triggered while *walking* (`u.moving` was read before the tick's movement, always false) and moving never dropped it → permanent stealth + crit while roaming. | `stillT` resets on move/attack/dash/pending order; any of those clears `amogus`. |
| 15 | fixed | Rune Modo NPC | Champions could *never* basic-attack an NPC-rune player who kept fighting: the 2s window used `combatT` (refreshed on every hit), and the attacker also dropped its target. | New `RT.combatStart` set on combat entry; attacker keeps target and only holds the swing during the window. |
| 16 | fixed | Epstein Q + passive | After teleporting behind a 3-stack target, the envelope flew along the *old* aim — away from the target, always missing. Teleport also skipped `pushOut`/clamp. | Re-aim from the new position; `pushOut` after teleport. |
| 17 | fixed | Kanye (Twitter Ye) | −40 lethality drove armor negative: 100 phys vs 0 armor dealt 129 (more than true damage), including vs minions/towers. | Floor armor at 0; removed the now-dead negative-resist branch. |
| 18 | fixed | Root vs dashes | Rooted champions could still dash/blink (Kanye E, Rammus Q, Illaoi W, Caitlyn E, Torrente E, Mortadelo R, Ezreal E, Ryze R, Cohete). | `cmdCast` rejects dash/blink when `!canMove`; Cohete too. Flash stays allowed (as in LoL). |
| 19 | fixed | Targeted abilities | Targeted abilities/summoners could target structures: Caitlyn R sniped towers for ~500 from range 30, Ignite/Garen R/Darius R on towers. | `pickTarget` skips structures. |
| 20 | fixed | Darius passive | Basic attacks applied the bleed to towers/inhibs/nexus. | Bleed skips structures. |
| 21 | fixed | Ezreal E vs stealth | Arcane Shift's auto-bolt homed onto stealthed champions (Epstein E, Mortadelo plant, Amogus). | Candidate list filtered with `targetableBy`. |
| 22 | fixed | Death cleanup | Mortadelo respawned still disguised as a potted plant (stealth/plant/amogus/Garen Q empower survived `kill()`). | `kill()` clears `plant`, `amogus`, `stealthUntil`, `empowered`. |
| 23 | fixed | Movement | Walking head-on into a tower/nexus along z=0 (fountain spawn slot, recall landing) stuck the unit forever: radial `pushOut` cancels the whole step. | `stepToward` slides tangentially when a structure blocks most of the step. |
| 24 | fixed | Lobby UI | Spell/rune tooltips were black text on a black box (the `::after` inherited the button's default color) — unreadable. Found in `docs/screenshots/04-lobby.jpg`. | Tooltip gets `color: var(--gold2)`. No test (CSS). |
| 25 | fixed | Torrente E vs piercing shots | Croqueta's spell shield stopped *piercing* skillshots (Ezreal R, Jhin W, Caitlyn Q, Ezreal W) dead, protecting every enemy behind him. | Shield blocks the hit on Torrente only; piercing shots continue. |
| 26 | fixed | Summoners vs recall | Flash/Ghost/etc. didn't cancel the recall channel (flash away and still arrive home). | Any summoner cast resets `recallT`. |

## Round 1 (commit 1a91265)

| # | Status | Area | Bug |
|---|---|---|---|
| 1 | fixed | Levels | Level-up healed twice the max-HP gain; dead champions gained HP from level/items. |
| 2 | fixed | Jamón | True damage landed on blinded/dodged attacks and before ranged hits arrived. |
| 3 | fixed | Casting | Queued out-of-range targeted casts ignored silence and survived death. |
| 4 | fixed | Validation | Fractional ability slot crashed `cmdCast`; fractional sell index deleted an item for free. |
| 5 | fixed | Kanye | Meek Ye's mana check ignored his 30% discount. |
| 6 | fixed | CC | Stunned + taunted units kept basic-attacking. |
| 7 | fixed | Darius | Physical bleed was mitigated by MR. |
| 8 | fixed | Caitlyn E | Fired two nets and never recoiled. |
| 9 | fixed | Rammus R | Hit units under the leap instead of slamming on landing. |
| 10 | fixed | Mortadelo R | Was a plain projectile; the torpedo dash was unreachable. |
| 11 | fixed | Lobby | Prototype keys (`constructor`, `__proto__`) accepted as spell/rune/select mode; loadout without payload threw. |
| 12 | fixed | Select | "1 of 3" gave the 6th+ player no options. |
| 13 | fixed | Client | The WASTED overlay covered the Tab scoreboard. |

## Open / wontfix

| Status | Area | Note |
|---|---|---|
| wontfix | Mortadelo passive | Rage stacks never decay, and the "on miss" trigger is unreachable (he has no skillshots). Design question. |
| open | Drake rune vs dashes | Drake's knockback replaces the dasher's current dash; if it lands on the same tick a stopping dash ends, the knockback is discarded. Minor. |
| open | Jhin R | Curtain Call keeps firing while Jhin is stunned or moving (not a real channel). Design question. |
| open | Post-game awards | "1 muertes" / "1 palomas" (no singular); "Ministro de Pings" is awarded with 0 pings, and the same player can be MVP and Feeder. Cosmetic. |
