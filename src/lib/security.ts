import { NextRequest, NextResponse } from 'next/server';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: NextRequest): string | null {
  const host = request.headers.get('host');
  if (!host) return null;

  const proto = request.headers.get('x-forwarded-proto') || 'http';
  return normalizeOrigin(`${proto}://${host}`);
}

function getAllowedOrigins(request: NextRequest): string[] {
  const origins = new Set<string>();

  const requestOrigin = getRequestOrigin(request);
  if (requestOrigin) origins.add(requestOrigin);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    const parsed = normalizeOrigin(baseUrl);
    if (parsed) origins.add(parsed);
  }

  return Array.from(origins);
}

export function validateMutationRequest(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  const secFetchSite = request.headers.get('sec-fetch-site');

  if (secFetchSite === 'cross-site') {
    return NextResponse.json({ success: false, error: 'Cross-site request blocked' }, { status: 403 });
  }

  if (!origin) {
    return NextResponse.json(
      { success: false, error: 'Missing origin header for mutation request' },
      { status: 403 }
    );
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return NextResponse.json({ success: false, error: 'Invalid origin' }, { status: 403 });
  }

  const allowedOrigins = getAllowedOrigins(request);
  if (!allowedOrigins.includes(normalizedOrigin)) {
    return NextResponse.json({ success: false, error: 'Origin not allowed' }, { status: 403 });
  }

  return null;
}

export function isDevLoginAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.ALLOW_DEV_LOGIN !== 'true') return false;

  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0].toLowerCase();
  return LOCAL_HOSTS.has(hostname);
}
