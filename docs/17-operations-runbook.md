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
| `SENTRY_DSN` (опц.) | DSN Sentry для отчётов об ошибках; пусто — выключено (no-op) |
| `SENTRY_RELEASE` (опц.) | тег релиза в событиях Sentry (напр. git SHA) |
| `WARRANTY_GRACE_MINUTES` (опц., дефолт 60) | буфер к гарантийному окну для проверки приёма заявки — заявка на границе не теряется из-за расхождения часов/медленной подачи; отображаемый expiresAt не продлевается (E10) |

Полный шаблон со всеми переменными и подсказками генерации секретов — `.env.example`
(включая compose-инфру `POSTGRES_*` для `docker-compose.prod.yml`).

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
- **CSP для web-SPA (реализовано, M5):** `apps/web/security-headers.conf` выставляет
  строгий CSP уровня документа
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'; object-src 'none'` + HSTS/X-Frame-Options/nosniff/no-referrer.
  `connect-src 'self'` достаточно, т.к. Nginx reverse-proxy'ит `/api` (same-origin).
  `'unsafe-inline'` только для стилей (Tailwind инлайнит критические); скрипты — `'self'`
  (сборка Vite не содержит inline-скриптов — проверено). Сниппет **не** навешивается на
  `/api/` — там уже свои helmet-заголовки (иначе два CSP пересеклись бы в браузере).

## 3. Здоровье и мониторинг

- **Health:** `GET /api/v1/health` → `status: ok|degraded` + `dependencies.{database,redis}`.
  Использовать как liveness/readiness-проба (readiness = зависимости `up`).
- **Метрики (реализовано, M5):** `GET /api/v1/admin/ops/metrics` (JSON) и
  `…/metrics.prom` (Prometheus text-exposition) под RBAC `manager`/`admin`. Отдают:
  - **сверку баланса per-user** — `reconciliation`: сравнивает кэш `User.balance`
    с истиной леджера (`SUM(credit) − SUM(debit)`) по **каждому** пользователю и
    возвращает дрейфующих (`driftingUsers`, `totalDrift`, sample worst-first).
    Это ловит взаимокомпенсирующиеся расхождения, которые глобальная сумма в
    `GET /admin/finance/summary` (`reconciled`) свела бы к нулю и пропустила;
  - **глубину очереди** `bull:notifications:*` (`waiting/active/delayed/failed/completed`;
    `available:false` при недоступном Redis);
  - **зависшие top-up** (`pending` и `pending` c истёкшим `expiresAt`).
  Алерты: `advault_balance_drifting_users > 0`, рост `…queue_failed`/`…queue_waiting`,
  `advault_topups_expired_pending > 0`.
- **Sentry (реализовано, M5):** ошибки 5xx/необработанные форвардятся в Sentry через
  envelope-API (`common/http-exception.filter` → `ops/error-reporter`), без SDK-зависимости.
  Включается заданием `SENTRY_DSN` (пусто — no-op; приложение никогда не зависит от
  доступности Sentry). Тегируется `SENTRY_RELEASE`. В событие идут только тип/сообщение/
  стек + метод/путь/статус — **никогда** тело/заголовки/секреты (docs/09).
- **Очередь уведомлений (BullMQ):** воркер с ретраями (5 попыток, экспоненциальный backoff);
  `removeOnFail: 100` — хвост неуспешных джоб доступен для разбора. При падении Redis
  `emit` деградирует до синхронной доставки (уведомление не теряется).

## 4. Бэкапы и восстановление

- **PostgreSQL (скрипты, M5):** `scripts/backup.sh` — сжатый custom-format `pg_dump`,
  опц. GPG-шифрование (`BACKUP_GPG_RECIPIENT`), ретеншен (`RETENTION_DAYS`, дефолт 14).
  Санитизирует Prisma-параметр `?schema=` (libpq его не понимает). Ставить на cron
  (ежедневно) + хранить вне основного хоста.
- **Тест-восстановление (скрипт, M5):** `scripts/restore-test.sh <dump>` — восстанавливает
  дамп в одноразовую БД на том же сервере, прогоняет smoke-проверку (наличие схемы +
  счётчики строк), затем удаляет её. **Непроверенный бэкап — не бэкап**; запускать регулярно
  (cron/CI), выход ≠0 алертить. Проверено вживую (dump→restore→smoke, чистая уборка).
- **Миграции:** прод применяет `prisma migrate deploy` (не `dev`). Миграции —
  форвард-онли; откат = восстановление из бэкапа + повторный деплой.
- **Redis:** данные восстановимы (сессии/очередь эфемерны). Для очереди включён AOF
  (`--appendonly yes` в `docker-compose.prod.yml`), если важна доставка in-flight
  уведомлений при рестарте.
- **Секретный key-ring:** резервировать `PAYLOAD_ENCRYPTION_KEY` отдельно от БД —
  без него зашифрованные payload невосстановимы.

## 5. Деплой

**Артефакты (M5):** `docker-compose.prod.yml` (postgres+redis+api+web, публикуется только
web), `apps/api/Dockerfile` (prod-сборка API), `apps/web/Dockerfile.prod` (сборка SPA →
Nginx), `apps/web/nginx.conf` + `apps/web/security-headers.conf` (отдача статики,
reverse-proxy `/api`, CSP/HSTS уровня документа), `.env.example` (шаблон секретов),
`scripts/deploy.sh` (оркестрация).

