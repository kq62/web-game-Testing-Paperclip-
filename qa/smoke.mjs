/* Browser smoke test: loads the real page in Chrome, plays it with keyboard and
 * touch, walks every screen, and fails on any console error or page exception.
 *
 * Needs a local Chrome and one dependency that is NOT vendored here:
 *   npm install puppeteer-core
 *   node qa/smoke.mjs
 *
 * Point CHROME_PATH at your browser if it is not in one of the usual places. */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(here, '..');
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('No Chrome found. Set CHROME_PATH to your browser executable.');
  process.exit(2);
}
const URL = pathToFileURL(path.join(PROJECT, 'index.html')).href;
const SHOTS = process.argv[2] || path.join(PROJECT, 'qa', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const problems = [];
let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ok   ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--window-size=1280,760', '--force-device-scale-factor=1']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  // The Google Fonts request is expected to be unavailable offline; the plan
  // requires the layout to survive that, so it is not counted as a defect.
  if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) {
    problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  }
});

console.log('smoke: browser run\n');
await page.goto(URL, { waitUntil: 'load' });
await sleep(600);

const state = () => page.evaluate(() => ({
  lang: document.documentElement.lang,
  dir: document.documentElement.dir,
  title: document.title,
  visible: [...document.querySelectorAll('.screen')].filter((s) => !s.hidden).map((s) => s.id),
  hudHidden: document.getElementById('hud').hidden,
  startBest: document.getElementById('startBest').textContent,
  startBalance: document.getElementById('startBalance').textContent,
  playLabel: document.getElementById('btnPlay').textContent,
  cards: document.querySelectorAll('#souqGrid .card').length
}));

let s = await state();
check('the page opens in Arabic RTL', s.lang === 'ar' && s.dir === 'rtl', `lang=${s.lang} dir=${s.dir}`);
check('the document title is translated', s.title.length > 0 && !/meta\./.test(s.title), s.title);
check('exactly one screen is visible, and it is the start screen',
  s.visible.length === 1 && s.visible[0] === 'screen-start', s.visible.join(','));
check('the HUD is hidden before a run starts', s.hudHidden === true);
check('the start screen shows formatted numbers',
  /\d/.test(s.startBest) && /\d/.test(s.startBalance) && !/undefined|NaN/.test(s.startBest + s.startBalance),
  `${s.startBest} / ${s.startBalance}`);
check('buttons are labelled from the table, not left as keys',
  s.playLabel.length > 0 && !/start\./.test(s.playLabel), s.playLabel);
check('the Souq built a card per upgrade', s.cards === 6, `${s.cards} cards`);
await page.screenshot({ path: path.join(SHOTS, '01-start-ar.png') });

/* Language toggle: no reload, everything re-renders. */
await page.click('#btnLang');
await sleep(250);
s = await state();
check('the language toggle switches to English LTR', s.lang === 'en' && s.dir === 'ltr',
  `lang=${s.lang} dir=${s.dir}`);
check('switching language re-renders the buttons', /Play/i.test(s.playLabel), s.playLabel);
await page.screenshot({ path: path.join(SHOTS, '02-start-en.png') });

/* Every screen is reachable and mutually exclusive. */
await page.click('#btnHow');
await sleep(150);
s = await state();
check('the how-to-play screen opens alone', s.visible.length === 1 && s.visible[0] === 'screen-how',
  s.visible.join(','));
await page.screenshot({ path: path.join(SHOTS, '03-how.png') });
await page.click('#btnHowBack');
await sleep(150);

await page.click('#btnSouq');
await sleep(150);
s = await state();
check('the Souq opens alone', s.visible.length === 1 && s.visible[0] === 'screen-souq', s.visible.join(','));
const souq = await page.evaluate(() => {
  const card = document.querySelector('#souqGrid .card');
  return {
    price: card.querySelector('.price').textContent,
    buyDisabled: card.querySelector('.buy').disabled,
    pips: card.querySelectorAll('.pip.on').length
  };
});
check('an upgrade shows a price and is unaffordable at zero balance',
  /\d/.test(souq.price) && souq.buyDisabled === true, `${souq.price}, disabled=${souq.buyDisabled}`);
check('an unbought upgrade shows no filled pips', souq.pips === 0);
await page.screenshot({ path: path.join(SHOTS, '04-souq.png') });
await page.click('#btnSouqBack');
await sleep(150);

/* Keyboard play: start a run, charge, launch, steer. */
await page.click('#btnPlay');
await sleep(300);
s = await state();
check('starting a run hides every overlay and shows the HUD',
  s.visible.length === 0 && s.hudHidden === false, `visible=[${s.visible.join(',')}] hud=${!s.hudHidden}`);
await page.screenshot({ path: path.join(SHOTS, '05-charging.png') });

await page.keyboard.press('Space');          // lock the launch
await sleep(700);
await page.keyboard.down('ArrowUp');         // glide
await sleep(900);
await page.keyboard.up('ArrowUp');
await sleep(600);

