// src/app/tasks/page.tsx

import { prisma } from '@/lib/db';
import { TasksPageClient } from './TasksPageClient';
import type { TaskMode, TaskTier } from '@/types';

export const metadata = {
  title: 'Задачи — Арена однострочников',
  description: 'Список задач для тренировки Python однострочников. Bronze, Silver, Gold уровни сложности.',
};

export const revalidate = 60;

async function getTasks() {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: 'published' },
      orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        tier: true,
        mode: true,
        functionSignature: true,
        statementMd: true,
        _count: {
          select: { bestSubmissions: true },
        },
      },
    });

    // Получаем лучший результат по каждой задаче
    const tasksWithBest = await Promise.all(
      tasks.map(async (task) => {
        const bestSubmission = await prisma.bestSubmission.findFirst({
          where: { taskId: task.id },
          orderBy: [{ codeLength: 'asc' }, { achievedAt: 'asc' }],
          select: {
            codeLength: true,
            user: { select: { nickname: true, displayName: true } },
          },
        });

        return {
          id: task.id,
          slug: task.slug,
          title: task.title,
          tier: task.tier as TaskTier,
          mode: task.mode as TaskMode,
          functionSignature: task.functionSignature,
          statementMd: task.statementMd,
          participantsCount: task._count.bestSubmissions,
          bestLength: bestSubmission?.codeLength || null,
        };
      })
    );

    return tasksWithBest;
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }
}

export default async function TasksPage() {
  const tasks = await getTasks();

  const tierCounts = {
    all: tasks.length,
    bronze: tasks.filter((t) => t.tier === 'bronze').length,
    silver: tasks.filter((t) => t.tier === 'silver').length,
    gold: tasks.filter((t) => t.tier === 'gold').length,
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2">Задачи</h1>
          <p className="text-text-secondary">
            Тренируйся и совершенствуй навыки написания однострочников
          </p>
        </div>
      </div>

      <TasksPageClient tasks={tasks} tierCounts={tierCounts} />
    </div>
  );
}
