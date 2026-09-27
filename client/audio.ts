// All audio is synthesized with Web Audio (no asset files). Voice lines use the browser's speechSynthesis.
let ctx: AudioContext | undefined;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
export const vol = { master: 0.7, sfx: 0.8, music: 0.35 };

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    applyVolume();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
export function applyVolume() {
  if (!ctx) return;
  master.gain.value = vol.master; sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.3, at = 0, bus = sfxBus, slide?: number) {
  const c = audio(), t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, gain = 0.3, filter = 3000, at = 0, bus = sfxBus, q = 1, type: BiquadFilterType = "bandpass") {
  const c = audio(), t = c.currentTime + at;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = type; f.frequency.value = filter; f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t);
}
const notes = (seq: [number, number][], type: OscillatorType, gain = 0.2, step = 0.15) => seq.forEach(([f, d], i) => f && tone(f, d * step * 1.1, type, gain, i * step));

export function sfx(name: string, v = 1) {
  if (!ctx && name !== "click") return;
  switch (name) {
    case "click": tone(900, 0.05, "square", 0.05 * v); break;
    case "bell": [523, 1046, 1568, 2093].forEach((f, i) => tone(f * 0.5, 1.4, "sine", (0.12 / (i + 1)) * v)); break;
    case "tsss": noise(0.9, 0.35 * v, 6000, 0, sfxBus, 0.5, "highpass"); tone(180, 0.08, "square", 0.1 * v); break;
    case "pop": tone(880, 0.07, "sine", 0.25 * v); tone(1320, 0.1, "sine", 0.25 * v, 0.08); break; // WhatsApp-ish
    case "whistle": tone(1200, 0.15, "sine", 0.2 * v, 0, sfxBus, 2000); tone(1400, 0.2, "sine", 0.2 * v, 0.18, sfxBus, 900); break;
    case "pew": tone(900, 0.12, "square", 0.08 * v, 0, sfxBus, 200); break;
    case "hit": noise(0.08, 0.2 * v, 1200); break;
    case "boom": noise(0.6, 0.5 * v, 300, 0, sfxBus, 0.7, "lowpass"); tone(90, 0.5, "sine", 0.4 * v, 0, sfxBus, 40); break;
    case "fire": noise(0.4, 0.25 * v, 900); break;
    case "coo": tone(420, 0.12, "sine", 0.15 * v, 0, sfxBus, 360); tone(380, 0.18, "sine", 0.12 * v, 0.13, sfxBus, 300); break;
    case "levelup": notes([[523, 1], [659, 1], [784, 1], [1046, 2]], "triangle", 0.15 * v, 0.08); break;
    case "buy": tone(1568, 0.1, "square", 0.08 * v); tone(2093, 0.25, "square", 0.08 * v, 0.1); break;
    case "stonks": [0, 0.35, 0.7].forEach(a => [880, 1320, 1760].forEach(f => tone(f, 0.3, "sine", 0.12 * v, a))); break;
    case "wasted": tone(220, 1.8, "sawtooth", 0.2 * v, 0, sfxBus, 55); noise(1.2, 0.2 * v, 400, 0.1); break;
    case "towershot": tone(160, 0.35, "sine", 0.22 * v, 0, sfxBus, 55); noise(0.25, 0.12 * v, 500, 0, sfxBus, 0.8, "lowpass"); break; // deep arcane thump
    case "slam": noise(0.3, 0.4 * v, 200, 0, sfxBus, 1, "lowpass"); tone(120, 0.3, "sine", 0.3 * v, 0, sfxBus, 50); break;
    case "firework": noise(0.25, 0.3 * v, 2500); tone(1600, 0.4, "sine", 0.05 * v, 0, sfxBus, 400); break;
    case "jingle": notes([[659, 2], [587, 1], [523, 2], [0, 1], [659, 2], [587, 1], [523, 3]], "triangle", 0.25 * v, 0.18); break;
    case "fanfare": // opening of the Marcha Real, festive brass band
      notes([[392, 2], [523, 1], [392, 1], [330, 1], [262, 1], [392, 2], [349, 1], [330, 1], [294, 1], [262, 1], [247, 2], [262, 4]], "sawtooth", 0.14 * v, 0.2);
      notes([[196, 4], [0, 2], [131, 4], [0, 2], [175, 4], [196, 4], [131, 4]], "square", 0.06 * v, 0.2);
      break;
    case "gospel": [262, 330, 392, 523].forEach((f, i) => tone(f, 2.5, "sawtooth", 0.05 * v, i * 0.05)); break;
  }
}

