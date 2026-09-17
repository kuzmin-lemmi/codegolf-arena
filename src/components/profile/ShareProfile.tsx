// src/components/profile/ShareProfile.tsx

'use client';

import { useState } from 'react';
import { Check, Copy, Download, Send } from 'lucide-react';
import { Button } from '@/components/ui';

interface ShareProfileProps {
  profileUrl: string;
  imageUrl: string;
  shareText: string;
}

export function ShareProfile({ profileUrl, imageUrl, shareText }: ShareProfileProps) {
  const [copied, setCopied] = useState(false);

  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    profileUrl
  )}&text=${encodeURIComponent(shareText)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-background-tertiary/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Картинка с результатами участника"
          width={1200}
          height={630}
          className="w-full h-auto"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={telegramUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="primary" size="sm" icon={Send}>
            Поделиться в Telegram
          </Button>
        </a>

        <Button
          variant="secondary"
          size="sm"
          icon={copied ? Check : Copy}
          onClick={handleCopy}
        >
          {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </Button>

        <a href={imageUrl} download="codegolf-arena.png">
          <Button variant="ghost" size="sm" icon={Download}>
            Скачать картинку
          </Button>
        </a>
      </div>

      <p className="text-xs text-text-muted">
        Картинка обновляется автоматически: как только результат улучшится, в превью ссылки
        появятся новые цифры.
      </p>
    </div>
  );
}
