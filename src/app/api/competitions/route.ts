// src/app/api/competitions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { validateMutationRequest } from '@/lib/security';

// GET - список соревнований
export async function GET() {
  try {
    const competitions = await prisma.competition.findMany({
      include: {
        tasks: {
          include: { task: { select: { title: true, tier: true, slug: true } } },
          orderBy: { orderIndex: 'asc' },
        },
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: competitions,
    });
  } catch (error) {
    console.error('Error fetching competitions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch competitions' },
      { status: 500 }
    );
  }
}

// POST - создание соревнования (только админ)
export async function POST(request: NextRequest) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { title, description, startsAt, endsAt, taskIds, resultsUrl, showSolutions } = body;

    // Валидация
    if (!title || !startsAt || !endsAt) {
      return NextResponse.json(
        { success: false, error: 'Title, startsAt, and endsAt are required' },
        { status: 400 }
      );
    }

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one task is required' },
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

    // Создаём соревнование
    const competition = await prisma.competition.create({
      data: {
        title,
        description: description || null,
        startsAt: startDate,
        endsAt: endDate,
        resultsUrl: resultsUrl || null,
        isActive: true,
        showSolutions: !!showSolutions,
        tasks: {
          create: taskIds.map((taskId: string, index: number) => ({
            taskId,
            orderIndex: index,
          })),
        },
      },
      include: {
        tasks: {
          include: { task: { select: { title: true, tier: true } } },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: competition,
    });
  } catch (error) {
    console.error('Error creating competition:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create competition' },
      { status: 500 }
    );
  }
}
