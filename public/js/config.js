/* ============================================
   SATELLITE WATCH — Configuration (served copy)
   ============================================
   This is the copy the page actually loads
   (public/index.html → js/config.js).

   It mirrors the project-level js/config.js so
   the deployed static site has the same study
   area, dates and text. Edit the study area
   values below to move the map.

   NOTE: studyArea.zoom is 11 here — the initial
   zoom the map uses. The map can zoom to 18.
   ============================================ */

const CONFIG = {
  /* ----- Study area ----- */
  studyArea: {
    name: "Punjab Agricultural Belt",
    // Centre of your study area [lat, lng]
    center: [30.9010, 75.8573],
    zoom: 11,
    // Approximate bounding box for the region
    bounds: {
      north: 31.5,
      south: 30.3,
      east: 76.5,
      west: 75.2
    }
  },

  /* ----- Dates ----- */
  // The two dates you are comparing
  dates: {
    before: "2023-06-15",
    after: "2026-06-15"
  },

  /* ----- Imagery paths -----
     Replace these with the actual file paths or URLs
     of your exported Google Earth Engine imagery.
     They can be local files in /images/ or remote URLs. */
  imagery: {
    before: "images/before.jpg",   // ← replace with your image
    after: "images/after.jpg",     // ← replace with your image
    ndviBefore: "images/ndvi-before.jpg",  // ← optional
    ndviAfter: "images/ndvi-after.jpg"     // ← optional
  },

  /* ----- Gemini API ----- */
  gemini: {
    apiKey: "",        // ← set via Vercel env var GEMINI_API_KEY
    model: "gemini-1.5-flash",
    // How many questions each visitor can ask per hour
    rateLimitPerHour: 50
  },

  /* ----- Outreach links -----
     Paste your own links in the three values below.
     While a value still contains "PASTE_", the page shows a
     friendly "coming soon" message instead of using it. */
  whatsappLink: "PASTE_WHATSAPP_GROUP_LINK_HERE",
  feedbackFormEmbedUrl: "https://docs.google.com/forms/d/e/1FAIpQLScmZSvC-md_pIYo9t9M-Habu8SBGpSdNQzr4XnbTmnpb5HMVg/viewform?embedded=true",
  feedbackFormLink: "https://docs.google.com/forms/d/e/1FAIpQLScmZSvC-md_pIYo9t9M-Habu8SBGpSdNQzr4XnbTmnpb5HMVg/viewform",

  /* ----- Problem statement ----- */
  problemStatement: `
    <p>Punjab's agricultural belt — once called the breadbasket of India —
    is facing a crisis that satellites can now help us see clearly.</p>
    <p>Over the past decade, <b>water stress</b> has intensified across the region.
    Groundwater levels are falling, temperatures are rising, and crop yields
    in some areas have plateaued or declined.</p>
    <p>Using free satellite data from ESA's Copernicus Sentinel-2 and NASA's
    Landsat missions, we can map these changes over time — no expensive
    hardware or specialised software required.</p>
  `,

  /* ----- What the maps show ----- */
  layerInfo: {
    trueColour: {
      name: "True Colour",
      description: "Natural colour composite (bands 4, 3, 2) showing the land surface as the human eye would see it."
    },
    ndvi: {
      name: "NDVI (Vegetation Health)",
      description: "Normalised Difference Vegetation Index = (NIR − Red) / (NIR + Red). Values close to +1 indicate dense healthy vegetation; values near 0 or negative indicate bare soil, water, or built-up areas."
    },
    ndwi: {
      name: "NDWI (Water)",
      description: "Normalised Difference Water Index = (Green − NIR) / (Green + NIR). Higher values indicate open water or saturated soil."
    },
    landCover: {
      name: "Land Cover Classification",
      description: "A supervised classification map showing categories such as cropland, forest, water, and built-up areas derived from multi-date satellite imagery."
    }
  },

  /* ----- Results summary ----- */
  results: {
    cards: [
      { label: "Area analysed", value: "15,700 km²" },
      { label: "Mean NDVI change", value: "−0.21" },
      { label: "Water area change", value: "−18%" },
      { label: "Cloud-free scenes used", value: "24" }
    ]
  },

  /* ----- Crop season guide (NDVI curve) -----
     ILLUSTRATIVE SHAPES, NOT MEASURED DATA.
     One value per month, January → December, on a 0–1 NDVI scale.
     Swap in your own numbers here and the chart updates by itself.

     Wheat is rabi (sown ~November, harvested ~April) and paddy is
     kharif (transplanted ~June, harvested ~October), so the two
     curves are complements of one another on the same land. */
  cropSeasons: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    note: "Illustrative pattern, not measured data",
    footnote: "This is why you must compare the same time of year when looking for change.",
    crops: [
      {
        id: "wheat",
        name: "Wheat",
        season: "Rabi",
        window: "Sown around November · harvested around April",
        color: "#2e9e5b",
        values: [0.46, 0.63, 0.72, 0.44, 0.20, 0.14, 0.12, 0.12, 0.13, 0.16, 0.30, 0.40]
      },
      {
        id: "paddy",
        name: "Paddy",
        season: "Kharif",
        window: "Transplanted around June · harvested around October",
        color: "#2a7fba",
        values: [0.14, 0.13, 0.13, 0.14, 0.22, 0.34, 0.58, 0.74, 0.70, 0.36, 0.18, 0.15]
      }
    ]
  },

  /* ----- Layer information cards -----
     One entry per layer in the map's layer switcher, keyed by the
     exact layer name. Each "i" button in the switcher opens a card
     built from these five fields. */
  layerFacts: {
    "Satellite (Esri)": {
      source: "Esri World Imagery — Maxar, Earthstar Geographics and community contributors",
      resolution: "About 0.3–1 m in Punjab; it varies from tile to tile across the mosaic",
      updates: "Irregularly — every scene has its own date, often months to years old",
      goodFor: "Visual context: field shapes, roads, buildings and canals",
      limit: "Pictures only — there is no spectral index, and the capture date changes across the scene"
    },
    "Sentinel-2 cloudless (EOX)": {
      source: "ESA Copernicus Sentinel-2, mosaicked by EOX IT Services",
      resolution: "10 m per pixel",
      updates: "One cloud-free mosaic per year",
      goodFor: "A consistent yearly snapshot of crop extent and land cover",
      limit: "A whole-year composite — short events like a single harvest are averaged away"
    },
    "Streets (OpenStreetMap)": {
      source: "OpenStreetMap contributors",
      resolution: "Vector map — no fixed pixel size",
      updates: "Continuously, by volunteer mappers",
      goodFor: "Place names, roads and village boundaries to orient yourself",
      limit: "Hand-mapped and uneven in coverage — it is not a measurement of the land"
    },
    "Rain radar (RainViewer)": {
      source: "RainViewer, built from national weather-radar networks",
      resolution: "About 1–2 km per pixel; coarser far from any radar",
      updates: "Every 10 minutes; the archive covers the last couple of hours",
      goodFor: "Seeing where rain is falling right now",
      limit: "A very short archive, with gaps in areas covered by few radars"
    },
    "Rainfall (NASA IMERG)": {
      source: "NASA GPM IMERG — rainfall estimated from satellite microwave and infrared",
      resolution: "About 10 km per pixel",
      updates: "Roughly once a day, with a day or two of delay",
      goodFor: "Rainfall totals over a district or a whole season",
      limit: "Too coarse for one field, and it is an estimate — not a rain gauge"
    },
    "Vegetation (MODIS NDVI)": {
      source: "NASA MODIS Terra NDVI, 8-day composite",
      resolution: "250 m per pixel",
      updates: "A new composite every 8 days",
      goodFor: "Big-picture greening across the whole state, year after year",
      limit: "250 m pixels blur small fields together, so a single field is not visible"
    }
  }
};

// Also expose the config on window so any script loaded later can find it
// regardless of load order.
if (typeof window !== 'undefined') { window.CONFIG = CONFIG; }
