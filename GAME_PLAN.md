# Game plan — عربة الكورنيش / Corniche Cart

> **Source of truth.** This file is the in-repo copy of the plan document accepted on
> ABD-8, revision `238620ed-3844-4d1e-a195-b2bc78a4c543`. The plan document on the
> issue remains canonical; this copy exists so the build, design and test issues can
> read it without leaving the repo. If the two ever disagree, the issue document wins.
>
> **One correction against the accepted text.** The accepted revision carried a scope
> note warning that the workspace held an earlier, unrelated build (`Voltway`). That
> is no longer true: this repository was attached to the project after the plan was
> accepted and started empty apart from `README.md`. There is nothing to reconcile —
> ABD-5 builds Corniche Cart on a clean tree. No other part of the plan is changed.

**One line:** انطلق بعربة السوق من منحدر كورنيش جدة، واقفز على السنابيك، واعبر البحر الأحمر إلى الضفة الأخرى.
**One line (EN):** Launch a souq cart off a ramp on the Jeddah Corniche, skip across the Red Sea on dhow boats, and reach the far shore.

Genre: a **launch-and-upgrade distance runner** (charge a launch, fly/skim as far as you can, spend riyals, launch again). One run is 30–90 seconds, so a failed run costs nothing and always buys progress.

---

## 1. Language and localisation

This section is the spec of record for the language requirement. Every bullet the board asked for maps to a decision here, and the decisions are already implemented in `i18n.js` (see §10).

| Requirement | Decision |
|---|---|
| Arabic and English, toggle on the start screen | A two-state toggle — **العربية / English** — pinned to the start screen header, always visible before the first run. Also reachable from Paused and from the Souq, so nobody has to lose a run to change language. |
| Arabic is the default | `DEFAULT_LANG = 'ar'`. A stored preference wins; otherwise Arabic. The browser's `Accept-Language` is deliberately **not** sniffed — Arabic is the intended first impression, not a guess. |
| Proper RTL when Arabic is selected | One switch: `<html lang="ar" dir="rtl">`, set by `I18N.apply()`. All CSS uses logical properties (`margin-inline-start`, `inset-inline-end`, `padding-inline`, `text-align: start`) so no layout rule needs an RTL override. See §1.1 for what mirrors and what does not. |
| Clean Arabic font | **Cairo** (Google Fonts, weights 400/600/700). One family covers Arabic *and* Latin, so the two languages share a single load and identical metrics. Fallback: `'Cairo', 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif`. Loaded with `preconnect` + `display=swap`; if the font is blocked or offline the fallback is metric-compatible and layout is unchanged. |
| Numbers, coins and scores display correctly in both languages | All numbers go through `I18N.num()` / `.metres()` / `.riyals()` / `.speed()`, never `String(n)`. Formatting is `Intl.NumberFormat` with an explicit numbering system. **Both languages use Western digits (1 2 3) by default** — Saudi scoreboards, prices and app UIs overwhelmingly do, and mixed-digit screens read badly. Flipping Arabic to Arabic-Indic (١ ٢ ٣) is a **one-word edit**: `LANGS.ar.numbering = 'arab'`. That switch is covered by a test. |
| All text in one translation file | `i18n.js` is the only file in the project allowed to contain a user-visible string. Markup carries keys (`data-i18n="hud.distance"`), never words. |

### 1.1 What mirrors in RTL — and what does not

- **Mirrors:** menus, HUD stat order, buttons, the Souq grid, dialog layout, back-arrow direction, focus order.
- **Does not mirror:** the **playfield**. The cart always travels left → right and the camera always follows it that way, in both languages. This is a deliberate call: the run is a physical simulation, not prose. Mirroring it would flip every piece of art, invert the meaning of the steering keys, and make "forward" mean two different things depending on menu language. The reference RTL games (and Apple/Google RTL guidance for game content) keep world motion fixed and mirror only chrome.
- **Progress bar:** the *fill* follows the cart (left → right, so it matches what the player sees), while the label and the landmark names sit on the language-appropriate side.
- **Numbers inside Arabic sentences** stay LTR internally — `Intl` handles this. Unit-bearing values are built as `number + space + unit` (`1,240 م`, `12,500 ر.س`) and the container's `dir` puts the unit on the correct side.

### 1.2 Rules the implementer must hold

