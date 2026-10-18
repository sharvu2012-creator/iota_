/* ============================================================
   Satellite Watch — quiz questions
   ------------------------------------------------------------
   Loaded by index.html before js/features.js.

   Each item:
     q           the question
     options     four choices (any number works)
     answer      index of the correct option (0-based)
     explanation one line shown after answering
     topic       short label (for reference only)

   Add or remove items freely — the quiz section adapts to any
   number of questions.
   ============================================================ */

var QUIZ_DATA = [
  {
    topic: 'NDVI',
    q: 'What does NDVI actually measure?',
    options: [
      'How green and dense the vegetation is',
      'How hot the ground is',
      'How much rain has fallen',
      'How salty the soil is'
    ],
    answer: 0,
    explanation: 'NDVI compares reflected near-infrared and red light, so high values mean more healthy green vegetation.'
  },
  {
    topic: 'Resolution',
    q: 'About how big is one pixel in a Sentinel-2 image?',
    options: [
      '10 metres',
      '30 metres',
      '250 metres',
      '1 kilometre'
    ],
    answer: 0,
    explanation: 'Sentinel-2 gives 10 m pixels, fine enough to pick out individual farm fields.'
  },
  {
    topic: 'Resolution',
    q: 'Which of these sensors has the coarsest pixels?',
    options: [
      'Sentinel-2 (about 10 m)',
      'Landsat 8/9 (about 30 m)',
      'MODIS (about 250 m)',
      'Esri World Imagery (about 1 m)'
    ],
    answer: 2,
    explanation: 'MODIS is about 250 m per pixel — a whole field can fit inside a single pixel.'
  },
  {
    topic: 'Clouds',
    q: 'Why are cloudy scenes usually thrown away?',
    options: [
      'Clouds hide the ground and give false values',
      'Clouds make the image file too large',
      'Clouds stop the satellite taking any picture',
      'Clouds change the pixel size'
    ],
    answer: 0,
    explanation: 'A cloud is bright and cold, so it wrecks both the picture and the vegetation values underneath.'
  },
  {
    topic: 'Seasons',
    q: 'You want to test whether a field got less green over time. Which comparison is fairest?',
    options: [
      'June 2026 against June 2023',
      'June 2026 against December 2023',
      'Any two dates with the fewest clouds',
      'June 2026 against the whole of 2023 averaged'
    ],
    answer: 0,
    explanation: 'Compare the same month in different years, because NDVI swings up and down with the crop season.'
  },
  {
    topic: 'NDVI',
    q: 'An NDVI value near zero or below usually means…',
    options: [
      'Bare soil, water or built-up ground',
      'Very healthy crop growth',
      'A very cloudy scene',
      'The satellite has stopped working'
    ],
    answer: 0,
    explanation: 'With little green vegetation there is almost no difference between the red and near-infrared light.'
  },
  {
    topic: 'Limits',
    q: 'Satellite images show that a lake shrank. What can they NOT tell you?',
    options: [
      'Why the lake shrank',
      'Where the lake edge moved',
      'How big the lake was last year',
      'Which pixels changed'
    ],
    answer: 0,
    explanation: 'Images show what changed, not the cause — you need ground evidence to explain the why.'
  },
  {
    topic: 'Limits',
    q: 'Why can a single 10 m NDVI pixel be misleading?',
    options: [
      'It can blend crops, soil, water and roads together',
      'It is always lower than the real value',
      'It only works in summer',
      'It cannot be put on a map'
    ],
    answer: 0,
    explanation: 'One pixel averages everything inside it, so small features and field edges disappear.'
  }
];
