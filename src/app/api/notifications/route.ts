// src/app/api/notifications/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { renderNotification } from '@/lib/notifications';

const MAX_ITEMS = 20;

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: currentUser.id },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        select: {
          id: true,
          type: true,
          payloadJson: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: { userId: currentUser.id, readAt: null },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        unreadCount,
        items: rows.map(renderNotification),
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
