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

// Silence-removed speaking duration via ffmpeg (runs inside Vercel Lambda).
// Uses silenceremove filter; parses the final time= timestamp which equals
// the output duration after silence removal — same logic as the working server.
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
    const cmd = `"${ffmpegPath}" -i "${tmpPath}" -af "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=-1:stop_silence=0.3:stop_threshold=-40dB:detection=peak" -f null - 2>&1`;
    exec(cmd, { timeout: 25000 }, async (error, stdout, stderr) => {
      await unlink(tmpPath).catch(() => {});
      const output = (stdout || '') + (stderr || '');

      // Last time= in progress output = duration of silence-removed audio
      const timeMatches = output.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
      if (timeMatches?.length > 0) {
        const parts = timeMatches[timeMatches.length - 1].match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (parts) {
          const duration = parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseFloat(parts[3]);
          if (duration > 0) return resolve(duration);
        }
      }

      // Fallback: total file duration from header
      const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
        const total = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
        return resolve(total > 0 ? total : null);
      }

      resolve(null);
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
