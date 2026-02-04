// src/app/task/[slug]/page.tsx

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { TaskStatement } from '@/components/task/TaskStatement';
import { TaskTabs } from '@/components/task/TaskTabs';
import { TaskPageClient } from './TaskPageClient';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';

interface TaskPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const task = await prisma.task.findUnique({
    where: { slug: params.slug },
    select: { title: true, status: true },
  });

  if (!task || task.status !== 'published') {
    return { title: 'Задача не найдена' };
  }

  return {
    title: `${task.title} — Арена однострочников`,
    description: `Реши задачу "${task.title}" в одну строку на Python. Code golf соревнование.`,
  };
}

export default async function TaskPage({ params }: TaskPageProps) {
  const task = await prisma.task.findUnique({
    where: { slug: params.slug },
    include: {
      testcases: {
        where: { isHidden: false },
        orderBy: { orderIndex: 'asc' },
        select: {
          inputData: true,
          expectedOutput: true,
          orderIndex: true,
        },
      },
    },
  });

  if (!task || task.status !== 'published') {
    notFound();
  }

  const leaderboardEntries = await prisma.bestSubmission.findMany({
    where: { taskId: task.id },
    orderBy: [{ codeLength: 'asc' }, { achievedAt: 'asc' }],
    take: 50,
    include: {
      user: {
        select: {
          nickname: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const leaderboard = leaderboardEntries.map((entry, index) => ({
    rank: index + 1,
    nickname: entry.user.nickname || entry.user.displayName,
    avatarUrl: entry.user.avatarUrl,
    codeLength: entry.codeLength,
    achievedAt: entry.achievedAt,
  }));

  const taskData = {
    ...task,
    functionArgs: JSON.parse(task.functionArgs),
    constraintsJson: JSON.parse(task.constraintsJson),
  };

  const openTestcases = task.testcases.map((tc) => ({
    inputData: JSON.parse(tc.inputData),
    expectedOutput: tc.expectedOutput,
  }));

  const canViewSolutions = false;
  const currentUserRank = undefined;
  const solutions: Array<{ rank: number; nickname: string; code: string; codeLength: number; achievedAt: Date }> = [];

  return (
    <div className="min-h-screen pb-12">
      {/* Back link */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-3">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к задачам
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left Column - Task Statement (sticky) */}
          <div className="lg:sticky lg:top-20">
            <Card padding="lg">
              <TaskStatement task={taskData} />
            </Card>
          </div>

          {/* Right Column - Editor + Results (Client Component) */}
          <div className="space-y-6">
              <TaskPageClient
                taskSlug={params.slug}
                functionArgs={taskData.functionArgs}
                testcases={openTestcases}
                allowedImports={taskData.constraintsJson.allowed_imports || []}
              />

            {/* Tabs: Leaderboard / Solutions */}
            <Card padding="lg">
              <TaskTabs
                leaderboard={leaderboard}
                solutions={solutions}
                canViewSolutions={canViewSolutions}
                currentUserRank={currentUserRank}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
