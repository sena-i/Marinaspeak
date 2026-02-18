# Plan: Update Gemini Prompt & Admin Coach Comment Display

## Context

The user wants to:
1. Align the Gemini analysis prompt with a new structured coaching format (＜文字起こし＞ / ＜添削＞ / ＜コーチからのコメント＞)
2. On the admin student detail page, visually split the `coachComment` into three separate blocks: Good points / Content / Full Feedback (closing)

The student-facing display (`app/page.js`) stays unchanged.

---

## Change 1: Update Gemini Prompt

**File:** `lib/api/gemini.js` — `analyzeWithGemini()` function (lines 59–101)

Replace the current prompt with the new format:

### New prompt structure:

```
あなたは、ユーザーがアップロードしたMP4ファイルの動画や音声から、英語のスピーキングを添削する「実践的スピーキング・コーチ」です。
文法や表現の正確さに焦点を当て、ユーザーのモチベーションを高めるフィードバックを行います。

# 依頼
以下の＜学習者のテキスト＞を読み、提供された＜フィードバックの構成＞に従って、日本語で丁寧かつ建設的なフィードバックを作成してください。

# ＜フィードバックの構成＞

1. ＜文字起こし＞: 学習者の英文をそのまま記載（スペルミスのみ修正）。
   → corrections フィールドの各 original/corrected に反映。

2. ＜添削＞:
   - 修正が必要な箇所を「✅ 元の表現 → 修正後の表現」の形式で提示。
   - なぜその修正が必要か、ニュアンスの違いを含めて日本語で簡潔に解説。
   - 最大4つまで。優先順位: 主語動詞、時制と名詞、助動詞、語彙、文法。

3. ＜コーチからのコメント＞:
   - 良かった点（論理構成、語彙、表現など）を具体的に褒める。
   - 絵文字（👏など）を使い、親しみやすいトーンにする。
   - 締めは「引き続き頑張りましょう🌿」「次回の提出も楽しみにしております☺️」の2択からランダムに選ぶ。

# 出力ルール
- トーンは「親切な専属コーチ」として、励ましと的確な指導を両立させる。
- 文法解説は専門用語を使いすぎず直感的に理解できるようにする。
- 箇条書きにタイトル（見出し）をつけない。
- アスタリスク（*）などの記号を使った過度な装飾は避ける。
- 添削は最大4つ。

# ＜学習者のテキスト＞
{transcription}

{focusSection}
```

The JSON output schema stays the same:
```json
{
  "corrections": [
    { "original": "...", "corrected": "...", "explanation": "..." }
  ],
  "coachComment": "冒頭の褒め＋具体的フィードバック＋アドバイス＋締め（改行区切り）",
  "feedbackText": "全添削ポイントのまとめ（4つに入りきらなかった改善点も含む）"
}
```

---

## Change 2: Admin UI — Visual Split of Coach Comment

**File:** `app/admin/students/[id]/page.js`

### Parsing logic (add helper function before the component):

```js
function parseCoachComment(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const bulletLines = lines.filter(l => l.startsWith('* ') || l.startsWith('・'));
  const nonBulletLines = lines.filter(l => !l.startsWith('* ') && !l.startsWith('・'));
  const goodPoints = nonBulletLines[0] || '';
  const closing = nonBulletLines.length > 1 ? nonBulletLines[nonBulletLines.length - 1] : '';
  const advice = nonBulletLines.slice(1, nonBulletLines.length > 1 ? -1 : undefined).join('\n');
  const content = [...bulletLines, ...(advice ? [advice] : [])].join('\n');
  return { goodPoints, content, closing };
}
```

### Replace the current `session.coach_comment` block (lines 226–241) with:

```jsx
{session.coach_comment && (() => {
  let displayText = session.coach_comment;
  // Backwards compatibility: old sessions stored JSON object
  try {
    const parsed = JSON.parse(session.coach_comment);
    if (typeof parsed === 'object' && parsed.praise) {
      displayText = [parsed.praise, parsed.content, parsed.nextAction].filter(Boolean).join('\n');
    }
  } catch {}

  const { goodPoints, content, closing } = parseCoachComment(displayText);
  return (
    <>
      <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Coach Comment</h2>
      {goodPoints && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.375rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Good points</p>
          <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{goodPoints}</p>
        </div>
      )}
      {content && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.375rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Content</p>
          <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{content}</p>
        </div>
      )}
      {closing && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.375rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Closing</p>
          <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{closing}</p>
        </div>
      )}
    </>
  );
})()}
```

---

---

