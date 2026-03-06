'use client';

import { useState, useRef } from 'react';
import { uploadAndTranscribe, analyzeTranscription, registerStudent, saveResult } from '@/lib/api/client';
import { countWords, getAudioDuration, getSpeakingDuration, calculateWPM } from '@/lib/utils/wpmCalculator';
import { formatDuration } from '@/lib/utils/formatters';
import { formatFileSize } from '@/lib/utils/fileValidator';

const CIRCLE_NUMS = ['①', '②', '③', '④'];

export default function Home() {
  // ── Form state ──────────────────────────────────────────────
  const [studentId, setStudentId] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(null);
  const [clientSpeakingDuration, setClientSpeakingDuration] = useState(null);
  const [focusPoints, setFocusPoints] = useState('');
  const fileInputRef = useRef(null);

  // ── UI state ─────────────────────────────────────────────────
  const [step, setStep] = useState('idle'); // 'idle' | 'processing' | 'result'
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // ── Result state ─────────────────────────────────────────────
  const [transcription, setTranscription] = useState('');
  const [wpm, setWpm] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const [speakingDuration, setSpeakingDuration] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [editedExplanations, setEditedExplanations] = useState([]);
  const [coachComment, setCoachComment] = useState('');
  const [fullFeedback, setFullFeedback] = useState(null);
  const [fullCorrections, setFullCorrections] = useState([]);

  // ── Handlers ─────────────────────────────────────────────────

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setAudioFile(file);
    setClientSpeakingDuration(null);
    const [total, speaking] = await Promise.allSettled([
      getAudioDuration(file),
      getSpeakingDuration(file)
    ]);
    setAudioDuration(total.status === 'fulfilled' ? total.value : null);
    setClientSpeakingDuration(speaking.status === 'fulfilled' ? speaking.value : null);
  }

  async function handleProcess() {
    const trimmedId = studentId.trim();
    if (!trimmedId) { setError('受講生IDを入力してください'); return; }
    if (!audioFile) { setError('音声ファイルを選択してください'); return; }

    setError('');
    setStep('processing');
    setProgress(0);

    try {
      await registerStudent(trimmedId);

      setProgressText('音声を文字起こし中...');
      const transcribeResult = await uploadAndTranscribe(audioFile, setProgress);
      const text = transcribeResult.transcription;
      const serverSpeakingDuration = transcribeResult.speakingDuration || null;
      const serverTotalDuration = transcribeResult.totalDuration || null;
      setTranscription(text);
      setSpeakingDuration(serverSpeakingDuration);

      setProgressText('スピーチを分析中...');
      const analyzeResult = await analyzeTranscription(text, setProgress, focusPoints);
      const fb = analyzeResult.feedback || analyzeResult;

      const structured = fb.structuredFeedback;
      const keyCorrections = structured?.student_view?.key_corrections || fb.corrections || [];
      const parsedCorrections = keyCorrections.map((c) => ({
        original: c.original || '',
        revised: c.revised || c.corrected || '',
        explanation: c.explanation || ''
      }));

      setCorrections(parsedCorrections);
      setEditedExplanations(parsedCorrections.map((c) => c.explanation));
      setCoachComment(structured?.student_view?.coach_comment || fb.coachComment || '');
      setFullFeedback(structured?.admin_view?.full_feedback || null);
      setFullCorrections(parsedCorrections);

      const words = countWords(text);
      setWordCount(words);
      const durationForWpm = clientSpeakingDuration || serverSpeakingDuration || audioDuration || serverTotalDuration;
      const calculatedWpm = durationForWpm && durationForWpm > 0
        ? calculateWPM(text, durationForWpm)
        : null;
      setWpm(calculatedWpm);

      setProgressText('結果を保存中...');
      setProgress(95);
      await saveResult({
        studentId: trimmedId,
        transcription: text,
        wordCount: words,
        durationSeconds: audioDuration || serverTotalDuration,
        speakingDuration: clientSpeakingDuration || serverSpeakingDuration,
        wpm: calculatedWpm,
        corrections: parsedCorrections,
        fullCorrections: parsedCorrections,
        goodPoints: fb.goodPoints || null,
        coachComment: structured?.student_view?.coach_comment || fb.coachComment || null,
        closing: fb.closing || null,
        repeatedMistakes: fb.repeatedMistakes || null,
        feedbackText: fb.structuredFeedback ? JSON.stringify(fb.structuredFeedback) : (fb.feedbackText || null),
        focusPoints: focusPoints || null,
        audioFileName: audioFile.name,
        audioMimeType: audioFile.type,
        audioFile: audioFile
      });

      setProgress(100);
      setStep('result');
    } catch (err) {
      setError(err.message);
      setStep('idle');
    }
  }

  function handleReset() {
    setStudentId('');
    setAudioFile(null);
    setAudioDuration(null);
    setClientSpeakingDuration(null);
    setSpeakingDuration(null);
    setFocusPoints('');
    setTranscription('');
    setCorrections([]);
    setEditedExplanations([]);
    setCoachComment('');
    setFullFeedback(null);
    setFullCorrections([]);
    setWpm(null);
    setWordCount(0);
    setProgress(0);
    setError('');
    setTranscriptionOpen(false);
    setCopySuccess(false);
    setStep('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleExplanationChange(index, value) {
    setEditedExplanations((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleCopyLine() {
    const correctionLines = corrections
      .map((c, i) => {
        const exp = editedExplanations[i] || '';
        return `${CIRCLE_NUMS[i] ?? `(${i + 1})`} ${c.original}\n  → ${c.revised}${exp ? `\n  ${exp}` : ''}`;
      })
      .join('\n\n');
    const text = `📌 修正ポイント\n${correctionLines}\n\n💬 コーチコメント\n${coachComment}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <h1 style={{ marginBottom: 0, fontSize: '1.25rem' }}>Marinaspeak</h1>
        <a href="/admin" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>管理者</a>
      </div>

      <div className="split-layout">
        {/* ── LEFT PANEL ── */}
        <div className="panel-left">
          <div className="card">
            <h2 className="mb-2">コーチ入力</h2>

            <label className="label">受講生ID</label>
            <input
              className="input mb-2"
              type="text"
              placeholder="受講生IDを入力"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              maxLength={20}
              disabled={step === 'processing' || step === 'result'}
            />

            <label className="label">音声ファイル（MP3 / MP4 / M4A、最大50MB）</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.mp4,.m4a,audio/mpeg,audio/mp4,video/mp4,audio/x-m4a,audio/m4a"
              onChange={handleFileSelect}
              className="mb-1"
              disabled={step === 'processing' || step === 'result'}
            />
            {audioFile && (
              <p className="text-secondary mb-2" style={{ fontSize: '0.8125rem' }}>
                {audioFile.name} ({formatFileSize(audioFile.size)})
                {audioDuration ? ` · ${formatDuration(audioDuration)}` : ''}
              </p>
            )}

            <label className="label" style={{ marginTop: '0.5rem' }}>重点ポイント（任意）</label>
            <textarea
              className="input mb-2"
              placeholder="例: 接続表現、時制の一貫性"
              value={focusPoints}
              onChange={(e) => setFocusPoints(e.target.value)}
              rows={2}
              style={{ resize: 'vertical' }}
              disabled={step === 'processing' || step === 'result'}
            />

            {error && <p className="error-text mb-1">{error}</p>}

            <button
              className="btn btn-primary"
              onClick={handleProcess}
              disabled={step === 'processing' || step === 'result' || !audioFile || !studentId.trim()}
              style={{ width: '100%' }}
            >
              分析する
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="panel-right">
          {/* Idle: empty state */}
          {step === 'idle' && (
            <div className="empty-state">
              <p>受講生IDと音声ファイルを入力して<br />「分析する」を押してください</p>
            </div>
          )}

          {/* Processing */}
          {step === 'processing' && (
            <div className="card text-center">
              <h2 className="mb-1">{progressText}</h2>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-secondary">{progress}%</p>
            </div>
          )}

          {/* Result */}
          {step === 'result' && (
            <>
              {/* Stats */}
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-value">{wordCount}</div>
                  <div className="stat-label">語数</div>
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
                    <div className="stat-label">発話時間</div>
                  </div>
                )}
              </div>

              {/* Transcription (collapsible) */}
              <div className="card">
                <div className="collapsible-header" onClick={() => setTranscriptionOpen((o) => !o)}>
                  <h2 style={{ marginBottom: 0 }}>文字起こし</h2>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {transcriptionOpen ? '▲ 閉じる' : '▼ 開く'}
                  </span>
                </div>
                {transcriptionOpen && (
                  <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
                    {transcription}
                  </p>
                )}
              </div>

              {/* Corrections (editable explanations) */}
              {corrections.length > 0 && (
                <div className="card">
                  <h2 className="mb-2">修正ポイント</h2>
                  {corrections.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: i < corrections.length - 1 ? '1rem' : 0,
                        paddingBottom: i < corrections.length - 1 ? '1rem' : 0,
                        borderBottom: i < corrections.length - 1 ? '1px solid var(--border)' : 'none'
                      }}
                    >
                      <p style={{ fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--error)' }}>{c.original}</span>
                        {' → '}
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{c.revised}</span>
                      </p>
                      <input
                        className="inline-input"
                        style={{ marginTop: '0.375rem' }}
                        value={editedExplanations[i] || ''}
                        onChange={(e) => handleExplanationChange(i, e.target.value)}
                        placeholder="説明（編集可）"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Coach comment (editable) */}
              <div className="card">
                <h2 className="mb-1">コーチコメント</h2>
                <textarea
                  className="input"
                  value={coachComment}
                  onChange={(e) => setCoachComment(e.target.value)}
                  rows={5}
                  style={{ resize: 'vertical', lineHeight: '1.7' }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
                <button
                  className={`btn ${copySuccess ? 'btn-success' : 'btn-primary'}`}
                  onClick={handleCopyLine}
                >
                  {copySuccess ? 'コピーしました！' : '📋 LINEにコピー'}
                </button>
                <button className="btn btn-secondary" onClick={handleReset}>
                  リセット
                </button>
              </div>

              {/* Full corrections (read-only) */}
              {fullCorrections.length > 0 && (
                <div className="card">
                  <h2 className="mb-2">全修正リスト</h2>
                  {fullCorrections.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: i < fullCorrections.length - 1 ? '0.75rem' : 0,
                        paddingBottom: i < fullCorrections.length - 1 ? '0.75rem' : 0,
                        borderBottom: i < fullCorrections.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: '0.875rem'
                      }}
                    >
                      <p>
                        <span style={{ color: 'var(--error)' }}>{c.original}</span>
                        {' → '}
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{c.revised}</span>
                      </p>
                      {c.explanation && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {c.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Full feedback (read-only) */}
              {fullFeedback && (
                <div className="card">
                  <h2 className="mb-2">詳細フィードバック</h2>
                  {[
                    { label: '構成', key: 'structure' },
                    { label: '内容', key: 'content' },
                    { label: '改善ポイント', key: 'improvement_points' },
                    { label: '繰り返しミス', key: 'recurring_mistakes' }
                  ].map(({ label, key }) =>
                    fullFeedback[key] ? (
                      <div key={key} style={{ marginBottom: '1rem' }}>
                        <p style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          {label}
                        </p>
                        <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>
                          {fullFeedback[key]}
                        </p>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
