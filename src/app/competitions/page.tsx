// src/app/competitions/page.tsx

import Link from 'next/link';
import { Trophy, Calendar, Users, Clock, ArrowRight, Lock } from 'lucide-react';
import { Card, Button, TierBadge } from '@/components/ui';
import { prisma } from '@/lib/db';
import { formatDate, formatTimeRemaining } from '@/lib/utils';
import type { TaskTier } from '@/types';

export const metadata = {
  title: 'Соревнования — Арена однострочников',
  description: 'Соревнования по Python однострочникам. Реши задачи быстрее всех!',
};

export const revalidate = 60;

async function getCompetitions() {
  try {
    const now = new Date();

    // Активные соревнования
    const active = await prisma.competition.findMany({
      where: {
        isActive: true,
        endsAt: { gt: now },
      },
      include: {
        tasks: {
          include: { task: { select: { title: true, tier: true } } },
          orderBy: { orderIndex: 'asc' },
        },
        _count: { select: { entries: true } },
      },
      orderBy: { endsAt: 'asc' },
    });

    // Завершённые соревнования
    const finished = await prisma.competition.findMany({
      where: {
        OR: [
          { isActive: false },
          { endsAt: { lte: now } },
        ],
      },
      include: {
        tasks: {
          include: { task: { select: { title: true, tier: true } } },
        },
        _count: { select: { entries: true } },
      },
      orderBy: { endsAt: 'desc' },
      take: 10,
    });

    return { active, finished };
  } catch (error) {
    console.error('Error fetching competitions:', error);
    return { active: [], finished: [] };
  }
}

export default async function CompetitionsPage() {
  const { active, finished } = await getCompetitions();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-tier-gold" />
            Соревнования
          </h1>
          <p className="text-text-secondary">
            Реши задачи за ограниченное время. Решения других скрыты до конца!
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Активные соревнования */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-green" />
            Активные соревнования
          </h2>

          {active.length === 0 ? (
            <Card padding="lg" className="text-center">
              <Trophy className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <h3 className="text-lg font-semibold mb-2">Нет активных соревнований</h3>
              <p className="text-text-secondary">
                Следите за анонсами! Скоро будут новые соревнования.
              </p>
            </Card>
          ) : (
            <div className="grid gap-6">
              {active.map((comp) => (
                <CompetitionCard key={comp.id} competition={comp} isActive />
              ))}
            </div>
          )}
        </section>

        {/* Завершённые соревнования */}
        {finished.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-text-muted" />
              Завершённые
            </h2>

            <div className="grid gap-4">
              {finished.map((comp) => (
                <CompetitionCard key={comp.id} competition={comp} isActive={false} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function CompetitionCard({ 
  competition, 
  isActive 
}: { 
  competition: any; 
  isActive: boolean; 
}) {
  const timeRemaining = isActive 
    ? formatTimeRemaining(new Date(competition.endsAt))
    : null;

  return (
    <Card 
      padding="lg" 
      className={isActive ? 'border-tier-gold/30 bg-gradient-to-br from-tier-gold/5 to-transparent' : ''}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {isActive && (
              <span className="px-2 py-0.5 bg-accent-green/20 text-accent-green text-xs font-medium rounded">
                АКТИВНО
              </span>
            )}
            <h3 className="text-xl font-bold">{competition.title}</h3>
          </div>

          {competition.description && (
            <p className="text-text-secondary mb-3">{competition.description}</p>
          )}

          {/* Задачи */}
          <div className="flex flex-wrap gap-2 mb-3">
            {competition.tasks.map((ct: any) => (
              <span 
                key={ct.id} 
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-background-tertiary rounded text-sm"
              >
                <TierBadge tier={ct.task.tier as TaskTier} className="text-xs" />
                {ct.task.title}
              </span>
            ))}
          </div>

          {/* Мета */}
          <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {competition._count.entries} участников
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(competition.endsAt)}
            </span>
            {isActive && timeRemaining && (
              <span className="flex items-center gap-1 text-tier-gold font-medium">
                <Clock className="w-4 h-4" />
                Осталось: {timeRemaining}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {isActive ? (
            <Link href={`/competitions/${competition.id}`}>
              <Button variant="primary">
                Участвовать
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <>
              {competition.resultsUrl ? (
                <a href={competition.resultsUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary">
                    Результаты
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Button variant="ghost" disabled>
                  <Lock className="w-4 h-4" />
                  Завершено
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
