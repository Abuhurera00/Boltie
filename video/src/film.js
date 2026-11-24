// Boltie launch film. One deterministic renderer: renderFrame(t) draws the
// frame at time t (seconds). 120 BPM, beat = 0.5 s, bar = 2 s, 24 s total.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1920, H = 1080;
const FPS = 60;

// ---------------------------------------------------------------- utils
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const outExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const inExpo = t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
const outCubic = t => 1 - Math.pow(1 - t, 3);
const inOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outQuint = t => 1 - Math.pow(1 - t, 5);
const outBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const back = t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
function spring(t, f = 2.2, z = 0.42) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * f;
  return 1 - Math.exp(-z * w * t) * Math.cos(w * Math.sqrt(1 - z * z) * t);
}
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], clamp(t))).toString(16).padStart(2, '0')).join('');
}
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const BEAT = 0.5;

// ---------------------------------------------------------------- moods (from robot.ts)
const LOOKS = {
  idle: { color: '#ffd45e', eyes: 'pill' },
  listening: { color: '#ffd45e', eyes: 'happy' },
  thinking: { color: '#a78bfa', eyes: 'pill' },
  working: { color: '#3b9eff', eyes: 'focus' },
  asking: { color: '#f5a524', eyes: 'wide' },
  happy: { color: '#34d399', eyes: 'happy' },
  sad: { color: '#f4505e', eyes: 'flat' },
  sleeping: { color: '#94a2b8', eyes: 'closed' },
};

// ---------------------------------------------------------------- three.js Boltie
const R = 40;
const glCanvas = document.createElement('canvas');
glCanvas.width = W; glCanvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, W, H, 0, -4000, 4000);
camera.position.z = 2000;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4150, 1.6);
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-400, 500, 700);
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(500, 200, -300);
scene.add(hemi, key, rim);
function setLight(k) { hemi.intensity = 1.6 * k; key.intensity = 2.4 * k; rim.intensity = 1.2 * Math.max(k, 0.15); }

function drawEye(ctx, eyes, cx, cy, open, scale) {
  const pill = (w, h) => {
    const hh = Math.max(h * open, 8);
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - hh / 2, w, hh, Math.min(w, hh) / 2); ctx.fill();
  };
  switch (eyes) {
    case 'pill': pill(54 * scale, 100 * scale); break;
    case 'focus': pill(54 * scale, 70 * scale); break;
    case 'wide': pill(66 * scale, 118 * scale); break;
    case 'happy': ctx.lineWidth = 20; ctx.beginPath(); ctx.arc(cx, cy + 22, 34, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
    case 'flat': ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(cx - 30, cy + 8); ctx.lineTo(cx + 30, cy + 8); ctx.stroke(); break;
    case 'closed': ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(cx, cy - 12, 28, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); break;
  }
}

class Bot {
  constructor() {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.stalk = new THREE.Group();
    this.shellMat = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f7, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.55 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.55, envMapIntensity: 0.5 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.4, envMapIntensity: 0.5 });
    this.face = document.createElement('canvas'); this.face.width = 512; this.face.height = 320;
    this.fctx = this.face.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.face); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.lastFace = '';
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), this.shellMat);
    shell.scale.set(1, 0.94, 1); this.body.add(shell);
    this.visorMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.1, metalness: 0.25, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 1.25, transparent: true, alphaTest: 0.5, envMapIntensity: 0.8 });
    const visor = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.66, 1.1), this.visorMat);
    visor.scale.set(1, 0.94, 1); this.body.add(visor);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 8, 32), this.accentMat);
      ear.rotation.z = Math.PI / 2; ear.position.set(side * R * 0.98, 2, 0); this.body.add(ear);
    }
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 16, 10), this.darkMat);
    stalk.position.y = 8; this.stalk.add(stalk);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color('#ffd45e'), emissiveIntensity: 1.8 });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 14), this.bulbMat);
    this.bulb.position.y = 18; this.stalk.add(this.bulb);
    this.stalk.position.y = R * 0.9; this.body.add(this.stalk);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 6, 28), this.darkMat);
    nozzle.position.y = -R * 0.9; this.body.add(nozzle);
    this.jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd45e'), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.jet = new THREE.Mesh(new THREE.CylinderGeometry(9, 1.5, 24, 24, 1, true), this.jetMat);
    this.body.add(this.jet);
    this.hands = [0, 1].map(() => { const h = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), this.shellMat); this.root.add(h); return h; });
    this.root.add(this.body);
    scene.add(this.root);
  }
  apply(p, frameNo) {
    const q = Object.assign({ s: 1, color: '#ffd45e', eyes: 'pill', open: 1, lookX: 0, lookY: 0, spin: 0, bank: 0, pitch: 0, hop: 0, shake: 0, wave: 0, t: 0, bob: 1, bobFast: 0, thrust: 0.55, pulse: 0, dim: 1, eyeAlpha: 1, bulb: 1, z: 0, dir: 0, hover: 1, squash: 0 }, p);
    const col = new THREE.Color(q.color);
    this.bulbMat.emissive.copy(col);
    this.bulbMat.emissiveIntensity = (q.pulse ? 1.4 + Math.sin(q.t * 6) * 0.6 : 1.6) * q.bulb;
    this.bulbMat.color.setScalar(lerp(0.15, 1, clamp(q.bulb)));
    this.shellMat.color.set(0xf3f4f7).multiplyScalar(q.dim);
    this.accentMat.color.set(0xffc83d).multiplyScalar(q.dim);
    this.visorMat.emissiveIntensity = 1.25 * q.eyeAlpha;
    const bob = q.bobFast ? Math.sin(q.t * 9) * 2 : Math.sin(q.t * 2) * 4 * q.bob;
    const breathe = Math.sin(q.t * 2.2) * 0.015;
    this.body.position.set(q.shake, bob + q.hop, 0);
    const sq = q.squash;
    this.body.scale.set((1 - breathe * 0.5) * (1 + sq), (1 + breathe) * (1 - sq), (1 - breathe * 0.5) * (1 + sq));
    const yaw = q.lookX * 0.62;
    this.body.rotation.set(-q.lookY * 0.35 + q.pitch + (q.dir ? 0.08 : 0), yaw + q.spin, q.bank);
    this.stalk.rotation.z = -q.lookX * 0.25 - q.bank * 0.8 + Math.sin(q.t * 2.1) * 0.05;
    const flicker = 0.85 + hash(frameNo * 1.7 + q.x) * 0.15;
    this.jetMat.color.copy(col);
    this.jetMat.opacity = 0.5 * flicker * clamp(q.thrust * 2) * q.bulb;
    this.jet.scale.set(1, Math.max(q.thrust, 0.01) * flicker, 1);
    this.jet.position.y = -R * 0.9 - 3 - 12 * q.thrust * flicker;
    this.hands.forEach((hand, i) => {
      const side = i === 0 ? -1 : 1;
      let y = bob + q.hop - R * 0.3 + Math.sin(q.t * 2.4 + i * 1.3) * 3;
      let x = side * (R + 14) - q.dir * 6;
      if (side === 1 && q.wave > 0) {
        const wy = R * 0.55 + Math.sin(q.t * 14) * 4, wx = R + 10 + Math.sin(q.t * 14) * 5;
        x = lerp(x, wx, q.wave); y = lerp(y, bob + q.hop + wy, q.wave);
      }
      hand.position.set(x + q.shake, y, 8);
    });
    this.root.position.set(q.x, H - q.y, q.z);
    this.root.scale.setScalar(q.s);
    this.drawFace(q);
  }
  drawFace(q) {
    const ox = Math.round(q.lookX * 44), oy = Math.round(-q.lookY * 24);
    const open = Math.round(q.open * 40) / 40;
    const k = `${q.eyes}|${q.color}|${ox}|${oy}|${open}|${q.eyeAlpha.toFixed(2)}`;
    if (k === this.lastFace) return;
    this.lastFace = k;
    const ctx = this.fctx, Wf = 512, Hf = 320;
    ctx.clearRect(0, 0, Wf, Hf);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0c11';
    ctx.beginPath(); ctx.roundRect(Wf * 0.04, Hf * 0.06, Wf * 0.92, Hf * 0.88, Hf * 0.4); ctx.fill();
    ctx.globalAlpha = q.eyeAlpha;
    ctx.fillStyle = q.color; ctx.strokeStyle = q.color; ctx.shadowColor = q.color; ctx.shadowBlur = 28; ctx.lineCap = 'round';
    for (const side of [-1, 1]) drawEye(ctx, q.eyes, Wf / 2 + side * 92 + ox, Hf / 2 + oy, open, 1);
    ctx.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
}
const bots = Array.from({ length: 16 }, () => new Bot());
let frameNo = 0;
function renderBots(list, ctx) {
  bots.forEach(b => (b.root.visible = false));
  list.forEach((p, i) => { bots[i].root.visible = true; bots[i].apply(p, frameNo); });
  renderer.render(scene, camera);
  ctx.drawImage(glCanvas, 0, 0);
}

// ---------------------------------------------------------------- 2D layers
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
const [stageC, stage] = mk();
const [screenC, scr] = mk();
const [overC, over] = mk();

