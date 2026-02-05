// src/app/admin/tasks/_components/TaskForm.tsx

'use client';

import { useState } from 'react';
import { 
  Save, Plus, Trash2, Eye, EyeOff, AlertCircle,
  ChevronDown, ChevronUp, Play
} from 'lucide-react';
import { Card, Button, Input, TierBadge } from '@/components/ui';
import { cn, validateOneliner } from '@/lib/utils';

interface TestCase {
  id: string;
  args: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface TaskFormData {
  slug: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  mode: 'practice' | 'tournament';
  statementMd: string;
  functionSignature: string;
  functionArgs: string;
  exampleInput: string;
  exampleOutput: string;
  forbiddenTokens: string;
  allowedImports: string;
  timeoutMs: number;
  testcases: TestCase[];
}

interface TaskFormProps {
  initialData?: Partial<TaskFormData>;
  onSubmit: (data: any) => Promise<void>;
}

const defaultData: TaskFormData = {
  slug: '',
  title: '',
  tier: 'bronze',
  mode: 'practice',
  statementMd: '',
  functionSignature: 'solution(s)',
  functionArgs: 's',
  exampleInput: '',
  exampleOutput: '',
  forbiddenTokens: ';, eval, exec, __import__',
  allowedImports: '',
  timeoutMs: 2000,
  testcases: [
    { id: '1', args: '', expectedOutput: '', isHidden: false },
  ],
};

export function TaskForm({ initialData, onSubmit }: TaskFormProps) {
  const [data, setData] = useState<TaskFormData>({ ...defaultData, ...initialData });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedSection, setExpandedSection] = useState<string | null>('basic');
  const [validationCode, setValidationCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any | null>(null);

  const updateField = <K extends keyof TaskFormData>(field: K, value: TaskFormData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Авто-генерация slug из title
  const handleTitleChange = (title: string) => {
    updateField('title', title);
    if (!data.slug || data.slug === slugify(data.title)) {
      updateField('slug', slugify(title));
    }
  };

  // Тесты
  const addTestcase = () => {
    const newTest: TestCase = {
      id: Date.now().toString(),
      args: '',
      expectedOutput: '',
      isHidden: data.testcases.length >= 3,
    };
    updateField('testcases', [...data.testcases, newTest]);
  };

  const updateTestcase = (id: string, field: keyof TestCase, value: any) => {
    updateField(
      'testcases',
      data.testcases.map((tc) => (tc.id === id ? { ...tc, [field]: value } : tc))
    );
  };

  const removeTestcase = (id: string) => {
    if (data.testcases.length <= 1) return;
    updateField(
      'testcases',
      data.testcases.filter((tc) => tc.id !== id)
    );
  };

  const parseJsonArgs = (value: string, index: number): any[] | null => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        setErrors((prev) => ({ ...prev, testcases: `Тест ${index + 1}: args должен быть массивом` }));
        return null;
      }
      return parsed;
    } catch (error) {
      setErrors((prev) => ({ ...prev, testcases: `Тест ${index + 1}: некорректный JSON` }));
      return null;
    }
  };

  const buildPayload = () => {
    setErrors((prev) => ({ ...prev, testcases: '' }));
    const functionArgs = data.functionArgs
      .split(',')
      .map((arg) => arg.trim())
      .filter(Boolean);

    if (functionArgs.length === 0) {
      setErrors((prev) => ({ ...prev, functionArgs: 'Укажите аргументы функции' }));
      return null;
    }

    const testcases = [] as Array<{ inputData: { args: any[] }; expectedOutput: string; isHidden: boolean }>;
    for (let i = 0; i < data.testcases.length; i++) {
      const tc = data.testcases[i];
      const parsedArgs = parseJsonArgs(tc.args, i);
      if (!parsedArgs) return null;
      testcases.push({
        inputData: { args: parsedArgs },
        expectedOutput: tc.expectedOutput,
        isHidden: tc.isHidden,
      });
    }

    return {
      slug: data.slug.trim(),
      title: data.title.trim(),
      tier: data.tier,
      mode: data.mode,
      statementMd: data.statementMd,
      functionSignature: data.functionSignature.trim(),
      functionArgs,
      exampleInput: data.exampleInput,
      exampleOutput: data.exampleOutput,
      constraints: {
        forbidden_tokens: splitCsv(data.forbiddenTokens),
        allowed_imports: splitCsv(data.allowedImports),
        timeout_ms: data.timeoutMs,
      },
      testcases,
    };
  };

  // Валидация
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.slug) newErrors.slug = 'Slug обязателен';
    if (!/^[a-z0-9-]+$/.test(data.slug)) newErrors.slug = 'Только a-z, 0-9 и дефис';
    if (!data.title) newErrors.title = 'Название обязательно';
    if (data.title.length < 3) newErrors.title = 'Минимум 3 символа';
    if (!data.statementMd) newErrors.statementMd = 'Условие обязательно';
    if (!data.functionSignature) newErrors.functionSignature = 'Сигнатура обязательна';
    if (!data.functionArgs.trim()) newErrors.functionArgs = 'Аргументы обязательны';
    if (!data.exampleInput) newErrors.exampleInput = 'Пример ввода обязателен';
    if (!data.exampleOutput) newErrors.exampleOutput = 'Пример вывода обязателен';

    const emptyTests = data.testcases.filter((tc) => !tc.args || !tc.expectedOutput);
    if (emptyTests.length > 0) {
      newErrors.testcases = 'Заполните все тесты';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Отправка
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const payload = buildPayload();
    if (!payload) return;

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setValidationError(null);
    setValidationResult(null);

    const validation = validateOneliner(validationCode);
    if (!validation.valid) {
      setValidationError(validation.error || 'Некорректный код');
      return;
    }

    if (!validate()) return;
    const payload = buildPayload();
    if (!payload) return;

    setIsValidating(true);
    try {
      const res = await fetch('/api/admin/tasks/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ task: payload, code: validationCode }),
      });
      const json = await res.json();
      if (!json.success) {
        setValidationError(json.error || 'Не удалось проверить');
        return;
      }
      setValidationResult(json.data);
    } catch (error) {
      setValidationError('Не удалось проверить');
    } finally {
      setIsValidating(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* Basic Info */}
      <FormSection
        title="Основная информация"
        id="basic"
        expanded={expandedSection === 'basic'}
        onToggle={() => toggleSection('basic')}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Название"
            value={data.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Сумма чисел в строке"
            error={errors.title}
            required
          />
          <Input
            label="Slug (URL)"
            value={data.slug}
            onChange={(e) => updateField('slug', e.target.value.toLowerCase())}
            placeholder="sum-numbers"
            error={errors.slug}
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Сложность
            </label>
            <div className="flex gap-2">
              {(['bronze', 'silver', 'gold'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => updateField('tier', tier)}
                  className={cn(
                    'px-4 py-2 rounded-lg border transition-colors',
                    data.tier === tier
                      ? 'border-accent-blue bg-accent-blue/10'
                      : 'border-border hover:border-border/70'
                  )}
                >
                  <TierBadge tier={tier} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Режим
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateField('mode', 'practice')}
                className={cn(
                  'px-4 py-2 rounded-lg border transition-colors',
                  data.mode === 'practice'
                    ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                    : 'border-border text-text-secondary hover:border-border/70'
                )}
              >
                Практика
              </button>
              <button
                type="button"
                onClick={() => updateField('mode', 'tournament')}
                className={cn(
                  'px-4 py-2 rounded-lg border transition-colors',
                  data.mode === 'tournament'
                    ? 'border-tier-gold bg-tier-gold/10 text-tier-gold'
                    : 'border-border text-text-secondary hover:border-border/70'
                )}
              >
                Турнир
              </button>
            </div>
          </div>
        </div>
      </FormSection>

      {/* Statement */}
      <FormSection
        title="Условие задачи"
        id="statement"
        expanded={expandedSection === 'statement'}
        onToggle={() => toggleSection('statement')}
      >
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Текст условия (Markdown)
          </label>
          <textarea
            value={data.statementMd}
            onChange={(e) => updateField('statementMd', e.target.value)}
            placeholder="Напишите однострочник, который принимает строку чисел через пробел и возвращает их сумму."
            rows={5}
            className={cn(
              'w-full px-4 py-3 bg-background-tertiary border rounded-lg resize-y',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50',
              errors.statementMd ? 'border-accent-red' : 'border-border'
            )}
          />
          {errors.statementMd && (
            <p className="text-sm text-accent-red mt-1">{errors.statementMd}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Input
            label="Сигнатура функции"
            value={data.functionSignature}
            onChange={(e) => updateField('functionSignature', e.target.value)}
            placeholder="solution(s)"
          />
          <Input
            label="Аргументы (через запятую)"
            value={data.functionArgs}
            onChange={(e) => updateField('functionArgs', e.target.value)}
            placeholder="s"
            error={errors.functionArgs}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Input
            label="Пример ввода"
            value={data.exampleInput}
            onChange={(e) => updateField('exampleInput', e.target.value)}
            placeholder='"4 8 15 16 23 42"'
            error={errors.exampleInput}
          />
          <Input
            label="Пример вывода"
            value={data.exampleOutput}
            onChange={(e) => updateField('exampleOutput', e.target.value)}
            placeholder="108"
            error={errors.exampleOutput}
          />
        </div>
      </FormSection>

      {/* Constraints */}
      <FormSection
        title="Ограничения"
        id="constraints"
        expanded={expandedSection === 'constraints'}
        onToggle={() => toggleSection('constraints')}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Запрещённые токены (через запятую)"
            value={data.forbiddenTokens}
            onChange={(e) => updateField('forbiddenTokens', e.target.value)}
            placeholder=";, eval, exec, __import__"
          />
          <Input
            label="Разрешённые импорты (через запятую)"
            value={data.allowedImports}
            onChange={(e) => updateField('allowedImports', e.target.value)}
            placeholder="math, itertools"
          />
        </div>
        <div className="mt-4 max-w-xs">
          <Input
            label="Таймаут (мс)"
            type="number"
            value={data.timeoutMs}
            onChange={(e) => updateField('timeoutMs', parseInt(e.target.value) || 2000)}
            min={500}
            max={10000}
          />
        </div>
      </FormSection>

      {/* Testcases */}
      <FormSection
        title={`Тесты (${data.testcases.length})`}
        id="testcases"
        expanded={expandedSection === 'testcases'}
        onToggle={() => toggleSection('testcases')}
        error={errors.testcases}
      >
        <div className="space-y-4">
          {data.testcases.map((tc, idx) => (
            <div
              key={tc.id}
              className={cn(
                'p-4 rounded-lg border',
                tc.isHidden ? 'bg-background-tertiary/50 border-border' : 'border-accent-blue/30'
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">
                  Тест {idx + 1}
                  {tc.isHidden && (
                    <span className="ml-2 text-xs text-text-muted">(скрытый)</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateTestcase(tc.id, 'isHidden', !tc.isHidden)}
                    className={cn(
                      'p-1.5 rounded transition-colors',
                      tc.isHidden
                        ? 'text-text-muted hover:text-text-secondary'
                        : 'text-accent-blue hover:bg-accent-blue/10'
                    )}
                    title={tc.isHidden ? 'Сделать открытым' : 'Сделать скрытым'}
                  >
                    {tc.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {data.testcases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTestcase(tc.id)}
                      className="p-1.5 rounded text-accent-red hover:bg-accent-red/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Аргументы (JSON)"
                  value={tc.args}
                  onChange={(e) => updateTestcase(tc.id, 'args', e.target.value)}
                  placeholder='["4 8 15 16 23 42"]'
                  className="font-mono text-sm"
                />
                <Input
                  label="Ожидаемый вывод"
                  value={tc.expectedOutput}
                  onChange={(e) => updateTestcase(tc.id, 'expectedOutput', e.target.value)}
                  placeholder="108"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          icon={Plus}
          onClick={addTestcase}
          className="mt-4"
        >
          Добавить тест
        </Button>
      </FormSection>

      {/* Validation */}
      <FormSection
        title="Проверка решения"
        id="validation"
        expanded={expandedSection === 'validation'}
        onToggle={() => toggleSection('validation')}
      >
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Код для проверки (одна строка выражения)
          </label>
          <textarea
            value={validationCode}
            onChange={(e) => setValidationCode(e.target.value)}
            placeholder="len(s)"
            rows={2}
            className={cn(
              'w-full px-4 py-3 bg-background-tertiary border rounded-lg resize-y font-mono text-sm',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50'
            )}
          />
          <p className="text-xs text-text-muted mt-2">
            Код проверяется по тем же правилам, что и у учеников (одна строка, без запрещённых токенов)
          </p>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            icon={Play}
            onClick={handleValidate}
            loading={isValidating}
          >
            Прогнать тесты
          </Button>
        </div>

        {validationError && (
          <div className="mt-4 text-sm text-accent-red flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {validationError}
          </div>
        )}

        {validationResult && (
          <div className="mt-4 p-4 rounded-lg border border-border bg-background-tertiary/40">
            <div className="font-semibold mb-2">
              {validationResult.status === 'pass' ? 'PASS' : 'FAIL'}
            </div>
            <div className="text-sm text-text-secondary mb-3">
              Пройдено тестов: {validationResult.testsPassed} из {validationResult.testsTotal}
            </div>
            {validationResult.errorMessage && (
              <div className="text-sm text-accent-red mb-3">{validationResult.errorMessage}</div>
            )}
            {validationResult.details?.length > 0 && (
              <div className="space-y-2">
                {validationResult.details.map((detail: any) => (
                  <div
                    key={detail.index}
                    className={cn(
                      'p-3 rounded border text-sm',
                      detail.passed ? 'border-accent-green/30' : 'border-accent-red/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>Тест {detail.index + 1}</span>
                      <span className={detail.passed ? 'text-accent-green' : 'text-accent-red'}>
                        {detail.passed ? 'OK' : 'FAIL'}
                      </span>
                    </div>
                    <div className="text-text-secondary mt-2">
                      <div>Ввод: {detail.input}</div>
                      <div>Ожидалось: {detail.expected}</div>
                      <div>Получено: {detail.actual}</div>
                      {detail.error && <div className="text-accent-red">Ошибка: {detail.error}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </FormSection>

      {/* Submit */}
      <div className="flex items-center gap-4 pt-4 border-t border-border">
        <Button
          type="submit"
          variant="primary"
          icon={Save}
          loading={isSubmitting}
          size="lg"
        >
          {initialData ? 'Сохранить изменения' : 'Создать задачу'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => window.history.back()}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

// Секция формы
interface FormSectionProps {
  title: string;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  error?: string;
}

function FormSection({ title, id, expanded, onToggle, children, error }: FormSectionProps) {
  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-background-tertiary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {error && <AlertCircle className="w-4 h-4 text-accent-red" />}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-text-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-text-muted" />
        )}
      </button>
      {expanded && (
        <div className="px-6 pb-6 border-t border-border">
          <div className="pt-4">{children}</div>
          {error && (
            <p className="text-sm text-accent-red mt-2 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// Утилита для генерации slug
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-яё]/gi, (char) => {
      const map: Record<string, string> = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
        з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
        п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
        ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
      };
      return map[char.toLowerCase()] || char;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
