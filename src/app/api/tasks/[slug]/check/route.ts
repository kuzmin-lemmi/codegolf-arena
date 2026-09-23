// src/app/api/tasks/[slug]/check/route.ts
// Черновая проверка JavaScript и C# на открытых тестах, без записи в базу.
// Для Python это делает Pyodide в браузере.

import { NextRequest, NextResponse } from 'next/server';
import { checkTypedDraft, isTypedLanguage } from '@/lib/language-submission';
import { CsharpBusyError } from '@/lib/csharp-runner';
import { isLanguageEnabled } from '@/lib/language-settings';
import { LANGUAGE_LABELS } from '@/lib/languages';
import { checkServerCheckRateLimit, getClientIP } from '@/lib/rate-limiter';
import { validateMutationRequest } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  try {
    const body = await request.json().catch(() => null);
    const language = body?.language;
    if (!isTypedLanguage(language)) {
      return NextResponse.json(
        { success: false, error: 'Проверка на сервере есть только для JavaScript и C#' },
        { status: 400 }
      );
    }
    if (!isLanguageEnabled(language)) {
      return NextResponse.json(
        { success: false, error: `${LANGUAGE_LABELS[language]} сейчас выключен` },
        { status: 404 }
      );
    }

    const limit = await checkServerCheckRateLimit(getClientIP(request), language);
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

    const code = body?.code;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'Code is required' }, { status: 400 });
    }

    const { slug } = await params;
    const result = await checkTypedDraft(language, slug, code);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof CsharpBusyError) {
      return NextResponse.json(
        { success: false, error: 'Сейчас проверяется много решений на C#. Попробуйте через минуту' },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }
    console.error('Error checking solution on server:', error);
    return NextResponse.json({ success: false, error: 'Не удалось проверить решение' }, { status: 500 });
  }
}
