import { readFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { normalizeTaskTopics } from '../src/lib/task-topics';

type RawTask = {
  slug: string;
  title: string;
  description: string;
  signature: string;
  constraints?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | string;
  tags?: string[];
  examples?: Array<{ input: unknown; output: unknown }>;
  tests?: Array<{ input: unknown; expected: unknown }>;
};

const prisma = new PrismaClient();

function toTier(difficulty: RawTask['difficulty']): 'bronze' | 'silver' | 'gold' {
  if (difficulty === 'hard') return 'gold';
  if (difficulty === 'medium') return 'silver';
  return 'bronze';
}

function parseFunctionArgs(signature: string): string[] {
  const match = signature.match(/solution\s*\(([^)]*)\)/i);
  if (!match) return ['x'];

  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(':')[0]?.trim())
    .filter((arg): arg is string => Boolean(arg));
}

function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') {
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => pyRepr(item)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(', ')}}`;
  }
  return String(value);
}

function expectedToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return 'None';
  return pyRepr(value);
}

function inputToArgs(input: unknown, argCount: number): unknown[] {
  if (argCount <= 1) return [input];
  if (Array.isArray(input)) return input;
  return [input];
}

function formatExampleInput(input: unknown, argCount: number): string {
  const args = inputToArgs(input, argCount);
  return args.map((arg) => pyRepr(arg)).join(', ');
}

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'codegolf_tasks.json');
  const raw = await readFile(jsonPath, 'utf8');
  const tasks = JSON.parse(raw) as RawTask[];

  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('codegolf_tasks.json is empty or invalid');
  }

  let created = 0;
  let updated = 0;

  for (const task of tasks) {
    if (!task.slug || !task.title || !task.signature || !task.description) {
      console.warn(`skip invalid task: ${task.slug || 'unknown'}`);
      continue;
    }

    const functionArgs = parseFunctionArgs(task.signature);
    const tests = Array.isArray(task.tests) ? task.tests : [];
    if (tests.length === 0) {
      console.warn(`skip task without tests: ${task.slug}`);
      continue;
    }

    const topics = normalizeTaskTopics(Array.isArray(task.tags) ? task.tags : [], 8);
    const firstExample = Array.isArray(task.examples) ? task.examples[0] : undefined;
    const exampleInput = firstExample
      ? formatExampleInput(firstExample.input, functionArgs.length)
      : formatExampleInput(tests[0].input, functionArgs.length);
    const exampleOutput = firstExample
      ? expectedToString(firstExample.output)
      : expectedToString(tests[0].expected);

    const existing = await prisma.task.findUnique({
      where: { slug: task.slug },
      select: { id: true, constraintsJson: true },
    });

    let existingConstraints: { allowed_imports?: string[]; timeout_ms?: number } = {};
    if (existing?.constraintsJson) {
      try {
        existingConstraints = JSON.parse(existing.constraintsJson);
      } catch {
        existingConstraints = {};
      }
    }

    const payload = {
      slug: task.slug,
      title: task.title,
      tier: toTier(task.difficulty),
      mode: 'practice' as const,
      statementMd: task.description,
      functionSignature: task.signature,
      functionArgs: JSON.stringify(functionArgs),
      exampleInput,
      exampleOutput,
      constraintsJson: JSON.stringify({
        forbidden_tokens: [';', 'eval', 'exec', '__import__'],
        allowed_imports: Array.isArray(existingConstraints.allowed_imports)
          ? existingConstraints.allowed_imports
          : [],
        timeout_ms: Number(existingConstraints.timeout_ms || 2000),
        topics,
      }),
      status: 'published' as const,
    };

    await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.task.update({ where: { id: existing.id }, data: payload })
        : await tx.task.create({ data: payload });

      await tx.testcase.deleteMany({ where: { taskId: saved.id } });
      await tx.testcase.createMany({
        data: tests.map((test, index) => ({
          taskId: saved.id,
          inputData: JSON.stringify({ args: inputToArgs(test.input, functionArgs.length) }),
          expectedOutput: expectedToString(test.expected),
          isHidden: index >= 3,
          orderIndex: index,
        })),
      });
    });

    if (existing) {
      updated += 1;
      console.log(`updated: ${task.slug}`);
    } else {
      created += 1;
      console.log(`created: ${task.slug}`);
    }
  }

  console.log(`done: created=${created}, updated=${updated}, total=${tasks.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
