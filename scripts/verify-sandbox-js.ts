/**
 * Регрессионная проверка честности JavaScript-раннера (docs/three-languages.md).
 *
 * Часть 1 — без раннера: запреты и разбор выражения, отсутствие данных тестов
 * в исходнике программы.
 * Часть 2 — с настоящим Node.js в Piston: честное решение, ошибки, попытки
 * добраться до ответов в обход запретов, печать ответа как у Python.
 *
 * Запуск: npm run test:sandbox:js
 * Нужен раннер с Node.js (PISTON_API_URL, по умолчанию локальный): npm run dev:piston
 */
import { JS_MAX_LENGTH, validateJsExpression, isJsSignatureUsable } from '../src/lib/javascript';
import {
  JS_PISTON_LANGUAGE,
  JS_PISTON_VERSION,
  buildJsProgram,
  encodeJsInput,
  runJs,
  type JsProgramSignature,
  type JsRunResult,
} from '../src/lib/js-runner';
import { compareResults, type TypedTestcase } from '../src/lib/typed-results';
import type { CsharpSignature } from '../src/lib/csharp';
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
const SUM_TESTS: TypedTestcase[] = [
  { index: 0, args: [[1, 2, 3]], expectedOutput: '6', isHidden: false },
  { index: 1, args: [[10, 20]], expectedOutput: '30', isHidden: false },
  { index: 2, args: [[5]], expectedOutput: '5', isHidden: true },
];

// Метки, по которым видно утечку: их нет ни в одном честном канале к решению
const OPEN_ARG = 'SENTINEL_OPEN_ARG_51c2';
const HIDDEN_ARG = 'SENTINEL_HIDDEN_ARG_9a7e';
const OPEN_EXPECTED = 'SENTINEL_OPEN_EXPECTED_77aa';
const HIDDEN_EXPECTED = 'SENTINEL_HIDDEN_EXPECTED_3d08';
const ECHO: CsharpSignature = { args: [{ name: 's', type: 'string' }], returns: 'string' };
const ECHO_TESTS: TypedTestcase[] = [
  { index: 0, args: [OPEN_ARG], expectedOutput: OPEN_EXPECTED, isHidden: false },
  { index: 1, args: [HIDDEN_ARG], expectedOutput: HIDDEN_EXPECTED, isHidden: true },
];

async function run(
  expression: string,
  signature: JsProgramSignature,
  tests: TypedTestcase[],
  runTimeoutMs = 4000
): Promise<JsRunResult> {
  return runJs({
    expression,
    signature,
    tests: tests.map((t) => ({ index: t.index, args: t.args })),
    runTimeoutMs,
  });
}

function answerOf(result: JsRunResult, index: number): string {
  if (result.kind !== 'ok') return '';
  const outcome = result.outcomes.get(index);
  return outcome && outcome.ok ? outcome.answer : '';
}

function staticChecks() {
  console.log('1. Запреты и разбор выражения (должны отбиваться)');
  [
    'nums.length;',
    'nums.length\n+1',
    'nums.length\u2028+1',
    'nums.\tlength',
    'nums.length/*',
    "require('fs')",
    'process.exit(0)',
    "import('fs')",
    "eval('1')",
    "Function('return 1')()",
    'globalThis.x',
    'global.x',
    "''.constructor.constructor('return 1')()",
    'arguments[1]',
    'module.exports',
    'exports.x',
    '__filename',
    '__dirname',
    "Buffer.from('x')",
    '\\u0070rocess.exit()',
    '0), x = (1',
    '1)//',
    '1), (2',
    'a<!--b',
    'let x = 1',
    'if (1) 2',
    'nums.length }',
    '',
    '   ',
    'x'.repeat(JS_MAX_LENGTH + 1),
  ].forEach((code) => {
    const result = validateJsExpression(code);
    check('отбито: ' + JSON.stringify(code.slice(0, 50)), !result.valid);
  });

  console.log('2. Обычные решения (должны проходить)');
  [
    'nums.reduce((a,b)=>a+b,0)',
    '(s=0,nums.map(x=>s+=x),s)',
    "[...s].reverse().join('')",
    's.split(sep)',
    'nums.length?1:0',
    '/[aeiou]/g.test(s)',
    '`${s}!`',
    'n-->0',
    'nums.at(-1)',
    '2**10',
    'BigInt(n)*2n',
    'x=>x+1',
    '({a:1}).a',
    'solution(n-1)',
    'nums.map(x=>x*2)//комментарий в конце',
  ].forEach((code) => {
    const result = validateJsExpression(code);
    check('пропущено: ' + code, result.valid, result.valid ? '' : result.error);
  });

  console.log('3. Данных тестов нет в исходнике программы');
  const marker = 'MARKER_c0ffee';
  const program = buildJsProgram('s', ECHO);
  const stdin = encodeJsInput(marker, ECHO_TESTS.map((t) => ({ index: t.index, args: t.args })));
  check('аргумент открытого теста не в исходнике', !program.includes(OPEN_ARG));
  check('аргумент скрытого теста не в исходнике', !program.includes(HIDDEN_ARG));
  check('маркер не в исходнике', !program.includes(marker));
  check('ожидаемые ответы не во вводе', !stdin.includes('EXPECTED'));
  check('аргументы переданы во вводе', stdin.includes(HIDDEN_ARG));

  console.log('4. Сигнатура');
  check('обычные имена подходят', isJsSignatureUsable(SUM));
  check(
    'зарезервированное имя отвергается',
    !isJsSignatureUsable({ args: [{ name: 'new', type: 'int' }], returns: 'int' })
  );
}

