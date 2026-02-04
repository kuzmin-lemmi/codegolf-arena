// src/app/api/auth/stepik/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getStepikAuthUrl } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authUrl = getStepikAuthUrl();
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error starting Stepik auth:', error);
    // Редирект на страницу ошибки
    return NextResponse.redirect(new URL('/auth?error=oauth_not_configured', request.url));
  }
}
