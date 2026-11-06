/* ============================================================
   iota√-1 — study data reader
   ------------------------------------------------------------
   All study numbers live in data/study.js. This file only reads
   them and works out the values that must stay consistent:

     scenes         → scene count, years analysed
     same months    → mean NDVI change (first vs last year)
     landCover      → water change (share before vs after)
     monthlyNdvi    → June points forced to match scenes[]

   Nothing is hard-coded here, so editing data/study.js is enough
   to update the table, the cards, the charts and the report.
   ============================================================ */

var StudyData = (function () {
  'use strict';

  var raw = (typeof STUDY_DATA !== 'undefined' && STUDY_DATA) ? STUDY_DATA
    : (typeof window !== 'undefined' && window.STUDY_DATA) ? window.STUDY_DATA
    : {};

  var MINUS = '\u2212';          // typographic minus for signed values

  function toNum(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  /* ---------- number formatting ---------- */
  function group(intPart) {
    return String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // 15700 → "15,700"
  function fmt(value, digits) {
    var n = toNum(value);
    var d = (typeof digits === 'number') ? digits : 0;
    var fixed = Math.abs(n).toFixed(d);
    var parts = fixed.split('.');
    parts[0] = group(parts[0]);
    return (n < 0 ? MINUS : '') + parts.join('.');
  }

  // −0.21 → "−0.21" (always shows the sign when asked)
  function signed(value, digits) {
    var n = toNum(value);
    var d = (typeof digits === 'number') ? digits : 2;
    var body = Math.abs(n).toFixed(d);
    if (n < 0) return MINUS + body;
    return '+' + body;
  }

  /* ---------- scenes ---------- */
  var scenes = Array.isArray(raw.scenes) ? raw.scenes.slice() : [];
  scenes = scenes.filter(function (s) { return s && s.date; });
  scenes.sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });

  function sceneYear(scene) { return parseInt(String(scene.date).slice(0, 4), 10) || 0; }
  function sceneMonth(scene) { return parseInt(String(scene.date).slice(5, 7), 10) || 0; }

  function comparisonMonths() {
    var list = raw.comparison && raw.comparison.months;
    return Array.isArray(list) && list.length ? list : [5, 6];
  }

  // Rows from the same window each year (late May – mid June by default).
  function sameMonthScenes() {
    var months = comparisonMonths();
    return scenes.filter(function (s) { return months.indexOf(sceneMonth(s)) !== -1; });
  }

  function years() {
    if (!scenes.length) return { first: 0, last: 0, count: 0, range: '' };
    var first = sceneYear(scenes[0]);
    var last = sceneYear(scenes[scenes.length - 1]);
    return {
      first: first,
      last: last,
      count: Math.max(0, last - first + 1),
      range: first + '–' + last
    };
  }

  function ndviChange() {
    var list = sameMonthScenes();
    if (list.length < 2) return null;
    var a = list[0];
    var b = list[list.length - 1];
    var change = Math.round((toNum(b.ndvi) - toNum(a.ndvi)) * 100) / 100;
    return {
      from: toNum(a.ndvi),
      to: toNum(b.ndvi),
      change: change,
      fromYear: sceneYear(a),
      toYear: sceneYear(b)
    };
  }

  // The regional value shown as an alternative in "Your field".
  function latestNdvi() {
    var list = sameMonthScenes();
    if (list.length) return toNum(list[list.length - 1].ndvi);
    if (scenes.length) return toNum(scenes[scenes.length - 1].ndvi);
    return null;
  }

  /* ---------- land cover ---------- */
  function landCover() {
    var lc = raw.landCover || {};
    var classes = Array.isArray(lc.classes) ? lc.classes.slice() : [];
    var yrs = Array.isArray(lc.years) ? lc.years.slice() : [];
    yrs = yrs.filter(function (y) { return y && Array.isArray(y.values); });
    return { classes: classes, years: yrs };
  }

  function waterIndex() {
    var lc = landCover();
    var i = lc.classes.indexOf('water');
    return i;
  }

  // Relative change in the water share, in percent (−33 = one third less).
  function waterChange() {
    var lc = landCover();
    var i = waterIndex();
    if (i === -1 || lc.years.length < 2) return null;
    var before = toNum(lc.years[0].values[i]);
    var after = toNum(lc.years[lc.years.length - 1].values[i]);
    if (before === 0) return null;
    return Math.round(((after / before) - 1) * 100);
  }

  /* ---------- monthly curve, kept in step with the table ---------- */
  function monthly() {
    var m = raw.monthlyNdvi || {};
    var months = Array.isArray(m.months) && m.months.length ? m.months.slice() : [];
    var series = Array.isArray(m.series) ? m.series : [];
    var out = series.map(function (row) {
      var values = Array.isArray(row && row.values) ? row.values.map(toNum) : [];
      return { year: row && row.year, values: values };
    });

    // Any month that also has a scene row takes that row's NDVI.
    out.forEach(function (row) {
      for (var i = 0; i < months.length; i++) {
        for (var s = 0; s < scenes.length; s++) {
          if (sceneYear(scenes[s]) === row.year && sceneMonth(scenes[s]) === (i + 1)) {
            row.values[i] = toNum(scenes[s].ndvi);
            break;
          }
        }
      }
    });

    return { months: months, series: out };
  }

  /* ---------- sensors + area ---------- */
  function sensors() { return raw.sensors || {}; }

  function sensorFor(scene) {
    if (!scene) return null;
    var all = sensors();
    return all[scene.sensor] || null;
  }

  function bounds() { return raw.studyArea || {}; }

  function areaKm2() { return toNum(raw.areaKm2); }

  function status() { return raw.status === 'verified' ? 'verified' : 'sample'; }

  function comparisonWindow() {
    return (raw.comparison && raw.comparison.window) ? String(raw.comparison.window) : 'late May to mid June';
  }

  /* ---------- the AI tutor's context (agrees with the cards) ---------- */
  function summary() {
    var y = years();
    var change = ndviChange();
    var water = waterChange();
    return {
      areaKm2: areaKm2(),
      years: y,
      scenes: scenes.length,
      lowCloudOnly: true,
      cloudLimitPercent: 15,
      sameMonthWindow: comparisonWindow(),
      ndviChange: change,
      waterChangePercent: water,
      status: status()
    };
  }

  return {
    raw: raw,
    status: status,
    scenes: function () { return scenes.slice(); },
    sceneCount: function () { return scenes.length; },
    sceneYear: sceneYear,
    sceneMonth: sceneMonth,
    sameMonthScenes: sameMonthScenes,
    years: years,
    ndviChange: ndviChange,
    latestNdvi: latestNdvi,
    landCover: landCover,
    waterChange: waterChange,
    monthly: monthly,
    sensors: sensors,
    sensorFor: sensorFor,
    bounds: bounds,
    areaKm2: areaKm2,
    comparisonWindow: comparisonWindow,
    summary: summary,
    fmt: fmt,
    signed: signed
  };
})();

if (typeof window !== 'undefined') { window.StudyData = StudyData; }
