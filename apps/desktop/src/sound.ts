// Short UI sounds. The WAVs are generated from sine waves by Poupou's
// scripts/gen-sounds.mjs (MIT), so they're ours to ship.

export type SoundName =
  | "approval"
  | "approve"
  | "blip"
  | "send"
  | "finish"
  | "error"
  | "pop"
  | "open"
  | "close"
  | "hover"
  | "peek"
  | "work"
  | "greet";

const STORAGE_KEY = "boltie.volume";
const DEFAULT_VOLUME = 0.12;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();

function readVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_VOLUME : Number(raw);
  } catch {
    return DEFAULT_VOLUME;
  }
}

let volume = readVolume();

function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  return { ctx, master };
}

function load(name: SoundName): Promise<AudioBuffer | null> {
  let pending = buffers.get(name);
  if (!pending) {
    pending = fetch(`/sounds/${name}.wav`)
      .then((r) => r.arrayBuffer())
      .then((data) => audio().ctx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(name, pending);
  }
  return pending;
}

export function play(name: SoundName) {
  if (volume <= 0) return;
  void load(name).then((buffer) => {
    if (!buffer) return;
    const { ctx, master } = audio();
    if (ctx.state === "suspended") void ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.start();
  });
}

export function getVolume() {
  return volume;
}

export function setVolume(value: number) {
  volume = Math.max(0, Math.min(0.2, value));
  if (master) master.gain.value = volume;
  try {
    localStorage.setItem(STORAGE_KEY, String(volume));
  } catch {
    // Private mode or blocked storage: the setting just won't stick.
  }
}
