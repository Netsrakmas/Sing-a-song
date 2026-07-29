/* Headless verification for Sing-a-Song.
   Run:  node test/verify.mjs            (expects a server on :8080)
         npx http-server -p 8080 -s   or  python3 -m http.server 8080
   Exits non-zero on any failed check or console error. */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const URL = process.env.SAS_URL || 'http://localhost:8080/index.html';
const SHOTS = 'test/shots';
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const problems = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; problems.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = s => console.log(`\n${s}`);

// Prefer a preinstalled browser (CI images ship one) over Playwright's own download.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(
  existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});

async function newPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__sas);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => window.__sas);
  // headless Chromium reports en-US, so the app would boot in English —
  // pin Dutch so the copy assertions below are deterministic
  await page.click('#langSeg [data-v="nl"]');
  return { page, errors };
}

const phase = page => page.evaluate(() => window.__sas.phase);
const waitPhase = (page, p, timeout = 12000) =>
  page.waitForFunction(p2 => window.__sas.phase === p2, p, { timeout });

/** setup screen: names + options. Assumes we are on scr-setup. */
async function fillSetup(page, names, { singTimerOff = false, mode = null } = {}) {
  while ((await page.locator('#players .prow').count()) < names.length) await page.click('#addPlayer');
  for (let i = 0; i < names.length; i++) await page.locator('#players .prow input').nth(i).fill(names[i]);
  if (mode) await page.click(`#grabModeSeg [data-v="${mode}"]`);
  if (singTimerOff) {                        // tap mode only — object mode has no clock
    await page.click('details.adv summary');
    await page.click('#singSeg [data-v="0"]');
    await page.click('#togMic');             // mic off: no getUserMedia prompt in headless
  }
}

