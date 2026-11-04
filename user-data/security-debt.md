# stats-hunter — Security / Tech Debt (к ликвидации)

> Живой список уязвимостей и техдолга. Фиксируем сейчас, закрываем позже — перед продакшеном.
> Последнее обновление: 2026-11-04.

## Недавно закрыто (2026-11-04)
- **systemd для бэкенда**: `/etc/systemd/system/stats-hunter-backend.service` (active+enabled, `Restart=always`), `nohup` убран.
- **Keycloak admin-пароль** сменён (`admin/admin` → стойкий, хранится в `.env` на ВМ + локально).
- **Сервисный пользователь** `svc-user-admin` (realm `stats-hunter`, роли `manage-users`+`view-users`) — регистрация/сброс пароля через него вместо полного админа (`auth.controller.ts`).
- **`www.stats-hunter.ru`** добавлен в cert (`certbot --expand`) + edge-nginx 301 на apex.
- **NG-ZORRO tree-shaking**: полный CSS (560 KB) → базовый стиль + стили компонентов (~154 KB), вёрстка проверена.
- **`provideAnimationsAsync()`** вместо синхронного `provideAnimations()`.
- **npm audit частично**: Nx-версии закреплены (`@nx/*` = 24.0.3), `overrides multer=2.5.0` (закрыты 2 high). Осталось 55 moderate (minimatch).

## Недавно закрыто (2026-11-01)
- Keycloak brute-force protection (`realm-export.json`).
- SMTP-письма сброса пароля.
- CORS whitelist, глобальный `JwtAuthGuard`, rate limiting на `/api/auth/*`.
- Prod-деплой: TLS (Let's Encrypt) для `stats-hunter.ru` + `auth.stats-hunter.ru`, Keycloak prod-режим, edge nginx SNI.
- Security group закрыта (ingress 22/80/443/1883).
- Прод-конфиги закоммичены (`84381ef`).

## Критично (осталось)

- **Auth: password grant вместо OIDC Authorization Code + PKCE.** Текущий вход идёт через ROPC (прямой `POST /token` с паролем из браузера). Вернуться к OIDC + PKCE для prod.
- **JWT хранится в localStorage** (`stats-hunter.access_token`) — уязвимо к XSS. Перейти на httpOnly-cookie/сессионную схему.
- **`STATS_HUNTER_ENCRYPTION_KEY` — dev-заглушка.** Нужен реальный мастер-ключ из secret manager (Yandex Lockbox), ротация.
- **Ozon API-ключи лежат в `.env`** (плейнтекст) — первичные креды площадок перевести в Lockbox.
- ~~Регистрация через Keycloak Admin API~~ ✅ заменено на сервисного пользователя (`svc-user-admin`).
- ~~Keycloak bootstrap admin = admin/admin~~ ✅ пароль сменён.
- ~~CORS allow-all~~ ✅, ~~rate limiting~~ ✅, ~~JwtAuthGuard точечно~~ ✅.
- Порты Postgres/Redis/Keycloak в dev-compose открыты наружу (0.0.0.0) — в prod наружу только 80/443.

## Средне / гигиена

- **`npm audit`: 55 moderate** (транзитивный `minimatch` через nx/@typescript-eslint) — требует апгрейда Nx/ESLint (breaking).
- **Keycloak `start-dev`** в локальном compose — для prod нужен `start` + `--import-realm` (в prod уже так).
- ~~NG-ZORRO полный CSS~~ ✅ tree-shaking сделан.
- ~~provideAnimations синхронно~~ ✅ переведён на async.
- **Realm Keycloak не импортируется автоматически в локальном compose** — для локального dev добавить `--import-realm`.

## Известные ограничения (не баги, но помнить)

- Frontend SSG-пререндер + PWA; SSR выключен.
- Бэкенд = systemd-сервис `node dist/apps/backend/main.js` (собранный).
- Ozon-адаптер: реализован только `getProducts`; заказы/аналитика/стоки — не реализованы.
- RBAC-роли (`admin`, `user`) заявлены, но end-to-end не реализованы.

## Прод-долг (актуально)

- **PKCE + httpOnly-cookie** — главный оставшийся критичный пункт (см. «Критично»).
- **Lockbox** для `STATS_HUNTER_ENCRYPTION_KEY` и Ozon-ключей.
- industrial-telemetry: возможно потеряны `DADATA_API_KEY`/`WEBHOOK_SECRET` (при необходимости восстановить из `~/.bash_history`).
- ~~www.stats-hunter.ru в сертификате~~ ✅ сделано.
- ~~Keycloak admin admin/admin~~ ✅ сменён.
- ~~Бэкенд nohup~~ ✅ systemd.
