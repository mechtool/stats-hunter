# stats-hunter — Handoff (state snapshot)

> Назначение: быстро восстановить контекст. Живое состояние файлов/git — авторитетно.
> Последнее обновление: 2026-11-04 (systemd, сервисный пользователь, www, шаблон).

## Где мы
`stats-hunter.ru` в проде на ВМ (158.160.204.124) с HTTPS. Прод на коммите `5f2ba5e` (ветка `master`). В GitHub также ветка `template` (шаблон `app-template`) и тег `stats-hunter-deployed` (`6f76c89`).

## Архитектура деплоя
- Edge: `it-client` (nginx, 80/443) по SNI:
  - `stats-hunter.ru` (+ `www` → 301 на apex) → `host.docker.internal:8081` (nginx-фронт, статика + `/api`).
  - `auth.stats-hunter.ru` → `host.docker.internal:8080` (Keycloak).
- Конфиг edge: `~/industrial-telemetry/nginx/stats-hunter.conf` (+ override `docker-compose.stats-hunter.yml`). Reload: `docker exec it-client nginx -s reload`.
- stats-hunter: postgres `:5433` (БД `stats_hunter` + `keycloak`), redis `:6379`, keycloak `:8080` (prod `start --proxy-headers=xforwarded --http-enabled=true`), frontend nginx `:8081`, backend **systemd** `stats-hunter-backend.service` на `:3000`.
- **Бэкенд = systemd** (active+enabled, `Restart=always`): `sudo systemctl restart stats-hunter-backend.service`. Лог: `journalctl -u stats-hunter-backend.service -f`.

## Деплой-процедура (проверена)
```sh
ssh yc-vm
cd ~/stats-hunter
git pull --ff-only
# если менялась схема: npx prisma generate && npx prisma db push
npx nx build frontend
npx nx build backend
sudo systemctl restart stats-hunter-backend.service
```
Фронт раздаётся volume-mounted (`dist/apps/frontend/browser`) — пересоздание nginx не нужно.

## Auth / Keycloak (актуально)
- Вход: ROPC (password grant) + JWT в localStorage (техдолг → PKCE + httpOnly-cookie).
- Регистрация/сброс пароля — через **сервисного пользователя** `svc-user-admin` (realm `stats-hunter`, роли `manage-users`/`view-users`), НЕ через admin.
- Keycloak admin (master) пароль сменён; консоль `auth.stats-hunter.ru`.
- Пароли: admin и svc-user — в `.env` на ВМ + в `.codewhale/handoff.md` (локально).

## Ключевые нюансы (не переоткрывать)
- Keycloak prod требует `--http-enabled=true`.
- certbot webroot = volume `industrial-telemetry_certbot-webroot` (НЕ host `/var/www/certbot`).
- `docker compose up -d client` в industrial-telemetry может каскадно пересоздать kratos/server.
- Prisma 7 + `@prisma/adapter-pg` — db push/generate работают без зеркала.
- На ВМ нужен npm 11.16 (npm 10 несовместим с lock).

## Долг (см. `user-data/security-debt.md`)
- PKCE + httpOnly-cookie (главный критичный пункт).
- Lockbox для `STATS_HUNTER_ENCRYPTION_KEY` + Ozon-ключей.
- 55 moderate (minimatch) — апгрейд Nx/ESLint.
