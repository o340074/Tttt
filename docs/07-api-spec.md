# 07 — Спецификация API

REST/JSON. Базовый префикс `/api/v1`. Аутентификация — JWT (access в заголовке
`Authorization: Bearer`, refresh — в HTTP-only cookie). Все ошибки — единый формат.

## Соглашения

- Форматы дат — ISO 8601 (UTC).
- Деньги — строки с двумя знаками (`"12.50"`), валюта учёта отдельным полем.
- Пагинация — `?page=1&limit=20`, ответ включает `meta: { total, page, limit }`.
- Локаль — заголовок `Accept-Language` или `?locale=en|ru`.
- Идемпотентность мутаций оплаты — заголовок `Idempotency-Key`.

### Формат ошибки
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Not enough balance to complete the order",
    "details": { "required": "20.00", "available": "12.50" }
  }
}
```

## Auth
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/register` | Регистрация (email, password). |
| POST | `/auth/login` | Вход, выдаёт access + refresh. |
| POST | `/auth/refresh` | Обновление access по refresh. |
| POST | `/auth/logout` | Отзыв refresh. |
| POST | `/auth/verify-email` | Подтверждение email по токену. |
| POST | `/auth/forgot-password` | Запрос сброса пароля. |
| POST | `/auth/reset-password` | Сброс по токену. |

## Users / профиль
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/me` | Текущий пользователь (профиль, роль, баланс). |
| PATCH | `/me` | Обновить профиль/локаль. |
| POST | `/me/change-password` | Смена пароля. |

## Каталог
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/categories` | Дерево категорий. |
| GET | `/products` | Список товаров (фильтры: `categoryId`, `q`, `minPrice`, `maxPrice`, сортировка). |
| GET | `/products/:slug` | Карточка товара + варианты + наличие. |
| GET | `/products/:id/reviews` | Отзывы товара. |
| POST | `/products/:id/reviews` | Оставить отзыв (только если куплен). |

## Корзина / заказы
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/cart` | Текущая корзина. |
| POST | `/cart/items` | Добавить позицию (`variantId`, `quantity`). |
| PATCH | `/cart/items/:id` | Изменить количество. |
| DELETE | `/cart/items/:id` | Удалить позицию. |
| POST | `/orders/checkout` | Оформить заказ (проверка наличия, резерв, оплата с баланса). |
| GET | `/orders` | История заказов. |
| GET | `/orders/:id` | Детали заказа + статусы выдачи. |
| GET | `/orders/:id/items/:itemId/delivery` | Полученные данные (расшифровка на сервере, отдаётся владельцу). |
| POST | `/orders/:id/items/:itemId/replace` | Запрос гарантийной замены. |

## Кошелёк / пополнение
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/wallet` | Баланс + последние движения (ledger). |
| GET | `/wallet/transactions` | История транзакций (пагинация). |
| POST | `/wallet/topups` | Создать пополнение (`amount`, `asset`) → адрес/ссылка оплаты. |
| GET | `/wallet/topups/:id` | Статус пополнения. |

## Платёжные вебхуки (сервер→сервер)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/webhooks/payments/:provider` | Приём вебхука эквайринга. Проверка подписи, идемпотентность по `externalId`. Не требует пользовательского JWT. |

## Поддержка
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/tickets` | Мои тикеты. |
| POST | `/tickets` | Создать тикет (subject, body, orderId?). |
| GET | `/tickets/:id` | Тикет + сообщения. |
| POST | `/tickets/:id/messages` | Ответить в тикет. |

## Админ (`/admin`, роль admin/support)
| Метод | Путь | Описание |
|-------|------|----------|
| GET/POST/PATCH/DELETE | `/admin/categories` | CRUD категорий. |
| GET/POST/PATCH/DELETE | `/admin/products` | CRUD товаров и вариантов. |
| POST | `/admin/variants/:id/stock/import` | Импорт стоков (CSV/TXT). |
| GET | `/admin/stock` | Просмотр стоков, статусы. |
| GET | `/admin/orders` | Все заказы, фильтры. |
| POST | `/admin/orders/:id/items/:itemId/deliver` | Ручная выдача (внести payload). |
| POST | `/admin/orders/:id/refund` | Возврат средств (ledger + статус). |
| GET/PATCH | `/admin/users` | Список/редактирование, блокировка, корректировка баланса. |
| GET | `/admin/tickets` | Очередь тикетов. |
| GET | `/admin/stats` | Дашборд: выручка, заказы, топ-товары. |
| GET | `/admin/audit-log` | Журнал действий. |
| GET/POST | `/admin/promocodes` | Промокоды (v2). |
| GET/PUT | `/admin/i18n` | Управление переводами (при необходимости). |

## Безопасность API (сводка)
- Rate limiting на `/auth/*`, `/wallet/topups`, вебхуки.
- RBAC-гварды на `/admin/*`.
- Валидация всех входов (Zod/class-validator).
- Вебхуки: проверка подписи + идемпотентность, отдельный воркер.
- Выдача секретных payload — только владельцу заказа, по HTTPS, с аудитом доступа.

> Полный OpenAPI-контракт генерируется на этапе разработки (Swagger в NestJS).
> Этот документ — договорённость о поверхности API до написания кода.
