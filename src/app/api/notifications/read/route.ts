// src/app/api/notifications/read/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { validateMutationRequest } from '@/lib/security';

const MAX_IDS = 50;

// POST - отметить уведомления прочитанными (без ids — все непрочитанные)
export async function POST(request: NextRequest) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let ids: string[] | null = null;
    try {
      const body = await request.json();
      if (Array.isArray(body?.ids)) {
        ids = body.ids.filter((id: unknown): id is string => typeof id === 'string').slice(0, MAX_IDS);
      }
    } catch {
      // Пустое тело — считаем, что нужно отметить всё
      ids = null;
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId: currentUser.id,
        readAt: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: { updated: result.count },
    });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications read' },
      { status: 500 }
    );
  }
}
