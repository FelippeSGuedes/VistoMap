-- VistoMap mobile: config do expediente automático (janela de horário)
-- Auto-criada pela lib (CREATE TABLE IF NOT EXISTS em src/lib/expediente.ts),
-- mas documentada aqui para consistência com as demais migrations.
-- Rode 1x manualmente no MariaDB destino se quiser adiantar (opcional):
--   mysql -h 127.0.0.1 -P 3307 -u glpi_gioc -p glpi_gioc < mobile/migrations/004_expediente_config.sql

CREATE TABLE IF NOT EXISTS `glpi_plugin_vistomap_config` (
  `chave` VARCHAR(64) NOT NULL,
  `valor` VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Chaves usadas: expediente_inicio ("07:30"), expediente_fim ("18:00"),
-- expediente_fds ("0"/"1"). Ausentes = defaults 07:30/18:00/sem fds.
-- Editável em /painel/configuracoes (admin).
