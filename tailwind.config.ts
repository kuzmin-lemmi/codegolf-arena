import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Основные цвета темной темы (как на макетах)
        background: {
          DEFAULT: '#0b0f14',
          secondary: '#111821',
          tertiary: '#17212b',
        },
        border: {
          DEFAULT: '#243041',
          light: '#334155',
        },
        text: {
          primary: '#eef3f8',
          secondary: '#a6b0bb',
          muted: '#7d8894',
        },
        accent: {
          blue: '#6aa7ff',
          green: '#41c47a',
          yellow: '#e0b04f',
          orange: '#f0a44b',
          amber: '#f0a44b',
          red: '#f25f5c',
          purple: '#7f8cff',
        },
        tier: {
          bronze: '#cd7f32',
          silver: '#c0c0c0',
          gold: '#ffd166',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
        'card-hover': '0 4px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
