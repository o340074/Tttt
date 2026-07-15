# 17 — Операционный ранбук (прод-готовность, E11)

Практический чек-лист эксплуатации к запуску MVP. Дополняет `09-security-compliance.md`
(там — чек-лист безопасности) конкретикой по мониторингу, бэкапам, секретам и деплою.

## 1. Конфигурация окружения и секреты

Все секреты — только через переменные окружения (в репозитории их нет; `.env`
в `.gitignore`). Обязательны к переопределению в проде (иначе `validateEnv` роняет
процесс при `NODE_ENV=production`):

| Переменная | Назначение |
|------------|-----------|
| `DATABASE_URL` | PostgreSQL (TLS в транзите; шифрование диска на уровне провайдера) |
| `REDIS_URL` | Redis (сессии/jti, резерв стока, очередь уведомлений BullMQ) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | подпись JWT (не `*-change-me`) |
| `PAYMENT_WEBHOOK_SECRET` | HMAC-проверка вебхуков оплаты |
| `PAYLOAD_ENCRYPTION_KEY` | key-ring AES-256-GCM для секретных payload (`v1:<base64 32B>[,v0:…]`) |
| `CORS_ORIGIN` | только доверенный origin фронта |
| `WEB_URL` | база для ссылок в письмах |

- **Ротация ключа шифрования:** добавить новую версию в начало `PAYLOAD_ENCRYPTION_KEY`
  (`v2:…,v1:…`) и передеплоить — новые записи шифруются `v2`, старые читаются `v1`;
  перешифровать лениво. Старую версию убрать только после полной миграции.
- **Секреты не в логи:** mailer не логирует verify/reset-токены в проде; payload
  расшифровывается только в тело выдачи владельцу (никогда в лог). Подтверждено тестами
  (`mailer.service.spec`, `payload-crypto.spec`).

## 2. Заголовки безопасности и CSP (E11)

- Helmet на API (`common/security.ts`): CSP `default-src 'none'`, `frame-ancestors 'none'`,
  HSTS (только в проде), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Powered-By` снят.
- Swagger (`/api/docs`) монтируется только вне продакшена и получает ослабленный CSP;
  в проде карта API не публикуется.
- Rate-limit: глобальный потолок `@nestjs/throttler` (300/мин) + узкие лимиты на
  чувствительных `/auth/*` (login/register/reset).
- **CSP для web-SPA:** при отдаче статики (Nginx/хостинг) выставить строгий CSP уровня
  документа, напр.:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; connect-src 'self' <API_ORIGIN>; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'` + HSTS. (`'unsafe-inline'` для стилей — Tailwind
  инлайнит критические стили; скрипты — только `'self'`.)

## 3. Здоровье и мониторинг

- **Health:** `GET /api/v1/health` → `status: ok|degraded` + `dependencies.{database,redis}`.
  Использовать как liveness/readiness-проба (readiness = зависимости `up`).
- **Метрики/алерты (рекомендация):** подключить Sentry (ошибки) и метрики на:
  - долю ошибок 5xx и `INTERNAL_ERROR`;
  - расхождение баланса (сверка `User.balance` ↔ сумма `LedgerEntry`);
  - глубину очереди `bull:notifications:*` и число failed-джоб;
  - зависшие `pending` top-up и просроченные резервы стока (свипы уже есть в коде).
- **Очередь уведомлений (BullMQ):** воркер с ретраями (5 попыток, экспоненциальный backoff);
  `removeOnFail: 100` — хвост неуспешных джоб доступен для разбора. При падении Redis
  `emit` деградирует до синхронной доставки (уведомление не теряется).

## 4. Бэкапы и восстановление

- **PostgreSQL:** ежедневный `pg_dump`/`pg_basebackup` + WAL-архив для PITR; хранить
  вне основного хоста, шифровать бэкапы. Проверять восстановление регулярно (test-restore).
  Пример дампа: `pg_dump "$DATABASE_URL" -Fc -f advault-$(date +%F).dump`;
  восстановление: `pg_restore -d "$DATABASE_URL" --clean --if-exists advault-YYYY-MM-DD.dump`.
- **Миграции:** прод применяет `prisma migrate deploy` (не `dev`). Миграции —
  форвард-онли; откат = восстановление из бэкапа + повторный деплой.
- **Redis:** данные восстановимы (сессии/очередь эфемерны). Для очереди включить AOF,
  если важна доставка in-flight уведомлений при рестарте.
- **Секретный key-ring:** резервировать `PAYLOAD_ENCRYPTION_KEY` отдельно от БД —
  без него зашифрованные payload невосстановимы.

## 5. Деплой

1. Прогнать CI: lint + typecheck + test + build (зелёные).
2. `prisma migrate deploy` на прод-БД (в maintenance-окне при breaking-изменениях).
3. Выкатить API (`node dist/main.js`, `NODE_ENV=production`, все секреты заданы) и
   web (статика за CDN/Nginx с CSP+HSTS).
4. Health-проба зелёная → переключить трафик.
5. Разделять окружения dev/stage/prod; секреты — в менеджере секретов.

## 6. E2E и нагрузочная проверка

- **E2E (Playwright):** `apps/web/e2e/*` — сторфронт (каталог→товар→отзывы), auth
  (регистрация→verify, логин). Запуск против живого стека:
  `VITE_API_PROXY_TARGET=http://localhost:<api> pnpm --filter @advault/web test:e2e`.
  Исключены из `pnpm test` (нужны Postgres+Redis+API) — отдельная стадия CI.
- **Ключевые потоки на реальном стеке** проверены curl'ом (E11): регистрация/логин,
  покупка стока с авто-выдачей, отзывы (создание/дедуп/модерация/пересчёт рейтинга),
  security-заголовки, доставка уведомления через BullMQ-воркер.
- **Нагрузка (рекомендация перед запуском):** прогнать выдачу/checkout под нагрузкой
  (k6/Artillery) — узкие места: резерв стока (Redis TTL), `LedgerService.debit`
  в транзакции. Идемпотентность (`Idempotency-Key`, уникальный `externalId`,
  ledger-unique) защищает от двойных операций при ретраях.
