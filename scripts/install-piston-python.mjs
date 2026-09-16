// Ставит Python в раннер Piston. Свежий контейнер приходит пустым:
// пока пакет не установлен, любой запуск кода падает с "runtime not found".
// Запуск: node scripts/install-piston-python.mjs
const BASE = process.env.PISTON_API_URL || 'http://127.0.0.1:2000/api/v2';
const VERSION = process.env.PISTON_PYTHON_VERSION || '3.10.0';

async function main() {
  process.stdout.write(`Раннер: ${BASE}\n`);

  const installed = await fetch(`${BASE}/runtimes`).then((r) => r.json());
  const python = installed.find((r) => r.language === 'python');
  if (python) {
    console.log(`OK: Python уже установлен (версия ${python.version})`);
    return;
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

  const check = await fetch(`${BASE}/runtimes`).then((r) => r.json());
  const ok = check.find((r) => r.language === 'python');
  if (!ok) {
    console.error('ERROR: пакет установлен, но Python в списке не появился');
    process.exit(1);
  }
  console.log(`OK: Python ${ok.version} готов`);
}

main().catch((error) => {
  console.error(`ERROR: раннер недоступен — ${error.message}`);
  console.error('Проверьте, что контейнеры запущены: docker compose ps');
  process.exit(1);
});
