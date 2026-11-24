GATE: ERROR (consistency.mjs could not walk 1440, 390; check.mjs could not run (exit 2: check: timed out))

This is the existing aggregate gate result from the previous sandboxed run, not a pass for the redesign. The skill says not to rerun an errored gate. This redesign was checked with the standalone headless scripts outside the sandbox instead.

# Landing page review - 2026-11-18

Implemented one Next.js landing page using the installed Motion and design-taste-frontend guidance. The requested Motion runtime and custom parallax replace the old template runtime; kit files were not modified. No formal waivers were added.

Design: warm charcoal with the actual Boltie yellow, locally bundled Bricolage Grotesque / Manrope / DM Mono, real bolt logo and the existing robot geometry. Hero, sticky workflow, interactive task previews, command policy and final download CTA. Copy is conversational and specific to supported desktop tasks. No generated art, stock photography, invented testimonials or extra pages.

## Verified

- Next.js production static export: passed; only the landing route plus the framework not-found route.
- Workspace TypeScript: both web and desktop passed.
- cargo test --workspace: all 41 tests passed.
- Browser screenshots inspected at 1440, 1024, 768 and 390 pixels. The robot stays round across aspect ratios.
- Reduced-motion screenshot repeated after fixing the hydration mismatch: no reported browser exception. The mobile workflow remains usable without scroll animation.
- Copy lint: zero failures. Two warnings retained: numbered eyebrow labels help scan sections; the footer names the actual implementation stack rather than making a marketing claim.
- Performance smoke check at 1440 and 390: zero broken requests, one WebGL context, 422 KiB total transferred, about 80 KiB of local fonts, layout shift 0.001 / 0.000. One-run CPU measurements are diagnostic, not field or real-GPU benchmarks.

## Limits and remaining findings

- The Three.js / React / Motion bundle is 1,154 KiB parsed (322 KiB compressed JavaScript), above the skill budget. The live original 3D robot is retained as requested. Its rendering pauses offscreen, on a hidden tab and via the pause control.
- The standalone consistency pass was not clean. Its earlier output contained 92 failures and 35 warnings across five widths, including template-specific constraints and actual contrast/focus findings. Contrast, instant keyboard scrolling, mobile heading hierarchy, the hero right edge, shader-error fallback and reduced-motion hydration were subsequently corrected. The entire consistency suite was not rerun after those corrections.
- Template-specific findings include prescribed CSS/JS module names, custom UI not recognized as a visual, fixed full-screen section heights, decorative layer bounds, vertical tabs treated as wrapping horizontal tabs, and the explicitly requested sticky/parallax scene. These are not represented as passing checks.
- The shader lint flags Three.js shader types and include directives as identifiers. The bot rendered in the inspected headless screenshots; this does not prove compatibility with every GPU.
- The public production domain is still unspecified; metadataBase retains the existing boltie.example placeholder. Download/source links point to the existing GitHub repository.
- No account, paid Motion capability, form backend, generated asset, assumed customer evidence or deployment was added.

## Evidence

- shots/final-1440.png
- shots/final-1024.png
- shots/final-768.png
- shots/final-reduced-390.png
- shots/performance.json
- shots/consistency.txt and shots/checks/report.json (earlier consistency pass)

## Original consistency findings

The following records preserve the check output before the final fixes; they are not a claim that every item remains present.

### 1440px

