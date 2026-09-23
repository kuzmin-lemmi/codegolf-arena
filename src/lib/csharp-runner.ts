// src/lib/csharp-runner.ts
// Проба C#: сборка проверяющей программы, прогон в Piston, разбор результата.
//
// САМОЕ ЧУВСТВИТЕЛЬНОЕ МЕСТО C#-части. Любая правка — только вместе с
// npm run test:sandbox:csharp (он же стоит в scripts/predeploy-check.sh).
//
// Как устроена честность проверки:
//  1. Ожидаемых ответов в программе нет вообще: она печатает, что вернуло
//     решение, а сравнивает сервер (compareCsharpResults).
//  2. Аргументов тестов в исходнике тоже нет: они приходят через стандартный
//     ввод, и Main вычитывает его целиком до первого вызова решения. Решение
//     может прочитать свой исходник с диска (проверено) — и не найдёт там ничего.
//  3. Маркер блока результатов случайный и тоже приходит через ввод:
//     решение не может напечатать поддельный блок.
//  4. Все служебные функции — локальные внутри Main: из Solution их не видно.
//  5. Список запрещённых слов (validateCsharpExpression) — второй слой.

import { randomBytes } from 'crypto';
import { executeCode } from '@/lib/piston';
import { parseResultBlock, type TestOutcome } from '@/lib/typed-results';
import {
  CSHARP_USINGS,
  type CsharpSignature,
  type CsharpType,
} from '@/lib/csharp';

/** Пакет mono в раннере. Ставится командой npm run dev:piston */
export const CSHARP_PISTON_LANGUAGE = 'csharp';
export const CSHARP_PISTON_VERSION = '6.12.0';

// Piston отказывает в запросе с таймаутом больше своего лимита
// (PISTON_COMPILE_TIMEOUT / PISTON_RUN_TIMEOUT в docker-compose.yml — 12000)
const COMPILE_TIMEOUT_MS = 12_000;
const MAX_RUN_TIMEOUT_MS = 10_000;
// Ответ длиннее этого считаем ошибкой решения, а не раннера
const MAX_ANSWER_CHARS = 200_000;

export function isCsharpEnabled(): boolean {
  return process.env.CSHARP_ENABLED === 'true';
}

/** Тип возврата, который понимает сборщик. object — только для проверок печати */
type ReturnType = CsharpType | 'object';

interface ProgramSignature {
  args: CsharpSignature['args'];
  returns: ReturnType;
}

// ---------- Программа ----------

function readerFor(type: CsharpType): string {
  if (type.endsWith('[]')) {
    return `ReadArray(() => ${readerFor(type.slice(0, -2) as CsharpType)})`;
  }
  switch (type) {
    case 'int':
      return 'ReadInt()';
    case 'long':
      return 'ReadLong()';
    case 'double':
      return 'ReadDouble()';
    case 'bool':
      return 'ReadBool()';
    case 'string':
      return 'ReadString()';
    default:
      throw new Error(`Нет чтения для типа ${type}`);
  }
}

/** Строка, в которой стоит выражение игрока: нужна, чтобы показать место ошибки компиляции */
const SOLUTION_LINE_PREFIX = '    static ';

/**
 * Исходник проверяющей программы. В нём нет ни данных тестов, ни маркера —
 * только сигнатура и выражение игрока.
 */
