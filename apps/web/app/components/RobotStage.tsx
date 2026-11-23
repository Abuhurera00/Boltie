"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { ProductCard } from "./product/Card";
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

type Mood = "idle" | "asking" | "sad" | "working" | "happy";
type Waypoint = { p: number; x: number; y: number; scale: number; mood: Mood };

const desktopWaypoints: Waypoint[] = [
  { p: 0, x: 0.27, y: 0.03, scale: 1.42, mood: "idle" },
  { p: 0.16, x: 0.34, y: 0.2, scale: 0.78, mood: "working" },
  { p: 0.34, x: 0.19, y: -0.27, scale: 0.7, mood: "asking" },
  { p: 0.51, x: 0.34, y: -0.18, scale: 0.82, mood: "idle" },
  { p: 0.64, x: 0.36, y: 0.2, scale: 0.72, mood: "sad" },
  { p: 0.75, x: -0.32, y: 0.18, scale: 0.88, mood: "working" },
  { p: 0.87, x: 0.34, y: -0.12, scale: 0.76, mood: "idle" },
  { p: 1, x: 0.31, y: -0.2, scale: 0.96, mood: "happy" },
];

const mobileWaypoints: Waypoint[] = [
  { p: 0, x: 0.31, y: -0.12, scale: 0.7, mood: "idle" },
  { p: 0.22, x: 0.39, y: 0.25, scale: 0.48, mood: "asking" },
  { p: 0.45, x: 0.39, y: -0.3, scale: 0.46, mood: "idle" },
  { p: 0.66, x: 0.39, y: 0.28, scale: 0.46, mood: "sad" },
  { p: 0.84, x: 0.39, y: -0.28, scale: 0.48, mood: "working" },
  { p: 1, x: 0.34, y: -0.24, scale: 0.62, mood: "happy" },
];

const moodColours: Record<Mood, string> = { idle: "#ffd45e", asking: "#f5a524", sad: "#f4505e", working: "#3b9eff", happy: "#34d399" };

function curve(points: Waypoint[], value: number) {
  let i = 0;
  while (i < points.length - 2 && value > points[i + 1].p) i += 1;
  const a = points[Math.max(0, i - 1)];
  const b = points[i];
  const c = points[Math.min(points.length - 1, i + 1)];
  const d = points[Math.min(points.length - 1, i + 2)];
  const t = Math.max(0, Math.min(1, (value - b.p) / Math.max(0.0001, c.p - b.p)));
  const catmull = (v0: number, v1: number, v2: number, v3: number) => 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t * t * t);
  return { x: catmull(a.x, b.x, c.x, d.x), y: catmull(a.y, b.y, c.y, d.y), scale: catmull(a.scale, b.scale, c.scale, d.scale), mood: t < 0.5 ? b.mood : c.mood };
}

