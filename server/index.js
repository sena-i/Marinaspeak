const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { writeFile, unlink } = require('fs/promises');
const path = require('path');
const os = require('os');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/speaking-duration', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });

  const ext = req.file.mimetype.includes('mp4') ? '.mp4' : '.mp3';
  const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}${ext}`);

  try {
    await writeFile(tmpPath, req.file.buffer);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write temp file' });
  }

  const cmd = `"${ffmpegPath}" -i "${tmpPath}" -af "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-40dB:detection=peak,silenceremove=stop_periods=-1:stop_silence=0.3:stop_threshold=-40dB:detection=peak" -f null - 2>&1`;

  exec(cmd, { timeout: 25000 }, async (error, stdout, stderr) => {
    await unlink(tmpPath).catch(() => {});

    const output = (stdout || '') + (stderr || '');

    const timeMatches = output.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
    if (timeMatches?.length > 0) {
      const last = timeMatches[timeMatches.length - 1];
      const parts = last.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (parts) {
        const duration = parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseFloat(parts[3]);
        if (duration > 0) return res.json({ speakingDuration: duration });
      }
    }

    // Fallback: total file duration
    const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (durationMatch) {
      const total = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
      return res.json({ speakingDuration: total > 0 ? total : null });
    }

    res.json({ speakingDuration: null });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ffmpeg server running on port ${PORT}`));
