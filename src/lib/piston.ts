// src/lib/piston.ts

const PISTON_API_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

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
}

export async function executeCode(
  code: string,
  timeout: number = 2000,
  signal?: AbortSignal
): Promise<ExecuteResult> {
  try {
    const response = await fetch(`${PISTON_API_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        language: 'python',
        version: '3.10', // Фиксируем версию Python
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
      throw new Error(`Piston API error: ${response.status}`);
    }

    const data: PistonResponse = await response.json();

    // Проверяем ошибки компиляции
    if (data.compile && data.compile.code !== 0) {
      return {
        output: '',
        stdout: '',
        stderr: data.compile.stderr || '',
        error: data.compile.stderr || 'Compilation error',
        exitCode: data.compile.code,
      };
    }

    // Проверяем ошибки выполнения
    if (data.run.stderr && data.run.code !== 0) {
      return {
        output: data.run.stdout,
        stdout: data.run.stdout,
        stderr: data.run.stderr,
        error: data.run.stderr,
        exitCode: data.run.code,
      };
    }

    return {
      output: data.run.stdout,
      stdout: data.run.stdout,
      stderr: data.run.stderr || '',
      error: null,
      exitCode: data.run.code,
    };
  } catch (error: any) {
    console.error('Piston execution error:', error);
    return {
      output: '',
      stdout: '',
      stderr: '',
      error: error.message || 'Execution failed',
      exitCode: -1,
    };
  }
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
