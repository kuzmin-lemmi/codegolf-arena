// src/app/api/health/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PISTON_API_URL, PISTON_PYTHON_VERSION } from '@/lib/piston';
import { CSHARP_PISTON_LANGUAGE, CSHARP_PISTON_VERSION, isCsharpEnabled } from '@/lib/csharp-runner';

export const dynamic = 'force-dynamic';

async function checkPiston() {
  const endpoint = `${PISTON_API_URL.replace(/\/$/, '')}/runtimes`;
  const response = await fetch(endpoint, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Piston check failed with status ${response.status}`);
  }

  const runtimes = (await response.json()) as Array<{ language?: string; version?: string }>;
  // Нужна именно та версия, которую запрашивает раннер: если её нет, все
  // отправки падают, хотя сам Piston отвечает — такое должно быть видно здесь
  const pythonRuntime = runtimes.find(
    (runtime) =>
      runtime.language === 'python' &&
      (runtime.version === PISTON_PYTHON_VERSION ||
        runtime.version?.startsWith(`${PISTON_PYTHON_VERSION}.`))
  );

  if (!pythonRuntime) {
    throw new Error(`Python ${PISTON_PYTHON_VERSION} is not installed in Piston`);
  }

  // Проба C#: пока C# выключен, его отсутствие в раннере — не поломка
  const csharpRuntime = runtimes.find(
    (runtime) => runtime.language === CSHARP_PISTON_LANGUAGE && runtime.version === CSHARP_PISTON_VERSION
  );
  if (isCsharpEnabled() && !csharpRuntime) {
    throw new Error(`C# ${CSHARP_PISTON_VERSION} is not installed in Piston`);
  }

  return {
    ok: true,
    pythonVersion: pythonRuntime.version || null,
    csharpVersion: csharpRuntime?.version || null,
    csharpEnabled: isCsharpEnabled(),
    runtimesCount: runtimes.length,
  };
}

export async function GET() {
  const [dbState, pistonState] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkPiston(),
  ]);

  const dbOk = dbState.status === 'fulfilled';
  const pistonOk = pistonState.status === 'fulfilled';
  const ok = dbOk && pistonOk;

  return NextResponse.json(
    {
      success: ok,
      ...(ok ? {} : { error: 'Health check failed' }),
      data: {
        ok,
        db: dbOk ? { ok: true } : { ok: false },
        piston:
          pistonState.status === 'fulfilled'
            ? pistonState.value
            : {
                ok: false,
                // «Нет нужной версии Python / C#» показываем как есть: это безопасно
                // и сразу подсказывает, что делать (npm run dev:piston)
                error:
                  pistonState.reason instanceof Error &&
                  pistonState.reason.message.includes('is not installed')
                    ? pistonState.reason.message
                    : 'Piston unavailable',
              },
        ts: new Date().toISOString(),
      },
    },
    { status: ok ? 200 : 503 }
  );
}
