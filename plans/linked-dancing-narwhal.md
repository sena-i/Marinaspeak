# Speakalize 要件定義書

## Context

Speakalize は、受講生がスピーチを練習し、AIによるフィードバックを受けるNext.jsウェブアプリケーションである。
学生IDと日付に基づくデータ蓄積機能を追加し、教員が学生の練習履歴と成長を長期的に追跡できるようにする。Vercel KVをSupabase（PostgreSQL）に置き換え、データの制限を撤廃する。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | Speakalize |
| 技術スタック | Next.js, React, Google Gemini API, Supabase (PostgreSQL) |
| 対象ユーザー | 学生（スピーチ練習）、教員/管理者（データ閲覧） |

### 用語定義

| 用語 | 説明 |
|------|------|
| セッション | 1回の音声アップロード→文字起こし→分析の一連の流れ |
| 学生ID | 学生が自分で入力する識別子（ログイン不要） |
| WPM | Words Per Minute（1分あたりの話速、発話時間基準） |
| corrections | 添削配列（元の表現→修正後、最大4つ） |
| coachComment | コーチからのコメント（日本語、絵文字含む） |
| feedbackText | フィードバック全文（文字起こし+添削+コメント統合） |

---

## 2. 機能要件

### 2.1 既存機能（変更なし）

| # | 機能 | 説明 | 関連ファイル |
|---|------|------|------------|
| E-1 | 音声アップロード | MP3/MP4、最大50MB | `lib/utils/fileValidator.js` |
| E-2 | AI文字起こし | Gemini API (gemini-3.0-flash) で音声→テキスト変換 | `lib/api/gemini.js` |
| E-3 | スピーチ分析 | コーチング形式フィードバック（添削+コーチコメント） | `lib/api/gemini.js` |
| E-4 | WPM計算 | 話速の計算と表示（無音除去による正確な発話時間基準） | `lib/utils/wpmCalculator.js` |

### 2.2 新規機能

#### F-1: 学生ID入力（優先度: P0）

**概要**: 学生は練習開始前に学生IDを入力する。ログイン/パスワードは不要。

**受け入れ基準**:
- 英数字1〜20文字のIDを入力できる
- IDが未登録の場合、自動的に新規登録される
- IDが登録済みの場合、既存の学生として紐付けられる
- IDは`sessionStorage`に保存され、ブラウザセッション中は維持される
- ID未入力では音声アップロードに進めない

#### F-2: 日付ベースデータ蓄積（優先度: P0）

**概要**: 各セッションを日付付きで永続保存し、データ蓄積の制限を撤廃する。

**受け入れ基準**:
- 各セッションに`session_date`（練習日）と`created_at`（タイムスタンプ）を記録
- 保存件数の上限なし（現行の10件制限を撤廃）
- 学生ID + 日付範囲でのデータ検索が可能
- 保存データ: 文字起こし、単語数、WPM、添削（corrections）、コーチコメント、フィードバック全文、音声ファイル情報

#### F-3: データベース移行 — Vercel KV → Supabase（優先度: P0）

**概要**: Vercel KVをSupabase（PostgreSQL）に完全置換する。

**選定理由**:
- リレーショナルデータ（学生→セッション）の管理に最適
- 日付範囲クエリ・集計（AVG, GROUP BY）がSQLでネイティブ対応
- Vercelとの統合が容易
- 無料枠: 500MB DB、無制限APIリクエスト

- 全データ操作がSupabaseを使用する
- セッション保存のレイテンシが500ms以下

#### F-4: 管理者・教員ダッシュボード（優先度: P1）

**概要**: 教員が学生の練習データを閲覧するための管理画面。閲覧専用（データ変更不可）。

**アクセス方法**: 事前に発行されたアクセストークンを入力（簡易認証）

**受け入れ基準**:
- 有効なトークンでのみアクセス可能
- 登録済み学生の一覧を表示
- 学生を選択して全セッション履歴を閲覧可能
- WPM推移の折れ線グラフを表示
- 日付範囲でフィルタ可能
- データの編集・削除は不可（読み取り専用）
- 無効なトークンは401エラーで拒否

---

## 3. データベース設計

### 3.1 テーブル定義

#### `students` テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 内部ID |
| student_id | TEXT | NOT NULL, UNIQUE | 学生が入力するID |
| display_name | TEXT | nullable | 表示名（任意） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 登録日時 |

