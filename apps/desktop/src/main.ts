import { Approval, Chat, Dock, Settings, WASH, stepLabel } from "./dock";
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { api, on, type AgentEvent, type DisplayLayout, type Rect } from "./ipc";
import { Robot, type Mood } from "./robot";
import { play } from "./sound";

const robot = new Robot(document.getElementById("stage") as HTMLCanvasElement);
const glow = document.getElementById("glow")!;
const dock = new Dock();

let busy = false;
let moodTimer: number | undefined;
let cursor: { x: number; y: number } | null = null;
let layout: DisplayLayout = { screens: [], current: 0, left: null, right: null, pinned: null };

function applyLayout(next: DisplayLayout) {
  layout = next;
  robot.neighbours = { left: next.left !== null, right: next.right !== null };
}

async function refreshLayout() {
  try {
    applyLayout(await api.displayLayout());
  } catch (e) {
    console.warn("display layout unavailable", e);
  }
}

/** Pin him to a screen (or roam with null) and settle him in view there. */
async function chooseScreen(name: string | null) {
  try {
    const before = layout.current;
    applyLayout(await api.setHomeScreen(name));
    if (layout.current !== before) robot.placeAt(window.innerWidth / 2);
  } catch (e) {
    chat.reply(String(e), "error");
  }
}

// He flew off an edge: move the strip to that screen and fly in from the other side.
robot.onLeave = async (side) => {
  const target = side < 0 ? layout.left : layout.right;
  if (target === null) return;
  applyLayout(await api.moveToDisplay(target));
  robot.enter(side < 0 ? 1 : -1);
};

const chat = new Chat(
  (text) => {
    setBusy(true);
    dock.wash(WASH.chat);
    void api.send(text);
  },
  () => void api.send("stop"),
  () => void settings.open(),
  () => void api.resetConversation(),
);

const approval = new Approval(dock, () => {
  dock.wash(busy ? WASH.working : WASH.chat);
  dock.show("chat");
  if (busy) setMood("working");
});

const settings = new Settings(
  dock,
  (status) => {
    chat.setReady(status.ready);
    void api.holdInteractive(false);
    dock.show("chat");
    chat.reply(status.provider === "claude_cli" ? "All set. I'll think with your Claude Code login." : "All set. Using your API key.", "note");
    robot.setMood("happy");
    chat.focus();
  },
  () => {
    void api.holdInteractive(false);
    dock.show("chat");
  },
  (next) => {
    const before = layout.current;
    applyLayout(next);
    if (next.current !== before) robot.placeAt(window.innerWidth / 2);
  },
);

function setBusy(value: boolean) {
  busy = value;
  chat.setBusy(value);
}

/** happy, sad and listening are short reactions that settle back to idle. */
function setMood(mood: Mood) {
  window.clearTimeout(moodTimer);
  robot.setMood(mood);
  if (mood === "happy" || mood === "sad" || mood === "listening") {
    moodTimer = window.setTimeout(() => robot.setMood(busy ? "thinking" : "idle"), mood === "listening" ? 1200 : 2600);
  }
}

function handle(event: AgentEvent) {
  switch (event.type) {
    case "ack":
      setMood("listening");
      chat.typing("");
      break;
    case "thinking":
      if (!approval.active) setMood("thinking");
      chat.typing(undefined);
      break;
    case "say":
      chat.reply(event.text);
      break;
    case "tool_started":
      setMood("working");
      dock.wash(WASH.working);
      chat.typing(stepLabel(event.name, event.summary));
      break;
    case "tool_finished":
      break;
    case "denied":
      chat.reply(`Skipped ${event.summary} (${event.reason})`, "note");
      break;
    case "done":
      approval.clear();
      setBusy(false);
      chat.reply(event.text);
      setMood("happy");
      dock.wash(WASH.done);
      dock.show("chat");
      play("finish");
      dock.autoClose(12);
      break;
    case "failed":
      approval.clear();
      setBusy(false);
      chat.reply(event.text, "error");
      setMood("sad");
      dock.wash(WASH.danger);
      dock.show("chat");
      play("error");
      break;
  }
}

async function summon() {
  if (approval.active) return;
  const status = await api.status();
  chat.setReady(status.ready);
  if (!status.ready) {
    await settings.open();
    return;
  }
  if (dock.isOpen && dock.view === "chat") {
    chat.focus();
    return;
  }
  dock.wash(WASH.chat);
  dock.show("chat");
  setMood("listening");
  chat.focus();
}

// Click the robot to toggle the dock, drag him to move him anywhere.
const PERCH_KEY = "boltie.perch";
const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag
let press: { id: number; x: number; y: number; dx: number; dy: number; dragging: boolean } | null = null;

window.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !robot.contains(e.clientX, e.clientY)) return;
  const c = robot.centre();
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: c.x - e.clientX, dy: c.y - e.clientY, dragging: false };
  document.body.setPointerCapture(e.pointerId);
});

window.addEventListener("pointermove", (e) => {
  if (!press || e.pointerId !== press.id) return;
  if (!press.dragging) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
    press.dragging = true;
    robot.beginDrag();
    dock.close();
    // Keep getting pointer events even when the cursor outruns the robot.
    void api.holdInteractive(true);
    play("peek");
  }
  robot.dragTo(e.clientX + press.dx, e.clientY + press.dy);
});