let voice: SpeechSynthesisVoice | undefined;
export function speak(text: string, o: { lang?: string; rate?: number; pitch?: number } = {}) {
  if (!("speechSynthesis" in window)) return;
  const lang = o.lang ?? "es-ES";
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => v.lang === lang) ?? vs.find(v => v.lang.startsWith(lang.slice(0, 2)));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang; if (voice) u.voice = voice;
  u.rate = o.rate ?? 1.05; u.pitch = o.pitch ?? 0.7; u.volume = vol.master;
  speechSynthesis.speak(u);
}

// ---------------------------------------------------------------- generative music
const THEMES: Record<string, { bpm: number; scale: number[]; root: number; lead: OscillatorType; drums: "boom" | "four" | "march" | "soft" | "chip" }> = {
  hiphop: { bpm: 88, scale: [0, 3, 5, 7, 10], root: 110, lead: "square", drums: "boom" },
  pasodoble: { bpm: 116, scale: [0, 1, 4, 5, 7, 8, 10], root: 147, lead: "sawtooth", drums: "march" },
  chiptune: { bpm: 140, scale: [0, 2, 4, 7, 9], root: 196, lead: "square", drums: "chip" },
  epic: { bpm: 100, scale: [0, 2, 3, 5, 7, 8, 10], root: 110, lead: "sawtooth", drums: "march" },
  disco: { bpm: 118, scale: [0, 2, 3, 5, 7, 10], root: 131, lead: "square", drums: "four" },
  dark: { bpm: 76, scale: [0, 1, 3, 5, 6, 8], root: 98, lead: "triangle", drums: "soft" },
  ambient: { bpm: 60, scale: [0, 2, 5, 7, 9], root: 110, lead: "sine", drums: "soft" },
  fight: { bpm: 150, scale: [0, 2, 3, 7, 8], root: 147, lead: "square", drums: "chip" },
};
let timer: number | undefined, step = 0;
export const music = { mode: "champion" as "champion" | "ambient" | "off", theme: "epic", fight: false };

export function startMusic() {
  stopMusic();
  if (music.mode === "off") return;
  let cur = "";
  const loop = () => {
    const key = music.mode === "ambient" ? (music.fight ? "fight" : "ambient") : music.theme;
    const th = THEMES[key];
    if (key !== cur) { cur = key; step = 0; }
    const s16 = 60 / th.bpm / 4;
    const bar = Math.floor(step / 16) % 4, i = step % 16;
    const chord = [0, 5, 3, 4][bar];
    const f = (deg: number, oct = 0) => th.root * Math.pow(2, (th.scale[(deg % th.scale.length + th.scale.length) % th.scale.length] + 12 * (oct + Math.floor(deg / th.scale.length))) / 12);
    if (i % 4 === 0) tone(f(chord, -1), s16 * 3.5, "triangle", 0.18, 0, musicBus);
    if (key === "ambient" && i === 0) [0, 2, 4].forEach(d => tone(f(chord + d, 1), s16 * 15, "sine", 0.05, 0, musicBus));
    else if (Math.random() < (key === "ambient" ? 0.1 : 0.45) && i % 2 === 0) tone(f(chord + Math.floor(Math.random() * 6), 1), s16 * 1.8, th.lead, 0.05, 0, musicBus);
    const d = th.drums;
    if ((d === "boom" && (i === 0 || i === 10)) || (d === "four" && i % 4 === 0) || (d === "chip" && i % 4 === 0) || (d === "march" && i % 8 === 0)) tone(110, 0.15, "sine", 0.35, 0, musicBus, 40);
    if ((d === "boom" || d === "four" || d === "march") && i % 8 === 4) noise(0.12, 0.15, 1800, 0, musicBus);
    if (d !== "soft" && d !== "march" && i % 2 === 1) noise(0.03, 0.06, 8000, 0, musicBus);
    if (d === "march" && i % 2 === 0) noise(0.04, 0.05, 5000, 0, musicBus);
    step++;
    timer = window.setTimeout(loop, s16 * 1000);
  };
  loop();
}
export function stopMusic() { if (timer) clearTimeout(timer); timer = undefined; }
