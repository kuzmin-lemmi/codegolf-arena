// src/app/api/auth/stepik/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { 
  exchangeStepikCode, 
  getStepikUser, 
  findOrCreateUserFromStepik,
  createSession 
} from '@/lib/auth';

const SESSION_COOKIE_NAME = 'arena_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 дней в секундах

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Проверка на ошибки OAuth
    if (error) {
      console.error('Stepik OAuth error:', error);
      return NextResponse.redirect(new URL('/auth?error=oauth_denied', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/auth?error=no_code', request.url));
    }

    // Обмен кода на токен
    const tokenData = await exchangeStepikCode(code);

    // Получение данных пользователя
    const stepikUser = await getStepikUser(tokenData.access_token);

    // Создание/обновление пользователя в БД
    const user = await findOrCreateUserFromStepik(stepikUser);

    // Создание сессии
    const sessionToken = await createSession(user.id);

    // Устанавливаем cookie и редиректим на главную
    const response = NextResponse.redirect(new URL('/', request.url));
    
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Stepik OAuth callback error:', error);
    return NextResponse.redirect(new URL('/auth?error=auth_failed', request.url));
  }
}