- FAIL shader-lint: chunks/0x2yxg9qmntml.js - a shader uses "common" as a name (line 7: #include <common>): GLSL ES reserves it, so a strict GPU rejects the whole shader and the picture stays empty
- FAIL shader-lint: chunks/0x2yxg9qmntml.js - a shader uses "sampler3D" as a name (line 2: uniform highp sampler3D probesSH[ NUM_LIGHT_PROBE_GRIDS ];): GLSL ES reserves it, so a strict GPU rejects the whole shader and the picture stays empty
- FAIL shader-lint: chunks/0x2yxg9qmntml.js - a shader uses "sampler2DShadow" as a name (line 11: uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];): GLSL ES reserves it, so a strict GPU rejects the whole shader and the picture stays empty
- FAIL spill: div.hero-art > div.hero-robot > div.robot-visual > canvas - runs 25px past the top edge of the panel it sits on (section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop)
- FAIL spill: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - runs 99px past the bottom edge of the panel it sits on (div.hero-art > div.hero-robot > div.robot-visual > canvas)
- FAIL pinned: section#workflow > div.workflow-sticky - held on screen for 1 screen of scroll (position: sticky) while the page moves on
- FAIL no-visual: section#workflow - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#possibilities - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#control - no picture, effect or mock in this section; a feature section needs a visual
- FAIL cta: section#control - the last section before the footer ends with no button
- FAIL copy-headline: h1#hero-title - "Small robot. Big help." does not name what is sold (desktop assistant, desktop, assistant, from flags); only the line under it does
- FAIL copy-headings: h2#possibilities-title - "For the work around your work." names no product, part, place or section (6 headings like it; at most one brand line per page) (and 5 more like it: "Get your tools moving.", "Go from blank to buildin", "A look around, without a", "A change needs your say.", ...)
- FAIL off-grid: div.wrap > div.section-heading > div > p.eyebrow.section-eyebrow - left edge at 122.5px, 17.5px off a common edge of its section at 105px (6 elements)
- FAIL right-edge: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - its right edge runs 13px past the content's right edge (1360px, where 3 boxes end)
- FAIL text-contrast: div.wrap.hero-layout > div.hero-copy > div > p.hero-note - a caption, label or muted line in #777b70 on #11120f reads 4.34:1 (needs 4.5:1)
- FAIL text-contrast: div.workflow-copy > div.workflow-steps > button.workflow-step:nth-of-type(2) > span.step-number - a caption, label or muted line in #64685e on #191b16 reads 3.04:1 (needs 4.5:1); 2 like it, like "03"
- FAIL motion-layer: html[data-motion] - the page marks <html data-motion> but motion.css is not loaded: buttons, links, cards and photos answer nothing on hover
- FAIL empty-area: section#workflow - 62% of the section is empty: 1008px above its first content, 112px under its last (button.workflow-step:nth-of-type(3)), 1% beside content that covers under half the container, in its 1800px of rows (WARN over 35%, FAIL over 50%)
- FAIL focus-visible: div.wrap.workflow-layout > div.workflow-copy:nth-of-type(1) > div.workflow-steps > button.workflow-step:nth-of-type(1) - Tab stop 11, button "01 Ask in your own words. Open a project. Check a ": the focus lands on something you cannot see
- FAIL focus-visible: button#task-0 - Tab stop 15, button "THE DAILY SETUP Pick up where you left off. Open y": the focus lands on something you cannot see
- FAIL focus-visible: div#task-preview - Tab stop 16, div "THE DAILY SETUPPick up where you left off.Open you": the focus lands on something you cannot see
- FAIL focus-visible: div.wrap > div.control-layout:nth-of-type(2) > div.brain-card:nth-of-type(2) > a.text-link - Tab stop 17, a "Read about the setup": the focus lands on something you cannot see
- WARN nav: header.site-header > div.wrap.header-inner > a.header-source - the nav is lopsided: its last item ends 18px inside the content's edge (1360px), while its first starts on the other edge
- WARN copy-headings: button#task-0 > h3 - the card title "Pick up where you left off." names no product, part, place or section (2 card titles like it) (and 1 more like it: "Your Claude. Your choice")
- WARN copy-actions: (the page) - the main action "Get Boltie for Windows" does not read word for word the same in the closing section
- WARN col-edge: section#workflow > div.workflow-sticky > div.wrap.workflow-layout > div.demo-stage - the second column starts at 4 places: 706px (section#workflow), 729px (section#possibilities), 740px (section#top), 829px (section#control)
- WARN section-gaps: section#workflow / section#possibilities - 248px between these sections, +27% against the median 196px
- WARN nav-labels: header.site-header > div.wrap.header-inner > nav.desktop-nav > a:nth-of-type(3) - "Your control" opens a section headed "Helpful by nature. Careful by design."
- WARN tab-wrap: button#task-2 - the row of 3 tabs wraps onto 3 lines and leaves "THE NEXT IDEA Go from blank to" alone on the last
- WARN copy-length: section#control - 2 sections over 90 words a screen outside the UI mocks ("Helpful by nature. Caref" 122, "For the work around your" 116); 90 words a screen across the page (448 words in 5 screens): a tech page says it in about 80 or fewer
- WARN visual-caption: section#top > div.wrap.hero-layout > div.hero-bottom > span.shortcut-hint - a muted 10px line of 2 rows sits 2px under the canvas: it reads as a caption: "A little help, one shortcut away. Ctrl S..."; no caption or description under any image, render or visual (house rule)
- WARN visual-caption: div.hero-art > div.hero-task > div.task-top > strong - a small 12px line is laid over the lower half of the canvas: "A little help?"; no caption or description under any image, render or visual (house rule)
- WARN visual-caption: div.wrap.hero-layout > div.hero-art > div.hero-task > p - a small 15px line is laid over the lower half of the canvas: "Open my project in VS Code"; no caption or description under any image, render or visual (house rule)
- WARN hero-enter: section#top - the hero does not enter on load: no head line setting html.m-enter (motion.md, The hero's entrance)
- WARN moment-none: (the page) - a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)
- FAIL gl-fallback: div.wrap.hero-layout > div.hero-art > div.hero-robot > div.robot-visual - with its shader rejected (as a strict GPU rejects a reserved word) the WebGL picture shows only the ground its stylesheet gives it (the same pixels with the canvas taken away): it needs a still fallback picture, not a bare gradient
- FAIL section-height: footer.footer - the section is 746px tall (0.8 screens), 154px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)
- FAIL section-height: section#possibilities - the section is 933px tall (1 screens), 33px over one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)
- FAIL section-height: section#control - the section starts at 3633px, 33px below the screen grid (4 x 900px): sections start on whole screens (SR-2)
- FAIL section-height: footer.footer - the section starts at 4533px, 33px below the screen grid (5 x 900px): sections start on whole screens (SR-2)
- FAIL section-height: footer.footer - the section's content does not fit it: its lowest content ends 734px below its top, past 674px (the section less 72px of bottom padding) (SR-2)
- FAIL section-air: section#workflow / section#possibilities - 1126px of air between the content of these two sections: 128-480px (64-600px WARN) (SR-3)
- FAIL section-air: section#workflow - the content fills 35.5% of the section's height (640 of 1800px): 55% or more (40% WARN) (SR-3)
- FAIL one-section: section#control - the screen at scroll 4379px (the top of section 5) shows 154px of section 4 beside section 5: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)
- FAIL one-section: section#possibilities - the screen at scroll 3600px (stride 4) shows 33px of section 3 beside section 4: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)
- FAIL container-edges: header.site-header - the nav's first box starts at 12px and its last ends at 1360px, not on its .wrap at 80-1360px (SR-6)
- FAIL container-edges: header.site-header - a <header> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)
- FAIL container-edges: footer.footer - a <footer> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (and 3 more like it: "MEET YOUR DESKTOP SIDEKI", "01 / A SHORTER WAY TO DO", "01 / A SHORTER WAY TO DO") (SR-6)
- FAIL container-edges: header.site-header > div.wrap.header-inner > a.skip-link - a box runs 12-164px, outside the container lines of the nav at 80-1360px: full width is for background layers and grounds only (SR-6)
- FAIL container-edges: section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop - a box runs 716-1410px, outside the container lines of section 1 at 80-1360px: full width is for background layers and grounds only (and 4 more like it: div.wrap.hero-layout > div.hero-art > div.stage-backdrop > div.stage-grid, "Skip to content", "A little help?↵Open my p") (SR-6)
- FAIL container-edges: footer.footer > div.wrap > div.footer-top > p:nth-of-type(2) - 1 text block starts on a left line at x 626, 546px from the container's left: text starts on the container's left, or on one split line (x 623, 732, 841) (SR-6)
- FAIL container-edges: footer.footer > div.wrap > div.footer-top > p.eyebrow - 1 text block starts on a left line at x 578, 498px from the container's left: text starts on the container's left, or on one split line (x 623, 732, 841) (and 5 more like it: x 365, "Make room forBoltie.", x 154) (SR-6)
- FAIL container-edges: footer.footer > div.wrap > div.footer-top > p.eyebrow - "A LITTLE COMPANY FOR YOUR COMPUT" is set centred across 1280px, over half the 1280px container: text that wide is set left (and 2 more like it: "Make room forBoltie.", "Windows first. macOS and") (SR-6)
- FAIL split-pair: section#top > div.wrap.hero-layout - the two columns of the split start 39px apart at the top: a split's columns are top-aligned, 8px either way (SR-8)
- FAIL split-pair: section#control > div.wrap > div.control-layout - the two columns of the split start 16px apart at the top (centred on each other): a split's columns are top-aligned, 8px either way (SR-8)
- WARN split-pair: section#workflow > div.workflow-sticky > div.wrap.workflow-layout - the two columns of the split start 75px apart at the top: a split's columns are top-aligned, 8px either way (it sits in a part held on screen as the page scrolls: told as a WARN) (SR-8)
- FAIL split-pair: section#control > div.wrap > div.control-layout - the split's columns are off the page's one pair of lines: its right column starts at x 829, the first split's at 740; its right column starts at x 829, on none of the split lines 623 (k=5), 732 (k=6), 841 (k=7) (SR-8)
- FAIL split-pair: section#top > div.wrap.hero-layout - the split's columns are off the page's one pair of lines: its right column starts at x 740, on none of the split lines 623 (k=5), 732 (k=6), 841 (k=7) (SR-8)
- WARN split-pair: section#workflow > div.workflow-sticky > div.wrap.workflow-layout - the split's columns are off the page's one pair of lines: its right column starts at x 706, the first split's at 740; its right column starts at x 706, on none of the split lines 623 (k=5), 732 (k=6), 841 (k=7) (it sits in a part held on screen as the page scrolls: told as a WARN) (SR-8)