window.addEventListener("pointerup", (e) => {
  if (!press || e.pointerId !== press.id) return;
  const wasDrag = press.dragging;
  press = null;
  if (wasDrag) {
    robot.endDrag();
    void api.holdInteractive(false);
    play("pop");
    try {
      localStorage.setItem(PERCH_KEY, String(Math.round(robot.perchHeight)));
    } catch {
      // Storage blocked: he just won't remember the spot.
    }
    return;
  }
  if (dock.isOpen && dock.view === "chat" && !busy) dock.close();
  else void summon();
});

// Right-click the robot for the menu, including quitting.
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (robot.contains(e.clientX, e.clientY)) void showRobotMenu();
});

async function screenMenu() {
  await refreshLayout();
  const items = [
    await CheckMenuItem.new({ text: "All screens (roam)", checked: layout.pinned === null, action: () => void chooseScreen(null) }),
    await PredefinedMenuItem.new({ item: "Separator" }),
  ];
  for (const screen of layout.screens) {
    items.push(
      await CheckMenuItem.new({
        text: screen.label,
        checked: layout.pinned === screen.name,
        action: () => void chooseScreen(screen.name),
      }),
    );
  }
  return Submenu.new({ text: "Screen", items, enabled: layout.screens.length > 1 });
}

async function showRobotMenu() {
  const menu = await Menu.new({
    items: [
      await MenuItem.new({ text: "Talk to Boltie", action: () => void summon() }),
      await MenuItem.new({ text: "Settings", action: () => void settings.open() }),
      await MenuItem.new({
        text: "Fly back down",
        enabled: robot.perchHeight > 0,
        action: () => {
          robot.setPerch(0);
          try {
            localStorage.removeItem(PERCH_KEY);
          } catch {
            // ignore
          }
        },
      }),
      await screenMenu(),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({ text: "Hide (tray icon brings him back)", action: () => void api.hideWindow() }),
      await MenuItem.new({ text: "Quit Boltie", action: () => void api.quit() }),
    ],
  });
  await menu.popup();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && dock.isOpen && dock.view === "chat" && !busy) dock.close();
  if (e.key === "Escape" && dock.view === "settings") {
    void api.holdInteractive(false);
    dock.show("chat");
  }
});

// Tell Rust which parts of the window take clicks.
let lastRegions = "";
function reportHitRegions() {
  const dpr = window.devicePixelRatio;
  const rects: Rect[] = [robot.rect()];
  if (dock.isOpen) {
    const b = dock.el.getBoundingClientRect();
    rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
  }
  const physical = rects.map((r) => ({
    x: Math.round(r.x * dpr),
    y: Math.round(r.y * dpr),
    w: Math.round(r.w * dpr),
    h: Math.round(r.h * dpr),
  }));
  const key = JSON.stringify(physical);
  if (key !== lastRegions) {
    lastRegions = key;
    void api.setHitRegions(physical);
  }
}

function cursorOverDock() {
  if (!cursor || !dock.isOpen) return false;
  const b = dock.el.getBoundingClientRect();
  return cursor.x >= b.left && cursor.x <= b.right && cursor.y >= b.top && cursor.y <= b.bottom;
}

function loop(now: number) {
  robot.paused = dock.isOpen;
  robot.frame();

  // The card sits above him, or below when he's perched near the top.
  const head = robot.headTop();
  const r = robot.rect();
  if (head.y - dock.el.offsetHeight < 16) dock.placeBelow(head.x, r.y + r.h + 10);
  else dock.place(head.x, head.y);
  dock.tick(now, busy || cursorOverDock() || chat.typingText || dock.view !== "chat");

  const size = r.w * 2.2;
  glow.style.width = glow.style.height = `${size}px`;
  glow.style.transform = `translate(${r.x + r.w / 2 - size / 2}px, ${r.y + r.h - size * 0.55}px)`;
  glow.style.setProperty("--glow", robot.stateColor);
  glow.style.setProperty("--glow-a", robot.glow.toFixed(2));

  reportHitRegions();
  requestAnimationFrame(loop);
}

async function start() {
  await on.event(handle);
  await on.approval((req) => {
    setMood("asking");
    approval.push(req);
  });
  await on.summon(async ({ moved }) => {
    if (moved) {
      // The hotkey pulled us to the screen under the cursor; appear near it.
      await refreshLayout();
      robot.placeAt(cursor ? Math.min(Math.max(cursor.x, 120), window.innerWidth - 120) : window.innerWidth / 2);
    }
    void summon();
  });
  await on.settings(() => void settings.open());
  await on.cursor((p) => {
    const dpr = window.devicePixelRatio;
    cursor = { x: p.x / dpr, y: p.y / dpr };
    robot.setCursor(cursor);
  });

  try {
    const saved = Number(localStorage.getItem(PERCH_KEY));
    if (saved > 0) robot.setPerch(saved);
  } catch {
    // Storage blocked: start near the taskbar.
  }

  await refreshLayout();
  // Screens get plugged in and out; check now and then.
  setInterval(() => void refreshLayout(), 10_000);

  requestAnimationFrame(loop);

  const status = await api.status();
  chat.setReady(status.ready);
  setTimeout(() => {
    robot.wave();
    play("greet");
    if (!status.ready) {
      void settings.open();
    }
  }, 600);
}

void start();
