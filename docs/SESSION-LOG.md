# Журнал сессий (SESSION LOG)

Живой трекер прогресса. **В конце каждой сессии добавляй запись сверху** и обновляй
блок «Текущий статус». Это первый источник правды о том, что сделано и что дальше.

---

## 📍 Текущий статус

- **Фаза:** разработка. E0…E10 готовы. **E11 (Полировка, безопасность, запуск) —
  ЗАВЕРШЕНА** (веха **M5 — Release** достигнута по коду): security-заголовки (helmet
  strict CSP/HSTS/frameguard/noSniff/referrer, Swagger только вне прода), финальный
  rate-limit; mailer не логирует токены в проде; доставка уведомлений вынесена в
  BullMQ-воркер с ретраями (долг E9 закрыт, деградирует до inline без очереди/при сбое);
  **отзывы/рейтинг** (модель Review + миграция; 1 отзыв на выданную позицию владельца,
  1..5+title/body, маска автора, денормализация `Product.ratingAvg`; публичные
  `GET /products/:slug/reviews`, `POST /reviews`; админ-модерация
  `GET|PATCH /admin/reviews` с пересчётом рейтинга+аудитом; web: рейтинг+блок отзывов на
  карточке, контрол на позиции заказа, админ-очередь); **связывание warm-rework↔claim**
  (долг E10: новый статус `reworking` — MADE_TO_ORDER замена терминальна `replaced`
  только на warm-передоставке, +аудит+уведомление); юр-страницы `/legal/*` (ToS/Privacy/
  Refund, EN/RU, дисклеймер); footer-ссылки; E2E Playwright (сторфронт+auth против живого
  стека). Чек-лист запуска `docs/09` закрыт (кроме бизнес-подтверждения провайдера/хостинга);
  security-review без критичных находок. Прод-ранбук — `docs/17`.
- **Фаза (ранее):** E0…E9 готовы. **E10 (Гарантии, замены, возвраты) — ЗАВЕРШЕНА**:
  клиентская заявка `WarrantyClaim` (`/warranty-claims*` scoped на владельца) на замену/
  возврат по доставленной позиции строго в окне `warrantyHours` от выдачи; статусы
  requested→approved/rejected→replaced/refunded с аудитом каждого перехода. Замена
  READY_STOCK — новый StockItem из пула (резерв→продажа, Delivery type=replacement);
  замена MADE_TO_ORDER — rework warm-задачи. Возврат — кредит в ledger (Decimal,
  идемпотентно). Админ-очередь `/admin/warranty-claims*`: approve/reject (WARRANTY_STAFF),
  fulfill (FINANCE_STAFF, danger-confirm, Idempotency-Key). in-app+email по
  warranty.replaced/refunded/rejected. Проверено вживую (curl полного цикла на реальном
  Postgres+Redis: replace+refund, scoping 404, RBAC 403, ledger/аудит/уведомления в БД) и
  e2e. Долг E8: inline-edit промо.
- **M5 Release-операции (Трек A) — ГОТОВО по коду/скриптам** (см. запись ниже):
  наблюдаемость (`/admin/ops/metrics` JSON+Prometheus: per-user сверка баланса, глубина
  BullMQ-очереди, зависшие top-up) + Sentry-репортер 5xx (dependency-free); прод-деплой
  инфра (`docker-compose.prod.yml`, `apps/web/Dockerfile.prod`+Nginx с CSP/HSTS,
  `.env.example`, `scripts/deploy.sh`); бэкапы+тест-восстановление (`scripts/backup.sh`,
  `scripts/restore-test.sh`); нагрузочные k6 (`load/*`). Проверено вживую на реальном
  Postgres+Redis.
- **Долги Трека B — ЗАКРЫТЫ** (см. запись ниже): аллокация discount при частичном
  возврате (E10), grace-период гарантийного окна (E10), inline-edit промо (E8),
  WebSocket-realtime бейдж уведомлений (E9). Все четыре проверены вживую на реальном
  Postgres+Redis.
- **Трек A: fan-out realtime-бейджа через Redis pub/sub — ГОТОВО** (см. верхнюю запись):
  каждая реплика API публикует изменения непрочитанного в канал
  `advault:notifications:unread` и подписана на него — WS-пуш доходит до сокетов на
  **любой** реплике; деградация к локальной доставке при недоступности Redis (тесты /
  фейк) + поллинг-fallback клиента. Проверено вживую на реальном Redis (межинстансная
  доставка B→A; на источнике — ровно одна доставка, без дубля). Схема БД/публичный API
  не менялись. lint/typecheck/**358 тестов**/build зелёные.
- **Следующий шаг:** бизнес-подтверждение платёжного провайдера/хостинга; финальная
  юр-вычитка ToS/Privacy/Refund; прогон k6 в среде с установленным k6. Далее — пост-MVP
  (E12+). Остаточный тех-долг realtime закрыт.
- **Ветка:** `claude/advault-track-selection-td364b` (Трек A fan-out; отходит от
  `…m5-release-debts-0alyde` = E0…E11 + M5 release-ops + долги Трека B). В main код ещё
  не влит.
- **Прогресс по эпикам (из `docs/16`):**

| Эпик | Название | Статус |
|------|----------|--------|
| — | Планирование и документация | ✅ готово |
| E0 | Каркас монорепо + CI | ✅ готово |
| E1 | Аутентификация и аккаунты | ✅ готово |
| E2 | Каталог и продуктовая модель | ✅ готово |
| E3 | Кошелёк и пополнение криптой | ✅ готово |
| E4 | Корзина, заказы, оплата с баланса | ✅ готово |
| E5 | Выдача из стока (READY_STOCK) | ✅ готово |
| E6 | Прогрев: модель и очередь | ✅ готово |
| E7 | Инвентарь: прокси и Octo-профили | ✅ готово |
| E8 | Полная админка / операторка | ✅ готово (Orders+Warming+Inventory · Finance/Users/Promo · Catalog/Bundles+Warming-plans · Dashboard/Reports+Tickets+Staff+Settings) |
| E9 | Поддержка и уведомления | ✅ готово (клиентский портал тикетов · in-app Notification+бейдж · email+in-app по order.paid/warming.ready/ticket.reply на per-locale шаблонах Settings) |
| E10 | Гарантии, замены, возвраты | ✅ готово (WarrantyClaim · клиентская заявка в окне warrantyHours · замена стока/rework warm · возврат через ledger · админ-очередь approve/reject/fulfill · RBAC+аудит+уведомления) |
| E11 | Полировка, безопасность, запуск | ✅ готово (security-заголовки+CSP · BullMQ-уведомления · отзывы/рейтинг · warm-rework↔claim · юр-страницы · E2E Playwright · чек-лист запуска docs/09 · ранбук docs/17) |

Легенда: ⬜ не начато · 🟡 в работе · ✅ готово

---

## Записи

### Сессия — Трек A: fan-out realtime-бейджа через Redis pub/sub — ГОТОВО
- **Развилка (asking):** выбран **Трек A** (остаточный тех-долг realtime).
- **Проблема:** WS-сокет бейджа живёт только на той реплике API, что приняла его upgrade.
  При нескольких репликах доставка/прочтение уведомления, обработанные на другой реплике,
  раньше не доходили до сокета — только поллинг-fallback (задержка бейджа). Это был
  единственный открытый тех-долг realtime (docs/17 §7).
- **Решение (`notifications.realtime.ts`):** каждая реплика **публикует** любое изменение
  непрочитанного в Redis-канал `advault:notifications:unread` (payload `{ userId, unread }`)
  и **подписана** на него; обработчик подписки пушит апдейт локальным сокетам этой реплики.
  Публикатор получает и своё сообщение через собственную подписку — путь доставки единый,
  локального дубля нет. Счётчик считается один раз источником и рассылается дословно →
  все реплики согласованы.
  - **Соединения:** PUBLISH — по общему клиенту `RedisService`; для SUBSCRIBE — отдельный
    `client.duplicate()` (подписанное соединение не шлёт других команд). Подписка
    восстанавливается на каждом `ready` (переподключение самолечится). `onModuleDestroy`
    закрывает только свой дубль-сабскрайбер (общий клиент закрывает `RedisService`).
  - **Инициализация/деградация:** fan-out включается в `onModuleInit`, только если инжектнут
    реальный `RedisService` (клиент умеет `duplicate()`); in-memory фейк в тестах его не
    умеет → unit/e2e остаются на локальной доставке. При сбое PUBLISH — откат к локальной
    доставке (этот инстанс) + поллинг клиента для остальных. Регрессии нет: без Redis —
    прежний одноинстансный режим.
  - **DI:** `RedisService` инжектится как `@Optional()` (3-й параметр конструктора) — прежняя
    2-аргументная сигнатура в юнит-спеке сохранена; `RedisModule` глобальный, доп. импортов
    не нужно.
- **Тесты (+5, итого 358):** `notifications.realtime.spec` — межинстансный fan-out на
  фейковой Redis-шине (B→A), отсутствие локального дубля на источнике, fallback при сбое
  PUBLISH, подписка дубля на канал, локальный режим без Redis.
- **Проверено вживую** на реальном `redis-server`: две инстанции сервиса на одном Redis;
  broadcast на реплике B дошёл до сокета на реплике A (`unread: 42`), на источнике — ровно
  одна доставка (`unread: 7`), сид корректен.
- **Контракты/схема:** публичный REST-API и Prisma не менялись (WS — не REST; канал —
  внутренняя инфраструктура, новых env нет, `REDIS_URL` уже есть). Обновлены **docs/17 §7**
  (fan-out ГОТОВО, детали соединений/деградации) и **docs/16** (долг E11 → realtime+fan-out ✅).
- **Зелёные:** lint · typecheck · 358 тестов · build.

### Сессия — Долги Трека B (E8/E9/E10) — ЗАКРЫТЫ
- **Развилки (asking):** grace-период по умолчанию — выбрано **60 минут**; WebSocket —
  **интеграция в существующий Nest-процесс** (native `ws`, без отдельного сервера).
- **1) Аллокация discount при частичном возврате (E10):** новый чистый модуль
  `warranty/refund.logic.ts` — `allocateDiscount()` распределяет промо-скидку по строкам
  заказа пропорционально их subtotal методом наибольших остатков (Hamilton) в целых
  центах (BigInt): сумма аллокаций **ровно** равна скидке, доля строки детерминирована и
  стабильна независимо от порядка возвратов; `refundAmountForLine()` = subtotal − доля.
  Вплетено в `AdminWarrantyService`: refund кредитует **нетто** (не gross), `result()`/
  detail `amount` показывают ту же нетто-сумму; `CLAIM_INCLUDE` дотянут `order.discount` +
  сиблинг-строки. Заказ без скидки → поведение прежнее. Тесты: `refund.logic.spec` (9) +
  e2e «refund net of promo discount share». **Контракт:** `AdminWarrantyClaimDetail.amount`
  и `WarrantyClaimResult.refundedAmount` переописаны в openapi. Схема БД не менялась
  (миграция не нужна — читаются существующие колонки).
- **2) Grace-период гарантийного окна (E10):** env `WARRANTY_GRACE_MINUTES` (дефолт 60).
  `computeWindow()`/`isClaimEligible()` приняли `graceMinutes` — влияет **только** на
  `withinWindow` (приём заявки), отображаемый `expiresAt` — истинный, не продлевается.
  Проброшено в `WarrantyService` (приём заявки) и `OrdersService.buildWarrantyInfo`
  (`eligible` в карточке заказа) через `ConfigService`. Тесты: +4 в `warranty.logic.spec`.
