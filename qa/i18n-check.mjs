/* qa/i18n-check.mjs — headless checks for i18n.js (no browser needed).
   Run: node qa/i18n-check.mjs
   Exits non-zero on the first broken invariant, so it can gate a build. */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let failures = 0;
function ok(cond, label) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  if (!cond) failures++;
}

function load() {
  delete require.cache[require.resolve('../i18n.js')];
  return require('../i18n.js');
}

const I = load();

/* --- 1. every language carries every key ---------------------------------- */
const missing = I.missingKeys();
ok(
  Object.keys(missing).length === 0,
  `key parity across ${I.ORDER.join('/')} (${Object.keys(I.STRINGS.ar).length} keys) ${JSON.stringify(missing)}`
);

/* --- 2. no empty or untranslated-looking values --------------------------- */
const blanks = [];
for (const code of Object.keys(I.STRINGS)) {
  for (const [k, v] of Object.entries(I.STRINGS[code])) {
    if (typeof v !== 'string' || v.trim() === '') blanks.push(`${code}:${k}`);
  }
}
ok(blanks.length === 0, `no blank strings ${JSON.stringify(blanks)}`);

// Arabic values must actually contain Arabic script. `lang.en` is the one
// legitimate exception: a language name is always shown in its own language.
const EXEMPT = new Set(['lang.en']);
const notArabic = Object.entries(I.STRINGS.ar)
  .filter(([k, v]) => !EXEMPT.has(k) && !/[؀-ۿ]/.test(v))
  .map(([k]) => k);
ok(notArabic.length === 0, `Arabic table is really Arabic ${JSON.stringify(notArabic)}`);

/* --- 3. placeholders match between languages ------------------------------ */
const holders = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(',');
const holderDrift = Object.keys(I.STRINGS.ar)
  .filter((k) => holders(I.STRINGS.ar[k]) !== holders(I.STRINGS.en[k]));
ok(holderDrift.length === 0, `placeholders agree across languages ${JSON.stringify(holderDrift)}`);

/* --- 4. defaults and direction ------------------------------------------- */
ok(I.init() === 'ar', 'Arabic is the default language');
ok(I.dir === 'rtl', 'Arabic selects dir=rtl');
ok(I.setLang('en') === 'en' && I.dir === 'ltr', 'English selects dir=ltr');
ok(I.toggle() === 'ar', 'toggle cycles back to Arabic');

/* --- 5. numbers, riyals and units in both languages ---------------------- */
I.setLang('ar');
ok(I.riyals(12500) === '12,500 ر.س', `riyals in Arabic -> ${I.riyals(12500)}`);
ok(I.metres(1240) === '1,240 م', `metres in Arabic -> ${I.metres(1240)}`);
ok(I.t('souq.level', { n: 3 }) === 'المستوى 3', `interpolation in Arabic -> ${I.t('souq.level', { n: 3 })}`);

I.setLang('en');
ok(I.riyals(12500) === '12,500 SAR', `riyals in English -> ${I.riyals(12500)}`);
ok(I.metres(1240) === '1,240 m', `metres in English -> ${I.metres(1240)}`);
ok(I.t('souq.level', { n: 3 }) === 'Level 3', `interpolation in English -> ${I.t('souq.level', { n: 3 })}`);

/* --- 6. graceful degradation --------------------------------------------- */
ok(I.t('no.such.key') === 'no.such.key', 'unknown key degrades to the key itself');
ok(I.num(NaN) === '0' && I.num(undefined) === '0', 'a non-numeric score renders as 0, never NaN');

/* --- 7. the Arabic-Indic digit switch is a one-word edit ----------------- */
const J = load();
J.LANGS.ar.numbering = 'arab';
J.init();
ok(/[٠-٩]/.test(J.num(12500)), `numbering:'arab' yields Arabic-Indic digits -> ${J.num(12500)}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall i18n checks passed');
process.exit(failures ? 1 : 0);
