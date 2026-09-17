/**
 * Проверка продуктовых правил без базы: начисление очков, тексты уведомлений
 * и сортировка лидерборда соревнования.
 *
 * Запуск: npm run check:rules
 */

import assert from 'assert';
import {
  awardImprovementPoints,
  getImprovementPoints,
  getImprovementPointsCap,
  getPassPoints,
  getFirstPlacePoints,
} from '../src/lib/points';
import { pluralizeRu } from '../src/lib/utils';
import { renderNotification, NOTIFICATION_TYPES } from '../src/lib/notifications';
import { compareCompetitionEntries } from '../src/lib/competitions';

// Очки за первое решение
assert.strictEqual(getPassPoints('bronze'), 10);
assert.strictEqual(getPassPoints('silver'), 20);
assert.strictEqual(getPassPoints('gold'), 30);
assert.strictEqual(getFirstPlacePoints(), 25);

// Таблица улучшений из /rules
assert.strictEqual(getImprovementPoints(0), 0);
assert.strictEqual(getImprovementPoints(1), 5);
assert.strictEqual(getImprovementPoints(3), 5);
assert.strictEqual(getImprovementPoints(4), 10);
assert.strictEqual(getImprovementPoints(9), 10);
assert.strictEqual(getImprovementPoints(10), 20);
assert.strictEqual(getImprovementPoints(100), 20);

// Лимит на задачу
assert.strictEqual(getImprovementPointsCap('bronze'), 20);
assert.strictEqual(getImprovementPointsCap('gold'), 60);

const first = awardImprovementPoints({ tier: 'bronze', savedChars: 12, alreadyAwarded: 0 });
assert.strictEqual(first.points, 20);
assert.strictEqual(first.capped, false);

const second = awardImprovementPoints({ tier: 'bronze', savedChars: 5, alreadyAwarded: 20 });
assert.strictEqual(second.points, 0, 'лимит bronze = 20, больше не начисляем');
assert.strictEqual(second.rawPoints, 10);
assert.strictEqual(second.capped, true);

const partial = awardImprovementPoints({ tier: 'bronze', savedChars: 10, alreadyAwarded: 15 });
assert.strictEqual(partial.points, 5, 'добираем только остаток лимита');
assert.strictEqual(partial.capped, true);

// Накрутка по одному символу: 20 шагов по +5 обрезаются лимитом
let farmed = 0;
for (let i = 0; i < 20; i += 1) {
  farmed += awardImprovementPoints({ tier: 'bronze', savedChars: 1, alreadyAwarded: farmed }).points;
}
assert.strictEqual(farmed, 20, 'нельзя набить больше лимита мелкими шагами');

// Числительные
assert.strictEqual(pluralizeRu(1, ['очко', 'очка', 'очков']), 'очко');
assert.strictEqual(pluralizeRu(2, ['очко', 'очка', 'очков']), 'очка');
assert.strictEqual(pluralizeRu(5, ['очко', 'очка', 'очков']), 'очков');
assert.strictEqual(pluralizeRu(11, ['очко', 'очка', 'очков']), 'очков');
assert.strictEqual(pluralizeRu(21, ['очко', 'очка', 'очков']), 'очко');
assert.strictEqual(pluralizeRu(0, ['очко', 'очка', 'очков']), 'очков');

// Текст уведомления
const rendered = renderNotification({
  id: 'n1',
  type: NOTIFICATION_TYPES.recordBeaten,
  payloadJson: JSON.stringify({
    taskSlug: 'sum-digits',
    taskTitle: 'Сумма цифр',
    byNickname: 'golfer',
    newLength: 28,
    yourLength: 31,
  }),
  readAt: null,
  createdAt: new Date(),
});
assert.ok(rendered.title.includes('Сумма цифр'), rendered.title);
assert.ok(rendered.text.includes('28'), rendered.text);
assert.ok(rendered.text.includes('короче на 3'), rendered.text);
assert.strictEqual(rendered.href, '/task/sum-digits');
assert.strictEqual(rendered.isRead, false);

const broken = renderNotification({
  id: 'n2',
  type: 'record_beaten',
  payloadJson: 'not json',
  readAt: new Date(),
  createdAt: new Date(),
});
assert.ok(broken.title.length > 0);
assert.strictEqual(broken.href, null);
assert.strictEqual(broken.isRead, true);

// Сортировка соревнования: задачи -> сумма длин -> кто раньше
const entries = [
  { tasksSolved: 2, totalLength: 90, lastSubmitAt: new Date('2026-01-02') },
  { tasksSolved: 3, totalLength: 200, lastSubmitAt: new Date('2026-01-03') },
  { tasksSolved: 2, totalLength: 90, lastSubmitAt: new Date('2026-01-01') },
  { tasksSolved: 2, totalLength: 80, lastSubmitAt: new Date('2026-01-05') },
];
const sorted = [...entries].sort(compareCompetitionEntries);
assert.strictEqual(sorted[0].tasksSolved, 3);
assert.strictEqual(sorted[1].totalLength, 80);
assert.deepStrictEqual(
  sorted.slice(2).map((e) => e.lastSubmitAt.toISOString().slice(0, 10)),
  ['2026-01-01', '2026-01-02']
);

console.log('all points/notifications/competition checks passed');
