import http from 'http';
import https from 'https';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getGoogleClientId,
  handleAuthGoogle,
  handleAuthGoogleCallback,
  handleAuthGoogleStart,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
  handleAuthRegister,
  sendJson
} from './auth-node.mjs';
import { handleHistory } from './history-db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Lazy-load Lens from chrome-lens-ocr
let lensInstance = null;
async function getLens() {
  if (!lensInstance) {
    const { default: Lens } = await import('chrome-lens-ocr');
    lensInstance = new Lens();
  }
  return lensInstance;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.jfif': 'image/jpeg'
};

const PORT = parseInt(process.env.PORT, 10) || 8080;

const DICTIONARY_CACHE_TTL_MS = 10 * 60 * 1000;
const DICTIONARY_CACHE_MAX = 500;
const dictionaryCache = new Map();

function emptyDictionaryPayload(word = '', lang = 'en') {
  return {
    word,
    lang,
    phonetic: '',
    audioUrl: '',
    meanings: [],
    synonyms: [],
    examples: [],
    relatedPhrases: [],
    contextParagraph: ''
  };
}

function normalizeLangCode(rawLang) {
  const clean = String(rawLang || '').trim().toLowerCase().replace(/_/g, '-');
  if (!clean) return 'en';
  if (clean === 'auto') return 'auto';
  if (clean === 'zh-cn' || clean === 'zh-hans' || clean === 'zh-sg') return 'zh-CN';
  if (clean === 'zh-tw' || clean === 'zh-hant' || clean === 'zh-hk' || clean === 'zh-mo') return 'zh-TW';
  const parts = clean.split('-');
  const base = (parts[0] || '').replace(/[^a-z]/g, '') || 'en';
  if (base === 'en') return 'en';
  if (parts[1]) {
    const region = parts[1].replace(/[^a-z0-9]/g, '').toUpperCase();
    if (region) return `${base}-${region}`;
  }
  return base;
}

function baseLangCode(lang) {
  return String(lang || 'en').trim().toLowerCase().split('-')[0] || 'en';
}

function isCjkNoSpaceLang(lang) {
  const base = baseLangCode(lang);
  return base === 'ja' || base === 'zh';
}

function normalizeSpace(text) {
  let str = String(text || '');
  if (typeof str.normalize === 'function') {
    str = str.normalize('NFC');
  }
  return str.replace(/\s+/g, ' ').trim();
}

function countWords(text) {
  const normalized = normalizeSpace(text);
  return normalized ? normalized.split(/\s+/).length : 0;
}

function ensureSentence(text, lang = 'en') {
  let cleaned = normalizeSpace(text);
  if (!cleaned) return '';
  if (/[.!?。！？]$/.test(cleaned)) {
    return cleaned;
  }
  if (/^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return isCjkNoSpaceLang(lang) ? `${cleaned}。` : `${cleaned}.`;
}

function lowercaseDefinitionStart(text, lang = 'en') {
  const cleaned = normalizeSpace(text).replace(/[.。\s]+$/, '');
  if (!cleaned) return '';
  const base = baseLangCode(lang);
  if (base === 'de' || base === 'ja' || base === 'zh' || base === 'ko') {
    return cleaned;
  }
  const chars = Array.from(cleaned);
  if (chars.length === 0) return '';
  const first = chars[0];
  const second = chars[1] || '';
  const firstLower = first.toLowerCase();
  const secondLower = second.toLowerCase();
  if (first !== firstLower && (!second || second === secondLower)) {
    return firstLower + chars.slice(1).join('');
  }
  return cleaned;
}

async function fetchDatamuseCollocations(word) {
  const result = { collocations: [], related: [] };
  const cleanWord = normalizeSpace(word).toLowerCase();
  if (!cleanWord) return result;

  try {
    const jjbUrl = `https://api.datamuse.com/words?rel_jjb=${encodeURIComponent(cleanWord)}&max=5`;
    const jjbRes = await fetch(jjbUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000)
    });

    if (jjbRes.ok) {
      const jjbData = await jjbRes.json();
      if (Array.isArray(jjbData)) {
        for (const item of jjbData) {
          const adj = typeof item?.word === 'string' ? normalizeSpace(item.word).toLowerCase() : '';
          if (!adj || adj === cleanWord || adj.includes(cleanWord) || countWords(adj) > 3) {
            continue;
          }
          result.collocations.push(`${adj} ${cleanWord}`);
        }
      }

      if (result.collocations.length === 0) {
        const mlUrl = `https://api.datamuse.com/words?ml=${encodeURIComponent(cleanWord)}&max=5`;
        const mlRes = await fetch(mlUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(2000)
        });
        if (mlRes.ok) {
          const mlData = await mlRes.json();
          if (Array.isArray(mlData)) {
            for (const item of mlData) {
              const rel = typeof item?.word === 'string' ? normalizeSpace(item.word).toLowerCase() : '';
              if (!rel || rel === cleanWord || countWords(rel) > 5) {
                continue;
              }
              result.related.push(rel);
            }
          }
        }
      }
    }
  } catch {
    return result;
  }

  return result;
}

function buildRelatedPhrases(word, collocations, mlRelated, examples, synonyms) {
  const phrases = [];
  const seen = new Set([normalizeSpace(word).toLowerCase()]);

  const addPhrase = (candidate) => {
    const clean = normalizeSpace(candidate).replace(/\.+$/, '');
    if (!clean) return false;
    const key = clean.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    phrases.push(clean);
    return true;
  };

  const shortExamples = [];
  for (const ex of examples) {
    if (typeof ex !== 'string') continue;
    const cleanEx = normalizeSpace(ex).replace(/\.+$/, '');
    const wc = countWords(cleanEx);
    if (wc >= 2 && wc <= 8) {
      shortExamples.push(cleanEx);
    }
  }

  const collocationPool = [...collocations, ...mlRelated];

  let colCount = 0;
  for (const phrase of collocationPool) {
    if (colCount >= 3 || phrases.length >= 6) break;
    if (addPhrase(phrase)) colCount++;
  }

  let exCount = 0;
  for (const exPhrase of shortExamples) {
    if (exCount >= 2 || phrases.length >= 6) break;
    if (addPhrase(exPhrase)) exCount++;
  }

  for (const syn of synonyms) {
    if (phrases.length >= 6) break;
    if (typeof syn === 'string') addPhrase(syn);
  }

  for (const phrase of collocationPool) {
    if (phrases.length >= 6) break;
    addPhrase(phrase);
  }

  for (const exPhrase of shortExamples) {
    if (phrases.length >= 6) break;
    addPhrase(exPhrase);
  }

  return phrases.slice(0, 6);
}

