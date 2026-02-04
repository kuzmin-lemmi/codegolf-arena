// src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return formatDate(d);
}

export function formatTimeRemaining(endDate: Date | string): string {
  const end = new Date(endDate);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return 'Завершено';

  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  if (days > 0) {
    return `${days} дн. ${hours} ч.`;
  }
  if (hours > 0) {
    return `${hours} ч. ${minutes} мин.`;
  }
  return `${minutes} мин.`;
}

export function getTierColor(tier: string): string {
  switch (tier) {
    case 'bronze':
      return 'text-tier-bronze';
    case 'silver':
      return 'text-tier-silver';
    case 'gold':
      return 'text-tier-gold';
    default:
      return 'text-text-secondary';
  }
}

export function getTierBadgeClass(tier: string): string {
  switch (tier) {
    case 'bronze':
      return 'badge-bronze';
    case 'silver':
      return 'badge-silver';
    case 'gold':
      return 'badge-gold';
    default:
      return 'badge bg-background-tertiary text-text-secondary';
  }
}

export function getTierLabel(tier: string): string {
  switch (tier) {
    case 'bronze':
      return 'Bronze';
    case 'silver':
      return 'Silver';
    case 'gold':
      return 'Gold';
    default:
      return tier;
  }
}

export function validateOneliner(code: string): { valid: boolean; error?: string } {
  if (!code.trim()) {
    return { valid: false, error: 'Код не может быть пустым' };
  }

  if (code.includes('\n') || code.includes('\r')) {
    return { valid: false, error: 'Код должен быть в одну строку' };
  }

  if (code.includes(';')) {
    return { valid: false, error: 'Символ ";" запрещён' };
  }

  if (code.includes('\t')) {
    return { valid: false, error: 'Символ табуляции запрещён' };
  }

  const forbidden = ['eval', 'exec', '__import__'];
  for (const token of forbidden) {
    if (code.includes(token)) {
      return { valid: false, error: `"${token}" запрещён` };
    }
  }

  if (code.length > 2000) {
    return { valid: false, error: 'Код слишком длинный (макс. 2000 символов)' };
  }

  return { valid: true };
}

export function calculateCodeLength(code: string): number {
  // Убираем пробелы только по КРАЯМ, внутренние пробелы считаются!
  const trimmed = code.trim();
  // Считаем ВСЕ символы включая пробелы внутри
  return trimmed.length;
}
