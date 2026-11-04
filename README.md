# App Template

Переиспользуемый full-stack стартер: **Angular + NestJS + Keycloak + Prisma + PWA** в Nx-монорепо. Взять шаблон, переименовать под своё приложение и разрабатывать дальше.

## Стек

- **Frontend** — Angular 22, NG-ZORRO (Ant Design), RxJS + Signals, PWA (service worker), SSG-пререндеринг.
- **Backend** — NestJS 11, Prisma 7 (PostgreSQL).
- **Auth** — Keycloak 26 (JWT RS256): собственные формы логина/регистрации/подтверждения email/сброса пароля, глобальный JWT-guard, rate limiting, SMTP-письма.
- **Infra** — Docker Compose (Postgres + Redis + Keycloak), импорт realm, nginx-конфиги.

## Структура

```
apps/
  frontend/        Angular SPA + PWA
  backend/         NestJS API (/api)
infra/
  keycloak/        realm-export.json (импорт realm)
  nginx/           inner/edge nginx-конфиги
  postgres/        init-keycloak-db.sql
prisma/            schema.prisma
tools/
  rename.mjs       переименование шаблона под новое приложение
  serve.mjs        статический сервер
```

## Быстрый старт (локально)

```sh
npm install
cp .env.example .env          # подставить реальные значения
docker compose up -d          # postgres + redis + keycloak
npx prisma db push            # применить схему
nx serve backend              # http://localhost:3000/api
nx serve frontend             # http://localhost:4200
```

Keycloak поднимается на `http://localhost:8080` (realm `app-template`), фронт логинится через него; бэкенд валидирует JWT по JWKS.

## Аутентификация

- Вход — Resource Owner Password Grant (`POST /token`).
- Регистрация идёт через бэкенд (`/api/auth/register`), который через Keycloak Admin API создаёт пользователя в статусе «не подтверждён», шлёт письмо подтверждения, после подтверждения выдаёт токен.
- Сброс пароля: `/api/auth/forgot-password` → письмо со ссылкой → `/api/auth/reset-password`.
- Глобальный `JwtAuthGuard` защищает все эндпоинты, кроме помеченных `@Public()`.

Параметры — в `.env`: `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`, `APP_ENCRYPTION_KEY`, `SMTP_*`, `FRONTEND_URL` и др. (см. `.env.example`).

## Как сделать новое приложение

Скопируйте шаблон и переименуйте:

```sh
# имя + slug + Angular-префикс (dry-run показывает, что изменится)
node tools/rename.mjs "My App" --slug my-app --prefix my --apply
```

Скрипт заменяет по всему репозиторию: отображаемое имя, slug, `@scope`, realm/client id Keycloak, селекторы Angular, ключи localStorage, имя БД, имена docker-compose. После — обновите домены:

- `apps/frontend/src/environments/environment.prod.ts` (URL Keycloak);
- `infra/keycloak/realm-export.json` (redirectUris/webOrigins);
- `infra/nginx/app-template.edge.conf.example` → свой edge-конфиг;
- `.env` из `.env.example`.

## PWA / Service Worker

Service worker включается в production-сборке (`apps/frontend/ngsw-config.json`), регистрируется в `apps/frontend/src/main.ts`. Манифест и иконки — в `apps/frontend/public/`. SSG-пререндеринг генерирует статический вывод `browser/`, отдаётся nginx-ом (конфиг с проксированием `/api` и правильным кэшированием SW).

## Известный техдолг

- Вход использует ROPC, а JWT хранится в `localStorage` — для production рассмотрите Authorization Code + PKCE и httpOnly-cookie.
- Регистрация использует высокопривилегированные `KEYCLOAK_ADMIN`-креды — замените на отдельного сервисного пользователя.
- Redis объявлен в compose, но бэкенд его пока не использует (задел под BullMQ).