#### `sessions` テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | セッションID |
| student_id | TEXT | NOT NULL, FK → students.student_id | 学生ID |
| session_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | 練習日 |
| transcription | TEXT | NOT NULL | 文字起こしテキスト |
| word_count | INTEGER | NOT NULL, DEFAULT 0 | 単語数 |
| duration_seconds | NUMERIC(10,2) | nullable | 音声全体の長さ（秒） |
| speaking_duration | NUMERIC(10,2) | nullable | 発話時間のみ（無音除去後、秒） |
| wpm | INTEGER | nullable | 話速（speaking_duration基準） |
| corrections | JSONB | DEFAULT '[]' | 添削配列（max 4） |
| coach_comment | TEXT | nullable | コーチからのコメント |
| feedback_text | TEXT | nullable | フィードバック全文 |
| focus_points | TEXT | nullable | 意識したいポイント（ユーザー入力） |
| audio_file_name | TEXT | nullable | 元ファイル名 |
| audio_mime_type | TEXT | nullable | MIMEタイプ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

#### `admin_tokens` テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | トークンID |
| token_hash | TEXT | NOT NULL, UNIQUE | SHA-256ハッシュ |
| label | TEXT | nullable | ラベル（例: "田中先生"） |
| is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| expires_at | TIMESTAMPTZ | nullable | 有効期限 |

### 3.2 インデックス

```sql
CREATE INDEX idx_sessions_student_id ON sessions(student_id);
CREATE INDEX idx_sessions_date ON sessions(session_date);
CREATE INDEX idx_sessions_student_date ON sessions(student_id, session_date DESC);
```

---

## 4. API設計

### 4.1 既存エンドポイント（修正）

| メソッド | パス | 変更内容 |
|----------|------|----------|
| POST | `/api/transcribe` | FormDataに`studentId`を追加 |
| POST | `/api/analyze` | 変更なし |
| POST | `/api/save` | Supabaseへの保存に書き換え |

### 4.2 新規エンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/students/register` | 学生の自動登録（upsert） |
| GET | `/api/sessions?studentId=...&date=...` | セッション取得 |
| GET | `/api/admin/students` | 全学生一覧（要トークン） |
| GET | `/api/admin/students/[id]/sessions` | 学生別セッション一覧（要トークン） |
| GET | `/api/admin/students/[id]/progress` | 学生別スコア推移（要トークン） |
| GET | `/api/admin/overview` | クラス全体の統計（要トークン） |

---

## 5. 画面設計

### 5.1 学生用画面

**変更点**: 音声アップロード画面の前に学生ID入力ステップを追加

```
学生ID入力 → 音声アップロード → 文字起こし → 分析 → 結果表示（自動保存）
```

### 5.2 管理者画面

| ページ | パス | 内容 |
|--------|------|------|
| トークン入力 | `/admin` | アクセストークンを入力 |
| 学生一覧 | `/admin/students` | 全学生のリスト（セッション数、平均WPM、最終練習日） |
| 学生詳細 | `/admin/students/[id]` | WPM推移グラフ + セッション履歴テーブル + コーチングフィードバック |

**グラフ表示**: Rechartsライブラリを使用し、WPMの折れ線グラフを描画

---

## 6. ファイル構成（変更・追加）

```
lib/
  db/
    supabase.js          ← 新規（kv.jsを置換）
  api/
    client.js            ← 修正（studentId追加、admin API追加）
    gemini.js            ← 変更なし
  middleware/
    adminAuth.js         ← 新規（トークン検証）

app/
  page.js                ← 修正（学生ID入力ステップ追加）
  api/
    transcribe/route.js  ← 修正（studentId受け取り）
    analyze/route.js     ← 変更なし
    save/route.js        ← 書き換え（Supabase保存）
    students/register/route.js  ← 新規
    sessions/route.js           ← 新規
    admin/
      students/route.js                  ← 新規
      students/[id]/sessions/route.js    ← 新規
      students/[id]/progress/route.js    ← 新規
      overview/route.js                  ← 新規
  admin/
    page.js                    ← 新規（トークン入力）
    students/page.js           ← 新規（学生一覧）
    students/[id]/page.js      ← 新規（学生詳細+グラフ）
```

---

