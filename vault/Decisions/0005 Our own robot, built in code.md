# 0005 Our own robot, built in code

status: accepted, replaces the first try with RobotExpressive
date: 2026-11-18

why we had to decide
- first version used three.js's RobotExpressive (CC0, Quaternius). it worked but didn't look like what we want, the yellow walker felt like a game asset
- the bots people liked (S-Bot, Michi Bot, Little Bot Bunny, PS4 AR Bot, Boogie Bot) mostly can't ship in an MIT repo, see [[Robot model]]
- the look we're after (Grok Bot style) is "simple shapes and expressive eyes", not one specific model

what we picked
- Boltie is drawn from primitives in `robot.ts`: glossy white shell, black glass visor, yellow ear nubs, antenna with a bulb, floating hands, a jet glow underneath
- eyes are painted on a canvas texture on the visor, so every expression is a few lines of code (pill, wide, happy arcs, flat, closed)
- he's round, so he flies. hover, drift up and down, bank into turns, no legs
- motion and colours copied from poupou's state table: idle yellow, thinking violet, working blue, asking amber, done green, error red

what we gave up
- hand-made animation clips. everything is procedural, which is more code but also means no clip names to keep in sync
- the "cute robot" by victory_ (CC BY 4.0) was the best licensed match. it can come back through custom avatars later, user has to download it from Sketchfab themselves
