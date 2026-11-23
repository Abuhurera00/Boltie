"use client";

import { AnimatePresence, motion } from "motion/react";

export type CardState = "chat" | "working" | "approval" | "danger" | "done" | "hello";

type ProductCardProps = {
  state: CardState;
  className?: string;
  onAllow?: () => void;
  onDeny?: () => void;
  downloadHref?: string;
};

const washes: Record<CardState, string> = {
  chat: "rgba(99,102,241,.5)",
  working: "rgba(59,158,255,.4)",
  approval: "rgba(245,165,36,.42)",
  danger: "rgba(244,80,94,.55)",
  done: "rgba(52,211,153,.5)",
  hello: "rgba(99,102,241,.5)",
};

function StrokeIcon({ name }: { name: "plus" | "gear" | "send" }) {
  if (name === "plus") return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>;
  if (name === "gear") return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.8 3.7 8.5 2h3l.7 1.7 1.6.9 1.8-.3 1.5 2.6-1.1 1.4v1.8l1.1 1.4-1.5 2.6-1.8-.3-1.6.9-.7 1.7h-3l-.7-1.7-1.6-.9-1.8.3-1.5-2.6L4 10.1V8.3L2.9 6.9l1.5-2.6 1.8.3 1.6-.9Z" /><circle cx="10" cy="9.2" r="2.3" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 12-6-4.5 12-2-4-5.5-2Z" /></svg>;
}

function ChatBar() {
  return <div className="pc-chatbar"><button type="button" aria-label="New conversation"><StrokeIcon name="plus" /></button><span>Ask Boltie</span><button type="button" aria-label="Settings"><StrokeIcon name="gear" /></button><button type="button" className="pc-send" aria-label="Send"><StrokeIcon name="send" /></button></div>;
}

function Approval({ danger, onAllow, onDeny }: { danger: boolean; onAllow?: () => void; onDeny?: () => void }) {
  return <div className="pc-approval"><div className="pc-who"><i style={{ background: danger ? "#d97757" : "#ffc83d" }} /><strong>{danger ? "Claude Code" : "Boltie"}</strong><span>needs permission</span><b data-risk={danger ? "destructive" : "changes"}>{danger ? "Destructive" : "Makes changes"}</b></div><h3>{danger ? "Delete a drive root" : "Start a Docker container"}</h3><pre><code>{danger ? "Remove-Item -Recurse C:\\" : "docker run --name local-postgres -d postgres"}</code></pre><p>in ~/projects/my-app</p><div className="pc-actions"><button type="button" onClick={onDeny}>Deny <kbd>N</kbd></button><button type="button" onClick={onAllow}>Allow {!danger && <kbd>Y</kbd>}</button></div></div>;
}

export function ProductCard({ state, className = "", onAllow, onDeny, downloadHref }: ProductCardProps) {
  return <motion.div className={`product-card ${className}`.trim()} style={{ "--wash": washes[state] } as React.CSSProperties} initial={{ opacity: 0, scale: .9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .94, y: 8 }} transition={{ duration: .42, ease: [.3, 1.2, .4, 1] }}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div className="pc-view" key={state} initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .25 }}>
        {state === "approval" && <Approval danger={false} onAllow={onAllow} onDeny={onDeny} />}
        {state === "danger" && <Approval danger onAllow={onAllow} onDeny={onDeny} />}
        {(state === "chat" || state === "working" || state === "done") && <div className="pc-chat"><div className="pc-log"><div className="pc-user">start a Postgres container for local dev</div>{state === "chat" && <p className="pc-reply">I’ll work out the command and show it before anything changes.</p>}{state === "working" && <div className="pc-typing"><span><i /><i /><i /></span><b>Prepare the Postgres container</b></div>}{state === "done" && <p className="pc-reply">Postgres is running as <code>local-postgres</code>.</p>}</div><ChatBar /></div>}
        {state === "hello" && <div className="pc-hello"><p>Hi, I’m Boltie. Download me to put me on your desktop.</p>{downloadHref && <a href={downloadHref}>Download Boltie</a>}</div>}
      </motion.div>
    </AnimatePresence>
  </motion.div>;
}
