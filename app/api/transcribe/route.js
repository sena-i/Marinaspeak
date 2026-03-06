import { NextResponse } from 'next/server';
import { transcribeWithGemini } from '@/lib/api/gemini';
import { validateAudioFile } from '@/lib/utils/fileValidator';
import { parseBuffer } from 'music-metadata';
import ffmpegPath from 'ffmpeg-static';
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Speaking duration via ffmpeg silencedetect: total - sum(silence_durations).
// Uses -f null (no output file), parses Duration: and silence_duration: from stderr.
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

  return new Promise((resolve) => {
    // 2>&1 merges stderr into stdout so exec captures it all in the stdout arg
    const cmd = `"${ffmpegPath}" -y -i "${tmpPath}" -af "silencedetect=noise=-30dB:duration=0.5" -f null - 2>&1`;
    exec(cmd, { timeout: 30000 }, async (error, stdout) => {
      await unlink(tmpPath).catch(() => {});

      // Parse total duration from "Duration: HH:MM:SS.ss"
      const durMatch = stdout.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (!durMatch) {
        console.log('[ffmpeg] no Duration in output, stdout len:', stdout.length);
        return resolve(null);
      }
      const totalDuration = parseInt(durMatch[1]) * 3600
                          + parseInt(durMatch[2]) * 60
                          + parseFloat(durMatch[3]);

      // Only subtract leading and trailing silence (not mid-speech pauses).
      const startTimes = [...stdout.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
      const endTimes   = [...stdout.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
      const durations  = [...stdout.matchAll(/silence_duration:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
      console.log('[ffmpeg] silence intervals:', startTimes.map((s, i) => `${s.toFixed(1)}→${endTimes[i]?.toFixed(1) ?? 'EOF'}`).join(', ') || 'none');

      let silenceToSubtract = 0;
      // Leading: first silence interval starts at ~0
      if (startTimes.length > 0 && startTimes[0] < 0.5) {
        silenceToSubtract += durations[0] ?? 0;
      }
      // Trailing: if stream ended during silence, silence_end is never emitted.
      // Detect as unmatched silence_start at the end of the file.
      if (startTimes.length > endTimes.length) {
        // Last silence_start has no matching end — audio ended while silent
        const lastStart = startTimes[startTimes.length - 1];
        silenceToSubtract += totalDuration - lastStart;
      } else if (endTimes.length > 0 && totalDuration - endTimes[endTimes.length - 1] < 1.0) {
        // Last silence_end is very close to total duration
        silenceToSubtract += durations[durations.length - 1] ?? 0;
      }

      const speaking = totalDuration - silenceToSubtract;
      console.log('[ffmpeg] total:', totalDuration, 'trimmed silence:', silenceToSubtract, 'speaking:', speaking);
      resolve(speaking > 0 ? speaking : null);
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
