// Boltie's body. Built from primitives so the design is ours and every
// expression is code: a glossy round shell, a black glass visor whose eyes are
// drawn on a canvas, an antenna bulb in the current state colour, floating
// hands and a jet glow underneath. He's round, so he flies instead of walking.
//
// Motion follows Poupou: eyes track the cursor, values ease with
// frame-rate-independent smoothing, blinks are random with the odd double
// blink, and each state has its own colour, eye shape and movement.
//
// The camera is orthographic in CSS pixels, so world x/y map 1:1 to the window.

import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

export type Mood = "idle" | "listening" | "thinking" | "working" | "asking" | "happy" | "sad" | "sleeping";

type Eyes = "pill" | "wide" | "happy" | "flat" | "closed" | "focus";

interface Look {
  color: string; // eyes, bulb, jet and glow
  glow: number; // glow opacity under the robot
  eyes: Eyes;
}

/** Colours from Poupou's state table. Idle eyes stay Boltie yellow. */
const LOOKS: Record<Mood, Look> = {
  idle: { color: "#ffd45e", glow: 0.15, eyes: "pill" },
  listening: { color: "#ffd45e", glow: 0.35, eyes: "happy" },
  thinking: { color: "#a78bfa", glow: 0.65, eyes: "pill" },
  working: { color: "#3b9eff", glow: 0.65, eyes: "focus" },
  asking: { color: "#f5a524", glow: 0.65, eyes: "wide" },
  happy: { color: "#34d399", glow: 0.65, eyes: "happy" },
  sad: { color: "#f4505e", glow: 0.65, eyes: "flat" },
  sleeping: { color: "#94a2b8", glow: 0.1, eyes: "closed" },
};

const R = 40; // shell radius in css px
const FLOOR = 4; // shadow line above the bottom edge
const HOVER = 28; // gap between the floor and the bottom of the shell
const FLY_SPEED = 95; // css px per second
const MAX_ALT = 70; // how high he drifts when idle
const SLEEP_AFTER_MS = 3 * 60 * 1000;

