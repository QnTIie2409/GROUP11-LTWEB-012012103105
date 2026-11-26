/**
 * LingoOcr - Client-side OCR fallback using Tesseract.js
 * Lazily loads Tesseract.js from CDN on first use and exposes window.LingoOcr.
 */
(function (global) {
  'use strict';

  const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

  const LANG_MAP = {
    en: 'eng',
    vi: 'vie+eng',
    auto: 'eng+vie',
    'zh-CN': 'chi_sim',
    'zh-TW': 'chi_tra',
    ja: 'jpn',
    ko: 'kor',
    fr: 'fra',
    de: 'deu',
    es: 'spa',
    ru: 'rus'
  };

  let loadPromise = null;

  function getRoot() {
    return typeof window !== 'undefined' ? window : global;
  }

  function mapSourceLang(sourceLang) {
    if (typeof sourceLang === 'string' && Object.prototype.hasOwnProperty.call(LANG_MAP, sourceLang)) {
      return LANG_MAP[sourceLang];
    }
    return 'eng+vie';
  }

  function loadTesseract() {
    const root = getRoot();
    if (root && root.Tesseract && typeof root.Tesseract.recognize === 'function') {
      return Promise.resolve(root.Tesseract);
    }

    if (loadPromise) {
      return loadPromise;
    }

    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Tesseract.js requires a browser environment'));
    }

    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_CDN_URL;
      script.async = true;

      script.addEventListener('load', () => {
        const currentRoot = getRoot();
        if (currentRoot && currentRoot.Tesseract && typeof currentRoot.Tesseract.recognize === 'function') {
          resolve(currentRoot.Tesseract);
        } else {
          loadPromise = null;
          reject(new Error('Tesseract.js loaded without recognize API'));
        }
      });

      script.addEventListener('error', () => {
        loadPromise = null;
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error('Failed to load Tesseract.js from CDN'));
      });

      const target = document.head || document.body || document.documentElement;
      if (!target) {
        loadPromise = null;
        reject(new Error('Document has no mount target for Tesseract.js script'));
        return;
      }
      target.appendChild(script);
    });

    return loadPromise;
  }

  async function recognize(file, sourceLang, onProgress) {
    if (!file) {
      throw new Error('Image file is required for OCR');
    }

    const Tesseract = await loadTesseract();
    const tessLang = mapSourceLang(sourceLang);

    let lastPct = -1;
    let lastEmitAt = 0;

    const emitProgress = (pct, status) => {
      if (typeof onProgress !== 'function') return;
      if (pct === lastPct) return;
      const now = Date.now();
      if (pct === 0 || pct === 100 || Math.abs(pct - lastPct) >= 5 || now - lastEmitAt >= 250) {
        lastPct = pct;
        lastEmitAt = now;
        try {
          onProgress(pct, status);
        } catch (_) {}
      }
    };

    const logger = (message) => {
      if (!message || typeof onProgress !== 'function') return;
      const status = typeof message.status === 'string' ? message.status : '';
      const isProgressStatus = status === 'recognizing text' || status.startsWith('loading') || status.startsWith('initializing');
      if (!isProgressStatus) return;

      if (typeof message.progress === 'number' && Number.isFinite(message.progress)) {
        const pct = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
        emitProgress(pct, status);
      } else if (lastPct === -1) {
        emitProgress(0, status);
      }
    };

    const result = await Tesseract.recognize(file, tessLang, { logger });
    return {
      text: (result && result.data && result.data.text ? result.data.text : '').trim()
    };
  }

  const api = { recognize };

  if (typeof window !== 'undefined') {
    window.LingoOcr = api;
  }
  if (typeof global !== 'undefined') {
    global.LingoOcr = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
