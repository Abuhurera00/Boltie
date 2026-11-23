Second pass on the Boltie landing page in `apps/web`. The first version had good parts, but overall it looks vibe coded:
- glows everywhere
- parallax for its own sake
- generic sections
- a product mock that doesn't match the real app

This pass should make it read like a proper SaaS product page, in the vein of Linear, Raycast, Warp or Arc:
- calm
- precise
- one strong idea per section
- real product UI as the hero of every section

Keep what works:
- the stack
- the dark theme
- the bundled fonts
- `app/downloads.ts` and the download buttons
- the reduced-motion handling

Only work in `apps/web`. Don't edit `apps/desktop`, `crates/` or anything else; read them for reference only.

## 1. What Boltie is (for the copy)

Free, open-source (MIT) desktop app for Windows and macOS. A small round 3D robot flies around your desktop. You press `Ctrl+Shift+Space` (`Cmd+Shift+Space` on Mac) or click him, then type a chore in plain words:
- "open my-app in VS Code"
- "start a Postgres container for local dev"
- "what's running on port 3000?"

He does it through Claude. Anything that changes your machine shows you the exact command first and waits for Allow or Deny. Some commands he refuses outright.

- **Brains:**
  - your Claude Code login (no key needed)
  - or an Anthropic API key, kept in the OS keychain
  - Boltie never reads Claude Code's credential files
- **Tools:**
  - find a folder
  - open a project in your editor
  - launch an app
  - run a command (asks only if it changes something)
  - start a Docker container (asks)
  - scaffold Next.js, Vite, Rust or Python projects (asks)
  - hand a coding job to Claude Code (asks)
- **Skills:** small markdown files with steps, like a "morning setup".
- **Desktop behaviour:**
  - flies between monitors
  - drag him anywhere
  - pin him to one screen
  - lives in the tray or menu bar
  - right-click menu: Talk, Settings, Screen, Fly back down, Hide, Quit

Honesty rules:
- no Linux build
- builds aren't signed yet
- no pricing, no accounts
- no fake testimonials, logos, user counts or "trusted by"

Generic examples only. Never use real people's project names.

## 2. The product UI must match the real app exactly

This is the main problem with the current page. Every mock of the app has to look and behave like the real one. Copy the styles from `apps/desktop/src/style.css`, the markup from `apps/desktop/index.html`, and the behaviour from `apps/desktop/src/dock.ts`. Put them in a shared component (for example `app/components/product/Card.tsx`) and use it everywhere. Don't invent a different-looking card.

**The card (the "dock")**
- 400px wide, `#141518` background, 1px border `rgba(255,255,255,.035)`, 20px radius, system UI font at 13px.
- It sits just under or next to the robot, like a speech bubble anchored to him. It never floats on its own.
- A coloured "wash" is a radial gradient rising from the bottom edge: `radial-gradient(300px 260px at 50% 135%, var(--wash), transparent 70%)`.
- The wash colour per state:
  - chat `rgba(99,102,241,.5)`
  - working `rgba(59,158,255,.4)`
  - approval `rgba(245,165,36,.42)`
  - danger `rgba(244,80,94,.55)`
  - done `rgba(52,211,153,.5)`
- It opens with a `scale(.9) translateY(10px)` to `1` pop, `0.42s cubic-bezier(.3,1.2,.4,1)`, and closes with `0.34s cubic-bezier(.45,0,.2,1)`.

**Chat view**
- The user's line, then Boltie's reply in `#b0b5be`.
- While working: three 5px typing dots plus a step label that shimmers (a grey-to-white gradient sweep, 2.2s), like "Run docker ps" or "Find my-app".
- At the bottom, a chat bar with a new-chat icon, the input, a settings gear and a round send button.

**Approval view (the permission card)**
- Top row:
  - an 8px dot (amber `#ffc83d` for Boltie, `#d97757` when the request comes from Claude Code)
  - the name in bold, then dim text "needs permission"
  - on the right, an uppercase pill: "MAKES CHANGES" (amber on an amber 16% tint) or "DESTRUCTIVE" (`#ff8d97` on a red tint)
- Title, for example "Start a Docker container".
- The exact command in a mono code block: 12px, `rgba(255,255,255,.07)` background, 10px radius.
- A dim "in ~/projects/my-app" line for the working directory.
- Buttons on the right:
  - `Deny  N` (secondary)
  - `Allow  Y` (white pill, primary)
- When the action is destructive, the `Y` hint is hidden because it needs a real click, and the wash turns red.

**Robot moods.** These come from the `LOOKS` table in `apps/desktop/src/robot.ts`. Use them so the robot and the card always agree:
- idle `#ffd45e`
- listening `#ffd45e` (happy eyes)
- thinking `#a78bfa`
- working `#3b9eff`
- asking `#f5a524` (wide eyes)
- happy `#34d399`
- sad `#f4505e`
- sleeping `#94a2b8`

