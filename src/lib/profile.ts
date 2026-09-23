// src/lib/profile.ts

/**
 * Данные публичной страницы участника.
 *
 * Показываем только то, что не портит игру: длины решений, места, очки.
 * Сам код решений на публичной странице не отдаём никогда.
 */

import { prisma } from '@/lib/db';
import { isLanguage, type Language } from '@/lib/languages';
import { getUserLanguageStats, type LanguageStats } from '@/lib/ratings';
import type { TaskTier } from '@/types';

export interface PublicProfileSolution {
  slug: string;
  title: string;
  tier: TaskTier;
  language: Language;
  codeLength: number;
  firstLength: number | null;
  rank: number;
  achievedAt: Date;
}

export interface PublicProfile {
  id: string;
  // Часть URL /u/<slug>: ник, если он есть, иначе id
  slug: string;
  name: string;
  avatarUrl: string | null;
  totalPoints: number;
  // Задач, решённых хотя бы на одном языке
  tasksSolved: number;
  totalSubmissions: number;
  firstPlaces: number;
  bestRank: number | null;
  globalRank: number | null;
  charsSaved: number;
  createdAt: Date;
  topSolutions: PublicProfileSolution[];
  // Очки, задачи и место в рейтинге каждого языка
  languageStats: LanguageStats[];
}

const TOP_SOLUTIONS_LIMIT = 12;

/**
 * Ссылка на публичную страницу: ник читается лучше, но у пользователей
 * из Stepik ника может не быть — тогда работает id.
 */
export function getPublicProfileSlug(user: { id: string; nickname?: string | null }): string {
  return user.nickname && user.nickname.trim() ? user.nickname : user.id;
}

export function getPublicProfileUrl(user: { id: string; nickname?: string | null }): string {
  return `/u/${encodeURIComponent(getPublicProfileSlug(user))}`;
}

/**
 * Ищет пользователя по нику (без учёта регистра) или по id.
 */
export async function findPublicUser(slugOrId: string) {
  const normalized = slugOrId.trim();
  if (!normalized) return null;

  const byNickname = await prisma.user.findFirst({
    where: { nicknameKey: normalized.toLowerCase() },
    select: {
      id: true,
      nickname: true,
      displayName: true,
      avatarUrl: true,
      totalPoints: true,
      createdAt: true,
    },
  });

  if (byNickname) return byNickname;

  return prisma.user.findFirst({
    where: { id: normalized },
    select: {
      id: true,
      nickname: true,
      displayName: true,
      avatarUrl: true,
      totalPoints: true,
      createdAt: true,
    },
  });
}

export async function getPublicProfile(slugOrId: string): Promise<PublicProfile | null> {
  const user = await findPublicUser(slugOrId);
  if (!user) return null;

  const [solutionRows, statsRows, totalSubmissions, betterRanked, languageStats] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        slug: string;
        title: string;
        tier: string;
        language: string;
        codeLength: number;
        firstLength: number | null;
        achievedAt: Date;
        rank: bigint;
      }>
    >`
      SELECT
        t.slug AS "slug",
        t.title AS "title",
        t.tier AS "tier",
        ranked.language AS "language",
        ranked.code_length AS "codeLength",
        ranked.first_length AS "firstLength",
        ranked.achieved_at AS "achievedAt",
        ranked.rnk AS "rank"
      FROM (
        SELECT
          task_id,
          user_id,
          language,
          code_length,
          first_length,
          achieved_at,
          ROW_NUMBER() OVER (
            PARTITION BY task_id, language
            ORDER BY code_length ASC, achieved_at ASC, user_id ASC
          ) AS rnk
        FROM best_submissions
      ) ranked
      JOIN tasks t ON t.id = ranked.task_id
      WHERE ranked.user_id = ${user.id} AND t.status = 'published'
      ORDER BY ranked.rnk ASC, ranked.achieved_at DESC
      LIMIT ${TOP_SOLUTIONS_LIMIT}
    `,
    prisma.$queryRaw<
      Array<{
        solved: bigint;
        firstPlaces: bigint;
        bestRank: bigint | null;
        charsSaved: bigint | null;
      }>
    >`
      SELECT
        COUNT(DISTINCT ranked.task_id) AS "solved",
        COUNT(*) FILTER (WHERE ranked.rnk = 1) AS "firstPlaces",
        MIN(ranked.rnk) AS "bestRank",
        COALESCE(SUM(GREATEST(COALESCE(ranked.first_length, ranked.code_length) - ranked.code_length, 0)), 0) AS "charsSaved"
      FROM (
        SELECT
          task_id,
          user_id,
          code_length,
          first_length,
          ROW_NUMBER() OVER (
            PARTITION BY task_id, language
            ORDER BY code_length ASC, achieved_at ASC, user_id ASC
          ) AS rnk
        FROM best_submissions
      ) ranked
      WHERE ranked.user_id = ${user.id}
    `,
    prisma.submission.count({ where: { userId: user.id } }),
    user.totalPoints > 0
      ? prisma.user.count({ where: { totalPoints: { gt: user.totalPoints } } })
      : Promise.resolve(null),
    getUserLanguageStats(user.id),
  ]);

  const stats = statsRows?.[0];

  return {
    id: user.id,
    slug: getPublicProfileSlug(user),
    name: user.nickname || user.displayName,
    avatarUrl: user.avatarUrl,
    totalPoints: user.totalPoints,
    tasksSolved: stats ? Number(stats.solved) : 0,
    totalSubmissions,
    firstPlaces: stats ? Number(stats.firstPlaces) : 0,
    bestRank: stats?.bestRank === null || stats?.bestRank === undefined ? null : Number(stats.bestRank),
    globalRank: betterRanked === null ? null : betterRanked + 1,
    charsSaved: stats?.charsSaved ? Number(stats.charsSaved) : 0,
    createdAt: user.createdAt,
    topSolutions: solutionRows.map((row) => ({
      slug: row.slug,
      title: row.title,
      tier: row.tier as TaskTier,
      language: isLanguage(row.language) ? row.language : 'python',
      codeLength: Number(row.codeLength),
      firstLength: row.firstLength === null ? null : Number(row.firstLength),
      rank: Number(row.rank),
      achievedAt: row.achievedAt,
    })),
    languageStats,
  };
}