1. No string literal in `index.html`, `game.js` or `style.css`. Review rejects one on sight.
2. Every key exists in **every** language. `I18N.missingKeys()` proves it, and `qa/i18n-check.mjs` fails the build if it drifts.
3. Canvas text is not in the DOM — the render layer subscribes via `I18N.onChange()` and redraws its labels on a language flip. No reload, ever.
4. Arabic strings are written to avoid plural agreement (`المسافة: 1,240 م`, not "1,240 metres"), which keeps the table free of Arabic's six plural forms.
5. A missing translation degrades to the default language and then to the key — never to `undefined` on screen.

---

## 2. Theme and setting

The run starts on a **ramp at the Jeddah Corniche** at sunset and ends when the cart either stops in the water or reaches **land on the far side of the Red Sea**.

- **The cart:** a decorated wooden **souq trolley** — painted panels, brass trim, two large spoked wheels, a small canopy fringe that flutters at speed. It carries crates of dates.
- **Foreground / launch area:** the corniche walkway, tiled ramp, palm trees, iron lanterns, a fishing rail.
- **Background layers (parallax, 3 depths):** Al-Balad coral-stone houses with wooden **rawasheen** windows nearest, the modern **Jeddah skyline** mid-depth, a low sun and banded sunset sky farthest.
- **Over water:** the sea surface with gentle swell, distant sails, buoys, a coral reef, a palm islet, a lighthouse, and finally the far shore.

**Respectfulness guardrails (non-negotiable):**
- No religious imagery, text, or audio anywhere in the game.
- **The Saudi flag is never used** as decoration, a collectible, a bounce object, or a UI motif — it carries the shahada and must not be treated as a game prop. National colour (green) is used as an accent only.
- No caricature of people; characters are absent or shown as simple, dignified silhouettes.
- Family-friendly throughout: no violence, the cart never harms an animal, and falcons and seagulls simply knock the cart off course.

---

## 3. Core loop

```
Start screen ─► charge the launch ─► fly / glide / bounce / skim ─► run ends
      ▲                                                                │
      └──────────── Souq (spend riyals on upgrades) ◄──────────────────┘
```

1. **Charge.** A power meter sweeps 0–100%. Press Space / tap to lock it in. The cart rolls down the ramp and launches at a fixed 35°.
2. **Fly.** Steer with ↑ / ↓. Hold ↑ to **glide** (Falcon Wings). Press Space in the air to fire the **Oud Rocket**.
3. **Interact.** Bounce off **dhows** for height and speed. Dodge **falcons** and **seagulls**. Collect **dates** and **coffee cups**.
4. **Skim.** Hitting the sea at a shallow angle skips the cart like a stone; a steep hit plunges it.
5. **End.** The run ends when forward speed drops below 6 m/s on the water — or at 6,000 m, the far shore, which is the win.
6. **Spend.** Riyals earned are banked, then spent in the **Souq**. Upgrades are permanent, so each run reaches farther than the last.

---

## 4. Controls

| Input | Keyboard | Touch |
|---|---|---|
| Lock launch power | `Space` / `Enter` | Tap anywhere |
| Steer up / down | `↑` `↓` (or `W` `S`) | Swipe or hold upper / lower half |
| Glide | hold `↑` | hold upper half |
| Oud Rocket | `Space` in mid-air | tap in mid-air |
| Pause | `P` / `Esc` | pause button in the HUD |
| Language | `L` on the start screen | the **العربية / English** toggle |

Both control schemes are first-class; the hint line swaps by pointer type, not by viewport width.

---

## 5. Flight model (concrete numbers for ABD-5)

Logical canvas **960 × 540**, camera scrolls horizontally with the cart, `1 m = 6 px`. Fixed 60 Hz simulation step with `dt` clamped to 50 ms, so a stalled tab cannot tunnel the cart through anything.

| Quantity | Value |
|---|---|
| Launch angle | 35° fixed |
| Launch speed | `22 + 0.10 × power%` m/s, `+4` per Camel Power level |
| Ramp roll speed | `+0 … +5` m/s from Sadu Wheels (5 levels) |
| Gravity | 22 m/s² (9 m/s² while gliding) |
| Glide fuel | `2.0 s + 0.6 s` per Falcon Wings level, refilled by every bounce |
| Oud Rocket | `+12 m/s` forward, one charge per owned level, per run |
| Dhow bounce | vertical velocity reflected × `1.15 + 0.05` per Dhow Springs level, `+8%` forward speed |
| Perfect bounce | landing within 0.15 s of the dhow's crest: `×1.30` and `+10%` riyals for the run |
| Bird hit | `−25%` forward speed, 0.6 s tumble with no steering |
| Water skim | descent < 12 m/s → skip, retaining 70% of speed. Steeper → plunge, speed × 0.25 |
| Run ends | forward speed < 6 m/s while touching water |