## 7. 環境変数

```
# Supabase（新規 — Vercel KV変数を置換）
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # サーバーサイド専用

# 既存（変更なし）
GEMINI_API_KEY=...
```

---

## 8. 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | セッション保存: 500ms以下、ダッシュボード表示: 2秒以下（500学生・10,000セッション想定） |
| セキュリティ | 管理者トークンはSHA-256ハッシュで保存。Supabase Service Role Keyはサーバーサイドのみ |
| データ保全 | 全セッションを永続保存。FK制約による参照整合性の維持 |
| スケーラビリティ | student_id, session_dateへのインデックスで効率的なクエリを保証 |

---

## 9. 開発フェーズ

| フェーズ | 内容 | 優先度 |
|----------|------|--------|
| **Phase 1** | Supabaseセットアップ、スキーマ作成、DB移行、学生ID入力UI | P0 |
| **Phase 2** | 管理者ダッシュボード（学生一覧、詳細、グラフ） | P1 |
| **Phase 3** | CSV出力、セッション比較、バッチ学生インポート等 | P2（将来） |

---

## 10. 検証方法

1. **学生ID入力**: IDを入力→音声アップロード→結果がSupabaseに保存されることを確認
2. **データ蓄積**: 同一学生IDで複数回セッションを実行→全データが保持されていることを確認
3. **管理者ダッシュボード**: トークン入力→学生一覧表示→学生選択→セッション履歴とグラフ表示を確認
4. **認証**: 無効なトークンで管理者APIにアクセス→401エラーを確認
5. **Vercel KV撤廃**: `@vercel/kv`の依存がpackage.jsonから削除されていることを確認

---

## 11. Geminiプロンプト変更計画（コーチング形式への移行）

### Context
現在のGemini分析プロンプトはJSON形式（grammarScore, structureScore, errors, suggestions, summary）を返す。
ユーザーの新しいプロンプトは「実践的スピーキング・コーチ」として、文字起こし→添削→コーチコメントの日本語フィードバック形式。
スコアベースのチャートを廃止し、コーチングテキスト形式に完全移行する。

### 変更対象ファイル

1. **`lib/api/gemini.js`** — 分析プロンプトを新コーチング形式に変更。JSON出力を `corrections`（添削配列）、`coachComment`（コーチコメント）、`feedbackHtml`（全体フィードバックのHTML/テキスト）に変更
2. **`app/page.js`** — 結果表示をスコアカード形式からコーチングフィードバック表示に変更。grammarScore/structureScore表示を削除
3. **`app/api/save/route.js`** — 保存データからgrammarScore/structureScoreを除外し、新フィールドに対応
4. **`lib/db/supabase.js`** — `saveSession`の`grammar_score`/`structure_score`を除外、`feedback_text`カラムに全文保存
5. **`supabase/schema.sql`** — `grammar_score`, `structure_score`, `errors`, `suggestions`, `summary`を廃止、`corrections`（JSONB）、`coach_comment`（TEXT）、`feedback_text`（TEXT）を追加
6. **`app/admin/students/[id]/page.js`** — Score Progressチャートを削除、WPMチャートは維持、セッション詳細にコーチングフィードバック表示
7. **`app/admin/students/page.js`** — Avg Grammar / Avg Structure列を削除
8. **`lib/db/supabase.js`の`getAllStudents`** — avg_grammar/avg_structure集計を削除
9. **`app/api/admin/students/[id]/sessions/route.js`** — stats計算からgrammar/structureを削除
10. **`app/api/admin/students/[id]/progress/route.js`** — grammar/structureの推移をWPMのみに変更

### Gemini新プロンプト（JSON出力）

Geminiに以下の形式でJSONを返させる：
```json
{
  "corrections": [
    { "original": "元の表現", "corrected": "修正後", "explanation": "[修正が必要な理由とニュアンスの違い（日本語で簡潔に）]" }
  ],
  "coachComment": "[良かった点を具体的に褒めるコメントと、励ましの絵文字（👏など）、そして「引き続き頑張りましょう🌿」または「次回の提出も楽しみにしております☺️」のいずれかで締めくくる全文（日本語）]",
  "feedbackText": "フィードバック全体のプレーンテキスト（文字起こし+添削+コメント統合）"
}
```
- `corrections`は最大4つ
- `coachComment`は良い点を褒め、締めの言葉をランダムに選択

