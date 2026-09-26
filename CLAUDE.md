# CLAUDE.md — open-aram (El Abismo del Bipartidismo)

Working rules for AI agents in this repo. **Read `INIT.md` first** for the full design reference
(map numbers, champion kits, combat pipeline, flow). This file is about *how to change things safely*.

## Project in one paragraph

Browser 3D ARAM MOBA. Three.js r186 client (toon shading, DOM HUD) + Colyseus 0.18 authoritative server at 30 Hz.
Spanish political satire: blue = PSOE (team 0, −X), red = PP (team 1, +X), pigeons as minions, 15 champions
(10 LoL + Torrente, Kanye, Epstein, Diddy, Mortadelo y Filemón). All models/textures/audio are procedural code.
UI text is Spanish; code, identifiers and comments are English.

## Commands

```bash
npm run dev          # server :2567 (tsx watch) + client :5173 (vite)
npm test             # headless sim smoke test — REQUIRED after touching server/sim.ts or shared/data.ts
npm run typecheck    # tsc --noEmit — REQUIRED before declaring any change done
npm run build        # vite build; the >500 kB chunk warning is expected (three.js)
```

Definition of done for any change: `npm run typecheck` clean **and** `npm test` prints `sim ok`. For visible
client changes, also run the two-tab E2E (`e2e.js`, see below) or at least load the game in a browser.

## File map — where to put things

| You want to… | Edit |
|---|---|
| Tune numbers, add a champion/item/spell/rune/tip, change map layout | `shared/data.ts` (single source of truth, imported by both sides) |
| Change game rules, damage, AI, abilities, events | `server/sim.ts` |
| Change lobby/select/loading flow, room options, message validation | `server/GameRoom.ts` |
| Sync a new field to clients | `server/schema.ts` (only if the client must *draw* it) |
| Menus, room browser, lobby, champion select, loading, post-game screens | `client/main.ts` |
| 3D scene, VFX, input, HUD, minimap, shop, scoreboard | `client/game.ts` |
| Meshes / canvas textures | `client/models.ts` |
| Sounds, music themes, announcer voice | `client/audio.ts` |
| Styles for anything above | `client/style.css` |

Do not create new files unless a module genuinely has nothing to share with the existing ones.
The project is intentionally ~10 source files.

## Architecture rules (do not break)

1. **Server is authoritative.** Clients send intents only (`move`, `attack`, `cast`, `spell`, `recall`, `buy`, `sell`,
   `stop`, `ping`, `emote`, `chat`, plus lobby messages). Never let the client decide damage, positions, gold or cooldowns.
2. **Validate every message** in `GameRoom.ts` with the existing `num()` / `str(v, max)` helpers before it reaches `Sim`.
   In-game handlers are wrapped in `inGame(...)` so they no-op outside `phase === "game"`.
3. **Schema vs RT split.** Synced, drawable data → `schema.ts` `Unit`/`State`. Timers, buffs, CC, targets, passive
   counters → the server-only `RT` interface in `sim.ts`. Adding a schema field costs bandwidth every patch; prefer RT.
4. **Schema v5 builder API only**: `schema({ field: t.float32().default(0) }, "Name")`, `t.array("string")`,
   `t.map(Unit)`. No `@type` decorators, no `extends Schema`.
5. **One-shot events are messages, not state.** Use `this.fx(kind, {...})` (→ client `onFx` switch on `m.k`),
   `this.emit(type, msg)` for broadcasts, `this.emitTeam(team, type, msg)` for team-only. The client falls back to a
   generic ring/glow for unknown fx kinds, so a new server fx is safe even before the client handles it.
6. **All damage goes through `Sim.damage()`.** All deaths go through `Sim.kill()`. All CC through `addCC()`. All stat
   recomputation through `stats()`. Don't write to `u.hp` / `u.ad` etc. directly from ability code.
7. **Use `put(u, key, value)`** for per-tick schema writes in hot paths — it skips no-op writes so they don't hit the wire.
8. Units: world unit ≈ 100 LoL units. Always clamp positions with `clampPos`; use `side(team)` for mirroring
   (team 0 → −1, team 1 → +1). Structure ids are `st{team}{0..3}` (3 = nexus); champion unit id = the player's
   `sessionId`; minions `m{seq}`; Mercadona `"mercadona"`.
9. Client camera is flipped for team 1 (`flip`) so the enemy base is always screen-right. Any screen↔world math must
   go through `groundAt()` / the raycaster, never assume orientation.
