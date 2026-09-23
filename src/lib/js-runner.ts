// src/lib/js-runner.ts
// JavaScript: проверяющая программа, прогон в Piston (Node.js), разбор результата.
//
// САМОЕ ЧУВСТВИТЕЛЬНОЕ МЕСТО JS-части. Любая правка — только вместе с
// npm run test:sandbox:js (он же стоит в scripts/predeploy-check.sh).
//
// Честность проверки устроена так же, как у C# (csharp-runner.ts):
//  1. Ожидаемых ответов в программе нет вообще: она печатает, что вернуло
//     решение, а сравнивает сервер (compareResults в typed-results.ts).
//  2. Аргументов тестов в исходнике тоже нет: они приходят через стандартный
//     ввод и вычитываются целиком до первого вызова решения. Решение может
//     прочитать свой исходник и стандартный ввод (проверено) — и не найдёт
//     там ни одного ответа.
//  3. Маркер блока результатов случайный и тоже приходит через ввод.
//  4. Служебный код живёт внутри функции: из решения его переменных не видно,
//     а всё нужное из стандартной библиотеки взято до первого вызова решения.
//  5. Выражение разобрано настоящим парсером JavaScript (validateJsExpression):
//     закрыть обёртку и дописать свой код вокруг оно не может. Список
//     запрещённых слов — второй слой.
//
// Строгий режим ('use strict') намеренно не включён: в кодгольфе на JavaScript
// принято присваивать необъявленной переменной — (s=0,a.map(x=>s+=x),s).

import { randomBytes } from 'crypto';
import { executeCode } from '@/lib/piston';
import { parseResultBlock, type TestOutcome } from '@/lib/typed-results';
import type { CsharpSignature, CsharpType } from '@/lib/csharp';

/** Пакет node в раннере, в /runtimes он называется javascript. Ставится: npm run dev:piston */
export const JS_PISTON_LANGUAGE = 'javascript';
export const JS_PISTON_VERSION = '20.11.1';

// Piston отказывает в запросе с таймаутом больше своего лимита (docker-compose.yml — 12000)
const MAX_RUN_TIMEOUT_MS = 10_000;
// Ответ длиннее этого считаем ошибкой решения, а не раннера
const MAX_ANSWER_CHARS = 200_000;

/** Тип возврата, который понимает программа. object — печать без подсказки типа, для проверок */
type ReturnType = CsharpType | 'object';

export interface JsProgramSignature {
  args: CsharpSignature['args'];
  returns: ReturnType;
}

/**
 * Исходник проверяющей программы. В нём нет ни данных тестов, ни маркера —
 * только имена аргументов, тип ответа и выражение игрока.
 *
 * Выражение стоит в скобках на своей строке: даже комментарий в конце
 * выражения не может «съесть» закрывающую скобку обёртки.
 */
