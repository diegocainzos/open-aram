import { Client, type Room } from "@colyseus/sdk";
import { CHAMPS, LOADING_TIPS, MODES, RUNES, SELECT_MODES, SPELLS, champ } from "../shared/data";
import { audio, sfx, speak } from "./audio";

const SERVER = location.port === "5173" ? `${location.protocol}//${location.hostname}:2567` : location.origin;
const client = new Client(SERVER);
const app = document.getElementById("app")!;
let room: Room<any, any> | undefined;
let chatLog: { from: string; text: string; team?: number; sys?: boolean }[] = [];
let gameMod: typeof import("./game") | undefined;

export const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const h = (html: string) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
export const splash = (id: string) => `/splash/${id}.jpg`;
const myName = () => localStorage.getItem("name") || "";
const logo = `<div class="logo"><div class="t1">EL ABISMO DEL BIPARTIDISMO</div><div class="t2">ARAM · TODOS ALEATORIOS · TODOS AL MEDIO</div></div>`;
document.addEventListener("pointerdown", () => audio(), { once: true });

// ---------------------------------------------------------------- home / room browser
let refresh: number | undefined;
function home() {
  room = undefined;
  chatLog = [];
  document.getElementById("gl")!.style.display = "none";
  app.innerHTML = `<div class="screen"><div class="wrap">${logo}
    <div class="panel">
      <div class="row">
        <input class="field" id="name" placeholder="Nombre de invocador" maxlength="16" value="${esc(myName())}">
        <input class="field grow" id="q" placeholder="🔍 Buscar sala o host...">
        <select class="field" id="fmode"><option value="">Todos los modos</option>${MODES.map(m => `<option>${m}</option>`).join("")}</select>
        <select class="field" id="fstat"><option value="">Cualquier estado</option><option>Esperando</option><option>En partida</option></select>
        <button class="btn primary" id="create">+ Crear sala</button>
      </div>
      <table class="rooms"><thead><tr><th>Sala</th><th>Host</th><th>Modo</th><th>Selección</th><th>Jugadores</th><th>Ping</th><th>Estado</th></tr></thead><tbody id="list"></tbody></table>
    </div></div></div>`;
  const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
  $("name").oninput = () => localStorage.setItem("name", $("name").value.trim());
  let rooms: any[] = [], ping = 0;
  const render = () => {
    const q = $("q").value.toLowerCase(), fm = $("fmode").value, fs = $("fstat").value;
    const shown = rooms.filter(r => (!q || `${r.name} ${r.host}`.toLowerCase().includes(q)) && (!fm || r.mode === fm) && (!fs || r.status === fs));
    $("list").innerHTML = shown.length ? shown.map(r => `<tr class="room" data-id="${r.roomId}" data-locked="${r.locked ? 1 : ""}">
      <td>${r.locked ? "🔒 " : ""}<b>${esc(r.name ?? "")}</b></td><td>${esc(r.host ?? "")}</td><td>${r.mode}</td><td>${SELECT_MODES[r.selectMode as keyof typeof SELECT_MODES] ?? ""}</td>
      <td>${r.clients}/${r.maxClients}</td><td>${ping} ms</td><td><span class="tag ${r.status === "Esperando" ? "wait" : "play"}">${r.status}</span></td></tr>`).join("")
      : `<tr><td colspan="7" class="empty">No hay salas. El Congreso está vacío, como siempre. ¡Crea una!</td></tr>`;
    $("list").querySelectorAll<HTMLElement>("tr.room").forEach(tr => tr.onclick = () => join(tr.dataset.id!, !!tr.dataset.locked));
  };
  const load = async () => {
    const t = performance.now();
    try { rooms = await (await fetch(`${SERVER}/rooms`)).json(); ping = Math.round(performance.now() - t); }
    catch { rooms = []; }
    render();
  };
  ["q", "fmode", "fstat"].forEach(id => $(id).oninput = render);
  $("create").onclick = createModal;
  clearInterval(refresh);
  refresh = window.setInterval(() => document.getElementById("list") ? load() : clearInterval(refresh), 3000);
  load();
}

function needName() {
  const n = (document.getElementById("name") as HTMLInputElement)?.value.trim() || myName();
  if (!n) { alert("Pon un nombre de invocador primero"); return ""; }
  localStorage.setItem("name", n);
  return n;
}

