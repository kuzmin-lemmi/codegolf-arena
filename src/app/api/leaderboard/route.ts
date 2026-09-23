// src/app/api/leaderboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { parseRatingScope } from '@/lib/languages';
import { getRating } from '@/lib/ratings';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;

    // Общий рейтинг или рейтинг языка: ?lang=python|javascript|csharp
    const leaderboard = await getRating(parseRatingScope(searchParams.get('lang')), limit);

    return NextResponse.json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
