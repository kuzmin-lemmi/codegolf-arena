// src/lib/auth.ts

import { NextRequest } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

const SESSION_COOKIE_NAME = 'arena_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней
const SALT_ROUNDS = 10;

// Типы
export interface SessionUser {
  id: string;
  stepikUserId: number | null;
  email: string | null;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

// ==================== СЕССИИ ====================

// Получаем текущего пользователя из сессии
export async function getCurrentUser(request: NextRequest): Promise<SessionUser | null> {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    
    if (!sessionToken) {
      return null;
    }

    const tokenHash = hashToken(sessionToken);
    const session = await prisma.session.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            stepikUserId: true,
            email: true,
            displayName: true,
            nickname: true,
            avatarUrl: true,
            isAdmin: true,
          },
        },
      },
    });

    if (!session) {
      // Старый формат (token хранился plaintext) — инвалидируем
      const legacy = await prisma.session.findUnique({ where: { token: sessionToken } });
      if (legacy) {
        await prisma.session.delete({ where: { id: legacy.id } });
      }
      return null;
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    return session.user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Создаём сессию для пользователя
export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

  await prisma.session.create({
    data: {
      userId,
      token: hashToken(token),
      expiresAt,
    },
  });

  return token;
}

// Удаляем сессию
export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({
    where: {
      OR: [{ token: tokenHash }, { token }],
    },
  });
}

// Генерация криптографически безопасного токена сессии
function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 символа hex
}

// Генерация криптографически безопасного state для OAuth CSRF защиты
export function generateOAuthState(): string {
  return randomBytes(16).toString('hex'); // 32 символа hex
}

// Хэширование токена для хранения в БД (опционально, для дополнительной безопасности)
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ==================== EMAIL АВТОРИЗАЦИЯ ====================

export interface RegisterData {
  email: string;
  password: string;
  nickname: string;
}

export interface LoginData {
  email: string;
  password: string;
}

// Регистрация по email
export async function registerWithEmail(data: RegisterData) {
  const { email, password, nickname } = data;

  // Проверяем, не занят ли email
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error('Email already registered');
  }

  // Проверяем, не занят ли никнейм
  const nicknameKey = nickname.toLowerCase();
  const existingNickname = await prisma.user.findFirst({
    where: { nicknameKey },
  });

  if (existingNickname) {
    throw new Error('Nickname already taken');
  }

  // Хешируем пароль
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Создаём пользователя
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      displayName: nickname,
      nickname,
      nicknameKey,
      emailVerified: false, // TODO: добавить верификацию email
    },
  });

  return user;
}

// Вход по email
export async function loginWithEmail(data: LoginData) {
  const { email, password } = data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  return user;
}

// ==================== STEPIK OAUTH ====================

const STEPIK_OAUTH_URL = 'https://stepik.org/oauth2/authorize/';
const STEPIK_TOKEN_URL = 'https://stepik.org/oauth2/token/';
const STEPIK_API_URL = 'https://stepik.org/api';

interface StepikOAuthConfig {
  clientId: string;
  redirectUri: string;
}

interface StepikTokenConfig extends StepikOAuthConfig {
  clientSecret: string;
}

interface StepikTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface StepikUser {
  id: number;
  full_name: string;
  alias: string | null;
  avatar: string | null;
}

