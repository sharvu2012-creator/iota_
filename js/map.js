/* ============================================
   SATELLITE WATCH — Map Logic (Leaflet)
   ============================================
   Creates the interactive Leaflet map with:
   - Base satellite layer
   - Before / After comparison slider
   - Layer toggles (True Colour, NDVI, NDWI, Land Cover)
   - Scale bar and north arrow
   ============================================ */

let map;
let currentBaseLayer = null;
let overlayLayers = {};
let compareSlider = null;
let layerControl = null;

/* ----- Initialise the map ----- */
function initMap() {
  const { center, zoom } = CONFIG.studyArea;

  map = L.map("map", {
    center,
    zoom,
    minZoom: 6,
    maxZoom: 16,
    zoomControl: true,
    attributionControl: false
  });

  // Add scale bar
  L.control.scale({ imperial: false, metric: true }).addTo(map);

  // Add base satellite layer (Esri World Imagery — free, no key needed)
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19 }
  ).addTo(map);

  // Build overlay layers from config
  buildOverlayLayers();

  // Set up the before/after comparison
  initCompareSlider();

  // Set up layer toggles
  initLayerToggles();

  // Add north arrow
  addNorthArrow();
}

/* ----- Create overlay layer objects ----- */
function buildOverlayLayers() {
  const img = CONFIG.imagery;
  const bounds = getStudyAreaBounds();

  // True colour overlays
  overlayLayers.trueColorBefore = L.imageOverlay(img.before, bounds, { opacity: 0.9 });
  overlayLayers.trueColorAfter  = L.imageOverlay(img.after,  bounds, { opacity: 0.9 });

  // NDVI overlays
  if (img.ndviBefore) overlayLayers.ndviBefore = L.imageOverlay(img.ndviBefore, bounds, { opacity: 0.85 });
  if (img.ndviAfter)  overlayLayers.ndviAfter  = L.imageOverlay(img.ndviAfter,  bounds, { opacity: 0.85 });

  // NDWI overlays
  if (img.ndwiBefore) overlayLayers.ndwiBefore = L.imageOverlay(img.ndwiBefore, bounds, { opacity: 0.85 });
  if (img.ndwiAfter)  overlayLayers.ndwiAfter  = L.imageOverlay(img.ndwiAfter,  bounds, { opacity: 0.85 });

  // Land cover overlay
  if (img.landCover) overlayLayers.landCover = L.imageOverlay(img.landCover, bounds, { opacity: 0.8 });
}

/* ----- Before/After comparison slider ----- */
function initCompareSlider() {
  const container = document.getElementById("compareContainer");
  const slider = document.getElementById("compareSlider");

  if (!container || !slider) return;

  slider.addEventListener("input", function () {
    const val = parseInt(this.value, 10);
    updateCompare(val);
  });
}

function updateCompare(percent) {
  const afterLayer = overlayLayers.trueColorAfter;
  const beforeLayer = overlayLayers.trueColorBefore;

  if (!afterLayer || !beforeLayer) return;

  // Clip the "after" layer to show only the portion to the right of the slider
  const mapBounds = map.getBounds();
  const ne = mapBounds.getNorthEast();
  const sw = mapBounds.getSouthWest();
  const midLng = sw.lng + (ne.lng - sw.lng) * (percent / 100);

  afterLayer.setBounds([[ne.lat, midLng], [sw.lng, sw.lat]]);
  beforeLayer.setBounds([[ne.lat, ne.lng], [midLng, sw.lat]]);
}

/* ----- Layer toggle buttons ----- */
function initLayerToggles() {
  const buttons = document.querySelectorAll(".layer-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const layerKey = this.dataset.layer;
      toggleLayer(layerKey, this);
    });
  });
}

function toggleLayer(key, btn) {
  const layer = overlayLayers[key];
  if (!layer) return;

  if (map.hasLayer(layer)) {
    map.removeLayer(layer);
    btn.classList.remove("active");
  } else {
    map.addLayer(layer);
    btn.classList.add("active");
  }
}

/* ----- North arrow ----- */
function addNorthArrow() {
  const northArrow = L.control({ position: "topleft" });
  northArrow.onAdd = function () {
    const div = L.DomUtil.create("div", "north-arrow");
    div.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L4 20h16L12 2z" fill="#e74c3c" stroke="#fff" stroke-width="1"/></svg>';
    return div;
  };
  northArrow.addTo(map);
}

/* ----- Study area bounds ----- */
function getStudyAreaBounds() {
  const b = CONFIG.studyArea.bounds;
  return [[b.south, b.west], [b.north, b.east]];
}

/* ----- Populate layer info panel ----- */
function populateLayerInfo() {
  const panel = document.getElementById("layerInfo");
  if (!panel) return;

  const info = CONFIG.layerInfo;
  let html = "";

  Object.keys(info).forEach((key) => {
    const layer = info[key];
    html += `
      <div class="layer-info-item">
        <strong>${layer.name}</strong>
        <p>${layer.description}</p>
        ${layer.date ? `<span class="layer-date">📅 ${layer.date}</span>` : ""}
      </div>
    `;
  });

  panel.innerHTML = html;
}

/* ----- Init on DOM ready ----- */
document.addEventListener("DOMContentLoaded", function () {
  initMap();
  populateLayerInfo();
});
