import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DUPLICATE_GROUPS: Array<{ keep: string; archive: string[] }> = [
  { keep: 'is-palindrome', archive: ['palindrome'] },
  { keep: 'is-anagram', archive: ['anagram'] },
  { keep: 'rle-encode', archive: ['compress'] },
  { keep: 'transpose-matrix', archive: ['transpose'] },
  { keep: 'chunk-list', archive: ['chunk'] },
  { keep: 'rotate-list', archive: ['rotate'] },
  { keep: 'flatten-list', archive: ['flatten'] },
  { keep: 'balanced-brackets', archive: ['valid-brackets'] },
  { keep: 'look-and-say', archive: ['count-say'] },
  { keep: 'binary-to-decimal', archive: ['bin-to-dec'] },
  { keep: 'decimal-to-binary', archive: ['dec-to-bin'] },
  { keep: 'pascals-triangle-row', archive: ['pascal-row'] },
];

async function main() {
  let archivedCount = 0;

  for (const group of DUPLICATE_GROUPS) {
    const keepTask = await prisma.task.findUnique({
      where: { slug: group.keep },
      select: { id: true, slug: true, status: true },
    });

    if (!keepTask) {
      console.warn(`skip group: keep task not found: ${group.keep}`);
      continue;
    }

    for (const duplicateSlug of group.archive) {
      const duplicate = await prisma.task.findUnique({
        where: { slug: duplicateSlug },
        select: { id: true, slug: true, status: true },
      });

      if (!duplicate) {
        continue;
      }

      if (duplicate.status === 'archived') {
        console.log(`already archived: ${duplicate.slug}`);
        continue;
      }

      await prisma.task.update({
        where: { id: duplicate.id },
        data: { status: 'archived' },
      });

      archivedCount += 1;
      console.log(`archived: ${duplicate.slug} (keep: ${group.keep})`);
    }
  }

  console.log(`done: archived=${archivedCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
