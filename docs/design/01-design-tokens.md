# Design 01 — Дизайн-токены

Единый источник значений для UI. В проде выносится в CSS-переменные и/или
Tailwind theme. Тёмная тема — основная.

## Цвета — тёмная тема (default)

```css
:root {
  /* Backgrounds */
  --color-void:        #080A1A; /* фон приложения */
  --color-bg-1:        #0C0F24; /* секции */
  --color-surface:     #12152E; /* карточки, панели */
  --color-surface-2:   #191D3C; /* приподнятые поверхности */
  --color-surface-3:   #22274F; /* hover-поверхности */
  --color-overlay:     rgba(8,10,26,0.72); /* подложка модалок */

  /* Brand accents */
  --color-volt:        #5B5BF6; /* primary */
  --color-volt-600:    #4B49E8;
  --color-volt-400:    #7C7DFA;
  --color-pulse:       #E24BF0; /* accent / flash */
  --color-beam:        #22D3EE; /* accent / neon */

  /* Semantic */
  --color-success:     #2BD9A6;
  --color-warning:     #F5B740;
  --color-danger:      #FF4D6D;
  --color-info:        #4CB2FF;

  /* Text */
  --color-text-hi:     #EEF1FF; /* заголовки, основной */
  --color-text:        #C7CCEC; /* обычный текст */
  --color-text-lo:     #9BA1C9; /* вторичный */
  --color-text-dim:    #6B7099; /* подписи, placeholder */

  /* Borders / dividers */
  --color-border:      rgba(155,161,201,0.14);
  --color-border-2:    rgba(155,161,201,0.24);
  --color-border-glow: rgba(91,91,246,0.55);

  /* Gradients */
  --grad-aurora: linear-gradient(135deg,#5B5BF6 0%,#9B4DF0 50%,#E24BF0 100%);
  --grad-beam:   linear-gradient(135deg,#22D3EE 0%,#5B5BF6 100%);
  --grad-sheen:  linear-gradient(120deg,transparent 30%,rgba(255,255,255,0.14) 50%,transparent 70%);
  --grad-surface: linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0));
}
```

## Цвета — светлая тема (вторичная)

```css
:root[data-theme="light"] {
  --color-void:      #F5F6FB;
  --color-surface:   #FFFFFF;
  --color-surface-2: #F0F2FA;
  --color-text-hi:   #0F1230;
  --color-text:      #303463;
  --color-text-lo:   #5A6088;
  --color-border:    rgba(15,18,48,0.10);
  /* акценты Volt/Pulse/Beam те же, glow приглушён */
}
```

## Тени и glow (elevation)

```css
--shadow-1: 0 1px 2px rgba(0,0,0,0.4);
--shadow-2: 0 4px 16px rgba(0,0,0,0.45);
--shadow-3: 0 12px 40px rgba(0,0,0,0.55);
--shadow-modal: 0 24px 80px rgba(0,0,0,0.6);

/* Цветные glow (flash-эстетика) */
--glow-volt:  0 0 0 1px rgba(91,91,246,0.35), 0 8px 30px rgba(91,91,246,0.45);
--glow-pulse: 0 0 24px rgba(226,75,240,0.55);
--glow-beam:  0 0 24px rgba(34,211,238,0.5);
--glow-success: 0 0 22px rgba(43,217,166,0.5);
--glow-danger:  0 0 22px rgba(255,77,109,0.5);
```

## Радиусы

```css
--radius-xs: 6px;
--radius-sm: 8px;
--radius-md: 12px;   /* кнопки, поля */
--radius-lg: 16px;   /* карточки */
--radius-xl: 24px;   /* модалки, крупные блоки */
--radius-pill: 999px;
```

## Спейсинг (4px-сетка)

```
--space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 20px   --space-6: 24px
--space-8: 32px   --space-10: 40px  --space-12: 48px
--space-16: 64px  --space-20: 80px  --space-24: 96px
```

## Типографика

```css
--font-display: "Space Grotesk","Sora",system-ui,sans-serif;
--font-body:    "Inter",system-ui,-apple-system,sans-serif;
--font-mono:    "JetBrains Mono","IBM Plex Mono",monospace;

/* Размеры (rem, 1rem=16px) */
--fs-display: 3.5rem;   /* 56 — hero */
--fs-h1: 2.5rem;        /* 40 */
--fs-h2: 2rem;          /* 32 */
--fs-h3: 1.5rem;        /* 24 */
--fs-h4: 1.25rem;       /* 20 */
--fs-lg: 1.125rem;      /* 18 */
--fs-base: 1rem;        /* 16 */
--fs-sm: 0.875rem;      /* 14 */
--fs-xs: 0.75rem;       /* 12 */

/* Веса */ 400 / 500 / 600 / 700 / 800
/* Line-height */ heading 1.15, body 1.55
/* Letter-spacing */ display -0.02em, caps 0.08em
```

## Motion-токены (детали в 02-animation-system)

```css
--dur-instant: 80ms;
--dur-fast: 140ms;
--dur-base: 220ms;
--dur-slow: 360ms;
--dur-slower: 600ms;

--ease-standard: cubic-bezier(0.2, 0, 0, 1);      /* material-подобный */
--ease-emphasized: cubic-bezier(0.2, 0, 0, 1.2);  /* с лёгким овершутом */
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* пружина */
```

## Z-index шкала

```
--z-base: 0
--z-sticky: 100        /* прилипающие шапки */
--z-dropdown: 1000
--z-tooltip: 1100
--z-toast: 1200
--z-modal-backdrop: 1300
--z-modal: 1400
--z-flash: 1500        /* глобальные flash-оверлеи */
```

## Брейкпоинты

```
xs: 0      (mobile-first база)
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

## Контейнеры и сетка

- Макс. ширина контента: 1280px (широкие блоки — 1440px).
- Каталог: сетка карточек `repeat(auto-fill, minmax(260px, 1fr))`, gap 24px.
- Гаттеры: 16px (mobile) → 24px (desktop).

## Иконки

- Библиотека: Lucide (основная) + Material Symbols (для точного «Google»-набора).
- Толщина линии: 1.75px, размеры 16/20/24px.
- Активные иконки могут получать градиентную заливку (Aurora) или glow.

## Правила использования токенов

1. Никаких «магических» hex прямо в компонентах — только переменные.
2. Glow применяется точечно (CTA, статусы, фокус) — не «залить всё».
3. Signature gradient — только на ключевых акцентах (лого, главный CTA, активные
   индикаторы), чтобы сохранить премиальность.
4. Светлая тема наследует те же токены с переопределением в `[data-theme="light"]`.
