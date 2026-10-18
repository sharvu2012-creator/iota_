/* ============================================================
   Satellite Watch — tiny translation engine
   ------------------------------------------------------------
   Reads the dictionaries from js/translations.js and swaps the
   page between English, Hindi and Punjabi without a reload.

   In the HTML:
     <h2 data-i18n="map.title">Explore the map</h2>
     <input data-i18n-placeholder="map.searchPh" placeholder="...">
     <button data-i18n-aria-label="menu.toggle" aria-label="...">

   In JavaScript:
     SW_I18N.t('quiz.count', { a: 1, b: 8 })
     SW_I18N.name()        → 'English' | 'Hindi' | 'Punjabi'
     SW_I18N.speech()      → 'en-IN' | 'hi-IN' | 'pa-IN'
     document.addEventListener('sw:language', fn)   // re-render dynamic text

   The choice is remembered in localStorage inside try/catch, so a
   browser that blocks storage still works.
   ============================================================ */

var SW_I18N = (function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var DICTS = (typeof SW_TRANSLATIONS !== 'undefined' && SW_TRANSLATIONS) ? SW_TRANSLATIONS : {};
  var LANGS = (typeof SW_LANGUAGE_LIST !== 'undefined' && SW_LANGUAGE_LIST) ? SW_LANGUAGE_LIST : [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'hi', label: 'हिन्दी', short: 'हि' },
    { code: 'pa', label: 'ਪੰਜਾਬੀ', short: 'ਪੰ' }
  ];
  var FALLBACK = 'en';
  var STORE_KEY = 'sw-lang';
  var listeners = [];
  var current = FALLBACK;

  function has(code) { return !!DICTS[code]; }
  function dictFor(code) { return DICTS[code] || {}; }

  function format(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
    });
  }

  // Look a key up in the current language, then in English, then use the
  // caller's fallback (usually the English text already in the page).
  function t(key, vars, fallback) {
    var value = dictFor(current)[key];
    if (typeof value !== 'string') value = dictFor(FALLBACK)[key];
    if (typeof value !== 'string') value = (fallback == null ? String(key) : String(fallback));
    return format(value, vars);
  }

  function name(code) {
    var c = code || current;
    if (c === 'hi') return 'Hindi';
    if (c === 'pa') return 'Punjabi';
    return 'English';
  }

  function speech(code) {
    var c = code || current;
    if (c === 'hi') return 'hi-IN';
    if (c === 'pa') return 'pa-IN';
    return 'en-IN';
  }

  /* ---------- applying the dictionary to the DOM ---------- */
  function applyTo(el) {
    var key = el.getAttribute('data-i18n');
    if (key) {
      if (el.__i18nEn == null) el.__i18nEn = el.textContent;
      el.textContent = t(key, null, el.__i18nEn);
    }
    // data-i18n-placeholder / -aria-label / -title / -alt ...
    var attrs = el.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.name.indexOf('data-i18n-') !== 0) continue;
      var target = attr.name.slice('data-i18n-'.length);
      if (!target) continue;
      var store = '__i18nAttr_' + target.replace(/[^a-z0-9]/gi, '_');
      if (el[store] == null) el[store] = el.getAttribute(target);
      el.setAttribute(target, t(attr.value, null, el[store]));
    }
  }

  function apply(scope) {
    var host = scope || doc;
    var nodes = host.querySelectorAll('[data-i18n],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-title],[data-i18n-alt]');
    Array.prototype.forEach.call(nodes, applyTo);
    // Scripts run after the markup, so also catch the scope itself.
    if (host !== doc && host.getAttribute && (host.getAttribute('data-i18n') || host.getAttribute('data-i18n-placeholder'))) {
      applyTo(host);
    }
  }

  /* ---------- the navbar switch ---------- */
  function buildSwitch() {
    var box = doc.getElementById('langSwitch');
    if (!box || box.getAttribute('data-built') === '1') return;
    box.setAttribute('data-built', '1');
    box.innerHTML = '';
    LANGS.forEach(function (lang) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'lang-btn';
      btn.setAttribute('data-lang', lang.code);
      btn.setAttribute('aria-pressed', String(lang.code === current));
      btn.setAttribute('title', lang.label);
      btn.innerHTML = '<span class="lang-full"></span><span class="lang-short"></span>';
      btn.querySelector('.lang-full').textContent = lang.label;
      btn.querySelector('.lang-short').textContent = lang.short || lang.code.toUpperCase();
      btn.addEventListener('click', function () { set(lang.code); });
      box.appendChild(btn);
    });
  }

  function markSwitch() {
    var box = doc.getElementById('langSwitch');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.lang-btn'), function (btn) {
      var on = btn.getAttribute('data-lang') === current;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    box.setAttribute('aria-label', t('lang.label', null, 'Change language'));
  }

  function tell() {
    try {
      doc.dispatchEvent(new CustomEvent('sw:language', {
        detail: { code: current, name: name(), speech: speech() }
      }));
    } catch (e) {}
    listeners.forEach(function (fn) {
      try { fn(current); } catch (e) {}
    });
  }

  function set(code) {
    if (!has(code)) code = FALLBACK;
    current = code;
    root.setAttribute('lang', code);
    root.setAttribute('data-lang', code);
    try { window.localStorage.setItem(STORE_KEY, code); } catch (e) {}

    apply();
    markSwitch();
    tell();
  }

  /* ---------- start-up ---------- */
  var saved = null;
  try { saved = window.localStorage.getItem(STORE_KEY); } catch (e) {}
  if (saved && has(saved)) current = saved;
  // Follow the browser when the visitor has never chosen.
  if (!saved && typeof navigator !== 'undefined') {
    var langs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var tag = String(langs[i] || '').toLowerCase();
      if (tag.indexOf('pa') === 0 && has('pa')) { current = 'pa'; break; }
      if (tag.indexOf('hi') === 0 && has('hi')) { current = 'hi'; break; }
    }
  }

  root.setAttribute('lang', current);
  root.setAttribute('data-lang', current);
  buildSwitch();

  function boot() {
    buildSwitch();
    apply();
    markSwitch();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    LANGUAGES: LANGS,
    lang: function () { return current; },
    name: name,
    speech: speech,
    t: t,
    has: function (key) { return typeof dictFor(current)[key] === 'string' || typeof dictFor(FALLBACK)[key] === 'string'; },
    dict: function () { return dictFor(current); },
    data: function (key) { return dictFor(current)[key]; },
    apply: apply,
    set: set,
    onChange: function (fn) { if (typeof fn === 'function') { listeners.push(fn); fn(current); } }
  };
})();
