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

    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src);
      resolve(audio.duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      reject(new Error('Failed to load audio metadata'));
    };

    audio.src = URL.createObjectURL(normalizeM4ABlob(audioFile));
  });
}

// Silence-removed speaking duration using the Web Audio API (runs in browser, no server needed)
export async function getSpeakingDuration(audioFile) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  let arrayBuffer;
  try {
    arrayBuffer = await audioFile.arrayBuffer();
  } catch {
    return null;
  }

  const ctx = new AudioContextClass();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  } finally {
    ctx.close();
  }

  return detectSpeakingDuration(decoded);
}

// --- helpers ---

function normalizeM4ABlob(audioFile) {
  const mimeType = audioFile.type;
  const name = (audioFile.name ?? '').toLowerCase();
  const isM4A = mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a' ||
                (name.endsWith('.m4a') && (!mimeType || mimeType === 'application/octet-stream'));
  return isM4A ? new Blob([audioFile], { type: 'audio/mp4' }) : audioFile;
}

function detectSpeakingDuration(audioBuffer) {
  const { sampleRate, numberOfChannels, length } = audioBuffer;

  // Mix channels down to mono (peak across channels)
  const mono = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(ch[i]);
      if (abs > mono[i]) mono[i] = abs;
    }
  }

  // Parameters matching ffmpeg silenceremove -40dB / 300ms
  const THRESHOLD = 0.01;                              // -40 dB (peak)
  const WINDOW = Math.floor(0.02 * sampleRate);        // 20 ms analysis windows
  const MIN_SILENCE = Math.ceil(0.3 / 0.02);           // 15 windows = 300 ms

  const numWindows = Math.ceil(length / WINDOW);
  let speakingWindows = 0;
  let pendingSilence = 0;  // silence windows not yet long enough to discard

  for (let w = 0; w < numWindows; w++) {
    const start = w * WINDOW;
    const end = Math.min(start + WINDOW, length);
    let peak = 0;
    for (let i = start; i < end; i++) {
      if (mono[i] > peak) peak = mono[i];
    }

    if (peak >= THRESHOLD) {
      // Speech window: flush any buffered short silence as speech
      speakingWindows += pendingSilence + 1;
      pendingSilence = 0;
    } else {
      pendingSilence++;
      if (pendingSilence >= MIN_SILENCE) {
        // Long silence confirmed — discard the buffered windows
        pendingSilence = 0;
      }
    }
  }

  return (speakingWindows * WINDOW) / sampleRate;
}
