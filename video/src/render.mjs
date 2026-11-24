import { chromium } from 'playwright'; import fs from 'fs'; import { spawn } from 'child_process'; import { serve } from './server.mjs';
const FPS = 60; const chunks = process.argv.slice(2).map(Number); // bar indices 0..11
const srv = await serve(9000 + Math.floor(Math.random() * 900)); const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(`http://localhost:${port}/film.html`); await pg.evaluate(() => window.ready);
fs.mkdirSync('chunks', { recursive: true });
for (const c of chunks) {
  const tmp = `chunks/c${String(c).padStart(2, '0')}.part.mp4`, fin = tmp.replace('.part', '');
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = c * 2 * FPS; f < (c + 1) * 2 * FPS; f++) {
    const url = await pg.evaluate(t => window.grab(t, 0.95), f / FPS);
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); const code = await new Promise(r => ff.on('close', r));
  if (code === 0) fs.renameSync(tmp, fin);
  console.log(`chunk ${c} done in ${((Date.now() - t0) / 1000).toFixed(0)}s code ${code}`);
}
await b.close(); srv.close();
