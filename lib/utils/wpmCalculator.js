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

    audio.src = URL.createObjectURL(audioFile);
  });
}
