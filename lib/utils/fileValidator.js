const ALLOWED_TYPES = ['audio/mp3', 'audio/mpeg', 'video/mp4', 'audio/mp4'];
const MAX_FILE_SIZE = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '52428800'); // 50MB

export function validateAudioFile(file) {
  const errors = [];

  if (!file) {
    errors.push('No file provided');
    return { valid: false, errors };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push('File must be MP3 or MP4 format');
  }

  if (file.size > MAX_FILE_SIZE) {
    const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
    errors.push(`File size must be less than ${maxSizeMB}MB`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
