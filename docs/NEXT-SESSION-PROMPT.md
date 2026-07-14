# Стартовые промты сессий

Здесь лежит **мастер-промт (самоориентирующийся)**, **готовый промт для ближайшей
сессии** и **универсальный шаблон**. Скопируй нужный в начало новой сессии.

---

## ⭐ МАСТЕР-ПРОМТ (самоориентирующийся, рекомендуется)

> Работает на любой ветке: сам находит проект и определяет текущий эпик. Копируй целиком.

```
Ты продолжаешь разработку проекта AdVault — премиальный маркетплейс цифровых
товаров (аккаунты Google Ads: готовые из стока и под заказ с прогревом операторами).

ШАГ 0 — НАЙДИ ПРОЕКТ И СОРИЕНТИРУЙСЯ (обязательно, до любых действий):
1. Проверь, что в рабочей папке есть проект — файлы CLAUDE.md и docs/16-development-plan.md.
2. Если их нет (папка пустая / не та ветка), выполни:
     git fetch --all
     git checkout claude/advault-e7-proxy-octo-inventory-vsnw75   # актуальная база с кодом E0…E7
   (в main пока только документация/прототипы — код эпиков туда ещё не влит;
   проверяй: рядом с docs/ должны быть apps/ и packages/).
3. Прочитай для контекста, строго в этом порядке:
     - CLAUDE.md            — что строим, где что лежит, конвенции, границы;
     - docs/SESSION-LOG.md  — что уже сделано и какой эпик следующий;
     - docs/16-development-plan.md — детальный план (эпики E0–E11, вехи M0–M5);
     - раздел плана по текущему эпику + релевантные доки
       (docs/03-tech-stack, docs/04-architecture, docs/design/*, docs/backend/*).
4. Определи текущий эпик из docs/SESSION-LOG.md (блок «Текущий статус»).
   Если ещё ничего не начато — это эпик E0 «Каркас монорепо».

ЦЕЛЬ СЕССИИ — довести до готовности текущий эпик (сейчас это E8 «Полная админка / операторка»):
  - Контракты вперёд: зафиксируй в docs/backend/{prisma-schema,openapi}.md админ/
    операторские эндпоинты по docs/13 (Orders, Warming-workspace/Kanban, Stock, Inventory
    прокси/Octo, Catalog CRUD, Users, Promo); затем код;
  - apps/api: операторские/админ-маршруты поверх данных E2/E5/E6/E7 (RBAC по ролям,
    danger-confirm + AuditLog на необратимом); недостающие CRUD (напр. GET /admin/stock,
    catalog/promo CRUD, users);
  - apps/web: админ/операторский UI по docs/13 и прототипу prototype/screens/admin.html —
    Warming Kanban/workspace (assign/transition/tasks/account/bind прокси+Octo из E7),
    инвентарь прокси/Octo (список/создание/импорт/bind), таблицы Orders/Stock/Users;
  - тесты: unit/smoke ключевых операторских сценариев.
  Критерий приёмки: всё управляется из админки; операторка ведёт warm-заказ end-to-end
  (включая привязку прокси/Octo из E7); lint/typecheck/тесты/CI зелёные.

КОНВЕНЦИИ (из CLAUDE.md, обязательно):
  - Контракты вперёд: меняешь поведение — сначала обнови OpenAPI/Prisma в docs/backend.
  - Вертикальный срез: фронт→API→БД→тесты.
  - Дизайн только по docs/design/* и прототипу; иконки — SVG-спрайт, БЕЗ эмодзи; i18n EN/RU через ключи.
  - Деньги: decimal + транзакции + ledger + идемпотентность. Секреты: шифрование + аудит.
    RBAC на админ/операторских маршрутах; danger-confirm на необратимом.
  - Граница платформы: НЕ автоматизируем прогрев/действия в аккаунтах/обход детекта —
    только бизнес-логистика (каталог, заказы, инвентарь, очереди, трекинг, выдача, аудит).

GIT: создай feature-ветку под эпик от актуальной базы (напр. feat/E1-auth);
понятные коммиты; в конце — git push -u origin <ветка>.

ВОПРОСЫ: при любой значимой развилке (выбор библиотек, структура, спорное решение или
неоднозначность требований) — спрашивай в режиме asking (AskUserQuestion), не угадывай.

В КОНЦЕ СЕССИИ (ритуал):
  1. Обнови docs/SESSION-LOG.md: что сделано, статус эпика (E7=готово), следующий эпик (E8).
  2. Обнови статусы в docs/16 и контракты в docs/backend при изменениях.
  3. commit + push.
  4. Подготовь готовый промт следующего эпика в docs/NEXT-SESSION-PROMPT.md.
```

Для следующих эпиков просто замени в блоке «ЦЕЛЬ СЕССИИ» задачи и критерий на нужный
эпик из `docs/16` (мастер-промт сам подхватит текущий эпик из SESSION-LOG).

---

## ✅ ГОТОВЫЙ ПРОМТ — Сессия E8 (Полная админка / операторка)