function buildContextParagraph(word, meanings, examples, synonyms, collocations, relatedPhrases) {
  if (meanings.length === 0 && examples.length === 0 && synonyms.length === 0) {
    return '';
  }

  const cleanWord = normalizeSpace(word);
  const wordLower = cleanWord.toLowerCase();
  const sentences = [];

  const firstMeaning = meanings[0];
  const primaryPos = typeof firstMeaning?.partOfSpeech === 'string'
    ? normalizeSpace(firstMeaning.partOfSpeech).toLowerCase()
    : '';
  const rawDef = firstMeaning?.definitions?.[0]?.definition;
  const primaryDef = typeof rawDef === 'string' ? lowercaseDefinitionStart(rawDef) : '';

  if (primaryDef) {
    if (primaryPos === 'noun') {
      sentences.push(ensureSentence(`In English, the noun "${cleanWord}" refers to ${primaryDef}`));
    } else if (primaryPos === 'verb') {
      const verbDef = primaryDef.startsWith('to ') ? primaryDef : `to ${primaryDef}`;
      sentences.push(ensureSentence(`In English, the verb "${cleanWord}" means ${verbDef}`));
    } else if (primaryPos) {
      sentences.push(ensureSentence(`In English, "${cleanWord}" (${primaryPos}) means ${primaryDef}`));
    } else {
      sentences.push(ensureSentence(`In English, "${cleanWord}" means ${primaryDef}`));
    }
  } else {
    sentences.push(ensureSentence(`In English, "${cleanWord}" is commonly used in everyday communication`));
  }

  let chosenExample = '';
  for (const ex of examples) {
    if (typeof ex !== 'string') continue;
    const normEx = normalizeSpace(ex);
    if (!normEx) continue;
    if (normEx.toLowerCase().includes(wordLower)) {
      chosenExample = normEx;
      break;
    }
    if (!chosenExample) chosenExample = normEx;
  }

  let usedCollocationInS2 = false;
  if (chosenExample) {
    sentences.push(ensureSentence(chosenExample));
  } else if (collocations.length >= 2) {
    usedCollocationInS2 = true;
    sentences.push(ensureSentence(
      `People often use "${cleanWord}" in natural expressions such as "${collocations[0]}" and "${collocations[1]}"`
    ));
  } else if (collocations.length === 1) {
    usedCollocationInS2 = true;
    sentences.push(ensureSentence(
      `You will often hear "${cleanWord}" used in common phrases like "${collocations[0]}"`
    ));
  } else if (relatedPhrases.length > 0) {
    sentences.push(ensureSentence(
      `You will often encounter "${cleanWord}" alongside expressions such as "${relatedPhrases[0]}"`
    ));
  } else {
    sentences.push(ensureSentence(
      `Learners frequently encounter "${cleanWord}" in both everyday conversation and written articles`
    ));
  }

  const unusedCollocation = !usedCollocationInS2 && collocations[0] ? collocations[0] : '';
  const s2Lower = (sentences[1] || '').toLowerCase();
  let chosenSynonym = '';
  for (const syn of synonyms) {
    if (typeof syn !== 'string') continue;
    const cleanSyn = normalizeSpace(syn);
    const synLower = cleanSyn.toLowerCase();
    if (!cleanSyn || synLower === wordLower || s2Lower.includes(synLower)) continue;
    chosenSynonym = cleanSyn;
    break;
  }

  if (unusedCollocation && chosenSynonym) {
    sentences.push(ensureSentence(
      `Depending on the context, speakers also use phrases like "${unusedCollocation}" or a related term such as "${chosenSynonym}"`
    ));
  } else if (unusedCollocation) {
    sentences.push(ensureSentence(
      `In practice, it frequently appears in combinations like "${unusedCollocation}"`
    ));
  } else if (chosenSynonym) {
    sentences.push(ensureSentence(
      `Depending on the context, "${chosenSynonym}" can serve as a close alternative to "${cleanWord}"`
    ));
  }

  return sentences.filter(Boolean).join(' ');
}

function normalizeDictionaryEntries(entries, fallbackWord) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return emptyDictionaryPayload(fallbackWord);
  }

  const primary = entries[0] || {};
  let phonetic = typeof primary.phonetic === 'string' ? primary.phonetic.trim() : '';
  let audioUrl = '';

  for (const entry of entries) {
    if (!phonetic && typeof entry?.phonetic === 'string' && entry.phonetic.trim()) {
      phonetic = entry.phonetic.trim();
    }
    if (Array.isArray(entry?.phonetics)) {
      for (const p of entry.phonetics) {
        if (!phonetic && typeof p?.text === 'string' && p.text.trim()) {
          phonetic = p.text.trim();
        }
        if (!audioUrl && typeof p?.audio === 'string' && p.audio.trim()) {
          const rawAudio = p.audio.trim();
          audioUrl = rawAudio.startsWith('//') ? `https:${rawAudio}` : rawAudio;
        }
      }
    }
  }

  const meanings = [];
  const synonymSet = new Set();
  const exampleSet = new Set();

  for (const entry of entries) {
    if (!Array.isArray(entry?.meanings)) continue;
    for (const m of entry.meanings) {
      const partOfSpeech = typeof m?.partOfSpeech === 'string' ? m.partOfSpeech.trim() : '';
      if (Array.isArray(m?.synonyms)) {
        for (const s of m.synonyms) {
          if (typeof s === 'string' && s.trim()) synonymSet.add(s.trim());
        }
      }

      const defs = [];
      if (Array.isArray(m?.definitions)) {
        for (const d of m.definitions) {
          const definition = typeof d?.definition === 'string' ? d.definition.trim() : '';
          const example = typeof d?.example === 'string' ? d.example.trim() : '';
          if (definition) {
            defs.push({ definition, example });
          }
          if (example) {
            exampleSet.add(example);
          }
          if (Array.isArray(d?.synonyms)) {
            for (const s of d.synonyms) {
              if (typeof s === 'string' && s.trim()) synonymSet.add(s.trim());
            }
          }
          if (defs.length >= 4) break;
        }
      }

      if (partOfSpeech || defs.length > 0) {
        meanings.push({ partOfSpeech, definitions: defs });
      }
    }
  }

  return {
    word: (typeof primary.word === 'string' && primary.word.trim()) || fallbackWord,
    phonetic,
    audioUrl,
    meanings: meanings.slice(0, 6),
    synonyms: Array.from(synonymSet).slice(0, 12),
    examples: Array.from(exampleSet).slice(0, 8)
  };
}

function cleanSynonymCandidate(text) {
  return normalizeSpace(text).replace(/[.!?。！？,;:]+$/g, '').trim();
}

function stripHtmlTags(text) {
  return String(text || '').replace(/<[^>]+>/g, '');
}

async function translateViaGt(text, sl, tl, timeoutMs = 2500) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(clean)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return '';
    const data = await res.json();
    if (!Array.isArray(data?.[0])) return '';
    let out = '';
    for (const seg of data[0]) {
      if (Array.isArray(seg) && typeof seg[0] === 'string') {
        out += seg[0];
      }
    }
    out = out.trim();
    return typeof out.normalize === 'function' ? out.normalize('NFC') : out;
  } catch {
    return '';
  }
}

