# Backend — Prisma-схема БД (AdVault)

Готовая к реализации схема данных для NestJS + PostgreSQL + Prisma.
Источник истины по сущностям — [`05-data-model.md`](../05-data-model.md),
по потокам оплаты/выдачи — [`08-payments-delivery.md`](../08-payments-delivery.md).

Ключевые архитектурные решения:

- **Деньги** — только `Decimal @db.Decimal(18,2)`, никогда `Float`. Валюта учёта хранится отдельным полем (`currency`).
- **Баланс через ledger (двойная запись).** `User.balance` — кэш; источник истины — сумма движений `LedgerEntry`. Каждая запись хранит `balanceAfter` (снимок), что даёт быструю сверку и аудит.
- **Идемпотентность.** `TopUp.externalId` — `@unique`, повторный вебхук эквайринга не задваивает зачисление. Для мутаций оплаты — таблица `IdempotencyKey` (заголовок `Idempotency-Key`).
- **Шифрование payload.** `StockItem.payload` и `Delivery.payload` шифруются **на уровне приложения** (AES-256-GCM, ключи из env `PAYLOAD_ENCRYPTION_KEY`), в БД лежит уже зашифрованный текст. Prisma об этом «не знает» — тип `String @db.Text`. Формат env: `v1:<base64 32B>[,v0:<старый>]` — первый ключ шифрует, все перечисленные расшифровывают; шифртекст самоописываем: `v1.<iv>.<tag>.<ciphertext>` (base64), так что ротация — добавить новый ключ первым, KMS подключается позже без смены формата.
- **Резерв стока.** `StockItem.status = reserved` + `reservedUntil` (TTL); в Redis дублируется быстрый TTL-таймер. После оплаты `reserved → sold` с привязкой `orderItemId`.
- **i18n.** Переводимый контент вынесен в `*Translation`-таблицы с уникальной парой `(<entity>Id, locale)`.

---

