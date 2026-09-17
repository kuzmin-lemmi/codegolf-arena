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
 * Служебный префикс внутренних имён раннера. Привязан к случайному маркеру
 * отправки, поэтому решение не может обратиться к ним наугад.
 */
function arenaPrefix(marker?: string): string {
  return `_arena_${marker || 'local'}_`;
}

/**
 * Проверка исходника решения по AST: запрещаем опасные имена и любые
 * dunder-атрибуты. Это дополнительный слой поверх изоляции окружения,
 * а не замена ей.
 */
function buildAstGuard(p: string, userCode: string): string {
  return `import ast as ${p}ast

${p}src = ${toPythonLiteral(userCode)}
${p}blocked_names = {
    "__import__", "eval", "exec", "compile", "open", "input", "breakpoint", "help",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr", "__builtins__"
}
${p}blocked_calls = {
    "__import__", "eval", "exec", "compile", "open", "input", "breakpoint", "help",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr"
}

def ${p}validate(expr):
    tree = ${p}ast.parse(expr, mode="eval")
    for node in ${p}ast.walk(tree):
        if isinstance(node, ${p}ast.Name):
            if node.id in ${p}blocked_names:
                raise ValueError(f"Blocked name: {node.id}")
            if node.id.startswith("__") and node.id.endswith("__"):
                raise ValueError(f"Blocked dunder name: {node.id}")
        elif isinstance(node, ${p}ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__"):
                raise ValueError(f"Blocked dunder attribute: {node.attr}")
        elif isinstance(node, ${p}ast.Call):
            if isinstance(node.func, ${p}ast.Name) and node.func.id in ${p}blocked_calls:
                raise ValueError(f"Blocked call: {node.func.id}")
`;
}

/**
 * Собирает решение в ОТДЕЛЬНОМ пространстве имён: только встроенные функции
 * и prelude окружения.
 *
 * Это ключевое место для честности проверки. Решение определяется через exec
 * с собственным словарём globals, поэтому у него нет доступа ни к данным
 * тестов, ни к служебным переменным раннера: ни через globals, ни через
 * замыкание. Никогда не переносите данные тестов в модульную область —
 * тогда решение сможет просто прочитать правильный ответ.
 */
function buildSolutionFactory(p: string, functionArgs: string[], preludeSource: string): string {
  const header = `def solution(${functionArgs.join(', ')}):\n    return `;

  return `${p}prelude = ${toPythonLiteral(preludeSource)}
${p}def_src = ${toPythonLiteral(header)} + ${p}src

def ${p}build_solution():
    ${p}validate(${p}src)
    ${p}ns = {}
    exec(${p}prelude, ${p}ns)
    exec(${p}def_src, ${p}ns)
    return ${p}ns["solution"]
`;
}

/** Prelude окружения + старый путь через allowed_imports (совместимость) */
function buildPreludeSource(prelude: string, allowedImports: string[]): string {
  const parts: string[] = [];
  if (prelude) parts.push(prelude);
  if (allowedImports.length > 0) {
    parts.push(allowedImports.map((m) => `import ${m}`).join('\n'));
  }
  return parts.join('\n');
}

/**
 * Генерирует Python-код для прогона решения на одном тесте.
 * Правильный ответ в этот код не попадает — сравнение делает вызывающая сторона.
 * @param prelude — доверенный код окружения (из ENV[envId].prelude).
 */
export function generateTestCode(
  userCode: string,
  functionArgs: string[],
  testArgs: unknown[],
  allowedImports: string[] = [],
  prelude: string = ''
): string {
  const p = arenaPrefix();
  const testArgsStr = testArgs.map(toPythonLiteral).join(', ');

  return `${buildAstGuard(p, userCode)}
${buildSolutionFactory(p, functionArgs, buildPreludeSource(prelude, allowedImports))}

def ${p}main():
    ${p}fn = ${p}build_solution()
    ${p}output = ${p}fn(${testArgsStr})
    print('' if ${p}output is None else ${p}output)

${p}main()
`;
}

interface BatchTestcaseInput {
  index: number;
  args: unknown[];
  expectedOutput: string;
  isHidden: boolean;
}

/**
 * Генерирует Python-код для прогона всех тестов за один запуск.
 *
 * marker — случайный секрет отправки: им помечается блок вывода, чтобы решение
 * не могло подделать результат, и им же разведены служебные имена.
 * prelude — доверенный код окружения (из ENV[envId].prelude).
 *
 * Данные тестов лежат в локальной переменной функции, а не в модульной области,
 * поэтому решение их не видит (см. buildSolutionFactory).
 */
export function generateBatchTestCode(
  userCode: string,
  functionArgs: string[],
  testcases: BatchTestcaseInput[],
  allowedImports: string[] = [],
  marker?: string,
  prelude: string = ''
): string {
  const p = arenaPrefix(marker);
  const startMarker = marker ? `__ARENA_${marker}_START__` : '__ARENA_JSON_START__';
  const endMarker = marker ? `__ARENA_${marker}_END__` : '__ARENA_JSON_END__';

  const testsLiteral = testcases
    .map((test) => {
      const argsLiteral = `[${test.args.map(toPythonLiteral).join(', ')}]`;
      return `{"index": ${test.index}, "args": ${argsLiteral}, "expected": ${toPythonLiteral(
        test.expectedOutput.trim()
      )}, "hidden": ${test.isHidden ? 'True' : 'False'}}`;
    })
    .join(',\n        ');

  return `import json

${buildAstGuard(p, userCode)}
${buildSolutionFactory(p, functionArgs, buildPreludeSource(prelude, allowedImports))}

def ${p}emit(results):
    print("${startMarker}")
    print(json.dumps({"results": results}, ensure_ascii=False))
    print("${endMarker}")

def ${p}main():
    # tests и results — локальные переменные: из решения их не видно
    tests = [
        ${testsLiteral}
    ]
    results = []

    try:
        fn = ${p}build_solution()
    except Exception as exc:
        for test in tests:
            results.append({
                "index": test["index"],
                "passed": False,
                "isHidden": test["hidden"],
                "actual": None,
                "expected": None,
                "error": f"{type(exc).__name__}: {exc}",
            })
        ${p}emit(results)
        return

    for test in tests:
        try:
            output = fn(*test["args"])
            actual = '' if output is None else str(output).strip()
            expected = str(test["expected"]).strip()
            results.append({
                "index": test["index"],
                "passed": actual == expected,
                "isHidden": test["hidden"],
                "actual": None if test["hidden"] else actual,
                "expected": None if test["hidden"] else expected,
                "error": None,
            })
        except Exception as exc:
            # У скрытых тестов отдаём только тип ошибки: её текст может
            # содержать значения из теста
            results.append({
                "index": test["index"],
                "passed": False,
                "isHidden": test["hidden"],
                "actual": None,
                "expected": None,
                "error": type(exc).__name__ if test["hidden"] else f"{type(exc).__name__}: {exc}",
            })

    ${p}emit(results)

${p}main()
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
