// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { inferTaskTopics } from '../src/lib/task-topics';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Очищаем БД
  // Защита живых данных: сид полностью очищает базу. На свежей базе это
  // нормально, а на работающем сайте уничтожило бы участников и рекорды
  const [existingSubmissions, existingPlayers] = await Promise.all([
    prisma.submission.count(),
    prisma.user.count({ where: { isAdmin: false } }),
  ]);
  if ((existingSubmissions > 0 || existingPlayers > 0) && process.env.SEED_FORCE !== 'true') {
    console.error(
      `ОТКАЗ: в базе уже есть данные (участников: ${existingPlayers}, отправок: ${existingSubmissions}).`
    );
    console.error('Сид стирает всё. Если это действительно нужно: SEED_FORCE=true npm run db:seed');
    process.exit(1);
  }

  await prisma.competitionEntry.deleteMany({});
  await prisma.competitionTask.deleteMany({});
  await prisma.competition.deleteMany({});
  await prisma.weeklyChallenge.deleteMany({});
  await prisma.bestSubmission.deleteMany({});
  await prisma.submission.deleteMany({});
  await prisma.testcase.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
  
  console.log('🗑️ Cleared database');

  // Создаём админа (email+пароль для входа)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding');
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.create({
    data: {
      stepikUserId: 1,
      email: adminEmail.toLowerCase(),
      passwordHash,
      displayName: 'Admin',
      nickname: 'admin',
      nicknameKey: 'admin',
      isAdmin: true,
      totalPoints: 0,
    },
  });
  console.log('👤 Created admin:', admin.nickname);

  // ============ BRONZE (30 задач) ============
  const bronzeTasks = [
    { slug: 'sum-list', title: 'Сумма списка', statement: 'Верните сумму всех чисел в списке.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[1, 2, 3, 4, 5]', output: '15' }, tests: [{ args: [[1, 2, 3, 4, 5]], expected: '15' }, { args: [[10, 20, 30]], expected: '60' }, { args: [[0]], expected: '0' }, { args: [[-1, 1]], expected: '0' }] },
    { slug: 'list-length', title: 'Длина списка', statement: 'Верните количество элементов в списке.', signature: 'solution(lst: list) -> int', args: ['lst'], example: { input: '[1, 2, 3]', output: '3' }, tests: [{ args: [[1, 2, 3]], expected: '3' }, { args: [[]], expected: '0' }, { args: [[1]], expected: '1' }] },
    { slug: 'max-number', title: 'Максимум в списке', statement: 'Найдите максимальное число в списке.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[3, 1, 4, 1, 5]', output: '5' }, tests: [{ args: [[3, 1, 4, 1, 5]], expected: '5' }, { args: [[1]], expected: '1' }, { args: [[-5, -2, -10]], expected: '-2' }] },
    { slug: 'min-number', title: 'Минимум в списке', statement: 'Найдите минимальное число в списке.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[3, 1, 4, 1, 5]', output: '1' }, tests: [{ args: [[3, 1, 4, 1, 5]], expected: '1' }, { args: [[10]], expected: '10' }, { args: [[-5, -2, -10]], expected: '-10' }] },
    { slug: 'reverse-string', title: 'Переворот строки', statement: 'Переверните строку.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"hello"', output: '"olleh"' }, tests: [{ args: ['hello'], expected: 'olleh' }, { args: ['python'], expected: 'nohtyp' }, { args: ['a'], expected: 'a' }] },
    { slug: 'first-element', title: 'Первый элемент', statement: 'Верните первый элемент списка.', signature: 'solution(lst: list) -> any', args: ['lst'], example: { input: '[5, 10, 15]', output: '5' }, tests: [{ args: [[5, 10, 15]], expected: '5' }, { args: [['a', 'b']], expected: 'a' }, { args: [[100]], expected: '100' }] },
    { slug: 'last-element', title: 'Последний элемент', statement: 'Верните последний элемент списка.', signature: 'solution(lst: list) -> any', args: ['lst'], example: { input: '[5, 10, 15]', output: '15' }, tests: [{ args: [[5, 10, 15]], expected: '15' }, { args: [['x', 'y', 'z']], expected: 'z' }, { args: [[42]], expected: '42' }] },
    { slug: 'double-numbers', title: 'Удвоение чисел', statement: 'Удвойте каждое число в списке.', signature: 'solution(nums: list) -> list', args: ['nums'], example: { input: '[1, 2, 3]', output: '[2, 4, 6]' }, tests: [{ args: [[1, 2, 3]], expected: '[2, 4, 6]' }, { args: [[0, 5, 10]], expected: '[0, 10, 20]' }, { args: [[-1, -2]], expected: '[-2, -4]' }] },
    { slug: 'square-numbers', title: 'Квадраты чисел', statement: 'Возведите каждое число в квадрат.', signature: 'solution(nums: list) -> list', args: ['nums'], example: { input: '[1, 2, 3]', output: '[1, 4, 9]' }, tests: [{ args: [[1, 2, 3]], expected: '[1, 4, 9]' }, { args: [[0, 4, 5]], expected: '[0, 16, 25]' }, { args: [[-2, -3]], expected: '[4, 9]' }] },
    { slug: 'sum-string-numbers', title: 'Сумма чисел в строке', statement: 'Строка содержит числа через пробел. Верните их сумму.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"1 2 3 4 5"', output: '15' }, tests: [{ args: ['1 2 3 4 5'], expected: '15' }, { args: ['10 20 30'], expected: '60' }, { args: ['100'], expected: '100' }] },
    { slug: 'count-vowels', title: 'Количество гласных', statement: 'Посчитайте гласные (aeiou) в строке (lowercase).', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"hello"', output: '2' }, tests: [{ args: ['hello'], expected: '2' }, { args: ['aeiou'], expected: '5' }, { args: ['xyz'], expected: '0' }] },
    { slug: 'is-even', title: 'Чётное число?', statement: 'Верните True если число чётное.', signature: 'solution(n: int) -> bool', args: ['n'], example: { input: '4', output: 'True' }, tests: [{ args: [4], expected: 'True' }, { args: [7], expected: 'False' }, { args: [0], expected: 'True' }] },
    { slug: 'is-positive', title: 'Положительное?', statement: 'Верните True если число > 0.', signature: 'solution(n: int) -> bool', args: ['n'], example: { input: '5', output: 'True' }, tests: [{ args: [5], expected: 'True' }, { args: [-3], expected: 'False' }, { args: [0], expected: 'False' }] },
    { slug: 'absolute-value', title: 'Модуль числа', statement: 'Верните абсолютное значение.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '-5', output: '5' }, tests: [{ args: [-5], expected: '5' }, { args: [10], expected: '10' }, { args: [0], expected: '0' }] },
    { slug: 'string-upper', title: 'Верхний регистр', statement: 'Преобразуйте в верхний регистр.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"hello"', output: '"HELLO"' }, tests: [{ args: ['hello'], expected: 'HELLO' }, { args: ['Python'], expected: 'PYTHON' }] },
    { slug: 'string-lower', title: 'Нижний регистр', statement: 'Преобразуйте в нижний регистр.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"HELLO"', output: '"hello"' }, tests: [{ args: ['HELLO'], expected: 'hello' }, { args: ['PyThOn'], expected: 'python' }] },
    { slug: 'repeat-string', title: 'Повтор строки', statement: 'Повторите строку n раз.', signature: 'solution(s: str, n: int) -> str', args: ['s', 'n'], example: { input: '"ab", 3', output: '"ababab"' }, tests: [{ args: ['ab', 3], expected: 'ababab' }, { args: ['x', 5], expected: 'xxxxx' }, { args: ['hi', 0], expected: '' }] },
    { slug: 'list-contains', title: 'Элемент в списке?', statement: 'Есть ли x в списке?', signature: 'solution(lst: list, x: any) -> bool', args: ['lst', 'x'], example: { input: '[1, 2, 3], 2', output: 'True' }, tests: [{ args: [[1, 2, 3], 2], expected: 'True' }, { args: [[1, 2, 3], 5], expected: 'False' }] },
    { slug: 'count-element', title: 'Счётчик элемента', statement: 'Сколько раз x в списке?', signature: 'solution(lst: list, x: any) -> int', args: ['lst', 'x'], example: { input: '[1, 2, 1, 1], 1', output: '3' }, tests: [{ args: [[1, 2, 1, 1, 3], 1], expected: '3' }, { args: [[5, 5, 5], 5], expected: '3' }, { args: [[1, 2, 3], 9], expected: '0' }] },
    { slug: 'index-of', title: 'Индекс элемента', statement: 'Индекс первого вхождения x.', signature: 'solution(lst: list, x: any) -> int', args: ['lst', 'x'], example: { input: '[10, 20, 30], 20', output: '1' }, tests: [{ args: [[10, 20, 30], 20], expected: '1' }, { args: [['a', 'b', 'c'], 'a'], expected: '0' }] },
    { slug: 'filter-positive', title: 'Только положительные', statement: 'Оставьте только положительные числа.', signature: 'solution(nums: list) -> list', args: ['nums'], example: { input: '[-1, 2, -3, 4]', output: '[2, 4]' }, tests: [{ args: [[-1, 2, -3, 4]], expected: '[2, 4]' }, { args: [[1, 2, 3]], expected: '[1, 2, 3]' }, { args: [[-1, -2]], expected: '[]' }] },
    { slug: 'filter-even', title: 'Только чётные', statement: 'Оставьте только чётные числа.', signature: 'solution(nums: list) -> list', args: ['nums'], example: { input: '[1, 2, 3, 4, 5, 6]', output: '[2, 4, 6]' }, tests: [{ args: [[1, 2, 3, 4, 5, 6]], expected: '[2, 4, 6]' }, { args: [[1, 3, 5]], expected: '[]' }] },
    { slug: 'join-strings', title: 'Склеить строки', statement: 'Объедините список через разделитель.', signature: 'solution(lst: list, sep: str) -> str', args: ['lst', 'sep'], example: { input: '["a", "b", "c"], "-"', output: '"a-b-c"' }, tests: [{ args: [['a', 'b', 'c'], '-'], expected: 'a-b-c' }, { args: [['hello', 'world'], ' '], expected: 'hello world' }] },
    { slug: 'split-string', title: 'Разбить строку', statement: 'Разбейте по разделителю.', signature: 'solution(s: str, sep: str) -> list', args: ['s', 'sep'], example: { input: '"a-b-c", "-"', output: "['a', 'b', 'c']" }, tests: [{ args: ['a-b-c', '-'], expected: "['a', 'b', 'c']" }, { args: ['hello world', ' '], expected: "['hello', 'world']" }] },
    { slug: 'first-n', title: 'Первые N', statement: 'Первые n элементов списка.', signature: 'solution(lst: list, n: int) -> list', args: ['lst', 'n'], example: { input: '[1, 2, 3, 4, 5], 3', output: '[1, 2, 3]' }, tests: [{ args: [[1, 2, 3, 4, 5], 3], expected: '[1, 2, 3]' }, { args: [[1, 2], 5], expected: '[1, 2]' }] },
    { slug: 'last-n', title: 'Последние N', statement: 'Последние n элементов списка.', signature: 'solution(lst: list, n: int) -> list', args: ['lst', 'n'], example: { input: '[1, 2, 3, 4, 5], 2', output: '[4, 5]' }, tests: [{ args: [[1, 2, 3, 4, 5], 2], expected: '[4, 5]' }, { args: [[1, 2], 5], expected: '[1, 2]' }] },
    { slug: 'average', title: 'Среднее', statement: 'Среднее арифметическое списка.', signature: 'solution(nums: list) -> float', args: ['nums'], example: { input: '[1, 2, 3, 4, 5]', output: '3.0' }, tests: [{ args: [[1, 2, 3, 4, 5]], expected: '3.0' }, { args: [[10, 20]], expected: '15.0' }] },
    { slug: 'product', title: 'Произведение', statement: 'Произведение всех чисел.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[1, 2, 3, 4]', output: '24' }, imports: ['functools'], tests: [{ args: [[1, 2, 3, 4]], expected: '24' }, { args: [[5, 5]], expected: '25' }] },
    { slug: 'unique-sorted', title: 'Уникальные', statement: 'Отсортированный список уникальных.', signature: 'solution(lst: list) -> list', args: ['lst'], example: { input: '[3, 1, 2, 3, 2]', output: '[1, 2, 3]' }, tests: [{ args: [[3, 1, 2, 3, 2, 1]], expected: '[1, 2, 3]' }, { args: [[1, 1, 1]], expected: '[1]' }] },
    { slug: 'string-len', title: 'Длина строки', statement: 'Длина строки.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"hello"', output: '5' }, tests: [{ args: ['hello'], expected: '5' }, { args: [''], expected: '0' }] },
  ];

  // ============ SILVER (30 задач) ============
  const silverTasks = [
    { slug: 'palindrome', title: 'Палиндром?', statement: 'Является ли строка палиндромом?', signature: 'solution(s: str) -> bool', args: ['s'], example: { input: '"radar"', output: 'True' }, tests: [{ args: ['radar'], expected: 'True' }, { args: ['hello'], expected: 'False' }, { args: ['a'], expected: 'True' }] },
    { slug: 'reverse-words', title: 'Переворот слов', statement: 'Переверните порядок слов.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"hello world"', output: '"world hello"' }, tests: [{ args: ['hello world'], expected: 'world hello' }, { args: ['a b c'], expected: 'c b a' }] },
    { slug: 'flatten', title: 'Сглаживание', statement: 'Сгладьте [[1,2],[3,4]] → [1,2,3,4].', signature: 'solution(lst: list) -> list', args: ['lst'], example: { input: '[[1, 2], [3, 4]]', output: '[1, 2, 3, 4]' }, tests: [{ args: [[[1, 2], [3, 4]]], expected: '[1, 2, 3, 4]' }, { args: [[[1], [2], [3]]], expected: '[1, 2, 3]' }] },
    { slug: 'zip-lists', title: 'Zip списков', statement: 'Объедините в пары.', signature: 'solution(a: list, b: list) -> list', args: ['a', 'b'], example: { input: '[1, 2], ["a", "b"]', output: '[(1, "a"), (2, "b")]' }, tests: [{ args: [[1, 2], ['a', 'b']], expected: "[(1, 'a'), (2, 'b')]" }] },
    { slug: 'second-max', title: 'Второй макс', statement: 'Второе по величине уникальное.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[1, 5, 3, 4, 2]', output: '4' }, tests: [{ args: [[1, 5, 3, 4, 2]], expected: '4' }, { args: [[10, 10, 9]], expected: '9' }] },
    { slug: 'word-count', title: 'Счётчик слов', statement: 'Количество слов в строке (разделитель — любые пробельные символы).', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"hello world"', output: '2' }, tests: [{ args: ['hello world python'], expected: '3' }, { args: ['one'], expected: '1' }, { args: ['   hello   world  '], expected: '2' }, { args: [''], expected: '0' }] },
    { slug: 'title-case', title: 'Title Case', statement: 'Каждое слово с большой буквы.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"hello world"', output: '"Hello World"' }, tests: [{ args: ['hello world'], expected: 'Hello World' }, { args: ['a b c'], expected: 'A B C' }] },
    { slug: 'sort-desc', title: 'По убыванию', statement: 'Отсортируйте по убыванию.', signature: 'solution(nums: list) -> list', args: ['nums'], example: { input: '[3, 1, 4]', output: '[4, 3, 1]' }, tests: [{ args: [[3, 1, 4, 1, 5]], expected: '[5, 4, 3, 1, 1]' }, { args: [[1, 2, 3]], expected: '[3, 2, 1]' }] },
    { slug: 'every-nth', title: 'Каждый N-й', statement: 'Каждый n-й элемент (с первого).', signature: 'solution(lst: list, n: int) -> list', args: ['lst', 'n'], example: { input: '[1,2,3,4,5,6], 2', output: '[1, 3, 5]' }, tests: [{ args: [[1, 2, 3, 4, 5, 6], 2], expected: '[1, 3, 5]' }] },
    { slug: 'rotate', title: 'Ротация', statement: 'Сдвиг влево на n.', signature: 'solution(lst: list, n: int) -> list', args: ['lst', 'n'], example: { input: '[1,2,3,4,5], 2', output: '[3, 4, 5, 1, 2]' }, tests: [{ args: [[1, 2, 3, 4, 5], 2], expected: '[3, 4, 5, 1, 2]' }] },
    { slug: 'chunk', title: 'Чанки', statement: 'Разбейте на части по n.', signature: 'solution(lst: list, n: int) -> list', args: ['lst', 'n'], example: { input: '[1,2,3,4,5], 2', output: '[[1,2],[3,4],[5]]' }, tests: [{ args: [[1, 2, 3, 4, 5], 2], expected: '[[1, 2], [3, 4], [5]]' }] },
    { slug: 'interleave', title: 'Чередование', statement: 'Чередуйте элементы.', signature: 'solution(a: list, b: list) -> list', args: ['a', 'b'], example: { input: '[1,2], ["a","b"]', output: '[1,"a",2,"b"]' }, tests: [{ args: [[1, 2, 3], ['a', 'b', 'c']], expected: "[1, 'a', 2, 'b', 3, 'c']" }] },
    { slug: 'digit-sum', title: 'Сумма цифр', statement: 'Сумма цифр числа.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '12345', output: '15' }, tests: [{ args: [12345], expected: '15' }, { args: [100], expected: '1' }] },
    { slug: 'digit-count', title: 'Счёт цифр', statement: 'Количество цифр.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '12345', output: '5' }, tests: [{ args: [12345], expected: '5' }, { args: [0], expected: '1' }] },
    { slug: 'reverse-int', title: 'Переворот числа', statement: 'Переверните цифры.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '12345', output: '54321' }, tests: [{ args: [12345], expected: '54321' }, { args: [100], expected: '1' }] },
    { slug: 'is-prime', title: 'Простое?', statement: 'Простое ли число?', signature: 'solution(n: int) -> bool', args: ['n'], example: { input: '7', output: 'True' }, tests: [{ args: [7], expected: 'True' }, { args: [4], expected: 'False' }, { args: [2], expected: 'True' }] },
    { slug: 'factorial', title: 'Факториал', statement: 'Факториал n.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '5', output: '120' }, imports: ['math'], tests: [{ args: [5], expected: '120' }, { args: [0], expected: '1' }] },
    { slug: 'gcd', title: 'НОД', statement: 'Наибольший общий делитель.', signature: 'solution(a: int, b: int) -> int', args: ['a', 'b'], example: { input: '12, 18', output: '6' }, imports: ['math'], tests: [{ args: [12, 18], expected: '6' }, { args: [17, 13], expected: '1' }] },
    { slug: 'lcm', title: 'НОК', statement: 'Наименьшее общее кратное.', signature: 'solution(a: int, b: int) -> int', args: ['a', 'b'], example: { input: '4, 6', output: '12' }, imports: ['math'], tests: [{ args: [4, 6], expected: '12' }, { args: [3, 5], expected: '15' }] },
    { slug: 'merge-sorted', title: 'Слияние', statement: 'Слейте отсортированные.', signature: 'solution(a: list, b: list) -> list', args: ['a', 'b'], example: { input: '[1,3,5], [2,4,6]', output: '[1,2,3,4,5,6]' }, tests: [{ args: [[1, 3, 5], [2, 4, 6]], expected: '[1, 2, 3, 4, 5, 6]' }, { args: [[], [1, 2]], expected: '[1, 2]' }, { args: [[-3, 0], []], expected: '[-3, 0]' }] },
    { slug: 'difference', title: 'Разность', statement: 'Элементы a без b (сохраните порядок a).', signature: 'solution(a: list, b: list) -> list', args: ['a', 'b'], example: { input: '[1,2,3,4], [2,4]', output: '[1, 3]' }, tests: [{ args: [[1, 2, 3, 4], [2, 4]], expected: '[1, 3]' }, { args: [[1, 2, 3], []], expected: '[1, 2, 3]' }, { args: [[1, 1, 2], [1]], expected: '[2]' }] },
    { slug: 'intersection', title: 'Пересечение', statement: 'Общие элементы (сохраните порядок a).', signature: 'solution(a: list, b: list) -> list', args: ['a', 'b'], example: { input: '[1,2,3], [2,3,4]', output: '[2, 3]' }, tests: [{ args: [[1, 2, 3], [2, 3, 4]], expected: '[2, 3]' }, { args: [[1, 2, 3], [4, 5]], expected: '[]' }, { args: [[1, 1, 2, 3], [1, 3]], expected: '[1, 1, 3]' }] },
    { slug: 'most-frequent', title: 'Частый элемент', statement: 'Самый частый элемент (гарантирован единственный максимум).', signature: 'solution(lst: list) -> any', args: ['lst'], example: { input: '[1,2,2,3,2]', output: '2' }, tests: [{ args: [[1, 2, 2, 3, 2]], expected: '2' }, { args: [[5, 5, 5, 1, 2]], expected: '5' }, { args: [['a', 'b', 'b', 'b', 'c']], expected: 'b' }] },
    { slug: 'anagram', title: 'Анаграмма?', statement: 'Анаграммы ли строки?', signature: 'solution(a: str, b: str) -> bool', args: ['a', 'b'], example: { input: '"listen", "silent"', output: 'True' }, tests: [{ args: ['listen', 'silent'], expected: 'True' }, { args: ['hello', 'world'], expected: 'False' }] },
    { slug: 'camel-to-snake', title: 'camelCase→snake', statement: 'CamelCase в snake_case.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"camelCase"', output: '"camel_case"' }, imports: ['re'], tests: [{ args: ['camelCase'], expected: 'camel_case' }, { args: ['HelloWorld'], expected: 'hello_world' }] },
    { slug: 'compress', title: 'Сжатие RLE', statement: 'aaabbc → a3b2c1.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"aaabbc"', output: '"a3b2c1"' }, imports: ['itertools'], tests: [{ args: ['aaabbc'], expected: 'a3b2c1' }, { args: ['abc'], expected: 'a1b1c1' }] },
    { slug: 'transpose', title: 'Транспонирование', statement: 'Транспонируйте матрицу.', signature: 'solution(m: list) -> list', args: ['m'], example: { input: '[[1,2],[3,4]]', output: '[(1,3),(2,4)]' }, tests: [{ args: [[[1, 2], [3, 4]]], expected: '[(1, 3), (2, 4)]' }] },
    { slug: 'running-sum', title: 'Накопительная', statement: '[1,2,3] → [1,3,6].', signature: 'solution(nums: list) -> list', args: ['nums'], example: { input: '[1, 2, 3, 4]', output: '[1, 3, 6, 10]' }, imports: ['itertools'], tests: [{ args: [[1, 2, 3, 4]], expected: '[1, 3, 6, 10]' }] },
    { slug: 'filter-by-len', title: 'По длине', statement: 'Слова длиннее n.', signature: 'solution(words: list, n: int) -> list', args: ['words', 'n'], example: { input: '["a","bb","ccc"], 1', output: '["bb","ccc"]' }, tests: [{ args: [['a', 'bb', 'ccc'], 1], expected: "['bb', 'ccc']" }] },
    { slug: 'sort-by-len', title: 'Сорт по длине', statement: 'Отсортируйте по длине.', signature: 'solution(lst: list) -> list', args: ['lst'], example: { input: '["aaa","b","cc"]', output: '["b","cc","aaa"]' }, tests: [{ args: [['aaa', 'b', 'cc']], expected: "['b', 'cc', 'aaa']" }] },
  ];

  // ============ GOLD (30 задач) ============
  const goldTasks = [
    { slug: 'fibonacci', title: 'Фибоначчи', statement: 'N-е число Фибоначчи (F0=0, F1=1).', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '10', output: '55' }, imports: ['functools'], tests: [{ args: [0], expected: '0' }, { args: [1], expected: '1' }, { args: [10], expected: '55' }] },
    { slug: 'prime-factors', title: 'Простые множители', statement: 'Список простых множителей.', signature: 'solution(n: int) -> list', args: ['n'], example: { input: '12', output: '[2, 2, 3]' }, tests: [{ args: [12], expected: '[2, 2, 3]' }, { args: [7], expected: '[7]' }] },
    { slug: 'permutations', title: 'Перестановки', statement: 'Все перестановки строки.', signature: 'solution(s: str) -> list', args: ['s'], example: { input: '"ab"', output: "['ab', 'ba']" }, imports: ['itertools'], tests: [{ args: ['ab'], expected: "['ab', 'ba']" }] },
    { slug: 'power-set', title: 'Подмножества', statement: 'Все подмножества.', signature: 'solution(lst: list) -> list', args: ['lst'], example: { input: '[1, 2]', output: '[(), (1,), (2,), (1, 2)]' }, imports: ['itertools'], tests: [{ args: [[1, 2]], expected: '[(), (1,), (2,), (1, 2)]' }] },
    { slug: 'longest-word', title: 'Длиннейшее слово', statement: 'Самое длинное слово.', signature: 'solution(s: str) -> str', args: ['s'], example: { input: '"hello wonderful world"', output: '"wonderful"' }, tests: [{ args: ['hello wonderful world'], expected: 'wonderful' }] },
    { slug: 'bin-to-dec', title: 'Бин→Дес', statement: 'Двоичное в десятичное.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"1010"', output: '10' }, tests: [{ args: ['1010'], expected: '10' }, { args: ['1111'], expected: '15' }] },
    { slug: 'dec-to-bin', title: 'Дес→Бин', statement: 'Десятичное в двоичное.', signature: 'solution(n: int) -> str', args: ['n'], example: { input: '10', output: '"1010"' }, tests: [{ args: [10], expected: '1010' }, { args: [0], expected: '0' }] },
    { slug: 'roman-to-int', title: 'Римское→Число', statement: 'Римское число в int.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"XIV"', output: '14' }, tests: [{ args: ['XIV'], expected: '14' }, { args: ['III'], expected: '3' }, { args: ['IX'], expected: '9' }, { args: ['MCMXCIV'], expected: '1994' }] },
    { slug: 'valid-brackets', title: 'Скобки', statement: 'Валидны ли ()[]{}?', signature: 'solution(s: str) -> bool', args: ['s'], example: { input: '"()[]{}"', output: 'True' }, tests: [{ args: ['()[]{}'], expected: 'True' }, { args: ['([)]'], expected: 'False' }, { args: [''], expected: 'True' }, { args: ['((('], expected: 'False' }] },
    { slug: 'longest-unique', title: 'Уникальная подстрока', statement: 'Длина без повторов.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"abcabcbb"', output: '3' }, tests: [{ args: ['abcabcbb'], expected: '3' }, { args: ['bbbbb'], expected: '1' }] },
    { slug: 'two-sum', title: 'Два числа', statement: 'Индексы с суммой target.', signature: 'solution(nums: list, target: int) -> list', args: ['nums', 'target'], example: { input: '[2,7,11,15], 9', output: '[0, 1]' }, tests: [{ args: [[2, 7, 11, 15], 9], expected: '[0, 1]' }] },
    { slug: 'max-subarray', title: 'Макс подсумма', statement: 'Макс сумма подмассива.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[-2,1,-3,4,-1,2,1,-5,4]', output: '6' }, tests: [{ args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: '6' }, { args: [[-5, -1, -8]], expected: '-1' }, { args: [[7]], expected: '7' }] },
    { slug: 'merge-intervals', title: 'Слияние интервалов', statement: 'Объедините пересекающиеся и соприкасающиеся интервалы. Результат отсортирован по началу.', signature: 'solution(intervals: list) -> list', args: ['intervals'], example: { input: '[[1,3],[2,6],[8,10]]', output: '[[1,6],[8,10]]' }, tests: [{ args: [[[1, 3], [2, 6], [8, 10]]], expected: '[[1, 6], [8, 10]]' }, { args: [[[8, 10], [1, 4], [4, 5]]], expected: '[[1, 5], [8, 10]]' }, { args: [[[1, 2]]], expected: '[[1, 2]]' }] },
    { slug: 'group-anagrams', title: 'Группы анаграмм', statement: 'Сгруппируйте анаграммы. Внутри группы слова отсортированы, группы отсортированы по первому слову.', signature: 'solution(strs: list) -> list', args: ['strs'], example: { input: '["eat","tea","ate"]', output: '[["ate","eat","tea"]]' }, imports: ['itertools'], tests: [{ args: [['eat', 'tea', 'ate']], expected: "[['ate', 'eat', 'tea']]" }, { args: [['tan', 'nat', 'bat', 'ate', 'eat', 'tea']], expected: "[['ate', 'eat', 'tea'], ['bat'], ['nat', 'tan']]" }] },
    { slug: 'longest-prefix', title: 'Общий префикс', statement: 'Общий префикс строк.', signature: 'solution(strs: list) -> str', args: ['strs'], example: { input: '["flower","flow","flight"]', output: '"fl"' }, tests: [{ args: [['flower', 'flow', 'flight']], expected: 'fl' }] },
    { slug: 'count-primes', title: 'Счёт простых', statement: 'Простых меньше n.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '10', output: '4' }, tests: [{ args: [10], expected: '4' }, { args: [2], expected: '0' }, { args: [0], expected: '0' }, { args: [1], expected: '0' }] },
    { slug: 'hamming', title: 'Вес Хэмминга', statement: 'Единичных битов.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '11', output: '3' }, tests: [{ args: [11], expected: '3' }, { args: [128], expected: '1' }] },
    { slug: 'missing', title: 'Пропущенное', statement: 'Пропущенное в 0..n.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[3, 0, 1]', output: '2' }, tests: [{ args: [[3, 0, 1]], expected: '2' }] },
    { slug: 'single', title: 'Единственное', statement: 'Встречается один раз.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[2, 2, 1]', output: '1' }, imports: ['functools'], tests: [{ args: [[2, 2, 1]], expected: '1' }, { args: [[4, 1, 2, 1, 2]], expected: '4' }] },
    { slug: 'majority', title: 'Мажоритарный', statement: 'Элемент > n/2 раз.', signature: 'solution(nums: list) -> int', args: ['nums'], example: { input: '[3, 2, 3]', output: '3' }, tests: [{ args: [[3, 2, 3]], expected: '3' }] },
    { slug: 'pascal-row', title: 'Строка Паскаля', statement: 'N-я строка Паскаля.', signature: 'solution(n: int) -> list', args: ['n'], example: { input: '4', output: '[1, 4, 6, 4, 1]' }, imports: ['math'], tests: [{ args: [4], expected: '[1, 4, 6, 4, 1]' }, { args: [0], expected: '[1]' }] },
    { slug: 'power-of-two', title: 'Степень 2?', statement: 'Степень ли двойки?', signature: 'solution(n: int) -> bool', args: ['n'], example: { input: '16', output: 'True' }, tests: [{ args: [16], expected: 'True' }, { args: [3], expected: 'False' }] },
    { slug: 'add-binary', title: 'Сумма бинарных', statement: 'Сложите бинарные.', signature: 'solution(a: str, b: str) -> str', args: ['a', 'b'], example: { input: '"11", "1"', output: '"100"' }, tests: [{ args: ['11', '1'], expected: '100' }] },
    { slug: 'sqrt-int', title: 'Целый корень', statement: 'Целая часть корня.', signature: 'solution(x: int) -> int', args: ['x'], example: { input: '8', output: '2' }, tests: [{ args: [8], expected: '2' }, { args: [4], expected: '2' }] },
    { slug: 'climb-stairs', title: 'Лестница', statement: 'Способов на n ступенек.', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '5', output: '8' }, tests: [{ args: [5], expected: '8' }, { args: [2], expected: '2' }] },
    { slug: 'excel-col', title: 'Столбец Excel', statement: 'AB → 28.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"AB"', output: '28' }, tests: [{ args: ['AB'], expected: '28' }, { args: ['A'], expected: '1' }] },
    { slug: 'count-say', title: 'Посчитай-скажи', statement: 'N-й элемент последовательности.', signature: 'solution(n: int) -> str', args: ['n'], example: { input: '4', output: '"1211"' }, imports: ['itertools'], tests: [{ args: [1], expected: '1' }, { args: [2], expected: '11' }, { args: [3], expected: '21' }, { args: [4], expected: '1211' }] },
    { slug: 'reverse-bits', title: 'Биты наоборот', statement: 'Переверните 32 бита (n — 32-битное беззнаковое).', signature: 'solution(n: int) -> int', args: ['n'], example: { input: '43261596', output: '964176192' }, tests: [{ args: [43261596], expected: '964176192' }, { args: [0], expected: '0' }, { args: [1], expected: '2147483648' }] },
    { slug: 'atoi', title: 'String to Int', statement: 'Преобразуйте строку в int: пропустите ведущие пробелы, обработайте знак, считайте подряд идущие цифры; если цифр нет — 0.', signature: 'solution(s: str) -> int', args: ['s'], example: { input: '"42"', output: '42' }, imports: ['re'], tests: [{ args: ['42'], expected: '42' }, { args: ['   -42'], expected: '-42' }, { args: ['4193 with words'], expected: '4193' }, { args: ['words'], expected: '0' }, { args: ['+7'], expected: '7' }] },
    { slug: 'eval-rpn', title: 'RPN калькулятор', statement: 'Вычислите RPN (деление — целочисленное с усечением к нулю).', signature: 'solution(tokens: list) -> int', args: ['tokens'], example: { input: '["2","1","+","3","*"]', output: '9' }, imports: ['functools'], tests: [{ args: [['2', '1', '+', '3', '*']], expected: '9' }, { args: [['4', '13', '5', '/', '+']], expected: '6' }, { args: [['-2', '1', '+', '3', '*']], expected: '-3' }] },
  ];

  // Создаём все задачи
  const allTasks = [
    ...bronzeTasks.map((t) => ({ ...t, tier: 'bronze' })),
    ...silverTasks.map((t) => ({ ...t, tier: 'silver' })),
    ...goldTasks.map((t) => ({ ...t, tier: 'gold' })),
  ];

  for (const taskData of allTasks) {
    const { tests, imports, ...task } = taskData as any;

    const createdTask = await prisma.task.create({
      data: {
        slug: task.slug,
        title: task.title,
        tier: task.tier,
        mode: 'practice',
        statementMd: task.statement,
        functionSignature: task.signature,
        functionArgs: JSON.stringify(task.args),
        exampleInput: task.example.input,
        exampleOutput: task.example.output,
        constraintsJson: JSON.stringify({
          forbidden_tokens: [';', 'eval', 'exec', '__import__'],
          allowed_imports: imports || [],
          topics: inferTaskTopics({
            slug: task.slug,
            title: task.title,
            statement: task.statement,
            signature: task.signature,
          }),
          timeout_ms: 2000,
        }),
        status: 'published',
      },
    });

    for (let i = 0; i < tests.length; i++) {
      await prisma.testcase.create({
        data: {
          taskId: createdTask.id,
          inputData: JSON.stringify({ args: tests[i].args }),
          expectedOutput: tests[i].expected,
          isHidden: i >= 2,
          orderIndex: i,
        },
      });
    }
  }

  console.log(`📝 Created ${allTasks.length} tasks`);

  // Задача недели
  const weeklyTask = await prisma.task.findUnique({ where: { slug: 'fibonacci' } });
  if (weeklyTask) {
    await prisma.weeklyChallenge.create({
      data: {
        taskId: weeklyTask.id,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    console.log('🏆 Created weekly challenge');
  }

  console.log('✅ Done!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