```prisma
// ============================================================
// AdVault — Prisma schema
// ============================================================

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ============================================================
// Enums
// ============================================================

enum Role {
  user
  support
  operator // E8: hands-on warming/inventory operator
  manager // E8: catalog/orders/finance oversight
  admin
}
// E8 (docs/13): роли аддитивны на User.role (без отдельной StaffUser в MVP).
// support — тикеты/чтение заказов; operator — warming-workspace + инвентарь;
// manager — надзор над каталогом/заказами/финансами; admin — суперсет (owner).
// Гранулярный StaffUser можно ввести позже, не ломая контракты.
// E8-cont: finance (ручной refund/выдача, сверка ledger), users (block/роль),
// promo CRUD НЕ добавляют моделей — переиспользуют User/Order/OrderItem/Delivery/
// LedgerEntry/PromoCode/AuditLog. Refund = LedgerEntry(credit, refType=refund,
// refId=orderItemId) — unique (refType,refId,direction) защищает от двойного
// возврата; смена роли/блокировка отзывают refresh-сессии (Redis).
// E8-cont2: Catalog & Bundles CRUD (категории/товары/варианты + конструктор
// комплекта) и Warming plans CRUD (версионирование) НЕ добавляют моделей —
// переиспользуют Category/CategoryTranslation/Product/ProductTranslation/
// ProductVariant (bundleSpec, warmingPlanId, etaMinutes, warrantyHours) и
// WarmingPlan/WarmingStageTemplate. Правка опубликованного — на месте (OrderItem
// хранит snapshot цены/имени/типа); удаление = архив (product→hidden,
// variant→isActive:false, plan→isActive:false). Версия плана: правка stages
// делает version+1 и пересчитывает etaMinutes связанных вариантов; уже идущие
// WarmingJob сохраняют planVersion + stagesSnapshot (не ломаются).

enum UserStatus {
  active
  blocked
}

enum ProductStatus {
  draft
  published
  hidden
}

// Модель выдачи варианта (docs/11): READY_STOCK — мгновенно из стока,
// MADE_TO_ORDER — прогрев под заказ оператором (очередь, ETA).
enum FulfillmentType {
  READY_STOCK
  MADE_TO_ORDER
}

enum DeliveryType {
  auto
  manual
}

enum DeliveryKind {
  auto
  manual
  warm // E6: сборка комплекта прогрева (Bundle)
  replacement
}

enum StockStatus {
  available
  reserved
  sold
}

enum OrderStatus {
  pending
  paid
  partially_delivered
  delivered
  cancelled
  refunded
}

// READY_STOCK: pending→delivered; MADE_TO_ORDER (E6): зеркалит статус
// WarmingJob (queued…ready→delivered, on_hold/failed, refunded — терминальный
// возврат средств). См. docs/14.
enum OrderItemDeliveryStatus {
  pending
  awaiting_manual
  queued
  assigned
  in_progress
  qc
  ready
  on_hold
  failed
  delivered
  replaced
  refunded
}

// --- Прогрев (MADE_TO_ORDER), E6 (docs/12, docs/14, docs/15) ---
enum WarmingJobStatus {
  queued
  assigned
  in_progress
  qc
  ready
  delivered
  on_hold
  failed // не терминальный: оператор решает — reassign (→queued) или refund
  refunded
}

enum WarmingTaskStatus {
  pending
  in_progress
  done
  skipped
  blocked
}

enum BundleStatus {
  assembling
  qc
  ready
  delivered
}

enum BundleComponentType {
  ACCOUNT
  PROXY
  OCTO_PROFILE
  RECOVERY
  SECRETS
  GUIDE
  WARRANTY
}

// --- Инвентарь: прокси и Octo-профили, E7 (docs/12, docs/15) ---
enum ProxyType {
  residential
  mobile
  isp
  datacenter
}

enum ProxyStatus {
  available
  assigned // привязан к warm-задаче (assignedJobId)
  expired
  disabled
}

enum OctoProfileStatus {
  draft
  ready // готов/привязан к задаче
  delivered // выдан в комплекте покупателю
}

enum LedgerDirection {
  credit
  debit
}

enum LedgerRefType {
  topup
  order
  refund
  adjustment
  replacement
}

enum TopUpStatus {
  pending
  paid
  expired
  failed
}

enum PromoType {
  percent
  fixed
}

enum TicketStatus {
  open
  pending
  closed
}

enum TicketPriority {
  low
  normal
  high
}

// ============================================================
// User & auth
// ============================================================

model User {
  id               String     @id @default(uuid()) @db.Uuid
  email            String     @unique
  passwordHash     String
  role             Role       @default(user)
  status           UserStatus @default(active)
  balance          Decimal    @default(0) @db.Decimal(18, 2) // кэш; истина — LedgerEntry
  locale           String     @default("en")
  emailVerifiedAt  DateTime?
  twoFactorSecret  String? // TOTP (v2)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  orders        Order[]
  ledgerEntries LedgerEntry[]
  topUps        TopUp[]
  tickets       Ticket[]
  reviews       Review[]
  cart          Cart?
  auditLogs     AuditLog[]      @relation("AuditActor")
  ticketMsgs    TicketMessage[]
  deliveries    Delivery[]      @relation("DeliveredBy")
  warmingJobs   WarmingJob[]    @relation("WarmingAssignee") // назначенные warm-задачи (E6)

  @@index([status])
  @@index([role])
  @@map("users")
}

// Одноразовые auth-токены НЕ хранятся в БД — они живут в Redis с TTL:
//   auth:refresh:{userId}:{jti} — активные refresh-сессии (ротация: старый jti
//     удаляется при выпуске нового; logout/смена пароля удаляет ключи);
//   auth:verify:{token}         — подтверждение email (TTL 24h);
//   auth:reset:{token}          — сброс пароля (TTL 1h, одноразовый).
// В Postgres остаётся только результат (emailVerifiedAt, passwordHash).

// ============================================================
// Catalog
// ============================================================

model Category {
  id       String  @id @default(uuid()) @db.Uuid
  parentId String? @db.Uuid
  slug     String  @unique
  position Int     @default(0)

  parent       Category?             @relation("CategoryTree", fields: [parentId], references: [id], onDelete: SetNull)
  children     Category[]            @relation("CategoryTree")
  translations CategoryTranslation[]
  products     Product[]

  @@index([parentId])
  @@index([position])
  @@map("categories")
}

model CategoryTranslation {
  id         String   @id @default(uuid()) @db.Uuid
  categoryId String   @db.Uuid
  locale     String
  name       String

  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([categoryId, locale])
  @@map("category_translations")
}

model Product {
  id         String        @id @default(uuid()) @db.Uuid
  categoryId String        @db.Uuid
  slug       String        @unique
  status     ProductStatus @default(draft)
  ratingAvg  Decimal?      @db.Decimal(3, 2) // денормализация из Review
  attributes Json          @default("{}") @db.JsonB // гео, тип аккаунта, лимиты
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  category      Category             @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  translations  ProductTranslation[]
  variants      ProductVariant[]
  reviews       Review[]

  @@index([categoryId])
  @@index([status])
  @@map("products")
}

model ProductTranslation {
  id          String  @id @default(uuid()) @db.Uuid
  productId   String  @db.Uuid
  locale      String
  name        String
  description String? @db.Text

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, locale])
  @@map("product_translations")
}

model ProductVariant {
  id           String       @id @default(uuid()) @db.Uuid
  productId    String       @db.Uuid
  sku          String       @unique
  price        Decimal      @db.Decimal(18, 2)
  currency     String       @default("USD") // валюта учёта
  deliveryType DeliveryType // производный снимок: auto ⇔ READY_STOCK, manual ⇔ MADE_TO_ORDER
  stockCount   Int          @default(0) // кэш доступного стока (для READY_STOCK)
  isActive     Boolean      @default(true)
  attributes   Json         @default("{}") @db.JsonB

  // --- Расширения docs/15 (модель выдачи и прогрев) ---
  fulfillmentType FulfillmentType @default(READY_STOCK)
  goal            String? // цель прогрева: google_ads, chrome_extension_dev, … (для MADE_TO_ORDER)
  tier            String? // тариф прогрева, напр. warm_7d
  warmingPlanId   String?         @db.Uuid // план прогрева (для MADE_TO_ORDER), E6
  bundleSpec      Json    @default("[]") @db.JsonB // состав комплекта: [{ "type": "ACCOUNT" }, { "type": "PROXY", "meta": { "geo": "US", "kind": "residential" } }, …]
  etaMinutes      Int? // кэш расчётной ETA (для MADE_TO_ORDER)
  warrantyHours   Int? // окно гарантии/замены

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  product     Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  warmingPlan WarmingPlan? @relation(fields: [warmingPlanId], references: [id], onDelete: SetNull)
  stockItems  StockItem[]
  orderItems  OrderItem[]
  cartItems   CartItem[]

  @@index([productId])
  @@index([isActive])
  @@index([fulfillmentType])
  @@index([goal])
  @@index([warmingPlanId])
  @@map("product_variants")
}

// ============================================================
// Stock (auto-delivery pool)
// ============================================================

model StockItem {
  id            String      @id @default(uuid()) @db.Uuid
  variantId     String      @db.Uuid
  payload       String      @db.Text // ЗАШИФРОВАНО на уровне приложения (AES-256-GCM)
  payloadHash   String // SHA-256 исходного payload — дедуп при импорте (повторный импорт идемпотентен)
  status        StockStatus @default(available)
  reservedUntil DateTime? // TTL резерва
  orderItemId   String?     @db.Uuid // привязка после продажи; qty > 1 → несколько единиц на одну позицию
  createdAt     DateTime    @default(now())

  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  orderItem OrderItem?     @relation(fields: [orderItemId], references: [id], onDelete: SetNull)
  delivery  Delivery?

  @@unique([variantId, payloadHash]) // одинаковая строка не импортируется дважды в один вариант
  @@index([variantId, status]) // быстрый подбор available для резерва/выдачи
  @@index([status, reservedUntil]) // воркер снятия просроченных резервов
  @@index([orderItemId])
  @@map("stock_items")
}

// ============================================================
// Cart (черновик заказа пользователя)
// ============================================================

model Cart {
  id        String     @id @default(uuid()) @db.Uuid
  userId    String     @unique @db.Uuid
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  user  User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  items CartItem[]

  @@map("carts")
}

model CartItem {
  id        String   @id @default(uuid()) @db.Uuid
  cartId    String   @db.Uuid
  variantId String   @db.Uuid
  quantity  Int      @default(1)
  createdAt DateTime @default(now())

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([cartId, variantId])
  @@map("cart_items")
}

// ============================================================
// Orders
// ============================================================

model Order {
  id          String      @id @default(uuid()) @db.Uuid
  userId      String      @db.Uuid
  number      String      @unique // человекочитаемый номер, напр. AV-2026-000123
  status      OrderStatus @default(pending)
  subtotal    Decimal     @db.Decimal(18, 2)
  discount    Decimal     @default(0) @db.Decimal(18, 2)
  total       Decimal     @db.Decimal(18, 2)
  currency    String      @default("USD")
  promoCodeId String?     @db.Uuid
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  user      User       @relation(fields: [userId], references: [id], onDelete: Restrict)
  promoCode PromoCode? @relation(fields: [promoCodeId], references: [id], onDelete: SetNull)
  items     OrderItem[]
  tickets   Ticket[]
  reviews   Review[]

  @@index([userId, createdAt])
  @@index([status])
  @@map("orders")
}

model OrderItem {
  id             String                  @id @default(uuid()) @db.Uuid
  orderId        String                  @db.Uuid
  variantId      String                  @db.Uuid
  sku            String // снимок SKU на момент покупки
  nameSnapshot   Json                    @default("{}") @db.JsonB // снимок отображаемого имени { "en": "...", "ru": "..." }
  quantity       Int
  unitPrice      Decimal                 @db.Decimal(18, 2) // снимок цены на момент покупки
  deliveryType   DeliveryType // снимок типа выдачи
  deliveryStatus OrderItemDeliveryStatus @default(pending)

  order      Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant    ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  deliveries Delivery[] // qty > 1 → одна Delivery на каждую проданную единицу StockItem
  stockItems StockItem[] // обратная сторона StockItem.orderItem
  warmingJob WarmingJob? // MADE_TO_ORDER: 1:1 задача прогрева (E6)
  reviews    Review[]

  @@index([orderId])
  @@index([deliveryStatus])
  @@map("order_items")
}

// ============================================================
// Delivery (выдача данных покупателю)
// ============================================================

model Delivery {
  id          String       @id @default(uuid()) @db.Uuid
  orderItemId String       @db.Uuid
  stockItemId String?      @unique @db.Uuid // для auto
  bundleId    String?      @unique @db.Uuid // для warm (комплект прогрева), E6
  payload     String       @db.Text // ЗАШИФРОВАНО, снимок выданного
  deliveredBy String?      @db.Uuid // админ/оператор (manual/warm/replacement)
  deliveredAt DateTime?
  type        DeliveryKind
  createdAt   DateTime     @default(now())

  orderItem   OrderItem  @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  stockItem   StockItem? @relation(fields: [stockItemId], references: [id], onDelete: SetNull)
  bundle      Bundle?    @relation(fields: [bundleId], references: [id], onDelete: SetNull)
  deliveredByUser User?  @relation("DeliveredBy", fields: [deliveredBy], references: [id], onDelete: SetNull)

  @@index([orderItemId])
  @@map("deliveries")
}

// ============================================================
// Warming (MADE_TO_ORDER) — E6 (docs/12, docs/14, docs/15)
// ============================================================

// План прогрева: упорядоченный шаблон этапов под goal/tier. Версионируется —
// Job фиксирует planVersion + снимок этапов, поэтому правки плана не ломают
// уже идущие задачи.
model WarmingPlan {
  id        String   @id @default(uuid()) @db.Uuid
  goal      String
  tier      String?
  name      String
  version   Int      @default(1)
  isActive  Boolean  @default(true)
  qcRules   Json     @default("{}") @db.JsonB
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  stages   WarmingStageTemplate[]
  variants ProductVariant[]
  jobs     WarmingJob[]

  @@unique([goal, tier, version]) // ключ upsert сидера; правки бампят version
  @@index([goal, isActive])
  @@map("warming_plans")
}

model WarmingStageTemplate {
  id                 String @id @default(uuid()) @db.Uuid
  planId             String @db.Uuid
  order              Int // 0-based
  name               String
  expectedMinutes    Int // ожидаемая длительность — вклад в ETA/SLA
  checklist          Json   @default("[]") @db.JsonB
  requiredComponents Json   @default("[]") @db.JsonB // PROXY/OCTO/… готовит этап

  plan WarmingPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@unique([planId, order])
  @@index([planId])
  @@map("warming_stage_templates")
}

// Задача прогрева: одна на MADE_TO_ORDER-позицию. Фиксирует план (planId +
// planVersion) и stagesSnapshot — ETA/прогресс переживают правки плана.
model WarmingJob {
  id             String           @id @default(uuid()) @db.Uuid
  orderItemId    String           @unique @db.Uuid
  planId         String?          @db.Uuid
  planVersion    Int
  goal           String?
  status         WarmingJobStatus @default(queued)
  assignedTo     String?          @db.Uuid // оператор (User support/admin; StaffUser в E8)
  etaAt          DateTime? // ожидаемое время выдачи покупателю
  slaDueAt       DateTime? // внутренний дедлайн
  startedAt      DateTime?
  readyAt        DateTime?
  deliveredAt    DateTime?
  currentStage   Int              @default(0) // число завершённых этапов
  stageCount     Int              @default(0)
  stagesSnapshot Json             @default("[]") @db.JsonB // [{order,name,expectedMinutes}]
  notes          String?          @db.Text
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  orderItem    OrderItem     @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  plan         WarmingPlan?  @relation(fields: [planId], references: [id], onDelete: SetNull)
  assignedUser User?         @relation("WarmingAssignee", fields: [assignedTo], references: [id], onDelete: SetNull)
  tasks        WarmingTask[]
  accountAsset AccountAsset?
  bundle       Bundle?
  proxyItem    ProxyItem?    @relation("JobProxy") // ≤1 прокси на задачу (E7)
  octoProfile  OctoProfile?  @relation("JobOcto") // ≤1 Octo-профиль на задачу (E7)

  @@index([status])
  @@index([goal, status])
  @@index([assignedTo])
  @@map("warming_jobs")
}

model WarmingTask {
  id              String            @id @default(uuid()) @db.Uuid
  jobId           String            @db.Uuid
  stageTemplateId String?           @db.Uuid
  order           Int
  name            String // снимок названия этапа
  expectedMinutes Int
  status          WarmingTaskStatus @default(pending)
  checklistState  Json              @default("{}") @db.JsonB
  startedAt       DateTime?
  doneAt          DateTime?
  operatorId      String?           @db.Uuid
  attachments     Json              @default("[]") @db.JsonB // без секретов

  job WarmingJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([jobId, order])
  @@index([jobId])
  @@map("warming_tasks")
}

// Данные аккаунта под warm-заказ. payload/recovery — ЗАШИФРОВАНО (AES-256-GCM).
model AccountAsset {
  id        String   @id @default(uuid()) @db.Uuid
  jobId     String   @unique @db.Uuid
  payload   String   @db.Text // ЗАШИФРОВАНО
  recovery  String?  @db.Text // ЗАШИФРОВАНО
  meta      Json     @default("{}") @db.JsonB // без секретов
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  job WarmingJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@map("account_assets")
}

// --- Инвентарь: прокси и Octo-профили, E7 (docs/12, docs/15) ---
// Платформа только УЧИТЫВАЕТ ресурсы и их связки с задачами; провижининг
// (покупка прокси, создание Octo-профилей) — ручная работа оператора вне кода
// (граница платформы, docs/09). Секреты (credentials/exportRef) — AES-256-GCM
// на уровне приложения, не логируются, не возвращаются операторскими эндпоинтами;
// покупатель видит их только в комплекте Vault после выдачи.

model ProxyItem {
  id              String      @id @default(uuid()) @db.Uuid
  type            ProxyType
  geo             String
  provider        String
  credentials     String      @db.Text // ЗАШИФРОВАНО — host:port:user:pass
  credentialsHash String      @unique // SHA-256 от plaintext — дедуп импорта / глобальная уникальность
  status          ProxyStatus @default(available)
  expiresAt       DateTime?
  assignedJobId   String?     @unique @db.Uuid // активная привязка (одна задача за раз)
  meta            Json        @default("{}") @db.JsonB
  createdBy       String?     @db.Uuid
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  assignedJob  WarmingJob?   @relation("JobProxy", fields: [assignedJobId], references: [id], onDelete: SetNull)
  octoProfiles OctoProfile[]

  @@index([status])
  @@index([type, geo])
  @@map("proxy_items")
}

model OctoProfile {
  id             String            @id @default(uuid()) @db.Uuid
  externalId     String? // идентификатор профиля в Octo
  name           String
  proxyItemId    String?           @db.Uuid // связанный прокси (обычно прокси задачи)
  jobId          String?           @unique @db.Uuid // привязка к задаче (один профиль на задачу)
  status         OctoProfileStatus @default(draft)
  exportRef      String?           @db.Text // ЗАШИФРОВАНО — ссылка на экспорт/шеринг
  fingerprintRef Json? // референс конфигурации отпечатка (без секретов)
  meta           Json              @default("{}") @db.JsonB
  createdBy      String?           @db.Uuid
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  proxyItem ProxyItem?  @relation(fields: [proxyItemId], references: [id], onDelete: SetNull)
  job       WarmingJob? @relation("JobOcto", fields: [jobId], references: [id], onDelete: SetNull)

  @@index([status])
  @@map("octo_profiles")
}

// Собранный комплект выдачи для warm-заказа.
model Bundle {
  id          String       @id @default(uuid()) @db.Uuid
  jobId       String       @unique @db.Uuid
  status      BundleStatus @default(assembling)
  assembledBy String?      @db.Uuid
  qcBy        String?      @db.Uuid
  deliveredAt DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  job        WarmingJob        @relation(fields: [jobId], references: [id], onDelete: Cascade)
  components BundleComponent[]
  delivery   Delivery?

  @@map("bundles")
}

model BundleComponent {
  id        String              @id @default(uuid()) @db.Uuid
  bundleId  String              @db.Uuid
  type      BundleComponentType
  refId     String?             @db.Uuid // ProxyItem/OctoProfile/AccountAsset (ресурсы — E7)
  payload   String?             @db.Text // ЗАШИФРОВАНО, инлайновые данные/ссылка
  meta      Json                @default("{}") @db.JsonB
  createdAt DateTime            @default(now())

  bundle Bundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)

  @@index([bundleId])
  @@map("bundle_components")
}

// ============================================================
// Wallet / Ledger (двойная запись)
// ============================================================

model LedgerEntry {
  id           String          @id @default(uuid()) @db.Uuid
  userId       String          @db.Uuid
  direction    LedgerDirection
  amount       Decimal         @db.Decimal(18, 2) // всегда положительное
  balanceAfter Decimal         @db.Decimal(18, 2) // снимок баланса после операции
  refType      LedgerRefType
  refId        String          @db.Uuid // ссылка на источник (topup/order/...)
  createdAt    DateTime        @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([userId, createdAt])
  @@unique([refType, refId, direction]) // защита от двойного проведения одного источника
  @@map("ledger_entries")
}

model TopUp {
  id         String      @id @default(uuid()) @db.Uuid
  userId     String      @db.Uuid
  provider   String // напр. cryptomus
  externalId String?     @unique // id платежа у эквайринга (идемпотентность); null пока не получен
  amount     Decimal     @db.Decimal(18, 2)
  asset      String // USDT/BTC/ETH + сеть
  fee        Decimal?    @db.Decimal(18, 2) // комиссия эквайринга для сходимости
  status     TopUpStatus @default(pending)
  paymentUrl String?
  address    String?
  expiresAt  DateTime?
  createdAt  DateTime    @default(now())
  paidAt     DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([userId, createdAt])
  @@index([status, expiresAt]) // воркер закрытия просроченных pending
  @@map("topups")
}

model PromoCode {
  id        String    @id @default(uuid()) @db.Uuid
  code      String    @unique
  type      PromoType
  value     Decimal   @db.Decimal(18, 2)
  maxUses   Int?
  usedCount Int       @default(0)
  expiresAt DateTime?
  createdAt DateTime  @default(now())

  orders Order[]

  @@map("promo_codes")
}

// ============================================================
// Support (E8, migration 20260715000000_tickets_settings)
// ============================================================

// TicketStatus: open → pending → resolved → closed (см. openapi.md)
// TicketPriority: low | normal | high | urgent

model Ticket {
  id          String         @id @default(uuid()) @db.Uuid
  number      String         @unique // TK-2026-000042
  subject     String
  status      TicketStatus   @default(open)
  priority    TicketPriority @default(normal)
  requesterId String         @db.Uuid // покупатель, от лица которого тикет
  assigneeId  String?        @db.Uuid // сотрудник (support/manager/admin)
  orderId     String?        @db.Uuid // опц. привязка к заказу
  lastReplyAt DateTime       @default(now()) // сортировка очереди
  closedAt    DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  requester User            @relation("TicketRequester", fields: [requesterId], references: [id], onDelete: Restrict)
  assignee  User?           @relation("TicketAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  order     Order?          @relation(fields: [orderId], references: [id], onDelete: SetNull)
  messages  TicketMessage[]

  @@index([status, lastReplyAt])
  @@index([assigneeId])
  @@index([requesterId])
  @@map("tickets")
}

model TicketMessage {
  id         String   @id @default(uuid()) @db.Uuid
  ticketId   String   @db.Uuid
  authorId   String?  @db.Uuid // сотрудник/покупатель; null — системное событие
  body       String   @db.Text
  isInternal Boolean  @default(false) // внутренняя заметка — не видна покупателю
  createdAt  DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author User?  @relation("TicketMessageAuthor", fields: [authorId], references: [id], onDelete: SetNull)

  @@index([ticketId, createdAt])
  @@map("ticket_messages")
}

// ============================================================
// Settings / Integrations (E8, docs/13 §17)
// ============================================================

// Key-value стор настроек магазина. Типизированный слой в коде маппит известные
// ключи (`store`, `notifications`) на секции ShopSettings; интеграционные флаги
// (crypto/KMS/Octo) выводятся из env read-only. Секреты здесь НЕ хранятся.
model Setting {
  key       String   @id
  value     Json     @default("{}") @db.JsonB
  updatedAt DateTime @updatedAt
  updatedBy String?  @db.Uuid

  @@map("settings")
}

// ============================================================
// Notifications (E9)
// ============================================================
//
// Уведомления покупателя: in-app лента + бейдж непрочитанного. На событие
// (order.paid / warming.ready / ticket.reply) сервис рендерит шаблон из Settings
// в локали получателя (User.locale) и параллельно шлёт email через mailer.
// `data` — только несекретный контекст для диплинка (id/номер заказа/тикета).
// `readAt` = null до подтверждения. Скоуп строго по владельцу (userId).

enum NotificationType {
  order_paid
  warming_ready
  ticket_reply
}

model Notification {
  id        String           @id @default(uuid()) @db.Uuid
  userId    String           @db.Uuid
  type      NotificationType
  title     String
  body      String           @db.Text
  data      Json             @default("{}") @db.JsonB
  readAt    DateTime?
  createdAt DateTime         @default(now())

  user User @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt]) // непрочитанные + бейдж
  @@index([userId, createdAt]) // лента по времени
  @@map("notifications")
}

// ============================================================
// Reviews
// ============================================================

model Review {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  productId   String   @db.Uuid
  orderId     String   @db.Uuid
  orderItemId String?  @db.Uuid
  rating      Int // 1..5 (валидируется в приложении)
  body        String?  @db.Text
  createdAt   DateTime @default(now())

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  product   Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  order     Order      @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderItem OrderItem? @relation(fields: [orderItemId], references: [id], onDelete: SetNull)

  @@unique([userId, productId, orderId]) // один отзыв на купленный товар в рамках заказа
  @@index([productId, createdAt])
  @@map("reviews")
}

// ============================================================
// Audit & idempotency
// ============================================================

model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  actorId   String?  @db.Uuid
  action    String // напр. order.refund, user.block
  entity    String // напр. Order, User
  entityId  String?  @db.Uuid
  diff      Json     @default("{}") @db.JsonB
  createdAt DateTime @default(now())

  actor User? @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entity, entityId])
  @@index([actorId, createdAt])
  @@map("audit_logs")
}

model IdempotencyKey {
  id           String   @id @default(uuid()) @db.Uuid
  key          String // значение заголовка Idempotency-Key
  userId       String?  @db.Uuid
  endpoint     String // напр. POST /orders/checkout
  requestHash  String // хэш тела запроса — защита от коллизий ключа
  responseCode Int?
  responseBody Json?    @db.JsonB
  createdAt    DateTime @default(now())

  @@unique([key, endpoint])
  @@index([createdAt])
  @@map("idempotency_keys")
}
```

