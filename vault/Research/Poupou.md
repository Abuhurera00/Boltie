# Poupou

our own earlier project, `D:\poupou`, github.com/abuhurera00/poupou. Electron notch companion: a little ghost at the top of the screen that follows Claude Code sessions and approves permission requests.

what we took for Boltie
- cards: flat `#141518`, hairline border, 20px radius, no blur
- the "wash": radial glow rising from the bottom edge of the card, colour per state (indigo chat, amber permission, red danger, green done)
- conversation: user text in a `rgba(255,255,255,.13)` bubble, assistant text plain grey with no bubble, typing dots plus a shimmering step label ("Run · docker ps")
- permission card: who-row with a dot, mono command line, pill buttons, white primary Allow, translucent Deny, small key hints
- state colours and the eye/glow behaviour: eyes follow the cursor with `tanh(dx/260)`, blinks every 2.2-5.4 s with a 22% double blink, easing with `1 - base^dt`
- the sounds. they're generated from sine waves by poupou's `scripts/gen-sounds.mjs` (MIT), copied into `apps/desktop/public/sounds`

what we did differently
- poupou's Y/N hints don't do anything. ours work, except Y never approves a destructive action
- we show the working folder under the command
- poupou hides itself from screen capture, so screenshots of it come out empty
