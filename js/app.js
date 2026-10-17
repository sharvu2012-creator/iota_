/* ============================================
   SATELLITE WATCH — Main Application Logic
   ============================================ */

// Map instance
let map = null;
let markers = [];
let currentLat = null;
let currentLng = null;

// Initialize Leaflet map
function initMap() {
  map = L.map('map', {
    center: [30.9010, 75.8573], // Punjab, India default
    zoom: 8,
    zoomControl: true,
    zoomControlOptions: { position: 'topright' }
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  map.on('click', onMapClick);
}

// Handle map click
function onMapClick(e) {
  const { lat, lng } = e.latlng;
  currentLat = lat;
  currentLng = lng;

  // Remove existing markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  // Add marker
  const marker = L.marker([lat, lng]).addTo(map);
  markers.push(marker);

  // Update UI
  document.getElementById('locName').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  document.getElementById('locCoords').textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  document.getElementById('analyzeBtn').disabled = false;

  // Reverse geocode
  fetchLocationName(lat, lng);
}

// Reverse geocode using OpenStreetMap Nominatim
async function fetchLocationName(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await response.json();
    if (data.display_name) {
      document.getElementById('locName').textContent = data.displayName;
    }
  } catch (e) {
    console.error('Reverse geocode error:', e);
  }
}

// AI Tutor chat
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  input.value = '';
  showTyping();

  try {
    const response = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text })
    });

    const data = await response.json();

    const msgDiv = document.createElement('div');
    msg.className = 'chat-message bot';
    msg.innerHTML = `<div class="bubble">${formatMarkdown(data.response || data.error || 'No response')}</div>`;
    document.getElementById('chatMessages').appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message bot';
    msgDiv.innerHTML = '<div class="bubble">Sorry, I could not connect to the AI tutor.</div>';
    document.getElementById('chatMessages').appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
  }
}

function addMessage(text, sender) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-message ${sender}`;
  div.innerHTML = `<div class="bubble">${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-message bot';
  div.innerHTML = '<div class="bubble typing">AI tutor is thinking...</div>';
  div.id = 'typing-bubble';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing-bubble');
  if (el) el.remove();
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  initMap();

  document.getElementById('analyzeBtn').addEventListener('click', analyzeLocation);
  document.getElementById('chatSend').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
});

// Format markdown-ish text
function formatMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}