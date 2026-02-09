import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/adminAuth';
import { getAudioUrl } from '@/lib/db/supabase';

export async function GET(request) {
  const authError = await withAdminAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'path parameter is required' }, { status: 400 });
    }

    const signedUrl = await getAudioUrl(filePath);

    return NextResponse.json({ success: true, url: signedUrl });
  } catch (error) {
    console.error('Get audio URL error:', error);
    return NextResponse.json(
      { error: 'Failed to get audio URL', details: error.message },
      { status: 500 }
    );
  }
}
