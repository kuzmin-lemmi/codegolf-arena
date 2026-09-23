/**
 * Пересчитывает результаты всех соревнований из истории попыток.
 *
 * Зачем: страница соревнования была нарисована, но в competition_entries
 * никто ничего не писал — лидерборд всегда показывал «нет участников».
 * Теперь подсчёт идёт при каждой зачтённой отправке, а этот скрипт
 * восстанавливает результаты прошедших соревнований.
 *
 * Запуск: npm run db:competitions:backfill
 */

import { PrismaClient } from '@prisma/client';
import { recomputeCompetitionEntry } from '../src/lib/competitions';

const prisma = new PrismaClient();

async function main() {
  const competitions = await prisma.competition.findMany({
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      tasks: { select: { taskId: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  console.log(`competitions: ${competitions.length}`);

  for (const competition of competitions) {
    const taskIds = competition.tasks.map((task) => task.taskId);

    if (taskIds.length === 0) {
      console.log(`- ${competition.title}: нет задач, пропускаем`);
      continue;
    }

    // Все, кто отправлял зачтённые решения внутри окна соревнования
    const participants = await prisma.submission.findMany({
      where: {
        taskId: { in: taskIds },
        // Соревнования пока только на Python (src/lib/competitions.ts)
        language: 'python',
        status: 'pass',
        createdAt: { gte: competition.startsAt, lte: competition.endsAt },
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    let entries = 0;
    for (const participant of participants) {
      const totals = await recomputeCompetitionEntry(prisma, {
        competitionId: competition.id,
        userId: participant.userId,
      });

      if (totals && totals.tasksSolved > 0) {
        entries += 1;
      }
    }

    // Строки участников, которые ничего не решали (например, после правок задач)
    const stale = await prisma.competitionEntry.deleteMany({
      where: {
        competitionId: competition.id,
        userId: { notIn: participants.map((p) => p.userId) },
      },
    });

    console.log(
      `- ${competition.title}: участников ${entries}, удалено пустых записей ${stale.count}`
    );
  }

  console.log('done');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
