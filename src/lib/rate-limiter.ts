// src/lib/rate-limiter.ts

/**
 * In-memory rate limiter для ограничения количества запросов
 * Согласно SPEC.md 8.6: 10 сабмитов/мин/задача/пользователь
 */

interface RateLimitEntry {
  timestamps: number[]; // Unix timestamps в миллисекундах
}

// In-memory хранилище
const rateLimitStore = new Map<string, RateLimitEntry>();

// Константы
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 минута
const RATE_LIMIT_MAX_REQUESTS = 10; // Максимум запросов за окно

// Очистка старых записей каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    // Удаляем записи, где все timestamps старше 5 минут
    entry.timestamps = entry.timestamps.filter(
      (ts) => now - ts < 5 * 60 * 1000
    );

    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

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