- **3) Inline-edit промо (E8):** бэкенд `PATCH /admin/promo-codes/:id` (RBAC
  `FINANCE_STAFF`, аудит) уже был — добавлен inline-редактор строки в `AdminPromoPage`
  (тип/значение/лимит/срок; код неизменяем как ключ погашения), `useUpdatePromo` уже был;
  новая иконка `pencil` в SVG-спрайте; отправляются только изменённые поля; состояния
  загрузки/ошибки, i18n (переиспользованы существующие ключи EN/RU). Danger — только на
  удалении (window.confirm), правка обратима.
- **4) WebSocket realtime-бейдж (E9):** зависимость `ws`. `NotificationsRealtimeService`
  поднимает `ws`-сервер на **том же** HTTP-сервере Nest (`/api/ws/notifications`,
  attach из `main.ts`); аутентификация access-JWT в query `?token=` (401 на upgrade при
  невалидном), реестр сокетов per-user. `NotificationsService.deliver`/`markRead`/
  `markAllRead` пушат свежий unread-count (`@Optional` — в тестах no-op). Фронт:
  `useUnreadCount` открывает WS, обновляет кэш бейджа, при недоступности деградирует к
  поллингу (30s → 300s когда сокет жив), backoff-reconnect. Прокси: Vite `ws:true`, Nginx
  `map $connection_upgrade` + Upgrade-заголовки. Тип `NotificationSocketMessage` +
  openapi-заметка (не в HTTP-схеме). Тесты: `notifications.realtime.spec` (4, реальный
  ws-клиент). Долг: fan-out через Redis pub/sub при мультиинстансе (docs/17 §7).
- **Проверено вживую** (реальный Postgres 16 + Redis 7, собранный API): скрипты
  `scratchpad/{demo,grace}.mjs` — discount-refund кредитует 37.80 (нетто), не 42.00
  (баланс 500→401→438.80); grace: заявка +30мин принята (201), +90мин отклонена (409),
  окно в карточке 48h (истинное); inline-PATCH SAVE5→7.50/250 + RBAC 403 у покупателя;
  WS: сид-фрейм `unread:0`, отказ неаутентифицированному, push `unread:1` после оплаты.
- **DoD:** lint ✓, typecheck ✓, test ✓ (**353**, +18), build ✓, format ✓. Контракты:
  `docs/backend/openapi.md` (Ops warranty amount/refundedAmount, WS-заметка +
  `NotificationSocketMessage`), `docs/17` (§1 env, §7 realtime), `.env.example`.

### Сессия — M5 Release-операции (Трек A) — ЗАВЕРШЕНА по коду/скриптам
- **Развилка (asking):** ветка сессии — `m5-release-ops` → Трек A. Через AskUserQuestion
  выбран объём: **все четыре** направления (наблюдаемость+сверка · прод-деплой · бэкапы ·
  нагрузка).
- **Наблюдаемость + сверка баланса (код):** новый `OpsModule`.
  - `GET /admin/ops/metrics` (JSON) и `…/metrics.prom` (Prometheus text-exposition), RBAC
    `ELEVATED` (manager/admin), read-only, без аудита. Отдаёт `OpsMetrics`:
    **`reconciliation`** — per-user сверка `User.balance` ↔ истина леджера
    (`SUM credit − SUM debit`) одним grouped-запросом, возвращает только дрейфующих
    (`driftingUsers`, `totalDrift`, sample worst-first). Ловит взаимокомпенсирующиеся
    расхождения, которые глобальная сумма в `/admin/finance/summary` свела бы к нулю;
    **`notificationsQueue`** — глубина BullMQ (`getJobCounts`, через глобальный
    `NotificationsService.queueJobCounts`; `available:false` без Redis);
    **`topUps`** — `pending` и `pending` с истёкшим `expiresAt`.
  - **Sentry-репортер** (`ops/error-reporter.ts`) — dependency-free, шлёт 5xx/необработанные
    в Sentry через envelope-HTTP-API на глобальном `fetch` (Node 22). Включается `SENTRY_DSN`
    (пусто → no-op; fire-and-forget, таймаут 2s, ошибки глотаются — мониторинг не ломает
    запрос). Вплетён в `HttpExceptionFilter` (опц. reporter, DI через `app.setup`). В событие
    идут только тип/сообщение/стек + метод/путь/статус, **никаких** тел/заголовков/секретов.
  - env: `SENTRY_DSN`/`SENTRY_RELEASE` в `config/env.ts` (+ `TEST_ENV`).
  - Тесты: `ops.logic.spec` (сверка+Prometheus), `error-reporter.spec` (DSN-парсинг,
    no-op, envelope, глотание ошибок), `metrics.service.spec` (сборка, деградация очереди).
    **+12 тестов → 335 зелёных.**
- **Прод-деплой инфра:** `docker-compose.prod.yml` (postgres+redis+api+web, публикуется
  только web; Redis AOF), `apps/web/Dockerfile.prod` (сборка SPA → Nginx),
  `apps/web/nginx.conf` + `security-headers.conf` (отдача статики + reverse-proxy `/api` +
  строгий CSP/HSTS уровня документа; сниппет не на `/api/` во избежание двойного CSP),
  `.env.example` (все секреты + подсказки генерации), `scripts/deploy.sh` (CI-гейт →
  `migrate deploy` → up → health-гейт).
- **Бэкапы:** `scripts/backup.sh` (custom-format `pg_dump`, опц. GPG, ретеншен; санитайз
  Prisma `?schema=`) + `scripts/restore-test.sh` (восстановление в одноразовую БД +
  smoke + уборка).
- **Нагрузка (k6):** `load/{lib,checkout,idempotency}.js` + `README.md` — пропускная
  способность checkout и идемпотентность под конкуренцией (30 параллельных checkout с одним
  `Idempotency-Key` → одно списание, ассерт в teardown).
- **Проверено вживую** (локальный Postgres 16 + Redis, реальный API):
  - сверка баланса: seeded-дрейф → `GET /admin/ops/metrics` (401 без токена, 200 у manager)
    вернул ровно дрейфующего пользователя `delta -3.00`; Prometheus-формат корректен;
  - бэкап+тест-восстановление: dump 92K → restore в одноразовую БД → smoke (`users=3`,
    `ledger_entries=2`) → чистая уборка;
  - механика k6-хелпера top-up (подпись вебхука HMAC) → баланс зачислен `100.00`.
  k6 в среде не установлен (сценарии готовы, синтаксис провалидирован); Docker-registry
  недоступен (образы прод-compose не собирались здесь) — compose-конфиг провалидирован.
- **DoD:** lint ✓, typecheck ✓, test ✓ (335), build ✓. Контракты: `docs/backend/openapi.md`
  (+`/admin/ops/metrics`, схемы Ops*), `docs/17` (§1–6 обновлены под реальные артефакты).
  Отдельным chore-коммитом нормализован pre-existing prettier-дрейф 22 файлов E11.

### Сессия — Полировка, безопасность, запуск (эпик E11 — ЗАВЕРШЁН, веха M5)
- **Развилки (asking):** заданы через AskUserQuestion (пользователь — «без предпочтений»,
  реализованы рекомендации): отзывы — **базовый полный срез**; E2E — **2–3 критичных потока
  Playwright**; долги в этой сессии — **BullMQ-уведомления (E9) + warm-rework↔claim (E10)**
  (остальные — после запуска); CSP — **строгая self+allowlist** на API + документированный
  CSP для web-SPA.
- **Безопасность/прод-готовность:** helmet (`common/security.ts`) — CSP `default-src 'none'`,
  `frame-ancestors 'none'`, HSTS(prod), frameguard deny, noSniff, no-referrer, снят
  `X-Powered-By`; Swagger смонтирован только вне прода (+ ослабленный CSP на `/api/docs`).
  Mailer больше не логирует verify/reset-токены в проде. Rate-limit подтверждён (throttler
  глобально 300/мин + узко на `/auth/*`). Проверено вживую: заголовки на реальном ответе,
  `security-headers.e2e` + `mailer.service.spec`.
- **BullMQ-уведомления (долг E9):** `notifications.queue.ts`/`.processor.ts` — очередь
  `notifications` с ретраями (5×, экспоненц. backoff), воркер вызывает
  `NotificationsService.deliver` (бросает → BullMQ ретраит). `emit` кладёт джобу; без
  очереди (тесты, `NODE_ENV=test`) или при сбое enqueue — деградирует до inline-доставки
  (лучший-эффект, ничего не теряется). Очередь регистрируется только вне тестов
  (connection из `REDIS_URL`). Проверено вживую: `bull:notifications:*` в Redis, `order_paid`
  доставлен воркером.
- **Отзывы/рейтинг (E11):** миграция `20260715220247_reviews_and_warranty_reworking` —
  модель `Review` (productId, `orderItemId @unique`, authorId, rating, title, body, hidden)
  + `ReviewAuthor`-связь; `Product.ratingAvg` теперь заполняется. Контракты: `@advault/types`
  (`ProductReview`/`ReviewSummary`/`ProductReviewsResponse`/`ReviewEligibility`/
  `CreateReviewRequest`/`AdminReviewListItem`/`ModerateReviewRequest`, `OrderItem.review`);
  `docs/backend/{openapi,prisma-schema}` обновлены. Backend: `ReviewsModule` (публичный
  `GET /products/:slug/reviews` — только видимые, маска автора, роллап; `POST /reviews` —
  scoped на владельца выданной позиции, дедуп по позиции, пересчёт `ratingAvg` в транзакции);
  `AdminReviewsService`/controller (`GET|PATCH /admin/reviews`, SUPPORT_STAFF, hide/restore
  + пересчёт + аудит `review.hidden|restored`). `orders.service` отдаёт `OrderItem.review`
  (eligibility) через расширенный ORDER_INCLUDE (defensive). Web: `features/reviews`
  (Stars/StarInput, ProductReviews, LineReview, api-хуки), рейтинг+блок на ProductPage,
  контрол на позиции OrderPage, `AdminReviewsPage` + маршрут + нав; иконка `star` в спрайт;
  i18n EN/RU (`reviews.*`, `admin.reviews.*`). Проверено вживую (curl на реальном Postgres):
  создание→маска `us***`→дедуп 409→список+summary→`ratingAvg=5.00`; admin hide→`ratingAvg=null`
  +пустой публичный список; non-staff 403.
- **warm-rework↔claim (долг E10):** новый статус `WarrantyClaimStatus.reworking`
  (миграция+типы+`OPEN_CLAIM_STATES`). Fulfill MADE_TO_ORDER-замены теперь ставит
  `reworking` (не терминальный `replaced`) + аудит `rework_started`, без преждевременного
  уведомления. `warming.transition(deliver)` вызывает `resolveReworkingClaim` в той же
  транзакции: находит `reworking`+`replace`-заявку на позиции → `replaced` c
  `replacementDeliveryId`, затем аудит `warranty.claim.replaced` + уведомление buyer.
  READY_STOCK-путь без изменений (замена синхронна → терминальна сразу).
- **Полировка/юр:** страницы `/legal/{terms,privacy,refund}` (общий `LegalPage`, контент из
  i18n EN/RU, дисклеймер «не юр-консультация»), footer-ссылки. Состояния UI (loading/empty/
  error) и a11y соблюдены в новых экранах (radiogroup у звёзд, aria-labels, тёмная тема через
  токены).