### 1024px

- FAIL spill: div.hero-art > div.hero-robot > div.robot-visual > canvas - runs 16px past the top edge of the panel it sits on (section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop)
- FAIL spill: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - runs 97px past the bottom edge of the panel it sits on (div.hero-art > div.hero-robot > div.robot-visual > canvas)
- FAIL pinned: section#workflow > div.workflow-sticky - held on screen for 1 screen of scroll (position: sticky) while the page moves on
- FAIL no-visual: section#workflow - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#possibilities - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#control - no picture, effect or mock in this section; a feature section needs a visual
- FAIL cta: section#control - the last section before the footer ends with no button
- FAIL off-grid: button#task-1 - left edge at 55px, 19px off the page margin at 36px (15 elements, like button#task-0); 5 more in this section off the grid too (h3 at 55px, p at 55px, button#task-2 at 55px, h3 at 55px, ...)
- FAIL text-contrast: div.wrap.hero-layout > div.hero-copy > div > p.hero-note - a caption, label or muted line in #777b70 on #11120f reads 4.34:1 (needs 4.5:1)
- FAIL text-contrast: div.workflow-copy > div.workflow-steps > button.workflow-step:nth-of-type(2) > span.step-number - a caption, label or muted line in #64685e on #191b16 reads 3.04:1 (needs 4.5:1); 2 like it, like "03"
- FAIL empty-area: section#workflow - 61% of the section is empty: 832px above its first content, 80px under its last (button.workflow-step:nth-of-type(3)), 2% beside content that covers under half the container, in its 1536px of rows (WARN over 35%, FAIL over 50%)
- WARN nav: header.site-header > div.wrap.header-inner > a.header-source - the nav is lopsided: its last item ends 18px inside the content's edge (988px), while its first starts on the other edge
- WARN col-edge: section#workflow > div.workflow-sticky > div.wrap.workflow-layout > div.demo-stage - the second column starts at 4 places: 489px (section#workflow), 528px (section#top), 582px (section#control), 786px (section#possibilities)
- WARN tab-wrap: button#task-2 - the row of 3 tabs wraps onto 3 lines and leaves "THE NEXT IDEA Go from blank to" alone on the last
- WARN visual-caption: div.wrap.hero-layout > div.hero-art > div.hero-task > p - a small 15px line is laid over the lower half of the canvas: "Open my project in VS Code"; no caption or description under any image, render or visual (house rule)

