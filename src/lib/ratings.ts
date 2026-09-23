// src/lib/ratings.ts
// Рейтинги игроков: общий и по каждому языку (docs/three-languages.md).
//
// Общий рейтинг — users.total_points: очки за все языки вместе.
// Рейтинг языка — сумма best_submissions.points этого языка: за решения,
// улучшения и первые места именно на нём.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { LANGUAGES, isLanguage, type Language, type RatingScope } from '@/lib/languages';

export interface RatingEntry {
  rank: number;
  userId: string;
  nickname: string;
  profileSlug: string;
  avatarUrl: string | null;
  points: number;
  // Сколько задач решено: в общем рейтинге — хотя бы на одном языке
  tasksSolved: number;
}

export async function getRating(scope: RatingScope, limit = 50): Promise<RatingEntry[]> {
  const languageFilter = scope === 'all' ? Prisma.empty : Prisma.sql`AND b.language = ${scope}`;

  const rows =
    scope === 'all'
      ? await prisma.$queryRaw<
          Array<{ userId: string; nickname: string | null; displayName: string; avatarUrl: string | null; points: number; solved: bigint }>
        >`
          SELECT u.id AS "userId", u.nickname, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
                 u.total_points AS "points",
                 (SELECT COUNT(DISTINCT b.task_id) FROM best_submissions b WHERE b.user_id = u.id) AS "solved"
          FROM users u
          WHERE u.total_points > 0
          ORDER BY u.total_points DESC, u.created_at ASC
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<
          Array<{ userId: string; nickname: string | null; displayName: string; avatarUrl: string | null; points: bigint; solved: bigint }>
        >`
          SELECT u.id AS "userId", u.nickname, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
                 SUM(b.points) AS "points", COUNT(*) AS "solved"
          FROM best_submissions b
          JOIN users u ON u.id = b.user_id
          WHERE TRUE ${languageFilter}
          GROUP BY u.id
          HAVING SUM(b.points) > 0
          ORDER BY SUM(b.points) DESC, u.created_at ASC
          LIMIT ${limit}
        `;

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    nickname: row.nickname || row.displayName,
    profileSlug: row.nickname || row.userId,
    avatarUrl: row.avatarUrl,
    points: Number(row.points),
    tasksSolved: Number(row.solved),
  }));
}

export interface LanguageStats {
  language: Language;
  points: number;
  tasksSolved: number;
  // Место в рейтинге языка; null — очков на этом языке нет
  rank: number | null;
}

/** Очки, решённые задачи и место игрока в рейтинге каждого языка */
export async function getUserLanguageStats(userId: string): Promise<LanguageStats[]> {
  const totals = await prisma.$queryRaw<Array<{ userId: string; language: string; points: bigint; solved: bigint }>>`
    SELECT user_id AS "userId", language, SUM(points) AS "points", COUNT(*) AS "solved"
    FROM best_submissions
    GROUP BY user_id, language
  `;

  return LANGUAGES.map((language) => {
    const rows = totals.filter((row) => row.language === language && isLanguage(row.language));
    const own = rows.find((row) => row.userId === userId);
    const points = own ? Number(own.points) : 0;
    return {
      language,
      points,
      tasksSolved: own ? Number(own.solved) : 0,
      rank: points > 0 ? rows.filter((row) => Number(row.points) > points).length + 1 : null,
    };
  });
}
