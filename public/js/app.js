/* ============================================================
   Satellite Watch — App logic
   Navbar · theme toggle · comparison slider · layer switch ·
   Ask Gemini chat (/api/explain) · Chart.js · scroll reveals
   ============================================================ */

(function () {
  'use strict';

  var doc = document;

  /* ---------------------------------------------------------
     Translation helpers
     Everything falls back to the English text if js/i18n.js has
     not loaded (or was blocked), so the page never breaks.
     --------------------------------------------------------- */
  function tr(key, fallback, vars) {
    try {
      if (window.SW_I18N) return window.SW_I18N.t(key, vars, fallback);
    } catch (e) {}
    return fallback;
  }
  function langName() {
    try {
      if (window.SW_I18N) return window.SW_I18N.name();
    } catch (e) {}
    return 'English';
  }

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
    refreshThemeLabel();
    updateChartTheme();
    // Let other modules (the map) restyle themselves too.
    try {
      doc.dispatchEvent(new CustomEvent('sw:themechange', { detail: { theme: theme } }));
    } catch (e) {}
  }

  function refreshThemeLabel() {
    if (!themeToggle) return;
    var dark = currentTheme() === 'dark';
    themeToggle.setAttribute('aria-pressed', String(dark));
    themeToggle.setAttribute('aria-label', dark
      ? tr('theme.light', 'Switch to light mode')
      : tr('theme.dark', 'Switch to dark mode'));
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

  // The theme button's label is theme-dependent, so it is refreshed here
  // rather than through data-i18n attributes.
  doc.addEventListener('sw:language', refreshThemeLabel);

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

  // Conversation memory: the last few turns are sent with each new question
  // so follow-ups keep their context. The answers themselves are never cut.
  var chatHistory = [];
  function rememberTurn(q, a) {
    chatHistory.push({ role: 'user', text: q }, { role: 'assistant', text: a });
    if (chatHistory.length > 16) chatHistory = chatHistory.slice(-16);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Escape first — model output is never trusted — then apply a light formatting pass:
  //   **bold** -> <strong>, blank line -> new paragraph, single newline -> <br>
  function formatText(text) {
    var safe = escapeHtml(text).replace(/\r\n?/g, '\n');
    return safe.split(/\n{2,}/).map(function (para) {
      return '<p>' + para
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  // Keep the newest message in view (honours reduced-motion).
  function scrollToLatest() {
    if (!chatMessages) return;
    var top = chatMessages.scrollHeight;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && typeof chatMessages.scrollTo === 'function') {
      chatMessages.scrollTo({ top: top, behavior: 'smooth' });
    } else {
      chatMessages.scrollTop = top;
    }
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
    if (role === 'bot' && !isError) attachSpeak(wrap);
    scrollToLatest();
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
    scrollToLatest();
  }
  function hideTyping() {
    var t = doc.getElementById('typingBubble');
    if (t) t.remove();
  }

  // Fallback text shown when the API gives us nothing usable to display.
  function chatError() { return tr('chat.error', 'Something went wrong, please try again'); }

  // Only ever render a real string as an error. Anything else (missing, an
  // object, null) becomes the friendly fallback so raw JSON can never leak in.
  function errorMessage(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : chatError();
  }

  // Extra context sent alongside the question. Safe when the config hasn't
  // loaded yet — JSON.stringify simply drops an undefined value.
  function chatResults() {
    try {
      return (window.CONFIG && window.CONFIG.results) || null;
    } catch (e) {
      return null;
    }
  }

  async function askGemini(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true;

    addBubble('user', formatText(text));
    if (chatInput) chatInput.value = '';
    showTyping();

    const question = text;
    const results = chatResults();
    // The selected language travels with the question, so the tutor
    // answers in the language the visitor is reading.
    const language = langName();
    // Earlier turns, oldest first.
    const history = chatHistory.slice();

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, results, language, history })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        // Amber bubble — errors only.
        addBubble('bot', formatText(errorMessage(data.error)), true);
      } else if (typeof data.answer === 'string' && data.answer.trim()) {
        // Normal reply bubble, answer text only. No slice, no truncation,
        // and the raw JSON is never displayed.
        addBubble('bot', formatText(data.answer));
        rememberTurn(question, data.answer);
      } else {
        addBubble('bot', formatText(chatError()), true);
      }
    } catch (err) {
      addBubble('bot', formatText(chatError()), true);
    } finally {
      // Always runs, success or failure.
      hideTyping();
      sending = false;
      scrollToLatest();
    }
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

  /* ---------------------------------------------------------
     Voice
     Speak your question (SpeechRecognition) and listen to an
     answer (speechSynthesis). If the browser has neither, both
     buttons simply stay hidden.
     --------------------------------------------------------- */
  var SPEAKER_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3l5-3.5v12l-5-3.5H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.6 6.4a8 8 0 0 1 0 11.2"/></svg>';

  function dispatchToast(message) {
    if (!message) return;
    try { doc.dispatchEvent(new CustomEvent('sw:toast', { detail: { message: message } })); } catch (e) {}
  }

  function speechCode() {
    try { if (window.SW_I18N) return window.SW_I18N.speech(); } catch (e) {}
    return 'en-IN';
  }

  /* ---------- microphone ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var chatMic = doc.getElementById('chatMic');
  var recognition = null;
  var listening = false;

  function refreshMic() {
    if (!chatMic) return;
    chatMic.setAttribute('aria-label', listening
      ? tr('chat.micStop', 'Stop listening')
      : tr('chat.mic', 'Ask by voice'));
    chatMic.setAttribute('aria-pressed', String(listening));
    chatMic.classList.toggle('is-listening', listening);
  }

  if (chatMic) {
    if (!SR) {
      chatMic.hidden = true;           // quietly: no speech recognition here
    } else {
      chatMic.hidden = false;
      try { recognition = new SR(); } catch (e) { recognition = null; }
      if (recognition) {
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function () { listening = true; refreshMic(); };
        recognition.onend = function () { listening = false; refreshMic(); };
        recognition.onerror = function (ev) {
          listening = false;
          refreshMic();
          var code = (ev && ev.error) ? ev.error : '';
          if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
            dispatchToast(tr('chat.micDenied', 'Microphone access was blocked.'));
          } else if (code !== 'aborted' && code !== 'no-speech') {
            dispatchToast(tr('chat.micFail', 'Voice input is not available right now.'));
          }
        };
        recognition.onresult = function (ev) {
          var text = '';
          try { text = ev.results[0][0].transcript || ''; } catch (err) { text = ''; }
          text = text.trim();
          if (!text) return;
          if (chatInput) chatInput.value = text;
          askGemini(text);
        };

        chatMic.addEventListener('click', function () {
          if (listening) {
            try { recognition.stop(); } catch (e) {}
            return;
          }
          try {
            recognition.lang = speechCode();
            recognition.start();
          } catch (e) {
            dispatchToast(tr('chat.micFail', 'Voice input is not available right now.'));
          }
        });
        refreshMic();
      } else {
        chatMic.hidden = true;
      }
    }
  }

  /* ---------- speaker on every answer ---------- */
  var canSpeak = (typeof window.speechSynthesis !== 'undefined') &&
    (typeof window.SpeechSynthesisUtterance === 'function');
  var speakingWrap = null;

  function voiceFor(code) {
    try {
      var want = String(code || 'en').slice(0, 2).toLowerCase();
      var voices = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i] || {};
        if (String(v.lang || '').toLowerCase().replace('_', '-').indexOf(want) === 0) return v;
      }
    } catch (e) {}
    return null;
  }

  function bubbleText(el) {
    if (!el) return '';
    return String(el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function stopSpeaking() {
    if (!canSpeak) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    if (speakingWrap) {
      var b = speakingWrap.querySelector('.speak-btn');
      if (b) {
        b.classList.remove('is-speaking');
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', tr('chat.listen', 'Read this answer aloud'));
        var t = b.querySelector('.speak-text');
        if (t) t.textContent = tr('chat.listenLabel', 'Listen');
      }
      speakingWrap = null;
    }
  }

  // Adds the "listen" button to one answer bubble (bot messages only).
  function attachSpeak(wrap) {
    if (!canSpeak || !wrap || wrap.id === 'typingBubble') return;
    var body = wrap.querySelector('.bubble-body');
    if (!body) return;
    // Read the text before the button is added, so its own label is never spoken.
    var spoken = bubbleText(body);
    if (!spoken) return;
    wrap.__speakText = spoken;

    var tools = body.querySelector('.bubble-tools');
    if (tools) return;                       // already has one
    tools = doc.createElement('div');
    tools.className = 'bubble-tools';
    body.appendChild(tools);

    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'speak-btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', tr('chat.listen', 'Read this answer aloud'));
    btn.innerHTML = SPEAKER_ICON + '<span class="speak-text"></span>';
    btn.querySelector('.speak-text').textContent = tr('chat.listenLabel', 'Listen');

    btn.addEventListener('click', function () {
      if (speakingWrap === wrap) { stopSpeaking(); return; }
      stopSpeaking();
      var text = wrap.__speakText || '';
      if (!text) return;
      try {
        var utter = new window.SpeechSynthesisUtterance(text);
        var code = speechCode();
        utter.lang = code;
        var voice = voiceFor(code);
        if (voice) utter.voice = voice;
        utter.onend = function () { if (speakingWrap === wrap) stopSpeaking(); };
        utter.onerror = function () { if (speakingWrap === wrap) stopSpeaking(); };
        speakingWrap = wrap;
        btn.classList.add('is-speaking');
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', tr('chat.stopReading', 'Stop reading aloud'));
        btn.querySelector('.speak-text').textContent = tr('chat.stopLabel', 'Stop');
        window.speechSynthesis.speak(utter);
      } catch (e) {
        stopSpeaking();
      }
    });

    tools.appendChild(btn);
  }
  // The greeting bubble is already in the page when this script runs.
  if (canSpeak && chatMessages) {
    Array.prototype.forEach.call(chatMessages.querySelectorAll('.bubble--bot'), attachSpeak);
  }

  doc.addEventListener('sw:language', function () {
    stopSpeaking();
    refreshMic();
    if (!canSpeak || !chatMessages) return;
    Array.prototype.forEach.call(chatMessages.querySelectorAll('.speak-btn'), function (b) {
      var t = b.querySelector('.speak-text');
      if (t) t.textContent = tr('chat.listenLabel', 'Listen');
      b.setAttribute('aria-label', tr('chat.listen', 'Read this answer aloud'));
    });
  });

  /* Expose the chat so other modules (the map) can ask questions. */
  window.SatelliteWatch = {
    askGemini: askGemini,
    openChat: function (question) {
      // Opens the popup panel (the frame is set up further down this file).
      openAskPopup();
      if (question) askGemini(question);
    }
  };

  /* ---------------------------------------------------------
     9. Floating help button — menu, first-visit tip, fullscreen
     --------------------------------------------------------- */
  var fabWrap = doc.getElementById('fabWrap');
  var fabBtn = doc.getElementById('fabBtn');
  var fabMenu = doc.getElementById('fabMenu');
  var fabTip = doc.getElementById('fabTip');
  var fabAsk = doc.getElementById('fabAsk');
  var fabFeedback = doc.getElementById('fabFeedback');
  var fabGroup = doc.getElementById('fabGroup');
  var fabTipTimer = null;
  var fabTouched = false;

  /* ---------------------------------------------------------
     11. Feedback modal — a Google Form in an iframe
     --------------------------------------------------------- */
  var fbModal = doc.getElementById('feedbackModal');
  var fbClose = doc.getElementById('fbClose');
  var fbFrame = doc.getElementById('fbFrame');
  var fbLoading = doc.getElementById('fbLoading');
  var fbSoon = doc.getElementById('fbSoon');
  var fbAlt = doc.getElementById('fbAlt');
  var fbLink = doc.getElementById('fbLink');
  var fbTrigger = null;

  // A link is "not filled in yet" when it is missing, empty, or still the
  // placeholder from js/config.js.
  function isPlaceholder(value) {
    if (typeof value !== 'string') return true;
    var v = value.trim();
    return v === '' || v.indexOf('PASTE_') !== -1;
  }

  function openFeedbackModal() {
    if (!fbModal) return;

    var embed = null;
    var formLink = null;
    try {
      embed = window.CONFIG && window.CONFIG.feedbackFormEmbedUrl;
      formLink = window.CONFIG && window.CONFIG.feedbackFormLink;
    } catch (e) {}

    if (isPlaceholder(embed)) {
      // No form to show yet — a friendly line instead.
      if (fbFrame) { fbFrame.hidden = true; fbFrame.removeAttribute('src'); }
      if (fbLoading) fbLoading.hidden = true;
      if (fbSoon) fbSoon.hidden = false;
      if (fbAlt) fbAlt.hidden = true;
    } else {
      if (fbSoon) fbSoon.hidden = true;
      if (fbFrame) {
        fbFrame.hidden = false;
        if (fbFrame.getAttribute('src') !== embed) fbFrame.setAttribute('src', embed);
      }
      if (fbLoading) fbLoading.hidden = false;   // sits behind the iframe
      if (fbAlt) fbAlt.hidden = isPlaceholder(formLink);
      if (fbLink && !isPlaceholder(formLink)) fbLink.href = formLink;
    }

    fbTrigger = doc.activeElement;
    fbModal.hidden = false;
    doc.body.classList.add('is-modal-open');
    if (typeof hideFabTip === 'function') hideFabTip();
    if (fbClose) fbClose.focus();
  }

  function closeFeedbackModal() {
    if (!fbModal || fbModal.hidden) return;
    fbModal.hidden = true;
    doc.body.classList.remove('is-modal-open');
    if (fbTrigger && typeof fbTrigger.focus === 'function') fbTrigger.focus();
  }

  if (fbModal) {
    if (fbClose) fbClose.addEventListener('click', closeFeedbackModal);
    // Clicking the dark backdrop closes it.
    fbModal.addEventListener('click', function (e) {
      if (e.target === fbModal) closeFeedbackModal();
    });
  }
  if (fbFrame) {
    fbFrame.addEventListener('load', function () {
      if (fbLoading) fbLoading.hidden = true;
    });
  }
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    closeFeedbackModal();
  });

  /* ---------------------------------------------------------
     12. Farmers' group link
     --------------------------------------------------------- */
  function openFarmersGroup(e) {
    var href = null;
    try { href = window.CONFIG && window.CONFIG.whatsappLink; } catch (err) {}

    if (isPlaceholder(href)) {
      // Nothing to open yet.
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      dispatchToast(tr('fab.groupSoon', 'Group link coming soon'));
    }
    // A real link opens in its own tab (target/rel are on the element).
    fabClose(false);
  }

  // Point the menu link at the configured group as soon as it is set.
  if (fabGroup) {
    var groupHref = null;
    try { groupHref = window.CONFIG && window.CONFIG.whatsappLink; } catch (err) {}
    fabGroup.setAttribute('href', isPlaceholder(groupHref) ? '#' : groupHref);
  }

  function fabIsOpen() { return !!(fabMenu && !fabMenu.hidden); }

  function fabLabel() {
    return fabIsOpen() ? tr('fab.close', 'Close help menu') : tr('fab.open', 'Open help menu');
  }

  function fabOpen(focusFirst) {
    if (!fabMenu || !fabBtn) return;
    fabMenu.hidden = false;
    fabBtn.classList.add('is-open');
    fabBtn.setAttribute('aria-expanded', 'true');
    fabBtn.setAttribute('aria-label', fabLabel());
    hideFabTip();
    if (focusFirst) {
      var first = fabMenu.querySelector('.fab-item');
      if (first) first.focus();
    }
  }

  function fabClose(returnFocus) {
    if (!fabMenu || !fabBtn) return;
    if (fabMenu.hidden) return;
    fabMenu.hidden = true;
    fabBtn.classList.remove('is-open');
    fabBtn.setAttribute('aria-expanded', 'false');
    fabBtn.setAttribute('aria-label', fabLabel());
    if (returnFocus) fabBtn.focus();
  }

  /* ---------- first-visit tip (once per session) ---------- */
  function fabTipSeen() {
    try { return window.sessionStorage.getItem('sw-fab-tip') === '1'; } catch (e) { return true; }
  }
  function fabTipDone() {
    try { window.sessionStorage.setItem('sw-fab-tip', '1'); } catch (e) {}
  }
  function hideFabTip() {
    if (fabTipTimer) { window.clearTimeout(fabTipTimer); fabTipTimer = null; }
    if (fabTip) fabTip.hidden = true;
  }
  function scheduleFabTip() {
    if (!fabTip || fabTipSeen()) return;
    fabTipTimer = window.setTimeout(function () {
      fabTipTimer = null;
      if (fabTouched || fabIsOpen()) return;
      fabTipDone();
      fabTip.hidden = false;
      fabTipTimer = window.setTimeout(hideFabTip, 8000);
    }, 6000);
  }

  /* ---------- fullscreen: the button steps aside ---------- */
  function syncFabFullscreen() {
    if (!fabWrap) return;
    var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    fabWrap.hidden = !!fsEl;
    if (fsEl) { fabClose(false); hideFabTip(); }
  }

  if (fabBtn && fabMenu) {
    fabBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      fabTouched = true;
      if (fabIsOpen()) fabClose(true); else fabOpen(false);
    });

    // Clicks inside the menu are not "clicks outside".
    fabMenu.addEventListener('click', function (e) { e.stopPropagation(); });

    if (fabAsk) {
      fabAsk.addEventListener('click', function () { fabClose(false); openAskPopup(); });
    }
    if (fabFeedback) {
      fabFeedback.addEventListener('click', function () { fabClose(false); openFeedbackModal(); });
    }
    if (fabGroup) {
      fabGroup.addEventListener('click', function (e) { openFarmersGroup(e); });
    }

    // Click outside closes the menu.
    doc.addEventListener('click', function () {
      fabTouched = true;
      fabClose(false);
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (fabIsOpen()) { fabClose(true); return; }
      hideFabTip();
    });

    // Escape also works from inside the menu, and arrow keys walk the items.
    fabMenu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        fabClose(true);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var items = Array.prototype.slice.call(fabMenu.querySelectorAll('.fab-item'));
      if (!items.length) return;
      var i = items.indexOf(doc.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var step = e.key === 'ArrowDown' ? 1 : -1;
      items[(i + step + items.length) % items.length].focus();
    });

    // Moving focus away with Tab closes the menu too.
    doc.addEventListener('focusin', function (e) {
      if (fabIsOpen() && fabWrap && !fabWrap.contains(e.target)) fabClose(false);
    });

    doc.addEventListener('fullscreenchange', syncFabFullscreen);
    doc.addEventListener('webkitfullscreenchange', syncFabFullscreen);
    syncFabFullscreen();

    doc.addEventListener('sw:language', function () {
      fabBtn.setAttribute('aria-label', fabLabel());
    });

    scheduleFabTip();
  }

  /* ---------------------------------------------------------
     10. Ask AI popup — the frame around the chat
     The chat code above is untouched: same endpoint, same
     history, same typing indicator, same voice buttons.
     --------------------------------------------------------- */
  var chatPop = doc.getElementById('ai-tutor');
  var chatPopClose = doc.getElementById('chatPopClose');
  var chatPopTrigger = null;      // focus goes back here on close

  function chatPopIsOpen() { return !!(chatPop && !chatPop.hidden); }

  function openAskPopup() {
    if (!chatPop) return;
    if (!chatPopIsOpen()) {
      chatPopTrigger = doc.activeElement;
      chatPop.hidden = false;
      if (fabWrap) fabWrap.classList.add('is-chat-open');
      if (typeof hideFabTip === 'function') hideFabTip();
    }
    if (chatInput) {
      try { chatInput.focus({ preventScroll: true }); } catch (e) { chatInput.focus(); }
    }
    scrollToLatest();
  }

  function closeAskPopup(returnFocus) {
    if (!chatPopIsOpen()) return;
    chatPop.hidden = true;
    if (fabWrap) fabWrap.classList.remove('is-chat-open');
    stopSpeaking();
    if (returnFocus) {
      var back = (chatPopTrigger && doc.contains(chatPopTrigger)) ? chatPopTrigger : fabBtn;
      if (back && typeof back.focus === 'function') back.focus();
    }
  }

  if (chatPop) {
    if (chatPopClose) {
      chatPopClose.addEventListener('click', function () { closeAskPopup(true); });
    }

    // Every "Ask Gemini" link or button opens the popup (no scrolling).
    doc.addEventListener('click', function (e) {
      var opener = e.target && e.target.closest ? e.target.closest('[data-open-chat], a[href="#ai-tutor"]') : null;
      if (!opener) return;
      e.preventDefault();
      closeNav();
      openAskPopup();
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (chatPopIsOpen()) closeAskPopup(true);
    });
  }

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
