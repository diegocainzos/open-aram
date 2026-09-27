# Asset megalist — champions, skills, world

Where every champion model and skill visual comes from, what is still missing, and how to continue.
Sketchfab sources live in `blender/src/*.glb` (credits: `blender/src/CREDITS.txt`; shipped credits:
`client/public/models/CREDITS.txt`) and are baked by Blender scripts into `client/public/models/`.

Legend: ✅ Sketchfab asset in game · 🟡 baked into `fx.glb` but **not wired in the client yet** · 🧱 procedural
(Blender code or THREE primitives) · ✨ procedural VFX, no prop needed (energy/rings/particles) · ❌ searched Sketchfab,
nothing usable (queries noted) · ⏳ downloaded to `blender/src/`, not processed yet.

## Status on 2026-09-27 (work stopped here)

- **Done and verified in the client:** Kanye model + 11 clips (`blender/kanye_donda.py`), Kanye props phone/sneaker/bolt.
- **Done, baked, NOT verified in a real match:** all meme-champion props in `fx.glb` swapped to Sketchfab models (table
  below). They keep the old node names, so the client picks them up without code changes. Sizes match the old
  procedural contracts, but **facing may be off for badge, cctv, bull, speaker**: check in game and fix `rot=` in the
  `fx_*` function.
- **Baked but unused:** the new LoL props (🟡) are inside `fx.glb`, but `client/game.ts` does not spawn them yet (see TODO 1).
- `fx.glb` went from 1.9 MB to 5.3 MB. Textures are exported as WebP, capped at 512 px.
- Backups of the previous GLBs are only in the session scratchpad. Use `git checkout client/public/models/fx.glb` to
  roll back.

## Pipeline (how this is done)

1. **Find:** `~/.claude/skills/sketchfab/scripts/sketchfab.sh search "<query>" --max-faces 25000` (props) or `80000`
   (characters). Check `isDownloadable` and the license (CC BY / CC0 / Free Standard; NC is OK for this non-commercial
   repo). Look at the thumbnail before downloading (`curl https://api.sketchfab.com/v3/models/<uid>` → `thumbnails`).
   Many "Kanye"/"Epstein" hits are heads or busts only.
2. **Download:** `sketchfab.sh download <uid> --dir blender/src --name fx_<name>` (props) or `champ_<id>` (characters).
   The script appends the credit to `blender/src/CREDITS.txt`; copy the line to `client/public/models/CREDITS.txt`.
3. **Props → `fx.glb`:** add `def fx_<name>(): sketch("fx_<name>", ...)` in `blender/meme_champs.py` and register it in
   the `FX` dict. `sketch()` options: `rot` (degrees), `axis`+`length` (fit that extent), `width`, `ground` (base at
   z=0) vs centred, `keep`/`drop` (mesh-name substrings), `pick` (largest mesh only), `ratio` (decimate), `fatten`,
   `color`/`emit` (replace material), `at` (offset). It also strips shape keys and rig modifiers, moves
   emission-only colour into base colour (toon shading reads only the base map), and zeroes metallic.
   Convention: Blender front = −Y, up = +Z.
   Rebuild: in Blender, `exec` the module and call `build_fx()`, or run `blender -b --python blender/meme_champs.py`.
   Running the full `main()` also rebuilds the meme champions.
4. **Check orientation:** `scratchpad/fxsheet.py` (session only; recreate it if needed). It renders every `fx.glb`
   root with a red cone at −Y and makes a contact sheet. Blender's material preview can look washed out; judge colour
   in the client.
5. **Client hook:** `client/game.ts` `onFx(m)`. Every ability cast fx carries `m.champ`, `m.slot` (0–3 = Q–R),
   `m.x/z` (caster), `m.tx/tz` (target point), `m.r`, `m.range`. Helpers: `prop(name, x, y, z, dur, fn)` (spawns an
   `fx.glb` node and tweens it), `lob(name, x, z, tx, tz, dur, h)`, `pop(k, dur)`, `ring()`, `burst()`. Projectiles only
   carry `fx` (no owner), so per-champion projectile models need a new `fx` name in `shared/data.ts` plus a case in
   `projMesh()`.
