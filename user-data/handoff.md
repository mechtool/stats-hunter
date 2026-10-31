# stats-hunter — Handoff (state snapshot)

> Назначение: быстро восстановить контекст в новой сессии. Читай вместе с `user-data/plan.md` и git-историей. Живое состояние файлов/git — авторитетно.

## Где мы (кратко)
Фаза 0 (каркас) завершена. Идёт работа над auth (вход/регистрация через Keycloak) и ранним бэкенд-слоем (credentials, marketplaces/Ozon, Prisma).

Стек: Nx monorepo → Angular + NG-ZORRO (светлая тема, полный CSS после revert tree-shaking), NestJS, Prisma + Postgres, Redis, Keycloak 26 (OIDC/JWT). PWA + SSG-прирендеринг (SSR выключен). Деплой: локально + Яндекс Облако.

## Auth (текущее)
- Realm Keycloak: `stats-hunter`; клиент `stats-hunter-frontend` (public, `directAccessGrantsEnabled`, `standardFlowEnabled`); redirectURIs `http://localhost:4200/*`.
- Кастомные формы **без редиректа** на hosted-страницы Keycloak:
  - Вход = password grant (`keycloak.service.ts`, токен в `localStorage`).
  - Регистрация = наш бэк `POST /api/auth/register` → Keycloak Admin API создаёт пользователя (`username=email`).
- Тестовый юзер: **`test@example.com` / `Test1234`** (вход проверен — токен выдаётся).
- Починен «Account is not fully set up»: в Keycloak User Profile поле `lastName` сделано необязательным (форма собирает только «Имя» → firstName). Без этого любой новый юзер не мог войти.
- Realm экспортирован в `infra/keycloak/realm-export.json` (включает клиент + необязательный lastName).

## Инфраструктура (docker-compose.yml)
- postgres:16-alpine → `localhost:5433` (хост-порт, из-за wslrelay), user/db `stats_hunter` / пароль `stats_hunter_dev`.
- redis:7-alpine → `localhost:6379`.
- keycloak:26.0 → `localhost:8080`, bootstrap-admin `admin`/`admin` (realm master).
- `docker compose up -d` поднимает всё.

## Бэкенд (apps/backend, NestJS, :3000)
- Модули: `auth` (register + `jwt-auth.guard` RS256/JWKS), `credentials` (AES-256-GCM), `marketplace-credentials`, `marketplaces` (интерфейс адаптера + Ozon-адаптер, live-verified), `prisma`.
- Prisma: `users` (keycloakSub unique), `marketplace_credentials` (userId+marketplace unique, encryptedPayload).
- `.env` (gitignored): `DATABASE_URL`, `OZON_CLIENT_ID`/`OZON_API_KEY` (даны пользователем — НЕ коммитить), `STATS_HUNTER_ENCRYPTION_KEY` (dev-заглушка).
- Запуск после сборки: `node dist/apps/backend/main.js`.

## Фронтенд (apps/frontend, Angular, NG-ZORRO)
- PWA: `public/manifest.webmanifest`, `ngsw-config.json`. SSG-прирендеринг (no SSR).
- Компоненты входа/регистрации: `apps/frontend/src/components/keycloak/`.
- Сервис: `apps/frontend/src/app/keycloak/keycloak.service.ts` (password grant + register через бэк).
- Статик-сервер для пререндера: `node tools/serve.mjs` → `:4200`.

## Проверено
- `npx nx run-many -t lint test build` → 6/6 зелёные (после последних изменений).
- `/api/health` → 200; `/api/profile` без токена → 401.
- Вход `test@example.com`/`Test1234` → токен OK.
- Ozon `/v3/product/list` (visibility=ALL) → 200 (ранее live-verified).

## Дальнейшие шаги (кандидаты)
1. Авто-импорт realm в `docker-compose` (`--import-realm` + mount `infra/keycloak/realm-export.json`). — был в работе.
2. Frontend AuthGuard для защищённых маршрутов, редирект после входа, logout, показ профиля.
3. Вынести Keycloak-конфиг (`KC_URL`, `CLIENT_ID`, issuer) из хардкода в env (нужно до деплоя).
4. WB API-ключ (ещё не создан).
5. Деплой в Яндекс Облако.
6. Модель тарифов/подписки SaaS (не обсуждалась).

## Команды
- Инфра: `docker compose up -d`; статус `docker compose ps`.
- Проверка: `npx nx run-many -t lint test build`.
- Бэк после сборки: `node dist/apps/backend/main.js`.
- Фронт (статика/пререндер): `node tools/serve.mjs`.
