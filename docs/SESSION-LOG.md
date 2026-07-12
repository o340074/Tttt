# Журнал сессий (SESSION LOG)

Живой трекер прогресса. **В конце каждой сессии добавляй запись сверху** и обновляй
блок «Текущий статус». Это первый источник правды о том, что сделано и что дальше.

---

## 📍 Текущий статус

- **Фаза:** разработка. E0 (каркас), E1 (аутентификация) и E2 (каталог) готовы и
  проверены end-to-end.
- **Следующий эпик:** **E3 — Кошелёк и пополнение криптой** (см. `docs/16-development-plan.md` §4).
- **Ветка:** актуальная база — `claude/advault-e2-catalog-m0omaf` (E0+E1+E2; в main код
  ещё не влит). Разработку следующих эпиков вести на feature-ветках per эпик от неё.
- **Прогресс по эпикам (из `docs/16`):**

| Эпик | Название | Статус |
|------|----------|--------|
| — | Планирование и документация | ✅ готово |
| E0 | Каркас монорепо + CI | ✅ готово |
| E1 | Аутентификация и аккаунты | ✅ готово |
| E2 | Каталог и продуктовая модель | ✅ готово |
| E3 | Кошелёк и пополнение криптой | ⬜ следующий |
| E4 | Корзина, заказы, оплата с баланса | ⬜ |
| E5 | Выдача из стока (READY_STOCK) | ⬜ |
| E6 | Прогрев: модель и очередь | ⬜ |
| E7 | Инвентарь: прокси и Octo-профили | ⬜ |
| E8 | Полная админка / операторка | ⬜ |
| E9 | Поддержка и уведомления | ⬜ |
| E10 | Гарантии, замены, возвраты | ⬜ |
| E11 | Полировка, безопасность, запуск | ⬜ |

Легенда: ⬜ не начато · 🟡 в работе · ✅ готово

---

## Записи

### Сессия — Каталог и продуктовая модель (эпик E2)
- **Сделано (контракты):** `docs/backend/prisma-schema.md` — enum `FulfillmentType`
  (READY_STOCK/MADE_TO_ORDER) и расширения `ProductVariant` из docs/15
  (`fulfillmentType`, `goal`, `tier`, `bundleSpec`, `etaMinutes`, `warrantyHours`;
  `deliveryType` оставлен как производный снимок: auto ⇔ READY_STOCK).
  `docs/backend/openapi.md` — схема `BundleComponent`, расширенные
  `ProductVariant`/`Product`/`ProductListItem` (categorySlug, fulfillmentTypes,
  stockCount, etaMinutes, bundle, localized `name` вариантов через
  `attributes.name_<locale>`), `Category.productCount`, новые параметры `/products`
  (`category`-slug с потомками, `fulfillment`, `goal`, `inStock`, `locale`). Типы
  отзеркалены в `@advault/types`.
- **API:** `schema.prisma` — Category/CategoryTranslation/Product/ProductTranslation/
  ProductVariant + миграция `20260712100000_catalog` (проверена: `migrate deploy` на
  локальном Postgres 16, дрифта нет). Модуль `catalog/`: `GET /categories`
  (локализованное дерево + productCount), `GET /products` (фильтры
  категория/цена/fulfillment/goal/inStock, поиск по локализованным имени/описанию,
  сортировки price_asc|price_desc|rating|newest, пагинация), `GET /products/:slug`
  (варианты по цене, bundle из bundleSpec с валидацией, ETA, гарантия). Все маршруты
  `@Public()`; локаль: `?locale=` → `Accept-Language` → EN; переводы с фолбэком
  ru→en→любой. Фильтрация в памяти после выборки published-товаров — осознанный
  MVP-компромисс (см. долги).
- **Сидер** `prisma/seed.ts` (`pnpm db:seed`, tsx): 3 демо-юзера, 6 категорий
  (дерево: google-ads → agency), 6 товаров / 9 вариантов с переводами EN/RU, включая
  warm-варианты `goal=google_ads` (7d/14d, комплект ACCOUNT+PROXY+OCTO_PROFILE+GUIDE+
  WARRANTY) и `goal=chrome_extension_dev` (5d). Идемпотентен (upsert по
  email/slug/sku/(id,locale)); запущен дважды — дублей нет.
