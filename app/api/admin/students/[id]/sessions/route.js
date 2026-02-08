import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/adminAuth';
import { getStudentSessions } from '@/lib/db/supabase';

export async function GET(request, { params }) {
  const authError = await withAdminAuth(request);
  if (authError) return authError;

  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const sessions = await getStudentSessions(id, from, to);

    const wpmSessions = sessions.filter(s => s.wpm != null);
    const stats = {
      totalSessions: sessions.length,
      avgWpm: wpmSessions.length > 0
        ? Math.round(wpmSessions.reduce((sum, s) => sum + s.wpm, 0) / wpmSessions.length)
        : null
    };

    return NextResponse.json({ success: true, sessions, stats });
  } catch (error) {
    console.error('Get student sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to get sessions', details: error.message },
      { status: 500 }
    );
  }
}
