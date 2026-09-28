/* qa/sim-check.mjs — headless gameplay checks against GAME_PLAN.md section 13.
 * Runs the real simulation from game.js with no browser: node qa/sim-check.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
globalThis.I18N = require(path.join(here, '..', 'i18n.js'));
const G = require(path.join(here, '..', 'game.js'));

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ok   ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

const CAP_SECONDS = 600; // a run that needs 10 simulated minutes is a bug, not a run

/* Plays one run to completion. `hold` sets the steering input each step. */
function play(levels, { power = 100, seed = 1, hold = null } = {}) {
  const run = G.createRun(levels, seed);
  let guard = 0;
  while (run.phase === 'charging' && guard++ < 10000) {
    G.step(run, G.STEP);
    if (run.power >= power || (power < 100 && run.powerDir < 0)) G.press(run);
  }
  let steps = 0;
  const maxSteps = 60 * CAP_SECONDS;
  while (run.phase === 'flying' && steps++ < maxSteps) {
    if (hold) hold(run);
    G.step(run, G.STEP);
  }
  run.cappedOut = steps >= maxSteps;
  return run;
}

/* Skilled-play proxy: predicts where the cart will fall to dhow-top height and
 * steers to land on the next boat. Stands in for a good human in criterion 13. */
function autopilot(r) {
  let target = null;
  for (const d of r.dhows) if (!d.used && d.x > r.x + 4 && (!target || d.x < target.x)) target = d;
  r.input.up = false;
  r.input.down = false;
  if (r.boosts > 0 && r.vy < 0 && r.y > 15) G.fireRocket(r);
  if (!target || r.vx <= 0) { r.input.up = r.vy < 0 && r.glideFuel > 0; return; }
  const disc = r.vy * r.vy + 2 * G.TUNE.gravity * (r.y - 1.2);
  if (disc < 0) { r.input.up = true; return; }
  const landX = r.x + r.vx * ((r.vy + Math.sqrt(disc)) / G.TUNE.gravity);
  if (landX > target.x + 2) r.input.down = true;
  else if (landX < target.x - 2) r.input.up = r.glideFuel > 0 || r.vy < 0;
}

const none = G.emptyLevels();
const maxed = (() => {
  const l = G.emptyLevels();
  Object.keys(l).forEach((k) => { l[k] = G.MAX_LEVEL; });
  return l;
})();
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

console.log('sim-check: gameplay acceptance (GAME_PLAN.md §13)\n');

/* -- 9. a plausible first launch ------------------------------------------- */
const baseline = seeds.map((seed) => play(none, { seed }).x);
const baseAvg = avg(baseline);
check('full charge, no upgrades lands in 400-700 m',
  baseAvg >= 400 && baseAvg <= 700,
  `avg ${baseAvg.toFixed(0)} m (min ${Math.min(...baseline).toFixed(0)}, max ${Math.max(...baseline).toFixed(0)})`);

const weak = play(none, { power: 10, seed: 3 }).x;
const strong = play(none, { power: 100, seed: 3 }).x;
check('charge level changes the outcome', weak < strong,
  `${weak.toFixed(0)} m at 10% vs ${strong.toFixed(0)} m at 100%`);

/* -- 10. dhow bounces and the perfect bounce ------------------------------- */
const skilledNone = seeds.map((seed) => play(none, { seed, hold: autopilot }));
check('bouncing off dhows beats not bouncing',
  avg(skilledNone.map((r) => r.x)) > baseAvg,
  `${avg(skilledNone.map((r) => r.x)).toFixed(0)} m skilled vs ${baseAvg.toFixed(0)} m passive`);
check('a skilled run chains several bounces',
  avg(skilledNone.map((r) => r.bounces)) >= 3,
  `${avg(skilledNone.map((r) => r.bounces)).toFixed(1)} bounces per run`);

const perfectRun = skilledNone.find((r) => r.perfects > 0);
check('perfect bounces occur', perfectRun !== undefined,
  `${skilledNone.reduce((n, r) => n + r.perfects, 0)} across ${seeds.length} runs`);