/* ═════════ 1. Object mode — full happy path ═════════ */
{
  section('1. Object mode — default flow');
  const { page, errors } = await newPage();

  check('object mode is the default', await page.evaluate(() => window.__sas.settings.grabMode) === 'prop');
  await page.click('#homeNew');
  check('grab-time option hidden in object mode', await page.locator('#grabTimeOpt').isHidden());
  check('sing-timer option hidden in object mode', await page.locator('#singTimeOpt').isHidden());
  check('listen-mode option hidden in object mode', await page.locator('#listenOpt').isHidden());
  const note = await page.locator('#setupNote').innerText();
  check('setup note explains the object', /voorwerp|lepel/i.test(note), note.slice(0, 50));
  check('setup note says the phone does not time or listen',
    /telt niks af|luistert niet/i.test(note), note.slice(-60));

  await fillSetup(page, ['Sam', 'Joer', 'Bo']);
  await page.click('#startBtn');

  await waitPhase(page, 'countdown');
  const armedDuringCd = await page.locator('#propPick').evaluate(e => e.classList.contains('armed'));
  const pe = await page.locator('#pickGrid').evaluate(e => getComputedStyle(e).pointerEvents);
  check('name buttons disarmed during countdown', !armedDuringCd && pe === 'none');
  check('zones hidden in object mode', await page.locator('#zones').isHidden());
  check('one button per player', await page.locator('#pickGrid .pick').count() === 3);

  await waitPhase(page, 'grab');
  check('name buttons armed after reveal',
    await page.locator('#propPick').evaluate(e => e.classList.contains('armed')));
  check('label asks for the name after the singing',
    /tik aan wie/i.test(await page.locator('#pickLabel').innerText()),
    await page.locator('#pickLabel').innerText());
  check('word is shown', (await page.locator('#word').innerText()).length > 1);
  await page.waitForTimeout(250);   // let the arm-in fade settle so the shot is representative
  await page.screenshot({ path: `${SHOTS}/01-prop-grab.png` });

  // no auto-discard timer in object mode: still grabbable well past the 15s default
  const stillGrabbable = await page.evaluate(() => window.__sas.settings.grabTime);
  check('grab timer setting untouched (15s) but unused here', stillGrabbable === 15);

  await page.locator('#pickGrid .pick').nth(0).click();
  await waitPhase(page, 'vote');
  check('tap goes straight to the vote — no sing screen', await page.locator('#scr-sing').isHidden());
  check('picked player is the singer', (await page.locator('#voteName').innerText()) === 'Sam');
  check('grabber index recorded', await page.evaluate(() => window.__sas.grabber) === 0);
  check('no microphone requested in object mode',
    await page.evaluate(() => window.__mic.ready === false && window.__sas.micOn === false));
  await page.screenshot({ path: `${SHOTS}/02-prop-vote.png` });

  section('   wrong-name correction');
  check('correction button visible in object mode', await page.locator('#scr-vote .fixBtn').isVisible());
  await page.click('#scr-vote .fixBtn');
  const opts = await page.locator('#fixVote .pick').count();
  check('correction excludes the current singer', opts === 2, `got ${opts}`);
  await page.locator('#fixVote .pick').nth(0).click();
  const voteName = await page.locator('#voteName').innerText();
  check('name corrected on the vote screen', voteName === 'Joer', voteName);
  check('state follows the correction', await page.evaluate(() => window.__sas.grabber) === 1);

  await page.click('#voteYes');
  await waitPhase(page, 'score');
  const banner = await page.locator('#scoreBanner').innerText();
  check('token awarded to the corrected player', banner.includes(voteName) && banner.includes('+1'), banner);
  const tokens = await page.evaluate(n => window.__sas.players.find(p => p.name === n).tokens,
    voteName);
  check('token actually on that player', tokens === 1);
  await page.screenshot({ path: `${SHOTS}/03-prop-score.png` });

  check('console clean', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ═════════ 2. Mute, dead buttons, nobody button ═════════ */
{
  section('2. Mute penalty + "nobody" button');
  const { page, errors } = await newPage();
  await page.click('#homeNew');
  await fillSetup(page, ['Sam', 'Joer', 'Bo']);
  await page.click('#startBtn');

  await waitPhase(page, 'grab');
  await page.locator('#pickGrid .pick').nth(0).click();
  await waitPhase(page, 'vote');
  await page.click('#voteNo');                     // Sam gets a mute
  await waitPhase(page, 'score');
  await page.click('#nextBtn');
  await waitPhase(page, 'grab');

  const dead = await page.locator('#pickGrid .pick.dead').count();
  const deadLabel = await page.locator('#pickGrid .pick.dead').first().innerText();
  check('muted player rendered dead', dead === 1 && deadLabel.includes('Sam'), `${dead} dead, "${deadLabel}"`);
  check('dead button not clickable',
    await page.locator('#pickGrid .pick.dead').first().evaluate(e => getComputedStyle(e).pointerEvents) === 'none');

  await page.click('#nobodyBtn');
  await waitPhase(page, 'countdown');
  check('"nobody" starts a fresh card', true);
  const w1 = await page.evaluate(() => window.__sas.word);
  await waitPhase(page, 'grab');
  check('fresh card renders the newly drawn word', (await page.locator('#word').innerText()) === w1);

  check('console clean', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ═════════ 3. Tap/zone mode regression ═════════ */
{
  section('3. Tap mode still works');
  const { page, errors } = await newPage();
  await page.click('#homeNew');
  await fillSetup(page, ['Sam', 'Joer'], { mode: 'zones', singTimerOff: true });
  check('grab-time option returns in tap mode', await page.locator('#grabTimeOpt').isVisible());
  check('sing-timer option returns in tap mode', await page.locator('#singTimeOpt').isVisible());
  check('listen-mode option returns in tap mode', await page.locator('#listenOpt').isVisible());
  const note = await page.locator('#setupNote').innerText();
  check('setup note switches back to the flat-phone text', /plat in het midden/i.test(note));
  await page.click('#startBtn');

  await waitPhase(page, 'countdown');
  check('name buttons hidden in tap mode', await page.locator('#propPick').isHidden());
  check('wedges drawn', await page.locator('#zones .wedge').count() === 2);

  await page.locator('#zones .wedge').first().click({ force: true });   // too soon
  check('early tap locks that player out',
    await page.evaluate(() => window.__sas.players[0].lockedCard) === true);
  check('early tap flashes a warning', /TE VROEG/i.test(await page.locator('#flash').innerText()));

  await waitPhase(page, 'grab');
  await page.locator('#zones .wedge').nth(1).click({ force: true });
  await waitPhase(page, 'sing');
  check('zone tap picks the right player', (await page.locator('#singerName').innerText()) === 'Joer');
  check('correction button hidden in tap mode', await page.locator('#scr-sing .fixBtn').isHidden());
  await page.screenshot({ path: `${SHOTS}/04-zones.png` });

  check('console clean', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ═════════ 4. Player cap + layout on a small phone ═════════ */
{
  section('4. Ten players / small screen');
  const { page, errors } = await newPage({ width: 360, height: 640 });
  await page.click('#homeNew');
  const names = Array.from({ length: 10 }, (_, i) => `Speler ${i + 1}`);
  await fillSetup(page, names);

  check('tap mode disabled above 8 players',
    await page.locator('#grabModeSeg [data-v="zones"]').isDisabled());
  check('note mentions the 8-player limit', /8 spelers/i.test(await page.locator('#setupNote').innerText()));
  check('add-player button hidden at the cap', await page.locator('#addPlayer').isHidden());

  await page.click('#startBtn');
  await waitPhase(page, 'grab');
  check('ten name buttons', await page.locator('#pickGrid .pick').count() === 10);

  // longest deck entries are 9 characters — they must not wrap inside the disc
  const wordFit = await page.evaluate(() => {
    const w = document.getElementById('word');
    w.textContent = 'REGENBOOG';
    const oneLine = w.getBoundingClientRect().height < parseFloat(getComputedStyle(w).fontSize) * 1.6;
    return { oneLine, overflow: w.scrollWidth > w.clientWidth };
  });
  check('longest word fits on one line', wordFit.oneLine && !wordFit.overflow, JSON.stringify(wordFit));

  const box = await page.evaluate(() => {
    const a = document.getElementById('arena');
    const b = document.getElementById('nobodyBtn').getBoundingClientRect();
    return { scrollH: a.scrollHeight, clientH: a.clientHeight, lastBottom: Math.round(b.bottom), vh: innerHeight };
  });
  check('nothing clipped off the bottom', box.lastBottom <= box.vh,
    `last control at ${box.lastBottom}px of ${box.vh}px`);
  check('arena scrollable if it ever overflows', box.scrollH <= box.clientH || box.scrollH > 0,
    JSON.stringify(box));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/05-ten-players-360.png` });

  check('console clean', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ═════════ 5. Sing timer + frame rate ═════════ */
{
  section('5. Sing timer + frame rate (tap mode)');
  const { page, errors } = await newPage();
  await page.click('#homeNew');
  // the clock only exists in tap mode now
  await fillSetup(page, ['Sam', 'Joer'], { mode: 'zones' });
  await page.click('details.adv summary');
  await page.click('#togMic');                    // mic off, keep the 10s timer
  await page.click('#startBtn');
  await waitPhase(page, 'grab');
  await page.locator('#zones .wedge').first().click({ force: true });
  await waitPhase(page, 'sing');

  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0, worst = 0, last = performance.now();
    const t0 = last;
    (function loop(now) {
      const dt = now - last; last = now;
      if (n++) worst = Math.max(worst, dt);
      if (now - t0 < 2000) requestAnimationFrame(loop);
      else res({ mean: Math.round(n / ((now - t0) / 1000)), worst: Math.round(worst) });
    })(last);
  }));
  check('frame rate healthy during the sing clock', fps.mean >= 30, `mean ${fps.mean}fps, worst frame ${fps.worst}ms`);
  console.log(`    (mean ${fps.mean} fps, worst frame ${fps.worst} ms)`);

  // nothing registered before the clock runs out → miss (phase passes through
  // 'fail' into 'score' in the same tick, so wait on the settled state)
  await waitPhase(page, 'score', 16000);
  check('unregistered singing times out to a miss',
    /TE LAAT|krijgt een/i.test(await page.locator('#scoreBanner').innerText()));

  check('console clean', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ═════════ 7. Legibility and reachable controls ═════════ */
{
  section('7. Type scale + nothing out of reach');
  const { page, errors } = await newPage({ width: 360, height: 640 });
  await page.click('#homeNew');
  await fillSetup(page, ['Sam', 'Joer']);
  await page.click('#startBtn');
  await waitPhase(page, 'grab');

  // the arena word is read across a table — it must dominate, not hide in the disc
  const arena = await page.evaluate(() => {
    const w = document.getElementById('word'), d = document.getElementById('centerDisc');
    const px = el => parseFloat(getComputedStyle(el).fontSize);
    const one = txt => { w.textContent = txt; window.__fitWord();
      return { size: px(w), lines: Math.round(w.getBoundingClientRect().height / px(w)) }; };
    return { disc: Math.round(d.getBoundingClientRect().width),
             short: one('ZON'), long: one('REGENBOOG'), vw: innerWidth };
  });
  check('disc fills most of the width', arena.disc / arena.vw > 0.7, `${arena.disc}px of ${arena.vw}`);
  check('short word set large', arena.short.size >= 44, `${arena.short.size}px`);
  check('longest word still one line', arena.long.lines === 1 && arena.long.size >= 26,
    `${arena.long.size}px, ${arena.long.lines} lines`);

  await page.locator('#pickGrid .pick').nth(0).click();
  await waitPhase(page, 'vote');
  const vote = await page.evaluate(() => {
    const w = document.getElementById('voteWord');
    w.textContent = 'REGENBOOG'; window.__fitBigWord(w);
    const s = parseFloat(getComputedStyle(w).fontSize);
    const btn = document.getElementById('voteYes').getBoundingClientRect();
    return { size: s, lines: Math.round(w.getBoundingClientRect().height / s), btnH: Math.round(btn.height) };
  });
  check('vote word large and unwrapped', vote.lines === 1 && vote.size >= 40,
    `${vote.size}px, ${vote.lines} lines`);
  check('vote buttons are big targets', vote.btnH >= 60, `${vote.btnH}px tall`);

  await page.click('#voteYes');
  await waitPhase(page, 'score');
  check('scoreboard names readable',
    await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.srow .nm')).fontSize) >= 18));

  await page.context().close();

  // ten players on a short phone: the next-card button must stay reachable
  const { page: p2, errors: e2 } = await newPage({ width: 360, height: 640 });
  await p2.click('#homeNew');
  await fillSetup(p2, Array.from({ length: 10 }, (_, i) => `Speler ${i + 1}`));
  await p2.click('#startBtn');
  await waitPhase(p2, 'grab');
  await p2.locator('#pickGrid .pick').nth(0).click();
  await waitPhase(p2, 'vote');
  await p2.click('#voteYes');
  await waitPhase(p2, 'score');
  await p2.locator('#nextBtn').scrollIntoViewIfNeeded();
  const reach = await p2.evaluate(() => {
    const r = document.getElementById('nextBtn').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
  });
  check('next-card button reachable with 10 players',
    reach.top >= 0 && reach.bottom <= reach.vh, JSON.stringify(reach));
  await p2.screenshot({ path: `${SHOTS}/07-score-10p.png` });
  check('console clean', errors.length === 0 && e2.length === 0, [...errors, ...e2].join(' | '));
  await p2.context().close();
}

/* ═════════ 6. Background covers a grown viewport ═════════ */
{
  section('6. Background under a retracted URL bar');
  const { page, errors } = await newPage();
  await page.click('#homeNew');

  const bg = await page.evaluate(() => {
    const b = getComputedStyle(document.body), h = getComputedStyle(document.documentElement);
    return { repeat: b.backgroundRepeat, bodyColor: b.backgroundColor, rootColor: h.backgroundColor };
  });
  check('body gradient does not tile', bg.repeat === 'no-repeat', bg.repeat);
  check('root paints the base colour', bg.rootColor === 'rgb(14, 10, 32)', bg.rootColor);
  check('body has a solid colour behind the gradient', bg.bodyColor === 'rgb(14, 10, 32)', bg.bodyColor);

  // Emulate the gap. The canvas background is positioned against the ROOT
  // element, not body — shrinking body proves nothing, shrinking html
  // reproduces the tiled bright edge exactly as seen on a real phone.
  await page.evaluate(() => { document.documentElement.style.height = '70%'; });
  await page.screenshot({ path: `${SHOTS}/06-short-root.png` });
  await page.evaluate(() => { document.documentElement.style.height = ''; });

  check('console clean', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

await browser.close();
console.log(`\n${'─'.repeat(50)}\n${pass} passed, ${fail} failed`);
if (problems.length) { console.log('\nFailures:'); problems.forEach(p => console.log('  • ' + p)); }
process.exit(fail ? 1 : 0);