## 6. Obstacles, bouncers, collectibles

| Thing | Role | Effect |
|---|---|---|
| **صقر / Falcon** | obstacle, air | fast, dives at the cart; `−25%` speed |
| **نورس / Seagull** | obstacle, air | slow, drifts in flocks; `−25%` speed |
| **سنبوك / Dhow** | bouncer, sea | bounce for height and speed; the core skill of the game |
| **تمر / Dates** | collectible | **5 ريال**, `×(1 + 0.4 per Date Bag level)` |
| **دلّة وفنجان / Coffee cup** | collectible | **15 ريال**, rarer, placed on the high glide line to reward altitude |
| **فانوس / Lantern** | scenery | pure decoration, lights up as the sun sets |

Spawning is band-based, not random-anywhere: birds only above the skim line, dhows only on the water, collectibles only in reachable air. Nothing is ever placed where the cart cannot legally get to it.

## 7. Economy — riyals (ر.س)

- **1 ر.س per 10 m** travelled, plus collectibles, plus the perfect-bounce bonus.
- A first run earns roughly **60–120 ر.س**; a well-upgraded run earns **1,500+**.
- Coins are displayed as riyals everywhere — `12,500 ر.س` / `12,500 SAR` — via `I18N.riyals()`.
- Balance persists in `localStorage` under `cornicheCart.save`. A storage failure is caught and ignored: the game still plays, it just stops remembering.

### Upgrades (5 levels each, local names)

| Upgrade | Arabic | What it does | Level 1 → 5 price |
|---|---|---|---|
| Sadu Wheels | عجلات السدو | faster roll down the ramp | 120 / 260 / 560 / 1,200 / 2,500 |
| Camel Power | قوة الجمل | stronger launch | 150 / 320 / 700 / 1,500 / 3,200 |
| Dhow Springs | نوابض السنبوك | bouncier boat hops | 180 / 400 / 850 / 1,800 / 3,800 |
| Falcon Wings | أجنحة الصقر | longer glide | 200 / 450 / 950 / 2,000 / 4,200 |
| Date Bag | كيس التمر | dates are worth more | 100 / 240 / 520 / 1,100 / 2,400 |
| Oud Rocket | صاروخ العود | mid-air boost charges | 400 / 900 / 1,900 / 4,000 / 8,500 |

Cheap early, expensive late, with the Oud Rocket as the aspirational buy — the curve is tuned so the first three or four runs each unlock something.

## 8. Progression and win condition

Landmarks every 1,000 m give a run shape and make partial progress feel like progress:

| Distance | Landmark |
|---|---|
| 1,000 m | المرسى / the marina buoys |
| 2,000 m | كاسر الأمواج / the breakwater |
| 3,000 m | الشعاب المرجانية / the coral reef |
| 4,000 m | جزيرة النخيل / the palm islet |
| 5,000 m | الفنار / the lighthouse |
| **6,000 m** | **الضفة الأخرى / the far shore — you win** |

- **Win:** reach 6,000 m in a single run. The cart rolls up onto sand and the **«عبرتَ البحر الأحمر!»** screen shows distance, riyals earned and the crossing time. The game stays replayable afterwards (chase a better distance / time).
- **Lose:** there is no losing, only a shorter run. Every run banks riyals, which is what keeps a 40-second failure worth repeating.
- **Best distance** persists and shows on the start screen and every result screen.

## 9. Screens

| Screen | Contents |
|---|---|
| **Start** | Bilingual title, tagline, **العربية / English** toggle, best distance, balance, `العب / Play`, `السوق / Souq`, `كيف تلعب / How to play`. |
| **How to play** | The four steps from §3, both control tables, back button. |
| **Souq** | Balance, six upgrade cards (name, description, level pips, price, Buy), `الريالات غير كافية` state, back button. |
| **Charging** | The ramp, the cart, the sweeping power meter, `اشحن الانطلاق / Charge your launch`. |
| **Running (HUD)** | Distance, best, height, speed, riyals, boost charges, progress-to-far-shore bar, pause button. |
| **Paused** | Dim overlay, resume, end run, language toggle. |
| **Result** | Distance, new-record flag, dates, coffee cups, riyals earned, `انطلق مرة أخرى`, `إلى السوق`. |
| **Win** | «عبرتَ البحر الأحمر!», final stats, play again. |