6. **Characters:** see `blender/kanye_donda.py`. Import → flatten to one mesh → normalise (height 2, feet at 0, face
   −Y) → decimate → hand-placed bones (`BONES`, read joint positions from ortho renders with a metric grid) →
   `ARMATURE_AUTO` weights → clips as `{bone: (rx, ry, rz) world-axis degrees}` keyed per frame → NLA tracks → export
   to `client/public/models/<id>.glb`. The id must be in `GLB_CHAMPS` (`client/models.ts`). Clip names:
   `idle run recall attack attack2 cast death spell1..4`. Optional extras by node name: `halo`, `sheet`, `tank`,
   `belly`, `filemon`, `filArmR`.
7. **Verify:** `npm run typecheck` and `npm test` (the latter must print `sim ok`). In the browser console with
   `npm run dev`: `const M = await import('/models.ts'); await M.loadChampModels(); M.champModel('<id>', 0, 0)` and
   `M.fxModel('<name>')`. Then play a match and cast every ability.

## Champion models

| Champion | Model | Source / note |
|---|---|---|
| Ezreal, Annie, Jhin, Caitlyn, Garen, Darius, Illaoi, Karma | ✅ | SirDJCat / Lauren Midna LoL rips (`client/public/models/<id>.glb`) |
| Kanye | ✅ | "Kanye Model Donda" (aaronalejandro9090), rigged and animated by `blender/kanye_donda.py` |
| Epstein | ⏳ | `blender/src/champ_epstein.glb`: "Jeffreey epstein Northern Soul Spin Combo" (merks11, CC BY), full body, **Mixamo rig (74 bones) already skinned**, one dance clip, 57k faces, height 4.07 → scale to ~2. See TODO 3 |
| Mortadelo y Filemón | ⏳ | `blender/src/champ_mortadelo.glb` + `champ_filemon.glb`: "Mortadelo/Filemón (N64 Style)" (StrawberryChar, CC BY), T-pose, rigid low-poly parts, no rig. See TODO 4. Higher-quality alternative: "Mortadelo by Francisco Ibáñez" (vmmaniac, uid `39009bd0428743b79b2b19b1fb134b04`, 56k faces), but it has no matching Filemón |
| Ryze | ❌ 🧱 | `ryze`, `ryze league of legends`, `ryze rune mage`: only an unrelated chibi (`0df2399f…`) |
| Rammus | ❌ 🧱 | `rammus`, `rammus league of legends`: only an anime girl in a Rammus onesie (`4367fd95…`) |
| Torrente | ❌ 🧱 | `torrente santiago segura`, `santiago segura`, `fat policeman cartoon`, `spanish policeman`, `policeman fat`: nothing |
| Diddy | ❌ 🧱 | `diddy`, `p diddy`, `sean combs`, `rapper white suit`: only Diddy Kong |

## Skills (P = passive, Q W E R)

Client visual columns: what you see now → what is prepared.

