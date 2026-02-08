import { NextResponse } from 'next/server';
import { saveSession } from '@/lib/db/supabase';

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.studentId || !body.transcription) {
      return NextResponse.json(
        { error: 'studentId and transcription are required' },
        { status: 400 }
      );
    }

    const session = await saveSession({
      studentId: body.studentId,
      transcription: body.transcription,
      wordCount: body.wordCount || 0,
      durationSeconds: body.durationSeconds || null,
      speakingDuration: body.speakingDuration || null,
      wpm: body.wpm || null,
      corrections: body.corrections || [],
      coachComment: body.coachComment || null,
      feedbackText: body.feedbackText || null,
      focusPoints: body.focusPoints || null,
      audioFileName: body.audioFileName || null,
      audioMimeType: body.audioMimeType || null
    });

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save session', details: error.message },
      { status: 500 }
    );
  }
}
