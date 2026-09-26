# INIT — El Abismo del Bipartidismo (open-aram)

Complete onboarding and design reference for the project. Read this once before touching code.
`CLAUDE.md` holds the working rules for AI agents; this file explains **what exists and how it works**.

![banner](docs/banner.jpg)

---

## 1. What this is

A browser 3D **ARAM** (All Random All Mid) MOBA inspired by League of Legends, wrapped in Spanish political satire:

- **Blue team = PSOE** (team `0`, spawns at `-X`), **Red team = PP** (team `1`, spawns at `+X`).
- One straight bridge over an abyss, two towers + one inhibitor ("Urna") + one nexus ("Congreso") per team.
- Minions are pigeons; bushes are construction tarps; health relics are beer + olives; the shop is ElChino's bazaar.
- 15 champions (10 LoL, 5 meme), 12 items, 13 summoner spells, 6 meme runes.
- Multiplayer, server-authoritative, 1v1 up to 5v5, public or password-protected rooms.

Everything (models, textures, sound, music, voice) is generated at runtime from code. The only binary assets are
15 MS-Paint-style splash JPGs in `client/public/splash/` and `docs/banner.jpg`.

---

## 2. Quick start

```bash
npm install
npm run dev          # Colyseus server on :2567 + Vite client on :5173 (concurrently)
```

Open **http://localhost:5173** in two browser windows. Type a name, "Crear sala" in one, click the room in the
other, host presses start. Background tabs throttle `requestAnimationFrame`, so click into the window you play.

| Script | What it does |
|---|---|
| `npm run dev` | `dev:server` + `dev:client` via `concurrently -k` |
| `npm run dev:server` | `tsx watch server/index.ts` (auto-restarts on change, **kills live rooms**) |
| `npm run dev:client` | `vite` with root `client/`, port 5173 |
| `npm run build` | `vite build` → `dist/` (client only; the server runs from TS via `tsx`) |
| `npm run typecheck` | `tsc --noEmit` over `server/`, `client/`, `shared/` |
| `npm test` | `tsx server/sim.test.ts` — headless simulation smoke test |

Environment: `PORT` (server, default `2567`). The client connects to `${location.protocol}//${location.hostname}:2567`
(`client/main.ts` `SERVER`), so a LAN IP works if both ports are reachable.

Requirements: Node 20+ (developed on Node 26), a WebGL2 browser. Voice lines use `speechSynthesis` (es-ES voice if installed).

---

## 3. Stack

| Layer | Tech | Notes |
|---|---|---|
| Client render | **Three.js r186** | `MeshToonMaterial` + 3-step gradient map, inverted-hull outlines, `PCFShadowMap`, `THREE.Timer` |
| Client UI | Plain DOM + CSS | HUD is HTML over the `<canvas id="gl">`; no framework |
| Client net | **@colyseus/sdk 0.18** | `Client`, `create`, `joinById`, `onStateChange`, `onMessage` |
| Server | **Colyseus 0.18** + Express | `defineServer`, `defineRoom`, `matchMaker.query` |
| State sync | **@colyseus/schema v5** | builder API: `schema({...}, "Name")`, `t.float32().default()` — **no decorators** |
| Audio | WebAudio (synth) + `speechSynthesis` | No audio files, no Howler |
| Build/dev | Vite 8, TypeScript 7, tsx | `strict`, bundler resolution |

---

## 4. Repository layout

```
.
├── shared/
│   └── data.ts          # ALL game data + constants, imported by server and client (319 lines)
├── server/
│   ├── index.ts         # defineServer, CORS, GET /rooms, listen(PORT)
│   ├── GameRoom.ts      # Colyseus Room: lobby → select → loading → game → end, message validation
│   ├── schema.ts        # Synced state: Player, Unit, Projectile, State
│   ├── sim.ts           # Authoritative simulation (1139 lines): combat, abilities, AI, events
│   └── sim.test.ts      # Headless assert-based smoke test (npm test)
├── client/
│   ├── index.html       # <canvas id="gl">, <div id="bars">, <div id="app">, fonts, favicon
│   ├── style.css        # Every screen + HUD styles (LoL gold/dark theme)
│   ├── main.ts          # Screens: home/room browser, create modal, lobby, select, loading, post-game
│   ├── game.ts          # In-game: Three scene, unit views, VFX, input, HUD, minimap, shop, scoreboard
│   ├── models.ts        # Procedural toon models + canvas textures
│   ├── audio.ts         # Synth SFX, generative music, TTS announcer
│   └── public/splash/   # 15 splash JPGs, one per champion id
├── docs/banner.jpg      # Repo banner
├── e2e.js               # Two-tab Playwright MCP script
├── vite.config.ts       # root: client, port 5173, outDir ../dist
├── tsconfig.json
├── INIT.md / CLAUDE.md / README.md
```