async function fetchGtRich(word, sl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=en&dt=t&dt=bd&dt=md&dt=ss&dt=ex&dt=rw&q=${encodeURIComponent(word)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function extractGtRich(gtData, word, requestedLang) {
  let resolvedLang = requestedLang;
  if (requestedLang === 'auto' && typeof gtData[2] === 'string' && gtData[2].trim()) {
    resolvedLang = normalizeLangCode(gtData[2]);
  }
  if (resolvedLang === 'auto') {
    resolvedLang = 'en';
  }

  let enTranslation = '';
  if (Array.isArray(gtData[0])) {
    for (const seg of gtData[0]) {
      if (Array.isArray(seg) && typeof seg[0] === 'string') {
        enTranslation += seg[0];
      }
    }
  }
  enTranslation = normalizeSpace(enTranslation);

  const wordLower = normalizeSpace(word).toLowerCase();
  const synonymMap = new Map();
  const addSynonym = (candidate) => {
    const clean = cleanSynonymCandidate(candidate);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (key === wordLower || synonymMap.has(key)) return;
    synonymMap.set(key, clean);
  };

  if (Array.isArray(gtData[1])) {
    for (const entry of gtData[1]) {
      if (!Array.isArray(entry?.[2])) continue;
      for (const rev of entry[2]) {
        if (!Array.isArray(rev?.[1])) continue;
        for (const nativeSyn of rev[1]) {
          if (typeof nativeSyn === 'string') addSynonym(nativeSyn);
        }
      }
    }
  }

  if (Array.isArray(gtData[11])) {
    for (const ssGroup of gtData[11]) {
      if (!Array.isArray(ssGroup?.[1])) continue;
      for (const synsetItem of ssGroup[1]) {
        if (!Array.isArray(synsetItem?.[0])) continue;
        for (const nativeSyn of synsetItem[0]) {
          if (typeof nativeSyn === 'string') addSynonym(nativeSyn);
        }
      }
    }
  }

  if (Array.isArray(gtData[14])) {
    for (const rwEntry of gtData[14]) {
      if (Array.isArray(rwEntry)) {
        for (const rwWord of rwEntry) {
          if (typeof rwWord === 'string') addSynonym(rwWord);
        }
      } else if (typeof rwEntry === 'string') {
        addSynonym(rwEntry);
      }
    }
  }

  const meanings = [];
  const exampleMap = new Map();
  const addExample = (candidate) => {
    const clean = normalizeSpace(stripHtmlTags(candidate));
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!exampleMap.has(key)) exampleMap.set(key, clean);
  };

  if (Array.isArray(gtData[12])) {
    for (const mdGroup of gtData[12]) {
      if (!Array.isArray(mdGroup)) continue;
      const pos = typeof mdGroup[0] === 'string' ? normalizeSpace(mdGroup[0]) : '';
      const defs = [];
      if (Array.isArray(mdGroup[1])) {
        for (const defEntry of mdGroup[1]) {
          if (!Array.isArray(defEntry)) continue;
          const defText = typeof defEntry[0] === 'string' ? normalizeSpace(defEntry[0]) : '';
          const exText = typeof defEntry[2] === 'string' ? normalizeSpace(stripHtmlTags(defEntry[2])) : '';
          if (defText) {
            defs.push({ definition: defText, example: exText });
          }
          if (exText) {
            addExample(exText);
          }
          if (defs.length >= 4) break;
        }
      }
      if (defs.length > 0) {
        meanings.push({ partOfSpeech: pos, definitions: defs });
      }
      if (meanings.length >= 6) break;
    }
  }

  if (Array.isArray(gtData[13]?.[0])) {
    for (const exEntry of gtData[13][0]) {
      if (Array.isArray(exEntry) && typeof exEntry[0] === 'string') {
        addExample(exEntry[0]);
      }
    }
  }

  return {
    resolvedLang,
    enTranslation,
    meanings: meanings.slice(0, 6),
    synonyms: Array.from(synonymMap.values()).slice(0, 12),
    examples: Array.from(exampleMap.values()).slice(0, 8)
  };
}

function isWikiSkipHeading(heading) {
  const h = normalizeSpace(heading).toLowerCase();
  const skipTerms = [
    'từ nguyên', 'etymology', 'étymologie', 'herkunft', 'etimología', '語源', '어원', '詞源', '词源', '字源',
    'cách phát âm', 'phát âm', 'pronunciation', 'prononciation', 'aussprache', 'pronunciación', '発音', '발음', '發音', '发音', '讀音', '读音',
    'tham khảo', 'xem thêm', 'liên kết', 'tài liệu', 'ghi chú', 'chú thích', 'đọc thêm',
    'see also', 'references', 'external links', 'further reading', 'usage notes', 'anagrams',
    'đồng nghĩa', 'trái nghĩa', 'synonyms', 'antonyms', 'synonymes', 'synonyme', 'sinónimos',
    'derived terms', 'related terms', 'related', 'translations', 'traductions', 'übersetzungen', 'traducciones',
    '同義詞', '同义词', '反義詞', '反义词', '相關詞', '相关词', '衍生詞', '派生詞', '관련 어휘', '유의어', '반의어', '類義語', '対義語', '関連語', '翻訳', '翻译',
    'variantes', 'conjugaison', 'flexion', 'deklination', 'conjugación', 'declension', 'conjugation', 'cách viết khác', 'biến thể'
  ];
  return skipTerms.some((term) => h.includes(term));
}

function selectWiktionarySection(extract, lang) {
  const base = baseLangCode(lang);
  const langKeywords = {
    vi: ['tiếng việt', 'vietnamese'],
    ja: ['日本語', 'japanese'],
    ko: ['한국어', 'korean'],
    zh: ['漢語', '汉语', '中文', 'chinese', '官話', '官话'],
    fr: ['français', 'french'],
    de: ['deutsch', 'german'],
    es: ['español', 'spanish'],
    en: ['english', 'tiếng anh']
  };

  const lines = String(extract || '').split(/\r\n|\r|\n/);
  const sections = [];
  let currentHeading = '';
  let currentLines = [];

  for (const line of lines) {
    const m = /^==\s*([^=]+?)\s*==\s*$/.exec(line);
    if (m) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, body: currentLines.join('\n') });
      }
      currentHeading = m[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: currentLines.join('\n') });
  }

  const keywords = langKeywords[base] || [base];
  for (const sec of sections) {
    if (!sec.heading) continue;
    const hLower = sec.heading.toLowerCase();
    if (keywords.some((kw) => hLower.includes(kw))) {
      return sec.body;
    }
  }

  for (const sec of sections) {
    if (sec.heading && sec.body.trim()) {
      return sec.body;
    }
  }

  return extract;
}

