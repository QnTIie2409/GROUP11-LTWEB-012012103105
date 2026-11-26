/**
 * LingoRecorder - Browser Voice Recording & Playback Module
 */
(function (global) {
  'use strict';

  const SUPPORTED_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pickMimeType() {
    const MediaRecorderCtor = getMediaRecorderCtor();
    if (typeof MediaRecorderCtor !== 'function' || typeof MediaRecorderCtor.isTypeSupported !== 'function') {
      return '';
    }
    for (const mime of SUPPORTED_MIME_TYPES) {
      try {
        if (MediaRecorderCtor.isTypeSupported(mime)) {
          return mime;
        }
      } catch (_) {}
    }
    return '';
  }

  function isOperaBrowser() {
    if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') {
      return false;
    }
    return /\b(?:OPR|Opera)\//i.test(navigator.userAgent);
  }

  function getSpeechRecognitionCtor() {
    if (isOperaBrowser()) {
      // Opera / Opera GX exposes webkitSpeechRecognition without Google's Speech API key,
      // so skip broken Web Speech API and use the in-browser Whisper fallback cleanly.
      return null;
    }
    const win = typeof window !== 'undefined' ? window : null;
    if (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) {
      return win.SpeechRecognition || win.webkitSpeechRecognition;
    }
    if (typeof globalThis !== 'undefined' && (globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition)) {
      return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    }
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function getFallbackStt() {
    const win = typeof window !== 'undefined' ? window : null;
    if (win && win.LingoStt && typeof win.LingoStt.transcribe === 'function') {
      return win.LingoStt;
    }
    if (typeof globalThis !== 'undefined' && globalThis.LingoStt && typeof globalThis.LingoStt.transcribe === 'function') {
      return globalThis.LingoStt;
    }
    return (global.LingoStt && typeof global.LingoStt.transcribe === 'function') ? global.LingoStt : null;
  }

  function warmUpFallbackStt() {
    const fallback = getFallbackStt();
    if (fallback && typeof fallback.preload === 'function') {
      try {
        fallback.preload();
      } catch (_) {}
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const state = {
    recordBtn: null,
    statusEl: null,
    playbackContainerEl: null,
    onToast: null,
    getSpeechLang: null,
    getSourceLang: null,
    onRecordStart: null,
    onTranscript: null,
    onRecordStop: null,
    mediaRecorder: null,
    mediaStream: null,
    recognition: null,
    recognitionStopped: false,
    recognitionEndPromise: null,
    resolveRecognitionEnd: null,
    sttSupported: false,
    sttActive: false,
    sttError: '',
    latestTranscript: '',
    stopNotified: false,
    runId: 0,
    chunks: [],
    timerId: null,
    startedAt: 0,
    lastDurationMs: 0,
    objectUrl: null,
    recording: false,
    initialized: false
  };

  function formatRecordingStatus(elapsedMs) {
    const timeStr = formatDuration(elapsedMs);
    return state.sttActive
      ? 'Đang ghi âm & nhận diện giọng nói ' + timeStr
      : 'Đang ghi âm ' + timeStr;
  }

  function stopRecognition() {
    if (state.recognition && !state.recognitionStopped) {
      state.recognitionStopped = true;
      try {
        if (typeof state.recognition.stop === 'function') {
          state.recognition.stop();
        }
      } catch (_) {
        if (typeof state.resolveRecognitionEnd === 'function') {
          state.resolveRecognitionEnd();
        }
      }
    }
    state.sttActive = false;
  }

  function notifyRecordStop(text) {
    if (state.stopNotified) return;
    state.stopNotified = true;
    if (typeof state.onRecordStop === 'function') {
      try {
        state.onRecordStop({
          text: text || '',
          sttSupported: Boolean(state.sttSupported),
          sttError: state.sttError || ''
        });
      } catch (_) {}
    }
  }

  function toast(message) {
    if (typeof state.onToast === 'function' && message) {
      try {
        state.onToast(message);
      } catch (_) {}
    }
  }

  function setBarVisibility(visible) {
    const targets = [state.statusEl, state.playbackContainerEl];
    for (const el of targets) {
      if (!el) continue;
      const bar = typeof el.closest === 'function' ? el.closest('.voice-recorder-bar') : null;
      if (bar) {
        bar.classList.toggle('hidden', !visible);
      }
    }
  }

  function revokeCurrentUrl() {
    if (state.objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(state.objectUrl);
      } catch (_) {}
    }
    state.objectUrl = null;
  }

  function stopStreamTracks() {
    if (state.mediaStream && typeof state.mediaStream.getTracks === 'function') {
      state.mediaStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
    }
    state.mediaStream = null;
  }

  function stopTimer() {
    if (state.timerId !== null) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function setRecordBtnState(isRecording) {
    if (!state.recordBtn) return;
    state.recordBtn.classList.toggle('recording', isRecording);
    state.recordBtn.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
    state.recordBtn.title = isRecording ? 'Dừng ghi âm' : 'Ghi âm giọng nói';
    state.recordBtn.setAttribute('aria-label', isRecording ? 'Dừng ghi âm' : 'Ghi âm giọng nói');
  }

  function setStatus(text, type) {
    if (!state.statusEl) return;
    if (!text) {
      state.statusEl.innerHTML = '';
      state.statusEl.className = 'recorder-status';
      return;
    }

    const kind = type || 'info';
    state.statusEl.className = 'recorder-status recorder-status-' + (kind === 'transcribing' ? 'info' : kind);
    if (kind === 'recording') {
      state.statusEl.innerHTML =
        '<span class="recorder-dot" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(text) + '</span>';
    } else if (kind === 'transcribing') {
      state.statusEl.innerHTML =
        '<span class="dictionary-spinner" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(text) + '</span>';
    } else {
      state.statusEl.textContent = text;
    }
  }

  function clearPlayback() {
    if (state.playbackContainerEl) {
      const audioEl = state.playbackContainerEl.querySelector('audio');
      if (audioEl) {
        try {
          audioEl.pause();
          audioEl.removeAttribute('src');
          audioEl.load();
        } catch (_) {}
      }
      state.playbackContainerEl.innerHTML = '';
    }
    revokeCurrentUrl();
  }

  function clear() {
    state.runId += 1;
    clearPlayback();
    setStatus('', 'info');
    if (!state.recording) {
      setBarVisibility(false);
    }
  }

  function renderPlayback(blob, durationMs) {
    if (!state.playbackContainerEl) return;
    clearPlayback();

    let url = '';
    try {
      url = URL.createObjectURL(blob);
    } catch (err) {
      console.warn('LingoRecorder createObjectURL error:', err);
      setStatus('Không thể tạo trình phát âm thanh.', 'error');
      return;
    }
    state.objectUrl = url;
    const durationLabel = formatDuration(durationMs);

    state.playbackContainerEl.innerHTML =
      '<div class="recorder-playback-card">' +
        '<span class="recorder-playback-label">Voice note (' + escapeHtml(durationLabel) + ')</span>' +
        '<audio controls class="recorder-audio" preload="metadata"></audio>' +
        '<button type="button" class="icon-btn recorder-clear-btn" title="Xóa bản ghi âm" aria-label="Xóa bản ghi âm">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
            '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
          '</svg>' +
        '</button>' +
      '</div>';

    const audioEl = state.playbackContainerEl.querySelector('audio');
    if (audioEl) {
      audioEl.src = url;
    }

    const removeBtn = state.playbackContainerEl.querySelector('.recorder-clear-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        clear();
        toast('Đã xóa bản ghi âm');
      });
    }

    setBarVisibility(true);
  }

  function getMediaRecorderCtor() {
    const win = typeof window !== 'undefined' ? window : null;
    if (win && typeof win.MediaRecorder === 'function') {
      return win.MediaRecorder;
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.MediaRecorder === 'function') {
      return globalThis.MediaRecorder;
    }
    return typeof global.MediaRecorder === 'function' ? global.MediaRecorder : null;
  }

  function isBrowserSupported() {
    const MediaRecorderCtor = getMediaRecorderCtor();
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorderCtor === 'function'
    );
  }

  function startSpeechRecognition() {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    state.sttSupported = typeof SpeechRecognitionCtor === 'function';
    state.sttActive = false;
    state.sttError = '';
    state.latestTranscript = '';
    state.recognition = null;
    state.recognitionStopped = false;
    state.recognitionEndPromise = null;
    state.resolveRecognitionEnd = null;

    if (!state.sttSupported) {
      warmUpFallbackStt();
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      const speechLang = (typeof state.getSpeechLang === 'function' ? state.getSpeechLang() : '') || 'vi-VN';
      recognition.lang = speechLang;
      recognition.continuous = true;
      recognition.interimResults = true;

      let resolveEnd = null;
      state.recognitionEndPromise = new Promise((resolve) => {
        resolveEnd = resolve;
      });
      state.resolveRecognitionEnd = () => {
        if (resolveEnd) {
          const fn = resolveEnd;
          resolveEnd = null;
          fn();
        }
      };

      recognition.onresult = (event) => {
        const results = event && event.results;
        if (!results || typeof results.length !== 'number') return;

        const finalParts = [];
        const interimParts = [];

        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          if (!res || !res[0]) continue;
          const piece = typeof res[0].transcript === 'string' ? res[0].transcript.trim() : '';
          if (!piece) continue;

          if (res.isFinal) {
            finalParts.push(piece);
          } else {
            interimParts.push(piece);
          }
        }

        const finalText = finalParts.join(' ').replace(/\s+/g, ' ').trim();
        const interimText = interimParts.join(' ').replace(/\s+/g, ' ').trim();
        const combined = [finalText, interimText].filter(Boolean).join(' ').trim();
        if (!combined) return;

        state.latestTranscript = combined;
        const isFinal = interimParts.length === 0 && finalParts.length > 0;

        if (typeof state.onTranscript === 'function') {
          try {
            state.onTranscript({ text: combined, isFinal });
          } catch (_) {}
        }
      };

      recognition.onerror = (event) => {
        const errCode = event && event.error ? String(event.error) : 'unknown';
        if (!state.sttError || errCode !== 'no-speech') {
          state.sttError = errCode;
        }
        if (errCode !== 'no-speech') {
          state.sttActive = false;
          warmUpFallbackStt();
          if (state.recording) {
            setStatus(formatRecordingStatus(Date.now() - state.startedAt), 'recording');
          }
        }
      };

      recognition.onend = () => {
        state.sttActive = false;
        if (typeof state.resolveRecognitionEnd === 'function') {
          state.resolveRecognitionEnd();
        }
        if (state.recording) {
          setStatus(formatRecordingStatus(Date.now() - state.startedAt), 'recording');
        }
      };

      recognition.start();
      state.recognition = recognition;
      state.sttActive = true;
    } catch (err) {
      state.recognition = null;
      state.sttActive = false;
      state.recognitionEndPromise = null;
      state.resolveRecognitionEnd = null;
      state.sttError = (err && err.name) ? String(err.name) : 'start-failed';
      warmUpFallbackStt();
    }
  }

  async function startRecording() {
    if (state.recording) return;

    if (!isBrowserSupported()) {
      const msg = 'Trình duyệt của bạn không hỗ trợ ghi âm trực tiếp.';
      setBarVisibility(true);
      setStatus(msg, 'error');
      toast(msg);
      return;
    }

    state.runId += 1;
    const currentRunId = state.runId;

    clearPlayback();
    setBarVisibility(true);
    setStatus('Đang xin quyền micro…', 'info');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (currentRunId !== state.runId) {
        stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        return;
      }
      state.mediaStream = stream;
      state.chunks = [];

      const MediaRecorderCtor = getMediaRecorderCtor();
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorderCtor(stream, { mimeType })
        : new MediaRecorderCtor(stream);

      state.mediaRecorder = recorder;
      state.recording = true;
      state.startedAt = Date.now();
      state.lastDurationMs = 0;
      state.stopNotified = false;

      if (typeof state.onRecordStart === 'function') {
        try {
          state.onRecordStart();
        } catch (_) {}
      }

      startSpeechRecognition();

      setRecordBtnState(true);
      setStatus(formatRecordingStatus(0), 'recording');

      recorder.ondataavailable = (event) => {
        if (event && event.data && event.data.size > 0) {
          state.chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.warn('MediaRecorder error:', event);
        stopTimer();
        stopRecognition();
        state.recognition = null;
        stopStreamTracks();
        state.recording = false;
        setRecordBtnState(false);
        const errMsg = 'Không thể ghi âm. Vui lòng thử lại.';
        setStatus(errMsg, 'error');
        toast(errMsg);
        notifyRecordStop(state.latestTranscript.trim());
      };

      recorder.onstop = async () => {
        const elapsed = Date.now() - state.startedAt;
        state.lastDurationMs = elapsed;
        const endPromise = state.recognitionEndPromise;
        stopTimer();
        stopRecognition();
        state.recognition = null;
        stopStreamTracks();
        state.recording = false;
        setRecordBtnState(false);

        const durationLabel = formatDuration(elapsed);
        const recordedChunks = state.chunks.slice();
        state.chunks = [];

        if (recordedChunks.length === 0) {
          setStatus('Không thu được âm thanh.', 'error');
          notifyRecordStop((state.latestTranscript || '').trim());
          return;
        }

        const blobType = (recorder && recorder.mimeType) || mimeType || 'audio/webm';
        const blob = new Blob(recordedChunks, { type: blobType });
        renderPlayback(blob, elapsed);

        // Give Web Speech API a brief window to emit its final onresult after stop()
        if (endPromise) {
          setStatus('Đang xử lý giọng nói…', 'transcribing');
          await Promise.race([endPromise, sleep(600)]);
          if (currentRunId !== state.runId) return;
        }

        const capturedText = (state.latestTranscript || '').trim();
        if (capturedText) {
          setStatus('Đã ghi âm & chuyển thành chữ (' + durationLabel + ')', 'ready');
          if (typeof state.onTranscript === 'function') {
            try {
              state.onTranscript({ text: capturedText, isFinal: true });
            } catch (_) {}
          }
          notifyRecordStop(capturedText);
          return;
        }

        // Fallback: transcribe the recorded audio Blob directly in-browser via AI Whisper
        const fallbackStt = getFallbackStt();
        if (!fallbackStt) {
          setStatus('Đã ghi âm (' + durationLabel + ') · Chưa tải được bộ nhận diện giọng nói.', 'error');
          notifyRecordStop('');
          return;
        }

        const sourceLang = (typeof state.getSourceLang === 'function' ? state.getSourceLang() : '') || '';
        const speechLang = (typeof state.getSpeechLang === 'function' ? state.getSpeechLang() : '') || 'vi-VN';
        const targetLangHint = (!sourceLang || sourceLang === 'auto') ? 'auto' : (sourceLang || speechLang);

        setStatus('Đang chuyển giọng nói thành chữ…', 'transcribing');

        try {
          const result = await fallbackStt.transcribe(blob, targetLangHint, (progress) => {
            if (currentRunId !== state.runId) return;
            if (!progress) return;
            if (progress.phase === 'loading') {
              const pct = typeof progress.pct === 'number' && progress.pct > 0 ? ' ' + progress.pct + '%' : '';
              setStatus('Đang tải mô hình nhận diện giọng nói AI…' + pct, 'transcribing');
            } else if (progress.phase === 'transcribing') {
              setStatus('Đang chuyển giọng nói thành chữ…', 'transcribing');
            }
          });

          if (currentRunId !== state.runId) return;

          const aiText = result && typeof result.text === 'string' ? result.text.trim() : '';
          if (aiText) {
            state.latestTranscript = aiText;
            setStatus('Đã ghi âm & chuyển thành chữ (' + durationLabel + ')', 'ready');
            if (typeof state.onTranscript === 'function') {
              try {
                state.onTranscript({ text: aiText, isFinal: true });
              } catch (_) {}
            }
            notifyRecordStop(aiText);
          } else if (result && result.silent) {
            setStatus(
              'Đã ghi âm (' + durationLabel + ') · Không phát hiện giọng nói (hãy nói to hơn hoặc kiểm tra micro).',
              'error'
            );
            notifyRecordStop('');
          } else {
            setStatus(
              'Đã ghi âm (' + durationLabel + ') · Chưa nghe rõ câu chữ, vui lòng thử nói lại.',
              'info'
            );
            notifyRecordStop('');
          }
        } catch (sttErr) {
          console.warn('LingoStt fallback error:', sttErr);
          if (currentRunId !== state.runId) return;
          setStatus(
            'Đã ghi âm (' + durationLabel + ') · Không thể nhận diện giọng nói tự động.',
            'error'
          );
          notifyRecordStop('');
        }
      };

      state.timerId = setInterval(() => {
        if (!state.recording) return;
        const elapsed = Date.now() - state.startedAt;
        setStatus(formatRecordingStatus(elapsed), 'recording');
      }, 250);

      recorder.start();
    } catch (err) {
      stopTimer();
      stopRecognition();
      state.recognition = null;
      stopStreamTracks();
      state.recording = false;
      setRecordBtnState(false);

      const errName = err && err.name ? err.name : '';
      let msg = 'Không thể truy cập micro.';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        msg = 'Quyền truy cập micro bị từ chối. Vui lòng cấp quyền để ghi âm.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        msg = 'Không tìm thấy thiết bị micro.';
      } else if (errName === 'NotReadableError') {
        msg = 'Micro đang được sử dụng bởi ứng dụng khác.';
      }

      setBarVisibility(true);
      setStatus(msg, 'error');
      toast(msg);
    }
  }

  function stop() {
    if (!state.recording || !state.mediaRecorder) return;
    stopRecognition();
    try {
      if (state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      }
    } catch (err) {
      console.warn('Error stopping MediaRecorder:', err);
      stopTimer();
      state.recognition = null;
      stopStreamTracks();
      state.recording = false;
      setRecordBtnState(false);
      notifyRecordStop(state.latestTranscript.trim());
    }
  }

  function handleRecordClick() {
    if (!isBrowserSupported()) {
      const msg = 'Trình duyệt của bạn không hỗ trợ ghi âm trực tiếp.';
      setBarVisibility(true);
      setStatus(msg, 'error');
      toast(msg);
      return;
    }

    if (state.recording) {
      stop();
    } else {
      startRecording();
    }
  }

  function init(options = {}) {
    try {
      state.recordBtn = options.recordBtn || null;
      state.statusEl = options.statusEl || null;
      state.playbackContainerEl = options.playbackContainerEl || null;
      state.onToast = typeof options.onToast === 'function' ? options.onToast : null;
      state.getSpeechLang = typeof options.getSpeechLang === 'function' ? options.getSpeechLang : null;
      state.getSourceLang = typeof options.getSourceLang === 'function' ? options.getSourceLang : null;
      state.onRecordStart = typeof options.onRecordStart === 'function' ? options.onRecordStart : null;
      state.onTranscript = typeof options.onTranscript === 'function' ? options.onTranscript : null;
      state.onRecordStop = typeof options.onRecordStop === 'function' ? options.onRecordStop : null;

      if (state.recordBtn && !state.initialized) {
        state.recordBtn.addEventListener('click', handleRecordClick);
        state.initialized = true;
      }

      if (state.recordBtn) {
        if (!isBrowserSupported()) {
          state.recordBtn.classList.add('recorder-unsupported');
          state.recordBtn.setAttribute('aria-disabled', 'true');
          state.recordBtn.title = 'Trình duyệt không hỗ trợ ghi âm';
        } else {
          state.recordBtn.classList.remove('recorder-unsupported');
          state.recordBtn.removeAttribute('aria-disabled');
          setRecordBtnState(false);
        }
      }

      if (typeof global.addEventListener === 'function') {
        global.addEventListener('pagehide', revokeCurrentUrl, { once: true });
      }
    } catch (err) {
      console.warn('LingoRecorder init error:', err);
    }
  }

  const LingoRecorder = {
    init,
    stop,
    clear,
    isRecording: () => state.recording
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LingoRecorder;
  }
  global.LingoRecorder = LingoRecorder;
})(typeof window !== 'undefined' ? window : this);
