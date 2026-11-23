"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { detectPlatform, downloadFor, downloads, releases, repo, type Download } from "../downloads";
import { ProductCard, type CardState } from "./product/Card";
import { RobotStage } from "./RobotStage";

type IconName = "folder" | "app" | "terminal" | "docker" | "code" | "handoff" | "screens" | "pin" | "drag" | "file" | "github" | "key";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    folder: <><path d="M3 6.5h6l1.8 2H21v9.5H3Z" /><path d="M3 6.5V5h6l1.8 2" /></>,
    app: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    terminal: <><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="m6 9 3 3-3 3M12 16h5" /></>,
    docker: <><path d="M4 12h16c0 5-3.2 8-8.5 8S3 17 3 13l1-1Z" /><path d="M7 9h3v3H7zM10 6h3v3h-3zM10 9h3v3h-3zM13 9h3v3h-3zM18 9c1-1 2-1 3-.5-.2 1.4-.9 2.3-2.2 2.7" /></>,
    code: <><path d="m9 6-6 6 6 6M15 6l6 6-6 6M14 3l-4 18" /></>,
    handoff: <><path d="M4 7h11M11 3l4 4-4 4M20 17H9M13 13l-4 4 4 4" /></>,
    screens: <><rect x="2" y="4" width="9" height="12" rx="1.5" /><rect x="13" y="7" width="9" height="12" rx="1.5" /><path d="M5 20h13" /></>,
    pin: <><path d="m8 3 8 8M7 8l6 6M5 10l5-5 4 1 4 4 1 4-5 5-4-4-5-1Z" /><path d="m10 15-6 6" /></>,
    drag: <><path d="M9 11V5a2 2 0 0 1 4 0v5M13 9V4a2 2 0 0 1 4 0v7M17 9a2 2 0 0 1 4 0v5c0 5-3 8-8 8-3 0-5-1.5-7-4l-3-4a2 2 0 0 1 3-2l3 3" /></>,
    file: <><path d="M6 2h8l5 5v15H6Z" /><path d="M14 2v6h5M9 12h7M9 16h7" /></>,
    github: <><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9c0-1.1.1-1.7-.5-2.4 3.2-.4 6.5-1.6 6.5-7A5.5 5.5 0 0 0 20.5 5 5.1 5.1 0 0 0 20.4 1S19.2.6 16.5 2.5a13.4 13.4 0 0 0-7 0C6.8.6 5.6 1 5.6 1A5.1 5.1 0 0 0 5.5 5 5.5 5.5 0 0 0 4 8.8c0 5.4 3.3 6.6 6.5 7-.6.6-.6 1.2-.5 2.4V22" /></>,
    key: <><circle cx="8" cy="15" r="5" /><path d="m11.5 11.5 8-8M16 7l2 2M14 9l2 2" /></>,
  };
  return <svg className="stroke-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">{paths[name]}</svg>;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg className="arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M8 6h10v10" : "M4 12h15m-6-6 6 6-6 6"} /></svg>;
}

function DownloadButton({ small = false }: { small?: boolean }) {
  const [pick, setPick] = useState<Download>();
  useEffect(() => setPick(downloadFor(detectPlatform())), []);
  return <a className={`button button-primary${small ? " button-small" : ""}`} href={pick?.href ?? releases}>{small ? "Download" : pick ? `Download for ${pick.label}` : "Download Boltie"}<Arrow /></a>;
}

function MacDownloadButton() {
  const mac = downloads.find((download) => download.platform === "mac-arm");
  return <a className="button button-secondary" href={mac?.href ?? releases}>Download for macOS <Arrow /></a>;
}

function Brand() {
  return <span className="brand"><img src="/boltie-mark.svg" width="36" height="36" alt="" /><span>boltie</span></span>;
}

