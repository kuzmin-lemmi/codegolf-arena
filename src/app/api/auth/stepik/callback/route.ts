// src/app/api/auth/stepik/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { 
  exchangeStepikCode, 
  getStepikUser, 
  findOrCreateUserFromStepik,
  createSession 
} from '@/lib/auth';

const SESSION_COOKIE_NAME = 'arena_session';
const OAUTH_STATE_COOKIE = 'arena_oauth_state';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 дней в секундах

// Безопасная проверка returnTo против open redirect
function getSafeReturnTo(returnToCookie: string | undefined): string {
  if (!returnToCookie) return '/';
  if (!returnToCookie.startsWith('/')) return '/';
  if (returnToCookie.startsWith('//')) return '/'; // Protect against protocol-relative URLs
  return returnToCookie;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const stateFromUrl = searchParams.get('state');
    const stateFromCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    const returnToCookie = request.cookies.get('arena_return_to')?.value;
    const returnTo = getSafeReturnTo(returnToCookie);

    // Проверка на ошибки OAuth
    if (error) {
      console.error('Stepik OAuth error:', error);
      return NextResponse.redirect(new URL('/auth?error=oauth_denied', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/auth?error=no_code', request.url));
    }

    // CSRF validation: check state parameter
    if (!stateFromUrl || !stateFromCookie || stateFromUrl !== stateFromCookie) {
      console.error('OAuth CSRF validation failed: state mismatch');
      return NextResponse.redirect(new URL('/auth?error=csrf_failed', request.url));
    }

    // Обмен кода на токен
    const tokenData = await exchangeStepikCode(code);

    // Получение данных пользователя
    const stepikUser = await getStepikUser(tokenData.access_token);

    // Создание/обновление пользователя в БД
    const user = await findOrCreateUserFromStepik(stepikUser);

    // Создание сессии
    const sessionToken = await createSession(user.id);

    // Устанавливаем cookie и редиректим
    const response = NextResponse.redirect(new URL(returnTo, request.url));
    
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    // Очищаем временные cookies
    response.cookies.set('arena_return_to', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    response.cookies.set(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Stepik OAuth callback error:', error);
    return NextResponse.redirect(new URL('/auth?error=auth_failed', request.url));
  }
}
