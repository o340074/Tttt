# 05 — Модель данных

Реляционная схема (PostgreSQL + Prisma). Ниже — сущности, ключевые поля и связи.
Финансовые движения ведём через **ledger** (двойная запись), баланс — производная.

## Диаграмма связей (упрощённо)

```
User ──1:N── Order ──1:N── OrderItem ──N:1── ProductVariant ──N:1── Product ──N:1── Category
  │            │                                   │
  │            └──1:N── Delivery                    └──1:N── StockItem
  │
  ├──1:N── LedgerEntry (движения баланса)
  ├──1:N── TopUp (пополнения)
  ├──1:N── Ticket ──1:N── TicketMessage
  └──1:N── Review
```

## Сущности

### User
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| email | string, unique | |
| passwordHash | string | argon2/bcrypt |
| role | enum | user, support, admin |
| status | enum | active, blocked |
| balance | decimal(18,2) | кэш баланса, источник истины — ledger |
| locale | string | напр. `en`, `ru` |
| emailVerifiedAt | datetime? | |
| twoFactorSecret | string? | TOTP (v2) |
| createdAt / updatedAt | datetime | |

### Category
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| parentId | uuid? | дерево категорий |
| slug | string, unique | |
| position | int | сортировка |
| translations | 1:N CategoryTranslation | name по locale |

### Product
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| categoryId | uuid (FK) | |
| slug | string, unique | |
| status | enum | draft, published, hidden |
| ratingAvg | decimal? | денормализация из Review |
| translations | 1:N ProductTranslation | name, description по locale |
| attributes | jsonb | гео, тип аккаунта, лимиты и т.п. |
| createdAt / updatedAt | datetime | |

### ProductVariant (SKU)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| productId | uuid (FK) | |
| sku | string, unique | |
| price | decimal(18,2) | |
| currency | string | базовая валюта учёта (напр. USD) |
| deliveryType | enum | **auto** (из стока) / **manual** (под заказ) |
| stockCount | int | кэш кол-ва доступного стока (для auto) |
| isActive | bool | |
| attributes | jsonb | параметры конкретного варианта |

### StockItem (для auto-выдачи)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| variantId | uuid (FK) | |
| payload | text (**зашифровано**) | данные к выдаче (логин:пароль и т.п.) |
| status | enum | available, reserved, sold |
| reservedUntil | datetime? | TTL резерва |
| orderItemId | uuid? | привязка после продажи |
| createdAt | datetime | |

### Order
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| userId | uuid (FK) | |
| number | string, unique | человекочитаемый номер |
| status | enum | pending, paid, partially_delivered, delivered, cancelled, refunded |
| subtotal / discount / total | decimal(18,2) | |
| promoCodeId | uuid? | |
| createdAt / updatedAt | datetime | |

### OrderItem
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| orderId | uuid (FK) | |
| variantId | uuid (FK) | |
| quantity | int | |
| unitPrice | decimal(18,2) | цена на момент покупки |
| deliveryType | enum | auto/manual (снимок) |
| deliveryStatus | enum | pending, awaiting_manual, delivered, replaced |

### Delivery
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| orderItemId | uuid (FK) | |
| stockItemId | uuid? | для auto |
| payload | text (**зашифровано**) | что выдали (снимок) |
| deliveredBy | uuid? | админ (для manual) |
| deliveredAt | datetime? | |
| type | enum | auto, manual, replacement |

### Wallet / LedgerEntry (двойная запись)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| userId | uuid (FK) | |
| direction | enum | credit (зачисление), debit (списание) |
| amount | decimal(18,2) | всегда положительное |
| balanceAfter | decimal(18,2) | снимок баланса после операции |
| refType | enum | topup, order, refund, adjustment, replacement |
| refId | uuid | ссылка на источник |
| createdAt | datetime | |

### TopUp (пополнение криптой)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| userId | uuid (FK) | |
| provider | string | напр. cryptomus |
| externalId | string, unique | id платежа у эквайринга (идемпотентность) |
| amount | decimal(18,2) | |
| asset | string | USDT/BTC/ETH и сеть |
| status | enum | pending, paid, expired, failed |
| paymentUrl / address | string | |
| createdAt / paidAt | datetime | |

### PromoCode (v2)
| Поле | Тип | Заметки |
|------|-----|---------|
| id, code (unique) | | |
| type | enum | percent, fixed |
| value | decimal | |
| maxUses / usedCount | int | |
| expiresAt | datetime? | |

### Ticket / TicketMessage
| Поле | Тип | Заметки |
|------|-----|---------|
| Ticket.id | uuid (PK) | userId, orderId?, subject, status(open/pending/closed), priority |
| TicketMessage.id | uuid (PK) | ticketId, authorId, body, attachments(jsonb), createdAt |

### Review
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | userId, productId, orderId, rating(1–5), body, createdAt |
| | | ограничение: только по купленному товару |

### AuditLog (админ-действия)
| Поле | Тип | Заметки |
|------|-----|---------|
| id, actorId, action, entity, entityId, diff(jsonb), createdAt | | кто что изменил |

## Заметки по целостности

- **Деньги** — только `decimal`, никогда `float`.
- **Баланс** пересчитывается/сверяется из `LedgerEntry`; поле `User.balance` — кэш.
- **StockItem.payload** и **Delivery.payload** — шифруются на уровне приложения
  (см. [09](./09-security-compliance.md)).
- **Уникальность `TopUp.externalId`** и `refId`-проверки обеспечивают идемпотентность.
- Переводы (i18n контента) — в отдельных `*Translation` таблицах по `locale`.
