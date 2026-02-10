// src/app/task/[slug]/page.tsx

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { TaskStatement } from '@/components/task/TaskStatement';
import { TaskPageClient } from './TaskPageClient';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import type { Task, TaskConstraints, TaskMode, TaskStatus, TaskTier } from '@/types';

interface TaskPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const { slug } = await params;

  const task = await prisma.task.findUnique({
    where: { slug },
    select: { title: true, status: true, statementMd: true },
  });

  if (!task || task.status !== 'published') {
    return { title: 'Задача не найдена' };
  }

  const description = `Реши задачу "${task.title}" в одну строку на Python. ${task.statementMd.slice(0, 120)}`;

  return {
    title: `${task.title} — Арена однострочников`,
    description,
    alternates: {
      canonical: `/task/${slug}`,
    },
    openGraph: {
      title: `${task.title} — Арена однострочников`,
      description,
      type: 'article',
      url: `https://codegolf.ru/task/${slug}`,
      siteName: 'Арена однострочников',
    },
    twitter: {
      card: 'summary',
      title: `${task.title} — Арена однострочников`,
      description,
    },
  };
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { slug } = await params;

  const task = await prisma.task.findUnique({
    where: { slug },
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

  const taskData: Task = {
    id: task.id,
    slug: task.slug,
    title: task.title,
    statementMd: task.statementMd,
    functionSignature: task.functionSignature,
    functionArgs: JSON.parse(task.functionArgs) as string[],
    constraintsJson: JSON.parse(task.constraintsJson) as TaskConstraints,
    mode: task.mode as TaskMode,
    tier: task.tier as TaskTier,
    status: task.status as TaskStatus,
    exampleInput: task.exampleInput,
    exampleOutput: task.exampleOutput,
    createdAt: task.createdAt,
  };

  const openTestcases = task.testcases.map((tc) => ({
    inputData: JSON.parse(tc.inputData),
    expectedOutput: tc.expectedOutput,
  }));

  const currentUserRank = undefined;

  let nextTask = await prisma.task.findFirst({
    where: {
      status: 'published',
      NOT: { id: task.id },
      createdAt: { gt: task.createdAt },
    },
    orderBy: { createdAt: 'asc' },
    select: { slug: true, title: true },
  });

  if (!nextTask) {
    nextTask = await prisma.task.findFirst({
      where: {
        status: 'published',
        NOT: { id: task.id },
      },
      orderBy: { createdAt: 'asc' },
      select: { slug: true, title: true },
    });
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Back link */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-3">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-2 text-sm text-accent-blue hover:text-white transition-colors font-mono uppercase"
          >
            <ArrowLeft className="w-4 h-4 text-accent-blue" />
            НАЗАД К ЗАДАЧАМ
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid lg:grid-cols-2 gap-6 md:gap-8 items-start">
          {/* Left Column - Task Statement (sticky) */}
          <div className="order-2 lg:order-1 lg:sticky lg:top-20">
            <Card padding="lg">
              <TaskStatement task={taskData} />
            </Card>
          </div>

          {/* Right Column - Editor + Results (Client Component) */}
            <div className="order-1 lg:order-2 space-y-6">
              <TaskPageClient
                taskSlug={slug}
                taskTitle={taskData.title}
                nextTask={nextTask}
                functionArgs={taskData.functionArgs}
                testcases={openTestcases}
                allowedImports={taskData.constraintsJson.allowed_imports || []}
                leaderboard={leaderboard}
                currentUserRank={currentUserRank}
              />
            </div>
        </div>
      </div>
    </div>
  );
}
