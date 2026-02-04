// src/app/api/admin/weekly/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

// GET - текущий турнир недели
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const weeklyChallenge = await prisma.weeklyChallenge.findFirst({
      where: { isActive: true },
      include: {
        task: {
          select: {
            id: true,
            slug: true,
            title: true,
            tier: true,
            mode: true,
          },
        },
        _count: {
          select: {
            task: {
              select: {
                bestSubmissions: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: weeklyChallenge,
    });
  } catch (error) {
    console.error('Error fetching weekly challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch weekly challenge' },
      { status: 500 }
    );
  }
}

// POST - создание/обновление турнира недели
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { taskId, startsAt, endsAt, isActive } = body;

    // Валидация
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      );
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (startDate >= endDate) {
      return NextResponse.json(
        { success: false, error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Проверяем, что задача существует
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Деактивируем предыдущий турнир
    await prisma.weeklyChallenge.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Создаём новый турнир
    const weeklyChallenge = await prisma.weeklyChallenge.create({
      data: {
        taskId,
        startsAt: startDate,
        endsAt: endDate,
        isActive: isActive ?? true,
      },
      include: {
        task: {
          select: {
            id: true,
            slug: true,
            title: true,
            tier: true,
          },
        },
      },
    });

    // Обновляем режим задачи на tournament
    await prisma.task.update({
      where: { id: taskId },
      data: { mode: 'tournament' },
    });

    return NextResponse.json({
      success: true,
      data: weeklyChallenge,
    });
  } catch (error) {
    console.error('Error creating weekly challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create weekly challenge' },
      { status: 500 }
    );
  }
}

// PATCH - обновление статуса турнира
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { id, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Challenge ID is required' },
        { status: 400 }
      );
    }

    const weeklyChallenge = await prisma.weeklyChallenge.update({
      where: { id },
      data: { isActive },
    });

    return NextResponse.json({
      success: true,
      data: weeklyChallenge,
    });
  } catch (error) {
    console.error('Error updating weekly challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update weekly challenge' },
      { status: 500 }
    );
  }
}
