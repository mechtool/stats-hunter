# stats-hunter — Security / Tech Debt (к ликвидации)

> Живой список уязвимостей и техдолга. Фиксируем сейчас, закрываем позже — перед продакшеном.
> Последнее обновление: 2026-11-01.

## Недавно закрыто (2026-11-01)
- Keycloak brute-force protection включён (`realm-export.json` + локальная realm).
- SMTP-отправка писем сброса пароля (Яндекс `smtp.yandex.ru:465`, `SMTP_*` в `.env`).
- CORS whitelist, глобальный `JwtAuthGuard`, rate limiting на `/api/auth/*`.
- **Prod-деплой (2026-11-01):** TLS (Let's Encrypt) для `stats-hunter.ru` + `auth.stats-hunter.ru`, Keycloak в prod-режиме (`--proxy-headers=xforwarded --http-enabled=true`, realm `sslRequired=external`), доменные URL во фронте/бэке, edge nginx SNI (it-client, отдельный conf + override).

## Критично (перед продакшеном)

- **Auth: password grant вместо OIDC Authorization Code + PKCE.** Текущий вход идёт через Resource Owner Password Credentials (прямой `POST /token` с паролем из браузера). В плане заявлен OIDC + PKCE — вернуться к нему для prod.
- **JWT хранится в localStorage** (`stats-hunter.access_token`) — уязвимо к XSS. Для prod рассмотреть httpOnly-cookie/сессионную схему.
- **Регистрация через Keycloak Admin API** — бэкенд хранит `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` в env и создаёт юзеров от имени админа. Это высокопривилегированные креды на сервере приложения; заменить на менее привилегированного сервисного пользователя/отдельный flow.
- **Keycloak bootstrap admin = `admin`/`admin`** (дефолт) — сменить на стойкий пароль; хранить в Lockbox.
- **`STATS_HUNTER_ENCRYPTION_KEY` — dev-заглушка.** Нужен реальный мастер-ключ из secret manager (Yandex Lockbox), ротация.
- **CORS на бэке = `true` (allow-all), если `CORS_ORIGIN` не задан** (`main.ts`). — ✅ сделано (2026-11-01): явный whitelist, пустой `CORS_ORIGIN` = запретить cross-origin.
- **Нет rate limiting на API** — ✅ базово сделано (2026-11-01): in-memory limiter на `/api/auth/*` (`RateLimitGuard`, `RATE_LIMIT_*`). Для мульти-инстанса перенести на Redis.
- **JwtAuthGuard применяется точечно** (`@UseGuards`), а не глобально (`APP_GUARD`). — ✅ сделано (2026-11-01): глобальный `APP_GUARD` + `@Public()` на `/api`, `/api/health`, `/api/auth/*`.
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

## Прод-долг (после продакшена, 2026-11-01)

- **`www.stats-hunter.ru` не в сертификате** — добавить `certbot certonly --cert-name stats-hunter.ru -d stats-hunter.ru -d www.stats-hunter.ru` (после очистки AAAA-кэша LE).
- **Keycloak admin `admin/admin`** — сменить пароль (в `master` realm).
- **Бэкенд = `nohup node` без автоперезапуска** — перевести на systemd/pm2.
- **Security group ВМ открыта (0.0.0.0/0)** — закрыть до 80/443 (+22 SSH).
- **industrial-telemetry: могли потеряться `DADATA_API_KEY` / `WEBHOOK_SECRET`** (были в deploy shell-env, а не в `.env`) — при необходимости восстановить из `~/.bash_history`. `SMTP_URI` теперь закреплён в `~/industrial-telemetry/.env`.
- **Закоммитить прод-конфиги:** `docker-compose.prod.yml` (команда Keycloak), `infra/nginx/stats-hunter.edge.conf`, `infra/nginx/docker-compose.stats-hunter.override.yml`.