async function runnerChecks() {
  console.log('5. Прогон на настоящем Node.js');

  const honest = await run('nums.reduce((a,b)=>a+b,0)', SUM, SUM_TESTS);
  const honestResults = honest.kind === 'ok' ? compareResults(SUM_TESTS, honest.outcomes) : [];
  check('reduce проходит все тесты', honestResults.length === 3 && honestResults.every((r) => r.passed), honest.kind);
  check('по скрытому тесту ответы не отданы', honestResults[2]?.actual === null && honestResults[2]?.expected === null);

  const wrong = await run('nums.length', SUM, SUM_TESTS);
  check('неверное решение не проходит', wrong.kind === 'ok' && !compareResults(SUM_TESTS, wrong.outcomes).every((r) => r.passed));

  const throws = await run("nums.length==2?null.x:nums.reduce((a,b)=>a+b,0)", SUM, [
    SUM_TESTS[0],
    SUM_TESTS[1],
    { index: 2, args: [[4, 1]], expectedOutput: '5', isHidden: true },
  ]);
  const throwsResults =
    throws.kind === 'ok'
      ? compareResults(
          [SUM_TESTS[0], SUM_TESTS[1], { index: 2, args: [[4, 1]], expectedOutput: '5', isHidden: true }],
          throws.outcomes
        )
      : [];
  check('исключение в одном тесте не мешает остальным', throwsResults[0]?.passed === true, throws.kind);
  check('открытый тест: текст ошибки виден', (throwsResults[1]?.error || '').startsWith('TypeError: '), throwsResults[1]?.error || '');
  check('скрытый тест с исключением — только тип', throwsResults[2]?.error === 'TypeError', throwsResults[2]?.error || '');

  const recursion = await run('solution(nums)', SUM, SUM_TESTS);
  check(
    'бесконечная рекурсия не засчитывается',
    recursion.kind !== 'ok' || !compareResults(SUM_TESTS, recursion.outcomes).some((r) => r.passed),
    recursion.kind
  );

  const loop = await run('(()=>{while(1){}})()', SUM, SUM_TESTS, 2000);
  check('вечный цикл обрывается по времени', loop.kind === 'timeout', loop.kind);

  const timer = await run('(setInterval(()=>0,1000),nums.reduce((a,b)=>a+b,0))', SUM, SUM_TESTS, 2000);
  check(
    'таймер решения не держит процесс до таймаута',
    timer.kind === 'ok' && compareResults(SUM_TESTS, timer.outcomes).every((r) => r.passed),
    timer.kind
  );

  console.log('6. Попытки добраться до ответов (запреты выключены — вызываем раннер напрямую)');

  const source = await run("require('fs').readFileSync(__filename,'utf8')", ECHO, ECHO_TESTS);
  const sourceText = answerOf(source, 0);
  check('чтение своего исходника работает (значит, запреты нужны)', sourceText.includes('const solution'), source.kind);
  check('в исходнике нет скрытого аргумента', !sourceText.includes(HIDDEN_ARG));
  check('в исходнике нет ожидаемых ответов', !sourceText.includes('EXPECTED'));

  const files = await run(
    "require('fs').readdirSync('.').map(f=>require('fs').readFileSync(f,'utf8')).join('|')",
    ECHO,
    ECHO_TESTS
  );
  check('в файлах рядом нет ожидаемых ответов', files.kind === 'ok' && !answerOf(files, 0).includes('EXPECTED'), files.kind);

  const stdinAgain = await run("(()=>{try{return require('fs').readFileSync(0,'utf8')}catch(e){return 'ERR'}})()", ECHO, ECHO_TESTS);
  check('стандартный ввод уже вычитан', stdinAgain.kind === 'ok' && !answerOf(stdinAgain, 0).includes(HIDDEN_ARG), stdinAgain.kind);

  const memory = await run("Buffer.allocUnsafe(1<<20).toString('latin1')", ECHO, ECHO_TESTS);
  check('в памяти процесса нет ожидаемых ответов', !answerOf(memory, 0).includes('EXPECTED'), memory.kind);

  const env = await run('JSON.stringify(process.env)+process.argv.join()', ECHO, ECHO_TESTS);
  check('в окружении и аргументах процесса нет ответов', !answerOf(env, 0).includes('EXPECTED'), env.kind);

  const forged = await run(
    "(console.log('x start\\n1 ok b'+Buffer.from('" + HIDDEN_EXPECTED + "').toString('base64')+'\\nx end'),s)",
    ECHO,
    ECHO_TESTS
  );
  const forgedResults = forged.kind === 'ok' ? compareResults(ECHO_TESTS, forged.outcomes) : [];
  check('поддельный блок результатов не засчитан', forgedResults.length === 2 && !forgedResults[1].passed, forged.kind);

  const exit = await run('process.exit(0)', SUM, SUM_TESTS);
  check('выход из процесса не засчитывается', exit.kind === 'crash', exit.kind);

  const tamper = await run('(Array.prototype.push=function(){return 0},nums.reduce((a,b)=>a+b,0))', SUM, SUM_TESTS);
  check(
    'подмена стандартных объектов вредит только самому решению',
    tamper.kind !== 'ok' || !compareResults(SUM_TESTS, tamper.outcomes).every((r) => r.passed),
    tamper.kind
  );

  const net = await run(
    "require('child_process').execSync('cat /etc/hostname; ls /piston 2>&1').toString()",
    ECHO,
    ECHO_TESTS
  );
  check('в соседних папках раннера нет ответов', !answerOf(net, 0).includes('EXPECTED'), net.kind);

  console.log('7. Печать ответа как у Python');
  const cases: Array<[string, JsProgramSignature['returns'], string]> = [
    ['6', 'int', '6'],
    ['-0', 'int', '0'],
    ['3', 'double', '3.0'],
    ['0.1+0.2', 'double', '0.30000000000000004'],
    ['1/3', 'double', '0.3333333333333333'],
    ['2.5', 'double', '2.5'],
    ['100', 'double', '100.0'],
    ['1e15', 'double', '1000000000000000.0'],
    ['1e16', 'double', '1e+16'],
    ['123456789012345680000', 'double', '1.2345678901234568e+20'],
    ['0.0001', 'double', '0.0001'],
    ['0.00001', 'double', '1e-05'],
    ['-0', 'double', '-0.0'],
    ['-1.5', 'double', '-1.5'],
    ['true', 'bool', 'True'],
    ['1<0', 'bool', 'False'],
    ["'abc'", 'string', 'abc'],
    ["['a',\"b'c\",'d\\\\e']", 'string[]', "['a', \"b'c\", 'd\\\\e']"],
    ["['a\\nb']", 'string[]', "['a\\nb']"],
    ['[[1,2],[3]]', 'int[][]', '[[1, 2], [3]]'],
    ['[]', 'int[]', '[]'],
    ['[1,2.5]', 'double[]', '[1.0, 2.5]'],
    ['[true,false]', 'bool[]', '[True, False]'],
    ['null', 'int', ''],
    ['[null]', 'object', '[None]'],
    ["'5'", 'int', '5'],
    ['2.5', 'int', '2.5'],
    ['12345678901234567890n', 'long', '12345678901234567890'],
    ["new Map([['a',1]])", 'object', "{'a': 1}"],
    ['new Set([1,2])', 'object', '{1, 2}'],
    ['new Set()', 'object', 'set()'],
    ["[['a','b'],['c']]", 'string[][]', "[['a', 'b'], ['c']]"],
  ];
  const tests = cases.map((_, i) => ({ index: i, args: [i], expectedOutput: '', isHidden: false }));
  const pick = `[${cases.map(([expr]) => `()=>(${expr})`).join(',')}][i]()`;
  for (let i = 0; i < cases.length; i += 1) {
    const [expr, returns, expected] = cases[i];
    const single = await run(pick, { args: [{ name: 'i', type: 'int' }], returns }, [tests[i]]);
    const actual = answerOf(single, i).trim();
    check(`${expr} как ${returns} → ${JSON.stringify(expected)}`, actual === expected, `получено ${JSON.stringify(actual)} (${single.kind})`);
  }

  const tooLong = await run("'x'.repeat(300000)", ECHO, ECHO_TESTS);
  const tooLongResults = tooLong.kind === 'ok' ? compareResults(ECHO_TESTS, tooLong.outcomes) : [];
  check('слишком длинный ответ — ошибка решения', tooLongResults[0]?.error === 'Слишком длинный ответ', tooLong.kind);
}

async function main() {
  staticChecks();

  console.log(`\nРаннер: ${PISTON_API_URL} (${JS_PISTON_LANGUAGE} ${JS_PISTON_VERSION})`);
  const runtimes = (await fetch(`${PISTON_API_URL}/runtimes`)
    .then((r) => r.json())
    .catch(() => null)) as Array<{ language: string; version: string }> | null;
  if (!runtimes) {
    console.log('  FAIL раннер недоступен');
    failures += 1;
  } else if (!runtimes.some((r) => r.language === JS_PISTON_LANGUAGE && r.version === JS_PISTON_VERSION)) {
    console.log(`  FAIL в раннере нет Node.js ${JS_PISTON_VERSION}: npm run dev:piston`);
    failures += 1;
  } else {
    await runnerChecks();
  }

  console.log(`\nВсего проверок: ${checks}, провалено: ${failures}`);
  if (failures > 0) {
    console.log('ОШИБКА: JavaScript-раннер ведёт себя не так, как ожидалось.');
    process.exit(1);
  }
  console.log('OK: JavaScript-раннер в порядке.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
