# MISSION: open-aram → LoL-tier graphics (full rebrand)

Work repo: `/home/diego/Projects/arameo-spain`. Before touching ANYTHING:
1. Read `CLAUDE.md` cover to cover (architecture rules, art standards, definition of done).
2. Read `INIT.md` (full design: map numbers, champions, pipeline).
3. `npm run typecheck` and `npm test` must stay green after every step.

## Why you exist
The author is fed up: the graphics are disgusting, like a 2009 browser game.
The downloaded GLB champion models look great; everything else is embarrassing.
**It is not Three.js's fault** — it is art direction. The bar you are chasing is
"modern stylized at LoL/Fortnite/Wild Rift level": cel-shading with clean light,
legible shadows, depth, materials with real detail. Follow the art checklist in `CLAUDE.md`.

## Roadmap (in order, each step completes the previous one)

### 1. Light + atmosphere (`client/game.ts`)
- Sun that does NOT ride parallel to the camera: offset in X, pull Z behind the focal
  plane, vertical angle < 45° → visible shadows raking across the lane.
- Key + hemisphere + fill/rim on the shaded side. Zero unlit black faces.
- Fog far plane beyond `BRIDGE.maxX * 2`, fog color lighter than the ambient horizon.
- Post-processing: enable `renderer.bloom` / tone mapping (ACES or similar) if r186 allows.
- PointLights on tower crystals, nexus, relics and Mercadona.
- LoL-style camera: higher angle, smooth follow, existing scroll zoom but never clipping
  the floor; fights always framed on screen.

### 2. Materials and ground (`client/models.ts`)
- The 3-step gradient map (`[90,170,255]` with NearestFilter) posterizes everything:
  add steps / a smooth ramp to kill banding on large surfaces.
- The Rift floor: tiles/grout lines/cracks/graffiti at gameplay reading scale (not
  authoring scale), value variation — no flat gray slab.
- Walls/railings with stone texture and a cap/trim.

### 3. Blender for ALL the environment — GUI, NEVER headless
- The author wants to SEE the program open. A "Blender machine" subagent launches
  Blender with its UI, runs .py scripts, takes renders/screenshots to iterate, and exports.
- Rebuild in Blender in the style of "The Rift" (LoL ARAM map): the abyss chasm with
  glowing crystals, central bridge, towers, nexus, inhibitors, shop, Mercadona,
  pigeons/minions, relics. Same pipeline as `blender/meme_champs.py` (named nodes +
  idle/run/attack/cast/death clips) and fx.glb.

### 4. Sketchfab for assets (subagent with the Sketchfab search skill)
- A dedicated subagent searches for usable models: rift arena, minions, towers,
  inhibitors, shop, champions. Evaluate license, scale and weight before adopting;
  if something does not fit, Blender makes it instead. Never force a model in.

### 5. Ability assets as GLB per champion
- `fx.glb` plus unique ability props per champion (like the meme champs already have):
  every Q/W/E/R with its own prop modeled in Blender. If a champion comes from the
  Sketchfab skill, try it for their abilities too.

### 6. Strip the bipartidismo satire (rebrand to "The Rift" fantasy)
- Remove ALL political PSOE/PP framing: title "El Abismo del Bipartidismo",
  team names (→ "Blue Team" / "Red Team"), flags/banners, the ballot box (inhibitor),
  the Congreso (nexus), Mercadona/shop theme, announcer, system chat messages,
  HUD and menu texts, splash screens (regenerate political-free with the artist agent).
- This touches `shared/data.ts` (names, items, tips), `client/models.ts`
  (banners/structures), `client/main.ts` + `style.css` (menus, title),
  `client/audio.ts` (announcer), `client/game.ts` (HUD, announcements), `docs/`
  (INIT, banner). Decide whether political meme champs get dropped or renamed.
- Non-political edgy humor may stay if it does not clash; the politics must go.

### 7. LoL-style menus (`client/main.ts` + `style.css`)
- Take inspiration from the real thing: champion select with hover stats/preview,
  lobby, loading with splash art, post-game with graphs.
- No "tweak the colors": look at references and replicate the general layout.

### 8. HUD: tooltips + ability ranges (`client/game.ts`, `shared/data.ts`)
- Hover over ability/spell icons in the HUD → tooltip with the full ability
  description text from `shared/data.ts`.
- `shared/data.ts` carries each ability's range: while aiming (cursor over the ground),
  draw the range circle/area like LoL so the player knows where it lands. The server
  stays authoritative; this is display-only client-side.

## Fat bugs (fix FIRST, before the roadmap)
1. **Only the host can play**: clients load the game but cannot move.
   Likely server-side (unit/control for the non-host sessionId, or `move` message
   validation). Diagnose in `server/GameRoom.ts` + `server/sim.ts`, reproduce with
   `e2e.js` (two tabs), fix the root cause.
2. **Towers play a horrible alarm sound** when attacked. Find it (probably
   `client/audio.ts` called from `game.ts`) and replace it with something epic and
   discreet, or remove it. It must never annoy.

## How (orchestration)
- YOU are the Claude orchestrator: you decide design, plan, integrate, validate and do
  the final review of every step. Never delegate aesthetic/architectural decisions.
- Delegate small, fully-specified mechanical tasks to `minion` (a Gemini Flash
  subagent: exact files/edits/commands). Always verify its diffs.
- One subagent with the Sketchfab search skill owns step 4.
- One Claude "Blender machine" subagent (open GUI, iteration screenshots, exports)
  owns steps 3 and 5.
- You fix the fat bugs yourself (root cause, not symptoms).

## Definition of done (non-negotiable)
- `npm run typecheck` clean and `npm test` → `sim ok` after EVERY step.
- Every visual step: a real screenshot (`e2e.js` → `/tmp/aram-*.png`) pass through the
  CLAUDE.md art checklist (light angle, fog planes, banding, emissive objectives).
- If you touch light/fog/material, summarize the change in checklist terms, not
  "tuned colors".
- No commits or pushes unless the author asks. Respect the rest of `CLAUDE.md`.