// src/app/api/tasks/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const task = await prisma.task.findUnique({
      where: { slug },
      include: {
        testcases: {
          where: { isHidden: false }, // Только открытые тесты
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            inputData: true,
            expectedOutput: true,
            orderIndex: true,
          },
        },
      },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Парсим JSON поля
    const taskData = {
      ...task,
      functionArgs: JSON.parse(task.functionArgs),
      constraintsJson: JSON.parse(task.constraintsJson),
      testcases: task.testcases.map((tc) => ({
        ...tc,
        inputData: JSON.parse(tc.inputData),
      })),
    };

    return NextResponse.json({
      success: true,
      data: taskData,
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}
