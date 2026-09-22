// src/lib/csharp.ts
// Проба C#: типы, сигнатуры задач и проверка выражения игрока.
// Модуль без серверных зависимостей — им пользуются и страница задачи,
// и раннер (src/lib/csharp-runner.ts). Подробности — docs/csharp-trial.md

/**
 * Типы, которые можно объявить в C#-сигнатуре задачи. Список закрытый:
 * для каждого типа раннер умеет прочитать значение из теста, а скрипт
 * db:tasks:csharp — проверить, что данные тестов в тип укладываются.
 */
export const CSHARP_TYPES = [
  'int',
  'long',
  'double',
  'bool',
  'string',
  'int[]',
  'long[]',
  'double[]',
  'bool[]',
  'string[]',
  'int[][]',
  'string[][]',
] as const;

export type CsharpType = (typeof CSHARP_TYPES)[number];

export interface CsharpSignature {
  args: Array<{ name: string; type: CsharpType }>;
  returns: CsharpType;
}

/** Что подключено к решению. Показывается игроку и вставляется в программу */
export const CSHARP_USINGS = [
  'System',
  'System.Linq',
  'System.Collections.Generic',
  'System.Text',
  'System.Text.RegularExpressions',
] as const;

export const CSHARP_MAX_LENGTH = 2000;

// Ключевые слова C#: имя аргумента не может с ними совпадать
const CSHARP_KEYWORDS = new Set(
  (
    'abstract as base bool break byte case catch char checked class const continue decimal ' +
    'default delegate do double else enum event explicit extern false finally fixed float for ' +
    'foreach goto if implicit in int interface internal is lock long namespace new null object ' +
    'operator out override params private protected public readonly ref return sbyte sealed ' +
    'short sizeof stackalloc static string struct switch this throw true try typeof uint ulong ' +
    'unchecked unsafe ushort using virtual void volatile while'
  ).split(' ')
);

function isCsharpType(value: unknown): value is CsharpType {
  return typeof value === 'string' && (CSHARP_TYPES as readonly string[]).includes(value);
}

/**
 * Разбирает сигнатуру из tasks.csharp_signature.
 * Формат: {"args":[["nums","int[]"],["k","int"]],"returns":"int"}.
 * Любая ошибка формата — null: задача просто не открывается для C#.
 */
export function parseCsharpSignature(raw: string | null | undefined): CsharpSignature | null {
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object') return null;
  const { args, returns } = data as { args?: unknown; returns?: unknown };
  if (!Array.isArray(args) || args.length === 0 || args.length > 8) return null;
  if (!isCsharpType(returns)) return null;

  const seen = new Set<string>();
  const parsedArgs: CsharpSignature['args'] = [];
  for (const item of args) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [name, type] = item;
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name)) return null;
    if (CSHARP_KEYWORDS.has(name) || name === 'Solution' || seen.has(name)) return null;
    if (!isCsharpType(type)) return null;
    seen.add(name);
    parsedArgs.push({ name, type });
  }

  return { args: parsedArgs, returns };
}

/** Заголовок метода, который видит игрок: static int Solution(int[] nums) */
export function formatCsharpHeader(signature: CsharpSignature): string {
  const params = signature.args.map((a) => `${a.type} ${a.name}`).join(', ');
  return `static ${signature.returns} Solution(${params})`;
}

/**
 * Укладывается ли значение из теста в тип. Возвращает текст проблемы или null.
 * int в C# — 32 бита: число из теста больше этого тип молча не вместит.
 */
export function checkValueFitsType(value: unknown, type: CsharpType): string | null {
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) return `ожидался массив ${type}`;
    const inner = type.slice(0, -2) as CsharpType;
    for (const item of value) {
      const problem = checkValueFitsType(item, inner);
      if (problem) return problem;
    }
    return null;
  }

  switch (type) {
    case 'int':
      return Number.isInteger(value) && (value as number) >= -2147483648 && (value as number) <= 2147483647
        ? null
        : `значение ${JSON.stringify(value)} не помещается в int`;
    case 'long':
      return Number.isSafeInteger(value) ? null : `значение ${JSON.stringify(value)} не помещается в long`;
    case 'double':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `значение ${JSON.stringify(value)} — не double`;
    case 'bool':
      return typeof value === 'boolean' ? null : `значение ${JSON.stringify(value)} — не bool`;
    case 'string':
      return typeof value === 'string' ? null : `значение ${JSON.stringify(value)} — не string`;
    default:
      return `неизвестный тип ${type}`;
  }
}

