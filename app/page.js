'use client';

import { useState, useEffect, useRef } from 'react';
import { uploadAndTranscribe, analyzeTranscription, registerStudent, saveResult } from '@/lib/api/client';
import { countWords, getAudioDuration, calculateWPM } from '@/lib/utils/wpmCalculator';
import { formatDuration } from '@/lib/utils/formatters';
import { formatFileSize } from '@/lib/utils/fileValidator';

export default function Home() {
  const [studentId, setStudentId] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [step, setStep] = useState('id'); // 'id' | 'upload' | 'processing' | 'result'
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');

  // Audio state
  const [audioFile, setAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(null);
  const [focusPoints, setFocusPoints] = useState('');
  const fileInputRef = useRef(null);

  // Result state
  const [transcription, setTranscription] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [wpm, setWpm] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const [speakingDuration, setSpeakingDuration] = useState(null);

  useEffect(() => {
    const savedId = sessionStorage.getItem('speakalize_student_id');
    if (savedId) {
      setStudentId(savedId);
      setIsRegistered(true);
      setStep('upload');
    }
  }, []);

  async function handleRegister(e) {
    e.preventDefault();
    setError('');

    const trimmed = studentId.trim();
    if (!trimmed) {
      setError('Student ID is required');
      return;
    }
    if (trimmed.length > 20) {
      setError('Student ID must be 20 characters or less');
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
      setError('Student ID must be alphanumeric');
      return;
    }

    try {
      await registerStudent(trimmed);
      sessionStorage.setItem('speakalize_student_id', trimmed);
      setStudentId(trimmed);
      setIsRegistered(true);
      setStep('upload');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setAudioFile(file);

    try {
      const duration = await getAudioDuration(file);
      setAudioDuration(duration);
    } catch {
      setAudioDuration(null);
    }
  }

  async function handleProcess() {
    if (!audioFile) return;
    setError('');
    setStep('processing');
    setProgress(0);

    try {
      setProgressText('Transcribing audio...');
      const transcribeResult = await uploadAndTranscribe(audioFile, setProgress);
      const text = transcribeResult.transcription;
      setTranscription(text);

      // Get speaking duration from server (ffmpeg silence removal)
      const serverSpeakingDuration = transcribeResult.speakingDuration || null;
      setSpeakingDuration(serverSpeakingDuration);

      setProgressText('Analyzing speech...');
      const analyzeResult = await analyzeTranscription(text, setProgress, focusPoints);
      const fb = analyzeResult.feedback || {};
      setFeedback(fb);

      const words = countWords(text);
      setWordCount(words);

      let calculatedWpm = null;
      // Use speaking duration (silence removed) if available, otherwise fall back to total audio duration
      const durationForWpm = serverSpeakingDuration || audioDuration;
      if (durationForWpm && durationForWpm > 0) {
        calculatedWpm = calculateWPM(text, durationForWpm);
        setWpm(calculatedWpm);
      }

      setProgressText('Saving results...');
      setProgress(95);

      await saveResult({
        studentId,
        transcription: text,
        wordCount: words,
        durationSeconds: audioDuration,
        speakingDuration: serverSpeakingDuration,
        wpm: calculatedWpm,
        corrections: fb.corrections || [],
        fullCorrections: fb.fullCorrections || [],
        goodPoints: fb.goodPoints || null,
        coachComment: fb.coachComment || null,
        closing: fb.closing || null,
        repeatedMistakes: fb.repeatedMistakes || null,
        feedbackText: fb.feedbackText || null,
        focusPoints: focusPoints || null,
        audioFileName: audioFile.name,
        audioMimeType: audioFile.type,
        audioFile: audioFile
      });

      setProgress(100);
      setStep('result');
    } catch (err) {
      setError(err.message);
      setStep('upload');
    }
  }

  function handleReset() {
    setAudioFile(null);
    setAudioDuration(null);
    setSpeakingDuration(null);
    setTranscription('');
    setFeedback(null);
    setWpm(null);
    setWordCount(0);
    setProgress(0);
    setError('');
    setFocusPoints('');
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleLogout() {
    sessionStorage.removeItem('speakalize_student_id');
    setStudentId('');
    setIsRegistered(false);
    setStep('id');
    handleReset();
  }

  // Student ID entry
  if (step === 'id') {
    return (
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="text-center mb-3" style={{ marginTop: '4rem' }}>
          <h1>Speakalize</h1>
          <p className="text-secondary">Speech practice and AI analysis</p>
        </div>
        <div className="card">
          <form onSubmit={handleRegister}>
            <label className="label">Student ID</label>
            <input
              className="input mb-2"
              type="text"
              placeholder="Enter your student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              maxLength={20}
              autoFocus
            />
            {error && <p className="error-text mb-1">{error}</p>}
            <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>
              Start Practice
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Upload step
  if (step === 'upload') {
    return (
      <div className="container">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1>Speakalize</h1>
            <p className="text-secondary">Student: {studentId}</p>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout}>Change ID</button>
        </div>

        <div className="card">
          <h2 className="mb-2">Upload Audio</h2>
          <p className="text-secondary mb-2">Upload an MP3, MP4, or M4A file (max 50MB)</p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.mp4,.m4a,audio/mpeg,audio/mp4,video/mp4,audio/x-m4a,audio/m4a"
            onChange={handleFileSelect}
            className="mb-2"
          />

          {audioFile && (
            <div className="mb-2" style={{ fontSize: '0.875rem' }}>
              <p><strong>{audioFile.name}</strong> ({formatFileSize(audioFile.size)})</p>
              {audioDuration && <p>Duration: {formatDuration(audioDuration)}</p>}
            </div>
          )}

          <label className="label" style={{ marginTop: '0.5rem' }}>Focus Points (optional)</label>
          <textarea
            className="input mb-2"
            placeholder="e.g. discourse markers, tense consistency, clarity..."
            value={focusPoints}
            onChange={(e) => setFocusPoints(e.target.value)}
            rows={2}
            style={{ resize: 'vertical' }}
          />

          {error && <p className="error-text mb-1">{error}</p>}

          <button
            className="btn btn-primary"
            onClick={handleProcess}
            disabled={!audioFile}
            style={{ width: '100%' }}
          >
            Transcribe & Analyze
          </button>
        </div>
      </div>
    );
  }

  // Processing step
  if (step === 'processing') {
    return (
      <div className="container">
        <h1 className="mb-3">Speakalize</h1>
        <div className="card text-center">
          <h2 className="mb-1">{progressText}</h2>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-secondary">{progress}%</p>
        </div>
      </div>
    );
  }

  // Results step — Coaching format
  return (
    <div className="container">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1>Results</h1>
          <p className="text-secondary">Student: {studentId}</p>
        </div>
        <button className="btn btn-primary" onClick={handleReset}>New Session</button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{wordCount}</div>
          <div className="stat-label">Words</div>
        </div>
        {wpm && (
          <div className="stat-card">
            <div className="stat-value">{wpm}</div>
            <div className="stat-label">WPM</div>
          </div>
        )}
        {speakingDuration && (
          <div className="stat-card">
            <div className="stat-value">{formatDuration(speakingDuration)}</div>
            <div className="stat-label">Speaking Time</div>
          </div>
        )}
      </div>

      {/* Transcription */}
      <div className="card">
        <h2 className="mb-1">Transcription</h2>
        <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{transcription}</p>
      </div>

      {/* Corrections */}
      {feedback && feedback.corrections && feedback.corrections.length > 0 && (
        <div className="card">
          <h2 className="mb-1">Corrections</h2>
          <div style={{ fontSize: '0.875rem' }}>
            {feedback.corrections.map((c, i) => (
              <div key={i} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: i < feedback.corrections.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <p>
                  <span style={{ color: '#ef4444' }}>{c.original}</span>
                  {' → '}
                  <span style={{ color: '#22c55e' }}><strong>{c.corrected}</strong></span>
                </p>
                {c.explanation && (
                  <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#64748b' }}>{c.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coach Comment — goodPoints + coachComment + closing combined */}
      {feedback && (feedback.goodPoints || feedback.coachComment || feedback.closing) && (
        <div className="card">
          <h2 className="mb-1">Coach Comment</h2>
          <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>
            {[feedback.goodPoints, feedback.coachComment, feedback.closing].filter(Boolean).join('\n\n')}
          </p>
        </div>
      )}

      {/* Feedback not loaded or empty */}
      {feedback && !feedback.corrections?.length && !feedback.goodPoints && !feedback.coachComment && !feedback.closing && (
        <div className="card">
          <p style={{ color: '#64748b' }}>
            フィードバックを取得できませんでした。もう一度お試しください。
          </p>
        </div>
      )}
      {!feedback && (
        <div className="card">
          <p style={{ color: '#64748b' }}>No feedback available</p>
        </div>
      )}
    </div>
  );
}