> Скопируй блок ниже целиком в новую сессию.

```
Продолжаем разработку проекта AdVault (маркетплейс цифровых товаров: аккаунты Google
Ads — готовые из стока и под заказ с прогревом операторами). Готовы эпики E0 (каркас:
pnpm-монорепо apps/{web,api} + packages/{types,config}, /health, docker-compose, CI),
E1 (auth: JWT access+refresh с ротацией в Redis, argon2id, verify/reset, guard-роуты,
ЛК, /me), E2 (каталог: Category/Product/ProductVariant+Translation, публичные GET
/categories|/products|/products/:slug, локализация EN-RU, витрина/каталог/карточка,
сидер), E3 (кошелёк: LedgerEntry/TopUp/IdempotencyKey, POST /wallet/topups c
Idempotency-Key, вебхук с HMAC, sandbox-провайдер, экран /wallet), E4 (корзина/заказы:
Cart/CartItem/Order/OrderItem/PromoCode, серверная корзина, POST /orders/checkout с
идемпотентностью и ledger-дебетом, экран /checkout), E5 (выдача из стока READY_STOCK:
StockItem/Delivery/AuditLog, шифрование payload AES-256-GCM, двухфазный резерв→sold +
Delivery(type=auto), GET /orders/:id/items/:itemId/delivery, импорт стока admin, Vault),
E6 (прогрев MADE_TO_ORDER: WarmingPlan/StageTemplate/Job/Task/AccountAsset/Bundle/
BundleComponent; WarmingJob(queued)+ETA в оплате; переходы queued→…→delivered, on_hold,
fail→reassign/refund; сборка Bundle+Delivery(type=warm); RBAC /admin/warming/*; экран
/orders/:id с warm-статусом) и E7 (инвентарь: ProxyItem/OctoProfile с шифрованием
credentials/exportRef; /admin/inventory/* — CRUD/импорт(JSON+text-plain)/bind/unbind;
привязка ресурса к WarmingJob exactly-once (available→assigned); реальные
BundleComponent PROXY/OCTO_PROFILE с refId в комплекте Vault; GET /admin/warming/jobs/
:id/inventory; сидер прокси/Octo).

ВАЖНО — БАЗА КОДА: актуальный код лежит в ветке claude/advault-e7-proxy-octo-inventory-vsnw75
(E0…E7 ещё не влиты в main). Если в рабочей папке нет папок apps/ и packages/ — выполни:
  git fetch --all
  git checkout claude/advault-e7-proxy-octo-inventory-vsnw75
Feature-ветку для E8 создавай от неё.

ПЕРЕД РАБОТОЙ прочитай для ориентации:
1. CLAUDE.md (корень) — контекст, конвенции, границы (в т.ч. «граница платформы»:
   провижининг прокси/Octo/прогрев — ВРУЧНУЮ оператором; платформа фиксирует связки,
   НЕ автоматизирует).
2. docs/SESSION-LOG.md — что уже сделано и что дальше (в т.ч. долги E7: операторский UI
   инвентаря/Warming-workspace — это E8; expired-прокси по TTL; политика ресурсов на
   reassign).
3. docs/16-development-plan.md — раздел «E8».
4. docs/13-admin-panel-spec.md — ПОЛНАЯ спецификация админки/операторки;
   docs/14-order-lifecycle.md — жизненный цикл; prototype/screens/admin.html — эталон UI;
   docs/backend/{prisma-schema,openapi}.md — контракты (там уже есть warming/inventory).

ЦЕЛЬ ЭТОЙ СЕССИИ — реализовать эпик E8 «Полная админка / операторка» (крупный — можно
делить на под-сессии по модулям, начни с Orders + Warming-workspace):
- Контракты вперёд: зафиксируй в docs/backend/{prisma-schema,openapi}.md недостающие
  админ/операторские эндпоинты по docs/13 (Orders-таблица/деталь, Warming Kanban/
  workspace поверх E6/E7, GET /admin/stock, Catalog CRUD, Promo CRUD, Users); затем код.
- apps/api: RBAC по ролям (admin/support/manager… — при необходимости StaffUser),
  danger-confirm + AuditLog на необратимом; недостающие CRUD/списки.
- apps/web: админ/операторский UI по docs/13 и prototype/screens/admin.html — Warming
  workspace (assign/transition/tasks/account + bind прокси+Octo из E7), инвентарь
  прокси/Octo (список/создание/импорт/bind), таблицы Orders/Stock/Users/Promo; дизайн
  по docs/design/* (SVG-иконки, без эмодзи), i18n EN/RU, состояния loading/empty/error.
- Тесты: unit/smoke ключевых операторских сценариев (ведение warm-заказа из UI,
  импорт/bind инвентаря, RBAC).

КРИТЕРИЙ ПРИЁМКИ: всё управляется из админки; операторка ведёт warm-заказ end-to-end
(включая привязку прокси/Octo из E7) и выдачу; RBAC/аудит на месте; lint/typecheck/
тесты зелёные, CI зелёный. DoD — CLAUDE.md/docs/16 §8.

КОНВЕНЦИИ (из CLAUDE.md): контракты вперёд; вертикальный срез фронт→API→БД→тесты;
деньги — ТОЛЬКО Decimal + транзакции + ledger + идемпотентность; секреты — шифрование
+ доступ по праву + аудит, НЕ логировать; RBAC на операторских маршрутах + danger-confirm
на необратимом; дизайн по docs/design/* и прототипу (SVG-иконки, без эмодзи); i18n через
ключи; ГРАНИЦА ПЛАТФОРМЫ — только бизнес-логистика/учёт связок, без автоматизации.

РАБОТА С GIT: веди на feature-ветке для этого эпика, понятные коммиты, в конце —
commit + push.

ЕСЛИ ВОЗНИКНУТ РАЗВИЛКИ (объём E8/порядок модулей, отдельная сущность StaffUser vs роли
на User, набор danger-действий) — задавай вопросы в режиме asking (AskUserQuestion),
не угадывай.

В КОНЦЕ СЕССИИ: обнови docs/SESSION-LOG.md (запись + статус E8=готово/в работе +
следующий эпик E9), при изменении контрактов обнови docs/backend/, затем commit+push.
Подготовь готовый промт для следующей сессии (E9) в docs/NEXT-SESSION-PROMPT.md.
```

