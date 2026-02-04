// src/app/api/admin/tasks/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, validateTaskData } from '@/lib/admin';

// GET - получение задачи по ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        testcases: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        functionArgs: JSON.parse(task.functionArgs),
        constraintsJson: JSON.parse(task.constraintsJson),
        testcases: task.testcases.map((tc) => ({
          ...tc,
          inputData: JSON.parse(tc.inputData),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

// PUT - обновление задачи
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Проверяем, что задача существует
    const existing = await prisma.task.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Проверяем уникальность slug (если изменился)
    if (data.slug !== existing.slug) {
      const slugExists = await prisma.task.findUnique({
        where: { slug: data.slug },
      });
      if (slugExists) {
        return NextResponse.json(
          { success: false, error: 'Task with this slug already exists' },
          { status: 400 }
        );
      }
    }

    // Обновляем задачу
    const task = await prisma.task.update({
      where: { id: params.id },
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
      },
    });

    // Удаляем старые тесты и создаём новые
    await prisma.testcase.deleteMany({
      where: { taskId: params.id },
    });

    await prisma.testcase.createMany({
      data: data.testcases.map((tc, idx) => ({
        taskId: params.id,
        inputData: JSON.stringify(tc.inputData),
        expectedOutput: tc.expectedOutput,
        isHidden: tc.isHidden,
        orderIndex: idx,
      })),
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
    console.error('Error updating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

// PATCH - изменение статуса (publish/unpublish)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { status } = body;

    if (!['draft', 'published', 'archived'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task status' },
      { status: 500 }
    );
  }
}

// DELETE - удаление задачи
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    // Проверяем, что нет решений
    const submissions = await prisma.submission.count({
      where: { taskId: params.id },
    });

    if (submissions > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete task with submissions. Archive it instead.' },
        { status: 400 }
      );
    }

    // Удаляем тесты
    await prisma.testcase.deleteMany({
      where: { taskId: params.id },
    });

    // Удаляем задачу
    await prisma.task.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Task deleted',
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
