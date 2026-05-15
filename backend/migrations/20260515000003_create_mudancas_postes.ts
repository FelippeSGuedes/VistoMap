import type { Knex } from "knex";

/**
 * Tabela `mudancas_postes` — audit imutável de cada troca de PSPOSTE numa vistoria.
 *
 * - `vistoria_id` é string: corresponde ao id do NetworkEquipment no GLPI (chave externa lógica).
 * - `poste_id_antigo` e `poste_id_novo` referenciam a tabela `postes` localmente.
 *     poste_id_antigo pode ser NULL (poste antigo pode não estar no nosso dataset).
 *     poste_id_novo é obrigatório (sempre escolhido do mapa).
 * - `distancia_m`: distância calculada no momento da troca (ST_Distance(geog,geog)).
 * - `raio_max_m`: snapshot da regra vigente (POSTE_TROCA_RAIO_M na época) — auditoria histórica.
 * - Sem UPDATE/DELETE no app: append-only. Audit é fonte da verdade.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mudancas_postes (
      id                BIGSERIAL PRIMARY KEY,
      vistoria_id       VARCHAR(64) NOT NULL,
      psposte_antigo    VARCHAR(64) NULL,
      municipio_antigo  VARCHAR(120) NULL,
      psposte_novo      VARCHAR(64) NOT NULL,
      municipio_novo    VARCHAR(120) NOT NULL,
      poste_id_antigo   BIGINT NULL REFERENCES postes(id) ON DELETE SET NULL,
      poste_id_novo     BIGINT NOT NULL REFERENCES postes(id) ON DELETE RESTRICT,
      usuario_id        VARCHAR(64) NOT NULL,
      usuario_email     VARCHAR(180) NULL,
      motivo            VARCHAR(64) NOT NULL,
      observacao        TEXT NULL,
      distancia_m       NUMERIC(10,2) NULL,
      raio_max_m        NUMERIC(10,2) NOT NULL,
      payload_glpi      JSONB NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS mudancas_postes_vistoria
      ON mudancas_postes (vistoria_id, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS mudancas_postes_usuario
      ON mudancas_postes (usuario_id, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS mudancas_postes_motivo
      ON mudancas_postes (motivo)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS mudancas_postes`);
}
