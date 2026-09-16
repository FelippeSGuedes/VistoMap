import type { Knex } from "knex";

/**
 * Indicadores booleanos por poste — "Tem Rede Secundária / Primária /
 * Transformador / Religador". Vieram prontos da concessionária em 3
 * planilhas cheias (Paulista/Piratininga/Santa Cruz, ~1,46M linhas no total —
 * bate com o universo inteiro de `postes` hoje), sem coluna própria até
 * agora. Ver backend/src/scripts/import-flags-csv.ts pro backfill.
 *
 * Nullable de propósito: NULL = "não informado por nenhuma planilha ainda",
 * diferente de false = "informado, e é Não".
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("postes", (table) => {
    table.boolean("tem_rede_secundaria").nullable();
    table.boolean("tem_rede_primaria").nullable();
    table.boolean("tem_transformador").nullable();
    table.boolean("tem_religador").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("postes", (table) => {
    table.dropColumn("tem_rede_secundaria");
    table.dropColumn("tem_rede_primaria");
    table.dropColumn("tem_transformador");
    table.dropColumn("tem_religador");
  });
}
