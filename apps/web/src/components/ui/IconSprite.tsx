/**
 * Inline SVG sprite — mirror of the prototype sprite (docs/design/08).
 * Rendered once at the app root; icons are used via <Icon name="…" />.
 * Feature icons: solid Aurora gradient. UI icons: line, currentColor.
 */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ig-aurora" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B5BF6" />
          <stop offset="0.5" stopColor="#9B4DF0" />
          <stop offset="1" stopColor="#E24BF0" />
        </linearGradient>
      </defs>
      {/* Line icons (currentColor) */}
      <symbol id="ic-shield" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
          <path d="M9 12l2 2 4-4" />
        </g>
      </symbol>
      <symbol id="ic-check" viewBox="0 0 24 24">
        <path
          d="M4.5 12.5l5 5 10-11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </symbol>
      <symbol id="ic-x" viewBox="0 0 24 24">
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </symbol>
      <symbol id="ic-info" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 11.2v4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="7.8" r="1.15" fill="currentColor" />
      </symbol>
      <symbol id="ic-arrow-right" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12h15" />
          <path d="M13 6l6 6-6 6" />
        </g>
      </symbol>
      <symbol id="ic-theme" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
      </symbol>
      {/* Feature icons (Aurora gradient) */}
      <symbol id="ic-globe" viewBox="0 0 24 24">
        <path
          fill="url(#ig-aurora)"
          fillRule="evenodd"
          d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM11.2 4.4h1.6v15.2h-1.6zM4.4 11.2h15.2v1.6H4.4z"
        />
      </symbol>
      <symbol id="ic-spark" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 2l1.8 5.7a3.6 3.6 0 0 0 2.5 2.5L22 12l-5.7 1.8a3.6 3.6 0 0 0-2.5 2.5L12 22l-1.8-5.7a3.6 3.6 0 0 0-2.5-2.5L2 12l5.7-1.8a3.6 3.6 0 0 0 2.5-2.5L12 2Z"
        />
      </symbol>
      <symbol id="ic-bolt" viewBox="0 0 24 24">
        <path fill="currentColor" d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z" />
      </symbol>
    </svg>
  );
}
