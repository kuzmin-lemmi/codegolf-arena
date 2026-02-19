// src/app/api/health/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PISTON_API_URL = process.env.PISTON_API_URL || 'http://127.0.0.1:2000/api/v2';

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
  const pythonRuntime = runtimes.find((runtime) => runtime.language === 'python');

  return {
    ok: true,
    pythonVersion: pythonRuntime?.version || null,
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
            : { ok: false, error: 'Piston unavailable' },
        ts: new Date().toISOString(),
      },
    },
    { status: ok ? 200 : 503 }
  );
}
