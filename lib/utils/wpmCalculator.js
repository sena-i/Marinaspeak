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
// Primary: offline Web Audio (instant). Fallback: ffmpeg WASM in browser (handles all codecs).
export async function getSpeakingDuration(audioFile) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
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
      // Codec not supported — fall through to ffmpeg WASM
    }
  }
  return getSpeakingDurationViaFFmpeg(audioFile);
}

// ── ffmpeg WASM fallback ─────────────────────────────────────────────────────
// All loaded from CDN at runtime. webpackIgnore prevents webpack from trying
// to bundle CDN URLs — the browser's native ESM loader handles them instead.
// ~31 MB WASM downloads once and is cached by the browser.

const CDN = 'https://cdn.jsdelivr.net/npm';
const FFMPEG_VER = '0.12.15';
const UTIL_VER   = '0.12.2';
const CORE_VER   = '0.12.6';

let _ffmpegPromise = null;

async function loadFFmpeg() {
  if (_ffmpegPromise) return _ffmpegPromise;
  _ffmpegPromise = (async () => {
    /* eslint-disable */
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import(/* webpackIgnore: true */ `${CDN}/@ffmpeg/ffmpeg@${FFMPEG_VER}/dist/esm/index.js`),
      import(/* webpackIgnore: true */ `${CDN}/@ffmpeg/util@${UTIL_VER}/dist/esm/index.js`),
    ]);
    /* eslint-enable */
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CDN}/@ffmpeg/core@${CORE_VER}/dist/esm/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CDN}/@ffmpeg/core@${CORE_VER}/dist/esm/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ff;
  })();
  return _ffmpegPromise;
}

async function getSpeakingDurationViaFFmpeg(audioFile) {
  try {
    const [ff, { fetchFile }] = await Promise.all([
      loadFFmpeg(),
      import(/* webpackIgnore: true */ `${CDN}/@ffmpeg/util@${UTIL_VER}/dist/esm/index.js`),
    ]);

    const name = `input_${Date.now()}.${audioFile.name?.endsWith('.mp3') ? 'mp3' : 'm4a'}`;
    await ff.writeFile(name, await fetchFile(audioFile));

    const logs = [];
    const logHandler = ({ message }) => logs.push(message);
    ff.on('log', logHandler);
    try {
      await ff.exec(['-i', name, '-af', 'silencedetect=noise=-40dB:d=0.3', '-f', 'null', '-']);
    } finally {
      ff.off('log', logHandler);
      await ff.deleteFile(name).catch(() => {});
    }

    const output = logs.join('\n');
    const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (!durMatch) return null;
    const total = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);

    let silenceTotal = 0;
    for (const m of output.matchAll(/silence_duration:\s*([\d.]+)/g)) {
      silenceTotal += parseFloat(m[1]);
    }

    return Math.max(0, total - silenceTotal);
  } catch {
    return null;
  }
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