Screens are sibling DOM overlays driven by one state machine — `start ⇄ how ⇄ souq → charging → running ⇄ paused → result → …` — with exactly one visible, so no screen can leak input into another.

## 10. Files, and what already exists

| File | Status | Owner |
|---|---|---|
| **`i18n.js`** | **in this repo, written and tested** — 83 keys × 2 languages, `t/num/metres/riyals/speed/setLang/toggle/onChange/apply/missingKeys` | ABD-8 |
| **`qa/i18n-check.mjs`** | **in this repo, passing — 17/17 checks** (`node qa/i18n-check.mjs`) | ABD-8 |
| `index.html` | to build: key-bearing markup only (`data-i18n`, `data-i18n-aria-label`), Cairo `<link>`, canvas, screen overlays | ABD-5 |
| `game.js` | to build: sim, render, spawn bands, economy, save; subscribes to `I18N.onChange` | ABD-5 |
| `style.css` | to build: logical properties throughout, palette in `:root`, Sadu pattern borders | ABD-6 |

`i18n.js` is a UMD module: it attaches `window.I18N` in the browser and exports the same API under Node, which is how the QA check runs headless with no browser.

## 11. Art direction notes for ABD-6

- **Palette:** sunset sky `#f7b267 → #e07a5f → #3d5a80`; sea `#1b6b7a → #0e3c4a`; sand `#e8d5a9`; coral stone `#cbb399`; rawasheen wood `#7a4f2a`; gold accent `#d4af37`; green accent `#165d31`.
- **Sadu patterns** as UI framing only — repeating geometric bands on panel edges, buttons and the progress bar, never behind body text where they would hurt legibility.
- Warm desert and sea tones dominate; gold for currency and rewards, green for confirmation and progress.
- Every colour lives in a CSS custom property on `:root`; every canvas colour lives in one `PALETTE` object.
- Text contrast must clear **WCAG AA (4.5:1)** in both languages — check Arabic separately, since Cairo's lighter weights on the sunset gradient are the risky case.

## 12. Accessibility

- Full keyboard play and a visible focus ring on every control, in both directions.
- `prefers-reduced-motion` calms parallax, screen shake and the sun's shimmer.
- HUD values are `aria-live="polite"`; the canvas has a translated `aria-label`.
- Touch targets ≥ 44 px, thumb-reachable at the bottom of the screen in both LTR and RTL.

## 13. Acceptance criteria

Language (the newest requirement — test these first):

1. A first-ever visit opens in **Arabic**, with `<html lang="ar" dir="rtl">`.
2. The start screen shows a working **العربية / English** toggle; switching re-renders every string, including canvas labels, with **no page reload**.
3. The chosen language survives a reload; clearing storage returns to Arabic.
4. In Arabic, menus / HUD / Souq are mirrored, while the cart still flies left → right.
5. Distance, riyals, best score and upgrade prices are formatted by `I18N` in both languages — `1,240 م` / `1,240 m`, `12,500 ر.س` / `12,500 SAR` — with no raw `NaN`/`undefined` reachable.
6. `grep` finds **no** user-visible string outside `i18n.js`.
7. `node qa/i18n-check.mjs` exits 0.
8. Cairo renders both scripts; with the font request blocked, layout is unchanged.

Gameplay:

9. A charged launch travels a plausible distance; 100% charge with no upgrades reaches roughly 400–700 m.
10. Dhow bounces add height; a perfect bounce is distinguishable and rewarded.
11. Bird hits cost speed and never kill outright.
12. Riyals and best distance persist; blocked `localStorage` degrades quietly.
13. Reaching 6,000 m shows the win screen; the game remains replayable.
14. Playable at 60 fps on a mid-range phone, portrait and landscape.
15. Nothing in the build breaks the respectfulness guardrails in §2.

## 14. Handoff

- **ABD-5** — build against this plan; `i18n.js` is a dependency, not a suggestion. The repo is clean, so build Corniche Cart directly (see the correction note at the top).
- **ABD-6** — look and feel per §11, RTL-safe with logical properties only.
- **ABD-7** — test §13, running the Arabic pass and the English pass separately.

## 15. Open questions for the board

1. **6,000 m** as the crossing distance is a guess at "one satisfying evening of play" — happy to shorten it to 4,000 m if you want the win reachable sooner.
2. Western digits in Arabic is the default (§1). Say the word and Arabic-Indic becomes one line.
3. Audio is not specified yet. If you want it, an oud/darbuka sting on bounce and an ambient sea loop would fit — and it needs a licence decision.
