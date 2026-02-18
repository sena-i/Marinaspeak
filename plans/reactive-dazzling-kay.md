# Speakalize: 統括実装プラン

## 概要

このプランは以下の全変更を統括したものです。Change 1〜4はすでに実装・コミット済み。Change 5（バグ修正）とChange 6（Good pointsフィールド追加）のみ未実装。

---

## ✅ Change 1: Gemini プロンプト更新（実装済み）

**ファイル:** `lib/api/gemini.js`

- 新しい構造化フィードバック形式（＜添削＞/＜コーチからのコメント＞）に対応
- 締めの言葉を2択に限定（「引き続き頑張りましょう🌿」「次回の提出も楽しみにしております☺️」）
- アスタリスク装飾なし、箇条書きに見出しなし
- `fullCorrections`フィールドを追加（上限なし、管理者用）

---

## ✅ Change 2: 管理者UIのコーチコメント分割（実装済み・要更新）

**ファイル:** `app/admin/students/[id]/page.js`

現在: `parseCoachComment()` でテキストをパースして分割
→ Change 6で `goodPoints` が専用フィールドになるため、UIを更新する

---

## ✅ Change 3: M4A ファイルサポート（実装済み）

**ファイル:**
- `lib/utils/fileValidator.js` — `audio/x-m4a`、`audio/m4a` を許可タイプに追加
- `app/page.js` — ファイル入力の `accept` に `.m4a` を追加、説明文を更新
- `app/api/transcribe/route.js` — m4a の MIMEタイプを `audio/mp4` に正規化してGeminiに渡す

---

## ✅ Change 4: 全添削リスト（管理者用）（実装済み）

**ファイル:**
- `lib/api/gemini.js` — `fullCorrections` フィールド（上限なし）を返す
- `lib/api/client.js` — `fullCorrections` を FormData に含める
- `app/page.js` — `fb.fullCorrections` を `saveResult()` に渡す
- `app/api/save/route.js` — `fullCorrections` を受け取り転送
- `lib/db/supabase.js` — `full_corrections` を DB に保存
- `supabase/schema.sql` — マイグレーション v3 コメントを追加

**⚠️ Supabase で要実行（Change 4用）:**
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS full_corrections JSONB DEFAULT '[]'::JSONB;
```

---

## 🔧 Change 5: JSON パースエラーのバグ修正（未実装）

### 問題

エラー: `Unexpected token 'R', "Request En"... is not valid JSON`

MP4/MP3/M4A ファイルをアップロードした際に発生。`lib/api/client.js` が API エラー時に `response.json()` を無条件に呼び出すが、Vercel CDN やサーバーがプレーンテキスト（例: `"Request Entity Too Large"` = 413）を返した場合にクラッシュする。

### 修正: `lib/api/client.js`

ファイル先頭にヘルパー関数を追加し、3箇所のエラー処理を置き換え:

```js
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
```

`uploadAndTranscribe`（12〜14行目）、`analyzeTranscription`（31〜33行目）、`saveResult`（76〜78行目）の各エラーブロックを:
```js
if (!response.ok) {
  const msg = await safeJsonError(response);
  throw new Error(msg);
}
```
に置き換える。

---

## 🔧 Change 6: Good Points フィールドの追加（未実装）

### 目的

管理者UIのコーチコメントを以下の3ブロックに分割表示する:
- **Good points** — 文章の中での良いポイント（内容・構成・表現などの具体的な良かった点）
- **Content** — 箇条書きフィードバック＋アドバイス（改善点・励まし）
- **Closing** — 締めの言葉

現在の `parseCoachComment()` によるテキストパースでは「Good points」を正確に抽出できないため、Gemini に専用フィールド `goodPoints` を返させる。

### 変更内容

#### 1. `lib/api/gemini.js` — プロンプト＆JSON出力スキーマ更新

プロンプトの＜コーチからのコメント＞セクションを更新:
```
3. ＜コーチからのコメント＞:
   - goodPointsフィールド: 文章の中での良いポイントを具体的に褒める（内容・構成・語彙・表現など）。絵文字（👏など）を使い、親しみやすいトーンにする。
   - coachCommentフィールド: 改善点や具体的フィードバックを150〜200字で記載。1文のアドバイスも含める。
   - closingフィールド: 「引き続き頑張りましょう🌿」「次回の提出も楽しみにしております☺️」の2択からランダムに選ぶ。