### 意識したいポイント（フォーカスポイント機能）

**概要**: ユーザーが「意識したいポイント」（例: ディスコースマーカーの使用、時制の一致、発音の明瞭さ等）をテキスト入力すると、Geminiの分析プロンプトにそのポイントが追加され、フィードバックで優先的に言及される。

**UI**: 音声アップロード画面に「意識したいポイント」テキスト入力欄を追加

**フロー**:
1. 学生が音声アップロード画面で「意識したいポイント」を入力（任意、空でもOK）
2. 入力内容がGemini分析プロンプトに動的に挿入される
3. コーチングフィードバックでそのポイントについて優先的にコメントされる

**Geminiプロンプトへの挿入例**:
```
特に以下のポイントを意識してフィードバックしてください：
- ディスコースマーカーの使用
```

**変更対象ファイル**:
1. **`app/page.js`** — 「意識したいポイント」入力欄を追加、stateで管理
2. **`lib/api/client.js`** — `analyzeTranscription`に`focusPoints`パラメータを追加
3. **`app/api/analyze/route.js`** — リクエストから`focusPoints`を受け取り、プロンプトに挿入
4. **`lib/api/gemini.js`** — `analyzeWithGemini(transcription, focusPoints)`にフォーカスポイント対応
5. **`app/api/save/route.js`** — `focus_points`をセッションデータとして保存
6. **`supabase/schema.sql`** — `sessions`テーブルに`focus_points`（TEXT、nullable）を追加

**DB追加カラム**:
```sql
ALTER TABLE sessions ADD COLUMN focus_points TEXT;
```

### Geminiプロンプト技術的注意点