function parseWiktionaryExtract(extract, word, lang, pageTitle = '') {
  const sectionBody = selectWiktionarySection(extract, lang);
  const lines = String(sectionBody || '').split(/\r\n|\r|\n/);
  const wordLower = normalizeSpace(word).toLowerCase();
  const titleLower = normalizeSpace(pageTitle).toLowerCase();
  const base = baseLangCode(lang);
  const isCjk = base === 'ja' || base === 'ko' || base === 'zh';
  const hasAnySubHeading = /^={3,5}\s*[^=]+?\s*={3,5}\s*$/mu.test(sectionBody);

  const meanings = [];
  let currentPos = '';
  let currentDefs = [];
  let skipSection = false;

  const flushPos = () => {
    if (currentDefs.length > 0) {
      meanings.push({
        partOfSpeech: currentPos,
        definitions: currentDefs.slice(0, 3)
      });
    }
    currentDefs = [];
  };

  for (const rawLine of lines) {
    const line = normalizeSpace(rawLine);
    if (!line) continue;

    const hm = /^(={3,5})\s*(.+?)\s*={3,5}$/.exec(line);
    if (hm) {
      const heading = hm[2].trim();
      const isSubHeading = hm[1].length >= 4;
      if (isWikiSkipHeading(heading)) {
        if (!isSubHeading) {
          flushPos();
          currentPos = '';
        }
        skipSection = true;
      } else {
        flushPos();
        currentPos = heading;
        skipSection = false;
      }
      continue;
    }

    if (skipSection) continue;
    if (hasAnySubHeading && !currentPos) continue;

    const clean = normalizeSpace(line.replace(/^(?:\d+[.)]\s*|[#*•\-–—]+\s*)/, ''));
    if (!clean || clean.length < 2) continue;

    const cleanLower = clean.toLowerCase();
    if (cleanLower === wordLower || (titleLower && cleanLower === titleLower)) continue;
    if ((cleanLower.startsWith(`${wordLower} (`) || (titleLower && cleanLower.startsWith(`${titleLower} (`))) && Array.from(clean).length <= 45) {
      continue;
    }
    if ((cleanLower.startsWith(wordLower) || (titleLower && cleanLower.startsWith(titleLower))) && (clean.includes('\\') || clean.includes('/'))) {
      continue;
    }
    if (/^(?:어원:|発音:|IPA|Bản mẫu:|Cách viết khác:|Chữ Hán:|Từ đồng nghĩa:|Đồng nghĩa:|Trái nghĩa:|Xem thêm:|出自：|http)/i.test(clean)) {
      continue;
    }
    if (clean.includes('IPA(') || clean.includes('발음:') || clean.includes('[漢語拼音]') || clean.includes('[現代標準漢語') || clean.includes('[文言文') || clean.includes('―')) {
      continue;
    }
    if (clean.includes('Hồ Ngọc Đức') || clean.includes('Dự án Từ điển')) {
      continue;
    }
    if (isCjk && /^[a-zA-ZÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s,.;:!?()[\]'"\-—]+$/.test(clean)) {
      continue;
    }

    if (currentDefs.length < 3) {
      currentDefs.push({ definition: clean, example: '' });
    }
    if (meanings.length >= 4) break;
  }

  flushPos();
  return meanings.slice(0, 4);
}

async function fetchWiktionaryMeanings(word, lang) {
  const wikiLang = baseLangCode(lang);
  if (!/^[a-z]{2,3}$/.test(wikiLang)) return [];

  const candidates = [word];
  const lower = word.toLowerCase();
  if (lower && lower !== word) candidates.push(lower);

  for (const title of candidates) {
    const url = `https://${wikiLang}.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=1200&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LingoStudio/1.0'
        },
        signal: AbortSignal.timeout(2500)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages || typeof pages !== 'object') continue;
      for (const [pageId, page] of Object.entries(pages)) {
        if (pageId === '-1' || !page || typeof page.extract !== 'string' || !page.extract.trim()) continue;
        const parsed = parseWiktionaryExtract(page.extract, title, lang, typeof page.title === 'string' ? page.title : '');
        if (parsed.length > 0) return parsed;
      }
    } catch {
      continue;
    }
  }

  return [];
}

async function buildMultilangRelatedPhrases(word, lang, enTranslation, synonyms, examples) {
  const phrases = [];
  const wordLower = normalizeSpace(word).toLowerCase();
  const seen = new Set([wordLower]);

  const addPhrase = (candidate) => {
    const clean = cleanSynonymCandidate(candidate);
    if (!clean) return false;
    const key = clean.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    phrases.push(clean);
    return true;
  };

  const cjkNoSpace = isCjkNoSpaceLang(lang);
  const shortExamples = [];
  for (const ex of examples) {
    if (typeof ex !== 'string') continue;
    const cleanEx = cleanSynonymCandidate(ex);
    if (!cleanEx) continue;
    if (cjkNoSpace) {
      const len = Array.from(cleanEx).length;
      if (len >= 2 && len <= 20) shortExamples.push(cleanEx);
    } else {
      const wc = countWords(cleanEx);
      if (wc >= 2 && wc <= 10 && cleanEx.length <= 80) shortExamples.push(cleanEx);
    }
  }

  for (const syn of synonyms) {
    if (phrases.length >= 4) break;
    if (typeof syn === 'string') addPhrase(syn);
  }

  for (const exPhrase of shortExamples) {
    if (phrases.length >= 6) break;
    addPhrase(exPhrase);
  }

  if (phrases.length < 4 && enTranslation) {
    let cleanEn = cleanSynonymCandidate(enTranslation).toLowerCase();
    if (cleanEn.startsWith('to ')) cleanEn = cleanEn.slice(3).trim();
    if (cleanEn && cleanEn !== wordLower && /^[a-z][a-z\s-]{0,40}$/.test(cleanEn)) {
      const datamuse = await fetchDatamuseCollocations(cleanEn);
      const enCollocations = (datamuse.collocations.length > 0 ? datamuse.collocations : datamuse.related).slice(0, 4);
      if (enCollocations.length > 0) {
        const translatedBatch = await translateViaGt(enCollocations.join('\n'), 'en', lang, 2500);
        if (translatedBatch) {
          const lines = translatedBatch.split(/\r\n|\r|\n/);
          lines.forEach((line, idx) => {
            if (phrases.length >= 6) return;
            const cleanLine = cleanSynonymCandidate(line);
            if (!cleanLine) return;
            const origEn = (enCollocations[idx] || '').toLowerCase();
            if (origEn && cleanLine.toLowerCase() === origEn && baseLangCode(lang) !== 'en') return;
            addPhrase(cleanLine);
          });
        }
      }
    }
  }

  for (const syn of synonyms) {
    if (phrases.length >= 6) break;
    if (typeof syn === 'string') addPhrase(syn);
  }

  return phrases.slice(0, 6);
}

async function buildMultilangContextParagraph(word, lang, meanings, examples, synonyms, relatedPhrases) {
  if (meanings.length === 0 && examples.length === 0 && synonyms.length === 0 && relatedPhrases.length === 0) {
    return '';
  }

  const cleanWord = normalizeSpace(word);
  const wordLower = cleanWord.toLowerCase();
  const base = baseLangCode(lang);

  const rawDef = meanings[0]?.definitions?.[0]?.definition;
  const primaryDef = typeof rawDef === 'string' ? lowercaseDefinitionStart(rawDef, lang) : '';

  let chosenExample = '';
  for (const ex of examples) {
    if (typeof ex !== 'string') continue;
    const normEx = normalizeSpace(ex);
    if (!normEx) continue;
    if (normEx.toLowerCase().includes(wordLower)) {
      chosenExample = normEx;
      break;
    }
    if (!chosenExample) chosenExample = normEx;
  }

  const phrasesPool = [];
  const seenPool = new Set([wordLower]);
  for (const item of [...relatedPhrases, ...synonyms]) {
    if (typeof item !== 'string') continue;
    const cleanItem = cleanSynonymCandidate(item);
    if (!cleanItem) continue;
    const key = cleanItem.toLowerCase();
    if (seenPool.has(key)) continue;
    seenPool.add(key);
    phrasesPool.push(cleanItem);
  }

  const p1 = phrasesPool[0] || '';
  const p2 = phrasesPool[1] || '';
  const s2Lower = chosenExample.toLowerCase();
  let unusedAlt = '';
  for (const cand of phrasesPool) {
    if (!chosenExample && (cand === p1 || cand === p2)) continue;
    if (s2Lower && s2Lower.includes(cand.toLowerCase())) continue;
    unusedAlt = cand;
    break;
  }

  const sentences = [];
  const templateLang = lang === 'zh-TW' ? 'zh-TW' : (base === 'zh' ? 'zh-CN' : base);

  switch (templateLang) {
    case 'vi':
      sentences.push(primaryDef
        ? ensureSentence(`Trong tiếng Việt, "${cleanWord}" có nghĩa là ${primaryDef}`, lang)
        : ensureSentence(`Trong tiếng Việt, "${cleanWord}" là một cách diễn đạt quen thuộc thường được dùng trong giao tiếp hằng ngày`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`Người bản ngữ thường dùng "${cleanWord}" cùng với các cách nói liên quan như "${p1}" hoặc "${p2}"`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`Bạn sẽ thường gặp "${cleanWord}" đi kèm hoặc thay thế cho cách diễn đạt như "${p1}"`, lang));
      } else {
        sentences.push(ensureSentence(`Cách nói "${cleanWord}" xuất hiện phổ biến trong cả hội thoại hằng ngày lẫn văn bản viết`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`Tùy theo ngữ cảnh, "${unusedAlt}" cũng có thể được sử dụng như một lựa chọn gần nghĩa hoặc bổ trợ cho "${cleanWord}"`, lang));
      }
      break;

    case 'ja':
      sentences.push(primaryDef
        ? ensureSentence(`日本語で「${cleanWord}」は「${primaryDef}」という意味で使われます`, lang)
        : ensureSentence(`日本語で「${cleanWord}」は、日常会話や文章の中でよく使われる表現です`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`文脈に応じて、「${p1}」や「${p2}」といった関連表現と一緒に使われることがよくあります`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`実際の会話では、「${p1}」などの表現とあわせて用いられることがあります`, lang));
      } else {
        sentences.push(ensureSentence(`話し言葉から書き言葉まで、幅広い場面で「${cleanWord}」が用いられます`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`場面によっては、「${unusedAlt}」が「${cleanWord}」に近い言い換えとして使われます`, lang));
      }
      break;

    case 'ko':
      sentences.push(primaryDef
        ? ensureSentence(`한국어에서 "${cleanWord}" 표현은 "${primaryDef}"의 의미로 쓰입니다`, lang)
        : ensureSentence(`한국어에서 "${cleanWord}" 표현은 일상 대화와 글에서 자주 쓰입니다`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`실제 문맥에서는 "${p1}", "${p2}" 같은 관련 표현과 함께 자주 사용됩니다`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`실제 문맥에서는 "${p1}" 같은 표현과 함께 자주 사용됩니다`, lang));
      } else {
        sentences.push(ensureSentence(`이 표현은 일상 회화와 다양한 글에서 자연스럽게 접할 수 있습니다`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`상황에 따라 "${unusedAlt}" 표현을 비슷한 의미로 대신 사용할 수도 있습니다`, lang));
      }
      break;

    case 'zh-CN':
      sentences.push(primaryDef
        ? ensureSentence(`在汉语中，“${cleanWord}”的意思是${primaryDef}`, lang)
        : ensureSentence(`在汉语中，“${cleanWord}”是一个在日常交流和书面语中经常使用的词语`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`在实际表达中，它常与“${p1}”和“${p2}”等相关表达搭配使用`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`在实际表达中，它常与“${p1}”等表达一起出现`, lang));
      } else {
        sentences.push(ensureSentence(`这个词语在日常对话和各类文章中都很常见`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`根据语境的不同，“${unusedAlt}”也可以作为“${cleanWord}”的近义或相关表达`, lang));
      }
      break;

    case 'zh-TW':
      sentences.push(primaryDef
        ? ensureSentence(`在漢語中，「${cleanWord}」的意思是${primaryDef}`, lang)
        : ensureSentence(`在漢語中，「${cleanWord}」是一個在日常交流和書面語中經常使用的詞語`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`在實際表達中，它常與「${p1}」和「${p2}」等相關表達搭配使用`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`在實際表達中，它常與「${p1}」等表達一起出現`, lang));
      } else {
        sentences.push(ensureSentence(`這個詞語在日常對話和各類文章中都很常見`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`根據語境的不同，「${unusedAlt}」也可以作為「${cleanWord}」的近義或相關表達`, lang));
      }
      break;

    case 'fr':
      sentences.push(primaryDef
        ? ensureSentence(`En français, « ${cleanWord} » signifie ${primaryDef}`, lang)
        : ensureSentence(`En français, « ${cleanWord} » est une expression couramment employée dans la communication quotidienne`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`Dans l'usage courant, on emploie souvent « ${cleanWord} » avec des expressions proches comme « ${p1} » et « ${p2} »`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`On rencontre fréquemment « ${cleanWord} » aux côtés d'expressions comme « ${p1} »`, lang));
      } else {
        sentences.push(ensureSentence(`Ce terme apparaît aussi bien à l'oral que dans les textes écrits`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`Selon le contexte, « ${unusedAlt} » peut servir d'alternative proche à « ${cleanWord} »`, lang));
      }
      break;

    case 'de':
      sentences.push(primaryDef
        ? ensureSentence(`Im Deutschen bedeutet „${cleanWord}“ ${primaryDef}`, lang)
        : ensureSentence(`Im Deutschen wird „${cleanWord}“ häufig in der Alltagssprache und in Texten verwendet`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`Im natürlichen Sprachgebrauch wird „${cleanWord}“ oft zusammen mit Ausdrücken wie „${p1}“ und „${p2}“ verwendet`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`Man begegnet „${cleanWord}“ häufig im Zusammenhang mit Ausdrücken wie „${p1}“`, lang));
      } else {
        sentences.push(ensureSentence(`Dieser Ausdruck kommt sowohl in Gesprächen als auch in geschriebenen Texten vor`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`Je nach Kontext kann „${unusedAlt}“ als sinnverwandte Alternative zu „${cleanWord}“ dienen`, lang));
      }
      break;

    case 'es':
      sentences.push(primaryDef
        ? ensureSentence(`En español, «${cleanWord}» significa ${primaryDef}`, lang)
        : ensureSentence(`En español, «${cleanWord}» es una expresión de uso frecuente en la comunicación diaria`, lang));
      if (chosenExample) {
        sentences.push(ensureSentence(chosenExample, lang));
      } else if (p1 && p2) {
        sentences.push(ensureSentence(`En el uso cotidiano, «${cleanWord}» suele aparecer junto a expresiones como «${p1}» y «${p2}»`, lang));
      } else if (p1) {
        sentences.push(ensureSentence(`Es común encontrar «${cleanWord}» acompañado de frases como «${p1}»`, lang));
      } else {
        sentences.push(ensureSentence(`Esta expresión se utiliza habitualmente tanto en conversaciones como en textos escritos`, lang));
      }
      if (unusedAlt) {
        sentences.push(ensureSentence(`Según el contexto, «${unusedAlt}» puede funcionar como una alternativa cercana a «${cleanWord}»`, lang));
      }
      break;

    default: {
      const enSentences = [];
      enSentences.push(primaryDef
        ? ensureSentence(`The expression "${cleanWord}" means ${primaryDef}`)
        : ensureSentence(`The expression "${cleanWord}" is commonly used in everyday communication`));
      if (chosenExample) {
        enSentences.push(ensureSentence(chosenExample));
      } else if (p1 && p2) {
        enSentences.push(ensureSentence(`Speakers often use "${cleanWord}" alongside related expressions such as "${p1}" and "${p2}"`));
      } else if (p1) {
        enSentences.push(ensureSentence(`You will often encounter "${cleanWord}" with phrases like "${p1}"`));
      } else {
        enSentences.push(ensureSentence(`It appears naturally in both spoken conversation and written texts`));
      }
      if (unusedAlt) {
        enSentences.push(ensureSentence(`Depending on the context, "${unusedAlt}" can serve as a close alternative to "${cleanWord}"`));
      }
      const enTemplate = enSentences.filter(Boolean).join(' ');
      const translated = await translateViaGt(enTemplate, 'en', lang, 2500);
      return translated || enTemplate;
    }
  }

  const sep = isCjkNoSpaceLang(lang) ? '' : ' ';
  return sentences.filter(Boolean).join(sep);
}

function setDictionaryCache(key, status, data) {
  if (dictionaryCache.size >= DICTIONARY_CACHE_MAX) {
    const oldestKey = dictionaryCache.keys().next().value;
    if (oldestKey !== undefined) dictionaryCache.delete(oldestKey);
  }
  dictionaryCache.set(key, {
    status,
    data,
    expiresAt: Date.now() + DICTIONARY_CACHE_TTL_MS
  });
}

async function handleDictionary(req, res, parsedUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const rawWord = (parsedUrl.searchParams.get('word') || '').trim();
  const rawLang = normalizeLangCode(parsedUrl.searchParams.get('lang') || 'en');

  if (!rawWord || Array.from(rawWord).length > 100) {
    sendJson(res, 400, {
      error: rawWord ? 'Word is too long' : 'Missing word parameter',
      ...emptyDictionaryPayload(rawWord, rawLang)
    });
    return;
  }

  const normalizedKey = `${rawLang}:${rawWord.toLowerCase()}`;
  const cached = dictionaryCache.get(normalizedKey);
  if (cached && cached.expiresAt > Date.now()) {
    sendJson(res, cached.status, cached.data);
    return;
  }
  if (cached) {
    dictionaryCache.delete(normalizedKey);
  }

  let resolvedLang = rawLang;
  let gtRichExtracted = null;

  if (rawLang !== 'en') {
    const gtData = await fetchGtRich(rawWord, rawLang);
    if (Array.isArray(gtData)) {
      gtRichExtracted = extractGtRich(gtData, rawWord, rawLang);
      resolvedLang = gtRichExtracted.resolvedLang;
    } else if (resolvedLang === 'auto') {
      resolvedLang = 'en';
    }
  }

  if (resolvedLang !== 'en') {
    let meanings = gtRichExtracted ? gtRichExtracted.meanings : [];
    const synonyms = gtRichExtracted ? gtRichExtracted.synonyms : [];
    const examples = gtRichExtracted ? gtRichExtracted.examples : [];
    const enTranslation = gtRichExtracted ? gtRichExtracted.enTranslation : '';

    if (meanings.length === 0) {
      meanings = await fetchWiktionaryMeanings(rawWord, resolvedLang);
    }

    const relatedPhrases = await buildMultilangRelatedPhrases(
      rawWord,
      resolvedLang,
      enTranslation,
      synonyms,
      examples
    );

    const contextParagraph = await buildMultilangContextParagraph(
      rawWord,
      resolvedLang,
      meanings,
      examples,
      synonyms,
      relatedPhrases
    );

    if (meanings.length === 0 && synonyms.length === 0 && relatedPhrases.length === 0 && !contextParagraph) {
      const emptyPayload = emptyDictionaryPayload(rawWord, resolvedLang);
      setDictionaryCache(normalizedKey, 404, emptyPayload);
      sendJson(res, 404, emptyPayload);
      return;
    }

    const payload = {
      word: rawWord,
      lang: resolvedLang,
      phonetic: '',
      audioUrl: '',
      meanings,
      synonyms,
      examples,
      relatedPhrases,
      contextParagraph
    };
    setDictionaryCache(normalizedKey, 200, payload);
    sendJson(res, 200, payload);
    return;
  }

  const targetUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(rawWord.toLowerCase())}`;
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (response.status === 404) {
      const payload = emptyDictionaryPayload(rawWord, 'en');
      setDictionaryCache(normalizedKey, 404, payload);
      sendJson(res, 404, payload);
      return;
    }

    if (!response.ok) {
      sendJson(res, 502, {
        error: `Dictionary upstream error (${response.status})`,
        ...emptyDictionaryPayload(rawWord, 'en')
      });
      return;
    }

    const json = await response.json();
    const basePayload = normalizeDictionaryEntries(json, rawWord);
    const datamuse = await fetchDatamuseCollocations(basePayload.word);
    const relatedPhrases = buildRelatedPhrases(
      basePayload.word,
      datamuse.collocations,
      datamuse.related,
      basePayload.examples,
      basePayload.synonyms
    );
    const contextParagraph = buildContextParagraph(
      basePayload.word,
      basePayload.meanings,
      basePayload.examples,
      basePayload.synonyms,
      datamuse.collocations,
      relatedPhrases
    );
    const payload = {
      ...basePayload,
      lang: 'en',
      relatedPhrases,
      contextParagraph
    };
    setDictionaryCache(normalizedKey, 200, payload);
    sendJson(res, 200, payload);
  } catch (error) {
    console.error('Dictionary lookup error:', error);
    sendJson(res, 502, {
      error: 'Dictionary service unavailable',
      ...emptyDictionaryPayload(rawWord, 'en')
    });
  }
}

const LOCALE_LANG_MAP = {
  vi: { uiLang: 'vi', targetLang: 'vi', defaultCountry: 'VN' },
  en: { uiLang: 'en', targetLang: 'en', defaultCountry: 'US' },
  ja: { uiLang: 'ja', targetLang: 'ja', defaultCountry: 'JP' },
  ko: { uiLang: 'ko', targetLang: 'ko', defaultCountry: 'KR' },
  zh: { uiLang: 'zh', targetLang: 'zh-CN', defaultCountry: 'CN' },
  fr: { uiLang: 'fr', targetLang: 'fr', defaultCountry: 'FR' },
  de: { uiLang: 'de', targetLang: 'de', defaultCountry: 'DE' },
  es: { uiLang: 'es', targetLang: 'es', defaultCountry: 'ES' }
};

const LOCALE_COUNTRY_TO_UI = {
  VN: 'vi',
  JP: 'ja',
  KR: 'ko',
  CN: 'zh',
  TW: 'zh',
  HK: 'zh',
  MO: 'zh',
  FR: 'fr',
  MC: 'fr',
  DE: 'de',
  AT: 'de',
  LI: 'de',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  PE: 'es',
  VE: 'es',
  EC: 'es',
  UY: 'es',
  PY: 'es',
  BO: 'es',
  CR: 'es',
  PA: 'es',
  DO: 'es',
  GT: 'es',
  HN: 'es',
  SV: 'es',
  NI: 'es',
  CU: 'es',
  PR: 'es',
  US: 'en',
  GB: 'en',
  AU: 'en',
  CA: 'en',
  NZ: 'en',
  IE: 'en',
  SG: 'en'
};

function isValidCountryCode(code) {
  const upper = String(code || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && upper !== 'XX' && upper !== 'T1';
}

function stripIpBrackets(ip) {
  let clean = String(ip || '').trim();
  if (clean.startsWith('[') && clean.includes(']')) {
    clean = clean.slice(1, clean.indexOf(']'));
  }
  return clean;
}

function isPublicIpv4(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIp(rawIp) {
  const ip = stripIpBrackets(rawIp);
  const family = net.isIP(ip);
  if (family === 4) {
    return isPublicIpv4(ip);
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return false;
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice(7);
      if (net.isIP(mapped) === 4) {
        return isPublicIpv4(mapped);
      }
    }
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff')) {
      return false;
    }
    if (lower.startsWith('2001:db8:')) return false;
    return true;
  }
  return false;
}

function extractClientIp(req) {
  const cfIp = stripIpBrackets(req.headers['cf-connecting-ip'] || '');
  if (cfIp && isPublicIp(cfIp)) return cfIp;

  const forwardedFor = String(req.headers['x-forwarded-for'] || '');
  if (forwardedFor) {
    for (const part of forwardedFor.split(',')) {
      const candidate = stripIpBrackets(part);
      if (candidate && isPublicIp(candidate)) return candidate;
    }
  }

  const remoteAddr = stripIpBrackets(req.socket?.remoteAddress || '');
  if (remoteAddr && isPublicIp(remoteAddr)) return remoteAddr;

  return null;
}

function parseAcceptLanguageHeader(header) {
  const trimmed = String(header || '').trim();
  if (!trimmed) return null;

  const candidates = [];
  const parts = trimmed.split(',');
  parts.forEach((part, index) => {
    const segments = part.trim().split(';');
    const tag = (segments[0] || '').trim().toLowerCase();
    if (!tag || tag === '*') return;

    let q = 1;
    for (let i = 1; i < segments.length; i++) {
      const param = segments[i].trim();
      if (param.startsWith('q=')) {
        const val = Number.parseFloat(param.slice(2));
        if (Number.isFinite(val)) {
          q = Math.max(0, Math.min(1, val));
        }
        break;
      }
    }
    if (q <= 0) return;

    const subtags = tag.split(/[-_]/);
    const primary = subtags[0] || '';
    if (!Object.prototype.hasOwnProperty.call(LOCALE_LANG_MAP, primary)) return;

    let region = null;
    for (const sub of subtags.slice(1)) {
      if (/^[a-z]{2}$/.test(sub)) {
        const upperSub = sub.toUpperCase();
        if (upperSub !== 'XX' && upperSub !== 'T1') {
          region = upperSub;
        }
        break;
      }
    }

    candidates.push({ q, index, uiLang: primary, region });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.q !== a.q ? b.q - a.q : a.index - b.index));

  const best = candidates[0];
  const info = LOCALE_LANG_MAP[best.uiLang];
  return {
    countryCode: best.region || info.defaultCountry,
    uiLang: info.uiLang,
    targetLang: info.targetLang
  };
}

function sendLocaleJson(req, res, payload) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, max-age=1800',
    'Access-Control-Allow-Origin': '*'
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
}

async function handleLocale(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: 'GET, HEAD'
    });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const acceptLanguage = String(req.headers['accept-language'] || '');
    let countryCode = null;

    const cfCountry = String(req.headers['cf-ipcountry'] || '').trim().toUpperCase();
    const vercelCountry = String(req.headers['x-vercel-ip-country'] || '').trim().toUpperCase();
    if (isValidCountryCode(cfCountry)) {
      countryCode = cfCountry;
    } else if (isValidCountryCode(vercelCountry)) {
      countryCode = vercelCountry;
    }

    if (!countryCode) {
      const clientIp = extractClientIp(req);
      if (clientIp) {
        try {
          const ipRes = await fetch(`http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,countryCode`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(1500)
          });
          if (ipRes.ok) {
            const ipData = await ipRes.json();
            const candidateCode = String(ipData?.countryCode || '').trim().toUpperCase();
            if (ipData?.status === 'success' && isValidCountryCode(candidateCode)) {
              countryCode = candidateCode;
            }
          }
        } catch {
          // Ignore upstream lookup errors/timeouts and fall back to headers
        }
      }
    }

    if (countryCode) {
      const mappedUi = LOCALE_COUNTRY_TO_UI[countryCode];
      if (mappedUi && LOCALE_LANG_MAP[mappedUi]) {
        const info = LOCALE_LANG_MAP[mappedUi];
        sendLocaleJson(req, res, {
          countryCode,
          uiLang: info.uiLang,
          targetLang: info.targetLang,
          source: 'ip'
        });
        return;
      }

      const headerMatch = parseAcceptLanguageHeader(acceptLanguage);
      if (headerMatch) {
        sendLocaleJson(req, res, {
          countryCode,
          uiLang: headerMatch.uiLang,
          targetLang: headerMatch.targetLang,
          source: 'ip'
        });
        return;
      }

      sendLocaleJson(req, res, {
        countryCode,
        uiLang: 'en',
        targetLang: 'en',
        source: 'ip'
      });
      return;
    }

    const headerMatch = parseAcceptLanguageHeader(acceptLanguage);
    if (headerMatch) {
      sendLocaleJson(req, res, {
        countryCode: headerMatch.countryCode,
        uiLang: headerMatch.uiLang,
        targetLang: headerMatch.targetLang,
        source: 'header'
      });
      return;
    }
  } catch (err) {
    console.error('Locale detection error:', err);
  }

  sendLocaleJson(req, res, {
    countryCode: 'VN',
    uiLang: 'vi',
    targetLang: 'vi',
    source: 'default'
  });
}

