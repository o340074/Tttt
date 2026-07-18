# AdVault — контекст проекта (читать ПЕРВЫМ в каждой сессии)

Этот файл авто-загружается в каждой сессии. Он даёт быструю ориентацию. Детали — в
`docs/`. **Правило: сначала прочитать этот файл → `docs/SESSION-LOG.md` (что сделано и
что дальше) → спецификацию текущего эпика → работать.**

## Что мы строим

**AdVault** — премиальный маркетплейс цифровых товаров: рекламные аккаунты Google Ads
и другие цифровые товары. Продаём двумя способами:
- **Готовые из стока** (`READY_STOCK`) — мгновенная авто-выдача.
- **Под заказ с прогревом** (`MADE_TO_ORDER`) — оператор готовит/прогревает аккаунт под
  цель (Google Ads, аккаунты разработчика для расширений Chrome и т.д.), выдаёт
  комплектом (аккаунт + опц. прокси + опц. Octo-профиль + гайд). Покупатель платит
  сразу, видит ETA и статус.

Стиль — premium-dark «Aurora», смелый, с flash/glow, но профессиональный.

## Текущий статус

- ✅ **Фаза планирования завершена** (продукт, дизайн, архитектура, модель прогрева,
  админка, план разработки, прототипы, бэкенд-контракты).
- ✅ **E0 — каркас монорепо готов**: `apps/web` (React+Vite+Tailwind, i18n EN/RU,
  токены Aurora), `apps/api` (NestJS, /health, Prisma+Redis, Swagger),
  `packages/{types,config}`, docker-compose, CI.
- ✅ **E1 — аутентификация и аккаунты готовы**: JWT access+refresh (ротация jti в
  Redis, HTTP-only cookie), argon2id, verify/reset email (mailer-заглушка),
  rate-limit, единый формат ошибок `Error`, экраны auth + guard-роуты + ЛК
  (`/account`), `GET|PATCH /me`.
- ✅ **E2 — каталог и продуктовая модель готовы**: Prisma-модели Category/Product/
  ProductVariant + Translation (fulfillmentType READY_STOCK|MADE_TO_ORDER, goal,
  tier, bundleSpec, etaMinutes, warrantyHours), публичные `GET /categories`,
  `GET /products` (фильтры/поиск/сортировка/пагинация), `GET /products/:slug`;
  локализация EN/RU по `?locale`/Accept-Language; витрина, каталог с фильтрами,
  карточка товара (вариант, тип выдачи, ETA, комплект); идемпотентный сидер
  `prisma/seed.ts`.
- ✅ **E3 — кошелёк и пополнение криптой готовы**: Prisma LedgerEntry/TopUp/
  IdempotencyKey, ledger двойной записи (credit + balanceAfter, `User.balance` — кэш),
  `GET /wallet`, `GET /wallet/transactions`, `POST /wallet/topups` (Idempotency-Key),
  `GET /wallet/topups/:id`, вебхук `POST /webhooks/payments/:provider` (HMAC по raw
  body, идемпотентный по externalId, зачисление в одной транзакции), эквайринг за
  интерфейсом `PaymentProvider` (sandbox-реализация), expiry просроченных pending;
  экран `/wallet` (QR/адрес/таймер, поллинг, flash, история).
- ✅ **E4 — корзина, заказы, оплата с баланса готовы**: Prisma Cart/CartItem/Order/
  OrderItem (снапшоты sku/имени/цены)/PromoCode; серверная корзина (`GET /cart`,
  `POST /cart/items`, `PATCH|DELETE /cart/items/:id`), `GET /promo-codes/:code`
  (превью скидки); `POST /orders/checkout` (Idempotency-Key; одна транзакция БД:
  атомарный декремент stockCount + usedCount промокода + `LedgerService.debit`
  c INSUFFICIENT_BALANCE + Order(status=paid) + очистка корзины), `GET /orders`,
  `GET /orders/:id`; экран `/checkout` (степпер, промокод, оплата с баланса, CTA
  «Пополнить» при нехватке, flash), кнопка Buy now, заказы в ЛК (`/orders`).
- ✅ **E5 — выдача из стока READY_STOCK готова**: Prisma StockItem (payloadHash-дедуп)/
  Delivery/AuditLog; шифрование payload AES-256-GCM (версионируемый ключ env
  `PAYLOAD_ENCRYPTION_KEY`); двухфазный резерв (available→reserved+reservedUntil+Redis
  TTL, sweep→sold) c авто-выдачей в транзакции checkout (Delivery type=auto +
  deliveryStatus=delivered, статус заказа — агрегат по docs/14, stockCount от пула);
  `GET /orders/:id/items/:itemId/delivery` (расшифровка только владельцу + AuditLog);
  импорт стока `POST /admin/products/:id/variants/:variantId/stock/import` (RBAC admin,
  JSON/text-plain, отчёт added/skipped); Vault-блок в `/orders/:id`
  (маска→показать/копировать/скачать .txt).
