// src/lib/piston.ts

const PISTON_API_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

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
          compile_timeout: 5000,
        }),
      });

      if (!response.ok) {
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
          await sleep(getBackoffMs(attempt));
          attempt += 1;
          continue;
        }

        return {
          output: '',
          stdout: '',
          stderr: '',
          error: `Piston API error: ${response.status}`,
          exitCode: -1,
          errorKind: RETRYABLE_STATUS.has(response.status) ? 'infra' : 'runtime',
          httpStatus: response.status,
        };
      }

      const data: PistonResponse = await response.json();

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

      if (data.run.stderr && data.run.code !== 0) {
        return {
          output: data.run.stdout,
          stdout: data.run.stdout,
          stderr: data.run.stderr,
          error: data.run.stderr,
          exitCode: data.run.code,
          errorKind: 'runtime',
        };
      }

      return {
        output: data.run.stdout,
        stdout: data.run.stdout,
        stderr: data.run.stderr || '',
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
  return base * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