const hud = await page.evaluate(() => ({
  distance: document.getElementById('hudDistance').textContent,
  speed: document.getElementById('hudSpeed').textContent,
  height: document.getElementById('hudHeight').textContent,
  riyals: document.getElementById('hudRiyals').textContent,
  progress: document.getElementById('hudProgress').style.width
}));
check('the HUD reports live, formatted values',
  /\d/.test(hud.distance) && /\d/.test(hud.speed) && !/undefined|NaN/.test(Object.values(hud).join(' ')),
  `${hud.distance}, ${hud.speed}, ${hud.height}`);
check('the cart actually travelled', parseFloat(hud.distance.replace(/[^\d.]/g, '')) > 0, hud.distance);
check('the progress bar advanced', parseFloat(hud.progress) > 0, hud.progress);
await page.screenshot({ path: path.join(SHOTS, '06-flying.png') });

/* Pause and resume. */
await page.keyboard.press('p');
await sleep(200);
s = await state();
check('pause opens the paused overlay', s.visible.includes('screen-paused'), s.visible.join(','));
await page.screenshot({ path: path.join(SHOTS, '07-paused.png') });
const frozen = await page.evaluate(() => document.getElementById('hudDistance').textContent);
await sleep(500);
const stillFrozen = await page.evaluate(() => document.getElementById('hudDistance').textContent);
check('the simulation is frozen while paused', frozen === stillFrozen, `${frozen} -> ${stillFrozen}`);
await page.click('#btnResume');
await sleep(300);
s = await state();
check('resume returns to play', s.visible.length === 0 && s.hudHidden === false);

/* Let the run finish on its own, then check the result screen. */
let waited = 0;
while (waited < 60000) {
  s = await state();
  if (s.visible.includes('screen-result')) break;
  await sleep(500);
  waited += 500;
}
check('the run ends and the result screen appears', s.visible.includes('screen-result'),
  `after ${(waited / 1000).toFixed(1)} s, visible=[${s.visible.join(',')}]`);
const result = await page.evaluate(() => ({
  title: document.getElementById('resultTitle').textContent,
  distance: document.getElementById('resultDistance').textContent,
  earned: document.getElementById('resultEarned').textContent,
  balance: document.getElementById('resultBalance').textContent,
  record: !document.getElementById('resultRecord').hidden,
  again: document.getElementById('btnAgain').textContent
}));
check('the result screen reports the run', /\d/.test(result.distance) && /\d/.test(result.earned),
  `${result.distance}, earned ${result.earned}`);
check('the first run is flagged as a record', result.record === true);
check('no raw keys or NaN on the result screen',
  !/undefined|NaN|result\.|win\./.test(Object.values(result).join(' ')),
  `${result.title} / ${result.again}`);
await page.screenshot({ path: path.join(SHOTS, '08-result.png') });

/* Riyals must have been banked and persisted. */
const banked = await page.evaluate(() => JSON.parse(localStorage.getItem('cornicheCart.save')));
check('the run banked riyals into the save', banked && banked.riyals > 0, `${banked?.riyals} SAR`);
check('the save recorded a best distance', banked && banked.best > 0, `${banked?.best} m`);

/* Restart, and buy an upgrade with the banked riyals. */
await page.click('#btnResultSouq');
await sleep(200);
const afford = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#souqGrid .card')];
  const buyable = cards.find((c) => !c.querySelector('.buy').disabled);
  if (buyable) buyable.querySelector('.buy').click();
  return !!buyable;
});
await sleep(250);
const afterBuy = await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem('cornicheCart.save'));
  return { levels: save.levels, riyals: save.riyals, pips: document.querySelectorAll('#souqGrid .pip.on').length };
});
check('a banked balance buys a real upgrade',
  !afford || Object.values(afterBuy.levels).some((v) => v > 0),
  afford ? `levels ${JSON.stringify(afterBuy.levels)}` : 'nothing affordable yet (balance too small)');
if (afford) check('buying fills a level pip', afterBuy.pips > 0, `${afterBuy.pips} pips`);
await page.screenshot({ path: path.join(SHOTS, '09-souq-bought.png') });

/* The restart button starts a genuinely fresh run. */
await page.click('#btnSouqBack');
await sleep(150);
await page.click('#btnPlay');
await sleep(400);
const fresh = await page.evaluate(() => document.getElementById('hudDistance').textContent);
check('restarting begins a new run from zero distance',
  parseFloat(fresh.replace(/[^\d.]/g, '')) < 40, fresh);

/* The win screen is the one screen a natural run will not reach in a smoke test:
 * 6,000 m needs a maxed cart and good play. Corniche.debug.jumpTo exists for
 * exactly this, so the crossing screen (title, body and crossing time) is still
 * covered rather than assumed. */
