# stats-hunter — Security / Tech Debt (к ликвидации)

> Живой список уязвимостей и техдолга. Фиксируем сейчас, закрываем позже — перед продакшеном.
> Последнее обновление: 2026-11-08.

## Недавно закрыто (2026-11-08)
- **BFF + httpOnly-кука (Вариант A)** — вход больше не ROPC-из-браузера и не localStorage. Пароль уходит на наш бэкенд, бэкенд делает серверный ROPC через confidential-клиент `stats-hunter-bff`; Keycloak-токены хранятся в БД (`user_sessions`) зашифрованными (AES-256-GCM), браузер получает только httpOnly-куку `stats-hunter.session`. Реализованы `login`/`me`/`logout`, прозрачный refresh в `JwtAuthGuard`, `verify-email` через сессию. Проверено локально E2E (login → Set-Cookie → /me 200 → logout → 401).

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

### ✅ Закрыто: PKCE + httpOnly-cookie (реализован «Вариант A» из `plan-auth-bff.md`)
Было: вход = ROPC (прямой `POST /token` с паролем из браузера) + JWT в `localStorage` (`stats-hunter.access_token`).

Стало (Вариант A, кастомная форма входа сохранена):
- Браузер → `POST /api/auth/login` (наш бэкенд).
- Бэкенд → Keycloak `grant_type=password` сервер-к-серверу через **confidential**-клиент `stats-hunter-bff` (`client_secret` в `.env`).
- Токены шифруются и хранятся в `user_sessions`; браузер получает httpOnly-куку сессии.
- Guard читает куку, прозрачно рефрешит access; `logout` чистит сессию/куку.

Осталось опционально — **полный OIDC / PKCE (Вариант B)**: Authorization Code + PKCE через Keycloak (редирект на страницу Keycloak или кастомную тему), MFA, соц-вход. Требует решения по UX (своя форма vs тема Keycloak). Делать только если нужны MFA/соц-вход.

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

- ~~PKCE + httpOnly-cookie~~ ✅ закрыто (Вариант A — BFF + httpOnly-кука, 2026-11-08).
- **Lockbox** для `STATS_HUNTER_ENCRYPTION_KEY` и Ozon-ключей.
- Перевод `svc-user-admin` (Admin API) на `client_credentials` + `serviceAccountsEnabled`.
- industrial-telemetry: возможно потеряны `DADATA_API_KEY`/`WEBHOOK_SECRET` (при необходимости восстановить из `~/.bash_history`).
- ~~www.stats-hunter.ru в сертификате~~ ✅ сделано.
- ~~Keycloak admin admin/admin~~ ✅ сменён.
- ~~Бэкенд nohup~~ ✅ systemd.