Порядок (автоматизирован в `scripts/deploy.sh`):

1. CI-гейт: `pnpm lint · typecheck · test · build` (зелёные; `SKIP_CI=1` если уже прогнан).
2. Собрать образы; поднять postgres+redis; применить `prisma migrate deploy`
   (форвард-онли; в maintenance-окне при breaking-изменениях).
3. Поднять API (`NODE_ENV=production`, все секреты заданы — иначе `validateEnv` роняет
   старт) и web (Nginx со статикой + reverse-proxy `/api`, CSP/HSTS).
4. Health-гейт: `GET /api/v1/health` зелёный → переключить трафик.
5. Разделять окружения dev/stage/prod; секреты — в менеджере секретов, не в git.
   Для управляемой БД/Redis — убрать соответствующие сервисы из compose и указать
   `DATABASE_URL`/`REDIS_URL` на внешние инстансы. TLS терминировать на LB/прокси перед web.

## 6. E2E и нагрузочная проверка

- **E2E (Playwright):** `apps/web/e2e/*` — сторфронт (каталог→товар→отзывы), auth
  (регистрация→verify, логин). Запуск против живого стека:
  `VITE_API_PROXY_TARGET=http://localhost:<api> pnpm --filter @advault/web test:e2e`.
  Исключены из `pnpm test` (нужны Postgres+Redis+API) — отдельная стадия CI.
- **Ключевые потоки на реальном стеке** проверены curl'ом (E11): регистрация/логин,
  покупка стока с авто-выдачей, отзывы (создание/дедуп/модерация/пересчёт рейтинга),
  security-заголовки, доставка уведомления через BullMQ-воркер.
- **Нагрузка (скрипты, M5):** `load/` (k6) — `checkout.js` (ramping-vus: пропускная
  способность покупки стока, пороги p95/error-rate) и `idempotency.js` (shared-iterations:
  30 конкурентных checkout с **одним** `Idempotency-Key` → ровно один заказ и **одно**
  списание; teardown ассертит баланс). Узкие места: резерв стока (Redis TTL),
  `LedgerService.debit` в транзакции. Идемпотентность (`Idempotency-Key`, уникальный
  `externalId`, ledger-unique) защищает от двойных операций при ретраях. Как запускать —
  `load/README.md` (нужен seeded READY_STOCK-вариант + `PAYMENT_WEBHOOK_SECRET`). Механика
  хелпера top-up (подпись вебхука) проверена вживую; сами сценарии требуют установленного
  `k6` в среде прогона.

## 7. Realtime-уведомления (WebSocket, E9)

- **Транспорт:** один `ws`-сервер поднят на **том же** HTTP-сервере Nest-процесса
  (отдельного сервиса нет). Путь `/api/ws/notifications` — за тем же прокси `/api`.
  Клиент (бейдж) подключается с access-JWT в query `?token=`; сервер пушит
  `{ "type":"unread", "unread": N }` при connect и при любом изменении непрочитанного
  владельца. Клиент деградирует к HTTP-поллингу `/notifications/unread-count`, если
  сокет недоступен.
- **Прокси:** dev — Vite (`vite.config.ts`, `ws:true` на `/api`); прод — Nginx
  (`apps/web/nginx.conf`: `map $http_upgrade $connection_upgrade` + заголовки Upgrade/
  Connection на `location /api/`, `proxy_read_timeout 3600s`). CSP `connect-src 'self'`
  покрывает same-origin WS — доп. правил не нужно.
- **Скоуп/масштаб (fan-out через Redis pub/sub, Трек A — ГОТОВО):** сокет живёт только
  на той реплике API, что приняла его upgrade, поэтому доставка/прочтение, обработанные
  на **другой** реплике, тоже должны его достичь. Каждая реплика **публикует** любое
  изменение непрочитанного в канал Redis `advault:notifications:unread`
  (payload `{ userId, unread }`) и **подписана** на него; обработчик подписки пушит
  апдейт локальным сокетам этой реплики. Публикатор получает и своё сообщение через
  собственную подписку — путь доставки единый, локального дубля нет. Счётчик считается
  один раз источником и рассылается дословно, так что все реплики согласованы.
  - **Соединения:** PUBLISH идёт по общему клиенту `RedisService`; для SUBSCRIBE поднят
    отдельный `duplicate()` (подписанное соединение не может слать другие команды).
    Подписка восстанавливается на каждом событии `ready` (переподключение самолечится).
  - **Деградация:** при недоступности Redis pub/sub (нет клиента / фейковый в тестах, или
    сбой PUBLISH) сервис откатывается к локальной доставке — функционально идентично
    прежнему одноинстансному режиму; поллинг-fallback клиента закрывает межинстансные
    пробелы (только задержка бейджа у части вкладок, без регрессии).
  - **Проверка:** unit-тесты моделируют межинстансный fan-out на фейковой шине +
    деградацию; вживую проверено на реальном Redis (публикация на реплике B доходит до
    сокета на реплике A; на реплике-источнике — ровно одна доставка, без дубля).
