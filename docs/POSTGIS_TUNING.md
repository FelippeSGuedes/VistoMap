# PostGIS — tuning & manutenção da tabela `postes`

> Stack: PostgreSQL 16 + PostGIS 3.4 (Alpine) com 1.5M rows, padrão mostly-read,
> upserts pontuais via importador CSV.

---

## 1. Após qualquer import grande

```bash
docker exec -it vistomap-postes-api npm run optimize:postes
```

O script faz, em ordem:

1. **`ALTER TABLE postes SET (autovacuum_vacuum_scale_factor = 0.05, ...)`**
   - Autovacuum por-tabela mais frequente: 5% de dead tuples já dispara cleanup.
   - `autovacuum_analyze_scale_factor = 0.02`: 2% de mudança refaz stats do planner.
   - `autovacuum_vacuum_cost_delay = 10ms`: dá a CPU para queries durante vacuum.
   - `fillfactor = 90`: 10% de espaço livre em cada página para HOT updates.

2. **`CLUSTER postes USING postes_geom_gist`**
   - Reordena fisicamente as linhas conforme o índice GIST.
   - Postes vizinhos no espaço viram vizinhos no disco.
   - Radius queries leem **2-5x menos páginas** depois disso.
   - **LOCK ACCESS EXCLUSIVE** durante execução (~60-180s para 1.5M). Faça em janela
     sem tráfego (após import inicial).

3. **`VACUUM (ANALYZE) postes`** — recupera tuples mortos + refresh de stats.

## 2. Sanity check + benchmark

```bash
docker exec -it vistomap-postes-api npm run bench:postes
```

Roda 3 cenários (20 amostras cada) com `EXPLAIN ANALYZE`:

| Cenário | Query | Índice esperado no plano |
|---|---|---|
| **A. radius** | `ST_DWithin(geom::geography, point::geography, m)` | `postes_geog_gist` |
| **B. bbox** | `geom && ST_MakeEnvelope(...)` | `postes_geom_gist` |
| **C. trgm** | `pspostefield ILIKE '%PS-12%'` | `postes_psposte_trgm` |

> **Se aparecer `Seq Scan` em qualquer cenário**, o índice não está sendo usado
> (mau plan, stats velhas, ou tabela pequena demais). Rode
> `ANALYZE postes;` e cheque de novo.

## 3. Métricas-alvo (1.5M rows, hardware modesto: 4 vCPU/8GB RAM)

| Métrica | Target |
|---|---|
| `/postes/proximos` (raio 500m) | **< 20ms** (avg) |
| `/postes/bbox` (1km²) | **< 30ms** (avg) |
| autocomplete (trgm prefix 4 chars) | **< 25ms** (avg) |
| tamanho índices/tabela | índices ≈ 40-60% do tamanho da tabela |

## 4. Tuning do `postgresql.conf` (já no compose)

O `command:` do serviço `postgis` no `docker-compose.yml` aplica:

```
shared_buffers          = 512MB      # ~25% de RAM de uma VM 2GB
effective_cache_size    = 2GB        # informa ao planner sobre cache do OS
work_mem                = 32MB       # ordenações + bitmap scans
maintenance_work_mem    = 256MB      # CLUSTER + CREATE INDEX
max_wal_size            = 2GB        # menos checkpoints durante bulk upsert
random_page_cost        = 1.1        # SSD (HDD usaria 4.0)
jit                     = off        # queries geoespaciais pequenas/médias perdem
checkpoint_timeout      = 15min
```

Se a VM tiver mais RAM, aumente proporcionalmente:
- `shared_buffers` → 25% da RAM total
- `effective_cache_size` → 70-75% da RAM total
- `work_mem` → 64MB+ (se houver muitas queries concorrentes, deixe baixo — multiplica por conexão)

## 5. Operações comuns

```bash
# tamanho total
docker exec -it vistomap-postgis psql -U vistomap -d vistomap -c "
  SELECT pg_size_pretty(pg_total_relation_size('postes'));
"

# lista os índices da tabela
docker exec -it vistomap-postgis psql -U vistomap -d vistomap -c "
  SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
    FROM pg_indexes WHERE tablename = 'postes';
"

# checa qual índice está sendo mais usado
docker exec -it vistomap-postgis psql -U vistomap -d vistomap -c "
  SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
    FROM pg_stat_user_indexes
   WHERE relname = 'postes'
   ORDER BY idx_scan DESC;
"

# tuples mortos (se > 10% da tabela, rode VACUUM)
docker exec -it vistomap-postgis psql -U vistomap -d vistomap -c "
  SELECT n_live_tup, n_dead_tup,
         ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup,0), 2) AS pct_dead
    FROM pg_stat_user_tables WHERE relname = 'postes';
"
```

## 6. Quando re-rodar `optimize:postes`

| Evento | Re-cluster? | VACUUM ANALYZE? |
|---|---|---|
| Import inicial | ✅ obrigatório | ✅ |
| Re-import (diff < 5%) | ❌ não vale | ✅ |
| Re-import (diff > 20%) | ✅ vale | ✅ |
| Apenas mudancas_postes crescendo | ❌ | autovacuum cuida |
| Queries lentas sem razão | ✅ tentar | ✅ |

> O CLUSTER é one-time-physical: novas linhas inseridas **não** entram no lugar
> "certo" automaticamente — só são reordenadas no próximo CLUSTER.
> Em produção real, agendar CLUSTER mensal via cron / pg_cron.