- **Web:** витрина `/` (hero с aurora, категории, «Популярное», CTA в каталог),
  каталог `/catalog` (сайдбар: категории с каунтами, тип выдачи, цена, «только
  доступные»; поиск с debounce, сортировка, пагинация; состояние в URL), карточка
  `/product/:slug` (выбор варианта, цена, badge наличия/под заказ, ETA
  «~7 дней» с RU-плюралами, состав комплекта, гарантия; Buy заглушен до E4).
  Иконки добавлены в спрайт (ads, briefcase, clock, verify, box, search) — SVG, без
  эмодзи. i18n EN/RU полностью; loading-скелетоны/empty/error/404 везде.
- **Тесты (62):** unit каталога — resolveLocale/pickTranslation, parseBundleSpec,
  дерево категорий и каунты, фильтры/поиск/сортировки/пагинация, локализация
  вариантов с фолбэками, 404 для draft; e2e-smoke по HTTP (supertest + фейки из
  `testing/fakes.ts`, расширены сторами category/product): категории→список с
  фильтром→карточка→404→VALIDATION_ERROR.
- **Проверено вживую:** локальные Postgres 16 + Redis + API + Vite; curl по всем
  эндпоинтам (RU/EN, фильтры, 404) и Chromium/Playwright: витрина→категория→каталог
  (фильтр «под заказ» = 3, поиск «chrome» = 1, пустое состояние)→карточка→смена
  варианта (цена обновляется)→RU-локализация→404. Скриншоты сверены с прототипом.
  lint/format/typecheck/тесты/build зелёные.
- **Решения:** `fulfillmentType` — источник истины модели выдачи, `deliveryType`
  остаётся производным снимком для будущих Order/OrderItem (следуем docs/15 «+поля»);
  имена вариантов — в `attributes.name_en|name_ru` (без отдельной таблицы переводов
  вариантов); `warmingPlanId` появится в E6 вместе с WarmingPlan.
- **Проблемы/долги:** фильтры/поиск/сортировка каталога выполняются в памяти после
  выборки published-товаров — при росте каталога перенести в SQL (полнотекст/индексы);
  ratingAvg пока сидовая денормализация (реальные отзывы позже); throttler in-memory
  (из E1).
- **Дальше:** **E3 — Кошелёк и пополнение криптой** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Аутентификация и аккаунты (эпик E1)
- **Сделано (контракты):** в `docs/backend/openapi.md` добавлен
  `POST /auth/resend-verification` и `security: []` у logout (работает по cookie);
  в `docs/backend/prisma-schema.md` зафиксировано хранение одноразовых auth-токенов
  в Redis (`auth:rt:*`, `auth:verify:*`, `auth:reset:*`); auth-типы отзеркалены в
  `@advault/types` (User, TokenResponse, Register/Login/Reset*, ApiErrorCode).
- **API:** `schema.prisma` — модель User (Role, UserStatus) + миграция
  `20260712000000_init_users`. Модули `auth/` и `users/`: register/login/refresh/
  logout/verify-email/resend-verification/forgot-password/reset-password,
  `GET|PATCH /me`, `POST /me/change-password`. Пароли — **argon2id**; JWT access
  (15 мин) + refresh (30 дней) в HTTP-only cookie (SameSite=Strict,
  Path=/api/v1/auth) с **ротацией jti в Redis**: повтор использованного refresh
  отзывает всю семью сессий; смена/сброс пароля отзывает все сессии. Rate-limit
  `@nestjs/throttler` (login/register 5/мин, forgot/resend 3/5мин + глобальный
  потолок). Глобальные `JwtAuthGuard` (+`@Public()`) и exception-filter единого
  формата `Error` (VALIDATION_ERROR с details.fields, RATE_LIMITED и т.д.).
  Email — заглушка `MailerService` (логирует ссылки verify/reset). Env:
  `JWT_*`, `WEB_URL` (+ проверка не-дефолтных секретов в production).