check('a perfect bounce raises the riyal multiplier',
  perfectRun !== undefined && perfectRun.riyalBonus >= G.TUNE.perfectRiyalBonus,
  perfectRun ? `bonus +${(perfectRun.riyalBonus * 100).toFixed(0)}%` : 'none found');

/* A bounce must lift the cart and add forward speed. */
const bounceUnit = G.createRun(none, 21);
G.press(bounceUnit);
const dhow = bounceUnit.dhows[0];
bounceUnit.x = dhow.x;
bounceUnit.y = G.dhowTop(dhow, bounceUnit.t) + 0.5;
bounceUnit.vy = -14;
bounceUnit.vx = 24;
G.step(bounceUnit, G.STEP);
check('a dhow bounce adds height and forward speed',
  bounceUnit.bounces === 1 && bounceUnit.vy > 0 && bounceUnit.vx > 24,
  `vy -14 -> ${bounceUnit.vy.toFixed(1)}, vx 24 -> ${bounceUnit.vx.toFixed(1)}`);

/* -- 11. bird hits cost speed and never kill outright ---------------------- */
const birdUnit = G.createRun(none, 31);
G.press(birdUnit);
const bird = birdUnit.birds[0];
birdUnit.x = bird.x;
birdUnit.y = bird.y;
birdUnit.vx = 26;
birdUnit.vy = 2;
G.step(birdUnit, G.STEP);
check('a bird hit costs forward speed', birdUnit.vx < 26 && birdUnit.vx > 0,
  `26 -> ${birdUnit.vx.toFixed(1)} m/s`);
check('a bird hit never ends the run on the spot', birdUnit.phase === 'flying', birdUnit.phase);
check('a bird hit removes steering briefly', birdUnit.tumble > 0,
  `${birdUnit.tumble.toFixed(2)} s tumble`);

/* -- 12/13. progression, the win, and persistence-shaped numbers ----------- */
const skilledMax = seeds.map((seed) => play(maxed, { seed, hold: autopilot }));
check('upgrades transform the run',
  avg(skilledMax.map((r) => r.x)) > baseAvg * 3,
  `maxed+skilled avg ${avg(skilledMax.map((r) => r.x)).toFixed(0)} m vs ${baseAvg.toFixed(0)} m`);
const wins = skilledMax.filter((r) => r.phase === 'won');
check('the far shore is reachable with upgrades and good play', wins.length > 0,
  `${wins.length}/${seeds.length} crossings, best ${Math.max(...skilledMax.map((r) => r.x)).toFixed(0)} m`);
check('a crossing reports a finite time', wins.length === 0 || wins.every((r) => r.t > 0 && isFinite(r.t)),
  wins.length ? `${wins[0].t.toFixed(1)} s` : 'n/a');
check('the far shore is NOT reachable without upgrades',
  skilledNone.every((r) => r.phase !== 'won'),
  `best ${Math.max(...skilledNone.map((r) => r.x)).toFixed(0)} m`);

/* -- every run must terminate, bank riyals, and stay finite ---------------- */
const allRuns = [...skilledNone, ...skilledMax, ...seeds.map((s) => play(none, { seed: s }))];
check('every run terminates well inside the cap',
  allRuns.every((r) => !r.cappedOut && (r.phase === 'over' || r.phase === 'won')),
  `longest ${Math.max(...allRuns.map((r) => r.t)).toFixed(0)} s of ${CAP_SECONDS} s cap`);
check('every run banks riyals', allRuns.every((r) => r.earned > 0),
  `min ${Math.min(...allRuns.map((r) => r.earned))} SAR, max ${Math.max(...allRuns.map((r) => r.earned))} SAR`);
check('no NaN or Infinity reaches the scoreboard',
  allRuns.every((r) => [r.x, r.vx, r.vy, r.earned, r.maxHeight, r.t].every(Number.isFinite)));
check('a first run earns roughly 60-120 SAR (plan §7, ±seed variance)',
  (() => { const e = avg(seeds.map((s) => play(none, { seed: s }).earned)); return e >= 50 && e <= 150; })(),
  `avg ${avg(seeds.map((s) => play(none, { seed: s })).map((r) => r.earned)).toFixed(0)} SAR`);