await page.keyboard.press('Space');   // leave the charging phase; jumpTo only moves a live cart
await sleep(400);
await page.evaluate(() => window.Corniche.debug.jumpTo(6000));
await sleep(400);
const win = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('.screen')].filter((s) => !s.hidden).map((s) => s.id),
  title: document.getElementById('resultTitle').textContent,
  body: document.getElementById('resultWinBody').textContent,
  bodyShown: !document.getElementById('resultWinBody').hidden,
  timeShown: !document.getElementById('resultTime').hidden,
  time: document.getElementById('resultTime').textContent,
  timeLabel: document.getElementById('resultTimeLabel').textContent,
  best: document.getElementById('resultBest').textContent,
  again: document.getElementById('btnAgain').textContent,
  saved: JSON.parse(localStorage.getItem('cornicheCart.save'))
}));
check('crossing 6,000 m shows the win screen', win.visible.join() === 'screen-result',
  `visible=[${win.visible}]`);
check('the win screen swaps in the crossing copy', win.bodyShown && win.body.length > 0,
  win.title);
check('the win screen reports a finite crossing time',
  win.timeShown && /\d/.test(win.time) && !/NaN|Infinity/.test(win.time),
  `${win.timeLabel} ${win.time}`);
check('the win screen shows the persisted best distance', /\d/.test(win.best), win.best);
check('the crossing is recorded in the save', win.saved.won === true && win.saved.bestTime > 0,
  `bestTime ${win.saved.bestTime?.toFixed?.(1)} s`);
check('no raw keys on the win screen',
  !/undefined|NaN|win\.|result\.|unit\./.test([win.title, win.body, win.time, win.timeLabel, win.best, win.again].join(' ')),
  `${win.title} / ${win.again}`);
await page.screenshot({ path: path.join(SHOTS, '13-win.png') });

/* The language preference survives a reload, and Arabic returns after a clear. */
await page.keyboard.press('Escape');
await sleep(150);
await page.reload({ waitUntil: 'load' });
await sleep(500);
s = await state();
check('the chosen language survives a reload', s.lang === 'en', s.lang);
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await sleep(500);
s = await state();
check('clearing storage returns to Arabic', s.lang === 'ar' && s.dir === 'rtl', `${s.lang}/${s.dir}`);

/* Touch play on a phone-sized viewport. */
const phone = await browser.newPage();
phone.on('console', (m) => { if (m.type() === 'error') problems.push(`phone console: ${m.text()}`); });
phone.on('pageerror', (e) => problems.push(`phone pageerror: ${e.message}`));
await phone.emulate({
  viewport: { width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
});
await phone.goto(URL, { waitUntil: 'load' });
await sleep(500);
await phone.screenshot({ path: path.join(SHOTS, '10-phone-start.png') });
const phoneStart = await phone.evaluate(() => {
  const r = document.getElementById('btnPlay').getBoundingClientRect();
  return { w: r.width, h: r.height, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
});
check('touch targets clear 44 px on a phone', phoneStart.h >= 44, `${phoneStart.h.toFixed(0)} px tall`);
check('the phone layout does not scroll sideways', phoneStart.overflow === false);

await phone.tap('#btnPlay');
await sleep(300);
const padsVisible = await phone.evaluate(() => !document.getElementById('touchPads').hidden);
check('the steering pads appear for touch play', padsVisible === true);
await phone.touchscreen.touchStart(200, 200);   // upper half: locks the launch and steers up
await sleep(800);
await phone.touchscreen.touchEnd();
await sleep(600);
const phoneHud = await phone.evaluate(() => document.getElementById('hudDistance').textContent);
check('touch input launches and flies the cart',
  parseFloat(phoneHud.replace(/[^\d.]/g, '')) > 0, phoneHud);
await phone.screenshot({ path: path.join(SHOTS, '11-phone-flying.png') });

/* A blocked localStorage must degrade quietly, not crash. */
const noStore = await browser.newPage();
const storeProblems = [];
noStore.on('pageerror', (e) => storeProblems.push(e.message));
noStore.on('console', (m) => { if (m.type() === 'error') storeProblems.push(m.text()); });
await noStore.evaluateOnNewDocument(() => {
  Object.defineProperty(window, 'localStorage', {
    get() { throw new Error('storage blocked'); }
  });
});
await noStore.goto(URL, { waitUntil: 'load' });
await sleep(400);
await noStore.click('#btnPlay');
await sleep(300);
await noStore.keyboard.press('Space');
await sleep(900);
const noStoreHud = await noStore.evaluate(() => ({
  distance: document.getElementById('hudDistance').textContent,
  lang: document.documentElement.lang
}));
check('the game still plays with localStorage blocked',
  storeProblems.length === 0 && parseFloat(noStoreHud.distance.replace(/[^\d.]/g, '')) > 0,
  storeProblems.length ? storeProblems[0] : `${noStoreHud.distance}, lang=${noStoreHud.lang}`);

/* The whole point of this file. */
check('no console errors, warnings or page exceptions anywhere',
  problems.length === 0,
  problems.length ? problems.slice(0, 6).join(' | ') : 'clean across desktop, phone and no-storage runs');

await browser.close();
console.log(`\nsmoke: ${pass} passed, ${fail} failed`);
console.log(`screenshots: ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);
