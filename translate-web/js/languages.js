/**
 * Danh sách các ngôn ngữ được hỗ trợ trong Translate Web
 * Mỗi ngôn ngữ gồm: code (ISO code), name (Tên tiếng Việt), nativeName (Tên bản địa)
 */
(function (global) {
const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Phát hiện ngôn ngữ', nativeName: 'Phát hiện ngôn ngữ' },
  { code: 'vi', name: 'Tiếng Việt', nativeName: 'Tiếng Việt' },
  { code: 'en', name: 'Tiếng Anh', nativeName: 'English' },
  { code: 'zh-CN', name: 'Tiếng Trung (Giản thể)', nativeName: '中文 (简体)' },
  { code: 'zh-TW', name: 'Tiếng Trung (Phồn thể)', nativeName: '中文 (繁體)' },
  { code: 'ja', name: 'Tiếng Nhật', nativeName: '日本語' },
  { code: 'ko', name: 'Tiếng Hàn', nativeName: '한국어' },
  { code: 'fr', name: 'Tiếng Pháp', nativeName: 'Français' },
  { code: 'de', name: 'Tiếng Đức', nativeName: 'Deutsch' },
  { code: 'es', name: 'Tiếng Tây Ban Nha', nativeName: 'Español' },
  { code: 'ru', name: 'Tiếng Nga', nativeName: 'Русский' },
  { code: 'it', name: 'Tiếng Ý', nativeName: 'Italiano' },
  { code: 'pt', name: 'Tiếng Bồ Đào Nha', nativeName: 'Português' },
  { code: 'th', name: 'Tiếng Thái', nativeName: 'ไทย' },
  { code: 'lo', name: 'Tiếng Lào', nativeName: 'ລາວ' },
  { code: 'km', name: 'Tiếng Khmer', nativeName: 'ភាសាខ្មែរ' },
  { code: 'id', name: 'Tiếng Indonesia', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Tiếng Mã Lai', nativeName: 'Bahasa Melayu' },
  { code: 'my', name: 'Tiếng Miến Điện', nativeName: 'မြန်မာဘာသာ' },
  { code: 'tl', name: 'Tiếng Filipino', nativeName: 'Filipino' },
  { code: 'hi', name: 'Tiếng Hindi', nativeName: 'हिन्दी' },
  { code: 'ar', name: 'Tiếng Ả Rập', nativeName: 'العربية' },
  { code: 'tr', name: 'Tiếng Thổ Nhĩ Kỳ', nativeName: 'Türkçe' },
  { code: 'nl', name: 'Tiếng Hà Lan', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Tiếng Ba Lan', nativeName: 'Polski' },
  { code: 'uk', name: 'Tiếng Ukraina', nativeName: 'Українська' },
  { code: 'el', name: 'Tiếng Hy Lạp', nativeName: 'Ελληνικά' },
  { code: 'he', name: 'Tiếng Do Thái', nativeName: 'עברית' },
  { code: 'sv', name: 'Tiếng Thụy Điển', nativeName: 'Svenska' },
  { code: 'no', name: 'Tiếng Na Uy', nativeName: 'Norsk' },
  { code: 'da', name: 'Tiếng Đan Mạch', nativeName: 'Dansk' },
  { code: 'fi', name: 'Tiếng Phần Lan', nativeName: 'Suomi' },
  { code: 'cs', name: 'Tiếng Séc', nativeName: 'Čeština' },
  { code: 'sk', name: 'Tiếng Slovak', nativeName: 'Slovenčina' },
  { code: 'hu', name: 'Tiếng Hungary', nativeName: 'Magyar' },
  { code: 'ro', name: 'Tiếng Romania', nativeName: 'Română' },
  { code: 'bg', name: 'Tiếng Bulgaria', nativeName: 'Български' },
  { code: 'sr', name: 'Tiếng Serbia', nativeName: 'Српски' },
  { code: 'hr', name: 'Tiếng Croatia', nativeName: 'Hrvatski' },
  { code: 'sl', name: 'Tiếng Slovenia', nativeName: 'Slovenščina' },
  { code: 'lt', name: 'Tiếng Litva', nativeName: 'Lietuvių' },
  { code: 'lv', name: 'Tiếng Latvia', nativeName: 'Latviešu' },
  { code: 'et', name: 'Tiếng Estonia', nativeName: 'Eesti' },
  { code: 'fa', name: 'Tiếng Ba Tư', nativeName: 'فارسی' },
  { code: 'ur', name: 'Tiếng Urdu', nativeName: 'اردو' },
  { code: 'bn', name: 'Tiếng Bengal', nativeName: 'বাংলা' },
  { code: 'ta', name: 'Tiếng Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Tiếng Telugu', nativeName: 'తెలుగు' },
  { code: 'mr', name: 'Tiếng Marathi', nativeName: 'मराठी' },
  { code: 'gu', name: 'Tiếng Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Tiếng Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Tiếng Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa', name: 'Tiếng Punjab', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'ne', name: 'Tiếng Nepal', nativeName: 'नेपाली' },
  { code: 'si', name: 'Tiếng Sinhala', nativeName: 'සිංහල' },
  { code: 'sw', name: 'Tiếng Swahili', nativeName: 'Kiswahili' },
  { code: 'af', name: 'Tiếng Afrikaans', nativeName: 'Afrikaans' },
  { code: 'sq', name: 'Tiếng Albania', nativeName: 'Shqip' },
  { code: 'am', name: 'Tiếng Amharic', nativeName: 'አማርኛ' },
  { code: 'hy', name: 'Tiếng Armenia', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Tiếng Azerbaijan', nativeName: 'Azərbaycan' },
  { code: 'eu', name: 'Tiếng Basque', nativeName: 'Euskara' },
  { code: 'be', name: 'Tiếng Belarus', nativeName: 'Беларуская' },
  { code: 'bs', name: 'Tiếng Bosnia', nativeName: 'Bosanski' },
  { code: 'ca', name: 'Tiếng Catalan', nativeName: 'Català' },
  { code: 'ceb', name: 'Tiếng Cebuano', nativeName: 'Sinugboanon' },
  { code: 'ny', name: 'Tiếng Chichewa', nativeName: 'Nyanja' },
  { code: 'co', name: 'Tiếng Corsica', nativeName: 'Corsu' },
  { code: 'cy', name: 'Tiếng Wales', nativeName: 'Cymraeg' },
  { code: 'eo', name: 'Tiếng Esperanto', nativeName: 'Esperanto' },
  { code: 'fy', name: 'Tiếng Frisia', nativeName: 'Frysk' },
  { code: 'gl', name: 'Tiếng Galicia', nativeName: 'Galego' },
  { code: 'ka', name: 'Tiếng Gruzia', nativeName: 'ქართული' },
  { code: 'ht', name: 'Tiếng Haiti Creole', nativeName: 'Kreyòl ayisyen' },
  { code: 'ha', name: 'Tiếng Hausa', nativeName: 'Harshen Hausa' },
  { code: 'haw', name: 'Tiếng Hawaii', nativeName: 'ʻŌlelo Hawaiʻi' },
  { code: 'hmn', name: 'Tiếng Hmong', nativeName: 'Hmoob' },
  { code: 'ig', name: 'Tiếng Igbo', nativeName: 'Asụsụ Igbo' },
  { code: 'is', name: 'Tiếng Iceland', nativeName: 'Íslenska' },
  { code: 'ga', name: 'Tiếng Ireland', nativeName: 'Gaeilge' },
  { code: 'jv', name: 'Tiếng Java', nativeName: 'Basa Jawa' },
  { code: 'kk', name: 'Tiếng Kazakh', nativeName: 'Қазақ тілі' },
  { code: 'rw', name: 'Tiếng Kinyarwanda', nativeName: 'Ikinyarwanda' },
  { code: 'ku', name: 'Tiếng Kurd', nativeName: 'Kurdî' },
  { code: 'ky', name: 'Tiếng Kyrgyz', nativeName: 'Кыргызча' },
  { code: 'la', name: 'Tiếng Latinh', nativeName: 'Latina' },
  { code: 'lb', name: 'Tiếng Luxembourg', nativeName: 'Lëtzebuergesch' },
  { code: 'mk', name: 'Tiếng Macedonia', nativeName: 'Македонски' },
  { code: 'mg', name: 'Tiếng Malagasy', nativeName: 'Malagasy' },
  { code: 'mt', name: 'Tiếng Malta', nativeName: 'Malti' },
  { code: 'mi', name: 'Tiếng Maori', nativeName: 'Te Reo Māori' },
  { code: 'mn', name: 'Tiếng Mông Cổ', nativeName: 'Монгол' },
  { code: 'ps', name: 'Tiếng Pashto', nativeName: 'پښتو' },
  { code: 'gd', name: 'Tiếng Gael Scotland', nativeName: 'Gàidhlig' },
  { code: 'st', name: 'Tiếng Sesotho', nativeName: 'Sesotho' },
  { code: 'sn', name: 'Tiếng Shona', nativeName: 'chiShona' },
  { code: 'sd', name: 'Tiếng Sindhi', nativeName: 'سنڌي' },
  { code: 'so', name: 'Tiếng Somali', nativeName: 'Soomaali' },
  { code: 'su', name: 'Tiếng Sunda', nativeName: 'Basa Sunda' },
  { code: 'tg', name: 'Tiếng Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'tt', name: 'Tiếng Tatar', nativeName: 'Татар' },
  { code: 'tk', name: 'Tiếng Turkmen', nativeName: 'Türkmençe' },
  { code: 'ug', name: 'Tiếng Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'uz', name: 'Tiếng Uzbek', nativeName: 'Oʻzbekcha' },
  { code: 'xh', name: 'Tiếng Xhosa', nativeName: 'isiXhosa' },
  { code: 'yi', name: 'Tiếng Yiddish', nativeName: 'ייִדיש' },
  { code: 'yo', name: 'Tiếng Yoruba', nativeName: 'Èdè Yorùbá' },
  { code: 'zu', name: 'Tiếng Zulu', nativeName: 'isiZulu' }
];

/**
 * Danh sách ngôn ngữ ghim nhanh trên thanh chọn nguồn
 */
const PINNED_SOURCE_LANGS = ['auto', 'vi', 'en', 'zh-CN', 'ja', 'ko'];

/**
 * Danh sách ngôn ngữ ghim nhanh trên thanh chọn đích
 */
const PINNED_TARGET_LANGS = ['en', 'vi', 'zh-CN', 'ja', 'ko', 'fr'];

/**
 * Tìm kiếm thông tin ngôn ngữ theo mã ISO code
 * @param {string} code - Mã ngôn ngữ (ví dụ: 'vi', 'en', 'auto')
 * @returns {object|null} Đối tượng ngôn ngữ hoặc null nếu không tìm thấy
 */
function getLanguageByCode(code) {
  if (!code) return null;
  const normalized = String(code).trim().toLowerCase();
  return SUPPORTED_LANGUAGES.find((lang) => lang.code.toLowerCase() === normalized) || null;
}

// Universal module export support (Node.js CommonJS & Browser global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUPPORTED_LANGUAGES,
    PINNED_SOURCE_LANGS,
    PINNED_TARGET_LANGS,
    getLanguageByCode
  };
}

if (typeof global !== 'undefined') {
  global.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
  global.PINNED_SOURCE_LANGS = PINNED_SOURCE_LANGS;
  global.PINNED_TARGET_LANGS = PINNED_TARGET_LANGS;
  global.getLanguageByCode = getLanguageByCode;
}
})(typeof window !== 'undefined' ? window : this);
