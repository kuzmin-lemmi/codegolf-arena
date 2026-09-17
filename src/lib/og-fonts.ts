// src/lib/og-fonts.ts

/**
 * Шрифты для картинок-превью (og:image).
 *
 * next/og приносит с собой только латиницу, поэтому кириллица без своего
 * шрифта превратилась бы в пустые квадраты. Файлы лежат в public/fonts
 * (deploy-скрипт копирует public/ в standalone-сборку).
 */

import { readFile } from 'fs/promises';
import path from 'path';

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

const FONT_FAMILY = 'JetBrains Mono';

let cachedFonts: OgFont[] | null = null;

export async function loadCardFonts(): Promise<OgFont[]> {
  if (cachedFonts) return cachedFonts;

  try {
    const dir = path.join(process.cwd(), 'public', 'fonts');
    const [regular, bold] = await Promise.all([
      readFile(path.join(dir, 'JetBrainsMono-Regular.ttf')),
      readFile(path.join(dir, 'JetBrainsMono-Bold.ttf')),
    ]);

    cachedFonts = [
      { name: FONT_FAMILY, data: regular, weight: 400, style: 'normal' },
      { name: FONT_FAMILY, data: bold, weight: 700, style: 'normal' },
    ];

    return cachedFonts;
  } catch (error) {
    // Без шрифта картинку всё равно отдаём: цифры и латиница отрисуются
    console.error('OG fonts are not available:', error);
    return [];
  }
}

export const OG_FONT_FAMILY = FONT_FAMILY;