---

## Пояснения к ключевым решениям

### Почему ledger (двойная запись)
- Любое движение денег (`topup`, `order`, `refund`, `adjustment`, `replacement`) создаёт строку `LedgerEntry` с `direction` (credit/debit), положительным `amount` и снимком `balanceAfter`.
- `User.balance` — денормализованный кэш для быстрого чтения; его корректность в любой момент проверяется как `SUM(credit) - SUM(debit)` по пользователю.
- Все изменения баланса выполняются **в одной транзакции БД** вместе с изменением статуса источника (TopUp/Order) — атомарность гарантирует сходимость.

### Где шифрование payload
- `StockItem.payload` и `Delivery.payload` — единственные секретные поля. Шифруются в сервисном слое **до** записи в БД (AES-256-GCM; случайный IV на запись; версия ключа зашита в шифртекст `v<N>.<iv>.<tag>.<ct>`). Ключи — env `PAYLOAD_ENCRYPTION_KEY` со списком версий (`v1:<base64>[,v0:<base64>]`): первый шифрует, все расшифровывают. В схеме это обычный `String @db.Text`.
- Расшифровка — только на сервере, только владельцу заказа (эндпоинт `GET /orders/:id/items/:itemId/delivery`), каждый доступ пишется в `AuditLog` (`action=delivery.payload_accessed`). Чужой заказ отвечает 404 (существование не раскрывается), невыданная позиция — 404.

