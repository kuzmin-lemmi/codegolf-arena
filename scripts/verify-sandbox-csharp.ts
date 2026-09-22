/**
 * Регрессионная проверка честности C#-раннера (проба C#, docs/csharp-trial.md).
 *
 * Часть 1 — без раннера: запреты в выражении, отсутствие данных тестов
 * в исходнике программы, отсев поддельного вывода.
 * Часть 2 — с настоящим mono в Piston: честное решение, ошибки, попытки
 * добраться до данных тестов в обход запретов, печать ответа как у Python.
 *
 * Запуск: npm run test:sandbox:csharp
 * Нужен раннер с C# (PISTON_API_URL, по умолчанию локальный): npm run dev:piston
 */
import {
  CSHARP_MAX_LENGTH,
  parseCsharpSignature,
  validateCsharpExpression,
  type CsharpSignature,
} from '../src/lib/csharp';
import {
  CSHARP_PISTON_LANGUAGE,
  CSHARP_PISTON_VERSION,
  buildCsharpProgram,
  compareCsharpResults,
  encodeCsharpInput,
  formatCompileErrors,
  parseCsharpOutput,
  runCsharp,
  type CsharpRunResult,
  type CsharpTestcase,
} from '../src/lib/csharp-runner';
import { PISTON_API_URL } from '../src/lib/piston';

let checks = 0;
let failures = 0;