export function buildCsharpProgram(expression: string, signature: ProgramSignature): string {
  const params = signature.args.map((a) => `${a.type} ${a.name}`).join(', ');
  const reads = signature.args
    .map((a, i) => `            ${a.type} a${i} = ${readerFor(a.type as CsharpType)};`)
    .join('\n');
  const callArgs = signature.args.map((_, i) => `a${i}`).join(', ');
  const usings = CSHARP_USINGS.map((u) => `using ${u};`).join('\n');

  // String.raw: обратные слэши C#-кода остаются как есть
  return String.raw`${usings}
using System.Collections;
using System.Globalization;

static class Arena
{
${SOLUTION_LINE_PREFIX}${signature.returns} Solution(${params}) => ${expression.trim()};

    static void Main()
    {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;

        // Весь ввод — до первого вызова решения: потом его уже не прочитать
        var input = Console.In.ReadToEnd().Split(new[] { ' ', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        var pos = 0;
        string Next() => input[pos++];
        int ReadInt() => int.Parse(Next(), NumberStyles.Integer, CultureInfo.InvariantCulture);
        long ReadLong() => long.Parse(Next(), NumberStyles.Integer, CultureInfo.InvariantCulture);
        double ReadDouble() => double.Parse(Next(), NumberStyles.Float, CultureInfo.InvariantCulture);
        bool ReadBool() => Next() == "1";
        string ReadString() => Encoding.UTF8.GetString(Convert.FromBase64String(Next().Substring(1)));
        T[] ReadArray<T>(Func<T> read)
        {
            var n = ReadInt();
            var items = new T[n];
            for (var i = 0; i < n; i++) items[i] = read();
            return items;
        }
        string Pack(string s) => "b" + Convert.ToBase64String(Encoding.UTF8.GetBytes(s ?? ""));

        // Печать ответа как у Python: print(x) наверху, repr() внутри списков
        string PyFloat(double d)
        {
            if (double.IsNaN(d)) return "nan";
            if (double.IsPositiveInfinity(d)) return "inf";
            if (double.IsNegativeInfinity(d)) return "-inf";
            if (d == 0) return 1 / d < 0 ? "-0.0" : "0.0";
            // Самая короткая запись, из которой число восстанавливается точно, — как repr() в Python.
            // Формат "R" в mono этого не гарантирует: 1.0/3 он печатает с 17 цифрами
            var r = d.ToString("G15", CultureInfo.InvariantCulture);
            if (double.Parse(r, NumberStyles.Float, CultureInfo.InvariantCulture) != d) r = d.ToString("G16", CultureInfo.InvariantCulture);
            if (double.Parse(r, NumberStyles.Float, CultureInfo.InvariantCulture) != d) r = d.ToString("G17", CultureInfo.InvariantCulture);
            var negative = r[0] == '-';
            if (negative) r = r.Substring(1);
            var exp = 0;
            var e = r.IndexOfAny(new[] { 'E', 'e' });
            if (e >= 0)
            {
                exp = int.Parse(r.Substring(e + 1), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
                r = r.Substring(0, e);
            }
            var dot = r.IndexOf('.');
            var whole = dot < 0 ? r : r.Substring(0, dot);
            var all = whole + (dot < 0 ? "" : r.Substring(dot + 1));
            var lead = all.Length - all.TrimStart('0').Length;
            var digits = all.Substring(lead).TrimEnd('0');
            if (digits.Length == 0) digits = "0";
            var point = whole.Length - lead + exp;
            var exp10 = point - 1;
            string s;
            if (exp10 < -4 || exp10 >= 16)
                s = digits.Substring(0, 1) + (digits.Length > 1 ? "." + digits.Substring(1) : "") +
                    "e" + (exp10 < 0 ? "-" : "+") + Math.Abs(exp10).ToString("00", CultureInfo.InvariantCulture);
            else if (point <= 0)
                s = "0." + new string('0', -point) + digits;
            else if (point >= digits.Length)
                s = digits + new string('0', point - digits.Length) + ".0";
            else
                s = digits.Substring(0, point) + "." + digits.Substring(point);
            return negative ? "-" + s : s;
        }
        string PyRepr(string s)
        {
            var q = s.Contains("'") && !s.Contains("\"") ? '"' : '\'';
            var r = new StringBuilder();
            r.Append(q);
            foreach (var ch in s)
            {
                if (ch == q || ch == '\\') r.Append('\\').Append(ch);
                else if (ch == '\n') r.Append("\\n");
                else if (ch == '\r') r.Append("\\r");
                else if (ch == '\t') r.Append("\\t");
                else if (ch < ' ' || ch == '\x7f') r.Append("\\x").Append(((int)ch).ToString("x2", CultureInfo.InvariantCulture));
                else r.Append(ch);
            }
            return r.Append(q).ToString();
        }
        void Format(StringBuilder o, object v, bool inner)
        {
            if (o.Length > ${MAX_ANSWER_CHARS}) throw new InvalidOperationException("AnswerTooLong");
            if (v == null) { o.Append(inner ? "None" : ""); return; }
            if (v is bool b) { o.Append(b ? "True" : "False"); return; }
            if (v is string str) { o.Append(inner ? PyRepr(str) : str); return; }
            if (v is char c) { o.Append(inner ? PyRepr(c.ToString()) : c.ToString()); return; }
            if (v is double d) { o.Append(PyFloat(d)); return; }
            if (v is float f) { o.Append(PyFloat(f)); return; }
            if (v is decimal m) { o.Append(PyFloat((double)m)); return; }
            if (v is IDictionary dict)
            {
                o.Append('{');
                var first = true;
                foreach (DictionaryEntry entry in dict)
                {
                    if (!first) o.Append(", ");
                    first = false;
                    Format(o, entry.Key, true);
                    o.Append(": ");
                    Format(o, entry.Value, true);
                }
                o.Append('}');
                return;
            }
            if (v is IEnumerable items)
            {
                o.Append('[');
                var first = true;
                foreach (var item in items)
                {
                    if (!first) o.Append(", ");
                    first = false;
                    Format(o, item, true);
                }
                o.Append(']');
                return;
            }
            if (v is IFormattable formattable) { o.Append(formattable.ToString(null, CultureInfo.InvariantCulture)); return; }
            o.Append(v.ToString());
        }

        var marker = Next();
        var count = ReadInt();
        var lines = new List<string>();
        for (var t = 0; t < count; t++)
        {
            var index = ReadInt();
${reads}
            try
            {
                var answer = new StringBuilder();
                Format(answer, Solution(${callArgs}), false);
                lines.Add(index + " ok " + Pack(answer.ToString()));
            }
            catch (Exception error)
            {
                lines.Add(index + " err " + error.GetType().Name + " " + Pack(error.Message));
            }
        }

        // Блок результатов — одним куском в самом конце: всё, что решение
        // напечатало само, оказывается до маркера и отбрасывается
        Console.WriteLine(marker + " start");
        foreach (var line in lines) Console.WriteLine(line);
        Console.WriteLine(marker + " end");
    }
}
`;
}

