# Speakalize アプリ説明書（開発者向け）

## 1. アプリ概要
Speakalize は、学習者が音声（MP3/MP4/M4A）を提出し、Gemini API で文字起こしと英語スピーキング添削を受けるアプリです。

- 学習者画面: 学籍ID登録 → 音声アップロード → 分析結果確認
- 管理者画面: 学習者一覧・セッション履歴・詳細確認
- 保存先: Supabase（students / sessions テーブル）

## 2. 画面と主要ファイル
- 学習者画面: `app/page.js`
- 管理者ログイン: `app/admin/page.js`
- 管理者 学習者一覧: `app/admin/students/page.js`
- 管理者 学習者詳細: `app/admin/students/[id]/page.js`
- AI分析プロンプト: `lib/api/gemini.js`
- セッション保存処理: `lib/db/supabase.js`

## 3. 変えたいこと① UI表記をすべて日本語化
現状は英語UIと日本語UIが混在しています。以下のファイルの文言を日本語に統一してください。

### 3-1. 学習者画面（`app/page.js`）
主な英語文言:
- `Student ID`, `Start Practice`, `Upload Audio`, `Transcribe & Analyze`
- `Results`, `New Session`, `Words`, `Speaking Time`
- `Transcription`, `Corrections`, `Coach Comment`, `No feedback available`
- エラー文言: `Student ID is required` など

### 3-2. 管理者画面
- `app/admin/page.js`
  - `Admin Dashboard`, `Access Token`, `Login`, `Verifying...`
- `app/admin/students/page.js`
  - `Students`, `registered students`, `Logout`, 各テーブル見出し
- `app/admin/students/[id]/page.js`
  - `Loading...`, `Back to List`, `Session History`, `Session Detail`, `Load Audio` など

### 3-3. 文言管理の推奨
将来の保守のため、画面内に直書きせず、まずは `const ja = { ... }` の辞書を画面先頭に置いて参照する方式にすると管理しやすくなります。

## 4. 変えたいこと② Coach Comment の表示方法

### 4-1. 現在仕様（学習者画面）
`app/page.js` では、以下3項目を1つの「Coach Comment」欄に連結表示しています。
- `goodPoints`
- `coachComment`
- `closing`

表示ロジック（概念）:
- 3つのうち存在するものだけを `\n\n` で連結して表示
- 改行保持のため `whiteSpace: 'pre-wrap'`

### 4-2. 現在仕様（管理者画面）
`app/admin/students/[id]/page.js` では、以下を分割表示しています。
- `Good points`（good_points）
- `Content`（coach_comment）
- `Closing`（closing）

さらに後方互換のため、旧データで `coach_comment` が JSON 文字列の場合は `JSON.parse` し、`praise/content/nextAction` を連結表示しています。

### 4-3. 保存仕様
`lib/db/supabase.js` の `saveSession()` で `coach_comment` は TEXT 列に保存されます。
- オブジェクトなら `JSON.stringify()` して保存
- 文字列ならそのまま保存

## 5. Coach Comment 表示を変更する時の実装方針

### 方針A: 学習者・管理者ともに「1つの文章」で統一
- 学習者側: 現状の連結表示を維持または `feedbackText` 表示へ一本化
- 管理者側: 3ブロック表示をやめ、1ブロックに統一
- 旧JSON形式データのパース処理は残す（既存データ互換のため）

### 方針B: 学習者・管理者ともに「3ブロック表示」で統一
- 学習者側を管理者同等の分割表示に変更
- セクション見出しを日本語化（例: 良かった点 / 改善ポイント / しめのコメント）

## 6. 変更時の確認チェックリスト
- 学習者画面・管理者画面で英語UIが残っていない
- Coach Comment が空/null のときにレイアウト崩れがない
- 旧セッション（JSON文字列の coach_comment）が正常表示される
- 改行が意図通り表示される（`pre-wrap`）

## 7. 最短の着手順（推奨）
1. `app/page.js` の文言を日本語化
2. 管理者3画面の文言を日本語化
3. Coach Comment 表示方式を A/B どちらかに決めて両画面を統一
4. テストデータ（新規・旧データ）で表示確認
