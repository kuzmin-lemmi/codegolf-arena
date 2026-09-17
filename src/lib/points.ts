// src/lib/points.ts

/**
 * Начисление очков прогресса.
 *
 * Правила ровно те, что обещаны игроку на /rules и в сайдбаре рейтинга:
 *  - первое решение задачи: bronze +10, silver +20, gold +30;
 *  - улучшение своего рекорда: 1-3 символа +5, 4-9 символов +10, 10+ символов +20;
 *  - первый выход на #1 по задаче: +25 (один раз на задачу).
 *
 * Очки за улучшения ограничены сверху: иначе их можно набить, отправив
 * заведомо раздутое решение и укорачивая его по одному символу.
 */

import type { TaskTier } from '@/types';

// ==================== КОНСТАНТЫ ====================

// Очки за первый PASS задачи
const POINTS_PASS: Record<TaskTier, number> = {
  bronze: 10,
  silver: 20,
  gold: 30,
};

// Очки за укорачивание своего решения: порог экономии -> очки
const IMPROVEMENT_STEPS: Array<{ minSaved: number; points: number }> = [
  { minSaved: 10, points: 20 },
  { minSaved: 4, points: 10 },
  { minSaved: 1, points: 5 },
];

// Бонус за первый выход на #1 по задаче (один раз на задачу)
const POINTS_FIRST_PLACE = 25;

// Лимит очков за улучшения по одной задаче = множитель * очки за первый PASS
const IMPROVE_CAP_MULTIPLIER = 2;

// ==================== ФУНКЦИИ ====================

/**
 * Получает количество очков за первый PASS задачи
 * @param tier - уровень сложности задачи
 * @returns количество очков
 */
export function getPassPoints(tier: TaskTier): number {
  return POINTS_PASS[tier] ?? POINTS_PASS.bronze;
}

/**
 * Бонус за первый выход на первое место по задаче
 */
export function getFirstPlacePoints(): number {
  return POINTS_FIRST_PLACE;
}

/**
 * Сколько очков в принципе стоит укорачивание на `savedChars` символов
 * (без учёта лимита по задаче)
 */
export function getImprovementPoints(savedChars: number): number {
  if (!Number.isFinite(savedChars) || savedChars <= 0) return 0;
  const step = IMPROVEMENT_STEPS.find((item) => savedChars >= item.minSaved);
  return step ? step.points : 0;
}

/**
 * Максимум очков за улучшения по одной задаче
 */
export function getImprovementPointsCap(tier: TaskTier): number {
  return getPassPoints(tier) * IMPROVE_CAP_MULTIPLIER;
}

export interface ImprovementAward {
  // сколько очков реально начисляем
  points: number;
  // сколько было бы по таблице, без лимита
  rawPoints: number;
  // лимит по задаче
  cap: number;
  // лимит урезал начисление
  capped: boolean;
}

/**
 * Считает очки за улучшение рекорда с учётом лимита по задаче
 */
export function awardImprovementPoints(params: {
  tier: TaskTier;
  savedChars: number;
  alreadyAwarded: number;
}): ImprovementAward {
  const { tier, savedChars } = params;
  const alreadyAwarded = Math.max(0, params.alreadyAwarded || 0);
  const cap = getImprovementPointsCap(tier);
  const rawPoints = getImprovementPoints(savedChars);
  const remaining = Math.max(0, cap - alreadyAwarded);
  const points = Math.min(rawPoints, remaining);

  return {
    points,
    rawPoints,
    cap,
    capped: points < rawPoints,
  };
}

/**
 * Человеческое описание правил — используется в UI, чтобы текст не расходился с кодом
 */
export const POINTS_RULES = {
  pass: POINTS_PASS,
  improvementSteps: IMPROVEMENT_STEPS,
  firstPlace: POINTS_FIRST_PLACE,
  improveCap: {
    bronze: getImprovementPointsCap('bronze'),
    silver: getImprovementPointsCap('silver'),
    gold: getImprovementPointsCap('gold'),
  },
} as const;
