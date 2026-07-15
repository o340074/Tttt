export type IconName =
  | 'shield'
  | 'star'
  | 'check'
  | 'x'
  | 'info'
  | 'arrow-right'
  | 'arrow-left'
  | 'theme'
  | 'globe'
  | 'spark'
  | 'bolt'
  | 'mail'
  | 'lock'
  | 'user'
  | 'eye'
  | 'eye-off'
  | 'alert'
  | 'refresh'
  | 'logout'
  | 'search'
  | 'ads'
  | 'briefcase'
  | 'clock'
  | 'verify'
  | 'box'
  | 'wallet'
  | 'copy'
  | 'cart'
  | 'tag'
  | 'trash'
  | 'plus'
  | 'minus'
  | 'vault'
  | 'download'
  | 'bell'
  | 'ticket';

interface IconProps {
  name: IconName;
  className?: string;
  /** Accessible label for meaningful icons; decorative icons stay aria-hidden. */
  label?: string;
}

export function Icon({ name, className, label }: IconProps) {
  return (
    <svg
      className={className ? `svgic ${className}` : 'svgic'}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <use href={`#ic-${name}`} />
    </svg>
  );
}
