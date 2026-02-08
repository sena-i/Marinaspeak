import { NextResponse } from 'next/server';
import { getSessionsByStudent } from '@/lib/db/supabase';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const date = searchParams.get('date');

    if (!studentId) {
      return NextResponse.json(
        { error: 'studentId is required' },
        { status: 400 }
      );
    }

    const sessions = await getSessionsByStudent(studentId, date);

    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to get sessions', details: error.message },
      { status: 500 }
    );
  }
}