function Header() {
  const [open, setOpen] = useState(false); const [scrolled, setScrolled] = useState(false); const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (value) => { const next = value > 24; if (next !== scrolled) setScrolled(next); });
  const links = [["Features", "#features"], ["Safety", "#safety"], ["Download", "#download"], ["GitHub", repo]];
  return <header className="site-header" data-scrolled={scrolled}><div className="wrap nav-inner"><a className="skip-link" href="#main">Skip to content</a><a href="#top" className="brand-link" aria-label="Boltie home"><Brand /></a><nav className="desktop-nav" aria-label="Main navigation">{links.map(([label, href]) => <a href={href} key={label}>{label}</a>)}</nav><div className="nav-actions"><DownloadButton small /><button type="button" className="menu-toggle" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((value) => !value)}><span>{open ? "Close" : "Menu"}</span><span aria-hidden="true">{open ? "−" : "+"}</span></button></div></div><AnimatePresence>{open && <motion.nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>{links.map(([label, href]) => <a href={href} key={label} onClick={() => setOpen(false)}>{label}<Arrow diagonal /></a>)}<DownloadButton /></motion.nav>}</AnimatePresence></header>;
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .6, delay, ease: [.22, 1, .36, 1] }}>{children}</motion.div>;
}

function DesktopMock({ state, className = "", parallax = false }: { state: CardState; className?: string; parallax?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] }); const backY = useTransform(scrollYProgress, [0, 1], [20, -20]);
  return <div ref={ref} className={`desktop-mock ${className}`.trim()}><div className="desktop-menubar"><span>●</span><span>Mon 10:42</span></div><motion.div className="desktop-wallpaper" style={{ y: parallax ? backY : 0 }} /><div className="mock-window mock-editor"><div className="window-bar"><i /><i /><i /><span>my-app</span></div><div className="editor-body"><aside>src<br />app<br />components</aside><pre><span>export</span> function App() {'{'}<br />&nbsp;&nbsp;return &lt;main /&gt;<br />{'}'}</pre></div></div><div className="mock-window mock-terminal"><div className="window-bar"><i /><i /><i /><span>terminal</span></div><code>$ npm run dev<br /><b>ready on localhost:3000</b></code></div><div className="mock-taskbar"><span /><span /><span /><span /></div><div className="mock-card-anchor"><ProductCard state={state} /></div></div>;
}

function Hero({ still, paused, reduced, onPause }: { still: boolean; paused: boolean; reduced: boolean; onPause: () => void }) {
  const [state, setState] = useState<CardState>(reduced ? "done" : "chat");
  useEffect(() => { if (still) { setState("done"); return; } const flow: CardState[] = ["chat", "working", "approval", "working", "done"]; let index = 0; const timer = window.setInterval(() => { index = (index + 1) % flow.length; setState(flow[index]); }, 2600); return () => clearInterval(timer); }, [still]);
  return <section className="hero" id="top" data-enter><div className="hero-depth" aria-hidden="true"><i /><i /></div><div className="wrap hero-grid"><div className="hero-copy"><motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Open source · Windows &amp; macOS</motion.p><motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>A little robot that does your computer chores.</motion.h1><motion.p className="hero-lead" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08, duration: .55 }}>Ask in plain words. Boltie opens projects, starts tools and shows every changing command before it runs.</motion.p><motion.div className="hero-actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .14, duration: .55 }}><DownloadButton /><MacDownloadButton /></motion.div><div className="hotkey"><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>Space</kbd><small>Cmd on macOS</small></div></div><DesktopMock state={state} className="hero-mock" parallax={!still} /><button className="motion-toggle" type="button" aria-pressed={paused} disabled={reduced} onClick={onPause}><span aria-hidden="true">{still ? "▶" : "Ⅱ"}</span>{reduced ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"}</button></div></section>;
}

const steps = [{ title: "Ask", text: "Type the chore in your own words." }, { title: "Approve", text: "Read the exact command before it changes anything." }, { title: "Done", text: "Boltie reports the result and gets out of the way." }];

