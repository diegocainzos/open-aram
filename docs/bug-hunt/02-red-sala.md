# Bug hunt #2 — GameRoom / schema

**Frontera de confianza, red y test**
Alcance: `server/GameRoom.ts, server/schema.ts, server/index.ts, server/sim.test.ts`
Agente: `bug-hunter` (solo lectura) · Fecha: 2026-09-27
Estado: pendiente de arreglar. Marca `- [ ]` → `- [x]` al corregir.

---
## Findings

- [ ] **[med]** `server/GameRoom.ts:21` + `server/GameRoom.ts:92` - password truncation mismatch: `onCreate` stores `str(o.password)` (capped at 40 chars) but `onAuth` compares the raw `o.password`. A >40-char password makes `onAuth` 403 even the creator (create → onAuth fails → room spawns empty and orphans; joiners can never match). Fix: `if (this.password && str(o?.password) !== this.password) throw ...`.
- [ ] **[med]** `server/GameRoom.ts:108` - no reconnect path: `onLeave` sets `p.connected = false` and keeps the Player, but nothing ever calls `allowReconnection()` / `client.reconnect()`, and `this.lock()` (`:134`) blocks fresh joins → any refresh/disconnect from `select` on permanently removes the player (idle champ, permanent 4v5). Colyseus 0.18 has `onDrop` + `allowReconnection`; fix: on ungraceful leave during loading/game do `await this.allowReconnection(client, 60)` and restore `p.connected = true` on return. Or add it to INIT.md §14 as deliberate.
- [ ] **[low]** `server/GameRoom.ts:15` - no message rate limit: Colyseus default is `maxMessagesPerSecond = Infinity` (core `Room.mjs:122`) and `chat` / `ping` / `emote` re-broadcast every message → one griefer floods all clients. Fix: `this.maxMessagesPerSecond = 30;` in `onCreate`.
- [ ] **[low]** `server/GameRoom.ts:96` - `onJoin` has no phase guard (only unreachable today because of `lock()` at `:134`). Defense-in-depth: throw from `onAuth` when `phase !== "lobby"`.
- [ ] **[low]** `server/GameRoom.ts:67-69` - `loaded` trusts client `pct` (`num(m?.pct)` capped only at 100): a client can claim ready before loading. Harm is self-only (`:157`'s `every()` needs all players), so fix only if you care: reject jumps, or just document.
- [ ] **[low]** `server/GameRoom.ts:118-124` - `syncMeta()` is never called after `startGame`/game end, so the room browser keeps `status: "En partida"` once `phase === "end"`. Fix: call `syncMeta()` where the sim's `end` event is broadcast.
- [ ] **[low]** `server/sim.test.ts:30-36` - the summoner loop asserts nothing while the header claims "every summoner fires": a silently-rejected `cmdSpell` passes green — e.g. `revive` at `:32` only casts if garen is actually dead (`u.dead !== (key === "revive")` guard), otherwise the test exercises nothing. Fix: assert per key (e.g. `u.scds[0] > 0` or an `fx`/"spell" event), force garen dead before `revive`.
- [ ] **[low]** `server/sim.test.ts:84,86` - inverted assertion messages ("silenced champion cast its queued ability" on `assert.equal(cds[0], 0)`; "queued cast survives death" on `assert.equal(pending, undefined)`) — reword to the failure they guard against.
- [ ] **[low]** `server/sim.test.ts:250-264` - validation coverage is only `loadout`/`selectMode`; no assert that `inGame` handlers no-op outside `phase === "game"`, no `team` capacity, no `start` host check, no buy/sell economy (cost, 70% refund). A few `send(...)` asserts reuse the existing helper.

No findings: phase gating (all in-game handlers wrapped in `inGame`, all lobby handlers check phase), trust (nothing client-influenced reaches damage/gold/positions — `Number.isInteger` slot/idx, `clampPos`, champ/item whitelists in `sim.ts` cover it), message names/payload keys (all 17 `room.send(...)` calls match `onMessage` handlers and field names), schema contract (every `schema.ts` field is written by Sim/GameRoom, all `put()` keys exist; `loaded`'s fractional → `uint8` truncation is cosmetic).

## Verdict
fix first — the password one-liner at minimum; decide reconnect (implement or mark deliberate in INIT.md §14).
