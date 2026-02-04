// src/app/api/auth/register/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { registerWithEmail, createSession } from '@/lib/auth';

const SESSION_COOKIE_NAME = 'arena_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 дней в секундах

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, nickname } = body;

    // Валидация
    if (!email || !password || !nickname) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Валидация пароля
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Валидация никнейма
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 3 || trimmedNickname.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Nickname must be 3-20 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Zа-яА-ЯёЁ0-9_]+$/.test(trimmedNickname)) {
      return NextResponse.json(
        { success: false, error: 'Nickname can only contain letters, numbers, and underscores' },
        { status: 400 }
      );
    }

    // Регистрация
    const user = await registerWithEmail({
      email,
      password,
      nickname: trimmedNickname,
    });

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
    console.error('Registration error:', error);

    if (error.message === 'Email already registered') {
      return NextResponse.json(
        { success: false, error: 'Этот email уже зарегистрирован' },
        { status: 400 }
      );
    }

    if (error.message === 'Nickname already taken') {
      return NextResponse.json(
        { success: false, error: 'Этот никнейм уже занят' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Registration failed' },
      { status: 500 }
    );
  }
}
