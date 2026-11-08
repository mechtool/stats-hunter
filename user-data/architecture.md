# stats-hunter — Архитектура приложения

> Живой документ. Описывает текущую (реализованную) архитектуру и все фичи,
> а также что запланировано. Обновляется по мере развития.
> Последнее обновление: 2026-11-08 (добавлена BFF-аутентификация).

## 1. Назначение

Мультипользовательский SaaS-агрегатор API маркетплейсов. Каждый пользователь
подключает свои аккаунты площадок (Wildberries, Ozon, Яндекс Маркет, …), приложение
нормализует их API в единую модель и показывает: статистику, графики, поиск товаров,
воронку продаж, заказы, остатки.

Ключевое следствие: **браузер никогда не ходит к API маркетплейсов напрямую**
(CORS + секреты площадок). Все вызовы идут через наш бэкенд — **BFF (Backend for
Frontend)**, который хранит ключи зашифрованными и отдаёт фронту единый REST.

## 2. Стек (подтверждён)

- **Frontend**: Angular 22 + NG-ZORRO (Ant Design), RxJS + Signals, светлая тема.
- **Графики** (запланировано): ngx-echarts (Apache ECharts) — line/bar/pie/funnel.
- **Backend**: NestJS 11 (TypeScript), глобальный префикс `/api`.
- **БД**: PostgreSQL 16 (Prisma 7 + `@prisma/adapter-pg`).
- **Очередь/кэш**: Redis 7 (поднят; BullMQ — запланирован, пока не используется).
- **Auth**: Keycloak 26 (identity provider), BFF-схема с httpOnly-кукой.
- **Monorepo**: Nx 24.

## 3. Общая схема

```
                         ┌──────────────────────────────────────────────┐
                         │                 Браузер (Angular SPA)          │
                         │   /login /register /home ...  (SSG + PWA)      │
                         └───────────────────────┬──────────────────────┘
                                                 │ HTTPS, only /api
                                                 │ httpOnly-cookie (сессия)
                        ┌────────────────────────▼───────────────────────┐
                        │               Edge nginx (80/443, SNI)          │
                        │  stats-hunter.ru → фронт + /api                │
                        │  auth.stats-hunter.ru → Keycloak               │
                        └──────────┬──────────────────────────┬──────────┘
                                   │ /api                     │ auth.*
              ┌────────────────────▼───────────┐   ┌──────────▼──────────┐
              │        NestJS backend (BFF)     │   │   Keycloak 26       │
              │  :3000, systemd                │   │   :8080 (prod)      │
              │  · auth (сессии, BFF-login)     │   │   realm stats-hunter│
              │  · marketplace adapters         │   │   clients:          │
              │  · credentials (AES-256-GCM)    │   │    - frontend       │
              └──────┬──────────────┬───────────┘   │    - bff            │
                     │              │               │    - admin-cli      │
          ┌──────────▼────┐  ┌───────▼──────┐      └──────────────────────┘
          │  PostgreSQL    │  │    Redis     │
          │  :5433         │  │    :6379     │
          │  stats_hunter  │  │  (BullMQ →)  │
          │  + keycloak    │  └──────────────┘
          └────────────────┘
                          │ (backend → внешние API, только сервер-к-серверу)
          ┌───────────────▼──────────────────────────────────────────────┐
          │  API маркетплейсов: WB / Ozon / Яндекс Маркет / СБМ / Avito  │
          └──────────────────────────────────────────────────────────────┘
```

## 4. Структура монорепо

- `apps/backend/` — NestJS API.
- `apps/frontend/` — Angular SPA.
- `prisma/schema.prisma` — схема БД.
- `infra/keycloak/realm-export.json` — экспорт realm Keycloak.
- `infra/nginx/` — конфиги nginx (frontend + edge).
- `infra/postgres/` — init-скрипты (создание БД `keycloak`).
- `docker-compose.yml` / `docker-compose.prod.yml` — локальная и prod-инфраструктура.
- `tools/` — вспомогательные скрипты (`serve.mjs`, `verify-deploy.sh`).
- `user-data/` — планы и документация (этот файл, `plan.md`, `security-debt.md`, …).

## 5. Фронтенд (Angular)

