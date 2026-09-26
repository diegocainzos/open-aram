import { Room, ServerError, type Client } from "colyseus";
import { CHAMPS, MODES, RUNES, SELECT_MODES, SPELLS, TICK } from "../shared/data";
import { Player, State } from "./schema";
import { Sim } from "./sim";

const num = (v: any) => (Number.isFinite(v) ? v : 0);
const str = (v: any, max = 40) => (typeof v === "string" ? v.slice(0, max) : "");
const own = (o: object, k: any) => typeof k === "string" && Object.hasOwn(o, k);
const shuffle = <T>(a: T[]) => a.map(v => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(x => x[1]);

export class GameRoom extends Room<{ state: State }> {
  state = new State();
  password = "";
  perTeam = 3;
  sim?: Sim;

  onCreate(o: any) {
    const mode = MODES.includes(o.mode) ? o.mode : "3v3";
    this.perTeam = +mode[0];
    this.maxClients = this.perTeam * 2;
    this.password = str(o.password);
    Object.assign(this.state, {
      roomName: str(o.roomName) || "Sala sin nombre",
      mode,
      selectMode: own(SELECT_MODES, o.selectMode) ? o.selectMode : "aram",
      banter: o.banter !== false,
      mercadona: o.mercadona !== false,
    });
    this.patchRate = 33;
    this.syncMeta();

    const inGame = (fn: (c: Client, m: any) => void) => (c: Client, m: any) => { if (this.state.phase === "game" && this.sim) fn(c, m ?? {}); };
    const player = (c: Client) => this.state.players.get(c.sessionId);

    this.onMessage("chat", (c, m) => {
      const p = player(c), text = str(m?.text, 200).trim();
      if (p && text) this.broadcast("chat", { from: p.name, team: p.team, text });
    });
    this.onMessage("team", (c, m) => {
      const p = player(c), t = num(m?.team);
      if (this.state.phase !== "lobby" || !p || (t !== 0 && t !== 1)) return;
      if ([...this.state.players.values()].filter(x => x.team === t).length < this.perTeam) p.team = t;
    });
    this.onMessage("loadout", (c, m) => {
      const p = player(c);
      if (!p || !m || this.state.phase !== "lobby") return;
      if (own(SPELLS, m.spellD) && m.spellD !== p.spellF) p.spellD = m.spellD;
      if (own(SPELLS, m.spellF) && m.spellF !== p.spellD) p.spellF = m.spellF;
      if (own(RUNES, m.rune)) p.rune = m.rune;
    });
    this.onMessage("start", c => {
      const ps = [...this.state.players.values()];
      if (c.sessionId !== this.state.host || this.state.phase !== "lobby" || !ps.some(p => p.team === 0) || !ps.some(p => p.team === 1)) return;
      this.startSelect();
    });
    this.onMessage("pick", (c, m) => {
      const p = player(c), id = str(m?.champ);
      if (!p || this.state.phase !== "select" || !CHAMPS.some(x => x.id === id) || this.taken().has(id) && p.champ !== id) return;
      if (this.state.selectMode === "draft" || (this.state.selectMode === "three" && p.options.includes(id))) p.champ = id;
    });
    this.onMessage("reroll", c => {
      const p = player(c);
      if (!p || this.state.phase !== "select" || this.state.selectMode !== "aram" || p.rerolls < 1) return;
      p.rerolls--;
      p.champ = this.randomFree()[0] ?? p.champ;
    });
    this.onMessage("loaded", (c, m) => {
      const p = player(c);
      if (p && this.state.phase === "loading") p.loaded = Math.max(p.loaded, Math.min(100, num(m?.pct)));
    });

    this.onMessage("move", inGame((c, m) => this.sim!.cmdMove(c.sessionId, num(m.x), num(m.z))));
    this.onMessage("attack", inGame((c, m) => this.sim!.cmdAttack(c.sessionId, str(m.id))));
    this.onMessage("stop", inGame(c => this.sim!.cmdStop(c.sessionId)));
    this.onMessage("cast", inGame((c, m) => this.sim!.cmdCast(c.sessionId, num(m.slot), num(m.x), num(m.z), str(m.id) || undefined)));
    this.onMessage("spell", inGame((c, m) => this.sim!.cmdSpell(c.sessionId, num(m.slot), num(m.x), num(m.z), str(m.id) || undefined)));
    this.onMessage("recall", inGame(c => this.sim!.cmdRecall(c.sessionId)));
    this.onMessage("buy", inGame((c, m) => this.sim!.cmdBuy(c.sessionId, str(m.item))));
    this.onMessage("sell", inGame((c, m) => this.sim!.cmdSell(c.sessionId, num(m.idx))));
    this.onMessage("ping", inGame((c, m) => {
      const u = this.state.units.get(c.sessionId);
      if (!u) return;
      u.pings++;
      this.sendTeam(u.team, "ping", { x: num(m.x), z: num(m.z), type: str(m.type, 12), from: u.name });
    }));
    this.onMessage("emote", inGame((c, m) => this.broadcast("emote", { id: c.sessionId, e: str(m.e, 12) })));

    this.setSimulationInterval(dt => this.update(dt / 1000), TICK * 1000);
  }

  onAuth(_c: Client, o: any) {
    if (this.password && o?.password !== this.password) throw new ServerError(403, "Contraseña incorrecta");
    return true;
  }

  onJoin(c: Client, o: any) {
    const ps = [...this.state.players.values()];
    const blue = ps.filter(p => p.team === 0).length, red = ps.length - blue;
    const p = new Player();
    p.name = str(o?.name, 16).trim() || `Paloma${Math.floor(Math.random() * 999)}`;
    p.team = blue <= red ? 0 : 1;
    this.state.players.set(c.sessionId, p);
    if (!this.state.host) this.state.host = c.sessionId;
    this.broadcast("chat", { from: "SISTEMA", text: `${p.name} ha entrado en la sala`, sys: true });
    this.syncMeta();
  }

  onLeave(c: Client) {
    const p = this.state.players.get(c.sessionId);
    if (!p) return;
    if (this.state.phase === "lobby" || this.state.phase === "select") this.state.players.delete(c.sessionId);
    else p.connected = false;
    if (this.state.host === c.sessionId) this.state.host = [...this.state.players.keys()].find(k => this.state.players.get(k)!.connected) ?? "";
    this.broadcast("chat", { from: "SISTEMA", text: `${p.name} se ha ido`, sys: true });
    this.syncMeta();
  }

  syncMeta() {
    const host = this.state.players.get(this.state.host)?.name ?? "";
    this.setMetadata({
      name: this.state.roomName, host, mode: this.state.mode, locked: !!this.password,
      selectMode: this.state.selectMode, status: this.state.phase === "lobby" ? "Esperando" : "En partida",
    });
  }

  sendTeam(team: number, type: string, msg: any) {
    for (const c of this.clients) if (this.state.players.get(c.sessionId)?.team === team) c.send(type, msg);
  }

  taken() { return new Set([...this.state.players.values()].map(p => p.champ).filter(Boolean)); }
  randomFree() { const t = this.taken(); return shuffle(CHAMPS.map(c => c.id).filter(id => !t.has(id))); }

  startSelect() {
    this.lock();
    this.state.phase = "select";
    this.state.timer = this.state.selectMode === "aram" ? 15 : 30;
    const pool = shuffle(CHAMPS.map(c => c.id));
    for (const p of this.state.players.values()) {
      if (this.state.selectMode === "aram") { p.champ = pool.pop()!; p.rerolls = 1; }
      if (this.state.selectMode === "three") p.options.push(...(pool.length >= 3 ? pool.splice(0, 3) : shuffle(CHAMPS.map(c => c.id)).slice(0, 3))); // 15 champs: unique for 5 players, then overlap
    }
    this.syncMeta();
  }

  update(dt: number) {
    const s = this.state;
    if (s.phase === "select") {
      s.timer -= dt;
      if (s.timer <= 0) {
        for (const p of s.players.values())
          if (!p.champ) p.champ = (s.selectMode === "three" ? shuffle(p.options.filter(o => !this.taken().has(o)))[0] : undefined) ?? this.randomFree()[0];
        s.phase = "loading";
        s.timer = 20;
      }
    } else if (s.phase === "loading") {
      s.timer -= dt;
      if (s.timer <= 0 || [...s.players.values()].every(p => p.loaded >= 100 || !p.connected)) this.startGame();
    } else if (s.phase === "game") this.sim!.tick(dt);
  }

  startGame() {
    this.sim = new Sim(this.state, (t, m) => this.broadcast(t, m), (team, t, m) => this.sendTeam(team, t, m));
    this.sim.setup([...this.state.players.entries()].map(([id, p]) => ({ id, name: p.name, team: p.team, champ: p.champ, spellD: p.spellD, spellF: p.spellF, rune: p.rune })));
    this.state.phase = "game";
  }
}
