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

// Call the dedicated ffmpeg server (Railway) for silence-removed speaking duration
async function getServerSpeakingDuration(audioBuffer, mimeType) {
  const apiUrl = process.env.SPEAKING_DURATION_API_URL;
  if (!apiUrl) return null;

  try {
    const formData = new FormData();
    const ext = mimeType.includes('mp4') ? '.mp4' : '.mp3';
    formData.append('audio', new Blob([audioBuffer], { type: mimeType }), `audio${ext}`);

    const response = await fetch(`${apiUrl}/speaking-duration`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.speakingDuration ?? null;
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

    const [transcription, speakingDuration, totalDuration] = await Promise.all([
      transcribeWithGemini(base64Audio, mimeTypeForGemini),
      getServerSpeakingDuration(arrayBuffer, mimeTypeForGemini),
      getTotalDuration(arrayBuffer)
    ]);

    return NextResponse.json({
      success: true,
      transcription: transcription.text,
      duration: transcription.duration,
      speakingDuration,  // from ffmpeg server (null if unavailable)
      totalDuration      // always available, last-resort fallback
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error.message },
      { status: 500 }
    );
  }
}
