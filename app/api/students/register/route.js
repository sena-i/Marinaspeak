import { NextResponse } from 'next/server';
import { registerStudent } from '@/lib/db/supabase';

export async function POST(request) {
  try {
    const { studentId, displayName } = await request.json();

    if (!studentId || typeof studentId !== 'string') {
      return NextResponse.json(
        { error: 'Valid studentId is required' },
        { status: 400 }
      );
    }

    const trimmed = studentId.trim();
    if (trimmed.length < 1 || trimmed.length > 20) {
      return NextResponse.json(
        { error: 'Student ID must be 1-20 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return NextResponse.json(
        { error: 'Student ID must be alphanumeric' },
        { status: 400 }
      );
    }

    const result = await registerStudent(trimmed, displayName);

    return NextResponse.json({
      success: true,
      student: result.student,
      isNew: result.isNew
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed', details: error.message },
      { status: 500 }
    );
  }
}