| # | ポイント | 詳細 |
|---|---------|------|
| 1 | JSON出力の安定性 | Geminiがマークダウンコードブロック(```json)で囲む場合があるため、正規表現で`{...}`を抽出する |
| 2 | corrections数の制限 | プロンプトで「最大4つ」と指定しても超える場合があるため、コード側でもslice(0, 4)で制限 |
| 3 | 日本語レスポンス | プロンプトに「日本語で回答」を明記。英語に切り替わる場合がある |
| 4 | 絵文字の一貫性 | コーチコメントの絵文字使用はプロンプトで具体例を示す（🎯✅💪等） |
| 5 | 締めの言葉のバリエーション | プロンプトに複数の締めパターンを列挙し、ランダム選択を指示 |
| 6 | 空のtranscription対策 | 文字起こしが空の場合のフォールバック処理（「音声が認識できませんでした」等） |
| 7 | feedbackTextの長さ | 長すぎるフィードバックを避けるため、プロンプトで簡潔さを指示 |
| 8 | スコアを含めない | 旧形式のgrammarScore/structureScoreを返さないようプロンプトで明示 |

### DB変更（マイグレーション）

```sql
ALTER TABLE sessions DROP COLUMN grammar_score;
ALTER TABLE sessions DROP COLUMN structure_score;
ALTER TABLE sessions DROP COLUMN errors;
ALTER TABLE sessions DROP COLUMN suggestions;
ALTER TABLE sessions DROP COLUMN summary;
ALTER TABLE sessions ADD COLUMN corrections JSONB DEFAULT '[]'::JSONB;
ALTER TABLE sessions ADD COLUMN coach_comment TEXT;
ALTER TABLE sessions ADD COLUMN feedback_text TEXT;
ALTER TABLE sessions ADD COLUMN speaking_duration NUMERIC(10,2);
ALTER TABLE sessions ADD COLUMN focus_points TEXT;
```

### 検証方法
1. 音声アップロード → 日本語コーチングフィードバックが表示されることを確認
2. 添削が「✅ 元 → 修正後」形式で最大4つ表示されることを確認
3. コーチコメントに絵文字と締めの言葉が含まれることを確認
4. 管理者ダッシュボードでスコアチャートが消え、WPMチャートのみ表示されることを確認
5. セッション詳細にコーチングフィードバックが表示されることを確認

---

## 12. WPM精度改善計画（無音除去による正確な話速計算）

### Context
現在のWPM計算は音声ファイル全体の長さ（`audioDuration`）を使用しているため、無音部分（考え中の沈黙、開始/終了の間）が含まれ、実際の話速より低い値が算出される。
`/Users/sena/Desktop/WPM/`にあるPythonスクリプト（`wpm3.py`, `transcribe.py`）はffmpegの`silenceremove`フィルタで無音を除去し、発話時間のみでWPMを計算するアプローチを採用しており、より正確な話速が得られる。

### アプローチ
サーバーサイドAPIルート（`/api/transcribe`）でffmpegを使って無音除去後の音声の長さを計測し、その値をWPM計算に使用する。

**ffmpegコマンド（参考: wpm3.py）**:
```bash
ffmpeg -i input.mp3 -af "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=-1:stop_silence=0.3:stop_threshold=-40dB:detection=peak" -f null -
```
このコマンドで無音除去後の音声の長さ（`time=`）をstderrから取得できる。

### 変更対象ファイル

1. **`app/api/transcribe/route.js`** — アップロードされた音声ファイルをtmpに保存 → ffmpegで無音除去後のdurationを取得 → レスポンスに`speakingDuration`を追加
2. **`lib/api/client.js`** — `uploadAndTranscribe`の戻り値から`speakingDuration`を受け取り
3. **`app/page.js`** — `speakingDuration`が取得できた場合はそちらでWPMを計算（フォールバック: 元の`audioDuration`）
4. **`lib/utils/wpmCalculator.js`** — `calculateWPM`は変更不要（入力されるdurationが変わるだけ）

### 実装詳細

#### `app/api/transcribe/route.js` の変更:
```javascript
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

// ffmpegで無音除去後のdurationを取得
async function getSpeakingDuration(audioBuffer, mimeType) {
  const ext = mimeType.includes('mp4') ? '.mp4' : '.mp3';
  const tmpPath = path.join(os.tmpdir(), `speakalize-${Date.now()}${ext}`);

  await writeFile(tmpPath, Buffer.from(audioBuffer));

  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${tmpPath}" -af "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=-1:stop_silence=0.3:stop_threshold=-40dB:detection=peak" -f null - 2>&1`;

    exec(cmd, { timeout: 30000 }, async (error, stdout, stderr) => {
      await unlink(tmpPath).catch(() => {});
      const output = stdout + stderr;
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        resolve(hours * 3600 + minutes * 60 + seconds);
      } else {
        resolve(null); // ffmpegが使えない場合はnull
      }
    });
  });
}
```

#### レスポンス変更:
```json
{
  "transcription": "...",
  "speakingDuration": 45.2
}
```

### ffmpeg依存
- `ffmpeg-static` npmパッケージを使用（ローカル・Vercel両方で動作するNode.jsスタティックバイナリ）
- ネイティブffmpegのインストール不要
- `npm install ffmpeg-static` でインストール
- コード内で `const ffmpegPath = require('ffmpeg-static');` でバイナリパスを取得
- ffmpegが利用不可の場合はフォールバック（元のaudioDuration使用）で動作

### 検証方法
1. 無音が多い音声をアップロード → WPMが従来より高い（正確な）値になることを確認
2. 無音がほぼない音声 → WPMが大きく変わらないことを確認
3. ffmpegが利用不可の環境 → フォールバックで元のaudioDurationが使われることを確認
4. 管理者ダッシュボードのWPMチャートに正確な値が反映されることを確認

---

## 13. Geminiプロンプト精度向上 & フィードバック表示バグ修正

### Context
ユーザーのGemini Gemと同等のフィードバック精度を実現するため、プロンプトを更新する。
また、フィードバック（添削・コーチコメント）がHTMLに表示されないバグを修正する。

---

### 13.1 Geminiプロンプト更新

**対象ファイル**: `lib/api/gemini.js` — `analyzeWithGemini`関数のプロンプト

**変更点**:

| # | 項目 | 現在 | 変更後 |
|---|------|------|--------|
| 1 | 添削の優先順位 | 指定なし | 主語動詞一致 → 時制と名詞 → 助動詞 → 語彙 → 文法ミス |
| 2 | 締めの言葉 | 5パターン | 2パターン（「引き続き頑張りましょう🌿」「次回の提出も楽しみにしております☺️」） |
| 3 | トーン指示 | なし | 「親切な専属コーチ、プロフェッショナルかつフレンドリー」を追加 |
| 4 | 添削形式 | 自由記述 | 「✅ 元 → 修正後」形式を明示 |

**新プロンプト**:
```
あなたは実践的スピーキング・コーチです。学生の英語スピーチの文字起こしを分析し、日本語でフィードバックしてください。
親切な専属コーチとして、プロフェッショナルかつフレンドリーなトーンでお願いします。

