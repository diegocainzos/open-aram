# Bug hunt — 2026-09-27

Auditoría en paralelo con 5 agentes `bug-hunter` (solo lectura), cada uno sobre una zona distinta.
**50 hallazgos. Los 5 agentes dan veredicto `fix first`.** Ningún archivo del juego fue tocado.

| # | Informe | Zona | Hallazgos | Veredicto |
|---|---|---|---|---|
| 1 | [01-datos.md](01-datos.md) | `shared/data.ts` — datos vs implementación | 10 | fix first |
| 2 | [02-red-sala.md](02-red-sala.md) | `GameRoom.ts` / `schema.ts` / `index.ts` / `sim.test.ts` | 9 | fix first |
| 3 | [03-sim-nucleo.md](03-sim-nucleo.md) | `server/sim.ts` — daño, muerte, CC, economía, IA | 7 | fix first |
| 4 | [04-habilidades.md](04-habilidades.md) | `server/sim.ts` — campeones, hechizos, items, runas | 15 | fix first |
| 5 | [05-cliente.md](05-cliente.md) | `client/` — escena, VFX, input, HUD, audio | 9 | fix first |

## 🟢 Lo que está limpio (verificado, sin hallazgos)

- **XSS** — todo texto de usuario (`name`, `roomName`, chat, localStorage) pasa por `esc()` antes de `innerHTML`/`h()`.
- **Frontera de confianza** — nada de lo que envía el cliente llega a daño, oro, posiciones, niveles o cooldowns;
  `num()`/`str()` + `Number.isInteger` + `clampPos` + whitelists de champ/item lo cubren.
- **Contratos de red** — los 17 `room.send()` del cliente casan con los `onMessage` del servidor (nombres y claves de payload).
- **Schema** — todos los campos de `schema.ts` son escritos por Sim/GameRoom; todas las claves de `put()` existen.
- **Coherencia de datos** — sin ids duplicadas, 4 habilidades en los 15 campeones, las 6 runas y los 13 hechizos de
  invocador tienen handler real, geometría del mapa correcta (`st{team}0-3`, arbustos, reliquias dentro del puente).
- **Robustez del sim** — sin divisiones por cero, sin doble kill ni reentrancia, HP/mana/oro nunca negativos, todos los
  desplazamientos (dash, pull, blink, flash, teletransporte) pasan por `pushOut()` → `clampPos()`, sin referencias
  colgantes a unidades borradas, curva de XP correcta, win conditions y transiciones de fase correctas.
- **Cliente** — `groundAt()`/raycaster en todo el math pantalla↔mundo (incluido el `flip` del equipo 1), overlays a
  pantalla completa con `pointer-events: none`, desbloqueo de audio por gesto correcto.

## 🔴 High

- [ ] **`server/sim.ts:688` — el hechizo `revive` es código muerto, nunca se puede lanzar.**
  `u.dead !== (key === "revive")` exige estar muerto y la línea siguiente `if (key !== "cleanse" && !this.canAct(rt)) return;`
  exige estar vivo (`canAct` requiere `!rt.u.dead`). La spec (data + INIT §9) dice "usable while dead".
  `sim.test.ts:32` lo dispara sin assertear nada, así que `npm test` pasa en verde.
  Fix de una línea: `if (key !== "cleanse" && key !== "revive" && !this.canAct(rt)) return;`
  y añadir assert: Garen muerto + `cmdSpell` → `!u.dead && hp === 0.35 * maxHp`.
  *(encontrado de forma independiente por los agentes 1 y 4)*

