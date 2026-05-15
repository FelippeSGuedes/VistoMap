import type { Knex } from "knex";

/**
 * Habilita extensões necessárias.
 *
 * postgis      : geometria + geografia + ST_DWithin/ST_Distance etc.
 * pg_trgm      : busca por similaridade em PSPOSTE (LIKE '%PS%' performático).
 * btree_gist   : permite GIST composto (município + ponto, busca por área + cidade).
 * unaccent     : normaliza acentos em buscas (municipiofield "São Paulo" → "Sao Paulo").
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS postgis`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS unaccent`);
}

export async function down(knex: Knex): Promise<void> {
  // Não removemos extensões — pode quebrar outras tabelas.
  await knex.raw(`-- noop down`);
}