---

## 5. Architecture

```
 Browser A ─┐                                   ┌─ Browser B
            │  WebSocket (Colyseus)             │
            ▼                                   ▼
      ┌──────────────── GameRoom (server/GameRoom.ts) ────────────────┐
      │ onMessage(...) → validate (num/str) → Sim.cmdX(sessionId,…)   │
      │ setSimulationInterval(update, 1000/30)                         │
      │   phase=select  → timer → auto-pick → loading                  │
      │   phase=loading → all loaded (or 20s) → startGame() → new Sim  │
      │   phase=game    → sim.tick(dt)                                 │
      │ patchRate = 33ms → schema diff to every client                 │
      └────────────────────────────────────────────────────────────────┘
                     │ state (schema)          │ messages (fx/dmg/kill/…)
                     ▼                         ▼
      client/main.ts  onStateChange → screen per phase
      client/game.ts  rAF loop: interpolate units, render, HUD, react to fx messages
```

### 5.1 Two kinds of server data

1. **Synced schema** (`server/schema.ts`) — only what clients need to draw: positions, hp, cooldowns, items, stats,
   K/D/A, visual flags. Changing a field here changes the wire format.
2. **Server-only runtime `RT`** (`server/sim.ts`, `interface RT`) — one per unit, keyed by unit id: move target,
   attack target, buffs, CCs, shields, DoTs, dash state, passive counters, recall/teleport timers, etc.
   Never synced. `rt.u` is the unit's schema object.

### 5.2 Two channels to clients

- **State patches** (continuous): the client reads `room.state.units`, `projectiles`, `players`, etc.
- **Messages** (one-shot events): `fx`, `dmg`, `kill`, `announce`, `chat`, `voice`, `relic`, `end`, `ping`, `emote`,
  and team-only `gold`. The client turns these into VFX/SFX/HUD. Emit with `this.fx(kind, {...})` or `this.emit(type, msg)`
  inside `Sim`; team-only with `this.emitTeam(team, type, msg)`.

### 5.3 Netcode choices

- Server simulates at **30 Hz** (`TICK = 1/30`), patches every **33 ms**.
- Client **interpolates** (exponential lerp toward the latest server position). **No prediction, no reconciliation.**
  Acceptable on LAN; over the internet your own champion feels ~50–100 ms late.
- Client input is **intent only** (`move x,z`, `attack id`, `cast slot x z id`) — the server decides everything.

---

## 6. Game flow (phases)

`State.phase`: `lobby → select → loading → game → end`

| Phase | Server (`GameRoom.ts`) | Client (`main.ts`) |
|---|---|---|
| `lobby` | `onJoin` balances teams; first joiner is host; `team`, `loadout`, `chat` messages; `start` (host only, both teams non-empty) | `lobby()` / `renderLobby()`: team columns, switch team, D/F spell + rune pickers, chat, start |
| `select` | `startSelect()` locks the room. `aram`: random champ + 1 reroll, 15 s. `three`: 3 options, 30 s. `draft`: any free champ, 30 s. Timer expiry auto-picks | `select()` / `renderSelect()`: card(s) or grid, reroll button, kit preview |
| `loading` | waits until every connected player reports `loaded ≥ 100` or 20 s | dynamically imports `./game`, calls `prepare()` (builds scene, compiles shaders), reports %, splash grid + rotating `LOADING_TIPS` |
| `game` | `startGame()` → `new Sim(...)`, `sim.setup(players)`, then `sim.tick(dt)` each interval | `game.start(room, chatLog)` → rAF loop |
| `end` | Nexus death sets `phase="end"`, `winner` | nexus explosion plays, 4.5 s later `postGame()`: VICTORIA/DERROTA, awards, graphs, fireworks or rain, TTS line |

