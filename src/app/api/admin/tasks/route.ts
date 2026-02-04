// src/app/api/admin/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, validateTaskData } from '@/lib/admin';

// GET - список всех задач (включая черновики)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            testcases: true,
            bestSubmissions: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: tasks.map((task) => ({
        ...task,
        functionArgs: JSON.parse(task.functionArgs),
        constraintsJson: JSON.parse(task.constraintsJson),
        testcasesCount: task._count.testcases,
        participantsCount: task._count.bestSubmissions,
      })),
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

// POST - создание новой задачи
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const validation = validateTaskData(body);

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const data = validation.data!;

    // Проверяем уникальность slug
    const existing = await prisma.task.findUnique({
      where: { slug: data.slug },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Task with this slug already exists' },
        { status: 400 }
      );
    }

    // Создаём задачу
    const task = await prisma.task.create({
      data: {
        slug: data.slug,
        title: data.title,
        tier: data.tier,
        mode: data.mode,
        statementMd: data.statementMd,
        functionSignature: data.functionSignature,
        functionArgs: JSON.stringify(data.functionArgs),
        exampleInput: data.exampleInput,
        exampleOutput: data.exampleOutput,
        constraintsJson: JSON.stringify(data.constraints),
        status: 'draft',
        testcases: {
          create: data.testcases.map((tc, idx) => ({
            inputData: JSON.stringify(tc.inputData),
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden,
            orderIndex: idx,
          })),
        },
      },
      include: {
        testcases: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        functionArgs: JSON.parse(task.functionArgs),
        constraintsJson: JSON.parse(task.constraintsJson),
      },
    });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