check('landmarks fire in order, never ahead of the cart',
  allRuns.every((r) => r.landmark === G.LANDMARKS.filter((l) => l.at <= r.x).length - 1));

/* -- the Oud Rocket -------------------------------------------------------- */
const rocketRun = G.createRun(maxed, 7);
G.press(rocketRun);
G.step(rocketRun, G.STEP);
const beforeVx = rocketRun.vx;
const fired = G.fireRocket(rocketRun);
check('the Oud Rocket adds forward speed', fired && rocketRun.vx > beforeVx,
  `${beforeVx.toFixed(1)} -> ${rocketRun.vx.toFixed(1)} m/s`);
let charges = 1;
while (G.fireRocket(rocketRun)) charges++;
check('rocket charges are capped by owned level', charges === G.MAX_LEVEL, `${charges} charges at level 5`);
check('an unupgraded cart has no rocket', G.createRun(none, 7).boosts === 0);

/* -- water: the shallow skip vs the steep plunge --------------------------- */
function waterHit(vy, vx) {
  const r = G.createRun(none, 2);
  G.press(r);
  r.x = 400; r.y = 0.5; r.vy = vy; r.vx = vx;
  for (let i = 0; i < 30 && !r.inWater && r.skims === 0; i++) G.step(r, G.STEP);
  return r;
}
const skim = waterHit(-8, 25);
check('a shallow hit skips instead of sinking',
  skim.skims > 0 && !skim.inWater && skim.vx > 20,
  `vx ${skim.vx.toFixed(1)} m/s after ${skim.skims} skip(s)`);
const plunge = waterHit(-40, 25);
check('a steep hit plunges and guts the speed',
  plunge.inWater && plunge.vx < 10, `vx ${plunge.vx.toFixed(1)} m/s`);
check('a skip refills the glide fuel', skim.glideFuel > 0, `${skim.glideFuel.toFixed(1)} s`);

/* -- spawn bands: nothing where the cart cannot legally reach it ----------- */
const bands = G.createRun(none, 4);
G.generate(bands, 6400);
check('birds stay above the skim line', bands.birds.every((b) => b.y >= 8),
  `${bands.birds.length} birds, lowest ${Math.min(...bands.birds.map((b) => b.y)).toFixed(1)} m`);
check('collectibles stay in reachable air',
  bands.pickups.every((p) => p.y >= 2 && p.y <= 50));
check('coffee cups sit on the high glide line',
  bands.pickups.filter((p) => p.kind === 'cup').every((p) => p.y >= 30));
check('dhows sit on the water, clear of the launch area',
  bands.dhows.every((d) => d.x >= 90));

/* -- economy -------------------------------------------------------------- */
check('every upgrade has 5 rising prices', G.UPGRADES.every((u) =>
  u.prices.length === G.MAX_LEVEL && u.prices.every((p, i) => i === 0 || p > u.prices[i - 1])));
check('a maxed upgrade has no price', G.priceOf(G.UPGRADES[0], G.MAX_LEVEL) === null);
check('the Date Bag makes dates worth more', (() => {
  const plain = G.createRun(none, 1); plain.dates = 10; plain.x = 0;
  const bagged = G.createRun(maxed, 1); bagged.dates = 10; bagged.x = 0;
  return G.riyalsFor(bagged) > G.riyalsFor(plain);
})());
check('a fresh save starts empty', (() => {
  const s = G.defaultSave();
  return s.riyals === 0 && s.best === 0 && G.UPGRADES.every((u) => s.levels[u.id] === 0);
})());

/* -- the clamped step ----------------------------------------------------- */
const bigStep = G.createRun(none, 9);
G.press(bigStep);
for (let i = 0; i < 40; i++) G.step(bigStep, 0.05);
check('a clamped 50 ms step stays finite and in bounds',
  Number.isFinite(bigStep.x) && Number.isFinite(bigStep.y) && bigStep.y >= 0);

console.log(`\nsim-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
