/**
 * LingoFlashcards - Interactive Study Deck from Starred Translations
 */
(function (global) {
  'use strict';

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
    openBtn: null,
    modalEl: null,
    backdropEl: null,
    closeBtn: null,
    bodyEl: null,
    getStarredItems: null,
    onUnstar: null,
    onSpeak: null,
    onToast: null,
    deck: [],
    currentIndex: 0,
    isFlipped: false,
    isOpen: false,
    bound: false
  };

  function toast(message) {
    if (typeof state.onToast === 'function' && message) {
      try {
        state.onToast(message);
      } catch (_) {}
    }
  }

  function loadDeck() {
    let raw = [];
    if (typeof state.getStarredItems === 'function') {
      try {
        raw = state.getStarredItems();
      } catch (err) {
        console.warn('LingoFlashcards getStarredItems error:', err);
        raw = [];
      }
    }
    state.deck = Array.isArray(raw) ? raw.filter(item => item && (item.sourceText || item.targetText)) : [];
    if (state.currentIndex >= state.deck.length) {
      state.currentIndex = Math.max(0, state.deck.length - 1);
    }
    state.isFlipped = false;
  }

  function renderEmptyState() {
    if (!state.bodyEl) return;
    state.bodyEl.innerHTML =
      '<div class="flashcards-empty">' +
        '<svg class="flashcards-empty-icon" viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">' +
          '<path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28M12 15.4z"/>' +
        '</svg>' +
        '<h3>No starred flashcards yet</h3>' +
        '<p>Star any translation in the workspace or history drawer to study it as a flashcard.</p>' +
      '</div>';
  }

  function renderStudyView() {
    if (!state.bodyEl) return;

    if (!state.deck || state.deck.length === 0) {
      renderEmptyState();
      return;
    }

    const index = Math.max(0, Math.min(state.currentIndex, state.deck.length - 1));
    state.currentIndex = index;
    const item = state.deck[index];

    const srcLang = item.sourceLang && item.sourceLang !== 'auto' ? String(item.sourceLang) : 'auto';
    const tgtLang = item.targetLang ? String(item.targetLang) : 'vi';
    const pairLabel = (srcLang === 'auto' ? 'AUTO' : srcLang.toUpperCase()) + ' → ' + tgtLang.toUpperCase();
    const flippedClass = state.isFlipped ? ' flipped' : '';

    state.bodyEl.innerHTML =
      '<div class="flashcards-study">' +
        '<div class="flashcards-toolbar">' +
          '<div class="flashcards-meta">' +
            '<span class="flashcards-counter" aria-live="polite">' + (index + 1) + ' / ' + state.deck.length + '</span>' +
            '<span class="flashcards-lang-badge">' + escapeHtml(pairLabel) + '</span>' +
          '</div>' +
          '<div class="flashcards-toolbar-actions">' +
            '<button type="button" class="fc-btn fc-shuffle-btn" title="Shuffle flashcards" aria-label="Shuffle flashcards"' + (state.deck.length < 2 ? ' disabled' : '') + '>' +
              'Shuffle' +
            '</button>' +
            '<button type="button" class="fc-btn fc-unstar-btn" title="Remove from flashcards" aria-label="Unstar and remove flashcard">' +
              'Unstar' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="flashcards-stage">' +
          '<div class="flashcard' + flippedClass + '" tabindex="0" role="button" aria-pressed="' + (state.isFlipped ? 'true' : 'false') + '" aria-label="Flashcard: click or press Space to flip">' +
            '<div class="flashcard-inner">' +
              '<div class="flashcard-face flashcard-front">' +
                '<div class="flashcard-face-header">' +
                  '<span class="flashcard-side-label">Source (' + escapeHtml(srcLang.toUpperCase()) + ')</span>' +
                  '<button type="button" class="icon-btn fc-speak-btn" data-side="front" title="Pronounce source text" aria-label="Pronounce source text">' +
                    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
                      '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
                    '</svg>' +
                  '</button>' +
                '</div>' +
                '<div class="flashcard-text">' + escapeHtml(item.sourceText || '') + '</div>' +
                '<span class="flashcard-tap-hint">Click card to flip</span>' +
              '</div>' +

              '<div class="flashcard-face flashcard-back">' +
                '<div class="flashcard-face-header">' +
                  '<span class="flashcard-side-label">Translation (' + escapeHtml(tgtLang.toUpperCase()) + ')</span>' +
                  '<button type="button" class="icon-btn fc-speak-btn" data-side="back" title="Pronounce translation" aria-label="Pronounce translation">' +
                    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
                      '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
                    '</svg>' +
                  '</button>' +
                '</div>' +
                '<div class="flashcard-text">' + escapeHtml(item.targetText || '') + '</div>' +
                '<span class="flashcard-tap-hint">Click card to flip back</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="flashcards-controls">' +
          '<button type="button" class="fc-btn fc-prev-btn" aria-label="Previous flashcard"' + (state.deck.length < 2 ? ' disabled' : '') + '>← Previous</button>' +
          '<button type="button" class="fc-btn fc-flip-btn" aria-label="Flip flashcard">Flip card</button>' +
          '<button type="button" class="fc-btn fc-next-btn" aria-label="Next flashcard"' + (state.deck.length < 2 ? ' disabled' : '') + '>Next →</button>' +
        '</div>' +
      '</div>';

    bindStudyEvents(item);
  }

  function toggleFlip() {
    if (!state.deck || state.deck.length === 0) return;
    state.isFlipped = !state.isFlipped;
    const cardEl = state.bodyEl ? state.bodyEl.querySelector('.flashcard') : null;
    if (cardEl) {
      cardEl.classList.toggle('flipped', state.isFlipped);
      cardEl.setAttribute('aria-pressed', state.isFlipped ? 'true' : 'false');
    }
  }

  function goPrev() {
    if (!state.deck || state.deck.length <= 1) return;
    state.currentIndex = (state.currentIndex - 1 + state.deck.length) % state.deck.length;
    state.isFlipped = false;
    renderStudyView();
  }

  function goNext() {
    if (!state.deck || state.deck.length <= 1) return;
    state.currentIndex = (state.currentIndex + 1) % state.deck.length;
    state.isFlipped = false;
    renderStudyView();
  }

  function shuffleDeck() {
    if (!state.deck || state.deck.length <= 1) return;
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = state.deck[i];
      state.deck[i] = state.deck[j];
      state.deck[j] = tmp;
    }
    state.currentIndex = 0;
    state.isFlipped = false;
    renderStudyView();
    toast('Đã xáo trộn thẻ học');
  }

  async function unstarCurrent(item) {
    if (!item) return;
    if (typeof state.onUnstar === 'function') {
      try {
        await state.onUnstar(item.id);
      } catch (err) {
        console.warn('onUnstar error:', err);
      }
    }
    state.deck.splice(state.currentIndex, 1);
    if (state.currentIndex >= state.deck.length) {
      state.currentIndex = Math.max(0, state.deck.length - 1);
    }
    state.isFlipped = false;
    renderStudyView();
    toast('Đã bỏ gắn sao khỏi flashcard');
  }

  function bindStudyEvents(item) {
    if (!state.bodyEl) return;

    const cardEl = state.bodyEl.querySelector('.flashcard');
    if (cardEl) {
      cardEl.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.fc-speak-btn')) {
          return;
        }
        toggleFlip();
      });
      cardEl.addEventListener('keydown', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFlip();
        }
      });
    }

    state.bodyEl.querySelectorAll('.fc-speak-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const side = btn.getAttribute('data-side');
        const isFront = side === 'front';
        const text = isFront ? item.sourceText : item.targetText;
        const lang = isFront ? item.sourceLang : item.targetLang;
        if (text && typeof state.onSpeak === 'function') {
          state.onSpeak(text, lang);
        }
      });
    });

    const prevBtn = state.bodyEl.querySelector('.fc-prev-btn');
    const nextBtn = state.bodyEl.querySelector('.fc-next-btn');
    const flipBtn = state.bodyEl.querySelector('.fc-flip-btn');
    const shuffleBtn = state.bodyEl.querySelector('.fc-shuffle-btn');
    const unstarBtn = state.bodyEl.querySelector('.fc-unstar-btn');

    if (prevBtn) prevBtn.addEventListener('click', goPrev);
    if (nextBtn) nextBtn.addEventListener('click', goNext);
    if (flipBtn) flipBtn.addEventListener('click', toggleFlip);
    if (shuffleBtn) shuffleBtn.addEventListener('click', shuffleDeck);
    if (unstarBtn) unstarBtn.addEventListener('click', () => unstarCurrent(item));
  }

  function handleKeydown(e) {
    if (!state.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft') {
      goPrev();
    } else if (e.key === 'ArrowRight') {
      goNext();
    }
  }

  function open() {
    if (!state.modalEl) return;
    loadDeck();
    renderStudyView();

    state.isOpen = true;
    state.modalEl.removeAttribute('hidden');
    state.modalEl.classList.remove('hidden');
    state.modalEl.setAttribute('aria-hidden', 'false');

    if (state.closeBtn && typeof state.closeBtn.focus === 'function') {
      setTimeout(() => {
        try {
          state.closeBtn.focus();
        } catch (_) {}
      }, 30);
    }
  }

  function close() {
    if (!state.modalEl || !state.isOpen) return;
    state.isOpen = false;
    state.modalEl.classList.add('hidden');
    state.modalEl.setAttribute('hidden', '');
    state.modalEl.setAttribute('aria-hidden', 'true');

    if (state.openBtn && typeof state.openBtn.focus === 'function') {
      try {
        state.openBtn.focus();
      } catch (_) {}
    }
  }

  function refresh() {
    if (!state.isOpen) return;
    loadDeck();
    renderStudyView();
  }

  function init(options = {}) {
    try {
      state.openBtn = options.openBtn || null;
      state.modalEl = options.modalEl || (typeof document !== 'undefined' ? document.getElementById('flashcardsModal') : null);
      state.getStarredItems = typeof options.getStarredItems === 'function' ? options.getStarredItems : null;
      state.onUnstar = typeof options.onUnstar === 'function' ? options.onUnstar : null;
      state.onSpeak = typeof options.onSpeak === 'function' ? options.onSpeak : null;
      state.onToast = typeof options.onToast === 'function' ? options.onToast : null;

      if (state.modalEl) {
        state.backdropEl = state.modalEl.querySelector('#flashcardsBackdrop') ||
          state.modalEl.querySelector('.modal-backdrop') ||
          (typeof document !== 'undefined' ? document.getElementById('flashcardsBackdrop') : null);
        state.closeBtn = state.modalEl.querySelector('#flashcardsCloseBtn') ||
          (typeof document !== 'undefined' ? document.getElementById('flashcardsCloseBtn') : null);
        state.bodyEl = state.modalEl.querySelector('#flashcardsBody') ||
          (typeof document !== 'undefined' ? document.getElementById('flashcardsBody') : null);
      }

      if (!state.bound) {
        if (state.openBtn) {
          state.openBtn.addEventListener('click', open);
        }
        if (state.closeBtn) {
          state.closeBtn.addEventListener('click', close);
        }
        if (state.backdropEl) {
          state.backdropEl.addEventListener('click', close);
        }
        if (typeof document !== 'undefined') {
          document.addEventListener('keydown', handleKeydown);
        }
        state.bound = true;
      }
    } catch (err) {
      console.warn('LingoFlashcards init error:', err);
    }
  }

  const LingoFlashcards = {
    init,
    open,
    close,
    refresh
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LingoFlashcards;
  }
  global.LingoFlashcards = LingoFlashcards;
})(typeof window !== 'undefined' ? window : this);