### 768px

- FAIL spill: div.hero-art > div.hero-robot > div.robot-visual > canvas - runs 79px past the top edge of the panel it sits on (section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop)
- FAIL spill: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - runs 57px past the bottom edge of the panel it sits on (div.hero-art > div.hero-robot > div.robot-visual > canvas)
- FAIL pinned: section#workflow > div.workflow-sticky - held on screen for 1 screen of scroll (position: sticky) while the page moves on
- FAIL no-visual: section#workflow - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#possibilities - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#control - no picture, effect or mock in this section; a feature section needs a visual
- FAIL cta: section#control - the last section before the footer ends with no button
- FAIL off-grid: button#task-1 - left edge at 43px, 19px off the page margin at 24px (15 elements, like span); 5 more in this section off the grid too (h3 at 43px, p at 43px, button#task-2 at 43px, h3 at 43px, ...)
- FAIL off-grid: div.wrap > div.section-heading > div > p.eyebrow.section-eyebrow - left edge at 66.5px, 21.5px off a common edge of its section at 88px (6 elements)
- FAIL right-edge: section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop - its right edge runs 24px past the content's right edge (744px, where 3 boxes end) (and 1 more like it: "A little help? ↵ Open my")
- FAIL text-contrast: div.wrap.hero-layout > div.hero-copy > div > p.hero-note - a caption, label or muted line in #777b70 on #11120f reads 4.34:1 (needs 4.5:1)
- FAIL text-contrast: div.workflow-copy > div.workflow-steps > button.workflow-step:nth-of-type(2) > span.step-number - a caption, label or muted line in #64685e on #191b16 reads 3.04:1 (needs 4.5:1); 2 like it, like "03"
- FAIL empty-area: section#workflow - 71% of the section is empty: 1232px above its first content, 208px under its last (button.workflow-step:nth-of-type(3)), 1% beside content that covers under half the container, in its 2048px of rows (WARN over 35%, FAIL over 50%)
- WARN nav: header.site-header > div.wrap.header-inner > a.header-source - the nav is lopsided: its last item ends 13px inside the content's edge (744px), while its first starts on the other edge
- WARN off-grid: div.workflow-steps > button.workflow-step:nth-of-type(1) > span:nth-of-type(2) > strong - left edge at 48px, 24px off the page margin at 24px (15 elements); 5 more in this section off the grid too (span.step-description at 48px, strong at 48px, span.step-description at 48px, strong at 48px, ...) (inside a held section or scroll scene, whose motion --quick does not check)
- WARN tab-wrap: button#task-2 - the row of 3 tabs wraps onto 3 lines and leaves "THE NEXT IDEA Go from blank to" alone on the last

