import { NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/db/supabase';

export async function withAdminAuth(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authorization token required' },
      { status: 401 }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const isValid = await validateAdminToken(token);

  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  return null;
}