- **E2E (Playwright):** `apps/web/e2e/*` (config с pre-installed Chromium, `testMatch *.e2e.ts`,
  webServer=vite, proxy→API) — сторфронт (каталог→товар→блок отзывов; footer→юр-страница),
  auth (регистрация→verify-экран; логин демо-юзера). 4 теста зелёные против живого стека.
  Исключены из `pnpm test` (нужен стек); скрипт `test:e2e`; артефакты в `.gitignore`.
- **Проверка (DoD):** lint/typecheck/build зелёные; API **323 теста** (было 304: +2
  security-headers, +2 mailer, +3 notifications-queue, +6 reviews.logic, +6 reviews.service,
  все прежние — зелёные); web locales.spec (EN/RU-паритет) зелёный; 4 Playwright e2e зелёные.
  Security-review по diff — без критичных находок. Живой стек (локальный Postgres16+Redis):
  миграция применена, сид, полный цикл отзывов/заголовков/очереди — ок.
- **Долг/следующее:** M5-релизные операции (деплой/бэкапы/мониторинг — `docs/17`); бизнес-
  подтверждение провайдера/хостинга; юр-вычитка. Не-блокеры на потом: аллокация discount
  при частичном возврате (E10), grace-период окна (E10), inline-edit промо (E8), WebSocket
  realtime (E9), нагрузочное тестирование выдачи/оплаты.

### Сессия — Гарантии, замены, возвраты (эпик E10 — ЗАВЕРШЁН)
- **Развилки (asking):** через AskUserQuestion, все по рекомендациям — модель заявки
  **отдельная `WarrantyClaim`** (не расширение Order/Delivery); одобрение **всегда вручную
  (staff)**; окно **жёсткое `warrantyHours`** (без grace); гранулярность **по позиции
  (partial)** — заявка привязана к OrderItem/Delivery.
- **Контракты вперёд:** `@advault/types` — `WarrantyClaimType`/`WarrantyClaimStatus`,
  `WarrantyInfo` (встроено в `OrderItem.warranty`: window+eligible+activeClaim),
  `CreateWarrantyClaimRequest`, `WarrantyClaimView`, `AdminWarrantyClaimListItem/Detail`,
  `ResolveWarrantyClaimRequest`, `WarrantyClaimResult`; `NotificationEventKey`/
  `NotificationType` +warrantyReplaced/refunded/rejected; `ShopSettings.notifications` →
  `Record<NotificationEventKey,…>`. `docs/backend/{prisma-schema,openapi}.md` обновлены
  (модель+enum, `NotificationType` +3, пути `/warranty-claims*` и `/admin/warranty-claims*`,
  схемы, `OrderItem.warranty`).
- **Модель/миграция (`20260715170000_warranty_claims`):** `WarrantyClaim`
  (number `WC-YYYY-NNNNNN`, orderItemId/deliveryId/requesterId, type, status, reason,
  resolutionNote, resolvedById, replacementDeliveryId, warrantyExpiresAt snapshot, индексы
  `[requesterId,createdAt]`/`[status,createdAt]`/`[orderItemId]`, FK cascade/setnull) +
  `WarrantyClaimType`/`WarrantyClaimStatus` enums + `NotificationType` +3 значения. Применена
  вживую (11 миграций, deploy зелёный).
- **Backend:** клиентский `WarrantyModule` (`/warranty-claims*` под RequireAuth, scoped на
  `requesterId`): чистая `warranty.logic.ts` (`computeWindow`/`isClaimEligible`/`hasOpenClaim`/
  `generateClaimNumber`); create мапит провал eligibility в точный 4xx (не доставлена 409 /
  открытая заявка 409 / нет гарантии 422 / окно истекло 409). Admin `AdminWarrantyService`
  (`admin/warranty-claims*`): approve/reject (WARRANTY_STAFF=support/manager/admin) →
  fulfill (FINANCE_STAFF): **replace READY_STOCK** — `stock.reserve`+`deliverReplacement`
  (тот же двухфазный резерв E5, Delivery type=replacement, line→replaced); **replace
  MADE_TO_ORDER** — `warming.reworkForReplacement` (job→queued, tasks reset, line→queued);
  **refund** — `ledger.credit` (Decimal, refType=refund, refId=orderItemId — ledger-unique
  = защита от двойного возврата), line/job→refunded, order реагрегирован (docs/14). Идемпотентно
  (Idempotency-Key + статус-гард approved→replaced через updateMany). Аудит каждого перехода
  (`warranty.claim.{requested,approved,rejected,replaced,refunded}`), уведомления buyer
  (warrantyReplaced/refunded/rejected, per-locale). `orders.service` — `OrderItem.warranty`
  через расширенный ORDER_INCLUDE (variant.warrantyHours + deliveries + warrantyClaims;
  defensive-мэппинг). Роль-группа `WARRANTY_STAFF` в `auth/roles.ts`.
- **Web:** `features/warranty` (api-хуки клиент+админ, `WarrantyStatusPill`, `WarrantyControl`
  — панель на позиции заказа: окно/активная заявка/форма replace|refund); страницы
  `WarrantyPage` (мои заявки), `AdminWarrantyPage` (очередь+фильтры), `AdminWarrantyDetailPage`
  (approve/reject + fulfill с danger-confirm, gated `useIsElevated`); нав «Гарантии» (admin
  `refresh`) + карточка в AccountPage; иконки из спрайта (`shield`/`refresh`); i18n EN/RU
  (`warranty.*`, `admin.warranty.*`, `account.warranty*`, `admin.nav.warranty`), locales.spec
  зелёный.
- **Проверка (DoD):** lint/typecheck/build зелёные; API **304 теста** (16 новых:
  warranty.logic.spec + warranty.e2e — replace/refund end-to-end, scoping 404, RBAC 403,
  window-expired 409, reject+notify); web locales.spec. Обновлены фейки (`FakeWarrantyClaimStore`
  + include variant/deliveries/warrantyClaims в order/orderItem). **Live-verify** на реальном
  Postgres+Redis (curl полного цикла): eligible=true→claim replace→scoping 404→approve→fulfill
  (Delivery replacement, line replaced, идемпотентный replay)→buyer видит replacement; refund
  claim→approve→fulfill (ledger credit 42.00 ×1, order/line refunded); в БД — 2 claim
  (replaced/refunded), 1 refund-credit, 1 replacement-delivery, 6 audit warranty.*, 2
  notification warranty_*.
- **Долг/следующее:** E11 (полировка/безопасность/запуск). В долг: частичный возврат discount
  (аллокация промо на позицию при возврате — сейчас возвращается unitPrice×qty), grace-период
  окна (по желанию), связывание завершения warm-rework с терминальным статусом claim.

### Сессия — Поддержка и уведомления (эпик E9 — ЗАВЕРШЁН)
- **Развилки (asking):** заданы через AskUserQuestion, все по рекомендациям —
  объём **полный срез** (портал + email + in-app); модель **отдельная таблица
  `Notification`**; движок доставки **синхронно через mailer** (BullMQ-воркеров в коде
  ещё нет — очередь в долг E11); realtime бейджа **поллинг** (без WebSocket).
- **Контракты вперёд:** `@advault/types` — client-ticket типы (`TicketSummary`,
  `TicketMessageView` с `authorRole`, `TicketDetailView`, `CreateMyTicket*`),
  `Notification*` (`NotificationView`/`NotificationType`/`UnreadCountResponse`);
  `NotificationTemplate` стал **per-locale** (`LocalizedNotificationTemplate`),
  `ShopSettings.notifications` и `UpdateSettingsRequest` обновлены; `AdminTicketListItem`
  получил `lastMessageFromCustomer`. `docs/backend/{prisma-schema,openapi}.md` обновлены
  (модель `Notification`+enum, пути `/tickets*` и `/notifications*`, схемы).
- **Модель/миграция (`20260715120000_notifications`):** `Notification`
  (userId, type enum, title/body, data JsonB для диплинка, readAt, индексы
  `[userId,readAt]`/`[userId,createdAt]`, FK cascade). Применена вживую (10 миграций,
  `migrate status` — up to date). `FakeNotificationStore` + `findFirst` у `FakeTicketStore`.
- **Backend:** `NotificationsModule` (@Global) — `NotificationsService.emit()` рендерит
  шаблон Settings в локали получателя (`renderTemplate`+`{{var}}`), пишет in-app строку и
  шлёт email через `MailerService.sendNotification` (заглушка; тело письма не логируем);
  `emit` best-effort (никогда не роняет бизнес-транзакцию). Client-`TicketsModule`
  (`/tickets*` под RequireAuth) строго scoped на `requesterId`, internal-заметки вырезаны,
  `authorRole` вместо личности стаффа, `pending/resolved→open` на ответ покупателя,
  closed→409. Эмиссии: `order.paid` (orders.service после checkout), `warming.ready`
  (warming.service на `deliver`), `ticket.reply` (admin-tickets на публичный ответ).
  `AdminTicketsService` — индикатор `lastMessageFromCustomer` (последнее сообщение).
- **Web:** `features/notifications` (хуки + `NotificationBell` — колокол с бейджем,
  поллинг unread каждые 30с, панель со списком/mark-all/диплинк), `features/tickets`
  (хуки + `TicketStatusPill`); страницы `SupportPage` (список + композер), `TicketPage`
  (тред + reply, closed-состояние); нав «Поддержка» + бейдж в шапке; админ-плашка
  «новый ответ» в очереди тикетов; `AdminSettingsPage` — редактор шаблонов **по локалям**;
  иконки `bell`/`ticket`; i18n EN/RU (`notifications.*`, `support.*`, `admin.tickets.newReply`,
  `admin.settings.templatesHint`), locales.spec зелёный.
- **Проверка (DoD):** lint/typecheck/build зелёные; API 288 тестов (17 новых:
  notifications.logic/service, tickets.service, e2e support-notifications + assert
  order_paid/warming_ready в orders/warming e2e); web locales.spec. **Live-verify** на
  реальном Postgres+Redis: register→ticket→scoping 404→staff reply+internal note→
  internal скрыт+role=staff→ticket_reply notification→buyer reply reopen→admin флаг→
  **RU-шаблон** с подстановкой номера→mark-read/all→closed 409→строки в БД.
- **Долг/следующее:** E10 (гарантии/замены/возвраты). В долг: вынос доставки уведомлений
  в BullMQ-очередь + ретраи (E11), WebSocket для realtime, вложения/макросы тикетов.

### Сессия — Админка: Dashboard/Reports + Tickets + Staff&roles + Settings (эпик E8, часть 4 — ФИНАЛ E8)
- **Развилки (asking):** попытки задать через AskUserQuestion дважды упали с инфра-ошибкой
  (permission-stream abort, не отказ пользователя) → пошли по рекомендациям из промта:
  объём — **все 4 модуля**; Tickets — **минимальная** модель (Ticket+TicketMessage,
  internal-заметки флагом `isInternal`, без макросов/скиллов); Reports — **готовые метрики**
  (фикс-эндпоинты §14, агрегация в SQL/Decimal, без float); Settings — **key-value стор**
  (`Setting(key,value json)` + типизированный слой в коде).
- **Модели/миграция (`20260715000000_tickets_settings`):** `Ticket` (number `TK-YYYY-NNNNNN`,
  status open→pending→resolved→closed, priority, requesterId/assigneeId/orderId, lastReplyAt,
  closedAt), `TicketMessage` (authorId nullable, `isInternal`), `Setting` (key PK, value JsonB,
  updatedBy). Enums `TicketStatus`/`TicketPriority`. User-связи Ticket*. `migrate deploy` — 9
  миграций (новая 1). Контракты вперёд: `docs/backend/{prisma-schema,openapi}.md` обновлены
  (пути `/admin/tickets*`, `/admin/staff`, `/admin/reports/*`, `/admin/settings` + схемы),
  типы отзеркалены в `@advault/types`.
