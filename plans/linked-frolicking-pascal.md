# Plan: コーチコメント構造化 + 管理画面改善 + 音声保存

## Context
3つの改善:
1. **coachComment を3構成に構造化** — 良かったポイント / 内容 / Next Action
2. **管理画面の表示改善** — コーチコメントをカード分割表示 + feedbackText に全添削を含める
3. **音声ファイルをSupabase Storageに保存** — 管理画面で再生可能に

---

## Task 1: Gemini プロンプト変更

### `lib/api/gemini.js`

**プロンプトのセクション2を変更:**
```
### 2. コーチからのコメント
以下の3つの構成で、それぞれ1〜2文で簡潔に書いてください：

#### 👏 良かったポイント
- 学生のスピーチで特に良かった点を1つ具体的に褒めてください
- 絵文字を適度に使ってください（👏🌟✅💪等）

#### 📝 内容フィードバック
- スピーチの内容面（構成、伝わりやすさ、語彙の使い方など）について1つフィードバックしてください

#### 🎯 Next Action
- 次回のスピーチで意識すべきポイントを1つ具体的に提案してください
- 締めの言葉は以下からランダムに選んでください：
  - 「引き続き頑張りましょう🌿」
  - 「次回の提出も楽しみにしております☺️」
```

**JSON出力形式を変更 — coachComment をオブジェクトに:**
```json
{
  "corrections": [...],
  "coachComment": {
    "praise": "良かったポイントの文（絵文字含む）",
    "content": "内容フィードバックの文",
    "nextAction": "次回意識するポイントの文。締めの言葉。"
  },
  "feedbackText": "全ての添削ポイントを含むフィードバック全文（corrections に入りきらなかったものも含む）"
}
```

**feedbackText の指示を変更:**
- 現在: 「添削ポイント+コメントを統合したプレーンテキスト」
- 変更後: 「文字起こし全体を通した全ての添削ポイントのまとめ（corrections の4つに入りきらなかったものも含む）」

**保存時の処理変更** — `coachComment` はオブジェクトのまま JSONB として保存する → DB列を `TEXT` → `JSONB` に変更必要

→ **代替案（DB変更不要）**: `coachComment` を保存時に `JSON.stringify()` して TEXT 保存 → 表示時に `JSON.parse()` する。ただし過去データとの互換性が必要。

→ **採用案**: `coach_comment` 列はそのまま TEXT。保存時にオブジェクトを `JSON.stringify()` する。フロントエンドで `JSON.parse()` を試み、失敗すれば旧形式のプレーンテキストとしてフォールバック表示。

---

## Task 2: 管理画面の表示改善

### `app/admin/students/[id]/page.js`

**コーチコメント表示（展開セッション内）をカード分割に:**
- `session.coach_comment` を `JSON.parse()` してオブジェクトとして処理
- 3つのセクションをそれぞれカード/見出し付きで表示:
  - 👏 良かったポイント (`praise`)
  - 📝 内容 (`content`)
  - 🎯 Next Action (`nextAction`)
- `JSON.parse()` 失敗時は旧形式として `<p>` でそのまま表示（後方互換）

**feedbackText 表示を追加:**
- 展開セッション内に「全文フィードバック」セクションを追加
- `session.feedback_text` を表示（全添削ポイントを含む）

### `app/page.js`（学生側）

**コーチコメント表示も同様に3セクション分割:**
- `feedback.coachComment` はオブジェクト形式で返ってくる
- 3セクションをそれぞれ見出し付きで表示

---

## Task 3: 音声ファイルの Supabase Storage 保存

### Supabase 側の設定（手動 SQL）
```sql
-- Supabase SQL Editor で実行
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);

-- sessions テーブルに音声パスの列を追加
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS audio_file_path TEXT;
```

### `lib/db/supabase.js`
- `uploadAudio(studentId, sessionId, audioBuffer, mimeType)` 関数を追加
  - パス: `{studentId}/{sessionId}.{ext}`
  - Supabase Storage の `audio` バケットにアップロード
- `getAudioUrl(filePath)` 関数を追加
  - Signed URL を生成して返す（有効期限: 1時間）
- `saveSession()` に `audioFilePath` フィールドを追加

### `app/api/save/route.js`
- リクエストを `FormData` に変更（JSON + audio バイナリ）
- 音声ファイルを受け取り、`uploadAudio()` で Storage に保存
- 保存パスを `sessions.audio_file_path` に記録

### `lib/api/client.js` — `saveResult()` 変更
- `JSON.stringify` → `FormData` に変更
- `audioFile` バイナリも一緒に送信

### `app/page.js`
- `saveResult()` に `audioFile` オブジェクトも渡す

### 管理画面で音声再生
- `app/api/admin/students/[id]/sessions/[sessionId]/audio/route.js` — 新規 API
  - `audio_file_path` から Signed URL を取得して返す
- `app/admin/students/[id]/page.js` — 展開セッションに `<audio>` プレーヤーを追加

---

## 変更ファイルまとめ

| ファイル | 変更内容 |
|---------|---------|
| `lib/api/gemini.js` | プロンプト構造化 + feedbackText 指示変更 |
| `lib/db/supabase.js` | `uploadAudio()`, `getAudioUrl()` 追加、`saveSession()` に audio_file_path 追加 |
| `app/api/save/route.js` | FormData 受付 + 音声アップロード |
| `lib/api/client.js` | `saveResult()` を FormData 送信に変更 |
| `app/page.js` | saveResult に audioFile 追加 + コーチコメント3分割表示 |
| `app/admin/students/[id]/page.js` | コーチコメントカード分割 + feedbackText 表示 + 音声プレーヤー |
| `app/api/admin/students/[id]/sessions/[sessionId]/audio/route.js` | **新規** — 音声 Signed URL API |
| `supabase/schema.sql` | audio_file_path 列追加 + Storage バケット作成 SQL |

## DB マイグレーション（Supabase SQL Editor で手動実行）
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS audio_file_path TEXT;
```

## 検証方法
1. `NODE_ENV=production npx next build` でビルド確認
2. SQL マイグレーション実行
3. 音声をアップロード → 3構成のコーチコメントが表示されるか確認
4. 管理画面 → 学生詳細 → セッション展開で:
   - コーチコメントが3カード分割で表示
   - 全文フィードバックが表示
   - 音声再生ボタンが機能するか確認
5. 旧セッション（プレーンテキストの coach_comment）が正常にフォールバック表示されるか