function HowItWorks({ still, compact }: { still: boolean; compact: boolean }) {
  const ref = useRef<HTMLElement>(null); const [step, setStep] = useState(still ? 2 : 0); const stepRef = useRef(step); const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => { if (still || compact) return; const next = Math.min(2, Math.floor(value * 3)); if (next !== stepRef.current) { stepRef.current = next; setStep(next); } });
  const states: CardState[] = ["chat", "approval", "done"];
  return <section className={`how-section${still || compact ? " how-static" : ""}`} id="how" ref={ref}><div className="how-sticky"><div className="wrap how-grid"><div className="how-copy"><p className="section-label">How it works</p><h2>One request. One clear decision.</h2><div className="step-list">{steps.map((item, index) => <button type="button" className={step === index ? "is-active" : ""} aria-pressed={step === index} key={item.title} onClick={() => { stepRef.current = index; setStep(index); }}><span>0{index + 1}</span><span><strong>{item.title}</strong><small>{item.text}</small></span></button>)}</div></div><DesktopMock state={states[step]} className="how-mock" /></div></div></section>;
}

const tools: { icon: IconName; title: string; example: string; tag: string }[] = [
  { icon: "folder", title: "Find and open", example: "“open my-app in VS Code”", tag: "Runs right away" },
  { icon: "app", title: "Launch an app", example: "“open Docker Desktop”", tag: "Runs right away" },
  { icon: "terminal", title: "Inspect your machine", example: "“what’s running on port 3000?”", tag: "Runs right away" },
  { icon: "docker", title: "Start a container", example: "“start Postgres for local dev”", tag: "Asks first" },
  { icon: "code", title: "Scaffold a project", example: "“make a new Vite app called demo”", tag: "Asks first" },
  { icon: "handoff", title: "Hand off coding work", example: "“ask Claude Code to fix the tests”", tag: "Asks first" },
];

function Features() {
  return <section className="section features-section" id="features"><div className="wrap"><div className="section-head"><div><h2>Computer chores, handled from one prompt.</h2></div><p>Read-only checks run directly. Actions that create, change or launch something wait for your approval.</p></div><div className="tool-grid">{tools.map((tool, index) => <Reveal className="tool-card" delay={index * .04} key={tool.title}><div className="tool-icon"><Icon name={tool.icon} /></div><span className={tool.tag === "Asks first" ? "tag tag-ask" : "tag"}>{tool.tag}</span><h3>{tool.title}</h3><code>{tool.example}</code></Reveal>)}</div></div></section>;
}

function Safety() {
  const [danger, setDanger] = useState(false);
  return <section className="section safety-section" id="safety"><div className="wrap"><div className="section-head"><div><h2>The exact command comes first.</h2></div><div className="risk-toggle" role="group" aria-label="Permission card example"><button type="button" className={!danger ? "is-active" : ""} onClick={() => setDanger(false)}>Makes changes</button><button type="button" className={danger ? "is-active" : ""} onClick={() => setDanger(true)}>Destructive</button></div></div><div className="safety-grid"><div className="safety-card-wrap"><ProductCard state={danger ? "danger" : "approval"} /></div><div className="safety-points"><Reveal><span>01</span><h3>See what will run</h3><p>The command and working folder are visible before you choose Allow or Deny.</p></Reveal><Reveal delay={.06}><span>02</span><h3>Some commands never run</h3><p>Deleting a drive root or piping an internet script into a shell is refused outright.</p></Reveal><Reveal delay={.12}><span>03</span><h3>Keep the key in the keychain</h3><p>API keys stay in the OS keychain. Boltie never reads Claude Code credential files.</p></Reveal></div></div></div></section>;
}

function ClaudeSection() {
  return <section className="section claude-section" id="claude"><div className="wrap"><div className="section-head"><div><h2>Use the Claude access you already have.</h2></div><p>No Boltie account, subscription or separate login.</p></div><div className="claude-grid"><Reveal className="claude-card"><Icon name="terminal" /><div><h3>Claude Code login</h3><p>Use the CLI session already installed on your computer.</p></div><strong>No API key</strong></Reveal><Reveal className="claude-card" delay={.08}><Icon name="key" /><div><h3>Anthropic API key</h3><p>Add a key once. Your operating system stores it securely.</p></div><strong>OS keychain</strong></Reveal></div></div></section>;
}

