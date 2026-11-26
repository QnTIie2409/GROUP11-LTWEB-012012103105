/**
 * Google Translate Web - Main Application Controller
 * Manages translation flow, debouncing, voice features (TTS/STT),
 * history & starred storage, language modal, and UI theme.
 */
(function (global) {

// Universal imports for Node.js test environment & Browser globals
const {
  SUPPORTED_LANGUAGES,
  PINNED_SOURCE_LANGS,
  PINNED_TARGET_LANGS,
  getLanguageByCode
} = typeof window !== 'undefined' && window.SUPPORTED_LANGUAGES
  ? {
      SUPPORTED_LANGUAGES: window.SUPPORTED_LANGUAGES,
      PINNED_SOURCE_LANGS: window.PINNED_SOURCE_LANGS,
      PINNED_TARGET_LANGS: window.PINNED_TARGET_LANGS,
      getLanguageByCode: window.getLanguageByCode
    }
  : (typeof require !== 'undefined' ? require('./languages.js') : {});

const { TranslationService } = typeof window !== 'undefined' && window.TranslationService
  ? { TranslationService: window.TranslationService }
  : (typeof require !== 'undefined' ? require('./translator.js') : {});

/**
 * Storage keys used by the application
 */
const STORAGE_KEYS = {
  THEME: 'google_translate_theme',
  HISTORY: 'google_translate_history' // Legacy data; imported into MySQL once.
};
const HISTORY_API_URL = 'api/history.php';
const DEFAULT_STARTER_PHRASES = [
  'Hello',
  'Thank you',
  'How are you?',
  'Where is the station?'
];
const DEFAULT_PHRASE_SUBTITLE = 'Tap one to see it translated.';

/**
 * BCP-47 language tag mapping for speech services
 */
const BCP47_MAP = {
  'auto': 'vi-VN',
  'vi': 'vi-VN',
  'en': 'en-US',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'es': 'es-ES',
  'ru': 'ru-RU',
  'it': 'it-IT',
  'pt': 'pt-PT',
  'th': 'th-TH',
  'lo': 'lo-LA',
  'km': 'km-KH',
  'id': 'id-ID',
  'ms': 'ms-MY',
  'hi': 'hi-IN',
  'ar': 'ar-SA',
  'tr': 'tr-TR',
  'nl': 'nl-NL',
  'pl': 'pl-PL',
  'uk': 'uk-UA',
  'el': 'el-GR',
  'he': 'he-IL',
  'sv': 'sv-SE',
  'no': 'nb-NO',
  'da': 'da-DK',
  'fi': 'fi-FI',
  'cs': 'cs-CZ',
  'sk': 'sk-SK',
  'hu': 'hu-HU',
  'ro': 'ro-RO',
  'bg': 'bg-BG'
};

/**
 * Returns the BCP-47 tag corresponding to a language code
 * @param {string} code
 * @returns {string}
 */
function getBcp47Tag(code) {
  if (!code || code === 'auto') return 'vi-VN';
  return BCP47_MAP[code] || code;
}

/**
 * Formats a character count into Vietnamese numeric format: "1.250 / 5.000"
 * @param {number} count
 * @returns {string}
 */
function formatCharCount(count) {
  const num = Math.max(0, Number(count) || 0);
  const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} / 5.000`;
}

/**
 * Normalizes text by removing Vietnamese accents for fuzzy searching
 * @param {string} str
 * @returns {string}
 */
function normalizeSearchText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Escapes HTML characters to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Filters the list of languages matching a search query
 * @param {Array} list
 * @param {string} query
 * @param {boolean} [excludeAuto=false]
 * @returns {Array}
 */
function filterLanguages(list, query, excludeAuto = false) {
  const q = normalizeSearchText(query);
  const base = excludeAuto ? list.filter(l => l.code !== 'auto') : list;
  if (!q) return base;

  return base.filter(lang => {
    const nameNorm = normalizeSearchText(lang.name);
    const nativeNorm = normalizeSearchText(lang.nativeName);
    const codeNorm = lang.code.toLowerCase();
    return nameNorm.includes(q) || nativeNorm.includes(q) || codeNorm.includes(q);
  });
}

/**
 * GoogleTranslateApp Class
 * Encapsulates the entire application state, DOM event listeners, and business logic.
 */
class GoogleTranslateApp {
  /**
   * @param {Object} [options]
   * @param {Object} [options.dom] - Custom DOM elements dictionary (for testing)
   * @param {Object} [options.storage] - Custom Storage implementation (for testing)
   * @param {TranslationService} [options.translationService] - Custom translation service instance
   * @param {number} [options.debounceDelay=400] - Debounce delay in ms
   */
  constructor(options = {}) {
    this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.translationService = options.translationService || (TranslationService ? new TranslationService() : null);
    this.selectionTranslationService = options.selectionTranslationService ||
      (options.translationService ? options.translationService : (TranslationService ? new TranslationService() : null));
    this.contextTranslationService = options.contextTranslationService ||
      (options.translationService ? options.translationService : (TranslationService ? new TranslationService() : null));
    this.debounceDelay = options.debounceDelay !== undefined ? options.debounceDelay : 400;

    // Core application state
    this.state = {
      sourceLang: 'en',
      targetLang: 'vi',
      detectedLang: '',
      isSpeaking: false,
      history: [],
      historyFilter: 'all', // 'all' | 'starred'
      activePicker: null,   // 'source' | 'target'
      theme: 'light'
    };

    // Pinned tabs displayed in source and target tab bars
    this.sourceTabs = ['auto', 'vi', 'en', 'zh-CN'];
    this.targetTabs = ['vi', 'en', 'zh-CN', 'ja'];

    this.debounceTimer = null;
    this.dictionaryDebounceTimer = null;
    this.spotlightDebounceTimer = null;
    this.spotlightSeq = 0;
    this.spotlightData = null;
    this.contextPassageSeq = 0;
    this.defaultStarterPhrases = [...DEFAULT_STARTER_PHRASES];
    this._lastDictionaryQuery = '';
    this._activeContextLang = 'en';
    this._voiceBaseText = '';
    this.currentUtterance = null;
    this.currentSpeakingBtn = null;
    this.currentAudio = null;
    this.currentAudioUrl = null;
    this.ttsSessionCounter = 0;
    this._ttsProxyAvailable = null;
    this.historySaveQueue = Promise.resolve();
    this._authInitPromise = null;
    this._isInitializingAuth = false;
    this._historyLoadPromise = null;
    this._lastHistoryRefreshAt = 0;
    this._flashcardsRefreshBound = false;

    // DOM references
    this.dom = options.dom || {};
  }

  /**
   * Initializes the application: queries DOM elements, loads storage, renders UI, and binds events.
   */
  async init() {
    try { this._bindDomElements(); } catch (err) { console.warn('DOM bind error:', err); }
    try { this.loadTheme(); } catch (err) { console.warn('Theme load error:', err); }
    try { this.renderTabs(); } catch (err) { console.warn('Render tabs error:', err); }
    try { this.updateCharCount(); } catch (err) { console.warn('Char count error:', err); }
    try { this.updateStarBtnState(); } catch (err) { console.warn('Star state error:', err); }
    try { this._bindEvents(); } catch (err) { console.warn('Event bind error:', err); }
    try { this._initFeatureModules(); } catch (err) { console.warn('Feature init error:', err); }

    if (this._authInitPromise && typeof this._authInitPromise.then === 'function') {
      this._isInitializingAuth = true;
      let authTimeoutId = null;
      try {
        await Promise.race([
          this._authInitPromise,
          new Promise(resolve => {
            authTimeoutId = setTimeout(resolve, 4000);
          })
        ]);
      } catch (err) {
        console.warn('LingoAuth readiness wait error:', err);
      } finally {
        if (authTimeoutId) {
          clearTimeout(authTimeoutId);
        }
        this._isInitializingAuth = false;
      }
    }

    try {
      await this.loadHistory();
      this.updateStarBtnState();
      if (this.isHistoryDrawerOpen()) {
        this.renderHistoryList();
      }
      this._refreshFlashcards();
    } catch (err) {
      console.warn('History init error:', err);
    }

    try { this._checkUrlParams(); } catch (err) { console.warn('URL params error:', err); }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = () => {
          try { window.speechSynthesis.getVoices(); } catch (_) {}
        };
      }
    }
  }

  /**
   * Populates DOM references from the current document if not provided in options
   * @private
   */
  _bindDomElements() {
    if (typeof document === 'undefined') return;

    const ids = [
      'translateBtn',
      'themeToggleBtn',
      'historyToggleBtn',
      'sourceTabs',
      'sourceDropdownBtn',
      'swapBtn',
      'targetTabs',
      'targetDropdownBtn',
      'sourceText',
      'sourceListenBtn',
      'uploadImageBtn',
      'imageUploadInput',
      'clearBtn',
      'charCount',
      'targetText',
      'targetListenBtn',
      'loadingSpinner',
      'detectedLangBadge',
      'starBtn',
      'copyBtn',
      'languageModal',
      'modalBackdrop',
      'languageSearch',
      'languageList',
      'modalCloseBtn',
      'historyDrawer',
      'drawerBackdrop',
      'historyCloseBtn',
      'historyTabAll',
      'historyTabStarred',
      'historyList',
      'clearHistoryBtn',
      'toastContainer',
      'authContainer',
      'uiLangSelect',
      'flashcardsToggleBtn',
      'flashcardsModal',
      'recordVoiceBtn',
      'voiceRecorderBar',
      'dictionaryContainer',
      'selectionSpotlight',
      'phraseSubtitle',
      'resetPhrasesBtn',
      'phraseList',
      'contextPassageCard'
    ];

    ids.forEach(id => {
      if (!this.dom[id]) {
        this.dom[id] = document.getElementById(id);
      }
    });

    if (this.dom.phraseList && typeof this.dom.phraseList.querySelectorAll === 'function') {
      const initialPhrases = Array.from(this.dom.phraseList.querySelectorAll('[data-phrase]'))
        .map(el => (el.dataset && el.dataset.phrase ? el.dataset.phrase.trim() : ''))
        .filter(Boolean);
      if (initialPhrases.length > 0) {
        this.defaultStarterPhrases = initialPhrases;
      }
    }

    // Detect pre-rendered active tab from DOM if available
    if (this.dom.targetTabs && typeof this.dom.targetTabs.querySelector === 'function') {
      const activeTab = this.dom.targetTabs.querySelector('.lang-tab.active');
      if (activeTab && activeTab.dataset && activeTab.dataset.lang) {
        this.state.targetLang = activeTab.dataset.lang;
        if (!this.targetTabs.includes(this.state.targetLang)) {
          this.targetTabs[0] = this.state.targetLang;
        } else {
          const idx = this.targetTabs.indexOf(this.state.targetLang);
          if (idx > 0) {
            this.targetTabs.splice(idx, 1);
            this.targetTabs.unshift(this.state.targetLang);
          }
        }
      }
    }
  }

  /**
   * Binds user interaction event listeners to DOM elements
   * @private
   */
  _bindEvents() {
    const d = this.dom;
    if (!d) return;

    if (d.translateBtn) {
      d.translateBtn.addEventListener('click', () => this.performTranslation());
    }
    if (d.phraseList) {
      d.phraseList.addEventListener('click', (e) => {
        const button = e.target && typeof e.target.closest === 'function'
          ? e.target.closest('[data-phrase]')
          : null;
        if (!button || !d.sourceText) return;
        const phrase = button.dataset ? button.dataset.phrase : button.getAttribute('data-phrase');
        if (!phrase) return;
        const isDynamic = button.classList && button.classList.contains('dynamic-phrase-btn');
        const phraseLang = (button.dataset && button.dataset.phraseLang) ||
          (isDynamic ? (this._activeContextLang || this._inferLanguageFromText(phrase)) : 'en');
        this._applyPhraseToSource(phrase, phraseLang);
      });
    } else if (typeof document !== 'undefined') {
      document.querySelectorAll('[data-phrase]').forEach(button => {
        button.addEventListener('click', () => {
          const phrase = button.dataset ? button.dataset.phrase : button.getAttribute('data-phrase');
          const isDynamic = button.classList && button.classList.contains('dynamic-phrase-btn');
          const phraseLang = (button.dataset && button.dataset.phraseLang) ||
            (isDynamic ? (this._activeContextLang || this._inferLanguageFromText(phrase)) : 'en');
          this._applyPhraseToSource(phrase, phraseLang);
        });
      });
    }

    if (d.resetPhrasesBtn) {
      d.resetPhrasesBtn.addEventListener('click', () => this.resetPhrasesToDefault());
    }

    if (d.sourceText) {
      d.sourceText.addEventListener('input', () => this.handleSourceInput());
      d.sourceText.addEventListener('mouseup', () => this.scheduleSelectionSpotlight('source'));
      d.sourceText.addEventListener('select', () => this.scheduleSelectionSpotlight('source'));
      d.sourceText.addEventListener('keyup', (e) => {
        if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || d.sourceText.selectionEnd > d.sourceText.selectionStart) {
          this.scheduleSelectionSpotlight('source');
        }
      });
      d.sourceText.addEventListener('keydown', (e) => {
        // Ctrl+Enter or Cmd+Enter translates immediately
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.performTranslation();
        }
      });
    }

    if (d.targetText) {
      d.targetText.addEventListener('mouseup', () => this.scheduleSelectionSpotlight('target'));
      d.targetText.addEventListener('keyup', () => this.scheduleSelectionSpotlight('target'));
    }

    if (d.clearBtn) {
      d.clearBtn.addEventListener('click', () => this.clearSource());
    }

    if (d.sourceDropdownBtn) {
      d.sourceDropdownBtn.addEventListener('click', () => this.openLanguageModal('source'));
    }
    if (d.targetDropdownBtn) {
      d.targetDropdownBtn.addEventListener('click', () => this.openLanguageModal('target'));
    }
    if (d.modalCloseBtn) {
      d.modalCloseBtn.addEventListener('click', () => this.closeLanguageModal());
    }
    if (d.modalBackdrop) {
      d.modalBackdrop.addEventListener('click', () => this.closeLanguageModal());
    }
    if (d.languageSearch) {
      d.languageSearch.addEventListener('input', (e) => this.handleModalSearch(e.target.value));
    }

    if (d.swapBtn) {
      d.swapBtn.addEventListener('click', () => this.swapLanguages());
    }

    if (d.sourceListenBtn) {
      d.sourceListenBtn.addEventListener('click', () => this.handleTts('source'));
    }
    if (d.targetListenBtn) {
      d.targetListenBtn.addEventListener('click', () => this.handleTts('target'));
    }

    if (d.copyBtn) {
      d.copyBtn.addEventListener('click', () => this.copyTranslation());
    }
    if (d.starBtn) {
      d.starBtn.addEventListener('click', () => this.toggleStarCurrent());
    }

    if (d.uploadImageBtn && d.imageUploadInput) {
      d.uploadImageBtn.addEventListener('click', () => d.imageUploadInput.click());
      d.imageUploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleImageFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    // Global Paste Image for OCR
    if (typeof window !== 'undefined') {
      window.addEventListener('paste', (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              e.preventDefault();
              this.handleImageFile(blob);
              break;
            }
          }
        }
      });
    }

    if (d.historyToggleBtn) {
      d.historyToggleBtn.addEventListener('click', () => this.toggleHistoryDrawer());
    }
    if (d.historyCloseBtn) {
      d.historyCloseBtn.addEventListener('click', () => this.closeHistoryDrawer());
    }
    if (d.drawerBackdrop) {
      d.drawerBackdrop.addEventListener('click', () => this.closeHistoryDrawer());
    }
    if (d.historyTabAll) {
      d.historyTabAll.addEventListener('click', () => this.setHistoryFilter('all'));
    }
    if (d.historyTabStarred) {
      d.historyTabStarred.addEventListener('click', () => this.setHistoryFilter('starred'));
    }
    if (d.clearHistoryBtn) {
      d.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }

    if (d.themeToggleBtn) {
      d.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.state.activePicker) {
            this.closeLanguageModal();
          } else if (this.isHistoryDrawerOpen()) {
            this.closeHistoryDrawer();
          }
        }
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || this._isInitializingAuth) return;
        const now = Date.now();
        if (now - this._lastHistoryRefreshAt < 15000) return;
        this.refreshHistory({ silent: true });
      });
    }
  }

  /**
   * Initializes optional feature modules (auth, dictionary, recorder, flashcards)
   * @private
   */
  _initFeatureModules() {
    if (typeof window === 'undefined') return;
    this._authInitPromise = null;

    if (window.LingoI18n && typeof window.LingoI18n.init === 'function') {
      try {
        const i18nInit = window.LingoI18n.init({
          selectEl: this.dom.uiLangSelect || null,
          onLocaleReady: ({ targetLang, manual } = {}) => {
            try {
              const hasSourceText = Boolean(this.dom.sourceText && this.dom.sourceText.value.trim());
              if (!manual && !hasSourceText && targetLang) {
                this.state.targetLang = targetLang;
                if (targetLang === 'en') {
                  this.state.sourceLang = 'auto';
                } else if (this.state.sourceLang === targetLang) {
                  this.state.sourceLang = 'en';
                }
                this.renderTabs();
              } else {
                this._syncTextAreaLangAttributes();
              }
            } catch (err) {
              console.warn('LingoI18n onLocaleReady error:', err);
            }
          }
        });
        if (i18nInit && typeof i18nInit.catch === 'function') {
          i18nInit.catch(err => console.warn('LingoI18n async init error:', err));
        }
        if (typeof window.LingoI18n.onChange === 'function') {
          window.LingoI18n.onChange(() => this._syncTextAreaLangAttributes());
        }
      } catch (err) {
        console.warn('LingoI18n init error:', err);
      }
    }

    if (window.LingoAuth && typeof window.LingoAuth.init === 'function' && this.dom.authContainer) {
      try {
        const authInit = window.LingoAuth.init({
          containerEl: this.dom.authContainer,
          onAuthChange: async () => {
            try {
              await this.refreshHistory({ force: true });
            } catch (err) {
              console.warn('LingoAuth onAuthChange error:', err);
            }
          }
        });
        if (authInit && typeof authInit.then === 'function') {
          this._authInitPromise = authInit.catch(err => {
            console.warn('LingoAuth async init error:', err);
            return null;
          });
        }
      } catch (err) {
        console.warn('LingoAuth init error:', err);
      }
    }

    if (window.LingoDictionary && typeof window.LingoDictionary.init === 'function' && this.dom.dictionaryContainer) {
      try {
        const dictInit = window.LingoDictionary.init({
          containerEl: this.dom.dictionaryContainer,
          onPhraseSelect: (phrase, langCode) => {
            if (!phrase || !this.dom.sourceText) return;
            const srcLang = (langCode && langCode !== 'auto')
              ? langCode
              : (this._activeContextLang || this._inferLanguageFromText(phrase));
            this._applyPhraseToSource(phrase, srcLang);
          },
          onSpeak: (text, langCode) => this.speakText(text, langCode || this._activeContextLang || 'en'),
          onEntryLoaded: (data, word, lang) => this.handleDictionaryEntryLoaded(data, word, lang),
          onClear: () => this.handleDictionaryCleared()
        });
        if (dictInit && typeof dictInit.catch === 'function') {
          dictInit.catch(err => console.warn('LingoDictionary async init error:', err));
        }
      } catch (err) {
        console.warn('LingoDictionary init error:', err);
      }
    }

    if (window.LingoRecorder && typeof window.LingoRecorder.init === 'function' && this.dom.recordVoiceBtn && this.dom.voiceRecorderBar) {
      try {
        let statusEl = this.dom.voiceRecorderBar.querySelector('.recorder-status');
        let playbackEl = this.dom.voiceRecorderBar.querySelector('.recorder-playback-container');
        if (!statusEl) {
          statusEl = document.createElement('span');
          statusEl.id = 'voiceRecorderStatus';
          statusEl.className = 'recorder-status';
          this.dom.voiceRecorderBar.appendChild(statusEl);
        }
        if (!playbackEl) {
          playbackEl = document.createElement('div');
          playbackEl.id = 'voiceRecorderPlayback';
          playbackEl.className = 'recorder-playback-container';
          this.dom.voiceRecorderBar.appendChild(playbackEl);
        }

        const recInit = window.LingoRecorder.init({
          recordBtn: this.dom.recordVoiceBtn,
          statusEl,
          playbackContainerEl: playbackEl,
          onToast: (msg) => this.showToast(msg),
          getSourceLang: () => this.state.sourceLang || 'auto',
          getSpeechLang: () => {
            const existingText = this.dom.sourceText ? this.dom.sourceText.value.trim() : '';
            const hasExplicitOrDetected =
              (this.state.sourceLang && this.state.sourceLang !== 'auto') ||
              (this.state.detectedLang && this.state.detectedLang !== 'auto') ||
              Boolean(existingText);
            const lang = hasExplicitOrDetected
              ? this._resolveSourceTtsLang(existingText)
              : ((typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'vi');
            return getBcp47Tag(lang || 'vi');
          },
          onRecordStart: () => {
            this._voiceBaseText = this.dom.sourceText ? this.dom.sourceText.value.trim() : '';
          },
          onTranscript: ({ text, isFinal } = {}) => {
            if (!this.dom.sourceText) return;
            const spoken = typeof text === 'string' ? text.trim() : '';
            const base = this._voiceBaseText || '';
            const nextValue = spoken ? (base ? base + ' ' + spoken : spoken) : base;
            this.dom.sourceText.value = nextValue.slice(0, 5000);
            if (!isFinal) {
              this.handleSourceInput();
            } else {
              this.updateCharCount();
              this.updateClearBtn();
            }
          },
          onRecordStop: ({ text } = {}) => {
            if (!this.dom.sourceText) return;
            const spoken = typeof text === 'string' ? text.trim() : '';
            if (spoken) {
              const base = this._voiceBaseText || '';
              const nextValue = base ? base + ' ' + spoken : spoken;
              this.dom.sourceText.value = nextValue.slice(0, 5000);
              clearTimeout(this.debounceTimer);
              this.updateCharCount();
              this.updateClearBtn();
              this._syncDynamicSourceFont(this.dom.sourceText.value);
              this.performTranslation();
              this._scheduleDictionaryLookup(this.dom.sourceText.value);
            }
          }
        });
        if (recInit && typeof recInit.catch === 'function') {
          recInit.catch(err => console.warn('LingoRecorder async init error:', err));
        }
      } catch (err) {
        console.warn('LingoRecorder init error:', err);
      }
    }

    if (window.LingoFlashcards && typeof window.LingoFlashcards.init === 'function' && this.dom.flashcardsToggleBtn && this.dom.flashcardsModal) {
      try {
        const fcInit = window.LingoFlashcards.init({
          openBtn: this.dom.flashcardsToggleBtn,
          modalEl: this.dom.flashcardsModal,
          getStarredItems: () => this.state.history.filter(item => Boolean(item && item.starred)),
          onUnstar: (id) => this.unstarHistoryItem(id),
          onSpeak: (text, langCode) => this.speakText(text, langCode),
          onToast: (msg) => this.showToast(msg)
        });
        if (!this._flashcardsRefreshBound && typeof this.dom.flashcardsToggleBtn.addEventListener === 'function') {
          this._flashcardsRefreshBound = true;
          this.dom.flashcardsToggleBtn.addEventListener('click', () => {
            this.refreshHistory();
          });
        }
        if (fcInit && typeof fcInit.catch === 'function') {
          fcInit.catch(err => console.warn('LingoFlashcards async init error:', err));
        }
      } catch (err) {
        console.warn('LingoFlashcards init error:', err);
      }
    }
  }


  loadTheme() {
    let saved = null;
    if (this.storage) {
      try {
        saved = this.storage.getItem(STORAGE_KEYS.THEME);
      } catch (_) {}
    }

    if (!saved && typeof window !== 'undefined' && window.matchMedia) {
      saved = 'dark';
    }

    const theme = saved === 'dark' ? 'dark' : 'light';
    this.applyTheme(theme);
  }

  applyTheme(theme) {
    this.state.theme = theme;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEYS.THEME, theme);
      } catch (_) {}
    }
  }

  toggleTheme() {
    const next = this.state.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
  }


  _getResponseContentType(response) {
    try {
      if (response && response.headers && typeof response.headers.get === 'function') {
        return String(response.headers.get('content-type') || '').toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _fetchHistoryWithRetry(url, fetchOptions = {}) {
    const retryDelays = Array.isArray(this.historyRetryDelays) ? this.historyRetryDelays : [500, 1200];
    const mergedOptions = {
      credentials: 'same-origin',
      cache: 'no-store',
      ...fetchOptions
    };

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const response = await fetch(url, mergedOptions);
        if (response && response.status === 503 && attempt < retryDelays.length) {
          await this._sleep(retryDelays[attempt]);
          continue;
        }
        return response;
      } catch (error) {
        if (attempt < retryDelays.length) {
          await this._sleep(retryDelays[attempt]);
          continue;
        }
        throw error;
      }
    }
  }

  async loadHistory(options = {}) {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    const silent = Boolean(options && options.silent);
    this._lastHistoryRefreshAt = Date.now();

    try {
      await this.historySaveQueue.catch(() => false);
      const response = await this._fetchHistoryWithRetry(HISTORY_API_URL, {
        method: 'GET'
      });
      const contentType = this._getResponseContentType(response);
      if (!response.ok || !contentType.includes('application/json')) {
        console.warn(`History service unavailable (${response.status}); using in-memory session.`);
        if (!silent) {
          this.showToast('Không tải được lịch sử từ MySQL. Các tính năng dịch vẫn hoạt động bình thường.');
        }
        return;
      }

      const remote = await response.json().catch(() => null);
      if (!Array.isArray(remote)) {
        console.warn('Invalid history payload; keeping current session history.');
        return;
      }
      this.state.history = remote;
      this._lastHistoryRefreshAt = Date.now();

      // Move data saved by older versions to MySQL before deleting the old key.
      let raw = null;
      try {
        raw = this.storage && this.storage.getItem(STORAGE_KEYS.HISTORY);
      } catch (_) {}
      if (raw) {
        let old = [];
        try { old = JSON.parse(raw); } catch (_) {}
        if (Array.isArray(old)) {
          const ids = new Set(remote.map(item => item.id));
          const toMerge = old
            .filter(item =>
              item &&
              typeof item.id === 'string' &&
              item.id.trim() &&
              typeof item.sourceText === 'string' &&
              typeof item.targetText === 'string' &&
              !ids.has(item.id)
            )
            .map(item => ({
              id: item.id.trim().slice(0, 64),
              sourceLang: typeof item.sourceLang === 'string' && item.sourceLang ? item.sourceLang.slice(0, 12) : 'auto',
              targetLang: typeof item.targetLang === 'string' && item.targetLang ? item.targetLang.slice(0, 12) : 'vi',
              sourceText: item.sourceText.slice(0, 5000),
              targetText: item.targetText.slice(0, 20000),
              starred: Boolean(item.starred),
              timestamp: Number.isFinite(Number(item.timestamp)) && Number(item.timestamp) >= 0
                ? Math.trunc(Number(item.timestamp))
                : Date.now()
            }))
            .slice(0, 50);

          this.state.history = [...remote, ...toMerge]
            .sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);

          const saved = toMerge.length > 0
            ? await this._postHistoryAction({ action: 'merge', items: toMerge })
            : true;
          if (saved && this.storage) {
            try { this.storage.removeItem(STORAGE_KEYS.HISTORY); } catch (_) {}
          }
        }
      }
    } catch (error) {
      console.warn('History load failed:', error);
      if (!silent) {
        this.showToast('Không tải được lịch sử từ MySQL. Kiểm tra kết nối database.');
      }
    }
  }

  refreshHistory(options = {}) {
    const force = Boolean(options && options.force);
    const silent = Boolean(options && options.silent);
    if (!force && this._historyLoadPromise) {
      return this._historyLoadPromise;
    }

    let wrappedPromise = null;
    const run = (async () => {
      if (force && this._historyLoadPromise && this._historyLoadPromise !== wrappedPromise) {
        try { await this._historyLoadPromise; } catch (_) {}
      }
      await this.loadHistory({ silent });
      this.renderHistoryList();
      this.updateStarBtnState();
      this._refreshFlashcards();
    })();

    wrappedPromise = run.finally(() => {
      if (this._historyLoadPromise === wrappedPromise) {
        this._historyLoadPromise = null;
      }
    });
    this._historyLoadPromise = wrappedPromise;

    return this._historyLoadPromise;
  }

  async _putHistorySnapshot() {
    const snapshot = JSON.stringify(this.state.history);
    const response = await this._fetchHistoryWithRetry(HISTORY_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot
    });
    const contentType = this._getResponseContentType(response);
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error(`Cannot save history (${response ? response.status : 'unknown'})`);
    }
    await response.json().catch(() => null);
    return true;
  }

  _postHistoryAction(payload) {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve(false);
    const body = JSON.stringify(payload);
    const nextSave = this.historySaveQueue.catch(() => false).then(async () => {
      const response = await this._fetchHistoryWithRetry(HISTORY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (response && response.status === 405) {
        return this._putHistorySnapshot();
      }
      const contentType = this._getResponseContentType(response);
      if (!response.ok || !contentType.includes('application/json')) {
        throw new Error(`Cannot save history (${response ? response.status : 'unknown'})`);
      }
      await response.json().catch(() => null);
      return true;
    }).catch(error => {
      console.warn('History save failed:', error);
      this.showToast('Không lưu được lịch sử vào MySQL.');
      return false;
    });
    this.historySaveQueue = nextSave;
    return nextSave;
  }

  saveHistory() {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve(false);
    const nextSave = this.historySaveQueue.catch(() => false).then(() => this._putHistorySnapshot()).catch(error => {
      console.warn('History save failed:', error);
      this.showToast('Không lưu được lịch sử vào MySQL.');
      return false;
    });
    this.historySaveQueue = nextSave;
    return nextSave;
  }

  /**
   * Adds or updates a translation entry in history (max 50 items)
   * @param {Object} item
   */
  addToHistory(item) {
    if (!item || !item.sourceText || !item.targetText) return;
    const sText = item.sourceText.trim();
    const tText = item.targetText.trim();
    if (!sText || !tText) return;

    // Deduplicate: check if identical translation pair exists
    const existingIndex = this.state.history.findIndex(
      h => h.sourceText.trim() === sText &&
           h.sourceLang === item.sourceLang &&
           h.targetLang === item.targetLang
    );

    let starred = Boolean(item.starred);
    if (existingIndex !== -1) {
      // Preserve starred status if it was previously starred
      starred = starred || Boolean(this.state.history[existingIndex].starred);
      this.state.history.splice(existingIndex, 1);
    }

    const newRecord = {
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      sourceLang: item.sourceLang,
      targetLang: item.targetLang,
      sourceText: sText,
      targetText: tText,
      starred,
      timestamp: Date.now()
    };

    this.state.history.unshift(newRecord);

    // Limit to 50 items
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(0, 50);
    }

    this._postHistoryAction({ action: 'upsert', item: newRecord });
    if (this.isHistoryDrawerOpen()) {
      this.renderHistoryList();
    }
    this.updateStarBtnState();
    this._refreshFlashcards();
    return newRecord;
  }

  _refreshFlashcards() {
    if (typeof window !== 'undefined' && window.LingoFlashcards && typeof window.LingoFlashcards.refresh === 'function') {
      try {
        window.LingoFlashcards.refresh();
      } catch (_) {}
    }
  }

  isHistoryDrawerOpen() {
    const d = this.dom.historyDrawer;
    return d ? (d.classList.contains('open') || d.getAttribute('aria-hidden') === 'false') : false;
  }

  toggleHistoryDrawer() {
    if (this.isHistoryDrawerOpen()) {
      this.closeHistoryDrawer();
    } else {
      this.openHistoryDrawer();
    }
  }

  openHistoryDrawer() {
    const d = this.dom;
    if (d.historyDrawer) {
      d.historyDrawer.classList.add('open');
      d.historyDrawer.setAttribute('aria-hidden', 'false');
    }
    if (d.historyToggleBtn) {
      d.historyToggleBtn.classList.add('active');
    }
    this.renderHistoryList();
    this.refreshHistory();
  }

  closeHistoryDrawer() {
    const d = this.dom;
    if (d.historyDrawer) {
      d.historyDrawer.classList.remove('open');
      d.historyDrawer.setAttribute('aria-hidden', 'true');
    }
    if (d.historyToggleBtn) {
      d.historyToggleBtn.classList.remove('active');
    }
  }

  setHistoryFilter(filter) {
    this.state.historyFilter = filter === 'starred' ? 'starred' : 'all';
    const d = this.dom;
    if (d.historyTabAll) {
      d.historyTabAll.classList.toggle('active', this.state.historyFilter === 'all');
      d.historyTabAll.setAttribute('aria-selected', this.state.historyFilter === 'all' ? 'true' : 'false');
    }
    if (d.historyTabStarred) {
      d.historyTabStarred.classList.toggle('active', this.state.historyFilter === 'starred');
      d.historyTabStarred.setAttribute('aria-selected', this.state.historyFilter === 'starred' ? 'true' : 'false');
    }
    this.renderHistoryList();
  }

  renderHistoryList() {
    const container = this.dom.historyList;
    if (!container) return;

    container.innerHTML = '';

    const filter = this.state.historyFilter;
    const items = filter === 'starred'
      ? this.state.history.filter(h => h.starred)
      : this.state.history;

    if (items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'history-empty';
      emptyDiv.innerHTML = `
        <svg class="history-empty-icon" viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
          <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
        </svg>
        <span>${filter === 'starred' ? 'Chưa có bản dịch nào được gắn sao' : 'Chưa có lịch sử dịch'}</span>
      `;
      container.appendChild(emptyDiv);
      return;
    }

    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'history-item';
      card.setAttribute('role', 'article');
      card.setAttribute('tabindex', '0');
      card.dataset.id = item.id;

      const sourceLangName = (getLanguageByCode && getLanguageByCode(item.sourceLang)?.name) || item.sourceLang;
      const targetLangName = (getLanguageByCode && getLanguageByCode(item.targetLang)?.name) || item.targetLang;

      card.innerHTML = `
        <div class="history-header">
          <span class="history-lang-pair">${escapeHtml(sourceLangName)} → ${escapeHtml(targetLangName)}</span>
          <div class="history-actions">
            <button type="button" class="icon-btn star-btn ${item.starred ? 'active' : ''}" data-action="star" title="${item.starred ? 'Bỏ lưu' : 'Lưu bản dịch'}" aria-label="${item.starred ? 'Bỏ lưu' : 'Lưu bản dịch'}">
              <svg class="star-icon-outline" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28M12 15.4z"/>
              </svg>
              <svg class="star-icon-filled hidden" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            </button>
            <button type="button" class="icon-btn delete-btn" data-action="delete" title="Xóa" aria-label="Xóa khỏi lịch sử">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="history-source">${escapeHtml(item.sourceText)}</div>
        <div class="history-target">${escapeHtml(item.targetText)}</div>
      `;

      // Event delegation inside card
      card.addEventListener('click', (e) => {
        const starBtn = e.target.closest('[data-action="star"]');
        const deleteBtn = e.target.closest('[data-action="delete"]');

        if (starBtn) {
          e.stopPropagation();
          this.toggleHistoryItemStar(item.id);
        } else if (deleteBtn) {
          e.stopPropagation();
          this.deleteHistoryItem(item.id);
        } else {
          this.loadHistoryItem(item);
        }
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (!e.target.closest('button')) {
            e.preventDefault();
            this.loadHistoryItem(item);
          }
        }
      });

      container.appendChild(card);
    });
  }

  toggleHistoryItemStar(id) {
    const item = this.state.history.find(h => h.id === id);
    if (!item) return;
    item.starred = !item.starred;
    this._postHistoryAction({ action: 'star', id: item.id, starred: item.starred });
    this.renderHistoryList();
    this.updateStarBtnState();
    this._refreshFlashcards();
    this.showToast(item.starred ? 'Đã lưu bản dịch' : 'Đã xóa khỏi danh sách đã lưu');
  }

  unstarHistoryItem(id) {
    const item = this.state.history.find(h => h.id === id);
    if (!item || !item.starred) return;
    item.starred = false;
    const pending = this._postHistoryAction({ action: 'star', id: item.id, starred: false });
    this.renderHistoryList();
    this.updateStarBtnState();
    this.showToast('Đã xóa khỏi danh sách đã lưu');
    return pending;
  }

  deleteHistoryItem(id) {
    this.state.history = this.state.history.filter(h => h.id !== id);
    this._postHistoryAction({ action: 'delete', id });
    this.renderHistoryList();
    this.updateStarBtnState();
    this._refreshFlashcards();
  }

  clearHistory() {
    if (typeof window !== 'undefined' && window.confirm) {
      const ok = window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử dịch không?');
      if (!ok) return;
    }

    this.state.history = [];
    this._postHistoryAction({ action: 'clear' });
    this.renderHistoryList();
    this.updateStarBtnState();
    this._refreshFlashcards();
    this.showToast('Đã xóa toàn bộ lịch sử');
  }

  loadHistoryItem(item) {
    this._stopSpeakingUI();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.translationService && typeof this.translationService.abort === 'function') {
      this.translationService.abort();
    }

    this.setSourceLang(item.sourceLang, false);
    this.setTargetLang(item.targetLang, false);
    this.state.detectedLang = '';
    this._syncTextAreaLangAttributes();

    if (this.dom.detectedLangBadge) {
      this.dom.detectedLangBadge.classList.add('hidden');
    }

    if (this.dom.loadingSpinner) {
      this.dom.loadingSpinner.classList.add('hidden');
    }

    if (this.dom.sourceText) {
      this.dom.sourceText.value = item.sourceText;
    }
    if (this.dom.targetText) {
      this.dom.targetText.textContent = item.targetText;
    }

    this.updateCharCount();
    this.updateClearBtn();
    this.updateStarBtnState();
    this.closeHistoryDrawer();
  }


  isCurrentTranslationStarred() {
    const sText = this.dom.sourceText ? this.dom.sourceText.value.trim() : '';
    const tText = this.dom.targetText ? this.dom.targetText.textContent.trim() : '';
    if (!sText || !tText) return false;

    const match = this.state.history.find(
      h => h.sourceText.trim() === sText &&
           h.targetText.trim() === tText &&
           h.sourceLang === this.state.sourceLang &&
           h.targetLang === this.state.targetLang
    );

    return Boolean(match && match.starred);
  }

  updateStarBtnState() {
    const starBtn = this.dom.starBtn;
    if (!starBtn) return;
    const isStarred = this.isCurrentTranslationStarred();
    starBtn.classList.toggle('active', isStarred);
    starBtn.title = isStarred ? 'Bỏ lưu bản dịch' : 'Lưu bản dịch';
    starBtn.setAttribute('aria-label', starBtn.title);
  }

  toggleStarCurrent() {
    const sText = this.dom.sourceText ? this.dom.sourceText.value.trim() : '';
    const tText = this.dom.targetText ? this.dom.targetText.textContent.trim() : '';
    if (!sText || !tText) return;

    let match = this.state.history.find(
      h => h.sourceText.trim() === sText &&
           h.targetText.trim() === tText &&
           h.sourceLang === this.state.sourceLang &&
           h.targetLang === this.state.targetLang
    );

    let created = false;
    if (match) {
      match.starred = !match.starred;
    } else {
      created = true;
      match = {
        id: 'h_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        sourceLang: this.state.sourceLang,
        targetLang: this.state.targetLang,
        sourceText: sText,
        targetText: tText,
        starred: true,
        timestamp: Date.now()
      };
      this.state.history.unshift(match);
      if (this.state.history.length > 50) {
        this.state.history = this.state.history.slice(0, 50);
      }
    }

    if (created) {
      this._postHistoryAction({ action: 'upsert', item: match });
    } else {
      this._postHistoryAction({ action: 'star', id: match.id, starred: match.starred });
    }
    this.updateStarBtnState();
    if (this.isHistoryDrawerOpen()) {
      this.renderHistoryList();
    }
    this._refreshFlashcards();
    this.showToast(match.starred ? 'Đã lưu bản dịch' : 'Đã xóa khỏi danh sách đã lưu');
  }


  renderTabs() {
    this._renderSourceTabs();
    this._renderTargetTabs();
    this._syncTextAreaLangAttributes();
  }

  _syncTextAreaLangAttributes() {
    const docLang = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang)
      ? document.documentElement.lang
      : 'vi';
    const activeSourceLang = this.state.sourceLang === 'auto'
      ? (this.state.detectedLang || docLang)
      : (this.state.sourceLang || docLang);
    const activeTargetLang = this.state.targetLang || docLang;

    if (this.dom.sourceText) {
      this.dom.sourceText.lang = activeSourceLang;
    }
    if (this.dom.targetText) {
      this.dom.targetText.lang = activeTargetLang;
    }

    const i18n = typeof window !== 'undefined' ? window.LingoI18n : null;
    if (i18n && typeof i18n.ensureFont === 'function') {
      i18n.ensureFont(activeSourceLang);
      i18n.ensureFont(activeTargetLang);
    }
  }

  _renderSourceTabs() {
    const container = this.dom.sourceTabs;
    if (!container) return;

    // Ensure currently selected sourceLang is part of the tabs
    if (!this.sourceTabs.includes(this.state.sourceLang)) {
      this.sourceTabs[this.sourceTabs.length - 1] = this.state.sourceLang;
    }

    container.innerHTML = '';
    this.sourceTabs.forEach(code => {
      const lang = getLanguageByCode ? getLanguageByCode(code) : null;
      const name = lang ? lang.name : (code === 'auto' ? 'Phát hiện ngôn ngữ' : code);
      const isActive = this.state.sourceLang === code;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `lang-tab ${isActive ? 'active' : ''}`;
      btn.dataset.lang = code;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.textContent = name;

      btn.addEventListener('click', () => {
        this.setSourceLang(code);
      });

      container.appendChild(btn);
    });
  }

  _renderTargetTabs() {
    const container = this.dom.targetTabs;
    if (!container) return;

    // Ensure currently selected targetLang is part of the tabs
    if (!this.targetTabs.includes(this.state.targetLang)) {
      this.targetTabs[this.targetTabs.length - 1] = this.state.targetLang;
    }

    container.innerHTML = '';
    this.targetTabs.forEach(code => {
      const lang = getLanguageByCode ? getLanguageByCode(code) : null;
      const name = lang ? lang.name : code;
      const isActive = this.state.targetLang === code;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `lang-tab ${isActive ? 'active' : ''}`;
      btn.dataset.lang = code;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.textContent = name;

      btn.addEventListener('click', () => {
        this.setTargetLang(code);
      });

      container.appendChild(btn);
    });
  }

  setSourceLang(code, triggerTranslate = true) {
    if (this.state.sourceLang === code) return;
    this.state.sourceLang = code;
    this.state.detectedLang = '';

    if (this.dom.detectedLangBadge && code !== 'auto') {
      this.dom.detectedLangBadge.classList.add('hidden');
    }

    this._renderSourceTabs();
    this._syncTextAreaLangAttributes();

    if (this.dom.sourceText && this.dom.sourceText.value.trim()) {
      this._scheduleDictionaryLookup(this.dom.sourceText.value.trim());
    } else {
      this._clearDictionaryLookup();
    }

    if (triggerTranslate && this.dom.sourceText && this.dom.sourceText.value.trim()) {
      this.performTranslation();
    }
  }

  setTargetLang(code, triggerTranslate = true) {
    if (code === 'auto') return; // Target can never be 'auto'
    if (this.state.targetLang === code) return;
    this.state.targetLang = code;

    this._renderTargetTabs();
    this._syncTextAreaLangAttributes();

    if (triggerTranslate && this.dom.sourceText && this.dom.sourceText.value.trim()) {
      this.performTranslation();
    }
  }


  openLanguageModal(pickerType) {
    this.state.activePicker = pickerType; // 'source' or 'target'
    const d = this.dom;

    if (d.languageModal) {
      d.languageModal.classList.remove('hidden');
      d.languageModal.removeAttribute('hidden');
      d.languageModal.setAttribute('aria-hidden', 'false');
    }

    if (d.languageSearch) {
      d.languageSearch.value = '';
      d.languageSearch.placeholder = pickerType === 'source' ? 'Tìm kiếm ngôn ngữ nguồn...' : 'Tìm kiếm ngôn ngữ đích...';
      d.languageSearch.focus();
    }

    this.renderModalLanguages('');
  }

  closeLanguageModal() {
    this.state.activePicker = null;
    const d = this.dom;
    if (d.languageModal) {
      d.languageModal.classList.add('hidden');
      d.languageModal.setAttribute('hidden', '');
      d.languageModal.setAttribute('aria-hidden', 'true');
    }
  }

  handleModalSearch(query) {
    this.renderModalLanguages(query);
  }

  renderModalLanguages(query) {
    const listContainer = this.dom.languageList;
    if (!listContainer || !SUPPORTED_LANGUAGES) return;

    listContainer.innerHTML = '';
    const isTarget = this.state.activePicker === 'target';
    const activeLangCode = isTarget ? this.state.targetLang : this.state.sourceLang;

    const filtered = filterLanguages(SUPPORTED_LANGUAGES, query, isTarget);

    if (filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.gridColumn = '1 / -1';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.padding = '32px 16px';
      emptyDiv.style.color = 'var(--text-tertiary)';
      emptyDiv.textContent = 'Không tìm thấy ngôn ngữ phù hợp';
      listContainer.appendChild(emptyDiv);
      return;
    }

    filtered.forEach(lang => {
      const isSelected = lang.code === activeLangCode;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `language-item ${isSelected ? 'selected' : ''}`;
      btn.dataset.code = lang.code;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      btn.innerHTML = `
        <span class="language-name">${escapeHtml(lang.name)}</span>
        <span class="language-native">${escapeHtml(lang.nativeName)}</span>
      `;

      btn.addEventListener('click', () => {
        this.selectModalLanguage(lang.code);
      });

      listContainer.appendChild(btn);
    });
  }

  selectModalLanguage(code) {
    if (this.state.activePicker === 'source') {
      this.setSourceLang(code);
    } else if (this.state.activePicker === 'target') {
      this.setTargetLang(code);
    }
    this.closeLanguageModal();
  }


  swapLanguages() {
    this._stopSpeakingUI();
    const swapBtn = this.dom.swapBtn;
    if (swapBtn) {
      swapBtn.style.transform = 'rotate(180deg)';
      setTimeout(() => {
        swapBtn.style.transform = '';
      }, 300);
    }

    // Determine target when source is 'auto'
    let newSource = this.state.targetLang;
    let newTarget;

    if (this.state.sourceLang === 'auto') {
      newTarget = this.state.detectedLang || (this.state.targetLang === 'en' ? 'vi' : 'en');
    } else {
      newTarget = this.state.sourceLang;
    }

    if (newTarget === newSource) {
      newTarget = newSource === 'vi' ? 'en' : 'vi';
    }

    const currentSourceText = this.dom.sourceText ? this.dom.sourceText.value : '';
    const currentTargetText = this.dom.targetText ? this.dom.targetText.textContent : '';

    // Swap languages
    this.state.sourceLang = newSource;
    this.state.targetLang = newTarget;
    this.state.detectedLang = '';

    if (this.dom.detectedLangBadge) {
      this.dom.detectedLangBadge.classList.add('hidden');
    }

    // Swap texts
    if (this.dom.sourceText) {
      this.dom.sourceText.value = currentTargetText.trim();
    }
    if (this.dom.targetText) {
      this.dom.targetText.textContent = '';
    }

    this.renderTabs();
    this.updateCharCount();
    this.updateClearBtn();

    if (this.dom.sourceText && this.dom.sourceText.value.trim()) {
      this._scheduleDictionaryLookup(this.dom.sourceText.value.trim());
    } else {
      this._clearDictionaryLookup();
    }

    // Trigger immediate translation if there is source text
    if (this.dom.sourceText && this.dom.sourceText.value.trim()) {
      this.performTranslation();
    }
  }


  handleSourceInput() {
    const text = this.dom.sourceText ? this.dom.sourceText.value : '';

    // Truncate if exceeding 5000 characters
    if (text.length > 5000) {
      this.dom.sourceText.value = text.slice(0, 5000);
    }

    this.updateCharCount();
    this.updateClearBtn();

    if (this.state.sourceLang === 'auto') {
      this.state.detectedLang = '';
    }

    if (!this.dom.sourceText.value.trim()) {
      this.hideSelectionSpotlight();
      this._clearDictionaryLookup();
      this.resetPhrasesToDefault();
      this.clearTarget();
      return;
    }

    this._scheduleDictionaryLookup(this.dom.sourceText.value.trim());

    // Debounce translation
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performTranslation();
    }, this.debounceDelay);
  }

  _getSelectionContext(origin) {
    const d = this.dom;
    if (!d) return null;

    let selected = '';
    let fullText = '';
    let fromLang = 'auto';
    let toLang = this.state.targetLang || 'vi';

    if (origin === 'source') {
      if (!d.sourceText) return null;
      const start = d.sourceText.selectionStart;
      const end = d.sourceText.selectionEnd;
      if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return null;
      fullText = String(d.sourceText.value || '').trim();
      selected = String(d.sourceText.value || '').slice(start, end).trim();
      fromLang = this.state.sourceLang === 'auto'
        ? (this.state.detectedLang || 'auto')
        : this.state.sourceLang;
      toLang = this.state.targetLang || 'vi';
      if (fromLang !== 'auto' && fromLang === toLang) {
        toLang = fromLang === 'en' ? 'vi' : 'en';
      }
    } else if (origin === 'target') {
      if (!d.targetText || typeof window === 'undefined' || typeof window.getSelection !== 'function') {
        return null;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!range || !d.targetText.contains(range.commonAncestorContainer)) return null;
      fullText = String(d.targetText.textContent || '').trim();
      selected = String(sel.toString() || '').trim();
      fromLang = this.state.targetLang || 'vi';
      if (this.state.sourceLang && this.state.sourceLang !== 'auto') {
        toLang = this.state.sourceLang;
      } else if (this.state.detectedLang && this.state.detectedLang !== 'auto') {
        toLang = this.state.detectedLang;
      } else {
        toLang = fromLang === 'en' ? 'vi' : 'en';
      }
      if (toLang === fromLang) {
        toLang = fromLang === 'en' ? 'vi' : 'en';
      }
    } else {
      return null;
    }

    if (!selected || selected.length > 60) return null;
    const selectedWords = selected.split(/\s+/).filter(Boolean);
    if (selectedWords.length > 4) return null;

    const fullWords = fullText.split(/\s+/).filter(Boolean);
    if (selected.toLowerCase() === fullText.toLowerCase() && fullWords.length <= 1) {
      return null;
    }

    return {
      origin,
      selected,
      fromLang,
      toLang
    };
  }

  scheduleSelectionSpotlight(origin = 'source') {
    const ctx = this._getSelectionContext(origin);
    if (!ctx) {
      if (origin === 'target' && this.dom && this.dom.targetText && typeof window !== 'undefined' && typeof window.getSelection === 'function') {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (range && this.dom.targetText.contains(range.commonAncestorContainer)) {
            const selected = String(sel.toString() || '').trim();
            if (this._isLookupCandidate(selected)) {
              const targetLang = this.state.targetLang || this._inferLanguageFromText(selected);
              this._lookupWordImmediate(selected, targetLang);
            }
          }
        }
      }
      return;
    }

    const spotlightEl = this.dom.selectionSpotlight;
    const isSpotlightVisible = spotlightEl && !spotlightEl.classList.contains('hidden') && !spotlightEl.hasAttribute('hidden');
    if (
      isSpotlightVisible &&
      this.spotlightData &&
      this.spotlightData.selected === ctx.selected &&
      this.spotlightData.fromLang === ctx.fromLang &&
      this.spotlightData.toLang === ctx.toLang
    ) {
      return;
    }

    if (this.spotlightDebounceTimer) {
      clearTimeout(this.spotlightDebounceTimer);
    }

    this.spotlightDebounceTimer = setTimeout(() => {
      this._runSelectionSpotlight(ctx);
    }, 180);
  }

  async _runSelectionSpotlight(ctx) {
    const spotlightEl = this.dom.selectionSpotlight;
    const translator = this.selectionTranslationService || this.translationService;
    if (!spotlightEl || !translator || !ctx || !ctx.selected) return;

    const seq = ++this.spotlightSeq;
    const { selected, fromLang, toLang } = ctx;
    const isLookupCandidate = this._isLookupCandidate(selected);
    let immediateLookupTriggered = false;

    if (isLookupCandidate) {
      if (fromLang && fromLang !== 'auto') {
        immediateLookupTriggered = true;
        this._lookupWordImmediate(selected, fromLang);
      } else {
        const inferred = this._inferLanguageFromText(selected);
        if (inferred && inferred !== 'en') {
          immediateLookupTriggered = true;
          this._lookupWordImmediate(selected, inferred);
        }
      }
    }

    this.spotlightData = {
      selected,
      translated: '',
      fromLang,
      toLang
    };

    spotlightEl.innerHTML =
      '<div class="spotlight-inner spotlight-loading">' +
        '<span class="spotlight-badge">Đang chọn</span>' +
        '<span class="spotlight-word">' + escapeHtml(selected) + '</span>' +
        '<span class="spotlight-arrow" aria-hidden="true">→</span>' +
        '<span class="spotlight-status">Đang dịch...</span>' +
        '<button type="button" class="icon-btn spotlight-close-btn" data-spotlight-action="close" title="Đóng" aria-label="Đóng dịch nhanh">×</button>' +
      '</div>';
    spotlightEl.classList.remove('hidden');
    spotlightEl.removeAttribute('hidden');
    this._bindSpotlightCloseOnly(spotlightEl);

    try {
      const result = await translator.translate(selected, fromLang, toLang);
      if (seq !== this.spotlightSeq) return;

      const translated = (result && result.translatedText ? String(result.translatedText) : '').trim();
      if (!translated) {
        if (isLookupCandidate && !immediateLookupTriggered) {
          const fallbackLang = (fromLang && fromLang !== 'auto') ? fromLang : this._inferLanguageFromText(selected);
          this._lookupWordImmediate(selected, fallbackLang);
        }
        this.hideSelectionSpotlight();
        return;
      }

      let resolvedFromLang = fromLang;
      if (!resolvedFromLang || resolvedFromLang === 'auto') {
        resolvedFromLang = (result && result.detectedLang) || this._inferLanguageFromText(selected);
      }

      this.spotlightData = {
        selected,
        translated,
        fromLang: resolvedFromLang,
        toLang
      };

      this._renderSelectionSpotlight(this.spotlightData);

      if (isLookupCandidate && !immediateLookupTriggered) {
        this._lookupWordImmediate(selected, resolvedFromLang);
      }
    } catch (err) {
      if (seq !== this.spotlightSeq) return;
      if (err && (err.name === 'AbortError' || err.message === 'The user aborted a request.')) {
        return;
      }
      if (isLookupCandidate && !immediateLookupTriggered) {
        const fallbackLang = (fromLang && fromLang !== 'auto') ? fromLang : this._inferLanguageFromText(selected);
        this._lookupWordImmediate(selected, fallbackLang);
      }
      console.warn('Selection spotlight translation error:', err);
      spotlightEl.innerHTML =
        '<div class="spotlight-inner spotlight-error">' +
          '<span class="spotlight-badge">Đang chọn</span>' +
          '<span class="spotlight-word">' + escapeHtml(selected) + '</span>' +
          '<span class="spotlight-status">Không thể dịch nhanh từ này.</span>' +
          '<button type="button" class="icon-btn spotlight-close-btn" data-spotlight-action="close" title="Đóng" aria-label="Đóng dịch nhanh">×</button>' +
        '</div>';
      this._bindSpotlightCloseOnly(spotlightEl);
    }
  }

  _bindSpotlightCloseOnly(spotlightEl) {
    const closeBtn = spotlightEl.querySelector('[data-spotlight-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideSelectionSpotlight());
    }
  }

  _renderSelectionSpotlight(data) {
    const spotlightEl = this.dom.selectionSpotlight;
    if (!spotlightEl || !data) return;

    const { selected, translated, fromLang, toLang } = data;
    const isAlreadyStarred = this.state.history.some(h =>
      h.starred &&
      h.sourceText.trim().toLowerCase() === selected.trim().toLowerCase() &&
      h.targetText.trim().toLowerCase() === translated.trim().toLowerCase()
    );

    const speakerSvg =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
        '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
      '</svg>';

    spotlightEl.innerHTML =
      '<div class="spotlight-inner">' +
        '<div class="spotlight-pair">' +
          '<span class="spotlight-badge">Đang chọn</span>' +
          '<span class="spotlight-term">' +
            '<strong class="spotlight-word">' + escapeHtml(selected) + '</strong>' +
            '<button type="button" class="icon-btn spotlight-speak-btn" data-spotlight-speak="source" title="Nghe từ đang chọn" aria-label="Nghe từ đang chọn">' + speakerSvg + '</button>' +
          '</span>' +
          '<span class="spotlight-arrow" aria-hidden="true">→</span>' +
          '<span class="spotlight-term">' +
            '<span class="spotlight-translation">' + escapeHtml(translated) + '</span>' +
            '<button type="button" class="icon-btn spotlight-speak-btn" data-spotlight-speak="target" title="Nghe nghĩa" aria-label="Nghe nghĩa">' + speakerSvg + '</button>' +
          '</span>' +
        '</div>' +
        '<div class="spotlight-actions">' +
          '<button type="button" class="spotlight-action-btn spotlight-save-btn' + (isAlreadyStarred ? ' saved' : '') + '" data-spotlight-action="save">' + (isAlreadyStarred ? '★ Đã lưu' : '☆ Lưu từ') + '</button>' +
          '<button type="button" class="spotlight-action-btn spotlight-solo-btn" data-spotlight-action="solo">Dịch riêng</button>' +
          '<button type="button" class="icon-btn spotlight-close-btn" data-spotlight-action="close" title="Đóng" aria-label="Đóng dịch nhanh">×</button>' +
        '</div>' +
      '</div>';

    spotlightEl.classList.remove('hidden');
    spotlightEl.removeAttribute('hidden');

    const speakSrcBtn = spotlightEl.querySelector('[data-spotlight-speak="source"]');
    if (speakSrcBtn) {
      speakSrcBtn.addEventListener('click', () => this.speakText(selected, fromLang, speakSrcBtn));
    }

    const speakTgtBtn = spotlightEl.querySelector('[data-spotlight-speak="target"]');
    if (speakTgtBtn) {
      speakTgtBtn.addEventListener('click', () => this.speakText(translated, toLang, speakTgtBtn));
    }

    const saveBtn = spotlightEl.querySelector('[data-spotlight-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.addToHistory({
          sourceLang: fromLang || 'auto',
          targetLang: toLang || 'vi',
          sourceText: selected,
          targetText: translated,
          starred: true
        });
        saveBtn.classList.add('saved');
        saveBtn.textContent = '★ Đã lưu';
        this.showToast('Đã lưu từ vào lịch sử & Flashcards');
      });
    }

    const soloBtn = spotlightEl.querySelector('[data-spotlight-action="solo"]');
    if (soloBtn) {
      soloBtn.addEventListener('click', () => {
        if (!this.dom.sourceText) return;
        this.state.sourceLang = fromLang || 'auto';
        this.state.targetLang = toLang && toLang !== 'auto' ? toLang : 'vi';
        this.state.detectedLang = '';
        this.renderTabs();
        this.dom.sourceText.value = selected;
        this.hideSelectionSpotlight();
        this.handleSourceInput();
        this.performTranslation();
      });
    }

    this._bindSpotlightCloseOnly(spotlightEl);
  }

  hideSelectionSpotlight() {
    if (this.spotlightDebounceTimer) {
      clearTimeout(this.spotlightDebounceTimer);
      this.spotlightDebounceTimer = null;
    }
    this.spotlightSeq += 1;
    this.spotlightData = null;

    if (
      this.selectionTranslationService &&
      this.selectionTranslationService !== this.translationService &&
      typeof this.selectionTranslationService.abort === 'function'
    ) {
      this.selectionTranslationService.abort();
    }

    const spotlightEl = this.dom.selectionSpotlight;
    if (spotlightEl) {
      spotlightEl.classList.add('hidden');
      spotlightEl.setAttribute('hidden', '');
      spotlightEl.innerHTML = '';
    }
  }

  _resolveOppositeLang(srcLang) {
    const cleanSrc = (srcLang && srcLang !== 'auto') ? String(srcLang).trim() : 'en';
    const currentTarget = this.state.targetLang;
    if (currentTarget && currentTarget !== 'auto' && currentTarget !== cleanSrc) {
      return currentTarget;
    }
    if (this.state.sourceLang && this.state.sourceLang !== 'auto' && this.state.sourceLang !== cleanSrc) {
      return this.state.sourceLang;
    }
    if (this.state.detectedLang && this.state.detectedLang !== 'auto' && this.state.detectedLang !== cleanSrc) {
      return this.state.detectedLang;
    }
    return cleanSrc === 'en' ? 'vi' : 'en';
  }

  _applyPhraseToSource(phrase, srcLang) {
    if (!phrase || !this.dom.sourceText) return;
    const nextSource = (srcLang && srcLang !== 'auto')
      ? String(srcLang).trim()
      : (this._activeContextLang || this._inferLanguageFromText(phrase) || 'en');
    const nextTarget = this._resolveOppositeLang(nextSource);
    this.state.sourceLang = nextSource;
    this.state.targetLang = nextTarget;
    this.state.detectedLang = '';
    this.renderTabs();
    this.dom.sourceText.value = phrase;
    this.hideSelectionSpotlight();
    this.handleSourceInput();
    this.performTranslation();
  }

  _resolveDictionaryLang(text, explicitLang = '') {
    const cleanExplicit = explicitLang ? String(explicitLang).trim() : '';
    if (cleanExplicit && cleanExplicit !== 'auto') {
      return cleanExplicit;
    }
    if (this.state.sourceLang && this.state.sourceLang !== 'auto') {
      return this.state.sourceLang;
    }
    if (this.state.detectedLang && this.state.detectedLang !== 'auto') {
      return this.state.detectedLang;
    }
    const inferred = this._inferLanguageFromText(text);
    if (inferred && inferred !== 'en') {
      return inferred;
    }
    return 'auto';
  }

  _lookupWordImmediate(word, lang = '') {
    const clean = String(word || '').trim();
    if (!clean || typeof window === 'undefined' || !window.LingoDictionary || typeof window.LingoDictionary.lookup !== 'function') {
      return;
    }
    if (this.dictionaryDebounceTimer) {
      clearTimeout(this.dictionaryDebounceTimer);
      this.dictionaryDebounceTimer = null;
    }
    const lookupLang = this._resolveDictionaryLang(clean, lang);
    const key = lookupLang + ':' + clean.toLowerCase();
    if (this._lastDictionaryQuery === key) return;
    this._lastDictionaryQuery = key;
    window.LingoDictionary.lookup(clean, lookupLang);
  }

  _highlightWordInPassage(paragraph, word) {
    const text = String(paragraph || '').normalize('NFC');
    const cleanWord = String(word || '').trim().normalize('NFC');
    if (!cleanWord) return escapeHtml(text);

    const escapedRegex = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasNonSpacedScript = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f\u0e80-\u0eff\u1780-\u17ff]/.test(cleanWord);
    const regex = hasNonSpacedScript
      ? new RegExp(`(${escapedRegex})`, 'giu')
      : new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])(${escapedRegex})(?![\\p{L}\\p{M}\\p{N}])`, 'giu');

    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const prefix = hasNonSpacedScript ? '' : (match[1] || '');
      const term = hasNonSpacedScript ? match[1] : match[2];
      const termStart = match.index + prefix.length;

      if (termStart > lastIndex) {
        html += escapeHtml(text.slice(lastIndex, termStart));
      }
      html += '<mark class="context-highlight">' + escapeHtml(term) + '</mark>';
      lastIndex = termStart + term.length;
      if (match[0].length === 0) regex.lastIndex += 1;
    }

    if (lastIndex < text.length) {
      html += escapeHtml(text.slice(lastIndex));
    }
    return html;
  }

  handleDictionaryEntryLoaded(data, word, lang) {
    const d = this.dom;
    if (!d) return;

    const effectiveLang = (data && typeof data.lang === 'string' && data.lang.trim())
      ? data.lang.trim()
      : ((lang && lang !== 'auto') ? String(lang).trim() : (this._activeContextLang || 'en'));
    this._activeContextLang = effectiveLang;

    const cleanWord = String((data && data.word) || word || '').trim();
    const rawRelated = Array.isArray(data && data.relatedPhrases) && data.relatedPhrases.length > 0
      ? data.relatedPhrases
      : (Array.isArray(data && data.synonyms) ? data.synonyms : []);

    const seen = new Set();
    const phrases = [];
    for (const item of rawRelated) {
      const val = String(item || '').trim();
      if (!val || seen.has(val.toLowerCase())) continue;
      seen.add(val.toLowerCase());
      phrases.push(val);
      if (phrases.length >= 6) break;
    }

    if (phrases.length > 0 && d.phraseList) {
      if (d.phraseSubtitle) {
        d.phraseSubtitle.textContent = `Cụm từ & đoạn văn liên quan đến “${cleanWord}”`;
      }
      if (d.resetPhrasesBtn) {
        d.resetPhrasesBtn.classList.remove('hidden');
        d.resetPhrasesBtn.removeAttribute('hidden');
      }
      d.phraseList.innerHTML = phrases.map(phrase => (
        '<button type="button" class="dynamic-phrase-btn" data-phrase="' + escapeHtml(phrase) + '" data-phrase-lang="' + escapeHtml(effectiveLang) + '">' +
          escapeHtml(phrase) + ' <span aria-hidden="true">↗</span>' +
        '</button>'
      )).join('');
    } else {
      this._restorePhraseListOnly();
    }

    const contextParagraph = data && typeof data.contextParagraph === 'string'
      ? data.contextParagraph.trim()
      : '';

    if (contextParagraph && d.contextPassageCard) {
      this._renderContextPassageCard(contextParagraph, cleanWord, effectiveLang);
    } else {
      this._hideContextPassageCard();
    }
  }

  _renderContextPassageCard(paragraph, word, lang) {
    const card = this.dom.contextPassageCard;
    if (!card) return;

    const contextLang = (lang && lang !== 'auto')
      ? String(lang).trim()
      : (this._activeContextLang || this._inferLanguageFromText(paragraph) || 'en');
    const passageSeq = ++this.contextPassageSeq;
    const highlightedHtml = this._highlightWordInPassage(paragraph, word);
    const inlineTargetLang = this._resolveOppositeLang(contextLang);
    const targetLangObj = getLanguageByCode
      ? (getLanguageByCode(inlineTargetLang) || (inlineTargetLang === 'zh' ? getLanguageByCode('zh-CN') : null))
      : null;
    const targetLangLabel = targetLangObj
      ? `Bản dịch ${targetLangObj.name}`
      : `Bản dịch (${inlineTargetLang})`;

    const i18n = typeof window !== 'undefined' ? window.LingoI18n : null;
    if (i18n && typeof i18n.ensureFont === 'function') {
      i18n.ensureFont(contextLang);
      i18n.ensureFont(inlineTargetLang);
    }

    card.innerHTML =
      '<div class="context-passage-header">' +
        '<span class="context-passage-badge">Đoạn văn ngữ cảnh · ' + escapeHtml(word) + '</span>' +
      '</div>' +
      '<p class="context-passage-text" lang="' + escapeHtml(contextLang) + '">' + highlightedHtml + '</p>' +
      '<div class="context-passage-actions">' +
        '<button type="button" class="context-passage-btn" data-passage-action="speak">🔊 Nghe đoạn văn</button>' +
        '<button type="button" class="context-passage-btn context-passage-btn-primary" data-passage-action="translate-main">Dịch đoạn văn này →</button>' +
        '<button type="button" class="context-passage-btn" data-passage-action="translate-inline">Dịch nhanh bên dưới</button>' +
      '</div>' +
      '<div class="context-passage-inline hidden" hidden></div>';

    card.classList.remove('hidden');
    card.removeAttribute('hidden');

    const speakBtn = card.querySelector('[data-passage-action="speak"]');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => this.speakText(paragraph, this._activeContextLang || contextLang, speakBtn));
    }

    const translateMainBtn = card.querySelector('[data-passage-action="translate-main"]');
    if (translateMainBtn) {
      translateMainBtn.addEventListener('click', () => {
        this._applyPhraseToSource(paragraph, this._activeContextLang || contextLang);
      });
    }

    const translateInlineBtn = card.querySelector('[data-passage-action="translate-inline"]');
    const inlineBox = card.querySelector('.context-passage-inline');
    if (translateInlineBtn && inlineBox) {
      translateInlineBtn.addEventListener('click', async () => {
        const translator = this.contextTranslationService || this.translationService;
        if (!translator) return;
        const srcLang = this._activeContextLang || contextLang;
        const tgtLang = this._resolveOppositeLang(srcLang);
        const tgtObj = getLanguageByCode
          ? (getLanguageByCode(tgtLang) || (tgtLang === 'zh' ? getLanguageByCode('zh-CN') : null))
          : null;
        const tgtLabel = tgtObj ? `Bản dịch ${tgtObj.name}` : `Bản dịch (${tgtLang})`;

        translateInlineBtn.disabled = true;
        inlineBox.innerHTML =
          '<span class="context-passage-inline-label">' + escapeHtml(tgtLabel) + '</span>' +
          '<p class="context-passage-inline-text">Đang dịch đoạn văn...</p>';
        inlineBox.classList.remove('hidden');
        inlineBox.removeAttribute('hidden');

        try {
          const res = await translator.translate(paragraph, srcLang, tgtLang);
          if (passageSeq !== this.contextPassageSeq) return;
          const translatedText = (res && res.translatedText ? String(res.translatedText) : '').trim();
          if (!translatedText) {
            inlineBox.innerHTML =
              '<span class="context-passage-inline-label">' + escapeHtml(tgtLabel) + '</span>' +
              '<p class="context-passage-inline-text">Không có kết quả dịch.</p>';
            return;
          }
          inlineBox.innerHTML = '';
          const labelEl = document.createElement('span');
          labelEl.className = 'context-passage-inline-label';
          labelEl.textContent = tgtLabel;
          const textEl = document.createElement('p');
          textEl.className = 'context-passage-inline-text';
          textEl.lang = tgtLang;
          textEl.textContent = translatedText;
          inlineBox.appendChild(labelEl);
          inlineBox.appendChild(textEl);
        } catch (err) {
          if (passageSeq !== this.contextPassageSeq) return;
          if (err && (err.name === 'AbortError' || err.message === 'The user aborted a request.')) {
            inlineBox.classList.add('hidden');
            inlineBox.setAttribute('hidden', '');
            return;
          }
          inlineBox.innerHTML =
            '<span class="context-passage-inline-label">' + escapeHtml(tgtLabel) + '</span>' +
            '<p class="context-passage-inline-text">Không thể dịch đoạn văn lúc này.</p>';
        } finally {
          translateInlineBtn.disabled = false;
        }
      });
    }
  }

  _hideContextPassageCard() {
    this.contextPassageSeq += 1;
    if (
      this.contextTranslationService &&
      this.contextTranslationService !== this.translationService &&
      typeof this.contextTranslationService.abort === 'function'
    ) {
      this.contextTranslationService.abort();
    }
    const card = this.dom.contextPassageCard;
    if (card) {
      card.classList.add('hidden');
      card.setAttribute('hidden', '');
      card.innerHTML = '';
    }
  }

  _restorePhraseListOnly() {
    const d = this.dom;
    if (!d) return;
    if (d.phraseSubtitle) {
      const subtitleText = (typeof window !== 'undefined' && window.LingoI18n && typeof window.LingoI18n.t === 'function')
        ? window.LingoI18n.t('phrase.subtitle', DEFAULT_PHRASE_SUBTITLE)
        : DEFAULT_PHRASE_SUBTITLE;
      d.phraseSubtitle.textContent = subtitleText;
    }
    if (d.resetPhrasesBtn) {
      d.resetPhrasesBtn.classList.add('hidden');
      d.resetPhrasesBtn.setAttribute('hidden', '');
    }
    if (d.phraseList) {
      const phrases = (this.defaultStarterPhrases && this.defaultStarterPhrases.length > 0)
        ? this.defaultStarterPhrases
        : DEFAULT_STARTER_PHRASES;
      d.phraseList.innerHTML = phrases.map(phrase => (
        '<button type="button" data-phrase="' + escapeHtml(phrase) + '">' +
          escapeHtml(phrase) + ' <span aria-hidden="true">↗</span>' +
        '</button>'
      )).join('');
    }
  }

  resetPhrasesToDefault() {
    this._restorePhraseListOnly();
    this._hideContextPassageCard();
  }

  handleDictionaryCleared() {
    this.resetPhrasesToDefault();
  }

  handleSourceSelectionLookup() {
    this.scheduleSelectionSpotlight('source');
  }

  _isLookupCandidate(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean || clean.length > 45) return false;
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 3) return false;
    if (!/\p{L}/u.test(clean)) return false;
    return /^[\p{L}\p{M}'’\-·・]+(?:\s+[\p{L}\p{M}'’\-·・]+){0,2}$/u.test(clean);
  }

  _isEnglishLookupCandidate(text) {
    return this._isLookupCandidate(text);
  }

  _clearDictionaryLookup() {
    if (this.dictionaryDebounceTimer) {
      clearTimeout(this.dictionaryDebounceTimer);
      this.dictionaryDebounceTimer = null;
    }
    this._lastDictionaryQuery = '';
    if (typeof window !== 'undefined' && window.LingoDictionary && typeof window.LingoDictionary.clear === 'function') {
      window.LingoDictionary.clear();
    }
  }

  _scheduleDictionaryLookup(rawText, fromSelection = false) {
    if (typeof window === 'undefined' || !window.LingoDictionary || typeof window.LingoDictionary.lookup !== 'function') {
      return;
    }

    const clean = (rawText || '').trim();
    if (!clean) {
      this._clearDictionaryLookup();
      return;
    }

    if (!this._isLookupCandidate(clean)) {
      if (!fromSelection) {
        this._clearDictionaryLookup();
      }
      return;
    }

    if (this.dictionaryDebounceTimer) {
      clearTimeout(this.dictionaryDebounceTimer);
    }

    this.dictionaryDebounceTimer = setTimeout(() => {
      const lookupLang = this._resolveDictionaryLang(clean);
      const queryKey = lookupLang + ':' + clean.toLowerCase();
      if (this._lastDictionaryQuery === queryKey) return;
      this._lastDictionaryQuery = queryKey;
      window.LingoDictionary.lookup(clean, lookupLang);
    }, 420);
  }

  updateCharCount() {
    if (!this.dom.charCount) return;
    const len = this.dom.sourceText ? this.dom.sourceText.value.length : 0;
    this.dom.charCount.textContent = formatCharCount(len);
  }

  updateClearBtn() {
    if (!this.dom.clearBtn) return;
    const hasText = Boolean(this.dom.sourceText && this.dom.sourceText.value.length > 0);
    this.dom.clearBtn.classList.toggle('hidden', !hasText);
  }

  clearSource() {
    this._stopSpeakingUI();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.translationService) {
      this.translationService.abort();
    }

    if (this.dom.sourceText) {
      this.dom.sourceText.value = '';
      this.dom.sourceText.focus();
    }

    this.hideSelectionSpotlight();
    this._clearDictionaryLookup();
    this.resetPhrasesToDefault();
    this.clearTarget();
    this.updateCharCount();
    this.updateClearBtn();
  }

  clearTarget() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.translationService) {
      this.translationService.abort();
    }

    if (this.dom.targetText) {
      this.dom.targetText.textContent = '';
    }

    if (this.dom.loadingSpinner) {
      this.dom.loadingSpinner.classList.add('hidden');
    }

    if (this.dom.detectedLangBadge) {
      this.dom.detectedLangBadge.classList.add('hidden');
      this.dom.detectedLangBadge.textContent = '';
    }

    this.state.detectedLang = '';
    this._syncTextAreaLangAttributes();
    this.updateStarBtnState();
  }

  async performTranslation() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const text = this.dom.sourceText ? this.dom.sourceText.value.trim() : '';
    if (!text) {
      this.clearTarget();
      return;
    }

    if (!this.translationService) return;

    if (this.dom.loadingSpinner) {
      this.dom.loadingSpinner.classList.remove('hidden');
    }

    try {
      const result = await this.translationService.translate(
        text,
        this.state.sourceLang,
        this.state.targetLang
      );

      if (this.dom.loadingSpinner) {
        this.dom.loadingSpinner.classList.add('hidden');
      }

      if (this.dom.targetText) {
        this.dom.targetText.textContent = result.translatedText || '';
      }

      // Handle detected language badge when sourceLang is 'auto'
      if (this.state.sourceLang === 'auto' && result.detectedLang) {
        this.state.detectedLang = result.detectedLang;
        const langObj = getLanguageByCode ? getLanguageByCode(result.detectedLang) : null;
        const langName = langObj ? langObj.name : result.detectedLang;
        if (this.dom.detectedLangBadge) {
          this.dom.detectedLangBadge.textContent = `Đã phát hiện: ${langName}`;
          this.dom.detectedLangBadge.classList.remove('hidden');
        }
        const st = this.dom.sourceText;
        const hasSelection = st && typeof st.selectionStart === 'number' && typeof st.selectionEnd === 'number' && st.selectionEnd > st.selectionStart;
        if (!hasSelection) {
          if (this._isLookupCandidate(text)) {
            this._scheduleDictionaryLookup(text);
          } else {
            this._clearDictionaryLookup();
          }
        }
      } else if (this.dom.detectedLangBadge) {
        this.dom.detectedLangBadge.classList.add('hidden');
      }

      this._syncTextAreaLangAttributes();

      // Record to history
      if (result.translatedText) {
        this.addToHistory({
          sourceLang: this.state.sourceLang,
          targetLang: this.state.targetLang,
          sourceText: text,
          targetText: result.translatedText
        });
      }

      this.updateStarBtnState();
    } catch (err) {
      if (this.dom.loadingSpinner) {
        this.dom.loadingSpinner.classList.add('hidden');
      }

      // Don't show toast if request was deliberately aborted
      if (err && (err.name === 'AbortError' || err.message === 'The user aborted a request.')) {
        return;
      }

      console.error('Translation error:', err);
      this.showToast('Không thể kết nối máy chủ dịch. Vui lòng thử lại.');
    }
  }


  /**
   * Splits text into smaller natural chunks under maxLen characters for Google TTS
   */
  splitTextForTts(text, maxLen = 180) {
    if (!text || text.length <= maxLen) return [text];

    const rawSentences = text.match(/[^.!?\n;:]+[.!?\n;:]+|[^.!?\n;:]+$/g) || [text];
    const chunks = [];
    let current = '';

    for (const item of rawSentences) {
      const sentence = item.trim();
      if (!sentence) continue;

      if ((current + ' ' + sentence).trim().length <= maxLen) {
        current = current ? (current + ' ' + sentence) : sentence;
      } else {
        if (current) {
          chunks.push(current);
          current = '';
        }
        if (sentence.length <= maxLen) {
          current = sentence;
        } else {
          const words = sentence.split(/\s+/);
          let sub = '';
          for (const w of words) {
            if ((sub + ' ' + w).trim().length <= maxLen) {
              sub = sub ? (sub + ' ' + w) : w;
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          if (sub) current = sub;
        }
      }
    }

    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
  }

  _inferLanguageFromText(text) {
    if (!text || typeof text !== 'string') return 'en';
    const sample = text.trim();
    if (!sample) return 'en';
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(sample)) {
      return 'vi';
    }
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) return 'ja';
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(sample)) return 'ko';
    if (/[\u4e00-\u9fff]/.test(sample)) return 'zh-CN';
    if (/[\u0400-\u04ff]/.test(sample)) return 'ru';
    if (/[\u0600-\u06ff]/.test(sample)) return 'ar';
    if (/[\u0e00-\u0e7f]/.test(sample)) return 'th';
    return 'en';
  }

  _resolveSourceTtsLang(text) {
    if (this.state.sourceLang && this.state.sourceLang !== 'auto') {
      return this.state.sourceLang;
    }
    if (this.state.detectedLang && this.state.detectedLang !== 'auto') {
      return this.state.detectedLang;
    }
    return this._inferLanguageFromText(text);
  }

  speakText(text, langCode, btn = null) {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) return;

    let resolvedLang = langCode;
    if (!resolvedLang || resolvedLang === 'auto') {
      resolvedLang = this._inferLanguageFromText(cleanText);
    }

    const chunks = this.splitTextForTts(cleanText);
    this._playTtsQueue(chunks, resolvedLang, btn);
  }

  handleTts(type) {
    const isSource = type === 'source';
    const text = isSource
      ? (this.dom.sourceText ? this.dom.sourceText.value.trim() : '')
      : (this.dom.targetText ? this.dom.targetText.textContent.trim() : '');

    const btn = isSource ? this.dom.sourceListenBtn : this.dom.targetListenBtn;

    // Toggle stop if already speaking from this button
    if (this.state.isSpeaking) {
      const wasSameBtn = this.currentSpeakingBtn === btn;
      this._stopSpeakingUI();
      if (wasSameBtn) {
        return;
      }
    }

    if (!text) return;

    const langCode = isSource
      ? this._resolveSourceTtsLang(text)
      : (this.state.targetLang || 'vi');

    this.speakText(text, langCode, btn);
  }

  _playTtsQueue(chunks, langCode, btn) {
    this._stopSpeakingUI();

    this.state.isSpeaking = true;
    this.currentSpeakingBtn = btn || null;
    if (btn && btn.classList) btn.classList.add('speaking');

    const playSessionId = ++this.ttsSessionCounter;
    let chunkIndex = 0;

    const playNextChunk = () => {
      if (!this.state.isSpeaking || this.ttsSessionCounter !== playSessionId) {
        return;
      }

      if (chunkIndex >= chunks.length) {
        this._stopSpeakingUI();
        return;
      }

      const chunk = chunks[chunkIndex++];
      const matchedVoice = this.findBestVoice(langCode);

      if (matchedVoice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this._playWebSpeechChunk(chunk, langCode, playSessionId, matchedVoice, playNextChunk, () => {
          this._playProxyTtsChunk(chunk, langCode, playSessionId, playNextChunk, true);
        });
      } else {
        this._playProxyTtsChunk(chunk, langCode, playSessionId, playNextChunk, false);
      }
    };

    playNextChunk();
  }

  _playWebSpeechChunk(text, langCode, playSessionId, matchedVoice, onNext, onFallback) {
    const hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const UtteranceClass = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) ||
      (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);

    if (!hasSpeechSynthesis || !UtteranceClass) {
      if (onFallback) onFallback();
      else this._stopSpeakingUI();
      return;
    }

    try {
      const bcp47 = getBcp47Tag(langCode);
      const utterance = new UtteranceClass(text);
      this.currentUtterance = utterance;
      utterance.lang = bcp47;
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onend = () => {
        if (this.ttsSessionCounter !== playSessionId) return;
        this.currentUtterance = null;
        if (onNext) onNext();
        else this._stopSpeakingUI();
      };

      utterance.onerror = (e) => {
        if (this.ttsSessionCounter !== playSessionId) return;
        this.currentUtterance = null;
        if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
        console.warn('SpeechSynthesis error:', e);
        if (onFallback) {
          onFallback();
        } else if (onNext) {
          onNext();
        } else {
          this._stopSpeakingUI();
        }
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('SpeechSynthesis invocation error:', err);
      if (this.ttsSessionCounter !== playSessionId) return;
      if (onFallback) onFallback();
      else this._stopSpeakingUI();
    }
  }

  async _playProxyTtsChunk(text, langCode, playSessionId, onNext, skipWebSpeechFallback) {
    if (this.ttsSessionCounter !== playSessionId) return;

    const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');
    const canTryProxy = isHttp && this._ttsProxyAvailable !== false && typeof fetch === 'function';

    if (!canTryProxy) {
      if (!skipWebSpeechFallback) {
        const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
        if (hasSpeech) {
          this._playWebSpeechChunk(text, langCode, playSessionId, null, onNext, () => {
            this._stopSpeakingUI();
            this.showToast('Trình duyệt không hỗ trợ phát âm ngôn ngữ này.');
          });
          return;
        }
      }
      this._stopSpeakingUI();
      this.showToast('Không thể phát âm thanh trên trình duyệt này.');
      return;
    }

    const q = encodeURIComponent(text);
    const tl = encodeURIComponent(langCode);
    const ttsUrl = `api/tts.php?tl=${tl}&q=${q}`;

    try {
      const response = await fetch(ttsUrl);
      if (this.ttsSessionCounter !== playSessionId) return;

      const contentType = this._getResponseContentType(response);
      if (!response.ok || !contentType.startsWith('audio/')) {
        if (response.status === 404 || contentType.includes('text/html')) {
          this._ttsProxyAvailable = false;
        }
        throw new Error(`TTS proxy unavailable (${response.status})`);
      }

      this._ttsProxyAvailable = true;
      const blob = await response.blob();
      if (this.ttsSessionCounter !== playSessionId) return;

      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      this.currentAudio = audio;
      this.currentAudioUrl = objectUrl;

      const cleanupAudio = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        if (this.currentAudioUrl === objectUrl) {
          this.currentAudioUrl = null;
        }
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      };

      audio.onended = () => {
        cleanupAudio();
        if (this.ttsSessionCounter === playSessionId) {
          onNext();
        }
      };

      audio.onerror = () => {
        cleanupAudio();
        if (this.ttsSessionCounter !== playSessionId) return;
        if (!skipWebSpeechFallback) {
          this._playWebSpeechChunk(text, langCode, playSessionId, null, onNext, () => {
            this._stopSpeakingUI();
            this.showToast('Không thể phát âm thanh.');
          });
        } else {
          this._stopSpeakingUI();
          this.showToast('Không thể phát âm thanh.');
        }
      };

      await audio.play();
    } catch (err) {
      if (this.ttsSessionCounter !== playSessionId) return;
      if (err && err.name === 'AbortError') return;
      console.warn('TTS proxy failed:', err);
      if (!skipWebSpeechFallback && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this._playWebSpeechChunk(text, langCode, playSessionId, null, onNext, () => {
          this._stopSpeakingUI();
          this.showToast('Không thể phát âm thanh.');
        });
      } else {
        this._stopSpeakingUI();
        this.showToast('Không thể phát âm thanh.');
      }
    }
  }

  _stopSpeakingUI() {
    this.state.isSpeaking = false;
    this.ttsSessionCounter = (this.ttsSessionCounter || 0) + 1;

    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.removeAttribute('src');
      } catch (_) {}
      this.currentAudio = null;
    }

    if (this.currentAudioUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(this.currentAudioUrl);
      } catch (_) {}
      this.currentAudioUrl = null;
    }

    if (this.currentUtterance) {
      try {
        this.currentUtterance.onend = null;
        this.currentUtterance.onerror = null;
      } catch (_) {}
      this.currentUtterance = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }

    if (this.dom.sourceListenBtn) this.dom.sourceListenBtn.classList.remove('speaking');
    if (this.dom.targetListenBtn) this.dom.targetListenBtn.classList.remove('speaking');
    if (this.currentSpeakingBtn && this.currentSpeakingBtn.classList) {
      this.currentSpeakingBtn.classList.remove('speaking');
    }
    this.currentSpeakingBtn = null;
  }

  findBestVoice(langCode) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const bcp47 = getBcp47Tag(langCode).toLowerCase();
    const shortCode = langCode.toLowerCase().split('-')[0];

    let match = voices.find(v => v.lang.toLowerCase() === bcp47);
    if (match) return match;

    match = voices.find(v => v.lang.toLowerCase().startsWith(bcp47));
    if (match) return match;

    match = voices.find(v => v.lang.toLowerCase().startsWith(shortCode + '-') || v.lang.toLowerCase() === shortCode);
    return match || null;
  }


  _isServerOcrFallbackStatus(status) {
    return status === 404 || status === 405 || status === 501 || status === 502 || status === 503;
  }

  async _tryServerOcr(file) {
    const arrayBuffer = await file.arrayBuffer();
    const requestInit = {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: arrayBuffer
    };

    const endpoints = ['/api/ocr', 'api/ocr'];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, requestInit);
        const contentType = this._getResponseContentType(response);
        if (!this._isServerOcrFallbackStatus(response.status) && contentType.includes('application/json')) {
          return response;
        }
      } catch (_) {}
    }

    return null;
  }

  _applyOcrText(text) {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      this.showToast('Không tìm thấy chữ trong ảnh.');
      return;
    }

    if (this.dom.sourceText) {
      this.dom.sourceText.value = cleanText;
      this.handleSourceInput();
    }
    this.performTranslation();
    this.showToast('Đã nhận diện chữ từ ảnh thành công!');
  }

  async handleImageFile(file) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      this.showToast('Vui lòng chọn tệp hình ảnh hợp lệ. / Please select a valid image file.');
      return;
    }

    const setOcrSpinner = (visible) => {
      if (this.dom.loadingSpinner) {
        this.dom.loadingSpinner.classList.toggle('hidden', !visible);
      }
    };

    this.showToast('Đang nhận diện chữ từ ảnh (Google Lens)...');
    setOcrSpinner(true);

    const ocrUnavailableMsg = 'Dịch vụ OCR cần máy chủ Node. Hãy chạy "npm start" trong thư mục translate-web/. (OCR requires the Node server: run "npm start" in translate-web/.)';

    try {
      const response = await this._tryServerOcr(file);
      if (response) {
        const data = await response.json().catch(() => null);
        setOcrSpinner(false);

        if (response.ok && data && data.success) {
          this._applyOcrText(data.text);
        } else {
          this.showToast((data && data.error) || 'Không tìm thấy chữ trong ảnh.');
        }
        return;
      }
    } catch (serverErr) {
      console.warn('Server OCR unavailable, falling back to browser OCR:', serverErr);
    }

    try {
      const lingoOcr = typeof window !== 'undefined' ? window.LingoOcr : (typeof global !== 'undefined' ? global.LingoOcr : null);
      if (!lingoOcr || typeof lingoOcr.recognize !== 'function') {
        throw new Error('LingoOcr is unavailable');
      }

      let lastToastAt = 0;
      let lastToastPct = -1;
      const progressCb = (pct) => {
        const normalized = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
        if (normalized === lastToastPct) return;
        const now = Date.now();
        if (lastToastAt === 0 || (now - lastToastAt >= 1200 && Math.abs(normalized - lastToastPct) >= 15) || normalized === 100) {
          lastToastAt = now;
          lastToastPct = normalized;
          this.showToast(`Đang nhận diện chữ trên trình duyệt (OCR)... ${normalized}%`, 1800);
        }
      };

      progressCb(0);
      const sourceLang = this.state ? this.state.sourceLang : 'auto';
      const ocrResult = await lingoOcr.recognize(file, sourceLang, progressCb);
      setOcrSpinner(false);
      this._applyOcrText(ocrResult && ocrResult.text);
    } catch (err) {
      setOcrSpinner(false);
      console.error('Image OCR Error:', err);
      this.showToast(ocrUnavailableMsg, 5000);
    }
  }

  _checkUrlParams() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const text = params.get('text') || params.get('q');
      if (text && this.dom.sourceText) {
        this.dom.sourceText.value = text;
        this.handleSourceInput();
        this.performTranslation();
      }
    } catch (_) {}
  }


  async copyTranslation() {
    const text = this.dom.targetText ? this.dom.targetText.textContent.trim() : '';
    if (!text) return;

    try {
      const clipboard = (typeof window !== 'undefined' && window.navigator && window.navigator.clipboard) ||
        (typeof navigator !== 'undefined' && navigator.clipboard);

      if (clipboard && clipboard.writeText) {
        await clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      this.showToast('Đã sao chép vào bộ nhớ tạm');
    } catch (err) {
      this.showToast('Không thể sao chép văn bản');
    }
  }

  showToast(message, duration = 2500) {
    const container = this.dom.toastContainer;
    if (!container || typeof document === 'undefined') return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 250);
    }, duration);
  }
}

// Browser Auto-initialization
let defaultApp = null;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const initApp = () => {
    try {
      defaultApp = new GoogleTranslateApp();
      window.app = defaultApp;
      Promise.resolve(defaultApp.init()).catch(err => {
        console.warn('App init failed:', err);
      });
    } catch (err) {
      console.warn('App startup error:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

// Universal CommonJS export for Node.js unit & integration testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GoogleTranslateApp,
    STORAGE_KEYS,
    BCP47_MAP,
    getBcp47Tag,
    formatCharCount,
    normalizeSearchText,
    escapeHtml,
    filterLanguages
  };
}

if (typeof global !== 'undefined') {
  global.GoogleTranslateApp = GoogleTranslateApp;
  global.STORAGE_KEYS = STORAGE_KEYS;
  global.BCP47_MAP = BCP47_MAP;
  global.getBcp47Tag = getBcp47Tag;
  global.formatCharCount = formatCharCount;
  global.normalizeSearchText = normalizeSearchText;
  global.escapeHtml = escapeHtml;
  global.filterLanguages = filterLanguages;
}
})(typeof window !== 'undefined' ? window : this);
