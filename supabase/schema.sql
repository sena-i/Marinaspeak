-- Speakalize Database Schema
-- Run this in Supabase SQL Editor to set up the database

-- Students table
CREATE TABLE students (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_students_student_id ON students(student_id);

-- Sessions table
CREATE TABLE sessions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        TEXT NOT NULL REFERENCES students(student_id),
  session_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  transcription     TEXT NOT NULL,
  word_count        INTEGER NOT NULL DEFAULT 0,
  duration_seconds  NUMERIC(10,2),
  speaking_duration NUMERIC(10,2),
  wpm               INTEGER,
  corrections       JSONB DEFAULT '[]'::JSONB,
  coach_comment     TEXT,
  feedback_text     TEXT,
  focus_points      TEXT,
  audio_file_name   TEXT,
  audio_mime_type   TEXT,
  audio_file_path   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_student_id ON sessions(student_id);
CREATE INDEX idx_sessions_date ON sessions(session_date);
CREATE INDEX idx_sessions_student_date ON sessions(student_id, session_date DESC);

-- Admin tokens table
CREATE TABLE admin_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  label       TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

-- To generate an admin token, run in a terminal:
--   node -e "const t='your-secret-token'; const h=require('crypto').createHash('sha256').update(t).digest('hex'); console.log(h)"
-- Then insert the hash:
--   INSERT INTO admin_tokens (token_hash, label) VALUES ('the-hash-output', 'Teacher Name');

-- Migration from old schema (if tables already exist):
-- ALTER TABLE sessions DROP COLUMN IF EXISTS grammar_score;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS structure_score;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS errors;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS suggestions;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS summary;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS corrections JSONB DEFAULT '[]'::JSONB;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS coach_comment TEXT;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS feedback_text TEXT;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS speaking_duration NUMERIC(10,2);
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS focus_points TEXT;

-- Migration v2: Add audio storage support
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS audio_file_path TEXT;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false);

-- Migration v3: Add full corrections for admin (all corrections, uncapped)
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS full_corrections JSONB DEFAULT '[]'::JSONB;