function sendHtml(req, res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(html);
}

function serveTranslatorRoot(req, res) {
  const translatorIndex = path.join(projectRoot, 'translate-web', 'index.html');
  fs.readFile(translatorIndex, 'utf8', (err, html) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const injected = /<base\b/i.test(html)
      ? html
      : html.replace(/<head([^>]*)>/i, '<head$1>\n  <base href="/translate-web/">');
    sendHtml(req, res, injected);
  });
}

function serveGroupPage(req, res, pathname) {
  const groupFile = path.join(projectRoot, 'group.html');
  fs.readFile(groupFile, 'utf8', (err, html) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    // When served from /group/ (with trailing slash), rewrite non-anchor relative paths to root-relative
    // so css/style.css, member pages, and translate-web/ resolve cleanly without breaking #section anchors.
    const output = pathname === '/group/'
      ? html.replace(/\b(href|src)="(?!#|https?:\/\/|data:|\/)/gi, '$1="/')
      : html;
    sendHtml(req, res, output);
  });
}

/**
 * Handles static file serving
 */
function serveStaticFile(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { decoded = ''; }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const segments = decoded.split('/').filter(Boolean);
  const first = segments[0];
  const isGroupAsset =
    decoded === '/index.html' ||
    decoded === '/group.html' ||
    decoded === '/image.png' ||
    decoded === '/css/style.css';
  const isTranslateAsset = first === 'translate-web' && (
    decoded === '/translate-web/index.html' ||
    /^\/translate-web\/(js|css)\/[a-zA-Z0-9._-]+\.(js|css)$/.test(decoded)
  );
  const memberDirs = new Set(['LeHuy', 'hieu\'', 'Ngô Khánh Nguyên', 'Thân_Đức_Tiến_075207010355']);
  const isMemberAsset = memberDirs.has(first) && segments.length >= 2 &&
    segments.every(segment => segment !== '.' && segment !== '..' && !segment.startsWith('.')) &&
    /\.(html|css|js|png|jpe?g|jfif|svg|otf)$/i.test(decoded);
  if (!isGroupAsset && !isTranslateAsset && !isMemberAsset) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  const filePath = path.resolve(projectRoot, '.' + decoded);

  if (!filePath.startsWith(projectRoot + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

/**
 * Handles direct image buffer OCR (from paste or upload)
 */
function handleBufferOcr(req, res) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Dữ liệu ảnh rỗng' }));
        return;
      }

      const lens = await getLens();
      const result = await lens.scanByBuffer(buffer);
      const text = result.segments.map(s => s.text).join('\n').trim();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, text }));
    } catch (ocrErr) {
      console.error('Buffer OCR error:', ocrErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: ocrErr.message || 'Lỗi nhận diện OCR' }));
    }
  });
}

