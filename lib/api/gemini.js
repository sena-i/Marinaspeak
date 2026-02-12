const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

export async function transcribeWithGemini(base64Audio, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: "Please transcribe this audio file accurately. Return only the transcription."
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Audio
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();

  // Gemini 2.5 flash thinking model - find text parts (skip thought parts)
  const parts = data.candidates?.[0]?.content?.parts || [];
  let text = '';
  for (const part of parts) {
    if (part.text) {
      text += part.text;
    }
  }

  return {
    text: text.trim(),
    duration: null
  };
}

export async function analyzeWithGemini(transcription, focusPoints) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  let focusSection = '';
  if (focusPoints && focusPoints.trim()) {
    focusSection = `\n\n## 特に意識してフィードバックしてほしいポイント:\n${focusPoints.trim()}\n上記のポイントについて、コーチコメントで優先的に言及してください。`;
  }

  const prompt = `あなたは実践的スピーキング・コーチです。学生の英語スピーチの文字起こしを分析し、日本語でフィードバックしてください。
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
以下のガイドラインに沿って、ひとつの流れるコメントを書いてください：

1. 冒頭に短い褒め言葉（絵文字1つ付き、例: 👏🌟💪）
2. 箇条書き（「* 」で始める）で2〜3個の具体的フィードバック:
   - 各項目に短い見出しをつけ、コロンの後に説明を書く（例: 「* 論理構成が完璧: 〜」）
   - 学生の英語表現を "" で引用して具体性を出す
   - 良かった点・改善点どちらでもOK（良い点を多めに）
   - スピーチの構成（論理展開、話の流れ）についても触れる
3. 1文で今後のアドバイスや励まし
4. 締めの言葉は以下からランダムに選んでください：
  - 「引き続き頑張りましょう🌿」
  - 「次回の提出も楽しみにしております☺️」
  - 「この調子で続けていきましょう！🌱」
  - 「応援しています💪」
${focusSection}

## 文字起こし:
${transcription}

## 出力形式（JSON）:
以下のJSON形式のみを出力してください。マークダウンのコードブロックで囲まず、純粋なJSONのみを返してください。

{
  "corrections": [
    { "original": "元の表現", "corrected": "修正後の表現", "explanation": "なぜこの修正が必要か（日本語で簡潔に）" }
  ],
  "coachComment": "冒頭の褒め＋箇条書きフィードバック＋アドバイス＋締めを全て含む1つの文字列（改行で区切る、日本語）",
  "feedbackText": "文字起こし全体を通した全ての添削ポイントのまとめ。corrections の4つに入りきらなかった改善点も全て含めてください（日本語）"
}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Gemini analysis API error:', errText);
    throw new Error('Gemini analysis failed');
  }

  const data = await response.json();

  // Gemini 2.5 flash is a thinking model - parts may contain thought parts and text parts
  // Find the text part (skip thought parts which have no 'text' field)
  const parts = data.candidates?.[0]?.content?.parts || [];
  let text = '';
  for (const part of parts) {
    if (part.text) {
      text += part.text;
    }
  }
  // Empty response guard
  if (!text || text.trim() === '') {
    console.error('Gemini returned empty text response');
    return {
      corrections: [],
      coachComment: '音声の分析に失敗しました。もう一度お試しください。',
      feedbackText: ''
    };
  }

  console.log('Gemini analysis raw response:', text.substring(0, 500));

  // Extract JSON from response (may be wrapped in ```json ... ```)
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : text;

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  let feedback = {};
  try {
    feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (e) {
    console.error('Failed to parse Gemini JSON:', e.message, 'Raw:', jsonStr.substring(0, 300));
    // Parse failure fallback — show raw text as coach comment
    feedback = {
      corrections: [],
      coachComment: text || 'フィードバックの解析に失敗しました。',
      feedbackText: text || ''
    };
  }

  // Limit corrections to max 4
  if (feedback.corrections && feedback.corrections.length > 4) {
    feedback.corrections = feedback.corrections.slice(0, 4);
  }

  console.log('Parsed feedback:', JSON.stringify(feedback).substring(0, 500));

  return feedback;
}
