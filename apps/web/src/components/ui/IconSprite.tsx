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
      <symbol id="ic-arrow-left" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 12H5" />
          <path d="M11 6l-6 6 6 6" />
        </g>
      </symbol>
      <symbol id="ic-mail" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M4 7l8 6 8-6" />
        </g>
      </symbol>
      <symbol id="ic-lock" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </g>
      </symbol>
      <symbol id="ic-user" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </g>
      </symbol>
      <symbol id="ic-eye" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </g>
      </symbol>
      <symbol id="ic-eye-off" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.9 5.7A9.3 9.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.7" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          <path d="M3 3l18 18" />
        </g>
      </symbol>
      <symbol id="ic-alert" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3.5l9 16H3l9-16Z" />
          <path d="M12 10v4" />
        </g>
        <circle cx="12" cy="17" r="1.1" fill="currentColor" />
      </symbol>
      <symbol id="ic-refresh" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 11a8 8 0 0 0-14-4.5L4 8" />
          <path d="M4 4v4h4" />
          <path d="M4 13a8 8 0 0 0 14 4.5L20 16" />
          <path d="M20 20v-4h-4" />
        </g>
      </symbol>
      <symbol id="ic-logout" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
          <path d="M15 8l4 4-4 4" />
          <path d="M19 12H9" />
        </g>
      </symbol>
      <symbol id="ic-search" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M16.8 16.8L21 21" />
        </g>
      </symbol>
      {/* Feature icons (Aurora gradient) */}
      <symbol id="ic-ads" viewBox="0 0 24 24">
        <g fill="url(#ig-aurora)">
          <rect x="3" y="13" width="4.4" height="8" rx="1.4" />
          <rect x="9.8" y="8.5" width="4.4" height="12.5" rx="1.4" />
          <rect x="16.6" y="4" width="4.4" height="17" rx="1.4" />
        </g>
      </symbol>
      <symbol id="ic-briefcase" viewBox="0 0 24 24">
        <g fill="url(#ig-aurora)">
          <rect x="8.5" y="4" width="7" height="4.6" rx="1.7" />
          <path
            fillRule="evenodd"
            d="M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm5.6 5h2.8v3h-2.8z"
          />
        </g>
      </symbol>
      <symbol id="ic-clock" viewBox="0 0 24 24">
        <path
          fill="url(#ig-aurora)"
          fillRule="evenodd"
          d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM11.2 6.8h1.6v6h-1.6zM12.4 11.6h4v1.6h-4z"
        />
      </symbol>
      <symbol id="ic-verify" viewBox="0 0 24 24">
        <path
          fill="url(#ig-aurora)"
          fillRule="evenodd"
          d="M12 2.5l7.5 3.2v5.1c0 4.8-3.2 8-7.5 9.6-4.3-1.6-7.5-4.8-7.5-9.6V5.7L12 2.5Zm-1.1 12.9l4.6-4.6-1.3-1.3-3.3 3.3-1.5-1.5-1.3 1.3 2.8 2.8Z"
        />
      </symbol>
      <symbol id="ic-box" viewBox="0 0 24 24">
        <path
          fill="url(#ig-aurora)"
          fillRule="evenodd"
          d="M12 2l9 5v10l-9 5-9-5V7l9-5ZM11.2 12.3h1.6v8.1h-1.6z"
        />
      </symbol>
      <symbol id="ic-wallet" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1" />
          <rect x="3.5" y="7.5" width="17" height="12" rx="2.4" />
        </g>
        <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" />
      </symbol>
      <symbol id="ic-copy" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2.4" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </g>
      </symbol>
      <symbol id="ic-download" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v11" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 20h16" />
        </g>
      </symbol>
      <symbol id="ic-vault" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
          <circle cx="12" cy="12" r="3.4" />
          <path d="M12 4.5v2M12 17.5v2" />
        </g>
      </symbol>
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
      <symbol id="ic-cart" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
        </g>
        <circle cx="9.5" cy="20" r="1.5" fill="currentColor" />
        <circle cx="18" cy="20" r="1.5" fill="currentColor" />
      </symbol>
      <symbol id="ic-tag" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L3 12.5Z" />
        </g>
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      </symbol>
      <symbol id="ic-trash" viewBox="0 0 24 24">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7h16" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
        </g>
      </symbol>
      <symbol id="ic-plus" viewBox="0 0 24 24">
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </symbol>
      <symbol id="ic-minus" viewBox="0 0 24 24">
        <path
          d="M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </symbol>
    </svg>
  );
}
