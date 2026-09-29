-- ============================================================================
--  Migração 2026-09-27 — login por usuário, primeiro acesso e trava de senha
--  Rode UMA vez em bancos criados antes desta data (phpMyAdmin → SQL).
--  Bancos novos já recebem estas colunas pelo database.sql.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN username                VARCHAR(40) NULL AFTER name,
  ADD COLUMN is_provider             TINYINT(1)  NOT NULL DEFAULT 0 AFTER role,
  ADD COLUMN must_change_password    TINYINT(1)  NOT NULL DEFAULT 0 AFTER active,
  ADD COLUMN password_change_allowed TINYINT(1)  NOT NULL DEFAULT 0 AFTER must_change_password,
  MODIFY email VARCHAR(190) NULL,
  ADD UNIQUE KEY uq_users_username (username);
