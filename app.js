/* ============================================
   SATELLITE WATCH — App Logic
   ============================================ */

const $ = id => document.getElementById(id);

// ---------- Map ----------
let map;
let marker;

function initMap() {
  map = L.map('map').setView([30.9010, 75.8573], 13); // Ludhiana
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  }).addTo(map);

  map.on('click', function(e) {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    if (marker) marker.setLatLng(e.latlng);
    else marker = L.marker(e.latlng).addTo(map);
    $('locName').textContent = `${lat}, ${lng}`;
    $('locCoords').textContent = `${lat}, ${lng}`;
    $('analyzeBtn').disabled = false;
  });
}

// ---------- AI Analysis ----------
async function analyzeLocation() {
  const coords = $('locCoords').textContent;
  if (!coords || coords === '—') return;

  const btn = $('analyzeBtn');
  btn.disabled = true;
  btn.textContent = 'Analyzing…';
  $('aiResult').hidden = true;

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: coords })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    $('aiBody').innerHTML = formatMarkdown(data.analysis);
    $('aiResult').hidden = false;
  } catch (e) {
    $('aiBody').innerHTML = `<div class="notice error"><span class="ic">⚠️</span><span>${e.message || 'Analysis failed. Please try again.'}</span></div>`;
    $('aiResult').hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Analyze with AI';
  }
}

// ---------- Markdown formatter ----------
function formatMarkdown(text) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// ---------- Quiz ----------
const QUIZ = [
  {
    q: 'What does NDVI measure?',
    options: ['Soil moisture', 'Vegetation health', 'Atmospheric pressure', 'Ocean salinity'],
    answer: 1
  },
  {
    q: 'Which satellite provides free optical imagery at 10m resolution?',
    options: ['WorldView-3', 'Sentinel-2', 'GeoEye-1', 'IKONOS'],
    answer: 1
  },
  {
    q: 'What is the spatial resolution of MODIS imagery?',
    options: ['10 m', '100 m', '250 m', '1 km'],
    answer: 2
  },
  {
    q: 'Which band combination is best for vegetation analysis?',
    options: ['RGB', 'NIR-Red-Green', 'SWIR-NIR-Red', 'Thermal'],
    answer: 1
  },
  {
    q: 'What does a high NDVI value (close to +1) indicate?',
    options: ['Bare soil', 'Water', 'Dense healthy vegetation', 'Urban area'],
    answer: 2
  }
];

let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

function renderQuiz() {
  const item = QUIZ[quizIndex];
  quizAnswered = false;
  $('quizQuestion').textContent = item.q;
  const opts = $('quizOptions');
  opts.innerHTML = '';
  item.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-opt';
    btn.textContent = opt;
    btn.addEventListener('click', () => answerQuiz(i));
    opts.appendChild(btn);
  });
  $('quizBar').style.width = `${(quizIndex / QUIZ.length) * 100}%`;
  $('quizCounter').textContent = `Question ${quizIndex + 1} of ${QUIZ.length}`;
  $('quizNext').hidden = true;
}

function answerQuiz(i) {
  if (quizAnswered) return;
  quizAnswered = true;
  const item = QUIZ[quizIndex];
  const opts = document.querySelectorAll('.quiz-opt');
  opts.forEach((btn, j) => {
    btn.disabled = true;
    if (j === item.answer) btn.classList.add('correct');
    if (j === i && i !== item.answer) btn.classList.add('wrong');
  });
  if (i === item.answer) quizScore++;
  $('quizBar').style.width = `${((quizIndex + 1) / QUIZ.length) * 100}%`;
  $('quizNext').hidden = false;
}

function nextQuiz() {
  quizIndex++;
  if (quizIndex >= QUIZ.length) {
    $('quizCard').hidden = true;
    $('quizResult').hidden = false;
    $('quizScore').textContent = quizScore;
    const pct = Math.round(quizScore / QUIZ.length * 100);
    $('quizFeedback').textContent = pct >= 80 ? 'Excellent! You know your remote sensing.' : pct >= 60 ? 'Good job! Keep learning.' : 'Keep studying — you\'ll get there!';
  } else {
    renderQuiz();
  }
}

// ---------- Wire up ----------
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  $('analyzeBtn').addEventListener('click', analyzeLocation);
  $('quizRetry').addEventListener('click', () => {
    quizIndex = 0; quizScore = 0;
    $('quizResult').hidden = true;
    $('quizCard').hidden = false;
    renderQuiz();
  });
  $('quizNext').addEventListener('click', nextQuiz);
});
