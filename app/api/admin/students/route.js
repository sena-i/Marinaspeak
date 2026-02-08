import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/adminAuth';
import { getAllStudents } from '@/lib/db/supabase';

export async function GET(request) {
  const authError = await withAdminAuth(request);
  if (authError) return authError;

  try {
    const students = await getAllStudents();
    return NextResponse.json({ success: true, students });
  } catch (error) {
    console.error('Get students error:', error);
    return NextResponse.json(
      { error: 'Failed to get students', details: error.message },
      { status: 500 }
    );
  }
}
