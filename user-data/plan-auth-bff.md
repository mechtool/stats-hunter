# План: Вариант A — серверный вход (BFF) + httpOnly-кука

> **Статус: РЕАЛИЗОВАНО и проверено локально (2026-11-08).**
> Код всех 6 фаз готов: сборки ✅, строгий typecheck ✅, линт ✅,
> 35 backend-тестов + 1 frontend-тест ✅, ручной E2E ✅
> (login → `Set-Cookie` httpOnly → `/me` 200 → logout → 401).
> Осталось только runtime-применение на проде — см. §«Применение» ниже.

> Цель: убрать ROPC из браузера и хранение токена в `localStorage`,
> не меняя интерфейс входа/регистрации. Ключевое допущение: MFA и
> соц-вход не нужны сейчас (иначе — Вариант B, кастомная тема Keycloak).
> Последнее обновление: 2026-11-08.

## Цель и границы

- Браузер больше **не ходит напрямую** в Keycloak token endpoint.
- Пароль вводится в **нашей** Angular-форме и передаётся на **наш** бэкенд.
- Бэкенд делает `grant_type=password` (ROPC) **сервер-к-серверу** в Keycloak.
- Токены живут **только на бэкенде**; браузер получает **httpOnly-куку** с идентификатором сессии.
- UI входа/регистрации **не меняется** (те же формы, тот же дизайн).
- НЕ входит в этот план: PKCE/Authorization Code, MFA, соц-вход (это Вариант B);
  перевод сервисного пользователя `svc-user-admin` на `client_credentials`
  (отдельный пункт, «Lockbox/секреты»).

## Зафиксированные решения (рекомендации)

1. **Сессия в БД**, а не «вся кука = зашифрованный токен».
   - Новая таблица `user_sessions` (Prisma).
   - Кука несёт только случайный 256-битный идентификатор (в БД — только его SHA-256, как уже делается для reset/verify токенов).
   - Плюсы: нет лимита 4KB на куку, мгновенный отзыв (удалить строку), переживает рестарт бэкенда (systemd), работает при нескольких инстансах.
2. **Токены шифруются** существующим `CredentialsService` (AES-256-GCM, ключ `STATS_HUNTER_ENCRYPTION_KEY`).
3. **Отдельный confidential-клиент Keycloak** для серверного входа — `stats-hunter-bff`
   (`directAccessGrantsEnabled: true`, `serviceAccountsEnabled: false`, client secret в `.env`).
   Публичный `stats-hunter-frontend` после миграции переводим на `directAccessGrantsEnabled: false`.
4. **Кука**: `HttpOnly; Secure (prod); SameSite=Lax; Path=/api`; имя `stats-hunter.session`.
5. **Прозрачный refresh**: если access-токен протух, guard сам обновляет его через refresh-токен и переписывает сессию/куку.

## Порядок работ

### Фаза 1 — Бэкенд: инфраструктура сессии
- [ ] 1. `prisma/schema.prisma`: модель `UserSession` (id, tokenHash unique, subject, email, accessTokenEncrypted, refreshTokenEncrypted, expiresAt, createdAt, lastUsedAt) + `@@map("user_sessions")`.
  - **Проверка**: `npx prisma migrate dev` / `db push` проходит; таблица создаётся.
- [ ] 2. Новый `SessionService` (`apps/backend/src/app/auth/session.service.ts`):
  - `create(subject, email, tokens)` → генерит id, пишет зашифрованные токены, возвращает raw-значение куки.
  - `find(rawCookie)` → hash → lookup → дешифрует токены.
  - `refresh(...)` → обмен refresh на новый access, перезапись.
  - `revoke(rawCookie)` → удаление строки (logout).
  - `revokeAllForSubject(subject)` → опционально.
  - **Проверка**: юнит-тесты (создание/чтение/шифрование/отзыв).