async function join(id: string, locked: boolean) {
  const name = needName();
  if (!name) return;
  const password = locked ? prompt("Contraseña de la sala:") ?? "" : "";
  try { enter(await client.joinById(id, { name, password })); }
  catch (e: any) { alert(`No se pudo entrar: ${e.message ?? e}`); }
}

function createModal() {
  const name = needName();
  if (!name) return;
  const cfg = { mode: "3v3", selectMode: "aram", priv: false };
  const m = h(`<div class="modal-bg"><div class="modal panel"><h2>Crear sala</h2>
    <label>Nombre de la sala</label><input class="field" id="rname" maxlength="40" value="Sala de ${esc(name)}">
    <label>Visibilidad</label><div class="seg" id="vis"><button data-v="0" class="on">Pública</button><button data-v="1">Privada 🔒</button></div>
    <input class="field" id="pw" placeholder="Contraseña" style="display:none;margin-top:6px">
    <label>Modo</label><div class="seg" id="mode">${MODES.map(x => `<button data-v="${x}" class="${x === cfg.mode ? "on" : ""}">${x}</button>`).join("")}</div>
    <label>Selección de campeón</label><div class="seg" id="sel">${Object.entries(SELECT_MODES).map(([k, v]) => `<button data-v="${k}" class="${k === cfg.selectMode ? "on" : ""}">${v}</button>`).join("")}</div>
    <label>Modificadores</label>
    <label class="check"><input type="checkbox" id="banter" checked> Piques y beef entre personajes</label>
    <label class="check"><input type="checkbox" id="merc" checked> Evento Mercadona en el minuto 15</label>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="cancel">Cancelar</button><button class="btn primary" id="ok">Crear</button></div>
  </div></div>`);
  app.append(m);
  const seg = (id: string, fn: (v: string) => void) => m.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b => b.onclick = () => {
    m.querySelectorAll(`#${id} button`).forEach(x => x.classList.remove("on")); b.classList.add("on"); fn(b.dataset.v!);
  });
  seg("vis", v => { cfg.priv = v === "1"; (m.querySelector("#pw") as HTMLElement).style.display = cfg.priv ? "" : "none"; });
  seg("mode", v => cfg.mode = v);
  seg("sel", v => cfg.selectMode = v);
  (m.querySelector("#cancel") as HTMLElement).onclick = () => m.remove();
  (m.querySelector("#ok") as HTMLElement).onclick = async () => {
    const q = (s: string) => m.querySelector(s) as HTMLInputElement;
    const password = cfg.priv ? q("#pw").value : "";
    if (cfg.priv && !password) return alert("Pon una contraseña");
    try {
      enter(await client.create("aram", { roomName: q("#rname").value, name, mode: cfg.mode, selectMode: cfg.selectMode, password, banter: q("#banter").checked, mercadona: q("#merc").checked }));
    } catch (e: any) { alert(e.message ?? e); }
  };
}

// ---------------------------------------------------------------- room screens
function enter(r: Room<any, any>) {
  room = r;
  (window as any).room = r; // handy for debugging/E2E
  clearInterval(refresh);
  let phase = "", loadP: Promise<void> | undefined;
  r.onMessage("chat", m => { chatLog.push(m); renderChat(); gameMod?.onChat(m); });
  r.onLeave(() => { if (room === r) { gameMod?.stop(); home(); } });
  r.onStateChange(s => {
    if (s.phase !== phase) {
      phase = s.phase;
      if (phase === "lobby") lobby();
      else if (phase === "select") select();
      else if (phase === "loading") loadP = loading();
      // a throttled background tab can still be loading when the server's 20 s timeout starts the game
      else if (phase === "game") (loadP ??= loading()).then(() => { if (room === r && !gameMod!.running()) startGame(); });
      else if (phase === "end") setTimeout(postGame, 4500);
    }
    if (phase === "lobby") renderLobby();
    else if (phase === "select") renderSelect();
    else if (phase === "loading") renderLoading();
  });
}

