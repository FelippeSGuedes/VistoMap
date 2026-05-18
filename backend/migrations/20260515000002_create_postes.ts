import type { Knex } from "knex";

/**
 * Tabela `postes` — source-of-truth geoespacial dos postes do VistoMap.
 *
 * Decisões de design:
 *   - Lat/lng armazenados como NUMERIC(10,7): precisão de ~1cm, suficiente p/ Mapbox.
 *   - `geom geometry(Point, 4326)`: padrão WGS84 (mesmo SRID do GPS/Mapbox).
 *     • Para distâncias em metros, usamos `geom::geography` nas consultas.
 *     • Dois índices GIST: bbox (geometry) e radius (geography).
 *   - UNIQUE (municipiofield_norm, pspostefield): chave de upsert do importador.
 *     `municipiofield_norm` é gerada (unaccent + upper) — permite "São Paulo" == "SAO PAULO".
 *   - Trigger preenche `geom` automaticamente a partir de lat/lng. Garante consistência
 *     mesmo em inserts manuais ou via COPY.
 *   - `pg_trgm` index em PSPOSTE para autocomplete (`ILIKE '%PS-12%'` performático).
 */
export async function up(knex: Knex): Promise<void> {
  // ── wrapper IMMUTABLE para unaccent ───────────────────────────────────────
  // `unaccent(text)` é STABLE (depende do dicionário), o Postgres recusa em
  // GENERATED ALWAYS AS ... STORED. Wrapper fixando o dicionário 'public.unaccent'
  // permite marcar como IMMUTABLE — exigência das colunas geradas.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.f_unaccent_immutable(text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE PARALLEL SAFE STRICT
    AS $$
      SELECT public.unaccent('public.unaccent', $1);
    $$;
  `);

  // ── tabela base ───────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS postes (
      id                  BIGSERIAL PRIMARY KEY,
      pspostefield        VARCHAR(64)  NOT NULL,
      materialfield       VARCHAR(64)  NULL,
      alturadaantenafield VARCHAR(32)  NULL,
      municipiofield      VARCHAR(120) NOT NULL,
      municipiofield_norm VARCHAR(120) GENERATED ALWAYS AS (
        upper(public.f_unaccent_immutable(municipiofield))
      ) STORED,
      latitudefield       NUMERIC(10,7) NOT NULL,
      longitudefield      NUMERIC(10,7) NOT NULL,
      geom                geometry(Point, 4326),
      raw                 JSONB         NULL,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `);

  // ── unique de upsert (município normalizado + PSPOSTE) ───────────────────
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS postes_uniq_municipio_psposte
      ON postes (municipiofield_norm, pspostefield)
  `);

  // ── função + trigger: sincroniza geom com lat/lng ────────────────────────
  await knex.raw(`
    CREATE OR REPLACE FUNCTION postes_sync_geom() RETURNS trigger AS $$
    BEGIN
      IF NEW.latitudefield IS NULL OR NEW.longitudefield IS NULL THEN
        NEW.geom := NULL;
      ELSE
        NEW.geom := ST_SetSRID(
          ST_MakePoint(NEW.longitudefield::float8, NEW.latitudefield::float8),
          4326
        );
      END IF;
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_postes_sync_geom ON postes;
    CREATE TRIGGER trg_postes_sync_geom
      BEFORE INSERT OR UPDATE OF latitudefield, longitudefield
      ON postes
      FOR EACH ROW
      EXECUTE FUNCTION postes_sync_geom();
  `);

  // ── índices geoespaciais ──────────────────────────────────────────────────
  // Sem WHERE parcial: Postgres não permite CLUSTER em índice parcial.
  // Trigger postes_sync_geom + NOT NULL em lat/lng garantem geom não-null,
  // então o WHERE seria inerte. Índice cheio + CLUSTER no postes_geom_gist
  // mantém co-localização espacial no heap.
  //
  // 1) geometry (bbox query — ST_MakeEnvelope, &&)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS postes_geom_gist
      ON postes USING GIST (geom)
  `);

  // 2) geography (radius em metros — ST_DWithin)
  // Índice funcional. Consultas com `geom::geography` usam este.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS postes_geog_gist
      ON postes USING GIST ((geom::geography))
  `);

  // ── índices auxiliares ───────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS postes_psposte_trgm
      ON postes USING GIN (pspostefield gin_trgm_ops)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS postes_municipio_btree
      ON postes (municipiofield_norm)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS trg_postes_sync_geom ON postes`);
  await knex.raw(`DROP FUNCTION IF EXISTS postes_sync_geom()`);
  await knex.raw(`DROP TABLE IF EXISTS postes`);
  await knex.raw(`DROP FUNCTION IF EXISTS public.f_unaccent_immutable(text)`);
}
