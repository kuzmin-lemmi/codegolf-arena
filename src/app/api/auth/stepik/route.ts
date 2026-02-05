// src/app/api/auth/stepik/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getStepikAuthUrl, generateOAuthState } from '@/lib/auth';

const OAUTH_STATE_COOKIE = 'arena_oauth_state';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get('returnTo');
    
    // Generate CSRF state token
    const state = generateOAuthState();
    const authUrl = getStepikAuthUrl(state);
    const response = NextResponse.redirect(authUrl);

    // Store state in cookie for validation on callback
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/',
    });

    // Store returnTo with validation against open redirect
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
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
    return NextResponse.redirect(new URL('/auth?error=oauth_not_configured', request.url));
  }
}
