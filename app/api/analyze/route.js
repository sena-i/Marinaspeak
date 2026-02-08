import { NextResponse } from 'next/server';
import { analyzeWithGemini } from '@/lib/api/gemini';

export async function POST(request) {
  try {
    const { transcription, focusPoints } = await request.json();

    if (!transcription) {
      return NextResponse.json(
        { error: 'No transcription provided' },
        { status: 400 }
      );
    }

    const feedback = await analyzeWithGemini(transcription, focusPoints || '');

    return NextResponse.json({
      success: true,
      feedback
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    );
  }
}
