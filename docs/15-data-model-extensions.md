# 15 — Расширения модели данных (прогрев, ресурсы, комплект)

Дополняет [05 — Модель данных](./05-data-model.md) новыми сущностями под заказы с
прогревом, инвентарь прокси/Octo-профилей, комплекты выдачи и персонал. Деньги —
`decimal`, секреты — шифруются на уровне приложения.

## Обзор новых связей

```
ProductVariant ──(fulfillmentType, goal)── WarmingPlan ──1:N── WarmingStageTemplate
      │
OrderItem ──1:1── WarmingJob ──1:N── WarmingTask (экземпляры этапов)
                     │
                     ├── AccountAsset (данные аккаунта, зашифр.)
                     ├── ProxyItem (assigned)
                     ├── OctoProfile (ready)
                     └── Bundle ──1:N── BundleComponent ──► Delivery ──► Vault покупателя

StaffUser (роль/скиллы) ──назначается──► WarmingJob / Ticket
```

## Изменения существующих сущностей

### ProductVariant (+поля)
| Поле | Тип | Заметки |
|------|-----|---------|
| fulfillmentType | enum | READY_STOCK / MADE_TO_ORDER |
| goal | string? | напр. `google_ads`, `chrome_extension_dev` (для warm) |
| warmingPlanId | uuid? | план прогрева (для warm) |
| tier | string? | тариф прогрева (напр. `warm_7d`) |
| bundleSpec | jsonb | какие компоненты включены и их параметры |
| etaMinutes | int? | кэш расчётной ETA из плана |
| warrantyHours | int? | окно гарантии |

## Новые сущности

### WarmingPlan
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| goal | string | цель, к которой применим |
| tier | string? | тариф |
| name | string | человекочитаемое имя |
| version | int | версионирование (не ломать идущие задачи) |
| isActive | bool | |
| qcRules | jsonb | правила проверки качества |

### WarmingStageTemplate
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| planId | uuid (FK) | |
| order | int | порядок этапа |
| name | string | название |
| expectedMinutes | int | ожидаемая длительность (для ETA/SLA) |
| checklist | jsonb | пункты чек-листа |
| requiredComponents | jsonb | какие компоненты этап готовит (PROXY/OCTO/…) |

### WarmingJob
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| orderItemId | uuid (FK, unique) | 1:1 с позицией заказа |
| planId / planVersion | uuid / int | зафиксированный план на момент старта |
| status | enum | created, queued, assigned, in_progress, qc, ready, delivered, on_hold, failed, rework |
| assignedTo | uuid? (StaffUser) | оператор |
| etaAt | datetime? | ожидаемое время выдачи (покупателю) |
| slaDueAt | datetime? | внутренний дедлайн |
| startedAt / readyAt / deliveredAt | datetime? | |
| currentStageOrder | int | текущий этап |
| notes | text? | внутренние заметки |

### WarmingTask (экземпляр этапа)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| jobId | uuid (FK) | |
| stageTemplateId | uuid (FK) | из какого шаблона |
| order | int | |
| status | enum | pending, in_progress, done, skipped, blocked |
| checklistState | jsonb | отметки по пунктам |
| startedAt / doneAt | datetime? | |
| operatorId | uuid? | кто выполнял |
| attachments | jsonb | артефакты/заметки |

### AccountAsset (данные аккаунта для warm-заказа)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| jobId | uuid (FK) | |
| payload | text (**зашифровано**) | логин/пароль и связанные данные |
| recovery | text? (**зашифровано**) | recovery-данные |
| meta | jsonb | гео, тип и т.п. |

### ProxyItem (инвентарь прокси)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| type | enum | residential, mobile, isp, datacenter |
| geo | string | страна/город |
| provider | string | источник |
| credentials | text (**зашифровано**) | host:port:user:pass |
| status | enum | available, assigned, expired, disabled |
| expiresAt | datetime? | |
| assignedJobId | uuid? | привязка к задаче |
| createdBy | uuid (StaffUser) | |

### OctoProfile (реестр антидетект-профилей)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| externalId | string? | идентификатор профиля в Octo |
| name | string | |
| proxyItemId | uuid? | привязанный прокси |
| jobId | uuid? | привязка к задаче |
| status | enum | draft, ready, delivered |
| exportRef | text? (**зашифровано**) | ссылка на экспорт/шеринг профиля |
| fingerprintRef | jsonb? | референс конфигурации |
| createdBy | uuid (StaffUser) | |

### Bundle (комплект выдачи)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| jobId | uuid (FK, unique) | |
| status | enum | assembling, qc, ready, delivered |
| assembledBy / qcBy | uuid? | |
| deliveredAt | datetime? | |

### BundleComponent
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| bundleId | uuid (FK) | |
| type | enum | ACCOUNT, PROXY, OCTO_PROFILE, RECOVERY, SECRETS, GUIDE, WARRANTY |
| refId | uuid? | ссылка на ресурс (ProxyItem/OctoProfile/AccountAsset) |
| payload | text? (**зашифровано**) | инлайновые данные/ссылка |
| meta | jsonb | параметры |

### StaffUser (персонал)
| Поле | Тип | Заметки |
|------|-----|---------|
| id | uuid (PK) | |
| email / passwordHash | | |
| role | enum | owner, admin, manager, operator, support |
| skills | jsonb | goals, которые умеет вести оператор |
| isActive | bool | |
| availability | jsonb? | смены/доступность (для распределения) |

> Можно объединить с `User` через поле `staffRole`, но для чистоты прав и аудита
> рекомендуется отдельная сущность/таблица персонала.

## Расширение Delivery (из 05)
- `Delivery` теперь может ссылаться на `Bundle` (для warm) либо на `StockItem` (для
  stock). Тип: auto, manual, warm, replacement.

## Индексы и целостность
- Уникальные: `WarmingJob.orderItemId`, `Bundle.jobId`, `ProxyItem` активные привязки.
- Индексы по статусам (`WarmingJob.status`, `ProxyItem.status`) — для очередей/выборок.
- Все `payload/credentials/exportRef/recovery` — шифрование (AES-256-GCM, KMS-ключ),
  доступ к расшифровке — по праву и с аудитом.
- Версионирование планов: `WarmingJob` хранит `planVersion` — правки плана не ломают
  уже запущенные задачи.

## Полная Prisma-схема
Обновлённая Prisma-схема со всеми этими моделями будет дополнена в
[`docs/backend/prisma-schema.md`](./backend/prisma-schema.md) при реализации Фазы БД.
