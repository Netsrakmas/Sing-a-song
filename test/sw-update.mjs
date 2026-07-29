/* Regression test for the bug where a deploy never reached players.

   The service worker used to answer the document from its own cache without
   ever asking the network, and browsers only reinstall a worker when sw.js
   changes byte-for-byte — so shipping a new index.html changed nothing on a
   phone that had already visited once.

   This serves a throwaway copy of the app, lets the worker install and take
   control, then rewrites index.html on disk exactly as a deploy would and
   asserts the next visit shows the new build.

   Run: node test/sw-update.mjs      (starts its own server, no deps) */
import { createServer } from 'http';
import { readFile, mkdtemp, cp, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { chromium } from 'playwright';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

const dir = await mkdtemp(join(tmpdir(), 'sas-sw-'));
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'])
  await cp(f, join(dir, f));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript',
                '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const file = join(dir, path === '/' ? 'index.html' : path.slice(1));
  try {
    const body = await readFile(file);
    // no-store so the HTTP cache can never be mistaken for the worker's cache
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

const PREINSTALLED = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

console.log('\nService worker update path');

await page.goto(URL_);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
check('worker installs and takes control', true);

// offline still works — that is the whole point of keeping the worker
await ctx.setOffline(true);
await page.reload();
check('app still loads offline', await page.locator('#scr-home').isVisible());
await ctx.setOffline(false);

// now "deploy": rewrite index.html exactly as a push to main would
const html = await readFile(join(dir, 'index.html'), 'utf8');
await writeFile(join(dir, 'index.html'), html.replace('SING-A-SONG', 'NIEUWE-BUILD'));

await page.goto(URL_);
await page.waitForTimeout(400);
const logo = await page.locator('#scr-home h1.logo').innerText();
check('a new deploy reaches an already-visited phone', logo === 'NIEUWE-BUILD', `logo reads "${logo}"`);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
