// src/app/tasks/page.tsx

import { prisma } from '@/lib/db';
import { TasksPageClient } from './TasksPageClient';
import type { TaskMode, TaskTier } from '@/types';
import { normalizeTaskTopics } from '@/lib/task-topics';
import { getTaskLanguages } from '@/lib/language-settings';
import { isLanguage, type Language } from '@/lib/languages';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // Название сайта к заголовку добавляет шаблон в layout.tsx
  title: 'Задачи',
  description:
    'Задачи для однострочников на Python, JavaScript и C#. Bronze, Silver, Gold уровни сложности.',
  alternates: {
    canonical: '/tasks',
  },
};

export const revalidate = 60;

async function getTasks() {
  try {
    const [tasks, bestRows, participantRows] = await Promise.all([
      prisma.task.findMany({
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
          constraintsJson: true,
          csharpSignature: true,
          createdAt: true,
        },
      }),
      // Лучшая длина по каждой задаче — отдельно на каждом языке
      prisma.bestSubmission.groupBy({
        by: ['taskId', 'language'],
        _min: { codeLength: true },
      }),
      // Участник задачи — кто решил её хотя бы на одном языке
      prisma.$queryRaw<Array<{ taskId: string; participants: bigint }>>`
        SELECT task_id AS "taskId", COUNT(DISTINCT user_id) AS "participants"
        FROM best_submissions
        GROUP BY task_id
      `,
    ]);

    const bestByTask = new Map<string, Partial<Record<Language, number>>>();
    for (const row of bestRows) {
      if (!isLanguage(row.language) || row._min.codeLength === null) continue;
      const bests = bestByTask.get(row.taskId) ?? {};
      bests[row.language] = row._min.codeLength;
      bestByTask.set(row.taskId, bests);
    }
    const participantsByTask = new Map(participantRows.map((row) => [row.taskId, Number(row.participants)]));

    return tasks.map((task) => ({
      id: task.id,
      slug: task.slug,
      title: task.title,
      tier: task.tier as TaskTier,
      mode: task.mode as TaskMode,
      functionSignature: task.functionSignature,
      statementMd: task.statementMd,
      topics: getTaskTopics(task.constraintsJson),
      createdAt: task.createdAt,
      participantsCount: participantsByTask.get(task.id) ?? 0,
      bests: bestByTask.get(task.id) ?? {},
      languages: getTaskLanguages(task),
    }));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }
}

function getTaskTopics(constraintsJson: string): string[] {
  try {
    const parsed = JSON.parse(constraintsJson) as { topics?: unknown };
    if (!Array.isArray(parsed.topics)) return [];
    return normalizeTaskTopics(parsed.topics, 8);
  } catch {
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