---

## 🧩 УНИВЕРСАЛЬНЫЙ ШАБЛОН (для любой сессии)

> Замени `{N}`, `{НАЗВАНИЕ ЭПИКА}`, `{ЦЕЛЬ}`, `{КЛЮЧЕВЫЕ ЗАДАЧИ}`, `{КРИТЕРИЙ ПРИЁМКИ}`,
> `{РЕЛЕВАНТНЫЕ ДОКИ}`.

```
Продолжаем разработку проекта AdVault.

ПЕРЕД РАБОТОЙ прочитай для ориентации:
1. CLAUDE.md — контекст, конвенции, границы.
2. docs/SESSION-LOG.md — что сделано и что дальше (проверь, что предыдущий эпик закрыт).
3. docs/16-development-plan.md — раздел «E{N}».
4. {РЕЛЕВАНТНЫЕ ДОКИ по фиче: напр. docs/05, docs/07, docs/11–15, docs/design/*, prototype/*}.

ЦЕЛЬ ЭТОЙ СЕССИИ — реализовать эпик E{N} «{НАЗВАНИЕ ЭПИКА}»: {ЦЕЛЬ}.

КЛЮЧЕВЫЕ ЗАДАЧИ:
- {КЛЮЧЕВЫЕ ЗАДАЧИ по эпику из docs/16}

КРИТЕРИЙ ПРИЁМКИ: {КРИТЕРИЙ ПРИЁМКИ из docs/16} + Definition of Done из CLAUDE.md §DoD.

КОНВЕНЦИИ (обязательно, из CLAUDE.md):
- Контракты вперёд (обнови OpenAPI/Prisma в docs/backend перед кодом фичи).
- Вертикальный срез: фронт→API→БД→тесты.
- Дизайн только по docs/design/* и прототипу; SVG-иконки, без эмодзи; i18n EN/RU.
- Деньги: decimal + транзакции + ledger + идемпотентность. Секреты: шифрование + аудит.
  RBAC на админ/операторских маршрутах. danger-confirm на необратимом.
- Граница: НЕ автоматизировать прогрев/обход детекта — только бизнес-логистику.

GIT: feature-ветка feat/E{N}-<slug>; понятные коммиты; в конце commit + push.

ВОПРОСЫ: при любой значимой развилке — спрашивай в режиме asking (AskUserQuestion).

В КОНЦЕ СЕССИИ (ритуал из CLAUDE.md):
1. Обнови docs/SESSION-LOG.md (сделанное, статус E{N}, следующий эпик).
2. Обнови статусы в docs/16 (и docs/10 при завершении эпика).
3. Обнови docs/backend/ при изменении контрактов.
4. commit + push.
5. Обнови docs/NEXT-SESSION-PROMPT.md — подготовь готовый промт под следующий эпик.
```

---

## Порядок эпиков (быстрый reference)

E0 каркас → E1 auth → E2 каталог → E3 кошелёк/пополнение → E4 корзина/заказы/оплата →
E5 выдача из стока → E6 прогрев (модель+очередь) → E7 инвентарь прокси/Octo →
E8 полная админка/операторка → E9 поддержка/уведомления → E10 гарантии/замены/возвраты →
E11 полировка/безопасность/запуск. Детали и оценки — `docs/16-development-plan.md`.

## Советы для качественной «мега-сессии»
- Одна сессия = один эпик (или его чёткая часть). E8 (админка) — дели на под-сессии.
- Всегда начинай с чтения `SESSION-LOG.md` — не начинай «с нуля».
- Держи контракты (OpenAPI/Prisma) синхронными с кодом — это память проекта.
- Не раздувай сессию: доведи срез до приёмки, задокументируй, запушь, подготовь
  следующий промт. Непрерывность важнее объёма за раз.