function check(name: string, condition: boolean, detail = '') {
  checks += 1;
  if (condition) {
    console.log('  OK   ' + name);
  } else {
    failures += 1;
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

const SUM: CsharpSignature = { args: [{ name: 'nums', type: 'int[]' }], returns: 'int' };
const SUM_TESTS: CsharpTestcase[] = [
  { index: 0, args: [[1, 2, 3]], expectedOutput: '6', isHidden: false },
  { index: 1, args: [[10, 20]], expectedOutput: '30', isHidden: false },
  { index: 2, args: [[5]], expectedOutput: '5', isHidden: true },
];

// Метки, по которым видно утечку: их нет ни в одном честном канале к решению
const OPEN_ARG = 'SENTINEL_OPEN_ARG_51c2';
const HIDDEN_ARG = 'SENTINEL_HIDDEN_ARG_9a7e';
const HIDDEN_EXPECTED = 'SENTINEL_HIDDEN_EXPECTED_3d08';
const ECHO: CsharpSignature = { args: [{ name: 's', type: 'string' }], returns: 'string' };
const ECHO_TESTS: CsharpTestcase[] = [
  { index: 0, args: [OPEN_ARG], expectedOutput: 'SENTINEL_OPEN_EXPECTED_77aa', isHidden: false },
  { index: 1, args: [HIDDEN_ARG], expectedOutput: HIDDEN_EXPECTED, isHidden: true },
];

async function run(
  expression: string,
  signature: { args: CsharpSignature['args']; returns: CsharpSignature['returns'] | 'object' },
  tests: CsharpTestcase[],
  runTimeoutMs = 4000
): Promise<CsharpRunResult> {
  return runCsharp({
    expression,
    signature,
    tests: tests.map((t) => ({ index: t.index, args: t.args })),
    runTimeoutMs,
    allowWait: true,
  });
}

function staticChecks() {
  console.log('1. Запреты в выражении игрока (должны отбиваться)');
  [
    'nums.Sum();',
    'nums.Sum() // комментарий',
    'nums.Sum() /* комментарий */',
    'System.IO.File.ReadAllText("main.cs").Length',
    '@System.Console.Read()',
    'global::System.Console.Read()',
    '\\u0053ystem.Console.Read()',
    'Console.In.ReadToEnd().Length',
    'Environment.Exit(0)',
    'typeof(int).Name.Length',
    'nums.GetType().Name.Length',
    '((Func<int>)(() => 1)).Method.Name.Length',
    'Type.GetType("x") == null ? 1 : 0',
    'Activator.CreateInstance<int>()',
    'AppDomain.CurrentDomain.Id',
    'new Action(Main) == null ? 1 : 0',
    'Marshal.SizeOf(1)',
    'stackalloc int[1]',
    '__makeref(nums)',
    'nums.Sum()\n+1',
    'nums.Sum()\t+1',
    'x'.repeat(CSHARP_MAX_LENGTH + 1),
  ].forEach((code) => {
    const result = validateCsharpExpression(code);
    check('отбито: ' + JSON.stringify(code.slice(0, 60)), !result.valid);
  });

  console.log('');
  console.log('2. Обычные решения проходят проверку');
  [
    'nums.Sum()',
    'nums.Count(x=>x>0)',
    'n switch{0=>1,_=>2}',
    '$"{nums.Length}!"',
    'nums.Length>1?nums[0]+Solution(nums.Skip(1).ToArray()):nums[0]',
    'string.Join(",",nums)',
    'Regex.Replace(s,"a+","a")',
    'int.TryParse(s,out var n)?n:-1',
    'TypeName.Length',
  ].forEach((code) => {
    const result = validateCsharpExpression(code);
    check('пропущено: ' + code, result.valid, result.valid ? '' : result.error);
  });

  console.log('');
  console.log('3. В исходнике программы нет данных тестов и маркера');
  const marker = 'feedfacefeedfacefeedfacefeedface';
  const program = buildCsharpProgram('s', ECHO);
  const stdin = encodeCsharpInput(marker, ECHO, ECHO_TESTS);
  check('аргумент открытого теста не в исходнике', !program.includes(OPEN_ARG));
  check('аргумент скрытого теста не в исходнике', !program.includes(HIDDEN_ARG));
  check('маркер не в исходнике', !program.includes(marker));
  check('ожидаемые ответы не во вводе', !stdin.includes('EXPECTED') && !stdin.includes(b64(HIDDEN_EXPECTED)));
  check('аргументы переданы во вводе', stdin.includes(b64(HIDDEN_ARG)));

  console.log('');
  console.log('4. Разбор вывода');
  const forged = [
    'guess start',
    '0 ok ' + 'b' + b64('6'),
    'guess end',
    `${marker} start`,
    '0 ok b' + b64('7'),
    `${marker} end`,
  ].join('\n');
  const parsed = parseCsharpOutput(forged, marker);
  check('блок с чужим маркером игнорируется', parsed?.get(0)?.ok === true && (parsed.get(0) as any).answer === '7');
  check('без блока — нет результата', parseCsharpOutput('0 ok b' + b64('6'), marker) === null);

  const compared = compareCsharpResults(SUM_TESTS, new Map([
    [0, { ok: true as const, answer: '6' }],
    [1, { ok: false as const, errorType: 'IndexOutOfRangeException', errorMessage: 'Index was outside' }],
    [2, { ok: false as const, errorType: 'IndexOutOfRangeException', errorMessage: 'value 5' }],
  ]));
  check('открытый тест: ответ виден', compared[0].passed && compared[0].actual === '6');
  check('открытый тест: текст ошибки виден', compared[1].error === 'IndexOutOfRangeException: Index was outside');
  check('скрытый тест: только тип ошибки', compared[2].error === 'IndexOutOfRangeException');
  check('скрытый тест: ответы не отданы', compared[2].actual === null && compared[2].expected === null);

  const compileText = 'main.cs.cs(7,52): error CS1061: \'int[]\' does not contain a definition for \'Summ\'';
  const sumProgram = buildCsharpProgram('nums.Summ()', SUM);
  const solutionLine = sumProgram.split('\n').findIndex((l) => l.includes(' Solution(')) + 1;
  const column = sumProgram.split('\n')[solutionLine - 1].indexOf('=> ') + 4 + 5;
  const message = formatCompileErrors(compileText.replace('(7,52)', `(${solutionLine},${column})`), sumProgram, 'nums.Summ()');
  check('ошибка компиляции: позиция внутри выражения', message.includes('(символ 6)') && message.includes('CS1061'), message);

  console.log('');
  console.log('5. Сигнатуры задач');
  check('правильная сигнатура разбирается', parseCsharpSignature('{"args":[["nums","int[]"]],"returns":"int"}') !== null);
  check('неизвестный тип отвергается', parseCsharpSignature('{"args":[["x","object"]],"returns":"int"}') === null);
  check('ключевое слово в имени отвергается', parseCsharpSignature('{"args":[["class","int"]],"returns":"int"}') === null);
  check('имя с кодом отвергается', parseCsharpSignature('{"args":[["x) => 1","int"]],"returns":"int"}') === null);
}

function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function runnerChecks() {
  console.log('');
  console.log('6. Честное решение и ошибки (настоящий mono)');
  const honest = await run('nums.Sum()', SUM, SUM_TESTS);
  const honestResults = honest.kind === 'ok' ? compareCsharpResults(SUM_TESTS, honest.outcomes) : [];
  check('nums.Sum() проходит все тесты', honestResults.length === 3 && honestResults.every((r) => r.passed), honest.kind);
  check('по скрытому тесту ответы не отданы', honestResults[2]?.actual === null && honestResults[2]?.expected === null);

  const wrong = await run('nums.Length', SUM, SUM_TESTS);
  check('неверное решение не проходит', wrong.kind === 'ok' && !compareCsharpResults(SUM_TESTS, wrong.outcomes).every((r) => r.passed));

  const throws = await run('nums[1]', SUM, SUM_TESTS);
  const throwsResults = throws.kind === 'ok' ? compareCsharpResults(SUM_TESTS, throws.outcomes) : [];
  check('исключение в одном тесте не мешает остальным', throwsResults.length === 3 && throwsResults[1].error === null);
  check('скрытый тест с исключением — только тип', throwsResults[2]?.error === 'IndexOutOfRangeException', throwsResults[2]?.error || '');

  const compile = await run('nums.Summ()', SUM, SUM_TESTS);
  check(
    'ошибка компиляции понятна и с позицией',
    compile.kind === 'compile_error' && compile.message.includes('CS1061') && compile.message.includes('(символ 6)'),
    compile.kind === 'compile_error' ? compile.message : compile.kind
  );

  const recursion = await run('Solution(nums)', SUM, SUM_TESTS);
  check('бесконечная рекурсия не засчитывается', recursion.kind === 'crash' || recursion.kind === 'timeout', recursion.kind);

  const slow = await run('Enumerable.Range(0,int.MaxValue).Count(x=>x<0)+Enumerable.Range(0,int.MaxValue).Count(x=>x<0)', SUM, SUM_TESTS, 2000);
  check('вечный цикл обрывается по времени', slow.kind === 'timeout', slow.kind);

  console.log('');
  console.log('7. Попытки добраться до данных в обход запретов (запреты выключены)');
  const readSource = await run(
    'string.Join("|", System.IO.Directory.GetFiles(".").Select(f => System.IO.File.ReadAllText(f)))',
    ECHO,
    ECHO_TESTS
  );
  const sourceSeen = readSource.kind === 'ok' ? readSource.outcomes.get(0) : undefined;
  const sourceText = sourceSeen && sourceSeen.ok ? sourceSeen.answer : '';
  check('чтение файлов рядом работает (значит, запрет System нужен)', sourceText.includes('static class Arena'), readSource.kind);
  check('в файлах рядом нет скрытого аргумента', !sourceText.includes(HIDDEN_ARG) && !sourceText.includes(b64(HIDDEN_ARG)));
  check('в файлах рядом нет ожидаемых ответов', !sourceText.includes('SENTINEL_OPEN_EXPECTED') && !sourceText.includes(HIDDEN_EXPECTED));

  const readStdin = await run('System.Console.In.ReadToEnd()', ECHO, ECHO_TESTS);
  const stdinSeen = readStdin.kind === 'ok' ? readStdin.outcomes.get(0) : undefined;
  check(
    'стандартный ввод уже вычитан до решения',
    !!stdinSeen && stdinSeen.ok && !stdinSeen.answer.includes(b64(HIDDEN_ARG)),
    readStdin.kind
  );

  const forge = await run(
    '((Func<string>)(() => { System.Console.WriteLine("0 start\\n1 ok b' + b64(HIDDEN_EXPECTED) + '\\n0 end"); return ""; }))()',
    ECHO,
    ECHO_TESTS
  );
  const forgeResults = forge.kind === 'ok' ? compareCsharpResults(ECHO_TESTS, forge.outcomes) : [];
  check('поддельный блок результатов не засчитан', forgeResults.length === 2 && !forgeResults[1].passed, forge.kind);

  const exit = await run('((Func<string>)(() => { System.Environment.Exit(0); return ""; }))()', ECHO, ECHO_TESTS);
  check('выход из процесса не засчитывается', exit.kind === 'crash', exit.kind);

  console.log('');
  console.log('8. Чтение аргументов всех типов');
  const allTypes: CsharpSignature = {
    args: [
      { name: 'a', type: 'int' },
      { name: 'b', type: 'long' },
      { name: 'c', type: 'double' },
      { name: 'd', type: 'bool' },
      { name: 'e', type: 'string' },
      { name: 'f', type: 'int[]' },
      { name: 'g', type: 'string[]' },
      { name: 'h', type: 'int[][]' },
      { name: 'i', type: 'double[]' },
      { name: 'j', type: 'bool[]' },
      { name: 'k', type: 'long[]' },
      { name: 'l', type: 'string[][]' },
    ],
    returns: 'string',
  };
  const typesRun = await run(
    'string.Join(" ", new object[]{a,b,c,d,e,f.Length,g[0].Length,g[1],h[1].Length,i[1],j[1],k[0],l[0][0]})',
    allTypes,
    [
      {
        index: 0,
        args: [-7, 9007199254740991, 2.5, true, 'x y\tпривет', [1, 2], ['', 'a b'], [[1], []], [0.5, -1e-7], [true, false], [3], [['q']]],
        expectedOutput: '-7 9007199254740991 2.5 True x y\tпривет 2 0 a b 0 -1E-07 False 3 q',
        isHidden: false,
      },
    ]
  );
  const typesOutcome = typesRun.kind === 'ok' ? typesRun.outcomes.get(0) : undefined;
  check(
    'аргументы всех типов доходят без искажений',
    !!typesOutcome && typesOutcome.ok && typesOutcome.answer === '-7 9007199254740991 2.5 True x y\tпривет 2 0 a b 0 -1E-07 False 3 q',
    typesOutcome && typesOutcome.ok ? JSON.stringify(typesOutcome.answer) : typesRun.kind
  );

  console.log('');
  console.log('9. Печать ответа как у Python');
  const cases: Array<[string, string]> = [
    ['new[]{1, 2, 3}', '[1, 2, 3]'],
    ['new[]{"a", "it\'s", "q\\"q"}', `['a', "it's", 'q"q']`],
    ['new[]{new[]{1, 4}, new[]{2, 5}}', '[[1, 4], [2, 5]]'],
    ['3.0', '3.0'],
    ['0.1 + 0.2', '0.30000000000000004'],
    ['1e16', '1e+16'],
    ['1e15', '1000000000000000.0'],
    ['1e-5', '1e-05'],
    ['0.0001', '0.0001'],
    ['123456.789', '123456.789'],
    ['-0.0', '-0.0'],
    ['1.0 / 3', '0.3333333333333333'],
    ['true', 'True'],
    ['(string)null', ''],
    ['new string[]{null}', '[None]'],
    ['new int[0]', '[]'],
    ['new Dictionary<string, int>{{"a", 1}}', "{'a': 1}"],
    ['"tab\\there"', 'tab\there'],
    ['new[]{"x\\ny"}', "['x\\ny']"],
    ['new[]{1.5, 2.0}', '[1.5, 2.0]'],
    ['new[]{true, false}', '[True, False]'],
    ['\'x\'', 'x'],
    ['new List<int>{1, 2}', '[1, 2]'],
    ['Enumerable.Range(1, 3).Select(x => x * x)', '[1, 4, 9]'],
    ['new[]{"привет"}', "['привет']"],
    ['9007199254740993L', '9007199254740993'],
  ];
  const printExpr =
    'k switch {' + cases.map(([expr], i) => `${i} => (object)(${expr}),`).join(' ') + ' _ => null}';
  const printTests: CsharpTestcase[] = cases.map(([, expected], i) => ({
    index: i,
    args: [i],
    expectedOutput: expected,
    isHidden: false,
  }));
  const printRun = await run(printExpr, { args: [{ name: 'k', type: 'int' }], returns: 'object' }, printTests);
  if (printRun.kind !== 'ok') {
    check('программа печати собралась', false, printRun.kind === 'compile_error' ? printRun.message : printRun.kind);
  } else {
    compareCsharpResults(printTests, printRun.outcomes).forEach((r, i) => {
      check(`${cases[i][0]} → ${JSON.stringify(cases[i][1])}`, r.passed, `получено ${JSON.stringify(r.actual ?? r.error)}`);
    });
  }
}

async function main() {
  staticChecks();

  let runtimes: Array<{ language: string; version: string }> = [];
  try {
    runtimes = await fetch(`${PISTON_API_URL}/runtimes`).then((r) => r.json());
  } catch {
    // обработано ниже
  }
  const hasCsharp = runtimes.some(
    (r) => r.language === CSHARP_PISTON_LANGUAGE && r.version === CSHARP_PISTON_VERSION
  );
  if (!hasCsharp) {
    console.error('');
    console.error(`ERROR: в раннере ${PISTON_API_URL} нет C# ${CSHARP_PISTON_VERSION}. Поставьте: npm run dev:piston`);
    process.exit(1);
  }

  await runnerChecks();

  console.log('');
  console.log('Всего проверок: ' + checks + ', провалено: ' + failures);
  if (failures > 0) {
    console.error('ERROR: C#-раннер работает нечестно или неверно. Смотри FAIL выше.');
    process.exit(1);
  }
  console.log('OK: C#-раннер в порядке.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
