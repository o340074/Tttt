# Backend — OpenAPI 3.1 контракт (AdVault)

Детальный контракт REST/JSON API. Источник истины по поверхности — [`07-api-spec.md`](../07-api-spec.md),
по потокам — [`08-payments-delivery.md`](../08-payments-delivery.md).

Соглашения (из 07):
- Базовый префикс `/api/v1`.
- Аутентификация: JWT access — `Authorization: Bearer`, refresh — HTTP-only cookie.
- Деньги — строки с 2 знаками (`"12.50"`), валюта — отдельным полем.
- Пагинация — `?page=1&limit=20`, ответ включает `meta: { total, page, limit }`.
- Локаль — `Accept-Language` или `?locale=en|ru`.
- Идемпотентность мутаций оплаты — заголовок `Idempotency-Key`.
- Единый формат ошибки (`Error`), коды — `INSUFFICIENT_BALANCE`, `OUT_OF_STOCK` и др.

---

```yaml
openapi: 3.1.0
info:
  title: AdVault API
  version: 1.0.0
  description: >
    Маркетплейс цифровых товаров (рекламные аккаунты Google Ads).
    Оплата — внутренний баланс (ledger) + крипто-пополнение. Доставка — auto из стока и manual.
  contact:
    name: AdVault Backend
servers:
  - url: https://api.advault.example/api/v1
    description: Production
  - url: https://staging-api.advault.example/api/v1
    description: Staging
  - url: http://localhost:3000/api/v1
    description: Local

security:
  - bearerAuth: []

tags:
  - name: System
  - name: Auth
  - name: Users
  - name: Catalog
  - name: Cart
  - name: Orders
  - name: Delivery
  - name: Wallet
  - name: Webhooks
  - name: Support
  - name: Warming
  - name: Inventory
  - name: Admin

# ============================================================
# Components
# ============================================================
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Access-токен. Refresh-токен передаётся в HTTP-only cookie.

  parameters:
    Page:
      name: page
      in: query
      schema: { type: integer, minimum: 1, default: 1 }
    Limit:
      name: limit
      in: query
      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
    Locale:
      name: locale
      in: query
      required: false
      schema: { type: string, enum: [en, ru] }
    AcceptLanguage:
      name: Accept-Language
      in: header
      required: false
      schema: { type: string, example: "ru" }
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      description: Уникальный ключ мутации оплаты; повтор с тем же ключом возвращает первый ответ.
      schema: { type: string, format: uuid }

  headers:
    RateLimitRemaining:
      description: Остаток запросов в текущем окне.
      schema: { type: integer }

  schemas:
    HealthResponse:
      type: object
      required: [status, version, uptime, timestamp, dependencies]
      properties:
        status:
          type: string
          enum: [ok, degraded]
        version:
          type: string
          example: "0.1.0"
        uptime:
          type: number
          description: Секунды с момента старта процесса.
        timestamp:
          type: string
          format: date-time
        dependencies:
          type: object
          required: [database, redis]
          properties:
            database: { type: string, enum: [up, down] }
            redis: { type: string, enum: [up, down] }

    Money:
      type: string
      description: Денежная величина, строка с двумя знаками после точки.
      pattern: '^-?\d+\.\d{2}$'
      example: "12.50"

    Currency:
      type: string
      description: Валюта учёта (ISO-подобный код).
      example: "USD"

    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              enum:
                - VALIDATION_ERROR
                - UNAUTHORIZED
                - FORBIDDEN
                - NOT_FOUND
                - CONFLICT
                - RATE_LIMITED
                - INSUFFICIENT_BALANCE
                - OUT_OF_STOCK
                - EMAIL_NOT_VERIFIED
                - EMAIL_ALREADY_USED
                - INVALID_CREDENTIALS
                - INVALID_TOKEN
                - IDEMPOTENCY_CONFLICT
                - INVALID_SIGNATURE
                - REVIEW_NOT_ALLOWED
                - PROMO_INVALID
                - INTERNAL_ERROR
            message: { type: string }
            details:
              type: object
              additionalProperties: true
      example:
        error:
          code: INSUFFICIENT_BALANCE
          message: "Not enough balance to complete the order"
          details: { required: "20.00", available: "12.50" }

    PaginationMeta:
      type: object
      required: [total, page, limit]
      properties:
        total: { type: integer }
        page: { type: integer }
        limit: { type: integer }

    # ---------- Auth ----------
    RegisterRequest:
      type: object
      required: [email, password]
      properties:
        email: { type: string, format: email }
        password: { type: string, minLength: 8 }
        locale: { type: string, enum: [en, ru], default: en }

    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email: { type: string, format: email }
        password: { type: string }

    TokenResponse:
      type: object
      required: [accessToken, expiresIn]
      properties:
        accessToken: { type: string }
        expiresIn: { type: integer, description: TTL access-токена в секундах }
        tokenType: { type: string, default: Bearer }

    # ---------- User ----------
    User:
      type: object
      properties:
        id: { type: string, format: uuid }
        email: { type: string, format: email }
        role: { type: string, enum: [user, support, admin] }
        status: { type: string, enum: [active, blocked] }
        balance: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }
        locale: { type: string, enum: [en, ru] }
        emailVerifiedAt: { type: [string, "null"], format: date-time }
        createdAt: { type: string, format: date-time }

    UpdateMeRequest:
      type: object
      properties:
        locale: { type: string, enum: [en, ru] }

    ChangePasswordRequest:
      type: object
      required: [currentPassword, newPassword]
      properties:
        currentPassword: { type: string }
        newPassword: { type: string, minLength: 8 }

    # ---------- Catalog ----------
    Category:
      type: object
      properties:
        id: { type: string, format: uuid }
        parentId: { type: [string, "null"], format: uuid }
        slug: { type: string }
        position: { type: integer }
        name: { type: string, description: Локализованное имя по Accept-Language/locale }
        productCount: { type: integer, description: Кол-во опубликованных товаров в категории (без потомков) }
        children:
          type: array
          items: { $ref: '#/components/schemas/Category' }

    BundleComponent:
      type: object
      description: Компонент комплекта выдачи (docs/11). Параметры (гео, тип прокси, срок) — в meta.
      required: [type]
      properties:
        type:
          type: string
          enum: [ACCOUNT, PROXY, OCTO_PROFILE, RECOVERY, SECRETS, GUIDE, WARRANTY]
        meta:
          type: object
          additionalProperties: true

    ProductVariant:
      type: object
      properties:
        id: { type: string, format: uuid }
        sku: { type: string }
        # Локализованное имя варианта (attributes.name_<locale> либо tier/sku как fallback).
        name: { type: string }
        price: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }
        deliveryType: { type: string, enum: [auto, manual], description: Производное от fulfillmentType (auto ⇔ READY_STOCK) }
        fulfillmentType: { type: string, enum: [READY_STOCK, MADE_TO_ORDER] }
        goal: { type: [string, "null"], description: Цель прогрева (google_ads, chrome_extension_dev, …) }
        tier: { type: [string, "null"], description: Тариф прогрева (warm_7d, …) }
        stockCount: { type: integer, description: Доступно к покупке (для READY_STOCK) }
        etaMinutes: { type: [integer, "null"], description: Оценка времени выдачи в минутах (для MADE_TO_ORDER) }
        warrantyHours: { type: [integer, "null"], description: Окно гарантийной замены }
        bundle:
          type: array
          description: Состав комплекта выдачи.
          items: { $ref: '#/components/schemas/BundleComponent' }
        isActive: { type: boolean }
        attributes: { type: object, additionalProperties: true }

    Product:
      type: object
      properties:
        id: { type: string, format: uuid }
        categoryId: { type: string, format: uuid }
        categorySlug: { type: string }
        slug: { type: string }
        status: { type: string, enum: [draft, published, hidden] }
        ratingAvg: { type: [string, "null"] }
        name: { type: string }
        description: { type: [string, "null"] }
        attributes: { type: object, additionalProperties: true }
        variants:
          type: array
          items: { $ref: '#/components/schemas/ProductVariant' }

    ProductListItem:
      type: object
      properties:
        id: { type: string, format: uuid }
        slug: { type: string }
        categoryId: { type: string, format: uuid }
        categorySlug: { type: string }
        name: { type: string }
        ratingAvg: { type: [string, "null"] }
        minPrice: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }
        fulfillmentTypes:
          type: array
          description: Какие модели выдачи есть среди активных вариантов.
          items: { type: string, enum: [READY_STOCK, MADE_TO_ORDER] }
        stockCount: { type: integer, description: Суммарный сток по READY_STOCK-вариантам }
        etaMinutes: { type: [integer, "null"], description: Мин. ETA среди MADE_TO_ORDER-вариантов }
        attributes: { type: object, additionalProperties: true }

    Review:
      type: object
      properties:
        id: { type: string, format: uuid }
        userId: { type: string, format: uuid }
        rating: { type: integer, minimum: 1, maximum: 5 }
        body: { type: [string, "null"] }
        createdAt: { type: string, format: date-time }

    CreateReviewRequest:
      type: object
      required: [rating]
      properties:
        rating: { type: integer, minimum: 1, maximum: 5 }
        body: { type: string }
        orderId: { type: string, format: uuid, description: Заказ, подтверждающий покупку }

    # ---------- Cart ----------
    CartItem:
      type: object
      description: Позиция корзины. Имя и цена — живые (из варианта), не снимок.
      properties:
        id: { type: string, format: uuid }
        variantId: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string, description: Локализованное «товар · вариант» }
        productSlug: { type: string }
        quantity: { type: integer, minimum: 1 }
        unitPrice: { $ref: '#/components/schemas/Money' }
        lineTotal: { $ref: '#/components/schemas/Money' }
        fulfillmentType: { type: string, enum: [READY_STOCK, MADE_TO_ORDER] }
        stockCount: { type: integer, description: Текущий сток варианта (для READY_STOCK) }
        etaMinutes: { type: [integer, "null"], description: ETA (для MADE_TO_ORDER) }
        isActive: { type: boolean, description: false — вариант снят с продажи, позицию нужно убрать }
        attributes:
          type: object
          additionalProperties: true
          description: Атрибуты товара (иконка, гео и т.п.) для отрисовки строки.

    Cart:
      type: object
      properties:
        id: { type: string, format: uuid }
        items:
          type: array
          items: { $ref: '#/components/schemas/CartItem' }
        subtotal: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }

    PromoCodePublic:
      type: object
      description: Публичная часть промокода — для превью скидки в корзине.
      properties:
        code: { type: string }
        type: { type: string, enum: [percent, fixed] }
        value:
          allOf: [{ $ref: '#/components/schemas/Money' }]
          description: Процент (percent) либо сумма в валюте учёта (fixed).

    AddCartItemRequest:
      type: object
      required: [variantId, quantity]
      properties:
        variantId: { type: string, format: uuid }
        quantity: { type: integer, minimum: 1 }

    UpdateCartItemRequest:
      type: object
      required: [quantity]
      properties:
        quantity: { type: integer, minimum: 1 }

    # ---------- Orders / Delivery ----------
    CheckoutRequest:
      type: object
      description: >
        Оформление заказа из корзины пользователя (корзина 1:1 с пользователем,
        отдельный cartId не нужен). Оплата списанием с баланса.
      properties:
        promoCode: { type: string, description: Опциональный промокод }

    OrderItem:
      type: object
      properties:
        id: { type: string, format: uuid }
        variantId: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string }
        quantity: { type: integer }
        unitPrice: { $ref: '#/components/schemas/Money' }
        deliveryType: { type: string, enum: [auto, manual] }
        deliveryStatus:
          type: string
          enum: [pending, awaiting_manual, queued, assigned, in_progress, qc, ready, on_hold, failed, delivered, replaced, refunded]
        warming:
          description: Прогресс прогрева для MADE_TO_ORDER-позиций (E6); null для READY_STOCK.
          oneOf:
            - { $ref: '#/components/schemas/WarmingProgress' }
            - { type: "null" }

    WarmingProgress:
      type: object
      description: Прогресс прогрева, видимый покупателю (docs/14).
      properties:
        status:
          type: string
          enum: [queued, assigned, in_progress, qc, ready, delivered, on_hold, failed, refunded]
        etaAt: { type: [string, "null"], format: date-time, description: Ожидаемое время готовности (null после выдачи/возврата) }
        currentStage: { type: integer, description: 1-based индекс текущего этапа (0 до старта) }
        totalStages: { type: integer }
        stages:
          type: array
          items:
            type: object
            properties:
              order: { type: integer }
              name: { type: string }
              status: { type: string, enum: [pending, in_progress, done, skipped, blocked] }

    WarmingJobSummary:
      type: object
      description: Строка операторской очереди прогрева (E6).
      properties:
        id: { type: string, format: uuid }
        orderId: { type: string, format: uuid }
        orderNumber: { type: string }
        orderItemId: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string }
        goal: { type: [string, "null"] }
        tier: { type: [string, "null"] }
        status: { type: string, enum: [queued, assigned, in_progress, qc, ready, delivered, on_hold, failed, refunded] }
        assignedTo: { type: [string, "null"], format: uuid }
        etaAt: { type: [string, "null"], format: date-time }
        slaDueAt: { type: [string, "null"], format: date-time }
        currentStage: { type: integer }
        stageCount: { type: integer }
        createdAt: { type: string, format: date-time }

    WarmingJobDetail:
      allOf:
        - { $ref: '#/components/schemas/WarmingJobSummary' }
        - type: object
          properties:
            planId: { type: [string, "null"], format: uuid }
            planVersion: { type: integer }
            notes: { type: [string, "null"] }
            hasAccountAsset: { type: boolean, description: Захвачены ли данные аккаунта (сами данные не отдаются) }
            bundleStatus: { type: [string, "null"], enum: [assembling, qc, ready, delivered, "null"] }
            tasks:
              type: array
              items:
                type: object
                properties:
                  id: { type: string, format: uuid }
                  order: { type: integer }
                  name: { type: string }
                  expectedMinutes: { type: integer }
                  status: { type: string, enum: [pending, in_progress, done, skipped, blocked] }
                  checklistState: { type: object }
                  startedAt: { type: [string, "null"], format: date-time }
                  doneAt: { type: [string, "null"], format: date-time }

    Order:
      type: object
      properties:
        id: { type: string, format: uuid }
        number: { type: string }
        status:
          type: string
          enum: [pending, paid, partially_delivered, delivered, cancelled, refunded]
        subtotal: { $ref: '#/components/schemas/Money' }
        discount: { $ref: '#/components/schemas/Money' }
        total: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }
        promoCode: { type: [string, "null"], description: Применённый промокод }
        items:
          type: array
          items: { $ref: '#/components/schemas/OrderItem' }
        createdAt: { type: string, format: date-time }

    DeliveryPayload:
      type: object
      description: Расшифрованные данные выдачи. Отдаются только владельцу заказа; каждый доступ пишется в AuditLog.
      properties:
        orderItemId: { type: string, format: uuid }
        type: { type: string, enum: [auto, manual, replacement] }
        payload:
          type: string
          description: >
            Расшифрованный секрет. При quantity > 1 — одна проданная единица на
            строку (строки соответствуют импортированным строкам стока).
        deliveredAt: { type: string, format: date-time }

    ReplaceRequest:
      type: object
      properties:
        reason: { type: string, description: Причина запроса гарантийной замены }

    # ---------- Wallet / TopUp ----------
    LedgerEntry:
      type: object
      properties:
        id: { type: string, format: uuid }
        direction: { type: string, enum: [credit, debit] }
        amount: { $ref: '#/components/schemas/Money' }
        balanceAfter: { $ref: '#/components/schemas/Money' }
        refType: { type: string, enum: [topup, order, refund, adjustment, replacement] }
        refId: { type: string, format: uuid }
        createdAt: { type: string, format: date-time }

    Wallet:
      type: object
      properties:
        balance: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }
        recent:
          type: array
          description: Последние 5 движений ledger (полная история — /wallet/transactions).
          items: { $ref: '#/components/schemas/LedgerEntry' }

    CreateTopUpRequest:
      type: object
      required: [amount, asset]
      properties:
        amount:
          allOf: [{ $ref: '#/components/schemas/Money' }]
          description: Сумма зачисления в валюте учёта (USD). Мин. 1.00, макс. 100000.00.
        asset:
          type: string
          description: Актив и сеть, которыми платит пользователь.
          enum: [USDT-TRC20, USDT-ERC20, BTC, ETH]
          example: "USDT-TRC20"

    TopUp:
      type: object
      properties:
        id: { type: string, format: uuid }
        provider: { type: string }
        amount: { $ref: '#/components/schemas/Money' }
        asset: { type: string }
        status: { type: string, enum: [pending, paid, expired, failed] }
        paymentUrl: { type: [string, "null"] }
        address: { type: [string, "null"] }
        expiresAt: { type: [string, "null"], format: date-time }
        createdAt: { type: string, format: date-time }
        paidAt: { type: [string, "null"], format: date-time }

    # ---------- Support ----------
    Ticket:
      type: object
      properties:
        id: { type: string, format: uuid }
        orderId: { type: [string, "null"], format: uuid }
        subject: { type: string }
        status: { type: string, enum: [open, pending, closed] }
        priority: { type: string, enum: [low, normal, high] }
        createdAt: { type: string, format: date-time }

    TicketMessage:
      type: object
      properties:
        id: { type: string, format: uuid }
        authorId: { type: string, format: uuid }
        body: { type: string }
        attachments: { type: array, items: { type: object, additionalProperties: true } }
        createdAt: { type: string, format: date-time }

    CreateTicketRequest:
      type: object
      required: [subject, body]
      properties:
        subject: { type: string }
        body: { type: string }
        orderId: { type: string, format: uuid }

    CreateTicketMessageRequest:
      type: object
      required: [body]
      properties:
        body: { type: string }
        attachments: { type: array, items: { type: object, additionalProperties: true } }

    # ---------- Admin ----------
    ManualDeliverRequest:
      type: object
      required: [payload]
      properties:
        payload: { type: string, description: Секретные данные к выдаче; шифруются на сервере }

    RefundRequest:
      type: object
      required: [reason]
      properties:
        reason: { type: string }
        amount:
          $ref: '#/components/schemas/Money'
          # необязательно; по умолчанию полный возврат заказа

    StockImportRequest:
      type: object
      required: [items]
      properties:
        items:
          type: array
          description: >
            Строки стока, одна строка = одна единица (payload шифруется на
            сервере). Альтернатива — text/plain: сырой CSV/TXT, разбивается
            по переводам строк, пустые строки пропускаются.
          items: { type: string }

    StockImportReport:
      type: object
      description: Итог импорта. skipped — пустые строки и дубликаты (SHA-256 в рамках варианта).
      properties:
        added: { type: integer }
        skipped: { type: integer }
        stockCount: { type: integer, description: Актуальный available-пул варианта после импорта }

    # ---------- Инвентарь: прокси и Octo-профили (E7) ----------
    ProxyItem:
      type: object
      description: Прокси в инвентаре. Операторский вид — БЕЗ расшифрованных credentials.
      properties:
        id: { type: string, format: uuid }
        type: { type: string, enum: [residential, mobile, isp, datacenter] }
        geo: { type: string }
        provider: { type: string }
        status: { type: string, enum: [available, assigned, expired, disabled] }
        expiresAt: { type: string, format: date-time, nullable: true }
        assignedJobId: { type: string, format: uuid, nullable: true, description: warm-задача, к которой привязан }
        meta: { type: object, additionalProperties: true }
        createdAt: { type: string, format: date-time }
    OctoProfile:
      type: object
      description: Octo-профиль в реестре. Операторский вид — БЕЗ расшифрованного exportRef.
      properties:
        id: { type: string, format: uuid }
        externalId: { type: string, nullable: true }
        name: { type: string }
        status: { type: string, enum: [draft, ready, delivered] }
        proxyItemId: { type: string, format: uuid, nullable: true }
        jobId: { type: string, format: uuid, nullable: true }
        fingerprintRef: { type: object, additionalProperties: true, nullable: true }
        meta: { type: object, additionalProperties: true }
        createdAt: { type: string, format: date-time }
    CreateProxyRequest:
      type: object
      required: [type, geo, provider, credentials]
      properties:
        type: { type: string, enum: [residential, mobile, isp, datacenter] }
        geo: { type: string }
        provider: { type: string }
        credentials: { type: string, description: 'host:port:user:pass — шифруется на сервере, в открытом виде не хранится/не возвращается' }
        expiresAt: { type: string, format: date-time, nullable: true }
        meta: { type: object, additionalProperties: true }
    ProxyImportRequest:
      type: object
      required: [items]
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/CreateProxyRequest' } }
    ProxyImportReport:
      type: object
      description: Итог импорта. skipped — пустые/битые строки и дубликаты (хэш credentials).
      properties:
        added: { type: integer }
        skipped: { type: integer }
    CreateOctoProfileRequest:
      type: object
      required: [name]
      properties:
        name: { type: string }
        externalId: { type: string, nullable: true }
        proxyItemId: { type: string, format: uuid, nullable: true }
        exportRef: { type: string, nullable: true, description: Ссылка на экспорт/шеринг — шифруется на сервере }
        fingerprintRef: { type: object, additionalProperties: true, nullable: true }
        meta: { type: object, additionalProperties: true }
    UpdateOctoProfileRequest:
      type: object
      description: Частичное обновление (напр. приложить exportRef, когда профиль готов).
      properties:
        name: { type: string }
        externalId: { type: string, nullable: true }
        proxyItemId: { type: string, format: uuid, nullable: true }
        status: { type: string, enum: [draft, ready, delivered] }
        exportRef: { type: string, nullable: true }
        fingerprintRef: { type: object, additionalProperties: true, nullable: true }
        meta: { type: object, additionalProperties: true }
    JobInventory:
      type: object
      description: Ресурсы, привязанные к warm-задаче (операторский обзор, без секретов).
      properties:
        proxy: { allOf: [ { $ref: '#/components/schemas/ProxyItem' } ], nullable: true }
        octo: { allOf: [ { $ref: '#/components/schemas/OctoProfile' } ], nullable: true }

    PageMeta:
      type: object
      properties:
        total: { type: integer }
        page: { type: integer }
        limit: { type: integer }

    OrderBuyer:
      type: object
      description: Краткая ссылка на покупателя в админ-представлениях заказа.
      properties:
        id: { type: string, format: uuid }
        email: { type: string, format: email }

    AdminOrderListItem:
      type: object
      description: Строка таблицы заказов в админке (E8).
      properties:
        id: { type: string, format: uuid }
        number: { type: string }
        status: { type: string, enum: [pending, paid, partially_delivered, delivered, cancelled, refunded] }
        buyer: { $ref: '#/components/schemas/OrderBuyer' }
        itemCount: { type: integer, description: Суммарное количество по позициям }
        total: { type: string }
        currency: { type: string }
        createdAt: { type: string, format: date-time }

    AdminOrderDetail:
      type: object
      description: Полная карточка заказа для админки/операторки (E8, без секретов).
      properties:
        id: { type: string, format: uuid }
        number: { type: string }
        status: { type: string, enum: [pending, paid, partially_delivered, delivered, cancelled, refunded] }
        buyer: { $ref: '#/components/schemas/OrderBuyer' }
        subtotal: { type: string }
        discount: { type: string }
        total: { type: string }
        currency: { type: string }
        promoCode: { type: string, nullable: true }
        items: { type: array, items: { $ref: '#/components/schemas/OrderItem' } }
        createdAt: { type: string, format: date-time }

    AdminStockRow:
      type: object
      description: Один READY_STOCK-вариант со счётчиками пула по статусам (E8).
      properties:
        productId: { type: string, format: uuid }
        productSlug: { type: string }
        variantId: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string, description: 'Локализованное «товар · вариант»' }
        available: { type: integer }
        reserved: { type: integer }
        sold: { type: integer }
        total: { type: integer }

  responses:
    BadRequest:
      description: Ошибка валидации.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Unauthorized:
      description: Нет/невалиден токен.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Forbidden:
      description: Нет прав (RBAC).
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    NotFound:
      description: Ресурс не найден.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Conflict:
      description: Конфликт состояния/идемпотентности.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    RateLimited:
      description: Превышен лимит запросов.
      headers:
        Retry-After: { schema: { type: integer } }
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

# ============================================================
# Paths
# ============================================================
paths:
  # ---------------- System ----------------
  /health:
    get:
      tags: [System]
      summary: Проверка живости API и зависимостей (db, redis)
      security: []
      responses:
        '200':
          description: Сервис работает; статусы зависимостей внутри.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/HealthResponse' }
        '503':
          description: Сервис деградирован — одна из зависимостей недоступна.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/HealthResponse' }

  # ---------------- Auth ----------------
  /auth/register:
    post:
      tags: [Auth]
      summary: Регистрация
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RegisterRequest' }
      responses:
        '201':
          description: Создан пользователь; access-токен выдан.
          content: { application/json: { schema: { $ref: '#/components/schemas/TokenResponse' } } }
        '400': { $ref: '#/components/responses/BadRequest' }
        '409':
          description: Email уже используется (EMAIL_ALREADY_USED).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '429': { $ref: '#/components/responses/RateLimited' }

  /auth/login:
    post:
      tags: [Auth]
      summary: Вход
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LoginRequest' }
      responses:
        '200':
          description: Access-токен в теле, refresh-токен в HTTP-only cookie (Set-Cookie).
          headers:
            Set-Cookie:
              schema: { type: string, example: "refreshToken=...; HttpOnly; Secure; SameSite=Strict" }
          content: { application/json: { schema: { $ref: '#/components/schemas/TokenResponse' } } }
        '401':
          description: Неверные учётные данные (INVALID_CREDENTIALS).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '429': { $ref: '#/components/responses/RateLimited' }

  /auth/refresh:
    post:
      tags: [Auth]
      summary: Обновление access по refresh (cookie)
      security: []
      responses:
        '200':
          description: Новый access-токен.
          content: { application/json: { schema: { $ref: '#/components/schemas/TokenResponse' } } }
        '401':
          description: Refresh невалиден/отозван (INVALID_TOKEN).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  /auth/logout:
    post:
      tags: [Auth]
      summary: Отзыв refresh-токена (по cookie; работает и с истёкшим access)
      security: []
      responses:
        '204': { description: Выполнено; cookie очищен. }

  /auth/verify-email:
    post:
      tags: [Auth]
      summary: Подтверждение email по токену
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [token]
              properties: { token: { type: string } }
      responses:
        '200': { description: Email подтверждён. }
        '400':
          description: Токен невалиден/просрочен (INVALID_TOKEN).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  /auth/resend-verification:
    post:
      tags: [Auth]
      summary: Повторная отправка письма подтверждения (текущему пользователю)
      responses:
        '202': { description: Письмо отправлено (или email уже подтверждён — идемпотентно). }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/RateLimited' }

  /auth/forgot-password:
    post:
      tags: [Auth]
      summary: Запрос сброса пароля
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties: { email: { type: string, format: email } }
      responses:
        '202': { description: Если email существует — письмо отправлено (без утечки существования). }
        '429': { $ref: '#/components/responses/RateLimited' }

  /auth/reset-password:
    post:
      tags: [Auth]
      summary: Сброс пароля по токену
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [token, newPassword]
              properties:
                token: { type: string }
                newPassword: { type: string, minLength: 8 }
      responses:
        '200': { description: Пароль обновлён. }
        '400': { $ref: '#/components/responses/BadRequest' }

  # ---------------- Users / профиль ----------------
  /me:
    get:
      tags: [Users]
      summary: Текущий пользователь
      responses:
        '200':
          description: Профиль, роль, баланс.
          content: { application/json: { schema: { $ref: '#/components/schemas/User' } } }
        '401': { $ref: '#/components/responses/Unauthorized' }
    patch:
      tags: [Users]
      summary: Обновить профиль/локаль
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateMeRequest' }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/User' } } }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /me/change-password:
    post:
      tags: [Users]
      summary: Смена пароля
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ChangePasswordRequest' }
      responses:
        '204': { description: Пароль изменён. }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  # ---------------- Каталог ----------------
  /categories:
    get:
      tags: [Catalog]
      summary: Дерево категорий
      security: []
      parameters:
        - $ref: '#/components/parameters/AcceptLanguage'
        - $ref: '#/components/parameters/Locale'
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Category' }

  /products:
    get:
      tags: [Catalog]
      summary: Список товаров
      security: []
      parameters:
        - $ref: '#/components/parameters/AcceptLanguage'
        - $ref: '#/components/parameters/Locale'
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: categoryId, in: query, schema: { type: string, format: uuid } }
        - { name: category, in: query, schema: { type: string }, description: Slug категории (включая товары дочерних категорий) }
        - { name: q, in: query, schema: { type: string }, description: Поиск по локализованным имени/описанию }
        - { name: minPrice, in: query, schema: { type: string } }
        - { name: maxPrice, in: query, schema: { type: string } }
        - { name: fulfillment, in: query, schema: { type: string, enum: [READY_STOCK, MADE_TO_ORDER] } }
        - { name: goal, in: query, schema: { type: string }, description: Цель прогрева (google_ads, …) }
        - { name: inStock, in: query, schema: { type: boolean }, description: Только доступные (сток > 0 или под заказ) }
        - { name: sort, in: query, schema: { type: string, enum: [price_asc, price_desc, rating, newest] } }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/ProductListItem' } }
                  meta: { $ref: '#/components/schemas/PaginationMeta' }

  /products/{slug}:
    get:
      tags: [Catalog]
      summary: Карточка товара + варианты + наличие
      security: []
      parameters:
        - { name: slug, in: path, required: true, schema: { type: string } }
        - $ref: '#/components/parameters/AcceptLanguage'
        - $ref: '#/components/parameters/Locale'
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Product' } } }
        '404': { $ref: '#/components/responses/NotFound' }

  /products/{id}/reviews:
    get:
      tags: [Catalog]
      summary: Отзывы товара
      security: []
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/Review' } }
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
    post:
      tags: [Catalog]
      summary: Оставить отзыв (только если товар куплен)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateReviewRequest' }
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/Review' } } }
        '403':
          description: Товар не куплен либо отзыв уже оставлен (REVIEW_NOT_ALLOWED).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  # ---------------- Корзина ----------------
  /cart:
    get:
      tags: [Cart]
      summary: Текущая корзина
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Cart' } } }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /cart/items:
    post:
      tags: [Cart]
      summary: Добавить позицию
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AddCartItemRequest' }
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/Cart' } } }
        '400': { $ref: '#/components/responses/BadRequest' }
        '404': { $ref: '#/components/responses/NotFound' }

  /promo-codes/{code}:
    get:
      tags: [Cart]
      summary: Проверить промокод (превью скидки в корзине)
      description: >
        Возвращает публичную часть валидного промокода. Невалидный/истёкший/
        исчерпанный код — 404 с code=PROMO_INVALID. Финальная валидация и
        инкремент usedCount происходят в checkout.
      parameters:
        - { name: code, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/PromoCodePublic' } } }
        '404':
          description: Код не найден, истёк или исчерпан (PROMO_INVALID).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /cart/items/{id}:
    patch:
      tags: [Cart]
      summary: Изменить количество
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateCartItemRequest' }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Cart' } } }
        '404': { $ref: '#/components/responses/NotFound' }
    delete:
      tags: [Cart]
      summary: Удалить позицию
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Cart' } } }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------- Заказы / checkout ----------------
  /orders/checkout:
    post:
      tags: [Orders]
      summary: Оформить заказ (проверка наличия + оплата с баланса)
      description: >
        Требует Idempotency-Key. Проверка активности вариантов и наличия
        (атомарный декремент stockCount для READY_STOCK; TTL-резерв StockItem — E5),
        валидация промокода. В одной транзакции: LedgerEntry(debit) +
        User.balance -= total + Order(status=paid) + OrderItem'ы со снапшотом
        цены/имени/SKU + очистка корзины. deliveryStatus позиций — pending
        (выдача — E5). Пустая корзина — 400 VALIDATION_ERROR. При недостатке
        баланса — 402 INSUFFICIENT_BALANCE (транзакция откатывается целиком).
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CheckoutRequest' }
      responses:
        '201':
          description: Заказ создан и оплачен.
          content: { application/json: { schema: { $ref: '#/components/schemas/Order' } } }
        '402':
          description: Недостаточно баланса (INSUFFICIENT_BALANCE).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
              example:
                error:
                  code: INSUFFICIENT_BALANCE
                  message: "Not enough balance to complete the order"
                  details: { required: "20.00", available: "12.50" }
        '409':
          description: >
            Нет стока / вариант неактивен (OUT_OF_STOCK), промокод невалиден
            (PROMO_INVALID) либо конфликт идемпотентности (IDEMPOTENCY_CONFLICT).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /orders:
    get:
      tags: [Orders]
      summary: История заказов
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/Order' } }
                  meta: { $ref: '#/components/schemas/PaginationMeta' }

  /orders/{id}:
    get:
      tags: [Orders]
      summary: Детали заказа + статусы выдачи
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Order' } } }
        '404': { $ref: '#/components/responses/NotFound' }

  /orders/{id}/items/{itemId}/delivery:
    get:
      tags: [Delivery]
      summary: Полученные данные (расшифровка на сервере, только владельцу)
      description: >
        Каждый успешный доступ пишется в AuditLog (action=delivery.payload_accessed).
        Чужой заказ отвечает 404 — существование заказа не раскрывается.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: itemId, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/DeliveryPayload' } } }
        '404':
          description: Ещё не выдано, не найдено либо заказ принадлежит другому пользователю.
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  /orders/{id}/items/{itemId}/replace:
    post:
      tags: [Delivery]
      summary: Запрос гарантийной замены (P1)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: itemId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: false
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ReplaceRequest' }
      responses:
        '202': { description: Запрос принят в обработку. }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409':
          description: Гарантийное окно истекло/уже заменено.
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  # ---------------- Кошелёк / пополнение ----------------
  /wallet:
    get:
      tags: [Wallet]
      summary: Баланс + последние движения
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Wallet' } } }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /wallet/transactions:
    get:
      tags: [Wallet]
      summary: История транзакций (ledger)
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/LedgerEntry' } }
                  meta: { $ref: '#/components/schemas/PaginationMeta' }

  /wallet/topups:
    post:
      tags: [Wallet]
      summary: Создать пополнение → адрес/ссылка оплаты
      description: >
        Создаёт TopUp(status=pending), вызывает провайдера, возвращает address/paymentUrl + externalId.
        Идемпотентность — заголовок Idempotency-Key.
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateTopUpRequest' }
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/TopUp' } } }
        '400': { $ref: '#/components/responses/BadRequest' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/RateLimited' }

  /wallet/topups/{id}:
    get:
      tags: [Wallet]
      summary: Статус пополнения
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/TopUp' } } }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------- Платёжные вебхуки ----------------
  /webhooks/payments/{provider}:
    post:
      tags: [Webhooks]
      summary: Приём вебхука эквайринга (сервер→сервер)
      description: >
        Не требует пользовательского JWT. Проверка подписи провайдера (заголовок;
        для sandbox-провайдера — X-Signature = HMAC-SHA256(hex) от raw body).
        Идемпотентность по externalId: если TopUp уже paid — выход без повторного зачисления.
        Неизвестный externalId — 200 с игнорированием (событие не наше). Оплата, пришедшая
        после expiresAt (TopUp уже expired), всё равно зачисляется — средства получены.
        В транзакции: TopUp=paid + LedgerEntry(credit) + User.balance += amount.
        200 отдаётся только после успешной записи, иначе провайдер повторит.
      security: []
      parameters:
        - { name: provider, in: path, required: true, schema: { type: string, example: cryptomus } }
        - name: X-Signature
          in: header
          required: true
          description: Подпись вебхука провайдера (имя заголовка зависит от провайдера).
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              description: Payload провайдера (форма зависит от эквайринга).
              additionalProperties: true
      responses:
        '200': { description: Обработано (или уже было обработано ранее — идемпотентно). }
        '400':
          description: Некорректный payload.
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
        '401':
          description: Неверная подпись (INVALID_SIGNATURE).
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  # ---------------- Поддержка ----------------
  /tickets:
    get:
      tags: [Support]
      summary: Мои тикеты
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/Ticket' } }
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
    post:
      tags: [Support]
      summary: Создать тикет
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateTicketRequest' }
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/Ticket' } } }
        '400': { $ref: '#/components/responses/BadRequest' }

  /tickets/{id}:
    get:
      tags: [Support]
      summary: Тикет + сообщения
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  ticket: { $ref: '#/components/schemas/Ticket' }
                  messages: { type: array, items: { $ref: '#/components/schemas/TicketMessage' } }
        '404': { $ref: '#/components/responses/NotFound' }

  /tickets/{id}/messages:
    post:
      tags: [Support]
      summary: Ответить в тикет
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateTicketMessageRequest' }
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/TicketMessage' } } }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------- Админ ----------------
  /admin/categories:
    get:
      tags: [Admin]
      summary: Список категорий (admin/support)
      responses:
        '200': { description: OK }
        '403': { $ref: '#/components/responses/Forbidden' }
    post:
      tags: [Admin]
      summary: Создать категорию (переводы EN/RU)
      responses:
        '201': { description: Создано }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/categories/{id}:
    patch:
      tags: [Admin]
      summary: Обновить категорию
      parameters: [ { name: id, in: path, required: true, schema: { type: string, format: uuid } } ]
      responses:
        '200': { description: OK }
        '403': { $ref: '#/components/responses/Forbidden' }
    delete:
      tags: [Admin]
      summary: Удалить категорию
      parameters: [ { name: id, in: path, required: true, schema: { type: string, format: uuid } } ]
      responses:
        '204': { description: Удалено }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/products:
    get:
      tags: [Admin]
      summary: Список товаров (CRUD)
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }
    post:
      tags: [Admin]
      summary: Создать товар/вариант
      responses: { '201': { description: Создано }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/products/{id}:
    patch:
      tags: [Admin]
      summary: Обновить товар/вариант
      parameters: [ { name: id, in: path, required: true, schema: { type: string, format: uuid } } ]
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }
    delete:
      tags: [Admin]
      summary: Удалить товар
      parameters: [ { name: id, in: path, required: true, schema: { type: string, format: uuid } } ]
      responses: { '204': { description: Удалено }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/products/{id}/variants/{variantId}/stock/import:
    post:
      tags: [Admin]
      summary: Импорт стоков (CSV/TXT либо JSON), payload шифруется на сервере
      description: >
        RBAC admin. Вариант должен принадлежать товару и быть READY_STOCK.
        Дубликаты в рамках варианта (SHA-256 исходной строки) и пустые строки
        пропускаются — повторный импорт того же файла идемпотентен.
        stockCount пересчитывается от пула; импорт пишется в AuditLog.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: variantId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StockImportRequest' }
          text/plain:
            schema: { type: string, description: Сырой CSV/TXT — одна строка = одна единица }
      responses:
        '201':
          description: Импортировано; отчёт added/skipped.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/StockImportReport' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409':
          description: Вариант не READY_STOCK.
          content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  /admin/stock:
    get:
      tags: [Admin]
      summary: Пул READY_STOCK по вариантам (E8, RBAC staff)
      description: >-
        Счётчики StockItem по статусам на каждый READY_STOCK-вариант. Payload'ы
        не читаются (секреты — только в Vault покупателя, E5). Пополнение — на
        `/admin/products/{id}/variants/{variantId}/stock/import`.
      parameters:
        - { name: locale, in: query, schema: { type: string, enum: [en, ru] } }
      responses:
        '200':
          description: Список строк стока
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/AdminStockRow' } }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/orders:
    get:
      tags: [Admin]
      summary: Все заказы, фильтры (E8, RBAC staff)
      description: >-
        Пагинированная таблица заказов всех покупателей, новейшие первыми.
        Read-only — выдача идёт через warming/inventory. Секреты не возвращаются.
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: status, in: query, schema: { type: string, enum: [pending, paid, partially_delivered, delivered, cancelled, refunded] } }
        - { name: q, in: query, description: 'Номер заказа или email покупателя (contains, ci)', schema: { type: string } }
      responses:
        '200':
          description: Пагинированный список AdminOrderListItem
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/AdminOrderListItem' } }
                  meta: { $ref: '#/components/schemas/PageMeta' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/orders/{id}:
    get:
      tags: [Admin]
      summary: Деталь заказа для админки/операторки (E8, RBAC staff)
      description: Полная карточка заказа с покупателем, позициями и warm-прогрессом. Без секретов доставки.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: locale, in: query, schema: { type: string, enum: [en, ru] } }
      responses:
        '200':
          description: AdminOrderDetail
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AdminOrderDetail' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /admin/orders/{id}/items/{itemId}/deliver:
    post:
      tags: [Admin]
      summary: Ручная выдача (внести payload)
      description: Создаёт Delivery(type=manual), OrderItem.deliveryStatus=delivered, шифрует payload, пишет AuditLog.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: itemId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ManualDeliverRequest' }
      responses:
        '200': { description: Выдано }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /admin/orders/{id}/refund:
    post:
      tags: [Admin]
      summary: Возврат средств (ledger credit + статус refunded)
      description: В транзакции — LedgerEntry(credit, refType=refund) + User.balance += amount + Order.status=refunded. Пишет AuditLog.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RefundRequest' }
      responses:
        '200': { description: Возврат проведён }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }

  /admin/warming/jobs:
    get:
      tags: [Warming]
      summary: Очередь прогрева (RBAC admin/support), E6
      description: Задачи прогрева, старейшие первыми. Фильтры по статусу/цели/оператору.
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: status, in: query, schema: { type: string, enum: [queued, assigned, in_progress, qc, ready, delivered, on_hold, failed, refunded] } }
        - { name: goal, in: query, schema: { type: string } }
        - { name: assignedTo, in: query, schema: { type: string, format: uuid } }
      responses:
        '200':
          description: Пагинированный список WarmingJobSummary
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/WarmingJobSummary' } }
                  meta:
                    type: object
                    properties:
                      total: { type: integer }
                      page: { type: integer }
                      limit: { type: integer }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/warming/jobs/{id}:
    get:
      tags: [Warming]
      summary: Детали задачи прогрева (этапы, план, наличие данных аккаунта)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WarmingJobDetail' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /admin/warming/jobs/{id}/assign:
    post:
      tags: [Warming]
      summary: Назначить оператора (queued|on_hold → assigned)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [operatorId]
              properties: { operatorId: { type: string, format: uuid, description: User с ролью support/admin } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WarmingJobDetail' } } } }
        '400': { $ref: '#/components/responses/BadRequest' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }

  /admin/warming/jobs/{id}/transition:
    post:
      tags: [Warming]
      summary: Переход статуса (start/hold/resume/qc/ready/deliver/fail)
      description: Машина переходов docs/14. deliver собирает Bundle и выдаёт комплект в Vault (требует захваченных данных аккаунта, иначе 409). hold/resume пересчитывают ETA.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [action]
              properties:
                action: { type: string, enum: [start, hold, resume, qc, ready, deliver, fail] }
                note: { type: string, description: Заметка оператора (причина hold/fail); не секрет }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WarmingJobDetail' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }

  /admin/warming/jobs/{id}/tasks/{taskId}:
    post:
      tags: [Warming]
      summary: Обновить этап-задачу (статус/чек-лист); currentStage = число done
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: taskId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                status: { type: string, enum: [pending, in_progress, done, skipped, blocked] }
                checklistState: { type: object }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WarmingJobDetail' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /admin/warming/jobs/{id}/account:
    post:
      tags: [Warming]
      summary: Захватить данные аккаунта (шифруется на сервере; не логируется)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [payload]
              properties:
                payload: { type: string, description: Логин/пароль и связанные данные (шифруется AES-256-GCM) }
                recovery: { type: string }
                meta: { type: object, description: Без секретов }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WarmingJobDetail' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }

  /admin/warming/jobs/{id}/resolve:
    post:
      tags: [Warming]
      summary: Разрешить failed-задачу — reassign (→queued) или refund (ledger credit)
      description: docs/14. reassign сбрасывает tasks и ETA. refund проводит LedgerEntry(credit, refType=refund, refId=orderItemId) и делает позицию/задачу refunded. Пишет AuditLog.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [resolution]
              properties:
                resolution: { type: string, enum: [reassign, refund] }
                reason: { type: string }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/WarmingJobDetail' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }

  # ---------- Инвентарь: прокси и Octo-профили (E7, RBAC admin/support) ----------
  # Провижининг вручную; платформа только учёт ресурсов и связок с warm-задачами
  # (граница, docs/09). Секреты (credentials/exportRef) шифруются на сервере и
  # НИКОГДА не возвращаются этими эндпоинтами — только в комплекте Vault владельца.
  /admin/warming/jobs/{id}/inventory:
    get:
      tags: [Inventory]
      summary: Ресурсы (прокси + Octo), привязанные к warm-задаче
      description: Операторский обзор; без секретов.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/JobInventory' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/inventory/proxies:
    get:
      tags: [Inventory]
      summary: Список прокси (фильтры status/type/unassigned)
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: status, in: query, schema: { type: string, enum: [available, assigned, expired, disabled] } }
        - { name: type, in: query, schema: { type: string, enum: [residential, mobile, isp, datacenter] } }
        - { name: unassigned, in: query, schema: { type: boolean } }
      responses:
        '200':
          description: Пагинированный список ProxyItem
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/ProxyItem' } }
                  meta:
                    type: object
                    properties:
                      total: { type: integer }
                      page: { type: integer }
                      limit: { type: integer }
        '403': { $ref: '#/components/responses/Forbidden' }
    post:
      tags: [Inventory]
      summary: Зарегистрировать прокси (credentials шифруются)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateProxyRequest' }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/ProxyItem' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { description: Прокси с такими credentials уже существует, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }

  /admin/inventory/proxies/import:
    post:
      tags: [Inventory]
      summary: Массовый импорт прокси (JSON или text/plain)
      description: 'JSON `{ items: CreateProxyRequest[] }` ИЛИ text/plain (строка на прокси: `type,geo,provider,host:port:user:pass[,expiresAt]`, `#` — комментарий). Дедуп по хэшу credentials; пустые/битые/дубли пропускаются.'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ProxyImportRequest' }
          text/plain:
            schema: { type: string }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/ProxyImportReport' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/inventory/proxies/{id}/bind:
    post:
      tags: [Inventory]
      summary: Привязать свободный прокси к warm-задаче (available→assigned, exactly-once)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, required: [jobId], properties: { jobId: { type: string, format: uuid } } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/ProxyItem' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { description: Прокси недоступен / у задачи уже есть прокси, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }

  /admin/inventory/proxies/{id}/unbind:
    post:
      tags: [Inventory]
      summary: Снять прокси с задачи обратно в пул (assigned→available)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/ProxyItem' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }

  /admin/inventory/octo:
    get:
      tags: [Inventory]
      summary: Список Octo-профилей (фильтры status/unassigned)
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: status, in: query, schema: { type: string, enum: [draft, ready, delivered] } }
        - { name: unassigned, in: query, schema: { type: boolean } }
      responses:
        '200':
          description: Пагинированный список OctoProfile
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/OctoProfile' } }
                  meta:
                    type: object
                    properties:
                      total: { type: integer }
                      page: { type: integer }
                      limit: { type: integer }
        '403': { $ref: '#/components/responses/Forbidden' }
    post:
      tags: [Inventory]
      summary: Зарегистрировать Octo-профиль (exportRef шифруется)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateOctoProfileRequest' }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/OctoProfile' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/inventory/octo/{id}:
    patch:
      tags: [Inventory]
      summary: Изменить Octo-профиль (напр. приложить exportRef, сменить статус)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateOctoProfileRequest' }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OctoProfile' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /admin/inventory/octo/{id}/bind:
    post:
      tags: [Inventory]
      summary: Привязать свободный Octo-профиль к warm-задаче (exactly-once; линкует прокси задачи)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [jobId]
              properties:
                jobId: { type: string, format: uuid }
                proxyItemId: { type: string, format: uuid, nullable: true, description: По умолчанию — прокси, привязанный к задаче }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OctoProfile' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { description: Профиль занят / у задачи уже есть профиль, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }

  /admin/inventory/octo/{id}/unbind:
    post:
      tags: [Inventory]
      summary: Снять Octo-профиль с задачи (→draft)
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OctoProfile' } } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }

  /admin/users:
    get:
      tags: [Admin]
      summary: Список пользователей
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: q, in: query, schema: { type: string } }
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }
    patch:
      tags: [Admin]
      summary: Редактирование, блокировка, корректировка баланса (adjustment → ledger)
      responses:
        '200': { description: OK }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/tickets:
    get:
      tags: [Admin]
      summary: Очередь тикетов
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/stats:
    get:
      tags: [Admin]
      summary: Дашборд — выручка, заказы, топ-товары
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/audit-log:
    get:
      tags: [Admin]
      summary: Журнал действий
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: entity, in: query, schema: { type: string } }
        - { name: actorId, in: query, schema: { type: string, format: uuid } }
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/promocodes:
    get:
      tags: [Admin]
      summary: Промокоды (v2)
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }
    post:
      tags: [Admin]
      summary: Создать промокод
      responses: { '201': { description: Создано }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/i18n:
    get:
      tags: [Admin]
      summary: Получить переводы
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }
    put:
      tags: [Admin]
      summary: Обновить переводы
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }
```

---

## Пояснения к контракту

- **Auth.** Публичные эндпоинты (`security: []`): register/login/refresh/verify/forgot/reset и вебхуки. Refresh — только через HTTP-only cookie. Rate limiting на всей группе `/auth/*`.
- **Checkout (детально).** Требует `Idempotency-Key`. Коды: `400 VALIDATION_ERROR` (пустая корзина), `402 INSUFFICIENT_BALANCE`, `409 OUT_OF_STOCK`/`PROMO_INVALID`/`IDEMPOTENCY_CONFLICT`. Логика (E5) — валидация корзины/промокода → **резерв конкретных StockItem** (`available → reserved`, TTL) → одна транзакция БД: `reserved → sold` + `Delivery(type=auto)` со снимком payload + `deliveryStatus=delivered` (READY_STOCK; для MADE_TO_ORDER (E6) вместо этого создаётся `WarmingJob(queued)` + этапы + ETA, `deliveryStatus=queued`) + инкремент `usedCount` промокода + ledger debit + Order со статусом-агрегатом по позициям (`delivered`/`partially_delivered`/`paid`, docs/14) + очистка корзины; `stockCount` пересчитывается от пула. Ошибка → резервы снимаются, транзакция откатывается целиком (нехватка стока в момент оплаты = `409 OUT_OF_STOCK`, деньги не списываются). Поток — по [`08`](../08-payments-delivery.md).
- **Wallet/TopUps (детально).** `POST /wallet/topups` идемпотентен, отдаёт `address`/`paymentUrl`/статус. `GET /wallet/topups/:id` — поллинг статуса до `paid/expired`.
- **Webhooks (детально).** Без JWT, проверка подписи (`X-Signature`), идемпотентность по `externalId`. `200` — только после успешной записи в БД (иначе провайдер повторяет). `401 INVALID_SIGNATURE` при неверной подписи.
- **Delivery (детально).** `GET .../delivery` расшифровывает payload на сервере и отдаёт только владельцу, с записью в AuditLog. `404` для чужого заказа (существование не раскрывается) и для ещё не выданных позиций. Ручная выдача и замена — на стороне админа/воркера.
- **Money.** Всегда строка `^-?\d+\.\d{2}$`; валюта — отдельным полем `currency`.
- **Admin.** Все `/admin/*` под RBAC (`admin`/`support`), при отсутствии прав — `403 FORBIDDEN`. Группы покрыты; детально проработаны deliver/refund/stock-import как затрагивающие деньги и секреты.
- **Заголовки.** `Idempotency-Key` — на checkout/topups/refund; `Accept-Language`/`?locale` — на каталоге и контенте.
