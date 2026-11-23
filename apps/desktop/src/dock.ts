// The card that floats above the robot. One card, three views (chat,
// approval, settings) that crossfade, Poupou style.

import { api, type ApprovalRequest, type Config, type DisplayLayout, type ProviderKind, type Status } from "./ipc";
import { getVolume, play, setVolume } from "./sound";

export type View = "chat" | "approval" | "settings";

/** Colour rising from the bottom of the card. */
export const WASH = {
  chat: "rgba(99,102,241,.5)",
  working: "rgba(59,158,255,.4)",
  approval: "rgba(245,165,36,.42)",
  danger: "rgba(244,80,94,.55)",
  done: "rgba(52,211,153,.5)",
} as const;

const ICONS = {
  plus: "M12 5v14M5 12h14",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  up: "M12 19V5M5 12l7-7 7 7",
  stop: "M6 6l12 12M18 6L6 18",
};

function icon(path: string, width = 2.2) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id} in index.html`);
  return el as T;
}

/** "run_command" + "Run a command: git status" -> "Run · git status" */
export function stepLabel(tool: string, summary: string): string {
  const verbs: Record<string, string> = {
    run_command: "Run",
    Bash: "Run",
    PowerShell: "Run",
    open_in_editor: "Open",
    open_app: "Launch",
    find_folder: "Find",
    docker_run: "Docker",
    scaffold_project: "Create",
    delegate_to_claude_code: "Claude Code",
    Read: "Read",
    Edit: "Edit",
    Write: "Write",
    Glob: "Search",
    Grep: "Search",
    WebFetch: "Fetch",
    WebSearch: "Search",
  };
  const detail = summary.includes(": ") ? summary.slice(summary.indexOf(": ") + 2) : summary;
  const verb = verbs[tool] ?? tool;
  return detail ? `${verb} · ${detail}` : verb;
}

export class Dock {
  readonly el = $<HTMLElement>("dock");
  private views: Record<View, HTMLElement> = {
    chat: $("view-chat"),
    approval: $("view-approval"),
    settings: $("view-settings"),
  };
  private countdown = $<HTMLElement>("countdown");
  private current: View = "chat";
  private closeAt = 0;
  private closeSpan = 0;

  constructor() {
    const close = $<HTMLButtonElement>("dock-close");
    close.innerHTML = icon(ICONS.stop, 2.2);
    close.addEventListener("click", () => {
      if (this.current === "approval") return; // answer the card instead
      if (this.current === "settings") void api.holdInteractive(false);
      this.close();
    });
  }

  get isOpen() {
    return !this.el.classList.contains("hidden") && !this.el.classList.contains("closing");
  }

  get view() {
    return this.current;
  }

  show(view: View) {
    this.cancelAutoClose();
    if (view !== this.current || !this.isOpen) {
      for (const [name, el] of Object.entries(this.views)) el.classList.toggle("on", name === view);
      this.current = view;
    }
    if (!this.isOpen) {
      this.el.classList.remove("hidden", "closing");
      this.el.classList.add("opening");
      setTimeout(() => this.el.classList.remove("opening"), 450);
      play("open");
    }
  }

  close() {
    if (!this.isOpen) return;
    this.cancelAutoClose();
    this.el.classList.add("closing");
    play("close");
    setTimeout(() => {
      if (this.el.classList.contains("closing")) this.el.classList.add("hidden");
      this.el.classList.remove("closing");
    }, 340);
  }

  wash(color: string) {
    this.el.style.setProperty("--wash", color);
  }

  /** Close after `seconds` unless something keeps it open. */
  autoClose(seconds: number) {
    this.closeSpan = seconds * 1000;
    this.closeAt = performance.now() + this.closeSpan;
  }

  cancelAutoClose() {
    this.closeAt = 0;
    this.countdown.style.setProperty("--left", "0px");
  }

  /** Called every frame. `hold` pauses the countdown (hover, typing). */
  tick(now: number, hold: boolean) {
    if (!this.closeAt) return;
    if (hold) {
      this.closeAt = now + this.closeSpan;
      this.countdown.style.setProperty("--left", "0px");
      return;
    }
    const left = this.closeAt - now;
    if (left <= 0) {
      this.close();
      return;
    }
    // The bar only shows for the last stretch, like Poupou's.
    const visible = Math.min(6000, this.closeSpan * 0.6);
    this.countdown.style.setProperty("--left", left < visible ? `${(left / visible) * 160}px` : "0px");
  }

  /** Bottom-centre of the card at (x, bottom). */
  place(x: number, bottom: number) {
    this.moveTo(x, Math.max(bottom - this.el.offsetHeight, 8), "100%");
  }

  /** Top-centre of the card at (x, top), for when he's near the top of the screen. */
  placeBelow(x: number, top: number) {
    this.moveTo(x, Math.min(top, window.innerHeight - this.el.offsetHeight - 8), "0%");
  }

  private moveTo(x: number, top: number, origin: string) {
    const w = this.el.offsetWidth;
    const left = Math.round(Math.min(Math.max(x - w / 2, 8), window.innerWidth - w - 8));
    this.el.style.setProperty("--at", `translate(${left}px, ${Math.round(top)}px)`);
    this.el.style.transformOrigin = `50% ${origin}`;
  }
}

export class Chat {
  private log = $<HTMLDivElement>("chat-log");
  private form = $<HTMLFormElement>("chat-bar");
  readonly input = $<HTMLInputElement>("chat-input");
  private send = $<HTMLButtonElement>("send");
  private newChat = $<HTMLButtonElement>("new-chat");
  private typingRow: HTMLElement | null = null;
  private busy = false;
  private ready = true;

  constructor(
    onSubmit: (text: string) => void,
    onStop: () => void,
    onSettings: () => void,
    onNewChat: () => void,
  ) {
    this.newChat.innerHTML = icon(ICONS.plus);
    $("open-settings").innerHTML = icon(ICONS.gear, 1.8);
    this.send.innerHTML = icon(ICONS.up, 2.6);

    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) {
        if (this.busy) onStop();
        return;
      }
      this.input.value = "";
      this.addUser(text);
      play("send");
      onSubmit(text);
    });
    this.send.addEventListener("click", (e) => {
      if (this.busy && !this.input.value.trim()) {
        e.preventDefault();
        onStop();
      }
    });
    $("open-settings").addEventListener("click", onSettings);
    this.newChat.addEventListener("click", () => {
      this.clear();
      onNewChat();
    });
    this.sync();
  }

  setReady(ready: boolean) {
    this.ready = ready;
    this.sync();
  }

  setBusy(busy: boolean) {
    this.busy = busy;
    if (!busy) this.typing(null);
    this.sync();
  }

  addUser(text: string) {
    const row = document.createElement("div");
    row.className = "chat-row user";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    row.append(bubble);
    this.append(row);
  }

  /** Assistant text. Same text twice in a row (the CLI sends it as a message and as the result) is shown once. */
  reply(text: string, kind: "normal" | "error" | "note" = "normal") {
    const replies = this.log.querySelectorAll(".reply");
    const last = replies[replies.length - 1];
    if (kind === "normal" && last?.textContent === text) return;
    const row = document.createElement("div");
    row.className = "chat-row";
    const reply = document.createElement("div");
    reply.className = `reply${kind === "normal" ? "" : ` ${kind}`}`;
    reply.textContent = kind === "error" ? `⚠ ${text}` : text;
    row.append(reply);
    this.append(row);
  }

  /** Typing dots with an optional shimmering step label. null removes them. */
  typing(step: string | null | undefined) {
    if (step === null) {
      this.typingRow?.remove();
      this.typingRow = null;
      return;
    }
    if (!this.typingRow) {
      this.typingRow = document.createElement("div");
      this.typingRow.className = "chat-row typing-row";
      this.typingRow.innerHTML = '<span class="typing"><i></i><i></i><i></i></span><span class="step"></span>';
    }
    if (step !== undefined) this.typingRow.querySelector(".step")!.textContent = step;
    this.log.append(this.typingRow); // keep it last
    this.scroll();
  }

  clear() {
    this.log.replaceChildren();
    this.typingRow = null;
    this.sync();
  }

  focus() {
    void api.focusWindow().then(() => this.input.focus());
  }

  get typingText() {
    return this.input.value.length > 0 || document.activeElement === this.input;
  }

  private append(row: HTMLElement) {
    const nearBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 24;
    if (this.typingRow?.isConnected) this.log.insertBefore(row, this.typingRow);
    else this.log.append(row);
    if (nearBottom) this.scroll();
    this.sync();
  }

  private scroll() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private sync() {
    const hasHistory = this.log.childElementCount > 0;
    this.newChat.classList.toggle("hidden", !hasHistory || this.busy);
    this.send.innerHTML = icon(this.busy ? ICONS.stop : ICONS.up, 2.6);
    this.send.title = this.busy ? "Stop" : "Send";
    this.input.placeholder = !this.ready
      ? "Set me up first, click the gear"
      : this.busy
        ? "Working... type stop to cancel"
        : hasHistory
          ? "Continue..."
          : "Ask Boltie anything...";
  }
}

export class Approval {
  private queue: ApprovalRequest[] = [];
  private current: ApprovalRequest | null = null;

  constructor(
    private dock: Dock,
    private onDone: () => void,
  ) {
    $("ap-allow").addEventListener("click", () => void this.answer(true));
    $("ap-deny").addEventListener("click", () => void this.answer(false));
    document.addEventListener("keydown", (e) => {
      if (!this.current || this.dock.view !== "approval") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === "escape" || key === "n") void this.answer(false);
      // Destructive actions need a real click.
      if (key === "y" && this.current.risk !== "destructive") void this.answer(true);
    });
  }

  get active() {
    return this.current !== null;
  }

  push(req: ApprovalRequest) {
    this.queue.push(req);
    if (!this.current) this.next();
  }

  clear() {
    this.queue = [];
    if (this.current) {
      this.current = null;
      this.onDone();
    }
  }

  private next() {
    this.current = this.queue.shift() ?? null;
    if (!this.current) {
      this.onDone();
      return;
    }
    const req = this.current;
    const fromClaude = req.title.startsWith("Claude Code");
    const danger = req.risk === "destructive";
    $("ap-who").textContent = fromClaude ? "Claude Code" : "Boltie";
    $("ap-who").parentElement!.style.setProperty("--who", fromClaude ? "#d97757" : "#ffc83d");
    $("ap-title").textContent = req.title;
    $("ap-code").textContent = req.detail;
    $("ap-cwd").textContent = req.cwd ? `in ${req.cwd}` : "";
    const risk = $("ap-risk");
    risk.textContent = danger ? "destructive" : "makes changes";
    risk.dataset.risk = req.risk;
    $("ap-allow-kbd").classList.toggle("hidden", danger);
    this.dock.wash(danger ? WASH.danger : WASH.approval);
    this.dock.show("approval");
    play("approval");
    void api.focusWindow();
  }

  private async answer(approved: boolean) {
    const req = this.current;
    if (!req) return;
    play(approved ? "approve" : "blip");
    await api.respond(req.id, approved);
    this.next();
  }
}

export class Settings {
  private form = $<HTMLFormElement>("view-settings");
  private config: Config | null = null;

  constructor(
    private dock: Dock,
    private onSaved: (status: Status) => void,
    private onClose: () => void,
    private onScreen: (layout: DisplayLayout) => void,
  ) {
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.save();
    });
    $("settings-close").addEventListener("click", () => this.onClose());
    $("settings-quit").addEventListener("click", () => {
      play("close");
      setTimeout(() => void api.quit(), 180);
    });
    this.form.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.name === "provider") this.syncProviderFields();
      if (target.id === "volume") {
        setVolume(Number(target.value));
        play("blip");
      }
    });
  }

  async open() {
    const [config, status] = await Promise.all([api.getConfig(), api.status()]);
    this.config = config;
    this.radio(config.provider).checked = true;
    this.radio("claude_cli").disabled = !status.claude_cli;
    $<HTMLInputElement>("model").value = config.model;
    $<HTMLSelectElement>("effort").value = config.effort;
    $<HTMLTextAreaElement>("roots").value = config.project_roots.join("\n");
    $<HTMLInputElement>("editor").value = config.editor;
    $<HTMLInputElement>("api-key").value = "";
    $<HTMLSelectElement>("volume").value = closestVolume(getVolume());
    $("key-status").textContent = status.has_api_key ? "A key is saved in your keychain. Leave empty to keep it." : "Stored in your OS keychain, never on disk.";
    $("cli-status").textContent = status.claude_cli
      ? `Uses your logged-in Claude Code at ${status.claude_cli}`
      : "Claude Code isn't installed. Install it and run `claude` once to log in.";
    $("settings-skills").textContent = status.skills.length ? `${status.skills.length} skills loaded` : "";
    $("settings-error").textContent = status.problem ?? "";
    await this.fillScreens();
    this.syncProviderFields();
    this.dock.wash(WASH.chat);
    this.dock.show("settings");
    await api.holdInteractive(true);
    await api.focusWindow();
  }

  private async fillScreens() {
    const select = $<HTMLSelectElement>("screen");
    const layout = await api.displayLayout();
    const options = [new Option("All screens (roam)", "")];
    for (const screen of layout.screens) options.push(new Option(screen.label, screen.name));
    select.replaceChildren(...options);
    select.value = layout.pinned ?? "";
    // Nothing to choose with one screen.
    $("screen-field").classList.toggle("hidden", layout.screens.length < 2);
  }

  private radio(value: ProviderKind) {
    return this.form.querySelector<HTMLInputElement>(`input[name=provider][value=${value}]`)!;
  }

  private provider(): ProviderKind {
    return (this.form.querySelector<HTMLInputElement>("input[name=provider]:checked")?.value ?? "anthropic_api") as ProviderKind;
  }

  private syncProviderFields() {
    const provider = this.provider();
    this.form.querySelectorAll<HTMLElement>("[data-for]").forEach((el) => {
      el.classList.toggle("hidden", el.dataset.for !== provider);
    });
  }

  private async save() {
    if (!this.config) return;
    const error = $("settings-error");
    error.textContent = "";
    const next: Config = {
      ...this.config,
      provider: this.provider(),
      model: $<HTMLInputElement>("model").value.trim() || this.config.model,
      effort: $<HTMLSelectElement>("effort").value,
      project_roots: $<HTMLTextAreaElement>("roots")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      editor: $<HTMLInputElement>("editor").value.trim() || "code",
    };
    try {
      const key = $<HTMLInputElement>("api-key").value.trim();
      if (key) await api.setApiKey(key);
      await api.saveConfig(next);
      const screen = $<HTMLSelectElement>("screen").value || null;
      if (screen !== this.config.screen) this.onScreen(await api.setHomeScreen(screen));
      const status = await api.status();
      if (!status.ready) {
        error.textContent = status.problem ?? "Not ready yet.";
        play("error");
        return;
      }
      play("approve");
      this.onSaved(status);
    } catch (e) {
      error.textContent = String(e);
      play("error");
    }
  }
}

function closestVolume(v: number): string {
  const options = [0, 0.06, 0.12, 0.2];
  return String(options.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)));
}
