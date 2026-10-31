# stats-hunter — Security / Tech Debt (к ликвидации)

> Живой список уязвимостей и техдолга. Фиксируем сейчас, закрываем позже — перед продакшеном.
> Последнее обновление: 2026-10-31.

## Критично (перед продакшеном)

- **Auth: password grant вместо OIDC Authorization Code + PKCE.** Текущий вход идёт через Resource Owner Password Credentials (прямой `POST /token` с паролем из браузера). В плане заявлен OIDC + PKCE — вернуться к нему для prod.
- **JWT хранится в localStorage** (`stats-hunter.access_token`) — уязвимо к XSS. Для prod рассмотреть httpOnly-cookie/сессионную схему.
- **Регистрация через Keycloak Admin API** — бэкенд хранит `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` в env и создаёт юзеров от имени админа. Это высокопривилегированные креды на сервере приложения; заменить на менее привилегированного сервисного пользователя/отдельный flow.
- **Keycloak bootstrap admin = `admin`/`admin`** (дефолт) — сменить на стойкий пароль; хранить в Lockbox.
- **`STATS_HUNTER_ENCRYPTION_KEY` — dev-заглушка.** Нужен реальный мастер-ключ из secret manager (Yandex Lockbox), ротация.
- **CORS на бэке = `true` (allow-all), если `CORS_ORIGIN` не задан** (`main.ts`). В prod обязательно whitelist конкретных origin.
- **Нет rate limiting на API** (в плане заявлен) — добавить.
- **JwtAuthGuard применяется точечно** (`@UseGuards`), а не глобально (`APP_GUARD`). Проверить, что ВСЕ `/api/*`-маршруты (включая marketplace/credentials) закрыты; сейчас вне auth может быть что-то открыто.
- **Порты Postgres/Redis/Keycloak опубликованы наружу (0.0.0.0)** в dev-compose. В prod наружу только 80/443; остальное — внутри Docker-сети + security group ВМ.

## Средне / гигиена

- **`npm audit`: ~58 уязвимостей** (в основном moderate, 2 high) в dev-зависимостях — поднять версии.
- **Keycloak `start-dev`** используется в локальном compose — для prod нужен `start` + `--import-realm`.
- **Ozon API-ключи лежат в `.env` на сервере** (плейнтекст). Шифрование ключей площадок в БД есть (`marketplace_credentials.encryptedPayload`), но первичные Ozon-креды из env — в Lockbox.
- **NG-ZORRO подключён полным CSS (~558 KB)** — вернуться к tree-shaking/theme variables (прошлая попытка ломала вёрстку логина).
- **`provideAnimations()` синхронно** вместо `provideAnimationsAsync()` — меньше бандл, но риск при SSG; пересмотреть.
- **Realm Keycloak не импортируется автоматически в локальном compose** (для prod — добавить `--import-realm` + mount `infra/keycloak/realm-export.json`).

## Известные ограничения (не баги, но помнить)

- Frontend SSG-пререндер + PWA; SSR выключен.
- Бэкенд запускается как `node dist/apps/backend/main.js` (собранный); watch-режим — только локально через `nx serve`.
- Ozon-адаптер: реализован только `getProducts` (list + info); заказы/аналитика/стоки — не реализованы.
- RBAC-роли (`admin`, `user`) заявлены в плане, но end-to-end не реализованы.

## Деплой на ВМ (тест) — что вернуть/исправить для prod

- **Keycloak в тестовом режиме:** `start-dev` + realm `sslRequired=none` + `--hostname=http://158.160.204.124:8080`. Для prod: `start`, `sslRequired=external`, реальный домен + HTTPS.
- **IP захардкожен** в `environment.prod.ts`, `realm-export.json` (webOrigins/redirectUris) и `docker-compose.prod.yml` (`--hostname`). Заменить на домен.
- **Prisma-engines на ВМ** качается только через зеркало `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` (binaries.prisma.sh заблокирован/медленный). Учесть в CI/deploy.
- **На ВМ нужен npm 11.16** (package-lock несовместим с npm 10; `npm ci` падает с EUSAGE).
- **Keycloak и приложение — разные БД** (`keycloak` vs `stats_hunter`), иначе `prisma db push` конфликтует с таблицами Keycloak.
- **Security group ВМ открыта полностью** (default `default-sg-enph4ak7mlo5ttbehehi`, INGRESS/EGRESS ANY 0.0.0.0/0) — для prod закрыть до 80/443 (+22 SSH).
