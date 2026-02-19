import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function extractOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

function buildCsp(): string {
  const connectSources = new Set([
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://stepik.org',
  ]);

  const pistonOrigin = extractOrigin(process.env.PISTON_API_URL);
  if (pistonOrigin) {
    connectSources.add(pistonOrigin);
  }

  if (process.env.NODE_ENV !== 'production') {
    connectSources.add('http://127.0.0.1:2000');
    connectSources.add('http://localhost:2000');
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    `connect-src ${Array.from(connectSources).join(' ')}`,
    "worker-src 'self' blob:",
    "form-action 'self' https://stepik.org",
  ].join('; ');
}

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set('Content-Security-Policy', buildCsp());
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