## 指示:

### 1. 添削（最大4つ）
文字起こしから改善点を最大4つまで以下の優先順位で選んでください：
- 主語と動詞の一致
- 時制と名詞（単数/複数）
- 助動詞の使い方
- 語彙の選択・言い換え
- 文法上のミス

### 2. コーチからのコメント
- 良い点を褒めて、改善ポイントを具体的に伝えてください
- 絵文字を適度に使ってください（🎯✅💪🌟📝等）
- 締めの言葉は以下からランダムに選んでください：
  - 「引き続き頑張りましょう🌿」
  - 「次回の提出も楽しみにしております☺️」

[focusSection — 動的挿入]

## 文字起こし:
[transcription]

## 出力形式（JSON）:
以下のJSON形式のみを出力してください。マークダウンのコードブロックで囲まず、JSONのみを返してください。

{
  "corrections": [
    { "original": "元の表現", "corrected": "修正後の表現", "explanation": "なぜこの修正が必要か（日本語で簡潔に）" }
  ],
  "coachComment": "コーチからのコメント全文（絵文字含む、日本語）",
  "feedbackText": "フィードバック全体のまとめ（添削ポイント+コメントを統合したプレーンテキスト）"
}
```

**注意**: JSON出力の安定性を向上させるため「マークダウンのコードブロックで囲まず」を明記。
既存のJSON抽出ロジック（正規表現フォールバック）は変更なし。

---

### 13.2 フィードバック表示バグ修正

**対象ファイル**: `app/page.js` — 結果表示のJSX（lines 303-337）

**原因分析**:
Gemini JSONパースが失敗した場合、`analyzeWithGemini`は`{}`（空オブジェクト）を返す。
`page.js`で`const fb = analyzeResult.feedback || {};`により`feedback`state は`{}`に設定される。

このとき：
- `feedback`は truthy（`{}`はtruthyだから）
- `feedback.corrections`は`undefined` → falsy → 添削セクション非表示
- `feedback.coachComment`は`undefined` → falsy → コーチコメント非表示
- `!feedback`は`false` → 「No feedback available」も非表示

**結果**: ユーザーには何も表示されない（添削なし、コメントなし、エラーメッセージもなし）

**修正方法**:

#### 修正1: `app/page.js` — 空フィードバック検出の改善

「No feedback available」の条件を変更：
```jsx
// 修正前
{!feedback && (
  <div className="card"><p>No feedback available</p></div>
)}

