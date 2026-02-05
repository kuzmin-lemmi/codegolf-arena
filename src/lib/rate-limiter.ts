// src/lib/rate-limiter.ts

/**
 * In-memory rate limiter для ограничения количества запросов
 * Согласно SPEC.md 8.6: 10 сабмитов/мин/задача/пользователь
 * 
 * Для Auth endpoints: 5 попыток/мин/IP
 */

interface RateLimitEntry {
  timestamps: number[]; // Unix timestamps в миллисекундах
}

// In-memory хранилище
const rateLimitStore = new Map<string, RateLimitEntry>();

// Константы для submission rate limit
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 минута
const RATE_LIMIT_MAX_REQUESTS = 10; // Максимум запросов за окно

// Константы для auth rate limit
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 минута
const AUTH_RATE_LIMIT_MAX_REQUESTS = 5; // Максимум попыток за окно

// Максимальный размер Map для предотвращения memory leak
const MAX_STORE_SIZE = 10000;

// Очистка старых записей каждые 2 минуты (более частая очистка)
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const cleanupThreshold = 2 * 60 * 1000; // 2 минуты
    
    rateLimitStore.forEach((entry, key) => {
      // Удаляем timestamps старше 2 минут
      entry.timestamps = entry.timestamps.filter(
        (ts: number) => now - ts < cleanupThreshold
      );

      if (entry.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    });
    
    // Принудительная очистка если Map слишком большой
    if (rateLimitStore.size > MAX_STORE_SIZE) {
      const keysToDelete = Array.from(rateLimitStore.keys()).slice(0, rateLimitStore.size - MAX_STORE_SIZE / 2);
      keysToDelete.forEach(key => rateLimitStore.delete(key));
    }
  }, 2 * 60 * 1000);
}

// Запускаем очистку
startCleanup();

/**
 * Проверяет rate limit для пользователя и задачи
 * @param userId - ID пользователя
 * @param taskId - ID задачи
 * @returns { allowed: boolean, retryAfter?: number }
 */
export function checkRateLimit(
  userId: string,
  taskId: string
): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const key = `${userId}:${taskId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Получаем или создаём запись
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Удаляем старые timestamps (вне окна)
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Проверяем лимит
  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Лимит превышен
    const oldestTimestamp = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + RATE_LIMIT_WINDOW_MS - now) / 1000);

    return {
      allowed: false,
      retryAfter: Math.max(retryAfter, 1), // Минимум 1 секунда
      remaining: 0,
    };
  }

  // Добавляем текущий timestamp
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.timestamps.length,
  };
}

/**
 * Сбрасывает rate limit для пользователя и задачи (для тестирования)
 */
export function resetRateLimit(userId: string, taskId: string): void {
  const key = `${userId}:${taskId}`;
  rateLimitStore.delete(key);
}

/**
 * Получает текущее состояние rate limit (для отладки)
 */
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
  const recentTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

  return {
    requestCount: recentTimestamps.length,
    oldestTimestamp: recentTimestamps[0] || null,
  };
}

/**
 * Rate limit для auth endpoints (login, register)
 * 5 попыток/мин/IP
 */
export function checkAuthRateLimit(
  identifier: string // IP address or other identifier
): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const key = `auth:${identifier}`;
  const now = Date.now();
  const windowStart = now - AUTH_RATE_LIMIT_WINDOW_MS;

  // Получаем или создаём запись
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Удаляем старые timestamps (вне окна)
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Проверяем лимит
  if (entry.timestamps.length >= AUTH_RATE_LIMIT_MAX_REQUESTS) {
    const oldestTimestamp = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + AUTH_RATE_LIMIT_WINDOW_MS - now) / 1000);

    return {
      allowed: false,
      retryAfter: Math.max(retryAfter, 1),
      remaining: 0,
    };
  }

  // Добавляем текущий timestamp
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: AUTH_RATE_LIMIT_MAX_REQUESTS - entry.timestamps.length,
  };
}

/**
 * Получает IP из запроса (с учетом прокси)
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}
