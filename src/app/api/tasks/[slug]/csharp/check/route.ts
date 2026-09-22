// src/app/api/tasks/[slug]/csharp/check/route.ts
// Проба C#: черновая проверка на открытых тестах. Для Python это делает
// Pyodide в браузере, для C# такого нет — проверяем на сервере, без записи в базу.

import { NextRequest, NextResponse } from 'next/server';
import { checkCsharpDraft } from '@/lib/csharp-submission';
import { CsharpBusyError, isCsharpEnabled } from '@/lib/csharp-runner';
import { checkCsharpCheckRateLimit, getClientIP } from '@/lib/rate-limiter';
import { validateMutationRequest } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  if (!isCsharpEnabled()) {
    return NextResponse.json({ success: false, error: 'C# сейчас выключен' }, { status: 404 });
  }

  try {
    const limit = await checkCsharpCheckRateLimit(getClientIP(request));
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Слишком много проверок подряд. Повторите через ${limit.retryAfter} сек.`,
          retryAfter: limit.retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    const { slug } = await params;
    const body = await request.json().catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'Code is required' }, { status: 400 });
    }

    const result = await checkCsharpDraft(slug, code);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof CsharpBusyError) {
      return NextResponse.json(
        { success: false, error: 'Сейчас проверяется много решений на C#. Попробуйте через минуту' },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }
    console.error('Error checking C# solution:', error);
    return NextResponse.json({ success: false, error: 'Не удалось проверить решение' }, { status: 500 });
  }
}
