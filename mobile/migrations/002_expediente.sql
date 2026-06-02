-- VistoMap mobile: tabela de expediente (turno de trabalho) por usuario
-- Rode 1x manualmente no MariaDB destino:
--   mysql -h 127.0.0.1 -P 3307 -u glpi_gioc -p glpi_gioc < mobile/migrations/002_expediente.sql

CREATE TABLE IF NOT EXISTS `glpi_plugin_vistomap_expediente` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `users_id` INT NOT NULL,
  `inicio_at` DATETIME NOT NULL,
  `fim_at` DATETIME NULL,
  `pausa_almoco_inicio` DATETIME NULL,
  `pausa_almoco_fim` DATETIME NULL,
  `consentimento_lgpd_at` DATETIME NULL,
  `dispositivo_info` VARCHAR(255) NULL,
  `total_km` DECIMAL(8,3) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_open` (`users_id`, `fim_at`),
  KEY `idx_inicio` (`inicio_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de consentimento LGPD persistente — uma vez aceito, nao pede de novo
CREATE TABLE IF NOT EXISTS `glpi_plugin_vistomap_lgpd_consent` (
  `users_id` INT NOT NULL,
  `aceito_at` DATETIME NOT NULL,
  `versao_texto` VARCHAR(32) NOT NULL DEFAULT 'v1',
  `dispositivo_info` VARCHAR(255) NULL,
  PRIMARY KEY (`users_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
