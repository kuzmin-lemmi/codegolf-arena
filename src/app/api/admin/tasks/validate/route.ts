import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, validateTaskData } from '@/lib/admin';
import { validateOneliner } from '@/lib/utils';
import { executeCode } from '@/lib/piston';
import { generateTestCode, toPythonLiteral } from '@/lib/python-serializer';
import { enqueueSubmit } from '@/lib/submit-queue';
import { validateMutationRequest } from '@/lib/security';

const OUTPUT_LIMIT_BYTES = 50 * 1024;
const TOTAL_TIMEOUT_MS = 10_000;

export async function POST(request: NextRequest) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { task, code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Code is required' },
        { status: 400 }
      );
    }

    const validation = validateOneliner(code);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const taskValidation = validateTaskData(task);
    if (!taskValidation.valid) {
      return NextResponse.json(
        { success: false, error: taskValidation.error },
        { status: 400 }
      );
    }

    const data = taskValidation.data!;

    for (const token of data.constraints.forbidden_tokens || []) {
      if (code.includes(token)) {
        return NextResponse.json(
          { success: false, error: `Запрещённый токен: ${token}` },
          { status: 400 }
        );
      }
    }

    const runValidation = async () => {
      const testResults: Array<{
        index: number;
        passed: boolean;
        input: string;
        expected: string;
        actual: string;
        error?: string | null;
      }> = [];

      let allPassed = true;
      let outputBytes = 0;
      let submissionError: string | null = null;

      const startTime = Date.now();
      const deadline = startTime + TOTAL_TIMEOUT_MS;

      for (let index = 0; index < data.testcases.length; index++) {
        const testcase = data.testcases[index];
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          submissionError = 'Time limit exceeded';
          allPassed = false;
          testResults.push({
            index,
            passed: false,
            input: testcase.inputData.args.map(toPythonLiteral).join(', '),
            expected: testcase.expectedOutput.trim(),
            actual: '',
            error: 'Time limit exceeded',
          });
          break;
        }

        const wrappedCode = generateTestCode(
          code,
          data.functionArgs,
          testcase.inputData.args,
          data.constraints.allowed_imports || []
        );

        const perTestTimeout = Math.min(data.constraints.timeout_ms || 2000, remainingMs);
        const signal = AbortSignal.timeout(perTestTimeout);
        const result = await executeCode(wrappedCode, perTestTimeout, signal);

        const stdoutBytes = Buffer.byteLength(result.stdout || '', 'utf8');
        const stderrBytes = Buffer.byteLength(result.stderr || '', 'utf8');
        outputBytes += stdoutBytes + stderrBytes;

        if (outputBytes > OUTPUT_LIMIT_BYTES) {
          submissionError = 'Output limit exceeded';
          allPassed = false;
          testResults.push({
            index,
            passed: false,
            input: testcase.inputData.args.map(toPythonLiteral).join(', '),
            expected: testcase.expectedOutput.trim(),
            actual: '',
            error: 'Output limit exceeded',
          });
          break;
        }

        if (result.error && /aborted|aborterror|timeout/i.test(result.error)) {
          submissionError = 'Time limit exceeded';
          allPassed = false;
          testResults.push({
            index,
            passed: false,
            input: testcase.inputData.args.map(toPythonLiteral).join(', '),
            expected: testcase.expectedOutput.trim(),
            actual: '',
            error: 'Time limit exceeded',
          });
          break;
        }

        const actualOutput = result.output.trim();
        const expectedOutput = testcase.expectedOutput.trim();
        const passed = actualOutput === expectedOutput;

        if (!passed) allPassed = false;

        testResults.push({
          index,
          passed,
          input: testcase.inputData.args.map(toPythonLiteral).join(', '),
          expected: expectedOutput,
          actual: actualOutput,
          error: result.error || null,
        });
      }

      const runtimeMs = Date.now() - startTime;
      const testsPassed = testResults.filter((t) => t.passed).length;
      const testsTotal = testResults.length;

      return {
        status: allPassed ? 'pass' : 'fail',
        testsPassed,
        testsTotal,
        runtimeMs,
        errorMessage: submissionError,
        details: testResults,
      };
    };

    const result = await enqueueSubmit(runValidation);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error validating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to validate task' },
      { status: 500 }
    );
  }
}