### Рендеринг
- **SSG**: предрендеринг статических маршрутов на этапе сборки (`prerender: true`),
  вывод в `dist/apps/frontend/browser`. Runtime SSR выключен.
- **PWA**: service worker (`ngsw-worker.js` + `ngsw.json`), `manifest.webmanifest`,
  иконки 192/512 генерируются при production-сборке.
- Анимации — `provideAnimationsAsync()`; NG-ZORRO подключён с tree-shaking CSS
  (~154 KB вместо ~560 KB).

### Маршруты (`app.routes.ts`)
| Маршрут | Компонент | Доступ |
|---|---|---|
| `/login` | `LoginComponent` | публичный |
| `/register` | `RegisterComponent` | публичный |
| `/check-email` | `CheckEmailComponent` | публичный |
| `/verify-email` | `VerifyEmailComponent` | публичный (по токену из письма) |
| `/forgot-password` | `ForgotPasswordComponent` | публичный |
| `/reset-password` | `ResetPasswordComponent` | публичный (по токену) |
| `/home` | `HomeComponent` | `authGuard` |
| `/` | redirect → `/home` | — |

### Аутентификация на фронте
- `KeycloakService` (`apps/frontend/src/app/keycloak/keycloak.service.ts`) — единая
  точка работы с auth. НЕ хранит токены: браузер держит только httpOnly-куку сессии,
  а email пользователя — в памяти сервиса.
- `authGuard` (`auth.guard.ts`) — async: при переходе на защищённый маршрут вызывает
  `KeycloakService.loadSession()` (один `GET /api/auth/me` за жизнь приложения) и
  решает пускать или редиректить на `/login`.
- `withCredentialsInterceptor` (`http/with-credentials.interceptor.ts`) — глобально
  добавляет `withCredentials: true`, чтобы кука уходила на `/api` и в кросс-ориджин.

### Сервисы/компоненты
- `NotificationService` — обёртка над `NzNotificationService` (тосты success/error/…).
- `Keycloak*`-компоненты — формы входа, регистрации, подтверждения email, сброса пароля.
- `HomeComponent` — защищённая страница (email пользователя + logout).

## 6. Бэкенд (NestJS)

Модули (`apps/backend/src/app/`):
- `AppModule` — корневой; регистрирует контроллеры, глобальный `JwtAuthGuard`, сервисы.
- `AuthController` — регистрация/подтверждение email/сброс пароля (публичные, rate-limited).
- `SessionController` — BFF-сессия: `login`, `me`, `logout`.
- `SessionService`, `KeycloakTokenService`, `cookie.ts` — инфраструктура сессии (см. §7).
- `JwtAuthGuard` — глобальный guard: кука сессии (основной) или `Authorization: Bearer`.
- `RateLimitGuard` — in-memory fixed-window лимит на публичные `/api/auth/*`.
- `PrismaModule` (`@Global`) + `PrismaService` — доступ к PostgreSQL.
- `CredentialsModule` + `CredentialsService` — AES-256-GCM шифрование (см. §9).
- `MailModule` + `MailService` — SMTP-письма (подтверждение, сброс пароля).
- `MarketplaceCredentialsModule` — хранение ключей площадок.
- `MarketplacesModule` — адаптеры площадок (`MarketplaceAdapter`).

REST-эндпоинты (префикс `/api`):
- `GET /api` — hello; `GET /api/health` — healthcheck; `GET /api/profile` — `req.user`.
- `POST /api/auth/register|resend-verification|verify-email|cancel-registration|forgot-password|reset-password`.
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.

## 7. Аутентификация — BFF + httpOnly-кука (реализовано, «Вариант A»)

Цель: убрать ROPC из браузера и хранение JWT в `localStorage`. Браузер не общается с
Keycloak напрямую и не видит токенов; Keycloak-токены живут только на бэкенде.

### Модель сессии (`prisma/schema.prisma → user_sessions`)
| Поле | Назначение |
|---|---|
| `id` | uuid (внутренний) |
| `tokenHash` | SHA-256 от случайного значения куки (lookup-ключ) |
| `subject` | Keycloak `sub` (стабильный id пользователя) |
| `email` | email |
| `accessTokenEncrypted` | access-токен, AES-256-GCM |
| `refreshTokenEncrypted` | refresh-токен, AES-256-GCM |
| `expiresAt` | абсолютный срок жизни сессии |
| `createdAt` / `lastUsedAt` | аудит |

