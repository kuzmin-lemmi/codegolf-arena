// src/lib/points.ts

/**
 * Утилита для начисления очков прогресса
 * Упрощённая версия для MVP: только очки за первый PASS
 */

import { TaskTier } from '@prisma/client';

// ==================== КОНСТАНТЫ ====================

// Очки за первый PASS задачи
const POINTS_PASS: Record<TaskTier, number> = {
  bronze: 10,
  silver: 20,
  gold: 30,
};

// ==================== ФУНКЦИИ ====================

/**
 * Получает количество очков за первый PASS задачи
 * @param tier - уровень сложности задачи
 * @returns количество очков
 */
export function getPassPoints(tier: TaskTier): number {
  return POINTS_PASS[tier];
}
