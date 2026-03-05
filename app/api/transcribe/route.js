import { NextResponse } from 'next/server';
import { transcribeWithGemini } from '@/lib/api/gemini';
import { validateAudioFile } from '@/lib/utils/fileValidator';
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Get ffmpeg binary path (ffmpeg-static only, no system fallback on serverless)
function getFFmpegPath() {
  try {
    const ffmpegPath = require('ffmpeg-static');
    return ffmpegPath || null;
  } catch {
    return null;
  }
}

// Calculate speaking duration by removing silence with ffmpeg
// Returns null on Vercel/serverless where ffmpeg is unavailable (WPM uses audioDuration fallback)
async function getSpeakingDuration(audioBuffer, mimeType) {
  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) {
    // ffmpeg not available (e.g. Vercel serverless) — skip silently
    return null;
  }

  const ext = mimeType.includes('mp4') ? '.mp4' : '.mp3';
  const tmpPath = path.join(os.tmpdir(), `speakalize-${Date.now()}${ext}`);

  try {
    await writeFile(tmpPath, Buffer.from(audioBuffer));

    return new Promise((resolve) => {
      const cmd = `"${ffmpegPath}" -i "${tmpPath}" -af "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=-1:stop_silence=0.3:stop_threshold=-40dB:detection=peak" -f null - 2>&1`;

      exec(cmd, { timeout: 15000 }, async (error, stdout, stderr) => {
        await unlink(tmpPath).catch(() => {});
        const output = (stdout || '') + (stderr || '');
        // Find the last time= value in ffmpeg output
        const timeMatches = output.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
        if (timeMatches && timeMatches.length > 0) {
          const lastMatch = timeMatches[timeMatches.length - 1];
          const parts = lastMatch.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (parts) {
            const hours = parseInt(parts[1]);
            const minutes = parseInt(parts[2]);
            const seconds = parseFloat(parts[3]);
            const duration = hours * 3600 + minutes * 60 + seconds;
            resolve(duration > 0 ? duration : null);
            return;
          }
        }
        // Fallback: parse total duration from ffmpeg input info (always present for valid files)
        const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          const totalDuration = hours * 3600 + minutes * 60 + seconds;
          resolve(totalDuration > 0 ? totalDuration : null);
          return;
        }
        resolve(null); // ffmpeg execution failed or parsing failed
      });
    });
  } catch {
    await unlink(tmpPath).catch(() => {});
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

    // Normalize m4a MIME type for Gemini compatibility (Gemini accepts audio/mp4)
    let mimeTypeForGemini = audioFile.type;
    if (mimeTypeForGemini === 'audio/x-m4a' || mimeTypeForGemini === 'audio/m4a') {
      mimeTypeForGemini = 'audio/mp4';
    }

    // Run transcription and speaking duration calculation in parallel
    const [transcription, speakingDuration] = await Promise.all([
      transcribeWithGemini(base64Audio, mimeTypeForGemini),
      getSpeakingDuration(arrayBuffer, mimeTypeForGemini)
    ]);

    return NextResponse.json({
      success: true,
      transcription: transcription.text,
      duration: transcription.duration,
      speakingDuration
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error.message },
      { status: 500 }
    );
  }
}