| Champ | Slot | Ability | Now | Prepared / next |
|---|---|---|---|---|
| Ezreal | Q/W | Mystic Shot / Essence Flux | ✨ glow projectile | — (energy, fine) |
| Ezreal | E/R | Arcane Shift / Trueshot Barrage | ✨ burst / wave box | — |
| Annie | Q | Disintegrate | ✨ burst at target | 🟡 `fireball`: `lob("fireball", x, z, tx, tz, 0.3, 0.8)` |
| Annie | W/E | Incinerate / Molten Shield | ✨ cone / ring | — |
| Annie | R | Summon: Tibbers | 🧱 sphere bear (`case "tibbers"`) | 🟡 `tibbers` ("League Of Legends - Tibbers Hextech", 1FENIL). Replace the sphere bear with `prop("tibbers", cx, 8, cz, 4, drop-to-ground)` |
| Ryze | Q | Overload | ✨ glow | — |
| Ryze | W | Rune Prison | ✨ burst | 🟡 `runestones` ("Glowing Runestones", FractalSpace) at target |
| Ryze | E | Spell Flux | ✨ burst | 🟡 `scroll` ("Magic Ice Scroll", apariciosilva3D) floating over target |
| Ryze | R | Realm Warp | ✨ bursts | — |
| Jhin | Q | Dancing Grenade | ❌ nothing drawn | 🟡 `grenade` ("Cartoon Style Grenade", trash-art): `lob` to target |
| Jhin | W | Deadly Flourish | ✨ beam | — |
| Jhin | E | Captive Lotus | ✨ ring | 🟡 `lotus` ("Stylized Lotus Flower", Kigha) at aoe centre |
| Jhin | R | Curtain Call | ✨ glow ×4 | — |
| Caitlyn | Q | Piltover Peacemaker | ✨ beam | — |
| Caitlyn | W | Yordle Snap Trap | ✨ ring | 🟡 `trap` ("Lowpoly bear trap", Khyoocumber) at aoe centre |
| Caitlyn | E | 90 Caliber Net | ✨ glow | ❌ `hunting net`: nothing |
| Caitlyn | R | Ace in the Hole | ✨ burst | — |
| Garen | Q/W | Decisive Strike / Courage | ✨ ring | — |
| Garen | E | Judgment | ✨ ring | 🟡 `garensword` ("League of Legends - Garen's Sword", engames) orbiting the caster. Check tip direction |
| Garen | R | Demacian Justice | ✨ burst | 🟡 `garensword` dropping from the sky onto the target |
| Darius | Q | Decimate | ✨ ring | 🟡 `dariusaxe` ("Darius Axe - Machado do Darius", danielsive) spinning around the caster |
| Darius | W | Crippling Strike | ✨ burst | optional `dariusaxe` chop |
| Darius | E | Apprehend | ✨ cone | — |
| Darius | R | Noxian Guillotine | ✨ burst | 🟡 `dariusaxe` dropping on the target |
| Rammus | Q | Powerball | ❌ nothing | ❌ `armadillo ball`: nothing. Could curl the model client-side |
| Rammus | W/E/R | Curl / Taunt / Slam | ✨ ring / nothing / ring | — |
| Illaoi | Q | Tentacle Smash | ✨ cone | 🟡 `tentacle` ("Tentacle (rigged)", CGDanielGlebinski; straightened, thickened and curled) rising at `x + dir*range/2`, then rotate `x` to slam |
| Illaoi | W | Harsh Lesson | ✨ ring | — |
| Illaoi | E | Test of Spirit | ✨ glow | 🟡 `idol` ("Free Low Poly Idol", warcool) popping at the caster, optional |
| Illaoi | R | Leap of Faith | ✨ ring | 🟡 4–6 × `tentacle` rising in a circle around the caster |
| Karma | Q | Inner Flame | ✨ glow | projectile needs its own `fx` name to use `fireball` |
| Karma | W/E | Focused Resolve / Inspire | ✨ burst / ring | — |
| Karma | R | Mantra | ✨ ring | 🟡 `lotus` under Karma |
| Torrente | Q | Vómito de Soberano | ✨ green cone + particles | — (brandy bottle candidates: `01fd2887…`, `1c1e9140…`, not downloaded) |
| Torrente | W | ¡Alto a la Autoridad! | ✅ `badge` ("Police Badge", oparaskos). **Check facing** | |
| Torrente | E | Croqueta Policial | ✨ nothing but sfx | ⏳ "Croquettes" (citrusfriendd) downloaded but comes on a plate and board. Use `keep=` on the croquette meshes |
| Torrente | R | Desmadre Descamisado | 🧱 `tanktop` kept procedural | ❌ the "Small Tank Top" download (`blender/src/fx_tanktop.glb`) is a women's sports top, not a wifebeater |
| Kanye | Q W E | Tweet / Yeezy Drop / I Wonder Dash | ✅ `phone`, `sneaker`, `bolt` | |
| Kanye | R | Episodio Maníaco | ✅ `halo` extra in `kanye.glb` + sprites | |
| Epstein | Q | Invitación a la Isla | ✅ `envelope` ("Stamp Envelope", kelvladmail, stand removed) | |
| Epstein | W | Sábanas de la Prisión | 🧱 `sheet` extra inside `epstein.glb` | ❌ `bed sheet cloth`: nothing |
| Epstein | E | Maletín de Pruebas | ✅ `briefcase` ("Briefcase / suitcase", TampaJoey, closed case only) | |
| Epstein | R | Epstein no se suicidó | ✅ `cctv` ("CCTV Camera", Smoggybeard). **Check facing** | |
| Diddy | Q | Botella de Aceite | ✅ `oilbottle` ("baby_oil", johhny_3D) + 🧱 `puddle` | |
| Diddy | W | Fiesta en la Mansión | ✅ `vip` (6 × "Rope Barrier", MaX3Dd, hexagon r=3.2) + ✅ `speaker` ("Wall Party Speaker"). **Check speaker facing** | |
| Diddy | E | Moonwalk Evasivo | ✨ confetti | — |
| Diddy | R | The White Party | ✅ `discoball` ("Disco Ball", mozillareality) + chain | |
| Mortadelo | P | Filemón's slipper projectile | 🧱 box in `projMesh("slipper")` | 🟡 `slipper` ("house slippers", headless_christ): use `fxModel("slipper") ??` in `projMesh` |
| Mortadelo | Q | Disfraz Inesperado | ✅ `plant` ("Potted Plant", GoncMira02, with Mortadelo's glasses/nose), ✅ `bull` ("Bull", bijay21; **check facing**), ✅ `bombbox` ("Comical Bomb", XEN0KID) | |
| Mortadelo | W | Invento de Bacterio | ✅ `flask` ("FREE Conical Flask", big one only) | |
| Mortadelo | E/R | Cambio de Agente / ¡¡MORTADELOOOO!! | ✨ | — |
| Pigeon casters | — | baguette projectile | 🧱 cylinder in `projMesh("baguette")` | 🟡 `baguette` ("Handpainted Baguette", cozygonanimation) |

Summoner spells: all ✨ (rings, bursts, sprites); `exhaust`, `cleanse` and `smite` have no client visual. Items with
passives (`muleta`, `jamon`, `papel`, `aceite`, `cunas`) show only floating text, CC badges or the shield bar. None of
them needs a model.

## World objects (not touched: separate work in progress in `blender/arena.py` / `blender/structures.py`)

All drawn procedurally in `client/models.ts` today (pigeons, Mercadona, relic mug, towers, ballot-box inhibitors,
Congreso nexus, ElChino shop, bushes, fountain). `arena.glb` / `structures.glb` / `minion_*.glb` exist but are not
loaded. Unused Sketchfab sources already in `blender/src/`: `fx_mug` (Stylized Beer Mug → relic), `fx_barrels`,
`fx_axe` (Stylized Battle Axe), `fx_sword` (Stylized Big Sword, alternative Garen sword). World search candidates
(not downloaded) are in the session scratchpad `sf_world.md`: pigeon, ballot box, shopping cart, supermarket.

## TODO (in order)

1. **Wire the 🟡 LoL props** in `client/game.ts` `onFx`: after the `switch`, add a table keyed by `` `${m.champ}${m.slot}` ``
   that calls `prop`/`lob` with the behaviours listed above. In `case "tibbers"`, use `prop("tibbers", …)` when
   available (keep the sphere bear as the fallback). In `projMesh`, use `fxModel("slipper")` and `fxModel("baguette")`
   with the current meshes as fallback. Then typecheck, test, and cast every ability in a match.
2. **Check facing in game:** badge, cctv, bull, speaker, garensword (tip down?), dariusaxe. Fix with `rot=` in the
   `fx_*` function and rebuild `fx.glb`.
3. **Epstein:** new `blender/epstein_mixamo.py` modelled on `kanye_donda.py`, but keep the existing Mixamo skin. Map
   pose keys to Mixamo bones (`Hips_01`, `Spine_02`, `Spine2_04`, `Head_08`, `LeftArm_013`, `LeftForeArm_014`,
   `LeftUpLeg…`, `LeftLeg…`). Compose a base A-pose (arms down: `LeftArm` Ry(+80°), `RightArm` Ry(−80°) in world axes)
   under every clip, because the rest pose is a T-pose. Reuse the clip intent from `epstein_anim()` in
   `meme_champs.py`. Add a `sheet` extra node (reuse the procedural sheet) parented to the chest bone. Delete the
   Mixamo dance action, scale to height ~2, face −Y, and cap the textures (57k faces and many 1k maps; decimate to ~25k).
4. **Mortadelo y Filemón:** the N64 models are rigid parts in T-pose, which matches the `meme_champs.py` rigid-part
   contract. In `mortadelo()`, replace the procedural parts with `sketch("champ_mortadelo", …)` meshes, rotate the arm
   parts down about the shoulder pivot, and assign each part to `arm_L/arm_R/leg_L/leg_R/head/spine` by position. Same
   for Filemón in the `fil_` rig. The existing `mortadelo_anim` / `filemon_anim` clips then work unchanged.
5. **Still missing (search again or model procedurally):** Ryze, Rammus, Torrente and Diddy bodies; Caitlyn net;
   Rammus ball; Epstein bedsheet; a real wifebeater. Ideas: search `lol ryze fanart`, `armadillo`, `white suit
   man`, `bedsheet`, `undershirt`.
6. **Size:** after wiring, recheck `fx.glb` (5.3 MB). If needed, drop `ratio` on the heavy ones (`runestones` 26k
   faces, `fireball` 12k, `tibbers` 8k).