function renderChat() {
  const log = document.querySelector(".chat .log");
  if (!log) return;
  log.innerHTML = chatLog.slice(-60).map(m => m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div><b class="${m.team ? "r" : "b"}">${esc(m.from)}:</b> ${esc(m.text)}</div>`).join("");
  log.scrollTop = 1e9;
}
const chatBox = () => `<div class="panel chat"><h3>Chat</h3><div class="log"></div><form><input class="field" maxlength="200" placeholder="Escribe algo..."><button class="btn">➤</button></form></div>`;
function wireChat() {
  const f = document.querySelector(".chat form") as HTMLFormElement;
  f.onsubmit = e => { e.preventDefault(); const i = f.querySelector("input")!; if (i.value.trim()) room?.send("chat", { text: i.value }); i.value = ""; };
  renderChat();
}

function lobby() {
  app.innerHTML = `<div class="screen"><div class="wrap">${logo}
    <div class="row" style="margin-bottom:12px"><h2 class="grow" id="rtitle"></h2><button class="btn" id="leave">Salir</button><button class="btn primary" id="start">Empezar partida</button></div>
    <div class="lobby"><div class="panel team blue" id="t0"></div><div class="panel team red" id="t1"></div></div>
    <div class="lobby" style="margin-top:16px">
      <div class="panel"><h3>Hechizos de invocador (D / F)</h3><div class="picker" id="sd"></div><div class="picker" id="sf" style="margin-top:8px"></div>
        <h3 style="margin-top:14px">Runa Meme</h3><div class="picker" id="rune"></div><div id="runedesc" class="kit" style="margin-top:6px"></div></div>
      ${chatBox()}
    </div></div></div>`;
  (document.getElementById("leave") as HTMLElement).onclick = () => room?.leave();
  (document.getElementById("start") as HTMLElement).onclick = () => room?.send("start");
  wireChat();
  renderLobby();
}

function renderLobby() {
  const s = room!.state, me = s.players.get(room!.sessionId);
  if (!me || !document.getElementById("t0")) return;
  const per = +s.mode[0];
  document.getElementById("rtitle")!.textContent = `${s.roomName} · ${s.mode} · ${SELECT_MODES[s.selectMode as keyof typeof SELECT_MODES]}${s.mercadona ? " · 🛒" : ""}${s.banter ? " · 🥩" : ""}`;
  for (const t of [0, 1]) {
    const ps = [...s.players.entries()].filter(([, p]: any) => p.team === t);
    const el = document.getElementById("t" + t)!;
    el.innerHTML = `<h3><span>${t ? "🔵 Equipo Rojo · PP" : "🌹 Equipo Azul · PSOE"}</span>${me.team !== t && ps.length < per ? `<button class="btn" data-team="${t}">Cambiar</button>` : ""}</h3>` +
      ps.map(([id, p]: any) => `<div class="slot ${id === room!.sessionId ? "me" : ""}">${id === s.host ? "👑" : "🐦"} <b>${esc(p.name)}</b><span class="sp">${SPELLS[p.spellD]?.icon}${SPELLS[p.spellF]?.icon} ${RUNES[p.rune]?.icon}</span></div>`).join("") +
      Array(Math.max(0, per - ps.length)).fill(`<div class="slot empty">Escaño vacío...</div>`).join("");
    el.querySelectorAll<HTMLElement>("[data-team]").forEach(b => b.onclick = () => room!.send("team", { team: +b.dataset.team! }));
  }
  const pick = (id: string, cur: string, other: string, key: string) => {
    const el = document.getElementById(id)!;
    if (el.dataset.cur === cur + other) return;
    el.dataset.cur = cur + other;
    el.innerHTML = Object.entries(SPELLS).map(([k, v]) => `<button data-k="${k}" class="${k === cur ? "on" : ""}" ${k === other ? "disabled" : ""} data-tip="${v.name}: ${esc(v.desc)}">${v.icon}</button>`).join("");
    el.querySelectorAll<HTMLElement>("button").forEach(b => b.onclick = () => room!.send("loadout", { [key]: b.dataset.k }));
  };
  pick("sd", me.spellD, me.spellF, "spellD");
  pick("sf", me.spellF, me.spellD, "spellF");
  const re = document.getElementById("rune")!;
  if (re.dataset.cur !== me.rune) {
    re.dataset.cur = me.rune;
    re.innerHTML = Object.entries(RUNES).map(([k, v]) => `<button data-k="${k}" class="${k === me.rune ? "on" : ""}" data-tip="${v.name}: ${esc(v.desc)}">${v.icon}</button>`).join("");
    re.querySelectorAll<HTMLElement>("button").forEach(b => b.onclick = () => room!.send("loadout", { rune: b.dataset.k }));
    document.getElementById("runedesc")!.innerHTML = `<b>${RUNES[me.rune].name}</b>: ${RUNES[me.rune].desc}`;
  }
  const st = document.getElementById("start") as HTMLButtonElement;
  const teams = [...s.players.values()].map((p: any) => p.team);
  st.style.display = s.host === room!.sessionId ? "" : "none";
  st.disabled = !(teams.includes(0) && teams.includes(1));
}

const kitHtml = (id: string) => {
  const c = champ(id);
  return `<div class="kit"><b>${c.name}</b> — <i>${c.title}</i> · ${c.role}<br><b>Pasiva · ${c.passive.name}:</b> ${esc(c.passive.desc)}<br>${c.abilities.map((a, i) => `<b>${"QWER"[i]} · ${a.name}:</b> ${esc(a.desc)}`).join("<br>")}</div>`;
};

function select() {
  const s = room!.state;
  app.innerHTML = `<div class="screen"><div class="wrap">
    <div class="select-top"><h2>${SELECT_MODES[s.selectMode as keyof typeof SELECT_MODES]}</h2><div class="timer" id="timer"></div></div>
    <div id="pickarea" class="panel"></div>
    <div class="lobby" style="margin-top:16px"><div class="panel" id="picks"></div>${chatBox()}</div></div></div>`;
  wireChat();
  renderSelect();
}

function renderSelect() {
  const s = room!.state, me = s.players.get(room!.sessionId);
  const area = document.getElementById("pickarea");
  if (!me || !area) return;
  document.getElementById("timer")!.textContent = String(Math.ceil(s.timer));
  const taken = new Set([...s.players.values()].map((p: any) => p.champ));
  const key = s.selectMode + me.champ + me.rerolls + [...taken].join() + [...me.options].join();
  if (area.dataset.key !== key) {
    area.dataset.key = key;
    const card = (id: string) => { const c = champ(id); return `<div class="ccard ${me.champ === id ? "on" : ""} ${taken.has(id) && me.champ !== id ? "taken" : ""}" data-id="${id}" style="background-image:url(${splash(id)})">${c.meme ? `<span class="meme">MEME</span>` : ""}<div class="nm">${c.name}</div></div>`; };
    if (s.selectMode === "aram")
      area.innerHTML = `<div class="three">${card(me.champ)}<div style="max-width:460px">${kitHtml(me.champ)}<br><button class="btn" id="reroll" ${me.rerolls ? "" : "disabled"}>🎲 Rerollear (${me.rerolls})</button></div></div>`;
    else if (s.selectMode === "three")
      area.innerHTML = `<div class="three">${[...me.options].map(card).join("")}</div>${me.champ ? `<div style="margin-top:12px">${kitHtml(me.champ)}</div>` : "<p style='text-align:center'>Elige 1 de 3 antes de que acabe el tiempo</p>"}`;
    else
      area.innerHTML = `<div class="champ-grid">${CHAMPS.map(c => card(c.id)).join("")}</div>${me.champ ? `<div style="margin-top:12px">${kitHtml(me.champ)}</div>` : ""}`;
    area.querySelectorAll<HTMLElement>(".ccard").forEach(el => el.onclick = () => { sfx("click"); room!.send("pick", { champ: el.dataset.id }); });
    const rr = document.getElementById("reroll");
    if (rr) rr.onclick = () => { sfx("click"); room!.send("reroll"); };
  }
  document.getElementById("picks")!.innerHTML = [0, 1].map(t => `<h3>${t ? "PP" : "PSOE"}</h3>` + [...s.players.values()].filter((p: any) => p.team === t).map((p: any) =>
    `<div class="slot">${p.champ && (p.team === me.team || s.selectMode === "aram") ? `<img src="${splash(p.champ)}" width="48" height="36" style="object-fit:cover">` : "❔"} <b>${esc(p.name)}</b> <span class="sp" style="font-size:13px">${p.champ && (p.team === me.team || s.selectMode === "aram") ? champ(p.champ).name : "eligiendo..."}</span></div>`).join("")).join("");
}

let tipTimer: number | undefined;
async function loading() {
  app.innerHTML = `<div class="screen loading"><div class="load-teams"><div class="load-row" id="l0"></div><div class="tip" id="tip"></div><div class="load-row" id="l1"></div></div></div>`;
  let ti = Math.floor(Math.random() * LOADING_TIPS.length);
  const tip = () => { const el = document.getElementById("tip"); if (el) el.textContent = "💡 " + LOADING_TIPS[ti++ % LOADING_TIPS.length]; else clearInterval(tipTimer); };
  tip();
  tipTimer = window.setInterval(tip, 3500);
  renderLoading();
  // load the game module and build the scene, reporting progress
  const report = (pct: number) => room?.send("loaded", { pct });
  report(10);
  gameMod = await import("./game");
  report(50);
  await gameMod.prepare(room!, report);
  report(100);
}
function renderLoading() {
  const s = room!.state;
  for (const t of [0, 1]) {
    const el = document.getElementById("l" + t);
    if (!el) return;
    el.innerHTML = [...s.players.values()].filter((p: any) => p.team === t).map((p: any) => `<div class="lcard" style="border-color:${t ? "var(--red)" : "var(--blue)"}">
      <div class="art" style="background-image:url(${splash(p.champ)})"></div>
      <div class="info"><b>${champ(p.champ).name}</b>${esc(p.name)} · ${SPELLS[p.spellD]?.icon}${SPELLS[p.spellF]?.icon}${RUNES[p.rune]?.icon}<div class="pb"><i style="width:${p.loaded}%"></i></div></div></div>`).join("");
  }
}

function startGame() {
  clearInterval(tipTimer);
  app.innerHTML = "";
  gameMod!.start(room!, chatLog);
}

// ---------------------------------------------------------------- post game
function postGame() {
  const s = room?.state;
  if (!s || s.phase !== "end") return;
  gameMod?.stop();
  const me = s.units.get(room!.sessionId);
  const win = me && me.team === s.winner;
  const champs = [...s.units.entries()].filter(([, u]: any) => u.kind === "champ").map(([id, u]: any) => ({ id, ...u.toJSON() }));
  const graph = (key: string, label: string) => {
    const max = Math.max(1, ...champs.map(c => c[key]));
    return `<div class="panel"><h3>${label}</h3>${champs.map(c => `<div class="gbar"><span class="n">${esc(c.name)}</span><span class="v"><i style="width:${(c[key] / max) * 100}%;background:${c.team ? "var(--red)" : "var(--blue)"}"></i></span><span>${Math.round(c[key])}</span></div>`).join("")}</div>`;
  };
  const best = (f: (c: any) => number) => champs.slice().sort((a, b) => f(b) - f(a))[0];
  const mvp = best(c => (c.kills + c.assists) / Math.max(1, c.deaths) + c.dmgDealt / 5000);
  const feeder = best(c => c.deaths);
  const rat = best(c => c.minionKillsSolo * 2 + c.cs - (c.kills + c.assists) * 5);
  const pinger = best(c => c.pings);
  const award = (e: string, t: string, c: any, why: string) => `<div class="award"><div class="e">${e}</div><b>${t}</b>${esc(c?.name ?? "-")} <small>(${champ(c?.champ ?? "ezreal").name})</small><br><small>${why}</small></div>`;
  app.innerHTML = `<div class="screen post"><div class="wrap">
    <div class="banner ${win ? "win" : "lose"}">${win ? "VICTORIA" : "DERROTA"}</div>
    <div class="awards">
      ${award("👑", "MVP del Congreso", mvp, `KDA ${mvp?.kills}/${mvp?.deaths}/${mvp?.assists}`)}
      ${award("💀", "Feeder del Año", feeder, `${feeder?.deaths} muertes. Un escándalo.`)}
      ${award("🐀", "Rata de Granja", rat, `${rat?.cs} palomas farmeadas, ${rat?.minionKillsSolo} sin testigos`)}
      ${award("📢", "Ministro de Pings", pinger, `${pinger?.pings} notificaciones de WhatsApp`)}
    </div>
    <div class="graphs">${graph("dmgDealt", "Daño infligido")}${graph("dmgTaken", "Daño recibido")}${graph("goldEarned", "Oro ganado")}</div>
    <div style="margin-top:20px"><button class="btn primary" id="back">Volver al buscador</button></div>
  </div></div>${win ? `<div class="fireworks" id="fw"></div>` : `<div class="rain"></div>`}`;
  document.getElementById("back")!.onclick = () => room?.leave();
  if (win) {
    speak("¡Aupa España y viva el Fary!");
    const fw = document.getElementById("fw")!;
    const burst = () => {
      if (!fw.isConnected) return;
      const x = Math.random() * innerWidth, y = Math.random() * innerHeight * 0.6, col = `hsl(${Math.random() * 360},100%,60%)`;
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2, r = 80 + Math.random() * 80;
        fw.append(h(`<i style="left:${x}px;top:${y}px;background:${col};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px"></i>`));
      }
      sfx("firework");
      while (fw.children.length > 300) fw.firstChild!.remove();
      setTimeout(burst, 500);
    };
    burst();
  } else speak("Vaya paquete te has buscao...");
}

home();