10. `#app > .hud { pointer-events: none }` — HUD children opt back in with `pointer-events: auto`. A new full-screen
    element without this will swallow canvas clicks.

## How to add things

### Champion
1. Append to `CHAMPS` in `shared/data.ts`: unique lowercase `id`, stats, `passive`, exactly 4 `abilities`, `theme`.
2. Use generic ability fields (`kind`, `dmg`, `ratio`, `cc`, `shield`, `buff`, `dot`, `execute`, `pull`, `shred`,
   `stealth`) first. Only reach for `special: "name"` when generic fields can't express it; implement the special in
   `Sim.doCast` (the `switch (ab.special)` near the top, or the inline `ab.special === "…"` checks per ability kind). Passive logic goes in `stats()`, `onHitPassives()`,
   `damage()` or `champTick()` keyed by `c.id`.
3. Model: add a `case "<id>"` in `client/models.ts champModel()` (default is a plain humanoid in `color`).
4. Splash: `client/public/splash/<id>.jpg` — generate with `agy-agent artist` (MS Paint style).
5. `npm test` casts all four abilities automatically — it must still pass.

### Item / summoner / rune
- Item: add to `ITEMS`; stat keys are summed automatically in `stats()`. A `passive` key needs code in `sim.ts`
  (grep existing `"jamon"`, `"papel"`, `"aceite"`, `"cunas"`, `"dodge"`).
- Summoner: add to `SPELLS`, implement in `Sim.cmdSpell` switch, visual in `client/game.ts onSpellFx`, icon is the emoji.
  The test fires every key in `SPELLS`.
- Rune: add to `RUNES`, implement by checking `u.rune === "<key>"` where relevant.

### Screen / lobby option
Create options flow `client/main.ts createModal()` → `client.create("aram", opts)` → `GameRoom.onCreate(o)` →
`State` field → `syncMeta()` if it must show in the room browser. Remember `roomName` ≠ `name` (player nickname).

## Testing

- `server/sim.test.ts` is the one runnable check: plain `node:assert`, no framework. Extend it with an assertion
  when you add non-trivial server logic (a new event, win condition, economy rule). Don't add a test framework.
- `e2e.js` is a Playwright-MCP script: with `npm run dev` running, call `browser_run_code_unsafe` with
  `filename: e2e.js`. It opens two tabs, plays a 1v1 and writes `/tmp/aram-*.png`. **Background tabs are throttled**
  (rAF paused) — always `bringToFront()` the tab you drive, or the camera/clicks will be wrong.
- `window.room` is exposed for debugging in the browser console / `browser_evaluate`
  (`room.state.units.get(room.sessionId)`).
- `tsx watch` restarts the server on every server-side save, which **drops all rooms**. Reload the clients after
  editing server code.

## Code style

- TypeScript strict (with `noImplicitAny: false`). Dense, pragmatic style: short helpers, early returns, one-liners
  where readable. Match the surrounding density — don't expand compact code into verbose code.
- No new dependencies without a real need. Three, Colyseus, schema, SDK, Vite, tsx, TypeScript, concurrently is the full set.
- No frameworks on the client: DOM strings via `h()` / `innerHTML`, always escape user text with `esc()`.
- Materials: use `toon(color)` / `mesh(geo, color)` from `models.ts` (cached materials + outline). `flatShading`
  is not a valid `MeshToonMaterial` option in r186 types.
- Use `THREE.Timer` (not `Clock`), `PCFShadowMap` (not `PCFSoftShadowMap`) — the others log deprecation warnings.
- Spanish for player-facing strings (announcer, HUD labels, chat system messages); English for code and comments.
- Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and the upgrade path.

## Known deliberate simplifications

No client prediction; bush/stealth hiding is client-side; no skill points (R at level 6); Tibbers/tentacles are
instant AoE not pets; Drake rune applies both effects; Mercadona channel not interrupted by damage; inhibitors
don't respawn; no kill replay; procedural models only; synth audio + `speechSynthesis` only.
See `INIT.md §14` for upgrade paths. Don't "fix" these unless asked.

## Workflow conventions (repo owner)

- Commit or push **only when asked**. Use `gh` for GitHub operations. Remote: `diegocainzos/open-aram`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Library docs via Context7 (Colyseus 0.18 and schema v5 changed a lot vs older versions — don't trust memory).
- Images via `agy-agent artist` first; `openrouter-image` only as fallback. Trivial lookups/edits → `agy-agent minion`.
