/* ============================================================
   iota√-1 — study data (the ONE place for every study number)
   ------------------------------------------------------------
   Replace the values below with your real processed results.
   The page, the result cards, the charts, the printed report,
   the QR/share text and the AI tutor's context all read from
   this file, so they can never disagree again.

   status: "sample"   → the page shows:
                        "Sample values for demonstration. Not yet
                         verified against processed scenes."
           "verified" → the page shows:
                        "Computed from the scenes listed in the table."

   Rules of the house:
   • scenes[] is the master list. The scene count, the years
     analysed, the mean NDVI change and the same-month chart are
     all computed from it — do not repeat those numbers anywhere.
   • landCover.years[] holds the shares (%). The water-change card
     is computed from the Water share, so the chart and the card
     can never drift apart.
   • monthlyNdvi.series[] holds the monthly curve. Any month that
     has a row in scenes[] is overwritten by that row's NDVI, so
     the June points in the curve always match the table.
   ============================================================ */

var STUDY_DATA = {

  /* ----- Honesty badge ----- */
  status: "sample",             // "sample" or "verified"

  /* ----- Study area ----- */
  areaKm2: 15700,               // approx. area of the bounding box below
  studyArea: {
    north: 31.5,
    south: 30.3,
    east: 76.5,
    west: 75.2
  },

  /* ----- Which months are compared, year to year ----- */
  comparison: {
    months: [5, 6],             // May and June
    window: "late May to mid June"
  },

  /* ----- Sensors + the bands used for NDVI -----
     NDVI = (NIR − Red) / (NIR + Red) */
  sensors: {
    "Sentinel-2 MSI": {
      short: "Sentinel-2",
      resolution: "10 m",
      nirBand: "B8",
      redBand: "B4",
      source: "ESA Copernicus"
    },
    "Landsat 9 OLI-2": {
      short: "Landsat 9",
      resolution: "30 m",
      nirBand: "B5",
      redBand: "B4",
      source: "NASA / USGS"
    }
  },

  /* ----- Scenes in the table (one row each) ----- */
  scenes: [
    { date: "2023-06-15", sensor: "Sentinel-2 MSI", resolution: "10 m", scene: "T43RDP_20230615", cloud: 4,  ndvi: 0.63 },
    { date: "2023-11-02", sensor: "Sentinel-2 MSI", resolution: "10 m", scene: "T43RDP_20231102", cloud: 9,  ndvi: 0.45 },
    { date: "2024-05-28", sensor: "Landsat 9 OLI-2",  resolution: "30 m", scene: "LC09_L3_148039",   cloud: 7,  ndvi: 0.54 },
    { date: "2025-06-09", sensor: "Sentinel-2 MSI", resolution: "10 m", scene: "T43RDP_20250609", cloud: 12, ndvi: 0.48 },
    { date: "2026-06-15", sensor: "Sentinel-2 MSI", resolution: "10 m", scene: "T43RDP_20260615", cloud: 5,  ndvi: 0.42 }
  ],

  /* ----- Land-cover shares (%) for the two comparison years -----
     Classes are ids: cropland · vegetation · water · builtup */
  landCover: {
    classes: ["cropland", "vegetation", "water", "builtup"],
    years: [
      { year: 2023, values: [62, 18, 9, 11] },
      { year: 2026, values: [58, 13, 6, 23] }
    ]
  },

  /* ----- Mean NDVI by month (0–1 scale) -----
     Illustrative shape for the two years in the table. The June
     value is replaced by the matching row in scenes[] at load time. */
  monthlyNdvi: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    series: [
      { year: 2023, values: [0.35, 0.42, 0.52, 0.60, 0.63, 0.63, 0.55, 0.50, 0.48, 0.45, 0.40, 0.36] },
      { year: 2026, values: [0.28, 0.33, 0.40, 0.46, 0.49, 0.42, 0.42, 0.38, 0.36, 0.33, 0.30, 0.27] }
    ]
  },

  /* ----- Threshold wording used by the "Your field" NDVI panel -----
     Same bands the page explains everywhere else. */
  fieldNdvi: {
    bands: [
      { max: 0.2,        key: "field.lvl1" },
      { max: 0.4,        key: "field.lvl2" },
      { max: 0.6,        key: "field.lvl3" },
      { max: Infinity,   key: "field.lvl4" }
    ]
  }
};

// Expose it on window too, exactly like js/config.js does.
if (typeof window !== 'undefined') { window.STUDY_DATA = STUDY_DATA; }
