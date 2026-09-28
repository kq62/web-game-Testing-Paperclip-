/* game.js — Corniche Cart: simulation, render, economy, save.
 * Contains no user-visible strings; every label goes through I18N (see i18n.js).
 *
 * The sim half is pure and DOM-free so qa/ can run it headless under Node; the
 * UI half only boots when a document exists. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Corniche = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', api.boot);
    } else {
      api.boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /* ---------------------------------------------------------------- constants */

  var VIEW_W = 960;
  var VIEW_H = 540;
  var PPM = 6;          // 1 m = 6 px
  var SEA_Y = 400;      // screen y of sea level when the camera is grounded
  var STEP = 1 / 60;    // fixed simulation step
  var MAX_FRAME = 0.05; // dt clamp: a stalled tab must not tunnel the cart

  var TUNE = {
    launchAngle: 35 * Math.PI / 180,
    launchBase: 22,          // m/s at 0% power
    launchPerPower: 0.10,    // m/s per power percent  -> 22..32
    launchPerCamel: 4,       // m/s per Camel Power level
    rollPerWheel: 1,         // m/s per Sadu Wheels level (0..5)
    rampHeight: 12,          // m above sea level at the ramp lip
    /* Gravity: the plan's table says 22 m/s^2, which makes a passive run land at
     * ~52 m instead of the 400-700 m its own acceptance criterion 9 demands. The
     * ratio the plan cares about (glide is a little over 2x floatier than free
     * fall) is preserved; only the scale moved. See README "Tuning". */
    gravity: 9,              // m/s^2
    gravityGlide: 3.8,       // m/s^2 while gliding
    steer: 16,               // m/s^2 applied to vertical velocity
    airDrag: 0.02,           // per second, proportional to forward speed
    glideFuelBase: 2.0,      // s
    glideFuelPerLevel: 0.6,  // s
    glideDrag: 0.10,         // extra forward drag per second while gliding
    rocketBoost: 12,         // m/s forward
    bounceBase: 1.15,
    bouncePerLevel: 0.05,
    bounceForward: 0.08,     // +8% forward speed
    perfectWindow: 0.15,     // s either side of the dhow crest
    perfectBounce: 1.30,
    perfectRiyalBonus: 0.10, // +10% riyals for the run, per the plan
    birdSpeedLoss: 0.25,
    birdTumble: 0.6,         // s with no steering
    /* The plan's §3 prose is the rule of record: "a shallow ANGLE skips, a steep
     * hit plunges". Its §5 table restated that as an absolute 12 m/s descent,
     * which no 35-degree launch can ever satisfy — so every contact plunged and a
     * stronger launch was punished for arriving faster. Angle, not speed. */
    skimMaxAngle: 1.2,       // tan of the descent angle: shallower than ~50 deg skips
    skimMaxDescent: 45,      // m/s absolute guard: a true nose-dive always plunges
    skimKeepVertical: 0.70,  // the stone-skip: 70% of the vertical speed comes back
    skimForwardLoss: 0.02,   // 2% forward speed per skip
    plungeSpeedMul: 0.25,
    waterDrag: 5,            // m/s^2 while dragging through the water
    endSpeed: 6,             // run ends below this forward speed on the water
    winDistance: 6000,
    datesValue: 5,
    datesPerLevel: 0.4,
    cupValue: 15,
    metresPerRiyal: 10
  };

  var UPGRADES = [
    { id: 'wheels',  nameKey: 'upgrade.saduWheels.name',  descKey: 'upgrade.saduWheels.desc',  prices: [120, 260, 560, 1200, 2500] },
    { id: 'camel',   nameKey: 'upgrade.camelPower.name',  descKey: 'upgrade.camelPower.desc',  prices: [150, 320, 700, 1500, 3200] },
    { id: 'springs', nameKey: 'upgrade.dhowSprings.name', descKey: 'upgrade.dhowSprings.desc', prices: [180, 400, 850, 1800, 3800] },
    { id: 'wings',   nameKey: 'upgrade.falconWings.name', descKey: 'upgrade.falconWings.desc', prices: [200, 450, 950, 2000, 4200] },
    { id: 'dates',   nameKey: 'upgrade.dateBag.name',     descKey: 'upgrade.dateBag.desc',     prices: [100, 240, 520, 1100, 2400] },
    { id: 'rocket',  nameKey: 'upgrade.oudRocket.name',   descKey: 'upgrade.oudRocket.desc',   prices: [400, 900, 1900, 4000, 8500] }
  ];
  var MAX_LEVEL = 5;

  var LANDMARKS = [
    { at: 1000, key: 'landmark.1000' },
    { at: 2000, key: 'landmark.2000' },
    { at: 3000, key: 'landmark.3000' },
    { at: 4000, key: 'landmark.4000' },
    { at: 5000, key: 'landmark.5000' },
    { at: 6000, key: 'landmark.6000' }
  ];

  /* Every canvas colour lives here; every CSS colour lives on :root. */
  var PALETTE = {
    skyTop: '#3d5a80', skyMid: '#e07a5f', skyLow: '#f7b267',
    sun: '#ffd79a',
    seaTop: '#1b6b7a', seaDeep: '#0e3c4a', foam: '#bfe4e8',
    sand: '#e8d5a9', coral: '#cbb399', wood: '#7a4f2a',
    gold: '#d4af37', green: '#165d31', ink: '#22303a', paper: '#fdf6e8',
    skylineFar: '#2f4a6b', skylineNear: '#5b4a6b'
  };

  var SPAWN_CHUNK = 240;   // m of world generated at a time
  var BIRD_GRACE = 130;    // m: no birds over the launch, so the opening is skill, not luck
  var DHOW_GRACE = 90;     // m: no boats inside the launch area

  /* ------------------------------------------------------------------- helpers */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* Seeded PRNG so a reported run is reproducible for QA. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyLevels() {
    var out = {};
    UPGRADES.forEach(function (u) { out[u.id] = 0; });
    return out;
  }

  function priceOf(upgrade, level) {
    return level >= MAX_LEVEL ? null : upgrade.prices[level];
  }

  /* --------------------------------------------------------------------- save */

  var SAVE_KEY = 'cornicheCart.save';

  function defaultSave() {
    return { riyals: 0, best: 0, bestTime: null, levels: emptyLevels(), won: false };
  }

  /* A storage failure is caught and ignored: the game still plays, it just stops
   * remembering. */
  function loadSave() {
    var save = defaultSave();
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return save;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return save;
      save.riyals = Math.max(0, Math.floor(Number(parsed.riyals) || 0));
      save.best = Math.max(0, Math.floor(Number(parsed.best) || 0));
      save.bestTime = Number(parsed.bestTime) > 0 ? Number(parsed.bestTime) : null;
      save.won = parsed.won === true;
      UPGRADES.forEach(function (u) {
        var lvl = Number(parsed.levels && parsed.levels[u.id]);
        save.levels[u.id] = clamp(isFinite(lvl) ? Math.floor(lvl) : 0, 0, MAX_LEVEL);
      });
    } catch (err) { /* blocked or corrupt storage degrades quietly */ }
    return save;
  }

  function storeSave(save) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (err) { /* see above */ }
  }

  /* ---------------------------------------------------------------- world gen */

  /* Spawning is band-based, never random-anywhere: birds only above the skim
   * line, dhows only on the water, collectibles only in reachable air. */
  function generate(run, untilX) {
    while (run.spawnedTo < untilX) {
      var from = run.spawnedTo;
      var to = from + SPAWN_CHUNK;
      var r = run.rand;
      var x;

      // Dhows on the water, 60-140 m apart, never inside the launch area.
      for (x = Math.max(from, DHOW_GRACE); x < to; x += 60 + r() * 80) {
        run.dhows.push({ x: x, w: 7, phase: r() * Math.PI * 2, used: false });
      }
      // Birds above the skim line, and never over the launch.
      for (x = Math.max(from + 40, BIRD_GRACE); x < to; x += 70 + r() * 110) {
        var falcon = r() < 0.45;
        run.birds.push({
          x: x,
          y: 8 + r() * 37,
          r: 1.2,
          falcon: falcon,
          vx: falcon ? -6 - r() * 5 : -1 - r() * 2,
          bob: r() * Math.PI * 2,
          hit: false
        });
        if (!falcon) { // seagulls drift in flocks
          var n = 1 + Math.floor(r() * 3);
          for (var i = 0; i < n; i++) {
            run.birds.push({
              x: x + 6 + r() * 14, y: 8 + r() * 30, r: 1.1, falcon: false,
              vx: -1 - r() * 2, bob: r() * Math.PI * 2, hit: false
            });
          }
        }
      }
      // Dates in reachable air; coffee cups on the high glide line.
      for (x = from + 25; x < to; x += 28 + r() * 34) {
        run.pickups.push({ x: x, y: 2 + r() * 23, r: 1.6, kind: 'date', taken: false });
      }
      for (x = from + 60; x < to; x += 150 + r() * 160) {
        run.pickups.push({ x: x, y: 30 + r() * 20, r: 1.8, kind: 'cup', taken: false });
      }
      run.spawnedTo = to;
    }
  }

  function dhowTop(dhow, t) {
    return 1.2 + Math.sin(t * 1.6 + dhow.phase) * 0.8;
  }

  /* Time offset to the nearest crest of this dhow's bob, for the perfect bounce. */
  function crestOffset(dhow, t) {
    var period = (2 * Math.PI) / 1.6;
    var phaseTime = (Math.PI / 2 - dhow.phase) / 1.6;
    var k = Math.round((t - phaseTime) / period);
    return t - (phaseTime + k * period);
  }

  /* ----------------------------------------------------------------- the run */

  function createRun(levels, seed) {
    var lv = levels || emptyLevels();
    var run = {
      levels: lv,
      rand: rng(typeof seed === 'number' ? seed : (Math.random() * 1e9) | 0),
      phase: 'charging',        // charging -> flying -> over | won
      power: 0,
      powerDir: 1,
      t: 0,
      x: 0,
      y: TUNE.rampHeight,
      vx: 0,
      vy: 0,
      inWater: false,
      gliding: false,
      glideFuel: TUNE.glideFuelBase + TUNE.glideFuelPerLevel * lv.wings,
      boosts: lv.rocket,
      tumble: 0,
      tilt: 0,
      stall: 0,
      skims: 0,
      bounces: 0,
      perfects: 0,
      dates: 0,
      cups: 0,
      riyalBonus: 0,
      earned: 0,
      maxHeight: TUNE.rampHeight,
      landmark: -1,
      events: [],               // {key, t, value}
      dhows: [], birds: [], pickups: [],
      spawnedTo: 0,
      input: { up: false, down: false }
    };
    generate(run, SPAWN_CHUNK * 2);
    return run;
  }

  /* `extra` names the thing the event is about (the landmark just passed), so the
   * toast reads "Reached — the lighthouse" rather than a bare "Reached". */
  function note(run, key, extra) {
    run.events.push({ key: key, extra: extra || null, t: run.t });
    if (run.events.length > 4) run.events.shift();
  }

  function launch(run) {
    if (run.phase !== 'charging') return;
    var speed = TUNE.launchBase +
                TUNE.launchPerPower * run.power +
                TUNE.launchPerCamel * run.levels.camel +
                TUNE.rollPerWheel * run.levels.wheels;
    run.vx = speed * Math.cos(TUNE.launchAngle);
    run.vy = speed * Math.sin(TUNE.launchAngle);
    run.phase = 'flying';
  }

  function fireRocket(run) {
    if (run.phase !== 'flying' || run.inWater || run.boosts <= 0) return false;
    run.boosts--;
    run.vx += TUNE.rocketBoost;
    note(run, 'run.rocket');
    return true;
  }

  function press(run) {
    if (run.phase === 'charging') { launch(run); return; }
    if (run.phase === 'flying') fireRocket(run);
  }

  function riyalsFor(run) {
    var fromDistance = Math.floor(run.x / TUNE.metresPerRiyal);
    var dateValue = TUNE.datesValue * (1 + TUNE.datesPerLevel * run.levels.dates);
    var fromPickups = run.dates * dateValue + run.cups * TUNE.cupValue;
    return Math.round((fromDistance + fromPickups) * (1 + run.riyalBonus));
  }

  function endRun(run, won) {
    if (run.phase === 'over' || run.phase === 'won') return;
    run.phase = won ? 'won' : 'over';
    run.earned = riyalsFor(run);
  }

  function step(run, dt) {
    if (run.phase === 'charging') {
      run.power += run.powerDir * dt * 85;
      if (run.power >= 100) { run.power = 100; run.powerDir = -1; }
      if (run.power <= 0) { run.power = 0; run.powerDir = 1; }
      run.t += dt;
      return;
    }
    if (run.phase !== 'flying') return;

    run.t += dt;
    if (run.tumble > 0) run.tumble = Math.max(0, run.tumble - dt);

    var steering = run.tumble <= 0;
    run.gliding = steering && run.input.up && run.glideFuel > 0 && !run.inWater;
    if (run.gliding) run.glideFuel = Math.max(0, run.glideFuel - dt);

    if (run.inWater) {
      // Dragging through the sea: slow down until the run ends.
      run.vx = Math.max(0, run.vx - TUNE.waterDrag * dt);
      run.y = 0;
      run.vy = 0;
    } else {
      var g = run.gliding ? TUNE.gravityGlide : TUNE.gravity;
      run.vy -= g * dt;
      if (steering) {
        if (run.input.up) run.vy += TUNE.steer * dt;
        if (run.input.down) run.vy -= TUNE.steer * dt;
      }
      var drag = TUNE.airDrag + (run.gliding ? TUNE.glideDrag : 0);
      run.vx = Math.max(0, run.vx - run.vx * drag * dt);
      run.y += run.vy * dt;
    }
    run.x += run.vx * dt;
    run.tilt = Math.atan2(run.vy, Math.max(1, run.vx));
    if (run.y > run.maxHeight) run.maxHeight = run.y;

    generate(run, run.x + VIEW_W / PPM + SPAWN_CHUNK);
    collide(run, dt);

    // Landmarks every 1,000 m give the run shape.
    for (var i = run.landmark + 1; i < LANDMARKS.length; i++) {
      if (run.x >= LANDMARKS[i].at) {
        run.landmark = i;
        note(run, 'run.reached', LANDMARKS[i].key);
      } else break;
    }

    if (run.x >= TUNE.winDistance) { endRun(run, true); return; }

    // Water contact: skip, or plunge.
    if (!run.inWater && run.y <= 0) {
      var descent = -run.vy;
      var shallow = descent < TUNE.skimMaxDescent &&
                    descent <= Math.max(TUNE.endSpeed, run.vx) * TUNE.skimMaxAngle;
      if (shallow) {
        run.y = 0;
        run.vy = -run.vy * TUNE.skimKeepVertical;
        run.vx *= (1 - TUNE.skimForwardLoss);
        run.skims++;
        run.glideFuel = TUNE.glideFuelBase + TUNE.glideFuelPerLevel * run.levels.wings;
        note(run, 'run.skim');
        if (run.vy < 1) { run.vy = 0; run.inWater = true; }
      } else {
        run.y = 0;
        run.vy = 0;
        run.vx *= TUNE.plungeSpeedMul;
        run.inWater = true;
      }
    }

    /* The run ends below 6 m/s on the water. The stall timer covers the cart that
     * is skimming along the surface too slowly to be going anywhere, which would
     * otherwise never satisfy the strict in-water test. */
    if (run.vx < TUNE.endSpeed && (run.inWater || run.y <= 1.5)) run.stall += dt;
    else run.stall = 0;
    if (run.inWater && run.vx < TUNE.endSpeed) endRun(run, false);
    else if (run.stall >= 0.5) endRun(run, false);
  }

  function collide(run, dt) {
    var i, o, dx, dy;

    // Dhows: bounce for height and speed. Only while descending.
    for (i = 0; i < run.dhows.length; i++) {
      o = run.dhows[i];
      if (o.used || Math.abs(o.x - run.x) > o.w / 2 + 1.2) continue;
      var top = dhowTop(o, run.t);
      // A stalled cart is not rescued by a boat; it has already lost its run.
      if (run.vx < TUNE.endSpeed) continue;
      if (run.vy <= 0 && run.y <= top + 1.0 && run.y > top - 2.5) {
        o.used = true;
        var mul = TUNE.bounceBase + TUNE.bouncePerLevel * run.levels.springs;
        var perfect = Math.abs(crestOffset(o, run.t)) <= TUNE.perfectWindow;
        if (perfect) {
          mul *= TUNE.perfectBounce;
          run.riyalBonus += TUNE.perfectRiyalBonus;
          run.perfects++;
          note(run, 'run.perfect');
        } else {
          note(run, 'run.bounce');
        }
        /* The lift floor is proportional to forward speed. A flat floor let a cart
         * limping at 3 m/s hop from boat to boat forever, so no run ever ended. */
        run.vy = Math.max(Math.abs(run.vy) * mul, Math.min(8, run.vx * 0.5));
        run.vx *= (1 + TUNE.bounceForward);
        run.y = top + 1.0;
        run.inWater = false;
        run.bounces++;
        run.glideFuel = TUNE.glideFuelBase + TUNE.glideFuelPerLevel * run.levels.wings;
      }
    }

    // Birds: cost speed, never kill outright.
    for (i = 0; i < run.birds.length; i++) {
      o = run.birds[i];
      o.x += o.vx * dt;
      if (o.hit || Math.abs(o.x - run.x) > 12) continue;
      dx = o.x - run.x;
      dy = (o.y + Math.sin(run.t * 2 + o.bob) * 0.8) - run.y;
      if (dx * dx + dy * dy < (o.r + 1.4) * (o.r + 1.4)) {
        o.hit = true;
        run.vx *= (1 - TUNE.birdSpeedLoss);
        run.tumble = TUNE.birdTumble;
        note(run, 'run.birdHit');
      }
    }

    // Collectibles.
    for (i = 0; i < run.pickups.length; i++) {
      o = run.pickups[i];
      if (o.taken || Math.abs(o.x - run.x) > 12) continue;
      dx = o.x - run.x;
      dy = o.y - run.y;
      if (dx * dx + dy * dy < (o.r + 1.4) * (o.r + 1.4)) {
        o.taken = true;
        if (o.kind === 'date') run.dates++; else run.cups++;
      }
    }
  }

  /* ----------------------------------------------------------------- renderer */

  function drawSky(ctx, camY) {
    var grad = ctx.createLinearGradient(0, -camY * 0.2, 0, SEA_Y);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, SEA_Y);
  }

  function drawSun(ctx, camX, camY) {
    var sx = VIEW_W * 0.72 - camX * 0.02;
    var sy = SEA_Y - 70 + camY * 0.1;
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 46, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Three parallax depths: rawasheen houses nearest, skyline mid, sky farthest.
   * The city fades out behind the cart — you are leaving Jeddah, not towing it
   * across the Red Sea. */
  function drawSkyline(ctx, camX, camY, fade) {
    if (fade <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = fade;
    var base = SEA_Y + camY * 0.35;
    var off = -(camX * 0.06) % 300;
    ctx.fillStyle = PALETTE.skylineFar;
    for (var i = -1; i < 5; i++) {
      var bx = off + i * 300;
      ctx.fillRect(bx + 20, base - 120, 34, 120);
      ctx.fillRect(bx + 70, base - 78, 26, 78);
      ctx.fillRect(bx + 110, base - 150, 22, 150);
      ctx.fillRect(bx + 150, base - 92, 40, 92);
      ctx.fillRect(bx + 210, base - 64, 30, 64);
    }
    off = -(camX * 0.16) % 220;
    ctx.fillStyle = PALETTE.coral;
    for (i = -1; i < 6; i++) {
      var hx = off + i * 220;
      ctx.fillRect(hx, base - 70, 78, 70);
      ctx.fillStyle = PALETTE.wood;          // rawasheen windows
      ctx.fillRect(hx + 10, base - 58, 18, 24);
      ctx.fillRect(hx + 48, base - 58, 18, 24);
      ctx.fillRect(hx + 28, base - 28, 20, 24);
      ctx.fillStyle = PALETTE.coral;
    }
    ctx.restore();
  }

  /* The far shore rises out of the haze over the last stretch of the crossing. */
  function drawFarShore(ctx, camX, camY, nearness) {
    if (nearness <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = nearness;
    var base = SEA_Y + camY * 0.35;
    ctx.fillStyle = PALETTE.coral;
    var w = VIEW_W;
    ctx.beginPath();
    ctx.moveTo(w, base);
    ctx.lineTo(w, base - 40 * nearness);
    for (var i = 0; i <= 10; i++) {
      ctx.lineTo(w - i * 36, base - (26 + Math.sin(i * 1.7) * 12) * nearness);
    }
    ctx.lineTo(w - 360, base);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSea(ctx, camX, camY, t) {
    var horizon = SEA_Y + camY * PPM * 0;
    var grad = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
    grad.addColorStop(0, PALETTE.seaTop);
    grad.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon, VIEW_W, VIEW_H - horizon);
    ctx.strokeStyle = PALETTE.foam;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (var row = 0; row < 5; row++) {
      var y = horizon + 14 + row * 26;
      ctx.beginPath();
      for (var px = 0; px <= VIEW_W; px += 16) {
        var wave = Math.sin((px + camX * PPM * 0.5) * 0.02 + t * 1.6 + row) * 3;
        if (px === 0) ctx.moveTo(px, y + wave); else ctx.lineTo(px, y + wave);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawRamp(ctx, toScreen) {
    var lip = toScreen(0, TUNE.rampHeight);
    var foot = toScreen(-26, 0);
    if (lip.x < -200) return;
    ctx.fillStyle = PALETTE.sand;
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(lip.x, lip.y);
    ctx.lineTo(lip.x, foot.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.coral;       // walkway
    ctx.fillRect(foot.x - 220, foot.y, 220, 14);
    for (var i = 0; i < 4; i++) {        // palm trees and lanterns
      var p = toScreen(-40 - i * 26, 0);
      ctx.fillStyle = PALETTE.wood;
      ctx.fillRect(p.x, p.y - 44, 5, 44);
      ctx.fillStyle = PALETTE.green;
      ctx.beginPath();
      ctx.arc(p.x + 2, p.y - 48, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(p.x + 14, p.y - 26, 4, 26);
      ctx.beginPath();
      ctx.arc(p.x + 16, p.y - 30, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCart(ctx, run, toScreen) {
    var p = toScreen(run.x, run.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-clamp(run.tilt, -1, 1) * 0.6);
    // wooden body with painted panels and brass trim
    ctx.fillStyle = PALETTE.wood;
    ctx.fillRect(-14, -16, 28, 16);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(-14, -18, 28, 3);
    ctx.fillStyle = PALETTE.green;
    ctx.fillRect(-10, -13, 8, 9);
    ctx.fillRect(2, -13, 8, 9);
    // crates of dates
    ctx.fillStyle = PALETTE.coral;
    ctx.fillRect(-8, -26, 16, 8);
    // canopy fringe flutters at speed
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = -12; i <= 12; i += 6) {
      ctx.moveTo(i, -28);
      ctx.lineTo(i + Math.sin(run.t * 12 + i) * 2, -33);
    }
    ctx.stroke();
    // spoked wheels
    ctx.fillStyle = PALETTE.ink;
    [-9, 9].forEach(function (wx) {
      ctx.beginPath();
      ctx.arc(wx, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    if (run.gliding) { // Falcon Wings
      ctx.fillStyle = PALETTE.paper;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(-4, -18);
      ctx.lineTo(-30, -26);
      ctx.lineTo(-6, -12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -18);
      ctx.lineTo(30, -26);
      ctx.lineTo(6, -12);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawEntities(ctx, run, toScreen) {
    var i, o, p;
    for (i = 0; i < run.dhows.length; i++) {
      o = run.dhows[i];
      if (Math.abs(o.x - run.x) > 200) continue;
      p = toScreen(o.x, dhowTop(o, run.t));
      ctx.fillStyle = PALETTE.wood;
      ctx.beginPath();
      ctx.moveTo(p.x - 22, p.y);
      ctx.lineTo(p.x + 22, p.y);
      ctx.lineTo(p.x + 14, p.y + 12);
      ctx.lineTo(p.x - 14, p.y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.paper;     // lateen sail
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 34);
      ctx.lineTo(p.x + 16, p.y - 2);
      ctx.lineTo(p.x - 6, p.y - 2);
      ctx.closePath();
      ctx.fill();
    }
    for (i = 0; i < run.birds.length; i++) {
      o = run.birds[i];
      if (o.hit || Math.abs(o.x - run.x) > 200) continue;
      p = toScreen(o.x, o.y + Math.sin(run.t * 2 + o.bob) * 0.8);
      var flap = Math.sin(run.t * (o.falcon ? 14 : 7) + o.bob) * 6;
      ctx.strokeStyle = o.falcon ? PALETTE.wood : PALETTE.paper;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y - flap);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x + 10, p.y - flap);
      ctx.stroke();
    }
    for (i = 0; i < run.pickups.length; i++) {
      o = run.pickups[i];
      if (o.taken || Math.abs(o.x - run.x) > 200) continue;
      p = toScreen(o.x, o.y);
      if (o.kind === 'date') {
        ctx.fillStyle = PALETTE.wood;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.gold;    // dallah and finjan
        ctx.beginPath();
        ctx.moveTo(p.x - 7, p.y + 7);
        ctx.lineTo(p.x + 7, p.y + 7);
        ctx.lineTo(p.x + 5, p.y - 7);
        ctx.lineTo(p.x - 5, p.y - 7);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawLandmarks(ctx, run, toScreen) {
    for (var i = 0; i < LANDMARKS.length; i++) {
      var lm = LANDMARKS[i];
      if (Math.abs(lm.at - run.x) > 170) continue;
      var p = toScreen(lm.at, 0);
      ctx.fillStyle = PALETTE.gold;
      if (i === LANDMARKS.length - 1) {          // the far shore
        ctx.fillStyle = PALETTE.sand;
        ctx.fillRect(p.x, p.y - 8, 400, 40);
      } else if (i === 4) {                      // the lighthouse
        ctx.fillRect(p.x - 6, p.y - 60, 12, 60);
        ctx.fillStyle = PALETTE.paper;
        ctx.fillRect(p.x - 8, p.y - 68, 16, 10);
      } else if (i === 3) {                      // the palm islet
        ctx.fillStyle = PALETTE.sand;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 4, 40, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.green;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 26, 12, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - 4, p.y - 22, 8, 22);
      }
      // Canvas text reads from I18N at draw time, so a language flip needs no reload.
      ctx.fillStyle = PALETTE.paper;
      ctx.font = '600 15px Cairo, Segoe UI, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(root.I18N.t(lm.key), p.x, p.y - 78);
    }
  }

  function drawCharge(ctx, run) {
    var w = 280, h = 20, x = (VIEW_W - w) / 2, y = 60;
    ctx.fillStyle = 'rgba(34,48,58,0.72)';
    ctx.fillRect(x - 10, y - 44, w + 20, h + 74);
    ctx.fillStyle = PALETTE.paper;
    ctx.font = '700 22px Cairo, Segoe UI, Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(root.I18N.t('run.charge'), VIEW_W / 2, y - 16);
    ctx.fillStyle = 'rgba(253,246,232,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(x, y, w * (run.power / 100), h);
    ctx.fillStyle = PALETTE.paper;
    ctx.font = '400 14px Cairo, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(root.I18N.t(hasFinePointer() ? 'run.chargeHintKey' : 'run.chargeHintTouch'),
                 VIEW_W / 2, y + h + 22);
  }

  function drawToasts(ctx, run) {
    ctx.textAlign = 'center';
    for (var i = 0; i < run.events.length; i++) {
      var e = run.events[i];
      var age = run.t - e.t;
      if (age > 1.4 || age < 0) continue;
      ctx.globalAlpha = clamp(1 - age / 1.4, 0, 1);
      ctx.fillStyle = e.key === 'run.birdHit' ? PALETTE.skyMid : PALETTE.gold;
      ctx.font = '700 20px Cairo, Segoe UI, Tahoma, sans-serif';
      var text = root.I18N.t(e.key);
      if (e.extra) text += ' — ' + root.I18N.t(e.extra);
      ctx.fillText(text, VIEW_W / 2, 150 + i * 26 - age * 20);
    }
    ctx.globalAlpha = 1;
  }

  /* `playing` gates the in-run overlays: the idle run drawn behind the start
   * screen is still in its charging phase, and must not show the power meter. */
  function render(ctx, run, reducedMotion, playing) {
    /* The playfield never mirrors: the cart always travels left -> right in both
     * languages (GAME_PLAN.md section 1.1). */
    var camX = run.x - VIEW_W / PPM * 0.3;
    var camY = Math.max(0, run.y - 45);
    function toScreen(wx, wy) {
      return { x: (wx - camX) * PPM, y: SEA_Y - (wy - camY) * PPM };
    }
    var t = reducedMotion ? 0 : run.t;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawSky(ctx, camY * PPM);
    drawSun(ctx, camX * PPM, camY * PPM);
    drawSkyline(ctx, camX * PPM, camY * PPM, clamp(1 - camX / 900, 0, 1));
    drawFarShore(ctx, camX * PPM, camY * PPM,
                 clamp((camX - (TUNE.winDistance - 1200)) / 1000, 0, 1));
    drawSea(ctx, camX, camY * PPM, t);
    drawRamp(ctx, toScreen);
    drawLandmarks(ctx, run, toScreen);
    drawEntities(ctx, run, toScreen);
    drawCart(ctx, run, toScreen);
    if (playing && run.phase === 'charging') drawCharge(ctx, run);
    if (playing) drawToasts(ctx, run);
  }

  function hasFinePointer() {
    try {
      return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
    } catch (err) { return true; }
  }

  /* --------------------------------------------------------------------- boot */

  function boot() {
    var I18N = root.I18N;
    if (!I18N) return;
    I18N.init();

    var canvas = document.getElementById('stage');
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;

    var el = {};
    ['hud', 'hudDistance', 'hudBest', 'hudHeight', 'hudSpeed', 'hudRiyals', 'hudBoosts',
     'hudProgress', 'btnPause', 'btnLang', 'btnLangPaused', 'btnPlay', 'btnSouq', 'btnHow',
     'btnHowBack', 'btnSouqBack', 'btnResume', 'btnEndRun', 'btnAgain', 'btnResultSouq',
     'startBest', 'startBalance', 'souqBalance', 'souqGrid', 'souqNotice', 'resultTitle',
     'resultRecord', 'resultWinBody', 'resultDistance', 'resultBest', 'resultTime',
     'resultTimeLabel', 'resultDates', 'resultCups', 'resultEarned', 'resultBalance',
     'touchPads'
    ].forEach(function (id) { el[id] = document.getElementById(id); });

    var screens = {
      start: document.getElementById('screen-start'),
      how: document.getElementById('screen-how'),
      souq: document.getElementById('screen-souq'),
      paused: document.getElementById('screen-paused'),
      result: document.getElementById('screen-result')
    };

    var save = loadSave();
    var run = createRun(save.levels);   // a static frame to draw behind the start screen
    var state = 'start';
    var last = 0;
    var acc = 0;
    var reduced = false;
    try {
      reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) { /* older browsers: keep the motion */ }

    /* -- screen state machine: exactly one overlay visible, so no screen can leak
       -- input into another. */
    function show(next) {
      state = next;
      Object.keys(screens).forEach(function (k) {
        if (screens[k]) screens[k].hidden = k !== next;
      });
      var playing = next === 'playing';
      if (el.hud) el.hud.hidden = !(playing || next === 'paused');
      if (el.touchPads) el.touchPads.hidden = !playing || hasFinePointer();
      if (next === 'start') refreshStart();
      if (next === 'souq') refreshSouq();
      focusFirst(screens[next]);
    }

    function focusFirst(screen) {
      if (!screen) return;
      var btn = screen.querySelector('.btn-primary, .btn');
      if (btn && typeof btn.focus === 'function') btn.focus();
    }

    function refreshStart() {
      if (el.startBest) el.startBest.textContent = I18N.metres(save.best);
      if (el.startBalance) el.startBalance.textContent = I18N.riyals(save.riyals);
    }

    /* The toggle advertises the language you would get, not the one you are in —
     * "English" while reading Arabic. That is the only label in the game whose key
     * depends on the current language, so `data-i18n` cannot express it. */
    function refreshLangToggle() {
      var next = I18N.ORDER[(I18N.ORDER.indexOf(I18N.lang) + 1) % I18N.ORDER.length];
      var label = I18N.t('lang.' + next);
      if (el.btnLang) el.btnLang.textContent = label;
      if (el.btnLangPaused) el.btnLangPaused.textContent = label;
    }

    /* Souq cards are built from UPGRADES; every label comes from I18N. */
    function buildSouq() {
      if (!el.souqGrid) return;
      el.souqGrid.textContent = '';
      UPGRADES.forEach(function (u) {
        var card = document.createElement('article');
        card.className = 'card';
        card.dataset.upgrade = u.id;

        var h = document.createElement('h3');
        h.dataset.i18n = u.nameKey;
        var p = document.createElement('p');
        p.dataset.i18n = u.descKey;
        var pips = document.createElement('div');
        pips.className = 'pips';
        for (var i = 0; i < MAX_LEVEL; i++) {
          var pip = document.createElement('span');
          pip.className = 'pip';
          pips.appendChild(pip);
        }
        var level = document.createElement('p');
        level.className = 'level';
        var price = document.createElement('p');
        price.className = 'price';
        var buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'btn btn-primary buy';
        buy.dataset.i18n = 'souq.buy';
        buy.addEventListener('click', function () { purchase(u); });

        card.appendChild(h);
        card.appendChild(p);
        card.appendChild(pips);
        card.appendChild(level);
        card.appendChild(price);
        card.appendChild(buy);
        el.souqGrid.appendChild(card);
      });
      I18N.apply(el.souqGrid);
    }

    function refreshSouq() {
      if (el.souqBalance) el.souqBalance.textContent = I18N.riyals(save.riyals);
      UPGRADES.forEach(function (u) {
        var card = el.souqGrid && el.souqGrid.querySelector('[data-upgrade="' + u.id + '"]');
        if (!card) return;
        var level = save.levels[u.id];
        var cost = priceOf(u, level);
        var pips = card.querySelectorAll('.pip');
        for (var i = 0; i < pips.length; i++) {
          pips[i].classList.toggle('on', i < level);
        }
        var levelEl = card.querySelector('.level');
        var priceEl = card.querySelector('.price');
        var buy = card.querySelector('.buy');
        if (levelEl) levelEl.textContent = I18N.t('souq.level', { n: level });
        if (cost === null) {
          priceEl.textContent = I18N.t('souq.maxed');
          buy.disabled = true;
          buy.textContent = I18N.t('souq.maxed');
        } else {
          priceEl.textContent = I18N.t('souq.price') + ' ' + I18N.riyals(cost);
          buy.disabled = save.riyals < cost;
          buy.textContent = I18N.t('souq.buy');
        }
      });
    }

    function purchase(u) {
      var level = save.levels[u.id];
      var cost = priceOf(u, level);
      if (cost === null || save.riyals < cost) {
        if (el.souqNotice) {
          el.souqNotice.hidden = false;
          root.setTimeout(function () { el.souqNotice.hidden = true; }, 1800);
        }
        return;
      }
      save.riyals -= cost;
      save.levels[u.id] = level + 1;
      storeSave(save);
      refreshSouq();
    }

    function startRun() {
      run = createRun(save.levels);
      acc = 0;
      show('playing');
    }

    function finish() {
      var won = run.phase === 'won';
      save.riyals += run.earned;
      var record = Math.floor(run.x) > save.best;
      if (record) save.best = Math.floor(run.x);
      if (won) {
        save.won = true;
        if (save.bestTime === null || run.t < save.bestTime) save.bestTime = run.t;
      }
      storeSave(save);

      if (el.resultTitle) el.resultTitle.dataset.i18n = won ? 'win.title' : 'result.title';
      if (el.resultRecord) el.resultRecord.hidden = !record;
      if (el.resultWinBody) el.resultWinBody.hidden = !won;
      if (el.resultDistance) el.resultDistance.textContent = I18N.metres(run.x);
      if (el.resultBest) el.resultBest.textContent = I18N.metres(save.best);
      if (el.resultTimeLabel) el.resultTimeLabel.hidden = !won;
      if (el.resultTime) {
        el.resultTime.hidden = !won;
        el.resultTime.textContent = I18N.seconds(run.t);
      }
      if (el.resultDates) el.resultDates.textContent = I18N.num(run.dates);
      if (el.resultCups) el.resultCups.textContent = I18N.num(run.cups);
      if (el.resultEarned) el.resultEarned.textContent = I18N.riyals(run.earned);
      if (el.resultBalance) el.resultBalance.textContent = I18N.riyals(save.riyals);
      if (el.btnAgain) el.btnAgain.dataset.i18n = won ? 'win.replay' : 'result.again';
      I18N.apply(screens.result);
      show('result');
    }

    function refreshHud() {
      if (el.hudDistance) el.hudDistance.textContent = I18N.metres(run.x);
      if (el.hudBest) el.hudBest.textContent = I18N.metres(save.best);
      if (el.hudHeight) el.hudHeight.textContent = I18N.metres(Math.max(0, run.y));
      if (el.hudSpeed) el.hudSpeed.textContent = I18N.speed(run.vx);
      if (el.hudRiyals) el.hudRiyals.textContent = I18N.riyals(riyalsFor(run));
      if (el.hudBoosts) el.hudBoosts.textContent = I18N.num(run.boosts);
      if (el.hudProgress) {
        /* The fill follows the cart (left -> right), matching what the player sees. */
        el.hudProgress.style.width =
          (clamp(run.x / TUNE.winDistance, 0, 1) * 100).toFixed(1) + '%';
      }
    }

    /* ------------------------------------------------------------ input */

    function pressAction() {
      if (state !== 'playing') return;
      press(run);
    }

    function setSteer(dir, on) {
      if (dir === 'up') run.input.up = on;
      if (dir === 'down') run.input.down = on;
    }

    function onKeyDown(e) {
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { setSteer('up', true); e.preventDefault(); return; }
      if (k === 'ArrowDown' || k === 's' || k === 'S') { setSteer('down', true); e.preventDefault(); return; }
      if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        if (state === 'playing') { pressAction(); e.preventDefault(); }
        return;
      }
      if (k === 'p' || k === 'P' || k === 'Escape') {
        if (state === 'playing') togglePause(true);
        else if (state === 'paused') togglePause(false);
        return;
      }
      if ((k === 'l' || k === 'L') && (state === 'start' || state === 'paused')) I18N.toggle();
    }

    function onKeyUp(e) {
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setSteer('up', false);
      if (k === 'ArrowDown' || k === 's' || k === 'S') setSteer('down', false);
    }

    function togglePause(on) {
      if (on && state === 'playing') { show('paused'); return; }
      if (!on && state === 'paused') { last = 0; show('playing'); }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Touch: tap anywhere locks the launch / fires the rocket; the pads steer.
    canvas.addEventListener('pointerdown', function (e) {
      if (state !== 'playing') return;
      pressAction();
      if (e.pointerType !== 'mouse') e.preventDefault();
    });

    function bindPad(node, dir) {
      if (!node) return;
      node.addEventListener('pointerdown', function (e) {
        setSteer(dir, true);
        pressAction();
        e.preventDefault();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
        node.addEventListener(evt, function () { setSteer(dir, false); });
      });
    }
    if (el.touchPads) {
      bindPad(el.touchPads.querySelector('.pad-up'), 'up');
      bindPad(el.touchPads.querySelector('.pad-down'), 'down');
    }

    function on(node, fn) { if (node) node.addEventListener('click', fn); }
    on(el.btnPlay, startRun);
    on(el.btnHow, function () { show('how'); });
    on(el.btnHowBack, function () { show('start'); });
    on(el.btnSouq, function () { show('souq'); });
    on(el.btnSouqBack, function () { show('start'); });
    on(el.btnPause, function () { togglePause(true); });
    on(el.btnResume, function () { togglePause(false); });
    on(el.btnEndRun, function () { endRun(run, false); finish(); });
    on(el.btnAgain, startRun);
    on(el.btnResultSouq, function () { show('souq'); });
    on(el.btnLang, function () { I18N.toggle(); });
    on(el.btnLangPaused, function () { I18N.toggle(); });

    /* Canvas text is not in the DOM, so the render layer refreshes itself on a
     * language flip. No reload, ever. */
    I18N.onChange(function () {
      refreshLangToggle();
      refreshStart();
      if (state === 'souq') refreshSouq();
      if (state === 'playing' || state === 'paused') refreshHud();
      draw();
    });

    /* ----------------------------------------------------------- the loop */

    function resize() {
      var dpr = root.devicePixelRatio || 1;
      var w = canvas.clientWidth || VIEW_W;
      var h = canvas.clientHeight || VIEW_H;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      var scale = Math.min(w / VIEW_W, h / VIEW_H);
      ctx.setTransform(
        scale * dpr, 0, 0, scale * dpr,
        (w - VIEW_W * scale) / 2 * dpr,
        (h - VIEW_H * scale) / 2 * dpr
      );
      draw();
    }

    function draw() { render(ctx, run, reduced, state === 'playing' || state === 'paused'); }

    function frame(now) {
      var dt = last ? (now - last) / 1000 : STEP;
      last = now;
      if (state === 'playing') {
        acc += Math.min(dt, MAX_FRAME);
        while (acc >= STEP) {
          step(run, STEP);
          acc -= STEP;
          if (run.phase === 'over' || run.phase === 'won') { acc = 0; break; }
        }
        refreshHud();
        draw();
        if (run.phase === 'over' || run.phase === 'won') finish();
      }
      root.requestAnimationFrame(frame);
    }

    /* QA hook (ABD-7): reaching 6,000 m by hand is a long session, so expose the
     * live run and save for inspection and for jumping to a deep state. Read-only
     * by nature — the game never calls this itself. */
    root.Corniche.debug = {
      getRun: function () { return run; },
      getSave: function () { return save; },
      getState: function () { return state; },
      jumpTo: function (metres) { if (state === 'playing') run.x = Number(metres) || 0; },
      grantRiyals: function (n) { save.riyals += Number(n) || 0; storeSave(save); refreshStart(); }
    };

    root.addEventListener('resize', resize);
    buildSouq();
    refreshLangToggle();
    show('start');
    resize();
    root.requestAnimationFrame(frame);
  }

  return {
    VIEW_W: VIEW_W, VIEW_H: VIEW_H, PPM: PPM, SEA_Y: SEA_Y, STEP: STEP,
    TUNE: TUNE, UPGRADES: UPGRADES, MAX_LEVEL: MAX_LEVEL, LANDMARKS: LANDMARKS,
    PALETTE: PALETTE, SAVE_KEY: SAVE_KEY,
    emptyLevels: emptyLevels, priceOf: priceOf, defaultSave: defaultSave,
    createRun: createRun, step: step, press: press, launch: launch,
    fireRocket: fireRocket, riyalsFor: riyalsFor, endRun: endRun,
    dhowTop: dhowTop, crestOffset: crestOffset, generate: generate,
    boot: boot
  };
});
