/* ============================================
   SATELLITE WATCH — Configuration
   ============================================
   Edit these values to match your study area.
   All page content reads from this object.
   ============================================ */

const CONFIG = {
  /* ----- Study area ----- */
  studyArea: {
    name: "Punjab Agricultural Belt",
    // Centre of your study area [lat, lng]
    center: [30.9010, 75.8573],
    zoom: 9,
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
  }
};
