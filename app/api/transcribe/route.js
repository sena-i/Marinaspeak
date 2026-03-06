import { NextResponse } from 'next/server';
import { transcribeWithGemini } from '@/lib/api/gemini';
import { validateAudioFile } from '@/lib/utils/fileValidator';
import { parseBuffer } from 'music-metadata';
import ffmpegPath from 'ffmpeg-static';
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Silence-removed speaking duration via ffmpeg (runs inside Vercel Lambda)
async function getSpeakingDuration(audioBuffer, mimeType) {
  if (!ffmpegPath) return null;
  const ext = mimeType.includes('mp4') ? '.mp4' : '.mp3';
  const tmpPath = join(os.tmpdir(), `audio-${Date.now()}${ext}`);

  try {
    await writeFile(tmpPath, Buffer.from(audioBuffer));
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const cmd = `"${ffmpegPath}" -i "${tmpPath}" -af "silencedetect=noise=-40dB:d=0.3" -f null - 2>&1`;
    exec(cmd, { timeout: 25000 }, async (error, stdout, stderr) => {
      await unlink(tmpPath).catch(() => {});
      const output = (stdout || '') + (stderr || '');

      const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (!durMatch) return resolve(null);
      const total = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);

      let silenceTotal = 0;
      for (const m of output.matchAll(/silence_duration:\s*([\d.]+)/g)) {
        silenceTotal += parseFloat(m[1]);
      }

      resolve(Math.max(0, total - silenceTotal));
    });
  });
}

// Total duration fallback via pure-JS metadata parsing
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
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const validation = validateAudioFile(audioFile);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join(', ') }, { status: 400 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    let mimeTypeForGemini = audioFile.type;
    if (mimeTypeForGemini === 'audio/x-m4a' || mimeTypeForGemini === 'audio/m4a') {
      mimeTypeForGemini = 'audio/mp4';
    }

    const [transcription, speakingDuration, totalDuration] = await Promise.all([
      transcribeWithGemini(base64Audio, mimeTypeForGemini),
      getSpeakingDuration(arrayBuffer, mimeTypeForGemini),
      getTotalDuration(arrayBuffer)
    ]);

    return NextResponse.json({
      success: true,
      transcription: transcription.text,
      speakingDuration,  // ffmpeg silence-removed (null if ffmpeg unavailable)
      totalDuration      // last-resort fallback
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error.message },
      { status: 500 }
    );
  }
}