### Где идемпотентность
- **Вебхуки эквайринга** — `TopUp.externalId @unique`. Повторная доставка вебхука находит уже `paid` TopUp и выходит без повторного зачисления. Переход в `paid` разрешён из `pending` **и** из `expired` (оплата, пришедшая после TTL, всё равно зачисляется — средства получены). Неизвестный `externalId` игнорируется с 200 (событие не наше).
- **Проведение в ledger** — составной `@@unique([refType, refId, direction])` не даёт дважды провести один источник.
- **Мутации оплаты клиента** (`checkout`, `topups`) — таблица `IdempotencyKey` c `@@unique([key, endpoint])`; запись создаётся до обработки (claim), ответ сохраняется после. Повтор с тем же ключом: совпал `requestHash` (хэш тела + userId) — возвращается сохранённый ответ; не совпал или первый запрос ещё в полёте — `409 IDEMPOTENCY_CONFLICT`.

### Где резерв стока
- **С E5** источник истины наличия — пул `StockItem`; `ProductVariant.stockCount` — кэш, пересчитываемый как `COUNT(status='available')` после каждой мутации пула (импорт, резерв, продажа, снятие резерва).
- Checkout двухфазный: **фаза 1 (до денежной транзакции)** — атомарный claim конкретных единиц `available → reserved` (`updateMany` с guard по `status`) c `reservedUntil = now + STOCK_RESERVE_TTL_SECONDS`; параллельно ставится быстрый TTL-ключ в Redis (`stock:hold:{id}`). Недобор единиц → `OUT_OF_STOCK`, свои резервы снимаются. **Фаза 2 (в денежной транзакции)** — `reserved → sold` (guard по `status=reserved` и нашим id), проставляется `orderItemId`, создаётся `Delivery(type=auto)` со снимком payload, `deliveryStatus=delivered`. Ошибка транзакции (напр. `INSUFFICIENT_BALANCE`) снимает резервы обратно в `available`.
- Просроченные резервы снимает sweep (интервал + ленивое снятие перед подбором): `status=reserved AND reservedUntil < now → available`.
- Индекс `@@index([variantId, status])` ускоряет подбор `available` под резерв; `@@index([status, reservedUntil])` — для sweep'а.
- **Политика нехватки в момент оплаты (решение E5):** checkout отклоняется целиком (`409 OUT_OF_STOCK`, транзакция откатывается, деньги не списываются). Перевод недостающих позиций в ручную выдачу/warm — вместе с операторкой (E6/E8), как допускает docs/08.