- **RBAC (`auth/roles.ts`):** новые группы `SUPPORT_STAFF=[support,manager,admin]` (тикеты —
  операторы исключены: переписка с клиентом не их работа) и `REPORTS_STAFF=[manager,admin]`
  (revenue/SLA/загрузка — надзорные данные). Settings — `ADMIN_ONLY`. Staff-list — любой staff
  (для dropdown назначения); смена роли — существующий admin-only `PATCH /admin/users/:id/role`.
  Каждая мутация тикета/настроек → `AuditLog` (ticket.create/update/reply/note, settings.update),
  без секретов. Reports read-only — без аудита.
- **API (модуль `admin/`):** `AdminTicketsService` (очередь+фильтры, create от лица покупателя
  по email, reply/note с bump lastReplyAt и open→pending на публичный ответ, assign/status/priority,
  closed→409 на ответ, assignee обязан быть staff→400); `AdminReportsService` (dashboard —
  `order.aggregate` _sum/_count + `ledger.aggregate` refunds + `warmingJob.groupBy`/count ops +
  открытые тикеты; sales — fold order_items по variant→category/goal с Decimal; fulfillment —
  план vs факт/SLA/refund-rate из warmingJob+order_items; operators — groupBy assignedTo) +
  чистая `reports.logic.ts` (foldSales, computeFulfillment); `AdminStaffService` (staff + живая
  загрузка: открытые тикеты + активные warm-задачи через groupBy); `AdminSettingsService` +
  `settings.logic.ts` (buildSettings/applyUpdate поверх key-value, дефолты, валидация
  defaultLocale∈enabledLocales, интеграционные флаги из env read-only — секреты не хранятся).
- **Web:** хуки в `features/admin/api.ts` (tickets/staff/reports/settings + инвалидация);
  страницы **Tickets** (очередь+фильтры+форма нового тикета), **TicketDetail** (тред с internal-
  подсветкой, reply/note, assign/status/priority), **Dashboard** (KPI+ops-плитки+период 7/30/90д +
  секции sales/fulfillment/operators), **Staff** (список+загрузка, смена роли admin-only с
  danger-confirm), **Settings** (магазин/языки/шаблоны уведомлений + read-only флаги интеграций).
  Ticket-бейджи (status/priority), роуты в App.tsx, нав в AdminLayout (Dashboard/Tickets/Staff/
  Settings под ролями). i18n EN/RU (`admin.{tickets,dashboard,reports,staff,settings,ticketStatuses,
  ticketPriorities}` + nav; синхронно — locales.spec зелёный).
- **Тесты (+27, api 271 / web 2):** unit `reports.logic` (5 — fold Decimal-суммы по
  категориям/goal/продуктам, distinct-orders, пропуск исчезнувшего варианта; fulfillment
  план/факт/SLA/refund-rate, пустой безопасен); unit `settings.logic` (6 — дефолты, страйп
  unknown-ключей, trim, пустой enabledLocales→err, defaultLocale∉enabled→err, merge одного
  шаблона без затирания); service `AdminTicketsService` (7 — create+opening-msg, unknown
  requester→404, чужой заказ→400, полный цикл assign→reply(pending)→note→resolve→close,
  reply в closed→409, assign не-staff→400, фильтры); service `AdminSettingsService` (4 — дефолты,
  persist+audit+roundtrip, невалидный locale→400, секрет не попадает в стор); e2e `admin-support`
  (5 — RBAC-матрица tickets/reports/staff/settings + тикет end-to-end по HTTP). Фейки расширены:
  FakeTicket/TicketMessage/Setting стора, `order.aggregate`, `warmingJob.groupBy`+rich-count,
  `ticket.groupBy`, `user.findMany` role:{in}.
- **Проверено вживую (Postgres 16 + Redis + собранный API):** `migrate deploy` (9 миграций) +
  сидер; curl под ролями. **RBAC-матрица** ровно как задумано (tickets buyer/operator→403,
  support→200; reports support→403, manager→200; settings manager→403, admin→200; staff
  buyer→403, support→200). **Тикет end-to-end:** create (TK-2026-…, open, 1 msg, priority high) →
  assign support → публичный reply (open→**pending**, 2 msg) → internal note (state не меняется,
  isInternal=true) → close (closedAt проставлен) → reply в closed→**409**; AuditLog:
  create/update/reply/note/update. **Dashboard** после реального заказа: revenue 50.00, orders 1,
  avgOrder 50.00, openTickets 1. **Sales**: 1 категория «Google Ads» rev 50.00 + топ-товар.
  **Staff**: у support 1 открытый назначенный тикет. **Settings**: GET дефолты + флаги
  (crypto=true/octo=false/kms=true из env), PUT roundtrip (storeName+шаблон orderPaid, warmingReady
  сохранён — частичный merge), невалидный defaultLocale→400, стор-ключи `store`/`notifications`,
  audit settings.update, **секретов в сторе нет**. lint/format/typecheck/тесты(271+2)/build — зелёные.
- **Решения:** тикеты — минимальная модель, internal-заметки флагом (не отдельная сущность);
  публичный ответ open→pending (ждём клиента), заметка state не трогает; reports — SQL-агрегация
  денег через `aggregate/groupBy` (Decimal), реляционные группировки (по категории/goal) —
  fold order_items в памяти с Decimal (без float; raw-SQL-джойн отложен); минуты/проценты —
  обычные числа (правило «no float» — только про деньги); settings — key-value + типизированный
  слой (гибко, без миграций под каждую секцию), интеграционные секреты только как флаги из env.
- **Проблемы/долги:** inline-edit промокода (форма правки) по-прежнему нет; reports-джойны в
  памяти (для больших объёмов заменить на raw-SQL/материализацию); attachments у тикетов и
  макросы/скиллы операторов — отложены; долги E7 (expired-прокси по TTL, политика ресурсов на
  reassign) открыты; браузерный скрин админки не снимался (проверено curl полного цикла + build).
- **Дальше:** **E9 — Поддержка и уведомления** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Админка: Catalog & Bundles CRUD + Warming plans CRUD (эпик E8, часть 3)
- **Развилки (asking, все по рекомендации):** объём — **только ядро** (Catalog/Bundles +
  Warming-plans CRUD; Dashboard/Reports/Tickets/Staff/Settings отложены в E8-cont3);
  конструктор комплекта — **тип + типизированные параметры** (PROXY→{proxyType,geo,term},
  OCTO_PROFILE→{profileType}, GUIDE→{locale}, WARRANTY→{hours}, ACCOUNT→{geo}); правка
  опубликованного — **на месте** (snapshot в OrderItem защищает прошлые заказы, без версий
  вариантов); удаление — **архивирование** (product→hidden, variant→isActive:false,
  plan→isActive:false; жёсткого delete нет — целостность ссылок и аудит).
- **RBAC:** новая группа `CATALOG_STAFF = [manager, admin]` в `auth/roles.ts` (мерчендайзинг
  — не операторская работа). Все `/admin/{categories,products,products/:id/variants,
  variants,warming-plans}` под ней; support/operator/buyer → 403. Каждая мутация → `AuditLog`.
- **Без новых моделей/миграций:** переиспользованы Category/CategoryTranslation/Product/
  ProductTranslation/ProductVariant (bundleSpec, warmingPlanId, etaMinutes, warrantyHours) и
  WarmingPlan/WarmingStageTemplate. `migrate deploy` — те же 8 миграций.
- **API (контракты вперёд):** `docs/backend/openapi.md` — пути `/admin/categories(+/:id)`,
  `/admin/products(+/:id, +/:id/variants)`, `/admin/variants/:id`, `/admin/warming-plans(+/:id)`
  + схемы (AdminCategory/Product*/Variant, TranslationInput, AdminWarmingPlan*/Stage, Create/
  Update*). Типы отзеркалены в `@advault/types`. `prisma-schema.md` — заметка «E8-cont2 без
  моделей». Модуль `admin/`: `catalog.logic.ts` (чистая логика — normalizeBundleSpec с
  типизированными параметрами, computeEtaMinutes, deriveDeliveryType, slug/sku, assertPublishable),
  `AdminCatalogService` (категории/товары/варианты; deliveryType выводится из fulfillmentType;
  ETA MADE_TO_ORDER = сумма этапов плана; публикация требует активный вариант + ETA;
  slug/sku unique→409), `AdminPlansService` (планы + этапы; версия: правка stages → version+1
  + `productVariant.updateMany` пересчёт etaMinutes; goal/tier/version unique→409).
- **Web:** хуки `features/admin/api.ts` (categories/products/variants/plans, инвалидация);
  страницы **Catalog** (таблица товаров + фильтр status/q + менеджер категорий + форма
  товара), **ProductDetail** (правка info/переводы, publish/unpublish/archive с danger-confirm,
  список вариантов + **VariantEditor с конструктором комплекта** — чекбоксы 7 компонентов +
  типизированные поля, ETA из плана/ручной), **Plans** (таблица + форма создания),
  **PlanDetail** (метаданные + `StageEditor` этапов с чек-листом/компонентами, save→версия,
  archive/restore). Общие `StageEditor`/`stageUtils`, `ProductStatusBadge`. Роуты в App.tsx,
  нав Catalog/Plans в AdminLayout — только manager/admin. i18n EN/RU (`admin.catalog/plans/
  fulfillmentTypes/bundleTypes/productStatuses`, синхронно — locales.spec зелёный). Состояния
  loading/empty/error, иконки из спрайта (без эмодзи).
- **Тесты (+32, всего api 244 / web 2):** unit `catalog.logic` (14 — bundleSpec: типы/дубли/
  битые параметры/не-массив, ETA, slug/sku, publish-guard); unit `AdminCatalogService` (10 —
  категория EN обязателен, draft→variant(READY_STOCK+bundle)→publish, ETA из плана,
  неизвестный план→400, архив варианта, dup slug/sku→409, publish без вариантов→409,
  чужая категория→400, фильтр q); unit `AdminPlansService` (5 — create+ETA, dup goal/tier→409,
  метаданные без версии / stages→version+1+пересчёт ETA связанного варианта, архив, 404);
  e2e `admin-catalog.e2e` (RBAC buyer/support→403, полный цикл plan→category→product→variant
  →publish→version bump с пересчётом ETA, битый bundle→400). Фейки расширены: create/update/
  findUnique/findMany/count для category/product/productVariant/warmingPlan + новые стора
  categoryTranslation/productTranslation/warmingStageTemplate (стора этапов ассемблируются в
  plan.findUnique/findMany; inline-фикстуры makeWarmingPlanRow сохранены).
- **Проверено вживую:** локальный Postgres 16 + Redis + собранный API; `migrate deploy` (8
  миграций, новых нет) + сидер. curl под ролями: RBAC (buyer→403, admin→200); полный цикл
  из UI-контрактов — создан план (v1, ETA 240) → категория → черновик товара → MADE_TO_ORDER
  вариант с планом (deliveryType=manual, **ETA 240 из плана**, bundle с типизированными
  параметрами) → публикация → **товар виден в витрине** `/products/:slug` и `/products`
  (реальные Prisma-связи: отдельные translation/variant-создания подхватываются include);
  **версионирование** — правка stages (30+30+30) → план v2, ETA 90 → **связанный вариант
  пересчитан на 90** и в админке, и в витрине. AuditLog: plan.create/category.create/
  product.create/variant.create/product.published/plan.version, без секретов. lint/format/
  typecheck/тесты(244+2)/build — зелёные.
