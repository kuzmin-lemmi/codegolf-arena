// src/lib/typed-results.ts
// Блок результатов проверяющей программы и сравнение ответов — общее для
// JavaScript и C#. Программа печатает только то, что вернуло решение,
// а сравнивает сервер: ожидаемых ответов в программе нет вообще.
//
// Формат блока (маркер случайный, приходит программе через стандартный ввод):
//   <маркер> start
//   <индекс> ok b<base64 ответа>
//   <индекс> err <ТипОшибки> b<base64 текста ошибки>
//   <маркер> end

export type TestOutcome =
  | { ok: true; answer: string }
  | { ok: false; errorType: string; errorMessage: string };

function unpack(token: string | undefined): string {
  if (!token || token[0] !== 'b') return '';
  return Buffer.from(token.slice(1), 'base64').toString('utf8');
}

/** Разбирает блок результатов между маркерами. null — блока нет (программа не дошла до конца) */
export function parseResultBlock(output: string, marker: string): Map<number, TestOutcome> | null {
  const lines = output.split(/\r?\n/);
  const start = lines.lastIndexOf(`${marker} start`);
  const end = lines.lastIndexOf(`${marker} end`);
  if (start === -1 || end === -1 || end <= start) return null;

  const results = new Map<number, TestOutcome>();
  for (const line of lines.slice(start + 1, end)) {
    const parts = line.split(' ');
    const index = Number(parts[0]);
    if (!Number.isInteger(index)) continue;
    if (parts[1] === 'ok') {
      results.set(index, { ok: true, answer: unpack(parts[2]) });
    } else if (parts[1] === 'err') {
      results.set(index, {
        ok: false,
        errorType: /^[A-Za-z0-9_]+$/.test(parts[2] || '') ? parts[2] : 'Exception',
        errorMessage: unpack(parts[3]),
      });
    }
  }
  return results;
}

export interface TypedTestcase {
  index: number;
  args: unknown[];
  expectedOutput: string;
  isHidden: boolean;
}

export interface TypedTestResult {
  index: number;
  passed: boolean;
  isHidden: boolean;
  actual: string | null;
  expected: string | null;
  error: string | null;
}

/**
 * Сравнение как у Python-раннера: str(ответ).strip() == ожидаемое.strip().
 * По скрытому тесту наружу — только факт прохождения и тип ошибки.
 */
export function compareResults(
  testcases: TypedTestcase[],
  outcomes: Map<number, TestOutcome>
): TypedTestResult[] {
  return testcases.map((test) => {
    const outcome = outcomes.get(test.index);
    const expected = test.expectedOutput.trim();

    if (!outcome) {
      return {
        index: test.index,
        passed: false,
        isHidden: test.isHidden,
        actual: null,
        expected: test.isHidden ? null : expected,
        error: 'Нет ответа',
      };
    }

    if (!outcome.ok) {
      const tooLong = outcome.errorMessage === 'AnswerTooLong';
      const error = tooLong
        ? 'Слишком длинный ответ'
        : test.isHidden
          ? outcome.errorType
          : `${outcome.errorType}: ${outcome.errorMessage}`;
      return {
        index: test.index,
        passed: false,
        isHidden: test.isHidden,
        actual: null,
        expected: test.isHidden ? null : expected,
        error,
      };
    }

    const actual = outcome.answer.trim();
    return {
      index: test.index,
      passed: actual === expected,
      isHidden: test.isHidden,
      actual: test.isHidden ? null : actual,
      expected: test.isHidden ? null : expected,
      error: null,
    };
  });
}
