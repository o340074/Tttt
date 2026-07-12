# Backend — Prisma-схема БД (AdVault)

Готовая к реализации схема данных для NestJS + PostgreSQL + Prisma.
Источник истины по сущностям — [`05-data-model.md`](../05-data-model.md),
по потокам оплаты/выдачи — [`08-payments-delivery.md`](../08-payments-delivery.md).

Ключевые архитектурные решения:

- **Деньги** — только `Decimal @db.Decimal(18,2)`, никогда `Float`. Валюта учёта хранится отдельным полем (`currency`).
- **Баланс через ledger (двойная запись).** `User.balance` — кэш; источник истины — сумма движений `LedgerEntry`. Каждая запись хранит `balanceAfter` (снимок), что даёт быструю сверку и аудит.
- **Идемпотентность.** `TopUp.externalId` — `@unique`, повторный вебхук эквайринга не задваивает зачисление. Для мутаций оплаты — таблица `IdempotencyKey` (заголовок `Idempotency-Key`).
- **Шифрование payload.** `StockItem.payload` и `Delivery.payload` шифруются **на уровне приложения** (envelope-шифрование, ключ в KMS/секрете), в БД лежит уже зашифрованный текст. Prisma об этом «не знает» — тип `String @db.Text`.
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
  admin
}

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

enum OrderItemDeliveryStatus {
  pending
  awaiting_manual
  delivered
  replaced
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
  // warmingPlanId придёт в E6 вместе с моделью WarmingPlan.
  bundleSpec      Json    @default("[]") @db.JsonB // состав комплекта: [{ "type": "ACCOUNT" }, { "type": "PROXY", "meta": { "geo": "US", "kind": "residential" } }, …]
  etaMinutes      Int? // кэш расчётной ETA (для MADE_TO_ORDER)
  warrantyHours   Int? // окно гарантии/замены

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  product    Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  stockItems StockItem[]
  orderItems OrderItem[]
  cartItems  CartItem[]

  @@index([productId])
  @@index([isActive])
  @@index([fulfillmentType])
  @@index([goal])
  @@map("product_variants")
}

// ============================================================
// Stock (auto-delivery pool)
// ============================================================

model StockItem {
  id            String      @id @default(uuid()) @db.Uuid
  variantId     String      @db.Uuid
  payload       String      @db.Text // ЗАШИФРОВАНО на уровне приложения
  status        StockStatus @default(available)
  reservedUntil DateTime? // TTL резерва
  orderItemId   String?     @unique @db.Uuid // привязка после продажи (1:1 с Delivery-источником)
  createdAt     DateTime    @default(now())

  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  orderItem OrderItem?     @relation(fields: [orderItemId], references: [id], onDelete: SetNull)
  delivery  Delivery?

  @@index([variantId, status]) // быстрый подбор available для резерва/выдачи
  @@index([status, reservedUntil]) // воркер снятия просроченных резервов
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
  quantity       Int
  unitPrice      Decimal                 @db.Decimal(18, 2) // снимок цены на момент покупки
  deliveryType   DeliveryType // снимок типа выдачи
  deliveryStatus OrderItemDeliveryStatus @default(pending)

  order      Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant    ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  deliveries Delivery[]
  stockItem  StockItem? // обратная сторона StockItem.orderItem
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
  payload     String       @db.Text // ЗАШИФРОВАНО, снимок выданного
  deliveredBy String?      @db.Uuid // админ (для manual/replacement)
  deliveredAt DateTime?
  type        DeliveryKind
  createdAt   DateTime     @default(now())

  orderItem   OrderItem  @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  stockItem   StockItem? @relation(fields: [stockItemId], references: [id], onDelete: SetNull)
  deliveredByUser User?  @relation("DeliveredBy", fields: [deliveredBy], references: [id], onDelete: SetNull)

  @@index([orderItemId])
  @@map("deliveries")
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
// Support
// ============================================================

model Ticket {
  id        String         @id @default(uuid()) @db.Uuid
  userId    String         @db.Uuid
  orderId   String?        @db.Uuid
  subject   String
  status    TicketStatus   @default(open)
  priority  TicketPriority @default(normal)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  user     User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  order    Order?          @relation(fields: [orderId], references: [id], onDelete: SetNull)
  messages TicketMessage[]

  @@index([userId])
  @@index([status, priority])
  @@map("tickets")
}

model TicketMessage {
  id          String   @id @default(uuid()) @db.Uuid
  ticketId    String   @db.Uuid
  authorId    String   @db.Uuid
  body        String   @db.Text
  attachments Json     @default("[]") @db.JsonB
  createdAt   DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author User   @relation(fields: [authorId], references: [id], onDelete: Restrict)

  @@index([ticketId, createdAt])
  @@map("ticket_messages")
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
- `StockItem.payload` и `Delivery.payload` — единственные секретные поля. Шифруются в сервисном слое (envelope + KMS/секрет из окружения) **до** записи в БД. В схеме это обычный `String @db.Text`.
- Расшифровка — только на сервере, только владельцу заказа (эндпоинт `GET /orders/:id/items/:itemId/delivery`), каждый доступ пишется в `AuditLog`.

### Где идемпотентность
- **Вебхуки эквайринга** — `TopUp.externalId @unique`. Повторная доставка вебхука находит уже `paid` TopUp и выходит без повторного зачисления.
- **Проведение в ledger** — составной `@@unique([refType, refId, direction])` не даёт дважды провести один источник.
- **Мутации оплаты клиента** (`checkout`, `topups`) — таблица `IdempotencyKey` c `@@unique([key, endpoint])`; сохранённый ответ возвращается при повторе с тем же `Idempotency-Key`.

### Где резерв стока
- `StockItem.status = reserved` + `reservedUntil` фиксируют бронь на время оформления; параллельно ставится быстрый TTL в Redis.
- Индекс `@@index([variantId, status])` ускоряет подбор `available` под резерв; `@@index([status, reservedUntil])` — для воркера, снимающего просроченные резервы обратно в `available`.
- После оплаты `reserved → sold`, проставляется `orderItemId` и создаётся `Delivery`. `stockCount` на варианте обновляется как кэш.

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
4. Для `auto`-вариантов — 10–20 `StockItem(status=available)` с уже зашифрованным демо-`payload`; обновить `stockCount`.
5. Демо-`PromoCode` (percent 10%, fixed 5.00).
6. Идемпотентность сидов: `upsert` по уникальным ключам (email, slug, sku, code), чтобы повторный запуск не дублировал данные.
7. Никаких реальных секретов в сидах — payload только фиктивный.
</content>
</invoke>