function csharpStringLiteral(value: string): string {
  const escaped = value.replace(/[\\"\n\r\t\0]|[\u0000-\u001f]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      case '\0':
        return '\\0';
      default:
        return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    }
  });
  return `"${escaped}"`;
}

/**
 * Значение из теста в виде литерала C# — только для показа игроку.
 * Раннеру данные передаются иначе (через стандартный ввод, см. csharp-runner.ts).
 */
export function formatCsharpValue(value: unknown, type: CsharpType): string {
  if (type.endsWith('[]')) {
    const inner = type.slice(0, -2) as CsharpType;
    const items = Array.isArray(value) ? value : [];
    if (items.length === 0) return `new ${inner}[0]`;
    return `new[] {${items.map((item) => formatCsharpValue(item, inner)).join(', ')}}`;
  }
  if (type === 'string') return csharpStringLiteral(String(value));
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'double') {
    const text = String(value);
    return /[.eE]/.test(text) ? text : `${text}.0`;
  }
  if (type === 'long') return `${value}L`;
  return String(value);
}

/**
 * Имена, которые нельзя писать в решении. Это второй слой защиты: данных
 * тестов в программе и так нет (см. csharp-runner.ts), а список отсекает
 * всё, чем можно дотянуться за пределы выражения:
 *  - System — любое полное имя (System.IO.File, System.Reflection…);
 *  - Console, Environment — ввод-вывод, выход из процесса;
 *  - Type, typeof, GetType, Method, DeclaringType, Assembly, AppDomain,
 *    Activator, Delegate, DynamicInvoke — рефлексия;
 *  - Marshal, IntPtr, UIntPtr, unsafe, stackalloc, fixed, __makeref… — память;
 *  - Main — повторный вход в проверяющую программу;
 *  - File, Directory, Process, Thread, Task — на случай, если список using
 *    когда-нибудь расширят.
 */
const CSHARP_FORBIDDEN_WORDS = [
  'System',
  'Console',
  'Environment',
  'Type',
  'typeof',
  'GetType',
  'Method',
  'DeclaringType',
  'Assembly',
  'AppDomain',
  'Activator',
  'Delegate',
  'DynamicInvoke',
  'Marshal',
  'IntPtr',
  'UIntPtr',
  'unsafe',
  'stackalloc',
  'fixed',
  'extern',
  'dynamic',
  '__arglist',
  '__makeref',
  '__reftype',
  '__refvalue',
  'Main',
  'File',
  'Directory',
  'Process',
  'Thread',
  'Task',
] as const;

// Без lookbehind: модуль грузится и в браузере, а старый Safari (до 16.4)
// падает на нём при разборе — вместе со всей страницей задачи
const FORBIDDEN_WORD_RE = new RegExp(
  `(^|[^A-Za-z0-9_])(${CSHARP_FORBIDDEN_WORDS.join('|')})(?![A-Za-z0-9_])`
);

export type CsharpValidation = { valid: true } | { valid: false; error: string };

/**
 * Проверка выражения игрока до отправки в раннер. Та же функция работает
 * в браузере (мгновенная подсказка) и на сервере (решающая проверка).
 */
export function validateCsharpExpression(code: string): CsharpValidation {
  const trimmed = code.trim();

  if (!trimmed) {
    return { valid: false, error: 'Код не может быть пустым' };
  }
  if (/[\r\n]/.test(trimmed)) {
    return { valid: false, error: 'Запрещён перенос строки — код должен быть в одну строку' };
  }
  if (trimmed.includes('\t')) {
    return { valid: false, error: 'Запрещена табуляция — используй пробелы' };
  }
  if (trimmed.length > CSHARP_MAX_LENGTH) {
    return {
      valid: false,
      error: `Код слишком длинный: ${trimmed.length} символов (максимум ${CSHARP_MAX_LENGTH})`,
    };
  }
  // Точка с запятой нужна только инструкциям, а решение — одно выражение
  if (trimmed.includes(';')) {
    return { valid: false, error: 'Запрещено использовать: точка с запятой (;) — нужно одно выражение' };
  }
  // Комментарий мог бы спрятать остаток строки, в которую вставлено решение
  if (trimmed.includes('//') || trimmed.includes('/*')) {
    return { valid: false, error: 'Запрещены комментарии (// и /*)' };
  }
  // System — это тоже System: C# разрешает такие escape-последовательности в именах
  if (/\\[uU]/.test(trimmed)) {
    return { valid: false, error: 'Запрещены последовательности \\u и \\U' };
  }

  const forbidden = trimmed.match(FORBIDDEN_WORD_RE);
  if (forbidden) {
    return { valid: false, error: `Запрещено использовать: ${forbidden[2]}` };
  }

  return { valid: true };
}
