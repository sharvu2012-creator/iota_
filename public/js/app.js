/* ============================================================
   Satellite Watch — App logic
   Navbar · theme toggle · comparison slider · layer switch ·
   Ask Gemini chat (/api/explain) · Chart.js · scroll reveals
   ============================================================ */

(function () {
  'use strict';

  var doc = document;

  /* ---------------------------------------------------------
     Splash screen
     --------------------------------------------------------- */
  var splash = doc.getElementById('splash-screen');
  if (splash) {
    var dismissSplash = function () {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    };
    window.addEventListener('load', function () { window.setTimeout(dismissSplash, 2800); });
    window.setTimeout(dismissSplash, 6000);
  }

  /* ---------------------------------------------------------
     Navbar
     --------------------------------------------------------- */
  var header = doc.getElementById('main-header');
  var toggle = doc.getElementById('mobileMenuBtn');
  var nav = doc.getElementById('primaryNav');
  var DESKTOP_BREAKPOINT = 900;

  function isOpen() { return !!(header && header.classList.contains('nav-open')); }
  function setOpen(open) {
    if (!header || !toggle) return;
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  function closeNav() { setOpen(false); }

  if (toggle) toggle.addEventListener('click', function () { setOpen(!isOpen()); });
  if (nav) nav.addEventListener('click', function (e) { if (e.target.closest('a')) closeNav(); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  doc.addEventListener('click', function (e) { if (header && isOpen() && !header.contains(e.target)) closeNav(); });
  window.addEventListener('resize', function () { if (window.innerWidth >= DESKTOP_BREAKPOINT) closeNav(); });
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------------------------------------------------
     Theme toggle (switches the CSS variables)
     --------------------------------------------------------- */
  var charts = [];
  var root = doc.documentElement;
  var themeToggle = doc.getElementById('themeToggle');

  function readTheme() {
    var cs = getComputedStyle(root);
    return {
      grid: (cs.getPropertyValue('--grid-line') || '').trim() || 'rgba(18,32,26,.08)',
      text: (cs.getPropertyValue('--muted') || '').trim() || '#5b6b62'
    };
  }

  function updateChartTheme() {
    if (typeof Chart === 'undefined') return;
    var t = readTheme();
    Chart.defaults.color = t.text;
    charts.forEach(function (ch) {
      if (ch.options && ch.options.scales) {
        Object.keys(ch.options.scales).forEach(function (k) {
          var sc = ch.options.scales[k];
          if (sc.ticks) sc.ticks.color = t.text;
          if (sc.grid) sc.grid.color = t.grid;
        });
      }
      ch.update();
    });
  }

  function currentTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function applyTheme(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    updateChartTheme();
    // Let other modules (the map) restyle themselves too.
    try {
      doc.dispatchEvent(new CustomEvent('sw:themechange', { detail: { theme: theme } }));
    } catch (e) {}
  }

  var storedTheme = null;
  try { storedTheme = window.localStorage.getItem('sw-theme'); } catch (e) {}
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(storedTheme || (prefersDark ? 'dark' : 'light'));

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { window.localStorage.setItem('sw-theme', next); } catch (e) {}
    });
  }

  /* ---------------------------------------------------------
     2. Maps — the interactive Leaflet map lives in js/map.js
     --------------------------------------------------------- */

  /* ---------------------------------------------------------
     5. Ask Gemini — chat via /api/explain
     --------------------------------------------------------- */
  var BOT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="11" rx="3"/><path d="M12 7V4M9 13h.01M15 13h.01M9 16h6"/></svg>';

  var chatForm = doc.getElementById('chatForm');
  var chatInput = doc.getElementById('chatInput');
  var chatMessages = doc.getElementById('chatMessages');
  var chatSuggestions = doc.getElementById('chatSuggestions');
  var sending = false;

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function formatText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function addBubble(role, html, isError) {
    if (!chatMessages) return null;
    var wrap = doc.createElement('div');
    wrap.className = 'bubble bubble--' + role + (isError ? ' bubble-error' : '');
    if (role === 'bot') {
      wrap.innerHTML = '<span class="bubble-avatar" aria-hidden="true">' + BOT_ICON + '</span><div class="bubble-body">' + html + '</div>';
    } else {
      wrap.innerHTML = '<div class="bubble-body">' + html + '</div>';
    }
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return wrap;
  }

  function showTyping() {
    if (!chatMessages) return;
    var wrap = doc.createElement('div');
    wrap.className = 'bubble bubble--bot';
    wrap.id = 'typingBubble';
    wrap.innerHTML = '<span class="bubble-avatar" aria-hidden="true">' + BOT_ICON + '</span>' +
      '<div class="bubble-body"><span class="typing"><span></span><span></span><span></span></span></div>';
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function hideTyping() {
    var t = doc.getElementById('typingBubble');
    if (t) t.remove();
  }

  // Turn whatever the API returned into something worth showing the user.
  function serverErrorMessage(r) {
    var data = r.data || {};
    if (data.error) return String(data.error);
    if (data.detail) return String(data.detail);
    if (r.raw) {
      var text = String(r.raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 300);
    }
    return 'The AI tutor returned an error (HTTP ' + r.status + '). Please try again.';
  }

  function askGemini(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true;

    addBubble('user', formatText(text));
    if (chatInput) chatInput.value = '';
    showTyping();

    fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text })
    })
      .then(function (res) {
        // Read as text first: an error page is not always JSON.
        return res.text().then(function (raw) {
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
          return { ok: res.ok, status: res.status, data: data, raw: raw };
        });
      })
      .then(function (r) {
        hideTyping();
        var data = r.data || {};
        var reply = data.reply || data.response;
        if (r.ok && reply) {
          addBubble('bot', formatText(reply));
        } else {
          // Surface the server's own error text instead of a generic message.
          addBubble('bot', formatText(serverErrorMessage(r)), true);
        }
      })
      .catch(function (err) {
        hideTyping();
        var why = err && err.message ? ' (' + err.message + ')' : '';
        addBubble('bot', formatText('Sorry, I could not reach the AI tutor' + why + '. Please try again in a moment.'), true);
      })
      .then(function () { sending = false; });
  }

  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      askGemini(chatInput ? chatInput.value : '');
    });
  }
  if (chatSuggestions) {
    chatSuggestions.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip) askGemini(chip.textContent);
    });
  }

  /* Expose the chat so other modules (the map) can ask questions. */
  window.SatelliteWatch = {
    askGemini: askGemini,
    openChat: function (question) {
      if (question) askGemini(question);
      var section = doc.getElementById('ai-tutor');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* ---------------------------------------------------------
     4. Results — Chart.js charts
     --------------------------------------------------------- */
  if (typeof Chart !== 'undefined') {
    var t = readTheme();
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = t.text;

    var legendOpts = { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 } };
    var PRIMARY = '#2e9e5b';
    var ACCENT = '#2a7fba';

    var ndviCanvas = doc.getElementById('ndviChart');
    if (ndviCanvas) {
      charts.push(new Chart(ndviCanvas, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [
            {
              label: '2023',
              data: [0.35, 0.42, 0.52, 0.60, 0.63, 0.61, 0.55, 0.50, 0.48, 0.45, 0.40, 0.36],
              borderColor: PRIMARY,
              backgroundColor: 'rgba(46,158,91,0.14)',
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: PRIMARY
            },
            {
              label: '2026',
              data: [0.28, 0.33, 0.40, 0.46, 0.49, 0.47, 0.42, 0.38, 0.36, 0.33, 0.30, 0.27],
              borderColor: ACCENT,
              backgroundColor: 'rgba(42,127,186,0.12)',
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: ACCENT
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: legendOpts },
          scales: {
            y: { suggestedMin: 0.2, suggestedMax: 0.7, grid: { color: t.grid, drawBorder: false }, ticks: { color: t.text } },
            x: { grid: { display: false }, ticks: { color: t.text } }
          }
        }
      }));
    }

    var landCanvas = doc.getElementById('landCoverChart');
    if (landCanvas) {
      charts.push(new Chart(landCanvas, {
        type: 'bar',
        data: {
          labels: ['Cropland', 'Vegetation', 'Water', 'Built-up'],
          datasets: [
            { label: '2023', data: [62, 18, 9, 11], backgroundColor: PRIMARY, borderRadius: 8, maxBarThickness: 38 },
            { label: '2026', data: [58, 13, 6, 23], backgroundColor: ACCENT, borderRadius: 8, maxBarThickness: 38 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: legendOpts },
          scales: {
            y: {
              beginAtZero: true, max: 100,
              grid: { color: t.grid, drawBorder: false },
              ticks: { color: t.text, callback: function (v) { return v + '%'; } }
            },
            x: { grid: { display: false }, ticks: { color: t.text } }
          }
        }
      }));
    }
  }

  /* ---------------------------------------------------------
     8. Scroll reveals
     --------------------------------------------------------- */
  var reveals = doc.querySelectorAll('.reveal');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }
})();
