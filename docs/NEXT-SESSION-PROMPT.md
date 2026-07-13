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
     git checkout claude/advault-e5-stock-delivery-61ndk3   # актуальная база с кодом E0…E5
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

ЦЕЛЬ СЕССИИ — довести до готовности текущий эпик (сейчас это E6 «Прогрев: модель и очередь MADE_TO_ORDER»):
  - Контракты вперёд: зафиксируй в docs/backend/{prisma-schema,openapi}.md модели
    прогрева (WarmingPlan, WarmingStageTemplate, WarmingJob, WarmingTask,
    AccountAsset, Bundle/BundleComponent — см. docs/15) и эндпоинты очереди/этапов;
    затем миграция и код;
  - apps/api: при оплате warm-позиции (fulfillmentType=MADE_TO_ORDER) — создание
    WarmingJob(queued), расчёт ETA из плана; переходы этапов
    queued→assigned→in_progress→qc→ready→delivered (+on_hold с пересчётом ETA);
    маппинг стадии Job → OrderItem.deliveryStatus (docs/14); при delivered — сборка
    Bundle и Delivery в Vault (переиспользуй E5-выдачу/шифрование);
  - apps/web (покупатель): статус warm-заказа с ETA и прогрессом по этапам;
    уведомления; Vault получает комплект по готовности;
  - тесты: unit переходов статусов + расчёта ETA, smoke: оплата warm → Job queued →
    (админ-действия) прогон этапов → delivered → комплект в Vault.
  Критерий приёмки: warm-заказ проходит весь цикл (через админ-действия) до выдачи
  в Vault; lint/typecheck/тесты/CI зелёные.

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
  1. Обнови docs/SESSION-LOG.md: что сделано, статус эпика (E5=готово), следующий эпик (E6).
  2. Обнови статусы в docs/16 и контракты в docs/backend при изменениях.
  3. commit + push.
  4. Подготовь готовый промт следующего эпика в docs/NEXT-SESSION-PROMPT.md.