- **Web:** экраны по `prototype/screens/auth.html` — login/register (segmented
  switch, floating-поля, сила пароля, показ/скрытие), forgot/reset/verify;
  `AuthProvider` (access-токен только в памяти, восстановление сессии по refresh
  cookie при загрузке, single-flight refresh + повтор запроса на 401), guard-роуты
  `RequireAuth`/`RedirectIfAuthed`; ЛК `/account`: профиль, бейдж «подтверждён»/
  баннер с resend, выбор локали (PATCH /me), выход. i18n EN/RU полностью, все
  состояния loading/error; иконки добавлены в SVG-спрайт (mail, lock, eye…).
- **Тесты (37):** unit — argon2id, ротация/отзыв refresh, one-time токены, guard,
  AuthService (дубль email, неверные креды, blocked, replay-детект); e2e-smoke по
  HTTP (supertest + in-memory фейки Prisma/Redis): регистрация→verify→вход→/me→
  refresh-ротация→logout→429. Для DI в vitest добавлен `unplugin-swc`.
- **Проверено вживую:** локальные Postgres 16 + Redis, `prisma migrate deploy`,
  полный цикл через curl (в т.ч. replay refresh → INVALID_TOKEN, 429 c
  RATE_LIMITED) и через Chromium/Playwright: регистрация→verify-экран→ЛК→
  переключение RU→перезагрузка (сессия живёт)→выход→guard-редирект. Скриншоты
  сверены с прототипом. lint/format/typecheck/тесты/build зелёные.
- **Решения:** refresh-сессии и одноразовые токены — только в Redis (в БД лишь
  `emailVerifiedAt`/`passwordHash`); вход разрешён до подтверждения email
  (подтверждение будет требоваться на чувствительных действиях, код
  EMAIL_NOT_VERIFIED зарезервирован); эндпоинт профиля — `/me` (как в контракте).
- **Проблемы/долги:** throttler in-memory (на мультиинстансе понадобится
  Redis-storage); e2e в CI идёт на in-memory фейках (реальные сервисы — локально);
  «Remember me» и OAuth из прототипа не в контракте — не реализованы; 2FA — v2.
- **Дальше:** **E2 — Каталог и продуктовая модель** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Каркас монорепо + CI (эпик E0)
- **Сделано:** pnpm-монорепо: `apps/web` (React 19 + Vite 6 + Tailwind 4),
  `apps/api` (NestJS 11 + Prisma 6 + ioredis + Swagger), `packages/types`
  (общие контракты: `HealthResponse`, `ApiError`, `Money`, пагинация),
  `packages/config` (базовый tsconfig). Root: ESLint 9 (flat) + Prettier +
  строгий tsconfig. `docker-compose.yml` (postgres 17, redis 7, api, web) +
  Dockerfile'ы. CI `.github/workflows/ci.yml`: lint → format → typecheck →
  test → build. Контракт `/health` добавлен в `docs/backend/openapi.md`
  (тег System + схема HealthResponse) до кода.
- **API:** префикс `/api/v1`, ValidationPipe, конфиг через `@nestjs/config` +
  zod-валидация env, `GET /api/v1/health` (200 ok / 503 degraded, статусы db и
  redis), Swagger UI на `/api/docs`. API поднимается и при недоступных
  зависимостях (health честно показывает `down`). Prisma-схема пока без моделей
  (модели приходят со своими эпиками, контракт — `docs/backend/prisma-schema.md`).
- **Web:** дизайн-токены Aurora из `docs/design/01` в Tailwind `@theme`
  (dark default + light override), базовый лейаут (Header/Footer), React Router,
  react-i18next (EN default + RU, детектор + localStorage), SVG-спрайт иконок из
  прототипа (`<Icon name="…"/>`, без эмодзи), TanStack Query, карточка статуса
  API на главной (loading/error/data). Vite-прокси `/api` → API.
