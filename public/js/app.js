/* ============================================================
   iota√-1 — App logic
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
      '<div class="bubble-body"><span class="typing"><span></span><span></span><span></span></span>' +
      '<span class="typing-text">' + escapeHtml(tr('chat.thinking', 'Thinking…')) + '</span></div>';
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

  /* ---------------------------------------------------------
     AI tutor — timeout, language, offline answers, thinking state
     --------------------------------------------------------- */
  var CHAT_TIMEOUT_MS = 15000;
  var chatSend = doc.getElementById('chatSend');
  var chatThinking = false;

  // The tutor answers in the language the visitor is reading. The server
  // only forwards `question`, so the instruction travels in the question.
  function languageInstruction() {
    var code = 'en';
    try { if (window.SW_I18N) code = window.SW_I18N.lang(); } catch (e) {}
    if (code === 'hi') {
      return 'Answer in simple Hindi (Devanagari) that a farmer can understand. Keep NDVI as "NDVI". Use at most 4 sentences unless the user asks for more.';
    }
    if (code === 'pa') {
      return 'Answer in simple Punjabi (Gurmukhi) that a farmer can understand. Keep NDVI as "NDVI". Use at most 4 sentences unless the user asks for more.';
    }
    return 'Answer in simple English that a farmer can understand. Keep NDVI as "NDVI". Use at most 4 sentences unless the user asks for more.';
  }

  // Which of the three suggested questions is this? (typed or tapped)
  function fallbackIdFor(text) {
    var wanted = String(text || '').trim().toLowerCase();
    if (!wanted) return null;
    for (var i = 1; i <= 3; i++) {
      var chip = tr('chat.chip' + i, '');
      if (chip && String(chip).trim().toLowerCase() === wanted) return String(i);
    }
    return null;
  }

  function fallbackAnswer(id) {
    if (!id) return '';
    var key = 'chat.fallback' + id;
    var text = tr(key, '');
    return (text === key) ? '' : text;
  }

  function showSavedAnswer(id) {
    var answer = fallbackAnswer(id);
    if (!answer) return false;
    var tag = '<p class="bubble-tag">' + escapeHtml(tr('chat.saved', 'Saved answer — works offline')) + '</p>';
    addBubble('bot', tag + formatText(answer));
    return true;
  }

  function setThinking(on) {
    chatThinking = !!on;
    if (chatSend) {
      chatSend.disabled = !!on;
      chatSend.setAttribute('aria-busy', String(!!on));
      chatSend.setAttribute('aria-label', on
        ? tr('chat.thinking', 'Thinking…')
        : tr('chat.sendAria', 'Send question'));
    }
    if (chatForm) chatForm.classList.toggle('is-thinking', !!on);
  }

  async function askGemini(text, fallbackId) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true;

    var question = text;
    var savedId = fallbackId ? String(fallbackId) : fallbackIdFor(text);

    addBubble('user', formatText(text));
    if (chatInput) chatInput.value = '';
    showTyping();
    setThinking(true);

    var results = chatResults();
    var language = langName();
    var history = chatHistory.slice();

    var controller = null;
    var timer = null;

    try {
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timer = window.setTimeout(function () {
          try { controller.abort(); } catch (e) {}
        }, CHAT_TIMEOUT_MS);
      }

      var res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: languageInstruction() + '\n\n' + question,
          results: results,
          language: language,
          history: history
        }),
        signal: controller ? controller.signal : undefined
      });

      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }

      // The server route answers with `reply`; older deployments used
      // `answer`. Both are plain text — raw JSON is never displayed.
      var answer = '';
      if (data) {
        if (typeof data.answer === 'string' && data.answer.trim()) answer = data.answer.trim();
        else if (typeof data.reply === 'string' && data.reply.trim()) answer = data.reply.trim();
      }

      if (!res.ok || (data && data.error)) {
        if (showSavedAnswer(savedId)) {
          // A pre-written answer covers the three suggested questions.
        } else if (res.status === 429) {
          addBubble('bot', formatText(tr('chat.busy', 'The AI tutor is busy right now. Please try again in a minute.')), true);
        } else {
          addBubble('bot', formatText(errorMessage(data && data.error)), true);
        }
      } else if (answer) {
        addBubble('bot', formatText(answer));
        rememberTurn(question, answer);
      } else if (!showSavedAnswer(savedId)) {
        addBubble('bot', formatText(chatError()), true);
      }
    } catch (err) {
      var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (!showSavedAnswer(savedId)) {
        addBubble('bot', formatText(offline
          ? tr('chat.offlineError', 'You are offline. The AI tutor needs internet — please try again when you are back online.')
          : chatError()), true);
      }
    } finally {
      if (timer) window.clearTimeout(timer);
      hideTyping();
      setThinking(false);
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
      if (chip) askGemini(chip.textContent, chip.getAttribute('data-fallback'));
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
     4. Study data → hero, method box, table and result cards
     Every number comes from data/study.js via js/study.js, so the
     table, cards, charts and printed report cannot disagree.
     --------------------------------------------------------- */
  var SD = window.StudyData || null;

  function setText(id, text) {
    var el = doc.getElementById(id);
    if (el) el.textContent = text;
  }

  function setTrend(trendId, wordId, down) {
    var key = down ? 'results.trendDown' : 'results.trendUp';
    var word = down ? 'decrease' : 'increase';
    var el = doc.getElementById(trendId);
    if (el) {
      el.classList.toggle('trend--down', down);
      el.classList.toggle('trend--up', !down);
      el.setAttribute('title', tr(key, word));
    }
    setText(wordId, tr(key, word));
  }

  var LAND_NAMES = { cropland: 'Cropland', vegetation: 'Vegetation', water: 'Water', builtup: 'Built-up' };
  function landLabel(id) { return tr('land.' + id, LAND_NAMES[id] || id); }

  function renderStatus() {
    var el = doc.getElementById('dataStatus');
    if (!el || !SD) return;
    var verified = SD.status() === 'verified';
    el.classList.toggle('is-verified', verified);
    el.classList.toggle('is-sample', !verified);
    el.textContent = tr('results.statusTitle', 'Data status') + ': ' + (verified
      ? tr('results.statusVerified', 'Computed from the scenes listed in the table.')
      : tr('results.statusSample', 'Sample values for demonstration. Not yet verified against processed scenes.'));
  }

  // The table is built from the same rows the charts use.
  function renderTable() {
    var body = doc.getElementById('sceneTableBody');
    if (!body || !SD) return;
    body.innerHTML = '';
    SD.scenes().forEach(function (scene) {
      var tr = doc.createElement('tr');
      var cloud = (scene.cloud == null) ? '' : (scene.cloud + '%');
      var ndvi = (scene.ndvi == null) ? '' : ('NDVI ' + Number(scene.ndvi).toFixed(2));
      [scene.date, scene.sensor, scene.resolution, scene.scene, cloud, ndvi].forEach(function (value) {
        var td = doc.createElement('td');
        td.textContent = (value == null) ? '' : String(value);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function renderStudyText() {
    if (!SD) return;
    var y = SD.years();
    var nd = SD.ndviChange();
    var water = SD.waterChange();
    var sensors = SD.sensors() || {};
    var s2 = sensors['Sentinel-2 MSI'] || {};
    var l9 = sensors['Landsat 9 OLI-2'] || {};
    var b = SD.bounds() || {};

    // Hero + research question
    setText('heroYears', tr('hero.stat3value', '{n} yrs', { n: y.count }));
    setText('heroYearsLabel', tr('hero.stat3label', 'Years analysed ({range})', { range: y.range }));
    setText('researchQuestion', tr('problem.rq',
      'How have vegetation health and water coverage changed across Punjab\'s agricultural belt between {from} and {to}?',
      { from: y.first, to: y.last }));

    // Method: how the numbers were computed
    setText('methodBands', tr('method.howBands',
      'Sentinel-2 {s2nir} and {s2red}; Landsat 9 {l9nir} and {l9red}',
      { s2nir: s2.nirBand || 'B8', s2red: s2.redBand || 'B4', l9nir: l9.nirBand || 'B5', l9red: l9.redBand || 'B4' }));
    if (b.north != null) {
      setText('methodBounds', tr('method.howBounds',
        'North {n}, south {s}, east {e}, west {w}',
        {
          n: Number(b.north).toFixed(1) + '°', s: Number(b.south).toFixed(1) + '°',
          e: Number(b.east).toFixed(1) + '°', w: Number(b.west).toFixed(1) + '°'
        }));
    }
    setText('methodSame', tr('method.howSame',
      'The same months ({window}) are compared year to year.',
      { window: SD.comparisonWindow() }));

    // Results: subtitle + cards
    setText('resultsSub', tr('results.sub',
      'Summary across the {area} km² study area, {from} to {to}.',
      { area: SD.fmt(SD.areaKm2()), from: y.first, to: y.last }));
    setText('statArea', SD.fmt(SD.areaKm2()));
    setText('statScenes', String(SD.sceneCount()));

    if (nd) {
      setText('statNdviChange', SD.signed(nd.change, 2));
      setText('statNdviSub', tr('results.stat2sub',
        'Mean NDVI went from {a} in {ay} to {b} in {by}',
        { a: nd.from.toFixed(2), ay: nd.fromYear, b: nd.to.toFixed(2), by: nd.toYear }));
      setTrend('statNdviTrend', 'statNdviDir', nd.change < 0);
    }
    if (water != null) {
      setText('statWaterValue', SD.signed(water, 0));
      setText('statWaterSub', tr('results.stat3sub',
        'Water share of the land area, {from} to {to}',
        { from: y.first, to: y.last }));
      setTrend('statWaterTrend', 'statWaterDir', water < 0);
    }

    renderStatus();
    renderTable();
  }

  /* ---------------------------------------------------------
     5. Results — Chart.js charts from the same study data
     --------------------------------------------------------- */
  var ndviChart = null;
  var landChart = null;
  var sameChart = null;

  // The server only answers in one language per request; charts keep
  // numbers as numbers, and translated labels are refreshed on change.
  function monthLabel(year, month) {
    var code = 'en';
    try { if (window.SW_I18N) code = window.SW_I18N.lang(); } catch (e) {}
    var loc = code === 'hi' ? 'hi-IN' : (code === 'pa' ? 'pa-IN' : 'en-GB');
    try {
      return new Date(year, month - 1, 15).toLocaleDateString(loc, { month: 'short' }) + ' ' + year;
    } catch (e) {
      return String(year);
    }
  }

  // Draws the NDVI value above every point — no extra plugin needed.
  var pointLabelsPlugin = {
    id: 'swPointLabels',
    afterDatasetsDraw: function (chart) {
      var meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      var ctx = chart.ctx;
      var data = (chart.data.datasets[0] || {}).data || [];
      ctx.save();
      ctx.font = '600 12px Inter, system-ui, -apple-system, sans-serif';
      ctx.fillStyle = (typeof Chart !== 'undefined' && Chart.defaults.color) || '#5b6b62';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      meta.data.forEach(function (point, i) {
        var value = data[i];
        if (value == null || !isFinite(value)) return;
        ctx.fillText(Number(value).toFixed(2), point.x, point.y - 10);
      });
      ctx.restore();
    }
  };

  function sameMonthRows() {
    return SD ? SD.sameMonthScenes() : [];
  }

  function sameMonthAria() {
    var rows = sameMonthRows();
    var parts = rows.map(function (row) {
      var sensor = SD.sensorFor(row) || {};
      return SD.sceneYear(row) + ': ' + Number(row.ndvi).toFixed(2) + ' (' + (sensor.short || row.sensor) + ')';
    });
    return parts.join('; ');
  }

  function buildCharts() {
    if (typeof Chart === 'undefined' || !SD) return;

    var t = readTheme();
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = t.text;

    var legendOpts = { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 } };
    var PRIMARY = '#2e9e5b';
    var ACCENT = '#2a7fba';

    /* ---- Mean NDVI by month (data/study.js) ---- */
    var monthly = SD.monthly();
    var ndviCanvas = doc.getElementById('ndviChart');
    if (ndviCanvas && monthly.series.length) {
      var monthColours = [PRIMARY, ACCENT];
      ndviChart = new Chart(ndviCanvas, {
        type: 'line',
        data: {
          labels: monthly.months,
          datasets: monthly.series.map(function (row, i) {
            return {
              label: String(row.year),
              data: row.values,
              borderColor: monthColours[i % monthColours.length],
              backgroundColor: i === 0 ? 'rgba(46,158,91,0.14)' : 'rgba(42,127,186,0.12)',
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: monthColours[i % monthColours.length]
            };
          })
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
      });
      charts.push(ndviChart);
    }

    /* ---- Land cover share (data/study.js) ---- */
    var lc = SD.landCover();
    var landCanvas = doc.getElementById('landCoverChart');
    if (landCanvas && lc.years.length) {
      landChart = new Chart(landCanvas, {
        type: 'bar',
        data: {
          labels: lc.classes.map(landLabel),
          datasets: lc.years.map(function (row, i) {
            return {
              label: String(row.year),
              data: row.values,
              backgroundColor: i === 0 ? PRIMARY : ACCENT,
              borderRadius: 8,
              maxBarThickness: 38
            };
          })
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
      });
      charts.push(landChart);
    }

    /* ---- Same time of year, year by year (scene table) ---- */
    var sameCanvas = doc.getElementById('sameMonthChart');
    var rows = sameMonthRows();
    if (sameCanvas && rows.length) {
      var isLandsat = function (row) { return /landsat/i.test(String(row.sensor || '')); };
      var styles = rows.map(function (row) { return isLandsat(row) ? 'rect' : 'circle'; });
      var colours = rows.map(function (row) { return isLandsat(row) ? ACCENT : PRIMARY; });
      var radii = rows.map(function (row) { return isLandsat(row) ? 8 : 5; });

      sameChart = new Chart(sameCanvas, {
        type: 'line',
        data: {
          labels: rows.map(function (row) { return String(SD.sceneYear(row)); }),
          datasets: [{
            label: 'NDVI',
            data: rows.map(function (row) { return Number(row.ndvi); }),
            borderColor: PRIMARY,
            backgroundColor: 'rgba(46,158,91,0.10)',
            fill: false,
            tension: 0.28,
            borderWidth: 2.5,
            pointStyle: styles,
            pointRadius: radii,
            pointHoverRadius: radii.map(function (radius) { return radius + 2; }),
            pointBackgroundColor: colours,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function (items) {
                  if (!items.length) return '';
                  var row = rows[items[0].dataIndex];
                  return row ? monthLabel(SD.sceneYear(row), SD.sceneMonth(row)) : '';
                },
                label: function (item) {
                  var row = rows[item.dataIndex] || {};
                  var sensor = SD.sensorFor(row) || {};
                  var name = sensor.short || String(row.sensor || '');
                  return 'NDVI ' + Number(row.ndvi).toFixed(2) + ' · ' + name + ' (' + (row.resolution || sensor.resolution || '') + ')';
                }
              }
            }
          },
          scales: {
            y: { suggestedMin: 0, suggestedMax: 0.8, grid: { color: t.grid, drawBorder: false }, ticks: { color: t.text } },
            x: { grid: { display: false }, ticks: { color: t.text } }
          }
        },
        plugins: [pointLabelsPlugin]
      });
      charts.push(sameChart);

      sameCanvas.setAttribute('aria-label',
        tr('results.chart3Aria', 'Line chart of NDVI in late May to mid June, year by year') +
        ' — ' + sameMonthAria());
    }
  }

  renderStudyText();
  buildCharts();

  /* Re-word everything that is generated when the language changes. */
  doc.addEventListener('sw:language', function () {
    renderStudyText();
    if (landChart && SD) {
      landChart.data.labels = SD.landCover().classes.map(landLabel);
      landChart.update();
    }
    var sameCanvas = doc.getElementById('sameMonthChart');
    if (sameCanvas) {
      sameCanvas.setAttribute('aria-label',
        tr('results.chart3Aria', 'Line chart of NDVI in late May to mid June, year by year') +
        ' — ' + sameMonthAria());
    }
  });

  /* ---------------------------------------------------------
     Offline state + service worker
     --------------------------------------------------------- */
  var offlineNote = doc.getElementById('offlineNote');
  var chatOffline = doc.getElementById('chatOffline');

  function syncOnline() {
    var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (offlineNote) offlineNote.hidden = !offline;
    if (chatOffline) chatOffline.hidden = !offline;
    doc.body.classList.toggle('is-offline', offline);
  }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  // Cache the page shell + the data file so a weak connection still works.
  if ('serviceWorker' in navigator) {
    var secure = (window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');
    if (secure) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* offline still works without it */ });
      });
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
