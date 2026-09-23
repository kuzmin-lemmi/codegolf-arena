// src/lib/javascript.ts
// JavaScript: заголовок решения, показ значений и проверка выражения игрока.
// Модуль без серверных зависимостей — им пользуются и страница задачи
// (мгновенная подсказка), и раннер (src/lib/js-runner.ts).
//
// Типы аргументов и ответа — те же, что у C# (tasks.csharp_signature): по ним
// раннер печатает ответ так, как его напечатал бы Python — 3.0 для дробного,
// True для логического. Без типов JavaScript не отличил бы 3 от 3.0.

import { parseExpressionAt, tokenizer } from 'acorn';
import type { CsharpSignature, CsharpType } from '@/lib/csharp';

export const JS_MAX_LENGTH = 2000;

// Версия языка, которую понимает разбор выражения. Node.js 20 в раннере
// поддерживает ES2023; более новый синтаксис отбиваем сразу, а не падением в раннере
const JS_ECMA_VERSION = 2023;

// Имена аргументов, которые в JavaScript не могут быть именами параметров
const JS_RESERVED = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends ' +
    'false finally for function if implements import in instanceof interface let new null package ' +
    'private protected public return static super switch this throw true try typeof var void while ' +
    'with yield await arguments eval solution undefined NaN Infinity'
  ).split(' ')
);

/** Можно ли использовать имена аргументов задачи как параметры функции на JS */
export function isJsSignatureUsable(signature: CsharpSignature): boolean {
  return signature.args.every((arg) => !JS_RESERVED.has(arg.name));
}

/** Заголовок, который видит игрок: const solution = (nums, k) => */
export function formatJsHeader(signature: CsharpSignature): string {
  return `const solution = (${signature.args.map((a) => a.name).join(', ')}) =>`;
}

/** Значение из теста в виде литерала JavaScript — только для показа игроку */
export function formatJsValue(value: unknown, type: CsharpType): string {
  if (type.endsWith('[]')) {
    const inner = type.slice(0, -2) as CsharpType;
    const items = Array.isArray(value) ? value : [];
    return `[${items.map((item) => formatJsValue(item, inner)).join(', ')}]`;
  }
  if (type === 'string') return JSON.stringify(String(value));
  if (type === 'bool') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Имена, которые нельзя писать в решении. Второй слой защиты: данных тестов
 * в программе и так нет (см. js-runner.ts), а список отсекает очевидные пути
 * за пределы выражения:
 *  - require, import, module, exports, __dirname, __filename — модули и файлы;
 *  - process, globalThis, global — процесс, выход, вывод;
 *  - eval, Function, constructor — код из строки (''.constructor.constructor);
 *  - arguments — на верхнем уровне модуля это аргументы обёртки Node,
 *    среди них require;
 *  - Buffer — сырая память процесса.
 */
const JS_FORBIDDEN_WORDS = [
  'require',
  'import',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'process',
  'globalThis',
  'global',
  'eval',
  'Function',
  'constructor',
  'arguments',
  'Buffer',
] as const;

// Без lookbehind: модуль грузится в браузере, а старый Safari (до 16.4) на нём падает
const FORBIDDEN_WORD_RE = new RegExp(
  `(^|[^A-Za-z0-9_$])(${JS_FORBIDDEN_WORDS.join('|')})(?![A-Za-z0-9_$])`
);

export type JsValidation = { valid: true } | { valid: false; error: string };

/**
 * Проверка выражения игрока до отправки в раннер. Та же функция работает
 * в браузере (мгновенная подсказка) и на сервере (решающая проверка).
 *
 * Главное — разбор настоящим парсером JavaScript: строка должна быть ровно
 * одним выражением. Тогда она не может «закрыть» обёртку и дописать свой код
 * вокруг — например, `0), x = (1` не разбирается как выражение.
 */
export function validateJsExpression(code: string): JsValidation {
  const trimmed = code.trim();

  if (!trimmed) {
    return { valid: false, error: 'Код не может быть пустым' };
  }
  // U+2028 и U+2029 в JavaScript — тоже переводы строки
  if (/[\r\n\u2028\u2029]/.test(trimmed)) {
    return { valid: false, error: 'Запрещён перенос строки — код должен быть в одну строку' };
  }
  if (trimmed.includes('\t')) {
    return { valid: false, error: 'Запрещена табуляция — используй пробелы' };
  }
  if (trimmed.length > JS_MAX_LENGTH) {
    return {
      valid: false,
      error: `Код слишком длинный: ${trimmed.length} символов (максимум ${JS_MAX_LENGTH})`,
    };
  }
  if (trimmed.includes(';')) {
    return { valid: false, error: 'Запрещено использовать: точка с запятой (;) — нужно одно выражение' };
  }
  // process — это тоже process: JavaScript разрешает такие escape-последовательности в именах
  if (/\\u/.test(trimmed)) {
    return { valid: false, error: 'Запрещены последовательности \\u' };
  }
  // В обычном скрипте <!-- открывает комментарий до конца строки
  if (trimmed.includes('<!--')) {
    return { valid: false, error: 'Запрещено сочетание <!--' };
  }

  const forbidden = trimmed.match(FORBIDDEN_WORD_RE);
  if (forbidden) {
    return { valid: false, error: `Запрещено использовать: ${forbidden[2]}` };
  }

  try {
    // preserveParens: иначе у выражения в скобках конец — перед закрывающей скобкой
    const node = parseExpressionAt(trimmed, 0, {
      ecmaVersion: JS_ECMA_VERSION,
      sourceType: 'script',
      preserveParens: true,
    });
    // После выражения может остаться только комментарий
    const rest = [...tokenizer(trimmed.slice(node.end), { ecmaVersion: JS_ECMA_VERSION, sourceType: 'script' })];
    if (rest.length > 0) {
      return {
        valid: false,
        error: `Нужно одно выражение: после символа ${node.end} начинается что-то ещё`,
      };
    }
  } catch (error) {
    const pos = (error as { pos?: number }).pos;
    const message = error instanceof Error ? error.message.replace(/\s*\(\d+:\d+\)$/, '') : 'ошибка разбора';
    return {
      valid: false,
      error: `Синтаксическая ошибка${typeof pos === 'number' ? ` (символ ${pos + 1})` : ''}: ${message}`,
    };
  }

  return { valid: true };
}
