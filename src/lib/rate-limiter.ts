import { createHash } from 'crypto';

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 5;

const SUBMIT_STATUS_WINDOW_MS = 10 * 1000;
const SUBMIT_STATUS_MAX_REQUESTS = 20;

const SUBMIT_IP_WINDOW_MS = 60 * 1000;
const SUBMIT_IP_MAX_REQUESTS = 30;

// Черновая проверка JavaScript и C# идёт на сервере (для Python — в браузере).
// Лимит с одного адреса — отдельно по языку: сборка C# дорогая, запуск JS — нет
const SERVER_CHECK_WINDOW_MS = 60 * 1000;
const SERVER_CHECK_MAX_REQUESTS = { javascript: 30, csharp: 12 } as const;

const MAX_STORE_SIZE = 10000;

const REDIS_URL = process.env.RATE_LIMIT_REDIS_URL || '';
const REDIS_TOKEN = process.env.RATE_LIMIT_REDIS_TOKEN || '';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const cleanupThreshold = 2 * 60 * 1000;

    rateLimitStore.forEach((entry, key) => {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < cleanupThreshold);
      if (entry.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    });

    if (rateLimitStore.size > MAX_STORE_SIZE) {
      const keys = Array.from(rateLimitStore.keys());
      const toDelete = keys.slice(0, rateLimitStore.size - Math.floor(MAX_STORE_SIZE / 2));
      toDelete.forEach((key) => rateLimitStore.delete(key));
    }
  }, 2 * 60 * 1000);

  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }
}

startCleanup();

function checkMemoryLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= maxRequests) {
    const oldestTimestamp = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: 0 };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: maxRequests - entry.timestamps.length };
}

function hasRedisConfig(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function upstashPipeline(commands: string[][]): Promise<any[]> {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Upstash rate limit error: ${response.status}`);
  }

  return response.json();
}

async function checkRedisLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  await upstashPipeline([
    ['ZREMRANGEBYSCORE', key, '-inf', String(windowStart)],
    ['ZCARD', key],
  ]);

  const cardRes = await upstashPipeline([['ZCARD', key]]);
  const current = Number(cardRes?.[0]?.result || 0);

  if (current >= maxRequests) {
    const oldestRes = await upstashPipeline([['ZRANGE', key, '0', '0', 'WITHSCORES']]);
    const oldest = oldestRes?.[0]?.result;
    const oldestScore = Array.isArray(oldest) && oldest.length >= 2 ? Number(oldest[1]) : now;
    const retryAfter = Math.ceil((oldestScore + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: 0 };
  }

  const member = `${now}:${Math.random().toString(36).slice(2)}`;
  const ttl = Math.ceil(windowMs / 1000) + 60;
  await upstashPipeline([
    ['ZADD', key, String(now), member],
    ['EXPIRE', key, String(ttl)],
    ['ZCARD', key],
  ]);

  return { allowed: true, remaining: Math.max(0, maxRequests - (current + 1)) };
}

async function checkLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  if (!hasRedisConfig()) {
    return checkMemoryLimit(key, windowMs, maxRequests);
  }

  try {
    return await checkRedisLimit(key, windowMs, maxRequests);
  } catch (error) {
    console.error('Redis rate limiter failed, fallback to memory:', error);
    return checkMemoryLimit(key, windowMs, maxRequests);
  }
}

export async function checkRateLimit(
  userId: string,
  taskId: string
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  return checkLimit(`${userId}:${taskId}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);
}

export function resetRateLimit(userId: string, taskId: string): void {
  rateLimitStore.delete(`${userId}:${taskId}`);
}

export function getRateLimitStatus(
  userId: string,
  taskId: string
): { requestCount: number; oldestTimestamp: number | null } {
  const key = `${userId}:${taskId}`;
  const entry = rateLimitStore.get(key);

  if (!entry || entry.timestamps.length === 0) {
    return { requestCount: 0, oldestTimestamp: null };
  }

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = entry.timestamps.filter((ts) => ts > windowStart);
  return { requestCount: recent.length, oldestTimestamp: recent[0] || null };
}

export async function checkAuthRateLimit(
  identifier: string
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  return checkLimit(`auth:${identifier}`, AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX_REQUESTS);
}

export async function checkSubmitStatusRateLimit(
  userId: string,
  taskId: string
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  return checkLimit(
    `submit-status:${userId}:${taskId}`,
    SUBMIT_STATUS_WINDOW_MS,
    SUBMIT_STATUS_MAX_REQUESTS
  );
}

export async function checkSubmitIpRateLimit(
  ip: string
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  return checkLimit(`submit-ip:${ip}`, SUBMIT_IP_WINDOW_MS, SUBMIT_IP_MAX_REQUESTS);
}

export async function checkServerCheckRateLimit(
  ip: string,
  language: keyof typeof SERVER_CHECK_MAX_REQUESTS
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  return checkLimit(
    `server-check:${language}:${ip}`,
    SERVER_CHECK_WINDOW_MS,
    SERVER_CHECK_MAX_REQUESTS[language]
  );
}

export function getClientIP(request: Request): string {
  const ipCandidates: string[] = [];

  if (TRUST_PROXY) {
    // X-Real-IP наш nginx всегда перезаписывает адресом соединения — ему верим
    // первым. В X-Forwarded-For надёжен только ПОСЛЕДНИЙ элемент: его дописал
    // ближайший к нам прокси, а всё левее мог прислать сам посетитель.
    // Раньше брался первый — и лимит отправок обходился подменой заголовка
    const realIp = request.headers.get('x-real-ip');
    if (realIp) ipCandidates.push(realIp.trim());

    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const hops = forwarded
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (hops.length > 0) ipCandidates.push(hops[hops.length - 1]);
    }

    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) ipCandidates.push(cfIp.trim());

    const vercelIp = request.headers.get('x-vercel-forwarded-for');
    if (vercelIp) ipCandidates.push(vercelIp.trim());
  }

  const firstValid = ipCandidates.find((value) => value.length > 0 && value.length < 128);
  if (firstValid) return firstValid;

  const userAgent = request.headers.get('user-agent') || 'unknown';
  const uaHash = createHash('sha256').update(userAgent).digest('hex').slice(0, 16);
  return `ua:${uaHash}`;
}