function DesktopLife({ still }: { still: boolean }) {
  const ref = useRef<HTMLElement>(null); const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] }); const y = useTransform(scrollYProgress, [0, 1], [20, -20]);
  return <section className="section desktop-section" id="desktop" ref={ref}><div className="wrap"><div className="section-head"><div><h2>Keep him where the work is.</h2></div><p>Drag Boltie between screens, pin him in place or call him from the tray.</p></div><motion.div className="bento" style={{ y: still ? 0 : y }}><div className="bento-tile bento-wide"><div className="mini-screens"><span><i /></span><span><i /></span><b>→</b></div><h3>Move between monitors</h3><p>Boltie flies to the screen you choose.</p></div><div className="bento-tile"><Icon name="drag" /><h3>Drag him anywhere</h3><p>Drop him beside the work.</p></div><div className="bento-tile"><Icon name="pin" /><h3>Pin one screen</h3><p>Keep his path predictable.</p></div><div className="bento-tile bento-code"><Icon name="file" /><pre><code># morning setup{`\n`}- open my-app{`\n`}- start Docker</code></pre><h3>Teach a markdown skill</h3></div></motion.div></div></section>;
}

function OpenSource() {
  return <section className="section open-section"><div className="wrap open-grid"><Reveal><h2>MIT-licensed desktop code.</h2><p>Rust and Tauri run the desktop app. TypeScript and three.js bring Boltie to life.</p><a className="button button-secondary" href={repo}>View GitHub <Arrow diagonal /></a></Reveal><div className="stack-list"><span>Rust</span><span>Tauri 2</span><span>TypeScript</span><span>three.js</span></div></div></section>;
}

function FinalDownload() {
  return <section className="section download-section" id="download"><div className="wrap download-grid"><div className="download-copy"><h2>Put the little robot on your desktop.</h2><p>Free and open source for Windows and macOS.</p><div className="download-actions"><DownloadButton /><MacDownloadButton /></div></div><div className="build-list">{downloads.map((download) => <a key={download.platform} href={download.href}><span>{download.label}</span><small>{download.note}</small><Arrow diagonal /></a>)}<a href={releases}><span>All releases</span><small>Release notes and previous builds</small><Arrow diagonal /></a></div><p className="unsigned-note"><strong>Not signed yet:</strong> on Windows click More info &gt; Run anyway. On macOS, if it says the app can’t be checked, allow it in System Settings &gt; Privacy &amp; Security.</p></div></section>;
}

function Footer({ paused, reduced, onPause }: { paused: boolean; reduced: boolean; onPause: () => void }) {
  return <footer className="footer"><div className="wrap footer-grid"><a href="#top" className="brand-link" aria-label="Back to top"><Brand /></a><p>A small robot for the chores around your work.</p><nav aria-label="Footer navigation"><a href={repo}>GitHub</a><a href={`${repo}/blob/main/LICENSE`}>MIT licence</a></nav><div className="footer-bottom"><span>Not affiliated with Anthropic.</span><button className="motion-toggle" type="button" aria-pressed={paused} disabled={reduced} onClick={onPause}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{reduced ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"}</button></div></div></footer>;
}

export function Landing() {
  const preference = useReducedMotion(); const [mounted, setMounted] = useState(false); const [paused, setPaused] = useState(false); const [compact, setCompact] = useState(false);
  useEffect(() => { setMounted(true); const query = window.matchMedia("(max-width: 760px)"); const update = () => setCompact(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  const reduced = mounted && !!preference; const still = reduced || paused;
  return <MotionConfig reducedMotion="user"><Header /><RobotStage paused={paused} reduced={reduced} downloadHref={releases} /><main id="main"><Hero still={still} paused={paused} reduced={reduced} onPause={() => setPaused((value) => !value)} /><HowItWorks still={still} compact={compact} /><Features /><Safety /><ClaudeSection /><DesktopLife still={still} /><OpenSource /><FinalDownload /></main><Footer paused={paused} reduced={reduced} onPause={() => setPaused((value) => !value)} /></MotionConfig>;
}