**Real flow, which the demos must follow in this order:**
1. idle robot
2. the user presses the hotkey or clicks him; the card opens under him, the robot is in listening mood, the chat wash is showing
3. the user types
4. thinking, then working, with typing dots and the shimmering step label
5. if needed, the card switches to approval and the robot turns amber; on Allow it goes back to working
6. done: green wash, the reply, the robot happy; the card closes on its own after a moment

Demos are visual only. They never run anything.

**Show it on a desktop.** In the hero and the "how it works" section, show the card and robot sitting on a believable desktop:
- a dimmed wallpaper
- one or two app windows behind (an editor and a terminal)
- the taskbar or menu bar along the edge

That's the real context: Boltie floats over your other apps. Draw it in HTML/CSS, not screenshots.

## 3. Robot as the logo

Drop the bolt icon. The logo is Boltie himself.
- Draw a clean flat SVG mark: the round shell, the dark visor, two pill-shaped glowing eyes in idle yellow `#ffd45e`, and a small jet glow under him.
- It must read at 16px (favicon) and at 32 to 40px (header).
- The wordmark is "boltie" next to it.
- Save it as `public/boltie-mark.svg` and regenerate `favicon.svg`, plus the apple-touch icon and `share.png` (1200×630: mark, name and the one-line pitch).
- Delete `bolt-logo.svg` and update every reference to it.
- Optional: the header mark blinks every few seconds and its eyes glance toward the cursor. Keep it subtle.

## 4. The flying robot, and the user can drag him

Keep the idea: the live 3D robot (ported from `apps/desktop/src/robot.ts`, the same look) flies down the page with scroll and reacts to each section. Rebuild it so it feels like the real app instead of a decoration.

**Flight**
- One fixed transparent three.js canvas for the whole page, with `pointer-events: none` except on the robot's own hit area.
- Waypoints per section: position, scale and mood. Move through them with a spring-smoothed curve tied to scroll.
- He banks toward the direction of travel and hovers with a gentle bob when scrolling stops.
- His eyes follow the cursor.
- He never sits on body text or buttons. Check at 375, 768, 1280, 1440 and 1920.
- Section moods follow the real flow: listening in the hero, thinking/working in the demo, asking at the approval card, sad at refused commands, happy at download.

**Dragging (new)**
- On desktop, the user can grab him with the pointer. The cursor becomes `grab`, then `grabbing`.
- While held he follows the pointer with a spring, tilts with the drag velocity, and his eyes go wide.
- On release he stays where he was dropped, hovering. He stays there until the user scrolls past that section, then he flies back onto the path smoothly.
- A click without dragging (under 5px of movement) makes him wave and briefly opens a small real-style card next to him saying "Hi, I'm Boltie. Download me to put me on your desktop." with a Download button.
- Touch: long-press to drag. Normal touch scrolling must never get trapped.
- Show a small hint "drag me" the first time he's on screen. Remember it was seen in `localStorage`, wrapped in try/catch.
- With reduced motion: no scroll flight. He sits in the hero, can still be dragged, and doesn't animate the drag.

## 5. Video

There's a launch film at `video/Boltie_Launch_Film.mp4`, at the repo root. It's 127 MB, which is too big to ship and over GitHub's 100 MB file limit. `video/*.mp4` is gitignored; never commit it.
- Check it with `ffprobe`. Encode web copies with `ffmpeg` into `apps/web/public/video/`:
  - `boltie-film.mp4`: H.264, 1080p, about 2.5 to 4 Mbps, `+faststart`, AAC audio
  - `boltie-film.webm`: VP9, the same size
  - `boltie-film-poster.jpg`: a strong frame, under 200 KB
  - `boltie-loop.mp4`: a short muted loop of 6 to 10 seconds, the best moment, 720p, under 2 MB, no audio
- Aim for each file to be under 25 MB. If ffmpeg isn't installed, stop and tell me rather than shipping the raw file.
- Placement:
  - right after the hero, a "Watch Boltie work" section with a large 16:9 frame (rounded 20px, hairline border, the same card language)
  - it shows the poster and a play button; clicking plays the full film with sound and controls
  - load it with `preload="none"`
  - the muted `boltie-loop.mp4` can play inside the hero's desktop mock or behind the play button as a teaser, but only when it's on screen and only without reduced motion
- The hero text and download button must not wait for any video.

## 6. Make it not look vibe coded

These are hard rules:
- **Layout:**
  - one 12-column grid, max content width 1200px
  - one spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128)
  - every section uses the same container and vertical rhythm (120 to 160px between sections on desktop)
- **Type:**
  - one display font for headings and one text font for body; mono only for commands and key hints
  - a fixed type scale
  - headings are short, at most two lines
  - no gradient text, except the real step-label shimmer inside the card
- **Colour:**
  - near-black background
  - the robot's mood colours are the only accents, and each section uses at most one
  - no rainbow gradients, no neon outlines, no random blurred blobs
