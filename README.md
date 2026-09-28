# عربة الكورنيش / Corniche Cart

Launch a decorated souq cart off a ramp on the Jeddah Corniche, skip across the
Red Sea on dhow boats, and try to reach land on the far side.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no dependencies.

Built against [`GAME_PLAN.md`](GAME_PLAN.md) (mirrored from the ABD-8 plan document).

---

## Running it

It is a static page, so either of these works:

```bash
# 1. just open it
start index.html          # Windows
open index.html           # macOS

# 2. or serve it, which is closer to how it will be deployed
npx serve .
python -m http.server 8000
```

Opening the file directly works because nothing is loaded over `fetch` or as an
ES module. The only network request is the Cairo webfont; with that blocked or
offline the game still plays and the layout is unchanged, because the fallback
stack is metric-compatible.

Tested in Chrome. Requires a browser with `Intl.NumberFormat` and pointer events
— anything from the last few years.

---

## How to play

1. **Charge.** A power meter sweeps 0–100%. Lock it in; the cart rolls down the
   ramp and launches at a fixed 35°.
2. **Fly.** Steer up and down. Hold up to glide (Falcon Wings).
3. **Interact.** Bounce off **dhows** for height and speed — this is the core
   skill. Dodge **falcons** and **seagulls**. Collect **dates** and **coffee cups**.
4. **Skim.** Meeting the sea at a shallow angle skips the cart like a stone; a
   steep hit plunges it.
5. **End.** The run ends when forward speed drops below 6 m/s on the water — or
   at 6,000 m, the far shore, which is the win.
6. **Spend.** Riyals are banked and spent in the **Souq**. Upgrades are permanent,
   so each run reaches farther than the last.

There is no losing, only a shorter run. Every run banks riyals, which is what
makes a 40-second failure worth repeating.

### Controls

| Action | Keyboard | Touch |
|---|---|---|
| Lock launch power | `Space` / `Enter` | Tap anywhere |
| Steer up / down | `↑` `↓` or `W` `S` | Hold the upper / lower half |
| Glide | hold `↑` | hold the upper half |
| Oud Rocket | `Space` in mid-air | tap in mid-air |
| Pause | `P` / `Esc` | the pause button in the HUD |
| Language | `L` on the start screen | the **العربية / English** toggle |

Both schemes are first-class. The on-screen hint swaps by pointer type, not by
viewport width.

### Upgrades

Six upgrades, five levels each, cheap early and expensive late: Sadu Wheels
(عجلات السدو), Camel Power (قوة الجمل), Dhow Springs (نوابض السنبوك), Falcon
Wings (أجنحة الصقر), Date Bag (كيس التمر) and the Oud Rocket (صاروخ العود).

You will not cross the sea on your first run. A first run earns roughly 60–120
ر.س; reaching the far shore takes a well-upgraded cart and good bouncing.

---

## Language

Arabic is the default and the game opens `<html lang="ar" dir="rtl">`. The
**العربية / English** toggle is on the start screen and in the pause menu, and
switching re-renders everything — including the labels drawn on the canvas —
with no page reload. The choice persists; clearing storage returns to Arabic.

Menus, HUD and the Souq mirror in RTL. **The playfield deliberately does not**:
the cart always travels left → right in both languages, because mirroring a
physical simulation would flip every sprite and invert the meaning of the
steering keys.

`i18n.js` is the only file allowed to contain a user-visible string. Markup
carries keys (`data-i18n="hud.distance"`), never words, and `qa/i18n-check.mjs`
fails if a string escapes or a key goes missing from either language.

Both languages use Western digits (1 2 3) by default, as Saudi scoreboards and
app UIs overwhelmingly do. Switching Arabic to Arabic-Indic (١ ٢ ٣) is a
one-word edit — `LANGS.ar.numbering = 'arab'` in `i18n.js` — and is covered by a
test.

---

## Files

| File | What it is |
|---|---|
| `index.html` | Key-bearing markup: the canvas, the screen overlays, the HUD |
| `game.js` | Simulation, rendering, spawning, economy, save |
| `style.css` | Plain layout only — **ABD-6 owns the look and feel** |
| `i18n.js` | The translation table and number formatting (115 keys × 2 languages) |
| `GAME_PLAN.md` | The design this was built against |
| `qa/` | Headless checks, the browser smoke test, reference screenshots |

