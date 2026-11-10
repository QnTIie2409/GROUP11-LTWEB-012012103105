/**
 * TranslationService provides translation capabilities with Google Translate
 * dict-chrome-ex API as the primary engine, and MyMemory API as fallback.
 *
 * Supports browser and Node.js environments.
 */
(function (global) {
class TranslationService {
  /**
   * @param {Object} [options]
   * @param {string} [options.googleBaseUrl] - Base URL for Google Translate dict-chrome-ex endpoint
   * @param {string} [options.myMemoryBaseUrl] - Base URL for MyMemory API
   * @param {Function} [options.fetch] - Custom fetch implementation
   */
  constructor(options = {}) {
    this.googleBaseUrl = options.googleBaseUrl || 'https://clients5.google.com/translate_a/t';
    this.myMemoryBaseUrl = options.myMemoryBaseUrl || 'https://api.mymemory.translated.net/get';
    this.fetchFn = options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.currentController = null;
  }

  /**
   * Aborts any currently active translation request.
   */
  abort() {
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
  }

  /**
   * Translates text using the primary engine (Google Translate), falling back
   * to MyMemory if the primary engine fails.
   *
   * @param {string} text - Text to translate
   * @param {string} [sourceLang='auto'] - Source language code or 'auto'
   * @param {string} [targetLang='vi'] - Target language code
   * @returns {Promise<{ translatedText: string, detectedLang?: string, engine: string }>}
   */
  async translate(text, sourceLang = 'auto', targetLang = 'vi') {
    if (typeof text !== 'string' || !text.trim()) {
      return {
        translatedText: '',
        detectedLang: '',
        engine: 'none'
      };
    }

    const sl = sourceLang || 'auto';
    const tl = targetLang || 'vi';

    // Abort previous in-flight request if any
    this.abort();

    const controller = new AbortController();
    this.currentController = controller;
    const signal = controller.signal;

    try {
      // 1. Primary Engine: Google Translate
      try {
        return await this._translateGoogle(text, sl, tl, signal);
      } catch (googleError) {
        // If operation was aborted by user or another request, rethrow immediately
        if (signal.aborted || (googleError && googleError.name === 'AbortError')) {
          throw googleError;
        }

        console.warn('Google Translate API failed, attempting fallback to MyMemory:', googleError.message || googleError);

        // 2. Secondary Engine (Fallback): MyMemory
        return await this._translateMyMemory(text, sl, tl, signal);
      }
    } finally {
      if (this.currentController === controller) {
        this.currentController = null;
      }
    }
  }

  /**
   * Internal method to translate using Google Translate dict-chrome-ex endpoint.
   * @private
   */
  async _translateGoogle(text, sl, tl, signal) {
    const fetchImpl = this.fetchFn || fetch;
    const url = `${this.googleBaseUrl}?client=dict-chrome-ex&sl=${sl}&tl=${tl}&q=${encodeURIComponent(text)}`;

    const response = await fetchImpl(url, {
      signal,
      headers: {
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`Google API returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    const result = this._parseGoogleResponse(data, sl);
    if (!result.translatedText) {
      throw new Error('Google Translate returned empty or unparseable translation');
    }

    return result;
  }

  /**
   * Parses the Google Translate response structure safely.
   *
   * @param {*} data
   * @param {string} sourceLang
   * @returns {{ translatedText: string, detectedLang: string, engine: 'google' }}
   */
  _parseGoogleResponse(data, sourceLang) {
    let translatedText = '';
    let detectedLang = sourceLang !== 'auto' ? sourceLang : '';

    if (typeof data === 'string') {
      translatedText = data;
    } else if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0])) {
        // Format: [["Translated text", "detected_lang"]] or [["segment1", "en"], ["segment2", "en"]]
        translatedText = data
          .map((item) => (Array.isArray(item) ? (item[0] || '') : (item || '')))
          .join('');

        if (data[0].length > 1 && typeof data[0][1] === 'string' && data[0][1].length > 0) {
          detectedLang = data[0][1];
        }
      } else {
        // Format: ["Translated text"]
        translatedText = data
          .filter((item) => typeof item === 'string')
          .join('');
      }
    }

    return {
      translatedText,
      detectedLang: detectedLang || (sourceLang !== 'auto' ? sourceLang : ''),
      engine: 'google'
    };
  }

  /**
   * Internal method to translate using MyMemory API.
   * @private
   */
  async _translateMyMemory(text, sl, tl, signal) {
    const fetchImpl = this.fetchFn || fetch;
    const sourcePair = sl === 'auto' ? 'autodetect' : sl;
    const url = `${this.myMemoryBaseUrl}?q=${encodeURIComponent(text)}&langpair=${sourcePair}|${tl}`;

    const response = await fetchImpl(url, {
      signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`MyMemory API returned HTTP status ${response.status}`);
    }

    const data = await response.json();

    if (!data || !data.responseData || typeof data.responseData.translatedText !== 'string') {
      throw new Error(data && data.responseDetails ? data.responseDetails : 'Invalid MyMemory API response');
    }

    if (data.responseStatus && Number(data.responseStatus) !== 200) {
      throw new Error(data.responseDetails || `MyMemory API returned status ${data.responseStatus}`);
    }

    const rawText = data.responseData.translatedText;
    if (rawText.startsWith('MYMEMORY WARNING:')) {
      throw new Error(rawText);
    }

    const translatedText = this._decodeHtmlEntities(rawText);
    const detectedLang = data.responseData.detectedLanguage || (sl !== 'auto' ? sl : '');

    return {
      translatedText,
      detectedLang,
      engine: 'mymemory'
    };
  }

  /**
   * Decodes basic HTML entities commonly returned by MyMemory.
   * @private
   */
  _decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&nbsp;/g, ' ');
  }
}

// Universal module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationService };
}

if (typeof global !== 'undefined') {
  global.TranslationService = TranslationService;
}
})(typeof window !== 'undefined' ? window : this);
