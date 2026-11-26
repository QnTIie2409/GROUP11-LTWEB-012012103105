<?php
declare(strict_types=1);

require_once __DIR__ . '/auth-helper.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    lingo_reply(405, ['error' => 'Method Not Allowed']);
}

function emptyDictionaryPayload(string $word = '', string $lang = 'en'): array
{
    return [
        'word' => $word,
        'lang' => $lang,
        'phonetic' => '',
        'audioUrl' => '',
        'meanings' => [],
        'synonyms' => [],
        'examples' => [],
        'relatedPhrases' => [],
        'contextParagraph' => '',
    ];
}

function lingo_normalize_nfc(string $text): string
{
    if ($text === '') {
        return '';
    }
    if (class_exists('Normalizer')) {
        $norm = Normalizer::normalize($text, Normalizer::FORM_C);
        if (is_string($norm)) {
            return $norm;
        }
    }
    if (preg_match('/[\x{0300}-\x{036F}]/u', $text) !== 1) {
        return $text;
    }
    // Pure-PHP NFD -> NFC fallback for Vietnamese & common Latin combining marks when ext-intl is unavailable.
    static $stage1 = null;
    static $stage2 = null;
    if ($stage1 === null) {
        $stage1 = [
            "A\u{0302}" => 'Â', "a\u{0302}" => 'â',
            "A\u{0306}" => 'Ă', "a\u{0306}" => 'ă',
            "E\u{0302}" => 'Ê', "e\u{0302}" => 'ê',
            "O\u{0302}" => 'Ô', "o\u{0302}" => 'ô',
            "O\u{031B}" => 'Ơ', "o\u{031B}" => 'ơ',
            "U\u{031B}" => 'Ư', "u\u{031B}" => 'ư',
            "C\u{0327}" => 'Ç', "c\u{0327}" => 'ç',
            "A\u{0308}" => 'Ä', "a\u{0308}" => 'ä',
            "O\u{0308}" => 'Ö', "o\u{0308}" => 'ö',
            "U\u{0308}" => 'Ü', "u\u{0308}" => 'ü',
            "N\u{0303}" => 'Ñ', "n\u{0303}" => 'ñ',
        ];
        $stage2 = [
            "A\u{0300}" => 'À', "a\u{0300}" => 'à', "A\u{0301}" => 'Á', "a\u{0301}" => 'á',
            "A\u{0309}" => 'Ả', "a\u{0309}" => 'ả', "A\u{0303}" => 'Ã', "a\u{0303}" => 'ã',
            "A\u{0323}" => 'Ạ', "a\u{0323}" => 'ạ',
            "Â\u{0300}" => 'Ầ', "â\u{0300}" => 'ầ', "Â\u{0301}" => 'Ấ', "â\u{0301}" => 'ấ',
            "Â\u{0309}" => 'Ẩ', "â\u{0309}" => 'ẩ', "Â\u{0303}" => 'Ẫ', "â\u{0303}" => 'ẫ',
            "Â\u{0323}" => 'Ậ', "â\u{0323}" => 'ậ',
            "Ă\u{0300}" => 'Ằ', "ă\u{0300}" => 'ằ', "Ă\u{0301}" => 'Ắ', "ă\u{0301}" => 'ắ',
            "Ă\u{0309}" => 'Ẳ', "ă\u{0309}" => 'ẳ', "Ă\u{0303}" => 'Ẵ', "ă\u{0303}" => 'ẵ',
            "Ă\u{0323}" => 'Ặ', "ă\u{0323}" => 'ặ',
            "E\u{0300}" => 'È', "e\u{0300}" => 'è', "E\u{0301}" => 'É', "e\u{0301}" => 'é',
            "E\u{0309}" => 'Ẻ', "e\u{0309}" => 'ẻ', "E\u{0303}" => 'Ẽ', "e\u{0303}" => 'ẽ',
            "E\u{0323}" => 'Ẹ', "e\u{0323}" => 'ẹ',
            "Ê\u{0300}" => 'Ề', "ê\u{0300}" => 'ề', "Ê\u{0301}" => 'Ế', "ê\u{0301}" => 'ế',
            "Ê\u{0309}" => 'Ể', "ê\u{0309}" => 'ể', "Ê\u{0303}" => 'Ễ', "ê\u{0303}" => 'ễ',
            "Ê\u{0323}" => 'Ệ', "ê\u{0323}" => 'ệ',
            "I\u{0300}" => 'Ì', "i\u{0300}" => 'ì', "I\u{0301}" => 'Í', "i\u{0301}" => 'í',
            "I\u{0309}" => 'Ỉ', "i\u{0309}" => 'ỉ', "I\u{0303}" => 'Ĩ', "i\u{0303}" => 'ĩ',
            "I\u{0323}" => 'Ị', "i\u{0323}" => 'ị',
            "O\u{0300}" => 'Ò', "o\u{0300}" => 'ò', "O\u{0301}" => 'Ó', "o\u{0301}" => 'ó',
            "O\u{0309}" => 'Ỏ', "o\u{0309}" => 'ỏ', "O\u{0303}" => 'Õ', "o\u{0303}" => 'õ',
            "O\u{0323}" => 'Ọ', "o\u{0323}" => 'ọ',
            "Ô\u{0300}" => 'Ồ', "ô\u{0300}" => 'ồ', "Ô\u{0301}" => 'Ố', "ô\u{0301}" => 'ố',
            "Ô\u{0309}" => 'Ổ', "ô\u{0309}" => 'ổ', "Ô\u{0303}" => 'Ỗ', "ô\u{0303}" => 'ỗ',
            "Ô\u{0323}" => 'Ộ', "ô\u{0323}" => 'ộ',
            "Ơ\u{0300}" => 'Ờ', "ơ\u{0300}" => 'ờ', "Ơ\u{0301}" => 'Ớ', "ơ\u{0301}" => 'ớ',
            "Ơ\u{0309}" => 'Ở', "ơ\u{0309}" => 'ở', "Ơ\u{0303}" => 'Ỡ', "ơ\u{0303}" => 'ỡ',
            "Ơ\u{0323}" => 'Ợ', "ơ\u{0323}" => 'ợ',
            "U\u{0300}" => 'Ù', "u\u{0300}" => 'ù', "U\u{0301}" => 'Ú', "u\u{0301}" => 'ú',
            "U\u{0309}" => 'Ủ', "u\u{0309}" => 'ủ', "U\u{0303}" => 'Ũ', "u\u{0303}" => 'ũ',
            "U\u{0323}" => 'Ụ', "u\u{0323}" => 'ụ',
            "Ư\u{0300}" => 'Ừ', "ư\u{0300}" => 'ừ', "Ư\u{0301}" => 'Ứ', "ư\u{0301}" => 'ứ',
            "Ư\u{0309}" => 'Ử', "ư\u{0309}" => 'ử', "Ư\u{0303}" => 'Ữ', "ư\u{0303}" => 'ữ',
            "Ư\u{0323}" => 'Ự', "ư\u{0323}" => 'ự',
            "Y\u{0300}" => 'Ỳ', "y\u{0300}" => 'ỳ', "Y\u{0301}" => 'Ý', "y\u{0301}" => 'ý',
            "Y\u{0309}" => 'Ỷ', "y\u{0309}" => 'ỷ', "Y\u{0303}" => 'Ỹ', "y\u{0303}" => 'ỹ',
            "Y\u{0323}" => 'Ỵ', "y\u{0323}" => 'ỵ',
        ];
    }
    return strtr(strtr(strtr($text, ["\u{0340}" => "\u{0300}", "\u{0341}" => "\u{0301}"]), $stage1), $stage2);
}

