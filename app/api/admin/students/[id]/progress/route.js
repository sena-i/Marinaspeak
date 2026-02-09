import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/adminAuth';
import { getStudentProgress } from '@/lib/db/supabase';

export async function GET(request, { params }) {
  const authError = await withAdminAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const progress = await getStudentProgress(id);

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    console.error('Get progress error:', error);
    return NextResponse.json(
      { error: 'Failed to get progress', details: error.message },
      { status: 500 }
    );
  }
}
