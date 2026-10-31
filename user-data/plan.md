# stats-hunter — план работы

> Живой документ. Корректируем по мере работы.
> Последнее обновление: 2026-10-31.

## 1. Что строим
Мультипользовательский SaaS (на продажу) для агрегации API маркетплейсов:
статистика, графики, поиск товаров, воронка продаж и весь доступный набор API площадок.

## 2. Стек (подтверждён)
- **Frontend**: Angular + NG-ZORRO (Ant Design), RxJS + Signals, светлая тема.
- **Графики**: ngx-echarts (Apache ECharts) — line / bar / pie / funnel.
- **Backend**: NestJS (TypeScript).
- **БД**: PostgreSQL (Prisma), очередь и кэш — Redis (BullMQ).
- **Auth**: Keycloak (JWT), мультипользовательский SaaS.
- **Monorepo**: Nx.
- **Деплой**: локально + Яндекс Облако (аккаунт создан и оплачен).

## 3. Архитектура

```
┌──────────────┐   HTTPS/WS   ┌───────────────────┐        ┌──────────────────────────┐
│  Angular SPA  │ ───────────► │  NestJS backend    │ ─────► │  API маркетплейсов        │
│  (NG-ZORRO)   │              │  (BFF + адаптеры)  │        │  WB / Ozon / YM / ...     │
└──────────────┘              └─────────┬─────────┘        └──────────────────────────┘
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                   PostgreSQL         Redis         Keycloak
```

Прямые вызовы из браузера к маркетплейсам не подходят (CORS + секреты), поэтому BFF обязателен:
бэкенд хранит ключи зашифрованными, нормализует данные площадок в единую модель и отдаёт фронту единый REST.

## 4. Площадки (порядок интеграции)
1. **Wildberries** — первая (аккаунт продавца есть, API-ключ создадим).
2. Ozon.
3. Яндекс Маркет.
4. СберМегаМаркет.
5. Avito.
6. Далее: AliExpress CIS, Магнит Маркет (KazanExpress), Lamoda и др.

## 5. Фазы
- **Фаза 0 — каркас (завершена).** Nx + Angular + NestJS, NG-ZORRO (светлая тема), layout, страница входа (заглушка). Без Keycloak-форм — макеты из Pixso позже.
- **Фаза 1 — бэкенд-ядро + Wildberries (ТЕКУЩАЯ).** Хранилище ключей (AES-256-GCM), интерфейс `MarketplaceAdapter`, доменные модели, адаптер WB, REST-эндпоинты.
- **Фаза 2 — фронт WB.** Дашборд (KPI), графики, товары/поиск, заказы, управление ключами.
- **Фаза 3 — Ozon + Яндекс Маркет.**
- **Фаза 4 — СберМегаМаркет + Avito + воронка продаж + сводный дашборд.**
- **Фаза 5 — единый поиск, центр отчётов, экспорт CSV/Excel, фоновые синхронизации.**

## 6. Аутентификация (Keycloak)
- Keycloak — identity provider; фронт подключается по OIDC (Authorization Code + PKCE); бэк валидирует JWT.
- Роли: `admin`, `user`. У каждого пользователя свои ключи площадок (шифрование at rest).
- Keycloak запускается через Docker (на хосте Java не установлена).

## 7. Безопасность и управление пользователями (актуальные практики)
- OIDC + PKCE на фронте; JWT (RS256) с проверкой `iss`/`aud`/срока на бэке.
- API-ключи площадок: AES-256-GCM, мастер-ключ из secret manager, никогда не попадают в браузер.
- RBAC, rate limiting, валидация ввода, audit log, CORS whitelist, защита от SSRF при вызовах внешних API.
- Секреты — через env / secret manager (Яндекс Облако Lockbox).

## 8. Журнал решений / открытые вопросы
- [решено] BFF обязателен (CORS + секреты).
- [решено] Auth = Keycloak, мультипользовательский SaaS (JWT).
- [решено] Первая площадка — Wildberries.
- [решено] Nx, ngx-echarts, NestJS, Postgres + Redis.
- [решено] Тема светлая.
- [решено] Фаза 0 = каркас + страница входа (без Keycloak-форм).
- [решено] SSG (Prerendering) на этапе сборки, без runtime SSR.
- [решено] PWA + service worker (ngsw-worker, manifest, иконки).
- [перспектива] Порт в .ark (HarmonyOS) и браузерное расширение — SPA-структура должна оставаться переносимой.
- [открыто] Детализация задач Фаз 1–5 (уточним после каркаса).
- [открыто] Модель тарифов/подписки для SaaS.
- [открыто] Дизайн форм входа/регистрации (Pixso).

## 9. Текущий статус
- **Фаза 0 завершена** (2026-10-31): Nx 24 + Angular 22 + NestJS, NG-ZORRO 22.1.2 (светлая тема), страница входа-заглушка.
- Проверено: `nx build` (frontend + backend), `nx lint`, `nx test`, живой `/api/health` → 200.
- Стек: Angular 22.2.4, NG-ZORRO 22.1.2, @angular/cdk 22.2.5, NestJS (webpack), TypeScript 6.0.3, Nx 24.0.3.
- Java на хосте отсутствует → Keycloak через Docker.
- PWA: service worker (`ngsw-worker.js` + `ngsw.json`), `manifest.webmanifest`, иконки 192/512 — генерируются при production-сборке.
- SSG: предрендеринг маршрутов на сборке (`prerender: true`, статический вывод `browser/`, без runtime SSR). `/login` предрендерен.
- Фаза 1 (бэкенд-ядро, стартовано): доменные модели, интерфейс `MarketplaceAdapter`, `CredentialsService` (AES-256-GCM) + 5 юнит-тестов. Проверено: lint/test/build бэка.
- Инфраструктура: Docker Compose (Postgres + Redis + Keycloak), Postgres/Redis подняты и healthy. Prisma 7: схема (`users`, `marketplace_credentials`), клиент, `PrismaService` (pg-адаптер), `db push` применён, бэкенд перезапущен.
- Хранилище ключей: `MarketplaceCredentialsService` — шифрование AES-256-GCM → `marketplace_credentials.encryptedPayload` (JSON секретов), расшифровка при чтении + 3 теста.
- Ozon-адаптер: `OzonAdapter.getProducts` (list + info) реализован и live-проверен (`/v3/product/list` → 200). Первая площадка фактически — Ozon (ключи предоставлены).
- Следующий шаг: расширить Ozon (заказы/аналитика/стоки) или макеты Pixso (Keycloak).

## 10. Замечания Фазы 0 (к исправлению позже)
- `npm approve-scripts` выполнен, нативные модули пересобраны (esbuild, lmdb, msgpackr-extract, @parcel/watcher, unrs-resolver, nx).
- `npm audit`: ~58 уязвимостей (в основном moderate, 2 high) в dev-зависимостях — разобрать и поднять версии.
- Анимации подключены синхронно (`provideAnimations()`) — надёжнее для SSG; `provideAnimationsAsync()` дал бы меньший бандл, но риск при предрендеринге.
- NG-ZORRO подключён полным CSS (`ng-zorro-antd.min.css`, ~558 KB). Попытка tree-shaking (базовый `style/index.min.css` + стили из импортов) сломала разметку формы входа — откачено; вернуться позже (нужны CSS-переменные темы).
- Git-репозиторий инициализирован: ветка `master`, первый коммит `0c23722` (55 файлов).
- Ozon API-ключ получен от пользователя — хранится в `.env` (в git не коммитим).