```

JSON出力スキーマに `goodPoints` と `closing` を追加:
```json
{
  "corrections": [...],
  "fullCorrections": [...],
  "goodPoints": "文章の中での良いポイントを具体的に褒めるテキスト（日本語、絵文字あり）",
  "coachComment": "改善点・フィードバックの箇条書き＋1文のアドバイス（日本語）",
  "closing": "引き続き頑張りましょう🌿 または 次回の提出も楽しみにしております☺️",
  "feedbackText": "全添削ポイントのまとめ（日本語）"
}
```

`analyzeWithGemini()` の返り値に `goodPoints` と `closing` を含める（フォールバック: `goodPoints` がなければ空文字、`closing` がなければ空文字）。

#### 2. Supabase スキーマ — マイグレーション v4

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS good_points TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing TEXT;
```

`supabase/schema.sql` にマイグレーション v4 コメントを追加。

#### 3. `lib/db/supabase.js` — `saveSession()` 更新

```js
good_points: sessionData.goodPoints || null,
closing: sessionData.closing || null,
```
を insert オブジェクトに追加。

#### 4. `app/api/save/route.js` — 新フィールドの受け取り

```js
goodPoints: formData.get('goodPoints') || null,
closing: formData.get('closing') || null,
```
を `saveSession()` 呼び出しに追加。フォームからは文字列として送受信する（JSON.stringify不要）。

#### 5. `lib/api/client.js` — FormData に追加

```js
if (resultData.goodPoints) formData.append('goodPoints', resultData.goodPoints);
if (resultData.closing) formData.append('closing', resultData.closing);
```

#### 6. `app/page.js` — `saveResult()` 呼び出しに追加

```js
goodPoints: fb.goodPoints || null,
closing: fb.closing || null,
```

#### 7. `app/admin/students/[id]/page.js` — UIを3ブロック表示に更新

`parseCoachComment()` ヘルパーを削除（不要になる）。

コーチコメントセクションを以下のように3ブロックで表示:

```jsx
<h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Coach Comment</h2>

{/* Good points */}
{session.good_points && (
  <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.375rem' }}>
    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Good points</p>
    <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{session.good_points}</p>
  </div>
)}

{/* Content (coachComment) */}
{session.coach_comment && (
  <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.375rem' }}>
    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Content</p>
    <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{session.coach_comment}</p>
  </div>
)}

{/* Closing */}
{session.closing && (
  <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.375rem' }}>
    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Closing</p>
    <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{session.closing}</p>
  </div>
)}
```

旧セッション（`good_points`/`closing` が null）でも `coach_comment` ブロックは表示されるため、後方互換性あり。

---

## 変更ファイル一覧（未実装分）

**Change 5:**
- `lib/api/client.js`

**Change 6:**
- `lib/api/gemini.js`
- `lib/db/supabase.js`
- `app/api/save/route.js`
- `lib/api/client.js`
- `app/page.js`
- `app/admin/students/[id]/page.js`
- `supabase/schema.sql`

---

## ⚠️ Supabase 要実行（Change 6用）

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS good_points TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closing TEXT;
```

---

## 検証手順

1. `NODE_ENV=production npx next build` — ビルドエラーなしを確認
2. MP3/MP4/M4A ファイルをアップロード → 正常に文字起こし・分析が動作することを確認
3. エラーケース → JSON パースクラッシュではなく読みやすいエラーメッセージが表示されることを確認
4. 管理者画面でセッション詳細を開く → コーチコメントが3ブロック（Good points / Content / Closing）で表示されることを確認
5. 旧セッション（`good_points` が null）でも管理者画面が壊れないことを確認

---

## 🔧 Change 7: Gemini 字数調整 + repeatedMistakes フィールド追加（未実装）

### 問題

現在 `goodPoints`（良いポイント）と `coachComment`（改善フィードバック）の字数が適切でない。
また Session History テーブルの Focus Points 列が繰り返しミス情報に置き換わる。

### A. Gemini プロンプト更新 — `lib/api/gemini.js`

プロンプトの＜コーチからのコメント＞セクションを変更:

```
3. ＜コーチからのコメント＞:
   - goodPointsフィールド: 文章の中での良いポイントを具体的に褒める（内容・構成・語彙・表現など）。
     絵文字（👏など）を使い、親しみやすいトーンにする。約100字。
   - coachCommentフィールド: 次のスピーチで何を意識すべきか、要約を50字程度で記載。1〜2文。
   - closingフィールド: 「引き続き頑張りましょう🌿」「次回の提出も楽しみにしております☺️」の2択からランダムに選ぶ。
   - repeatedMistakesフィールド: 今回のスピーチで繰り返し見られたミス・課題を短く列挙（日本語）。
     なければ null を返す。
