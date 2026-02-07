const REQUIRED_ENDPOINTS = [
  '/api/health',
  '/api/tasks',
  '/api/leaderboard',
  '/api/competitions',
];

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
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

  console.log('Smoke check completed successfully.');
}

void main().catch((error) => {
  console.error('ERROR: Smoke check crashed', error);
  process.exit(1);
});
