# Coach Tool Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `app/page.js` student-facing screen with a split-panel coach tool supporting audio upload, AI transcription/analysis, editable corrections/comment, and LINE-formatted copy.

**Architecture:** Single file rewrite of `app/page.js` into a two-column layout (left: input form, right: results). State machine: `idle → processing → result`. No new API routes — all existing routes (`/api/transcribe`, `/api/analyze`, `/api/students/register`, `/api/save`) are reused unchanged. Admin pages under `/admin` are untouched.

**Tech Stack:** Next.js 16, React 19, existing CSS utility classes + new split-panel CSS, existing `lib/api/client.js` functions.

---

### Task 1: Add split-panel CSS utilities to globals.css

**Files:**
- Modify: `app/globals.css` (append at end of file)

**Step 1: Append the following CSS to the end of `app/globals.css`**

```css
/* ── Split-panel layout ───────────────────────────────── */
.split-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.panel-left {
  position: sticky;
  top: 2rem;
  align-self: start;
}

.panel-right {
  min-height: 300px;
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }
  .panel-left {
    position: static;
  }
}

/* Page header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1rem 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0;
}

/* Collapsible section */
.collapsible-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}
.collapsible-header:hover {
  opacity: 0.8;
}

/* Inline editable explanation input */
.inline-input {
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  background: transparent;
  font-family: inherit;
  transition: border-color 0.15s;
}
.inline-input:hover,
.inline-input:focus {
  border-color: var(--border);
  background: white;
  outline: none;
}

/* Empty state */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-align: center;
}

/* Copy success flash */
.btn-success {
  background: var(--success);
  color: white;
}
```

**Step 2: Commit**

```bash
cd /Users/sena/Desktop/Marinaspeak
git add app/globals.css
git commit -m "style: add split-panel and coach tool CSS utilities"
```

---

### Task 2: Rewrite app/page.js as coach split-panel tool

**Files:**
- Modify: `app/page.js` (full replacement)

**Key data flow to understand:**
- `analyzeTranscription()` returns `{ success, feedback }` where `feedback` is from `analyzeWithGemini()`
- `feedback.structuredFeedback` = the raw Gemini JSON (`{ meta, student_view, admin_view }`)
- `feedback.structuredFeedback.student_view.key_corrections` = array of `{ original, revised, explanation }`
- `feedback.structuredFeedback.student_view.coach_comment` = string
- `feedback.structuredFeedback.admin_view.full_feedback` = `{ structure, content, improvement_points, recurring_mistakes }`
- Fallback: `feedback.corrections` (legacy format with `corrected` instead of `revised`)

**Step 1: Replace entire content of `app/page.js` with:**

```jsx
'use client';

import { useState, useRef } from 'react';
import { uploadAndTranscribe, analyzeTranscription, registerStudent, saveResult } from '@/lib/api/client';
import { countWords, getAudioDuration, calculateWPM } from '@/lib/utils/wpmCalculator';
import { formatDuration } from '@/lib/utils/formatters';
import { formatFileSize } from '@/lib/utils/fileValidator';

const CIRCLE_NUMS = ['①', '②', '③', '④'];

export default function Home() {
  // ── Form state ──────────────────────────────────────────────
  const [studentId, setStudentId] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(null);
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
    try {
      const duration = await getAudioDuration(file);
      setAudioDuration(duration);
    } catch {
      setAudioDuration(null);
    }
  }

  async function handleProcess() {
    const trimmedId = studentId.trim();
    if (!trimmedId) { setError('学籍ID / Student ID を入力してください'); return; }
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
      const durationForWpm = serverSpeakingDuration || audioDuration;
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
        durationSeconds: audioDuration,
        speakingDuration: serverSpeakingDuration,
        wpm: calculatedWpm,
        corrections: parsedCorrections,
        fullCorrections: parsedCorrections,
        goodPoints: fb.goodPoints || null,
        coachComment: structured?.student_view?.coach_comment || fb.coachComment || null,
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
      setStep('idle');
    }
  }

  function handleReset() {
    setStudentId('');
    setAudioFile(null);
    setAudioDuration(null);
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
        return `${CIRCLE_NUMS[i]} ${c.original}\n  → ${c.revised}${exp ? `\n  ${exp}` : ''}`;
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
        <h1 style={{ marginBottom: 0, fontSize: '1.25rem' }}>Speakalize</h1>
        <a href="/admin" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>管理者</a>
      </div>

      <div className="split-layout">
        {/* ── LEFT PANEL ── */}
        <div className="panel-left">
          <div className="card">
            <h2 className="mb-2">コーチ入力</h2>

            <label className="label">学籍ID / Student ID</label>
            <input
              className="input mb-2"
              type="text"
              placeholder="学籍IDを入力"
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
              <p>学籍IDと音声ファイルを入力して<br />「分析する」を押してください</p>
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
```

**Step 2: Start dev server and verify**

```bash
cd /Users/sena/Desktop/Marinaspeak
npm run dev
```

Open http://localhost:3000 and check:
- Split panel renders (left form, right empty state message)
- No console errors
- Form inputs work (student ID, file picker, focus points)
- Button is disabled when student ID or file is missing

**Step 3: Test the full flow end-to-end**

1. Enter a student ID (e.g. `test01`)
2. Select an MP3/MP4 file
3. Click 分析する — verify progress bar appears in right panel
4. After completion, verify:
   - Stats row shows 語数, WPM, 発話時間
   - 文字起こし card is collapsed by default; click ▼ 開く to expand
   - 修正ポイント shows `original → revised` with editable explanation inputs
   - コーチコメント textarea is pre-filled and editable
5. Edit an explanation and the coach comment
6. Click 📋 LINEにコピー — button briefly shows コピーしました！
7. Paste into a text editor and verify format:
   ```
   📌 修正ポイント
   ① original
     → revised
     edited explanation

   💬 コーチコメント
   edited coach comment text
   ```
8. Click リセット — form clears, right panel returns to empty state
9. Open http://localhost:3000/admin — confirm admin login is unchanged

**Step 4: Commit**

```bash
git add app/page.js
git commit -m "feat: rewrite home page as coach split-panel tool"
```

---

### Task 3: Smoke-test admin pages

**Step 1: Verify admin login page**

Open http://localhost:3000/admin. Enter a valid token. Confirm the students list page loads.

**Step 2: Verify student detail page**

Click a student. Confirm session history and feedback detail display correctly.

**Step 3: No commit needed** — nothing changed in admin.