Кука `stats-hunter.session` содержит **только** случайный 256-битный id (в БД — его
хеш). Атрибуты: `HttpOnly`, `Path=/api`, `SameSite=Lax`, `Secure` (в проде),
`Max-Age` = `SESSION_TTL_MS` (по умолчанию 7 дней). Так как id сессии стабилен,
refresh токенов не требует перезаписи куки.

### Вход (`POST /api/auth/login`)
1. Фронт шлёт `{email, password}` на наш `/api/auth/login`.
2. `SessionController.login` вызывает `KeycloakTokenService.passwordGrant` —
   сервер-к-серверу ROPC через **confidential-клиент** `stats-hunter-bff`
   (`client_secret` в `.env`, в браузер не попадает).
3. `SessionService.create` шифрует токены, пишет строку `user_sessions`, возвращает
   raw-значение куки.
4. Бэкенд ставит `Set-Cookie`, возвращает `{ok: true, email}` (без токенов).

### Проверка сессии + прозрачный refresh (`JwtAuthGuard`)
1. Guard читает `stats-hunter.session`, по `tokenHash` находит сессию.
2. Дешифрует access-токен; если истёк (или близок к истечению, запас 30 с) — через
   refresh-токен обновляет пару (`refreshGrant`), перезаписывает токены в БД.
3. Валидирует JWT (RS256) по JWKS Keycloak (`iss` проверяется), кладёт
   `request.user = payload` и `request.session = {raw, email, subject}`.
4. Если сессии нет — fallback на `Authorization: Bearer` (для CLI/тестов).

### Выход (`POST /api/auth/logout`)
Публичный/idempotentный: удаляет сессию из БД и сбрасывает куку (`Max-Age=0`), даже
если сессия уже протухла.

### Регистрация и подтверждение email
1. `POST /api/auth/register` → создаёт **неактивного** пользователя Keycloak
   (`enabled: false`, `emailVerified: false`) через Admin API от имени сервисного
   пользователя `svc-user-admin`; пароль временно хранится зашифрованным в
   `email_verification_tokens` (AES-256-GCM), отправляется письмо со ссылкой.
2. Переход по ссылке → `POST /api/auth/verify-email` (с токеном): активирует
   пользователя, затем выполняет серверный ROPC и **создаёт сессию** (ставит ту же
   httpOnly-куку) — пользователь сразу залогинен.

### Сброс пароля
`POST /api/auth/forgot-password` создаёт одноразовый `password_reset_tokens`
(хранится хеш токена, TTL), шлёт письмо; `POST /api/auth/reset-password` проверяет
токен и через Keycloak Admin API меняет пароль.

### Сервисный пользователь Keycloak
Регистрация/сброс используют `svc-user-admin` (realm `stats-hunter`, роли
`manage-users`/`view-users`) вместо master-админа. Получение его токена — ROPC на
`admin-cli` (внутренний серверный вызов). Запланировано: перевести на
`client_credentials` + `serviceAccountsEnabled`.

## 8. База данных (Prisma)

Модели:
- `User` (`users`) — локальный пользователь: `id`, `keycloakSub`, `email`, связь с
  ключами площадок.
- `MarketplaceCredential` (`marketplace_credentials`) — зашифрованные креды площадки:
  `userId`, `marketplace`, `name`, `encryptedPayload` (AES-256-GCM JSON секретов),
  unique `(userId, marketplace)`.
- `PasswordResetToken` (`password_reset_tokens`) — одноразовый токен сброса.
- `EmailVerificationToken` (`email_verification_tokens`) — pending-регистрация:
  `tokenHash`, `passwordEncrypted`, `expiresAt`, `usedAt`.
- `UserSession` (`user_sessions`) — серверная сессия BFF-аутентификации (§7).

## 9. Маркетплейсы (адаптеры)

