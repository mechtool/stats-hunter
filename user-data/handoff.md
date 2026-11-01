# stats-hunter — Handoff (state snapshot)

> Назначение: быстро восстановить контекст. Живое состояние файлов/git — авторитетно.
> Последнее обновление: 2026-11-01 (prod-деплой завершён).

## Где мы
stats-hunter.ru в проде на ВМ (158.160.204.124) с HTTPS, на одной ВМ с industrial-telemetry через общий edge-nginx (SNI). E2E проверен: логин/регистрация/сброс пароля/Ozon-инфраструктура на доменах.

## Архитектура деплоя (текущая)
- Edge: `it-client` (nginx, 80/443) раздаёт по SNI:
  - `industrial-telemetry.ru` → свой стек (как раньше).
  - `stats-hunter.ru` → `host.docker.internal:8081` (nginx-фронт со статикой + `/api`).
  - `auth.stats-hunter.ru` → `host.docker.internal:8080` (Keycloak).
- Конфиг edge: `~/industrial-telemetry/nginx/stats-hunter.conf` (+ override `docker-compose.stats-hunter.yml`). `nginx.yc.conf` IT не менялся.
- stats-hunter: postgres `:5433` (БД `stats_hunter` + `keycloak`), redis `:6379`, keycloak `:8080` (prod `start --proxy-headers=xforwarded --http-enabled=true`), frontend nginx `:8081`, backend host-процесс `:3000`.
- Keycloak 26: `--proxy=edge` УДАЛЁН → используется `--proxy-headers=xforwarded` + `--http-enabled=true`.

## Ключевые нюансы (НЕ переоткрывать)
- Keycloak prod требует `--http-enabled=true` (иначе «Key material not provided to setup HTTPS»).
- `docker compose up -d client` в industrial-telemetry может каскадно пересоздать kratos/server — у kratos `SMTP_URI` живёт в `.env` (`~/industrial-telemetry/.env`), а не в shell env.
- Certbot webroot: volume `industrial-telemetry_certbot-webroot` (не host-путь `/var/www/certbot`).
- Prisma 7 + `@prisma/adapter-pg` — нативного движка в рантайме нет; `db push`/`generate` работают без зеркала.

## Фазы/план (как в `user-data/plan.md`)
Фаза 1 (бэкенд-ядро + Ozon) в работе. Дальше: Фаза 2 (фронт WB/Ozon), PKCE вместо password grant, Lockbox для секретов.

## Долг (см. `user-data/security-debt.md`)
- www.stats-hunter.ru добавить в сертификат.
- Keycloak admin `admin/admin` → сменить.
- Бэкенд без автоперезапуска → systemd/pm2.
- Security group закрыть до 80/443(+22).
- Закоммитить прод-конфиги/скрипты.
