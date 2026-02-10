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
  const forbiddenTokens = constraints.forbidden_tokens || [];
  const hasSemicolonBan = forbiddenTokens.includes(';');
  const hasEvalBan = forbiddenTokens.some((t) => ['eval', 'exec', '__import__'].includes(t));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-text-primary drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] font-mono uppercase">{task.title}</h1>
          <TierBadge tier={task.tier} className="rounded-none border-accent-blue/30" />
        </div>
        {task.mode === 'tournament' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent-yellow/20 text-accent-yellow rounded-none text-xs font-mono border border-accent-yellow/40">
            <Clock className="w-3 h-3" />
            ТУРНИР НЕДЕЛИ
          </span>
        )}
      </div>

      {/* Statement */}
       <div className="prose prose-invert max-w-none text-text-secondary font-mono leading-relaxed">
         <div className="whitespace-pre-wrap">
           {task.statementMd}
         </div>
       </div>

       {/* Function signature */}
       <div className="p-4 bg-background-tertiary/50 rounded-none border border-accent-blue/20">
         <div className="flex items-center gap-2 text-sm text-text-muted mb-2 font-mono uppercase">
           <FileCode2 className="w-4 h-4 text-accent-blue" />
           <span>// СИГНАТУРА ФУНКЦИИ</span>
         </div>
         <code className="text-accent-blue font-mono text-lg break-all drop-shadow-[0_0_5px_rgba(0,242,255,0.3)]">
           {task.functionSignature}
         </code>
       </div>

       {/* Examples */}
       {task.exampleInput && task.exampleOutput && (
         <div className="space-y-3">
           <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide font-mono">
             // ПРИМЕРЫ
           </h3>
           <div className="grid gap-3">
             <ExampleBlock
               label="ВВОД"
               value={task.exampleInput}
             />
             <ExampleBlock
               label="ВЫВОД"
               value={task.exampleOutput}
             />
           </div>
         </div>
       )}

       {/* Constraints */}
       <div className="space-y-3">
         <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide font-mono">
           // ОГРАНИЧЕНИЯ
         </h3>

        <div className="flex flex-wrap gap-2">
          <ConstraintPill icon="✓" color="green">
            1 строка
          </ConstraintPill>
          {hasSemicolonBan && (
            <ConstraintPill icon="✗" color="red">
              ; запрещен
            </ConstraintPill>
          )}
          <ConstraintPill icon="✗" color="red">
            переносы и tab запрещены
          </ConstraintPill>
          {hasEvalBan && (
            <ConstraintPill icon="✗" color="red">
              eval / exec / __import__ запрещены
            </ConstraintPill>
          )}
          {allowedImports.length > 0 ? (
            <ConstraintPill icon="i" color="blue">
              Разрешён импорт: {allowedImports.join(', ')}
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