const F = {
  ui: (px, w = 400) => `${w} ${px}px Inter`,
  disp: (px, w = 800) => `${w} ${px}px "Inter Display"`,
  mono: (px, w = 400) => `${w} ${px}px "DejaVu Sans Mono"`,
};

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function wrap(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) {
    const tryL = cur ? cur + ' ' + w : w;
    if (ctx.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL;
  }
  if (cur) lines.push(cur);
  return lines;
}
const ICONS = {
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  up: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  check: 'M5 12l5 5L20 7',
};
const P2 = {}; for (const k in ICONS) P2[k] = new Path2D(ICONS[k]);
function icon(ctx, name, cx, cy, size, color, width = 2.2) {
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(P2[name]); ctx.restore();
}
function cursorArrow(ctx, x, y, s = 1.8, press = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * (1 - press * 0.12), s * (1 - press * 0.12));
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 19); ctx.lineTo(4.5, 14.6); ctx.lineTo(7.6, 21.4); ctx.lineTo(10.4, 20.2); ctx.lineTo(7.4, 13.6); ctx.lineTo(13.4, 13.6); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#111'; ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- wallpaper (cached)
const [wallC, wall] = mk();
function buildWallpaper() {
  const g = wall.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0d1b3d'); g.addColorStop(0.55, '#081230'); g.addColorStop(1, '#04081a');
  wall.fillStyle = g; wall.fillRect(0, 0, W, H);
  wall.save(); wall.filter = 'blur(70px)';
  const blob = (x, y, rx, ry, rot, c1, a) => {
    wall.save(); wall.translate(x, y); wall.rotate(rot); wall.scale(1, ry / rx);
    const gr = wall.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, rgba(c1, a)); gr.addColorStop(1, rgba(c1, 0));
    wall.fillStyle = gr; wall.beginPath(); wall.arc(0, 0, rx, 0, Math.PI * 2); wall.fill(); wall.restore();
  };
  blob(1180, 560, 700, 300, -0.5, '#2f6bff', 0.55);
  blob(1300, 480, 420, 160, 0.6, '#59b4ff', 0.5);
  blob(980, 640, 520, 170, -1.1, '#6a4dff', 0.45);
  blob(1500, 700, 380, 150, -0.2, '#1fb5ff', 0.35);
  blob(400, 200, 500, 300, 0, '#1a2c6b', 0.6);
  wall.restore();
  // petals: crisp-ish translucent ribbons
  wall.save(); wall.translate(1220, 560);
  for (let i = 0; i < 7; i++) {
    wall.save(); wall.rotate(-0.9 + i * 0.32);
    const gr = wall.createLinearGradient(0, -40, 420, 40);
    gr.addColorStop(0, 'rgba(120,180,255,0)'); gr.addColorStop(0.5, `rgba(${90 + i * 15},${150 + i * 8},255,0.22)`); gr.addColorStop(1, 'rgba(160,120,255,0)');
    wall.fillStyle = gr; wall.filter = 'blur(6px)';
    wall.beginPath(); wall.ellipse(240, 0, 260, 46, 0, 0, Math.PI * 2); wall.fill(); wall.restore();
  }
  wall.restore();
  // subtle noise
  const id = wall.getImageData(0, 0, W, H); const d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (hash(i * 0.37) - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  wall.putImageData(id, 0, 0);
}

// ---------------------------------------------------------------- desktop: constants
const U = 1.75;
const TASK_H = 48 * U, TASK_Y = H - TASK_H;
const FLOOR_Y = TASK_Y - 4 * U;
const HOME_X = 1300;
const botBaseY = alt => FLOOR_Y - (28 + R * 0.94 + alt) * U;