### 390px

- FAIL spill: div.hero-art > div.hero-robot > div.robot-visual > canvas - runs 20px past the top edge of the panel it sits on (section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop)
- FAIL spill: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - runs 40px past the bottom edge of the panel it sits on (div.hero-art > div.hero-robot > div.robot-visual > canvas)
- FAIL no-visual: section#workflow - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#possibilities - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#control - no picture, effect or mock in this section; a feature section needs a visual
- FAIL cta: section#control - the last section before the footer ends with no button
- FAIL heading-scale: div.wrap > div.control-layout > div.brain-card > h3 - an h3 at 45px, as large as the smallest h2 (40.6px) or larger
- FAIL heading-scale: div.wrap > div.control-layout > div.brain-card > h3 - h3 headings in 3 sizes, 22px ("A look around, without a") to 45px (x2.05)
- FAIL off-grid: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - left edge at 41px, 21px off the page margin at 20px (26 elements, like span)
- FAIL off-grid: div.workflow-sticky > div.wrap.workflow-layout > div.workflow-copy > p.eyebrow.section-eyebrow - left edge at 52px, 4px off a common edge of its section at 48px (6 elements, like strong)
- FAIL off-grid: button#task-1 - left edge at 39px, 19px off the page margin at 20px (26 elements, like button#task-0); 5 more in this section off the grid too (h3 at 39px, p at 39px, button#task-2 at 39px, h3 at 39px, ...)
- FAIL text-contrast: div.workflow-copy > div.workflow-steps > button.workflow-step:nth-of-type(2) > span.step-number - a caption, label or muted line in #64685e on #191b16 reads 3.04:1 (needs 4.5:1); 2 like it, like "03"
- WARN nav: header.site-header > div.wrap.header-inner > button.menu-toggle - the nav is lopsided: its last item ends 14px inside the content's edge (370px), while its first starts on the other edge
- WARN heading-scale: h2#workflow-title - h2 headings in 2 sizes, 40.6px ("For the work around your") to 46.8px (x1.15)
- WARN right-edge: div.hero-copy > div > div.hero-actions > a.button.button-primary - its right edge stops 20px short of the content's right edge (370px), which div.hero-task reaches
- WARN centre-axis: div.wrap.hero-layout > div.hero-copy > div > p.hero-note - centred text 10px left of the middle of its page (185px against 195px)
- WARN section-gaps: section#top / section#workflow - 104px between these sections, -27% against the median 142px
- WARN tab-wrap: button#task-2 - the row of 3 tabs wraps onto 3 lines and leaves "THE NEXT IDEA Go from blank to" alone on the last
- WARN visual-caption: div.wrap.hero-layout > div.hero-art > div.hero-task > p - a small 12px line is laid over the lower half of the canvas: "Open my project in VS Code"; no caption or description under any image, render or visual (house rule)
### 320px