- **Решения:** конструктор комплекта — валидация типизированных параметров в чистой
  `catalog.logic` (страйп неизвестных ключей, дубль типа→400); ETA всегда из плана для
  MADE_TO_ORDER (ручной etaMinutes только без плана); версия плана — in-place bump на той же
  строке (snapshot в WarmingJob уже защищает идущие задачи, вариант ссылается на тот же
  planId); flat-запись переводов/вариантов (как в сидере), storefront-read через relations.
- **Проблемы/долги (в E8-cont3):** Dashboard/Reports, Tickets, Staff&roles UI, Settings —
  не сделаны; inline-edit промокода (UI формы правки нет); reorder категорий/варианты как
  отдельные версии — нет (по решению не нужны); браузерный скрин админки не снимался
  (проверено curl полного цикла + build/typecheck/lint); долги E7 (expired-прокси по TTL,
  политика ресурсов на reassign) по-прежнему открыты.
- **Дальше:** **E8-cont3** — Dashboard/Reports + Tickets + Staff&roles UI + Settings (промт
  в `docs/NEXT-SESSION-PROMPT.md`), затем **E9**.

### Сессия — Админка: Finance (refund + ручная выдача) + Users + Promo (эпик E8, часть 2)
- **Развилки (asking):** объём — **Finance + Users + Promo** (Catalog/Bundles + Warming-plans
  CRUD отложены в E8-cont2); модель ролей — **остаёмся на `User.role`** (StaffUser не вводим);
  политика возврата — **полный ИЛИ частичный по позиции**, refund warm-позиции → её WarmingJob=
  refunded, ручная выдача помечает позицию delivered.
- **RBAC (группы в `auth/roles.ts`):** добавлены `FINANCE_STAFF` (manager/admin) и `ADMIN_ONLY`.
  Refund/ручная выдача/promo/finance-summary — `FINANCE_STAFF`; users list/detail — `ORDERS_STAFF`
  (support читает); block/unblock — `ELEVATED`; смена роли — `ADMIN_ONLY` (менеджер не эскалирует
  до admin). Никаких новых миграций — модели переиспользованы (User/Order/OrderItem/Delivery/
  Ledger/PromoCode/AuditLog).
- **API (контракты вперёд):** `docs/backend/openapi.md` — уточнены `RefundRequest`
  (orderItemId?+reason) и `ManualDeliverRequest` (+note); новые схемы `RefundResult`,
  `FinanceSummary`, `AdminUserListItem/Detail`, `Block/UpdateUserRole`, `AdminPromoCode`,
  `Create/UpdatePromoCodeRequest`; новые пути `/admin/orders/:id/refund` (200→RefundResult,
  идемпотентно), `…/items/:itemId/deliver` (200→AdminOrderDetail, warm→409),
  `/admin/finance/summary`, `/admin/users(+:id/block/unblock/role)`, `/admin/promo-codes` CRUD.
  Типы отзеркалены в `@advault/types`. `prisma-schema.md` — заметка «E8-cont без моделей».
  Модуль `admin/`: `AdminFinanceService` (refund per-orderItem ledger-credit exactly-once,
  warm-job→refunded, пересчёт статуса заказа, idempotency; ручная выдача — шифрование payload
  как E5, warm/delivered/refunded→409; finance summary через `groupBy` ledger + `aggregate`
  balance, `reconciled`), `AdminUsersService` (list/фильтры, карточка с order-count + ledger-
  сверкой, block→`revokeAllSessions`, роль→admin-only, self-guards, before→after аудит),
  `AdminPromoService` (CRUD, upper-case+уникальность кода, percent 1–100/fixed>0, delete через
  SetNull). Всё пишет `AuditLog` (без секретов). Контроллеры под своими RBAC-группами.
- **Web:** новые хуки `features/admin/api.ts` (finance/users/promo, refund с Idempotency-Key,
  инвалидация). Страницы: **Finance** (карточка сверки reconciled/discrepancy + плитки топапы/
  оплаты/возвраты/корректировки/кол-ва); **Users** (таблица + поиск + фильтры статус/роль +
  пагинация) и **деталь** (профиль, баланс+ledger-сверка, последние заказы, block/unblock,
  смена роли — только admin, danger-confirm + причина); **Promo** (таблица + форма создания
  percent/fixed с лимитами/сроком + delete-confirm). В `AdminOrderDetailPage` — блок действий:
  refund всего заказа и по позиции + ручная выдача не-warm позиции (textarea payload+note),
  danger-confirm. Бейджи `RoleBadge`/`UserStatusBadge`; нав пополнен (Users/Finance/Promo);
  i18n EN/RU (блоки `admin.finance/users/promo/roles/userStatuses` + действия orders);
  loading/empty/error; иконки из спрайта (без эмодзи). `Banner` получил опц. `className`.
- **Тесты (+29, всего api 212 / web 2):** unit `AdminFinanceService` (single/full refund,
  двойной refund→409, warm-job→refunded, идемпотентный replay без двойного кредита,
  «нечего возвращать»→409, ручная выдача: шифрование+delivered+без секрета в аудите,
  warm→409, delivered→409, 404); unit `AdminUsersService` (фильтр-поиск, карточка+ledger-
  сверка, block+revoke+аудит, self-block/ self-role guard, 409 already-blocked, role change
  before→after); unit `AdminPromoService` (create upper-case/аудит, percent>100/≤0/битый код
  →400, dup→409, update+ре-валидация по типу, delete+404); e2e `admin-finance.e2e`
  (RBAC: buyer 403 везде, support 403 на finance/promo/refund но 200 на users; users list+
  block; promo CRUD; full-order refund с ledger-кредитом + идемпотентный replay). Фейки
  расширены: ledger `groupBy`/`count` по direction+refType, user `findMany/count/aggregate`+
  order-count/recent, orderItem.findFirst attaches warmingJob, promo `findMany/update/delete`.
  **Багфикс:** аудит before→after брал роль/статус из живого ряда fake (алиасинг) → снимок
  `previous*` до мутации (корректно и для реальной Prisma).
- **Проверено вживую:** локальные Postgres 16 + Redis + собранный API; `migrate deploy` всех
  8 миграций (новых нет) + сидер. curl под ролями admin/support/user: RBAC (buyer→403,
  support→403 finance/промо но 200 users); полный цикл денег — топап вебхуком → баланс 100 →
  покупка стока (−48=52) → **admin refund** (баланс→100, order=refunded, **ровно 1** ledger-
  credit refund) → **идемпотентный replay** тем же ключом (баланс не задвоился); finance-
  summary reconciled (ledger=cached=100, refunds=48, refundCount=1); promo create(SMOKE20)/
  percent>100=400/dup=409/support=403/delete=204; users block (заблокированный buyer→`/me`=403,
  сессии отозваны)/роль→manager/unblock; ручная выдача на refunded-позицию=409; аудит содержит
  order.refund/user.block/unblock/role_change/promo.create/delete, **без секретов в diff**.
  lint/format/typecheck/тесты(212+2)/build зелёные.
- **Решения:** refund — всегда per-orderItem ledger-кредиты (ключ refId=orderItemId) →
  «весь заказ» = сумма ещё-не-возвращённых позиций; так возврат композится с warming-refund
  (E6) и защищён от двойного проведения; сумма = line subtotal (аллокация скидки — E10);
  ручная выдача — только для не-warm (warm идёт через workspace); смена роли/блокировка →
  отзыв refresh-сессий; finance-summary — read-only сверка (глобальная), без пер-юзерного
  пересчёта в фоне; StaffUser по-прежнему отложен.
- **Проблемы/долги (в E8-cont2):** Catalog & Bundles CRUD + конструктор комплекта и Warming-
  plans CRUD (+версии) — не сделаны (следующая под-сессия, ядро «управлять магазином/прогревом
  из UI»); Tickets, Reports/Dashboard, Staff&roles UI, Settings — не сделаны; inline-edit
  промокода (PATCH-хук есть, UI формы правки нет); частичный refund по нескольким конкретным
  позициям за один вызов не поддержан (одна позиция или весь заказ); браузерный скрин админки
  не снимался (проверено curl под ролями + build/typecheck); долги E7 (expired-прокси по TTL,
  политика ресурсов на reassign) по-прежнему открыты.
- **Дальше:** **E8-cont2** — Catalog/Bundles + Warming-plans CRUD (промт в
  `docs/NEXT-SESSION-PROMPT.md`), затем остальное E8 и **E9**.

### Сессия — Админка/операторка: срез Orders + Warming-workspace + Inventory (эпик E8, часть 1)
- **Развилки (asking):** объём сессии — **Orders + Warming + Inventory** (как «начни с
  Orders + Warming-workspace»); модель ролей — **расширить `User.role`** (без отдельной
  StaffUser в MVP).
- **RBAC:** enum `Role` расширен — `operator` (руки: warming-workspace + инвентарь) и
  `manager` (надзор каталог/заказы/финансы); миграция `20260714000000_staff_roles`
  (`ALTER TYPE … ADD VALUE`; deploy + diff на живом Postgres 16 — дрифта нет, порядок
  `user/support/operator/manager/admin`). Группы ролей вынесены в `auth/roles.ts`
  (`STAFF/WARMING_STAFF/INVENTORY_STAFF/ORDERS_STAFF/ELEVATED`); `@Roles` на
  warming/inventory расширены. **Багфикс:** `WarmingService.assign` принимал только
  support/admin → теперь любую warming-роль (operator/support/manager/admin), плоского
  покупателя отклоняет 400 (unit-тест добавлен).
