Kind: software — a single-page marketing site for the Boltie desktop assistant.

Design: client graphite/charcoal and Boltie yellow, Bricolage Grotesque / Manrope / DM Mono (bundled with Fontsource), real bolt SVG and the existing robot geometry. Bold left-aligned hero, generous spacing and restrained borders; no generated art, customer claims or extra pages.

Voice: warm, direct and specific. Talk about everyday computer chores; show actual supported capabilities. The approval interaction is explicitly a preview and never runs commands.

- Hero: one screen on desktop, compact natural flow on mobile. Large category-focused introduction, download and workflow links, actual round robot, desktop request card.
- Workflow: a two-screen sticky desktop sequence connects asking, reviewing a command and seeing a result. Three buttons and the preview work independently of scrolling. Mobile uses manual controls.
- Possibilities: keyboard-operable vertical tabs for projects, developer tools and scaffolding. Each changes the command preview.
- Control: explain read/change/forbidden policy and the two supported Claude connections.
- Footer: repeat the download action, source/license links and motion preference control.

Motion: use the user-requested Motion React skill for spring-smoothed native scroll parallax, entrance and state changes. CSS handles hover/press. The previous kit runtime is no longer loaded because its imperative DOM mutations competed with React. Kit assets remain untouched. User-requested parallax and the Motion runtime supersede the taste skill's fixed animation recipes.

Robot: ResizeObserver updates an aspect-correct orthographic camera. The face only redraws when its gaze changes, damping uses elapsed time, rendering pauses offscreen and when the tab is hidden. One WebGL context. Pause controls and system reduced-motion support are provided.

Checks: static Next.js production build, workspace TypeScript, cargo workspace tests, headless skill screenshots at desktop/tablet/mobile, responsive consistency and performance checks. Capture actual output rather than claiming visual validation from compilation.
