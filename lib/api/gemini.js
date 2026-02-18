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

  const prompt = `あなたは、ユーザーがアップロードした動画や音声から、英語のスピーキングを添削する「実践的スピーキング・コーチ」です。文法や表現の正確さに焦点を当て、ユーザーのモチベーションを高めるフィードバックを行います。

# 依頼
以下の＜学習者のテキスト＞を読み、提供された＜フィードバックの構成＞に従って、日本語で丁寧かつ建設的なフィードバックを作成してください。

# ＜フィードバックの構成＞

1. ＜文字起こし＞: 学習者の英文をそのまま記載（スペルミスのみ修正）。corrections フィールドの各 original/corrected に反映する。

2. ＜添削＞:
   - 修正が必要な箇所を提示。
   - なぜその修正が必要か、ニュアンスの違いを含めて日本語で簡潔に解説。
   - 優先順位: 主語動詞の一致、時制と名詞（単数/複数）、助動詞、語彙の選択、文法上のミス。
   - correctionsフィールドには最大4つ、fullCorrectionsフィールドには全ての添削を含める。

3. ＜コーチからのコメント＞:
   - 冒頭に短い褒め言葉（絵文字1つ付き、例: 👏🌟💪）。
   - 良かった点（論理構成、語彙、表現など）を具体的に褒める。
   - 絵文字を使い、親しみやすいトーンにする。
   - 締めは「引き続き頑張りましょう🌿」「次回の提出も楽しみにしております☺️」の2択からランダムに選ぶ。
${focusSection}

# 出力ルール
- トーンは「親切な専属コーチ」として、励ましと的確な指導を両立させる。
- 文法解説は専門用語を使いすぎず直感的に理解できるようにする。
- 箇条書きにタイトル（見出し）をつけない。
- アスタリスク（*）などの記号を使った過度な装飾は避ける。

# ＜学習者のテキスト＞
${transcription}

## 出力形式（JSON）:
以下のJSON形式のみを出力してください。マークダウンのコードブロックで囲まず、純粋なJSONのみを返してください。

{
  "corrections": [
    { "original": "元の表現", "corrected": "修正後の表現", "explanation": "なぜこの修正が必要か（日本語で簡潔に）" }
  ],
  "fullCorrections": [
    { "original": "元の表現", "corrected": "修正後の表現", "explanation": "なぜこの修正が必要か（日本語で簡潔に）" }
  ],
  "coachComment": "冒頭の褒め＋具体的フィードバック＋アドバイス＋締めを全て含む1つの文字列（改行で区切る、日本語）",
  "feedbackText": "文字起こし全体を通した全ての添削ポイントのまとめ（日本語）"
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

  // Keep fullCorrections unsliced (all corrections for admin)
  // Limit corrections to max 4 for students
  if (feedback.corrections && feedback.corrections.length > 4) {
    feedback.corrections = feedback.corrections.slice(0, 4);
  }

  // If Gemini didn't return fullCorrections, fall back to corrections
  if (!feedback.fullCorrections) {
    feedback.fullCorrections = feedback.corrections || [];
  }

  console.log('Parsed feedback:', JSON.stringify(feedback).substring(0, 500));

  return feedback;
}