- **API (контракты вперёд):** `docs/backend/openapi.md` — уточнены `GET /admin/orders`
  (фильтры status + `q` по номеру/email, схема `AdminOrderListItem`), новый
  `GET /admin/orders/:id` (`AdminOrderDetail` с покупателем + warm-прогрессом, без
  секретов), `GET /admin/stock` (`AdminStockRow` — счётчики пула по статусам); схемы
  `OrderBuyer/PageMeta/AdminOrderListItem/AdminOrderDetail/AdminStockRow`.
  `docs/backend/prisma-schema.md` — enum `Role` + пояснение аддитивных ролей. Типы
  отзеркалены в `@advault/types` (+`STAFF_ROLES`/`isStaffRole`). Модуль `admin/`:
  `AdminOrdersService` (list с фильтрами/пагинацией + detail, include user/items/warming,
  404 на чужой/несуществующий), `AdminStockService` (`groupBy` StockItem по
  variant×status, локализованное имя, без payload'ов), контроллеры под `ORDERS_STAFF`/
  `INVENTORY_STAFF`. Warming/inventory API уже были из E6/E7.
- **Web:** новый операторский shell `AdminLayout` (сайдбар + мобильный топбар, i18n-переключатель),
  guard `RequireStaff` (`isStaffRole`), маршруты `/admin/*`; ссылка «Админка» в шапке
  для staff. Хуки `features/admin/api.ts` (orders/stock/warming/inventory на TanStack
  Query, инвалидация). Страницы: **Orders** (таблица + поиск `q` + фильтр статуса +
  пагинация) и **деталь** (покупатель, позиции, warm-прогресс-бар); **Stock** (счётчики
  пула); **Warming Kanban** (колонки по статусам, карточки → workspace); **Warming
  workspace** (`WarmingJobPage` — «взять себе», контекстные переходы по таблице server,
  чек-лист этапов, захват аккаунта, resolve reassign/refund; danger-confirm на
  deliver/fail/refund) + **`JobInventoryPanel`** (bind/unbind прокси+Octo из E7 прямо из
  задачи); **Inventory** (табы прокси/Octo: список, создание, импорт прокси text/plain).
  Бейджи статусов (`badges.tsx`), i18n EN/RU (блок `admin.*` + `nav.admin`),
  loading/empty/error везде; иконки из спрайта (без эмодзи).
- **Тесты (+1 unit, +4 e2e; всего api 183 / web 2):** unit `AdminStockService` (агрегация
  по статусам, локализация EN/RU, нулевой пул); unit warming assign (operator принимается,
  покупатель 400); e2e (в `warming.e2e`) — buyer 403 на `/admin/orders`, list с покупателем
  + фильтр по номеру/статусу, detail с warm-прогрессом без секретов, 404 на неизвестный id.
  Фейк `FakeOrderStore` расширен (buyer-user в include, generic-where status/OR-contains).
- **Проверено вживую:** локальные Postgres 16 + Redis + собранный API; `migrate deploy`
  всех 8 миграций + `migrate diff` (нет дрифта) + enum-порядок; сидер (53 стока, 4 прокси,
  2 Octo). Через curl под **новой ролью `operator`**: `/admin/stock` (5 вариантов со
  счётчиками), `/admin/inventory/proxies` (4), `/admin/warming/jobs`; buyer→`/admin/orders`
  = **403**; полный warm-заказ end-to-end операторкой (assign **operator** → start →
  этапы → qc → ready → захват аккаунта → **bind прокси+Octo** → deliver=delivered, bundle
  delivered); Vault покупателя содержит ACCOUNT (реальные креды) + PROXY + OCTO;
  `/admin/orders` показывает заказ (buyer email, фильтр `q=buyer2`), `/admin/orders/:id?locale=ru`
  — RU-имя + `warming.status=queued`/6 этапов, без секретов. lint/typecheck/тесты/build зелёные.
- **Решения:** роли аддитивны на `User.role` (StaffUser отложен, контракты не ломаются);
  назначение задачи — «взять себе» (operatorId = текущий staff-user; отдельного списка
  операторов пока нет); danger-действия из UI (deliver/fail/refund) — через confirm +
  серверный AuditLog (E6/E7); admin-таблицы read-only, мутации выдачи идут через
  warming/inventory; Kanban грузит одну страницу (≤100 задач) и группирует на клиенте.
- **Проблемы/долги (в E8-cont):** Catalog CRUD, Promo CRUD, Users, Finance, Tickets,
  Reports, Staff&roles UI, Settings — не сделаны (следующая под-сессия); ручная выдача
  `/admin/orders/:id/items/:itemId/deliver` и `/admin/orders/:id/refund` из UI (черновики
  в openapi) — не реализованы; браузерный скриншот админки в этой сессии не снимался
  (playwright-пакет не установлен) — web проверен build+typecheck против живого API;
  Kanban без пагинации/вебсокетов (поллинг ручной кнопкой); expired-прокси по TTL и
  политика ресурсов на reassign (долг E7) — по-прежнему открыты.
- **Дальше:** **E8-cont** — остальные модули админки (Catalog/Promo/Users/Finance/…),
  затем **E9 — Поддержка и уведомления** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Инвентарь: прокси и Octo-профили (эпик E7)
- **Сделано (контракты):** `docs/backend/prisma-schema.md` — модели `ProxyItem`
  (type/geo/provider/`credentials` зашифр./`credentialsHash @unique`/status/`expiresAt`/
  `assignedJobId @unique`) и `OctoProfile` (externalId/name/`proxyItemId`/`jobId @unique`/
  status/`exportRef` зашифр./`fingerprintRef`); enum `ProxyType/ProxyStatus/
  OctoProfileStatus`; связи `WarmingJob.proxyItem?/octoProfile?`; блок «Инвентарь E7»
  (гранулярность ≤1+≤1 на задачу, exactly-once bind, выделенный ресурс, формат импорта,
  сборка комплекта из реальных ресурсов, шифрование/аудит/RBAC). `docs/backend/openapi.md`
  — тег `Inventory`, схемы `ProxyItem/OctoProfile/CreateProxyRequest/ProxyImportRequest/
  ProxyImportReport/CreateOctoProfileRequest/UpdateOctoProfileRequest/JobInventory`,
  эндпоинты `/admin/inventory/proxies*` (list/create/import/bind/unbind),
  `/admin/inventory/octo*` (list/create/patch/bind/unbind), `GET /admin/warming/jobs/:id/
  inventory`. Типы отзеркалены в `@advault/types`.
- **API:** миграция `20260713193741_inventory_proxy_octo` (проверена deploy + diff —
  дрифта нет). Модуль `inventory/`: `InventoryService` — CRUD прокси/Octo с шифрованием
  `credentials`/`exportRef` (переиспользован E5 `PayloadCryptoService`, не логируются),
  импорт прокси (JSON + text/plain, дедуп по `credentialsHash`), резерв/привязка из
  задачи **exactly-once** (guarded `updateMany`: прокси `available→assigned`, Octo
  `draft|ready→ready`, `count===0 → 409`), Octo линкует прокси задачи по умолчанию,
  unbind (возврат в пул), `getJobInventory`; `AuditLog` на всех мутациях (без секретов).
  `WarmingService.assembleAndDeliver` расширен: компоненты `PROXY`/`OCTO_PROFILE`
  подставляют реальный привязанный ресурс (`BundleComponent.refId` + снимок шифртекста +
  непарольная meta), расшифрованные значения — только в едином `Delivery.payload`
  владельца; на `deliver` Octo→`delivered`, прокси остаётся `assigned`. RBAC admin/support
  на `/admin/inventory/*` и job-inventory. Сидер: 4 демо-прокси + 2 Octo-профиля
  (идемпотентно по `credentialsHash`/`externalId`).
- **Web:** отдельного UI инвентаря не добавляли (полный — в E8, как в плане); Vault
  покупателя уже рендерит расшифрованный blob доставки — реальные прокси/Octo-данные
  появляются в комплекте автоматически (проверено).
- **Тесты (+15, всего 175):** unit `InventoryService` (шифрование credentials/exportRef,
  дедуп create/import JSON+text/plain, bind прокси exactly-once + конфликты «занят»/
  «у задачи уже есть»/«delivered-задача», unbind→rebind, bind Octo с автолинком прокси,
  «delivered профиль не перепривязать», getJobInventory без секретов, 404/400 на
  несуществующие); +тест в `warming.service.spec` (сборка комплекта с реальными PROXY/
  OCTO компонентами → refId + Vault с расшифрованными данными); e2e-smoke
  `inventory.e2e.spec` (оплата warm → операторка до ready → RBAC 403 → импорт прокси
  text/plain с дедупом → bind прокси+Octo → job-inventory → deliver → Vault содержит
  прокси/Octo/аккаунт, статусы ресурсов корректны). Фейки расширены сторами
  `proxyItem`/`octoProfile`.
- **Проверено вживую:** локальные Postgres 16 + Redis + собранный API; полный цикл через
  curl (топап вебхуком → warm-checkout=paid/queued; RBAC 403 покупателю; операторка
  assign→start→этапы→qc→ready→захват аккаунта; выбор seeded-прокси/Octo → bind (прокси
  `assigned`, Octo `ready`+автолинк прокси, ciphertext `v1.…` в БД); job-inventory;
  deliver=delivered → прокси `assigned`, Octo `delivered`, BundleComponent ACCOUNT/PROXY/
  OCTO_PROFILE с refId; Vault владельца содержит расшифрованные креды прокси + Octo-экспорт
  + аккаунт; edge: 2-й прокси на delivered-задачу=409, дубль-создание=409, аудит без
  секретов, чужому Vault=404). lint/format/typecheck/тесты(175)/build зелёные.
- **Решения:** **гранулярность** — ≤1 прокси и ≤1 Octo на задачу (БД-уникальность
  `assignedJobId`/`jobId`), под `bundleSpec`; **повторное использование** — ресурс
  выделенный (после выдачи это ресурс покупателя: прокси остаётся `assigned`, Octo→
  `delivered`; автоворота в пул нет; оператор может `unbind` до выдачи); **формат импорта
  прокси** — JSON `{items}` или text/plain `type,geo,provider,host:port:user:pass[,expiresAt]`,
  дедуп по SHA-256 credentials (`@unique`); Octo импорта нет (создаётся поштучно);
  привязка — из ресурса (`/proxies/:id/bind {jobId}`), exactly-once через guarded
  updateMany (как резерв стока E5); мягкий фолбэк «pending assignment», если ресурс не
  привязан на момент выдачи. Развилки не эскалировались — дефолты однозначно следуют из
  docs/15 (одиночные PROXY/OCTO в комплекте, выделенный проданный ресурс).
- **Проблемы/долги:** операторский UI инвентаря (список/bind из Warming-workspace) — E8;
  фонового перешифрования старых версий ключа нет (как в E5); `expiresAt` прокси —
  хранится, но фонового перевода в `expired` по TTL нет (ленивая проверка/операторка — E8);
  reassign warm-задачи не отвязывает уже привязанные ресурсы автоматически (оператор
  делает `unbind` вручную) — уточнить политику в E8/E10; SECRETS-компонент в комплекте
  пока не используется (нет источника) — при необходимости в E8+.
- **Дальше:** **E8 — Полная админка / операторка** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Прогрев: модель и очередь (эпик E6)
- **Сделано (контракты):** `docs/backend/prisma-schema.md` — warm-модели `WarmingPlan`,
  `WarmingStageTemplate`, `WarmingJob`, `WarmingTask`, `AccountAsset`, `Bundle`,
  `BundleComponent`; enum `WarmingJobStatus/WarmingTaskStatus/BundleStatus/
  BundleComponentType`; `DeliveryKind += warm`; `OrderItemDeliveryStatus` расширен
  (queued…ready, on_hold, failed, refunded); `ProductVariant.warmingPlanId`,
  `Delivery.bundleId`, `OrderItem.warmingJob`, `User.warmingJobs`. Зафиксированы ETA,
  версионирование планов (planVersion + stagesSnapshot), политика failed→reassign/refund.
  `docs/backend/openapi.md` — схемы `WarmingProgress/WarmingJobSummary/WarmingJobDetail`,
  `OrderItem.warming`, эндпоинты `/admin/warming/jobs` (очередь/детали/assign/transition/
  tasks/account/resolve). Типы отзеркалены в `@advault/types`.
- **API:** миграция `20260713100000_warming` (проверена deploy + diff — дрифта нет).
  Модуль `warming/`: `warming.logic.ts` (чистые ETA-хелперы, таблица переходов,
  маппинг Job→deliveryStatus, агрегат статуса заказа), `WarmingService` — создание
  `WarmingJob(queued)` + этапы + ETA в транзакции checkout; переходы
  queued→assigned→in_progress→qc→ready→delivered (+on_hold с пересчётом ETA и буфером,
  resume, fail); при delivered — сборка `Bundle` + `BundleComponent` из `bundleSpec` и
  `Delivery(type=warm)` со снимком шифртекста (переиспользован E5 PayloadCryptoService +
  AuditLog, расшифровка только владельцу); захват `AccountAsset` (шифрование
  payload/recovery, не логируется); `resolveFailed` — reassign (→queued, tasks/ETA
  сброшены) или refund (ledger credit `refType=refund`, refId=orderItemId → защита от
  двойного возврата). RBAC-маршруты `/admin/warming/*` (admin/support). Checkout из E4/E5
  расширен: warm-позиции → `deliveryStatus=queued` + job; ответ заказа несёт warm-прогресс.
  Env: `WARMING_HOLD_BUFFER_MINUTES`, `WARMING_DEFAULT_STAGE_MINUTES`.
- **Web (покупатель):** `features/orders/WarmingCard` в `/orders/:id` — статус с ETA,
  «этап k из N» с прогресс-баром и списком этапов (иконки check/spark/clock, без эмодзи);
  `useOrder` поллит каждые 15с, пока warm-позиция не в терминале; расширены стили и i18n
  статусов выдачи; delivered → комплект в Vault. i18n EN/RU (`warming.*`,
  `orders.deliveryStatuses.*`), loading/empty/error.
- **Сидер:** `WarmingPlan` под `google_ads` (warm_7d/14d/agency) и
  `chrome_extension_dev` (warm_5d) с этапами (Σ длительностей = etaMinutes варианта);
  MADE_TO_ORDER-варианты слинкованы через `warmingPlanId`. Идемпотентно (upsert по
  `(goal,tier,version)` и `(planId,order)`).
- **Тесты (+24, всего 160):** unit `warming.logic` (ETA полная/остаточная, машина
  переходов + нелегальные, маппинг, агрегат статуса заказа); unit `WarmingService`
  (создание job с ETA, полный цикл до Vault, пересчёт ETA на hold/resume, refund с
  ledger, reassign, нелегальные переходы, очередь с фильтрами); e2e-smoke по HTTP
  `warming.e2e.spec` (оплата warm → queued с ETA → RBAC 403 → очередь → операторский
  прогон этапов → 409 без данных аккаунта → захват → delivered → Vault владельцу).
  Фейки расширены сторами warmingPlan/warmingJob/warmingTask/accountAsset/bundle/
  bundleComponent + вложение warmingJob в заказ; `makeWarmingPlanRow`.
- **Проверено вживую:** локальные Postgres 16 + Redis + собранный API; curl — полный
  цикл (топап вебхуком → warm-checkout: order=paid, item=queued, ETA=+7д, 6 этапов;
  RBAC 403 покупателю; операторка assign→start→этапы→qc→ready; deliver без аккаунта=409;
  захват аккаунта (ciphertext `v1.…` в БD, не plaintext) → deliver=delivered; Bundle с
  5 компонентами; Vault владельцу расшифрован, чужому 404; refund: баланс 120→25→120,
  order/item=refunded). lint/format/typecheck/тесты(160)/build зелёные.
- **Решения:** политика failed — **оператор решает сам** (reassign или refund; авто-возврата
  на failed нет); refund возвращает line subtotal (unitPrice×qty) на баланс (аллокация
  скидки — упрощение MVP, уточнение в E10); версионирование планов — снимок
  planVersion + stagesSnapshot на задачу; ETA = Σ длительностей этапов, на hold +буфер,
  на resume пересчёт без буфера; ресурсы прокси/Octo (E7) в комплекте помечены
  «provisioned separately»; support = операторская роль до StaffUser (E8).
- **Проблемы/долги:** операторский UI (Warming Kanban / workspace) — только API, полный
  UI в E8; реальные прокси/Octo-компоненты комплекта — E7; refund-аллокация скидки и
  политика возвратов/гарантий — E10; SLA-эскалации/уведомления на переходах — E9;
  фоновые таймеры (просрочка ETA) не реализованы.
- **Дальше:** **E7 — Инвентарь: прокси и Octo-профили** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Выдача из стока READY_STOCK (эпик E5)
- **Сделано (контракты):** `docs/backend/prisma-schema.md` — StockItem получил
  `payloadHash` + `@@unique([variantId, payloadHash])` (дедуп импорта), `orderItemId`
  стал не-unique (qty>1 → несколько единиц на позицию), зафиксирован формат ключей
  шифрования (`PAYLOAD_ENCRYPTION_KEY = v1:<base64>[,v0:…]`, шифртекст
  `v<N>.<iv>.<tag>.<ct>`) и двухфазный резерв/выдача; OrderItem ↔ StockItem/Delivery
  1:N. `docs/backend/openapi.md` — `GET /orders/:id/items/:itemId/delivery` (404 чужому,
  аудит), `POST /admin/products/:id/variants/:variantId/stock/import` (JSON + text/plain,
  RBAC, отчёт added/skipped/stockCount), уточнён поток checkout (резерв→sold→Delivery→
  агрегат статуса). Типы отзеркалены в `@advault/types` (StockStatus, DeliveryKind,
  DeliveryPayload, StockImportRequest/Report).
- **API:** `schema.prisma` — StockItem/Delivery/AuditLog + enum StockStatus/DeliveryKind
  + миграция `20260713000000_stock_delivery` (проверена deploy + diff — дрифта нет).
  `crypto/` — AES-256-GCM с версионируемым key-ring (env `PAYLOAD_ENCRYPTION_KEY`, чистые
  функции + DI-обёртка, случайный IV, GCM-tag). `stock/StockService` — двухфазная выдача:
  фаза 1 (до транзакции) резерв конкретных StockItem'ов `available→reserved`
  (+`reservedUntil` + Redis-mirror `stock:hold:*`, retry-loop под конкуренцию, exactly-once
  через guard `status=available`), фаза 2 (в транзакции checkout) `reserved→sold` +
  Delivery(type=auto, снимок шифртекста) + `deliveryStatus=delivered`; sweep просроченных
  резервов (setInterval + ленивое снятие); `stockCount` пересчитывается как
  COUNT(available); импорт (шифрование, дедуп по payloadHash, отчёт). Checkout из E4
  переписан на резерв/выдачу с откатом резерва при ошибке; статус заказа — агрегат по
  позициям (delivered/partially_delivered/paid, docs/14); MADE_TO_ORDER остаётся pending
  (E6). `OrdersService.getDelivery` — расшифровка только владельцу (чужой/невыданный →
  404) + `AuditLog(delivery.payload_accessed)`. RBAC: `@Roles` + глобальный `RolesGuard`
  (по `User.role`), `admin/AdminController` — импорт с проверкой READY_STOCK (409 иначе),
  парсер text/plain в `app.setup`. `audit/AuditService` (append-only, не ломает действие).
  Env: `PAYLOAD_ENCRYPTION_KEY`, `STOCK_RESERVE_TTL_SECONDS` (prod-guard на dev-ключ).
- **Web:** Vault-блок в `/orders/:id` (`features/orders/VaultCard`): секции выданных
  позиций, маскирование до явного «Показать» (тогда on-demand fetch `useDelivery` +
  аудит на сервере), копирование и скачивание `.txt` с micro-flash, статусы выдачи;
  иконки vault/download в спрайт; i18n EN/RU (ключи `vault.*`, RU-плюралы);
  loading/empty/error. Хук `useDelivery` — без кэша (secret фетчится только по явному
  раскрытию).
- **Сидер:** `seedStock` — 53 зашифрованных демо-StockItem на 5 READY_STOCK-вариантов
  (детерминированные payload → идемпотентность через payloadHash-upsert), `stockCount`
  пересчитывается от реального пула; dev-ключ вынесен в `DEV_PAYLOAD_KEY`.
- **Тесты (+45, всего 136):** unit шифрования (roundtrip, свежий IV, ротация ключа,
  чужой ключ/подмена/битый формат, дедуп-хэш); unit StockService (импорт+дедуп, резерв/
  release, OUT_OF_STOCK с откатом частичного резерва, sweep просроченных); unit checkout
  (авто-выдача delivered, only-owner+аудит, exactly-once под конкуренцией — разные
  единицы, OUT_OF_STOCK пустой/недостаточный пул с откатом резерва, INSUFFICIENT_BALANCE
  с возвратом резерва, partially_delivered/paid-агрегаты, повторный checkout — другая
  единица, idempotency-replay не выдаёт дважды); e2e-smoke по HTTP расширен (авто-выдача,
  delivery владельцу с расшифровкой, 404 чужому без лишнего аудита, RBAC 403/импорт
  JSON+text/plain+дедуп+409 warm). Фейки расширены сторами stock/delivery/audit +
  order/orderItem/variant get findFirst/update.
- **Проверено вживую:** локальные Postgres 16 + Redis + собранный API + Vite; curl —
  полный цикл (пополнение вебхуком → checkout → order=delivered, stockCount 14→13, ровно
  1 sold, delivery расшифрована владельцу, аудит записан, чужому 404, повторный checkout
  берёт другую единицу; импорт admin JSON/text-plain с дедупом, non-admin 403, warm 409);
  Chromium/Playwright — вход → деталь заказа → Vault: маска → «Показать» (расшифровка на
  экране) → Copied → Download. Скриншот сверен со стилем Aurora. lint/format/typecheck/
  тесты (136)/build зелёные.
- **Решения:** политика нехватки стока в момент оплаты — **отклонять checkout целиком**
  (`409 OUT_OF_STOCK`, транзакция откат, деньги не списаны; перевод в manual/warm — с
  операторкой E6/E8); резерв — отдельный committed-шаг до денежной транзакции (при сбое
  явный release, при краше — sweep по `reservedUntil`); ключи шифрования — список версий
  в одном env (первый шифрует, все расшифровывают; KMS позже без смены формата); дедуп
  импорта — SHA-256 исходной строки в рамках варианта (ciphertext сравнивать нельзя из-за
  IV); Delivery.payload — снимок шифртекста StockItem (не пере-шифровываем).
- **Проблемы/долги:** резерв-claim через select+guarded-updateMany с retry-loop (не
  `FOR UPDATE SKIP LOCKED`) — exactly-once держится, но под высокой конкуренцией возможен
  редкий ложный OUT_OF_STOCK (перенести в raw SQL при нагрузке); sweep резервов —
  in-process setInterval (при мультиинстансе → BullMQ); Redis-hold — best-effort mirror
  (истина — `reservedUntil` в БД); ротация ключей есть по чтению, фонового перешифрования
  старых версий нет; админ-просмотр стока (`GET /admin/stock`) и ручная выдача — в E8.
- **Дальше:** **E6 — Прогрев: модель и очередь (MADE_TO_ORDER)** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Корзина, заказы, оплата с баланса (эпик E4)
- **Сделано (контракты):** `docs/backend/prisma-schema.md` — OrderItem получил снапшоты
  `sku` и `nameSnapshot Json` ({en,ru}); зафиксирован MVP-механизм наличия до E5:
  атомарный check-and-decrement `ProductVariant.stockCount` в транзакции checkout
  (TTL-резерв StockItem придёт в E5); демо-промокоды AURORA10/SAVE5/EXPIRED10.
  `docs/backend/openapi.md` — CartItem расширен (productSlug, fulfillmentType,
  stockCount, etaMinutes, isActive, attributes), `CheckoutRequest` без `cartId`
  (корзина 1:1 с пользователем), новый `GET /promo-codes/{code}` (превью скидки,
  404 PROMO_INVALID), у Order добавлен `promoCode`, уточнены коды ошибок checkout
  (400 пустая корзина / 402 / 409 OUT_OF_STOCK|PROMO_INVALID|IDEMPOTENCY_CONFLICT).
  Типы отзеркалены в `@advault/types` (Cart, CartItem, Order, OrderItem,
  CheckoutRequest, PromoCodePublic, OrderStatus, OrderItemDeliveryStatus).
- **API:** `schema.prisma` — Cart/CartItem (`@@unique([cartId, variantId])`),
  Order (`number @unique`, subtotal/discount/total Decimal), OrderItem (снапшоты
  sku/имени/цены/deliveryType, deliveryStatus=pending), PromoCode + миграция
  `20260712300000_cart_orders` (проверена `migrate deploy` + `migrate diff` — дрифта
  нет). Модуль `cart/`: серверная корзина (ленивое создание, merge повторного
  добавления, кап количества по stockCount c OUT_OF_STOCK, неактивные позиции видны,
  но не входят в subtotal), локализация имён «товар · вариант» EN/RU;
  `GET /promo-codes/:code` (percent/fixed, maxUses/expiresAt). Модуль `orders/`:
  `POST /orders/checkout` (обязательный Idempotency-Key через IdempotencyService из
  E3: replay → сохранённый ответ, другое тело/в полёте → 409; при ошибке ключ
  освобождается) — в ОДНОЙ транзакции: атомарный декремент stockCount (guard
  `stockCount >= qty AND isActive`) + инкремент usedCount промокода под теми же
  guard'ами + `Order(status=paid)` с OrderItem-снапшотами + `LedgerService.debit`
  (двойная запись, balanceAfter, при нехватке INSUFFICIENT_BALANCE 402 с
  details.required/available — транзакция откатывается целиком) + очистка корзины;
  total=0 (полная скидка) не дебетуется; номер AV-YYYY-XXXXXX с ретраем коллизии.
  `GET /orders` (пагинация) и `GET /orders/:id` (только владельцу, 404 чужим),
  имена позиций — из nameSnapshot по локали запроса.
- **Web:** экран `/checkout` по `prototype/screens/checkout.html`: степпер
  Review→Payment→Done с aurora-fill, корзина (количество ±, удаление, badge
  наличия/под-заказ/«снят с продажи», клампы по стоку), промокод (превью скидки
  через GET /promo-codes, ошибка PROMO_INVALID, бейдж применённого кода), summary
  (subtotal/discount/total; расчёт в центах зеркалит серверный Decimal), оплата с
  баланса (сравнение баланс/итог; при нехватке — предупреждение и CTA «Пополнить
  баланс» → /wallet вместо кнопки оплаты; 402 от сервера обрабатывается так же),
  done-карточка с flash, номером заказа и ссылками «Открыть заказ»/«Продолжить
  покупки». Idempotency-Key — один на логическую оплату (ретрай ошибки
  переиспользует). «Buy now» на карточке товара кладёт в корзину и ведёт на
  /checkout (гость — на логин с возвратом). В шапке — иконка корзины со счётчиком.
  История заказов: `/orders` (список с бейджами статуса, пагинация) и `/orders/:id`
  (позиции со статусами выдачи, промокод, суммы), ссылка «Мои заказы» в ЛК. Иконки
  cart/tag/trash/plus/minus добавлены в спрайт; i18n EN/RU (включая RU-плюралы);
  loading/empty/error везде.
- **Тесты (+30, всего 116):** unit ledger.debit (списание+balanceAfter, откат при
  INSUFFICIENT_BALANCE, запрет двойного проведения, неположительные суммы); unit
  checkout (total, percent/fixed промокод с капом и usedCount, PROMO_INVALID,
  INSUFFICIENT_BALANCE с полным откатом и ретраем после пополнения, идемпотентный
  replay, конфликт другого тела, OUT_OF_STOCK/неактивный вариант, пустая корзина,
  MADE_TO_ORDER без декремента стока, RU/EN nameSnapshot, чужой заказ 404); e2e-smoke
  по HTTP: пополнение вебхуком E3 → корзина (merge, OUT_OF_STOCK, RU-локаль) → превью
  промокода → checkout (баланс списан ровно раз, сток − qty, корзина пуста) → replay
  ключа ничего не задваивает → 402 с сохранением корзины → список/деталь/404 чужому.
  Фейки расширены: сторы variant/cart/cartItem/order/orderItem/promo + $transaction
  с настоящим snapshot/rollback (восстановление in-place, сохраняя identity строк).
- **Проверено вживую:** Postgres 16 + Redis + собранный API + Vite; curl: полный цикл
  (пополнение вебхуком → корзина → превью промо → checkout с AURORA10 → replay того же
  ключа → 409 на другом теле → 402 при нехватке; в БД: ledger сходится
  (100−75.60=24.40), сток 37→35, usedCount=1, заказ paid со снапшотами);
  Chromium/Playwright (15 шагов): регистрация → пополнение с вебхуком → Buy now →
  checkout (количество, промо валид/невалид) → оплата → flash+done → деталь заказа →
  список → RU-локаль → ветка нехватки баланса с CTA на /wallet → корзина уцелела после
  402. Скриншоты сверены с прототипом. lint/format/typecheck/тесты/build зелёные.
- **Решения:** корзина строго server-side и 1:1 с пользователем (cartId убран из
  контракта); резерв стока в E4 — атомарный декремент кэша stockCount в транзакции
  оплаты (без TTL-брони; полноценный StockItem-резерв в E5); имя позиции заказа
  снапшотится в обеих локалях (nameSnapshot {en,ru}) и локализуется при чтении; ответ
  идемпотентного replay возвращается как сохранён (локаль оригинала); превью скидки —
  отдельный `GET /promo-codes/:code`, финальная валидация и usedCount — в транзакции
  checkout; deliveryStatus всех позиций — pending до E5.
- **Проблемы/долги:** TTL-резерва стока на время оформления нет (окно между корзиной
  и оплатой закрыто только атомарным декрементом) — закрыть в E5 вместе со StockItem;
  промокоды без админ-CRUD (только сидер); replay checkout отдаёт ответ в локали
  оригинального запроса; лимит переиспользования IdempotencyKey-таблицы не чистится
  (нужен sweep по createdAt позже).
- **Дальше:** **E5 — Выдача из стока (READY_STOCK)** (промт в `docs/NEXT-SESSION-PROMPT.md`).

### Сессия — Кошелёк и пополнение криптой (эпик E3)
- **Сделано (контракты):** `docs/backend/openapi.md` — уточнены `CreateTopUpRequest`
  (enum активов USDT-TRC20/USDT-ERC20/BTC/ETH, диапазон 1.00–100000.00), `Wallet.recent`
  (последние 5), описание вебхука (sandbox-подпись X-Signature = HMAC-SHA256 от raw
  body, неизвестный externalId → 200-ignore, оплата после expiry всё равно зачисляется).
  `docs/backend/prisma-schema.md` — семантика IdempotencyKey (claim до обработки,
  replay по совпавшему requestHash, иначе 409) и переход expired→paid. Wallet-типы
  отзеркалены в `@advault/types` (LedgerEntry, Wallet, TopUp, CreateTopUpRequest…).
- **API:** `schema.prisma` — LedgerEntry (уникальный `[refType, refId, direction]`
  против двойного проведения), TopUp (`externalId @unique`), IdempotencyKey
  (`@@unique([key, endpoint])`) + миграция `20260712200000_wallet` (проверена
  `migrate deploy` на чистом Postgres 16). Модуль `wallet/`: `GET /wallet` (баланс +
  5 последних движений, сверка кэша с ledger — расхождение логируется), `GET
  /wallet/transactions` (пагинация), `POST /wallet/topups` (обязательный
  Idempotency-Key: claim-запись до обработки, повтор → сохранённый ответ, другое
  тело/в полёте → 409 IDEMPOTENCY_CONFLICT; диапазон суммы в Decimal), `GET
  /wallet/topups/:id` (поллинг; ленивый expire), `POST /webhooks/payments/:provider`
  (@Public; подпись по raw body — `rawBody: true` в main.ts; зачисление
  в одной транзакции: claim-переход pending|expired→paid + LedgerService.credit
  с атомарным инкрементом User.balance и снимком balanceAfter). Эквайринг — за
  интерфейсом `PaymentProvider` (DI-токен PAYMENT_PROVIDERS, первый — дефолт);
  реализация `sandbox` (фейковые адреса per-актив, HMAC-SHA256, без сети). Sweep
  просроченных pending → expired: setInterval 60с + ленивый expire на чтении. Env:
  `PAYMENT_WEBHOOK_SECRET` (prod-проверка не-дефолта), `TOPUP_TTL_MINUTES` (15).
- **Web:** экран `/wallet` по прототипу (guard-роут): карточка баланса с aurora-mini,
  форма пополнения (сумма, актив/сеть сегментами), после создания — QR (`qrcode`),
  адрес с копированием, таймер до expiry, поллинг статуса каждые 3с; при зачислении —
  flash-оверлей, обновление баланса/истории/`/me`; состояния expired/failed с
  повтором. История транзакций (таблица, пагинация). Idempotency-Key генерируется на
  логическую операцию (ретрай ошибки переиспользует, правка формы сбрасывает).
  Ссылка «Пополнить» в ЛК, пункт «Кошелёк» в шапке (для вошедших). Иконки wallet/copy
  в спрайте; i18n EN/RU полностью; loading/empty/error везде.
- **Тесты (+24, всего 86):** unit ledger (зачисление, balanceAfter, сходимость
  SUM(ledger)=balance, запрет двойного проведения, отказ неположительных сумм); unit
  wallet (идемпотентность вебхука-реплея, replay/conflict Idempotency-Key, expiry +
  поздняя оплата, failed-вебхук, чужой topup → 404, неверная подпись/payload/провайдер);
  e2e-smoke по HTTP (supertest + фейки: ledger/topup/idempotency-сторы, $transaction):
  создать → повтор ключа → поллинг → плохая подпись 401 → вебхук зачислил → реплей
  ничего не изменил → история.
- **Проверено вживую:** локальные Postgres 16 + Redis + собранный API + Vite; curl:
  полный цикл (409 на другой боди с тем же ключом, 401 на плохой подписи, повторный
  вебхук no-op, ровно одна ledger-строка в БД); Chromium/Playwright: регистрация →
  /wallet → создание пополнения → QR/адрес/таймер на экране → подписанный вебхук →
  поллинг довёл до «Баланс пополнен» + flash → баланс/история обновились → RU-локаль →
  ЛК показывает новый баланс. Скриншоты сверены с прототипом.
  lint/format/typecheck/тесты/build зелёные.
- **Решения:** вебхук-роут — `/webhooks/payments/:provider` (как в контракте, реестр
  провайдеров, sandbox первый/дефолтный); оплата после expiry зачисляется (средства
  получены — фиксируем paid); неизвестный externalId — 200-ignore (не наш платёж,
  чтобы провайдер не ретраил); Idempotency-Key обязателен для POST /wallet/topups;
  дебет ledger не реализован — придёт с E4 (checkout) вместе со своими тестами.
- **Проблемы/долги:** sweep просроченных pending — in-process setInterval (при
  мультиинстансе перенести в BullMQ); зависимость `qrcode` тянет @scarf/scarf
  (скрипты игнорируются pnpm); реальный крипто-эквайринг (Cryptomus/NOWPayments)
  не выбран — подключить второй PaymentProvider позже, вебхук-формат уже
  нормализован; периодическая фоновая сверка балансов по всем юзерам — позже
  (сейчас сверка на чтении /wallet).
- **Дальше:** **E4 — Корзина, заказы, оплата с баланса** (промт в `docs/NEXT-SESSION-PROMPT.md`).

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