// ---------- Ввод ----------

function encodeValue(value: unknown, type: CsharpType, out: string[]): void {
  if (type.endsWith('[]')) {
    const items = value as unknown[];
    out.push(String(items.length));
    const inner = type.slice(0, -2) as CsharpType;
    for (const item of items) encodeValue(item, inner, out);
    return;
  }
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      out.push(String(value));
      return;
    case 'bool':
      out.push(value ? '1' : '0');
      return;
    case 'string':
      // Префикс "s": пустая строка иначе потерялась бы при разбиении по пробелам
      out.push('s' + Buffer.from(String(value), 'utf8').toString('base64'));
      return;
    default:
      throw new Error(`Нет записи для типа ${type}`);
  }
}

export interface CsharpTestInput {
  index: number;
  args: unknown[];
}

/** Стандартный ввод программы: маркер, число тестов, затем индекс и аргументы каждого */
export function encodeCsharpInput(
  marker: string,
  signature: ProgramSignature,
  tests: CsharpTestInput[]
): string {
  const lines = [marker, String(tests.length)];
  for (const test of tests) {
    const out: string[] = [String(test.index)];
    signature.args.forEach((arg, i) => encodeValue(test.args[i], arg.type as CsharpType, out));
    lines.push(out.join(' '));
  }
  return lines.join('\n') + '\n';
}

// ---------- Вывод ----------

// Формат блока результатов и сравнение ответов — общие с JavaScript
export {
  parseResultBlock as parseCsharpOutput,
  compareResults as compareCsharpResults,
  type TestOutcome as CsharpTestOutcome,
  type TypedTestcase as CsharpTestcase,
  type TypedTestResult as CsharpTestResult,
} from '@/lib/typed-results';

/**
 * Ошибки компиляции mono пишет в stdout: строки вида
 * main.cs.cs(12,57): error CS1061: ... Оставляем только ошибки и переводим
 * позицию в номер символа внутри выражения игрока.
 */
