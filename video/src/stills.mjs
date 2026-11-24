import { chromium } from 'playwright'; import fs from 'fs'; import { serve } from './server.mjs';
const times = process.argv.slice(2).map(Number);
const srv = await serve(8123 + Math.floor(Math.random()*500));
const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
pg.on('console', m => console.log('console:', m.text())); pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(`http://localhost:${port}/film.html`); await pg.evaluate(() => window.ready);
fs.mkdirSync('stills', { recursive: true });
for (const t of times) {
  const t0 = Date.now();
  const url = await pg.evaluate(t => window.grab(t), t);
  fs.writeFileSync(`stills/t${t.toFixed(2)}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(t, Date.now() - t0, 'ms');
}
await b.close(); srv.close();
