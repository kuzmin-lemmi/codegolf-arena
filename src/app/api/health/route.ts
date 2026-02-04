// src/app/api/health/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const startTime = Date.now();

  try {
    // Проверяем подключение к БД
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    // Проверяем Piston API
    let pistonStatus = 'unknown';
    let pistonLatency = 0;
    
    try {
      const pistonStart = Date.now();
      const pistonUrl = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';
      const res = await fetch(`${pistonUrl}/runtimes`, { 
        signal: AbortSignal.timeout(5000) 
      });
      pistonLatency = Date.now() - pistonStart;
      pistonStatus = res.ok ? 'ok' : 'error';
    } catch {
      pistonStatus = 'unavailable';
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: {
          status: 'ok',
          latency: `${dbLatency}ms`,
        },
        piston: {
          status: pistonStatus,
          latency: pistonLatency > 0 ? `${pistonLatency}ms` : null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
      },
      { status: 503 }
    );
  }
}