// ---------------------------------------------------------------- desktop: taskbar & icons
function appGlyph(ctx, kind, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy);
  const box = (c1, c2) => { const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; rr(ctx, -s / 2, -s / 2, s, s, s * 0.22); ctx.fill(); };
  if (kind === 'start') { ctx.fillStyle = '#5aa9ff'; const q = s * 0.21; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { rr(ctx, a * q * 1.1 - q, b * q * 1.1 - q, q * 2, q * 2, q * 0.5); ctx.fill(); } }
  else if (kind === 'folder') { ctx.fillStyle = '#e8b33a'; rr(ctx, -s / 2, -s * 0.36, s * 0.45, s * 0.2, 3); ctx.fill(); ctx.fillStyle = '#ffd15c'; rr(ctx, -s / 2, -s * 0.26, s, s * 0.66, s * 0.1); ctx.fill(); }
  else if (kind === 'term') { box('#2b2f38', '#16181d'); ctx.strokeStyle = '#e9ecf2'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * 0.24, -s * 0.14); ctx.lineTo(-s * 0.06, 0); ctx.lineTo(-s * 0.24, s * 0.14); ctx.moveTo(0, s * 0.16); ctx.lineTo(s * 0.22, s * 0.16); ctx.stroke(); }
  else if (kind === 'code') { box('#4f7cff', '#2747c9'); ctx.fillStyle = '#fff'; ctx.font = `700 ${s * 0.42}px "DejaVu Sans Mono"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('</>', 0, s * 0.02); }
  else if (kind === 'web') { const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); g.addColorStop(0, '#2ee6c9'); g.addColorStop(1, '#2079ff'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.4, 0, 0, 7); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(s * 0.4, 0); ctx.stroke(); }
  else if (kind === 'boltie') { ctx.fillStyle = '#f3f4f7'; ctx.beginPath(); ctx.arc(0, s * 0.04, s * 0.46, 0, 7); ctx.fill(); ctx.fillStyle = '#0a0c11'; rr(ctx, -s * 0.33, -s * 0.12, s * 0.66, s * 0.34, s * 0.17); ctx.fill(); ctx.fillStyle = '#ffd45e'; rr(ctx, -s * 0.17, -s * 0.06, s * 0.08, s * 0.2, s * 0.04); ctx.fill(); rr(ctx, s * 0.09, -s * 0.06, s * 0.08, s * 0.2, s * 0.04); ctx.fill(); ctx.fillStyle = '#ffc83d'; ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.08, 0, 7); ctx.fill(); }
  else if (kind === 'notes') { ctx.fillStyle = '#f5f6f8'; rr(ctx, -s * 0.36, -s / 2, s * 0.72, s, s * 0.06); ctx.fill(); ctx.fillStyle = '#9aa3b2'; for (let i = 0; i < 4; i++) ctx.fillRect(-s * 0.24, -s * 0.28 + i * s * 0.16, s * 0.48, s * 0.05); }
  ctx.restore();
}
function drawTaskbar(ctx, t) {
  ctx.fillStyle = 'rgba(22,24,30,0.86)'; ctx.fillRect(0, TASK_Y, W, TASK_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, TASK_Y, W, 1);
  const cy = TASK_Y + TASK_H / 2;
  const items = ['start', 'search', 'folder', 'web', 'term', 'code', 'boltie'];
  const slot = 40 * U; const searchW = 130 * U;
  const total = slot * (items.length - 1) + searchW;
  let x = W / 2 - total / 2;
  for (const it of items) {
    if (it === 'search') {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(ctx, x + 4, cy - 16 * U, searchW - 8, 32 * U, 16 * U); ctx.fill();
      icon(ctx, 'search', x + 22 * U, cy, 15 * U, '#c9ccd3', 2.4);
      ctx.fillStyle = '#9398a1'; ctx.font = F.ui(12.5 * U); ctx.textBaseline = 'middle'; ctx.fillText('Search', x + 36 * U, cy + 1);
      x += searchW; continue;
    }
    const cx = x + slot / 2;
    const active = (it === 'code' && t >= 11.0) || (it === 'term' && t >= 14.5) || it === 'boltie';
    if (active) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(ctx, cx - 18 * U, cy - 18 * U, 36 * U, 36 * U, 6 * U); ctx.fill(); ctx.fillStyle = it === 'boltie' ? '#ffd45e' : '#8ab4ff'; rr(ctx, cx - 5 * U, cy + 15 * U, 10 * U, 2.5 * U, 2 * U); ctx.fill(); }
    appGlyph(ctx, it, cx, cy - 1, 22 * U);
    x += slot;
  }
  ctx.fillStyle = '#e9ecf2'; ctx.font = F.ui(11.5 * U); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('8:49 PM', W - 18 * U, cy - 8 * U); ctx.fillText('11/21/2026', W - 18 * U, cy + 9 * U);
  ctx.textAlign = 'left';
  // tray glyphs
  const tx = W - 115 * U;
  ctx.strokeStyle = '#e9ecf2'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(tx, cy + 6 * U, (4 + i * 4) * U, -2.3, -0.84); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(tx + 20 * U, cy - 3 * U); ctx.lineTo(tx + 25 * U, cy - 3 * U); ctx.lineTo(tx + 31 * U, cy - 8 * U); ctx.lineTo(tx + 31 * U, cy + 8 * U); ctx.lineTo(tx + 25 * U, cy + 3 * U); ctx.lineTo(tx + 20 * U, cy + 3 * U); ctx.closePath(); ctx.stroke();
  rr(ctx, tx + 42 * U, cy - 5 * U, 20 * U, 10 * U, 2.5 * U); ctx.stroke(); ctx.fillStyle = '#e9ecf2'; ctx.fillRect(tx + 44 * U, cy - 3 * U, 12 * U, 6 * U);
}
function drawDesktopIcons(ctx) {
  const items = [['folder', 'my-app'], ['folder', 'projects'], ['notes', 'notes.txt']];
  items.forEach(([k, label], i) => {
    const cx = 60 * U, cy = 46 * U + i * 92 * U;
    appGlyph(ctx, k, cx, cy, 36 * U);
    ctx.font = F.ui(11.5 * U, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 6; ctx.fillStyle = '#fff'; ctx.fillText(label, cx, cy + 24 * U);
    ctx.shadowColor = 'transparent'; ctx.textAlign = 'left';
  });
}

// ---------------------------------------------------------------- desktop: windows
const CODE = [
  [['k', 'import'], ['p', ' { '], ['v', 'useState'], ['p', ' } '], ['k', 'from'], ['s', ' "react"'], ['p', ';']],
  [['k', 'import'], ['s', ' "./index.css"'], ['p', ';']],
  [],
  [['k', 'export default function'], ['f', ' App'], ['p', '() {']],
  [['p', '  '], ['k', 'const'], ['p', ' [count, setCount] = '], ['f', 'useState'], ['p', '('], ['n', '0'], ['p', ');']],
  [],
  [['p', '  '], ['k', 'return'], ['p', ' (']],
  [['p', '    '], ['t', '<main'], ['a', ' className'], ['p', '='], ['s', '"app"'], ['t', '>']],
  [['p', '      '], ['t', '<h1>'], ['p', 'Hello from my-app'], ['t', '</h1>']],
  [['p', '      '], ['t', '<button'], ['a', ' onClick'], ['p', '={() => '], ['f', 'setCount'], ['p', '(count + '], ['n', '1'], ['p', ')}'], ['t', '>']],
  [['p', '        clicked {count} times']],
  [['p', '      '], ['t', '</button>']],
  [['p', '    '], ['t', '</main>']],
  [['p', '  );']],
  [['p', '}']],
];
const TOK = { k: '#c792ea', p: '#d6deeb', v: '#addb67', s: '#ecc48d', f: '#82aaff', n: '#f78c6c', t: '#7fdbca', a: '#c5e478' };
function winFrame(ctx, x, y, w, h, title, t0, t, dark = '#1b1d23') {
  const a = outBack(clamp((t - t0) / 0.32), 1.3), al = clamp((t - t0) / 0.15);
  const s = lerp(0.9, 1, a);
  ctx.save(); ctx.globalAlpha = al;
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.fillStyle = dark; rr(ctx, 0, 0, w, h, 14); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.save(); rr(ctx, 0, 0, w, h, 14); ctx.clip();
  ctx.fillStyle = '#23262d'; ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#d6d9df'; ctx.font = F.ui(15, 500); ctx.textBaseline = 'middle'; ctx.fillText(title, 18, 21);
  ctx.strokeStyle = '#c4c8cf'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(w - 128, 21); ctx.lineTo(w - 116, 21); ctx.stroke();
  ctx.strokeRect(w - 80, 15, 11, 11);
  ctx.beginPath(); ctx.moveTo(w - 34, 15); ctx.lineTo(w - 23, 26); ctx.moveTo(w - 23, 15); ctx.lineTo(w - 34, 26); ctx.stroke();
  return { done: () => { ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; rr(ctx, 0.5, 0.5, w - 1, h - 1, 14); ctx.stroke(); ctx.restore(); } };
}
function drawEditor(ctx, t) {
  const t0 = 11.0; if (t < t0) return;
  const x = 120, y = 90, w = 1060, h = 680;
  const f = winFrame(ctx, x, y, w, h, 'App.tsx — my-app', t0, t, '#1e2026');
  ctx.fillStyle = '#181a1f'; ctx.fillRect(0, 40, 56, h - 40);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i === 0 ? '#c9ccd3' : '#5c616b'; rr(ctx, 16, 62 + i * 56, 24, 24, 5); ctx.fill(); }
  ctx.fillStyle = '#1b1d22'; ctx.fillRect(56, 40, 250, h - 40);
  ctx.font = F.ui(12, 600); ctx.fillStyle = '#8e939c'; ctx.fillText('EXPLORER', 76, 66);
  ctx.font = F.ui(14, 700); ctx.fillStyle = '#e6e8ec'; ctx.fillText('MY-APP', 76, 98);
  const tree = [['▾ src', 0, '#c9ccd3'], ['App.tsx', 1, '#ffffff'], ['main.tsx', 1, '#aeb3bb'], ['index.css', 1, '#aeb3bb'], ['package.json', 0, '#aeb3bb'], ['README.md', 0, '#aeb3bb'], ['vite.config.ts', 0, '#aeb3bb']];
  ctx.font = F.ui(14);
  tree.forEach(([n, d, c], i) => {
    if (i === 1) { ctx.fillStyle = 'rgba(120,150,255,.16)'; ctx.fillRect(56, 116 + i * 30, 250, 28); }
    ctx.fillStyle = c; ctx.fillText(n, 82 + d * 18, 131 + i * 30);
  });
  ctx.fillStyle = '#16181c'; ctx.fillRect(306, 40, w - 306, 40);
  ctx.fillStyle = '#1e2026'; ctx.fillRect(306, 40, 150, 40); ctx.fillStyle = '#8ab4ff'; ctx.fillRect(306, 40, 150, 2);
  ctx.fillStyle = '#e6e8ec'; ctx.font = F.ui(14); ctx.fillText('App.tsx', 330, 61);
  ctx.font = F.mono(16);
  CODE.forEach((line, i) => {
    const a = clamp((t - t0 - 0.12 - i * 0.022) / 0.2); if (a <= 0) return;
    ctx.globalAlpha = a;
    const ly = 112 + i * 30;
    ctx.fillStyle = '#4b5059'; ctx.textAlign = 'right'; ctx.fillText(String(i + 1), 360, ly); ctx.textAlign = 'left';
    let lx = 384 + (1 - outCubic(a)) * 20;
    for (const [k, s] of line) { ctx.fillStyle = TOK[k]; ctx.fillText(s, lx, ly); lx += ctx.measureText(s).width; }
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#25272e'; ctx.fillRect(0, h - 30, w, 30);
  ctx.fillStyle = '#9aa0aa'; ctx.font = F.ui(12.5); ctx.fillText('main   ✓ 0 problems', 70, h - 14); ctx.textAlign = 'right'; ctx.fillText('TypeScript JSX   UTF-8   Ln 9, Col 31', w - 20, h - 14); ctx.textAlign = 'left';
  f.done();
}
const TERM = [
  ['PS D:\\code> ', 'docker run -d --name pg -p 5432:5432 postgres:17', '#e6e8ec'],
  ['', "Unable to find image 'postgres:17' locally", '#9aa0aa'],
  ['', '17: Pulling from library/postgres', '#9aa0aa'],
  ['', 'Status: Downloaded newer image for postgres:17', '#9aa0aa'],
  ['', '3f9c1a7e2b6d4c8e9a0f51d2b7c3e8a4f6d0b9c2e1a7f3d5', '#7fdbca'],
  ['PS D:\\code> ', 'docker ps', '#e6e8ec'],
  ['', 'CONTAINER ID   IMAGE         STATUS         PORTS', '#9aa0aa'],
  ['', '3f9c1a7e2b6d   postgres:17   Up 2 seconds   0.0.0.0:5432->5432/tcp', '#34d399'],
];
function drawTerminal(ctx, t) {
  const t0 = 14.4; if (t < t0) return;
  const x = 1010, y = 70, w = 860, h = 360;
  const f = winFrame(ctx, x, y, w, h, 'Terminal — PowerShell', t0, t, '#0d0e11');
  ctx.font = F.mono(15);
  TERM.forEach(([pr, cmd, c], i) => {
    const ti = t0 + 0.2 + i * 0.125; if (t < ti) return;
    const ly = 76 + i * 30;
    ctx.fillStyle = '#5aa9ff'; ctx.fillText(pr, 20, ly);
    const px = 20 + ctx.measureText(pr).width;
    const n = pr ? Math.floor(clamp((t - ti) / 0.12) * cmd.length) : cmd.length;
    ctx.fillStyle = c; ctx.fillText(cmd.slice(0, n), px, ly);
  });
  if (t > t0 + 1.25 && Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#5aa9ff'; ctx.fillText('PS D:\\code> ', 20, 76 + 8 * 30); ctx.fillStyle = '#e6e8ec'; ctx.fillRect(20 + ctx.measureText('PS D:\\code> ').width, 76 + 8 * 30 - 15, 9, 19); }
  f.done();
}

// ---------------------------------------------------------------- desktop: Boltie card (dock) — from style.css
const WASH = { chat: [99, 102, 241, 0.5], working: [59, 158, 255, 0.4], approval: [245, 165, 36, 0.42], danger: [244, 80, 94, 0.55], done: [52, 211, 153, 0.5] };
const WASH_T = [[7.5, 'chat'], [10.0, 'working'], [11.5, 'done'], [12.75, 'chat'], [13.0, 'approval'], [14.1, 'working'], [15.0, 'done'], [16.0, 'chat'], [16.5, 'danger']];
function washAt(t) {
  let prev = WASH.chat, cur = WASH.chat, ts = 0;
  for (const [tt, n] of WASH_T) if (t >= tt) { prev = cur; cur = WASH[n]; ts = tt; }
  const k = clamp((t - ts) / 0.4);
  return prev.map((v, i) => lerp(v, cur[i], k));
}
function typed(t, t0, t1, s) { return s.slice(0, Math.floor(clamp((t - t0) / (t1 - t0)) * s.length + 1e-6)); }
const Q1 = 'open my-app in VS Code', Q2 = 'start a postgres container', Q3 = 'format my C: drive';
function cardState(t) {
  if (t < 7.5) return null;
  const st = { openT: 7.5, view: 'chat', viewT: 7.5, log: [], typing: null, input: '', busy: false, placeholder: 'Ask Boltie anything...', caret: true, press: 0 };
  // round 1
  if (t < 9.5) st.input = typed(t, 8.0, 9.2, Q1);
  if (t >= 9.5) st.log.push({ k: 'user', s: Q1, t: 9.5 });
  if (t >= 9.6 && t < 11.5) { st.busy = true; st.typing = t < 10.0 ? { step: '' } : { step: t < 10.5 ? 'Find · my-app' : 'Open · D:\\code\\my-app' }; }
  if (t >= 11.5) st.log.push({ k: 'reply', s: 'Opened my-app in VS Code.', t: 11.5 });
  // round 2
  if (t >= 11.5 && t < 12.75) { st.placeholder = 'Continue...'; st.input = typed(t, 12.0, 12.6, Q2); }
  if (t >= 12.75) st.log.push({ k: 'user', s: Q2, t: 12.75 });
  if (t >= 12.8 && t < 13.0) { st.busy = true; st.typing = { step: '' }; }
  if (t >= 13.0 && t < 14.1) {
    st.view = 'approval'; st.viewT = 13.0; st.busy = true;
    st.ap = { who: 'Boltie', risk: 'makes changes', title: 'Start a Docker container', code: 'docker run -d --name pg -p 5432:5432 postgres:17', cwd: 'in D:\\code' };
    st.press = t >= 13.92 ? Math.sin(clamp((t - 13.92) / 0.2) * Math.PI) : 0;
  }
  if (t >= 14.1 && t < 15.0) { st.viewT = 14.1; st.busy = true; st.typing = { step: 'Docker · postgres:17' }; }
  if (t >= 15.0) st.log.push({ k: 'reply', s: 'Postgres 17 is running on port 5432.', t: 15.0 });
  // round 3
  if (t >= 15.0 && t < 16.0) { st.placeholder = 'Continue...'; st.input = typed(t, 15.4, 15.9, Q3); }
  if (t >= 16.0) st.log.push({ k: 'user', s: Q3, t: 16.0 });
  if (t >= 16.1 && t < 16.5) { st.busy = true; st.typing = { step: t < 16.3 ? '' : 'Run · format C:' }; }
  if (t >= 16.5) { st.log.push({ k: 'note', s: 'Skipped Run · format C: (formats a disk)', t: 16.5 }); st.log.push({ k: 'error', s: "⚠ I won't do that. It would wipe your whole drive.", t: 16.6 }); }
  if (st.log.length) st.placeholder = 'Continue...';
  if (st.busy) st.placeholder = 'Working... type stop to cancel';
  return st;
}
function drawCard(ctx, st, t, cx, bottom) {
  const u = U, cw = 400 * u, padX = 16 * u, padY = 14 * u, inner = cw - padX * 2;
  // measure content
  const rows = []; let contentH = 0;
  if (st.view === 'chat') {
    ctx.font = F.ui(13 * u);
    const lh = 13 * u * 1.45;
    for (const e of st.log) {
      if (e.k === 'user') { ctx.font = F.ui(13 * u); const lines = wrap(ctx, e.s, inner - 32 * u - 20 * u); rows.push({ ...e, lines, h: lines.length * lh + 12 * u }); }
      else { const fs = e.k === 'note' ? 12 * u : 13 * u; ctx.font = F.ui(fs); const lines = wrap(ctx, e.s, inner - 8 * u); rows.push({ ...e, lines, fs, h: lines.length * fs * 1.45 }); }
    }
    if (st.typing) rows.push({ k: 'typing', h: 20 * u });
    let logH = rows.reduce((a, r) => a + r.h, 0) + Math.max(0, rows.length - 1) * 6 * u;
    const logShown = Math.min(logH, 220 * u);
    contentH = (rows.length ? logShown + 10 * u : 0) + 40 * u;
    st._logH = logH; st._logShown = logShown;
  } else {
    contentH = 18 * u + 8 * u + 20 * u + 6 * u + 30 * u + 5 * u + 16 * u + 12 * u + 32 * u;
  }
  const ch = contentH + padY * 2;
  const x = clamp(cx - cw / 2, 8, W - cw - 8), y = bottom - ch;
  const oa = clamp((t - st.openT) / 0.42), oe = outBack(oa, 2.0);
  const sc = lerp(0.9, 1, oe), dy = lerp(10 * u, 0, oe);
  ctx.save(); ctx.globalAlpha = clamp(oa * 2.4);
  ctx.translate(x + cw / 2, y + ch + dy); ctx.scale(sc, sc); ctx.translate(-cw / 2, -ch);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#141518'; rr(ctx, 0, 0, cw, ch, 20 * u); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.save(); rr(ctx, 0, 0, cw, ch, 20 * u); ctx.clip();
  const wsh = washAt(t);
  ctx.save(); ctx.translate(cw / 2, ch * 1.35); ctx.scale(1, 260 / 300);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 300 * u);
  g.addColorStop(0, `rgba(${wsh[0]},${wsh[1]},${wsh[2]},${wsh[3]})`); g.addColorStop(0.7, `rgba(${wsh[0]},${wsh[1]},${wsh[2]},0)`);
  ctx.fillStyle = g; ctx.fillRect(-cw, -ch * 2, cw * 2, ch * 4); ctx.restore();
  // view (crossfade in)
  const va = clamp((t - st.viewT) / 0.3), vs = lerp(0.97, 1, outBack(va, 2));
  ctx.save(); ctx.globalAlpha *= clamp(va * 1.5); ctx.translate(cw / 2, ch / 2); ctx.scale(vs, vs); ctx.translate(-cw / 2, -ch / 2);
  ctx.translate(padX, padY);
  if (st.view === 'chat') drawChat(ctx, st, rows, t, u, inner);
  else drawApproval(ctx, st, t, u, inner);
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5; rr(ctx, 0.5, 0.5, cw - 1, ch - 1, 20 * u); ctx.stroke();
  ctx.restore();
  return { x, y, w: cw, h: ch };
}
function drawChat(ctx, st, rows, t, u, inner) {
  ctx.textBaseline = 'alphabetic';
  if (rows.length) {
    ctx.save(); ctx.beginPath(); ctx.rect(-4, 0, inner + 8, st._logShown); ctx.clip();
    let y = st._logShown - st._logH;
    for (const r of rows) {
      const a = r.t !== undefined ? clamp((t - r.t) / 0.22) : 1;
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - outCubic(a)) * 8 * u);
      if (r.k === 'user') {
        ctx.font = F.ui(13 * u);
        const tw = Math.max(...r.lines.map(l => ctx.measureText(l).width));
        const bw = tw + 20 * u, bx = inner - bw;
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; rr(ctx, bx, y, bw, r.h, 12 * u); ctx.fill();
        ctx.fillStyle = '#f5f6f8';
        r.lines.forEach((l, i) => ctx.fillText(l, bx + 10 * u, y + 6 * u + 13 * u * (i + 1) * 1.45 - 4 * u));
      } else if (r.k === 'typing') {
        for (let i = 0; i < 3; i++) {
          const ph = ((t - i * 0.14) % 0.9 + 0.9) % 0.9 / 0.9; const s = lerp(0.6, 1.2, 0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
          ctx.fillStyle = '#6b7079'; ctx.beginPath(); ctx.arc(2.5 * u + i * 8 * u, y + 10 * u, 2.5 * u * s, 0, 7); ctx.fill();
        }
        if (st.typing.step) {
          ctx.font = F.ui(11.5 * u); const sx = 30 * u; const tw = ctx.measureText(st.typing.step).width;
          const ph = (t % 2.2) / 2.2; const hx = sx - tw * 0.4 + ph * tw * 1.8;
          const gr = ctx.createLinearGradient(hx - tw * 0.5, 0, hx + tw * 0.45, 0);
          gr.addColorStop(0, '#7c818a'); gr.addColorStop(0.53, '#f2f3f5'); gr.addColorStop(1, '#7c818a');
          ctx.fillStyle = gr; ctx.fillText(st.typing.step, sx, y + 14.5 * u);
        }
      } else {
        const fs = r.fs; ctx.font = F.ui(fs);
        ctx.fillStyle = r.k === 'error' ? '#ff8d97' : r.k === 'note' ? '#6b7079' : '#b0b5be';
        r.lines.forEach((l, i) => ctx.fillText(l, 0, y + fs * 1.45 * (i + 1) - 4 * u));
      }
      ctx.restore();
      y += r.h + 6 * u;
    }
    ctx.restore();
    ctx.translate(0, st._logShown + 10 * u);
  }
  // chat bar
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(ctx, 0, 0, inner, 40 * u, 12 * u); ctx.fill();
  icon(ctx, 'plus', 8 * u + 12 * u, 20 * u, 13 * u, '#9398a1', 2.2);
  const ix = 8 * u + 24 * u + 8 * u;
  ctx.font = F.ui(13 * u); ctx.textBaseline = 'middle';
  if (st.input) { ctx.fillStyle = '#f5f6f8'; ctx.fillText(st.input, ix, 20 * u + 1); }
  else { ctx.fillStyle = '#6b7079'; ctx.fillText(st.placeholder, ix, 20 * u + 1); }
  if (st.caret && Math.floor(t * 1.9) % 2 === 0 || st.input) {
    const cx = ix + (st.input ? ctx.measureText(st.input).width + 2 : 0);
    ctx.fillStyle = '#f5f6f8'; ctx.fillRect(cx, 20 * u - 8 * u, 1.6, 16 * u);
  }
  icon(ctx, 'gear', inner - 6 * u - 28 * u - 8 * u - 12 * u, 20 * u, 13 * u, '#9398a1', 1.8);
  ctx.fillStyle = '#f5f6f8'; ctx.beginPath(); ctx.arc(inner - 6 * u - 14 * u, 20 * u, 14 * u, 0, 7); ctx.fill();
  icon(ctx, st.busy && !st.input ? 'stop' : 'up', inner - 6 * u - 14 * u, 20 * u, 13 * u, '#0b0c0e', st.busy && !st.input ? 2.2 : 2.6);
  ctx.textBaseline = 'alphabetic';
}
function drawApproval(ctx, st, t, u, inner) {
  const ap = st.ap; ctx.textBaseline = 'middle';
  let y = 9 * u;
  ctx.fillStyle = '#ffc83d'; ctx.beginPath(); ctx.arc(4 * u, y, 4 * u, 0, 7); ctx.fill();
  ctx.font = F.ui(12 * u, 600); ctx.fillStyle = '#f5f6f8'; ctx.fillText(ap.who, 14 * u, y);
  let wx = 14 * u + ctx.measureText(ap.who).width + 6 * u;
  ctx.font = F.ui(12 * u); ctx.fillStyle = '#8e939c'; ctx.fillText('needs permission', wx, y);
  ctx.font = F.ui(10 * u, 600); ctx.letterSpacing = `${0.4 * u}px`;
  const pill = ap.risk.toUpperCase(); const pw = ctx.measureText(pill).width + 16 * u;
  ctx.fillStyle = 'rgba(245,165,36,0.16)'; rr(ctx, inner - pw, y - 9 * u, pw, 18 * u, 9 * u); ctx.fill();
  ctx.fillStyle = '#f5a524'; ctx.fillText(pill, inner - pw + 8 * u, y + 0.5); ctx.letterSpacing = '0px';
  y = 18 * u + 8 * u + 10 * u;
  ctx.font = F.ui(14 * u, 600); ctx.fillStyle = '#f5f6f8'; ctx.fillText(ap.title, 0, y);
  y += 10 * u + 6 * u;
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(ctx, 0, y, inner, 30 * u, 10 * u); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = F.mono(11.2 * u); ctx.fillStyle = '#e8e9ec'; ctx.fillText(ap.code, 10 * u, y + 15 * u);
  y += 30 * u + 5 * u + 8 * u;
  ctx.font = F.ui(11 * u); ctx.fillStyle = '#6b7079'; ctx.fillText(ap.cwd, 0, y);
  y += 8 * u + 12 * u;
  // buttons right-aligned
  const btn = (label, k, primary, rx, press) => {
    ctx.font = F.ui(12.5 * u, 500); const lw = ctx.measureText(label).width; ctx.font = F.ui(10.5 * u); const kw = ctx.measureText(k).width + 8 * u;
    const bw = 13 * u + lw + 7 * u + kw + 13 * u, bh = 31 * u, bx = rx - bw;
    ctx.save(); ctx.translate(bx + bw / 2, y + bh / 2); const s = 1 - 0.06 * press; ctx.scale(s, s); ctx.translate(-bw / 2, -bh / 2);
    ctx.fillStyle = primary ? (press > 0 ? '#ffffff' : '#f5f6f8') : 'rgba(255,255,255,0.09)'; rr(ctx, 0, 0, bw, bh, bh / 2); ctx.fill();
    if (primary && press > 0) { ctx.strokeStyle = `rgba(255,255,255,${0.5 * press})`; ctx.lineWidth = 6 * press; rr(ctx, -3, -3, bw + 6, bh + 6, bh / 2 + 3); ctx.stroke(); }
    ctx.font = F.ui(12.5 * u, 500); ctx.fillStyle = primary ? '#0b0c0e' : '#f5f6f8'; ctx.fillText(label, 13 * u, bh / 2 + 1);
    const kx = 13 * u + lw + 7 * u;
    ctx.globalAlpha *= 0.55; ctx.strokeStyle = primary ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; rr(ctx, kx, bh / 2 - 8 * u, kw, 16 * u, 4 * u); ctx.stroke();
    ctx.font = F.ui(10.5 * u); ctx.fillStyle = primary ? '#0b0c0e' : '#f5f6f8'; ctx.fillText(k, kx + 4 * u, bh / 2 + 1);
    ctx.restore();
    return bx;
  };
  const allowX = btn('Allow', 'Y', true, inner, st.press);
  btn('Deny', 'N', false, allowX - 8 * u, 0);
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- desktop: Boltie behaviour timeline
const MOODS_T = [[4, 'idle'], [7.0, 'listening'], [7.6, 'idle'], [9.5, 'listening'], [9.75, 'thinking'], [10.0, 'working'], [11.5, 'happy'], [12.2, 'idle'], [12.75, 'thinking'], [13.0, 'asking'], [14.1, 'working'], [15.0, 'happy'], [15.6, 'idle'], [16.0, 'listening'], [16.25, 'thinking'], [16.5, 'sad'], [17.0, 'sad']];
function moodAt(t, table) {
  let i = 0; for (let k = 0; k < table.length; k++) if (t >= table[k][0]) i = k;
  const [ts, m] = table[i]; const prev = i > 0 ? table[i - 1][1] : m;
  const color = mixHex(LOOKS[prev].color, LOOKS[m].color, clamp((t - ts) / 0.25));
  return { mood: m, since: t - ts, color };
}
function blinkOpen(t, times) {
  let o = 1;
  for (const b of times) { const d = t - b; if (d >= 0 && d < 0.2) o = Math.min(o, d < 0.07 ? lerp(1, 0.06, d / 0.07) : lerp(0.06, 1, (d - 0.07) / 0.13)); }
  return o;
}
function reaction(m, since, t) {
  const r = { hop: 0, spin: 0, shake: 0, pitch: 0, eyes: LOOKS[m].eyes, wave: 0, pulse: m === 'working' || m === 'thinking' || m === 'asking', bobFast: m === 'working' };
  if (m === 'happy' && since < 0.95) { const p = since / 0.95; r.hop = Math.sin(p * Math.PI) * 30; r.spin = back(Math.min(p * 1.1, 1)) * Math.PI * 2; }
  else if (m === 'listening') { if (since < 0.35) r.pitch = Math.sin((since / 0.35) * Math.PI) * 0.25; if (since > 0.9) r.eyes = 'pill'; }
  else if (m === 'sad' && since < 0.6) r.shake = Math.sin(since * 40) * (1 - since / 0.6) * 7;
  else if (m === 'asking') { r.hop = Math.abs(Math.sin(t * 5.2)) * 6; r.wave = 1; }
  return r;
}
function deskBot(t) {
  const { mood, since, color } = moodAt(t, MOODS_T);
  const rc = reaction(mood, since, t);
  let x = HOME_X, alt = 0, dir = 0, bank = 0, lookX = 0, lookY = 0.05, thrust = 0.55, wave = rc.wave;
  if (t < 5.0) {
    const p = inv(4.0, 5.0, t); const e = inOutCubic(p);
    x = lerp(240, HOME_X, e); alt = Math.sin(p * Math.PI) * 70;
    const v = (inOutCubic(clamp(p + 0.01)) - inOutCubic(clamp(p - 0.01))) / 0.02;
    dir = v > 0.05 ? 1 : 0; bank = -0.22 * clamp(v / 1.5); lookX = 0.9 * clamp(v / 0.6); thrust = 0.55 + 0.45 * clamp(v);
  }
  if (t >= 5.0 && t < 5.9) wave = Math.max(wave, Math.sin(inv(5.0, 5.9, t) * Math.PI) > 0 ? clamp(inv(5.0, 5.12, t) * (1 - inv(5.75, 5.9, t))) : 0);
  if (t >= 5.9 && t < 7.0) { lookX = -0.6; lookY = 0.15; }
  if (t >= 7.5) lookY = 0.55;
  if (mood === 'thinking') { lookX = 0.55; lookY = 0.55; }
  if (mood === 'working') { lookX = -0.35; lookY = 0.35; }
  let hop = rc.hop;
  for (const kp of [6.0, 6.5, 7.0]) { const d = t - kp; if (d >= 0 && d < 0.3) hop += Math.sin(d / 0.3 * Math.PI) * 9; }
  const open = blinkOpen(t, [5.55, 5.78, 8.7, 12.35, 15.5, 17.4]);
  return {
    x, y: botBaseY(alt), alt, s: U, color, eyes: rc.eyes, open, lookX, lookY, spin: rc.spin, bank, pitch: rc.pitch, hop, shake: rc.shake, wave, t, bobFast: rc.bobFast, pulse: rc.pulse, thrust: mood === 'working' ? 0.8 : thrust, dir,
  };
}
function drawBotShadow(ctx, x, alt, hop, s) {
  const height = 28 + alt + hop; const fade = height > 200 ? 0 : Math.max(0.25, 1 - height / 140);
  ctx.save(); ctx.translate(x, FLOOR_Y - 1 * s); ctx.scale(1, 0.12);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.8 * fade * s * 1.2); g.addColorStop(0, `rgba(0,0,0,${0.35 * fade})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.8 * fade * s * 1.2, 0, 7); ctx.fill(); ctx.restore();
}
function drawScreen(t) {
  const ctx = scr;
  ctx.drawImage(wallC, 0, 0);
  drawDesktopIcons(ctx);
  drawEditor(ctx, t);
  drawTerminal(ctx, t);
  // cursor heading to Allow
  const b = deskBot(t);
  // glow under bot (the app's #glow div)
  const gl = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 100 * U * 0.62);
  gl.addColorStop(0, rgba(b.color, 0.25)); gl.addColorStop(1, rgba(b.color, 0));
  ctx.fillStyle = gl; ctx.fillRect(b.x - 200, b.y - 200, 400, 400);
  drawTaskbar(ctx, t);
  drawBotShadow(ctx, b.x, b.alt, b.hop, U);
  renderBots([b], ctx);
  const st = cardState(t);
  let card = null;
  if (st) card = drawCard(ctx, st, t, HOME_X, botBaseY(0) - 78 * U);
  if (t >= 13.3 && t < 14.6 && card) {
    const tx = card.x + card.w - 16 * U - 40 * U, ty = card.y + card.h - 14 * U - 14 * U;
    const p = outCubic(inv(13.3, 13.9, t));
    const cx = lerp(tx + 260, tx, p), cy = lerp(ty + 240, ty, p);
    cursorArrow(ctx, cx, cy, 1.9, t >= 13.92 && t < 14.1 ? 1 : 0);
  }
}