- ✅ **E6 — прогрев MADE_TO_ORDER готов**: WarmingPlan/StageTemplate/Job/Task/
  AccountAsset/Bundle/BundleComponent; при checkout warm-позиции — `WarmingJob(queued)`
  + этапы + ETA в транзакции оплаты (`ProductVariant.warmingPlanId`); переходы
  queued→assigned→in_progress→qc→ready→delivered (+on_hold с пересчётом ETA,
  fail→reassign/refund); при delivered — сборка Bundle + `Delivery(type=warm)` в Vault;
  RBAC-маршруты `/admin/warming/*`; экран `/orders/:id` со статусом warm и «этап k из N».
- ✅ **E7 — инвентарь прокси/Octo готов**: Prisma `ProxyItem`/`OctoProfile` (шифрование
  `credentials`/`exportRef` тем же AES-256-GCM key-ring); `/admin/inventory/*` — CRUD,
  импорт прокси (JSON/text-plain, дедуп по хэшу), bind/unbind к WarmingJob **exactly-once**
  (available→assigned); реальные `BundleComponent` PROXY/OCTO_PROFILE с `refId` в комплекте
  Vault (вместо заглушек E6); `GET /admin/warming/jobs/:id/inventory`; RBAC admin/support;
  сидер прокси/Octo. Ресурс выделенный (после выдачи — покупателя). Актуальная база кода —
  ветка `claude/advault-e7-proxy-octo-inventory-vsnw75`.
- ✅ **E8 — полная админка/операторка готова**: RBAC operator/manager/admin; Orders +
  Warming Kanban/operator-workspace + Inventory-UI + Stock read (ч.1); Finance (refund+
  ручная выдача+сверка) + Users + Promo (ч.2); Catalog & Bundles CRUD + Warming plans
  CRUD с версионированием (ч.3); **Dashboard/Reports + Tickets (Ticket/TicketMessage) +
  Staff&roles UI + Settings (key-value)** (ч.4). Всё под RBAC/аудитом, проверено вживую.
- ✅ **E9…E11 готовы** (поддержка/уведомления · гарантии/замены/возвраты · полировка/
  безопасность/запуск). **ВЕСЬ MVP (E0…E11) готов по коду — веха M5.** Отзывы/рейтинг,
  security-заголовки+CSP (helmet), BullMQ-уведомления, warm-rework↔claim (`reworking`),
  юр-страницы, E2E Playwright; чек-лист запуска `docs/09` закрыт; прод-ранбук `docs/17`.
- ✅ **M5 Release-операции (Трек A)** готовы; **долги Трека B ЗАКРЫТЫ**: аллокация
  discount при частичном возврате (E10), grace-период гарантийного окна (E10, env
  `WARRANTY_GRACE_MINUTES`), inline-edit промо (E8), WebSocket realtime-бейдж уведомлений
  (E9, `/api/ws/notifications` в том же Nest-процессе, деградация к поллингу).
- 🔜 **Следующий шаг** — эксплуатационные подтверждения M5 (`docs/17`) и/или пост-MVP E12+
  (см. `docs/16` §E12, `docs/NEXT-SESSION-PROMPT.md`); realtime-остаток — Redis pub/sub
  fan-out при мультиинстансе.
- Живой статус и «что дальше» — всегда в `docs/SESSION-LOG.md`.

## Где что лежит

```
CLAUDE.md                     ← этот файл (ориентир)
README.md                     ← индекс всей документации
apps/web · apps/api           ← код: фронт (React+Vite+Tailwind) и бэк (NestJS)
packages/{types,config}       ← общие контракты/типы и базовые tsconfig
docker-compose.yml            ← dev-окружение (postgres, redis, api, web)
.github/workflows/ci.yml      ← CI: lint + typecheck + test + build
docs/00..10                   ← продукт: обзор, видение, фичи, стек, архитектура,
                                 модель данных, дизайн-обзор, API, оплата/выдача,
                                 безопасность, краткая дорожная карта
docs/11..16                   ← расширенная модель + план:
   11 типы товаров/выдача · 12 пайплайн прогрева · 13 полная админка ·
   14 жизненный цикл заказа · 15 расширения модели данных ·
   16 ДЕТАЛЬНЫЙ ПЛАН РАЗРАБОТКИ (эпики E0–E11, вехи M0–M5) ← основной план
docs/design/00..08            ← бренд, токены, анимации, компоненты, экраны,
                                 сценарии действий, a11y, i18n, иконки
docs/backend/                 ← prisma-schema.md, openapi.md (черновые контракты)
docs/SESSION-LOG.md           ← журнал сессий: что сделано, что дальше (ОБНОВЛЯТЬ)
docs/NEXT-SESSION-PROMPT.md   ← шаблон стартового промта для сессий
prototype/index.html          ← живой прототип (Storefront/Catalog/Product/Wallet/…)
prototype/screens/*.html      ← checkout, auth, admin, account (полные экраны)
```

