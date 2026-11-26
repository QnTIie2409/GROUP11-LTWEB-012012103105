/**
 * LingoStt - Client-side AI Speech-to-Text fallback using Whisper (@xenova/transformers)
 * Works across Opera GX, Firefox, Safari, Chrome, Edge, and mobile browsers without API keys.
 */
(function (global) {
  'use strict';

  const TRANSFORMERS_CDNS = [
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
    'https://unpkg.com/@xenova/transformers@2.17.2'
  ];
  const WHISPER_MODEL = 'Xenova/whisper-tiny';
  const TARGET_SAMPLE_RATE = 16000;

  const WHISPER_LANG_MAP = {
    vi: 'vietnamese',
    en: 'english',
    zh: 'chinese',
    'zh-cn': 'chinese',
    'zh-tw': 'chinese',
    ja: 'japanese',
    ko: 'korean',
    fr: 'french',
    de: 'german',
    es: 'spanish',
    ru: 'russian',
    th: 'thai',
    id: 'indonesian',
    ms: 'malay',
    ar: 'arabic',
    hi: 'hindi',
    pt: 'portuguese',
    it: 'italian',
    nl: 'dutch',
    pl: 'polish',
    tr: 'turkish',
    uk: 'ukrainian',
    cs: 'czech',
    sv: 'swedish',
    da: 'danish',
    fi: 'finnish',
    no: 'norwegian',
    el: 'greek',
    he: 'hebrew',
    hu: 'hungarian',
    ro: 'romanian',
    tl: 'tagalog',
    km: 'khmer',
    lo: 'lao',
    my: 'myanmar'
  };

  const NOISE_ARTIFACT_RE = /^\s*(?:\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+|…+|\.+)\s*$/i;
  const INLINE_TAG_RE = /\[(?:BLANK_AUDIO|MUSIC|ÂM NHẠC|APPLAUSE|LAUGHTER|SILENCE|INAUDIBLE|SOUND|NOISE)[^\]]*\]|\((?:music|âm nhạc|nhạc|applause|silence|inaudible|tiếng ồn)[^)]*\)/gi;

  let pipelinePromise = null;
  let activeProgressListeners = new Set();

  function resolveWhisperLanguage(rawLang) {
    if (!rawLang || typeof rawLang !== 'string') return null;
    const cleaned = rawLang.trim().toLowerCase().replace(/_/g, '-');
    if (!cleaned || cleaned === 'auto') return null;
    if (Object.prototype.hasOwnProperty.call(WHISPER_LANG_MAP, cleaned)) {
      return WHISPER_LANG_MAP[cleaned];
    }
    const base = cleaned.split('-')[0];
    if (base && Object.prototype.hasOwnProperty.call(WHISPER_LANG_MAP, base)) {
      return WHISPER_LANG_MAP[base];
    }
    return null;
  }

  async function importTransformersModule() {
    let lastErr = null;
    for (const url of TRANSFORMERS_CDNS) {
      try {
        const mod = await import(url);
        if (mod && typeof mod.pipeline === 'function') {
          return mod;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Failed to load @xenova/transformers from CDN');
  }

  function notifyProgressListeners(payload) {
    activeProgressListeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (_) {}
    });
  }

  function getTranscriber(onProgress) {
    if (typeof onProgress === 'function') {
      activeProgressListeners.add(onProgress);
    }

    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        try {
          const mod = await importTransformersModule();
          if (mod.env) {
            mod.env.allowLocalModels = false;
            mod.env.useBrowserCache = true;
          }

          const fileProgress = new Map();
          const transcriber = await mod.pipeline('automatic-speech-recognition', WHISPER_MODEL, {
            quantized: true,
            progress_callback: (event) => {
              if (!event) return;
              const status = typeof event.status === 'string' ? event.status : '';
              if (status === 'progress' && typeof event.file === 'string') {
                const loaded = typeof event.loaded === 'number' ? event.loaded : 0;
                const total = typeof event.total === 'number' && event.total > 0 ? event.total : 0;
                const pct = typeof event.progress === 'number' ? event.progress : (total > 0 ? (loaded / total) * 100 : 0);
                fileProgress.set(event.file, { loaded, total, pct });

                let sumLoaded = 0;
                let sumTotal = 0;
                fileProgress.forEach((entry) => {
                  if (entry.total > 0) {
                    sumLoaded += entry.loaded;
                    sumTotal += entry.total;
                  }
                });

                const overallPct = sumTotal > 0
                  ? Math.max(1, Math.min(99, Math.round((sumLoaded / sumTotal) * 100)))
                  : Math.max(1, Math.min(99, Math.round(pct)));

                notifyProgressListeners({ phase: 'loading', pct: overallPct });
              } else if (status === 'initiate' || status === 'download') {
                notifyProgressListeners({ phase: 'loading', pct: 0 });
              } else if (status === 'ready') {
                notifyProgressListeners({ phase: 'ready', pct: 100 });
              }
            }
          });

          return transcriber;
        } catch (err) {
          pipelinePromise = null;
          throw err;
        }
      })();
    }

    return pipelinePromise.finally(() => {
      if (typeof onProgress === 'function') {
        activeProgressListeners.delete(onProgress);
      }
    });
  }

  function preload(onProgress) {
    return getTranscriber(onProgress).catch((err) => {
      console.warn('LingoStt preload warning:', err);
      return null;
    });
  }

  function mixToMono(audioBuffer) {
    const channels = audioBuffer.numberOfChannels || 1;
    const length = audioBuffer.length || 0;
    if (length === 0) {
      return new Float32Array(0);
    }
    if (channels === 1) {
      return new Float32Array(audioBuffer.getChannelData(0));
    }
    const mono = new Float32Array(length);
    const scale = 1 / channels;
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i] * scale;
      }
    }
    return mono;
  }

  function resampleLinear(input, srcRate, dstRate) {
    if (!input || input.length === 0 || srcRate === dstRate) {
      return input;
    }
    const ratio = srcRate / dstRate;
    const outLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] || 0;
      const s1 = idx + 1 < input.length ? input[idx + 1] : s0;
      output[i] = s0 + (s1 - s0) * frac;
    }
    return output;
  }

  async function decodeBlobToMono16k(blob) {
    if (!blob || typeof blob.arrayBuffer !== 'function') {
      throw new Error('Invalid audio blob');
    }

    const arrayBuffer = await blob.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return { samples: new Float32Array(0), silent: true };
    }

    const win = typeof window !== 'undefined' ? window : global;
    const AudioCtx = win && (win.AudioContext || win.webkitAudioContext);
    if (typeof AudioCtx !== 'function') {
      throw new Error('Web Audio API is not supported in this browser');
    }

    let audioCtx = null;
    let decoded = null;
    try {
      try {
        audioCtx = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
      } catch (_) {
        audioCtx = new AudioCtx();
      }
      decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      if (audioCtx && typeof audioCtx.close === 'function') {
        try {
          await audioCtx.close();
        } catch (_) {}
      }
    }

    if (!decoded || !decoded.length) {
      return { samples: new Float32Array(0), silent: true };
    }

    let samples = null;
    if (decoded.sampleRate === TARGET_SAMPLE_RATE) {
      samples = mixToMono(decoded);
    } else {
      const OfflineCtx = win && (win.OfflineAudioContext || win.webkitOfflineAudioContext);
      if (typeof OfflineCtx === 'function') {
        try {
          const targetLen = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
          const offline = new OfflineCtx(1, targetLen, TARGET_SAMPLE_RATE);
          const source = offline.createBufferSource();
          source.buffer = decoded;
          source.connect(offline.destination);
          source.start(0);
          const rendered = await offline.startRendering();
          samples = new Float32Array(rendered.getChannelData(0));
        } catch (_) {
          samples = resampleLinear(mixToMono(decoded), decoded.sampleRate, TARGET_SAMPLE_RATE);
        }
      } else {
        samples = resampleLinear(mixToMono(decoded), decoded.sampleRate, TARGET_SAMPLE_RATE);
      }
    }

    if (!samples || samples.length < 1200) {
      return { samples: samples || new Float32Array(0), silent: true };
    }

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / samples.length);

    if (rms < 0.0012 || peak < 0.005) {
      return { samples, silent: true };
    }

    // Normalize quiet microphone input so Whisper detects speech clearly
    if (peak > 0.008 && peak < 0.65) {
      const gain = Math.min(12, 0.85 / peak);
      for (let i = 0; i < samples.length; i++) {
        const boosted = samples[i] * gain;
        samples[i] = boosted > 1 ? 1 : (boosted < -1 ? -1 : boosted);
      }
    }

    return { samples, silent: false };
  }

  function cleanTranscript(raw) {
    if (typeof raw !== 'string') return '';
    const stripped = raw
      .replace(INLINE_TAG_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!stripped || NOISE_ARTIFACT_RE.test(stripped)) {
      return '';
    }
    return stripped;
  }

  async function transcribe(blob, langCode, onProgress) {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ phase: 'decoding', pct: 0 });
      } catch (_) {}
    }

    const { samples, silent } = await decodeBlobToMono16k(blob);
    if (silent || !samples.length) {
      return { text: '', silent: true };
    }

    const transcriber = await getTranscriber(onProgress);

    if (typeof onProgress === 'function') {
      try {
        onProgress({ phase: 'transcribing', pct: 100 });
      } catch (_) {}
    }

    const whisperLang = resolveWhisperLanguage(langCode);
    const options = {
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5
    };
    if (whisperLang) {
      options.language = whisperLang;
    }

    const output = await transcriber(samples, options);
    const rawText = output && typeof output.text === 'string'
      ? output.text
      : (Array.isArray(output) && output[0] && typeof output[0].text === 'string' ? output[0].text : '');

    return {
      text: cleanTranscript(rawText),
      silent: false
    };
  }

  const api = {
    preload,
    transcribe,
    isReady: () => Boolean(pipelinePromise)
  };

  if (typeof window !== 'undefined') {
    window.LingoStt = api;
  }
  if (typeof global !== 'undefined') {
    global.LingoStt = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