- **Parallax:**
  - restrained: two or three depth layers at most, only in the hero and the desktop-mock sections
  - layers move 40px or less
  - text never parallaxes
  - the desktop mock can tilt slightly (a few degrees of `rotateX`) and settle flat as it scrolls into view
- **Motion:**
  - each section gets one entrance: a fade with a 12 to 20px rise, 0.5 to 0.7s, small stagger
  - no letter-by-letter scrambles, no marquees, no cursor spotlights, no counters
  - the real UI animations (the card pop, the wash colour change, typing dots, shimmer) carry the motion story
- Remove the unused template kit in `public/assets/` (backgrounds, moments, motion, ui, `system.*`) unless something still imports it. Check before deleting.
- **Icons:** one consistent set (simple 1.5px strokes); no emoji.
- **Copy:**
  - short and concrete, in a builder's voice
  - no "supercharge", "seamless", "revolutionize", "AI-powered", "unlock"
  - every section heading says what the user gets

## 7. Page structure

1. **Header (sticky, slim):**
   - mark and wordmark
   - links: Features, Safety, Download, GitHub
   - a small "Download" pill on the right
   - it gets a hairline border and blur only after scrolling
2. **Hero:**
   - left side:
     - eyebrow "Open source · Windows & macOS"
     - headline (for example "A little robot that does your computer chores.")
     - one-line subhead
     - the primary download button (OS-detected) and a "Watch the film" secondary
     - the hotkey hint drawn as key caps
   - right side, or below on mobile: the desktop mock with the live robot and a real card playing the flow from section 2 on loop (request, working, approval, done)
3. **Film:** "Watch Boltie work", the video frame.
4. **How it works:**
   - three steps (Ask, Approve, Done) in one pinned section
   - as the user scrolls, the single desktop mock steps through the states with the matching card view and robot mood
   - the step list on the left highlights in sync
   - the pinned section is no longer than about 250vh
5. **What he can do:** a 3×2 grid of tool cards. Each has a stroke icon, the name, an example request in mono, and an "asks first" or "runs right away" tag that matches the README table.
6. **You stay in control (safety):**
   - a large real approval card, with a toggle between the "makes changes" and "destructive" versions (the red wash, the `Y` hint hidden)
   - next to it, three short points:
     - the exact command is shown before anything runs
     - some commands are never run (for example deleting a drive root, or piping a script from the internet into a shell)
     - your key stays in the OS keychain
7. **Bring your own Claude:** two cards side by side, Claude Code login and Anthropic API key, each with a one-line setup.
8. **Lives on your desktop:** a small bento of three or four tiles:
   - multi-monitor (two screen outlines with the robot flying across)
   - drag him anywhere
   - pin to a screen
   - skills as markdown (a tiny `.md` snippet)
9. **Open source:** a short block covering the MIT licence, Rust + Tauri + TypeScript + three.js, and a link to GitHub. No star counts, since we can't fetch them reliably on a static site.
10. **Final CTA:**
   - the robot lands here, happy
   - big download button plus the list of all builds from `downloads.ts`
   - the unsigned-build note: "Not signed yet: on Windows click More info > Run anyway. On macOS, if it says the app can't be checked, allow it in System Settings > Privacy & Security."
11. **Footer:** mark, short line, GitHub, MIT licence, "Not affiliated with Anthropic", and the pause-motion toggle.

## 8. Technical

- Next.js app router as a single page, static only (no API routes, no server actions), deployed on Vercel with Root Directory `apps/web`.
- Use `motion/react` with motion values for scroll work. Never `setState` per frame.
- Animate only `transform` and `opacity`.
- One WebGL context. Cap the pixel ratio at 2. Pause when the tab is hidden or the canvas is fully off screen.
- Lighthouse on desktop: Performance 90+, Accessibility 95+. The hero LCP is the headline text, not the canvas or the video.
- Semantic landmarks, visible focus rings, AA contrast, `alt` text, and the video has an accessible label and native controls.
- With `prefers-reduced-motion`: no parallax, no scroll flight, no autoplay loop, and the demos show static final states. Keep the pause-motion toggle.
- Don't change the URLs or file names in `app/downloads.ts`.
- Update the metadata in `app/layout.tsx`: title "Boltie: a little robot for your computer chores", a description, Open Graph and Twitter cards using the new `share.png`, and `theme-color`.

## Done means

- `pnpm --filter @boltie/web build` and `pnpm --filter @boltie/web typecheck` pass.
- You checked it in a real browser at 375, 768, 1280 and 1920 widths, with and without reduced motion:
  - the robot never covers text or buttons
  - drag works with the mouse, and with touch via long-press
  - no horizontal scroll
  - the video plays
- The cards on the page are visually the same as the real app's card. Compare them against `apps/desktop/src/style.css` side by side.
- No file in `public/` is over 25 MB, and the raw film is not committed.
- Reply with a short list of what you changed, what you deleted, and anything you couldn't do.
