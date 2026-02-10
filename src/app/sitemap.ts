// src/app/sitemap.ts

import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://codegolf.ru';

  // Статические страницы
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/tasks`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/rules`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/competitions`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  // Динамические страницы задач
  let taskPages: MetadataRoute.Sitemap = [];
  let competitionPages: MetadataRoute.Sitemap = [];

  try {
    const tasks = await prisma.task.findMany({
      where: { status: 'published' },
      select: { slug: true, updatedAt: true },
    });

    taskPages = tasks.map((task) => ({
      url: `${baseUrl}/task/${task.slug}`,
      lastModified: task.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    const competitions = await prisma.competition.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    competitionPages = competitions.map((competition) => ({
      url: `${baseUrl}/competitions/${competition.id}`,
      lastModified: competition.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch (error) {
    console.error('Error generating sitemap:', error);
  }

  return [...staticPages, ...taskPages, ...competitionPages];
}
