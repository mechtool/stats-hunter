# stats-hunter — Handoff (state snapshot)

> Назначение: быстро восстановить контекст в новой сессии. Читай вместе с `user-data/plan.md` и `user-data/security-debt.md`. Живое состояние файлов/git — авторитетно.
> Последнее обновление: 2026-10-31.

## Где мы (кратко)
Фаза 0 (каркас) завершена. Auth (Keycloak) + ранний бэкенд-слой (credentials, marketplaces/Ozon, Prisma) реализованы. **Проект развёрнут на ВМ Яндекс Облака и проверен end-to-end.**

Стек: Nx monorepo → Angular + NG-ZORRO (светлая тема), NestJS, Prisma + Postgres, Redis, Keycloak 26 (OIDC/JWT). PWA + SSG-пререндеринг (SSR выключен). Деплой: ВМ Yandex Cloud (локальный docker-compose.prod).

## Доступ (тест, публичный IP)
- **Фронт:** http://158.160.204.124:8081
- **Keycloak:** http://158.160.204.124:8080 (админка `admin`/`admin`)
- **API:** http://158.160.204.124:8081/api/health (или `:3000/api`)
- **Тест-юзер:** `final-test@example.com` / `Final1234` (создан при проверке; `test@example.com` в свежий realm не экспортирован)
- **SSH:** `ssh -i C:\Users\Saturn\.ssh\keys\yc-vm-key mit-2@158.160.204.124`; репо на ВМ `~/stats-hunter`; бэкенд = `nohup node dist/apps/backend/main.js` (без автоперезапуска).

## Что сделано в этой сессии
1. Auth UX: AuthGuard + защищённый `/home`, редирект после входа/регистрации, logout, показ email (`keycloak.service.ts`, `auth.guard.ts`, `components/home/`).
2. `NotificationService` (ng-zorro) в `app/services/` — success/error/warning/info, используется в login/register.
3. Переключатель видимости пароля (глаз/перечёркнутый глаз) во всех полях пароля.
4. Keycloak-конфиг вынесен из хардкода: фронт → `environments/environment.ts|prod.ts` (+ `fileReplacements`); бэк → `KEYCLOAK_*` в `.env.example`.
5. Деплой на ВМ: `docker-compose.prod.yml` (postgres/redis/keycloak/nginx-фронт + импорт realm + лимит памяти Keycloak), `infra/nginx/stats-hunter.conf`, `infra/postgres/init-keycloak-db.sql`, `.env.prod.example`.
6. Освобождено 4.1 GB на ВМ (`docker builder prune`).

## Деплой-флоу (повторить на ВМ)
```sh
ssh -i C:\Users\Saturn\.ssh\keys\yc-vm-key mit-2@158.160.204.124
cd ~/stats-hunter && git pull
npm ci
export PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
npx prisma generate && npx prisma db push
npx nx build backend frontend
docker compose -f docker-compose.prod.yml up -d
node dist/apps/backend/main.js   # или nohup ... &
```
Верификация: `tools/verify-deploy.sh` (закинуть на ВМ и `bash`).

## Ключевые нюансы (НЕ переоткрывать)
- **Keycloak 26:** в `start` требует HTTPS key material → используем `start-dev`. Для HTTP по внешнему IP: realm `sslRequired=none` + `--hostname=http://IP:8080`. Опции `KC_HOSTNAME_URL` в KC26 **нет** (есть `--hostname <host|URL>`).
- **Prisma-engines** не качаются с `binaries.prisma.sh` с ВМ → зеркало `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma`.
- **npm на ВМ = 11.16** (npm 10 падает `EUSAGE`: lockfile не в sync).
- **Keycloak и app — разные БД** (`keycloak` vs `stats_hunter`), иначе `prisma db push` конфликтует с таблицами Keycloak.

## Инфраструктура (docker-compose.prod.yml, сеть `stats-hunter`)
- postgres:16-alpine → `:5433` (хост), БД `stats_hunter` (app) + `keycloak`.
- redis:7-alpine → `:6379`.
- keycloak:26.0 → `:8080`, `start-dev --import-realm --hostname=http://158.160.204.124:8080`, `JAVA_OPTS_APPEND=-Xms256m -Xmx768m`, realm из `infra/keycloak/realm-export.json`.
- frontend: nginx:alpine → `:8081`, монтирует `dist/apps/frontend/browser` + `infra/nginx/stats-hunter.conf`, `/api` → `host.docker.internal:3000`.
- Бэкенд — отдельный Node-процесс на хосте (`:3000`), читает `~/stats-hunter/.env`.

## Команды (локально)
- Проверка: `npx nx run-many -t lint test build`.
- Бэк после сборки: `node dist/apps/backend/main.js`.
- Фронт dev: `npx nx serve frontend` (прокси `/api` → `:3000`).

## Дальнейшие шаги (кандидаты, по приоритету)
1. **Домен + HTTPS:** купить домен → A-запись на `158.160.204.124` → nginx vhost + Let's Encrypt → заменить IP на домен в `environment.prod.ts`/`realm-export.json`/`docker-compose.prod.yml` → Keycloak `start` + `sslRequired=external`.
2. Продолжить бэкенд: расширить Ozon-адаптер (заказы/аналитика/стоки) или WB API-ключ.
3. Фаза 2 — фронт-дашборд (KPI, графики ngx-echarts, товары, управление ключами).
4. Закрыть пункты `user-data/security-debt.md` (PKCE вместо password grant, CORS whitelist, Lockbox, rate limiting, сменить пароли).
5. Деплой в Яндекс Облако «по-взрослому»: SourceCraft/CI, Container Registry, Managed Postgres/Redis.
