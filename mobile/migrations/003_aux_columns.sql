-- VistoMap painel: colunas que podem estar ausentes em glpi_plugin_vistomap_projects
-- Causam SQL error em fetchVistoriasRealizadas (aba Realizadas) se nao existirem.
-- Rode 1x manualmente no MariaDB destino:
--   mysql -h 127.0.0.1 -P 3307 -u glpi_gioc -p'!!N@n$3n' glpi_gioc < mobile/migrations/003_aux_columns.sql

-- project_status: usado por fetchVistoriasRealizadas, aprovarVistoria, reprovarVistoria
ALTER TABLE `glpi_plugin_vistomap_projects`
  ADD COLUMN IF NOT EXISTS `project_status`
    ENUM('PENDENTE','GERANDO','GERADO','ERRO') NOT NULL DEFAULT 'PENDENTE';

-- approved_at: usado por fetchVistoriasRealizadas e aprovarVistoria
ALTER TABLE `glpi_plugin_vistomap_projects`
  ADD COLUMN IF NOT EXISTS `approved_at` DATETIME NULL;

-- Confirma estrutura final
SHOW COLUMNS FROM `glpi_plugin_vistomap_projects`;