export function formatCompileErrors(compilerOutput: string, program: string, expression: string): string {
  const programLines = program.split('\n');
  const solutionLine = programLines.findIndex((l) => l.startsWith(SOLUTION_LINE_PREFIX)) + 1;
  const exprColumn = (programLines[solutionLine - 1] || '').indexOf('=> ') + 4;
  const exprLength = expression.trim().length;

  const errors = compilerOutput
    .split(/\r?\n/)
    .map((line) => line.match(/\((\d+),(\d+)\):\s*error\s+(CS\d+):\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .slice(0, 3)
    .map((m) => {
      const line = Number(m[1]);
      const column = Number(m[2]);
      const position =
        line === solutionLine && column >= exprColumn && column <= exprColumn + exprLength
          ? ` (символ ${column - exprColumn + 1})`
          : '';
      return `${m[3]}${position}: ${m[4].trim()}`;
    });

  return errors.length > 0 ? errors.join('\n') : 'Не удалось скомпилировать решение';
}

// ---------- Прогон ----------

export type CsharpRunResult =
  | { kind: 'ok'; outcomes: Map<number, TestOutcome> }
  | { kind: 'compile_error'; message: string }
  | { kind: 'crash'; message: string }
  | { kind: 'timeout' }
  | { kind: 'infra'; message: string };

// Одновременно — не больше CSHARP_MAX_CONCURRENT компиляций: раннеру отдано
// полядра, две параллельные сборки просто идут вдвое дольше каждая.
// Черновые проверки и отправки в рейтинг стоят в одной очереди.
const MAX_CONCURRENT = Math.max(1, Number(process.env.CSHARP_MAX_CONCURRENT || 1));
const MAX_WAITING = 6;
let running = 0;
const waiting: Array<() => void> = [];

export class CsharpBusyError extends Error {
  constructor() {
    super('C# runner is busy');
  }
}

async function withSlot<T>(fn: () => Promise<T>, allowWait: boolean): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    if (!allowWait && waiting.length >= MAX_WAITING) throw new CsharpBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

/**
 * Компилирует и прогоняет выражение на тестах одним запуском.
 * allowWait: отправка в рейтинг ждёт своей очереди всегда, а черновая
 * проверка при длинной очереди сразу получает «занято».
 */
export async function runCsharp(params: {
  expression: string;
  signature: ProgramSignature;
  tests: CsharpTestInput[];
  runTimeoutMs: number;
  allowWait: boolean;
}): Promise<CsharpRunResult> {
  const marker = randomBytes(16).toString('hex');
  const program = buildCsharpProgram(params.expression, params.signature);
  const stdin = encodeCsharpInput(marker, params.signature, params.tests);
  const runTimeout = Math.min(MAX_RUN_TIMEOUT_MS, Math.max(params.runTimeoutMs, 2000));

  return withSlot(async () => {
    const signal = AbortSignal.timeout(COMPILE_TIMEOUT_MS + runTimeout + 8000);
    const result = await executeCode(program, runTimeout, signal, {
      language: CSHARP_PISTON_LANGUAGE,
      version: CSHARP_PISTON_VERSION,
      fileName: 'main.cs',
      stdin,
      compileTimeoutMs: COMPILE_TIMEOUT_MS,
    });

    if (result.compileFailed) {
      const text = result.compileOutput || '';
      if (/timed out|SIGKILL/i.test(text) || result.compileSignal) {
        return { kind: 'infra', message: 'Сборка не уложилась во время — сервер перегружен, попробуйте ещё раз' };
      }
      return { kind: 'compile_error', message: formatCompileErrors(text, program, params.expression) };
    }

    if (result.errorKind === 'infra') {
      return { kind: 'infra', message: result.error || 'Раннер недоступен' };
    }
    if (result.errorKind === 'timeout') {
      return { kind: 'timeout' };
    }

    const outcomes = parseResultBlock(result.stdout || result.output || '', marker);
    if (outcomes) return { kind: 'ok', outcomes };

    // Блока нет: процесс убит по времени или памяти, либо упал целиком
    const text = `${result.error || ''} ${result.stderr || ''}`;
    if (/SIGKILL|timed out|killed/i.test(text)) return { kind: 'timeout' };
    if (/StackOverflow|Stack overflow/i.test(text)) {
      return { kind: 'crash', message: 'Переполнение стека — похоже на бесконечную рекурсию' };
    }
    if (/OutOfMemory/i.test(text)) {
      return { kind: 'crash', message: 'Решению не хватило памяти' };
    }
    return { kind: 'crash', message: 'Программа завершилась аварийно, не дойдя до конца тестов' };
  }, params.allowWait);
}