- FAIL spill: div.hero-art > div.hero-robot > div.robot-visual > canvas - runs 34px past the bottom edge of the panel it sits on (section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop)
- FAIL spill: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - runs 15px past the bottom edge of the panel it sits on (section#top > div.wrap.hero-layout > div.hero-art > div.stage-backdrop)
- FAIL no-visual: section#workflow - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#possibilities - no picture, effect or mock in this section; a feature section needs a visual
- FAIL no-visual: section#control - no picture, effect or mock in this section; a feature section needs a visual
- FAIL cta: section#control - the last section before the footer ends with no button
- FAIL heading-scale: div.wrap > div.control-layout > div.brain-card > h3 - an h3 at 45px, as large as the smallest h2 (39px) or larger
- FAIL heading-scale: div.wrap > div.control-layout > div.brain-card > h3 - h3 headings in 3 sizes, 22px ("A look around, without a") to 45px (x2.05)
- FAIL off-grid: section#top > div.wrap.hero-layout > div.hero-art > div.hero-task - left edge at 37px, 17px off the page margin at 20px (26 elements, like span)
- FAIL off-grid: div.workflow-sticky > div.wrap.workflow-layout > div.workflow-copy > p.eyebrow.section-eyebrow - left edge at 52px, 4px off a common edge of its section at 48px (6 elements)
- FAIL off-grid: button#task-1 - left edge at 39px, 19px off the page margin at 20px (26 elements, like button#task-0); 5 more in this section off the grid too (h3 at 39px, p at 39px, button#task-2 at 39px, h3 at 39px, ...)
- FAIL text-contrast: div.workflow-copy > div.workflow-steps > button.workflow-step:nth-of-type(2) > span.step-number - a caption, label or muted line in #64685e on #191b16 reads 3.04:1 (needs 4.5:1); 2 like it, like "03"
- WARN nav: header.site-header > div.wrap.header-inner > button.menu-toggle - the nav is lopsided: its last item ends 14px inside the content's edge (300px), while its first starts on the other edge
- WARN heading-scale: h2#workflow-title - h2 headings in 2 sizes, 39px ("For the work around your") to 46px (x1.18)
- WARN section-gaps: section#top / section#workflow - 104px between these sections, -27% against the median 142px
- WARN orphan: div.policy-list > article:nth-of-type(2) > div > h3 - its last line holds only "say."
- WARN tab-wrap: button#task-2 - the row of 3 tabs wraps onto 3 lines and leaves "THE NEXT IDEA Go from blank to" alone on the last
- WARN visual-caption: div.wrap.hero-layout > div.hero-art > div.hero-task > p - a small 12px line is laid over the lower half of the canvas: "Open my project in VS Code"; no caption or description under any image, render or visual (house rule)
<!-- End of archived review output. -->
