// src/app/competitions/[id]/page.tsx

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy, Clock, Users, Lock, CheckCircle, Circle } from 'lucide-react';
import { Card, Button, TierBadge, Avatar } from '@/components/ui';
import { prisma } from '@/lib/db';
import { formatTimeRemaining, cn } from '@/lib/utils';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  const competition = await prisma.competition.findUnique({
    where: { id: params.id },
    select: { title: true },
  });

  if (!competition) {
    return { title: 'Соревнование не найдено' };
  }

  return {
    title: `${competition.title} — Арена однострочников`,
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
              select: { nickname: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: [
            { tasksSolved: 'desc' },
            { totalLength: 'asc' },
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
  const competition = await getCompetition(params.id);

  if (!competition) {
    notFound();
  }

  const now = new Date();
  const isActive = competition.isActive && new Date(competition.endsAt) > now;
  const timeRemaining = isActive ? formatTimeRemaining(new Date(competition.endsAt)) : null;

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
                {isActive && (
                  <span className="px-2 py-0.5 bg-accent-green/20 text-accent-green text-xs font-medium rounded">
                    АКТИВНО
                  </span>
                )}
                <h1 className="text-2xl font-bold">{competition.title}</h1>
              </div>
              {competition.description && (
                <p className="text-text-secondary">{competition.description}</p>
              )}
            </div>

            {isActive && timeRemaining && (
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
              {competition.tasks.map((ct, idx) => (
                <Card key={ct.id} padding="md" hover={isActive}>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center font-bold text-text-muted">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Circle className="w-4 h-4 text-text-muted" />
                        <h3 className="font-semibold">{ct.task.title}</h3>
                        <TierBadge tier={ct.task.tier} />
                      </div>
                      <p className="text-sm text-text-secondary line-clamp-2">
                        {ct.task.statementMd.split('\n')[0]}
                      </p>
                      <code className="text-xs text-text-muted mt-2 block">
                        {ct.task.functionSignature}
                      </code>
                    </div>
                    {isActive && (
                      <Link href={`/task/${ct.task.slug}?competition=${competition.id}`}>
                        <Button variant="primary" size="sm">
                          Решать
                        </Button>
                      </Link>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Важное предупреждение */}
            {isActive && (
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
          </div>

          {/* Лидерборд */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-tier-gold" />
              Лидерборд
            </h2>

            <Card padding="md">
              {competition.entries.length === 0 ? (
                <p className="text-text-secondary text-center py-4">
                  Пока нет участников
                </p>
              ) : (
                <div className="space-y-2">
                  {competition.entries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-background-tertiary/50 transition-colors"
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
                        <div className="font-medium truncate">
                          {entry.user.nickname || entry.user.displayName}
                        </div>
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

            {/* Результаты */}
            {!isActive && competition.resultsUrl && (
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