### Прогрев (MADE_TO_ORDER), E6
- **Создание задачи в оплате.** В той же транзакции checkout для каждой warm-позиции создаётся `WarmingJob(status=queued)` + `WarmingTask` на каждый этап; `OrderItem.deliveryStatus=queued`. План (`ProductVariant.warmingPlanId`) и его этапы **снимаются** на задачу (`planVersion` + `stagesSnapshot`), поэтому последующие правки плана не ломают идущие задачи (версионирование, docs/15).
- **ETA.** `etaAt = createdAt + Σ expectedMinutes` активных этапов. При `on_hold` пересчитывается как `now + Σ` оставшихся этапов `+ WARMING_HOLD_BUFFER_MINUTES`; при `resume` — без буфера (ETA сжимается по мере прогресса). У warm-варианта без плана — один синтетический этап из `etaMinutes` (fallback `WARMING_DEFAULT_STAGE_MINUTES`).
- **Статусы.** `WarmingJob.status` зеркалится на `OrderItem.deliveryStatus` (queued→…→delivered, on_hold, failed, refunded); статус заказа — агрегат позиций (docs/14). Машина переходов и маппинг проверяются на сервере (`409 CONFLICT` на нелегальный переход).
- **failed → решает оператор** (docs/14): `reassign` (→queued, tasks сбрасываются, ETA заново) **или** `refund` (кредит в ledger `refType=refund`, `refId=orderItemId` — уникальность защищает от двойного возврата; позиция/задача становятся `refunded`). Автоматического движения денег на `failed` нет.
- **Сборка и выдача.** На `deliver` требуется `AccountAsset` (иначе `409`): создаётся `Bundle(delivered)` + `BundleComponent` по `bundleSpec`, собирается читаемый комплект и пишется `Delivery(type=warm, bundleId)` со снимком **зашифрованного** payload — далее переиспользуется E5-путь Vault (расшифровка только владельцу + `AuditLog`).
- **Шифрование.** `AccountAsset.payload/recovery`, `BundleComponent.payload`, `Delivery.payload` — AES-256-GCM на уровне приложения (тот же key-ring, что и E5). Секреты не логируются (аудит фиксирует только факт захвата/выдачи).
- **RBAC.** Все операторские маршруты `/admin/warming/*` — роли `admin`/`support` (support = операторская роль до `StaffUser` в E8).

