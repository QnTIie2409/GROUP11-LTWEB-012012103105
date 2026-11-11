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
    this.currentUtterance = null;
    this.currentSpeakingBtn = null;
    this.currentAudio = null;
    this.ttsSessionCounter = 0;
    this.historySaveQueue = Promise.resolve();

    // DOM references
    this.dom = options.dom || {};
  }

  /**
   * Initializes the application: queries DOM elements, loads storage, renders UI, and binds events.
   */
  async init() {
    this._bindDomElements();
    this.loadTheme();
    await this.loadHistory();
    this.renderTabs();
    this.updateCharCount();
    this.updateStarBtnState();
    this._bindEvents();
    this._checkUrlParams();

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
      'toastContainer'
    ];

    ids.forEach(id => {
      if (!this.dom[id]) {
        this.dom[id] = document.getElementById(id);
      }
    });

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
    if (typeof document !== 'undefined') {
      document.querySelectorAll('[data-phrase]').forEach(button => {
        button.addEventListener('click', () => {
          this.state.sourceLang = 'en';
          this.state.targetLang = 'vi';
          this.renderTabs();
          d.sourceText.value = button.dataset.phrase;
          this.handleSourceInput();
          this.performTranslation();
        });
      });
    }

    if (d.sourceText) {
      d.sourceText.addEventListener('input', () => this.handleSourceInput());
      d.sourceText.addEventListener('keydown', (e) => {
        // Ctrl+Enter or Cmd+Enter translates immediately
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.performTranslation();
        }
      });
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


  async loadHistory() {
    if (typeof window === 'undefined') return;
    try {
      const response = await fetch(HISTORY_API_URL, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Cannot load history');
      const remote = await response.json();
      if (!Array.isArray(remote)) throw new Error('Invalid history response');
      this.state.history = remote;

      // Move data saved by older versions to MySQL before deleting the old key.
      const raw = this.storage && this.storage.getItem(STORAGE_KEYS.HISTORY);
      if (raw) {
        let old = [];
        try { old = JSON.parse(raw); } catch (_) {}
        if (Array.isArray(old)) {
          const ids = new Set(remote.map(item => item.id));
          this.state.history = [...remote, ...old.filter(item => item && !ids.has(item.id))]
            .sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
          await this.saveHistory();
          this.storage.removeItem(STORAGE_KEYS.HISTORY);
        }
      }
    } catch (error) {
      console.error('History load failed:', error);
      this.showToast('Không tải được lịch sử từ MySQL. Kiểm tra kết nối database.');
    }
  }

  saveHistory() {
    if (typeof window === 'undefined') return Promise.resolve();
    const snapshot = JSON.stringify(this.state.history);
    this.historySaveQueue = this.historySaveQueue.catch(() => {}).then(async () => {
      const response = await fetch(HISTORY_API_URL, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: snapshot
      });
      if (!response.ok) throw new Error('Cannot save history');
    });
    this.historySaveQueue.catch(error => {
      console.error('History save failed:', error);
      this.showToast('Không lưu được lịch sử vào MySQL.');
    });
    return this.historySaveQueue;
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

    let starred = false;
    if (existingIndex !== -1) {
      // Preserve starred status if it was previously starred
      starred = Boolean(this.state.history[existingIndex].starred);
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

    this.saveHistory();
    if (this.isHistoryDrawerOpen()) {
      this.renderHistoryList();
    }
    this.updateStarBtnState();
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
    this.saveHistory();
    this.renderHistoryList();
    this.updateStarBtnState();
    this.showToast(item.starred ? 'Đã lưu bản dịch' : 'Đã xóa khỏi danh sách đã lưu');
  }

  deleteHistoryItem(id) {
    this.state.history = this.state.history.filter(h => h.id !== id);
    this.saveHistory();
    this.renderHistoryList();
    this.updateStarBtnState();
  }

  clearHistory() {
    if (typeof window !== 'undefined' && window.confirm) {
      const ok = window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử dịch không?');
      if (!ok) return;
    }

    this.state.history = [];
    this.saveHistory();
    this.renderHistoryList();
    this.updateStarBtnState();
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

    if (match) {
      match.starred = !match.starred;
    } else {
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

    this.saveHistory();
    this.updateStarBtnState();
    if (this.isHistoryDrawerOpen()) {
      this.renderHistoryList();
    }
    this.showToast(match.starred ? 'Đã lưu bản dịch' : 'Đã xóa khỏi danh sách đã lưu');
  }


  renderTabs() {
    this._renderSourceTabs();
    this._renderTargetTabs();
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

    if (triggerTranslate && this.dom.sourceText && this.dom.sourceText.value.trim()) {
      this.performTranslation();
    }
  }

  setTargetLang(code, triggerTranslate = true) {
    if (code === 'auto') return; // Target can never be 'auto'
    if (this.state.targetLang === code) return;
    this.state.targetLang = code;

    this._renderTargetTabs();

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

    if (!this.dom.sourceText.value.trim()) {
      this.clearTarget();
      return;
    }

    // Debounce translation
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performTranslation();
    }, this.debounceDelay);
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
      } else if (this.dom.detectedLangBadge) {
        this.dom.detectedLangBadge.classList.add('hidden');
      }

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

  handleTts(type) {
    const isSource = type === 'source';
    const text = isSource
      ? (this.dom.sourceText ? this.dom.sourceText.value.trim() : '')
      : (this.dom.targetText ? this.dom.targetText.textContent.trim() : '');

    const btn = isSource ? this.dom.sourceListenBtn : this.dom.targetListenBtn;

    // Toggle stop if already speaking
    if (this.state.isSpeaking) {
      const wasSameBtn = this.currentSpeakingBtn === btn;
      this._stopSpeakingUI();
      if (wasSameBtn) {
        return;
      }
    }

    if (!text) return;

    let langCode = isSource
      ? (this.state.sourceLang === 'auto' ? (this.state.detectedLang || 'vi') : this.state.sourceLang)
      : this.state.targetLang;

    if (!langCode || langCode === 'auto') langCode = 'vi';

    const chunks = this.splitTextForTts(text);
    this._playTtsQueue(chunks, langCode, btn);
  }

  _playTtsQueue(chunks, langCode, btn) {
    this._stopSpeakingUI();

    this.state.isSpeaking = true;
    this.currentSpeakingBtn = btn;
    if (btn) btn.classList.add('speaking');

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
      const q = encodeURIComponent(chunk);
      const tl = encodeURIComponent(langCode);
      const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');
      const audioUrl = isHttp
        ? `/api/tts?tl=${tl}&q=${q}`
        : `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${q}`;

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      audio.onended = () => {
        if (this.ttsSessionCounter === playSessionId) {
          playNextChunk();
        }
      };

      audio.onerror = () => {
        if (this.ttsSessionCounter !== playSessionId) return;
        console.warn('Google TTS audio failed, trying Web Speech fallback');
        this._playWebSpeechFallback(chunk, langCode, btn, () => {
          if (this.ttsSessionCounter === playSessionId) {
            playNextChunk();
          }
        });
      };

      audio.play().catch(err => {
        if (this.ttsSessionCounter !== playSessionId) return;
        if (err.name === 'AbortError') return; // User stopped speech manually
        console.warn('Audio play() rejected, trying Web Speech fallback:', err);
        this._playWebSpeechFallback(chunk, langCode, btn, () => {
          if (this.ttsSessionCounter === playSessionId) {
            playNextChunk();
          }
        });
      });
    };

    playNextChunk();
  }

  _playWebSpeechFallback(text, langCode, btn, onComplete) {
    const hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const UtteranceClass = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) ||
      (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);

    if (!hasSpeechSynthesis || !UtteranceClass) {
      if (onComplete) onComplete();
      else this._stopSpeakingUI();
      return;
    }

    try {
      const bcp47 = getBcp47Tag(langCode);
      const utterance = new UtteranceClass(text);
      this.currentUtterance = utterance;
      utterance.lang = bcp47;

      const voice = this.findBestVoice(langCode);
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (onComplete) onComplete();
        else this._stopSpeakingUI();
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        if (onComplete) onComplete();
        else this._stopSpeakingUI();
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('SpeechSynthesis invocation error:', err);
      if (onComplete) onComplete();
      else this._stopSpeakingUI();
    }
  }

  _stopSpeakingUI() {
    this.state.isSpeaking = false;
    this.ttsSessionCounter = (this.ttsSessionCounter || 0) + 1;

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }

    if (this.dom.sourceListenBtn) this.dom.sourceListenBtn.classList.remove('speaking');
    if (this.dom.targetListenBtn) this.dom.targetListenBtn.classList.remove('speaking');
    this.currentSpeakingBtn = null;
    this.currentUtterance = null;
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


  async handleImageFile(file) {
    if (!file) return;
    this.showToast('Đang nhận diện chữ từ ảnh (Google Lens)...');
    if (this.dom.loadingSpinner) {
      this.dom.loadingSpinner.classList.remove('hidden');
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: arrayBuffer
      });
      const data = await response.json();

      if (this.dom.loadingSpinner) {
        this.dom.loadingSpinner.classList.add('hidden');
      }

      if (data.success && data.text) {
        if (this.dom.sourceText) {
          this.dom.sourceText.value = data.text;
          this.handleSourceInput();
        }
        this.showToast('Đã nhận diện chữ thành công!');
        this.performTranslation();
      } else {
        this.showToast(data.error || 'Không tìm thấy chữ trong ảnh');
      }
    } catch (err) {
      if (this.dom.loadingSpinner) {
        this.dom.loadingSpinner.classList.add('hidden');
      }
      console.error('Image OCR Error:', err);
      this.showToast('Không thể kết nối dịch vụ OCR máy chủ. Vui lòng chạy node server.mjs');
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
    defaultApp = new GoogleTranslateApp();
    defaultApp.init();
    window.app = defaultApp;
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
