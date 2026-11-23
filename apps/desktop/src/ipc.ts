// Typed wrappers around the Tauri commands and events in src-tauri/src.
// Keep these in sync with boltie_core::event and src-tauri/src/state.rs.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Risk = "read_only" | "change" | "destructive" | "forbidden";
export type ProviderKind = "anthropic_api" | "claude_cli";

export type AgentEvent =
  | { type: "ack"; text: string }
  | { type: "thinking" }
  | { type: "say"; text: string }
  | { type: "tool_started"; name: string; summary: string }
  | { type: "tool_finished"; name: string; ok: boolean; preview: string }
  | { type: "denied"; summary: string; reason: string }
  | { type: "done"; text: string }
  | { type: "failed"; text: string };

export interface ApprovalRequest {
  id: number;
  title: string;
  detail: string;
  risk: Risk;
  cwd: string | null;
}

export interface Status {
  ready: boolean;
  problem: string | null;
  provider: ProviderKind;
  model: string;
  has_api_key: boolean;
  claude_cli: string | null;
  skills: string[];
  busy: boolean;
}

export interface Config {
  provider: ProviderKind;
  model: string;
  effort: string;
  project_roots: string[];
  editor: string;
  hotkey: string;
  command_timeout_secs: number;
  allow_claude_code_delegation: boolean;
  claude_cli_allowed_tools: string[];
  screen: string | null;
}

export interface Screen {
  index: number;
  name: string;
  label: string;
  primary: boolean;
}

export interface DisplayLayout {
  screens: Screen[];
  current: number;
  /** Neighbouring screens he may fly to. Always null when pinned. */
  left: number | null;
  right: number | null;
  /** Name of the screen he's pinned to, or null when roaming. */
  pinned: string | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const api = {
  send: (text: string) => invoke<void>("send_command", { text }),
  cancel: () => invoke<void>("cancel"),
  respond: (id: number, approved: boolean) => invoke<boolean>("respond_approval", { id, approved }),
  status: () => invoke<Status>("status"),
  getConfig: () => invoke<Config>("get_config"),
  saveConfig: (config: Config) => invoke<void>("save_config", { config }),
  setApiKey: (key: string) => invoke<void>("set_api_key", { key }),
  clearApiKey: () => invoke<void>("clear_api_key"),
  resetConversation: () => invoke<void>("reset_conversation"),
  setHitRegions: (regions: Rect[]) => invoke<void>("set_hit_regions", { regions }),
  holdInteractive: (hold: boolean) => invoke<void>("hold_interactive", { hold }),
  focusWindow: () => invoke<void>("focus_window"),
  quit: () => invoke<void>("quit_app"),
  hideWindow: () => invoke<void>("hide_window"),
  displayLayout: () => invoke<DisplayLayout>("display_layout"),
  moveToDisplay: (index: number) => invoke<DisplayLayout>("move_to_display", { index }),
  /** Pin to a screen by name, or null to roam all screens. */
  setHomeScreen: (name: string | null) => invoke<DisplayLayout>("set_home_screen", { name }),
};

export const on = {
  event: (fn: (e: AgentEvent) => void): Promise<UnlistenFn> =>
    listen<AgentEvent>("boltie://event", (e) => fn(e.payload)),
  approval: (fn: (r: ApprovalRequest) => void): Promise<UnlistenFn> =>
    listen<ApprovalRequest>("boltie://approval", (e) => fn(e.payload)),
  summon: (fn: (e: { moved: boolean }) => void): Promise<UnlistenFn> =>
    listen<{ moved: boolean }>("boltie://summon", (e) => fn(e.payload)),
  settings: (fn: () => void): Promise<UnlistenFn> => listen("boltie://settings", fn),
  /** Cursor in physical pixels relative to the window, sent by the hit-test thread. */
  cursor: (fn: (p: { x: number; y: number }) => void): Promise<UnlistenFn> =>
    listen<{ x: number; y: number }>("boltie://cursor", (e) => fn(e.payload)),
};
