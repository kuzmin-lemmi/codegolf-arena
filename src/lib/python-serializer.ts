// src/lib/python-serializer.ts

/**
 * Конвертирует JavaScript значение в Python литерал
 * Используется и на сервере (submit), и в браузере (Pyodide)
 */
export function toPythonLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'None';
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'float("nan")';
    if (!Number.isFinite(value)) {
      return value > 0 ? 'float("inf")' : 'float("-inf")';
    }
    return String(value);
  }

  if (typeof value === 'string') {
    // Экранируем спецсимволы и оборачиваем в кавычки
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }

  if (Array.isArray(value)) {
    const items = value.map(toPythonLiteral).join(', ');
    return `[${items}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `${toPythonLiteral(k)}: ${toPythonLiteral(v)}`)
      .join(', ');
    return `{${entries}}`;
  }

  // Fallback
  return String(value);
}

/**
 * Генерирует полный Python код для выполнения теста
 */
export function generateTestCode(
  userCode: string,
  functionArgs: string[],
  testArgs: unknown[],
  allowedImports: string[] = []
): string {
  // Импорты
  const imports = allowedImports.length > 0
    ? allowedImports.map((m) => `import ${m}`).join('\n') + '\n\n'
    : '';

  // Аргументы функции
  const argsStr = functionArgs.join(', ');

  // Тестовые аргументы в Python формате
  const testArgsStr = testArgs.map(toPythonLiteral).join(', ');

  return `${imports}def solution(${argsStr}):
    return ${userCode}

print(solution(${testArgsStr}))
`;
}

interface BatchTestcaseInput {
  index: number;
  args: unknown[];
  expectedOutput: string;
  isHidden: boolean;
}

/**
 * Генерирует Python код для прогона всех тестов за один запуск
 */
export function generateBatchTestCode(
  userCode: string,
  functionArgs: string[],
  testcases: BatchTestcaseInput[],
  allowedImports: string[] = []
): string {
  const imports = allowedImports.length > 0
    ? allowedImports.map((m) => `import ${m}`).join('\n') + '\n\n'
    : '';

  const argsStr = functionArgs.join(', ');
  const testsLiteral = testcases
    .map((test) => {
      const argsLiteral = `[${test.args.map(toPythonLiteral).join(', ')}]`;
      return `{"index": ${test.index}, "args": ${argsLiteral}, "expected": ${toPythonLiteral(test.expectedOutput.trim())}, "hidden": ${test.isHidden ? 'True' : 'False'}}`;
    })
    .join(',\n    ');

  return `${imports}import json

def solution(${argsStr}):
    return ${userCode}

tests = [
    ${testsLiteral}
]

results = []
for test in tests:
    try:
        output = solution(*test["args"])
        actual = '' if output is None else str(output).strip()
        expected = str(test["expected"]).strip()
        passed = actual == expected
        results.append({
            "index": test["index"],
            "passed": passed,
            "isHidden": test["hidden"],
            "actual": actual if not test["hidden"] else None,
            "expected": expected if not test["hidden"] else None,
            "error": None,
        })
    except Exception as exc:
        results.append({
            "index": test["index"],
            "passed": False,
            "isHidden": test["hidden"],
            "actual": None,
            "expected": None,
            "error": f"{type(exc).__name__}: {exc}",
        })

payload = {"results": results}
print("__ARENA_JSON_START__")
print(json.dumps(payload, ensure_ascii=False))
print("__ARENA_JSON_END__")
`;
}

/**
 * Валидация однострочника с понятными сообщениями об ошибках
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorType?: 'newline' | 'semicolon' | 'tab' | 'forbidden_token' | 'too_long' | 'empty';
}

export function validateOneliner(
  code: string,
  forbiddenTokens: string[] = [';', 'eval', 'exec', '__import__'],
  maxLength: number = 2000
): ValidationResult {
  const trimmed = code.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: 'Код не может быть пустым',
      errorType: 'empty',
    };
  }

  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return {
      valid: false,
      error: 'Запрещён перенос строки — код должен быть в одну строку',
      errorType: 'newline',
    };
  }

  if (trimmed.includes('\t')) {
    return {
      valid: false,
      error: 'Запрещена табуляция — используй пробелы',
      errorType: 'tab',
    };
  }

  for (const token of forbiddenTokens) {
    if (trimmed.includes(token)) {
      const tokenName = {
        ';': 'точка с запятой (;)',
        'eval': 'eval()',
        'exec': 'exec()',
        '__import__': '__import__()',
      }[token] || token;

      return {
        valid: false,
        error: `Запрещено использовать: ${tokenName}`,
        errorType: 'forbidden_token',
      };
    }
  }

  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `Код слишком длинный: ${trimmed.length} символов (максимум ${maxLength})`,
      errorType: 'too_long',
    };
  }

  return { valid: true };
}

/**
 * Подсчёт длины кода (trim по краям, пробелы внутри считаются)
 */
export function calculateCodeLength(code: string): number {
  return code.trim().length;
}
