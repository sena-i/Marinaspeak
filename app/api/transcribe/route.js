import { NextResponse } from 'next/server';
import { transcribeWithGemini } from '@/lib/api/gemini';
import { validateAudioFile } from '@/lib/utils/fileValidator';
import { parseBuffer } from 'music-metadata';
import ffmpegPath from 'ffmpeg-static';
import { exec } from 'child_process';
import { writeFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Silence-removed speaking duration via ffmpeg (runs inside Vercel Lambda).
// Uses silenceremove filter; parses the final time= timestamp which equals
// the output duration after silence removal — same logic as the working server.
async function getSpeakingDuration(audioBuffer, mimeType) {
  console.log('[ffmpeg] path:', ffmpegPath);
  console.log('[ffmpeg] exists:', ffmpegPath ? existsSync(ffmpegPath) : false);
  if (!ffmpegPath || !existsSync(ffmpegPath)) return null;
  const ext = mimeType.includes('mp4') ? '.mp4' : '.mp3';
  const tmpPath = join(os.tmpdir(), `audio-${Date.now()}${ext}`);

  try {
    await writeFile(tmpPath, Buffer.from(audioBuffer));
  } catch {
    return null;
  }

  // Output silence-removed audio as raw PCM → duration = fileSize / bytesPerSec
  // Avoids relying on ffmpeg progress output which is suppressed in non-TTY envs.
  const SAMPLE_RATE = 8000;
  const BYTES_PER_SEC = SAMPLE_RATE * 2; // 16-bit mono
  const outPath = join(os.tmpdir(), `speaking-${Date.now()}.raw`);

  return new Promise((resolve) => {
    const cmd = `"${ffmpegPath}" -y -i "${tmpPath}" -af "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=1:stop_silence=0.3:stop_threshold=-40dB:detection=peak" -f s16le -ar ${SAMPLE_RATE} -ac 1 "${outPath}"`;
    exec(cmd, { timeout: 30000 }, async (error) => {
      await unlink(tmpPath).catch(() => {});
      if (error) {
        console.log('[ffmpeg] exec error:', error.message);
        await unlink(outPath).catch(() => {});
        return resolve(null);
      }
      try {
        const { size } = await stat(outPath);
        await unlink(outPath).catch(() => {});
        const duration = size / BYTES_PER_SEC;
        console.log('[ffmpeg] speaking duration:', duration);
        resolve(duration > 0 ? duration : null);
      } catch (e) {
        console.log('[ffmpeg] stat error:', e.message);
        resolve(null);
      }
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