// ---------------------------------------------------------------- plate shots (camera on the desktop)
// focus: screen point (fx,fy) placed at out point (ox,oy) with scale s, rotations deg
const SHOTS = [
  { t0: 4.0, t1: 6.0, a: { fx: 960, fy: 540, ox: 1260, oy: 560, s: 0.6, rx: 4, ry: 16, rz: 0 }, b: { fx: 960, fy: 540, ox: 1250, oy: 550, s: 0.64, rx: 3, ry: 11, rz: 0 }, enter: { fx: 960, fy: 540, ox: 1300, oy: 1500, s: 0.5, rx: 45, ry: 30, rz: -6 } },
  { t0: 6.0, t1: 8.0, a: { fx: 1300, fy: 760, ox: 1260, oy: 600, s: 1.32, rx: 0, ry: -5, rz: 0 }, b: { fx: 1300, fy: 760, ox: 1250, oy: 590, s: 1.42, rx: 0, ry: -3, rz: 0 } },
  { t0: 8.0, t1: 10.0, a: { fx: 1300, fy: 640, ox: 1290, oy: 560, s: 1.5, rx: 2, ry: 7, rz: 0 }, b: { fx: 1300, fy: 640, ox: 1280, oy: 550, s: 1.62, rx: 1, ry: 4, rz: 0 } },
  { t0: 10.0, t1: 12.0, a: { fx: 960, fy: 540, ox: 1260, oy: 560, s: 0.62, rx: 4, ry: 14, rz: 0 }, b: { fx: 960, fy: 540, ox: 1250, oy: 555, s: 0.66, rx: 3, ry: 10, rz: 0 } },
  { t0: 12.0, t1: 14.0, a: { fx: 1300, fy: 610, ox: 1280, oy: 560, s: 1.5, rx: 4, ry: -6, rz: 0 }, b: { fx: 1300, fy: 610, ox: 1270, oy: 555, s: 1.66, rx: 2, ry: -3, rz: 0 } },
  { t0: 14.0, t1: 16.0, a: { fx: 1300, fy: 430, ox: 1370, oy: 540, s: 0.8, rx: 3, ry: 12, rz: 0 }, b: { fx: 1300, fy: 430, ox: 1360, oy: 535, s: 0.86, rx: 2, ry: 8, rz: 0 } },
  { t0: 16.0, t1: 18.0, a: { fx: 1300, fy: 600, ox: 1290, oy: 540, s: 1.38, rx: 0, ry: -4, rz: 0 }, b: { fx: 1300, fy: 600, ox: 1280, oy: 545, s: 1.6, rx: 0, ry: -1, rz: 0 } },
];
const KEYS = ['fx', 'fy', 'ox', 'oy', 's', 'rx', 'ry', 'rz'];
const mixPose = (A, B, k) => Object.fromEntries(KEYS.map(n => [n, lerp(A[n], B[n], k)]));
function plateAt(t) {
  const i = SHOTS.findIndex(s => t >= s.t0 && t < s.t1);
  if (i < 0) return null;
  const S = SHOTS[i];
  const drift = mixPose(S.a, S.b, inOutCubic(inv(S.t0, S.t1, t)));
  const from = i === 0 ? S.enter : SHOTS[i - 1].b;
  const dur = i === 0 ? 0.75 : 0.34;
  const k = i === 0 ? spring(t - S.t0, 1.3, 0.55) : outExpo(inv(S.t0, S.t0 + dur, t));
  return mixPose(from, drift, k);
}
function project(pose) {
  const f = 2200, rx = pose.rx * Math.PI / 180, ry = pose.ry * Math.PI / 180, rz = pose.rz * Math.PI / 180;
  const pt = (sx, sy) => {
    let x = (sx - pose.fx) * pose.s, y = (sy - pose.fy) * pose.s, z = 0;
    let c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
    c = Math.cos(rx); s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(ry); s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
    const k = f / (f + z);
    return [pose.ox + x * k, pose.oy + y * k];
  };
  return [pt(0, 0), pt(W, 0), pt(W, H), pt(0, H)];
}
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// ---------------------------------------------------------------- overlay type
function riseText(ctx, text, x, y, size, t, t0, o = {}) {
  const { font = F.disp, weight = 800, color = '#f5f6f8', stagger = 0.016, dur = 0.5, align = 'left', track = -0.025, out = 1e9 } = o;
  ctx.font = font(size, weight); ctx.letterSpacing = `${track * size}px`;
  const total = ctx.measureText(text).width;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const oa = 1 - outCubic(inv(out, out + 0.18, t));
  ctx.save(); ctx.beginPath(); ctx.rect(0, y - size * 1.05, W, size * 1.35); ctx.clip();
  let acc = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const px = cx + ctx.measureText(acc).width; acc += ch;
    const a = clamp((t - t0 - i * stagger) / dur); if (a <= 0) continue;
    const e = outExpo(a);
    ctx.globalAlpha = clamp(a * 3) * oa;
    ctx.fillStyle = color;
    ctx.fillText(ch, px, y + (1 - e) * size * 1.05 - (1 - oa) * size * 0.3);
  }
  ctx.restore(); ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  return total;
}
function label(ctx, text, x, y, t, t0, color = '#ffd45e', align = 'left') {
  const a = clamp((t - t0) / 0.3); if (a <= 0) return;
  ctx.font = F.mono(19, 700); ctx.letterSpacing = '4px'; ctx.textAlign = align;
  ctx.globalAlpha = a; ctx.fillStyle = color;
  const n = Math.ceil(text.length * clamp((t - t0) / 0.15));
  const lineW = 44 * outExpo(a);
  if (align === 'left') { ctx.fillRect(x, y - 7, lineW, 3); ctx.fillText(text.slice(0, n), x + 60, y); }
  else { ctx.fillRect(x - lineW, y - 7, lineW, 3); ctx.fillText(text.slice(0, n), x - 60, y); }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
}
function scrim(ctx, side, a = 0.88) {
  const g = side === 'left' ? ctx.createLinearGradient(0, 0, 1150, 0) : ctx.createLinearGradient(W, 0, W - 1150, 0);
  g.addColorStop(0, `rgba(6,7,10,${a})`); g.addColorStop(0.55, `rgba(6,7,10,${a * 0.55})`); g.addColorStop(1, 'rgba(6,7,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function keycap(ctx, text, cx, cy, w, h, t, tIn, tPress, out) {
  const a = clamp((t - tIn) / 0.28); if (a <= 0) return;
  const pr = t >= tPress ? Math.exp(-(t - tPress) * 9) : 0;
  const o = 1 - outCubic(inv(out, out + 0.2, t));
  const s = lerp(1.5, 1, outExpo(a)) * (1 - pr * 0.06);
  ctx.save(); ctx.globalAlpha = clamp(a * 3) * o; ctx.translate(cx, cy + pr * 10 - (1 - o) * 60); ctx.scale(s, s);
  ctx.shadowColor = rgba('#ffd45e', 0.55 * pr); ctx.shadowBlur = 60 * pr;
  ctx.fillStyle = '#0b0c0f'; rr(ctx, -w / 2, -h / 2 + 12, w, h, 26); ctx.fill(); ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, pr > 0.3 ? '#3a3420' : '#2b2e35'); g.addColorStop(1, '#17191e');
  ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2 + pr * 8, w, h - 4, 24); ctx.fill();
  ctx.strokeStyle = pr > 0.05 ? rgba('#ffd45e', 0.4 + 0.6 * pr) : 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = pr > 0.05 ? mixHex('#f5f6f8', '#ffd45e', pr) : '#f5f6f8'; ctx.font = F.ui(54, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, pr * 8 - 2); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- stage background
