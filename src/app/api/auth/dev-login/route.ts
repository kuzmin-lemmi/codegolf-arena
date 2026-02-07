// src/app/api/auth/dev-login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { devLogin } from '@/lib/auth';
import { isDevLoginAllowed, validateMutationRequest } from '@/lib/security';

const SESSION_COOKIE_NAME = 'arena_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 дней

// Только для разработки! Позволяет войти без Stepik OAuth
export async function POST(request: NextRequest) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  if (!isDevLoginAllowed(request)) {
    return NextResponse.json(
      { success: false, error: 'Dev login is disabled' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { stepikUserId } = body;

    if (!stepikUserId || typeof stepikUserId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'stepikUserId is required' },
        { status: 400 }
      );
    }

    const { user, token } = await devLogin(stepikUserId);

    const response = NextResponse.json({
      success: true,
      data: user,
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: false, // dev mode
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Dev login error:', error);
    return NextResponse.json(
      { success: false, error: 'Dev login failed' },
      { status: 500 }
    );
  }
}
