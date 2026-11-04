-- Отдельная база для Keycloak (база приложения — app_template).
-- Выполняется только на свежем томе Postgres (docker-entrypoint-initdb.d).
CREATE DATABASE keycloak OWNER app_template;