Leaving during `lobby`/`select` removes the player; during `game` marks `connected=false` (champion stays, idle).
Host migrates to the next connected player.

### Room browser

`GET http://host:2567/rooms` → `matchMaker.query({name:"aram"})` + metadata `{name, host, mode, locked, selectMode, status}`.
`client/main.ts home()` polls every 3 s, measures ping to that endpoint, filters by text/mode/status. Locked rooms prompt
for the password; the server checks it in `onAuth` (throws `ServerError(403)`).

Create options (`client.create("aram", {...})`): `roomName`, `name` (player name), `mode` (`1v1`…`5v5`),
`selectMode` (`aram|three|draft`), `password`, `banter`, `mercadona`.
**`roomName` and `name` are different fields on purpose** — `name` is the player nickname.

---

## 7. Map & world

Coordinates: X-Z plane, Y up. **1 world unit ≈ 100 LoL units.** Constants live in `shared/data.ts`.

| Thing | Value |
|---|---|
| Bridge | `x ∈ [-66, 66]`, `|z| ≤ 9` (`BRIDGE`), clamped by `Sim.clampPos` |
| Fountain | `x = ±63` (`FOUNTAIN_X`), shop radius 7 (+3 slack server-side). Enemy fountain laser: 800 true dmg/s within 8 |
| Structures | per team, at `side(team) * x`: tower 24 (3000 hp), tower 40 (3500), inhib 48 (2500), nexus 56 (5000). Each is only targetable once the previous one is dead. IDs: `st{team}{0..3}` (nexus = `st{team}3`) |
| Tower AI | range 8.5, attacks every 1.1 s, prefers non-champions (champions get a +100 distance penalty) unless a champion damages an allied champion in range (aggro) |
| Minion waves | first at 5 s, then every 30 s; 3 melee + 3 caster, +1 cannon every 3rd wave, +1 super if enemy inhib is down. HP +2%/wave, AD +1.5%/wave |
| Relics | 4 spots (`RELICS`), first spawn at 20 s, respawn 40 s. Pickup → 2.5 s delay → heal 15% max HP + 60 and 15% mana to allies within 5. 3 in a chain → drunk camera wobble |
| Bushes | 4 tarps (`BUSHES`, `inBush()`). Enemies inside are hidden unless an allied champion is in the same bush (client-side check) |
| Mercadona | at 15:00 (`MERCADONA_AT`) if enabled: neutral unit at `(0,0)`. A team channels 5 s near the door (within 4.5, standing still, not attacking, no enemies near) **or** Smites it → "Poder de Hacendado": +15% all stats for 180 s, minions get aprons and +30% HP |
| Respawn | `5 + 1.3 * level` seconds |
| Recall | 8 s channel, broken by movement, attacks, casts, hard CC, damage |
| Start | level 3, 1400 gold. XP to next level `180 + 100 * lvl` |

Stat growth per level (`Sim.stats`): HP +95, AD +3.5, armor +3.5, MR +1.5, AS +2.5%, mana +40. Ability base damage
scales `+7%/level` (`lvlScale`). AS capped at 2.5. R unlocks at level 6. There is no skill-point system.

---

## 8. Champions

Defined in `shared/data.ts` `CHAMPS` (`Champ` + 4 `Ability` each). Special behaviour is keyed by `ability.special`
and `champ.id` and implemented in `sim.ts` (`doCast`, `stats`, `onHitPassives`, `damage`, `champTick`).

### Ability model

```ts
kind: "shot" | "aoe" | "self" | "dash" | "blink" | "target" | "cone"
dmg, ratio (AD if dtype="phys" else AP), dtype, radius (cone = degrees), speed, delay, pierce,
cc {type, dur, amt}, shield/heal (fraction of max HP), buff {...}, dot, execute, stealth, pull, shred,
special (custom hook), fx (visual cue), color
```

