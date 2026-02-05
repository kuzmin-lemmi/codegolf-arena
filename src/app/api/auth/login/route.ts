// src/app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { loginWithEmail, createSession } from '@/lib/auth';
import { checkAuthRateLimit, getClientIP } from '@/lib/rate-limiter';

const SESSION_COOKIE_NAME = 'arena_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 дней в секундах

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = checkAuthRateLimit(clientIP);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Слишком много попыток. Попробуйте через ${rateLimitResult.retryAfter} сек.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter),
          },
        }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    // Валидация
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Вход
    const user = await loginWithEmail({ email, password });

    // Создаём сессию
    const token = await createSession(user.id);

    // Ответ с cookie
    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        displayName: user.displayName,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);

    if (error.message === 'Invalid email or password') {
      return NextResponse.json(
        { success: false, error: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    );
  }
}
