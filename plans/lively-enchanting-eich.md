# Plan: Update Gemini Prompt for Richer Coach Comments

## Context
The current Gemini analysis prompt produces a structured 3-field coach comment (`praise`, `content`, `nextAction`) displayed in separate colored boxes. The user wants a richer, more detailed single flowing text that reads like a personal coach letter — with specific praise, bullet points quoting the student's actual English expressions, content/structure feedback, and an encouraging closing. WPM remains displayed separately (not passed to Gemini).

### Example of desired output style:
```
素晴らしいアウトプットです！👏
状況説明（子猫が鳴いている）→ 問題発生（水を飲まない）→ 解決策（お湯に替える）→ 結末（寝る）という流れが非常に明確でした。
描写が具体的で "energetic", "fresh water", "slightly warmer" など、形容詞を使って状況を詳しく描写しようとする姿勢が素晴らしいです。
次にスピーチを準備する際は、接続詞のバリエーションとを意識してみましょう。
次回の提出も楽しみにしております☺️
```

## Changes

### 1. Update Gemini prompt — `lib/api/gemini.js` (lines 72-105)

**Coach comment section** — replace the 3-field structure with instructions for a single rich text:

```
### 2. コーチからのコメント
以下のガイドラインに沿って、ひとつの流れるコメントを書いてください：

1. 冒頭に短い褒め言葉（絵文字1つ付き、例: 👏🌟💪）
2. 2〜3個の具体的フィードバックを150文字:
   - 学生の英語表現を "" で引用して具体性を出す
   - 良かった点・改善点どちらでもOK（良い点を多めに）
   - スピーチの構成（論理展開、話の流れ）についても触れる
3. 1文で今後のアドバイスや励まし
4. 締めの言葉は以下からランダムに選ぶ：
   - 「引き続き頑張りましょう🌿」
   - 「次回の提出も楽しみにしております☺️」
   - 「この調子で続けていきましょう！🌱」
   - 「応援しています💪」
```

**JSON output format** — change `coachComment` from object to string:

```json
{
  "corrections": [...],
  "coachComment": "冒頭の褒め + 箇条書きフィードバック + アドバイス + 締め（全て1つの文字列、改行で区切る）",
  "feedbackText": "..."
}
```

### 2. Update student frontend — `app/page.js` (lines 326-354)

Remove the `typeof === 'object'` branch that renders 3 separate boxes. Always render `coachComment` as a single string with `white-space: pre-wrap` so newlines and `* ` bullet formatting display correctly.

### 3. Update admin frontend — `app/admin/students/[id]/page.js` (lines 226-262)

Same change: remove the JSON parse + 3-box rendering logic. Display `coach_comment` as pre-wrap text. Keep the JSON parse fallback for backwards compatibility with old sessions that have the 3-field structure — if parsed object has `praise`, concatenate the fields into a single string for display.

### 4. No database changes needed
`coach_comment` column is `TEXT` — storing a plain string instead of a JSON-stringified object works without any migration.

## Files to modify
- `lib/api/gemini.js` — Prompt text and JSON output format
- `app/page.js` — Student coach comment display
- `app/admin/students/[id]/page.js` — Admin coach comment display

## Backwards compatibility
Old sessions stored `coach_comment` as JSON string `{"praise":"...","content":"...","nextAction":"..."}`. The admin page already tries `JSON.parse` and falls back to plain text. We'll keep that logic but when it detects the old format, concatenate the 3 fields into a single display string.

## Verification
1. `NODE_ENV=production npx next build` — ensure no build errors
2. Test with a real audio upload — verify Gemini returns the new single-string `coachComment` format
3. Check student page displays the flowing comment with bullet points
4. Check admin page displays both new-format and old-format sessions correctly
