const REQUIRED_ENDPOINTS = [
  '/api/health',
  '/api/tasks',
  '/api/leaderboard',
  '/api/competitions',
];

// Эти ручки обязаны существовать и требовать авторизацию
const AUTH_REQUIRED_ENDPOINTS = ['/api/notifications'];

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function skip(message: string) {
  console.log(`SKIP: ${message}`);
}

async function checkEndpoint(baseUrl: string, path: string) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    fail(`${path} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    fail(`${path} returned non-JSON content-type: ${contentType}`);
  }

  const body = await response.json();
  if (typeof body !== 'object' || body === null) {
    fail(`${path} returned invalid JSON body`);
  }

  ok(`${path} responded with ${response.status}`);
}

async function checkUnauthorized(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (response.status !== 401) {
    fail(`${path} must answer 401 without a session, got HTTP ${response.status}`);
  }

  ok(`${path} is protected (401 without session)`);
}

/**
 * Картинка для превью в Telegram: проверяем на первом участнике рейтинга,
 * что og:image реально рендерится (шрифты и wasm на месте).
 */
async function checkProfileCard(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/leaderboard?limit=1`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    fail(`/api/leaderboard returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: Array<{ profileSlug?: string; nickname?: string }>;
  };
  const slug = body.data?.[0]?.profileSlug || body.data?.[0]?.nickname;

  if (!slug) {
    skip('profile card: в рейтинге пока никого нет');
    return;
  }

  const cardUrl = `${baseUrl}/u/${encodeURIComponent(slug)}/opengraph-image`;
  const card = await fetch(cardUrl);

  if (!card.ok) {
    fail(`profile card returned HTTP ${card.status}`);
  }

  const contentType = card.headers.get('content-type') || '';
  if (!contentType.includes('image/')) {
    fail(`profile card returned non-image content-type: ${contentType}`);
  }

  const bytes = (await card.arrayBuffer()).byteLength;
  if (bytes < 1000) {
    fail(`profile card looks broken: ${bytes} bytes`);
  }

  ok(`profile card rendered (${bytes} bytes)`);
}

async function main() {
  const baseUrl =
    process.env.SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    fail('SMOKE_BASE_URL or NEXT_PUBLIC_BASE_URL must be a full URL');
  }

  console.log(`Running smoke check against ${baseUrl}`);

  for (const endpoint of REQUIRED_ENDPOINTS) {
    await checkEndpoint(baseUrl, endpoint);
  }

  for (const endpoint of AUTH_REQUIRED_ENDPOINTS) {
    await checkUnauthorized(baseUrl, endpoint);
  }

  await checkProfileCard(baseUrl);

  console.log('Smoke check completed successfully.');
}

void main().catch((error) => {
  console.error('ERROR: Smoke check crashed', error);
  process.exit(1);
});