## Change 3: Add m4a File Support

m4a files use MIME type `audio/x-m4a` or `audio/m4a` on different OSes. Gemini accepts `audio/mp4` for m4a (m4a is MPEG-4 audio). Three files need updating:

### `lib/utils/fileValidator.js`

Add `audio/x-m4a` and `audio/m4a` to `ALLOWED_TYPES`:

```js
const ALLOWED_TYPES = ['audio/mp3', 'audio/mpeg', 'video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];
```

Update the error message: `'File must be MP3, MP4, or M4A format'`

### `app/page.js`

Update the `<input accept>` attribute:
```
accept=".mp3,.mp4,.m4a,audio/mpeg,audio/mp4,video/mp4,audio/x-m4a,audio/m4a"
```

Update the description text:
```
Upload an MP3, MP4, or M4A file (max 50MB)
```

### `app/api/transcribe/route.js`

After validation, normalize m4a MIME type before passing to Gemini (since Gemini doesn't recognize `audio/x-m4a`):

```js
// Normalize m4a MIME type for Gemini compatibility
let mimeTypeForGemini = audioFile.type;
if (mimeTypeForGemini === 'audio/x-m4a' || mimeTypeForGemini === 'audio/m4a') {
  mimeTypeForGemini = 'audio/mp4';
}
```

Then pass `mimeTypeForGemini` instead of `audioFile.type` to `transcribeWithGemini()` and `getSpeakingDuration()`.

---

## Files to Modify

1. `lib/api/gemini.js` — replace prompt + add `fullCorrections` to returned object
2. `app/admin/students/[id]/page.js` — `parseCoachComment` helper + split coach comment + full corrections section
3. `lib/utils/fileValidator.js` — add m4a MIME types to `ALLOWED_TYPES`
4. `app/page.js` — update file input `accept`, description text, pass `fullCorrections` to `saveResult()`
5. `app/api/transcribe/route.js` — normalize m4a MIME type before Gemini call
6. `app/api/save/route.js` — parse and forward `fullCorrections`
7. `lib/db/supabase.js` — add `full_corrections` to `saveSession()` insert
8. `lib/api/client.js` — include `fullCorrections` in FormData for `/api/save`
9. `supabase/schema.sql` — add migration comment for `full_corrections` column

---

## Change 4: Full Corrections List for Admin

Students see up to 4 corrections. Admin sees all corrections Gemini identifies (no cap).

### Gemini prompt / `lib/api/gemini.js`

Add a new field `fullCorrections` to the JSON output schema — all corrections with no limit:

```json
{
  "corrections": [...],           // max 4 — for students
  "fullCorrections": [...],       // all corrections — for admin
  "coachComment": "...",
  "feedbackText": "..."
}
```

In `analyzeWithGemini()`, after parsing, return `fullCorrections` alongside the existing fields (no slicing applied to `fullCorrections`).

### Supabase schema — new migration

Add `full_corrections` JSONB column to `sessions` table:

```sql
-- Migration v3: Add full corrections for admin
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS full_corrections JSONB DEFAULT '[]'::JSONB;
```

Add this to `supabase/schema.sql` as a migration comment.

### `lib/db/supabase.js` — `saveSession()`

Add `full_corrections: sessionData.fullCorrections || []` to the insert object.

### `app/api/save/route.js`

Parse and forward `fullCorrections` from formData:

```js
let fullCorrections = [];
try {
  const str = formData.get('fullCorrections');
  if (str) fullCorrections = JSON.parse(str);
} catch {}
```

Pass `fullCorrections` to `saveSession()`.

### `lib/api/client.js`

In `saveResult()`, include `fullCorrections` in the FormData sent to `/api/save`.

### `app/page.js`

Pass `fb.fullCorrections` to `saveResult()` call (alongside existing fields).

### Admin UI — `app/admin/students/[id]/page.js`

After the existing 4-item Corrections block, add a "Full Corrections" section that shows `session.full_corrections` (all items, same visual format as Corrections).

---

## Schema Changes Required

Run this in Supabase SQL Editor after deploying:

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS full_corrections JSONB DEFAULT '[]'::JSONB;
```

## Verification

1. Run `NODE_ENV=production npx next build` — confirm no build errors
2. Submit an MP3/MP4 file → confirm existing functionality still works
3. Submit an m4a file → confirm it's accepted, transcribed, and analyzed correctly
4. Open admin student detail → confirm Coach Comment shows 3 separate blocks (Good points / Content / Closing)
5. Test with an old session that has the legacy JSON format in `coach_comment` — confirm backwards-compat still works
