import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Shows a spinner and blocks interaction; keeps the label for layout stability. */
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-aurora text-white shadow-glow-volt hover:-translate-y-px',
  secondary:
    'bg-surface-2 text-text-hi border border-border-2 hover:-translate-y-px hover:border-volt',
  ghost: 'bg-transparent text-text border border-border hover:bg-surface-2 hover:text-text-hi',
};

export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold transition-all duration-[140ms] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55 ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-pill border-2 border-white/35 border-t-white"
        />
      )}
      {children}
    </button>
  );
}
