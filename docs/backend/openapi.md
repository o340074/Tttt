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
  - name: Auth
  - name: Users
  - name: Catalog
  - name: Cart
  - name: Orders
  - name: Delivery
  - name: Wallet
  - name: Webhooks
  - name: Support
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
        children:
          type: array
          items: { $ref: '#/components/schemas/Category' }

    ProductVariant:
      type: object
      properties:
        id: { type: string, format: uuid }
        sku: { type: string }
        price: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }
        deliveryType: { type: string, enum: [auto, manual] }
        stockCount: { type: integer, description: Доступно к покупке (для auto) }
        isActive: { type: boolean }
        attributes: { type: object, additionalProperties: true }

    Product:
      type: object
      properties:
        id: { type: string, format: uuid }
        categoryId: { type: string, format: uuid }
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
        name: { type: string }
        ratingAvg: { type: [string, "null"] }
        minPrice: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }

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
      properties:
        id: { type: string, format: uuid }
        variantId: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string }
        quantity: { type: integer, minimum: 1 }
        unitPrice: { $ref: '#/components/schemas/Money' }
        lineTotal: { $ref: '#/components/schemas/Money' }

    Cart:
      type: object
      properties:
        id: { type: string, format: uuid }
        items:
          type: array
          items: { $ref: '#/components/schemas/CartItem' }
        subtotal: { $ref: '#/components/schemas/Money' }
        currency: { $ref: '#/components/schemas/Currency' }

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
      description: Оформление заказа из корзины. Оплата списанием с баланса.
      properties:
        promoCode: { type: string, description: Опциональный промокод (v2) }
        cartId: { type: string, format: uuid, description: Явная корзина; по умолчанию — корзина пользователя }

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
          enum: [pending, awaiting_manual, delivered, replaced]

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
        items:
          type: array
          items: { $ref: '#/components/schemas/OrderItem' }
        createdAt: { type: string, format: date-time }

    DeliveryPayload:
      type: object
      description: Расшифрованные данные выдачи. Отдаются только владельцу заказа; доступ логируется.
      properties:
        orderItemId: { type: string, format: uuid }
        type: { type: string, enum: [auto, manual, replacement] }
        payload:
          type: string
          description: Расшифрованный секрет (логин:пароль и т.п.).
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
          items: { $ref: '#/components/schemas/LedgerEntry' }

    CreateTopUpRequest:
      type: object
      required: [amount, asset]
      properties:
        amount: { $ref: '#/components/schemas/Money' }
        asset:
          type: string
          description: Актив и сеть, напр. USDT-TRC20, BTC, ETH.
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
          description: Строки стока (payload шифруется на сервере).
          items: { type: string }

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
      summary: Отзыв refresh-токена
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
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: categoryId, in: query, schema: { type: string, format: uuid } }
        - { name: q, in: query, schema: { type: string } }
        - { name: minPrice, in: query, schema: { type: string } }
        - { name: maxPrice, in: query, schema: { type: string } }
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
      summary: Оформить заказ (резерв стока + оплата с баланса)
      description: >
        Проверка наличия и резерв стока (auto-позиции), проверка баланса >= total.
        В одной транзакции: LedgerEntry(debit) + User.balance -= total + Order=paid,
        затем запуск выдачи. При недостатке баланса — INSUFFICIENT_BALANCE, резерв снимается.
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
          description: Нет стока (OUT_OF_STOCK) либо конфликт идемпотентности (IDEMPOTENCY_CONFLICT).
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
      description: Каждый доступ логируется в AuditLog.
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: itemId, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/DeliveryPayload' } } }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404':
          description: Ещё не выдано либо не найдено.
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
        Не требует пользовательского JWT. Проверка подписи провайдера (заголовок).
        Идемпотентность по externalId: если TopUp уже paid — выход без повторного зачисления.
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

  /admin/variants/{id}/stock/import:
    post:
      tags: [Admin]
      summary: Импорт стоков (CSV/TXT), payload шифруется на сервере
      parameters: [ { name: id, in: path, required: true, schema: { type: string, format: uuid } } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StockImportRequest' }
      responses:
        '201':
          description: Импортировано; возвращает количество добавленных стоков.
          content:
            application/json:
              schema:
                type: object
                properties: { imported: { type: integer } }
        '403': { $ref: '#/components/responses/Forbidden' }

  /admin/stock:
    get:
      tags: [Admin]
      summary: Просмотр стоков и статусов
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: variantId, in: query, schema: { type: string, format: uuid } }
        - { name: status, in: query, schema: { type: string, enum: [available, reserved, sold] } }
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }

  /admin/orders:
    get:
      tags: [Admin]
      summary: Все заказы, фильтры
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - { name: status, in: query, schema: { type: string } }
        - { name: userId, in: query, schema: { type: string, format: uuid } }
      responses: { '200': { description: OK }, '403': { $ref: '#/components/responses/Forbidden' } }

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
- **Checkout (детально).** Требует `Idempotency-Key`. Коды: `402 INSUFFICIENT_BALANCE`, `409 OUT_OF_STOCK`/`IDEMPOTENCY_CONFLICT`. Логика — резерв стока → проверка баланса → транзакция (ledger debit + Order=paid) → запуск выдачи, полностью по [`08`](../08-payments-delivery.md).
- **Wallet/TopUps (детально).** `POST /wallet/topups` идемпотентен, отдаёт `address`/`paymentUrl`/статус. `GET /wallet/topups/:id` — поллинг статуса до `paid/expired`.
- **Webhooks (детально).** Без JWT, проверка подписи (`X-Signature`), идемпотентность по `externalId`. `200` — только после успешной записи в БД (иначе провайдер повторяет). `401 INVALID_SIGNATURE` при неверной подписи.
- **Delivery (детально).** `GET .../delivery` расшифровывает payload на сервере и отдаёт только владельцу, с записью в AuditLog. `403` для чужого заказа. Ручная выдача и замена — на стороне админа/воркера.
- **Money.** Всегда строка `^-?\d+\.\d{2}$`; валюта — отдельным полем `currency`.
- **Admin.** Все `/admin/*` под RBAC (`admin`/`support`), при отсутствии прав — `403 FORBIDDEN`. Группы покрыты; детально проработаны deliver/refund/stock-import как затрагивающие деньги и секреты.
- **Заголовки.** `Idempotency-Key` — на checkout/topups/refund; `Accept-Language`/`?locale` — на каталоге и контенте.
