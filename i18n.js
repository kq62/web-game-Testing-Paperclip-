/* ==========================================================================
   i18n.js — عربة الكورنيش / Corniche Cart
   THE ONLY FILE THAT CONTAINS UI TEXT.

   Rules for everyone working on this game:
     1. No user-visible string is allowed in index.html, game.js or style.css.
        Markup carries keys (`data-i18n="hud.distance"`), never words.
     2. Adding a language = adding one entry to LANGS + one block to STRINGS.
        Nothing else in the codebase changes.
     3. Every key must exist in every language. `I18N.missingKeys()` reports
        drift and is asserted by the QA smoke test.
     4. Numbers never reach the DOM via String(n) — use I18N.num / .riyals /
        .metres so digits, grouping and unit placement follow the locale.

   Arabic is the default. It is chosen deliberately, not sniffed from the
   browser: a stored preference wins, otherwise `ar`.
   ========================================================================== */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;  // tests
  else root.I18N = api;                                                   // browser
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_LANG = 'ar';
  var STORAGE_KEY = 'cornicheCart.lang';

  /* ---------------------------------------------------------------- locales */

  // `numbering` is the Unicode numbering system used for every number shown in
  // that language. Both start on 'latn' (Western digits: 1 2 3) because Saudi
  // pricing, scoreboards and app UIs overwhelmingly use them, and mixed-digit
  // screens read badly. Flip ar to 'arab' here — one word — for ١ ٢ ٣.
  var LANGS = {
    ar: { label: 'العربية', dir: 'rtl', locale: 'ar-SA', numbering: 'latn' },
    en: { label: 'English', dir: 'ltr', locale: 'en-US', numbering: 'latn' }
  };

  var ORDER = ['ar', 'en'];   // toggle cycles in this order; ar first

  /* ---------------------------------------------------------------- strings */

  var STRINGS = {

    /* ============================== ARABIC ============================== */
    ar: {
      'app.title':            'عربة الكورنيش',
      'app.tagline':          'انطلق من كورنيش جدة واعبر البحر الأحمر',

      'start.play':           'العب',
      'start.souq':           'السوق',
      'start.howTo':          'كيف تلعب',
      'start.language':       'اللغة',
      'start.best':           'أفضل مسافة',
      'start.balance':        'رصيدك',

      'how.title':            'كيف تلعب',
      'how.step1':            'اضغط المسافة أو انقر لتحديد قوة الانطلاق من المنحدر.',
      'how.step2':            'وجّه العربة في الهواء بالسهمين لأعلى وأسفل.',
      'how.step3':            'اقفز على السنابيك لتطير أبعد، واحذر الصقور والنوارس.',
      'how.step4':            'اجمع التمر وفناجين القهوة، واصرف الريالات في السوق.',
      'how.back':             'رجوع',

      // The control table of GAME_PLAN.md section 4. Both schemes are shown at
      // once: the hint line swaps by pointer type, but this table never hides a
      // column, so a touch player on a laptop still sees the keyboard row.
      'how.action':           'الإجراء',
      'how.keyboard':         'لوحة المفاتيح',
      'how.touch':            'اللمس',
      'how.actLaunch':        'تثبيت قوة الانطلاق',
      'how.keyLaunch':        'المسافة أو Enter',
      'how.touchLaunch':      'انقر في أي مكان',
      'how.actSteer':         'التوجيه لأعلى أو لأسفل',
      'how.keySteer':         '↑ ↓ أو W و S',
      'how.touchSteer':       'اسحب أو أمسك النصف الأعلى أو الأسفل',
      'how.actGlide':         'الانزلاق',
      'how.keyGlide':         'أمسك ↑',
      'how.touchGlide':       'أمسك النصف الأعلى',
      'how.actRocket':        'صاروخ العود',
      'how.keyRocket':        'المسافة في الهواء',
      'how.touchRocket':      'انقر في الهواء',
      'how.actPause':         'الإيقاف المؤقت',
      'how.keyPause':         'P أو Esc',
      'how.touchPause':       'زر الإيقاف في الشريط',

      'hud.distance':         'المسافة',
      'hud.best':             'الأفضل',
      'hud.height':           'الارتفاع',
      'hud.speed':            'السرعة',
      'hud.riyals':           'الريالات',
      'hud.boost':            'الدفع',
      'hud.pause':            'إيقاف',
      'hud.progress':         'التقدم نحو الضفة الأخرى',

      'run.charge':           'اشحن الانطلاق',
      'run.launch':           'انطلق!',
      'run.boostReady':       'صاروخ العود جاهز',
      'run.bounce':           'قفزة!',
      'run.perfect':          'قفزة مثالية!',
      'run.chargeHintKey':    'اضغط المسافة لتثبيت القوة',
      'run.chargeHintTouch':  'انقر لتثبيت القوة',
      'run.birdHit':          'اصطدام!',
      'run.skim':             'نطّة على الماء!',
      'run.rocket':           'صاروخ العود!',
      'run.reached':          'وصلت',

      // Landmark names from GAME_PLAN.md section 8. `run.reached` is prefixed to
      // these, so the toast reads "وصلت — الفنار".
      'landmark.1000':        'المرسى',
      'landmark.2000':        'كاسر الأمواج',
      'landmark.3000':        'الشعاب المرجانية',
      'landmark.4000':        'جزيرة النخيل',
      'landmark.5000':        'الفنار',
      'landmark.6000':        'الضفة الأخرى',

      'pause.title':          'إيقاف مؤقت',
      'pause.resume':         'متابعة',
      'pause.quit':           'إنهاء الرحلة',

      'result.title':         'انتهت الرحلة',
      'result.distance':      'المسافة',
      'result.bestDistance':  'أفضل مسافة',
      'result.newBest':       'رقم قياسي جديد!',
      'result.dates':         'التمر',
      'result.coffee':        'فناجين القهوة',
      'result.earned':        'ما كسبته',
      'result.again':         'انطلق مرة أخرى',
      'result.toSouq':        'إلى السوق',

      'win.title':            'عبرتَ البحر الأحمر!',
      'win.body':             'وصلت العربة إلى الضفة الأخرى. الرحلة كاملة!',
      'win.replay':           'العب مرة أخرى',
      'win.time':             'زمن العبور',

      'souq.title':           'السوق',
      'souq.balance':         'رصيدك',
      'souq.buy':             'اشترِ',
      'souq.level':           'المستوى {n}',
      'souq.maxed':           'أعلى مستوى',
      'souq.price':           'السعر',
      'souq.notEnough':       'الريالات غير كافية',
      'souq.bought':          'تم الشراء!',
      'souq.back':            'رجوع',

      'upgrade.saduWheels.name':   'عجلات السدو',
      'upgrade.saduWheels.desc':   'تدحرج أسرع على منحدر الكورنيش.',
      'upgrade.camelPower.name':   'قوة الجمل',
      'upgrade.camelPower.desc':   'دفعة أقوى عند الانطلاق من المنحدر.',
      'upgrade.falconWings.name':  'أجنحة الصقر',
      'upgrade.falconWings.desc':  'انزلاق أطول وأهدأ في الهواء.',
      'upgrade.oudRocket.name':    'صاروخ العود',
      'upgrade.oudRocket.desc':    'دفعة سريعة في منتصف الرحلة.',
      'upgrade.dhowSprings.name':  'نوابض السنبوك',
      'upgrade.dhowSprings.desc':  'قفزات أعلى عن قوارب السنبوك.',
      'upgrade.dateBag.name':      'كيس التمر',
      'upgrade.dateBag.desc':      'التمر يمنحك ريالات أكثر.',

      'entity.cart':          'العربة',
      'entity.falcon':        'صقر',
      'entity.seagull':       'نورس',
      'entity.dhow':          'سنبوك',
      'entity.dates':         'تمر',
      'entity.dallah':        'فنجان قهوة',
      'entity.lantern':       'فانوس',

      'unit.metre':           'م',
      'unit.metrePerSecond':  'م/ث',
      'unit.riyal':           'ر.س',
      'unit.second':          'ث',

      'controls.keyboard':     'لوحة المفاتيح',
      'controls.keyboardBody': 'المسافة: الانطلاق والدفع · ↑ ↓: التوجيه · P: إيقاف مؤقت',
      'controls.touch':        'اللمس',
      'controls.touchBody':    'انقر للانطلاق · اسحب لأعلى أو لأسفل للتوجيه',

      'a11y.playfield':       'ميدان اللعب: العربة تعبر البحر الأحمر',
      'a11y.langToggle':      'تغيير لغة اللعبة: العربية أو الإنجليزية',
      'a11y.pause':           'إيقاف اللعبة مؤقتًا',
      'a11y.resume':          'متابعة اللعب',

      'lang.ar':              'العربية',
      'lang.en':              'English'
    },

    /* ============================== ENGLISH ============================= */
    en: {
      'app.title':            'Corniche Cart',
      'app.tagline':          'Launch from the Jeddah Corniche and cross the Red Sea',

      'start.play':           'Play',
      'start.souq':           'Souq',
      'start.howTo':          'How to play',
      'start.language':       'Language',
      'start.best':           'Best distance',
      'start.balance':        'Your balance',

      'how.title':            'How to play',
      'how.step1':            'Press Space or tap to set your launch power off the ramp.',
      'how.step2':            'Steer the cart through the air with the up and down arrows.',
      'how.step3':            'Bounce off the dhows to fly farther, and dodge the falcons and seagulls.',
      'how.step4':            'Collect dates and coffee cups, then spend your riyals in the souq.',
      'how.back':             'Back',

      'how.action':           'Action',
      'how.keyboard':         'Keyboard',
      'how.touch':            'Touch',
      'how.actLaunch':        'Lock launch power',
      'how.keyLaunch':        'Space or Enter',
      'how.touchLaunch':      'Tap anywhere',
      'how.actSteer':         'Steer up or down',
      'how.keySteer':         '↑ ↓ or W and S',
      'how.touchSteer':       'Swipe or hold the upper or lower half',
      'how.actGlide':         'Glide',
      'how.keyGlide':         'Hold ↑',
      'how.touchGlide':       'Hold the upper half',
      'how.actRocket':        'Oud Rocket',
      'how.keyRocket':        'Space in mid-air',
      'how.touchRocket':      'Tap in mid-air',
      'how.actPause':         'Pause',
      'how.keyPause':         'P or Esc',
      'how.touchPause':       'The pause button in the HUD',

      'hud.distance':         'Distance',
      'hud.best':             'Best',
      'hud.height':           'Height',
      'hud.speed':            'Speed',
      'hud.riyals':           'Riyals',
      'hud.boost':            'Boost',
      'hud.pause':            'Pause',
      'hud.progress':         'Progress to the far shore',

      'run.charge':           'Charge your launch',
      'run.launch':           'Launch!',
      'run.boostReady':       'Oud Rocket ready',
      'run.bounce':           'Bounce!',
      'run.perfect':          'Perfect bounce!',
      'run.chargeHintKey':    'Press Space to lock the power',
      'run.chargeHintTouch':  'Tap to lock the power',
      'run.birdHit':          'Hit!',
      'run.skim':             'Skipped off the water!',
      'run.rocket':           'Oud Rocket!',
      'run.reached':          'Reached',

      'landmark.1000':        'the marina buoys',
      'landmark.2000':        'the breakwater',
      'landmark.3000':        'the coral reef',
      'landmark.4000':        'the palm islet',
      'landmark.5000':        'the lighthouse',
      'landmark.6000':        'the far shore',

      'pause.title':          'Paused',
      'pause.resume':         'Resume',
      'pause.quit':           'End run',

      'result.title':         'Run over',
      'result.distance':      'Distance',
      'result.bestDistance':  'Best distance',
      'result.newBest':       'New record!',
      'result.dates':         'Dates',
      'result.coffee':        'Coffee cups',
      'result.earned':        'Earned',
      'result.again':         'Launch again',
      'result.toSouq':        'Go to the souq',

      'win.title':            'You crossed the Red Sea!',
      'win.body':             'Your cart reached the far shore. The crossing is complete!',
      'win.replay':           'Play again',
      'win.time':             'Crossing time',

      'souq.title':           'Souq',
      'souq.balance':         'Your balance',
      'souq.buy':             'Buy',
      'souq.level':           'Level {n}',
      'souq.maxed':           'Fully upgraded',
      'souq.price':           'Price',
      'souq.notEnough':       'Not enough riyals',
      'souq.bought':          'Purchased!',
      'souq.back':            'Back',

      'upgrade.saduWheels.name':   'Sadu Wheels',
      'upgrade.saduWheels.desc':   'Roll faster down the corniche ramp.',
      'upgrade.camelPower.name':   'Camel Power',
      'upgrade.camelPower.desc':   'A stronger shove off the ramp.',
      'upgrade.falconWings.name':  'Falcon Wings',
      'upgrade.falconWings.desc':  'A longer, smoother glide through the air.',
      'upgrade.oudRocket.name':    'Oud Rocket',
      'upgrade.oudRocket.desc':    'A quick burst of speed in mid-air.',
      'upgrade.dhowSprings.name':  'Dhow Springs',
      'upgrade.dhowSprings.desc':  'Higher bounces off the dhow boats.',
      'upgrade.dateBag.name':      'Date Bag',
      'upgrade.dateBag.desc':      'Dates are worth more riyals.',

      'entity.cart':          'Cart',
      'entity.falcon':        'Falcon',
      'entity.seagull':       'Seagull',
      'entity.dhow':          'Dhow',
      'entity.dates':         'Dates',
      'entity.dallah':        'Coffee cup',
      'entity.lantern':       'Lantern',

      'unit.metre':           'm',
      'unit.metrePerSecond':  'm/s',
      'unit.riyal':           'SAR',
      'unit.second':          's',

      'controls.keyboard':     'Keyboard',
      'controls.keyboardBody': 'Space: launch and boost · ↑ ↓: steer · P: pause',
      'controls.touch':        'Touch',
      'controls.touchBody':    'Tap to launch · swipe up or down to steer',

      'a11y.playfield':       'Playfield: the cart crossing the Red Sea',
      'a11y.langToggle':      'Change game language: Arabic or English',
      'a11y.pause':           'Pause the game',
      'a11y.resume':          'Resume playing',

      'lang.ar':              'العربية',
      'lang.en':              'English'
    }
  };

  /* ------------------------------------------------------------------ state */

  var lang = DEFAULT_LANG;
  var listeners = [];
  var numFormatters = {};   // lang -> Intl.NumberFormat, built once

  /* ---------------------------------------------------------------- storage */

  // localStorage throws in some private-browsing modes. A lost language
  // preference must never break the game, so both directions swallow failures.
  function readStored() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return LANGS[v] ? v : null;
    } catch (err) { return null; }
  }

  function writeStored(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (err) { /* ignore */ }
  }

  /* --------------------------------------------------------------- numbers */

  function formatter(forLang) {
    if (!numFormatters[forLang]) {
      var cfg = LANGS[forLang];
      var tag = cfg.locale + '-u-nu-' + cfg.numbering;
      try {
        numFormatters[forLang] = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
      } catch (err) {
        // Very old engine, or an unsupported numbering system: fall back to a
        // plain grouped format rather than losing the number entirely.
        numFormatters[forLang] = { format: function (n) { return String(Math.round(n)); } };
      }
    }
    return numFormatters[forLang];
  }

  function num(value) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    return formatter(lang).format(n);
  }

  // Unit-bearing numbers are built as "<number> <unit>". The surrounding
  // element's `dir` puts the unit on the correct side, so this one function is
  // right in both languages: "1,240 m" and "1,240 م".
  function metres(value)  { return num(value) + ' ' + t('unit.metre'); }
  function speed(value)   { return num(value) + ' ' + t('unit.metrePerSecond'); }
  function riyals(value)  { return num(value) + ' ' + t('unit.riyal'); }

  // A crossing time is the one number worth a decimal: whole seconds would hide
  // the difference between two close runs. `num` only formats integers, so the
  // fraction is split off, formatted separately and joined by the locale's own
  // decimal separator.
  function seconds(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) n = 0;
    var whole = Math.floor(n);
    var tenth = Math.round((n - whole) * 10);
    if (tenth === 10) { whole += 1; tenth = 0; }
    var sep = '.';
    try {
      var parts = new Intl.NumberFormat(LANGS[lang].locale + '-u-nu-' +
                                        LANGS[lang].numbering).formatToParts(1.1);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'decimal') { sep = parts[i].value; break; }
      }
    } catch (err) { /* keep the ASCII point */ }
    return num(whole) + sep + num(tenth) + ' ' + t('unit.second');
  }

  /* --------------------------------------------------------------- lookup */

  function t(key, params) {
    var table = STRINGS[lang] || STRINGS[DEFAULT_LANG];
    var out = table[key];

    if (out === undefined) {
      // Fall back to the default language, then to the key itself, so a missing
      // translation degrades to readable text instead of "undefined".
      out = STRINGS[DEFAULT_LANG][key];
      if (out === undefined) return key;
    }

    if (params) {
      out = out.replace(/\{(\w+)\}/g, function (match, name) {
        if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
        var v = params[name];
        return typeof v === 'number' ? num(v) : String(v);
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------- dom */

  // Markup declares what to translate:
  //   <span data-i18n="hud.distance"></span>          -> textContent
  //   <button data-i18n-aria-label="a11y.pause">      -> aria-label
  //   <input data-i18n-placeholder="...">             -> placeholder
  //   <h1 data-i18n-title="app.title">                -> title attribute
  var ATTR_KEYS = ['aria-label', 'placeholder', 'title'];

  function apply(scope) {
    if (typeof document === 'undefined') return;
    var root = scope || document;

    var textNodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < textNodes.length; i++) {
      textNodes[i].textContent = t(textNodes[i].getAttribute('data-i18n'));
    }

    for (var a = 0; a < ATTR_KEYS.length; a++) {
      var attr = ATTR_KEYS[a];
      var sel = '[data-i18n-' + attr + ']';
      var nodes = root.querySelectorAll(sel);
      for (var j = 0; j < nodes.length; j++) {
        nodes[j].setAttribute(attr, t(nodes[j].getAttribute('data-i18n-' + attr)));
      }
    }

    // One place sets direction and language for the whole document. CSS uses
    // logical properties, so nothing else has to know which way text runs.
    if (root === document) {
      var html = document.documentElement;
      html.setAttribute('lang', lang);
      html.setAttribute('dir', LANGS[lang].dir);
    }
  }

  /* ---------------------------------------------------------------- public */

  function setLang(next, opts) {
    if (!LANGS[next] || next === lang) return lang;
    lang = next;
    if (!opts || opts.persist !== false) writeStored(lang);
    apply();
    for (var i = 0; i < listeners.length; i++) listeners[i](lang);
    return lang;
  }

  function toggle() {
    var i = ORDER.indexOf(lang);
    return setLang(ORDER[(i + 1) % ORDER.length]);
  }

  // Canvas text is not in the DOM, so the render layer subscribes here and
  // redraws its labels when the language flips.
  function onChange(fn) {
    listeners.push(fn);
    return function off() {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function init() {
    lang = (typeof window !== 'undefined' && readStored()) || DEFAULT_LANG;
    apply();
    return lang;
  }

  // Key-parity check. Asserted by the QA smoke test so a half-translated
  // string table fails CI instead of shipping English into an Arabic screen.
  function missingKeys() {
    var all = {};
    var codes = Object.keys(STRINGS);
    codes.forEach(function (code) {
      Object.keys(STRINGS[code]).forEach(function (k) { all[k] = true; });
    });

    var report = {};
    codes.forEach(function (code) {
      var missing = Object.keys(all).filter(function (k) {
        return STRINGS[code][k] === undefined;
      });
      if (missing.length) report[code] = missing.sort();
    });
    return report;
  }

  return {
    LANGS: LANGS,
    ORDER: ORDER,
    STRINGS: STRINGS,
    DEFAULT_LANG: DEFAULT_LANG,
    STORAGE_KEY: STORAGE_KEY,
    init: init,
    apply: apply,
    t: t,
    num: num,
    metres: metres,
    speed: speed,
    riyals: riyals,
    seconds: seconds,
    setLang: setLang,
    toggle: toggle,
    onChange: onChange,
    missingKeys: missingKeys,
    get lang() { return lang; },
    get dir() { return LANGS[lang].dir; }
  };
});