function lingo_lower(string $text): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
}

function lingo_strlen(string $text): int
{
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

function lingo_normalize_lang_code(string $rawLang): string
{
    $clean = strtolower(trim($rawLang));
    if ($clean === '') {
        return 'en';
    }
    $clean = str_replace('_', '-', $clean);
    if ($clean === 'auto') {
        return 'auto';
    }
    if ($clean === 'zh-cn' || $clean === 'zh-hans' || $clean === 'zh-sg') {
        return 'zh-CN';
    }
    if ($clean === 'zh-tw' || $clean === 'zh-hant' || $clean === 'zh-hk' || $clean === 'zh-mo') {
        return 'zh-TW';
    }
    $parts = explode('-', $clean);
    $base = preg_replace('/[^a-z]/', '', $parts[0] ?? '') ?: 'en';
    if ($base === 'en') {
        return 'en';
    }
    if (isset($parts[1]) && $parts[1] !== '') {
        $region = strtoupper(preg_replace('/[^a-z0-9]/', '', $parts[1]) ?: '');
        if ($region !== '') {
            return $base . '-' . $region;
        }
    }
    return $base;
}

function lingo_base_lang(string $lang): string
{
    $parts = explode('-', strtolower(trim($lang)));
    return $parts[0] !== '' ? $parts[0] : 'en';
}

function lingo_is_cjk_no_space_lang(string $lang): bool
{
    $base = lingo_base_lang($lang);
    return $base === 'ja' || $base === 'zh';
}

function lingo_normalize_space(string $text): string
{
    $text = lingo_normalize_nfc($text);
    $cleaned = preg_replace('/\s+/u', ' ', trim($text));
    return is_string($cleaned) ? $cleaned : trim($text);
}

function lingo_word_count(string $text): int
{
    $normalized = lingo_normalize_space($text);
    if ($normalized === '') {
        return 0;
    }
    $parts = preg_split('/\s+/u', $normalized);
    return is_array($parts) ? count($parts) : 0;
}

function lingo_ensure_sentence(string $text, string $lang = 'en'): string
{
    $cleaned = lingo_normalize_space($text);
    if ($cleaned === '') {
        return '';
    }
    if (preg_match('/[.!?。！？]$/u', $cleaned)) {
        return $cleaned;
    }
    $first = substr($cleaned, 0, 1);
    if ($first !== false && ctype_alpha($first)) {
        $cleaned = strtoupper($first) . substr($cleaned, 1);
    }
    return lingo_is_cjk_no_space_lang($lang) ? ($cleaned . '。') : ($cleaned . '.');
}

function lingo_lowercase_definition_start(string $text, string $lang = 'en'): string
{
    $cleaned = lingo_normalize_space($text);
    $cleaned = preg_replace('/[.。\s]+$/u', '', $cleaned);
    $cleaned = is_string($cleaned) ? $cleaned : '';
    if ($cleaned === '') {
        return '';
    }
    $base = lingo_base_lang($lang);
    if ($base === 'de' || $base === 'ja' || $base === 'zh' || $base === 'ko') {
        return $cleaned;
    }
    if (function_exists('mb_substr') && function_exists('mb_strtolower')) {
        $first = mb_substr($cleaned, 0, 1, 'UTF-8');
        $second = mb_substr($cleaned, 1, 1, 'UTF-8');
        $firstLower = mb_strtolower($first, 'UTF-8');
        $secondLower = mb_strtolower($second, 'UTF-8');
        if ($first !== $firstLower && ($second === '' || $second === $secondLower)) {
            return $firstLower . mb_substr($cleaned, 1, null, 'UTF-8');
        }
        return $cleaned;
    }
    $len = strlen($cleaned);
    if ($len >= 2 && ctype_upper($cleaned[0]) && !ctype_upper($cleaned[1])) {
        return strtolower($cleaned[0]) . substr($cleaned, 1);
    }
    if ($len === 1 && ctype_upper($cleaned[0])) {
        return strtolower($cleaned[0]);
    }
    return $cleaned;
}

function lingo_fetch_datamuse_collocations(string $word): array
{
    $result = [
        'collocations' => [],
        'related' => [],
    ];
    $cleanWord = strtolower(lingo_normalize_space($word));
    if ($cleanWord === '') {
        return $result;
    }

    try {
        $jjbUrl = 'https://api.datamuse.com/words?rel_jjb=' . rawurlencode($cleanWord) . '&max=5';
        $jjbRes = lingo_http_get_json($jjbUrl, 2);
        $jjbStatus = (int) ($jjbRes['status'] ?? 0);
        $jjbData = $jjbRes['data'] ?? null;

        if ($jjbStatus === 200 && is_array($jjbData)) {
            foreach ($jjbData as $item) {
                if (!is_array($item) || !isset($item['word']) || !is_string($item['word'])) {
                    continue;
                }
                $adj = strtolower(lingo_normalize_space($item['word']));
                if ($adj === '' || $adj === $cleanWord || strpos($adj, $cleanWord) !== false) {
                    continue;
                }
                if (lingo_word_count($adj) > 3) {
                    continue;
                }
                $result['collocations'][] = $adj . ' ' . $cleanWord;
            }
        }

        if ($result['collocations'] === [] && $jjbStatus === 200) {
            $mlUrl = 'https://api.datamuse.com/words?ml=' . rawurlencode($cleanWord) . '&max=5';
            $mlRes = lingo_http_get_json($mlUrl, 2);
            $mlStatus = (int) ($mlRes['status'] ?? 0);
            $mlData = $mlRes['data'] ?? null;

            if ($mlStatus === 200 && is_array($mlData)) {
                foreach ($mlData as $item) {
                    if (!is_array($item) || !isset($item['word']) || !is_string($item['word'])) {
                        continue;
                    }
                    $rel = strtolower(lingo_normalize_space($item['word']));
                    if ($rel === '' || $rel === $cleanWord || lingo_word_count($rel) > 5) {
                        continue;
                    }
                    $result['related'][] = $rel;
                }
            }
        }
    } catch (Throwable $e) {
        return $result;
    }

    return $result;
}

function lingo_build_related_phrases(
    string $word,
    array $collocations,
    array $mlRelated,
    array $examples,
    array $synonyms
): array {
    $phrases = [];
    $seen = [strtolower(lingo_normalize_space($word)) => true];

    $addPhrase = function (string $candidate) use (&$phrases, &$seen): bool {
        $clean = lingo_normalize_space($candidate);
        $clean = rtrim($clean, '.');
        if ($clean === '') {
            return false;
        }
        $key = strtolower($clean);
        if (isset($seen[$key])) {
            return false;
        }
        $seen[$key] = true;
        $phrases[] = $clean;
        return true;
    };

    $shortExamples = [];
    foreach ($examples as $ex) {
        if (!is_string($ex)) {
            continue;
        }
        $cleanEx = rtrim(lingo_normalize_space($ex), '.');
        $wc = lingo_word_count($cleanEx);
        if ($wc >= 2 && $wc <= 8) {
            $shortExamples[] = $cleanEx;
        }
    }

    $collocationPool = array_merge($collocations, $mlRelated);

    $colCount = 0;
    foreach ($collocationPool as $phrase) {
        if ($colCount >= 3 || count($phrases) >= 6) {
            break;
        }
        if ($addPhrase((string) $phrase)) {
            $colCount++;
        }
    }

    $exCount = 0;
    foreach ($shortExamples as $exPhrase) {
        if ($exCount >= 2 || count($phrases) >= 6) {
            break;
        }
        if ($addPhrase($exPhrase)) {
            $exCount++;
        }
    }

    foreach ($synonyms as $syn) {
        if (count($phrases) >= 6) {
            break;
        }
        if (is_string($syn)) {
            $addPhrase($syn);
        }
    }

    foreach ($collocationPool as $phrase) {
        if (count($phrases) >= 6) {
            break;
        }
        $addPhrase((string) $phrase);
    }

    foreach ($shortExamples as $exPhrase) {
        if (count($phrases) >= 6) {
            break;
        }
        $addPhrase($exPhrase);
    }

    return array_slice($phrases, 0, 6);
}

function lingo_build_context_paragraph(
    string $word,
    array $meanings,
    array $examples,
    array $synonyms,
    array $collocations,
    array $relatedPhrases
): string {
    if ($meanings === [] && $examples === [] && $synonyms === []) {
        return '';
    }

    $cleanWord = lingo_normalize_space($word);
    $wordLower = strtolower($cleanWord);
    $sentences = [];

    $primaryPos = '';
    $primaryDef = '';
    if (isset($meanings[0]) && is_array($meanings[0])) {
        $primaryPos = isset($meanings[0]['partOfSpeech']) && is_string($meanings[0]['partOfSpeech'])
            ? strtolower(lingo_normalize_space($meanings[0]['partOfSpeech']))
            : '';
        if (isset($meanings[0]['definitions'][0]['definition']) && is_string($meanings[0]['definitions'][0]['definition'])) {
            $primaryDef = lingo_lowercase_definition_start($meanings[0]['definitions'][0]['definition']);
        }
    }

    if ($primaryDef !== '') {
        if ($primaryPos === 'noun') {
            $sentences[] = lingo_ensure_sentence(
                'In English, the noun "' . $cleanWord . '" refers to ' . $primaryDef
            );
        } elseif ($primaryPos === 'verb') {
            $verbDef = strpos($primaryDef, 'to ') === 0 ? $primaryDef : 'to ' . $primaryDef;
            $sentences[] = lingo_ensure_sentence(
                'In English, the verb "' . $cleanWord . '" means ' . $verbDef
            );
        } elseif ($primaryPos !== '') {
            $sentences[] = lingo_ensure_sentence(
                'In English, "' . $cleanWord . '" (' . $primaryPos . ') means ' . $primaryDef
            );
        } else {
            $sentences[] = lingo_ensure_sentence(
                'In English, "' . $cleanWord . '" means ' . $primaryDef
            );
        }
    } else {
        $sentences[] = lingo_ensure_sentence(
            'In English, "' . $cleanWord . '" is commonly used in everyday communication'
        );
    }

    $chosenExample = '';
    foreach ($examples as $ex) {
        if (!is_string($ex)) {
            continue;
        }
        $normEx = lingo_normalize_space($ex);
        if ($normEx === '') {
            continue;
        }
        if (strpos(strtolower($normEx), $wordLower) !== false) {
            $chosenExample = $normEx;
            break;
        }
        if ($chosenExample === '') {
            $chosenExample = $normEx;
        }
    }

    $usedCollocationInS2 = false;
    if ($chosenExample !== '') {
        $sentences[] = lingo_ensure_sentence($chosenExample);
    } elseif (count($collocations) >= 2) {
        $usedCollocationInS2 = true;
        $sentences[] = lingo_ensure_sentence(
            'People often use "' . $cleanWord . '" in natural expressions such as "' . $collocations[0] . '" and "' . $collocations[1] . '"'
        );
    } elseif (count($collocations) === 1) {
        $usedCollocationInS2 = true;
        $sentences[] = lingo_ensure_sentence(
            'You will often hear "' . $cleanWord . '" used in common phrases like "' . $collocations[0] . '"'
        );
    } elseif ($relatedPhrases !== []) {
        $sentences[] = lingo_ensure_sentence(
            'You will often encounter "' . $cleanWord . '" alongside expressions such as "' . $relatedPhrases[0] . '"'
        );
    } else {
        $sentences[] = lingo_ensure_sentence(
            'Learners frequently encounter "' . $cleanWord . '" in both everyday conversation and written articles'
        );
    }

    $unusedCollocation = '';
    if (!$usedCollocationInS2 && isset($collocations[0])) {
        $unusedCollocation = (string) $collocations[0];
    }

    $chosenSynonym = '';
    $s2Lower = strtolower($sentences[1] ?? '');
    foreach ($synonyms as $syn) {
        if (!is_string($syn)) {
            continue;
        }
        $cleanSyn = lingo_normalize_space($syn);
        $synLower = strtolower($cleanSyn);
        if ($cleanSyn === '' || $synLower === $wordLower) {
            continue;
        }
        if (strpos($s2Lower, $synLower) !== false) {
            continue;
        }
        $chosenSynonym = $cleanSyn;
        break;
    }

    if ($unusedCollocation !== '' && $chosenSynonym !== '') {
        $sentences[] = lingo_ensure_sentence(
            'Depending on the context, speakers also use phrases like "' . $unusedCollocation . '" or a related term such as "' . $chosenSynonym . '"'
        );
    } elseif ($unusedCollocation !== '') {
        $sentences[] = lingo_ensure_sentence(
            'In practice, it frequently appears in combinations like "' . $unusedCollocation . '"'
        );
    } elseif ($chosenSynonym !== '') {
        $sentences[] = lingo_ensure_sentence(
            'Depending on the context, "' . $chosenSynonym . '" can serve as a close alternative to "' . $cleanWord . '"'
        );
    }

    return implode(' ', array_filter($sentences, function ($s) {
        return $s !== '';
    }));
}

function lingo_clean_synonym_candidate(string $text): string
{
    $clean = lingo_normalize_space($text);
    $clean = preg_replace('/[.!?。！？,;:]+$/u', '', $clean);
    return is_string($clean) ? trim($clean) : '';
}

function lingo_translate_via_gt(string $text, string $sl, string $tl, int $timeoutSeconds = 3): string
{
    $clean = trim($text);
    if ($clean === '') {
        return '';
    }
    $url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
        . '&sl=' . rawurlencode($sl)
        . '&tl=' . rawurlencode($tl)
        . '&dt=t&q=' . rawurlencode($clean);
    try {
        $res = lingo_http_get_json($url, $timeoutSeconds);
        if ((int) ($res['status'] ?? 0) !== 200 || !is_array($res['data'] ?? null)) {
            return '';
        }
        $data = $res['data'];
        if (!isset($data[0]) || !is_array($data[0])) {
            return '';
        }
        $out = '';
        foreach ($data[0] as $seg) {
            if (is_array($seg) && isset($seg[0]) && is_string($seg[0])) {
                $out .= $seg[0];
            }
        }
        return lingo_normalize_nfc(trim($out));
    } catch (Throwable $e) {
        return '';
    }
}

function lingo_fetch_gt_rich(string $word, string $sl): ?array
{
    $url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
        . '&sl=' . rawurlencode($sl)
        . '&tl=en&dt=t&dt=bd&dt=md&dt=ss&dt=ex&dt=rw'
        . '&q=' . rawurlencode($word);
    try {
        $res = lingo_http_get_json($url, 4);
        if ((int) ($res['status'] ?? 0) === 200 && is_array($res['data'] ?? null)) {
            return $res['data'];
        }
    } catch (Throwable $e) {
        return null;
    }
    return null;
}

function lingo_extract_gt_rich(array $gtData, string $word, string $requestedLang): array
{
    $resolvedLang = $requestedLang;
    if ($requestedLang === 'auto' && isset($gtData[2]) && is_string($gtData[2]) && trim($gtData[2]) !== '') {
        $resolvedLang = lingo_normalize_lang_code($gtData[2]);
    }
    if ($resolvedLang === 'auto') {
        $resolvedLang = 'en';
    }

    $enTranslation = '';
    if (isset($gtData[0]) && is_array($gtData[0])) {
        foreach ($gtData[0] as $seg) {
            if (is_array($seg) && isset($seg[0]) && is_string($seg[0])) {
                $enTranslation .= $seg[0];
            }
        }
    }
    $enTranslation = lingo_normalize_space($enTranslation);

    $wordLower = lingo_lower(lingo_normalize_space($word));
    $synonymMap = [];
    $addSynonym = function (string $candidate) use (&$synonymMap, $wordLower): void {
        $clean = lingo_clean_synonym_candidate($candidate);
        if ($clean === '') {
            return;
        }
        $key = lingo_lower($clean);
        if ($key === $wordLower || isset($synonymMap[$key])) {
            return;
        }
        $synonymMap[$key] = $clean;
    };

    // data[1] (bd): [pos, [enTerms], [[enTerm, [nativeSynonyms...], ...]], ...]
    if (isset($gtData[1]) && is_array($gtData[1])) {
        foreach ($gtData[1] as $entry) {
            if (!is_array($entry) || !isset($entry[2]) || !is_array($entry[2])) {
                continue;
            }
            foreach ($entry[2] as $rev) {
                if (!is_array($rev) || !isset($rev[1]) || !is_array($rev[1])) {
                    continue;
                }
                foreach ($rev[1] as $nativeSyn) {
                    if (is_string($nativeSyn)) {
                        $addSynonym($nativeSyn);
                    }
                }
            }
        }
    }

    // data[11] (ss): [[pos, [[[syn1, syn2...], senseId], ...], ...]]
    if (isset($gtData[11]) && is_array($gtData[11])) {
        foreach ($gtData[11] as $ssGroup) {
            if (!is_array($ssGroup) || !isset($ssGroup[1]) || !is_array($ssGroup[1])) {
                continue;
            }
            foreach ($ssGroup[1] as $synsetItem) {
                if (!is_array($synsetItem) || !isset($synsetItem[0]) || !is_array($synsetItem[0])) {
                    continue;
                }
                foreach ($synsetItem[0] as $nativeSyn) {
                    if (is_string($nativeSyn)) {
                        $addSynonym($nativeSyn);
                    }
                }
            }
        }
    }

    // data[14] (rw): related words
    if (isset($gtData[14]) && is_array($gtData[14])) {
        foreach ($gtData[14] as $rwEntry) {
            if (is_array($rwEntry)) {
                foreach ($rwEntry as $rwWord) {
                    if (is_string($rwWord)) {
                        $addSynonym($rwWord);
                    }
                }
            } elseif (is_string($rwEntry)) {
                $addSynonym($rwEntry);
            }
        }
    }

    $meanings = [];
    $exampleMap = [];
    $addExample = function (string $candidate) use (&$exampleMap): void {
        $clean = lingo_normalize_space(strip_tags($candidate));
        if ($clean === '') {
            return;
        }
        $key = lingo_lower($clean);
        if (!isset($exampleMap[$key])) {
            $exampleMap[$key] = $clean;
        }
    };

    // data[12] (md): [[pos, [[defText, senseId, exampleText?], ...], headword, ...]]
    if (isset($gtData[12]) && is_array($gtData[12])) {
        foreach ($gtData[12] as $mdGroup) {
            if (!is_array($mdGroup)) {
                continue;
            }
            $pos = isset($mdGroup[0]) && is_string($mdGroup[0]) ? lingo_normalize_space($mdGroup[0]) : '';
            $defs = [];
            if (isset($mdGroup[1]) && is_array($mdGroup[1])) {
                foreach ($mdGroup[1] as $defEntry) {
                    if (!is_array($defEntry)) {
                        continue;
                    }
                    $defText = isset($defEntry[0]) && is_string($defEntry[0]) ? lingo_normalize_space($defEntry[0]) : '';
                    $exText = isset($defEntry[2]) && is_string($defEntry[2]) ? lingo_normalize_space(strip_tags($defEntry[2])) : '';
                    if ($defText !== '') {
                        $defs[] = [
                            'definition' => $defText,
                            'example' => $exText,
                        ];
                    }
                    if ($exText !== '') {
                        $addExample($exText);
                    }
                    if (count($defs) >= 4) {
                        break;
                    }
                }
            }
            if ($defs !== []) {
                $meanings[] = [
                    'partOfSpeech' => $pos,
                    'definitions' => $defs,
                ];
            }
            if (count($meanings) >= 6) {
                break;
            }
        }
    }

    // data[13] (ex): [[[exampleHtml, ...], ...]]
    if (isset($gtData[13]) && is_array($gtData[13]) && isset($gtData[13][0]) && is_array($gtData[13][0])) {
        foreach ($gtData[13][0] as $exEntry) {
            if (is_array($exEntry) && isset($exEntry[0]) && is_string($exEntry[0])) {
                $addExample($exEntry[0]);
            }
        }
    }

    return [
        'resolvedLang' => $resolvedLang,
        'enTranslation' => $enTranslation,
        'meanings' => array_slice($meanings, 0, 6),
        'synonyms' => array_slice(array_values($synonymMap), 0, 12),
        'examples' => array_slice(array_values($exampleMap), 0, 8),
    ];
}

function lingo_wiki_lang(string $lang): string
{
    return lingo_base_lang($lang);
}

function lingo_is_wiki_skip_heading(string $heading): bool
{
    $h = lingo_lower(lingo_normalize_space($heading));
    $skipTerms = [
        'từ nguyên', 'etymology', 'étymologie', 'herkunft', 'etimología', '語源', '어원', '詞源', '词源', '字源',
        'cách phát âm', 'phát âm', 'pronunciation', 'prononciation', 'aussprache', 'pronunciación', '発音', '발음', '發音', '发音', '讀音', '读音',
        'tham khảo', 'xem thêm', 'liên kết', 'tài liệu', 'ghi chú', 'chú thích', 'đọc thêm',
        'see also', 'references', 'external links', 'further reading', 'usage notes', 'anagrams',
        'đồng nghĩa', 'trái nghĩa', 'synonyms', 'antonyms', 'synonymes', 'synonyme', 'sinónimos',
        'derived terms', 'related terms', 'related', 'translations', 'traductions', 'übersetzungen', 'traducciones',
        '同義詞', '同义词', '反義詞', '反义词', '相關詞', '相关词', '衍生詞', '派生詞', '관련 어휘', '유의어', '반의어', '類義語', '対義語', '関連語', '翻訳', '翻译',
        'variantes', 'conjugaison', 'flexion', 'deklination', 'conjugación', 'declension', 'conjugation', 'cách viết khác', 'biến thể',
    ];
    foreach ($skipTerms as $term) {
        if (strpos($h, $term) !== false) {
            return true;
        }
    }
    return false;
}

function lingo_select_wiktionary_section(string $extract, string $lang): string
{
    $base = lingo_base_lang($lang);
    $langKeywords = [
        'vi' => ['tiếng việt', 'vietnamese'],
        'ja' => ['日本語', 'japanese'],
        'ko' => ['한국어', 'korean'],
        'zh' => ['漢語', '汉语', '中文', 'chinese', '官話', '官话'],
        'fr' => ['français', 'french'],
        'de' => ['deutsch', 'german'],
        'es' => ['español', 'spanish'],
        'en' => ['english', 'tiếng anh'],
    ];

    $lines = preg_split("/\r\n|\r|\n/", $extract);
    if (!is_array($lines)) {
        return $extract;
    }

    $sections = [];
    $currentHeading = '';
    $currentLines = [];
    foreach ($lines as $line) {
        if (preg_match('/^==\s*([^=]+?)\s*==\s*$/u', $line, $m)) {
            if ($currentLines !== []) {
                $sections[] = ['heading' => $currentHeading, 'body' => implode("\n", $currentLines)];
            }
            $currentHeading = trim($m[1]);
            $currentLines = [];
        } else {
            $currentLines[] = $line;
        }
    }
    if ($currentLines !== []) {
        $sections[] = ['heading' => $currentHeading, 'body' => implode("\n", $currentLines)];
    }

    $keywords = $langKeywords[$base] ?? [$base];
    foreach ($sections as $sec) {
        if ($sec['heading'] === '') {
            continue;
        }
        $hLower = lingo_lower($sec['heading']);
        foreach ($keywords as $kw) {
            if (strpos($hLower, $kw) !== false) {
                return $sec['body'];
            }
        }
    }

    foreach ($sections as $sec) {
        if ($sec['heading'] !== '' && trim($sec['body']) !== '') {
            return $sec['body'];
        }
    }

    return $extract;
}

function lingo_parse_wiktionary_extract(string $extract, string $word, string $lang, string $pageTitle = ''): array
{
    $sectionBody = lingo_select_wiktionary_section($extract, $lang);
    $lines = preg_split("/\r\n|\r|\n/", $sectionBody);
    if (!is_array($lines)) {
        return [];
    }

    $wordLower = lingo_lower(lingo_normalize_space($word));
    $titleLower = lingo_lower(lingo_normalize_space($pageTitle));
    $base = lingo_base_lang($lang);
    $isCjk = ($base === 'ja' || $base === 'ko' || $base === 'zh');
    $hasAnySubHeading = preg_match('/^={3,5}\s*[^=]+?\s*={3,5}\s*$/mu', $sectionBody) === 1;

    $meanings = [];
    $currentPos = '';
    $currentDefs = [];
    $skipSection = false;

    $flushPos = function () use (&$meanings, &$currentPos, &$currentDefs): void {
        if ($currentDefs !== []) {
            $meanings[] = [
                'partOfSpeech' => $currentPos,
                'definitions' => array_slice($currentDefs, 0, 3),
            ];
        }
        $currentDefs = [];
    };

    foreach ($lines as $rawLine) {
        $line = lingo_normalize_space($rawLine);
        if ($line === '') {
            continue;
        }

        if (preg_match('/^={3,5}\s*(.+?)\s*={3,5}$/u', $line, $m)) {
            $heading = trim($m[1]);
            $isSubHeading = strpos($line, '====') === 0;
            if (lingo_is_wiki_skip_heading($heading)) {
                if (!$isSubHeading) {
                    $flushPos();
                    $currentPos = '';
                }
                $skipSection = true;
            } else {
                $flushPos();
                $currentPos = $heading;
                $skipSection = false;
            }
            continue;
        }

        if ($skipSection) {
            continue;
        }

        if ($hasAnySubHeading && $currentPos === '') {
            continue;
        }

        // Clean list prefixes
        $clean = preg_replace('/^(?:\d+[.)]\s*|[#*•\-–—]+\s*)/u', '', $line);
        $clean = is_string($clean) ? lingo_normalize_space($clean) : '';
        if ($clean === '' || lingo_strlen($clean) < 2) {
            continue;
        }

        $cleanLower = lingo_lower($clean);
        if ($cleanLower === $wordLower || ($titleLower !== '' && $cleanLower === $titleLower)) {
            continue;
        }
        if ((strpos($cleanLower, $wordLower . ' (') === 0 || ($titleLower !== '' && strpos($cleanLower, $titleLower . ' (') === 0)) && lingo_strlen($clean) <= 45) {
            continue;
        }
        // Skip headword + IPA line like "bonjour \bɔ̃.ʒuʁ\" or "học tập /.../"
        if ((strpos($cleanLower, $wordLower) === 0 || ($titleLower !== '' && strpos($cleanLower, $titleLower) === 0)) && (strpos($clean, '\\') !== false || strpos($clean, '/') !== false)) {
            continue;
        }
        // Skip metadata/example-translation/IPA lines
        if (preg_match('/^(?:어원:|発音:|IPA|Bản mẫu:|Cách viết khác:|Chữ Hán:|Từ đồng nghĩa:|Đồng nghĩa:|Trái nghĩa:|Xem thêm:|出自：|http)/iu', $clean)) {
            continue;
        }
        if (strpos($clean, 'IPA(') !== false || strpos($clean, '발음:') !== false || strpos($clean, '[漢語拼音]') !== false || strpos($clean, '[現代標準漢語') !== false || strpos($clean, '[文言文') !== false || strpos($clean, '―') !== false) {
            continue;
        }
        if (strpos($clean, 'Hồ Ngọc Đức') !== false || strpos($clean, 'Dự án Từ điển') !== false) {
            continue;
        }
        if ($isCjk && preg_match('/^[a-zA-ZÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s,.;:!?()\[\]\'"\-—]+$/u', $clean)) {
            continue;
        }

        if (count($currentDefs) < 3) {
            $currentDefs[] = [
                'definition' => $clean,
                'example' => '',
            ];
        }
        if (count($meanings) >= 4) {
            break;
        }
    }

    $flushPos();
    return array_slice($meanings, 0, 4);
}

function lingo_fetch_wiktionary_meanings(string $word, string $lang): array
{
    $wikiLang = lingo_wiki_lang($lang);
    if (!preg_match('/^[a-z]{2,3}$/', $wikiLang)) {
        return [];
    }

    $candidates = [$word];
    $lower = lingo_lower($word);
    if ($lower !== '' && $lower !== $word) {
        $candidates[] = $lower;
    }

    foreach ($candidates as $title) {
        $url = 'https://' . $wikiLang . '.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=1200&redirects=1&format=json&titles=' . rawurlencode($title);
        try {
            $res = lingo_http_get_json($url, 3);
            if ((int) ($res['status'] ?? 0) !== 200 || !is_array($res['data'] ?? null)) {
                continue;
            }
            $pages = $res['data']['query']['pages'] ?? null;
            if (!is_array($pages)) {
                continue;
            }
            foreach ($pages as $pageId => $page) {
                if ((string) $pageId === '-1' || !is_array($page)) {
                    continue;
                }
                $extract = isset($page['extract']) && is_string($page['extract']) ? trim($page['extract']) : '';
                if ($extract === '') {
                    continue;
                }
                $pageTitle = isset($page['title']) && is_string($page['title']) ? $page['title'] : '';
                $parsed = lingo_parse_wiktionary_extract($extract, $title, $lang, $pageTitle);
                if ($parsed !== []) {
                    return $parsed;
                }
            }
        } catch (Throwable $e) {
            continue;
        }
    }

    return [];
}

function lingo_build_multilang_related_phrases(
    string $word,
    string $lang,
    string $enTranslation,
    array $synonyms,
    array $examples
): array {
    $phrases = [];
    $wordLower = lingo_lower(lingo_normalize_space($word));
    $seen = [$wordLower => true];

    $addPhrase = function (string $candidate) use (&$phrases, &$seen): bool {
        $clean = lingo_clean_synonym_candidate($candidate);
        if ($clean === '') {
            return false;
        }
        $key = lingo_lower($clean);
        if (isset($seen[$key])) {
            return false;
        }
        $seen[$key] = true;
        $phrases[] = $clean;
        return true;
    };

    $isCjkNoSpace = lingo_is_cjk_no_space_lang($lang);
    $shortExamples = [];
    foreach ($examples as $ex) {
        if (!is_string($ex)) {
            continue;
        }
        $cleanEx = lingo_clean_synonym_candidate($ex);
        if ($cleanEx === '') {
            continue;
        }
        if ($isCjkNoSpace) {
            $len = lingo_strlen($cleanEx);
            if ($len >= 2 && $len <= 20) {
                $shortExamples[] = $cleanEx;
            }
        } else {
            $wc = lingo_word_count($cleanEx);
            if ($wc >= 2 && $wc <= 10 && lingo_strlen($cleanEx) <= 80) {
                $shortExamples[] = $cleanEx;
            }
        }
    }

    foreach ($synonyms as $syn) {
        if (count($phrases) >= 4) {
            break;
        }
        if (is_string($syn)) {
            $addPhrase($syn);
        }
    }

    foreach ($shortExamples as $exPhrase) {
        if (count($phrases) >= 6) {
            break;
        }
        $addPhrase($exPhrase);
    }

    if (count($phrases) < 4 && $enTranslation !== '') {
        $cleanEn = lingo_lower(lingo_clean_synonym_candidate($enTranslation));
        if (strpos($cleanEn, 'to ') === 0) {
            $cleanEn = trim(substr($cleanEn, 3));
        }
        if ($cleanEn !== '' && $cleanEn !== $wordLower && preg_match('/^[a-z][a-z\s-]{0,40}$/', $cleanEn)) {
            $datamuse = lingo_fetch_datamuse_collocations($cleanEn);
            $enCollocations = array_slice(
                $datamuse['collocations'] !== [] ? $datamuse['collocations'] : $datamuse['related'],
                0,
                4
            );
            if ($enCollocations !== []) {
                $translatedBatch = lingo_translate_via_gt(implode("\n", $enCollocations), 'en', $lang, 3);
                if ($translatedBatch !== '') {
                    $lines = preg_split("/\r\n|\r|\n/", $translatedBatch);
                    if (is_array($lines)) {
                        foreach ($lines as $idx => $line) {
                            if (count($phrases) >= 6) {
                                break;
                            }
                            $cleanLine = lingo_clean_synonym_candidate((string) $line);
                            if ($cleanLine === '') {
                                continue;
                            }
                            $origEn = isset($enCollocations[$idx]) ? lingo_lower($enCollocations[$idx]) : '';
                            if ($origEn !== '' && lingo_lower($cleanLine) === $origEn && lingo_base_lang($lang) !== 'en') {
                                continue;
                            }
                            $addPhrase($cleanLine);
                        }
                    }
                }
            }
        }
    }

    foreach ($synonyms as $syn) {
        if (count($phrases) >= 6) {
            break;
        }
        if (is_string($syn)) {
            $addPhrase($syn);
        }
    }

    return array_slice($phrases, 0, 6);
}

function lingo_build_multilang_context_paragraph(
    string $word,
    string $lang,
    array $meanings,
    array $examples,
    array $synonyms,
    array $relatedPhrases
): string {
    if ($meanings === [] && $examples === [] && $synonyms === [] && $relatedPhrases === []) {
        return '';
    }

    $cleanWord = lingo_normalize_space($word);
    $wordLower = lingo_lower($cleanWord);
    $base = lingo_base_lang($lang);

    $primaryDef = '';
    if (isset($meanings[0]['definitions'][0]['definition']) && is_string($meanings[0]['definitions'][0]['definition'])) {
        $primaryDef = lingo_lowercase_definition_start($meanings[0]['definitions'][0]['definition'], $lang);
    }

    $chosenExample = '';
    foreach ($examples as $ex) {
        if (!is_string($ex)) {
            continue;
        }
        $normEx = lingo_normalize_space($ex);
        if ($normEx === '') {
            continue;
        }
        if (strpos(lingo_lower($normEx), $wordLower) !== false) {
            $chosenExample = $normEx;
            break;
        }
        if ($chosenExample === '') {
            $chosenExample = $normEx;
        }
    }

    $phrasesPool = [];
    $seenPool = [$wordLower => true];
    foreach (array_merge($relatedPhrases, $synonyms) as $item) {
        if (!is_string($item)) {
            continue;
        }
        $cleanItem = lingo_clean_synonym_candidate($item);
        if ($cleanItem === '') {
            continue;
        }
        $key = lingo_lower($cleanItem);
        if (isset($seenPool[$key])) {
            continue;
        }
        $seenPool[$key] = true;
        $phrasesPool[] = $cleanItem;
    }

    $p1 = $phrasesPool[0] ?? '';
    $p2 = $phrasesPool[1] ?? '';
    $s2Lower = lingo_lower($chosenExample);
    $unusedAlt = '';
    foreach ($phrasesPool as $cand) {
        if ($chosenExample === '' && ($cand === $p1 || $cand === $p2)) {
            continue;
        }
        if ($s2Lower !== '' && strpos($s2Lower, lingo_lower($cand)) !== false) {
            continue;
        }
        $unusedAlt = $cand;
        break;
    }

    $sentences = [];
    $templateLang = ($lang === 'zh-TW') ? 'zh-TW' : (($base === 'zh') ? 'zh-CN' : $base);

    switch ($templateLang) {
        case 'vi':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('Trong tiếng Việt, "' . $cleanWord . '" có nghĩa là ' . $primaryDef, $lang)
                : lingo_ensure_sentence('Trong tiếng Việt, "' . $cleanWord . '" là một cách diễn đạt quen thuộc thường được dùng trong giao tiếp hằng ngày', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('Người bản ngữ thường dùng "' . $cleanWord . '" cùng với các cách nói liên quan như "' . $p1 . '" hoặc "' . $p2 . '"', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('Bạn sẽ thường gặp "' . $cleanWord . '" đi kèm hoặc thay thế cho cách diễn đạt như "' . $p1 . '"', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('Cách nói "' . $cleanWord . '" xuất hiện phổ biến trong cả hội thoại hằng ngày lẫn văn bản viết', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('Tùy theo ngữ cảnh, "' . $unusedAlt . '" cũng có thể được sử dụng như một lựa chọn gần nghĩa hoặc bổ trợ cho "' . $cleanWord . '"', $lang);
            }
            break;

        case 'ja':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('日本語で「' . $cleanWord . '」は「' . $primaryDef . '」という意味で使われます', $lang)
                : lingo_ensure_sentence('日本語で「' . $cleanWord . '」は、日常会話や文章の中でよく使われる表現です', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('文脈に応じて、「' . $p1 . '」や「' . $p2 . '」といった関連表現と一緒に使われることがよくあります', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('実際の会話では、「' . $p1 . '」などの表現とあわせて用いられることがあります', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('話し言葉から書き言葉まで、幅広い場面で「' . $cleanWord . '」が用いられます', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('場面によっては、「' . $unusedAlt . '」が「' . $cleanWord . '」に近い言い換えとして使われます', $lang);
            }
            break;

        case 'ko':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('한국어에서 "' . $cleanWord . '" 표현은 "' . $primaryDef . '"의 의미로 쓰입니다', $lang)
                : lingo_ensure_sentence('한국어에서 "' . $cleanWord . '" 표현은 일상 대화와 글에서 자주 쓰입니다', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('실제 문맥에서는 "' . $p1 . '", "' . $p2 . '" 같은 관련 표현과 함께 자주 사용됩니다', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('실제 문맥에서는 "' . $p1 . '" 같은 표현과 함께 자주 사용됩니다', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('이 표현은 일상 회화와 다양한 글에서 자연스럽게 접할 수 있습니다', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('상황에 따라 "' . $unusedAlt . '" 표현을 비슷한 의미로 대신 사용할 수도 있습니다', $lang);
            }
            break;

        case 'zh-CN':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('在汉语中，“' . $cleanWord . '”的意思是' . $primaryDef, $lang)
                : lingo_ensure_sentence('在汉语中，“' . $cleanWord . '”是一个在日常交流和书面语中经常使用的词语', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('在实际表达中，它常与“' . $p1 . '”和“' . $p2 . '”等相关表达搭配使用', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('在实际表达中，它常与“' . $p1 . '”等表达一起出现', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('这个词语在日常对话和各类文章中都很常见', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('根据语境的不同，“' . $unusedAlt . '”也可以作为“' . $cleanWord . '”的近义或相关表达', $lang);
            }
            break;

        case 'zh-TW':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('在漢語中，「' . $cleanWord . '」的意思是' . $primaryDef, $lang)
                : lingo_ensure_sentence('在漢語中，「' . $cleanWord . '」是一個在日常交流和書面語中經常使用的詞語', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('在實際表達中，它常與「' . $p1 . '」和「' . $p2 . '」等相關表達搭配使用', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('在實際表達中，它常與「' . $p1 . '」等表達一起出現', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('這個詞語在日常對話和各類文章中都很常見', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('根據語境的不同，「' . $unusedAlt . '」也可以作為「' . $cleanWord . '」的近義或相關表達', $lang);
            }
            break;

        case 'fr':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('En français, « ' . $cleanWord . ' » signifie ' . $primaryDef, $lang)
                : lingo_ensure_sentence('En français, « ' . $cleanWord . ' » est une expression couramment employée dans la communication quotidienne', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('Dans l\'usage courant, on emploie souvent « ' . $cleanWord . ' » avec des expressions proches comme « ' . $p1 . ' » et « ' . $p2 . ' »', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('On rencontre fréquemment « ' . $cleanWord . ' » aux côtés d\'expressions comme « ' . $p1 . ' »', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('Ce terme apparaît aussi bien à l\'oral que dans les textes écrits', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('Selon le contexte, « ' . $unusedAlt . ' » peut servir d\'alternative proche à « ' . $cleanWord . ' »', $lang);
            }
            break;

        case 'de':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('Im Deutschen bedeutet „' . $cleanWord . '“ ' . $primaryDef, $lang)
                : lingo_ensure_sentence('Im Deutschen wird „' . $cleanWord . '“ häufig in der Alltagssprache und in Texten verwendet', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('Im natürlichen Sprachgebrauch wird „' . $cleanWord . '“ oft zusammen mit Ausdrücken wie „' . $p1 . '“ und „' . $p2 . '“ verwendet', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('Man begegnet „' . $cleanWord . '“ häufig im Zusammenhang mit Ausdrücken wie „' . $p1 . '“', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('Dieser Ausdruck kommt sowohl in Gesprächen als auch in geschriebenen Texten vor', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('Je nach Kontext kann „' . $unusedAlt . '“ als sinnverwandte Alternative zu „' . $cleanWord . '“ dienen', $lang);
            }
            break;

        case 'es':
            $sentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('En español, «' . $cleanWord . '» significa ' . $primaryDef, $lang)
                : lingo_ensure_sentence('En español, «' . $cleanWord . '» es una expresión de uso frecuente en la comunicación diaria', $lang);
            if ($chosenExample !== '') {
                $sentences[] = lingo_ensure_sentence($chosenExample, $lang);
            } elseif ($p1 !== '' && $p2 !== '') {
                $sentences[] = lingo_ensure_sentence('En el uso cotidiano, «' . $cleanWord . '» suele aparecer junto a expresiones como «' . $p1 . '» y «' . $p2 . '»', $lang);
            } elseif ($p1 !== '') {
                $sentences[] = lingo_ensure_sentence('Es común encontrar «' . $cleanWord . '» acompañado de frases como «' . $p1 . '»', $lang);
            } else {
                $sentences[] = lingo_ensure_sentence('Esta expresión se utiliza habitualmente tanto en conversaciones como en textos escritos', $lang);
            }
            if ($unusedAlt !== '') {
                $sentences[] = lingo_ensure_sentence('Según el contexto, «' . $unusedAlt . '» puede funcionar como una alternativa cercana a «' . $cleanWord . '»', $lang);
            }
            break;

        default:
            $enSentences = [];
            $enSentences[] = $primaryDef !== ''
                ? lingo_ensure_sentence('The expression "' . $cleanWord . '" means ' . $primaryDef)
                : lingo_ensure_sentence('The expression "' . $cleanWord . '" is commonly used in everyday communication');
            if ($chosenExample !== '') {
                $enSentences[] = lingo_ensure_sentence($chosenExample);
            } elseif ($p1 !== '' && $p2 !== '') {
                $enSentences[] = lingo_ensure_sentence('Speakers often use "' . $cleanWord . '" alongside related expressions such as "' . $p1 . '" and "' . $p2 . '"');
            } elseif ($p1 !== '') {
                $enSentences[] = lingo_ensure_sentence('You will often encounter "' . $cleanWord . '" with phrases like "' . $p1 . '"');
            } else {
                $enSentences[] = lingo_ensure_sentence('It appears naturally in both spoken conversation and written texts');
            }
            if ($unusedAlt !== '') {
                $enSentences[] = lingo_ensure_sentence('Depending on the context, "' . $unusedAlt . '" can serve as a close alternative to "' . $cleanWord . '"');
            }
            $enTemplate = implode(' ', array_filter($enSentences));
            $translated = lingo_translate_via_gt($enTemplate, 'en', $lang, 3);
            return $translated !== '' ? $translated : $enTemplate;
    }

    $sep = lingo_is_cjk_no_space_lang($lang) ? '' : ' ';
    return implode($sep, array_filter($sentences, function ($s) {
        return $s !== '';
    }));
}

$rawWord = trim((string) ($_GET['word'] ?? ''));
$rawLang = lingo_normalize_lang_code((string) ($_GET['lang'] ?? 'en'));

$wordLen = lingo_strlen($rawWord);
if ($rawWord === '' || $wordLen > 100) {
    lingo_reply(400, array_merge(
        ['error' => $rawWord === '' ? 'Missing word parameter' : 'Word is too long'],
        emptyDictionaryPayload($rawWord, $rawLang)
    ));
}

$resolvedLang = $rawLang;
$gtRichExtracted = null;

if ($rawLang !== 'en') {
    $gtData = lingo_fetch_gt_rich($rawWord, $rawLang);
    if (is_array($gtData)) {
        $gtRichExtracted = lingo_extract_gt_rich($gtData, $rawWord, $rawLang);
        $resolvedLang = $gtRichExtracted['resolvedLang'];
    } elseif ($resolvedLang === 'auto') {
        $resolvedLang = 'en';
    }
}

if ($resolvedLang !== 'en') {
    $meanings = $gtRichExtracted !== null ? $gtRichExtracted['meanings'] : [];
    $synonyms = $gtRichExtracted !== null ? $gtRichExtracted['synonyms'] : [];
    $examples = $gtRichExtracted !== null ? $gtRichExtracted['examples'] : [];
    $enTranslation = $gtRichExtracted !== null ? $gtRichExtracted['enTranslation'] : '';

    if ($meanings === []) {
        $meanings = lingo_fetch_wiktionary_meanings($rawWord, $resolvedLang);
    }

    $relatedPhrases = lingo_build_multilang_related_phrases(
        $rawWord,
        $resolvedLang,
        $enTranslation,
        $synonyms,
        $examples
    );

    $contextParagraph = lingo_build_multilang_context_paragraph(
        $rawWord,
        $resolvedLang,
        $meanings,
        $examples,
        $synonyms,
        $relatedPhrases
    );

    if ($meanings === [] && $synonyms === [] && $relatedPhrases === [] && $contextParagraph === '') {
        lingo_reply(404, emptyDictionaryPayload($rawWord, $resolvedLang));
    }

    lingo_reply(200, [
        'word' => $rawWord,
        'lang' => $resolvedLang,
        'phonetic' => '',
        'audioUrl' => '',
        'meanings' => $meanings,
        'synonyms' => $synonyms,
        'examples' => $examples,
        'relatedPhrases' => $relatedPhrases,
        'contextParagraph' => $contextParagraph,
    ]);
}

$targetUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en/' . rawurlencode(strtolower($rawWord));
$res = lingo_http_get_json($targetUrl, 8);
$status = $res['status'];
$entries = $res['data'];

if ($status === 404) {
    lingo_reply(404, emptyDictionaryPayload($rawWord, 'en'));
}

if ($status !== 200 || !is_array($entries) || $entries === []) {
    lingo_reply(502, array_merge(
        ['error' => 'Dictionary service unavailable'],
        emptyDictionaryPayload($rawWord, 'en')
    ));
}

$primary = is_array($entries[0] ?? null) ? $entries[0] : [];
$phonetic = isset($primary['phonetic']) && is_string($primary['phonetic']) ? trim($primary['phonetic']) : '';
$audioUrl = '';

foreach ($entries as $entry) {
    if (!is_array($entry)) {
        continue;
    }
    if ($phonetic === '' && isset($entry['phonetic']) && is_string($entry['phonetic'])) {
        $phonetic = trim($entry['phonetic']);
    }
    if (isset($entry['phonetics']) && is_array($entry['phonetics'])) {
        foreach ($entry['phonetics'] as $p) {
            if (!is_array($p)) {
                continue;
            }
            if ($phonetic === '' && isset($p['text']) && is_string($p['text'])) {
                $phonetic = trim($p['text']);
            }
            if ($audioUrl === '' && isset($p['audio']) && is_string($p['audio']) && trim($p['audio']) !== '') {
                $rawAudio = trim($p['audio']);
                $audioUrl = strpos($rawAudio, '//') === 0 ? 'https:' . $rawAudio : $rawAudio;
            }
        }
    }
}

$meanings = [];
$synonymMap = [];
$exampleMap = [];

foreach ($entries as $entry) {
    if (!is_array($entry) || !isset($entry['meanings']) || !is_array($entry['meanings'])) {
        continue;
    }
    foreach ($entry['meanings'] as $m) {
        if (!is_array($m)) {
            continue;
        }
        $partOfSpeech = isset($m['partOfSpeech']) && is_string($m['partOfSpeech']) ? trim($m['partOfSpeech']) : '';
        if (isset($m['synonyms']) && is_array($m['synonyms'])) {
            foreach ($m['synonyms'] as $s) {
                if (is_string($s) && trim($s) !== '') {
                    $synonymMap[trim($s)] = true;
                }
            }
        }

        $defs = [];
        if (isset($m['definitions']) && is_array($m['definitions'])) {
            foreach ($m['definitions'] as $d) {
                if (!is_array($d)) {
                    continue;
                }
                $definition = isset($d['definition']) && is_string($d['definition']) ? trim($d['definition']) : '';
                $example = isset($d['example']) && is_string($d['example']) ? trim($d['example']) : '';
                if ($definition !== '') {
                    $defs[] = [
                        'definition' => $definition,
                        'example' => $example,
                    ];
                }
                if ($example !== '') {
                    $exampleMap[$example] = true;
                }
                if (isset($d['synonyms']) && is_array($d['synonyms'])) {
                    foreach ($d['synonyms'] as $s) {
                        if (is_string($s) && trim($s) !== '') {
                            $synonymMap[trim($s)] = true;
                        }
                    }
                }
                if (count($defs) >= 4) {
                    break;
                }
            }
        }

        if ($partOfSpeech !== '' || $defs !== []) {
            $meanings[] = [
                'partOfSpeech' => $partOfSpeech,
                'definitions' => $defs,
            ];
        }
    }
}

$resolvedWord = isset($primary['word']) && is_string($primary['word']) && trim($primary['word']) !== ''
    ? trim($primary['word'])
    : $rawWord;

$limitedMeanings = array_slice($meanings, 0, 6);
$limitedSynonyms = array_slice(array_keys($synonymMap), 0, 12);
$limitedExamples = array_slice(array_keys($exampleMap), 0, 8);

$datamuse = lingo_fetch_datamuse_collocations($resolvedWord);
$relatedPhrases = lingo_build_related_phrases(
    $resolvedWord,
    $datamuse['collocations'],
    $datamuse['related'],
    $limitedExamples,
    $limitedSynonyms
);
$contextParagraph = lingo_build_context_paragraph(
    $resolvedWord,
    $limitedMeanings,
    $limitedExamples,
    $limitedSynonyms,
    $datamuse['collocations'],
    $relatedPhrases
);

lingo_reply(200, [
    'word' => $resolvedWord,
    'lang' => 'en',
    'phonetic' => $phonetic,
    'audioUrl' => $audioUrl,
    'meanings' => $limitedMeanings,
    'synonyms' => $limitedSynonyms,
    'examples' => $limitedExamples,
    'relatedPhrases' => $relatedPhrases,
    'contextParagraph' => $contextParagraph,
]);
