/**
 * LingoI18n - Multi-language UI localization & automatic locale detection
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'lingo_ui_lang';
  const LOCALE_API_URL = 'api/locale.php';

  const SUPPORTED_UI_LANGS = [
    { code: 'vi', label: 'Tiếng Việt', short: 'VI', targetLang: 'vi' },
    { code: 'en', label: 'English', short: 'EN', targetLang: 'en' },
    { code: 'ja', label: '日本語', short: 'JA', targetLang: 'ja' },
    { code: 'ko', label: '한국어', short: 'KO', targetLang: 'ko' },
    { code: 'zh', label: '中文', short: 'ZH', targetLang: 'zh-CN' },
    { code: 'fr', label: 'Français', short: 'FR', targetLang: 'fr' },
    { code: 'de', label: 'Deutsch', short: 'DE', targetLang: 'de' },
    { code: 'es', label: 'Español', short: 'ES', targetLang: 'es' }
  ];

  const TRANSLATIONS = {
    vi: {
      'nav.flashcards': 'Flashcards',
      'nav.history': 'Lịch sử',
      'nav.theme': 'Chuyển đổi giao diện sáng/tối',
      'nav.signin': 'Đăng nhập',
      'nav.signout': 'Đăng xuất',
      'nav.langLabel': 'Ngôn ngữ giao diện',
      'hero.eyebrow': 'Một chút ngôn ngữ, vạn dặm kết nối',
      'hero.titleLine1': 'Tìm đúng từng câu chữ,',
      'hero.titleLine2': 'dù bạn ở bất cứ đâu.',
      'hero.description': 'Không gian gọn nhẹ cho các mẫu câu hằng ngày và tra cứu từ điển. Nhập cụm từ quen thuộc hoặc chọn một gợi ý bên dưới.',
      'panel.sourceLabel': 'Nội dung của bạn',
      'panel.sourcePlaceholder': 'Nhập câu chữ, hoặc chọn một mẫu câu bên dưới…',
      'panel.translateBtn': 'Dịch cụm từ',
      'panel.clearBtn': 'Xóa',
      'panel.targetLabel': 'Bản dịch',
      'panel.liveStatus': '● Dịch trực tiếp',
      'panel.targetPlaceholder': 'Bản dịch sẽ hiển thị tại đây.',
      'phrase.title': 'Bắt đầu với một mẫu câu',
      'phrase.subtitle': 'Chạm vào một mẫu câu để xem bản dịch ngay.',
      'phrase.resetBtn': 'Mẫu mặc định',
      'phrase.note': 'Thêm một chút thấu hiểu, mở ra cả thế giới. Dịch từng câu chữ, khám phá nhiều hơn.',
      'dict.idle': 'Nhập hoặc chọn một từ tiếng Anh ở trên để xem nghĩa, phiên âm, ví dụ và từ đồng nghĩa...',
      'history.title': 'Lịch sử dịch',
      'history.all': 'Tất cả',
      'history.starred': 'Đã gắn sao',
      'history.clearAll': 'Xóa toàn bộ lịch sử',
      'flashcards.title': 'Flashcards',
      'footer.tagline': 'Kết nối mỗi ngày. Tiếng Việt, tiếng Anh — và nhiều ngôn ngữ khác.',
      'footer.groupLink': 'Trang Nhóm 11'
    },
    en: {
      'nav.flashcards': 'Flashcards',
      'nav.history': 'History',
      'nav.theme': 'Toggle light/dark theme',
      'nav.signin': 'Sign in',
      'nav.signout': 'Sign out',
      'nav.langLabel': 'Interface language',
      'hero.eyebrow': 'A little language goes a long way',
      'hero.titleLine1': 'Find the right words,',
      'hero.titleLine2': 'wherever you are.',
      'hero.description': 'A simple space for everyday phrases and instant dictionary lookup. Type a familiar expression or start with one below.',
      'panel.sourceLabel': 'Your words',
      'panel.sourcePlaceholder': 'Type a phrase, or choose an example below…',
      'panel.translateBtn': 'Translate phrase',
      'panel.clearBtn': 'Clear',
      'panel.targetLabel': 'Translation',
      'panel.liveStatus': '● Live translation',
      'panel.targetPlaceholder': 'Your translation will appear here.',
      'phrase.title': 'Start with a phrase',
      'phrase.subtitle': 'Tap one to see it translated.',
      'phrase.resetBtn': 'Default phrases',
      'phrase.note': 'A little understanding, a world of possibilities. Translate words, discover more.',
      'dict.idle': 'Enter or select an English word above to view definitions, phonetics, examples, and synonyms...',
      'history.title': 'Translation History',
      'history.all': 'All',
      'history.starred': 'Starred',
      'history.clearAll': 'Clear all history',
      'flashcards.title': 'Flashcards',
      'footer.tagline': 'Made for everyday connections. English & Vietnamese — and beyond.',
      'footer.groupLink': 'Group 11 Page'
    },
    ja: {
      'nav.flashcards': '単語帳',
      'nav.history': '履歴',
      'nav.theme': 'ライト/ダークテーマを切り替え',
      'nav.signin': 'ログイン',
      'nav.signout': 'ログアウト',
      'nav.langLabel': '表示言語',
      'hero.eyebrow': '少しの言葉で、世界が広がる',
      'hero.titleLine1': 'どこにいても、',
      'hero.titleLine2': 'ぴったりの言葉を。',
      'hero.description': '日常のフレーズと辞書検索のためのシンプルな空間。よく使う表現を入力するか、下の例から始めてみてください。',
      'panel.sourceLabel': 'あなたの言葉',
      'panel.sourcePlaceholder': 'フレーズを入力するか、下の例を選んでください…',
      'panel.translateBtn': 'フレーズを翻訳',
      'panel.clearBtn': 'クリア',
      'panel.targetLabel': '翻訳結果',
      'panel.liveStatus': '● リアルタイム翻訳',
      'panel.targetPlaceholder': '翻訳結果がここに表示されます。',
      'phrase.title': 'フレーズから始める',
      'phrase.subtitle': 'タップするとすぐに翻訳されます。',
      'phrase.resetBtn': '基本フレーズに戻す',
      'phrase.note': '少しの理解が、無限の可能性につながる。言葉を訳して、さらに発見しよう。',
      'dict.idle': '上の欄に英単語を入力または選択すると、意味・発音記号・例文・類義語が表示されます...',
      'history.title': '翻訳履歴',
      'history.all': 'すべて',
      'history.starred': 'お気に入り',
      'history.clearAll': '履歴をすべて削除',
      'flashcards.title': '単語カード',
      'footer.tagline': '毎日のつながりのために。英語・ベトナム語、そしてその先へ。',
      'footer.groupLink': 'グループ11 ページ'
    },
    ko: {
      'nav.flashcards': '플래시카드',
      'nav.history': '기록',
      'nav.theme': '라이트/다크 테마 전환',
      'nav.signin': '로그인',
      'nav.signout': '로그아웃',
      'nav.langLabel': '화면 언어',
      'hero.eyebrow': '작은 언어가 큰 연결을 만듭니다',
      'hero.titleLine1': '어디에 있든,',
      'hero.titleLine2': '알맞은 말을 찾아보세요.',
      'hero.description': '일상 표현과 사전 검색을 위한 깔끔한 공간입니다. 자주 쓰는 표현을 입력하거나 아래 예시로 시작해 보세요.',
      'panel.sourceLabel': '입력할 문장',
      'panel.sourcePlaceholder': '문구를 입력하거나 아래 예시를 선택하세요…',
      'panel.translateBtn': '문구 번역',
      'panel.clearBtn': '지우기',
      'panel.targetLabel': '번역',
      'panel.liveStatus': '● 실시간 번역',
      'panel.targetPlaceholder': '번역 결과가 여기에 표시됩니다.',
      'phrase.title': '예시 문구로 시작하기',
      'phrase.subtitle': '문구를 누르면 바로 번역됩니다.',
      'phrase.resetBtn': '기본 문구',
      'phrase.note': '작은 이해가 무한한 가능성을 엽니다. 단어를 번역하고 더 넓게 알아보세요.',
      'dict.idle': '위에서 영어 단어를 입력하거나 선택하면 뜻, 발음 기호, 예문 및 유의어를 볼 수 있습니다...',
      'history.title': '번역 기록',
      'history.all': '전체',
      'history.starred': '즐겨찾기',
      'history.clearAll': '모든 기록 지우기',
      'flashcards.title': '플래시카드',
      'footer.tagline': '일상의 소통을 위해. 영어와 베트남어, 그리고 더 많은 언어로.',
      'footer.groupLink': '11조 페이지'
    },
    zh: {
      'nav.flashcards': '记忆卡',
      'nav.history': '历史记录',
      'nav.theme': '切换浅色/深色主题',
      'nav.signin': '登录',
      'nav.signout': '退出登录',
      'nav.langLabel': '界面语言',
      'hero.eyebrow': '只言片语，连接世界',
      'hero.titleLine1': '无论身在何处，',
      'hero.titleLine2': '都能找到恰当的表达。',
      'hero.description': '一个简洁实用的日常短语与词典查询空间。输入常用表达，或从下方的示例开始体验。',
      'panel.sourceLabel': '输入文本',
      'panel.sourcePlaceholder': '输入短语，或从下方选择一个示例…',
      'panel.translateBtn': '翻译短语',
      'panel.clearBtn': '清空',
      'panel.targetLabel': '翻译结果',
      'panel.liveStatus': '● 实时翻译',
      'panel.targetPlaceholder': '翻译结果将显示在这里。',
      'phrase.title': '从常用短语开始',
      'phrase.subtitle': '点击任意短语即可查看翻译。',
      'phrase.resetBtn': '默认短语',
      'phrase.note': '多一分理解，多一片天地。翻译词句，探索更多精彩。',
      'dict.idle': '在上方输入或选择一个英语单词，即可查看释义、音标、例句和同义词...',
      'history.title': '翻译历史',
      'history.all': '全部',
      'history.starred': '已收藏',
      'history.clearAll': '清空全部历史',
      'flashcards.title': '单词记忆卡',
      'footer.tagline': '为日常交流而生。支持英语、越南语及更多语言。',
      'footer.groupLink': '第11组主页'
    },
    fr: {
      'nav.flashcards': 'Cartes mémo',
      'nav.history': 'Historique',
      'nav.theme': 'Changer le thème clair/sombre',
      'nav.signin': 'Connexion',
      'nav.signout': 'Déconnexion',
      'nav.langLabel': 'Langue de l’interface',
      'hero.eyebrow': 'Quelques mots ouvrent bien des portes',
      'hero.titleLine1': 'Trouvez les mots justes,',
      'hero.titleLine2': 'où que vous soyez.',
      'hero.description': 'Un espace épuré pour vos phrases du quotidien et la recherche lexicale. Saisissez une expression ou choisissez un exemple ci-dessous.',
      'panel.sourceLabel': 'Votre texte',
      'panel.sourcePlaceholder': 'Saisissez une phrase ou choisissez un exemple ci-dessous…',
      'panel.translateBtn': 'Traduire la phrase',
      'panel.clearBtn': 'Effacer',
      'panel.targetLabel': 'Traduction',
      'panel.liveStatus': '● Traduction en direct',
      'panel.targetPlaceholder': 'Votre traduction apparaîtra ici.',
      'phrase.title': 'Commencer avec une phrase',
      'phrase.subtitle': 'Touchez une expression pour voir sa traduction.',
      'phrase.resetBtn': 'Phrases par défaut',
      'phrase.note': 'Un peu de compréhension, tout un monde de possibilités. Traduisez et découvrez davantage.',
      'dict.idle': 'Saisissez ou sélectionnez un mot anglais ci-dessus pour voir sa définition, sa phonétique, des exemples et des synonymes...',
      'history.title': 'Historique des traductions',
      'history.all': 'Tout',
      'history.starred': 'Favoris',
      'history.clearAll': 'Tout effacer',
      'flashcards.title': 'Cartes mémo',
      'footer.tagline': 'Conçu pour les échanges du quotidien. Anglais, vietnamien et bien plus encore.',
      'footer.groupLink': 'Page du Groupe 11'
    },
    de: {
      'nav.flashcards': 'Lernkarten',
      'nav.history': 'Verlauf',
      'nav.theme': 'Helles/Dunkles Design wechseln',
      'nav.signin': 'Anmelden',
      'nav.signout': 'Abmelden',
      'nav.langLabel': 'Sprache der Oberfläche',
      'hero.eyebrow': 'Jedes Wort bringt uns ein Stück näher',
      'hero.titleLine1': 'Finde die richtigen Worte,',
      'hero.titleLine2': 'wo immer du bist.',
      'hero.description': 'Ein klarer Ort für alltägliche Redewendungen und das schnelle Nachschlagen im Wörterbuch. Gib einen Ausdruck ein oder starte unten mit einem Beispiel.',
      'panel.sourceLabel': 'Dein Text',
      'panel.sourcePlaceholder': 'Gib einen Satz ein oder wähle unten ein Beispiel…',
      'panel.translateBtn': 'Satz übersetzen',
      'panel.clearBtn': 'Leeren',
      'panel.targetLabel': 'Übersetzung',
      'panel.liveStatus': '● Live-Übersetzung',
      'panel.targetPlaceholder': 'Deine Übersetzung erscheint hier.',
      'phrase.title': 'Mit einem Satz starten',
      'phrase.subtitle': 'Tippe auf ein Beispiel, um die Übersetzung zu sehen.',
      'phrase.resetBtn': 'Standardsätze',
      'phrase.note': 'Ein wenig Verständnis eröffnet eine Welt voller Möglichkeiten. Übersetze Wörter und entdecke mehr.',
      'dict.idle': 'Gib oben ein englisches Wort ein oder wähle es aus, um Bedeutungen, Lautschrift, Beispiele und Synonyme zu sehen...',
      'history.title': 'Übersetzungsverlauf',
      'history.all': 'Alle',
      'history.starred': 'Markiert',
      'history.clearAll': 'Gesamten Verlauf löschen',
      'flashcards.title': 'Lernkarten',
      'footer.tagline': 'Gemacht für alltägliche Begegnungen. Englisch, Vietnamesisch und darüber hinaus.',
      'footer.groupLink': 'Gruppe-11-Seite'
    },
    es: {
      'nav.flashcards': 'Tarjetas',
      'nav.history': 'Historial',
      'nav.theme': 'Cambiar tema claro/oscuro',
      'nav.signin': 'Iniciar sesión',
      'nav.signout': 'Cerrar sesión',
      'nav.langLabel': 'Idioma de la interfaz',
      'hero.eyebrow': 'Unas pocas palabras llegan muy lejos',
      'hero.titleLine1': 'Encuentra las palabras exactas,',
      'hero.titleLine2': 'estés donde estés.',
      'hero.description': 'Un espacio sencillo para frases cotidianas y consultas rápidas de diccionario. Escribe una expresión o comienza con un ejemplo de abajo.',
      'panel.sourceLabel': 'Tu texto',
      'panel.sourcePlaceholder': 'Escribe una frase o elige un ejemplo de abajo…',
      'panel.translateBtn': 'Traducir frase',
      'panel.clearBtn': 'Limpiar',
      'panel.targetLabel': 'Traducción',
      'panel.liveStatus': '● Traducción en vivo',
      'panel.targetPlaceholder': 'Tu traducción aparecerá aquí.',
      'phrase.title': 'Empieza con una frase',
      'phrase.subtitle': 'Toca una para ver su traducción al instante.',
      'phrase.resetBtn': 'Frases predeterminadas',
      'phrase.note': 'Un poco de comprensión abre un mundo de posibilidades. Traduce palabras y descubre más.',
      'dict.idle': 'Escribe o selecciona una palabra en inglés arriba para ver definiciones, fonética, ejemplos y sinónimos...',
      'history.title': 'Historial de traducciones',
      'history.all': 'Todo',
      'history.starred': 'Destacados',
      'history.clearAll': 'Borrar todo el historial',
      'flashcards.title': 'Tarjetas de vocabulario',
      'footer.tagline': 'Hecho para conectar cada día. Inglés, vietnamita y muchos más.',
      'footer.groupLink': 'Página del Grupo 11'
    }
  };

  let currentLang = 'vi';
  let selectElement = null;
  let boundSelectEl = null;
  const listeners = new Set();
  const loadedFontKeys = new Set();

  const FONT_STYLESHEETS = {
    ja: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@500;600;700&display=swap',
    ko: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;600;700&display=swap',
    'zh-CN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;600;700&display=swap',
    'zh-TW': 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@500;600;700&display=swap',
    th: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap',
    ar: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap'
  };

  function normalizeFontKey(langCode) {
    if (!langCode || typeof langCode !== 'string') return null;
    const normalized = langCode.trim().replace(/_/g, '-').toLowerCase();
    if (!normalized || normalized === 'auto') return null;

    if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
    if (normalized === 'ko' || normalized.startsWith('ko-')) return 'ko';
    if (
      normalized === 'zh-tw' ||
      normalized === 'zh-hk' ||
      normalized === 'zh-mo' ||
      normalized === 'zh-hant' ||
      normalized.startsWith('zh-hant-')
    ) {
      return 'zh-TW';
    }
    if (
      normalized === 'zh' ||
      normalized === 'zh-cn' ||
      normalized === 'zh-sg' ||
      normalized === 'zh-hans' ||
      normalized.startsWith('zh-hans-') ||
      normalized.startsWith('zh-')
    ) {
      return 'zh-CN';
    }
    if (normalized === 'th' || normalized.startsWith('th-')) return 'th';
    if (normalized === 'ar' || normalized.startsWith('ar-')) return 'ar';
    return null;
  }

  function ensureFont(langCode) {
    const fontKey = normalizeFontKey(langCode);
    if (!fontKey || !FONT_STYLESHEETS[fontKey]) return false;
    if (loadedFontKeys.has(fontKey)) return true;
    if (typeof document === 'undefined' || !document.head) return false;

    if (typeof document.querySelector === 'function') {
      const existing = document.querySelector(`link[data-lingo-font="${fontKey}"]`);
      if (existing) {
        loadedFontKeys.add(fontKey);
        return true;
      }
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_STYLESHEETS[fontKey];
    link.setAttribute('data-lingo-font', fontKey);
    document.head.appendChild(link);
    loadedFontKeys.add(fontKey);
    return true;
  }

  function getLangMeta(code) {
    if (!code || typeof code !== 'string') return null;
    const lower = code.trim().toLowerCase();
    const direct = SUPPORTED_UI_LANGS.find((item) => item.code === lower);
    if (direct) return direct;
    const primary = lower.split(/[-_]/)[0];
    return SUPPORTED_UI_LANGS.find((item) => item.code === primary) || null;
  }

  function readSavedLanguage() {
    try {
      const saved = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      const meta = getLangMeta(saved);
      return meta ? meta.code : null;
    } catch (_) {
      return null;
    }
  }

  function writeSavedLanguage(code) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, code);
      }
    } catch (_) {}
  }

  function detectNavigatorLanguage() {
    if (typeof navigator === 'undefined') return 'vi';
    const list = Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : (navigator.language ? [navigator.language] : []);

    for (const tag of list) {
      const meta = getLangMeta(tag);
      if (meta) return meta.code;
    }
    return 'vi';
  }

  function t(key, fallback) {
    const langDict = TRANSLATIONS[currentLang] || TRANSLATIONS.vi;
    if (Object.prototype.hasOwnProperty.call(langDict, key)) {
      return langDict[key];
    }
    if (fallback !== undefined) {
      return fallback;
    }
    if (Object.prototype.hasOwnProperty.call(TRANSLATIONS.en, key)) {
      return TRANSLATIONS.en[key];
    }
    return key;
  }

  function applyTranslationsToDom() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = currentLang;
    ensureFont(currentLang);

    const textNodes = document.querySelectorAll('[data-i18n]');
    textNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key, el.textContent);
      }
    });

    const placeholderNodes = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.setAttribute('placeholder', t(key, el.getAttribute('placeholder') || ''));
      }
    });

    const titleNodes = document.querySelectorAll('[data-i18n-title]');
    titleNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.setAttribute('title', t(key, el.getAttribute('title') || ''));
      }
    });

    const ariaNodes = document.querySelectorAll('[data-i18n-aria-label]');
    ariaNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) {
        el.setAttribute('aria-label', t(key, el.getAttribute('aria-label') || ''));
      }
    });
  }

  function notifyListeners() {
    for (const cb of listeners) {
      try {
        cb(currentLang);
      } catch (err) {
        console.error('LingoI18n listener error:', err);
      }
    }
  }

  function setLanguage(code, isManual) {
    const meta = getLangMeta(code);
    if (!meta) return false;

    const changed = currentLang !== meta.code;
    currentLang = meta.code;

    if (isManual === true) {
      writeSavedLanguage(currentLang);
    }

    if (selectElement && selectElement.value !== currentLang) {
      selectElement.value = currentLang;
    }

    ensureFont(currentLang);
    applyTranslationsToDom();

    if (changed || isManual === true) {
      notifyListeners();
    }
    return true;
  }

  function populateSelect(selectEl) {
    if (!selectEl) return;
    selectElement = selectEl;
    selectEl.innerHTML = '';

    for (const lang of SUPPORTED_UI_LANGS) {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = `${lang.short} · ${lang.label}`;
      selectEl.appendChild(opt);
    }

    selectEl.value = currentLang;

    if (boundSelectEl !== selectEl) {
      boundSelectEl = selectEl;
      selectEl.addEventListener('change', (e) => {
        setLanguage(e.target.value, true);
      });
    }
  }

  function getLanguage() {
    return currentLang;
  }

  function onChange(cb) {
    if (typeof cb !== 'function') {
      return () => {};
    }
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function invokeLocaleReady(cb, payload) {
    if (typeof cb !== 'function') return;
    try {
      cb(payload);
    } catch (err) {
      console.error('LingoI18n onLocaleReady error:', err);
    }
  }

  function init({ selectEl, onLocaleReady } = {}) {
    const saved = readSavedLanguage();
    const initialLang = saved || detectNavigatorLanguage();
    currentLang = initialLang;

    if (selectEl) {
      populateSelect(selectEl);
    }

    ensureFont(currentLang);
    applyTranslationsToDom();
    notifyListeners();

    if (saved) {
      const meta = getLangMeta(saved);
      invokeLocaleReady(onLocaleReady, {
        uiLang: saved,
        targetLang: meta ? meta.targetLang : 'vi',
        countryCode: null,
        manual: true
      });
      return;
    }

    if (typeof fetch !== 'function') {
      const fallbackMeta = getLangMeta(initialLang);
      invokeLocaleReady(onLocaleReady, {
        uiLang: initialLang,
        targetLang: fallbackMeta ? fallbackMeta.targetLang : 'vi',
        countryCode: null,
        manual: false
      });
      return;
    }

    fetch(LOCALE_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (readSavedLanguage()) {
          return;
        }
        const detectedMeta = data && getLangMeta(data.uiLang);
        const uiLang = detectedMeta ? detectedMeta.code : currentLang;
        const targetLang = (data && typeof data.targetLang === 'string' && data.targetLang)
          || (detectedMeta ? detectedMeta.targetLang : 'vi');
        const countryCode = data && typeof data.countryCode === 'string' ? data.countryCode : null;

        setLanguage(uiLang, false);
        invokeLocaleReady(onLocaleReady, {
          uiLang,
          targetLang,
          countryCode,
          manual: false
        });
      })
      .catch(() => {
        if (readSavedLanguage()) {
          return;
        }
        const meta = getLangMeta(currentLang);
        invokeLocaleReady(onLocaleReady, {
          uiLang: currentLang,
          targetLang: meta ? meta.targetLang : 'vi',
          countryCode: null,
          manual: false
        });
      });
  }

  global.LingoI18n = {
    SUPPORTED_UI_LANGS,
    init,
    setLanguage,
    getLanguage,
    ensureFont,
    t,
    onChange
  };
})(window);
