/* ============================================================
   Satellite Watch — extra page features
   ------------------------------------------------------------
   Everything here is page-level (not map) behaviour:
     1. "Test yourself" quiz          (data in js/quiz-data.js)
     2. Crop-season NDVI guide        (data in js/config.js)
     3. Irrigation alert (Open-Meteo 3-day rain)
     4. Try NDVI yourself (Red + NIR sliders)
     5. Download report (window.print)
     6. Share + QR code
   The map-only extras (layer info cards, compare two spots,
   measure my field) live in js/map.js.

   Every string goes through T(), which reads js/translations.js
   for the selected language and falls back to the English text
   written here.
   ============================================================ */

(function () {
  'use strict';

  var doc = document;
  var CFG = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : (window.CONFIG || {});

  function T(key, fallback, vars) {
    try {
      if (window.SW_I18N) return window.SW_I18N.t(key, vars, fallback);
    } catch (e) {}
    return fallback;
  }
  function langData(key) {
    try {
      if (window.SW_I18N && typeof window.SW_I18N.data === 'function') return window.SW_I18N.data(key);
    } catch (e) {}
    return null;
  }
  function onLanguage(fn) {
    doc.addEventListener('sw:language', function () { fn(); });
  }

  /* ---------------------------------------------------------
     1. Test yourself — one question at a time
     --------------------------------------------------------- */
  var quizData = (typeof QUIZ_DATA !== 'undefined' && QUIZ_DATA) ? QUIZ_DATA : (window.QUIZ_DATA || []);
  var QUESTIONS = quizData;
  var quizCard = doc.getElementById('quizCard');

  // The questions exist in English (js/quiz-data.js) and in the other
  // languages inside js/translations.js.
  function useQuizLanguage() {
    var list = langData('quiz');
    QUESTIONS = (list && list.length) ? list : quizData;
  }

  if (quizCard && QUESTIONS && QUESTIONS.length) {
    var qCount = doc.getElementById('quizCount');
    var qScore = doc.getElementById('quizScore');
    var qTrack = doc.getElementById('quizProgressTrack');
    var qFill = doc.getElementById('quizProgressFill');
    var qStage = doc.getElementById('quizStage');
    var qQuestion = doc.getElementById('quizQuestion');
    var qOptions = doc.getElementById('quizOptions');
    var qFeedback = doc.getElementById('quizFeedback');
    var qNext = doc.getElementById('quizNext');
    var qResult = doc.getElementById('quizResult');
    var qResultScore = doc.getElementById('quizResultScore');
    var qResultMsg = doc.getElementById('quizResultMsg');
    var qRetry = doc.getElementById('quizRetry');

    var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    var qIndex = 0;      // question on screen
    var qAnswered = 0;   // how many have been answered
    var qCorrect = 0;    // how many were right
    var qLocked = false; // options for the current question are spent

    function scoreMessage(score) {
      var pct = score / QUESTIONS.length;
      if (pct === 1) return T('quiz.msgPerfect', 'Perfect score — you could teach this section yourself.');
      if (pct >= 0.75) return T('quiz.msgHigh', 'Strong work. You have a good grip on how satellite data behaves.');
      if (pct >= 0.5) return T('quiz.msgMid', 'A solid start. Have another look at resolution and the limits of the data.');
      return T('quiz.msgLow', 'Worth a second pass — scroll back up, the answers build on each other.');
    }

    function setProgress() {
      var pct = Math.round((qAnswered / QUESTIONS.length) * 100);
      if (qFill) qFill.style.width = pct + '%';
      if (qTrack) {
        qTrack.setAttribute('aria-valuemax', String(QUESTIONS.length));
        qTrack.setAttribute('aria-valuenow', String(qAnswered));
      }
      if (qScore) qScore.textContent = T('quiz.score', 'Score {a}/{b}', { a: qCorrect, b: qAnswered });
    }

    function renderQuestion() {
      var item = QUESTIONS[qIndex];
      if (!item) return;
      qLocked = false;

      if (qCount) qCount.textContent = T('quiz.count', 'Question {a} of {b}', { a: qIndex + 1, b: QUESTIONS.length });
      if (qQuestion) qQuestion.textContent = item.q;
      if (qFeedback) {
        qFeedback.hidden = true;
        qFeedback.textContent = '';
        qFeedback.className = 'quiz-feedback';
      }
      if (qNext) {
        qNext.hidden = true;
        qNext.textContent = (qIndex === QUESTIONS.length - 1)
          ? T('quiz.seeScore', 'See my score')
          : T('quiz.next', 'Next question');
      }

      if (qOptions) {
        qOptions.innerHTML = '';
        item.options.forEach(function (text, i) {
          var btn = doc.createElement('button');
          btn.type = 'button';
          btn.className = 'quiz-option';
          btn.setAttribute('aria-disabled', 'false');

          var key = doc.createElement('span');
          key.className = 'quiz-option-key';
          key.setAttribute('aria-hidden', 'true');
          key.textContent = LETTERS[i] || String(i + 1);

          var label = doc.createElement('span');
          label.className = 'quiz-option-text';
          label.textContent = text;

          btn.appendChild(key);
          btn.appendChild(label);
          btn.addEventListener('click', function () { answer(i, btn); });
          qOptions.appendChild(btn);
        });
      }

      if (qStage) qStage.hidden = false;
      if (qResult) qResult.hidden = true;
      setProgress();
    }

    function answer(pick, btn) {
      if (qLocked) return;
      var item = QUESTIONS[qIndex];
      if (!item) return;
      qLocked = true;
      qAnswered += 1;

      var all = qOptions ? qOptions.querySelectorAll('.quiz-option') : [];
      Array.prototype.forEach.call(all, function (b, i) {
        b.setAttribute('aria-disabled', 'true');
        if (i === item.answer) b.classList.add('is-correct');
        else if (b === btn) b.classList.add('is-wrong');
        else b.classList.add('is-dimmed');
      });

      var right = (pick === item.answer);
      if (right) qCorrect += 1;

      if (qFeedback) {
        qFeedback.className = 'quiz-feedback ' + (right ? 'is-good' : 'is-bad');
        var lead = doc.createElement('strong');
        lead.textContent = right ? T('quiz.correct', 'Correct. ') : T('quiz.wrong', 'Not quite. ');
        qFeedback.innerHTML = '';
        qFeedback.appendChild(lead);
        qFeedback.appendChild(doc.createTextNode(item.explanation || ''));
        qFeedback.hidden = false;
      }

      if (qNext) qNext.hidden = false;
      setProgress();
    }

    function showResult() {
      if (qStage) qStage.hidden = true;
      if (qResult) qResult.hidden = false;
      if (qResultScore) qResultScore.textContent = qCorrect + ' / ' + QUESTIONS.length;
      if (qResultMsg) qResultMsg.textContent = scoreMessage(qCorrect);
      if (qCount) qCount.textContent = T('quiz.done', 'All {n} questions answered', { n: QUESTIONS.length });
      if (qFill) qFill.style.width = '100%';
      if (qTrack) qTrack.setAttribute('aria-valuenow', String(QUESTIONS.length));
      if (qScore) qScore.textContent = T('quiz.final', 'Final score {a}/{b}', { a: qCorrect, b: QUESTIONS.length });
    }

    function restart() {
      qIndex = 0;
      qAnswered = 0;
      qCorrect = 0;
      if (qResult) qResult.hidden = true;
      if (qStage) qStage.hidden = false;
      renderQuestion();
    }

    if (qNext) {
      qNext.addEventListener('click', function () {
        if (qIndex < QUESTIONS.length - 1) { qIndex += 1; renderQuestion(); }
        else showResult();
      });
    }
    if (qRetry) qRetry.addEventListener('click', restart);

    // Changing language swaps the questions and starts the quiz again.
    onLanguage(function () { useQuizLanguage(); restart(); });

    renderQuestion();
  }

  /* ---------------------------------------------------------
     2. What a crop year looks like in Punjab
     --------------------------------------------------------- */
  var crop = CFG.cropSeasons;
  var cropCanvas = doc.getElementById('cropChart');

  if (crop && crop.crops && crop.crops.length && cropCanvas) {
    var cropMonths = crop.months || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var cropBadge = doc.getElementById('cropBadge');
    var cropFootnote = doc.getElementById('cropFootnote');
    var cropNames = doc.getElementById('cropNames');
    var cropSummary = doc.getElementById('cropSummary');
    var cropChart = null;
    var activeCrop = 0;

    // Hindi / Punjabi crop wording lives next to the other page text.
    function cropWords(i) {
      var list = langData('cropSeasons');
      var over = nil(list && list.crops);
      var base = crop.crops[i] || {};
      var info = over ? over[base.id] : null;
      return {
        name: (info && info.name) || base.name || '',
        season: (info && info.season) || base.season || '',
        window: (info && info.window) || base.window || ''
      };
    }
    function nil(v) { return (v && typeof v === 'object') ? v : null; }

    function cropLabels() {
      var list = langData('cropSeasons');
      var over = nil(list && list.crops);
      return crop.crops.map(function (c) {
        var info = over ? over[c.id] : null;
        var name = (info && info.name) || c.name || '';
        var season = (info && info.season) || c.season || '';
        return name + (season ? ' (' + season + ')' : '');
      });
    }

    function cropNote() {
      var list = langData('cropSeasons');
      return (list && list.note) || crop.note || T('crop.badge', 'Illustrative pattern, not measured data');
    }
    function cropFoot() {
      var list = langData('cropSeasons');
      return (list && list.footnote) || crop.footnote || T('crop.footnote', 'This is why you must compare the same time of year when looking for change.');
    }

    if (cropBadge) cropBadge.textContent = cropNote();
    if (cropFootnote) cropFootnote.textContent = cropFoot();

    function rgb(hex, alpha) {
      var h = String(hex || '').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      if (!isFinite(n)) return 'rgba(46,158,91,' + alpha + ')';
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }

    function ridgeColors() {
      var cs = getComputedStyle(doc.documentElement);
      return {
        grid: (cs.getPropertyValue('--grid-line') || '').trim() || 'rgba(0,0,0,.12)',
        text: (cs.getPropertyValue('--muted') || '').trim() || '#5b6b62'
      };
    }

    function buildCropChart() {
      if (typeof Chart === 'undefined') return;
      var t = ridgeColors();
      var labels = cropLabels();
      var datasets = crop.crops.map(function (c, i) {
        var colour = c.color || (i === 0 ? '#2e9e5b' : '#2a7fba');
        return {
          label: labels[i],
          data: c.values || [],
          borderColor: colour,
          backgroundColor: rgb(colour, 0.16),
          pointBackgroundColor: colour,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          hidden: i !== activeCrop
        };
      });

      cropChart = new Chart(cropCanvas.getContext('2d'), {
        type: 'line',
        data: { labels: cropMonths, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          animation: { duration: 350 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (c) { return c.dataset.label + ': NDVI ' + Number(c.parsed.y).toFixed(2); }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: 0.9,
              title: { display: true, text: 'NDVI', color: t.text, font: { size: 11 } },
              grid: { color: t.grid, drawBorder: false },
              ticks: { color: t.text, font: { size: 11 }, maxTicksLimit: 6 }
            },
            x: {
              grid: { display: false },
              ticks: { color: t.text, font: { size: 11 }, maxRotation: 0, autoSkip: false }
            }
          }
        }
      });
    }

    function showCrop(i) {
      activeCrop = i;
      if (cropChart) {
        cropChart.data.datasets.forEach(function (d, di) { d.hidden = di !== i; });
        cropChart.update();
      }
      var w = cropWords(i);
      if (cropSummary) {
        cropSummary.innerHTML = '';
        var season = doc.createElement('strong');
        season.textContent = w.name + (w.season ? ' (' + w.season + ')' : '');
        cropSummary.appendChild(season);
        cropSummary.appendChild(doc.createTextNode(' — ' + w.window));
      }
      if (cropNames) {
        Array.prototype.forEach.call(cropNames.querySelectorAll('button'), function (b, bi) {
          var on = bi === i;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
      }
    }

    // Re-label the toggles, the chart and the summary after a language change.
    function relabelCrop() {
      if (cropBadge) cropBadge.textContent = cropNote();
      if (cropFootnote) cropFootnote.textContent = cropFoot();
      var labels = cropLabels();
      if (cropNames) {
        Array.prototype.forEach.call(cropNames.querySelectorAll('button'), function (b, bi) {
          b.textContent = cropWords(bi).name;
          b.setAttribute('aria-label', labels[bi]);
        });
      }
      if (cropChart) {
        cropChart.data.datasets.forEach(function (d, di) { d.label = labels[di]; });
        cropChart.update();
      }
      showCrop(activeCrop);
    }

    if (cropNames) {
      cropNames.innerHTML = '';
      crop.crops.forEach(function (c, i) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'crop-toggle';
        b.textContent = cropWords(i).name;
        b.setAttribute('aria-pressed', String(i === activeCrop));
        b.addEventListener('click', function () { showCrop(i); });
        cropNames.appendChild(b);
      });
      relabelCrop();
    }

    buildCropChart();
    showCrop(0);

    onLanguage(relabelCrop);

    doc.addEventListener('sw:themechange', function () {
      if (!cropChart) return;
      var t = ridgeColors();
      var sc = cropChart.options.scales || {};
      if (sc.y) {
        if (sc.y.grid) sc.y.grid.color = t.grid;
        if (sc.y.ticks) sc.y.ticks.color = t.text;
        if (sc.y.title) sc.y.title.color = t.text;
      }
      if (sc.x && sc.x.ticks) sc.x.ticks.color = t.text;
      cropChart.update();
    });
  }

  /* ---------------------------------------------------------
     3. Irrigation alert
     A 3-day rain forecast for the centre of the map, from the free
     Open-Meteo forecast API (no key, no account).

       green  no rain in 3 days
       amber  light rain
       red    heavy rain (more than 20 mm in 3 days)
     --------------------------------------------------------- */
  var irrCard = doc.getElementById('irrigationCard');

  if (irrCard) {
    var irrHeadline = doc.getElementById('irrigationHeadline');
    var irrMsg = doc.getElementById('irrigationMsg');
    var irrTotal = doc.getElementById('irrigationTotal');
    var irrDays = doc.getElementById('irrigationDays');
    var irrCoords = doc.getElementById('irrigationCoords');

    var IRR_URL = 'https://api.open-meteo.com/v1/forecast';
    var IRR_HEAVY = 20;            // mm over 3 days counts as heavy rain
    var IRR_ANY = 1;               // below this it is "no real rain"
    var IRR_CLASSES = ['is-loading', 'is-green', 'is-amber', 'is-red', 'is-error'];

    var irrState = null;           // { lat, lng, days, total, level }
    var irrToken = 0;              // ignore replies from an older request
    var irrKey = '';               // "30.901,75.857" — skip repeat downloads

    function irrClass(name) {
      IRR_CLASSES.forEach(function (c) { irrCard.classList.remove(c); });
      irrCard.classList.add('is-' + name);
    }

    // Where should the forecast be for? The middle of the map, or the
    // study area if the map has not reported itself yet.
    function irrCentre() {
      var api = window.SatelliteWatch;
      if (api && typeof api.getCenter === 'function') {
        try {
          var c = api.getCenter();
          if (c && isFinite(c.lat) && isFinite(c.lng)) return { lat: c.lat, lng: c.lng };
        } catch (e) {}
      }
      var area = (CFG && CFG.studyArea) || {};
      var fallback = area.center || [30.901, 75.8573];
      return { lat: fallback[0], lng: fallback[1] };
    }

    function irrLevel(total) {
      if (total > IRR_HEAVY) return 'red';
      if (total >= IRR_ANY) return 'amber';
      return 'green';
    }

    function irrFallbackWord(level) {
      if (level === 'red') return 'Heavy rain expected';
      if (level === 'amber') return 'Light rain expected';
      return 'No rain expected';
    }

    function irrFallbackMsg(level) {
      if (level === 'red') {
        return 'Heavy rain ({mm} mm) is coming in the next 3 days — hold off watering to avoid waterlogging.';
      }
      if (level === 'amber') {
        return 'Light rain ({mm} mm) is likely in the next 3 days — you can delay watering a little.';
      }
      return 'No rain is expected in the next 3 days — irrigate as usual.';
    }

    function irrDayLabel(dateStr) {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var when = new Date(dateStr + 'T00:00:00');
      var diff = Math.round((when - today) / 86400000);
      if (isFinite(diff)) {
        if (diff <= 0) return T('irrigation.today', 'Today');
        if (diff === 1) return T('irrigation.tomorrow', 'Tomorrow');
        if (diff === 2) return T('irrigation.dayAfter', 'Day after');
        try {
          return when.toLocaleDateString(undefined, { weekday: 'short' });
        } catch (e) {}
      }
      return dateStr;
    }

    function irrRender() {
      if (!irrState) return;
      var level = irrState.level;
      var mm = irrState.total.toFixed(1);

      irrClass(level);
      if (irrCoords) {
        irrCoords.textContent = irrState.lat.toFixed(3) + ', ' + irrState.lng.toFixed(3);
      }
      if (irrHeadline) {
        irrHeadline.textContent = T('irrigation.' + level, irrFallbackWord(level));
      }
      if (irrMsg) {
        // One short line a farmer can act on, with the 3-day total in it.
        irrMsg.textContent = T('irrigation.' + level + 'Msg', irrFallbackMsg(level), { mm: mm });
      }
      if (irrTotal) irrTotal.textContent = mm + ' mm';
      if (irrDays) {
        irrDays.innerHTML = '';
        var days = irrState.days || [];
        irrDays.hidden = !days.length;
        days.forEach(function (d) {
          var chip = doc.createElement('div');
          chip.className = 'irrigation-day';
          var label = doc.createElement('span');
          label.textContent = irrDayLabel(d.date);
          var value = doc.createElement('strong');
          value.textContent = d.mm.toFixed(1) + ' mm';
          chip.appendChild(label);
          chip.appendChild(value);
          irrDays.appendChild(chip);
        });
      }
    }

    function irrLoading(centre) {
      irrClass('loading');
      if (irrCoords && centre) {
        irrCoords.textContent = centre.lat.toFixed(3) + ', ' + centre.lng.toFixed(3);
      }
      if (irrHeadline) irrHeadline.textContent = T('irrigation.loading', 'Checking the rain forecast…');
      if (irrMsg) irrMsg.textContent = '';
      if (irrTotal) irrTotal.textContent = '';
      if (irrDays) { irrDays.hidden = true; irrDays.innerHTML = ''; }
    }

    function irrError() {
      irrClass('error');
      if (irrHeadline) irrHeadline.textContent = T('irrigation.error', 'The rain forecast could not be loaded right now.');
      if (irrMsg) irrMsg.textContent = '';
      if (irrTotal) irrTotal.textContent = '';
      if (irrDays) { irrDays.hidden = true; irrDays.innerHTML = ''; }
    }

    function irrLoad(centre) {
      var c = centre || irrCentre();
      if (!c || !isFinite(c.lat) || !isFinite(c.lng)) return;

      var key = c.lat.toFixed(3) + ',' + c.lng.toFixed(3);
      if (key === irrKey && irrState) return;   // already showing this spot
      irrKey = key;

      var mine = ++irrToken;
      irrLoading(c);

      var url = IRR_URL +
        '?latitude=' + c.lat.toFixed(4) +
        '&longitude=' + c.lng.toFixed(4) +
        '&daily=precipitation_sum&forecast_days=3&timezone=auto';

      fetch(url).then(function (res) {
        if (!res.ok) throw new Error('forecast request failed');
        return res.json();
      }).then(function (data) {
        if (mine !== irrToken) return;          // a newer spot won
        var daily = data && data.daily;
        var times = (daily && daily.time) || [];
        var sums = (daily && daily.precipitation_sum) || [];
        if (!times.length) throw new Error('no forecast days');

        var days = times.map(function (t, i) {
          var v = Number(sums[i]);
          return { date: t, mm: (isFinite(v) && v > 0) ? v : 0 };
        });
        var total = days.reduce(function (sum, d) { return sum + d.mm; }, 0);

        irrState = { lat: c.lat, lng: c.lng, days: days, total: total, level: irrLevel(total) };
        irrRender();
      }).catch(function () {
        if (mine !== irrToken) return;
        irrState = null;
        irrKey = '';                            // let the next move try again
        irrError();
      });
    }

    // The map tells us when it settles somewhere new.
    doc.addEventListener('sw:mapcentre', function (e) {
      var d = e && e.detail;
      if (d && isFinite(d.lat) && isFinite(d.lng)) irrLoad({ lat: d.lat, lng: d.lng });
    });

    // A language change just re-words the card — no new download.
    onLanguage(irrRender);

    irrLoad(irrCentre());
  }

  /* ---------------------------------------------------------
     4. Try NDVI yourself
     Two sliders for the Red and near-infrared bands, the live
     (NIR − Red) / (NIR + Red) value, a brown → yellow → green
     swatch and one plain sentence about what the number means.
     --------------------------------------------------------- */
  var ndviRed = doc.getElementById('ndviRed');
  var ndviNir = doc.getElementById('ndviNir');
  var ndviScore = doc.getElementById('ndviScore');
  var ndviRedVal = doc.getElementById('ndviRedVal');
  var ndviNirVal = doc.getElementById('ndviNirVal');
  var ndviMarker = doc.getElementById('ndviMarker');
  var ndviExplain = doc.getElementById('ndviExplain');
  var ndviReset = doc.getElementById('ndviReset');

  if (ndviRed && ndviNir) {
    var NDVI_DEFAULTS = { red: 0.2, nir: 0.6 };

    // Which plain-language line fits this value?
    function ndviKey(value) {
      if (value < 0) return 'ex1';       // water, bare soil, built-up
      if (value < 0.2) return 'ex2';
      if (value < 0.4) return 'ex3';
      if (value < 0.6) return 'ex4';
      if (value < 0.8) return 'ex5';
      return 'ex6';
    }

    // Same brown → yellow → green ramp as the bar drawn in the CSS.
    function ndviColour(value) {
      var stops = [
        [-1.0, [107, 79, 42]],
        [0.0, [185, 163, 78]],
        [0.2, [216, 195, 74]],
        [0.5, [127, 191, 99]],
        [1.0, [46, 158, 91]]
      ];
      var x = Math.min(1, Math.max(-1, value));
      for (var i = 0; i < stops.length - 1; i++) {
        var a = stops[i];
        var b = stops[i + 1];
        if (x >= a[0] && x <= b[0]) {
          var t = (b[0] === a[0]) ? 0 : (x - a[0]) / (b[0] - a[0]);
          var rgb = a[1].map(function (channel, j) {
            return Math.round(channel + (b[1][j] - channel) * t);
          });
          return 'rgb(' + rgb.join(', ') + ')';
        }
      }
      return 'rgb(46, 158, 91)';
    }

    function ndviUpdate() {
      var red = parseFloat(ndviRed.value);
      var nir = parseFloat(ndviNir.value);
      if (!isFinite(red)) red = 0;
      if (!isFinite(nir)) nir = 0;

      if (ndviRedVal) ndviRedVal.textContent = red.toFixed(2);
      if (ndviNirVal) ndviNirVal.textContent = nir.toFixed(2);

      var sum = red + nir;
      var percent = 50;
      var colour = 'rgb(185, 163, 78)';

      if (sum <= 0) {
        // 0 / 0 has no answer — say so instead of printing NaN.
        if (ndviScore) ndviScore.textContent = '—';
        if (ndviExplain) {
          ndviExplain.textContent = T('ndvi.zero',
            'Both bands are zero, so there is nothing to compare — move a slider.');
        }
        if (ndviScore) ndviScore.style.color = '';
      } else {
        var value = (nir - red) / sum;
        percent = (value + 1) / 2 * 100;
        colour = ndviColour(value);
        if (ndviScore) ndviScore.textContent = value.toFixed(2);
        if (ndviExplain) ndviExplain.textContent = T('ndvi.' + ndviKey(value), '');
        if (ndviScore) ndviScore.style.color = colour;
      }

      if (ndviMarker) {
        ndviMarker.style.left = Math.min(100, Math.max(0, percent)) + '%';
        ndviMarker.style.background = colour;
      }
    }

    ndviRed.addEventListener('input', ndviUpdate);
    ndviNir.addEventListener('input', ndviUpdate);
    ndviRed.addEventListener('change', ndviUpdate);
    ndviNir.addEventListener('change', ndviUpdate);

    if (ndviReset) {
      ndviReset.addEventListener('click', function () {
        ndviRed.value = String(NDVI_DEFAULTS.red);
        ndviNir.value = String(NDVI_DEFAULTS.nir);
        ndviUpdate();
      });
    }

    // Re-word the sentence (and the labels) after a language change.
    onLanguage(ndviUpdate);

    ndviUpdate();
  }

  /* ---------------------------------------------------------
     5. Download report — print-only date stamp
     --------------------------------------------------------- */
  var reportDate = doc.getElementById('reportDate');
  function stampDate() {
    if (!reportDate) return;
    var now = new Date();
    var code = 'en';
    try { if (window.SW_I18N) code = window.SW_I18N.lang(); } catch (e) {}
    var locale = code === 'hi' ? 'hi-IN' : (code === 'pa' ? 'pa-IN' : 'en-GB');
    var options = { day: 'numeric', month: 'long', year: 'numeric' };
    try {
      reportDate.textContent = now.toLocaleDateString(locale, options);
    } catch (e) {
      reportDate.textContent = now.toDateString();
    }
  }
  stampDate();
  onLanguage(stampDate);

  var printBtn = doc.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', function () {
      window.print();
    });
  }

  /* ---------------------------------------------------------
     6. Share + QR code
     --------------------------------------------------------- */
  var toastEl = doc.getElementById('siteToast');
  var toastTimer = null;

  function showSiteToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove('is-visible');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
      window.setTimeout(function () {
        if (!toastEl.classList.contains('is-visible')) toastEl.hidden = true;
      }, 260);
    }, 2600);
  }

  // Any module can ask for the page toast by dispatching "sw:toast"
  // (the chat uses it for microphone problems).
  doc.addEventListener('sw:toast', function (e) {
    var msg = e && e.detail && e.detail.message;
    if (msg) showSiteToast(msg);
  });

  function copyToClipboard(text) {    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    doc.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(area);
    return ok;
  }

  var shareBtn = doc.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var url = window.location.href;
      var payload = {
        title: 'iota√-1 | Small changes, seen from space',
        text: T('share.text', "Satellite data for local problem solving — see how Punjab's fields changed from space."),
        url: url
      };

      var fallback = function () {
        copyToClipboard(url).then(function (ok) {
          showSiteToast(ok
            ? T('share.copied', 'Link copied')
            : T('share.copyManual', 'Copy this link: {url}', { url: url }));
        });
      };

      if (navigator.share) {
        navigator.share(payload).catch(function (err) {
          // The user closing the share sheet is not an error.
          if (err && err.name === 'AbortError') return;
          fallback();
        });
        return;
      }
      fallback();
    });
  }

  var qrBtn = doc.getElementById('qrBtn');
  var qrModal = doc.getElementById('qrModal');
  var qrClose = doc.getElementById('qrClose');
  var qrHolder = doc.getElementById('qrHolder');
  var qrNote = doc.getElementById('qrNote');
  var qrLastFocus = null;

  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var qrLibPromise = null;

  function loadQrLib() {
    if (typeof window.QRCode !== 'undefined') return Promise.resolve();
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = QR_LIB;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        if (typeof window.QRCode !== 'undefined') resolve();
        else reject(new Error('qr unavailable'));
      };
      s.onerror = function () { reject(new Error('qr unavailable')); };
      doc.head.appendChild(s);
    });
    return qrLibPromise;
  }

  function openQr() {
    if (!qrModal || !qrHolder) return;
    var url = window.location.href;
    qrLastFocus = doc.activeElement;
    qrHolder.innerHTML = '';
    if (qrNote) {
      qrNote.textContent = T('qr.loading', 'Loading…');
      qrNote.classList.remove('is-error');
    }
    qrModal.hidden = false;
    doc.body.classList.add('is-modal-open');
    if (qrClose) qrClose.focus();

    loadQrLib().then(function () {
      qrHolder.innerHTML = '';
      new window.QRCode(qrHolder, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#12201a',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      if (qrNote) {
        qrNote.textContent = T('qr.ready', 'Point a phone camera at the code to open this page.');
        qrNote.classList.remove('is-error');
      }
    }).catch(function () {
      qrHolder.innerHTML = '';
      var a = doc.createElement('a');
      a.href = url;
      a.className = 'qr-fallback-link';
      a.textContent = url;
      qrHolder.appendChild(a);
      if (qrNote) {
        qrNote.textContent = T('qr.fail', 'The QR code could not be loaded — use this link instead.');
        qrNote.classList.add('is-error');
      }
    });
  }

  function closeQr() {
    if (!qrModal || qrModal.hidden) return;
    qrModal.hidden = true;
    doc.body.classList.remove('is-modal-open');
    if (qrHolder) qrHolder.innerHTML = '';
    if (qrLastFocus && qrLastFocus.focus) qrLastFocus.focus();
  }

  if (qrBtn) qrBtn.addEventListener('click', openQr);
  if (qrClose) qrClose.addEventListener('click', closeQr);
  if (qrModal) {
    qrModal.addEventListener('click', function (e) {
      if (e.target === qrModal) closeQr();
    });
  }
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeQr();
  });
})();