### Инвентарь: прокси и Octo-профили, E7
- **Модели.** `ProxyItem` (тип/гео/провайдер/`credentials` зашифр./статус/`expiresAt`/`assignedJobId`) и `OctoProfile` (`externalId`/`name`/`proxyItemId`/`jobId`/статус/`exportRef` зашифр./`fingerprintRef`). Провижининг — вручную оператором; платформа только фиксирует ресурсы и связки (граница, docs/09).
- **Гранулярность (решение E7):** ≤1 прокси и ≤1 Octo-профиль на задачу — на уровне БД `ProxyItem.assignedJobId @unique` и `OctoProfile.jobId @unique`. Соответствует `bundleSpec` (одиночные PROXY/OCTO_PROFILE).
- **Резерв/привязка (exactly-once).** `bind` — guarded `updateMany` по свободному ресурсу: прокси `available → assigned` (`where: {id, status:'available', assignedJobId:null}`), Octo `draft|ready → ready` c проставлением `jobId` (`where: {id, jobId:null}`); `count===0 → 409` (ресурс занят). Octo по умолчанию линкует прокси задачи. Привязка к `delivered`/`refunded` задаче запрещена (409).
- **Повторное использование (решение E7):** ресурс **выделенный** — после выдачи это ресурс покупателя. На `deliver` Octo-профиль → `delivered`, прокси остаётся `assigned` (нет автоворота в пул). Оператор может `unbind` до выдачи (прокси → `available`, Octo → `draft`).
- **Формат импорта прокси (решение E7):** `POST /admin/inventory/proxies/import` — JSON `{items:[…]}` **или** `text/plain` (строка `type,geo,provider,host:port:user:pass[,expiresAt]`, `#` — комментарий). Дедуп по `credentialsHash` (SHA-256 plaintext, `@unique`): дубли в батче и уже существующие пропускаются. Octo импорта нет — создаётся поштучно.
- **Сборка комплекта (E7 ⟶ E6).** `assembleAndDeliver` для компонентов `PROXY`/`OCTO_PROFILE` из `bundleSpec` подставляет **реальный** привязанный ресурс: `BundleComponent.refId` → ресурс, `payload` — снимок шифртекста (`credentials`/`exportRef`), `meta` — непарольные данные (гео/провайдер/имя/externalId); расшифрованные значения попадают только в единый зашифрованный `Delivery.payload` владельца. Если ресурс не привязан — строка «pending assignment» (мягкий фолбэк).
- **Шифрование/аудит.** `ProxyItem.credentials`, `OctoProfile.exportRef`, `BundleComponent.payload` — AES-256-GCM (тот же key-ring E5). Секреты не логируются и не возвращаются операторскими эндпоинтами (`ProxyItemView`/`OctoProfileView` без секретов); аудит фиксирует только факт (`inventory.proxy_created|proxy_import|proxy_bound|octo_created|octo_bound|…`).
- **RBAC.** Все маршруты `/admin/inventory/*` и `GET /admin/warming/jobs/:id/inventory` — роли `admin`/`support`.