### ⚠️ Legacy-файлы (не путать)
`docs/DESIGN_SYSTEM.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/FEATURES_AND_HIGHLIGHTS.md` —
это ранний черновик из другой сессии, оставлен для истории. **Актуальные источники
правды — наши доки `docs/00–16`, `docs/design/*`, `docs/backend/*`.** При расхождении
верь нашим, а не legacy-файлам.

### Ветки
Проект консолидирован: и default-ветка репозитория (`claude/online-store-7txsf2`), и
`claude/digital-marketplace-planning-uegdn8` указывают на один и тот же коммит со всем
проектом. Новая сессия по умолчанию берёт default — там всё есть.

## Ключевые решения (зафиксированы)

- **Стек:** монорепо TypeScript. Фронт React+Vite+Tailwind, бэк NestJS,
  PostgreSQL+Prisma, Redis, BullMQ. Оплата: крипто-эквайринг + внутренний баланс
  (ledger/двойная запись). i18n: EN по умолчанию + RU.
- **Выдача:** авто из стока + ручная/прогрев под заказ (операторы, трекинг).
- **Провижининг Octo/прокси:** вручную оператором, платформа фиксирует связки.

## Как работаем (конвенции)

- **Контракты вперёд:** меняешь поведение — сначала обнови/зафиксируй OpenAPI и
  Prisma (`docs/backend/`), затем код.
- **Вертикальные срезы:** фича проходит фронт→API→БД→тесты, а не «сначала весь бэк».
- **Дизайн-система:** только токены/компоненты/иконки из `docs/design/*` и прототипа.
  Иконки — SVG-спрайт (solid Aurora + line), **никаких эмодзи в UI**.
- **i18n:** все строки через ключи (EN/RU), без хардкода.
- **Ветки/коммиты:** работай на назначенной сессии feature-ветке (по эпику, напр.
  `feat/E0-scaffold`); понятные коммиты; в конце — commit + push.
- **Definition of Done** (см. `docs/16` §8): lint/typecheck/тесты зелёные; состояния
  UI (loading/empty/error) + a11y-минимум; тексты EN/RU; опасные действия —
  подтверждение + аудит; обновлены контракты/доки; фича продемонстрирована.

## Безопасность и границы (обязательно)

- **Деньги:** только `decimal`, транзакции БД, ledger, идемпотентность (Idempotency-Key,
  уникальные externalId), резерв стока. Никаких `float` для сумм.
- **Секреты** (аккаунты/прокси/Octo-экспорт): шифрование на уровне приложения
  (AES-256-GCM, KMS-ключ), доступ по праву + аудит. Не логировать секреты.
- **RBAC** на всех админ/операторских маршрутах; danger-confirm на необратимом.
- **Граница платформы:** реализуем бизнес-логистику (каталог, заказы, оплата, очереди
  задач, инвентарь, трекинг этапов, сборка/выдача комплекта, аудит). **НЕ** реализуем
  автоматизацию прогрева, действий внутри аккаунтов или обход антифрод-детекта — это
  ручная работа операторов вне кода. См. `docs/09`.

## Правила взаимодействия

- **Спрашивай в режиме asking** (AskUserQuestion), когда есть реальная развилка,
  влияющая на архитектуру/поведение, или неоднозначность в требованиях — не угадывай.
- Для внешних/необратимых действий — подтверждай.
- Отчитывайся честно: если тесты падают/шаг пропущен — так и говори.

## В конце каждой сессии (ритуал)

1. Обнови `docs/SESSION-LOG.md`: что сделано, статус эпика, что следующее.
2. Обнови статусы в `docs/16` / `docs/10` при завершении эпика.
3. Обнови контракты (`docs/backend/`) при изменении API/схемы.
4. `commit` + `push` в feature-ветку.
5. При необходимости — подготовь/обнови промт следующей сессии
   (`docs/NEXT-SESSION-PROMPT.md`).
