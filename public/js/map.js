/* ============================================================
   Satellite Watch — Interactive Leaflet map
   ------------------------------------------------------------
   - Base layers (radio): Esri World Imagery, Sentinel-2
     cloudless by EOX, OpenStreetMap streets
   - Overlays (checkbox + opacity): RainViewer rain radar with
     play/pause, NASA GIBS IMERG rainfall, NASA GIBS MODIS NDVI
   - Click the map for an Open-Meteo 7-day-back / 7-day-forward
     forecast with a Chart.js rainfall bar chart
   - Search (Nominatim), fullscreen, locate-me, scale bar
   Initial centre / zoom / bounds come from js/config.js.
   ============================================================ */

(function () {
  'use strict';

  var doc = document;
  var host = doc.getElementById('map');
  if (!host) return;

  /* ---------------------------------------------------------
     Config
     --------------------------------------------------------- */
  var CFG = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : (window.CONFIG || {});
  var study = CFG.studyArea || {};
  var CENTER = (study.center && study.center.length === 2) ? study.center : [30.9010, 75.8573];
  var ZOOM = (typeof study.zoom === 'number') ? study.zoom : 11;
  var MAX_ZOOM = 18;

  // Text helper — the English wording below is always the fallback.
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
  function onLanguage(fn) { doc.addEventListener('sw:language', function () { fn(); }); }

  if (typeof L === 'undefined') {
    host.innerHTML = '<div class="map-fallback"><p>' +
      T('map.fallback', 'The interactive map could not load. Please refresh the page.') + '</p></div>';
    return;
  }

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */
  var TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  var ICON_LOCATE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6"/></svg>';
  var ICON_FULL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>';
  var ICON_OPACITY = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return isoDate(d);
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function sum(arr) { return arr.reduce(function (a, b) { return a + num(b); }, 0); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function shortDate(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? (p[2] + '/' + p[1]) : String(iso);
  }
  function themeColors() {
    var cs = getComputedStyle(doc.documentElement);
    return {
      grid: (cs.getPropertyValue('--grid-line') || '').trim() || 'rgba(0,0,0,.12)',
      text: (cs.getPropertyValue('--muted') || '').trim() || '#5b6b62'
    };
  }

  /* ---------------------------------------------------------
     Toast
     --------------------------------------------------------- */
  var toastEl = doc.getElementById('mapToast');
  var toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    // restart the entry animation
    toastEl.classList.remove('is-visible');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
      window.setTimeout(function () { if (!toastEl.classList.contains('is-visible')) toastEl.hidden = true; }, 260);
    }, 6000);
  }

  /* ---------------------------------------------------------
     Map
     --------------------------------------------------------- */
  // The view is set here, once. Afterwards it may only move when the user
  // searches for a place or presses "find my location".
  //
  // Do NOT re-introduce maxBounds here: Leaflet attaches _panInsideMaxBounds
  // to every moveend (see L.Map#setMaxBounds), so any drag that ends outside
  // the box is panned straight back, and maxBoundsViscosity makes the drag
  // fight the pointer on the way out. Both read as "the map snaps back".
  var map = L.map(host, {
    center: CENTER,
    zoom: ZOOM,
    minZoom: 4,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    wheelPxPerZoomLevel: 100,
    worldCopyJump: true,
    preferCanvas: true,
    // All interaction is on; nothing in this file disables any of it.
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true
  });

  /* ---------------------------------------------------------
     Publish the map centre
     The irrigation alert follows wherever the visitor moves the
     map to. Publishing never moves the view itself.
     --------------------------------------------------------- */
  var centreTimer = null;
  var lastPublished = { lat: CENTER[0], lng: CENTER[1] };

  function publishCentre(force) {
    var c = map.getCenter();
    if (!force) {
      var moved = Math.abs(c.lat - lastPublished.lat) > 0.02 ||
        Math.abs(c.lng - lastPublished.lng) > 0.02;
      if (!moved) return;
    }
    lastPublished = { lat: c.lat, lng: c.lng };
    try {
      doc.dispatchEvent(new CustomEvent('sw:mapcentre', {
        detail: { lat: c.lat, lng: c.lng }
      }));
    } catch (e) {}
  }

  // Debounced: a drag fires moveend repeatedly while the finger is down.
  map.on('moveend zoomend', function () {
    if (centreTimer) window.clearTimeout(centreTimer);
    centreTimer = window.setTimeout(function () { publishCentre(false); }, 800);
  });

  // Other modules can read the centre directly (used on start-up, before
  // any move event has fired).
  window.SatelliteWatch = window.SatelliteWatch || {};
  window.SatelliteWatch.getCenter = function () {
    var c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  };

  /* ---------- Base layers ---------- */
  var satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: MAX_ZOOM, maxNativeZoom: 18, attribution: 'Tiles &copy; Esri' }
  );
  var sentinel = L.tileLayer(
    'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 14,
      attribution: 'Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data)'
    }
  );
  var streets = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: MAX_ZOOM, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }
  );

  satellite.addTo(map);

  var baseLayers = {
    'Satellite (Esri)': satellite,
    'Sentinel-2 cloudless (EOX)': sentinel,
    'Streets (OpenStreetMap)': streets
  };

  /* ---------- Overlay layers ---------- */
  var GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';

  // NASA IMERG rainfall — yesterday, with graceful fallback because the
  // product has a couple of days of latency.
  var rainfall = L.tileLayer(TRANSPARENT, {
    maxZoom: MAX_ZOOM, maxNativeZoom: 6, opacity: 0.8,
    attribution: 'Rainfall: NASA GIBS / IMERG'
  });
  var IMERG_DATES = [daysAgo(1), daysAgo(3), daysAgo(6), null];
  var imergIdx = 0, imergWarned = false;
  function setImerg(i) {
    var t = IMERG_DATES[i] || 'default';
    rainfall.setUrl(GIBS + 'IMERG_Precipitation_Rate/default/' + t + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png');
  }
  setImerg(0);

  // NASA MODIS Terra NDVI (8-day composite) — a recent date.
  var veg = L.tileLayer(TRANSPARENT, {
    maxZoom: MAX_ZOOM, maxNativeZoom: 9, opacity: 0.75,
    attribution: 'Vegetation: NASA GIBS / MODIS Terra NDVI (8-day)'
  });
  var VEG_DATES = [daysAgo(10), daysAgo(18), daysAgo(26), null];
  var vegIdx = 0, vegWarned = false;
  function setVeg(i) {
    var t = VEG_DATES[i] || 'default';
    veg.setUrl(GIBS + 'MODIS_Terra_NDVI_8Day/default/' + t + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png');
  }
  setVeg(0);

  // RainViewer rain radar — URL is filled in from the API response.
  var radar = L.tileLayer(TRANSPARENT, {
    maxZoom: MAX_ZOOM, maxNativeZoom: 7, opacity: 0.75,
    attribution: 'Weather data by <a href="https://www.rainviewer.com" target="_blank" rel="noopener">Rain Viewer</a>'
  });

  var overlays = {
    'Rain radar (RainViewer)': radar,
    'Rainfall (NASA IMERG)': rainfall,
    'Vegetation (MODIS NDVI)': veg
  };

  var overlayMeta = [
    { name: 'Rain radar', key: 'map.radarName', layer: radar, input: null },
    { name: 'NASA IMERG rainfall', key: 'map.imergName', layer: rainfall, input: null },
    { name: 'MODIS NDVI', key: 'map.ndviName', layer: veg, input: null }
  ];
  function metaFor(layer) {
    for (var i = 0; i < overlayMeta.length; i++) { if (overlayMeta[i].layer === layer) return overlayMeta[i]; }
    return null;
  }
  function setSliderEnabled(layer, enabled) {
    var m = metaFor(layer);
    if (m && m.input) m.input.disabled = !enabled;
  }

  /* ---------- Controls ---------- */
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.layers(baseLayers, overlays, { position: 'topright', collapsed: true }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 140 }).addTo(map);

  // Opacity panel (one slider per overlay)
  var OpacityControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function (m) {
      var wrap = L.DomUtil.create('div', 'leaflet-control map-opacity');
      var btn = L.DomUtil.create('button', 'map-opacity-toggle', wrap);
      btn.type = 'button';
      btn.title = T('map.opacity', 'Layer opacity');
      btn.setAttribute('aria-label', T('map.opacity', 'Layer opacity'));
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = ICON_OPACITY;

      var panel = L.DomUtil.create('div', 'map-opacity-panel', wrap);
      panel.hidden = true;

      overlayMeta.forEach(function (meta) {
        var row = L.DomUtil.create('label', 'map-opacity-row', panel);
        var name = L.DomUtil.create('span', 'map-opacity-name', row);
        var label = T(meta.key, meta.name);
        name.textContent = label;
        var input = L.DomUtil.create('input', 'map-opacity-range', row);
        input.type = 'range';
        input.min = '0'; input.max = '100'; input.step = '5';
        input.value = String(Math.round(meta.layer.options.opacity * 100));
        input.setAttribute('aria-label', T('map.opacityOf', '{name} opacity', { name: label }));
        input.disabled = !m.hasLayer(meta.layer);
        L.DomEvent.on(input, 'input', function () {
          meta.layer.setOpacity(parseInt(input.value, 10) / 100);
        });
        meta.input = input;
      });

      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      L.DomEvent.on(btn, 'click', function (ev) {
        L.DomEvent.stop(ev);
        panel.hidden = !panel.hidden;
        wrap.classList.toggle('is-open', !panel.hidden);
        btn.setAttribute('aria-expanded', String(!panel.hidden));
      });
      return wrap;
    }
  });
  map.addControl(new OpacityControl());

  /* ---------------------------------------------------------
     Layer information cards
     Every layer in the switcher gets a small "i" button that opens
     a card with its source, resolution, update rate, best use and
     one limitation. Facts come from CONFIG.layerFacts.
     --------------------------------------------------------- */
  var layerFacts = CFG.layerFacts || {};
  var infoPop = null;
  var infoBtn = null;

  // Hindi / Punjabi facts live in js/translations.js; English in js/config.js.
  function factsFor(name) {
    var translated = langData('layerFacts');
    if (translated && translated[name]) return translated[name];
    return layerFacts[name];
  }

  function closeLayerInfo() {
    if (infoPop && infoPop.parentNode) infoPop.parentNode.removeChild(infoPop);
    if (infoBtn) {
      infoBtn.classList.remove('is-active');
      infoBtn.setAttribute('aria-expanded', 'false');
    }
    infoPop = null;
    infoBtn = null;
  }

  // Placed in page coordinates next to its button, so the map frame's
  // overflow can never clip it.
  function positionInfoPop(pop, btn) {
    var rect = btn.getBoundingClientRect();
    var sx = window.pageXOffset || doc.documentElement.scrollLeft || 0;
    var sy = window.pageYOffset || doc.documentElement.scrollTop || 0;
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;

    var left = rect.left + sx - w - 12;               // prefer the left of the control
    if (left < sx + 8) left = Math.min(rect.left + sx, sx + window.innerWidth - w - 8);
    if (left < sx + 8) left = sx + 8;

    var top = rect.top + sy - 8;
    var lowest = sy + window.innerHeight - h - 8;
    if (top > lowest) top = lowest;        // slide up so the bottom stays in view
    if (top < sy + 8) top = sy + 8;        // but never above the top of the screen

    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  function openLayerInfo(name, facts, btn) {
    closeLayerInfo();

    var pop = doc.createElement('div');
    pop.className = 'layer-info-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', T('map.layerInfoOf', '{name} — layer information', { name: name }));

    var rows = [
      [T('layer.source', 'Source'), facts.source],
      [T('layer.resolution', 'Resolution'), facts.resolution],
      [T('layer.updates', 'How often it updates'), facts.updates],
      [T('layer.goodFor', 'What it is good for'), facts.goodFor],
      [T('layer.limit', 'One limitation'), facts.limit]
    ];
    var html = '<h4 class="layer-info-title">' + esc(name) + '</h4><dl class="layer-info-list">';
    rows.forEach(function (row) {
      if (!row[1]) return;
      html += '<dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd>';
    });
    html += '</dl>';
    pop.innerHTML = html;

    pop.style.visibility = 'hidden';
    doc.body.appendChild(pop);
    positionInfoPop(pop, btn);
    pop.style.visibility = '';

    infoPop = pop;
    infoBtn = btn;
    btn.classList.add('is-active');
    btn.setAttribute('aria-expanded', 'true');
  }

  function toggleLayerInfo(name, facts, btn) {
    if (infoBtn === btn && infoPop) closeLayerInfo();
    else openLayerInfo(name, facts, btn);
  }

  // Any layer add or remove makes Leaflet rebuild the control's list,
  // so the buttons are re-attached (idempotent).
  function setupLayerInfo() {
    var labels = doc.querySelectorAll('.leaflet-control-layers-base label, .leaflet-control-layers-overlays label');
    Array.prototype.forEach.call(labels, function (label) {
      var parent = label.parentNode;
      if (!parent) return;

      var name = (label.textContent || '').replace(/\s+/g, ' ').trim();
      var facts = factsFor(name);
      if (!facts) return;

      // Already set up: just refresh the button wording for the new language.
      if (parent.classList.contains('layer-row')) {
        var existing = parent.querySelector('.layer-info-btn');
        if (existing) {
          existing.setAttribute('aria-label', T('map.aboutLayer', 'About the {name} layer', { name: name }));
        }
        return;
      }

      var row = doc.createElement('div');
      row.className = 'layer-row';
      parent.insertBefore(row, label);
      row.appendChild(label);

      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'layer-info-btn';
      btn.textContent = 'i';
      btn.setAttribute('aria-label', T('map.aboutLayer', 'About the {name} layer', { name: name }));
      btn.setAttribute('aria-expanded', 'false');
      L.DomEvent.on(btn, 'click', function (ev) {
        L.DomEvent.stop(ev);
        ev.preventDefault();
        // Look the facts up now, so the card follows the current language.
        toggleLayerInfo(name, factsFor(name), btn);
      });
      row.appendChild(btn);
    });
  }

  setupLayerInfo();
  map.on('layeradd layerremove', function () { closeLayerInfo(); setupLayerInfo(); });

  // A language change re-labels the "i" buttons and closes any open card,
  // since its text would otherwise be in the old language.
  onLanguage(function () {
    closeLayerInfo();
    setupLayerInfo();
  });

  // Capture phase: Leaflet stops clicks inside its controls from bubbling,
  // which would otherwise hide "click outside to close".
  doc.addEventListener('click', function (e) {
    if (!infoPop) return;
    if (infoPop.contains(e.target)) return;
    if (infoBtn && infoBtn.contains(e.target)) return;
    closeLayerInfo();
  }, true);
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeLayerInfo();
  });

  /* ---------------------------------------------------------
     Compare two spots (rainfall side by side)
     The user taps two points; Open-Meteo daily rainfall for the
     past 7 and next 7 days is then charted as grouped bars.
     The view is never moved here — both points are already visible.
     --------------------------------------------------------- */
  var compareStart = doc.getElementById('compareStart');
  var compareResetBtn = doc.getElementById('compareReset');
  var compareHint = doc.getElementById('compareHint');
  var comparePointsEl = doc.getElementById('comparePoints');
  var compareAEl = doc.getElementById('compareA');
  var compareBEl = doc.getElementById('compareB');
  var compareStatus = doc.getElementById('compareStatus');
  var compareChartBox = doc.getElementById('compareChartBox');
  var compareCanvas = doc.getElementById('compareChart');
  var compareVerdict = doc.getElementById('compareVerdict');

  var COMPARE_HINT = 'Press “Pick two spots”, then tap any two places on the map.';
  var COMPARE_COLORS = ['#2e9e5b', '#2a7fba'];
  var COMPARE_LETTERS = ['A', 'B'];

  function compareHintText() { return T('compare.hint', COMPARE_HINT); }
  function spotName(i) {
    return T(i === 0 ? 'compare.spotA' : 'compare.spotB', i === 0 ? 'Spot A' : 'Spot B');
  }

  var compareArmed = false;
  var comparePts = [];
  var compareMarkers = [];
  var compareChart = null;
  var compareToken = 0;
  var lastCompare = null;

  function comparePin(letter, colour) {
    return L.divIcon({
      className: 'compare-pin compare-pin--' + letter.toLowerCase(),
      html: '<span>' + letter + '</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function resetCompare() {
    compareToken += 1;
    compareArmed = false;
    comparePts = [];
    compareMarkers.forEach(function (m) {
      if (map.hasLayer(m)) map.removeLayer(m);
    });
    compareMarkers = [];
    if (compareChart) { compareChart.destroy(); compareChart = null; }
    lastCompare = null;
    if (host) host.classList.remove('is-picking');
    if (compareStart) { compareStart.textContent = T('compare.start', 'Pick two spots'); compareStart.hidden = false; }
    if (compareResetBtn) compareResetBtn.hidden = true;
    if (comparePointsEl) comparePointsEl.hidden = true;
    if (compareAEl) { compareAEl.hidden = true; compareAEl.textContent = ''; }
    if (compareBEl) { compareBEl.hidden = true; compareBEl.textContent = ''; }
    if (compareStatus) { compareStatus.hidden = true; compareStatus.textContent = ''; }
    if (compareChartBox) compareChartBox.hidden = true;
    if (compareVerdict) { compareVerdict.hidden = true; compareVerdict.textContent = ''; }
    if (compareHint) compareHint.textContent = compareHintText();
  }

  function addComparePoint(latlng) {
    if (!compareArmed || comparePts.length > 1) return;
    var i = comparePts.length;
    comparePts.push(latlng);

    compareMarkers.push(L.marker(latlng, {
      icon: comparePin(COMPARE_LETTERS[i], COMPARE_COLORS[i]),
      keyboard: false,
      zIndexOffset: 600
    }).addTo(map));

    var pill = (i === 0) ? compareAEl : compareBEl;
    if (pill) {
      pill.hidden = false;
      pill.textContent = COMPARE_LETTERS[i] + ': ' + latlng.lat.toFixed(4) + ', ' + latlng.lng.toFixed(4);
    }
    if (comparePointsEl) comparePointsEl.hidden = false;

    if (comparePts.length === 1) {
      if (compareHint) compareHint.textContent = T('compare.hintA', 'Spot A placed. Now tap the second spot (B).');
      return;
    }

    compareArmed = false;
    if (host) host.classList.remove('is-picking');
    if (compareStart) compareStart.textContent = T('compare.start', 'Pick two spots');
    if (compareHint) compareHint.textContent = T('compare.hintBoth', 'Past 7 days and next 7 days of rain, side by side.');
    fetchCompareRain();
  }

  function verdictSentence(aTotal, bTotal) {
    var diff = Math.abs(aTotal - bTotal);
    if (diff < 0.5) {
      return T('compare.same', 'Over these two weeks the two spots got or will get almost the same rain — about {v} mm each.',
        { v: aTotal.toFixed(1) });
    }
    var aWetter = aTotal > bTotal;
    var wetter = spotName(aWetter ? 0 : 1);
    var drier = spotName(aWetter ? 1 : 0);
    var high = Math.max(aTotal, bTotal);
    var low = Math.min(aTotal, bTotal);
    return T('compare.more', 'Over these two weeks, {wetter} got or will get about {d} mm more rain than {drier} ({high} mm against {low} mm).',
      { wetter: wetter, drier: drier, d: diff.toFixed(1), high: high.toFixed(1), low: low.toFixed(1) });
  }

  function renderCompare(a, b) {
    var days = a.days || [];
    var labels = days.map(function (d) { return shortDate(d.date); });
    var aVals = days.map(function (d) { return Math.round(num(d.precip) * 10) / 10; });
    var bVals = (b.days || []).map(function (d) { return Math.round(num(d.precip) * 10) / 10; });
    var t = themeColors();

    var aName = spotName(0) + ' (' + comparePts[0].lat.toFixed(3) + ', ' + comparePts[0].lng.toFixed(3) + ')';
    var bName = spotName(1) + ' (' + comparePts[1].lat.toFixed(3) + ', ' + comparePts[1].lng.toFixed(3) + ')';

    lastCompare = { a: a, b: b };
    if (compareChart) { compareChart.destroy(); compareChart = null; }

    if (typeof Chart !== 'undefined' && compareCanvas) {
      compareChart = new Chart(compareCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: aName, data: aVals,
              backgroundColor: 'rgba(46,158,91,0.85)', borderColor: COMPARE_COLORS[0], borderWidth: 1,
              borderRadius: 3, maxBarThickness: 14
            },
            {
              label: bName, data: bVals,
              backgroundColor: 'rgba(42,127,186,0.85)', borderColor: COMPARE_COLORS[1], borderWidth: 1,
              borderRadius: 3, maxBarThickness: 14
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 250 },
          plugins: {
            legend: { position: 'bottom', labels: { color: t.text, boxWidth: 12, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: function (c) { return c.dataset.label + ': ' + c.parsed.y + ' mm'; }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: t.grid, drawBorder: false },
              ticks: { color: t.text, font: { size: 10 }, maxTicksLimit: 5 }
            },
            x: {
              grid: { display: false },
              ticks: { color: t.text, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
            }
          }
        }
      });
    }

    if (compareChartBox) compareChartBox.hidden = false;
    if (compareStatus) {
      compareStatus.hidden = false;
      compareStatus.textContent = T('compare.status',
        'Past 7 days — A: {pa} mm, B: {pb} mm. Next 7 days — A: {na} mm, B: {nb} mm.',
        { pa: a.pastTotal.toFixed(1), pb: b.pastTotal.toFixed(1), na: a.nextTotal.toFixed(1), nb: b.nextTotal.toFixed(1) });
    }
    if (compareVerdict) {
      compareVerdict.hidden = false;
      compareVerdict.textContent = verdictSentence(a.pastTotal + a.nextTotal, b.pastTotal + b.nextTotal);
    }
  }

  function fetchCompareRain() {
    if (comparePts.length < 2) return;
    var token = ++compareToken;
    if (compareStatus) { compareStatus.hidden = false; compareStatus.textContent = T('compare.loading', 'Loading rainfall for both spots…'); }
    if (compareChartBox) compareChartBox.hidden = true;
    if (compareVerdict) { compareVerdict.hidden = true; compareVerdict.textContent = ''; }

    Promise.all(comparePts.map(function (ll) { return fetchForecast(ll.lat, ll.lng); }))
      .then(function (both) {
        if (token !== compareToken) return;
        renderCompare(both[0], both[1]);
      })
      .catch(function () {
        if (token !== compareToken) return;
        if (compareStatus) {
          compareStatus.hidden = false;
          compareStatus.textContent = T('compare.fail', 'Rainfall for these two spots could not be loaded. Please try again.');
        }
      });
  }

  if (compareStart) {
    compareStart.addEventListener('click', function () {
      resetCompare();
      compareArmed = true;
      compareStart.textContent = T('compare.picking', 'Picking… tap the map');
      if (compareHint) compareHint.textContent = T('compare.hintPick', 'Tap the map to place spot A, then tap again for spot B.');
      if (compareResetBtn) compareResetBtn.hidden = false;
      if (comparePointsEl) comparePointsEl.hidden = false;
      if (host) host.classList.add('is-picking');
    });
  }
  if (compareResetBtn) compareResetBtn.addEventListener('click', resetCompare);

  // Re-draw the compare wording in the new language.
  onLanguage(function () {
    if (compareResetBtn) compareResetBtn.textContent = T('compare.reset', 'Reset');
    if (compareArmed) {
      compareStart.textContent = T('compare.picking', 'Picking… tap the map');
      if (compareHint) compareHint.textContent = T('compare.hintPick', 'Tap the map to place spot A, then tap again for spot B.');
      return;
    }
    if (comparePts.length === 2 && lastCompare) {
      compareStart.textContent = T('compare.start', 'Pick two spots');
      if (compareHint) compareHint.textContent = T('compare.hintBoth', 'Past 7 days and next 7 days of rain, side by side.');
      renderCompare(lastCompare.a, lastCompare.b);
      return;
    }
    if (comparePts.length === 1) {
      compareStart.textContent = T('compare.start', 'Pick two spots');
      if (compareHint) compareHint.textContent = T('compare.hintA', 'Spot A placed. Now tap the second spot (B).');
      return;
    }
    if (compareHint) compareHint.textContent = compareHintText();
  });

  // Fullscreen
  var FullControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'leaflet-bar map-ctl');
      var btn = L.DomUtil.create('button', 'map-ctl-btn', wrap);
      btn.type = 'button';
      btn.title = T('map.fullscreen', 'Toggle fullscreen');
      btn.setAttribute('aria-label', T('map.fullscreen', 'Toggle fullscreen'));
      btn.innerHTML = ICON_FULL;
      L.DomEvent.on(btn, 'click', function (ev) {
        L.DomEvent.stop(ev);
        toggleFullscreen(host.parentNode);
      });
      return wrap;
    }
  });
  map.addControl(new FullControl());

  // Locate me
  var LocateControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function (m) {
      var wrap = L.DomUtil.create('div', 'leaflet-bar map-ctl');
      var btn = L.DomUtil.create('button', 'map-ctl-btn', wrap);
      btn.type = 'button';
      btn.title = T('map.locate', 'Find my location');
      btn.setAttribute('aria-label', T('map.locate', 'Find my location'));
      btn.innerHTML = ICON_LOCATE;
      L.DomEvent.on(btn, 'click', function (ev) {
        L.DomEvent.stop(ev);
        m.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
      });
      return wrap;
    }
  });
  map.addControl(new LocateControl());

  var locateMarker = null;
  map.on('locationfound', function (e) {
    if (locateMarker) { locateMarker.setLatLng(e.latlng); }
    else {
      locateMarker = L.circleMarker(e.latlng, {
        radius: 8, color: '#ffffff', weight: 3, fillColor: '#2a7fba', fillOpacity: 1
      }).addTo(map);
    }
    if (map.getZoom() > 16) map.setZoom(16);
    openWeather(e.latlng.lat, e.latlng.lng);
  });
  map.on('locationerror', function () {
    showToast(T('map.locateFail', 'Could not get your location. Check your browser permissions.'));
  });

  function toggleFullscreen(el) {
    if (!el) return;
    var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (!fsEl) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) { try { req.call(el); } catch (e) { showToast(T('map.fullscreenFail', 'Fullscreen is not available.')); } }
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) { try { exit.call(doc); } catch (e) {} }
    }
  }
  function onFsChange() { window.setTimeout(function () { map.invalidateSize(); }, 150); }
  doc.addEventListener('fullscreenchange', onFsChange);
  doc.addEventListener('webkitfullscreenchange', onFsChange);

  /* ---------- Layer failure handling ---------- */
  function guardBase(layer, nameKey, name) {
    var tripped = false;
    layer.on('tileerror', function () {
      if (tripped) return;
      tripped = true;
      showToast(T('map.baseFail', '{name} is unavailable right now, so another base map was used.', { name: T(nameKey, name) }));
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
        var anyBase = map.hasLayer(satellite) || map.hasLayer(sentinel) || map.hasLayer(streets);
        if (!anyBase) (layer === satellite ? streets : satellite).addTo(map);
      }
    });
  }
  guardBase(satellite, 'map.esri', 'Esri satellite imagery');
  guardBase(sentinel, 'map.s2', 'Sentinel-2 cloudless imagery');
  guardBase(streets, 'map.osm', 'OpenStreetMap streets');

  function disableOverlay(layer, nameKey, name) {
    if (map.hasLayer(layer)) map.removeLayer(layer);
    setSliderEnabled(layer, false);
    showToast(T('map.overlayFail', '{name} could not be loaded, so it was turned off.', { name: T(nameKey, name) }));
  }

  rainfall.on('tileerror', function () {
    if (imergIdx < IMERG_DATES.length - 1) {
      imergIdx += 1;
      setImerg(imergIdx);
      if (!imergWarned) { imergWarned = true; showToast(T('map.recentImerg', 'Showing the most recent IMERG rainfall day available.')); }
      return;
    }
    disableOverlay(rainfall, 'map.imergName', 'NASA IMERG rainfall');
  });

  veg.on('tileerror', function () {
    if (vegIdx < VEG_DATES.length - 1) {
      vegIdx += 1;
      setVeg(vegIdx);
      if (!vegWarned) { vegWarned = true; showToast(T('map.recentNdvi', 'Showing the most recent MODIS NDVI composite available.')); }
      return;
    }
    disableOverlay(veg, 'map.ndviName', 'MODIS NDVI');
  });

  radar.on('tileerror', function () {
    if (radarState === 'ready') disableOverlay(radar, 'map.radarName', 'Rain radar');
  });

  /* ---------------------------------------------------------
     Rain radar animation
     --------------------------------------------------------- */
  var radarFrames = [];
  var radarIndex = 0;
  var radarTimer = null;
  var radarState = 'loading'; // loading | ready | failed
  var radarHost = 'https://tilecache.rainviewer.com';

  var tmEl = doc.getElementById('radarTimemachine');
  var tmLabel = doc.getElementById('radarTimeLabel');
  var tmPlay = doc.getElementById('radarPlay');

  function frameLabel(t) {
    var d = new Date(t * 1000);
    var time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return time;
  }
  function setRadarFrame(i) {
    if (!radarFrames.length) return;
    radarIndex = ((i % radarFrames.length) + radarFrames.length) % radarFrames.length;
    var f = radarFrames[radarIndex];
    radar.setUrl(radarHost + f.path + '/256/{z}/{x}/{y}/2/1_1.png');
    if (tmLabel) tmLabel.textContent = frameLabel(f.time);
  }
  function setPlayState(playing) {
    if (!tmPlay) return;
    tmPlay.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    tmPlay.setAttribute('aria-label', playing
      ? T('map.pause', 'Pause radar animation')
      : T('map.play', 'Play radar animation'));
    tmPlay.setAttribute('aria-pressed', String(playing));
    tmPlay.classList.toggle('is-playing', playing);
  }
  function stopRadar() {
    if (radarTimer) { window.clearInterval(radarTimer); radarTimer = null; }
    setPlayState(false);
  }
  function playRadar() {
    if (!radarFrames.length) return;
    stopRadar();
    setRadarFrame(0);
    radarTimer = window.setInterval(function () {
      setRadarFrame(radarIndex + 1);
    }, 700);
    setPlayState(true);
  }
  if (tmPlay) {
    tmPlay.addEventListener('click', function () {
      if (radarTimer) stopRadar(); else playRadar();
    });
  }

  fetch('https://api.rainviewer.com/public/weather-maps.json')
    .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
    .then(function (data) {
      if (!data || !data.radar || !data.radar.past || !data.radar.past.length) throw new Error('bad');
      radarHost = data.host || radarHost;
      radarFrames = data.radar.past.slice(-12);
      radarState = 'ready';
      if (map.hasLayer(radar)) {
        setRadarFrame(radarFrames.length - 1);
        if (tmEl) tmEl.hidden = false;
      }
    })
    .catch(function () {
      radarState = 'failed';
      if (map.hasLayer(radar)) {
        map.removeLayer(radar);
        setSliderEnabled(radar, false);
      }
      showToast(T('map.radarFail', 'Rain radar is unavailable right now.'));
    });

  map.on('overlayadd', function (e) {
    setSliderEnabled(e.layer, true);
    if (e.layer === radar) {
      if (radarState === 'ready') {
        setRadarFrame(radarFrames.length - 1);
        if (tmEl) tmEl.hidden = false;
      } else if (radarState === 'loading') {
        if (tmEl) tmEl.hidden = false;
        if (tmLabel) tmLabel.textContent = T('map.loading', 'Loading…');
      } else {
        showToast(T('map.radarFail', 'Rain radar is unavailable right now.'));
      }
    }
  });
  map.on('overlayremove', function (e) {
    setSliderEnabled(e.layer, false);
    if (e.layer === radar) {
      stopRadar();
      if (tmEl) tmEl.hidden = true;
    }
  });

  /* ---------------------------------------------------------
     Click for weather (Open-Meteo + Chart.js)
     --------------------------------------------------------- */
  var weatherMarker = null;
  var weatherChart = null;
  var weatherToken = 0;

  var pinIcon = L.divIcon({
    className: 'wx-pin',
    html: '<span class="wx-pin-dot"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12]
  });

  function advice(nextDays) {
    var idx = -1;
    for (var i = 0; i < nextDays.length; i++) {
      if (nextDays[i].precip >= 1) { idx = i; break; }
    }
    if (idx === -1) return T('weather.none', 'No significant rain is expected in the next 7 days — irrigation is likely to be needed.');
    if (idx === 0) return T('weather.today', 'Rain is expected today — a good time to delay irrigation.');
    if (idx === 1) return T('weather.inDay', 'Rain expected in 1 day — a good time to delay irrigation.');
    return T('weather.inDays', 'Rain expected in {n} days — a good time to delay irrigation.', { n: idx });
  }

  function computeSummary(json) {
    var d = json.daily || {};
    var time = d.time || [];
    var days = time.map(function (t, i) {
      return {
        date: t,
        precip: num((d.precipitation_sum || [])[i]),
        tmax: num((d.temperature_2m_max || [])[i]),
        tmin: num((d.temperature_2m_min || [])[i])
      };
    });
    var past = days.slice(0, 7);
    var next = days.slice(7);
    var cur = json.current || {};
    return {
      days: days,
      past: past,
      next: next,
      pastTotal: sum(past.map(function (x) { return x.precip; })),
      nextTotal: sum(next.map(function (x) { return x.precip; })),
      advice: advice(next),
      current: { temp: num(cur.temperature_2m), humidity: num(cur.relative_humidity_2m) }
    };
  }

  function fetchForecast(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min' +
      '&current=temperature_2m,relative_humidity_2m' +
      '&past_days=7&forecast_days=7&timezone=auto';
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(computeSummary);
  }

  function popupHead(lat, lon) {
    return '<div class="wx-head"><strong>' + esc(T('weather.title', 'Weather at this spot')) + '</strong>' +
      '<span class="wx-coords">' + lat.toFixed(4) + ', ' + lon.toFixed(4) + '</span></div>';
  }
  function popupLoading(lat, lon) {
    return '<div class="wx-popup">' + popupHead(lat, lon) +
      '<div class="wx-loading"><span class="wx-spinner" aria-hidden="true"></span>' +
      esc(T('weather.loading', 'Loading forecast…')) + '</div></div>';
  }
  function popupError(lat, lon) {
    return '<div class="wx-popup">' + popupHead(lat, lon) +
      '<div class="wx-error">' + esc(T('weather.error', 'Could not load the weather for this spot. Please try again.')) + '</div></div>';
  }
  function popupData(lat, lon, s) {
    var p = [];
    p.push('<div class="wx-popup">');
    p.push(popupHead(lat, lon));
    p.push('<div class="wx-now">');
    p.push('<span class="wx-now-item"><span class="wx-now-label">' + esc(T('weather.now', 'Now')) + '</span><strong>' +
      Math.round(s.current.temp) + '&deg;C</strong></span>');
    p.push('<span class="wx-now-item"><span class="wx-now-label">' + esc(T('weather.humidity', 'Humidity')) + '</span><strong>' +
      Math.round(s.current.humidity) + '%</strong></span>');
    p.push('</div>');
    p.push('<div class="wx-chart"><canvas aria-label="' + esc(T('weather.chartAria', 'Daily rainfall for the past and next 7 days')) + '"></canvas></div>');
    p.push('<div class="wx-totals">');
    p.push('<div class="wx-total"><span>' + esc(T('weather.past7', 'Past 7 days')) + '</span><strong>' + s.pastTotal.toFixed(1) + ' mm</strong></div>');
    p.push('<div class="wx-total"><span>' + esc(T('weather.next7', 'Next 7 days')) + '</span><strong>' + s.nextTotal.toFixed(1) + ' mm</strong></div>');
    p.push('</div>');
    p.push('<p class="wx-advice">' + esc(s.advice) + '</p>');
    p.push('<button type="button" class="btn btn-primary wx-ask">' + esc(T('weather.ask', 'Ask Gemini about this spot')) + '</button>');
    p.push('<p class="wx-credit">' + esc(T('weather.credit', 'Rainfall & temperature model data from Open-Meteo.')) + '</p>');
    p.push('</div>');
    return p.join('');
  }

  function createWeatherChart(canvas, days) {
    if (weatherChart) { weatherChart.destroy(); weatherChart = null; }
    if (typeof Chart === 'undefined' || !canvas) return;
    var t = themeColors();
    var labels = days.map(function (d) { return shortDate(d.date); });
    var values = days.map(function (d) { return Math.round(d.precip * 10) / 10; });
    var colours = days.map(function (d, i) {
      return i < 7 ? 'rgba(42,127,186,0.55)' : 'rgba(46,158,91,0.8)';
    });
    weatherChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: T('weather.rain', 'Rain (mm)'), data: values, backgroundColor: colours, borderRadius: 4, maxBarThickness: 16 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.parsed.y + ' mm'; } } }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: t.grid, drawBorder: false },
            ticks: { color: t.text, font: { size: 10 }, maxTicksLimit: 4 }
          },
          x: {
            grid: { display: false },
            ticks: { color: t.text, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
          }
        }
      }
    });
  }

  function askAboutSpot(lat, lon, s) {
    var q = T('weather.askQ',
      'A farmer is at latitude {lat}, longitude {lon}. About {past} mm of rain fell in the past 7 days, and about {next} mm is forecast for the next 7 days. {advice} In 2-4 short sentences, explain what this means for irrigation and crop planning at this location.',
      { lat: lat.toFixed(4), lon: lon.toFixed(4), past: s.pastTotal.toFixed(1), next: s.nextTotal.toFixed(1), advice: s.advice });
    var api = window.SatelliteWatch;
    if (api && typeof api.askGemini === 'function') {
      api.askGemini(q);
    } else {
      var input = doc.getElementById('chatInput');
      if (input) input.value = q;
    }
    var sec = doc.getElementById('ai-tutor');
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openWeather(lat, lon) {
    if (!weatherMarker) {
      weatherMarker = L.marker([lat, lon], { icon: pinIcon, keyboard: false }).addTo(map);
      weatherMarker.on('click', function (e) {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      });
    } else {
      weatherMarker.setLatLng([lat, lon]);
    }

    weatherMarker.unbindPopup();
    weatherMarker.bindPopup(popupLoading(lat, lon), {
      maxWidth: 320, minWidth: 264, className: 'wx-popup-wrap', autoPanPadding: [26, 26]
    }).openPopup();

    var token = ++weatherToken;
    fetchForecast(lat, lon)
      .then(function (s) {
        if (token !== weatherToken) return;
        weatherMarker.setPopupContent(popupData(lat, lon, s));
        window.setTimeout(function () {
          if (token !== weatherToken) return;
          var popup = weatherMarker.getPopup();
          var el = popup && popup.getElement();
          if (!el) return;
          createWeatherChart(el.querySelector('.wx-chart canvas'), s.days);
          var ask = el.querySelector('.wx-ask');
          if (ask) {
            L.DomEvent.on(ask, 'click', function (ev) {
              L.DomEvent.stop(ev);
              askAboutSpot(lat, lon, s);
            });
          }
        }, 60);
      })
      .catch(function () {
        if (token !== weatherToken) return;
        weatherMarker.setPopupContent(popupError(lat, lon));
      });
  }

  /* ---------------------------------------------------------
     Measure my field
     Tap points on the map to outline a field. The area uses the
     plain spherical-excess formula (Leaflet has no area helper of
     its own) — no extra library, no download.
     --------------------------------------------------------- */
  var measureStart = doc.getElementById('measureStart');
  var measureClear = doc.getElementById('measureClear');
  var measureHint = doc.getElementById('measureHint');
  var measureReadout = doc.getElementById('measureReadout');
  var measureAcres = doc.getElementById('measureAcres');
  var measureHa = doc.getElementById('measureHa');
  var measureM2 = doc.getElementById('measureM2');

  var measureOn = false;
  var measurePts = [];
  var measurePoly = null;
  var measureLine = null;
  var measureDots = [];
  var MEASURE_STYLE = { color: '#2e9e5b', weight: 2.5, fillColor: '#2e9e5b', fillOpacity: 0.18 };
  var M2_PER_ACRE = 4046.8564224;      // international acre
  var M2_PER_HECTARE = 10000;
  var EARTH_RADIUS = 6378137;          // metres (WGS84 equatorial radius)

  // Area of a polygon on a sphere, in square metres:
  //   A = R²/2 · |Σ (λ₂ − λ₁)(2 + sin φ₁ + sin φ₂)|
  // Longitude steps are folded to the short way round the globe.
  function sphericalArea(points) {
    var n = points.length;
    if (n < 3) return 0;
    var sum = 0;
    for (var i = 0; i < n; i++) {
      var p1 = points[i];
      var p2 = points[(i + 1) % n];
      var lat1 = p1.lat * Math.PI / 180;
      var lat2 = p2.lat * Math.PI / 180;
      var dLng = (p2.lng - p1.lng) * Math.PI / 180;
      if (dLng > Math.PI) dLng -= 2 * Math.PI;
      if (dLng < -Math.PI) dLng += 2 * Math.PI;
      sum += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    return Math.abs(sum) * EARTH_RADIUS * EARTH_RADIUS / 2;
  }

  function measureNumber(value, digits) {
    var fixed = value.toFixed(digits);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function measureRender() {
    var m2 = sphericalArea(measurePts);
    var ha = m2 / M2_PER_HECTARE;
    var acres = m2 / M2_PER_ACRE;
    if (measureAcres) measureAcres.textContent = measureNumber(acres, 2);
    if (measureHa) measureHa.textContent = measureNumber(ha, 2);
    if (measureM2) measureM2.textContent = measureNumber(m2, 0);
    if (measurePoly) {
      measurePoly.setTooltipContent(T('measure.haShort', '{v} ha', { v: measureNumber(ha, 2) }));
    }
  }

  function measurePaint() {
    if (measurePts.length >= 3) {
      if (!measurePoly) {
        measurePoly = L.polygon(measurePts, MEASURE_STYLE).addTo(map);
        measurePoly.bindTooltip('', {
          permanent: true, direction: 'center', className: 'measure-tip', sticky: false
        });
      } else {
        measurePoly.setLatLngs(measurePts);
      }
      if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    } else {
      if (measurePoly) { map.removeLayer(measurePoly); measurePoly = null; }
      if (!measureLine) measureLine = L.polyline([], MEASURE_STYLE).addTo(map);
      measureLine.setLatLngs(measurePts);
    }
    measureRender();
  }

  function measureAddPoint(latlng) {
    var point = L.latLng(latlng.lat, latlng.lng);
    measurePts.push(point);
    measureDots.push(L.circleMarker(point, {
      radius: 5, color: '#ffffff', weight: 2, fillColor: '#2e9e5b', fillOpacity: 1, interactive: false
    }).addTo(map));

    if (measureClear) measureClear.hidden = false;
    if (measureReadout) measureReadout.hidden = false;
    measurePaint();

    if (measureHint) {
      measureHint.textContent = measurePts.length < 3
        ? T('measure.need', 'Tap at least three points on the map.')
        : T('measure.hintMore', 'Keep tapping to add corners — three points or more make a field.');
    }
  }

  function measureClearAll() {
    if (measurePoly) { map.removeLayer(measurePoly); measurePoly = null; }
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    measureDots.forEach(function (dot) { map.removeLayer(dot); });
    measureDots = [];
    measurePts = [];
    if (measureClear) measureClear.hidden = true;
    if (measureReadout) measureReadout.hidden = true;
    if (measureHint) measureHint.textContent = T('measure.hint', 'Tap the map to outline your field.');
  }

  function measureSetActive(on) {
    measureOn = on;
    if (host) host.classList.toggle('is-measuring', on);
    if (measureStart) {
      measureStart.textContent = on
        ? T('measure.stop', 'Stop measuring')
        : T('measure.btn', 'Measure my field');
      measureStart.setAttribute('aria-pressed', String(on));
      measureStart.classList.toggle('btn-primary', !on);
      measureStart.classList.toggle('btn-quiet', on);
    }
    if (on && measureHint) {
      measureHint.textContent = measurePts.length >= 3
        ? T('measure.hintMore', 'Keep tapping to add corners — three points or more make a field.')
        : T('measure.hint', 'Tap the map to outline your field.');
    }
  }

  if (measureStart) {
    measureStart.addEventListener('click', function () { measureSetActive(!measureOn); });
  }
  if (measureClear) measureClear.addEventListener('click', measureClearAll);

  doc.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.key === 'Esc') && measureOn) measureSetActive(false);
  });

  // Re-word the button, hint and label after a language change.
  onLanguage(function () {
    if (measureStart) {
      measureStart.textContent = measureOn
        ? T('measure.stop', 'Stop measuring')
        : T('measure.btn', 'Measure my field');
    }
    if (measureHint) {
      measureHint.textContent = measurePts.length === 0
        ? T('measure.hint', 'Tap the map to outline your field.')
        : (measurePts.length < 3
          ? T('measure.need', 'Tap at least three points on the map.')
          : T('measure.hintMore', 'Keep tapping to add corners — three points or more make a field.'));
    }
    measureRender();
  });

  map.on('click', function (e) {
    // Measuring takes priority: a tap adds a corner to the field.
    if (measureOn) { measureAddPoint(e.latlng); return; }
    // In compare mode a tap drops a pin instead of opening the forecast.
    if (compareArmed) { addComparePoint(e.latlng); return; }
    openWeather(e.latlng.lat, e.latlng.lng);
  });

  /* ---------------------------------------------------------
     Search (Nominatim, debounced)
     --------------------------------------------------------- */
  var searchInput = doc.getElementById('mapSearch');
  var searchResults = doc.getElementById('mapSearchResults');
  var searchClear = doc.getElementById('mapSearchClear');
  var searchTimer = null;
  var searchAbort = null;

  function closeResults() {
    if (!searchResults) return;
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
  }

  function renderResults(list) {
    if (!searchResults) return;
    searchResults.innerHTML = '';
    if (!list || !list.length) {
      var empty = doc.createElement('div');
      empty.className = 'map-search-empty';
      empty.textContent = T('map.noPlaces', 'No places found.');
      searchResults.appendChild(empty);
      searchResults.hidden = false;
      if (searchInput) searchInput.setAttribute('aria-expanded', 'true');
      return;
    }
    list.forEach(function (item) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'map-search-item';
      btn.setAttribute('role', 'option');
      btn.innerHTML = '<strong>' + esc(item.name || item.display_name || '') + '</strong>' +
        '<span>' + esc(item.display_name || '') + '</span>';
      btn.addEventListener('click', function () { goToResult(item); });
      searchResults.appendChild(btn);
    });
    searchResults.hidden = false;
    if (searchInput) searchInput.setAttribute('aria-expanded', 'true');
  }

  // Searching is one of only two things allowed to move the view.
  function goToResult(item) {
    var lat = parseFloat(item.lat), lon = parseFloat(item.lon);
    if (!isFinite(lat) || !isFinite(lon)) return;
    map.setView([lat, lon], 13);
    openWeather(lat, lon);
    if (searchInput) {
      var label = item.name || String(item.display_name || '').split(',')[0];
      searchInput.value = label;
    }
    if (searchClear) searchClear.hidden = false;
    closeResults();
  }

  function runSearch(q) {
    if (searchAbort) { try { searchAbort.abort(); } catch (e) {} }
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    searchAbort = ctrl;
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(q);
    fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (list) { if (searchAbort === ctrl) renderResults(list); })
      .catch(function () { if (searchAbort === ctrl) renderResults([]); });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim();
      if (searchClear) searchClear.hidden = !q;
      if (searchTimer) window.clearTimeout(searchTimer);
      if (q.length < 3) { closeResults(); return; }
      searchTimer = window.setTimeout(function () { runSearch(q); }, 400);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeResults(); searchInput.blur(); }
      else if (e.key === 'ArrowDown' && searchResults && !searchResults.hidden) {
        var first = searchResults.querySelector('.map-search-item');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
  }
  if (searchResults) {
    searchResults.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(searchResults.querySelectorAll('.map-search-item'));
      var i = items.indexOf(doc.activeElement);
      if (e.key === 'ArrowDown' && i > -1 && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
      else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); items[i - 1].focus(); }
      else if (e.key === 'ArrowUp' && i === 0 && searchInput) { e.preventDefault(); searchInput.focus(); }
      else if (e.key === 'Escape') { closeResults(); if (searchInput) searchInput.focus(); }
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', function () {
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      searchClear.hidden = true;
      closeResults();
    });
  }
  doc.addEventListener('click', function (e) {
    var box = doc.querySelector('.map-search');
    if (box && !box.contains(e.target)) closeResults();
  });

  /* ---------------------------------------------------------
     Housekeeping
     --------------------------------------------------------- */
  window.addEventListener('resize', function () { map.invalidateSize(); });
  window.addEventListener('load', function () { map.invalidateSize(); });
  window.setTimeout(function () { map.invalidateSize(); }, 350);

  doc.addEventListener('sw:themechange', function () {
    var t = themeColors();
    var sc = weatherChart ? (weatherChart.options.scales || {}) : null;
    if (weatherChart) {
      if (sc.y) { if (sc.y.grid) sc.y.grid.color = t.grid; if (sc.y.ticks) sc.y.ticks.color = t.text; }
      if (sc.x && sc.x.ticks) sc.x.ticks.color = t.text;
      weatherChart.update();
    }
    if (compareChart) {
      var csc = compareChart.options.scales || {};
      if (csc.y) { if (csc.y.grid) csc.y.grid.color = t.grid; if (csc.y.ticks) csc.y.ticks.color = t.text; }
      if (csc.x && csc.x.ticks) csc.x.ticks.color = t.text;
      var legend = compareChart.options.plugins && compareChart.options.plugins.legend;
      if (legend && legend.labels) legend.labels.color = t.text;
      compareChart.update();
    }
  });
})();