Абстракция единообразия площадок:
- `MarketplaceType` (enum): `wildberries`, `ozon`, `yandex-market`, `sber-megamarket`, `avito`.
- `MarketplaceAdapter` (интерфейс) — единый контракт: `getProducts`, `getOrders`,
  `getSales`, `getStocks`, `getAnalytics`, `requestReport`, `getReport`,
  `searchProducts`, `getSalesFunnel` + `info`/`capabilities`.
- `domain-models.ts` — единые модели: `Product`, `Order`, `Sale`, `Stock`,
  `AnalyticsPoint`, `Report`, `SalesFunnelStage`.
- **Реализовано**: `OzonAdapter.getProducts` (list + info) — live-проверен.
  Остальные методы/площадки — в плане (Wildberries следующей).

Хранилище ключей: `MarketplaceCredentialsService` — шифрует JSON секретов
`CredentialsService` (AES-256-GCM) в `marketplace_credentials.encryptedPayload`,
расшифровывает при чтении. Ключи никогда не покидают бэкенд.

## 10. Keycloak

Realm `stats-hunter`. Клиенты:
- `stats-hunter-frontend` — публичный, `standardFlow` on, `directAccessGrants` **off**
  (браузер больше не делает ROPC).
- `stats-hunter-bff` — **confidential** (`client-secret`), `directAccessGrants` on,
  `serviceAccounts` off — для серверного входа бэкенда.
- `admin-cli` — для внутреннего ROPC сервисного пользователя.

Роли `admin`/`user` заявлены; RBAC end-to-end ещё не реализован.

## 11. Инфраструктура и деплой

- **Docker compose**: `postgres:16`, `redis:7`, `keycloak:26`, `frontend` (nginx:alpine).
  Бэкенд — **host-процесс** под systemd (не в Docker).
- **systemd**: `stats-hunter-backend.service` (`Restart=always`), `node dist/apps/backend/main.js`.
- **Edge nginx** (`it-client`, 80/443, SNI): `stats-hunter.ru` → фронт + `/api` →
  `host.docker.internal:8081`/`:3000`; `auth.stats-hunter.ru` → Keycloak `:8080`.
- **TLS**: Let's Encrypt (certbot webroot через volume).
- **Порты (локально)**: postgres `5433`, redis `6379`, keycloak `8080`, frontend-nginx `8081`,
  backend `3000`, фронт-dev `4200`.

## 12. Безопасность

- Токены в браузере — только httpOnly-кука; XSS не читает её напрямую.
- `SameSite=Lax` + `Secure` (prod) на куке.
- Keycloak-токены на бэке шифруются AES-256-GCM (мастер-ключ `STATS_HUNTER_ENCRYPTION_KEY`).
- JWT валидируется по JWKS (RS256) с проверкой `iss`.
- Rate limiting на публичных `/api/auth/*`; CORS allow-list (`credentials: true`).
- Пароли хеширует Keycloak; одноразовые токены хранятся хешированными (SHA-256).
- Секреты в `.env` (gitignored); полноценный secret manager (Yandex Lockbox) — запланирован.

## 13. Реализовано vs запланировано

**Реализовано (2026-11-08):**
- Каркас (Nx + Angular + NestJS + NG-ZORRO), SSG + PWA.
- BFF-аутентификация: серверная сессия в БД + httpOnly-кука, login/me/logout,
  прозрачный refresh, verify-email через сессию.
- Хранилище ключей площадок (AES-256-GCM) + интерфейс `MarketplaceAdapter`.
- Ozon-адаптер (`getProducts`).
- Регистрация/сброс пароля через сервисного пользователя, SMTP-письма, rate limiting, CORS.

**Запланировано (техдолг, см. `security-debt.md`):**
- Full OIDC: Authorization Code + PKCE / MFA / соц-вход (Вариант B) — если потребуются.
- Yandex Lockbox для `STATS_HUNTER_ENCRYPTION_KEY` и ключей.
- BullMQ-очереди (Redis уже поднят).
- Адаптеры Wildberries и далее; графики ngx-echarts; дашборды/отчёты.
- RBAC-роли end-to-end.
- `npm audit`: 55 moderate (minimatch) — апгрейд Nx/ESLint.
- Перевод `svc-user-admin` на `client_credentials`.