export function RobotStage({ paused = false, reduced = false, downloadHref }: { paused?: boolean; reduced?: boolean; downloadHref: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const helloRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const [hello, setHello] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const pausedRef = useRef(paused || reduced);
  const progressRef = useRef(0);
  const frozenProgressRef = useRef(0);
  const velocityRef = useRef(0);
  const lastProgressRef = useRef({ value: 0, time: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const redrawRef = useRef<() => void>(() => {});
  const waveUntilRef = useRef(0);
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, x: 0, y: 0, lastX: 0, lastY: 0, lastTime: 0, vx: 0, vy: 0, dragging: false, dropped: false, dropProgress: 0, timer: 0 as number | undefined });
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 76, damping: 26, mass: 0.42 });

  useMotionValueEvent(smoothProgress, "change", (value) => {
    const now = performance.now();
    const prior = lastProgressRef.current;
    const dt = prior.time ? Math.max(16, now - prior.time) : 16;
    velocityRef.current += (((value - prior.value) / dt) * 900 - velocityRef.current) * 0.2;
    progressRef.current = value;
    const drag = dragRef.current;
    if (drag.dropped && Math.abs(value - drag.dropProgress) > .105) drag.dropped = false;
    lastProgressRef.current = { value, time: now };
    redrawRef.current();
  });

  useEffect(() => {
    if (paused || reduced) frozenProgressRef.current = reduced ? 0 : progressRef.current;
    pausedRef.current = paused || reduced;
    redrawRef.current();
  }, [paused, reduced]);

  useEffect(() => {
    try {
      if (!localStorage.getItem("boltie-drag-hint")) {
        setShowHint(true);
        localStorage.setItem("boltie-drag-hint", "seen");
        const timer = window.setTimeout(() => setShowHint(false), 5200);
        return () => clearTimeout(timer);
      }
    } catch { /* localStorage is optional */ }
  }, []);

  useEffect(() => { if (!hello) return; const timer = window.setTimeout(() => setHello(false), 6500); return () => clearTimeout(timer); }, [hello]);

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    drag.pointerId = event.pointerId; drag.startX = drag.lastX = drag.x = event.clientX; drag.startY = drag.lastY = drag.y = event.clientY; drag.lastTime = performance.now(); drag.vx = drag.vy = 0;
    const target = event.currentTarget; const pointerId = event.pointerId;
    const activate = () => { drag.dragging = true; target.setPointerCapture(pointerId); redrawRef.current(); };
    if (event.pointerType === "touch") drag.timer = window.setTimeout(activate, 460); else activate();
  };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current; if (drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.dragging && distance > 5) { clearTimeout(drag.timer); drag.pointerId = -1; return; }
    if (!drag.dragging) return;
    event.preventDefault(); const now = performance.now(); const dt = Math.max(16, now - drag.lastTime); drag.vx = (event.clientX - drag.lastX) / dt; drag.vy = (event.clientY - drag.lastY) / dt; drag.x = event.clientX; drag.y = event.clientY; drag.lastX = event.clientX; drag.lastY = event.clientY; drag.lastTime = now; redrawRef.current();
  };
  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current; if (drag.pointerId !== event.pointerId) return; clearTimeout(drag.timer);
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (drag.dragging && distance >= 5) { drag.dropped = true; drag.dropProgress = progressRef.current; }
    else if (distance < 5) { drag.dropped = false; waveUntilRef.current = performance.now() + 900; setHello(true); }
    drag.dragging = false; drag.pointerId = -1; redrawRef.current();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    camera.position.z = 500;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" }); }
    catch { return; }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene.add(new HemisphereLight(0xffffff, 0x252932, 2.2));
    const key = new DirectionalLight(0xffffff, 3.3); key.position.set(-160, 210, 280); scene.add(key);
    const rim = new DirectionalLight(0xffc83d, 1.3); rim.position.set(160, 40, -120); scene.add(rim);

    const root = new Group();
    const body = new Group();
    scene.add(root); root.add(body);
    const shellMaterial = new MeshPhysicalMaterial({ color: 0xf4f5f8, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.14 });
    const darkMaterial = new MeshStandardMaterial({ color: 0x23272f, roughness: 0.48 });
    const accentMaterial = new MeshStandardMaterial({ color: 0xffc83d, roughness: 0.38 });
    const shell = new Mesh(new SphereGeometry(56, 56, 36), shellMaterial); shell.scale.set(1, 0.94, 1); body.add(shell);

    const faceCanvas = document.createElement("canvas"); faceCanvas.width = 512; faceCanvas.height = 320;
    const ctx = faceCanvas.getContext("2d");
    if (!ctx) { renderer.dispose(); return; }
    const faceTexture = new CanvasTexture(faceCanvas); faceTexture.colorSpace = SRGBColorSpace;
    const visorMaterial = new MeshStandardMaterial({ map: faceTexture, emissive: 0xffffff, emissiveMap: faceTexture, emissiveIntensity: 1.1, roughness: 0.08, metalness: 0.25, transparent: true, alphaTest: 0.5 });
    const visor = new Mesh(new SphereGeometry(56.7, 56, 30, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.66, 1.1), visorMaterial); visor.scale.set(1, 0.94, 1); body.add(visor);
    [-1, 1].forEach((side) => { const ear = new Mesh(new CylinderGeometry(11, 11, 10, 24), accentMaterial); ear.rotation.z = Math.PI / 2; ear.position.set(side * 55, 2, 0); body.add(ear); });

    const stalk = new Group(); const stem = new Mesh(new CylinderGeometry(2, 2, 22, 10), darkMaterial); stem.position.y = 11; stalk.add(stem);
    const bulbMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd45e, emissiveIntensity: 2 });
    const bulb = new Mesh(new SphereGeometry(7, 20, 16), bulbMaterial); bulb.position.y = 27; stalk.add(bulb); stalk.position.y = 50; body.add(stalk);
    const nozzle = new Mesh(new CylinderGeometry(12, 16, 8, 24), darkMaterial); nozzle.position.y = -51; body.add(nozzle);
    const jetMaterial = new MeshBasicMaterial({ color: 0xffd45e, transparent: true, opacity: 0.46, blending: AdditiveBlending, depthWrite: false });
    const jet = new Mesh(new CylinderGeometry(12, 2, 42, 24, 1, true), jetMaterial); jet.position.y = -74; body.add(jet);
    const hands: Mesh[] = [];
    [-1, 1].forEach((side) => { const hand = new Mesh(new SphereGeometry(10, 24, 18), shellMaterial); hand.position.set(side * 79, -4, 8); hands.push(hand); root.add(hand); });
    const shadow = new Mesh(new CircleGeometry(48, 40), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })); shadow.scale.set(1, 0.18, 1); shadow.position.set(0, -107, -80); root.add(shadow);

    let width = 1, height = 1, raf = 0, elapsed = 0, last = performance.now(), visible = true, lookX = 0, lookY = 0, currentMood: Mood = "idle", nextBlink = performance.now() + 1800, blink = 1, lastFace = "";
    const colour = new Color(moodColours.idle);
    const onPointer = (event: PointerEvent) => { if (window.innerWidth > 720) pointerRef.current = { x: (event.clientX / window.innerWidth - 0.5) * 2, y: (event.clientY / window.innerHeight - 0.5) * 2 }; };
    const drawFace = (open: number) => {
      const keyValue = `${currentMood}|${Math.round(lookX * 30)}|${Math.round(lookY * 30)}|${Math.round(open * 8)}`;
      if (keyValue === lastFace) return; lastFace = keyValue;
      ctx.clearRect(0, 0, 512, 320); ctx.fillStyle = "#090b10"; ctx.beginPath(); ctx.roundRect(20, 18, 472, 284, 110); ctx.fill();
      ctx.fillStyle = moodColours[currentMood]; ctx.shadowColor = moodColours[currentMood]; ctx.shadowBlur = 28;
      [-1, 1].forEach((side) => { const x = 256 + side * 92 + lookX * 22; const y = 160 - lookY * 14; const h = currentMood === "sad" ? 14 : currentMood === "asking" ? 112 : currentMood === "happy" ? 70 : 96; const w = currentMood === "asking" ? 62 : 52; ctx.beginPath(); ctx.roundRect(x - w / 2, y - (h * open) / 2, w, Math.max(5, h * open), Math.min(26, h * open / 2)); ctx.fill(); });
      faceTexture.needsUpdate = true;
    };
    const resize = () => { width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight); camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); schedule(); };
    const schedule = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const frame = (now: number) => {
      raf = 0; if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; elapsed += dt;
      const isMobile = width <= 720; const points = isMobile ? mobileWaypoints : desktopWaypoints; const path = curve(points, pausedRef.current ? frozenProgressRef.current : progressRef.current);
      const drag = dragRef.current;
      root.visible = !(reduced && progressRef.current > 0.12);
      currentMood = drag.dragging ? "asking" : path.mood; colour.lerp(new Color(moodColours[currentMood]), 1 - Math.exp(-6 * dt)); bulbMaterial.emissive.copy(colour); jetMaterial.color.copy(colour); accentMaterial.color.lerp(colour, 0.04);
      const ease = 1 - Math.exp(-7 * dt); lookX += (pointerRef.current.x - lookX) * ease; lookY += (pointerRef.current.y - lookY) * ease;
      const speed = pausedRef.current ? 0 : velocityRef.current; velocityRef.current *= Math.pow(0.02, dt);
      const desiredX = drag.dragging || drag.dropped ? drag.x - width / 2 : path.x * width;
      const desiredY = drag.dragging || drag.dropped ? height / 2 - drag.y : path.y * height;
      const dragEase = reduced && drag.dragging ? 1 : 1 - Math.exp(-(drag.dragging ? 18 : 7) * dt);
      root.position.x += (desiredX - root.position.x) * dragEase; root.position.y += (desiredY - root.position.y) * dragEase;
      const bob = pausedRef.current ? 0 : Math.sin(elapsed * 1.8) * 4; body.position.y = bob; root.scale.setScalar(path.scale);
      body.rotation.z += ((drag.dragging ? -drag.vx * .6 : -speed * 0.09) - body.rotation.z) * ease; body.rotation.x += ((drag.dragging ? drag.vy * .25 : -lookY * 0.12 + Math.min(0.18, Math.abs(speed) * 0.05)) - body.rotation.x) * ease; body.rotation.y += ((lookX * 0.25 + speed * 0.03) - body.rotation.y) * ease;
      stalk.rotation.z = Math.sin(elapsed * 1.4) * 0.04 - lookX * 0.05; jet.scale.y = 0.86 + Math.min(0.5, Math.abs(speed) * 0.2) + Math.sin(elapsed * 7) * 0.05; bulbMaterial.emissiveIntensity = 1.8 + Math.sin(elapsed * 2) * 0.18;
      const wave = (progressRef.current < 0.08 && !pausedRef.current) || now < waveUntilRef.current; hands.forEach((hand, index) => { const side = index === 0 ? -1 : 1; hand.position.x = side * 79; hand.position.y = -4 + bob + (wave && side === 1 ? 14 + Math.sin(elapsed * 7) * 8 : 0); });
      const screenX = root.position.x + width / 2; const screenY = height / 2 - root.position.y;
      if (hitRef.current) { hitRef.current.style.transform = `translate3d(${screenX - 76}px,${screenY - 78}px,0)`; hitRef.current.dataset.dragging = String(drag.dragging); hitRef.current.hidden = !root.visible; }
      if (helloRef.current) helloRef.current.style.transform = `translate3d(${Math.min(width - 420, screenX + 82)}px,${Math.max(84, screenY - 76)}px,0)`;
      if (hintRef.current) hintRef.current.style.transform = `translate3d(${screenX + 56}px,${screenY - 68}px,0)`;
      if (now > nextBlink) { blink = 0; nextBlink = now + 2400 + Math.random() * 2400; } else blink += (1 - blink) * Math.min(1, dt * 18);
      drawFace(blink); renderer.render(scene, camera); if (!pausedRef.current && !reduced) raf = requestAnimationFrame(frame);
    };
    redrawRef.current = schedule;
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) schedule(); else { cancelAnimationFrame(raf); raf = 0; } });
    intersection.observe(canvas); window.addEventListener("resize", resize); window.addEventListener("pointermove", onPointer, { passive: true }); document.addEventListener("visibilitychange", schedule);
    resize(); drawFace(1); setReady(true);
    return () => { redrawRef.current = () => {}; cancelAnimationFrame(raf); intersection.disconnect(); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", onPointer); document.removeEventListener("visibilitychange", schedule); scene.traverse((object) => { if (object instanceof Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); } }); faceTexture.dispose(); renderer.dispose(); };
  }, [reduced]);

  return <div className={`robot-stage${ready ? " is-ready" : ""}`}><div className="robot-fallback" aria-hidden="true"><span className="fallback-antenna" /><span className="fallback-visor"><i /><i /></span><span className="fallback-jet" /></div><canvas ref={canvasRef} aria-hidden="true" /><button ref={hitRef} className="robot-hit" type="button" aria-label="Drag Boltie, or click to say hello" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); waveUntilRef.current = performance.now() + 900; setHello(true); redrawRef.current(); } }} />{showHint && <span ref={hintRef} className="drag-hint">drag me</span>}{hello && <div ref={helloRef} className="robot-hello"><ProductCard state="hello" downloadHref={downloadHref} /></div>}</div>;
}
