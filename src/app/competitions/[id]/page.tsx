// src/app/competitions/[id]/page.tsx

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Lock, CheckCircle, Circle, Clock } from 'lucide-react';
import { Card, Button, TierBadge, Avatar } from '@/components/ui';
import { prisma } from '@/lib/db';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { formatDate, formatTimeRemaining, cn, pluralizeRu } from '@/lib/utils';
import type { TaskTier } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: { title: true },
  });

  if (!competition) {
    return { title: 'Соревнование не найдено' };
  }

  return {
    title: `${competition.title} — Арена однострочников`,
    alternates: {
      canonical: `/competitions/${id}`,
    },
  };
}

async function getCompetition(id: string) {
  try {
    const competition = await prisma.competition.findUnique({
      where: { id },
      include: {
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                slug: true,
                title: true,
                tier: true,
                statementMd: true,
                functionSignature: true,
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        entries: {
          include: {
            user: {
              select: { id: true, nickname: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: [
            { tasksSolved: 'desc' },
            { totalLength: 'asc' },
            { lastSubmitAt: 'asc' },
          ],
          take: 20,
        },
        _count: { select: { entries: true } },
      },
    });

    return competition;
  } catch (error) {
    console.error('Error fetching competition:', error);
    return null;
  }
}

export default async function CompetitionPage({ params }: Props) {
  const { id } = await params;
  const competition = await getCompetition(id);

  if (!competition) {
    notFound();
  }

  const now = new Date();
  const startsAt = new Date(competition.startsAt);
  const endsAt = new Date(competition.endsAt);
  const isUpcoming = competition.isActive && startsAt > now;
  const isRunning = competition.isActive && startsAt <= now && endsAt > now;
  const timeRemaining = isRunning ? formatTimeRemaining(endsAt) : null;

  // Свой результат считаем по тем же правилам, что и лидерборд соревнования
  const currentUser = await getCurrentUserFromCookies();
  const taskIds = competition.tasks.map((ct) => ct.task.id);

  let myPlace: number | null = null;
  let myEntry: { tasksSolved: number; totalLength: number } | null = null;
  const myLengths = new Map<string, number>();

  if (currentUser && taskIds.length > 0) {
    const [entry, solvedRows] = await Promise.all([
      prisma.competitionEntry.findUnique({
        where: {
          competitionId_userId: { competitionId: competition.id, userId: currentUser.id },
        },
        select: { tasksSolved: true, totalLength: true },
      }),
      prisma.submission.groupBy({
        by: ['taskId'],
        where: {
          userId: currentUser.id,
          taskId: { in: taskIds },
          status: 'pass',
          createdAt: { gte: startsAt, lte: endsAt },
        },
        _min: { codeLength: true },
      }),
    ]);

    for (const row of solvedRows) {
      if (row._min.codeLength !== null) {
        myLengths.set(row.taskId, row._min.codeLength);
      }
    }

    if (entry) {
      myEntry = entry;
      const betterCount = await prisma.competitionEntry.count({
        where: {
          competitionId: competition.id,
          OR: [
            { tasksSolved: { gt: entry.tasksSolved } },
            { tasksSolved: entry.tasksSolved, totalLength: { lt: entry.totalLength } },
          ],
        },
      });
      myPlace = betterCount + 1;
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/competitions"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Все соревнования
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {isRunning && (
                  <span className="px-2 py-0.5 bg-accent-green/20 text-accent-green text-xs font-medium rounded">
                    АКТИВНО
                  </span>
                )}
                {isUpcoming && (
                  <span className="px-2 py-0.5 bg-accent-blue/20 text-accent-blue text-xs font-medium rounded">
                    СКОРО
                  </span>
                )}
                <h1 className="text-2xl font-bold">{competition.title}</h1>
              </div>
              {competition.description && (
                <p className="text-text-secondary">{competition.description}</p>
              )}
              {isUpcoming && (
                <p className="text-sm text-text-secondary mt-2">
                  Старт {formatDate(startsAt)} — задачи откроются автоматически.
                </p>
              )}
            </div>

            {isRunning && timeRemaining && (
              <div className="text-right">
                <div className="text-sm text-text-secondary">Осталось</div>
                <div className="text-xl font-bold text-tier-gold">{timeRemaining}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Задачи */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold mb-4">Задачи ({competition.tasks.length})</h2>

            <div className="space-y-4">
              {competition.tasks.map((ct, idx) => {
                const myLength = myLengths.get(ct.task.id);

                return (
                  <Card key={ct.id} padding="md" hover={isRunning}>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center font-bold text-text-muted">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {myLength !== undefined ? (
                            <CheckCircle className="w-4 h-4 text-accent-green" />
                          ) : (
                            <Circle className="w-4 h-4 text-text-muted" />
                          )}
                          <h3 className="font-semibold">{ct.task.title}</h3>
                          <TierBadge tier={ct.task.tier as TaskTier} />
                        </div>
                        <p className="text-sm text-text-secondary line-clamp-2">
                          {ct.task.statementMd.split('\n')[0]}
                        </p>
                        <code className="text-xs text-text-muted mt-2 block">
                          {ct.task.functionSignature}
                        </code>
                        {myLength !== undefined && (
                          <div className="text-xs text-accent-green mt-1.5">
                            В зачёте: <span className="font-mono font-bold">{myLength}</span> симв.
                          </div>
                        )}
                      </div>
                      {isRunning && (
                        <Link href={`/task/${ct.task.slug}?competition=${competition.id}`}>
                          <Button variant="primary" size="sm">
                            {myLength !== undefined ? 'Укоротить' : 'Решать'}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Важное предупреждение */}
            {isRunning && (
              <Card padding="md" className="mt-6 bg-accent-yellow/5 border-accent-yellow/30">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-accent-yellow flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-accent-yellow mb-1">
                      Решения скрыты до конца соревнования
                    </h3>
                    <p className="text-sm text-text-secondary">
                      Вкладка «Решения» будет доступна после завершения. Играй честно!
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <Card padding="md" className="mt-4">
              <h3 className="font-semibold mb-2">Как считается результат</h3>
              <ul className="text-sm text-text-secondary space-y-1">
                <li>• В зачёт идут только решения, отправленные во время соревнования.</li>
                <li>• По каждой задаче берётся самое короткое зачтённое решение.</li>
                <li>• Сначала сравниваем число решённых задач, потом сумму длин.</li>
              </ul>
            </Card>
          </div>

          {/* Лидерборд */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-tier-gold" />
              Лидерборд
            </h2>

            {myEntry && (
              <Card padding="md" className="mb-4 border-accent-blue/40 bg-accent-blue/5">
                <div className="text-sm text-text-secondary mb-1">Твой результат</div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold text-accent-blue">
                      {myPlace ? `#${myPlace}` : '—'}
                    </div>
                    <div className="text-xs text-text-muted">
                      {myEntry.tasksSolved}/{competition.tasks.length}{' '}
                      {pluralizeRu(competition.tasks.length, ['задача', 'задачи', 'задач'])}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-accent-green">
                      {myEntry.totalLength}
                    </div>
                    <div className="text-xs text-text-muted">символов всего</div>
                  </div>
                </div>
              </Card>
            )}

            <Card padding="md">
              {competition.entries.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-text-secondary mb-1">Пока нет участников</p>
                  <p className="text-xs text-text-muted">
                    {isRunning
                      ? 'Первое зачтённое решение сразу попадёт в таблицу.'
                      : 'В этом соревновании никто не отправил решений.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {competition.entries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-background-tertiary/50',
                        currentUser?.id === entry.user.id && 'bg-accent-blue/5'
                      )}
                    >
                      <span className={cn(
                        'w-6 text-center font-bold',
                        idx === 0 && 'text-tier-gold',
                        idx === 1 && 'text-tier-silver',
                        idx === 2 && 'text-tier-bronze',
                        idx > 2 && 'text-text-muted'
                      )}>
                        {idx + 1}
                      </span>
                      <Avatar
                        src={entry.user.avatarUrl}
                        name={entry.user.nickname || entry.user.displayName}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/u/${encodeURIComponent(entry.user.nickname || entry.user.id)}`}
                          className="font-medium truncate block hover:text-accent-blue transition-colors"
                        >
                          {entry.user.nickname || entry.user.displayName}
                        </Link>
                        <div className="text-xs text-text-muted">
                          {entry.tasksSolved}/{competition.tasks.length} задач
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-accent-green">
                          {entry.totalLength}
                        </div>
                        <div className="text-xs text-text-muted">символов</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border text-center text-sm text-text-secondary">
                <Users className="w-4 h-4 inline mr-1" />
                Всего участников: {competition._count.entries}
              </div>
            </Card>

            {!isRunning && !isUpcoming && (
              <Card padding="md" className="mt-4">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Clock className="w-4 h-4" />
                  Соревнование завершено {formatDate(endsAt)}
                </div>
              </Card>
            )}

            {/* Результаты */}
            {!isRunning && competition.resultsUrl && (
              <Card padding="md" className="mt-4">
                <h3 className="font-semibold mb-2">Официальные результаты</h3>
                <a
                  href={competition.resultsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-blue hover:underline"
                >
                  Смотреть на {competition.resultsUrl.includes('t.me') ? 'Telegram' : 'Stepik'}
                </a>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
