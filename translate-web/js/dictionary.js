/**
 * LingoDictionary - Word Definition, Synonyms & Phrase Lookup Module
 */
(function (global) {
  'use strict';

  const DICTIONARY_API_URL = 'api/dictionary.php';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const state = {
    containerEl: null,
    onPhraseSelect: null,
    onSpeak: null,
    onEntryLoaded: null,
    onClear: null,
    abortController: null,
    requestSeq: 0,
    lastQueryKey: ''
  };

  function abortPending() {
    if (state.abortController) {
      try {
        state.abortController.abort();
      } catch (_) {}
      state.abortController = null;
    }
  }

  function renderIdle() {
    if (!state.containerEl) return;
    state.containerEl.setAttribute('aria-busy', 'false');
    state.containerEl.innerHTML =
      '<div class="dictionary-card dictionary-idle">' +
        '<p class="dictionary-idle-text">Nhập hoặc chọn một từ ở trên để xem nghĩa, phiên âm, ví dụ và từ đồng nghĩa...</p>' +
      '</div>';
  }

  function renderLoading(word) {
    if (!state.containerEl) return;
    state.containerEl.setAttribute('aria-busy', 'true');
    state.containerEl.innerHTML =
      '<div class="dictionary-card dictionary-loading" role="status" aria-live="polite">' +
        '<span class="dictionary-spinner" aria-hidden="true"></span>' +
        '<span>Looking up <strong>' + escapeHtml(word) + '</strong>…</span>' +
      '</div>';
  }

  function renderEmpty(word, message) {
    if (!state.containerEl) return;
    state.containerEl.setAttribute('aria-busy', 'false');
    const detail = message || ('No dictionary entry found for "' + word + '".');
    state.containerEl.innerHTML =
      '<div class="dictionary-card dictionary-empty" role="status">' +
        '<p>' + escapeHtml(detail) + '</p>' +
      '</div>';
  }

  function renderError(message) {
    if (!state.containerEl) return;
    state.containerEl.setAttribute('aria-busy', 'false');
    const detail = message || 'Dictionary lookup is temporarily unavailable. Translation still works normally.';
    state.containerEl.innerHTML =
      '<div class="dictionary-card dictionary-error" role="alert">' +
        '<p>' + escapeHtml(detail) + '</p>' +
      '</div>';
  }

  function renderEntry(data, fallbackWord, lang) {
    if (!state.containerEl) return;
    state.containerEl.setAttribute('aria-busy', 'false');

    const effectiveLang = (data && typeof data.lang === 'string' && data.lang.trim())
      ? data.lang.trim()
      : ((lang && lang !== 'auto') ? String(lang).trim() : 'en');
    const word = (data && data.word) ? String(data.word) : fallbackWord;
    const phonetic = (data && data.phonetic) ? String(data.phonetic) : '';
    const meanings = Array.isArray(data && data.meanings) ? data.meanings : [];
    const synonyms = Array.isArray(data && data.synonyms) ? data.synonyms : [];
    const examples = Array.isArray(data && data.examples) ? data.examples : [];
    const relatedPhrases = Array.isArray(data && data.relatedPhrases) ? data.relatedPhrases : [];
    const contextParagraph = (data && typeof data.contextParagraph === 'string')
      ? data.contextParagraph.trim()
      : '';

    if (
      meanings.length === 0 &&
      synonyms.length === 0 &&
      examples.length === 0 &&
      relatedPhrases.length === 0 &&
      !contextParagraph
    ) {
      renderEmpty(word);
      return;
    }

    const phoneticHtml = phonetic
      ? '<span class="dict-phonetic">' + escapeHtml(phonetic) + '</span>'
      : '';

    const meaningsHtml = meanings.slice(0, 4).map(meaning => {
      const pos = meaning && meaning.partOfSpeech ? String(meaning.partOfSpeech) : '';
      const defs = Array.isArray(meaning && meaning.definitions) ? meaning.definitions.slice(0, 3) : [];
      if (defs.length === 0) return '';

      const defsList = defs.map(item => {
        const defText = item && item.definition ? String(item.definition) : '';
        if (!defText) return '';
        const exText = item && item.example ? String(item.example) : '';
        return (
          '<li class="dict-def-item">' +
            '<span class="dict-def-text">' + escapeHtml(defText) + '</span>' +
            (exText ? '<span class="dict-example">“' + escapeHtml(exText) + '”</span>' : '') +
          '</li>'
        );
      }).filter(Boolean).join('');

      if (!defsList) return '';

      return (
        '<div class="dict-meaning-group">' +
          (pos ? '<span class="dict-pos">' + escapeHtml(pos) + '</span>' : '') +
          '<ol class="dict-definitions">' + defsList + '</ol>' +
        '</div>'
      );
    }).filter(Boolean).join('');

    const uniqueSynonyms = [];
    const seenSyn = new Set();
    for (const s of synonyms) {
      const val = String(s || '').trim();
      if (!val || seenSyn.has(val.toLowerCase())) continue;
      seenSyn.add(val.toLowerCase());
      uniqueSynonyms.push(val);
      if (uniqueSynonyms.length >= 10) break;
    }

    const synonymsHtml = uniqueSynonyms.length > 0
      ? '<div class="dict-synonyms-section">' +
          '<span class="dict-section-label">Synonyms &amp; related</span>' +
          '<div class="dict-synonyms" role="list">' +
            uniqueSynonyms.map(syn => (
              '<button type="button" class="dict-chip" role="listitem" data-dict-phrase="' + escapeHtml(syn) + '">' +
                escapeHtml(syn) +
              '</button>'
            )).join('') +
          '</div>' +
        '</div>'
      : '';

    const shownExamples = new Set();
    meanings.forEach(m => {
      if (Array.isArray(m && m.definitions)) {
        m.definitions.forEach(d => {
          if (d && d.example) shownExamples.add(String(d.example).trim().toLowerCase());
        });
      }
    });
    const extraExamples = examples
      .map(ex => String(ex || '').trim())
      .filter(ex => ex && !shownExamples.has(ex.toLowerCase()))
      .slice(0, 3);

    const extraExamplesHtml = extraExamples.length > 0
      ? '<div class="dict-examples-section">' +
          '<span class="dict-section-label">Examples</span>' +
          '<ul class="dict-examples-list">' +
            extraExamples.map(ex => '<li class="dict-example">“' + escapeHtml(ex) + '”</li>').join('') +
          '</ul>' +
        '</div>'
      : '';

    state.containerEl.innerHTML =
      '<article class="dictionary-card" lang="' + escapeHtml(effectiveLang) + '" aria-label="Dictionary entry for ' + escapeHtml(word) + '">' +
        '<header class="dict-header">' +
          '<div class="dict-word-group">' +
            '<h3 class="dict-word">' + escapeHtml(word) + '</h3>' +
            phoneticHtml +
          '</div>' +
          '<button type="button" class="icon-btn dict-speak-btn" aria-label="Pronounce ' + escapeHtml(word) + '" title="Pronounce ' + escapeHtml(word) + '">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
              '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
            '</svg>' +
          '</button>' +
        '</header>' +
        (meaningsHtml ? '<div class="dict-meanings">' + meaningsHtml + '</div>' : '') +
        synonymsHtml +
        extraExamplesHtml +
      '</article>';

    const speakBtn = state.containerEl.querySelector('.dict-speak-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => {
        if (typeof state.onSpeak === 'function') {
          state.onSpeak(word, effectiveLang);
        }
      });
    }

    state.containerEl.querySelectorAll('.dict-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const phrase = chip.getAttribute('data-dict-phrase');
        if (phrase && typeof state.onPhraseSelect === 'function') {
          state.onPhraseSelect(phrase, effectiveLang);
        }
      });
    });

    if (typeof state.onEntryLoaded === 'function') {
      try {
        state.onEntryLoaded(data, word, effectiveLang);
      } catch (err) {
        console.warn('LingoDictionary onEntryLoaded error:', err);
      }
    }
  }

  function init(options = {}) {
    try {
      state.containerEl = options.containerEl || null;
      state.onPhraseSelect = typeof options.onPhraseSelect === 'function' ? options.onPhraseSelect : null;
      state.onSpeak = typeof options.onSpeak === 'function' ? options.onSpeak : null;
      state.onEntryLoaded = typeof options.onEntryLoaded === 'function' ? options.onEntryLoaded : null;
      state.onClear = typeof options.onClear === 'function' ? options.onClear : null;
      state.lastQueryKey = '';
      abortPending();
      renderIdle();
    } catch (err) {
      console.warn('LingoDictionary init error:', err);
    }
  }

  async function lookup(word, lang) {
    if (!state.containerEl) return;

    const cleanWord = String(word || '').trim();
    if (!cleanWord) {
      clear();
      return;
    }

    const requestLang = (!lang || !String(lang).trim()) ? 'en' : String(lang).trim();
    const queryKey = requestLang + ':' + cleanWord.toLowerCase();
    if (queryKey === state.lastQueryKey && state.containerEl.querySelector('.dict-word')) {
      return;
    }

    abortPending();
    const seq = ++state.requestSeq;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    state.abortController = controller;
    state.lastQueryKey = queryKey;

    renderLoading(cleanWord);

    try {
      const url =
        DICTIONARY_API_URL +
        '?word=' + encodeURIComponent(cleanWord) +
        '&lang=' + encodeURIComponent(requestLang);

      const res = await fetch(url, {
        method: 'GET',
        signal: controller ? controller.signal : undefined
      });

      if (seq !== state.requestSeq) return;

      const contentType = (res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('content-type')
        : '') || '';
      const isJson = contentType.toLowerCase().includes('application/json');

      if (res.status === 404) {
        renderEmpty(cleanWord);
        return;
      }

      if (!res.ok || !isJson) {
        renderError();
        return;
      }

      const data = await res.json().catch(() => null);

      if (seq !== state.requestSeq) return;

      if (data && data.notFound) {
        renderEmpty(cleanWord);
        return;
      }

      if (!data || typeof data !== 'object') {
        renderEmpty(cleanWord);
        return;
      }

      renderEntry(data, cleanWord, requestLang);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (seq !== state.requestSeq) return;
      console.warn('LingoDictionary lookup error:', err);
      renderError();
    }
  }

  function clear() {
    abortPending();
    state.requestSeq += 1;
    state.lastQueryKey = '';
    renderIdle();
    if (typeof state.onClear === 'function') {
      try {
        state.onClear();
      } catch (err) {
        console.warn('LingoDictionary onClear error:', err);
      }
    }
  }

  const LingoDictionary = {
    init,
    lookup,
    clear
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LingoDictionary;
  }
  global.LingoDictionary = LingoDictionary;
})(typeof window !== 'undefined' ? window : this);
