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

  if (typeof L === 'undefined') {
    host.innerHTML = '<div class="map-fallback"><p>The interactive map could not load. Please refresh the page.</p></div>';
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
    { name: 'Rain radar', layer: radar, input: null },
    { name: 'NASA IMERG rainfall', layer: rainfall, input: null },
    { name: 'MODIS NDVI', layer: veg, input: null }
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
      btn.title = 'Layer opacity';
      btn.setAttribute('aria-label', 'Layer opacity');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = ICON_OPACITY;

      var panel = L.DomUtil.create('div', 'map-opacity-panel', wrap);
      panel.hidden = true;

      overlayMeta.forEach(function (meta) {
        var row = L.DomUtil.create('label', 'map-opacity-row', panel);
        var name = L.DomUtil.create('span', 'map-opacity-name', row);
        name.textContent = meta.name;
        var input = L.DomUtil.create('input', 'map-opacity-range', row);
        input.type = 'range';
        input.min = '0'; input.max = '100'; input.step = '5';
        input.value = String(Math.round(meta.layer.options.opacity * 100));
        input.setAttribute('aria-label', meta.name + ' opacity');
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

  // Fullscreen
  var FullControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'leaflet-bar map-ctl');
      var btn = L.DomUtil.create('button', 'map-ctl-btn', wrap);
      btn.type = 'button';
      btn.title = 'Toggle fullscreen';
      btn.setAttribute('aria-label', 'Toggle fullscreen');
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
      btn.title = 'Find my location';
      btn.setAttribute('aria-label', 'Find my location');
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
    showToast('Could not get your location. Check your browser permissions.');
  });

  function toggleFullscreen(el) {
    if (!el) return;
    var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (!fsEl) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) { try { req.call(el); } catch (e) { showToast('Fullscreen is not available.'); } }
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) { try { exit.call(doc); } catch (e) {} }
    }
  }
  function onFsChange() { window.setTimeout(function () { map.invalidateSize(); }, 150); }
  doc.addEventListener('fullscreenchange', onFsChange);
  doc.addEventListener('webkitfullscreenchange', onFsChange);

  /* ---------- Layer failure handling ---------- */
  function guardBase(layer, name) {
    var tripped = false;
    layer.on('tileerror', function () {
      if (tripped) return;
      tripped = true;
      showToast(name + ' is unavailable right now, so another base map was used.');
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
        var anyBase = map.hasLayer(satellite) || map.hasLayer(sentinel) || map.hasLayer(streets);
        if (!anyBase) (layer === satellite ? streets : satellite).addTo(map);
      }
    });
  }
  guardBase(satellite, 'Esri satellite imagery');
  guardBase(sentinel, 'Sentinel-2 cloudless imagery');
  guardBase(streets, 'OpenStreetMap streets');

  function disableOverlay(layer, name) {
    if (map.hasLayer(layer)) map.removeLayer(layer);
    setSliderEnabled(layer, false);
    showToast(name + ' could not be loaded, so it was turned off.');
  }

  rainfall.on('tileerror', function () {
    if (imergIdx < IMERG_DATES.length - 1) {
      imergIdx += 1;
      setImerg(imergIdx);
      if (!imergWarned) { imergWarned = true; showToast('Showing the most recent IMERG rainfall day available.'); }
      return;
    }
    disableOverlay(rainfall, 'NASA IMERG rainfall');
  });

  veg.on('tileerror', function () {
    if (vegIdx < VEG_DATES.length - 1) {
      vegIdx += 1;
      setVeg(vegIdx);
      if (!vegWarned) { vegWarned = true; showToast('Showing the most recent MODIS NDVI composite available.'); }
      return;
    }
    disableOverlay(veg, 'MODIS NDVI');
  });

  radar.on('tileerror', function () {
    if (radarState === 'ready') disableOverlay(radar, 'Rain radar');
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
    tmPlay.setAttribute('aria-label', playing ? 'Pause radar animation' : 'Play radar animation');
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
      showToast('Rain radar is unavailable right now.');
    });

  map.on('overlayadd', function (e) {
    setSliderEnabled(e.layer, true);
    if (e.layer === radar) {
      if (radarState === 'ready') {
        setRadarFrame(radarFrames.length - 1);
        if (tmEl) tmEl.hidden = false;
      } else if (radarState === 'loading') {
        if (tmEl) tmEl.hidden = false;
        if (tmLabel) tmLabel.textContent = 'Loading…';
      } else {
        showToast('Rain radar is unavailable right now.');
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
    if (idx === -1) return 'No significant rain is expected in the next 7 days — irrigation is likely to be needed.';
    if (idx === 0) return 'Rain is expected today — a good time to delay irrigation.';
    return 'Rain expected in ' + idx + ' day' + (idx > 1 ? 's' : '') + ', good time to delay irrigation.';
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
    return '<div class="wx-head"><strong>Weather at this spot</strong>' +
      '<span class="wx-coords">' + lat.toFixed(4) + ', ' + lon.toFixed(4) + '</span></div>';
  }
  function popupLoading(lat, lon) {
    return '<div class="wx-popup">' + popupHead(lat, lon) +
      '<div class="wx-loading"><span class="wx-spinner" aria-hidden="true"></span>Loading forecast…</div></div>';
  }
  function popupError(lat, lon) {
    return '<div class="wx-popup">' + popupHead(lat, lon) +
      '<div class="wx-error">Could not load the weather for this spot. Please try again.</div></div>';
  }
  function popupData(lat, lon, s) {
    var p = [];
    p.push('<div class="wx-popup">');
    p.push(popupHead(lat, lon));
    p.push('<div class="wx-now">');
    p.push('<span class="wx-now-item"><span class="wx-now-label">Now</span><strong>' +
      Math.round(s.current.temp) + '&deg;C</strong></span>');
    p.push('<span class="wx-now-item"><span class="wx-now-label">Humidity</span><strong>' +
      Math.round(s.current.humidity) + '%</strong></span>');
    p.push('</div>');
    p.push('<div class="wx-chart"><canvas aria-label="Daily rainfall for the past and next 7 days"></canvas></div>');
    p.push('<div class="wx-totals">');
    p.push('<div class="wx-total"><span>Past 7 days</span><strong>' + s.pastTotal.toFixed(1) + ' mm</strong></div>');
    p.push('<div class="wx-total"><span>Next 7 days</span><strong>' + s.nextTotal.toFixed(1) + ' mm</strong></div>');
    p.push('</div>');
    p.push('<p class="wx-advice">' + esc(s.advice) + '</p>');
    p.push('<button type="button" class="btn btn-primary wx-ask">Ask Gemini about this spot</button>');
    p.push('<p class="wx-credit">Rainfall &amp; temperature model data from Open-Meteo.</p>');
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
        datasets: [{ label: 'Rain (mm)', data: values, backgroundColor: colours, borderRadius: 4, maxBarThickness: 16 }]
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
    var q = 'A farmer is at latitude ' + lat.toFixed(4) + ', longitude ' + lon.toFixed(4) +
      '. About ' + s.pastTotal.toFixed(1) + ' mm of rain fell in the past 7 days, and about ' +
      s.nextTotal.toFixed(1) + ' mm is forecast for the next 7 days. ' + s.advice +
      ' In 2-4 short sentences, explain what this means for irrigation and crop planning at this location.';
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

  map.on('click', function (e) {
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
      empty.textContent = 'No places found.';
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
    if (!weatherChart) return;
    var t = themeColors();
    var sc = weatherChart.options.scales || {};
    if (sc.y) { if (sc.y.grid) sc.y.grid.color = t.grid; if (sc.y.ticks) sc.y.ticks.color = t.text; }
    if (sc.x && sc.x.ticks) sc.x.ticks.color = t.text;
    weatherChart.update();
  });
})();
