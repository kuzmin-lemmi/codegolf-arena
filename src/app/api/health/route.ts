// src/app/api/health/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      success: true,
      data: {
        ok: true,
        ts: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Health check failed',
        data: {
          ok: false,
          ts: new Date().toISOString(),
        },
      },
      { status: 503 }
    );
  }
}
