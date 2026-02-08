import { createClient } from '@supabase/supabase-js';

let _supabase;

function getSupabase() {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    _supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabase;
}

export async function registerStudent(studentId, displayName) {
  const { data: existing } = await getSupabase()
    .from('students')
    .select('*')
    .eq('student_id', studentId)
    .single();

  if (existing) {
    return { student: existing, isNew: false };
  }

  const { data, error } = await getSupabase()
    .from('students')
    .insert({ student_id: studentId, display_name: displayName || null })
    .select()
    .single();

  if (error) throw new Error(`Failed to register student: ${error.message}`);

  return { student: data, isNew: true };
}

export async function saveSession(sessionData) {
  const { data, error } = await getSupabase()
    .from('sessions')
    .insert({
      student_id: sessionData.studentId,
      transcription: sessionData.transcription,
      word_count: sessionData.wordCount,
      duration_seconds: sessionData.durationSeconds,
      speaking_duration: sessionData.speakingDuration,
      wpm: sessionData.wpm,
      corrections: sessionData.corrections || [],
      coach_comment: sessionData.coachComment || null,
      feedback_text: sessionData.feedbackText || null,
      focus_points: sessionData.focusPoints || null,
      audio_file_name: sessionData.audioFileName || null,
      audio_mime_type: sessionData.audioMimeType || null
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save session: ${error.message}`);

  return data;
}

export async function getSessionsByStudent(studentId, date) {
  let query = getSupabase()
    .from('sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (date) {
    query = query.eq('session_date', date);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get sessions: ${error.message}`);

  return data || [];
}

export async function getAllStudents() {
  const { data, error } = await getSupabase()
    .from('students')
    .select(`
      student_id,
      display_name,
      created_at,
      sessions (
        id,
        session_date,
        wpm,
        created_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get students: ${error.message}`);

  return (data || []).map(student => {
    const sessions = student.sessions || [];
    const totalSessions = sessions.length;
    const wpmSessions = sessions.filter(s => s.wpm != null);
    const avgWpm = wpmSessions.length > 0
      ? Math.round(wpmSessions.reduce((sum, s) => sum + s.wpm, 0) / wpmSessions.length)
      : null;
    const latestSession = sessions.length > 0
      ? sessions.reduce((latest, s) => s.created_at > latest.created_at ? s : latest)
      : null;

    return {
      student_id: student.student_id,
      display_name: student.display_name,
      created_at: student.created_at,
      total_sessions: totalSessions,
      avg_wpm: avgWpm,
      latest_session_date: latestSession?.session_date || null
    };
  });
}

export async function getStudentSessions(studentId, from, to) {
  let query = getSupabase()
    .from('sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (from) {
    query = query.gte('session_date', from);
  }
  if (to) {
    query = query.lte('session_date', to);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get student sessions: ${error.message}`);

  return data || [];
}

export async function getStudentProgress(studentId) {
  const { data, error } = await getSupabase()
    .from('sessions')
    .select('session_date, wpm')
    .eq('student_id', studentId)
    .order('session_date', { ascending: true });

  if (error) throw new Error(`Failed to get progress: ${error.message}`);

  const grouped = {};
  for (const session of (data || [])) {
    const date = session.session_date;
    if (!grouped[date]) {
      grouped[date] = { wpms: [], count: 0 };
    }
    grouped[date].wpms.push(session.wpm || 0);
    grouped[date].count++;
  }

  return Object.entries(grouped).map(([date, g]) => ({
    date,
    avgWpm: Math.round(g.wpms.reduce((a, b) => a + b, 0) / g.count),
    sessionCount: g.count
  }));
}

export async function getOverview() {
  const { data: students } = await getSupabase()
    .from('students')
    .select('student_id');

  const { data: sessions } = await getSupabase()
    .from('sessions')
    .select('wpm, session_date, student_id');

  const totalStudents = students?.length || 0;
  const totalSessions = sessions?.length || 0;

  const wpmSessions = (sessions || []).filter(s => s.wpm != null);
  const classAvgWpm = wpmSessions.length > 0
    ? Math.round(wpmSessions.reduce((sum, s) => sum + s.wpm, 0) / wpmSessions.length)
    : null;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekStr = oneWeekAgo.toISOString().split('T')[0];

  const activeThisWeek = new Set(
    (sessions || [])
      .filter(s => s.session_date >= weekStr)
      .map(s => s.student_id)
  ).size;

  return {
    totalStudents,
    totalSessions,
    classAvgWpm,
    activeStudentsThisWeek: activeThisWeek
  };
}

export async function validateAdminToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: result } = await getSupabase()
    .from('admin_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .single();

  if (!result) return false;

  if (result.expires_at && new Date(result.expires_at) < new Date()) {
    return false;
  }

  return true;
}

export default getSupabase;
