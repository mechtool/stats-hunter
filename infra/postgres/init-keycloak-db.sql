-- Отдельная база для Keycloak (база приложения — stats_hunter).
-- Выполняется только на свежем томе Postgres (docker-entrypoint-initdb.d).
CREATE DATABASE keycloak OWNER stats_hunter;