// 修正後
{feedback && !feedback.corrections?.length && !feedback.coachComment && (
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
```

#### 修正2: `lib/api/gemini.js` — パース失敗時のフォールバック改善

JSONパースが失敗した場合、raw textからcoachCommentとして返す：
```javascript
// 修正前
} catch (e) {
  console.error('Failed to parse Gemini JSON:', e.message);
  feedback = {};
}

// 修正後
} catch (e) {
  console.error('Failed to parse Gemini JSON:', e.message, 'Raw:', jsonStr.substring(0, 300));
  // パース失敗時はraw textをcoachCommentとして返す
  feedback = {
    corrections: [],
    coachComment: text || 'フィードバックの解析に失敗しました。',
    feedbackText: text || ''
  };
}
```

#### 修正3: `lib/api/gemini.js` — 空レスポンス対策

Geminiからテキストが取得できなかった場合のガード：
```javascript
// text抽出後、空チェックを追加
if (!text || text.trim() === '') {
  return {
    corrections: [],
    coachComment: '音声の分析に失敗しました。もう一度お試しください。',
    feedbackText: ''
  };
}
```

---

### 13.3 変更対象ファイルまとめ

| ファイル | 変更内容 |
|----------|----------|
| `lib/api/gemini.js` | プロンプト更新 + パース失敗フォールバック + 空レスポンスガード |
| `app/page.js` | 空フィードバック時のUI表示改善 |

---

### 13.4 検証方法

1. 音声アップロード → 添削とコーチコメントがHTMLページに表示されることを確認
2. 添削の優先順位が主語動詞→時制→助動詞→語彙→文法の順であることを確認
3. 締めの言葉が2パターン（🌿 or ☺️）のいずれかであることを確認
4. Gemini APIエラー時 → 「フィードバックを取得できませんでした」メッセージが表示されることを確認
5. `npm run build` が成功することを確認

---

## 14. Vercelデプロイ修正（ローカルでは動くがVercelでは動かない問題）

### Context
アプリはローカルでは正常に動作するが、Vercel（https://speakalize.vercel.app/）ではランタイムエラーが発生する。
ビルドは成功するが、使用時にエラーが発生する。

### 原因分析

| # | 原因 | 深刻度 | 詳細 |
|---|------|--------|------|
| 1 | **ffmpeg-static バイナリ実行不可** | CRITICAL | 44MBのffmpegバイナリがVercel Lambda環境で実行できない。`child_process.exec()`でバイナリ起動を試みるが、Lambda環境では実行権限が制限される |
| 2 | **ffmpeg-static バンドルサイズ** | HIGH | 44MBバイナリがサーバーレス関数にバンドルされ、関数サイズ制限（250MB）を圧迫。`/api/transcribe`が大きくなりすぎる可能性 |
| 3 | **.gitignore マージコンフリクト残存** | MEDIUM | Line 13に`=======`、Line 153に`>>>>>>> 5fa17fe...`が残っている。Vercelが正しくファイルを除外できない可能性 |
| 4 | **環境変数未設定** | CRITICAL | `GEMINI_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY`等がVercelダッシュボードに設定されていない場合、API呼び出しが全て失敗する |
| 5 | **リクエストボディサイズ制限** | MEDIUM | `next.config.js`で`bodySizeLimit: '50mb'`設定だが、これはServer Actions専用。Vercel APIルートのデフォルトは4.5MB |

### 修正計画

#### 修正1: ffmpeg-staticをVercelで安全に使えるようにする
**対象ファイル**: `app/api/transcribe/route.js`

**方針**: `getSpeakingDuration()`のffmpeg実行を`try/catch`で完全に囲み、失敗時は`null`を返す（フォールバック）。
現在も`try/catch`はあるが、`exec()`の実行が長時間ハングする可能性がある。

具体的な変更：
1. ffmpegの呼び出しを完全にオプショナルにする — ffmpegが使えない環境（Vercel）では即座に`null`を返す
2. `getFFmpegPath()`が`'ffmpeg'`(システムffmpegフォールバック)を返した場合、Vercelにはシステムffmpegもないので即`null`を返す
3. `ffmpeg-static`のrequireが成功してもバイナリが実行可能か事前チェック

```javascript
async function getSpeakingDuration(audioBuffer, mimeType) {
  let ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    // ffmpeg-static not available, skip speaking duration
    return null;
  }

  if (!ffmpegPath) return null;

  // ... 既存のffmpeg実行ロジック（タイムアウト短縮: 30s → 15s）
}
```

#### 修正2: .gitignore のマージコンフリクト修正
**対象ファイル**: `.gitignore`

Line 13の`=======`とLine 153の`>>>>>>> 5fa17fe...`を削除。

#### 修正3: 環境変数の設定（最重要 — 500エラーの直接原因）

**確認済みエラー**: `POST /api/students/register` → 500 Internal Server Error
**根本原因**: `lib/db/supabase.js`の`getSupabase()`が環境変数未設定のため`createClient(undefined, undefined)`でクラッシュ

**手動作業**: Vercelダッシュボード → Settings → Environment Variables で以下を**必ず**設定：
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**設定後、Vercelで再デプロイが必要**

**コード側の改善**: `getSupabase()`に環境変数チェックを追加（`lib/db/supabase.js`）

#### 修正4: リクエストサイズ制限の明示化
**対象ファイル**: `app/api/transcribe/route.js`

Vercel Serverless Functionsの制限に合わせ、ファイルサイズ制限をAPIルート内で明示的にチェック（4.5MB以下に制限、またはVercelのPro Planなら大きいファイルも可）:

```javascript
// Vercel free plan request body limit is 4.5MB
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB
```

### 変更対象ファイルまとめ

| ファイル | 変更内容 |
|----------|----------|
| `app/api/transcribe/route.js` | ffmpeg実行をVercel環境で安全に処理（失敗時nullフォールバック） |
| `lib/db/supabase.js` | `getSupabase()`に環境変数チェック追加 |
| `.gitignore` | マージコンフリクトマーカー削除 |
| Vercelダッシュボード | 環境変数設定（**手動・最重要**） |

### 検証方法
1. `NODE_ENV=production npx next build` — ビルド成功を確認
2. `git commit && git push` — Vercelに自動デプロイ
3. https://speakalize.vercel.app/ にアクセスし、学生ID入力→音声アップロード→フィードバック表示が動作することを確認
4. Vercel Dashboard → Function Logs でエラーがないことを確認
5. WPMは`speakingDuration`がnull（ffmpeg使えないため）→`audioDuration`フォールバックで計算されることを確認

---

## 14.5 Vercelデプロイ修正 第2弾（環境変数設定済みでも500エラー）

### Context
環境変数はVercelダッシュボードに設定済みだが、依然として全APIルートが500エラーを返す。
前回の修正（Section 14）では解決しなかった。

### 原因分析

前回の修正を踏まえた上で、残る可能性のある原因：

| # | 原因 | 深刻度 | 詳細 |
|---|------|--------|------|
| 1 | **`ffmpeg-static`（44MB）が全Lambda関数にバンドル** | CRITICAL | `package.json`に`ffmpeg-static`があるだけで、Vercelは全サーバーレス関数（`/api/sessions`等も含む）にこの44MBバイナリを含める。関数サイズ制限（250MB）超過やcold startタイムアウトの可能性。`/api/sessions`はffmpegを使わないのに影響を受ける |
| 2 | **Next.js 16の既知バグ** | HIGH | MEMORY.mdに「Next.js 16 has known `_global-error` useContext bug (GitHub #85668)」と記載。「Next.js 15.1.7 + React 19.0.0 is the working combination」が推奨 |
| 3 | **環境変数追加後の再デプロイ漏れ** | HIGH | Vercelで環境変数を追加しただけでは反映されない。Deployments → Redeployが必要 |

### 修正計画

#### 修正1: `ffmpeg-static`をdependenciesから除外し、optionalDependenciesに移動

**対象ファイル**: `package.json`

`ffmpeg-static`を`dependencies`から`optionalDependencies`に移動する。これにより：
- Vercelのインストール時にffmpeg-staticが失敗しても全体のビルドは継続
- Lambda関数のバンドルサイズが大幅に縮小
- ローカルでは通常通りインストール・使用可能

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.95.3",
    "@vercel/speed-insights": "^1.3.1",
    "next": "^16.1.6",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "recharts": "^3.7.0"
  },
  "optionalDependencies": {
    "ffmpeg-static": "^5.2.0"
  }
}
```

