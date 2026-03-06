export function calculateWPM(transcription, durationSeconds) {
  const wordCount = countWords(transcription);
  const durationMinutes = durationSeconds / 60;
  if (durationMinutes === 0) return 0;
  return Math.round(wordCount / durationMinutes);
}

export function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function getAudioDuration(audioFile) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { URL.revokeObjectURL(audio.src); resolve(audio.duration); };
    audio.onerror = () => { URL.revokeObjectURL(audio.src); reject(new Error('Failed to load audio metadata')); };
    audio.src = URL.createObjectURL(normalizeM4ABlob(audioFile));
  });
}

// Silence-removed speaking duration.
// Tries fast offline decoding first; if that fails (some M4A codec variants),
// falls back to silent 16× playback via the browser's media pipeline.
export async function getSpeakingDuration(audioFile) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  // ── Primary: decodeAudioData (instant, works for most files) ────────────
  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    const ctx = new AudioContextClass();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      return detectSpeakingDuration(decoded);
    } finally {
      ctx.close();
    }
  } catch {
    // Codec not supported by Web Audio — try the media element fallback
  }

  // ── Fallback: 16× silent playback via MediaElement ──────────────────────
  return getSpeakingDurationViaMediaElement(audioFile);
}

// --- helpers ---

function normalizeM4ABlob(audioFile) {
  const mimeType = audioFile.type;
  const name = (audioFile.name ?? '').toLowerCase();
  const isM4A = mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a' ||
                (name.endsWith('.m4a') && (!mimeType || mimeType === 'application/octet-stream'));
  return isM4A ? new Blob([audioFile], { type: 'audio/mp4' }) : audioFile;
}

// Offline amplitude analysis (decodeAudioData path)
function detectSpeakingDuration(audioBuffer) {
  const { sampleRate, numberOfChannels, length } = audioBuffer;

  const mono = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(ch[i]);
      if (abs > mono[i]) mono[i] = abs;
    }
  }

  const THRESHOLD = 0.01;                        // -40 dB
  const WINDOW = Math.floor(0.02 * sampleRate);  // 20 ms
  const MIN_SILENCE = Math.ceil(0.3 / 0.02);     // 15 windows = 300 ms

  const numWindows = Math.ceil(length / WINDOW);
  let speakingWindows = 0;
  let state = 'silence';
  let pauseCount = 0;

  for (let w = 0; w < numWindows; w++) {
    const start = w * WINDOW;
    const end = Math.min(start + WINDOW, length);
    let peak = 0;
    for (let i = start; i < end; i++) {
      if (mono[i] > peak) peak = mono[i];
    }

    if (peak >= THRESHOLD) {
      if (state === 'pause') speakingWindows += pauseCount;
      speakingWindows++;
      pauseCount = 0;
      state = 'speech';
    } else {
      if (state === 'speech' || state === 'pause') {
        pauseCount++;
        if (pauseCount >= MIN_SILENCE) { state = 'silence'; pauseCount = 0; }
        else state = 'pause';
      }
    }
  }

  return (speakingWindows * WINDOW) / sampleRate;
}

// Real-time analysis via MediaElement at max speed (fallback for unsupported codecs)
function getSpeakingDurationViaMediaElement(audioFile) {
  return new Promise((resolve) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return resolve(null);

    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const blobUrl = URL.createObjectURL(normalizeM4ABlob(audioFile));
    const audio = new Audio();
    audio.src = blobUrl;
    audio.playbackRate = 16; // clamped by browser if needed (Safari ≤ 2×)

    let source;
    try {
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      // intentionally NOT connected to ctx.destination → silent playback
    } catch {
      URL.revokeObjectURL(blobUrl);
      ctx.close();
      return resolve(null);
    }

    const data = new Float32Array(analyser.frequencyBinCount);
    const THRESHOLD = 0.01;
    const MIN_SILENCE_S = 0.3;

    let state = 'silence';
    let speechStart = null;
    let pauseStart = null;
    let totalSpeaking = 0;
    let intervalId;
    let cleaned = false;

    function analyze() {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
      const t = audio.currentTime;

      if (peak >= THRESHOLD) {
        if (state === 'pause') {
          const pauseLen = t - pauseStart;
          if (pauseLen < MIN_SILENCE_S) {
            totalSpeaking += pauseLen; // short pause → keep as speech
          } else {
            if (speechStart !== null) totalSpeaking += pauseStart - speechStart;
            speechStart = t;
          }
          pauseStart = null;
        } else if (state === 'silence') {
          speechStart = t;
        }
        state = 'speech';
      } else {
        if (state === 'speech') { state = 'pause'; pauseStart = t; }
        else if (state === 'pause' && (t - pauseStart) >= MIN_SILENCE_S) {
          if (speechStart !== null) { totalSpeaking += pauseStart - speechStart; speechStart = null; }
          state = 'silence'; pauseStart = null;
        }
      }
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearInterval(intervalId);
      URL.revokeObjectURL(blobUrl);
      ctx.close();
    }

    audio.onplay = () => { intervalId = setInterval(analyze, 10); };

    audio.onended = () => {
      if (speechStart !== null) totalSpeaking += (pauseStart ?? audio.duration) - speechStart;
      cleanup();
      resolve(totalSpeaking > 0 ? totalSpeaking : null);
    };

    audio.onerror = () => { cleanup(); resolve(null); };
    audio.play().catch(() => { cleanup(); resolve(null); });
  });
}
