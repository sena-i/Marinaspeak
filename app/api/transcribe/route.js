import { NextResponse } from 'next/server';
import { transcribeWithGemini } from '@/lib/api/gemini';
import { validateAudioFile } from '@/lib/utils/fileValidator';
import { parseBuffer } from 'music-metadata';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Module-level cache: reuse the loaded FFmpeg instance across warm Lambda invocations
let ffmpegInstance = null;
let ffmpegLoadPromise = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoadPromise;
}

// Get total audio duration from file metadata (pure JS, works everywhere)
async function getTotalDuration(audioBuffer) {
  try {
    const metadata = await parseBuffer(Buffer.from(audioBuffer));
    return metadata.format.duration ?? null;
  } catch {
    return null;
  }
}

// Calculate speaking duration by removing silence with ffmpeg.wasm
async function getSpeakingDuration(audioBuffer, mimeType) {
  try {
    const ffmpeg = await getFFmpeg();
    let logOutput = '';

    const logHandler = ({ message }) => { logOutput += message + '\n'; };
    ffmpeg.on('log', logHandler);

    const ext = mimeType.includes('mp4') ? '.mp4' : '.mp3';
    const inputName = `input-${Date.now()}${ext}`;

    await ffmpeg.writeFile(inputName, new Uint8Array(audioBuffer));

    try {
      await ffmpeg.exec([
        '-i', inputName,
        '-af', 'silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=-1:stop_silence=0.3:stop_threshold=-40dB:detection=peak',
        '-f', 'null', 'output'
      ]);
    } catch {
      // ffmpeg may exit non-zero; still parse whatever logs we got
    }

    await ffmpeg.deleteFile(inputName).catch(() => {});
    ffmpeg.off('log', logHandler);

    // Parse speaking duration from ffmpeg progress output
    const timeMatches = logOutput.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
    if (timeMatches && timeMatches.length > 0) {
      const lastMatch = timeMatches[timeMatches.length - 1];
      const parts = lastMatch.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (parts) {
        const duration = parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseFloat(parts[3]);
        if (duration > 0) return duration;
      }
    }

    // Fallback: total file duration from ffmpeg input info
    const durationMatch = logOutput.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (durationMatch) {
      const totalDuration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
      return totalDuration > 0 ? totalDuration : null;
    }

    return null;
  } catch (err) {
    console.error('ffmpeg.wasm error:', err.message);
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

    // Run transcription, silence-based duration, and total duration in parallel
    const [transcription, speakingDuration, totalDuration] = await Promise.all([
      transcribeWithGemini(base64Audio, mimeTypeForGemini),
      getSpeakingDuration(arrayBuffer, mimeTypeForGemini),
      getTotalDuration(arrayBuffer)
    ]);

    return NextResponse.json({
      success: true,
      transcription: transcription.text,
      duration: transcription.duration,
      speakingDuration,
      totalDuration  // reliable fallback when speakingDuration is null
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error.message },
      { status: 500 }
    );
  }
}
