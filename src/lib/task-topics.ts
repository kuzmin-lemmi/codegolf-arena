export const TASK_TOPIC_IDS = [
  'строки',
  'числа',
  'списки',
  'словари',
  'множества',
  'сортировка',
  'поиск',
  'математика',
  'арифметика',
  'битовые',
  'рекурсия',
  'динамика',
  'жадность',
  'комбинаторика',
  'regex',
  'итераторы',
  'матрицы',
] as const;

type TopicId = (typeof TASK_TOPIC_IDS)[number];

const TOPIC_DEFINITIONS: Array<{ id: TopicId; aliases: string[] }> = [
  { id: 'строки', aliases: ['строки', 'строка', 'string', 'strings', 'text', 'текст'] },
  { id: 'числа', aliases: ['числа', 'число', 'number', 'numbers', 'int', 'integer'] },
  { id: 'списки', aliases: ['списки', 'список', 'list', 'lists', 'array', 'массив'] },
  { id: 'словари', aliases: ['словари', 'словарь', 'dict', 'dictionary', 'map', 'hashmap'] },
  { id: 'множества', aliases: ['множества', 'множество', 'set', 'sets'] },
  { id: 'сортировка', aliases: ['сортировка', 'sort', 'sorting'] },
  { id: 'поиск', aliases: ['поиск', 'search', 'find'] },
  { id: 'математика', aliases: ['математика', 'math'] },
  { id: 'арифметика', aliases: ['арифметика', 'arithmetic'] },
  { id: 'битовые', aliases: ['битовые', 'биты', 'bit', 'bits', 'bitwise', 'binary', 'бинарные'] },
  { id: 'рекурсия', aliases: ['рекурсия', 'recursion', 'recursive'] },
  { id: 'динамика', aliases: ['динамика', 'dp', 'dynamic', 'dynamic-programming'] },
  { id: 'жадность', aliases: ['жадность', 'greedy'] },
  { id: 'комбинаторика', aliases: ['комбинаторика', 'combinatorics', 'permutations', 'combinations'] },
  { id: 'regex', aliases: ['regex', 'regexp', 'регексы', 'регулярки', 'регулярные-выражения', 're'] },
  { id: 'итераторы', aliases: ['итераторы', 'iterator', 'iterators', 'itertools'] },
  { id: 'матрицы', aliases: ['матрицы', 'матрица', 'matrix', 'matrices'] },
];

const topicAliasMap = new Map<string, TopicId>();
for (const def of TOPIC_DEFINITIONS) {
  topicAliasMap.set(def.id, def.id);
  for (const alias of def.aliases) {
    topicAliasMap.set(alias.toLowerCase(), def.id);
  }
}

export function normalizeTaskTopic(raw: string): TopicId | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return topicAliasMap.get(key) || null;
}

export function normalizeTaskTopics(values: unknown[], max = 8): TopicId[] {
  const dedup = new Set<TopicId>();
  for (const value of values) {
    const normalized = normalizeTaskTopic(String(value || ''));
    if (!normalized) continue;
    dedup.add(normalized);
    if (dedup.size >= max) break;
  }
  return Array.from(dedup);
}

export function topicLabel(topicId: string): string {
  if (!topicId) return '';
  return topicId[0].toUpperCase() + topicId.slice(1);
}

export function inferTaskTopics(task: {
  slug?: string;
  title?: string;
  statement?: string;
  signature?: string;
}): TopicId[] {
  const text = `${task.slug || ''} ${task.title || ''} ${task.statement || ''} ${task.signature || ''}`.toLowerCase();
  const picked = new Set<TopicId>();

  const add = (id: TopicId) => picked.add(id);

  if (/str|string|словар|word|анаграм|prefix|palindrome|camel|snake|rle|atoi|roman|excel/.test(text)) add('строки');
  if (/int|числ|prime|factor|gcd|lcm|sum|sqrt|pascal|fibonacci|арифм|math/.test(text)) add('числа');
  if (/list|списк|subarray|chunk|rotate|flatten|zip|merge|sort/.test(text)) add('списки');
  if (/sort|сорт/.test(text)) add('сортировка');
  if (/search|index|find|contains|prefix|missing/.test(text)) add('поиск');
  if (/prime|factor|gcd|lcm|sqrt|pascal|math/.test(text)) add('математика');
  if (/sum|count|average|product|арифм/.test(text)) add('арифметика');
  if (/bit|binary|bin|hamming|reverse-bits|power-of-two/.test(text)) add('битовые');
  if (/recurs|рекурс/.test(text)) add('рекурсия');
  if (/dp|dynamic|climb-stairs|max-subarray/.test(text)) add('динамика');
  if (/greedy|жад/.test(text)) add('жадность');
  if (/permutation|subset|power-set|anagram|combin/.test(text)) add('комбинаторика');
  if (/regex|regexp|camel-to-snake|atoi|\bre\.\w+/.test(text)) add('regex');
  if (/itertools|iterator|zip|running-sum|group-anagrams|count-say/.test(text)) add('итераторы');
  if (/matrix|transpose|матриц/.test(text)) add('матрицы');

  return Array.from(picked).slice(0, 4);
}