- `shot` → linear projectile (sub-stepped, blocked by Torrente's E spellshield)
- `aoe` → circle at cursor (or self when `range: 0`), optional `delay`
- `self` → buffs/shields on caster
- `dash`/`blink` → movement (dash = travels and hits along the path, blink = instant)
- `target` → needs a hovered/nearby enemy; homing projectile or instant
- `cone` → frontal arc of `radius` degrees

### Roster

| id | Name | Role | Specials |
|---|---|---|---|
| `ezreal` | Ezreal | Marksman | passive AS stacks on ability hit; R global wave |
| `annie` | Annie | Mage | every 4th cast stuns; R `tibbers` AoE slam |
| `ryze` | Ryze | Mage | damage scales with mana; R `warp` blink |
| `jhin` | Jhin | Marksman | 4th attack crits; R `curtain` = 4 sniper shells |
| `caitlyn` | Caitlyn | Marksman | every 6th attack headshot; E `recoil` dash back |
| `garen` | Garen | Fighter | out-of-combat regen; Q `nexthit` silence; R true execute |
| `darius` | Darius | Fighter | bleed on hit; E cone `pull`; R execute with `reset` on kill |
| `rammus` | Rammus | Tank | AD from armor; R `landaoe` leap |
| `illaoi` | Illaoi | Fighter | W leap; E slow shot (passive tentacles simplified away) |
| `karma` | Karma | Support | hits reduce R CD; R `mantra` resets Q + damage buff |
| `torrente` | Torrente | Drunk tank | up to +50% AD/armor at low HP; E `spellshield`; R `torrenteR` stun + 30% shred, "¿Pero qué invento es esto?" |
| `kanye` | Kanye West | Bipolar assassin | Meek/Twitter Ye swap every 15 s or on takedown; W `yeezy` roots enemies, speeds allies; R `manic` 2× AS/dmg, controls invert every 2 s, "I AM A GOD!" |
| `epstein` | Jeffrey Epstein | Conspiracy bruiser | 3 marks → Q teleports behind; W `reflect` 20%; E smoke stealth; R `fakedeath` (also triggers on lethal damage): untargetable 3 s, reappear behind farthest enemy at 40% HP, chat "Epstein didn't kill himself" |
| `diddy` | Diddy | Party control mage | every 3rd hit on same target fears; E `moonwalk` CC-immune + blind; R `whiteparty` suppresses the richest enemy 2.5 s |
| `mortadelo` | Mortadelo y Filemón | Duo tag-team | Filemón rage +20% AD ×3 on misses/heavy hits; Q `disguise` (plant stealth / bull knockup / bomb box); W `bacterio` 50% heal or 50% reversed controls; E `swap` melee ↔ ranged; R `torpedo` stun 1.8 s + "¡¡ZASCA!!" |

Music theme per champion: `champ.theme` (`hiphop | pasodoble | chiptune | epic | disco | dark`).

### Adding a champion

1. Append a `Champ` entry to `CHAMPS` in `shared/data.ts` (unique `id`, 4 abilities, theme).
2. If any ability has a `special`, handle it in `Sim.doCast` (and `stats`/`onHitPassives` for passives).
3. Add a look in `client/models.ts champModel(id, …)` (fallback is a generic humanoid in its colors).
4. Add `client/public/splash/<id>.jpg` (generate with `agy-agent artist`, MS Paint style, ~512 px).
5. Optional: new `fx` cue → handle in `client/game.ts onFx` (unknown cues fall back to a generic burst).
6. `npm test` automatically casts all 4 of its abilities.

---

## 9. Items, summoners, runes

- **Items** (`ITEMS`): 12, tiers 1–3. Stats summed in `Sim.stats`. Passives by `passive` key:
  `dodge` (muleta, 1 in 8 attacks), `jamon` (3% max HP true on hit), `papel` (500 shield every 45 s),
  `aceite` (spells burn + slow), `cunas` (ignore minor slows). Buy/sell only near your fountain or while dead.
  6 slots. Selling refunds 70%.
- **Summoners** (`SPELLS`): flash, teleport (3 s channel to frontmost tower), heal, barrier, ignite, exhaust,
  cleanse, ghost, revive (usable while dead), smite (600 true to minion/Mercadona), punch (knockback + slow),
  siesta (3 s nap, 60% HP/mana; champion damage wakes you stunned), rocket (dash leaving fire).
  Implemented in `Sim.cmdSpell`; visuals in `client/game.ts onSpellFx`.
- **Runes** (`RUNES`): `drake` (on combat: omnivamp **and** shockwave — no Yes/No choice), `fine` (DoT immune, low-HP
  shield), `stonks` (+30% minion gold, bell on takedown), `pressf` (on death: allies −15 s R CD + barrier),
  `amogus` (stand still 2 s → stealth, next attack crits), `npc` (minions ignore you; first 2 s of combat untargetable
  by basic attacks).

---

## 10. Combat pipeline (server)

`Sim.damage(src, target, raw, dtype, opts)` is the single entry point for all damage. Order:

1. Return 0 if the target is dead, untargetable or not `vulnerable()` (NPC rune / muleta dodges are checked by the
   basic-attack path before calling `damage`).
2. Source multipliers: sum of buff `dmgMult`, Exhaust ×0.6, Kanye-vs-Diddy beef ×1.05.
3. Resist: armor (phys) / MR (magic) / 0 (true), reduced by shred, Twitter-Kanye −40 lethality;
   `100/(100+res)` (negative resist amplifies).
4. Siesta: champion damage wakes the target with a 1.5 s stun.
5. Shields absorb in order; Epstein W reflects 20% of absorbed damage to a source within 4.
6. HP loss; `dmgDealt`/`dmgTaken`; cancels recall; champ-vs-champ → assist tracking, combat state, and every allied
   tower within 8.5 retargets the attacker (tower aggro).
7. Lifesteal (attacks only, from items) + omnivamp (Drake rune) heal the source. Mortadelo gains rage on heavy hits.
8. Emit `dmg` (floating numbers). Lethal → Epstein fake death if R is up (level ≥ 6), else `kill()`.
   Non-lethal under 20% with `fine` rune → 30% shield (60 s CD).

`kill()` handles: structures (150 gold to each enemy champ; inhib → super minions; nexus → `winner`, `phase="end"`, `end`
message); minions (shared XP within 12, last-hit gold ×1.3 with Stonks, `cs`, "solo" farm counter, feathers fx);
champions (300 gold kill / 150 assist, 10 s assist window, 10 s multi-kill window, Darius R reset, Kanye swap,
Stonks bell, Press F, first blood, `kill` message, respawn `5 + 1.3·level`). Selling refunds 70%.

Crowd control lives in `rt.ccs`; `canMove`/`canAct` read it. The strongest active CC (by `CC_RANK`) is mirrored to
`unit.cc` for the client's status text.

---

## 11. Client internals (`client/game.ts`)

- `prepare(room, report)` — renderer (created once, reused), scene, lights, fog, `buildMap()`, shader warm-up.
- `start(room, chatLog)` — builds HUD DOM, binds input and messages, starts the rAF `loop()`.
- `loop()` — `syncUnits` (create/destroy/interpolate views + animations), `syncProjectiles`, tweens,
  relic visibility, `updateCamera`, `updateHud`, render.
- **Views**: `Map<unitId, View>`; created in `createView` by `unit.kind` (champ/pigeon/tower/inhib/nexus/mercadona).
- **Visibility**: `visibleToMe()` (team, stealth, bushes).
- **Camera**: follows own champion at `(x, 19z, z ± 11z)`; flipped for red so your enemy is always screen-right;
  snaps if > 30 units away; death zoom + grayscale; drunk wobble; `focus()` override (Y / Space recenter).
- **VFX**: `onFx(m)` switch on `m.k` — rings, bursts, sprites, cones, tibbers, disco ball, smoke, feathers, etc.
  Kill handling in `onKill` (announcer via `speak`, WASTED, slow-mo, fireworks).
- **HUD**: `buildHud()` once; `updateHud()` each frame with throttled heavy parts. Health bars are DOM elements in
  `#bars` projected from 3D. Minimap is a rotated canvas (`toMinimap`/`fromMinimap`).
- `#app > .hud { pointer-events: none }` — HUD children opt back in. If clicks stop reaching the canvas, check this.

### Controls

| Input | Action |
|---|---|
| Right-click | move / attack hovered enemy (hold + drag keeps moving) |
| Q W E R | abilities at cursor (hovered unit sent as target) |
| D F | summoner spells |
| B / S | recall / stop |
| P | shop (ElChino) — only works near fountain |
| C | stats panel |
| TAB (hold) | scoreboard |
| T | emote wheel |
| Z / X / V / G, Alt+click | pings: danger / on my way / assist / missing (team only) |
| Enter | chat · Esc: menu (volume, music mode champion/ambient/off) |
| Wheel | zoom · Y / Space: recenter |
| Minimap right-click | move there |

---

## 12. Audio (`client/audio.ts`)

- `audio()` lazily creates the `AudioContext` on first user gesture. Buses: master / sfx / music (`vol`).
- `sfx(name, vol)` — synthesized: `bell, tsss, pop, whistle, pew, hit, boom, fire, coo, levelup, buy, stonks, wasted,
  slam, firework, jingle, fanfare` (Marcha Real on Torrente penta), `gospel`.
- `speak(text, {lang, rate, pitch})` — `speechSynthesis`, prefers an `es-ES` voice (announcer = Torrente lines).
- Music: step sequencer with `THEMES` (`hiphop, pasodoble, chiptune, epic, disco, dark, ambient, fight`).
  `music.mode` = `champion` (your champ's theme) | `ambient` (switches to `fight` during teamfights) | `off`.

---

## 13. Testing

### Headless sim test — `npm test`

`server/sim.test.ts` builds a `State` + `Sim` with all 15 champions, teleports them to mid, levels them up, casts
every ability, fires every summoner, runs 40 s for waves, destroys the red nexus and asserts `phase === "end"`
and `winner === 0`. Prints `sim ok: N events`. **Run it after any change to `sim.ts` or `shared/data.ts`.**

### Two-player browser E2E — `e2e.js`

With `npm run dev` running and the Playwright MCP available, call `browser_run_code_unsafe` with `filename: e2e.js`.
It creates a 1v1 room as "Pedro", joins as "Alberto" in a second tab, starts, walks both champions to mid, spams
abilities and attacks, saves `/tmp/aram-{mid,fight}{1,2}.png` and returns HP/gold/feed. It calls `bringToFront()`
before every action because background tabs are throttled.

`window.room` is exposed by `client/main.ts` for debugging: `room.state.units.get(room.sessionId)`.

### Typecheck / build

`npm run typecheck` must be clean. `npm run build` warns about a >500 kB chunk (three.js) — expected.

---

## 14. Known simplifications (deliberate)

| Area | Simplification | Upgrade path |
|---|---|---|
| Netcode | No client prediction / reconciliation | predict own movement in `syncUnits`, reconcile on patch |
| Vision | Bush/stealth hiding is client-side (cheatable) | per-client state filtering (`@view` / `StateView` in Colyseus) |
| Leveling | Ability ranks derived from level, no skill points | add `skill` message + `u.ranks[]` |
| Kits | Tibbers/tentacles are one-shot AoE, not units; Illaoi passive skipped | spawn pet units in `Sim` |
| Drake rune | Both effects auto, no Yes/No click | `drake` message from the popup |
| Mercadona | Channel isn't interrupted by damage | reset `merc[t]` in `damage()` |
| Structures | Inhibitors don't respawn | timer in `kill()` |
| Death | No 3 s kill replay | buffer last 3 s of positions client-side |
| Assets | Procedural models, no Sketchfab/GLB | replace `champModel(id)` with `GLTFLoader` |
| Audio | Synth + TTS only, no Howler/recordings | drop files in `client/public/audio` |

---

## 15. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Room list empty / "failed to fetch" | server not running on :2567, or firewall. `curl localhost:2567/rooms` |
| Clicks do nothing in game | an element above the canvas captures pointer events — check `pointer-events` in `style.css` |
| Camera stuck at origin / clicks land wrong | tab was in background; click into it (camera snaps when > 30 units off) |
| Game kicks everyone after editing server code | `tsx watch` restarted the process; rooms are in-memory |
| No voice | no `speechSynthesis` voice installed; SFX still work |
| No sound at all | AudioContext needs a user gesture first; check Esc menu volumes |
| `flatShading` TS error | not allowed on `MeshToonMaterial` in r186 types — don't use it |