function drawStageBg(ctx, t, tint, glowA = 0.25, gx = 960, gy = 540, grid = 0.07) {
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 900);
  g.addColorStop(0, rgba(tint, glowA)); g.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (grid > 0) {
    const off = (t * 14) % 48;
    ctx.fillStyle = `rgba(255,255,255,${grid})`;
    for (let y = -48 + off; y < H + 48; y += 48) for (let x = 24; x < W; x += 48) {
      const d = Math.hypot(x - gx, y - gy); const a = clamp(1 - d / 1100);
      if (a > 0.02) { ctx.globalAlpha = a; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- compositor
const out = document.getElementById('out');
const gl = out.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uStage, uScreen, uOver;
uniform mat3 uH; uniform float uPlate, uPlateA, uSat, uGlint, uScale;
uniform vec3 uCam; uniform vec2 uBlurDir; uniform float uZoomBlur, uCA, uVig, uGrain, uFlash, uTime, uFade;
uniform vec3 uFlashCol;
out vec4 o;
const vec2 RES = vec2(${W}.,${H}.);
float rsdf(vec2 sp){ vec2 hs = RES*.5; float r = 28.; vec2 d = abs(sp-hs)-(hs-r); return length(max(d,0.))+min(max(d.x,d.y),0.)-r; }
vec2 toScreen(vec2 p){ vec3 q = uH*vec3(p,1.); return q.xy/q.z; }
vec3 layers(vec2 p){
  vec3 col = texture(uStage, p/RES).rgb;
  if(uPlate>0.5){
    vec2 sh = toScreen(p - vec2(0., 46.*uScale));
    float sd = rsdf(sh);
    float shadow = (1.-smoothstep(-40., 160., sd))*0.65*uPlateA;
    col *= 1.-shadow;
    vec2 sp = toScreen(p);
    float s = rsdf(sp);
    float aa = 1.6/max(uScale,0.2);
    float m = (1.-smoothstep(-aa, aa, s))*uPlateA;
    vec3 sc = texture(uScreen, clamp(sp/RES, 0., 1.)).rgb;
    float l = dot(sc, vec3(.299,.587,.114)); sc = mix(vec3(l), sc, uSat);
    float gx = (sp.x + sp.y*0.6)/RES.x - uGlint;
    sc += vec3(1.)*0.07*exp(-gx*gx*60.);
    float edge = (1.-smoothstep(0., 2.5/max(uScale,.2), abs(s+1.)))*0.25;
    col = mix(col, sc + edge, m);
  }
  vec4 ov = texture(uOver, p/RES);
  return mix(col, ov.rgb, ov.a);
}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 p = vec2(gl_FragCoord.x, RES.y - gl_FragCoord.y);
  p = (p - RES*.5)/uCam.z + RES*.5 - uCam.xy;
  vec2 cdir = (p - RES*.5)/RES.x;
  vec3 c = vec3(0.);
  bool blur = length(uBlurDir) > 0.5 || uZoomBlur > 0.002;
  int N = blur ? 14 : 1;
  for(int i=0;i<14;i++){
    if(i>=N) break;
    float f = N>1 ? float(i)/float(N-1) - .5 : 0.;
    vec2 q = p + uBlurDir*f + (p-RES*.5)*uZoomBlur*(f+.5)*-1.;
    if(uCA > 0.3){
      vec2 ca = cdir*uCA;
      c += vec3(layers(q+ca).r, layers(q).g, layers(q-ca).b);
    } else c += layers(q);
  }
  c /= float(N);
  float v = length((gl_FragCoord.xy/RES - .5)*vec2(1., .8));
  c *= 1. - uVig*smoothstep(.35, .95, v);
  c += (h12(gl_FragCoord.xy + fract(uTime*7.13)*917.) - .5)*uGrain;
  c = mix(c, uFlashCol, uFlash);
  c *= uFade;
  o = vec4(c, 1.);
}`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const al = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
const texs = [0, 1, 2].map(i => { const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return tx; });
const UL = n => gl.getUniformLocation(prog, n);
gl.uniform1i(UL('uStage'), 0); gl.uniform1i(UL('uScreen'), 1); gl.uniform1i(UL('uOver'), 2);
function upload(i, c) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texs[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); }

// ---------------------------------------------------------------- scenes
const decay = (t, t0, k = 8) => (t >= t0 ? Math.exp(-(t - t0) * k) : 0);
function kickEnv(t) {
  const groove = (t >= 2 && t < 16) || (t >= 20 && t < 22);
  if (!groove) return 0;
  const b = Math.floor(t / BEAT) * BEAT; return Math.exp(-(t - b) * 12);
}
const MOOD_LIST = ['idle', 'listening', 'thinking', 'working', 'asking', 'happy', 'sad', 'sleeping'];

function sceneIntro(t, post) {
  // 0-2: waking up in the dark
  const light = t < 1.0 ? 0.05 : lerp(0.05, 0.4, outCubic(inv(1.0, 1.95, t)));
  const bulbOn = t < 0.5 ? 0 : (t < 0.62 ? (hash(Math.floor(t * 60)) > 0.4 ? 1 : 0.2) : 1);
  drawStageBg(stage, t, '#ffd45e', 0.04 + 0.12 * bulbOn + 0.1 * inv(1, 2, t), 960, 300, 0.035 * inv(1, 2, t));
  setLight(light);
  const s = lerp(5.0, 5.6, inOutCubic(t / 2));
  const awake = t >= 1.0;
  let open = awake ? outCubic(inv(1.0, 1.15, t)) : 1;
  open = Math.min(open, blinkOpen(t, [1.5]));
  let lookX = 0; if (t > 1.2) lookX = lerp(0, -0.45, outCubic(inv(1.2, 1.35, t))); if (t > 1.62) lookX = lerp(-0.45, 0.35, outCubic(inv(1.62, 1.77, t))); if (t > 1.85) lookX = lerp(0.35, 0, outCubic(inv(1.85, 2.0, t)));
  const p = { x: 960, y: 560, s, color: '#ffd45e', eyes: awake ? 'pill' : 'closed', open, eyeAlpha: awake ? 1 : 0.35, bulb: bulbOn, lookX, lookY: 0, t, bob: 0.4, thrust: awake ? 0.55 * inv(1.0, 1.4, t) : 0 };
  renderBots([p], stage);
  if (t >= 1.25) riseText(over, 'say hi to', 960, 980, 58, t, 1.25, { weight: 500, align: 'center', color: '#9398a1', track: -0.01, stagger: 0.02, out: 1.86 });
  post.zoomBlur = 0.05 * inExpo(inv(1.6, 2.0, t));
  post.vig = 0.7;
}
function sceneName(t, post) {
  // 2-4: BOLTIE
  drawStageBg(stage, t, '#ffd45e', 0.22 + 0.25 * decay(t, 2, 3), 960, 380, 0.07);
  setLight(lerp(0.4, 1, outExpo(inv(2.0, 2.15, t))));
  // wordmark behind
  const word = 'Boltie';
  stage.font = F.disp(360, 900); stage.letterSpacing = '-13px'; stage.textBaseline = 'alphabetic';
  const total = stage.measureText(word).width; let acc = '';
  const exitK = inExpo(inv(3.72, 4.0, t));
  for (let i = 0; i < word.length; i++) {
    const px = 960 - total / 2 + stage.measureText(acc).width; acc += word[i];
    const a = clamp((t - 2.0 - i * 0.035) / 0.45); if (a <= 0) continue;
    const e = outExpo(a);
    const cw = stage.measureText(word[i]).width;
    stage.save(); stage.translate(px + cw / 2, 830); const sc = lerp(1.9, 1, e) * (1 + exitK * 0.4); stage.scale(sc, sc);
    stage.globalAlpha = clamp(a * 2) * (1 - exitK);
    const g = stage.createLinearGradient(0, -260, 0, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c7cbd3');
    stage.fillStyle = g; stage.fillText(word[i], -cw / 2, 0); stage.restore();
  }
  stage.letterSpacing = '0px'; stage.globalAlpha = 1;
  // bot: shrink from intro pose, happy spin
  const k = spring(t - 2.0, 1.6, 0.5);
  const since = t - 2.0; const pp = clamp(since / 0.95);
  const spin = since < 0.95 ? back(Math.min(pp * 1.1, 1)) * Math.PI * 2 : 0;
  const hop = since < 0.95 ? Math.sin(pp * Math.PI) * 30 : 0;
  let lookX = 0, lookY = 0; if (t > 3.35) { lookY = -0.45 * outCubic(inv(3.35, 3.5, t)) * (1 - outCubic(inv(3.68, 3.82, t))); }
  const ex = inExpo(inv(3.72, 4.0, t));
  const p = {
    x: 960, y: lerp(560, 330, k) + ex * 900, s: lerp(5.6, 3.0, k) * (1 + ex * 0.4), color: '#ffd45e', eyes: t < 2.95 ? 'happy' : 'pill', open: blinkOpen(t, [3.15]),
    spin, hop, t, lookX, lookY, wave: clamp(inv(2.55, 2.7, t)) * (1 - clamp(inv(3.3, 3.45, t))), thrust: 0.6 + 0.4 * decay(t, 2, 3), bulb: 1,
  };
  renderBots([p], stage);
  riseText(over, 'The little robot that does your computer chores.', 960, 960, 44, t, 3.0, { weight: 500, font: F.ui, align: 'center', color: '#b0b5be', track: -0.01, stagger: 0.008, dur: 0.4, out: 3.72 });
  post.flash = 0.75 * decay(t, 2.0, 7); post.ca = 8 * decay(t, 2.0, 5); post.shake = 14 * decay(t, 2.0, 7);
  post.zoomBlur = 0.05 * decay(t, 2.0, 14) + 0.06 * ex;
  post.vig = 0.6;
}
const TITLES = [
  { t0: 4.0, t1: 6.0, side: 'left', label: '01  MEET BOLTIE', lines: ['He lives on', 'your desktop.'] },
  { t0: 6.0, t1: 8.0, side: 'left', label: '02  SUMMON', lines: [] },
  { t0: 8.0, t1: 10.0, side: 'left', label: '03  ASK', lines: ['Just ask.'], sub: 'In plain words.' },
  { t0: 10.0, t1: 12.0, side: 'left', label: '04  DONE', lines: ['He does', 'the chores.'] },
  { t0: 12.0, t1: 14.0, side: 'left', label: '05  PERMISSION', lines: ['He asks', 'first.'] },
  { t0: 14.0, t1: 16.0, side: 'left', label: '06  CONTROL', lines: ['You stay', 'in control.'] },
  { t0: 16.0, t1: 18.0, side: 'left', label: '07  SAFETY', lines: ['Some things', "he won't do."], color: '#ff8d97' },
];
function sceneDesk(t, post) {
  drawStageBg(stage, t, deskBot(t).color, 0.16, 1200, 560, 0.06);
  drawScreen(t);
  const pose = plateAt(t);
  post.pose = pose;
  post.sat = t > 16.6 ? lerp(1, 0.55, inv(16.6, 17.6, t)) : 1;
  post.glint = lerp(-0.6, 1.6, ((t - 4) % 4) / 4);
  const T = TITLES.find(x => t >= x.t0 && t < x.t1);
  if (T) {
    if (T.lines.length) scrim(over, T.side, 0.93);
    label(over, T.label, 110, 300, t, T.t0 + 0.05, T.color || '#ffd45e');
    T.lines.forEach((l, i) => riseText(over, l, 106, 430 + i * 118, 118, t, T.t0 + 0.1 + i * 0.09, { color: '#f5f6f8', out: T.t1 - 0.14 }));
    if (T.sub) riseText(over, T.sub, 110, 430 + T.lines.length * 118 - 20, 40, t, T.t0 + 0.4, { font: F.ui, weight: 500, color: '#9398a1', track: -0.01, out: T.t1 - 0.14 });
  }
  if (t >= 6.0 && t < 7.6) {
    scrim(over, 'left', 0.7);
    const kx = 140, ky = 560, out_ = 7.3;
    keycap(over, 'Ctrl', kx + 120, ky, 230, 130, t, 5.92, 6.0, out_);
    plusSign(over, kx + 290, ky, t, 6.2, out_);
    keycap(over, 'Shift', kx + 480, ky, 270, 130, t, 6.42, 6.5, out_);
    plusSign(over, kx + 670, ky, t, 6.7, out_);
    keycap(over, 'Space', kx + 920, ky, 380, 130, t, 6.92, 7.0, out_);
    riseText(over, 'One shortcut. He’s there.', kx, ky + 190, 46, t, 7.0, { font: F.ui, weight: 500, color: '#b0b5be', track: -0.01, out: out_ });
  }
  if (t >= 13.92 && t < 14.6) keycap(over, 'Y', 1240, 230, 150, 130, t, 13.9, 14.0, 14.4);
  // flashes/CA on shot changes
  for (const s of SHOTS) { post.ca += 5 * decay(t, s.t0, 9); }
  post.ca += 7 * decay(t, 16.5, 5) + 4 * decay(t, 13.0, 8);
  post.shake += 10 * decay(t, 16.5, 6) + 6 * decay(t, 6.0, 12) + 6 * decay(t, 6.5, 12) + 8 * decay(t, 7.0, 12) + 5 * decay(t, 14.0, 10);
  post.flash += 0.12 * decay(t, 16.5, 8);
  if (t > 16.5) post.flashCol = [0.95, 0.3, 0.35];
  post.vig = 0.55;
}
function plusSign(ctx, x, y, t, t0, out_) {
  const a = clamp((t - t0) / 0.2) * (1 - inv(out_, out_ + 0.2, t)); if (a <= 0) return;
  ctx.globalAlpha = a; ctx.fillStyle = '#6b7079'; ctx.font = F.ui(64, 300); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', x, y + 4); ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function sceneWall(t, post) {
  // 18-20: every mood on the build-up
  const beat = Math.min(3, Math.floor((t - 18) / 0.5));
  const focus = ['thinking', 'working', 'asking', 'happy'][beat];
  const words = ['Thinks.', 'Works.', 'Asks.', 'Celebrates.'];
  const fc = LOOKS[focus].color;
  drawStageBg(stage, t, fc, 0.2, 960, 420, 0.06);
  setLight(1);
  const ex = inExpo(inv(19.7, 20.0, t));
  const list = [];
  const order = [3, 12, 7, 0, 9, 14, 5, 10, 1, 15, 6, 11, 2, 8, 13, 4];
  for (let i = 0; i < 16; i++) {
    const col = i % 8, row = Math.floor(i / 8);
    const m = MOOD_LIST[(i + row * 3) % 8];
    const tIn = 18.0 + order[i] * 0.06;
    const a = clamp((t - tIn) / 0.32); if (a <= 0) continue;
    let x = 155 + col * 230, y = 250 + row * 300;
    const dx = x - 960, dy = y - 420;
    x += dx * ex * 1.6; y += dy * ex * 1.6;
    const on = m === focus;
    const since = t - (18 + beat * 0.5);
    const rc = reaction(m, on ? since : 9, t);
    list.push({ x, y, s: 1.75 * outBack(a, 2.2) * (1 + ex * 1.2), color: LOOKS[m].color, eyes: rc.eyes, t: t + i, spin: rc.spin, hop: rc.hop, shake: rc.shake, wave: on ? rc.wave : 0, pulse: rc.pulse, bobFast: rc.bobFast, dim: on ? 1 : 0.42, eyeAlpha: on ? 1 : 0.5, bulb: on ? 1 : 0.5, open: m === 'sleeping' ? 1 : blinkOpen(t + i * 0.37, [18.8, 19.6]), lookX: m === 'thinking' ? 0.55 : 0, lookY: m === 'thinking' ? 0.55 : 0, z: on ? 200 : 0 });
  }
  renderBots(list, stage);
  // word
  over.fillStyle = 'rgba(6,7,10,0.55)';
  const wa = clamp((t - (18 + beat * 0.5)) / 0.18);
  const word = words[beat];
  over.save(); over.translate(960, 900); const sc = lerp(1.25, 1, outExpo(wa)) * (1 + ex * 0.5); over.scale(sc, sc);
  over.font = F.disp(170, 900); over.letterSpacing = '-5px'; over.textAlign = 'center';
  over.globalAlpha = clamp(wa * 3) * (1 - ex); over.fillStyle = fc; over.fillText(word, 0, 0);
  over.restore(); over.globalAlpha = 1; over.letterSpacing = '0px'; over.textAlign = 'left';
  post.ca = 2 + 5 * decay(t, 18 + beat * 0.5, 9);
  post.shake = 4 * decay(t, 18 + beat * 0.5, 10);
  post.zoomBlur = 0.12 * ex;
  post.vig = 0.6;
}
function sceneDrop(t, post) {
  // 20-22: four features, one per beat
  const i = Math.min(3, Math.floor((t - 20) / 0.5)); const ts = 20 + i * 0.5; const lt = t - ts;
  const F4 = [
    { lab: 'BRAINS', l: ['Runs on your', 'Claude Code login.'], mood: 'thinking' },
    { lab: 'OR', l: ['Or bring your', 'own API key.'], mood: 'working' },
    { lab: 'MOVE', l: ['Drag him', 'anywhere.'], mood: 'asking' },
    { lab: 'MULTI-MONITOR', l: ['Roams across', 'your screens.'], mood: 'happy' },
  ][i];
  const col = LOOKS[F4.mood].color;
  drawStageBg(stage, t, col, 0.22, 1380, 520, 0.07);
  setLight(1);
  // text left
  F4.l.forEach((s, k) => {
    over.save(); const a = clamp(lt / 0.16); const sc = lerp(1.08, 1, outExpo(a));
    over.translate(110, 470 + k * 120); over.scale(sc, sc);
    over.font = F.disp(112, 800); over.letterSpacing = '-3px'; over.globalAlpha = clamp(a * 4);
    over.fillStyle = k === 1 ? '#f5f6f8' : '#9398a1'; over.fillText(s, 0, 0); over.restore();
  });
  over.globalAlpha = 1; over.letterSpacing = '0px';
  label(over, F4.lab, 114, 330, t, ts, col);
  // visual right
  const pop = outBack(clamp(lt / 0.25), 2);
  let p = { x: 1400, y: 470, s: 3.1 * pop, color: col, eyes: LOOKS[F4.mood].eyes, t, thrust: 0.7, pulse: true, open: 1 };
  if (i === 0) { p.lookX = 0.55; p.lookY = 0.55; chip(over, 1400, 790, ['>_', 'claude', '● signed in'], ['#9398a1', '#f5f6f8', '#34d399'], lt); }
  if (i === 1) { p.bobFast = 1; p.lookX = -0.3; p.lookY = 0.3; chip(over, 1400, 790, ['sk-ant-••••••••', '', 'OS keychain'], ['#f5f6f8', '#9398a1', '#3b9eff'], lt, true); }
  if (i === 2) {
    const sw = Math.sin(lt * 9) * (1 - lt * 1.2);
    p.eyes = 'wide'; p.x = 1400 + sw * 120; p.y = 430 + Math.abs(sw) * 20; p.bank = -sw * 0.45; p.color = '#ffd45e'; p.thrust = 0.3;
  }
  if (i === 3) {
    p.s = 1.6 * pop; const fp = inOutCubic(clamp(lt / 0.42));
    p.x = lerp(1060, 1590, fp); p.y = 470 - Math.sin(fp * Math.PI) * 120; p.dir = 1; p.lookX = 0.9; p.bank = -0.22 * Math.sin(fp * Math.PI); p.thrust = 1;
    // two monitors
    for (const mx of [1060, 1590]) {
      stage.strokeStyle = 'rgba(255,255,255,.28)'; stage.lineWidth = 4; rr(stage, mx - 240, 330, 480, 300, 18); stage.stroke();
      stage.fillStyle = 'rgba(255,255,255,.04)'; stage.fill();
      stage.fillStyle = 'rgba(255,255,255,.28)'; stage.fillRect(mx - 6, 630, 12, 60); rr(stage, mx - 80, 688, 160, 10, 5); stage.fill();
      stage.fillStyle = 'rgba(255,255,255,.12)'; stage.fillRect(mx - 236, 598, 472, 28);
    }
    // trail
    for (let k = 1; k < 7; k++) { const fq = inOutCubic(clamp((lt - k * 0.03) / 0.42)); stage.fillStyle = rgba(col, 0.12 / k * 3); stage.beginPath(); stage.arc(lerp(1060, 1590, fq), 470 - Math.sin(fq * Math.PI) * 120 + 70, 14 - k, 0, 7); stage.fill(); }
  }
  renderBots([p], stage);
  if (i === 2) { cursorArrow(over, p.x - 4 - Math.sin(p.bank) * 160, p.y - 168 + (p.hop||0), 2.6); }
  post.flash = 0.6 * decay(t, 20, 8) + 0.18 * decay(t, ts, 14) * (i > 0 ? 1 : 0);
  post.ca = 3 + 9 * decay(t, ts, 8);
  post.shake = 14 * decay(t, 20, 7) + 6 * decay(t, ts, 12);
  post.vig = 0.55;
}
function chip(ctx, cx, cy, parts, cols, lt, lock = false) {
  const a = clamp((lt - 0.05) / 0.2); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.font = F.mono(30, 700);
  const gap = 26; const ws = parts.map(p => (p ? ctx.measureText(p).width : 0));
  const lockW = lock ? 34 : 0;
  const tw = ws.reduce((x, y) => x + y, 0) + gap * (parts.length - 1) + lockW + 60;
  const x = cx - tw / 2, h = 76, y = cy - h / 2 + (1 - outExpo(a)) * 20;
  ctx.fillStyle = 'rgba(20,21,24,0.92)'; rr(ctx, x, y, tw, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; ctx.stroke();
  let px = x + 30; ctx.textBaseline = 'middle';
  parts.forEach((p, i) => {
    if (i === 2 && lock) { icon(ctx, 'lock', px + 12, cy, 26, cols[2], 2.4); px += lockW; }
    if (p) { ctx.fillStyle = cols[i]; ctx.fillText(p, px, y + h / 2 + 1); px += ws[i]; }
    px += gap;
  });
  ctx.restore(); ctx.textBaseline = 'alphabetic';
}
function sceneEnd(t, post) {
  drawStageBg(stage, t, '#ffd45e', 0.2 + 0.2 * decay(t, 22, 2.5), 960, 400, 0.07);
  setLight(1);
  const lt = t - 22;
  const k = spring(lt, 1.5, 0.55);
  const eyes = lt < 0.9 ? 'happy' : (t > 23.55 ? 'happy' : 'pill');
  let lookX = 0; if (t > 23.0 && t < 23.4) lookX = -0.3 * Math.sin(inv(23.0, 23.4, t) * Math.PI);
  const p = { x: 960, y: lerp(700, 360, k), s: lerp(1.2, 3.0, k), color: '#ffd45e', eyes, t, wave: clamp(inv(22.25, 22.4, t)) * (1 - clamp(inv(23.1, 23.25, t))), open: blinkOpen(t, [23.3]), lookX, thrust: 0.6, hop: Math.sin(clamp(lt / 0.6) * Math.PI) * 20 };
  renderBots([p], stage);
  riseText(over, 'Boltie', 960, 790, 190, t, 22.05, { weight: 900, align: 'center', stagger: 0.04, dur: 0.6, track: -0.035 });
  riseText(over, 'Your desktop sidekick.', 960, 868, 46, t, 22.4, { font: F.ui, weight: 500, align: 'center', color: '#b0b5be', track: -0.01, stagger: 0.012 });
  // footer: shortcut + facts
  const fa = clamp((t - 22.8) / 0.35);
  if (fa > 0) {
    over.save(); over.globalAlpha = fa; over.translate(0, (1 - outExpo(fa)) * 20);
    const items = ['Ctrl', 'Shift', 'Space']; over.font = F.ui(26, 600);
    const ws = items.map(s => over.measureText(s).width + 36); const plusW = 34;
    const totalW = ws.reduce((a, b) => a + b, 0) + plusW * 2;
    let x = 960 - totalW / 2; const y = 950;
    items.forEach((s, i) => {
      over.fillStyle = '#1b1d22'; rr(over, x, y - 26, ws[i], 52, 12); over.fill(); over.strokeStyle = 'rgba(255,255,255,.14)'; over.lineWidth = 2; over.stroke();
      over.fillStyle = '#f5f6f8'; over.textBaseline = 'middle'; over.fillText(s, x + 18, y + 1); x += ws[i];
      if (i < 2) { over.fillStyle = '#6b7079'; over.textAlign = 'center'; over.fillText('+', x + plusW / 2, y); over.textAlign = 'left'; x += plusW; }
    });
    over.textBaseline = 'alphabetic';
    over.font = F.mono(18, 700); over.letterSpacing = '5px'; over.textAlign = 'center'; over.fillStyle = '#6b7079';
    over.fillText('FREE & OPEN SOURCE  ·  WINDOWS  ·  MIT', 960, 1030);
    over.restore(); over.letterSpacing = '0px'; over.textAlign = 'left';
  }
  post.flash = 0.7 * decay(t, 22, 6); post.ca = 1 + 8 * decay(t, 22, 5); post.shake = 12 * decay(t, 22, 6);
  post.zoom = 1 + 0.035 * inOutCubic(inv(22.3, 24, t));
  post.vig = 0.65;
  post.fade = 1 - inv(23.75, 24.0, t) * 0.0; // music carries the end; image holds
}

// ---------------------------------------------------------------- frame
let lastPose = null;
function renderFrame(t) {
  frameNo = Math.round(t * FPS);
  stage.clearRect(0, 0, W, H); over.clearRect(0, 0, W, H);
  const post = { pose: null, sat: 1, glint: -1, zoom: 1, shake: 0, ca: 0, flash: 0, flashCol: [1, 1, 1], zoomBlur: 0, vig: 0.6, fade: 1 };
  if (t < 2) sceneIntro(t, post);
  else if (t < 4) sceneName(t, post);
  else if (t < 18) sceneDesk(t, post);
  else if (t < 20) sceneWall(t, post);
  else if (t < 22) sceneDrop(t, post);
  else sceneEnd(t, post);
  // camera punch on the beat
  post.zoom *= 1 + 0.012 * kickEnv(t);
  const sx = (hash(frameNo * 3.1) - 0.5) * 2 * post.shake, sy = (hash(frameNo * 7.7) - 0.5) * 2 * post.shake;
  upload(0, stageC); upload(2, overC);
  let blurDir = [0, 0];
  if (post.pose) {
    upload(1, screenC);
    const pts = project(post.pose);
    const Hm = homography(pts, [[0, 0], [W, 0], [W, H], [0, H]]);
    gl.uniformMatrix3fv(UL('uH'), false, [Hm[0], Hm[3], Hm[6], Hm[1], Hm[4], Hm[7], Hm[2], Hm[5], Hm[8]]);
    // whip blur from plate motion
    const prev = plateAt(t - 1 / FPS);
    if (prev) {
      const a = project(prev), b = pts;
      const dx = (b[0][0] + b[2][0] - a[0][0] - a[2][0]) / 2, dy = (b[0][1] + b[2][1] - a[0][1] - a[2][1]) / 2;
      const ds = (Math.hypot(b[2][0] - b[0][0], b[2][1] - b[0][1]) - Math.hypot(a[2][0] - a[0][0], a[2][1] - a[0][1]));
      if (Math.hypot(dx, dy) > 8) blurDir = [dx * 0.9, dy * 0.9];
      if (Math.abs(ds) > 12) post.zoomBlur += clamp(Math.abs(ds) / 2200, 0, 0.06);
    }
    gl.uniform1f(UL('uPlate'), 1); gl.uniform1f(UL('uScale'), post.pose.s);
  } else gl.uniform1f(UL('uPlate'), 0);
  gl.uniform1f(UL('uPlateA'), 1);
  gl.uniform1f(UL('uSat'), post.sat); gl.uniform1f(UL('uGlint'), post.glint);
  gl.uniform3f(UL('uCam'), sx, sy, post.zoom);
  gl.uniform2f(UL('uBlurDir'), blurDir[0], blurDir[1]);
  gl.uniform1f(UL('uZoomBlur'), post.zoomBlur);
  gl.uniform1f(UL('uCA'), 0.8 + post.ca);
  gl.uniform1f(UL('uVig'), post.vig); gl.uniform1f(UL('uGrain'), 0.035); gl.uniform1f(UL('uTime'), t);
  gl.uniform1f(UL('uFlash'), clamp(post.flash)); gl.uniform3f(UL('uFlashCol'), ...post.flashCol);
  gl.uniform1f(UL('uFade'), post.fade);
  gl.viewport(0, 0, W, H);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

async function init() {
  await Promise.all([
    document.fonts.load('900 100px "Inter Display"'), document.fonts.load('800 100px "Inter Display"'), document.fonts.load('500 100px "Inter Display"'),
    document.fonts.load('400 20px Inter'), document.fonts.load('500 20px Inter'), document.fonts.load('600 20px Inter'), document.fonts.load('700 20px Inter'), document.fonts.load('300 20px Inter'),
    document.fonts.load('400 20px "DejaVu Sans Mono"'), document.fonts.load('700 20px "DejaVu Sans Mono"'),
  ]);
  buildWallpaper();
  renderFrame(0.01);
}
window.renderFrame = renderFrame;
window.grab = (t, q = 0.93) => { renderFrame(t); return out.toDataURL('image/jpeg', q); };
window.ready = init().then(() => true);
