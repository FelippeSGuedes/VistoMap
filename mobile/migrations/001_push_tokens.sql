-- VistoMap mobile: tabela de FCM tokens por usuario
-- Rode 1x manualmente no MariaDB destino:
--   mysql -h 127.0.0.1 -P 3307 -u glpi_gioc -p glpi_gioc < mobile/migrations/001_push_tokens.sql

CREATE TABLE IF NOT EXISTS `glpi_plugin_vistomap_push_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `users_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `platform` VARCHAR(16) NOT NULL DEFAULT 'android',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_token` (`users_id`, `token`),
  KEY `idx_users_id` (`users_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
