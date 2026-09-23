// src/lib/notifications.ts

/**
 * Уведомления игроку. Пока единственный тип — «твой рекорд побили»:
 * это самый сильный повод вернуться в задачу и отыграть первое место.
 */

import type { Prisma } from '@prisma/client';
import { isLanguage, LANGUAGE_LABELS, type Language } from '@/lib/languages';

export const NOTIFICATION_TYPES = {
  recordBeaten: 'record_beaten',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface RecordBeatenPayload {
  taskSlug: string;
  taskTitle: string;
  // Язык таблицы рекордов. У уведомлений до 23 сентября 2026 поля нет — это Python
  language?: Language;
  // ник того, кто побил рекорд
  byNickname: string;
  // его длина решения
  newLength: number;
  // длина, которая была у получателя уведомления
  yourLength: number;
}

type NotificationClient = Pick<Prisma.TransactionClient, 'notification'>;

/**
 * Создаёт (или обновляет) уведомление «твой рекорд по задаче побит».
 *
 * Если непрочитанное уведомление по этой задаче на этом языке уже есть —
 * обновляем его, чтобы серия улучшений одного игрока не превращалась в спам
 * колокольчика.
 */
export async function notifyRecordBeaten(
  client: NotificationClient,
  params: { userId: string; taskId: string; payload: RecordBeatenPayload }
): Promise<void> {
  const { userId, taskId, payload } = params;
  const payloadJson = JSON.stringify(payload);

  const unread = await client.notification.findMany({
    where: {
      userId,
      taskId,
      type: NOTIFICATION_TYPES.recordBeaten,
      readAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, payloadJson: true },
  });
  const language = payload.language ?? 'python';
  const existing = unread.find(
    (row) => (parsePayload<RecordBeatenPayload>(row.payloadJson)?.language ?? 'python') === language
  );

  if (existing) {
    await client.notification.update({
      where: { id: existing.id },
      data: { payloadJson, createdAt: new Date() },
    });
    return;
  }

  await client.notification.create({
    data: {
      userId,
      taskId,
      type: NOTIFICATION_TYPES.recordBeaten,
      payloadJson,
    },
  });
}

export interface RenderedNotification {
  id: string;
  type: string;
  title: string;
  text: string;
  href: string | null;
  createdAt: Date;
  isRead: boolean;
}

interface NotificationRow {
  id: string;
  type: string;
  payloadJson: string;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Превращает запись из БД в готовый к показу текст.
 * Текст собираем на сервере, чтобы не размазывать формулировки по компонентам.
 */
export function renderNotification(row: NotificationRow): RenderedNotification {
  const base = {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt,
    isRead: row.readAt !== null,
  };

  if (row.type === NOTIFICATION_TYPES.recordBeaten) {
    const payload = parsePayload<RecordBeatenPayload>(row.payloadJson);

    if (payload?.taskSlug) {
      const delta = Math.max(0, (payload.yourLength || 0) - (payload.newLength || 0));
      const language = isLanguage(payload.language) ? payload.language : 'python';

      return {
        ...base,
        title: `Твой рекорд на ${LANGUAGE_LABELS[language]} побили: ${payload.taskTitle || payload.taskSlug}`,
        text:
          `${payload.byNickname || 'Кто-то'} решил задачу за ${payload.newLength} симв.` +
          (payload.yourLength
            ? ` — твой результат ${payload.yourLength} симв.${delta > 0 ? ` (короче на ${delta})` : ''}`
            : ''),
        href: language === 'python' ? `/task/${payload.taskSlug}` : `/task/${payload.taskSlug}?lang=${language}`,
      };
    }
  }

  return {
    ...base,
    title: 'Обновление на Арене',
    text: 'Открой задачу, чтобы посмотреть подробности.',
    href: null,
  };
}

function parsePayload<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
