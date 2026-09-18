// Ставит в раннер Piston нужную версию Python.
// Свежий контейнер приходит пустым: пока пакета нет, любой запуск кода падает.
// Версия должна совпадать с PISTON_PYTHON_VERSION в src/lib/piston.ts
// и с Python в браузере (Pyodide 0.24.1 = Python 3.11).
// Запуск: npm run dev:piston
const BASE = process.env.PISTON_API_URL || 'http://127.0.0.1:2000/api/v2';
const VERSION = process.env.PISTON_PYTHON_VERSION || '3.11.0';

async function listPython() {
  const runtimes = await fetch(`${BASE}/runtimes`).then((r) => r.json());
  return runtimes.filter((r) => r.language === 'python').map((r) => r.version);
}

async function main() {
  console.log(`Раннер: ${BASE}`);

  const before = await listPython();
  if (before.includes(VERSION)) {
    console.log(`OK: Python ${VERSION} уже установлен`);
    return;
  }
  if (before.length > 0) {
    // Раньше скрипт видел любую версию Python и выходил, не поставив нужную
    console.log(`Установлены другие версии: ${before.join(', ')} — ставлю ${VERSION} рядом`);
  }

  console.log(`Ставлю Python ${VERSION}, это занимает 1-3 минуты...`);
  const response = await fetch(`${BASE}/packages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'python', version: VERSION }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`ERROR: не удалось установить (${response.status}): ${body.message || ''}`);
    process.exit(1);
  }

  const after = await listPython();
  if (!after.includes(VERSION)) {
    console.error(`ERROR: пакет установлен, но Python ${VERSION} в списке не появился`);
    process.exit(1);
  }
  console.log(`OK: Python ${VERSION} готов. Всего версий Python в раннере: ${after.join(', ')}`);
}

main().catch((error) => {
  console.error(`ERROR: раннер недоступен — ${error.message}`);
  console.error('Проверьте, что контейнеры запущены: docker compose ps');
  process.exit(1);
});
