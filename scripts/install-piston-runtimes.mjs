// Ставит в раннер Piston нужные языки: Python, JavaScript (Node.js) и C# (mono).
// Свежий контейнер приходит пустым: пока пакета нет, любой запуск кода падает.
// Версия Python должна совпадать с PISTON_PYTHON_VERSION в src/lib/piston.ts
// и с Python в браузере (Pyodide 0.24.1 = Python 3.11).
// Версия mono — с CSHARP_PISTON_VERSION в src/lib/csharp-runner.ts,
// версия Node.js — с JS_PISTON_VERSION в src/lib/js-runner.ts.
// Запуск: npm run dev:piston
const BASE = process.env.PISTON_API_URL || 'http://127.0.0.1:2000/api/v2';

// package — имя пакета в Piston, language — как язык потом виден в /runtimes
const RUNTIMES = [
  {
    title: 'Python',
    package: 'python',
    language: 'python',
    version: process.env.PISTON_PYTHON_VERSION || '3.11.0',
  },
  // Пакет называется node, а в /runtimes появляется как javascript
  { title: 'JavaScript (Node.js)', package: 'node', language: 'javascript', version: '20.11.1' },
  // Пакет называется mono, а в /runtimes появляется как csharp (и basic)
  { title: 'C# (mono)', package: 'mono', language: 'csharp', version: '6.12.0' },
];

async function listVersions(language) {
  const runtimes = await fetch(`${BASE}/runtimes`).then((r) => r.json());
  return runtimes.filter((r) => r.language === language).map((r) => r.version);
}

// Сразу после запуска контейнера API раннера ещё просыпается —
// ждём до минуты, а не падаем с первой попытки
async function waitForRunner() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await fetch(`${BASE}/runtimes`).then((r) => r.json());
      return;
    } catch {
      if (attempt === 1) console.log('Жду, пока раннер проснётся...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  await fetch(`${BASE}/runtimes`).then((r) => r.json());
}

async function ensure(runtime) {
  const before = await listVersions(runtime.language);
  if (before.includes(runtime.version)) {
    console.log(`OK: ${runtime.title} ${runtime.version} уже установлен`);
    return;
  }
  if (before.length > 0) {
    // Раньше скрипт видел любую версию и выходил, не поставив нужную
    console.log(`${runtime.title}: установлены другие версии (${before.join(', ')}) — ставлю ${runtime.version} рядом`);
  }

  console.log(`Ставлю ${runtime.title} ${runtime.version}, это занимает 1-3 минуты...`);
  const response = await fetch(`${BASE}/packages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: runtime.package, version: runtime.version }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`не удалось установить ${runtime.title} (${response.status}): ${body.message || ''}`);
  }

  const after = await listVersions(runtime.language);
  if (!after.includes(runtime.version)) {
    throw new Error(`пакет установлен, но ${runtime.title} ${runtime.version} в списке не появился`);
  }
  console.log(`OK: ${runtime.title} ${runtime.version} готов`);
}

async function main() {
  console.log(`Раннер: ${BASE}`);
  await waitForRunner();
  for (const runtime of RUNTIMES) {
    await ensure(runtime);
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  console.error('Проверьте, что контейнеры запущены: docker compose ps');
  process.exit(1);
});
