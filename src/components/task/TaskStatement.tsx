// src/components/task/TaskStatement.tsx

import { Task } from '@/types';
import { TierBadge } from '@/components/ui';
import { FileCode2, Clock, AlertTriangle } from 'lucide-react';

interface TaskStatementProps {
  task: Task;
}

export function TaskStatement({ task }: TaskStatementProps) {
  const constraints = task.constraintsJson;
  const allowedImports = constraints.allowed_imports || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <TierBadge tier={task.tier} />
        </div>
        {task.mode === 'tournament' && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-accent-yellow/20 text-accent-yellow rounded text-xs font-medium">
            <Clock className="w-3 h-3" />
            Задача недели
          </span>
        )}
      </div>

      {/* Statement */}
      <div className="prose prose-invert max-w-none">
        <div className="text-text-primary whitespace-pre-wrap leading-relaxed">
          {task.statementMd}
        </div>
      </div>

      {/* Function signature */}
      <div className="p-4 bg-background-tertiary rounded-lg border border-border">
        <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
          <FileCode2 className="w-4 h-4" />
          <span>Сигнатура функции</span>
        </div>
        <code className="text-accent-blue font-mono text-lg">
          {task.functionSignature}
        </code>
      </div>

      {/* Examples */}
      {task.exampleInput && task.exampleOutput && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
            Примеры
          </h3>
          <div className="grid gap-3">
            <ExampleBlock
              label="Ввод"
              value={task.exampleInput}
            />
            <ExampleBlock
              label="Вывод"
              value={task.exampleOutput}
            />
          </div>
        </div>
      )}

      {/* Constraints */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
          Ограничения
        </h3>
        <div className="flex flex-wrap gap-2">
          <ConstraintPill icon="✓" color="green">
            1 строка
          </ConstraintPill>
          <ConstraintPill icon="✗" color="red">
            :: запрещены
          </ConstraintPill>
          <ConstraintPill icon="✗" color="red">
            tab запрещён
          </ConstraintPill>
          {allowedImports.length > 0 ? (
            <ConstraintPill icon="i" color="blue">
              import: {allowedImports.join(', ')}
            </ConstraintPill>
          ) : (
            <ConstraintPill icon="✗" color="red">
              Импорты запрещены
            </ConstraintPill>
          )}
        </div>
      </div>
    </div>
  );
}

function ExampleBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 p-3 bg-background-tertiary rounded-lg">
      <span className="text-sm text-text-muted w-16 flex-shrink-0">{label}:</span>
      <code className="font-mono text-accent-green break-all">{value}</code>
    </div>
  );
}

function ConstraintPill({
  children,
  icon,
  color,
}: {
  children: React.ReactNode;
  icon: string;
  color: 'green' | 'red' | 'blue' | 'yellow';
}) {
  const colors = {
    green: 'text-accent-green',
    red: 'text-accent-red',
    blue: 'text-accent-blue',
    yellow: 'text-accent-yellow',
  };

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background-tertiary rounded-full text-sm border border-border">
      <span className={colors[color]}>{icon}</span>
      <span className="text-text-primary">{children}</span>
    </span>
  );
}
