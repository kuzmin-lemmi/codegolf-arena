// scripts/import-tasks-from-export.ts
// Импортирует задачи из codegolf_tasks.json (формат экспорта из БД).
// Безопасно: использует upsert по slug, не удаляет чужие задачи.

import { readFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

interface RawTestcase {
  inputData: { args: unknown[] };
  expectedOutput: string;
  orderIndex: number;
  // В выгрузке поля может не быть — тогда скрытость определяется по номеру
  isHidden?: boolean;
}

interface RawTask {
  slug: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  mode: 'practice' | 'tournament';
  statementMd: string;
  functionSignature: string;
  functionArgs: string[];
  exampleInput: string;
  exampleOutput: string;
  constraintsJson: Record<string, unknown>;
  status?: 'draft' | 'published' | 'archived';
  testcases: RawTestcase[];
}

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'codegolf_tasks.json');
  console.log(`Reading: ${jsonPath}`);

  const raw = await readFile(jsonPath, 'utf8');
  const tasks = JSON.parse(raw) as RawTask[];

  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('codegolf_tasks.json is empty or invalid');
  }

  console.log(`Found ${tasks.length} tasks`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const task of tasks) {
    if (!task.slug || !task.title || !task.statementMd || !task.functionSignature) {
      console.warn(`  SKIP invalid task: ${task.slug || 'unknown'}`);
      skipped += 1;
      continue;
    }

    if (!Array.isArray(task.testcases) || task.testcases.length === 0) {
      console.warn(`  SKIP task without testcases: ${task.slug}`);
      skipped += 1;
      continue;
    }

    // Сохраняем constraintsJson как есть, но гарантируем поля envs и default_env
    const rawConstraints = task.constraintsJson || {};
    const envs: string[] = Array.isArray(rawConstraints.envs)
      ? (rawConstraints.envs as string[])
      : (rawConstraints.allowed_imports && (rawConstraints.allowed_imports as string[]).length > 0
          ? ['base', ...(rawConstraints.allowed_imports as string[])]
          : ['base']);
    const defaultEnv: string =
      typeof rawConstraints.default_env === 'string' && rawConstraints.default_env
        ? rawConstraints.default_env
        : envs[0] || 'base';

    const mergedConstraints = {
      forbidden_tokens: [';', 'eval', 'exec', '__import__'],
      allowed_imports: [],
      timeout_ms: 2000,
      topics: [],
      ...rawConstraints,
      envs,
      default_env: defaultEnv,
    };
    const constraintsJson = JSON.stringify(mergedConstraints);

    const functionArgs = JSON.stringify(
      Array.isArray(task.functionArgs) ? task.functionArgs : ['x']
    );

    const payload = {
      title: task.title,
      tier: task.tier || 'bronze',
      mode: task.mode || 'practice',
      statementMd: task.statementMd,
      functionSignature: task.functionSignature,
      functionArgs,
      exampleInput: task.exampleInput || '',
      exampleOutput: task.exampleOutput || '',
      constraintsJson,
      status: (task.status || 'published') as 'draft' | 'published' | 'archived',
    };

    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.task.findUnique({
          where: { slug: task.slug },
          select: { id: true },
        });

        const saved = existing
          ? await tx.task.update({ where: { id: existing.id }, data: payload })
          : await tx.task.create({ data: { ...payload, slug: task.slug } });

        // Пересоздаём тест-кейсы
        await tx.testcase.deleteMany({ where: { taskId: saved.id } });
        await tx.testcase.createMany({
          data: task.testcases.map((tc, idx) => ({
            taskId: saved.id,
            inputData: JSON.stringify(tc.inputData),
            expectedOutput: String(tc.expectedOutput),
            // Первые три теста открытые (для отладки), остальные скрытые:
            // иначе правильные ответы уходят в браузер игрока
            isHidden: typeof tc.isHidden === 'boolean' ? tc.isHidden : idx >= 3,
            orderIndex: typeof tc.orderIndex === 'number' ? tc.orderIndex : idx,
          })),
        });

        if (existing) {
          updated += 1;
          console.log(`  updated: ${task.slug} (${task.testcases.length} tests)`);
        } else {
          created += 1;
          console.log(`  created: ${task.slug} (${task.testcases.length} tests)`);
        }
      });
    } catch (err) {
      console.error(`  ERROR on ${task.slug}:`, err);
      skipped += 1;
    }
  }

  console.log('');
  console.log(`Done: created=${created}, updated=${updated}, skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
