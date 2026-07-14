# Журнал сессий (SESSION LOG)

Живой трекер прогресса. **В конце каждой сессии добавляй запись сверху** и обновляй
блок «Текущий статус». Это первый источник правды о том, что сделано и что дальше.

---

## 📍 Текущий статус

- **Фаза:** разработка. E0…E7 готовы и проверены end-to-end. **E8 (админка/операторка)
  — в работе**: сделаны Orders + Warming-workspace + Inventory-UI (часть 1) и
  **Finance (ручной refund + ручная выдача + сверка ledger) + Users (список/блок/роль) +
  Promo CRUD (часть 2)**. Осталось для E8: Catalog & Bundles CRUD + Warming plans CRUD
  (+конструктор комплекта/версии), Tickets, Reports/Dashboard, Staff&roles UI, Settings.
- **Следующий шаг:** **E8-cont2** — Catalog/Bundles + Warming-plans CRUD (ядро «управлять
  каталогом/прогревом из UI»), затем остальное E8 и **E9 — Поддержка и уведомления**.
- **Ветка:** актуальная база — `claude/advault-e8-admin-continuation-flz7jy` (E0…E7 +
  E8 части 1–2; фаст-форворднута с `…e8-admin-panel-s4ia8e`). В main код ещё не влит.
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
| E8 | Полная админка / операторка | 🟡 в работе (Orders+Warming+Inventory + Finance/Users/Promo) |
| E9 | Поддержка и уведомления | ⬜ |
| E10 | Гарантии, замены, возвраты | ⬜ |
| E11 | Полировка, безопасность, запуск | ⬜ |

Легенда: ⬜ не начато · 🟡 в работе · ✅ готово

---

## Записи

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
