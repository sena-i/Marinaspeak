import { NextResponse } from 'next/server';
import { saveSession, uploadAudio } from '@/lib/db/supabase';
import getSupabase from '@/lib/db/supabase';

export async function POST(request) {
  try {
    const formData = await request.formData();

    const studentId = formData.get('studentId');
    const transcription = formData.get('transcription');

    if (!studentId || !transcription) {
      return NextResponse.json(
        { error: 'studentId and transcription are required' },
        { status: 400 }
      );
    }

    // Parse JSON fields
    let corrections = [];
    let fullCorrections = [];
    let coachComment = null;
    try {
      const correctionsStr = formData.get('corrections');
      if (correctionsStr) corrections = JSON.parse(correctionsStr);
    } catch {}
    try {
      const fullCorrectionsStr = formData.get('fullCorrections');
      if (fullCorrectionsStr) fullCorrections = JSON.parse(fullCorrectionsStr);
    } catch {}
    try {
      const coachCommentStr = formData.get('coachComment');
      if (coachCommentStr) coachComment = JSON.parse(coachCommentStr);
    } catch {}

    // Save session first to get the session ID
    const session = await saveSession({
      studentId,
      transcription,
      wordCount: parseInt(formData.get('wordCount')) || 0,
      durationSeconds: parseFloat(formData.get('durationSeconds')) || null,
      speakingDuration: parseFloat(formData.get('speakingDuration')) || null,
      wpm: parseInt(formData.get('wpm')) || null,
      corrections,
      fullCorrections,
      coachComment,
      feedbackText: formData.get('feedbackText') || null,
      focusPoints: formData.get('focusPoints') || null,
      audioFileName: formData.get('audioFileName') || null,
      audioMimeType: formData.get('audioMimeType') || null
    });

    // Upload audio file if present
    const audioFile = formData.get('audioFile');
    if (audioFile && audioFile.size > 0) {
      try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const audioFilePath = await uploadAudio(studentId, session.id, buffer, audioFile.type);

        // Update session with audio file path
        await getSupabase()
          .from('sessions')
          .update({ audio_file_path: audioFilePath })
          .eq('id', session.id);
      } catch (audioError) {
        console.error('Audio upload failed (session saved without audio):', audioError.message);
      }
    }

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save session', details: error.message },
      { status: 500 }
    );
  }
}