/**
 * Handles Google Translate TTS audio proxy
 */
function handleTtsProxy(req, res, parsedUrl) {
  const tl = parsedUrl.searchParams.get('tl') || 'vi';
  const q = parsedUrl.searchParams.get('q') || '';
  if (!q) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Thiếu tham số q' }));
    return;
  }

  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q.slice(0, 200))}`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://translate.google.com/'
    }
  };

  https.get(googleTtsUrl, options, (googleRes) => {
    if (googleRes.statusCode !== 200) {
      res.writeHead(googleRes.statusCode || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Google TTS error ${googleRes.statusCode}` }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': googleRes.headers['content-type'] || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    if (req.method === 'HEAD') {
      googleRes.resume();
      res.end();
      return;
    }
    googleRes.pipe(res);
  }).on('error', (err) => {
    console.error('TTS Proxy error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message || 'Lỗi phát âm thanh TTS' }));
  });
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const isReadMethod = req.method === 'GET' || req.method === 'HEAD';

  if (pathname === '/api/history' || pathname === '/translate-web/api/history.php') {
    handleHistory(req, res);
  } else if (pathname === '/api/auth/me' || pathname === '/translate-web/api/auth/me.php') {
    handleAuthMe(req, res);
  } else if (pathname === '/api/auth/register' || pathname === '/translate-web/api/auth/register.php') {
    handleAuthRegister(req, res);
  } else if (pathname === '/api/auth/login' || pathname === '/translate-web/api/auth/login.php') {
    handleAuthLogin(req, res);
  } else if (pathname === '/api/auth/google/start' || pathname === '/translate-web/api/auth/google-start.php') {
    handleAuthGoogleStart(req, res, parsedUrl);
  } else if (pathname === '/api/auth/google/callback' || pathname === '/translate-web/api/auth/google-callback.php') {
    handleAuthGoogleCallback(req, res, parsedUrl);
  } else if (pathname === '/api/auth/google' || pathname === '/translate-web/api/auth/google.php') {
    handleAuthGoogle(req, res);
  } else if (pathname === '/api/auth/logout' || pathname === '/translate-web/api/auth/logout.php') {
    handleAuthLogout(req, res);
  } else if (pathname === '/api/dictionary' || pathname === '/translate-web/api/dictionary.php') {
    handleDictionary(req, res, parsedUrl);
  } else if (pathname === '/api/locale' || pathname === '/translate-web/api/locale.php') {
    handleLocale(req, res);
  } else if (req.method === 'POST' && (pathname === '/api/ocr' || pathname === '/translate-web/api/ocr')) {
    handleBufferOcr(req, res);
  } else if (isReadMethod && (pathname === '/api/tts' || pathname === '/translate-web/api/tts' || pathname === '/translate-web/api/tts.php')) {
    handleTtsProxy(req, res, parsedUrl);
  } else if (isReadMethod && (pathname === '/api/health' || pathname === '/translate-web/api/health')) {
    sendJson(res, 200, {
      status: 'ok',
      ocr: 'chrome-lens-ocr',
      googleAuthConfigured: Boolean(getGoogleClientId())
    });
  } else if (isReadMethod && pathname === '/') {
    serveTranslatorRoot(req, res);
  } else if (isReadMethod && pathname === '/translate-web') {
    res.writeHead(302, { Location: '/translate-web/' });
    res.end();
  } else if (isReadMethod && (pathname === '/group' || pathname === '/group/' || pathname === '/group.html')) {
    serveGroupPage(req, res, pathname);
  } else if (isReadMethod) {
    serveStaticFile(req, res, pathname);
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }
});

// Start server if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Lingo Studio Web Server running at http://localhost:${PORT}`);
    console.log(`- Translator root: / (and /translate-web/)`);
    console.log(`- Group page: /group, /group/, /group.html`);
    console.log(`- POST /api/ocr (buffer upload/paste + chrome-lens-ocr)`);
    console.log(`- GET /api/tts?tl=...&q=... (Google Translate TTS proxy)`);
    console.log(`- GET /api/dictionary?word=...&lang=en`);
    console.log(`- GET /api/locale (IP / Accept-Language locale detection)`);
    console.log(`- Auth & History: /api/auth/*, /api/history`);
  });
}

export { server, getLens, handleLocale };
