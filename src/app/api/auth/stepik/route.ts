// src/app/api/auth/stepik/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getStepikAuthUrl } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo');
    const authUrl = getStepikAuthUrl();
    const response = NextResponse.redirect(authUrl);

    if (returnTo && returnTo.startsWith('/')) {
      response.cookies.set('arena_return_to', returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Error starting Stepik auth:', error);
    // Редирект на страницу ошибки
    return NextResponse.redirect(new URL('/auth?error=oauth_not_configured', request.url));
  }
}