加えて、`next.config.js`に`serverExternalPackages`を追加して、ffmpeg-staticがLambdaバンドルに含まれないようにする：

```javascript
const nextConfig = {
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  }
};
```

#### 修正2: Next.jsを15.1.7にダウングレード（推奨）

**対象ファイル**: `package.json`

MEMORY.mdの記載に従い、安定した組み合わせに戻す：
- `next`: `^16.1.6` → `15.1.7`
- `react`: `^19.2.4` → `19.0.0`
- `react-dom`: `^19.2.4` → `19.0.0`

```json
{
  "dependencies": {
    "next": "15.1.7",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
```

#### 修正3: Vercel再デプロイの確実な実行

環境変数追加後、以下の手順で確実に再デプロイ：
1. コード変更をcommit & push
2. Vercel Dashboardで最新のデプロイを確認
3. 必要なら手動でRedeploy（Deployments → ⋮ → Redeploy）

### 変更対象ファイルまとめ

| ファイル | 変更内容 |
|----------|----------|
| `package.json` | ffmpeg-staticをoptionalDependenciesに移動、Next.js 15.1.7にダウングレード |
| `next.config.js` | `serverExternalPackages: ['ffmpeg-static']`追加 |

### 検証方法
1. `rm -rf node_modules .next && npm install` — クリーンインストール
2. `NODE_ENV=production npx next build` — ビルド成功を確認
3. `git commit && git push` — Vercelに自動デプロイ
4. https://speakalize.vercel.app/api/sessions?studentId=test にアクセス → 500ではなく正常応答
5. 学生ID入力→音声アップロード→フィードバック表示が動作することを確認
