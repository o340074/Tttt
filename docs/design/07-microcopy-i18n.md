# Design 07 — Микрокопирайтинг и локализация

## Тон текста
- Уверенный, короткий, технологичный. Премиум = ясность без «воды».
- Без агрессивного маркетинга и обмана. Обещания = реальные (мгновенная выдача для
  стоковых, честный статус для ручных).
- EN — дефолт; RU — полный паритет. Формальность: EN «you», RU «вы».

## Принципы i18n
- Все строки — через ключи (react-i18next), никакого хардкода в JSX.
- Плюрализация и интерполяция через ICU/i18next (`{{count}}` товаров).
- Форматы дат/чисел/валют — по локали (`Intl`).
- Направление письма — LTR (задел под RTL при будущих языках).
- Ключи по неймспейсам: `common`, `auth`, `catalog`, `product`, `cart`, `checkout`,
  `wallet`, `orders`, `delivery`, `support`, `admin`, `errors`.

## Пример структуры словаря

```jsonc
// en/common.json
{
  "cta": { "browse": "Browse catalog", "buyNow": "Buy now", "addToCart": "Add to cart",
           "topUp": "Top up balance", "checkout": "Checkout", "signup": "Sign up",
           "login": "Log in" },
  "status": { "inStock": "In stock", "inStock_count": "{{count}} in stock",
              "preorder": "Made to order", "outOfStock": "Out of stock",
              "paid": "Paid", "pending": "Pending", "delivered": "Delivered",
              "awaitingManual": "Preparing your order" },
  "balance": "Balance", "total": "Total", "copied": "Copied to clipboard"
}
```

```jsonc
// ru/common.json
{
  "cta": { "browse": "В каталог", "buyNow": "Купить сейчас", "addToCart": "В корзину",
           "topUp": "Пополнить баланс", "checkout": "Оформить", "signup": "Регистрация",
           "login": "Войти" },
  "status": { "inStock": "В наличии", "inStock_count": "В наличии: {{count}}",
              "preorder": "Под заказ", "outOfStock": "Нет в наличии",
              "paid": "Оплачено", "pending": "Ожидание", "delivered": "Выдано",
              "awaitingManual": "Готовим ваш заказ" },
  "balance": "Баланс", "total": "Итого", "copied": "Скопировано" }
}
```

## Ключевые тексты (EN / RU)

### Hero
- EN: **"Premium ad accounts. Unlocked instantly."** — *Buy verified advertising
  accounts with crypto. Instant delivery, guaranteed replacement.*
- RU: **«Премиальные рекламные аккаунты. Доступ за секунды.»** — *Покупайте
  проверенные рекламные аккаунты за крипту. Мгновенная выдача и гарантия замены.*

### Сообщения об ошибках (тон: спокойный, конкретный, без вины пользователя)
| Ситуация | EN | RU |
|----------|----|----|
| Неверный вход | Invalid email or password. | Неверный email или пароль. |
| Недостаточно баланса | Not enough balance. Top up to continue. | Недостаточно средств. Пополните баланс. |
| Товар закончился | This item just sold out. | Товар только что закончился. |
| Сеть | Connection issue. Please retry. | Проблема с сетью. Повторите попытку. |
| Rate limit | Too many attempts. Try again in {{sec}}s. | Слишком много попыток. Повторите через {{sec}} c. |
| Промокод недействителен | This promo code isn't valid. | Промокод недействителен. |

### Пустые состояния
| Экран | EN | RU |
|-------|----|----|
| Корзина | Your cart is empty. | Корзина пуста. |
| Заказы | No orders yet. | Заказов пока нет. |
| Поиск | Nothing matches your filters. | Ничего не найдено по фильтрам. |
| Тикеты | No tickets. Need help? | Тикетов нет. Нужна помощь? |
| Vault | No purchased items yet. | Купленных товаров пока нет. |

### Успехи (позитивный фидбек)
| Событие | EN | RU |
|---------|----|----|
| Оплата | Payment successful. Your item is ready. | Оплата прошла. Товар готов. |
| Пополнение | Balance topped up. | Баланс пополнен. |
| Копирование | Copied to clipboard. | Скопировано в буфер. |
| Тикет создан | Ticket created. We'll reply soon. | Тикет создан. Скоро ответим. |

## Правила текста в UI
- Кнопки — глагол действия («Купить», «Пополнить»), не «ОК».
- Заголовки — по делу, без кликбейта.
- Числа/деньги — формат по локали, валюта учёта явно (USD/USDT).
- Секретные данные — никогда в письмах/логах открытым текстом; в письме — ссылка в ЛК.
- Юридические тексты (ToS/Privacy/Refund) — отдельные документы, доступны из футера.

## Переключение языка
- Селектор языка в app bar и в настройках.
- Определение при первом визите: по `Accept-Language`, дефолт EN.
- Выбор сохраняется в профиль (авторизован) и в localStorage (гость).