```

Для следующих эпиков просто замени в блоке «ЦЕЛЬ СЕССИИ» задачи и критерий на нужный
эпик из `docs/16` (мастер-промт сам подхватит текущий эпик из SESSION-LOG).

---

## ✅ ГОТОВЫЙ ПРОМТ — Сессия E6 (Прогрев: модель и очередь MADE_TO_ORDER)

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
идемпотентностью и ledger-дебетом, GET /orders|/orders/:id, экран /checkout) и
E5 (выдача из стока READY_STOCK: StockItem/Delivery/AuditLog, шифрование payload
AES-256-GCM с версионируемым ключом env PAYLOAD_ENCRYPTION_KEY, двухфазный резерв
available→reserved(+reservedUntil+Redis TTL, sweep)→sold + Delivery(type=auto) +
deliveryStatus=delivered в транзакции checkout, статус заказа — агрегат по позициям
(delivered/partially_delivered/paid), GET /orders/:id/items/:itemId/delivery —
расшифровка только владельцу + AuditLog, импорт стока POST /admin/products/:id/
variants/:variantId/stock/import (RBAC admin, JSON/text-plain, дедуп по payloadHash),
Vault-блок в /orders/:id (показать/копировать/скачать .txt); MADE_TO_ORDER-позиции
пока остаются deliveryStatus=pending — их закрывает ЭТА сессия).

ВАЖНО — БАЗА КОДА: актуальный код лежит в ветке claude/advault-e5-stock-delivery-61ndk3
(E0…E5 ещё не влиты в main). Если в рабочей папке нет папок apps/ и packages/ — выполни:
  git fetch --all
  git checkout claude/advault-e5-stock-delivery-61ndk3
Feature-ветку для E6 создавай от неё.

ПЕРЕД РАБОТОЙ прочитай для ориентации:
1. CLAUDE.md (корень) — контекст, конвенции, границы (в т.ч. «граница платформы»:
   НЕ автоматизируем прогрев/действия в аккаунтах — только бизнес-логистику).
2. docs/SESSION-LOG.md — что уже сделано и что дальше (в т.ч. долги E5).
3. docs/16-development-plan.md — раздел «E6» (и общий план/вехи).
4. docs/11-product-types-fulfillment.md — модель выдачи; docs/12-warming-pipeline.md —
   пайплайн прогрева (этапы, ETA, QC); docs/14-order-lifecycle.md — статусы
   MADE_TO_ORDER-позиции и Job (queued→assigned→in_progress→qc→ready→delivered,
   on_hold/failed); docs/15-data-model-extensions.md — WarmingPlan/WarmingStageTemplate/
   WarmingJob/WarmingTask/AccountAsset/Bundle/BundleComponent; docs/13-admin-panel-spec.md —
   операторка (Warming Kanban, назначение); docs/backend/{prisma-schema,openapi}.md —
   контракты (проверь черновики warm-моделей и допиши).

ЦЕЛЬ ЭТОЙ СЕССИИ — реализовать эпик E6 «Прогрев: модель и очередь (MADE_TO_ORDER)»:
- Контракты вперёд: зафиксируй warm-модели (WarmingPlan, WarmingStageTemplate,
  WarmingJob, WarmingTask, AccountAsset, Bundle/BundleComponent) и эндпоинты очереди/
  переходов этапов в docs/backend/{prisma-schema,openapi}.md; затем миграция + код.
  Свяжи ProductVariant.warmingPlanId (появится здесь) с планом.
- apps/api: при checkout warm-позиции — создание WarmingJob(queued) в той же
  транзакции оплаты, расчёт ETA из суммы длительностей этапов плана; переходы
  статусов Job (queued→assigned→in_progress→qc→ready→delivered, +on_hold с
  пересчётом ETA, failed→reassigned/refunded) с маппингом на OrderItem.deliveryStatus
  (docs/14); при delivered — сборка Bundle и создание Delivery в Vault (переиспользуй
  E5: PayloadCryptoService + AuditLog); RBAC-операторские маршруты (admin/support) для
  назначения и переходов. НЕ реализуй автоматизацию действий внутри аккаунтов — только
  учёт статусов и связок (граница платформы, docs/09).
- apps/web (покупатель): в /orders/:id для warm-позиций — статус с ETA и прогрессом
  по этапам («этап k из N»), обновление статусов; при delivered — комплект в Vault.
  i18n EN/RU, loading/empty/error. (Операторский UI Kanban — можно наметить, полная
  админка в E8.)
- Сидер: WarmingPlan'ы под goal=google_ads (warm_7d/14d) и chrome_extension_dev
  (warm_5d) с этапами; свяжи существующие MADE_TO_ORDER-варианты.
- Тесты: unit переходов статусов и расчёта ETA (+ пересчёт при on_hold), маппинга
  Job↔deliveryStatus, сборки Bundle; smoke: оплата warm → Job queued с ETA →
  (операторские действия) прогон этапов → delivered → Delivery/комплект в Vault
  владельцу. Фейки apps/api/src/testing/fakes.ts расширь под warm-модели.

КРИТЕРИЙ ПРИЁМКИ: warm-заказ проходит весь цикл (через админ/операторские действия)
до выдачи комплекта в Vault; ETA считается и пересчитывается; статусы позиции/заказа
корректны (docs/14); lint/typecheck/тесты зелёные, CI зелёный. DoD — CLAUDE.md/docs/16 §8.

КОНВЕНЦИИ (из CLAUDE.md): контракты вперёд; вертикальный срез фронт→API→БД→тесты;
деньги — ТОЛЬКО Decimal + транзакции + ledger + идемпотентность; секреты — шифрование
+ доступ по праву + аудит, НЕ логировать; RBAC на операторских маршрутах; дизайн по
docs/design/* и прототипу (SVG-иконки, без эмодзи); i18n через ключи; ГРАНИЦА
ПЛАТФОРМЫ — только бизнес-логистика, без автоматизации прогрева/обхода детекта.

РАБОТА С GIT: веди на feature-ветке для этого эпика, понятные коммиты, в конце —
commit + push.

ЕСЛИ ВОЗНИКНУТ РАЗВИЛКИ (версионирование планов, политика refund при failed, гранулярность
этапов/задач, что показывать покупателю) — задавай вопросы в режиме asking
(AskUserQuestion), не угадывай.

В КОНЦЕ СЕССИИ: обнови docs/SESSION-LOG.md (запись + статус E6=готово + следующий эпик
E7), при изменении контрактов обнови docs/backend/, затем commit+push. Подготовь готовый
промт для следующей сессии (E7) в docs/NEXT-SESSION-PROMPT.md.
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
