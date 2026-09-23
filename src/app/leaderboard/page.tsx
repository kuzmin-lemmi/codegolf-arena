// src/app/leaderboard/page.tsx

import { Trophy, Medal, TrendingUp } from 'lucide-react';
import { Card, Avatar } from '@/components/ui';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getEnabledLanguages } from '@/lib/language-settings';
import { LANGUAGE_LABELS, parseRatingScope, type RatingScope } from '@/lib/languages';
import { getRating } from '@/lib/ratings';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // Название сайта к заголовку добавляет шаблон в layout.tsx
  title: 'Рейтинг',
  description: 'Рейтинг участников по очкам: общий и отдельно по Python, JavaScript и C#',
  alternates: {
    canonical: '/leaderboard',
  },
};

export const dynamic = 'force-dynamic';

async function getLeaderboard(scope: RatingScope) {
  try {
    return await getRating(scope, 50);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const languages = getEnabledLanguages();
  const requested = parseRatingScope((await searchParams).lang);
  const scope: RatingScope = requested === 'all' || languages.includes(requested) ? requested : 'all';
  const leaderboard = await getLeaderboard(scope);
  const scopes: RatingScope[] = ['all', ...languages];
  const scopeTitle = scope === 'all' ? 'Общий рейтинг' : `Рейтинг ${LANGUAGE_LABELS[scope]}`;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-tier-gold" />
            Рейтинг
          </h1>
          <p className="text-text-secondary">
            {scope === 'all'
              ? 'Очки за все языки вместе. Решил задачу на Python и на JavaScript — очки за оба'
              : `Очки, заработанные на ${LANGUAGE_LABELS[scope]}`}
          </p>
          {scopes.length > 1 && (
            <nav aria-label="Рейтинги" className="mt-5 flex flex-wrap gap-2">
              {scopes.map((item) => (
                <Link
                  key={item}
                  href={item === 'all' ? '/leaderboard' : `/leaderboard?lang=${item}`}
                  aria-current={item === scope ? 'page' : undefined}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    item === scope
                      ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40'
                      : 'text-text-secondary border-border hover:text-text-primary'
                  )}
                >
                  {item === 'all' ? 'Общий' : LANGUAGE_LABELS[item]}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {leaderboard.length === 0 ? (
          <Card padding="lg" className="text-center">
            <Trophy className="w-16 h-16 mx-auto text-text-muted mb-4" />
            <h2 className="text-xl font-semibold mb-2">{scopeTitle}: пока пусто</h2>
            <p className="text-text-secondary mb-4">
              Станьте первым участником — решите любую задачу и получите очки.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/tasks">
                <Button variant="primary" size="sm">Решить первую задачу</Button>
              </Link>
              <Link href="/rules">
                <Button variant="secondary" size="sm">Как работает рейтинг</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main - Leaderboard */}
            <div className="lg:col-span-2">
              {/* Top 3 Podium */}
              {leaderboard.length >= 3 && (
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {/* 2nd Place */}
                  <div className="pt-8">
                    <PodiumCard
                      rank={2}
                      nickname={leaderboard[1].nickname}
                      profileSlug={leaderboard[1].profileSlug}
                      points={leaderboard[1].points}
                      avatar={leaderboard[1].avatarUrl}
                    />
                  </div>
                  {/* 1st Place */}
                  <div>
                    <PodiumCard
                      rank={1}
                      nickname={leaderboard[0].nickname}
                      profileSlug={leaderboard[0].profileSlug}
                      points={leaderboard[0].points}
                      avatar={leaderboard[0].avatarUrl}
                    />
                  </div>
                  {/* 3rd Place */}
                  <div className="pt-12">
                    <PodiumCard
                      rank={3}
                      nickname={leaderboard[2].nickname}
                      profileSlug={leaderboard[2].profileSlug}
                      points={leaderboard[2].points}
                      avatar={leaderboard[2].avatarUrl}
                    />
                  </div>
                </div>
              )}

              {/* Full Table */}
              <Card padding="none">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-text-secondary">
                        <th className="px-4 py-3 font-medium w-16">Место</th>
                        <th className="px-4 py-3 font-medium">Участник</th>
                        <th className="px-4 py-3 font-medium text-right">Очки</th>
                        <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Задач</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry) => (
                        <tr
                          key={entry.rank}
                          className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50 transition-colors"
                        >
                          <td className="px-4 py-4">
                            <RankDisplay rank={entry.rank} />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar
                                src={entry.avatarUrl}
                                name={entry.nickname}
                                size="sm"
                              />
                              <Link
                                href={`/u/${encodeURIComponent(entry.profileSlug)}`}
                                className="font-medium hover:text-accent-blue transition-colors"
                              >
                                {entry.nickname}
                              </Link>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-mono font-bold text-accent-blue">
                              {entry.points}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-text-secondary hidden sm:table-cell">
                            {entry.tasksSolved}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Sidebar - Info */}
            <div className="space-y-6">
              {/* How points work */}
              <Card padding="lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-accent-green" />
                  Как начисляются очки
                </h3>
                <div className="space-y-4 text-sm">
                  <PointRule label="Решение Bronze задачи" points="+10" />
                  <PointRule label="Решение Silver задачи" points="+20" />
                  <PointRule label="Решение Gold задачи" points="+30" />
                  <hr className="border-border" />
                  <PointRule label="Улучшение на 1-3 символа" points="+5" />
                  <PointRule label="Улучшение на 4-9 символов" points="+10" />
                  <PointRule label="Улучшение на 10+ символов" points="+20" />
                  <hr className="border-border" />
                  <PointRule label="Стал #1 по задаче" points="+25" highlight />
                </div>
                <p className="text-xs text-text-muted mt-4">
                  Очки начисляются на каждом языке отдельно: у каждой задачи своя таблица рекордов
                  для Python, JavaScript и C#. За улучшения по одной задаче на одном языке можно
                  получить не больше 20 (Bronze), 40 (Silver) и 60 (Gold) очков, а бонус за первое
                  место даётся один раз на задачу и язык.{' '}
                  <Link href="/rules" className="text-accent-blue hover:underline">
                    Подробнее
                  </Link>
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumCard({
  rank,
  nickname,
  profileSlug,
  points,
  avatar,
}: {
  rank: number;
  nickname: string;
  profileSlug: string;
  points: number;
  avatar: string | null;
}) {
  const colors = {
    1: 'from-tier-gold/30 to-tier-gold/10 border-tier-gold/50',
    2: 'from-tier-silver/30 to-tier-silver/10 border-tier-silver/50',
    3: 'from-tier-bronze/30 to-tier-bronze/10 border-tier-bronze/50',
  };

  return (
    <Card
      padding="md"
      className={cn(
        'text-center bg-gradient-to-b border',
        colors[rank as 1 | 2 | 3]
      )}
    >
      <div className="mb-2">
        <RankDisplay rank={rank} size="lg" />
      </div>
      <Avatar src={avatar} name={nickname} size="md" className="mx-auto mb-2" />
      <Link
        href={`/u/${encodeURIComponent(profileSlug)}`}
        className="font-semibold truncate block hover:text-accent-blue transition-colors"
      >
        {nickname}
      </Link>
      <div className="text-accent-blue font-mono font-bold">{points}</div>
    </Card>
  );
}

function RankDisplay({ rank, size = 'md' }: { rank: number; size?: 'md' | 'lg' }) {
  const sizeClasses = size === 'lg' ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm';

  if (rank === 1) {
    return (
      <div className={cn('rounded-full bg-tier-gold/20 text-tier-gold font-bold flex items-center justify-center mx-auto', sizeClasses)}>
        <Medal className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className={cn('rounded-full bg-tier-silver/20 text-tier-silver font-bold flex items-center justify-center mx-auto', sizeClasses)}>
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className={cn('rounded-full bg-tier-bronze/20 text-tier-bronze font-bold flex items-center justify-center mx-auto', sizeClasses)}>
        3
      </div>
    );
  }
  return (
    <div className={cn('text-text-secondary font-medium flex items-center justify-center', sizeClasses)}>
      {rank}
    </div>
  );
}

function PointRule({
  label,
  points,
  highlight = false,
}: {
  label: string;
  points: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={cn('font-mono font-bold', highlight ? 'text-tier-gold' : 'text-accent-green')}>
        {points}
      </span>
    </div>
  );
}