- [ ] **`client/game.ts:41-45` + `178` + `58` — la segunda partida nace rota.**
  `views`, `projViews`, `tweens`, `relicObjs`, `bushObjs`, `pingMarks` nunca se reinician y la escena vieja no se dispone.
  `stop()` solo mata rAF/música/teclado; `prepare()` crea una escena nueva y empuja 4 `relicObjs`/`bushObjs` más.
  Como los ids (`st{team}0-3`, `m{n}`, `"mercadona"`, proyectiles) se repiten cada partida, `syncUnits`/`syncProjectiles`
  (`game.ts:286`, `459`) encuentran `View`s viejos cuyo `obj` vive en la escena descartada y nunca hacen `scene.add` →
  torres, Urna, Congreso, palomas y proyectiles **invisibles**; las barras de vida son DOM huérfano; `loop()` mueve
  objetos de la partida 1 (reliquias congeladas); el fade de arbustos afecta a toldos muertos; y los ~70 rock tweens
  `dur: Infinity` de cada `prepare()` (`game.ts:126`) se acumulan para siempre.
  Fix: al inicio de `prepare()` → `views.clear(); projViews.clear(); tweens.length = 0; relicObjs.length = 0;
  bushObjs.length = 0; pingMarks = [];` y disponer la escena anterior.

## 🟠 Med

### Servidor
- [ ] `server/sim.ts:205` — `stats()` compara `maxHp` **redondeado** (`oldMax`, línea 183) con el **crudo**. Con
  Hacendado (`maxHp *= 1.15`, línea 200) el crudo es fraccionario (2708.25 vs 2708), así que `u.hp += maxHp - oldMax`
  se re-dispara **cada tick**: ~7,5 HP/s de curación gratis por campeón durante los 180 s del buff (verificado: +75 hp
  en 10 s de combate). Fix: redondear antes (`const nMax = Math.round(maxHp)`) y usar `nMax` en el `put`.
- [ ] `server/GameRoom.ts:21` + `92` — la contraseña se trunca a 40 al guardarse (`str(o.password)`) pero se compara
  cruda en `onAuth` → una contraseña >40 chars deja la sala huérfana (creador rechazado, nadie puede entrar).
  Fix: `if (this.password && str(o?.password) !== this.password) throw …`.
- [ ] `server/GameRoom.ts:108` — no hay reconexión: `onLeave` marca `connected = false` pero nada llama a
  `allowReconnection()`, y `this.lock()` (`:134`) bloquea nuevas entradas → un refresh en `select` deja un 4v5
  permanente con campeón inútil. Fix: `await this.allowReconnection(client, 60)` en salidas no limpias
  (o declararlo deliberado en INIT.md §14).
- [ ] `server/sim.ts:869` — `rt.u.moving = false` es una escritura de schema sin guarda **para cada unidad cada tick**
  (más `u.hp`/`u.mana` en 938-939, no-op exactas a vida/maná llenas). Incumple la regla 7 de CLAUDE.md: esas escrituras
  van al cable en cada patch para ~50+ unidades. Fix: `put(u, "moving", false)` y `put()` en las líneas de regeneración.
- [ ] `server/sim.ts:887` — los DoT emiten daño **cada tick**: un Ignite = 150 mensajes `dmg` en 5 s, cada uno
  redondeado a ruido de 0/1. Fix: acumular en `d.acc` y emitir una vez cada 0,5-1 s con `dps * elapsed`.
- [ ] `server/sim.ts:415` — la planta de Mortadelo sobrevive al movimiento de aproximación: `rt.plant` solo se limpia
  en `cmdMove` (407), `doCast` (479) y `basicAttack` (827); `cmdAttack` → `attackLogic` → `stepToward` (y el chase del
  cast pendiente, 987) mueven la unidad sin soltarlo → se acerca **invisible** (`targetableBy` lo rechaza) y abre gratis.
  Fix: limpiar `rt.plant`/`rt.stealthUntil` en `stepToward`.
- [ ] `server/sim.ts:631` — las pasivas de campeón que dicen "hits" solo proc en campeones: el early-out
  `if (!rt.c || !t.c) return;` va antes del `switch`, así que el AS de Ezreal, el reembolso de R de Karma y el contador
  de miedo de Diddy no se disparan sobre minions/wards (solo el sangrado de Darius estaba casado a mano).
