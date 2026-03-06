import { NextResponse } from 'next/server';
import { transcribeWithGemini } from '@/lib/api/gemini';
import { validateAudioFile } from '@/lib/utils/fileValidator';
import { parseBuffer } from 'music-metadata';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Server-side total duration via pure-JS metadata parsing (last-resort fallback)
async function getTotalDuration(audioBuffer) {
  try {
    const metadata = await parseBuffer(Buffer.from(audioBuffer));
    return metadata.format.duration ?? null;
  } catch {
    return null;
  }
}


export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const validation = validateAudioFile(audioFile);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors.join(', ') },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    // Normalize m4a MIME type for Gemini compatibility
    let mimeTypeForGemini = audioFile.type;
    if (mimeTypeForGemini === 'audio/x-m4a' || mimeTypeForGemini === 'audio/m4a') {
      mimeTypeForGemini = 'audio/mp4';
    }

    const [transcription, totalDuration] = await Promise.all([
      transcribeWithGemini(base64Audio, mimeTypeForGemini),
      getTotalDuration(arrayBuffer)
    ]);

    return NextResponse.json({
      success: true,
      transcription: transcription.text,
      totalDuration  // used for WPM when client-side speaking duration unavailable
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error.message },
      { status: 500 }
    );
  }
}
