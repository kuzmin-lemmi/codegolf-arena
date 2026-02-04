// src/app/api/auth/dev-login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { devLogin } from '@/lib/auth';

const SESSION_COOKIE_NAME = 'arena_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 дней

// Только для разработки! Позволяет войти без Stepik OAuth
export async function POST(request: NextRequest) {
  // Запрещаем в продакшене
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Dev login not available in production' },
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
      sameSite: 'lax',
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
