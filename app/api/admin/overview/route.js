import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/adminAuth';
import { getOverview } from '@/lib/db/supabase';

export async function GET(request) {
  const authError = await withAdminAuth(request);
  if (authError) return authError;

  try {
    const overview = await getOverview();
    return NextResponse.json({ success: true, ...overview });
  } catch (error) {
    console.error('Get overview error:', error);
    return NextResponse.json(
      { error: 'Failed to get overview', details: error.message },
      { status: 500 }
    );
  }
}
