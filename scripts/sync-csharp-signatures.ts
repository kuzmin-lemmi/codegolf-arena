// scripts/sync-csharp-signatures.ts
// Проба C#: проставляет задачам C#-сигнатуры из prisma/csharp-signatures.json.
//
// Как импорт задач, по умолчанию только ЗАПОЛНЯЕТ пустое: сигнатуру, которую
// поправили в базе вручную, не трогает. Перезапись — осознанно:
//   CSHARP_SIGNATURES_OVERWRITE=true npm run db:tasks:csharp
//
// Перед записью проверяет задачу целиком: имена аргументов совпадают
// с питоновскими (условие читается одинаково), и КАЖДЫЙ тест, включая
// скрытые, укладывается в объявленные типы — иначе задача на C# сломалась бы
// у игроков, а не здесь.
//
// Запуск: npm run db:tasks:csharp  (деплой запускает сам)

import { readFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { checkValueFitsType, parseCsharpSignature } from '../src/lib/csharp';

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const OVERWRITE = process.env.CSHARP_SIGNATURES_OVERWRITE === 'true';

async function main() {
  const file = path.join(process.cwd(), 'prisma', 'csharp-signatures.json');
  const entries = Object.entries(JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>);

  let written = 0;
  let kept = 0;
  let problems = 0;

  for (const [slug, raw] of entries) {
    const json = JSON.stringify(raw);
    const signature = parseCsharpSignature(json);
    if (!signature) {
      console.error(`ERROR ${slug}: сигнатура в файле не разбирается`);
      problems += 1;
      continue;
    }

    const task = await prisma.task.findUnique({
      where: { slug },
      select: {
        id: true,
        functionArgs: true,
        csharpSignature: true,
        testcases: { select: { inputData: true, orderIndex: true } },
      },
    });
    if (!task) {
      console.warn(`WARN  ${slug}: задачи нет в базе — пропускаю`);
      continue;
    }

    const pythonArgs = JSON.parse(task.functionArgs) as string[];
    const names = signature.args.map((a) => a.name);
    if (names.join(',') !== pythonArgs.join(',')) {
      console.error(`ERROR ${slug}: аргументы ${names.join(', ')} не совпадают с питоновскими ${pythonArgs.join(', ')}`);
      problems += 1;
      continue;
    }

    const mismatch = task.testcases
      .map((tc) => {
        const args = (JSON.parse(tc.inputData) as { args?: unknown[] }).args || [];
        if (args.length !== signature.args.length) return `тест #${tc.orderIndex}: ${args.length} аргументов`;
        for (let i = 0; i < args.length; i++) {
          const problem = checkValueFitsType(args[i], signature.args[i].type);
          if (problem) return `тест #${tc.orderIndex}, ${signature.args[i].name}: ${problem}`;
        }
        return null;
      })
      .find(Boolean);
    if (mismatch) {
      console.error(`ERROR ${slug}: ${mismatch}`);
      problems += 1;
      continue;
    }

    if (task.csharpSignature && !OVERWRITE) {
      if (task.csharpSignature !== json) {
        console.log(`KEEP  ${slug}: в базе своя сигнатура, не трогаю`);
      }
      kept += 1;
      continue;
    }

    await prisma.task.update({ where: { id: task.id }, data: { csharpSignature: json } });
    console.log(`OK    ${slug}: ${json}`);
    written += 1;
  }

  console.log(`C#-сигнатуры: записано ${written}, уже были ${kept}, с ошибками ${problems}`);
  if (problems > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
