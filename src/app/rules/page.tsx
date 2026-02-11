// src/app/rules/page.tsx

import { Card } from '@/components/ui';
import { 
  BookOpen, Code2, Trophy, Users, AlertTriangle, 
  CheckCircle, XCircle, Zap, Clock 
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Правила — Арена однострочников',
  description: 'Правила игры и правила сообщества на Арене однострочников',
  alternates: {
    canonical: '/rules',
  },
};

export default function RulesPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-accent-blue" />
            Правила
          </h1>
          <p className="text-text-secondary">
            Как играть и правила сообщества
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Как играть */}
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Zap className="w-6 h-6 text-accent-yellow" />
              Как играть
            </h2>
            <Card padding="lg">
              <div className="space-y-4">
                <RuleItem
                  icon={Code2}
                  title="Пиши код в одну строку"
                  description="Твоя задача — написать выражение на Python, которое решает задачу. Выражение должно быть в одну строку."
                />
                <RuleItem
                  icon={Trophy}
                  title="Соревнуйся за длину"
                  description="Чем короче код — тем лучше. Рейтинг по задаче определяется длиной кода в символах."
                />
                <RuleItem
                  icon={CheckCircle}
                  title="Локальная проверка"
                  description="Локальная проверка и отправка в рейтинг используют один и тот же набор тестов, который виден на странице задачи."
                />
              </div>
            </Card>
          </section>

          {/* Формат решения */}
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Code2 className="w-6 h-6 text-accent-green" />
              Формат решения
            </h2>
            <Card padding="lg">
              <p className="text-text-secondary mb-4">
                Ты пишешь только <strong>выражение</strong>, которое возвращает результат. 
                Система автоматически оборачивает его в функцию.
              </p>

              <div className="bg-background-tertiary rounded-lg p-4 mb-4">
                <div className="text-sm text-text-muted mb-2">Пример задачи:</div>
                <code className="text-accent-blue">solution(s: str) → int</code>
                <div className="text-sm text-text-muted mt-2">Твой код:</div>
                <code className="text-accent-green">sum(map(int, s.split()))</code>
              </div>

              <div className="bg-background-tertiary rounded-lg p-4">
                <div className="text-sm text-text-muted mb-2">Что выполняется на сервере:</div>
                <pre className="text-sm font-mono text-text-secondary">
{`def solution(s):
    return sum(map(int, s.split()))`}
                </pre>
              </div>
            </Card>
          </section>

          {/* Ограничения */}
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-accent-red" />
              Ограничения
            </h2>
            <Card padding="lg">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-accent-red mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Запрещено
                  </h3>
                  <ul className="space-y-2 text-sm text-text-secondary">
                    <li>• Перенос строки (\\n)</li>
                    <li>• Точка с запятой (;)</li>
                    <li>• Табуляция</li>
                    <li>• eval(), exec(), __import__()</li>
                    <li>• Код длиннее 2000 символов</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-accent-green mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Разрешено
                  </h3>
                  <ul className="space-y-2 text-sm text-text-secondary">
                    <li>• Пробелы внутри кода</li>
                    <li>• Lambda-функции</li>
                    <li>• List comprehensions</li>
                    <li>• Тернарный оператор</li>
                    <li>• Импорты (указаны в задаче)</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 grid md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-background-tertiary">
                  <div className="text-sm font-semibold mb-1">Ограничение времени</div>
                  <div className="text-sm text-text-secondary">
                    Общий лимит на сабмит: около 10 секунд. Если превышен — результат FAIL (Time limit exceeded).
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-background-tertiary">
                  <div className="text-sm font-semibold mb-1">Ограничение вывода</div>
                  <div className="text-sm text-text-secondary">
                    Суммарный stdout/stderr до 50 KB. Если больше — FAIL (Output limit exceeded).
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* Подсчёт длины */}
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-accent-amber" />
              Подсчёт длины
            </h2>
            <Card padding="lg">
              <ul className="space-y-3 text-text-secondary">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-accent-green flex-shrink-0 mt-0.5" />
                  <span>Пробелы <strong>по краям</strong> — не считаются (trim)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-accent-green flex-shrink-0 mt-0.5" />
                  <span>Пробелы <strong>внутри кода</strong> — считаются</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-accent-green flex-shrink-0 mt-0.5" />
                  <span>Каждый символ = 1 (включая кириллицу)</span>
                </li>
              </ul>

              <div className="mt-4 p-4 bg-background-tertiary rounded-lg">
                <div className="text-sm text-text-muted mb-2">Пример:</div>
                <div className="font-mono">
                  <code className="text-accent-blue">  sum(map(int, s.split()))  </code>
                  <span className="text-text-muted ml-2">→ 25 символов</span>
                </div>
              </div>
            </Card>
          </section>

          {/* Начисление очков */}
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-tier-gold" />
              Начисление очков
            </h2>
            <Card padding="lg">
              <div className="space-y-3">
                <PointRow label="Первое решение Bronze задачи" points="+10" />
                <PointRow label="Первое решение Silver задачи" points="+20" />
                <PointRow label="Первое решение Gold задачи" points="+30" />
                <hr className="border-border" />
                <PointRow label="Улучшение на 1-3 символа" points="+5" />
                <PointRow label="Улучшение на 4-9 символов" points="+10" />
                <PointRow label="Улучшение на 10+ символов" points="+20" />
                <hr className="border-border" />
                <PointRow label="Стал #1 по задаче" points="+25" highlight />
              </div>
            </Card>
          </section>

          {/* Правила сообщества */}
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Users className="w-6 h-6 text-accent-blue" />
              Правила сообщества
            </h2>
            <Card padding="lg">
              <div className="space-y-4">
                <RuleItem
                  icon={Users}
                  title="Уважай других участников"
                  description="Мы все здесь учимся. Помогай новичкам, не высмеивай ошибки."
                />
                <RuleItem
                  icon={XCircle}
                  title="Не публикуй решения"
                  description="Не выкладывай решения задач в открытый доступ — это портит игру другим."
                />
                <RuleItem
                  icon={CheckCircle}
                  title="Играй честно"
                  description="Не используй автоматические решатели и не копируй чужие решения."
                />
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function RuleItem({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="p-2 bg-background-tertiary rounded-lg">
        <Icon className="w-5 h-5 text-accent-blue" />
      </div>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
    </div>
  );
}

function PointRow({ 
  label, 
  points, 
  highlight = false 
}: { 
  label: string; 
  points: string; 
  highlight?: boolean; 
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-mono font-bold ${highlight ? 'text-tier-gold' : 'text-accent-green'}`}>
        {points}
      </span>
    </div>
  );
}