export function buildJsProgram(expression: string, signature: JsProgramSignature): string {
  const params = signature.args.map((a) => a.name).join(', ');

  return `const solution = (${params}) => (
${expression.trim()}
);

(() => {
  // Всё нужное из стандартной библиотеки — до первого вызова решения:
  // решение может подменить глобальные объекты, но только себе во вред
  const fs = require('fs');
  const B = Buffer;
  const exit = process.exit.bind(process);
  const isArray = Array.isArray;
  const isInteger = Number.isInteger;
  const parse = JSON.parse;
  const objectIs = Object.is;
  const RETURNS = ${JSON.stringify(signature.returns)};

  // Весь ввод — до первого вызова решения: потом его уже не прочитать
  const lines = fs.readFileSync(0, 'utf8').split('\\n');
  const marker = lines[0].trim();
  const count = Number(lines[1]);
  const tests = [];
  for (let t = 0; t < count; t++) tests.push(parse(lines[2 + t]));
  lines.length = 0;

  const pack = (s) => 'b' + B.from(String(s), 'utf8').toString('base64');

  // Печать ответа как у Python: print(x) наверху, repr() внутри списков
  const pyFloat = (d) => {
    if (d !== d) return 'nan';
    if (d === Infinity) return 'inf';
    if (d === -Infinity) return '-inf';
    if (d === 0) return objectIs(d, -0) ? '-0.0' : '0.0';
    // toExponential() без аргумента даёт самую короткую точную запись, как repr() в Python
    let [mantissa, exponent] = d.toExponential().split('e');
    const negative = mantissa[0] === '-';
    if (negative) mantissa = mantissa.slice(1);
    const digits = mantissa.replace('.', '');
    const e = Number(exponent);
    let s;
    if (e < -4 || e >= 16)
      s = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
    else if (e < 0) s = '0.' + '0'.repeat(-e - 1) + digits;
    else if (e + 1 >= digits.length) s = digits + '0'.repeat(e + 1 - digits.length) + '.0';
    else s = digits.slice(0, e + 1) + '.' + digits.slice(e + 1);
    return negative ? '-' + s : s;
  };
  const pyRepr = (s) => {
    const q = s.includes("'") && !s.includes('"') ? '"' : "'";
    let r = q;
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (ch === q || ch === '\\\\') r += '\\\\' + ch;
      else if (ch === '\\n') r += '\\\\n';
      else if (ch === '\\r') r += '\\\\r';
      else if (ch === '\\t') r += '\\\\t';
      else if (code < 32 || code === 127) r += '\\\\x' + code.toString(16).padStart(2, '0');
      else r += ch;
    }
    return r + q;
  };

  let size = 0;
  const format = (v, type, inner) => {
    const out = formatValue(v, type, inner);
    size += out.length;
    if (size > ${MAX_ANSWER_CHARS}) throw new Error('AnswerTooLong');
    return out;
  };
  const formatList = (items, type) => '[' + items.map((item) => format(item, type, true)).join(', ') + ']';
  const formatValue = (v, type, inner) => {
    if (type.endsWith('[]') && isArray(v)) return formatList(v, type.slice(0, -2));
    if ((type === 'int' || type === 'long') && typeof v === 'number' && isInteger(v)) return String(v);
    if (type === 'double' && typeof v === 'number') return pyFloat(v);
    return formatAny(v, inner);
  };
  // Без подсказки типа — как напечатал бы Python тот же самый ответ
  const formatAny = (v, inner) => {
    if (v === null || v === undefined) return inner ? 'None' : '';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') return isInteger(v) ? String(v) : pyFloat(v);
    if (typeof v === 'bigint') return String(v);
    if (typeof v === 'string') return inner ? pyRepr(v) : v;
    if (isArray(v)) return formatList(v, 'object');
    if (v instanceof Set) return v.size ? '{' + [...v].map((x) => format(x, 'object', true)).join(', ') + '}' : 'set()';
    const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
    return '{' + entries.map(([k, x]) => format(k, 'object', true) + ': ' + format(x, 'object', true)).join(', ') + '}';
  };

  const errorName = (error) => {
    try {
      const name = error && error.name;
      return typeof name === 'string' && /^[A-Za-z0-9_]+$/.test(name) ? name : 'Error';
    } catch {
      return 'Error';
    }
  };
  const errorText = (error) => {
    try {
      return error && error.message !== undefined ? String(error.message) : String(error);
    } catch {
      return '';
    }
  };

  const results = [];
  for (const test of tests) {
    try {
      size = 0;
      results.push(test.i + ' ok ' + pack(format(solution(...test.a), RETURNS, false)));
    } catch (error) {
      results.push(test.i + ' err ' + errorName(error) + ' ' + pack(errorText(error)));
    }
  }

  // Блок результатов — одним куском в самом конце: всё, что решение
  // напечатало само, оказывается до маркера и отбрасывается. Выход сразу после
  // печати: таймер, заведённый решением, не должен держать процесс до таймаута
  let text = marker + ' start\\n';
  for (const line of results) text += line + '\\n';
  fs.writeSync(1, text + marker + ' end\\n');
  exit(0);
})();
`;
}

export interface JsTestInput {
  index: number;
  args: unknown[];
}

/** Стандартный ввод программы: маркер, число тестов, затем по строке JSON на тест */
export function encodeJsInput(marker: string, tests: JsTestInput[]): string {
  const lines = [marker, String(tests.length)];
  for (const test of tests) {
    lines.push(JSON.stringify({ i: test.index, a: test.args }));
  }
  return lines.join('\n') + '\n';
}

export type JsRunResult =
  | { kind: 'ok'; outcomes: Map<number, TestOutcome> }
  | { kind: 'compile_error'; message: string }
  | { kind: 'crash'; message: string }
  | { kind: 'timeout' }
  | { kind: 'infra'; message: string };

/**
 * Прогоняет выражение на всех тестах одним запуском Node.js.
 * Сборки, как у C#, нет — очередь на раннер не нужна.
 */
export async function runJs(params: {
  expression: string;
  signature: JsProgramSignature;
  tests: JsTestInput[];
  runTimeoutMs: number;
}): Promise<JsRunResult> {
  const marker = randomBytes(16).toString('hex');
  const program = buildJsProgram(params.expression, params.signature);
  const stdin = encodeJsInput(marker, params.tests);
  const runTimeout = Math.min(MAX_RUN_TIMEOUT_MS, Math.max(params.runTimeoutMs, 2000));

  const signal = AbortSignal.timeout(runTimeout + 8000);
  const result = await executeCode(program, runTimeout, signal, {
    language: JS_PISTON_LANGUAGE,
    version: JS_PISTON_VERSION,
    fileName: 'main.js',
    stdin,
  });

  if (result.errorKind === 'infra') {
    return { kind: 'infra', message: result.error || 'Раннер недоступен' };
  }
  if (result.errorKind === 'timeout') {
    return { kind: 'timeout' };
  }

  const outcomes = parseResultBlock(result.stdout || result.output || '', marker);
  if (outcomes) return { kind: 'ok', outcomes };

  // Блока нет: процесс убит по времени или памяти, упал целиком или не разобрался
  const text = `${result.error || ''}\n${result.stderr || ''}`;
  if (/SIGKILL|timed out|killed/i.test(text)) return { kind: 'timeout' };
  const syntax = text.match(/SyntaxError: ([^\n]*)/);
  if (syntax) return { kind: 'compile_error', message: `SyntaxError: ${syntax[1].trim()}` };
  if (/heap out of memory|Allocation failed/i.test(text)) {
    return { kind: 'crash', message: 'Решению не хватило памяти' };
  }
  return { kind: 'crash', message: 'Программа завершилась аварийно, не дойдя до конца тестов' };
}