- [ ] `server/sim.ts:572` — Moonwalk va **hacia** el cursor en vez de hacia atrás: solo `recoil` niega la dirección
  (`tdx = recoil ? -dx : dx`). La data dice "Glide backwards" (el salto inverso de Caitlyn es el precedente).
  Además el cegado se limita a campeones a melee (`e.u.range < 3`), cosa que la data no documenta.
- [ ] `shared/data.ts:153` + `164` vs `server/sim.ts:135` — el `ratio` de las habilidades de daño verdadero se aplica a
  **AP** (`ab.dtype === "phys" ? u.ad : u.ap`). Demacian Justice (0.6) y Noxian Guillotine (0.75) son de Garen/Darius,
  que acumulan AD: el ratio no escala nada. Fix: usar `rt.u.ad` para `dtype: "true"` en `abDamage`.

### Cliente
- [ ] `client/main.ts:123` + `261-265` — carrera loading→juego: el servidor arranca la partida en su timeout de 20 s
  pase lo que pase con `await import("./game")` (245) o `await gameMod.prepare(...)` (247). Si siguen pendientes,
  `gameMod!.start(...)` revienta con TypeError dentro del callback de `onStateChange` (el juego no pinta y la cadena de
  listeners se rompe) o `start()` corre contra una escena a medias. Fix: guardar la promesa de `loading()` y compuertar
  la rama `game` con ella, más `if (!gameMod) return;` en `startGame()`.
- [ ] `client/game.ts:850-855` — `cv.addEventListener("mousedown"/"mousemove")` y `window.addEventListener("mouseup")`
  se añaden en cada `bindInput()` y nunca se quitan (`stop()` solo quita keydown/keyup). `#gl` persiste entre partidas →
  tras N partidas un drag de click derecho envía N mensajes `move` cada 120 ms.
- [ ] `client/style.css:150` (con `.hud * { pointer-events: auto }` en `:97`) — el propio bloque de `.hudchat` (360px)
  es un área clicable: solo `.log` es `.nopoint` y el input está oculto al cerrar, así que una vez hay líneas de chat
  (hasta 12, ~200px de alto) esa franja sobre el HUD izquierdo **se traga los órdenes de movimiento/ataque**.
  Fix: `.hudchat { pointer-events: none } .hudchat input { pointer-events: auto }`.
- [ ] `client/models.ts:45` (`textSprite`), `game.ts:439` (`projMesh`), `471` (`burst`), `474` (`ring`), `493` (`sprite3d`)
  — geometría + material por llamada (y un `CanvasTexture` 512×128 por sprite de texto) solo se hacen `scene.remove`;
  **nadie llama a `dispose()` en todo el cliente**. Los buffers/texturas de GPU se pierden monótonamente dentro de la
  partida (bursts por asesinato, 80 aviones de papel por nexo, una textura por estrellas de aturdimiento/zzz/ping) y
  entre partidas vía las escenas descartadas.

## 🟡 Low (resumen)

Ver cada informe para el detalle y el fix concreto.