`i18n.js` and `game.js` are UMD: they attach to `window` in the browser and
export the same API under Node, which is how the checks run with no browser.

---

## Tests

No install needed; all three run on plain Node.

```bash
node qa/i18n-check.mjs   # 17 checks — translation table, RTL, number formatting
node qa/sim-check.mjs    # 34 checks — the real simulation, played headless
```

`sim-check` plays complete runs through the same `step()` the browser uses,
including a ballistic autopilot that aims for dhows to stand in for a skilled
player. It asserts the plan's acceptance criteria: a first launch lands in
400–700 m, bird hits cost speed but never kill, the far shore is reachable with
upgrades and *not* without them, and every run terminates.

The browser smoke test drives the real page in Chrome — every screen, keyboard
and touch play, pause and resume, restart, the winning crossing, persistence
across reloads, a phone viewport, blocked `localStorage`, and zero console
errors. It is the only check with a dependency:

```bash
npm install puppeteer-core
node qa/smoke.mjs               # 42 checks; set CHROME_PATH if Chrome is elsewhere
```

It writes screenshots to `qa/screenshots/`, which is gitignored — regenerate them
by running the test rather than reading stale pixels from the repo.

### QA hook

Reaching 6,000 m by hand is a long session, so the browser exposes a debug
handle for testing deep states. The game never calls it itself:

```js
Corniche.debug.jumpTo(5900)     // during a run: teleport to a distance
Corniche.debug.grantRiyals(5e4) // fund the Souq to test upgrades
Corniche.debug.getRun()         // inspect live run state
Corniche.debug.getSave()        // inspect the persisted save
```

---

## Tuning: where this build departs from the plan

Two numbers in `GAME_PLAN.md` §5 could not be implemented as written, because
they contradict the plan's own acceptance criteria. Both changes are marked in
`game.js` and are flagged for ABD-8 to confirm.

**1. The skim rule is an angle, not an absolute speed.** §3 says "a shallow
*angle* skips, a steep hit plunges", while the §5 table restates it as "descent
< 12 m/s". No 35° launch can ever satisfy the second: launch velocity alone puts
the vertical component at 12.6–18.4 m/s, so *every* water contact plunged, no
skip chain could start, and a stronger launch was actively punished for arriving
faster. Implemented as the prose describes — shallower than ~50° skips — with an
absolute guard so a true nose-dive still plunges.

**2. Gravity is 9 m/s², not 22.** At 22 m/s² a full-charge, no-upgrade run
travels about 52 m, against the 400–700 m that criterion 9 requires. The ratio
the plan cares about (gliding is roughly 2.4× floatier than free fall) is
preserved; only the scale moved. It now measures 482 m over eight seeds.

Two smaller additions, both to remove luck and guarantee termination:

- **No birds in the first 130 m.** Without a grace zone, an early bird hit
  (−25% speed) dropped the cart below the skim angle and ended a run at ~100 m,
  making the opening a coin flip rather than a launch.
- **A stall timer ends a run.** The bounce originally had a flat "always lift to
  8 m/s" floor, which let a cart limping at 3 m/s hop between boats forever — a
  run genuinely never ended. The floor is now proportional to forward speed, a
  stalled cart is not rescued by a boat, and a cart that is too slow on the
  surface for half a second ends the run.

Balance as it stands: a passive full-charge run averages **482 m**, a skilled
run with no upgrades reaches **~900 m**, and a maxed cart played well crosses
the sea in about **7 of 8 runs**.

---

## Open questions for the board

Carried over from `GAME_PLAN.md` §15, still unanswered:

1. **6,000 m** as the crossing distance is a guess at one satisfying evening of
   play. It is reachable as built, but shortening it to 4,000 m would make the
   win land sooner.
2. Western digits in Arabic is the current default (see above).
3. No audio is implemented; the plan notes it would need a licence decision.

## Not in scope here

Visual design is **ABD-6** — `style.css` is deliberately plain. Test and bug
reports are **ABD-7**.
