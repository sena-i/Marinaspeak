async function safeJsonError(response) {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      const data = await response.json();
      return data.error || data.details || `HTTP ${response.status}`;
    } catch {}
  }
  const text = await response.text().catch(() => '');
  return text.trim() || `HTTP ${response.status}`;
}

export async function uploadAndTranscribe(audioFile, onProgress) {
  const formData = new FormData();
  formData.append('audio', audioFile);

  onProgress?.(10);

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const msg = await safeJsonError(response);
    throw new Error(msg);
  }

  onProgress?.(50);
  const data = await response.json();
  return data;
}

export async function analyzeTranscription(transcription, onProgress, focusPoints) {
  onProgress?.(60);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcription, focusPoints })
  });

  if (!response.ok) {
    const msg = await safeJsonError(response);
    throw new Error(msg);
  }

  onProgress?.(90);
  const data = await response.json();
  return data;
}

export async function registerStudent(studentId) {
  const response = await fetch('/api/students/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId })
  });

  if (!response.ok) {
    throw new Error('Student registration failed');
  }

  return await response.json();
}

export async function saveResult(resultData) {
  const formData = new FormData();
  formData.append('studentId', resultData.studentId);
  formData.append('transcription', resultData.transcription);
  if (resultData.wordCount != null) formData.append('wordCount', String(resultData.wordCount));
  if (resultData.durationSeconds != null) formData.append('durationSeconds', String(resultData.durationSeconds));
  if (resultData.speakingDuration != null) formData.append('speakingDuration', String(resultData.speakingDuration));
  if (resultData.wpm != null) formData.append('wpm', String(resultData.wpm));
  if (resultData.corrections) formData.append('corrections', JSON.stringify(resultData.corrections));
  if (resultData.fullCorrections) formData.append('fullCorrections', JSON.stringify(resultData.fullCorrections));
  if (resultData.coachComment) formData.append('coachComment', JSON.stringify(resultData.coachComment));
  if (resultData.goodPoints) formData.append('goodPoints', resultData.goodPoints);
  if (resultData.closing) formData.append('closing', resultData.closing);
  if (resultData.feedbackText) formData.append('feedbackText', resultData.feedbackText);
  if (resultData.focusPoints) formData.append('focusPoints', resultData.focusPoints);
  if (resultData.audioFileName) formData.append('audioFileName', resultData.audioFileName);
  if (resultData.audioMimeType) formData.append('audioMimeType', resultData.audioMimeType);
  if (resultData.audioFile) formData.append('audioFile', resultData.audioFile);

  const response = await fetch('/api/save', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const msg = await safeJsonError(response);
    throw new Error(msg);
  }

  return await response.json();
}

export async function getSessions(studentId, date) {
  const params = new URLSearchParams({ studentId });
  if (date) params.append('date', date);

  const response = await fetch(`/api/sessions?${params}`);

  if (!response.ok) {
    throw new Error('Failed to get sessions');
  }

  return await response.json();
}
