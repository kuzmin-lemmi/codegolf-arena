import { PrismaClient } from '@prisma/client';
import { inferTaskTopics, normalizeTaskTopics } from '../src/lib/task-topics';

const prisma = new PrismaClient();

async function main() {
  const rewrite = process.env.TOPICS_REWRITE === 'true';
  const tasks = await prisma.task.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      statementMd: true,
      functionSignature: true,
      constraintsJson: true,
    },
  });

  let updated = 0;

  for (const task of tasks) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(task.constraintsJson) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const existing = Array.isArray(parsed.topics) ? normalizeTaskTopics(parsed.topics, 8) : [];
    const inferred = inferTaskTopics({
      slug: task.slug,
      title: task.title,
      statement: task.statementMd,
      signature: task.functionSignature,
    });

    const merged = rewrite
      ? normalizeTaskTopics(inferred, 8)
      : normalizeTaskTopics([...existing, ...inferred], 8);
    const previous = JSON.stringify(existing);
    const next = JSON.stringify(merged);
    if (previous === next) continue;

    parsed.topics = merged;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        constraintsJson: JSON.stringify(parsed),
      },
    });

    updated += 1;
    console.log(`updated ${task.slug}: ${merged.join(', ')}`);
  }

  console.log(`done, updated tasks: ${updated}/${tasks.length}, rewrite=${rewrite}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