/** Ease toward a target independent of frame rate: k = 1 - base^dt. */
const approach = (from: number, to: number, base: number, dt: number) => from + (to - from) * (1 - Math.pow(base, dt));
const back = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Robot {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(0, 1, 1, 0, -2000, 2000);

  private root = new Group(); // position on screen
  private body = new Group(); // bob, squash, bank, look
  private hands: Mesh[] = [];
  private bulb!: Mesh<SphereGeometry, MeshStandardMaterial>;
  private jet!: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private shadow!: Mesh<CircleGeometry, MeshBasicMaterial>;
  private stalk = new Group();

  private face = document.createElement("canvas");
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: CanvasTexture;
  private lastFace = "";

  private mood: Mood = "idle";
  private color = new Color(LOOKS.idle.color);
  private glowValue = LOOKS.idle.glow;

  // eased values
  private x = 0;
  private alt = 0;
  private bank = 0;
  private yaw = 0;
  private pitch = 0;
  private lookX = 0;
  private lookY = 0;
  private open = 1; // eyelid, 1 = open
  private hop = 0;
  private spin = 0;
  private shake = 0;
  private sway = 0;

  // targets and timers
  private cursor: { x: number; y: number } | null = null;
  private flyTo: number | null = null;
  private altTarget = 0;
  /** Height he settles at, set by dropping him somewhere. 0 = near the taskbar. */
  private perch = 0;
  private dragging = false;
  private dragVX = 0;
  private dragLastX = 0;
  private exiting: -1 | 1 | null = null;
  private nextWander = performance.now() + 5000;
  private nextBlink = performance.now() + 2000;
  private blinkUntil = 0;
  private waveUntil = 0;
  private reactionStart = 0;
  private lastActivity = performance.now();
  private hovered = false;
  private last = performance.now();
  private t = 0;

  /** When true he stays put (e.g. the dock is open next to him). */
  paused = false;
  /** Whether there's another screen to the left or right. Set from main.ts. */
  neighbours = { left: false, right: false };
  /** Called once he has flown off an edge towards a neighbouring screen. */
  onLeave: ((side: -1 | 1) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.camera.position.z = 1000;

    this.face.width = 512;
    this.face.height = 320;
    this.faceCtx = this.face.getContext("2d")!;
    this.faceTex = new CanvasTexture(this.face);
    this.faceTex.colorSpace = SRGBColorSpace;

    this.scene.add(new HemisphereLight(0xffffff, 0x3a4150, 1.6));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-400, 500, 700);
    this.scene.add(key);
    const rim = new DirectionalLight(0x9fc4ff, 1.2);
    rim.position.set(500, 200, -300);
    this.scene.add(rim);

    this.build();
    this.scene.add(this.root);

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.x = window.innerWidth * 0.75;
  }

  private build() {
    const shellMat = new MeshPhysicalMaterial({ color: 0xf3f4f7, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.15 });
    const darkMat = new MeshStandardMaterial({ color: 0x23272f, roughness: 0.55 });
    const accentMat = new MeshStandardMaterial({ color: 0xffc83d, roughness: 0.4 });

    // Shell, slightly squat so it reads as a body and not a ball.
    const shell = new Mesh(new SphereGeometry(R, 48, 32), shellMat);
    shell.scale.set(1, 0.94, 1);
    this.body.add(shell);

    // Visor: a patch of a slightly bigger sphere facing the camera. Its UVs
    // span the patch, so the face canvas maps straight onto it. The canvas
    // draws a rounded glass shape and leaves the corners transparent.
    const visor = new Mesh(
      new SphereGeometry(R * 1.012, 48, 24, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.66, 1.1),
      new MeshStandardMaterial({
        map: this.faceTex,
        roughness: 0.1,
        metalness: 0.25,
        emissive: 0xffffff,
        emissiveMap: this.faceTex,
        emissiveIntensity: 1.25,
        transparent: true,
        alphaTest: 0.5,
      }),
    );
    visor.scale.set(1, 0.94, 1);
    this.body.add(visor);

    // Ear nubs.
    for (const side of [-1, 1]) {
      const ear = new Mesh(new CylinderGeometry(9, 9, 8, 24), accentMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * R * 0.98, 2, 0);
      this.body.add(ear);
    }

    // Antenna with a glowing bulb.
    const stalk = new Mesh(new CylinderGeometry(1.6, 1.6, 16, 8), darkMat);
    stalk.position.y = 8;
    this.stalk.add(stalk);
    this.bulb = new Mesh(
      new SphereGeometry(5.5, 16, 12),
      new MeshStandardMaterial({ color: 0xffffff, emissive: this.color, emissiveIntensity: 1.8 }),
    );
    this.bulb.position.y = 18;
    this.stalk.add(this.bulb);
    this.stalk.position.y = R * 0.9;
    this.body.add(this.stalk);

    // A dark cap under the shell where the jet comes out.
    const nozzle = new Mesh(new CylinderGeometry(9, 12, 6, 24), darkMat);
    nozzle.position.y = -R * 0.9;
    this.body.add(nozzle);

    // Jet glow, a soft additive cone in the state colour.
    this.jet = new Mesh(
      new CylinderGeometry(9, 1.5, 24, 20, 1, true),
      new MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }),
    );
    this.jet.position.y = -R * 0.9 - 15;
    this.body.add(this.jet);

    // Floating hands, left then right. animate() positions them.
    for (let i = 0; i < 2; i++) {
      const hand = new Mesh(new SphereGeometry(8, 20, 14), shellMat);
      this.hands.push(hand);
      this.root.add(hand);
    }

    this.root.add(this.body);

    this.shadow = new Mesh(
      new CircleGeometry(R, 32),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    );
    this.shadow.position.set(0, 1, -R * 2);
    this.root.add(this.shadow);
  }

  setMood(mood: Mood) {
    this.lastActivity = performance.now();
    if (mood === this.mood && mood !== "happy" && mood !== "sad" && mood !== "listening") return;
    this.mood = mood;
    this.reactionStart = performance.now();
    if (mood !== "idle" && mood !== "sleeping") {
      this.flyTo = null;
      this.exiting = null;
    }
    if (mood === "idle") this.nextWander = performance.now() + 3000 + Math.random() * 4000;
  }

  /** Wave hello. */
  wave() {
    this.waveUntil = performance.now() + 1600;
  }

  /** Arrive on this screen from the given side, e.g. after crossing monitors. */
  enter(from: -1 | 1) {
    const w = window.innerWidth;
    this.x = from < 0 ? -R * 2 : w + R * 2;
    this.flyTo = from < 0 ? R * 4 + Math.random() * w * 0.3 : w - R * 4 - Math.random() * w * 0.3;
    this.exiting = null;
    this.lastActivity = performance.now();
  }

  /** Jump straight to a spot, e.g. after being summoned to another screen. */
  placeAt(x: number) {
    this.x = x;
    this.flyTo = null;
    this.exiting = null;
  }

  /** Is this point (css px) on the robot? */
  contains(x: number, y: number) {
    const r = this.rect();
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Centre of the shell in css px, for keeping the grab offset while dragging. */
  centre(): { x: number; y: number } {
    return { x: this.x, y: window.innerHeight - FLOOR - HOVER - R * 0.94 - this.alt };
  }

  beginDrag() {
    this.dragging = true;
    this.flyTo = null;
    this.exiting = null;
    this.dragLastX = this.x;
    this.lastActivity = performance.now();
  }

  /** Move his centre to (x, y) in css px. */
  dragTo(x: number, y: number) {
    const H = window.innerHeight;
    this.x = Math.min(Math.max(x, R), window.innerWidth - R);
    const alt = H - FLOOR - HOVER - R * 0.94 - y;
    this.alt = this.altTarget = Math.min(Math.max(alt, 0), H - FLOOR - HOVER - R * 3);
  }

  endDrag() {
    this.dragging = false;
    this.perch = this.altTarget = this.alt;
    this.nextWander = performance.now() + 4000 + Math.random() * 4000;
  }

  get perchHeight() {
    return this.perch;
  }

  /** Restore a saved height, or 0 to fly back down to the taskbar. */
  setPerch(height: number) {
    this.perch = this.altTarget = Math.max(0, Math.min(height, window.innerHeight - FLOOR - HOVER - R * 3));
  }

  /** Cursor position in css px relative to the window, or null when unknown. */
  setCursor(pos: { x: number; y: number } | null) {
    if (pos && this.cursor && Math.hypot(pos.x - this.cursor.x, pos.y - this.cursor.y) > 2) {
      this.lastActivity = performance.now();
      if (this.mood === "sleeping") this.setMood("idle");
    }
    this.cursor = pos;
    const r = this.rect();
    const over = !!pos && pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
    if (over && !this.hovered) this.blinkUntil = performance.now() + 140;
    this.hovered = over;
  }

  get stateColor() {
    return `#${this.color.getHexString()}`;
  }

  get glow() {
    return this.glowValue;
  }

  rect(): ScreenRect {
    const w = (R + 24) * 2;
    const h = R * 2 + 34;
    const bottom = window.innerHeight - FLOOR - HOVER - this.alt - this.hop + 12;
    return { x: this.x - w / 2, y: bottom - h, w, h };
  }

  headTop(): { x: number; y: number } {
    return { x: this.x, y: this.rect().y - 6 };
  }

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.t += dt;

    if (this.mood === "idle" && now - this.lastActivity > SLEEP_AFTER_MS && !this.paused) this.setMood("sleeping");

    this.wander(now, dt);
    this.animate(now, dt);
    this.drawFace(now);
    this.renderer.render(this.scene, this.camera);
  }

  private wander(now: number, dt: number) {
    if (this.dragging) return;
    if (this.mood !== "idle" || this.paused) {
      this.flyTo = null;
      this.exiting = null;
      this.altTarget = this.perch;
      return;
    }
    if (this.flyTo === null) {
      if (now < this.nextWander) return;
      this.altTarget = this.perch + (Math.random() < 0.5 ? 0 : Math.random() * MAX_ALT * (this.perch > 0 ? 0.5 : 1));
      const roll = Math.random();
      const sides = ([-1, 1] as const).filter((d) => (d < 0 ? this.neighbours.left : this.neighbours.right));
      if (sides.length && roll < 0.2) {
        // Pop over to the next screen now and then.
        this.exiting = sides[Math.floor(Math.random() * sides.length)];
        this.flyTo = this.exiting < 0 ? -R * 3 : window.innerWidth + R * 3;
      } else if (roll < 0.45) {
        this.wave();
        this.nextWander = now + 7000 + Math.random() * 9000;
      } else {
        const margin = R * 3;
        this.flyTo = margin + Math.random() * Math.max(window.innerWidth - margin * 2, 1);
      }
      return;
    }

    const dir = Math.sign(this.flyTo - this.x);
    const distance = Math.abs(this.flyTo - this.x);
    // Slow down over the last stretch instead of stopping dead.
    const speed = FLY_SPEED * Math.min(1, 0.25 + distance / 120);
    this.x += dir * speed * dt;
    if (dir === 0 || (dir > 0 && this.x >= this.flyTo) || (dir < 0 && this.x <= this.flyTo)) {
      this.x = this.flyTo;
      this.flyTo = null;
      this.nextWander = now + 6000 + Math.random() * 12000;
      if (this.exiting) {
        const side = this.exiting;
        this.exiting = null;
        this.onLeave?.(side);
      }
    }
  }

  private animate(now: number, dt: number) {
    const look = LOOKS[this.mood];
    this.color.lerp(new Color(look.color), 1 - Math.pow(0.002, dt));
    this.glowValue = approach(this.glowValue, look.glow, 0.01, dt);
    this.bulb.material.emissive.copy(this.color);
    const pulse = this.mood === "working" || this.mood === "thinking" || this.mood === "asking";
    this.bulb.material.emissiveIntensity = pulse ? 1.4 + Math.sin(this.t * 6) * 0.6 : 1.6;

    // Where to look: the cursor, or a state-specific direction.
    const flying = this.flyTo !== null;
    const dir = flying ? Math.sign(this.flyTo! - this.x) : 0;
    let tx = 0;
    let ty = 0;
    if (this.mood === "thinking") {
      tx = 0.55;
      ty = 0.55;
    } else if (this.mood === "sleeping") {
      ty = -0.3;
    } else if (flying) {
      tx = dir * 0.9;
    } else if (this.cursor) {
      const headY = window.innerHeight - FLOOR - HOVER - this.alt - R;
      tx = Math.tanh((this.cursor.x - this.x) / 260);
      ty = -Math.tanh((this.cursor.y - headY) / 200);
    }
    this.lookX = approach(this.lookX, tx, 0.0025, dt);
    this.lookY = approach(this.lookY, ty, 0.0025, dt);
    this.yaw = this.lookX * 0.62;
    this.pitch = -this.lookY * 0.35;

    // Blinks: quick close, slower open, every 2.2-5.4 s, sometimes twice.
    if (now > this.nextBlink && this.mood !== "sleeping") {
      this.blinkUntil = now + 200;
      const double = Math.random() < 0.22;
      this.nextBlink = now + (double ? 230 : 2200 + Math.random() * 3200);
    }
    const closing = now < this.blinkUntil;
    this.open = approach(this.open, closing ? 0.06 : 1, closing ? 1e-12 : 1e-7, dt);

    // Reactions.
    const since = (now - this.reactionStart) / 1000;
    let hopY = 0;
    this.spin = 0;
    this.shake = 0;
    if (this.mood === "happy" && since < 0.95) {
      const p = since / 0.95;
      hopY = Math.sin(p * Math.PI) * 30;
      this.spin = back(Math.min(p * 1.1, 1)) * Math.PI * 2;
    } else if (this.mood === "listening" && since < 0.35) {
      this.pitch += Math.sin((since / 0.35) * Math.PI) * 0.25; // nod
    } else if (this.mood === "sad" && since < 0.6) {
      this.shake = Math.sin(since * 40) * (1 - since / 0.6) * 7;
    } else if (this.mood === "asking") {
      hopY = Math.abs(Math.sin(this.t * 5.2)) * 6;
    }
    this.hop = approach(this.hop, hopY, 1e-6, dt);

    // Altitude and banking: he tilts into the direction he flies, or swings
    // with the drag when someone carries him.
    if (this.dragging) {
      this.dragVX = approach(this.dragVX, (this.x - this.dragLastX) / Math.max(dt, 1e-3), 0.001, dt);
      this.dragLastX = this.x;
      this.bank = approach(this.bank, Math.max(-0.5, Math.min(0.5, -this.dragVX * 0.0015)), 0.0005, dt);
    } else {
      this.alt = approach(this.alt, this.mood === "sleeping" ? Math.max(this.perch - 10, -10) : this.altTarget, 0.3, dt);
      this.bank = approach(this.bank, -dir * 0.22, 0.02, dt);
    }

    const breathe = this.mood === "sleeping" ? Math.sin(this.t * 1.8) * 0.035 : Math.sin(this.t * 2.2) * 0.015;
    const bob = this.mood === "working" ? Math.sin(this.t * 9) * 2 : Math.sin(this.t * 2) * 4;
    const base = HOVER + R * 0.94 + this.alt + bob + this.hop;
    this.body.position.set(this.shake, base, 0);
    this.body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    this.body.rotation.set(this.pitch + (flying ? 0.08 : 0), this.yaw + this.spin, this.bank);

    // Antenna lags behind the body a little.
    this.sway = approach(this.sway, -this.lookX * 0.25 - this.bank * 0.8, 0.001, dt);
    this.stalk.rotation.z = this.sway + Math.sin(this.t * 2.1) * 0.05;

    // Jet: longer and brighter while moving or working, with a flicker.
    const thrust = (flying ? 1 : 0.55) + (this.mood === "working" ? 0.25 : 0) + (this.hop > 2 ? 0.4 : 0);
    const flicker = 0.85 + Math.random() * 0.15;
    this.jet.material.color.copy(this.color);
    this.jet.material.opacity = 0.5 * flicker * (this.mood === "sleeping" ? 0.25 : 1);
    this.jet.scale.set(1, thrust * flicker, 1);
    this.jet.position.y = -R * 0.9 - 3 - 12 * thrust * flicker;

    // Hands float beside him, one waves on request or while asking.
    const waving = now < this.waveUntil || this.mood === "asking";
    this.hands.forEach((hand, i) => {
      const side = i === 0 ? -1 : 1;
      let y = base - R * 0.3 + Math.sin(this.t * 2.4 + i * 1.3) * 3;
      let x = side * (R + 14) - dir * 6; // trail a little when flying
      if (waving && side === 1) {
        y = base + R * 0.55 + Math.sin(this.t * 14) * 4;
        x = R + 10 + Math.sin(this.t * 14) * 5;
      }
      hand.position.set(x + this.shake, y, 8);
    });

    // The shadow shrinks and fades the higher he flies, and goes away when
    // he's perched high up the screen.
    const height = HOVER + this.alt + this.hop;
    const fade = height > 200 ? 0 : Math.max(0.25, 1 - height / 140);
    this.shadow.scale.set(0.8 * fade, 0.1 * fade, 1);
    this.shadow.material.opacity = 0.22 * fade;
    this.root.position.set(this.x, FLOOR, 0);
  }

  /** Redraw the eyes only when something visible changed. */
  private drawFace(now: number) {
    const look = LOOKS[this.mood];
    let eyes: Eyes = look.eyes;
    if (this.mood === "listening" && now - this.reactionStart > 900) eyes = "pill";
    if (this.dragging) eyes = "wide";
    const color = this.stateColor;
    const ox = Math.round(this.lookX * 44);
    const oy = Math.round(-this.lookY * 24);
    const open = Math.round(this.open * 20) / 20;
    const hover = this.hovered ? 1.08 : 1;
    const key = `${eyes}|${color}|${ox}|${oy}|${open}|${hover}`;
    if (key === this.lastFace) return;
    this.lastFace = key;

    const ctx = this.faceCtx;
    const { width: W, height: H } = this.face;
    ctx.clearRect(0, 0, W, H);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0c11";
    ctx.beginPath();
    ctx.roundRect(W * 0.04, H * 0.06, W * 0.92, H * 0.88, H * 0.4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.lineCap = "round";

    for (const side of [-1, 1]) {
      drawEye(ctx, eyes, W / 2 + side * 92 + ox, H / 2 + oy, open, hover);
    }
    this.faceTex.needsUpdate = true;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Screens can have different scaling, so re-read it on every resize.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    if (this.exiting === null && this.flyTo === null) {
      this.x = Math.min(Math.max(this.x, R * 2), Math.max(w - R * 2, R * 2));
    }
  }
}

function drawEye(ctx: CanvasRenderingContext2D, eyes: Eyes, cx: number, cy: number, open: number, scale: number) {
  const pill = (w: number, h: number) => {
    const hh = Math.max(h * open, 8);
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - hh / 2, w, hh, Math.min(w, hh) / 2);
    ctx.fill();
  };
  switch (eyes) {
    case "pill":
      pill(54 * scale, 100 * scale);
      break;
    case "focus":
      pill(54 * scale, 70 * scale);
      break;
    case "wide":
      pill(66 * scale, 118 * scale);
      break;
    case "happy":
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.arc(cx, cy + 22, 34, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    case "flat":
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + 8);
      ctx.lineTo(cx + 30, cy + 8);
      ctx.stroke();
      break;
    case "closed":
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy - 12, 28, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      break;
  }
}