- [ ] 3. Cookie-хелпер: set/clear куки с флагами из конфига (`SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `SESSION_TTL`).
  - **Проверка**: в ответе реально стоит `Set-Cookie` с `HttpOnly`.

### Фаза 2 — Бэкенд: эндпоинты auth
- [ ] 4. `POST /api/auth/login` (в `auth.controller.ts`):
  - body `{email, password}`; валидация; ROPC через **`stats-hunter-bff`** (confidential, client_secret).
  - Создать сессию, `Set-Cookie`, вернуть `{ok:true, email}` — **без access_token в теле**.
  - Оставить `@UseGuards(RateLimitGuard)`.
  - **Проверка**: логин → в ответе кука, в теле нет токена.
- [ ] 5. `GET /api/auth/me` (protected):
  - читает сессию, возвращает `{email, subject, roles?, expiresAt}`.
  - **Проверка**: с валидной кукой → 200; без → 401.
- [ ] 6. `POST /api/auth/logout`:
  - revoke сессии + clear куки; опционально `logout`/revoke в Keycloak.
  - **Проверка**: после logout старый id сессии в БД удалён, кука сброшена.
- [ ] 7. `POST /api/auth/refresh` (или прозрачный в guard — см. шаг 9):
  - обмен refresh-токена, ротация, обновление сессии.
- [ ] 8. Переработать `verify-email`:
  - вместо `return {access_token}` — создать сессию (как login) и вернуть `{ok:true, email}`.
  - **Проверка**: подтверждение email → сессия создана, в теле нет токена.

### Фаза 3 — Бэкенд: guard
- [ ] 9. `jwt-auth.guard.ts`:
  - читать куку сессии → `SessionService.find` → дешифровать access → проверить RS256 по JWKS (как сейчас).
  - при истечении access — прозрачный refresh (переписать сессию + куку).
  - `request.user` оставить как payload JWT (совместимость).
  - **Опционально**: оставить fallback на `Authorization: Bearer` для curl/тестов.
  - **Проверка**: защищённый маршрут с кукой → 200 и `request.user`; без куки → 401.

### Фаза 4 — Фронтенд
- [ ] 10. `keycloak.service.ts`:
  - `login()` → `POST /api/auth/login` (не в Keycloak напрямую).
  - `verifyEmail()` → `POST /api/auth/verify-email` (без разбора access_token).
  - `logout()` → `POST /api/auth/logout`.
  - `loadSession()` → `GET /api/auth/me` (для старта приложения).
  - **Убрать** `localStorage` (`TOKEN_KEY`, `EMAIL_KEY`); email держать в памяти + из `/me`.
  - `isAuthenticated()` → по состоянию сессии (флаг + `/me`).
- [ ] 11. HTTP-слой: `withCredentials: true` (interceptor или глобально), чтобы кука уходила на `/api`.
  - CORS бэка уже `credentials: true` + allow-list (`main.ts`), проверить dev-прокси (`proxy.conf.json`).
- [ ] 12. `auth.guard.ts` + старт приложения:
  - `APP_INITIALIZER` или `provideAppInitializer` вызывает `loadSession()`.
  - guard: синхронный флаг + (при необходимости) асинхронный `/me`.
- [ ] 13. Компоненты `login`, `verify-email`, `home`: точечные правки (никакой работы с токенами), UI без изменений.
  - **Проверка**: `nx build frontend` + ручной проход входа/регистрации/выхода.

### Фаза 5 — Keycloak + окружение
- [ ] 14. В `infra/keycloak/realm-export.json`:
  - добавить confidential-клиент `stats-hunter-bff` (`directAccessGrantsEnabled: true`, `serviceAccountsEnabled: false`, secret).
  - у `stats-hunter-frontend` → `directAccessGrantsEnabled: false`.
  - применить на prod (realm-import / админ-консоль).
- [ ] 15. Env-переменные (бэкенд `.env`, прод ВМ `~/stats-hunter/.env`):
  - `KEYCLOAK_BFF_CLIENT_ID`, `KEYCLOAK_BFF_CLIENT_SECRET`, `SESSION_COOKIE_SECURE`, `SESSION_TTL`.
  - **Проверка**: `.env` обновлён локально и на ВМ; секреты в git не попадают.

### Фаза 6 — Проверка и деплой
- [ ] 16. Юнит-тесты: `SessionService`, изменённые `auth.controller` + `jwt-auth.guard`, `keycloak.service`.
  - **Проверка**: `nx test backend`, `nx test frontend`.
- [ ] 17. E2E вручную (локально, затем prod):
  - login → `Set-Cookie` httpOnly → `/api/auth/me` 200 → защищённый маршрут 200 → logout → 401.
  - В консоли браузера `document.cookie` **не** показывает токен сессии.
- [ ] 18. Деплой (процедура из handoff): `git pull` → `npx prisma generate && npx prisma db push` → `nx build frontend` + `nx build backend` → `sudo systemctl restart stats-hunter-backend.service`.
  - **Проверка**: `curl -i` на `/api/auth/me` без куки → 401; прогон шага 17 на проде.

## Применение (шаги на живой инфраструктуре — сеть/SSH недоступны из sandbox)

Код готов и проверен локально (сборка + тесты + typecheck + линт). Осталось runtime-применение.

1. **Схема БД** (локально и на ВМ):
   ```
   npx prisma generate && npx prisma db push
   ```
   (`db push` создаст таблицу `user_sessions`.)

2. **Keycloak-клиент и секрет.** `realm-export.json` уже содержит клиент
   `stats-hunter-bff` (confidential, direct grants on) и выключенные direct grants
   у `stats-hunter-frontend`. Секрет в export не хранится (секрет в git не коммитим).
   Задать его на запущенном Keycloak (realm `stats-hunter`):
   - либо через админ-консоль `auth.stats-hunter.ru`: Clients → `stats-hunter-bff` → Credentials → Regenerate secret;
   - либо через Admin API:
     ```
     curl -s -u admin:<admin-pass> \
       "https://auth.stats-hunter.ru/admin/realms/stats-hunter/clients?clientId=stats-hunter-bff"
     curl -s -X PUT -u admin:<admin-pass> -H 'Content-Type: application/json' \
       -d '{"secret":"<KEYCLOAK_BFF_CLIENT_SECRET>"}' \
       "https://auth.stats-hunter.ru/admin/realms/stats-hunter/clients/<id>"
     ```
   Тот же `<KEYCLOAK_BFF_CLIENT_SECRET>` записать в `.env` бэкенда на ВМ.

3. **Env на ВМ (`~/stats-hunter/.env`)** добавить/обновить:
   ```
   KEYCLOAK_BFF_CLIENT_ID=stats-hunter-bff
   KEYCLOAK_BFF_CLIENT_SECRET=<тот же секрет>
   SESSION_COOKIE_SECURE=true
   SESSION_TTL_MS=604800000
   ```

4. **Деплой** (процедура из handoff):
   ```
   ssh yc-vm → cd ~/stats-hunter → git pull --ff-only
   npx prisma generate && npx prisma db push
   npx nx build frontend && npx nx build backend
   sudo systemctl restart stats-hunter-backend.service
   ```

5. **Проверка E2E** (локально и на проде):
   - `POST /api/auth/login` → в ответе `Set-Cookie: stats-hunter.session=...; HttpOnly; ...`, в теле **нет** `access_token`.
   - `GET /api/auth/me` с кукой → 200 `{email, subject}`; без куки → 401.
   - В консоли браузера `document.cookie` не показывает значение сессии.
   - `POST /api/auth/logout` → кука сброшена, повторный `/me` → 401.

## Риски и открытые вопросы

- **CSRF**: httpOnly-кука + `SameSite=Lax` закрывает большинство сценариев; при появлении «мутирующих» cross-site-форм — добавить CSRF-токен или `SameSite=Strict`.
- **Refresh и конкуренция**: параллельные запросы могут одновременно обновлять сессию — сделать single-flight (один refresh, остальные ждут) или короткую блокировку.
- **Миграция существующих сессий**: после смены guard старые `localStorage`-токены перестают работать — фронт при старте делает `/me`, при 401 ведёт на `/login` (пользователи просто перелогиниваются).
- **Секрет `stats-hunter-bff`**: хранение в `.env` (не в git); полноценный secret manager (Lockbox) — отдельный пункт техдолга, сюда не входит.
- **`svc-user-admin` (регистрация)**: продолжает ходить в Keycloak Admin API по ROPC на `admin-cli` — это внутренний серверный вызов, оставляем как есть; перевод на `client_credentials` — отдельная задача.
