export async function uploadAndTranscribe(audioFile, onProgress) {
  const formData = new FormData();
  formData.append('audio', audioFile);

  onProgress?.(10);

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Transcription failed');
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
    throw new Error('Analysis failed');
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
  const response = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resultData)
  });

  if (!response.ok) {
    throw new Error('Failed to save result');
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