**Servidor**
- `sim.ts:222` — `raw <= 0` no rechaza `NaN` (un daño NaN deja `hp = NaN`, la unidad nunca muere ni sana). Fix: `if (!(raw > 0)) return 0;`.
- `sim.ts:429` — oro en `float32` acumula error de redondeo y puede rechazar una compra que el HUD muestra como asequible.
- `sim.ts:154` — `buff()` siempre apila en vez de refrescar; un buff con duración ≥ cooldown crece sin límite.
- `sim.ts:968` — `put(u, "fx", …)` está tras el `return` de la rama muerta: los cadáveres conservan `recall`/`siesta`/`manic`.
- `sim.ts:340` — el reset de la R de Darius salta con **cualquier** asesinato de Darius; `special: "reset"` nunca se lee.
- `sim.ts:839` — la Q potenciada de Garen se consume al empezar el golpe y se aplica en `land()`: un dodge con muleta la pierde.
- `sim.ts:631` — el sangrado de Darius apila DoTs sin límite (~10 concurrentes a 2.5 de velocidad de ataque).
- `sim.ts:623` / `shared/data.ts` — el DoT aplica el `ratio` de la habilidad por segunda vez y escala `dot` por nivel, contradiciendo "daño total en 2 s".
- `sim.ts:217` — Meek Ye descuenta un 30% de maná sin decirlo en ningún sitio.
- `sim.ts:543` — `whiteparty` regala un escudo fijo del 25% de vida que no está en la data.
- `sim.ts:1052` — los proyectiles teledirigidos no re-comprueban `untargetable`: siguen aplicando pasivas/DoT sobre Epstein en falsa muerte.
- `sim.ts:697` — el hechizo Heal cura al aliado de **menos vida** en vez del más cercano.
- `sim.ts:390` — `fakeDeath` y `damage():271` escriben `u.hp` directamente en vez de pasar por `heal()`.
- `sim.ts:390`/`401` — la inversión de controles de Kanye solo afecta a `cmdMove`, no a ataques ni casts.
- `shared/data.ts:287` / `sim.ts:702` — el desc de Cleanse dice "remove all CC" pero deja `suppress`.
- `shared/data.ts:262,270,276` — `Item.passive` y `Item.tenacity` son datos muertos (el código va por id de item).
- `shared/data.ts:183` — el desc de Illaoi Q dice "delayed line slam" y es un cono instantáneo de 15°.
- `shared/data.ts:115` — el desc de Ryze dice "bonus mana" y el código usa `maxMana * 0.03` (incluye el maná base).
- `shared/data.ts:52` — el comentario dice "+8%/nivel" y `lvlScale`/INIT.md dicen 7%.
- `shared/data.ts:289` + `game.ts:674` — `onSpellFx` no tiene caso para `exhaust`/`cleanse`/`smite` (silenciosos visualmente).
- `server/sim.ts:1094` — los minions aparecen a ±53 solapados con el colisionador del nexo propio (±56, r 3.2).
- `GameRoom.ts:15` — sin rate limit de mensajes (`maxMessagesPerSecond = Infinity` por defecto): chat/ping/emote se retransmiten y un griefer puede inundar a todos.
- `GameRoom.ts:96` — `onJoin` sin guarda de fase (defensa en profundidad: fallar en `onAuth` si `phase !== "lobby"`).
- `GameRoom.ts:67-69` — `loaded` confía en el `pct` del cliente (alguien puede declararse listo antes de cargar).
- `GameRoom.ts:118-124` — `syncMeta()` no se llama al terminar la partida: el navegador de salas se queda en "En partida".
- `sim.test.ts:30-36` — el bucle de hechizos de invocador no assertea nada ("every summoner fires" es mentira si se rechaza en silencio).
- `sim.test.ts:84,86` — mensajes de assert invertidos.
- `sim.test.ts:250-264` — sin cobertura de `inGame` fuera de `phase === "game"`, capacidad de equipo, `start` del host, ni economía de compra/venta.

**Cliente**
- `audio.ts:77-85` — `speak()` nunca cancela ni limita la cola: las líneas de asesinato/banter/fx se superponen y suenan tarde.
- `main.ts:39-53` — un fetch de `/rooms` que resuelve tras cambiar de pantalla desreferencia `$("q")`/`$("list")` ya borrados.
- `game.ts:873` — `keysDown` no se limpia al perder el foco: un `keyup` perdido deja esa tecla muda (Q/W/E/R) hasta el siguiente ciclo.
- `main.ts:115` — `chatLog` crece sin límite (se pintan 60, se guardan todos).

## Siguiente paso sugerido

Los cuatro one-liners de más impacto (≈5 min, arreglan 2 high + 3 med):
1. `server/sim.ts:688` — la guarda de `revive`.
2. `server/sim.ts:205` — redondear `maxHp` antes de comparar.
3. `server/GameRoom.ts:21,92` — `str(o?.password)` en `onAuth`.
4. `client/style.css:150` — `pointer-events` de `.hudchat`.
