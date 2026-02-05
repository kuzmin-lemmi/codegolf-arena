import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        stepikUserId: true,
        displayName: true,
        nickname: true,
        avatarUrl: true,
        totalPoints: true,
        isAdmin: true,
        createdAt: true,
        _count: {
          select: {
            submissions: true,
            bestSubmissions: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: users.map((user) => ({
        ...user,
        submissionsCount: user._count.submissions,
        bestSubmissionsCount: user._count.bestSubmissions,
      })),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
