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
            text: 'Transcribe this audio file and measure the net speaking duration. Return valid JSON only (no markdown, no explanation):\n{"transcription":"<all spoken words verbatim>","speaking_seconds":<number: total seconds of actual speech, excluding silent pauses longer than 0.3 seconds>}'
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

  // Gemini 2.5 flash thinking model - concatenate all text parts (skip thought parts)
  const parts = data.candidates?.[0]?.content?.parts || [];
  let raw = '';
  for (const part of parts) {
    if (part.text) raw += part.text;
  }

  // Extract JSON object from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: (parsed.transcription || '').trim(),
        duration: typeof parsed.speaking_seconds === 'number' ? parsed.speaking_seconds : null
      };
    } catch {
      // JSON parse failed — fall through to plain text fallback
    }
  }

  // Fallback: treat entire response as plain transcription
  return {
    text: raw.trim(),
    duration: null
  };
}

function normalizeNewSchemaToLegacy(raw, transcription) {
  const keyCorrections = raw?.student_view?.key_corrections || [];
  const coachComment = raw?.student_view?.coach_comment || '';

  const corrections = Array.isArray(keyCorrections)
    ? keyCorrections
      .filter(Boolean)
      .slice(0, 4)
      .map((c) => ({
        original: c.original || '',
        corrected: c.revised || '',
        explanation: c.explanation || ''
      }))
    : [];

  const fullFeedback = raw?.admin_view?.full_feedback || {};
  const feedbackText = [
    fullFeedback.structure,
    fullFeedback.content,
    fullFeedback.improvement_points,
    fullFeedback.recurring_mistakes
  ].filter(Boolean).join('\n\n');

  return {
    corrections,
    fullCorrections: corrections,
    goodPoints: '',
    coachComment,
    closing: '',
    repeatedMistakes: fullFeedback.recurring_mistakes || null,
    feedbackText,
    revisedTranscript: raw?.admin_view?.revised_transcript || transcription,
    meta: {
      word_count: raw?.meta?.word_count || 0,
      // WPM is calculated in app/server using ffmpeg speakingDuration.
      wpm: 0
    },
    structuredFeedback: raw
  };
}

export async function analyzeWithGemini(transcription, focusPoints) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  let focusSection = '';
  if (focusPoints && focusPoints.trim()) {
    focusSection = `\n\n## 特に意識してフィードバックしてほしいポイント:\n${focusPoints.trim()}\n上記のポイントについて、full_feedback.improvement_points に優先して反映してください。`;
  }

  const prompt = `# Role
あなたは、英語学習者のための「専属実践的スピーキング・コーチ」です。
ユーザーの英語スピーキング（Transcript）を分析し、文法・表現の正確さと論理構成を指導してください。
トーンは親しみやすく、かつプロフェッショナルで、「褒めて伸ばす」スタイルを維持してください。

# Task
提供された Transcript を基に、以下のJSONフォーマットに従ってデータを出力してください。
出力は純粋なJSONのみとし、Markdownコードブロックや余計な説明文は含めないでください。

# Input Data
- Transcript: ${transcription}
${focusSection}

# JSON Output Format Structure
{
  "meta": {
    "word_count": Integer,
    "wpm": Integer
  },
  "student_view": {
    "key_corrections": [
      {
        "original": "String",
        "revised": "String",
        "explanation": "String"
      }
    ],
    "coach_comment": "String"
  },
  "admin_view": {
    "full_feedback": {
      "structure": "String",
      "content": "String",
      "improvement_points": "String",
      "recurring_mistakes": "String"
    },
    "revised_transcript": "String"
  }
}

# Content Requirements
## 1. key_corrections
- 最大4つまで。
- 優先順位: 主語動詞の一致 > 時制 > 語彙選択 > その他。
- explanation は日本語で簡潔に。

## 2. coach_comment
- 日本語で約200〜250文字。改行なしの1つの文字列として出力する。
- 構成（すべて連続したテキスト、区切り文字なし）: 具体的な褒め言葉（絵文字を1つ） + 最重要改善ポイント1つ + 締めの一文。
- 締めの一文は必ず以下のいずれか:
  - 引き続き頑張りましょう🌿
  - 次回の提出も楽しみにしております☺️

## 3. meta
- word_count は Transcript の語数（整数）。
- wpm はこのJSONでは必ず 0 を返す（WPMはアプリ側で ffmpeg を使って計算するため）。

## 4. admin_view.full_feedback
- structure: 論理構成
- content: 内容の具体性・説得力
- improvement_points: 改善ポイント
- recurring_mistakes: 繰り返しミス（なければ「なし」）

## 5. admin_view.revised_transcript
- 元の意図を保持して全文を自然で正確な英語に修正。

# Output Rules
- JSON以外は一切出力しない。
- 必須キーをすべて埋める。
- 型（数値/文字列/配列）を厳守する。`;

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
      fullCorrections: [],
      goodPoints: '',
      coachComment: '音声の分析に失敗しました。もう一度お試しください。',
      closing: '',
      repeatedMistakes: null,
      feedbackText: ''
    };
  }

  console.log('Gemini analysis raw response:', text.substring(0, 500));

  // Extract JSON from response (may be wrapped in ```json ... ```)
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : text;

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  let raw = {};
  try {
    raw = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (e) {
    console.error('Failed to parse Gemini JSON:', e.message, 'Raw:', jsonStr.substring(0, 300));
    return {
      corrections: [],
      fullCorrections: [],
      goodPoints: '',
      coachComment: text || 'フィードバックの解析に失敗しました。',
      closing: '',
      repeatedMistakes: null,
      feedbackText: text || ''
    };
  }

  const feedback = normalizeNewSchemaToLegacy(raw, transcription);

  console.log('Parsed feedback:', JSON.stringify(feedback).substring(0, 500));

  return feedback;
}
