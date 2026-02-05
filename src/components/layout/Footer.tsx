// src/components/layout/Footer.tsx

import Link from 'next/link';
import { Code2, Github, BookOpen, Mail, Trophy, Swords, MessageCircle } from 'lucide-react';

const primaryLinks = [
  { name: 'Задачи', href: '/tasks', icon: Code2 },
  { name: 'Соревнования', href: '/competitions', icon: Swords },
  { name: 'Рейтинг', href: '/leaderboard', icon: Trophy },
  { name: 'Правила', href: '/rules', icon: BookOpen },
];

const utilityLinks = [
  { name: 'GitHub', href: 'https://github.com/kuzmin-lemmi/codegolf-arena', icon: Github, external: true },
  { name: 'Telegram чат', href: 'https://t.me/codegolf_arena', icon: MessageCircle, external: true },
  { name: 'Контакты', href: 'mailto:contact@arena-oneliners.ru', icon: Mail, external: true },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background-secondary/60 mt-auto">
      <div className="container mx-auto px-4 py-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] items-center">
          {/* Logo & Copyright */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-accent-blue to-accent-amber">
                <Code2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-sm">
                <span className="text-accent-blue">АРЕНА</span>{' '}
                <span className="text-text-secondary">ОДНОСТРОЧНИКОВ</span>
              </span>
            </Link>
            <p className="text-sm text-text-secondary text-center md:text-left max-w-md">
              Арена для коротких Python-решений. Пиши в одну строку, побеждай длиной и чистотой мысли.
            </p>
            <div className="flex items-center gap-2">
              <span className="badge bg-background-tertiary text-text-secondary border border-border/60">Python</span>
              <span className="badge bg-background-tertiary text-text-secondary border border-border/60">1 строка</span>
              <span className="badge bg-background-tertiary text-text-secondary border border-border/60">Код-гольф</span>
            </div>
            <p className="text-xs text-text-muted">
              © {currentYear} Arena Oneliners. Все права защищены.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-col items-center md:items-end gap-4">
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-4">
              {primaryLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-4">
              {utilityLinks.map((link) => {
                const Icon = link.icon;
                const linkProps = link.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {};

                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
                    {...linkProps}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Tagline */}
        <div className="mt-8 pt-6 border-t border-border/50 text-center">
          <p className="text-xs text-text-muted tracking-wide">
            Пиши короче. Думай быстрее. Побеждай.
          </p>
        </div>
      </div>
    </footer>
  );
}