```

JSON出力スキーマに `repeatedMistakes` を追加:

```json
{
  "corrections": [...],
  "fullCorrections": [...],
  "goodPoints": "約100字で良いポイントを褒める（絵文字あり）",
  "coachComment": "次に意識すべきことの要約50字程度",
  "closing": "引き続き頑張りましょう🌿 または 次回の提出も楽しみにしております☺️",
  "repeatedMistakes": "繰り返されているミスを短く列挙（なければ null）",
  "feedbackText": "全添削ポイントのまとめ（日本語）"
}
```

`analyzeWithGemini()` の return 時に `repeatedMistakes: feedback.repeatedMistakes || null` を追加。
フォールバック（空レスポンス・パース失敗）にも `repeatedMistakes: null` を追加。

### B. 保存パイプライン — `repeatedMistakes` フィールド追加

- **`lib/db/supabase.js`** — `saveSession()` の insert に `repeated_mistakes: sessionData.repeatedMistakes || null` を追加
- **`app/api/save/route.js`** — `repeatedMistakes: formData.get('repeatedMistakes') || null` を `saveSession()` 呼び出しに追加
- **`lib/api/client.js`** — `saveResult()` の FormData に `if (resultData.repeatedMistakes) formData.append('repeatedMistakes', resultData.repeatedMistakes)` を追加
- **`app/page.js`** — `saveResult()` 呼び出しに `repeatedMistakes: fb.repeatedMistakes || null` を追加

### C. Session History テーブル列変更 — `app/admin/students/[id]/page.js`

テーブルの列変更:
- ヘッダー: `Focus Points` → `Repeated Mistakes`
- 表示値: `session.repeated_mistakes ? truncate(session.repeated_mistakes, 30) : '-'`

（Focus Points は引き続き展開パネル内で表示する）

### D. Session History 各行に再生ボタン — `app/admin/students/[id]/page.js`

各 `<tr>` 行に再生列を追加:
- テーブルに新しい列 `Audio` を追加（ヘッダー）
- `audio_file_path` がある行のみ `▶` ボタンを表示、なければ空セル
- ボタンクリック時: `e.stopPropagation()` で行展開を防止 → `loadAudioUrl()` を呼び出し
- URL 取得後は行内に `<audio controls>` プレーヤーを表示（行の下に inline で展開）
- 状態管理: `audioUrls` は既存の state を流用、行内プレーヤー表示用に `inlineAudio` state（`{ [sessionId]: boolean }`）を追加

実装パターン（各行の最後のセルとして）:
```jsx
<td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
  {session.audio_file_path && (
    audioUrls[session.id]
      ? <audio controls src={audioUrls[session.id]} style={{ height: 32, width: 180 }} />
      : <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
          onClick={() => loadAudioUrl(session.id, session.audio_file_path)}>
          ▶ Load
        </button>
  )}
</td>
```

### ⚠️ Supabase 要実行（Change 7用）

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS repeated_mistakes TEXT;
```

`supabase/schema.sql` にマイグレーション v5 コメントを追加。

---

## 変更ファイル一覧（Change 7 未実装分）

- `lib/api/gemini.js` — プロンプト字数変更 + repeatedMistakes フィールド追加
- `lib/db/supabase.js` — repeated_mistakes を saveSession() に追加
- `app/api/save/route.js` — repeatedMistakes を転送
- `lib/api/client.js` — FormData に repeatedMistakes を追加
- `app/page.js` — saveResult() に repeatedMistakes を渡す
- `app/admin/students/[id]/page.js` — テーブル列変更 + 行内再生ボタン
- `supabase/schema.sql` — migration v5 コメント追加

## 検証手順（Change 7）

1. `NODE_ENV=production npx next build` — ビルドエラーなしを確認
2. 新規セッション送信 → 管理者テーブルで Repeated Mistakes 列に値が表示されることを確認
3. ミスがないスピーチ → Repeated Mistakes 列が `-` になることを確認
4. 各行の ▶ Load ボタンをクリック → audio プレーヤーが行内に表示されることを確認
5. 行クリックで詳細展開が引き続き動作することを確認（ボタン部分では展開されないこと）
6. 旧セッション（`repeated_mistakes` が null）で列が `-` 表示になることを確認
