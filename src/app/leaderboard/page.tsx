// src/app/leaderboard/page.tsx

import { Trophy, Medal, TrendingUp } from 'lucide-react';
import { Card, Avatar } from '@/components/ui';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { prisma } from '@/lib/db';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Рейтинг — Арена однострочников',
  description: 'Глобальный рейтинг участников по очкам прогресса',
  alternates: {
    canonical: '/leaderboard',
  },
};

export const revalidate = 60;

async function getLeaderboard() {
  try {
    const users = await prisma.user.findMany({
      where: { totalPoints: { gt: 0 } },
      orderBy: { totalPoints: 'desc' },
      take: 50,
      select: {
        id: true,
        nickname: true,
        displayName: true,
        avatarUrl: true,
        totalPoints: true,
        _count: { select: { bestSubmissions: true } },
      },
    });

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      nickname: user.nickname || user.displayName,
      avatarUrl: user.avatarUrl,
      points: user.totalPoints,
      tasksSolved: user._count.bestSubmissions,
    }));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();

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
            Глобальный рейтинг по очкам прогресса
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {leaderboard.length === 0 ? (
          <Card padding="lg" className="text-center">
            <Trophy className="w-16 h-16 mx-auto text-text-muted mb-4" />
            <h2 className="text-xl font-semibold mb-2">Рейтинг пока пуст</h2>
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
                      points={leaderboard[1].points}
                      avatar={leaderboard[1].avatarUrl}
                    />
                  </div>
                  {/* 1st Place */}
                  <div>
                    <PodiumCard
                      rank={1}
                      nickname={leaderboard[0].nickname}
                      points={leaderboard[0].points}
                      avatar={leaderboard[0].avatarUrl}
                    />
                  </div>
                  {/* 3rd Place */}
                  <div className="pt-12">
                    <PodiumCard
                      rank={3}
                      nickname={leaderboard[2].nickname}
                      points={leaderboard[2].points}
                      avatar={leaderboard[2].avatarUrl}
                    />
                  </div>
                </div>
              )}

              {/* Full Table */}
              <Card padding="none" className="border-accent-blue/20">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-text-secondary font-mono uppercase">
                        <th className="px-4 py-3 font-medium w-16">#</th>
                        <th className="px-4 py-3 font-medium">УЧАСТНИК</th>
                        <th className="px-4 py-3 font-medium text-right">ОЧКИ</th>
                        <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">ЗАДАЧ</th>
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
                              <span className="font-mono text-text-primary">{entry.nickname}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-mono font-bold text-accent-blue">
                              {entry.points}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-text-secondary hidden sm:table-cell font-mono">
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
              <Card padding="lg" className="border-accent-blue/20">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-accent-green drop-shadow-[0_0_5px_rgba(57,255,20,0.3)]">
                  <TrendingUp className="w-5 h-5 text-accent-green" />
                  КАК НАЧИСЛЯЮТСЯ ОЧКИ
                </h3>
                <div className="space-y-2 text-sm">
                  <PointRule label="РЕШЕНИЕ BRONZE ЗАДАЧИ" points="+10" />
                  <PointRule label="РЕШЕНИЕ SILVER ЗАДАЧИ" points="+20" />
                  <PointRule label="РЕШЕНИЕ GOLD ЗАДАЧИ" points="+30" />
                  <hr className="border-border/50 my-2" />
                  <PointRule label="УЛУЧШЕНИЕ НА 1-3 СИМВОЛА" points="+5" />
                  <PointRule label="УЛУЧШЕНИЕ НА 4-9 СИМВОЛОВ" points="+10" />
                  <PointRule label="УЛУЧШЕНИЕ НА 10+ СИМВОЛОВ" points="+20" />
                  <hr className="border-border/50 my-2" />
                  <PointRule label="СТАЛ #1 ПО ЗАДАЧЕ" points="+25" highlight />
                </div>
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
  points,
  avatar,
  progress,
}: {
  rank: number;
  nickname: string;
  points: number;
  avatar: string | null;
  progress?: number;
}) {
  const colors = {
    1: 'from-tier-gold/30 to-tier-gold/10 border-tier-gold/50 shadow-[0_0_30px_rgba(255,215,0,0.2)]',
    2: 'from-tier-silver/30 to-tier-silver/10 border-tier-silver/50 shadow-[0_0_30px_rgba(192,192,192,0.1)]',
    3: 'from-tier-bronze/30 to-tier-bronze/10 border-tier-bronze/50 shadow-[0_0_30px_rgba(205,127,50,0.1)]',
  };

  return (
    <Card
      padding="md"
      className={cn(
        'text-center bg-gradient-to-b border rounded-none relative overflow-hidden',
        colors[rank as 1 | 2 | 3]
      )}
    >
      {progress !== undefined && progress < 100 && (
        <div className="absolute bottom-0 left-0 h-1 bg-accent-blue/50" style={{ width: `${progress}%` }} />
      )}
      <div className="mb-2">
        <RankDisplay rank={rank} size="lg" />
      </div>
      <Avatar src={avatar} name={nickname} size="md" className="mx-auto mb-2" />
      <div className="font-semibold truncate text-text-primary">{nickname}</div>
      <div className="text-accent-blue font-mono font-bold text-xl">{points} очков</div>
    </Card>
  );
}

function RankDisplay({
  rank,
  size = 'md',
}: {
  rank: number;
  size?: 'md' | 'lg';
}) {
  const sizeClasses = size === 'lg' ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm';

  if (rank === 1) {
    return (
      <div className={cn(
        'rounded-none bg-tier-gold/20 text-tier-gold font-bold flex items-center justify-center mx-auto border border-tier-gold/40 shadow-[0_0_10px_rgba(255,215,0,0.2)]',
        sizeClasses
      )}>
        <Medal className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className={cn(
        'rounded-none bg-tier-silver/20 text-tier-silver font-bold flex items-center justify-center mx-auto border border-tier-silver/40 shadow-[0_0_10px_rgba(192,192,192,0.1)]',
        sizeClasses
      )}>
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className={cn(
        'rounded-none bg-tier-bronze/20 text-tier-bronze font-bold flex items-center justify-center mx-auto border border-tier-bronze/40 shadow-[0_0_10px_rgba(205,127,50,0.1)]',
        sizeClasses
      )}>
        3
      </div>
    );
  }
  return (
    <div className={cn('text-text-secondary font-mono flex items-center justify-center', sizeClasses)}>
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
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-text-secondary font-mono text-sm">{label}</span>
      <span className={cn('font-mono font-bold text-sm', highlight ? 'text-tier-gold drop-shadow-[0_0_5px_rgba(255,215,0,0.4)]' : 'text-accent-green')}>
        {points}
      </span>
    </div>
  );
}

