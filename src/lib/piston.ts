// src/lib/piston.ts

const PISTON_API_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = Number(process.env.PISTON_MAX_RETRIES || 2);
const COMPILE_TIMEOUT_MS = Number(process.env.PISTON_COMPILE_TIMEOUT_MS || 5000);

interface PistonResponse {
  run: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number;
  };
}

interface ExecuteResult {
  output: string;
  stdout: string;
  stderr: string;
  error: string | null;
  exitCode: number;
  errorKind: 'none' | 'runtime' | 'infra' | 'timeout';
  httpStatus?: number;
}

export async function executeCode(
  code: string,
  timeout: number = 2000,
  signal?: AbortSignal
): Promise<ExecuteResult> {
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch(`${PISTON_API_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          language: 'python',
          version: '3.10',
          files: [
            {
              name: 'main.py',
              content: code,
            },
          ],
          run_timeout: timeout,
          compile_timeout: COMPILE_TIMEOUT_MS,
        }),
      });

      if (!response.ok) {
        const errorMessage = await readPistonError(response);
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
          await sleep(getBackoffMs(attempt));
          attempt += 1;
          continue;
        }

        return {
          output: '',
          stdout: '',
          stderr: '',
          error: errorMessage,
          exitCode: -1,
          errorKind: RETRYABLE_STATUS.has(response.status) ? 'infra' : 'runtime',
          httpStatus: response.status,
        };
      }

      const data: PistonResponse = await response.json();
      const runOutput = data.run.output || data.run.stdout || '';
      const runStderr = data.run.stderr || '';

      if (data.compile && data.compile.code !== 0) {
        return {
          output: '',
          stdout: '',
          stderr: data.compile.stderr || '',
          error: data.compile.stderr || 'Compilation error',
          exitCode: data.compile.code,
          errorKind: 'runtime',
        };
      }

      if (data.run.code !== 0 || data.run.signal) {
        const errorText =
          runStderr.trim() ||
          runOutput.trim() ||
          (data.run.signal
            ? `Runtime terminated by signal: ${data.run.signal}`
            : `Runtime error (exit code ${data.run.code})`);

        return {
          output: runOutput,
          stdout: data.run.stdout,
          stderr: runStderr,
          error: errorText,
          exitCode: data.run.code,
          errorKind: 'runtime',
        };
      }

      return {
        output: runOutput,
        stdout: data.run.stdout,
        stderr: runStderr,
        error: null,
        exitCode: data.run.code,
        errorKind: 'none',
      };
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || /aborted|timeout/i.test(error?.message || '');
      if (isAbort) {
        return {
          output: '',
          stdout: '',
          stderr: '',
          error: 'Execution timed out',
          exitCode: -1,
          errorKind: 'timeout',
        };
      }

      if (attempt < MAX_RETRIES) {
        await sleep(getBackoffMs(attempt));
        attempt += 1;
        continue;
      }

      console.error('Piston execution error:', error);
      return {
        output: '',
        stdout: '',
        stderr: '',
        error: error.message || 'Execution failed',
        exitCode: -1,
        errorKind: 'infra',
      };
    }
  }

  return {
    output: '',
    stdout: '',
    stderr: '',
    error: 'Execution failed',
    exitCode: -1,
    errorKind: 'infra',
  };
}

function getBackoffMs(attempt: number): number {
  const base = 300;
  const jitter = Math.floor(Math.random() * 120);
  return base * Math.pow(2, attempt) + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPistonError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    const message = body?.message?.trim();
    if (message) {
      return `Piston API error: ${response.status} (${message})`;
    }
  } catch {
    // Ignore malformed JSON
  }

  return `Piston API error: ${response.status}`;
}

// Получаем доступные версии Python
export async function getPythonVersions(): Promise<string[]> {
  try {
    const response = await fetch(`${PISTON_API_URL}/runtimes`);
    const runtimes = await response.json();
    
    return runtimes
      .filter((r: any) => r.language === 'python')
      .map((r: any) => r.version);
  } catch (error) {
    console.error('Failed to fetch Python versions:', error);
    return ['3.10'];
  }
}