function resolveStepikOAuthConfig(): StepikTokenConfig {
  const clientId = process.env.STEPIK_CLIENT_ID || process.env.STEPIK_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.STEPIK_CLIENT_SECRET || process.env.STEPIK_OAUTH_CLIENT_SECRET || '';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const redirectUri =
    process.env.STEPIK_REDIRECT_URI ||
    process.env.STEPIK_OAUTH_REDIRECT_URI ||
    (baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/auth/stepik/callback` : '');

  return { clientId, clientSecret, redirectUri };
}

function validateStepikRedirectUri(redirectUri: string): void {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid_redirect_uri_protocol');
    }
  } catch {
    throw new Error('Invalid STEPIK_REDIRECT_URI');
  }
}

function getStepikAuthConfig(): StepikOAuthConfig {
  const { clientId, redirectUri } = resolveStepikOAuthConfig();

  if (!clientId || !redirectUri) {
    throw new Error('Stepik OAuth not configured: missing STEPIK_CLIENT_ID or STEPIK_REDIRECT_URI');
  }

  validateStepikRedirectUri(redirectUri);

  return { clientId, redirectUri };
}

function getStepikTokenConfig(): StepikTokenConfig {
  const { clientId, clientSecret, redirectUri } = resolveStepikOAuthConfig();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Stepik OAuth token exchange is not configured: missing client id/secret/redirect');
  }

  validateStepikRedirectUri(redirectUri);

  return { clientId, clientSecret, redirectUri };
}

// Генерация URL для авторизации через Stepik с CSRF state
export function getStepikAuthUrl(state: string): string {
  const { clientId, redirectUri } = getStepikAuthConfig();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state, // CSRF protection
  });

  return `${STEPIK_OAUTH_URL}?${params.toString()}`;
}

// Обмен кода на токен
export async function exchangeStepikCode(code: string): Promise<StepikTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getStepikTokenConfig();

  const baseBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  let response = await fetch(STEPIK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: baseBody,
  });

  if (!response.ok) {
    const fallbackBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    response = await fetch(STEPIK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: fallbackBody,
    });
  }

  if (!response.ok) {
    throw new Error(`Stepik token exchange failed: ${response.status}`);
  }

  return response.json();
}

// Получение данных пользователя из Stepik
export async function getStepikUser(accessToken: string): Promise<StepikUser> {
  const response = await fetch(`${STEPIK_API_URL}/stepics/1`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Stepik user: ${response.status}`);
  }

  const data = await response.json();
  const rawUser = data.users?.[0];
  const userId = typeof rawUser === 'number' ? rawUser : rawUser?.id;

  if (!userId) {
    throw new Error('Invalid Stepik user response');
  }

  // Получаем подробную информацию о пользователе.
  // Stepik API чаще возвращает пользователей через /users?ids[]=<id>,
  // а не через /users/<id>.
  let userResponse = await fetch(`${STEPIK_API_URL}/users?ids[]=${encodeURIComponent(String(userId))}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok && userResponse.status === 404) {
    userResponse = await fetch(`${STEPIK_API_URL}/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  if (!userResponse.ok) {
    throw new Error(`Failed to fetch Stepik user details: ${userResponse.status}`);
  }

  const userData = await userResponse.json();
  const user = userData.users?.[0];

  if (!user || !user.id) {
    throw new Error('Invalid Stepik user details response');
  }

  return {
    id: user.id,
    full_name: user.full_name || 'User',
    alias: user.alias || null,
    avatar: user.avatar || null,
  };
}

// Создание или обновление пользователя из Stepik
export async function findOrCreateUserFromStepik(stepikUser: StepikUser) {
  const user = await prisma.user.upsert({
    where: { stepikUserId: stepikUser.id },
    update: {
      displayName: stepikUser.full_name,
      avatarUrl: stepikUser.avatar,
    },
    create: {
      stepikUserId: stepikUser.id,
      displayName: stepikUser.full_name,
      nickname: stepikUser.alias || stepikUser.full_name.slice(0, 20),
      nicknameKey: (stepikUser.alias || stepikUser.full_name.slice(0, 20)).toLowerCase(),
      avatarUrl: stepikUser.avatar,
    },
  });

  return user;
}

// ==================== DEV MODE ====================

// Для разработки без реального OAuth
export async function devLogin(stepikUserId: number): Promise<{ user: any; token: string }> {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_LOGIN !== 'true') {
    throw new Error('Dev login is disabled');
  }

  let user = await prisma.user.findUnique({
    where: { stepikUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        stepikUserId,
        displayName: `DevUser${stepikUserId}`,
        nickname: `devuser${stepikUserId}`,
        nicknameKey: `devuser${stepikUserId}`,
      },
    });
  }

  const token = await createSession(user.id);

  return { user, token };
}
