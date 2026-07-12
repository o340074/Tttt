import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface BannerProps {
  tone: 'error' | 'info' | 'success';
  children: ReactNode;
}

const TONES: Record<BannerProps['tone'], { icon: IconName; className: string }> = {
  error: {
    icon: 'alert',
    className: 'border-[rgba(255,77,109,0.4)] bg-[rgba(255,77,109,0.12)] text-[#ffb3c1]',
  },
  info: {
    icon: 'info',
    className: 'border-[rgba(76,178,255,0.4)] bg-[rgba(76,178,255,0.12)] text-[#bfe1ff]',
  },
  success: {
    icon: 'check',
    className: 'border-[rgba(43,217,166,0.4)] bg-[rgba(43,217,166,0.12)] text-[#8fe8cd]',
  },
};

/** Form-level message (invalid credentials, reset link sent, …). */
export function Banner({ tone, children }: BannerProps) {
  const { icon, className } = TONES[tone];
  return (
    <div
      role="alert"
      className={`fade-up mb-4 flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-[13.5px] ${className}`}
    >
      <Icon name={icon} className="text-[13px]" />
      <span>{children}</span>
    </div>
  );
}
