/**
 * Регрессионная проверка изоляции раннера.
 *
 * Генерирует настоящий код раннера и запускает его локальным Python.
 * Задача проверки — поймать возврат дыры, из-за которой решение могло
 * прочитать правильные ответы прямо из проверяющего кода.
 *
 * Запуск: npm run test:sandbox   (нужен установленный python)
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { generateBatchTestCode, generateTestCode } from '../src/lib/python-serializer';

const PYTHON = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
const MARKER = 'deadbeefdeadbeefdeadbeefdeadbeef';
const FUNCTION_ARGS = ['nums'];

const TESTCASES = [
  { index: 0, args: [[1, 2, 3]], expectedOutput: '6', isHidden: false },
  { index: 1, args: [[10, 20]], expectedOutput: '30', isHidden: false },
  { index: 2, args: [[5]], expectedOutput: '5', isHidden: true },
];

interface RunnerResult {
  results: Array<{
    index: number;
    passed: boolean;
    isHidden: boolean;
    actual: string | null;
    expected: string | null;
    error: string | null;
  }>;
}

let workDir = '';
let failures = 0;
let checks = 0;

function runPython(code: string): { stdout: string; stderr: string; crashed: boolean } {
  const file = path.join(workDir, 'run-' + Math.random().toString(36).slice(2) + '.py');
  writeFileSync(file, code, 'utf8');
  try {
    const stdout = execFileSync(PYTHON, [file], {
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', crashed: false };
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || String(error.message), crashed: true };
  }
}

function runBatch(userCode: string): RunnerResult | null {
  const code = generateBatchTestCode(userCode, FUNCTION_ARGS, TESTCASES, [], MARKER, '');
  const { stdout } = runPython(code);
  const startMarker = '__ARENA_' + MARKER + '_START__';
  const endMarker = '__ARENA_' + MARKER + '_END__';
  const start = stdout.lastIndexOf(startMarker);
  const end = stdout.lastIndexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stdout.slice(start + startMarker.length, end).trim()) as RunnerResult;
  } catch {
    return null;
  }
}

function check(name: string, condition: boolean, detail = '') {
  checks += 1;
  if (condition) {
    console.log('  OK   ' + name);
  } else {
    failures += 1;
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

/** Читерское решение не должно пройти ни один тест */
function expectCheatBlocked(userCode: string) {
  const parsed = runBatch(userCode);
  if (!parsed) {
    // Раннер не выдал результата (решение уронило скрипт) — тоже отказ
    check('заблокировано: ' + userCode, true);
    return;
  }
  const passedAny = parsed.results.some((r) => r.passed);
  check('заблокировано: ' + userCode, !passedAny, passedAny ? 'тесты пройдены без честного решения' : '');
}

function main() {
  workDir = mkdtempSync(path.join(tmpdir(), 'arena-sandbox-'));

  try {
    execFileSync(PYTHON, ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('ERROR: не найден python (' + PYTHON + '). Укажите через PYTHON_BIN.');
    process.exit(1);
  }

  console.log('1. Честное решение');
  const honest = runBatch('sum(nums)');
  check('sum(nums) проходит все тесты', !!honest && honest.results.every((r) => r.passed));
  check('получены результаты по всем тестам', honest?.results.length === TESTCASES.length);

  console.log('');
  console.log('2. Скрытый тест не раскрывает данные');
  const hidden = honest?.results.find((r) => r.index === 2);
  check('скрытый тест помечен как скрытый', hidden?.isHidden === true);
  check('ожидаемый ответ скрытого теста не отдан', hidden?.expected === null);
  check('полученный ответ скрытого теста не отдан', hidden?.actual === null);
  const visible = honest?.results.find((r) => r.index === 0);
  check('у открытого теста данные видны', visible?.expected === '6' && visible?.actual === '6');

  console.log('');
  console.log('3. Попытки списать ответ (должны быть заблокированы)');
  [
    'test["expected"]',
    'tests[0]["expected"]',
    'str(tests)',
    'results',
    'expected',
    'actual',
    'fn',
    'output',
    'json',
    '[results.clear(), 6][1]',
    'test.get("expected")',
  ].forEach(expectCheatBlocked);

  console.log('');
  console.log('4. Попытки выйти за песочницу (должны быть заблокированы)');
  [
    '__import__("os").listdir(".")',
    'eval("6")',
    'open("/etc/passwd").read()',
    'globals()',
    'vars()',
    '().__class__',
    'sum(nums).__class__.__mro__',
    'getattr(nums, "pop")',
  ].forEach(expectCheatBlocked);

  console.log('');
  console.log('5. Ошибки в решении обрабатываются аккуратно');
  const raises = runBatch('nums / 0');
  check('исключение не ломает раннер', !!raises && raises.results.length === TESTCASES.length);
  check('текст ошибки отдан по открытому тесту', !!raises?.results[0]?.error);
  const hiddenErr = raises?.results.find((r) => r.index === 2);
  check('по скрытому тесту отдан только тип ошибки', !!hiddenErr?.error && !hiddenErr.error.includes(':'));

  const broken = runBatch('sum(nums');
  check('синтаксическая ошибка не ломает раннер', !!broken && broken.results.length === TESTCASES.length);
  check('синтаксическая ошибка объяснена', !!broken?.results[0]?.error?.includes('SyntaxError'));

  console.log('');
  console.log('6. Окружения подключаются');
  const withEnv = generateBatchTestCode('m.prod(nums)', FUNCTION_ARGS, TESTCASES, [], MARKER, 'import math as m\n');
  check('prelude окружения доступен решению', runPython(withEnv).stdout.includes('"passed": true'));

  console.log('');
  console.log('7. Рекурсия решения работает');
  const recursive = runBatch('nums[0] if len(nums) == 1 else nums[0] + solution(nums[1:])');
  check('решение может вызывать себя', !!recursive && recursive.results.every((r) => r.passed));

  console.log('');
  console.log('8. Одиночный прогон (локальная проверка и запасной путь)');
  const single = generateTestCode('sum(nums)', FUNCTION_ARGS, [[1, 2, 3]], [], '');
  check('одиночный прогон печатает ответ', runPython(single).stdout.trim() === '6');
  const singleCheat = generateTestCode('test["expected"]', FUNCTION_ARGS, [[1, 2, 3]], [], '');
  check('в одиночном прогоне данных тестов нет', runPython(singleCheat).crashed);

  console.log('');
  console.log('Всего проверок: ' + checks + ', провалено: ' + failures);
  if (failures > 0) {
    console.error('ERROR: изоляция раннера нарушена. Это дыра в честности проверки решений.');
    process.exit(1);
  }
  console.log('OK: изоляция раннера в порядке.');
}

try {
  main();
} finally {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
}