- **Решения:** React 19 / Tailwind 4 / ESLint 9 flat (актуальные мажоры вместо
  версий из docs/03 — контракты и подход не меняются); vitest как единый
  тест-раннер (web + api); правило `consistent-type-imports` отключено для api
  (конфликт с DI/emitDecoratorMetadata).
- **Проверено:** lint/format/typecheck/тесты (5) /build зелёные; postgres+redis
  в docker + api локально: `/health` = 200 ok, при остановке redis — 503
  degraded, после старта — снова 200; Swagger 200; фронт через прокси рендерит
  статус (скриншот-проверка Chromium), переключение EN→RU работает.
- **Проблемы/долги:** CI прогонится при первом push (локально все шаги зелёные);
  прод-сборка web (nginx-статика) — ближе к деплою, сейчас dev-образ.
- **Дальше:** **E1 — Аутентификация и аккаунты** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Консолидация веток
- **Проблема:** новая сессия не видела проект — вся работа была в
  `claude/digital-marketplace-planning-uegdn8`, а default-ветка репо —
  `claude/online-store-7txsf2` (там 3 старых дока из другой сессии).
- **Сделано:** влил наш проект в default-ветку (`--allow-unrelated-histories`, без
  удаления старых доков). Обе ветки указывают на один коммит со всем проектом.
- **Итог:** любая новая сессия (на default) сразу видит проект и `CLAUDE.md`.
- **Дальше:** начинать **E0** по промту из `docs/NEXT-SESSION-PROMPT.md`.

### Сессия — Онбординг и непрерывность
- **Сделано:** созданы `CLAUDE.md` (авто-ориентир), `docs/SESSION-LOG.md` (этот файл),
  `docs/NEXT-SESSION-PROMPT.md` (шаблон стартового промта + готовый промт под E0).
- **Итог:** любая новая сессия теперь быстро ориентируется и знает, что делать.
- **Дальше:** начать **E0** по промту из `docs/NEXT-SESSION-PROMPT.md`.

### Сессия — Модель прогрева и план разработки
- **Сделано:** `docs/11–16` (типы товаров/выдача, пайплайн прогрева, полная админка,
  жизненный цикл заказа, расширения модели данных, детальный план разработки).
  Дополнен `docs/09` (риски прогрева/Octo/прокси и границы платформы).
- **Итог:** зафиксирована модель «готовые + прогрев под заказ», операторка, инвентарь
  прокси/Octo, комплект выдачи; составлен план из эпиков E0–E11 и вех M0–M5.

### Сессия — Многоагентный воркфлов: полные экраны + бэкенд-контракты
- **Сделано:** прототипы `prototype/screens/{checkout,auth,admin,account}.html` в
  фирменном стиле; черновые контракты `docs/backend/{prisma-schema,openapi}.md`.
  Исправлен баг лейаута админки; убран паразитный тег в openapi.
- **Итог:** есть визуальные эталоны ключевых экранов и стартовые контракты БД/API.

### Сессия — Дизайн-система и живой прототип
- **Сделано:** `docs/design/00–08` (бренд AdVault, токены, анимации/flash, компоненты,
  экраны, сценарии действий, a11y/адаптив, i18n, иконки). Живой прототип
  `prototype/index.html`; кастомная SVG-иконка-система (замена эмодзи).
- **Итог:** зафиксирован premium-dark стиль и поведение UI как эталон.

### Сессия — Базовое планирование
- **Сделано:** `docs/00–10` (обзор, видение, фичи, стек, архитектура, модель данных,
  дизайн-обзор, API, оплата/выдача, безопасность, краткая дорожная карта).
- **Итог:** зафиксированы ключевые решения (стек, оплата крипта+баланс, гибридная
  выдача, i18n EN+RU).

---

## Как добавлять запись (шаблон)

```
### Сессия — <кратко о теме> (эпик E<n>)
- **Сделано:** <что реализовано/создано, ключевые файлы>
- **Решения:** <важные технические решения, если были>
- **Проблемы/долги:** <что не доделано, известные issue, TODO>
- **Дальше:** <следующий эпик/задача>
```
