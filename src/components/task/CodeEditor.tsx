// src/components/task/CodeEditor.tsx

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { validateOneliner, calculateCodeLength, cn } from '@/lib/utils';
import { AlertCircle, Check } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
}

export function CodeEditor({
  value,
  onChange,
  placeholder = 'sum(map(int, s.split()))',
  disabled = false,
  maxLength = 2000,
}: CodeEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const validation = validateOneliner(value);
  const length = calculateCodeLength(value);

  // Автоматическая высота textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Минимум 5 строк (~120px), максимум 10 строк (~240px)
      const minHeight = 120;
      const maxHeight = 240;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
    }
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      let newValue = e.target.value;
      
      // Блокируем переносы строк - заменяем на пробел
      if (newValue.includes('\n') || newValue.includes('\r')) {
        newValue = newValue.replace(/[\n\r]+/g, ' ');
      }
      
      onChange(newValue);
    },
    [onChange]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Блокируем Enter - не даём создать перенос строки
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    // Убираем переносы строк при вставке
    const cleanText = text.replace(/[\n\r]+/g, ' ');
    
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.slice(0, start) + cleanText + value.slice(end);
    
    onChange(newValue);
    
    // Устанавливаем курсор после вставленного текста
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + cleanText.length;
    }, 0);
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      {/* Editor Container - VS Code Dark+ Theme */}
      <div
        className={cn(
          'relative rounded-lg overflow-hidden transition-all duration-200',
          'bg-[#1e1e1e] border',
          isFocused
            ? 'border-[#007acc] ring-1 ring-[#007acc]/50'
            : 'border-[#3c3c3c] hover:border-[#4c4c4c]',
          !validation.valid && value && 'border-[#f14c4c]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Line numbers gutter */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-[#1e1e1e] border-r border-[#3c3c3c] flex items-start justify-end pr-3 pt-4 select-none pointer-events-none">
          <span className="text-[#858585] text-sm font-mono">1</span>
        </div>
        
        {/* Code input area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          rows={5}
          className={cn(
            'w-full pl-14 pr-4 py-4 bg-transparent resize-none',
            'text-[#d4d4d4] placeholder:text-[#6a6a6a]',
            'focus:outline-none',
            'overflow-x-auto whitespace-pre',
            disabled && 'cursor-not-allowed'
          )}
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace",
            fontSize: '14px',
            fontWeight: 400,
            lineHeight: '1.6',
            tabSize: 4,
            minHeight: '120px',
          }}
        />
      </div>

      {/* Status bar - VS Code style */}
      <div className="flex items-center justify-between px-1">
        {/* Validation status */}
        <div className="flex items-center gap-2 text-sm">
          {value ? (
            validation.valid ? (
              <span className="flex items-center gap-1.5 text-[#4ec9b0]">
                <Check className="w-4 h-4" />
                <span>OK</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#f14c4c]">
                <AlertCircle className="w-4 h-4" />
                <span>{validation.error}</span>
              </span>
            )
          ) : (
            <span className="text-[#6a6a6a]">Введите однострочник</span>
          )}
        </div>

        {/* Length counter */}
        <div
          className={cn(
            'flex items-center gap-2 text-sm font-mono',
            length > maxLength ? 'text-[#f14c4c]' : 'text-[#858585]'
          )}
        >
          <span>Длина:</span>
          <span className={cn(
            'font-bold px-2 py-0.5 rounded',
            length > 0 ? 'bg-[#264f78] text-[#4fc1ff]' : ''
          )}>
            {length}
          </span>
          {length > maxLength && <span className="text-[#f14c4c]">/ {maxLength}</span>}
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-[#6a6a6a] px-1">
        💡 Пробелы внутри кода учитываются в длине. Enter заблокирован — код должен быть в одну строку.
      </p>
    </div>
  );
}

// Экспорт для совместимости
export function MonacoCodeEditor(props: CodeEditorProps) {
  return <CodeEditor {...props} />;
}