---

## Заметки по миграциям

- `prisma migrate dev --name init` для локали; `prisma migrate deploy` в CI/проде.
- Включить расширение для UUID при необходимости серверной генерации: `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` (по умолчанию UUID генерирует Prisma-клиент, расширение не обязательно).
- Денежные и enum-поля менять только через миграции; сужение enum — двухшаговая миграция (сначала перестать писать значение, затем удалить).
- Частичные индексы (напр. только по `status = 'available'`) добавлять сырым SQL внутри миграции, если понадобится оптимизация под нагрузку.
- Для `Review.rating` (1..5) и неотрицательных денег добавить CHECK-констрейнты сырым SQL в миграции (`rating BETWEEN 1 AND 5`, `amount >= 0`).

## Заметки по сидированию демо-данных (`prisma/seed.ts`)

1. Пользователи: `admin@advault.dev` (role=admin), `support@advault.dev` (role=support), `user@advault.dev` (role=user, balance=0).
2. Категории с переводами EN/RU (напр. `google-ads`), дерево 1–2 уровня.
3. 3–6 продуктов с переводами EN/RU, у каждого 1–2 варианта; обязательно есть
   warm-варианты (`fulfillmentType=MADE_TO_ORDER`) с `goal=google_ads` и
   `goal=chrome_extension_dev`, заполненными `tier`, `bundleSpec`, `etaMinutes`,
   `warrantyHours`. `deliveryType` всегда согласован с `fulfillmentType`.
3a. **Планы прогрева (E6):** `WarmingPlan` + `WarmingStageTemplate` под
   `google_ads` (`warm_7d`/`warm_14d`/`agency`) и `chrome_extension_dev`
   (`warm_5d`); сумма `expectedMinutes` этапов = `etaMinutes` варианта.
   MADE_TO_ORDER-варианты линкуются на план через `warmingPlanId` (по `goal:tier`).
   Идемпотентность — upsert по `(goal, tier, version)` и `(planId, order)`.
4. Для `auto`-вариантов — 10–20 `StockItem(status=available)` с уже зашифрованным демо-`payload` (детерминированные строки → идемпотентность через `payloadHash`); `stockCount` пересчитывается от реального пула.
5. Демо-`PromoCode`: `AURORA10` (percent, 10%), `SAVE5` (fixed, 5.00), `EXPIRED10`
   (percent, истёкший — для проверки валидации).
6. Идемпотентность сидов: `upsert` по уникальным ключам (email, slug, sku, code), чтобы повторный запуск не дублировал данные.
7. Никаких реальных секретов в сидах — payload только фиктивный.
</content>
</invoke>
