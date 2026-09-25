import "server-only";
import { query } from "@/lib/db";
import {
  CONCESSIONARIA_COLUMN,
  DESCRICAO_DETALHADA_CPFL_COLUMN,
  ITEMTYPE_NE,
  MOTIVO_REPROVACAO_CPFL_COLUMN,
  SITUACAO_COLUMN,
  TABLE_AUX,
  TABLE_CONCESSIONARIA,
  TABLE_FIELDS,
  TABLE_MOTIVO_REPROVACAO_CPFL,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
  TABLE_USERS,
} from "./constants";
import { nomesDeUsuariosRemovidos } from "./usuariosRemovidos";
import { RECUSA_MOTIVO_CATEGORIA, RECUSA_MOTIVO_LABEL, type RecusaCategoria, type RecusaMotivo } from "./recusaMotivos";
import { composeMotivoReprovacaoCpfl } from "./motivoReprovacaoCpfl";

// situaodavistoriafield: 3=Vistoriado, 6=Revisitado — mesma prioridade 1 que
// resolveAdminStatus() já usa em painel.ts e que fetchVistoriasRealizadas()
// já cruza no WHERE. Sem isso aqui, vistorias concluídas só via situação
// nova (sem o dropdown legado `statusvistoria` preenchido) ficavam de fora
// das séries/ranking deste arquivo — divergindo do card "Concluídas" e de
// /painel/realizadas, que já consideravam essas vistorias.
const SITUACAO_CONCLUIDA_SQL = `f.\`${SITUACAO_COLUMN}\` IN (3, 6)`;

/**
 * Histórico operacional agregado para /painel/historico.
 *
 * Combina:
 *  • séries diárias (vistorias, revisitas, aprovações) via GROUP BY DATE()
 *  • taxas (aprovação, revisita)
 *  • top municípios
 *  • ranking técnicos
 *  • km percorrido (Haversine sobre pings GPS sucessivos)
 *
 * Período default: últimos 30 dias.
 */

export interface HistoricoAnalytics {
  periodo: { inicio: string; fim: string; dias: number };
  totais: {
    vistoriasFinalizadas: number;
    revisitasFinalizadas: number;
    aprovadas: number;
    reprovadas: number;
    pdfsGerados: number;
    /** Vistorias ATRIBUÍDAS no período (audit log, não estado atual). */
    atribuidas: number;
    /** Mesmo cálculo, no período equivalente imediatamente anterior — pra variação %. */
    atribuidasPeriodoAnterior: number;
    /** Mesmo cálculo de período anterior, aplicado a reprovadas — pra variação % do KPI Reprovadas (2026-09-25). */
    reprovadasPeriodoAnterior: number;
  };
  taxas: {
    aprovacaoPct: number;
    revisitaPct: number;
  };
  medias: {
    diariaVistorias: number;
    semanalVistorias: number;
  };
  serieDiaria: Array<{
    dia: string; // YYYY-MM-DD
    finalizadas: number;
    aprovadas: number;
    /** Subconjunto de `aprovadas` — só "Aprovado" (sem ressalva). */
    aprovadasSemPendencia: number;
    /** Subconjunto de `aprovadas` — só "Aprovado com Pendências". */
    aprovadasComPendencia: number;
    reprovadas: number;
    /** Atribuídas nesse dia (audit log) — 2026-09-25, pra evolução de 3 séries. */
    atribuidas: number;
  }>;
  topMunicipios: Array<{
    municipio: string;
    /** Total de vistorias do município, qualquer situação, sem recorte de data. */
    total: number;
    /** Quantas dessas já foram finalizadas (datadavistoriafield preenchida). */
    concluidas: number;
  }>;
  /** Mesmo ranking, mas concluídas DENTRO do período (inicio..fim) — pro
   *  mapa/ranking de Padrão Diário no dashboard, que precisa refletir o
   *  filtro de período (topMunicipios acima é intencionalmente todo o
   *  histórico, serve a tela /painel/historico). `aprovado` já vem somado
   *  (Aprovado + Aprovado com Pendências). `pendente` é o resíduo —
   *  concluída pelo técnico, ainda sem decisão da concessionária. */
  topMunicipiosPeriodo: Array<{
    municipio: string;
    concluidas: number;
    aprovado: number;
    aprovadoComPendencia: number;
    pendente: number;
    reprovado: number;
    /** Impedimentos/recusas do período nesse município — fonte diferente
     *  (glpi_plugin_vistomap_recusas), só PENDENTE+APROVADO. */
    impedimento: number;
    recusa: number;
  }>;
  /** Feed "em tempo real" — mescla audit log (Vistoriada/Impedida/Recusada,
   *  horário preciso) com `ne.date_mod` do GLPI (Aprovada/Aprovado com
   *  Pendência/Reprovada — a concessionária decide direto no GLPI, sem
   *  passar pelo audit do VistoMap, mas o próprio GLPI grava quando o
   *  registro foi salvo). Já ordenado por horário, mais recente primeiro. */
  atividadeRecente: Array<{
    ts: string;
    status: "Vistoriada" | "Impedida" | "Recusada" | "Aprovada" | "Aprovado com Pendência" | "Reprovada";
    equipamento: string;
    municipio: string | null;
    /** null quando o técnico não pôde ser resolvido (registro antigo/purgado). */
    tecnico: string | null;
    /** Só preenchido em linhas Reprovada — dropdown novo, com fallback pro texto legado. */
    motivo: string | null;
    /** Iniciada→Finalizada dessa vistoria (mesmo par de eventos do SLA de execução) — null sem os dois marcos. */
    tempoEmCampoMin: number | null;
  }>;
  /** Tempo médio (minutos) de cada fase operacional, agregado pra equipe
   *  toda no período — 2026-09-25. Deslocamento/Em vistoria/Realizada vêm
   *  do mesmo encadeamento de eventos de auditoria (em-deslocamento →
   *  em-vistoria → iniciada → finalizada); Reprovada usa o mesmo par
   *  iniciada→finalizada, só que das vistorias cujo desfecho foi reprovado
   *  (o técnico faz o mesmo trabalho de campo, decisão vem depois);
   *  Impedimento vem de outra fonte (glpi_plugin_vistomap_recusas,
   *  criado_em→resolvido_em). null = sem amostra suficiente no período. */
  tempoMedioPorStatus: {
    realizadaMin: number | null;
    emVistoriaMin: number | null;
    emDeslocamentoMin: number | null;
    impedimentoMin: number | null;
    reprovadaMin: number | null;
  };
  /** Volume de vistorias concluídas por hora do dia (0-23), no período — 2026-09-25, só horas com alguma atividade. */
  vistoriasPorHora: Array<{ hora: number; total: number }>;
  rankingTecnicos: Array<{
    id: number;
    nome: string;
    total: number;
    aprovadas: number;
    revisitas: number;
    kmPercorrido?: number;
    tempoDeslocamentoMedioMin?: number | null;
    slaExecucaoMedioMin?: number | null;
  }>;
  kmOperacional: number;
  /** Agrupado direto pelo dropdown "Motivo de Reprovação CPFL" (2026-09-24) — mesmo formato de motivosImpedimento. */
  motivosReprovacao: Array<{ label: string; total: number }>;
  /** Motivos de impedimento (glpi_plugin_vistomap_recusas, categoria
   *  impedimento) no período — mesma fonte de topMunicipiosPeriodo.impedimento,
   *  agora agrupado por motivo em vez de município. */
  motivosImpedimento: Array<{ label: string; total: number }>;
}

function isoDaysAgo(d: number): string {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString().slice(0, 10);
}

/** Haversine — distância em km entre 2 coords. */
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Todas as datas YYYY-MM-DD entre `inicio` e `fim`, ambos inclusive. */
function eachDateInclusive(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${inicio}T00:00:00Z`);
  const end = new Date(`${fim}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function fetchHistoricoAnalytics(
  /** Início do período real (agregados, ranking, km, motivos), YYYY-MM-DD. */
  inicio: string,
  /** Fim do período real, YYYY-MM-DD inclusive. Default: hoje. */
  fim: string = isoDaysAgo(0),
  /**
   * Início alternativo, SÓ pra `serieDiaria` — por padrão igual a `inicio`,
   * mas o dashboard manda uma data mais antiga aqui quando também precisa
   * de uma janela anterior pra calcular variação % (Widget de Vistorias
   * Finalizadas): a série cobre `inicioSerie..fim` completo, mas
   * totais/taxas/médias/ranking/km/motivos só refletem `inicio..fim`, o
   * período de fato selecionado (2026-09-15 — filtro de período único do
   * dashboard, com Hoje/7 dias/30 dias/Personalizado).
   */
  inicioSerie: string = inicio,
  /** Filtro global do dashboard (2026-09-24) — label exato (ex.: "CPFL Paulista"); omitido/"" = Tudo. */
  concessionaria?: string,
  /** Filtro global de Município (2026-09-25), mesmo alcance de `concessionaria` — omitido/"" = Todos. Não aplicado nos rankings QUE JÁ SÃO por município (topMunicipios/topMunicipiosPeriodo) nem nas contagens de "atribuídas" (audit log sem join a município, mesmo recorte que concessionaria já deixava de fora). */
  municipio?: string
): Promise<HistoricoAnalytics> {
  const concJoin = concessionaria
    ? `INNER JOIN \`${TABLE_CONCESSIONARIA}\` conc ON conc.id = f.\`${CONCESSIONARIA_COLUMN}\``
    : "";
  const concWhere = concessionaria ? "AND conc.name = ?" : "";
  const concParams = concessionaria ? [concessionaria] : [];
  const muniWhere = municipio ? "AND TRIM(f.municipiofield) = ?" : "";
  const muniParams = municipio ? [municipio] : [];

  /* ── Séries diárias ─────────────────────────────────────────── */
  // Conta por dia agrupando por status name.
  const serieRows = await query<{
    dia: string;
    status_name: string | null;
    situacao_id: number | null;
    total: number;
  }>(
    `
      SELECT DATE(f.datadavistoriafield) AS dia,
             sv.name AS status_name,
             f.\`${SITUACAO_COLUMN}\` AS situacao_id,
             COUNT(*) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        ${concJoin}
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
         ${concWhere}
         ${muniWhere}
       GROUP BY DATE(f.datadavistoriafield), sv.name, f.\`${SITUACAO_COLUMN}\`
       ORDER BY dia
    `,
    [inicioSerie, fim, ...concParams, ...muniParams]
  );

  // Atribuídas por dia (audit log) — mesma fonte/critério de `atribRow`
  // abaixo (não filtra por concessionária, igual o total já não filtrava —
  // manter os dois consistentes entre si).
  const atribDiariaRows = await query<{ dia: string; total: number }>(
    `
      SELECT DATE(ts) AS dia, COUNT(*) AS total
        FROM glpi_plugin_vistomap_audit
       WHERE acao = 'vistoria-atribuida'
         AND DATE(ts) >= ?
         AND DATE(ts) <= ?
       GROUP BY DATE(ts)
    `,
    [inicioSerie, fim]
  );

  // Constrói série dia-a-dia (preenche dias faltantes com 0).
  const diasMap = new Map<
    string,
    {
      finalizadas: number;
      aprovadas: number;
      aprovadasSemPendencia: number;
      aprovadasComPendencia: number;
      reprovadas: number;
      atribuidas: number;
    }
  >();
  for (const dia of eachDateInclusive(inicioSerie, fim)) {
    diasMap.set(dia, {
      finalizadas: 0,
      aprovadas: 0,
      aprovadasSemPendencia: 0,
      aprovadasComPendencia: 0,
      reprovadas: 0,
      atribuidas: 0,
    });
  }
  for (const r of atribDiariaRows) {
    const ref = diasMap.get(r.dia);
    if (ref) ref.atribuidas = Number(r.total) || 0;
  }
  for (const r of serieRows) {
    const ref = diasMap.get(r.dia);
    if (!ref) continue;
    const s = (r.status_name ?? "").toLowerCase();
    const situacaoConcluida = Number(r.situacao_id ?? 0) === 3 || Number(r.situacao_id ?? 0) === 6;
    if (
      situacaoConcluida ||
      s === "em análise" ||
      s === "em analise" ||
      s === "finalizada" ||
      s === "finalizado" ||
      s === "aprovada" ||
      s === "aprovado"
    ) {
      ref.finalizadas += Number(r.total) || 0;
    }
    if (s === "aprovada" || s === "aprovado" || s === "aprovado com pendências") ref.aprovadas += Number(r.total) || 0;
    if (s === "aprovada" || s === "aprovado") ref.aprovadasSemPendencia += Number(r.total) || 0;
    if (s === "aprovado com pendências") ref.aprovadasComPendencia += Number(r.total) || 0;
    if (s === "reprovada" || s === "reprovado") ref.reprovadas += Number(r.total) || 0;
  }
  const serieDiaria = Array.from(diasMap.entries()).map(([dia, v]) => ({
    dia,
    finalizadas: v.finalizadas,
    aprovadas: v.aprovadas,
    aprovadasSemPendencia: v.aprovadasSemPendencia,
    aprovadasComPendencia: v.aprovadasComPendencia,
    reprovadas: v.reprovadas,
    atribuidas: v.atribuidas,
  }));

  /* ── Totais agregados ───────────────────────────────────────── */
  const [agg] = await query<{
    finalizadas: number;
    aprovadas: number;
    reprovadas: number;
    revisitas_finalizadas: number;
    pdfs: number;
  }>(
    `
      SELECT
        SUM(CASE WHEN ${SITUACAO_CONCLUIDA_SQL} OR sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado') THEN 1 ELSE 0 END) AS finalizadas,
        SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado','Aprovado com Pendências') THEN 1 ELSE 0 END) AS aprovadas,
        SUM(CASE WHEN sv.name IN ('Reprovada','Reprovado') THEN 1 ELSE 0 END) AS reprovadas,
        SUM(CASE WHEN (${SITUACAO_CONCLUIDA_SQL} OR sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado'))
                  AND COALESCE(aux.is_repeat,0) = 1 THEN 1 ELSE 0 END) AS revisitas_finalizadas,
        SUM(CASE WHEN aux.project_status = 'GERADO' THEN 1 ELSE 0 END) AS pdfs
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
        ${concJoin}
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
         ${concWhere}
         ${muniWhere}
    `,
    [inicio, fim, ...concParams, ...muniParams]
  );

  const finalizadas = Number(agg?.finalizadas ?? 0);
  const aprovadas = Number(agg?.aprovadas ?? 0);
  const reprovadas = Number(agg?.reprovadas ?? 0);
  const revisitasFinalizadas = Number(agg?.revisitas_finalizadas ?? 0);
  const pdfsGerados = Number(agg?.pdfs ?? 0);

  /* ── Top municípios ─────────────────────────────────────────────────────
     `total` = TODAS as vistorias do município (qualquer situação, sem
     recorte de data) — o tamanho real da frente de trabalho. `concluidas` =
     quantas dessas já têm data de vistoria preenchida (finalizada). O
     percentual exibido no painel é concluidas/total — progresso real, não
     "fatia dentre os 10 maiores" (que sempre somava 100% e enganava,
     mostrando o maior município como se estivesse "100% completo"). */
  const muniRows = await query<{ municipio: string; total: number; concluidas: number }>(
    `
      SELECT TRIM(f.municipiofield) AS municipio,
             COUNT(*) AS total,
             SUM(CASE WHEN f.datadavistoriafield IS NOT NULL THEN 1 ELSE 0 END) AS concluidas
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
       WHERE f.municipiofield IS NOT NULL
         AND TRIM(f.municipiofield) <> ''
       GROUP BY TRIM(f.municipiofield)
      HAVING concluidas >= 1
       ORDER BY concluidas DESC
       LIMIT 10
    `
  );

  /* ── Top municípios — snapshot geral do inventário (não mais por período)
     ─────────────────────────────────────────────────────────────────────
     Histórico da confusão (pra não repetir): esta query já foi "período
     filtrado por datadavistoriafield" de duas formas diferentes (achado
     2026-09-18, depois um filtro extra de situação em 2026-09-22) — as
     duas erradas pro mesmo motivo. Achado 2026-09-22 (Campinas): o
     município tem 760 equipamentos cadastrados, mas qualquer recorte por
     data de vistoria mostra só uma fração (36, 322 no all-time, etc.) —
     porque a maioria ainda não foi vistoriada nenhuma vez (sem
     datadavistoriafield). "Total" aqui É o tamanho real do inventário do
     município (igual `muniRows`/`topMunicipios` acima), não uma contagem
     de atividade num recorte de tempo. `aprovado`/`aprovadoComPendencia`/
     `reprovado` são o STATUS ATUAL de todo o inventário (não só quem teve
     atividade recente); `pendente` (calculado no client, residual) cobre
     tanto quem nunca foi vistoriado quanto quem está em revisita/análise.
     Por isso não recebe `inicio`/`fim` — o filtro "Todo Período" da tela
     não afeta mais este ranking/mapa, só os indicadores e a evolução
     (que continuam por período, ver `agg`/`serieDiaria` acima). LIMIT 50
     (não 10, como `muniRows`) — o universo real hoje é 43 municípios no
     total (conferido 2026-09-24); com o filtro de Concessionária, CPFL
     Paulista sozinha já tem 30 — um LIMIT 20 cortava município de quem
     tem mais operação, bem o oposto do que "Padrão Diário" deveria
     mostrar (todos que tiveram movimentação, em ordem). */
  const muniPeriodoRows = await query<{
    municipio: string;
    concluidas: number;
    aprovado: number;
    aprovadoComPendencia: number;
    reprovado: number;
  }>(
    `
      SELECT TRIM(f.municipiofield) AS municipio,
             COUNT(*) AS concluidas,
             SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado') THEN 1 ELSE 0 END) AS aprovado,
             SUM(CASE WHEN sv.name = 'Aprovado com Pendências' THEN 1 ELSE 0 END) AS aprovadoComPendencia,
             SUM(CASE WHEN sv.name IN ('Reprovada','Reprovado') THEN 1 ELSE 0 END) AS reprovado
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        ${concJoin}
       WHERE f.municipiofield IS NOT NULL
         AND TRIM(f.municipiofield) <> ''
         ${concWhere}
       GROUP BY TRIM(f.municipiofield)
       ORDER BY concluidas DESC
       LIMIT 50
    `,
    concParams
  );

  /* ── Vistorias ATRIBUÍDAS no período — pedido 2026-09-18, "tem que
     entrar no filtro também": conta pelo audit log (mesmo padrão de
     topTecnicosDashboard.ts/painel.ts), não pelo estado atual do
     equipamento — uma vistoria atribuída e depois reatribuída/concluída
     dentro do período ainda conta como "atribuída nesse período". Vem
     acompanhada do total do período EQUIVALENTE anterior (mesmo tamanho
     de janela, imediatamente antes de `inicio`), pra dar a variação %. */
  const diasPeriodo = Math.max(1, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000) + 1);
  const inicioAnteriorDate = new Date(inicio);
  inicioAnteriorDate.setUTCDate(inicioAnteriorDate.getUTCDate() - diasPeriodo);
  const fimAnteriorDate = new Date(inicio);
  fimAnteriorDate.setUTCDate(fimAnteriorDate.getUTCDate() - 1);
  const inicioAnterior = inicioAnteriorDate.toISOString().slice(0, 10);
  const fimAnterior = fimAnteriorDate.toISOString().slice(0, 10);

  const [atribRow] = await query<{ atual: number; anterior: number }>(
    `
      SELECT
        SUM(CASE WHEN DATE(ts) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS atual,
        SUM(CASE WHEN DATE(ts) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS anterior
        FROM glpi_plugin_vistomap_audit
       WHERE acao = 'vistoria-atribuida'
         AND DATE(ts) BETWEEN ? AND ?
    `,
    [inicio, fim, inicioAnterior, fimAnterior, inicioAnterior, fim]
  );
  const atribuidasPeriodo = Number(atribRow?.atual ?? 0);
  const atribuidasPeriodoAnterior = Number(atribRow?.anterior ?? 0);

  /* ── Reprovadas no período ANTERIOR equivalente — mesmo padrão acima,
     pro delta % do KPI Reprovadas (2026-09-25). Mesmo critério de `agg`
     (datadavistoriafield + status name), respeitando concessionária. */
  const [reprovAnteriorRow] = await query<{ total: number }>(
    `
      SELECT SUM(CASE WHEN sv.name IN ('Reprovada','Reprovado') THEN 1 ELSE 0 END) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        ${concJoin}
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
         ${concWhere}
         ${muniWhere}
    `,
    [inicioAnterior, fimAnterior, ...concParams, ...muniParams]
  );
  const reprovadasPeriodoAnterior = Number(reprovAnteriorRow?.total ?? 0);

  /* ── Impedidos/Recusadas por município no período — pedido 2026-09-18
     ("status por município... impedidos, recusadas"). Fonte é OUTRO
     sistema (glpi_plugin_vistomap_recusas, não o status de vistoria), por
     isso é uma agregação à parte, não uma coluna a mais na tabela de
     status. Mesma regra já documentada em recusas.ts: só conta
     PENDENTE+APROVADO (REPROVADO volta pro técnico, não é um impedimento/
     recusa "de verdade"). Categoria decidida pelo analista quando existe;
     cai no palpite automático (RECUSA_MOTIVO_CATEGORIA) enquanto ainda não
     foi decidida — mesma regra de recusas.ts. */
  const recusaRows = await query<{
    municipio: string | null;
    motivo: string;
    categoria: RecusaCategoria | null;
    criado_em: string;
    resolvido_em: string | null;
  }>(
    `
      SELECT TRIM(f.municipiofield) AS municipio, r.motivo, r.categoria, r.criado_em, r.resolvido_em
        FROM glpi_plugin_vistomap_recusas r
        INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = r.vistoria_id
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        ${concJoin}
       WHERE r.status IN ('PENDENTE', 'APROVADO')
         AND DATE(r.criado_em) >= ?
         AND DATE(r.criado_em) <= ?
         ${concWhere}
         ${muniWhere}
    `,
    [inicio, fim, ...concParams, ...muniParams]
  );

  /* ── Tempo médio de Impedimento (minutos) — criado_em→resolvido_em das
     linhas de categoria impedimento já buscadas acima (2026-09-25, pra
     "Tempo médio por status" da Análise Operacional). null sem amostra. */
  const impedimentoDuracoes: number[] = [];
  for (const r of recusaRows) {
    const categoria: RecusaCategoria =
      r.categoria ?? RECUSA_MOTIVO_CATEGORIA[r.motivo as RecusaMotivo] ?? "recusa";
    if (categoria !== "impedimento" || !r.resolvido_em) continue;
    const min = (new Date(r.resolvido_em).getTime() - new Date(r.criado_em).getTime()) / 60000;
    if (min >= 0 && min <= 10_080) impedimentoDuracoes.push(min); // teto de 7 dias — descarta outlier absurdo
  }
  const impedimentoMedioMin =
    impedimentoDuracoes.length > 0
      ? Math.round(impedimentoDuracoes.reduce((a, b) => a + b, 0) / impedimentoDuracoes.length)
      : null;
  const municipiosImpedimentosMap = new Map<string, { impedimento: number; recusa: number }>();
  for (const r of recusaRows) {
    const municipio = (r.municipio ?? "").trim();
    if (!municipio) continue;
    const categoria: RecusaCategoria =
      r.categoria ?? RECUSA_MOTIVO_CATEGORIA[r.motivo as RecusaMotivo] ?? "recusa";
    const ref = municipiosImpedimentosMap.get(municipio) ?? { impedimento: 0, recusa: 0 };
    ref[categoria]++;
    municipiosImpedimentosMap.set(municipio, ref);
  }

  // Mesmas linhas de recusaRows, agora agrupadas por motivo (só categoria
  // impedimento) — alimenta o painel "Motivos de Impedimentos" do dashboard,
  // pedido pra sempre seguir o filtro de período central (achado em campo
  // 2026-09-23: o resto da seção usa período, esse painel não podia ser
  // diferente).
  const motivosImpedimentoMap = new Map<string, number>();
  for (const r of recusaRows) {
    const categoria: RecusaCategoria =
      r.categoria ?? RECUSA_MOTIVO_CATEGORIA[r.motivo as RecusaMotivo] ?? "recusa";
    if (categoria !== "impedimento") continue;
    const label = RECUSA_MOTIVO_LABEL[r.motivo as RecusaMotivo] ?? r.motivo;
    motivosImpedimentoMap.set(label, (motivosImpedimentoMap.get(label) ?? 0) + 1);
  }
  const motivosImpedimento = [...motivosImpedimentoMap.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);

  /* ── Últimas vistorias (feed "em tempo real") — pedido 2026-09-18.
     Combina DUAS fontes de horário real (nenhuma inventada):
     - audit log (vistoria-finalizada / recusa-aprovada) — timestamp
       preciso, gravado pelo próprio VistoMap;
     - `ne.date_mod` (nativo do GLPI, mantido pelo framework a cada save)
       pras decisões da concessionária (Aprovado/Aprovado com Pendências/
       Reprovado) — a decisão em si não passa pelo audit log do VistoMap
       (é a concessionária mexendo direto no GLPI), mas o próprio GLPI já
       registra QUANDO o registro foi salvo pela última vez. Confirmado em
       produção: date_mod fica dias/semanas depois da data da vistoria,
       não colado nela — é a gravação da decisão, não a visita.
     As duas listas são mescladas e ordenadas por horário só depois de
     buscadas (não dá pra fazer isso em SQL across 2 fontes tão
     diferentes sem complicar demais). */
  const atividadeAuditRows = await query<{
    ts: string;
    acao: string;
    categoria: RecusaCategoria | null;
    equipamento: string;
    municipio: string | null;
    vistoria_id: number | null;
    tecnico_name: string | null;
    tecnico_firstname: string | null;
    tecnico_realname: string | null;
  }>(
    `
      SELECT a.ts, a.acao, a.categoria, a.alvo_label AS equipamento,
             TRIM(f.municipiofield) AS municipio, f.items_id AS vistoria_id,
             u.name AS tecnico_name, u.firstname AS tecnico_firstname, u.realname AS tecnico_realname
        FROM glpi_plugin_vistomap_audit a
        LEFT JOIN \`${TABLE_FIELDS}\` f ON f.items_id = CAST(a.alvo_id AS UNSIGNED)
        LEFT JOIN \`${TABLE_USERS}\` u ON u.id = f.users_id_vistoriadorafield
       WHERE a.acao IN ('vistoria-finalizada', 'recusa-aprovada')
         AND DATE(a.ts) >= ?
         AND DATE(a.ts) <= ?
       ORDER BY a.ts DESC
       LIMIT 30
    `,
    [inicio, fim]
  );
  const atividadeDecisaoRows = await query<{
    ts: string;
    status_name: string;
    equipamento: string;
    municipio: string | null;
    vistoria_id: number;
    tecnico_name: string | null;
    tecnico_firstname: string | null;
    tecnico_realname: string | null;
    motivo_cpfl: string | null;
    descricao_detalhada_cpfl: string | null;
    motivo_legado: string | null;
  }>(
    `
      SELECT ne.date_mod AS ts, sv.name AS status_name, ne.name AS equipamento,
             TRIM(f.municipiofield) AS municipio, ne.id AS vistoria_id,
             u.name AS tecnico_name, u.firstname AS tecnico_firstname, u.realname AS tecnico_realname,
             mr.name AS motivo_cpfl, f.\`${DESCRICAO_DETALHADA_CPFL_COLUMN}\` AS descricao_detalhada_cpfl,
             f.motivofield AS motivo_legado
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_USERS}\` u ON u.id = f.users_id_vistoriadorafield
        LEFT JOIN \`${TABLE_MOTIVO_REPROVACAO_CPFL}\` mr
                ON mr.id = f.\`${MOTIVO_REPROVACAO_CPFL_COLUMN}\`
       WHERE sv.name IN ('Aprovado', 'Aprovada', 'Aprovado com Pendências', 'Reprovado', 'Reprovada')
         AND DATE(ne.date_mod) >= ?
         AND DATE(ne.date_mod) <= ?
       ORDER BY ne.date_mod DESC
       LIMIT 30
    `,
    [inicio, fim]
  );
  type AtividadeStatus = "Vistoriada" | "Impedida" | "Recusada" | "Aprovada" | "Aprovado com Pendência" | "Reprovada";
  interface AtividadeRow {
    ts: string;
    status: AtividadeStatus;
    equipamento: string;
    municipio: string | null;
    vistoriaId: number | null;
    tecnico: string | null;
    motivo: string | null;
  }
  const nomeTecnico = (r: { tecnico_name: string | null; tecnico_firstname: string | null; tecnico_realname: string | null }): string | null =>
    `${r.tecnico_firstname ?? ""} ${r.tecnico_realname ?? ""}`.trim() || r.tecnico_name || null;
  const atividadeRecente: AtividadeRow[] = [];
  for (const r of atividadeAuditRows) {
    if (r.acao === "vistoria-finalizada") {
      atividadeRecente.push({ ts: r.ts, status: "Vistoriada", equipamento: r.equipamento, municipio: r.municipio, vistoriaId: r.vistoria_id, tecnico: nomeTecnico(r), motivo: null });
    } else if (r.acao === "recusa-aprovada") {
      atividadeRecente.push({
        ts: r.ts,
        status: r.categoria === "impedimento" ? "Impedida" : "Recusada",
        equipamento: r.equipamento,
        municipio: r.municipio,
        vistoriaId: r.vistoria_id,
        tecnico: nomeTecnico(r),
        motivo: null,
      });
    }
  }
  for (const r of atividadeDecisaoRows) {
    const status: AtividadeStatus =
      r.status_name === "Reprovado" || r.status_name === "Reprovada" ? "Reprovada"
      : r.status_name === "Aprovado com Pendências" ? "Aprovado com Pendência"
      : "Aprovada";
    atividadeRecente.push({
      ts: r.ts,
      status,
      equipamento: r.equipamento,
      municipio: r.municipio,
      vistoriaId: r.vistoria_id,
      tecnico: nomeTecnico(r),
      motivo: status === "Reprovada" ? composeMotivoReprovacaoCpfl(r.motivo_cpfl, r.descricao_detalhada_cpfl, r.motivo_legado) : null,
    });
  }
  atividadeRecente.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const atividadeRecenteTop10 = atividadeRecente.slice(0, 10);

  /* ── Tempo em campo de cada linha do feed acima — mesmo par
     iniciada→finalizada usado no SLA de execução (2026-09-25), buscado só
     pros itens que de fato aparecem no feed (poucos, não vale generalizar
     pra todo o período aqui). */
  const idsFeed = [...new Set(atividadeRecenteTop10.map((r) => r.vistoriaId).filter((id): id is number => id != null))];
  const tempoEmCampoPorId = new Map<number, number>();
  if (idsFeed.length > 0) {
    const placeholders = idsFeed.map(() => "?").join(",");
    const feedTempoRows = await query<{ alvo_id: string; t_ini: string | null; t_fim: string | null }>(
      `
        SELECT alvo_id,
               MAX(CASE WHEN acao = 'vistoria-iniciada'   THEN ts END) AS t_ini,
               MAX(CASE WHEN acao = 'vistoria-finalizada' THEN ts END) AS t_fim
          FROM glpi_plugin_vistomap_audit
         WHERE acao IN ('vistoria-iniciada','vistoria-finalizada')
           AND alvo_id IN (${placeholders})
         GROUP BY alvo_id
      `,
      idsFeed.map(String)
    );
    for (const r of feedTempoRows) {
      if (!r.t_ini || !r.t_fim) continue;
      const min = Math.round((new Date(r.t_fim).getTime() - new Date(r.t_ini).getTime()) / 60000);
      if (min >= 0 && min <= 600) tempoEmCampoPorId.set(Number(r.alvo_id), min);
    }
  }
  const atividadeRecenteTop = atividadeRecenteTop10.map((r) => ({
    ts: r.ts,
    status: r.status,
    equipamento: r.equipamento,
    municipio: r.municipio,
    tecnico: r.tecnico,
    motivo: r.motivo,
    tempoEmCampoMin: r.vistoriaId != null ? tempoEmCampoPorId.get(r.vistoriaId) ?? null : null,
  }));

  /* ── Ranking técnicos ──────────────────────────────────────── */
  // LEFT JOIN de propósito (era INNER): um técnico purgado do GLPI (ver
  // usuariosRemovidos.ts) sumia do ranking por completo, mesmo tendo
  // vistorias reais no período — não só sem nome, o trabalho dele
  // desaparecia da estatística inteira. Agrupa por
  // users_id_vistoriadorafield (sempre presente) em vez de u.id (nulo
  // quando o usuário não existe mais).
  const tecRows = await query<{
    tecnico_id: number;
    id: number | null;
    name: string | null;
    firstname: string | null;
    realname: string | null;
    total: number;
    aprovadas: number;
    revisitas: number;
    cidades: number;
  }>(
    `
      SELECT f.users_id_vistoriadorafield AS tecnico_id,
             u.id, u.name, u.firstname, u.realname,
             COUNT(*) AS total,
             SUM(CASE WHEN sv.name IN ('Aprovada','Aprovado','Aprovado com Pendências') THEN 1 ELSE 0 END) AS aprovadas,
             SUM(CASE WHEN COALESCE(aux.is_repeat,0) = 1 THEN 1 ELSE 0 END) AS revisitas,
             COUNT(DISTINCT TRIM(f.municipiofield)) AS cidades
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN glpi_users u ON u.id = f.users_id_vistoriadorafield
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
         AND f.users_id_vistoriadorafield > 0
         AND (${SITUACAO_CONCLUIDA_SQL} OR sv.name IN ('Em análise','Em analise','Finalizada','Finalizado','Aprovada','Aprovado'))
       GROUP BY f.users_id_vistoriadorafield
       ORDER BY total DESC
       LIMIT 50
    `,
    [inicio, fim]
  );

  /* ── Km percorrido — Haversine sobre pings GPS ─────────────── */
  // Tabela de locations pode não existir ainda; silenciamos falha.
  let kmTotal = 0;
  const kmPorTecnico = new Map<number, number>();
  try {
    const gpsRows = await query<{
      users_id: number;
      latitude: number | string;
      longitude: number | string;
      created_at: string;
    }>(
      `
        SELECT users_id, latitude, longitude, created_at
          FROM glpi_plugin_vistomap_locations
         WHERE DATE(created_at) >= ?
           AND DATE(created_at) <= ?
         ORDER BY users_id, created_at
      `,
      [inicio, fim]
    );
    // Soma distâncias entre pings consecutivos do mesmo técnico.
    let prevUser: number | null = null;
    let prevCoord: { lat: number; lng: number } | null = null;
    for (const g of gpsRows) {
      const lat = Number(g.latitude);
      const lng = Number(g.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (prevUser === g.users_id && prevCoord) {
        const d = haversineKm(prevCoord, { lat, lng });
        // Filtro: ignora "saltos" > 5km entre pings (provável GPS drift / cold start).
        if (d < 5) {
          kmTotal += d;
          kmPorTecnico.set(g.users_id, (kmPorTecnico.get(g.users_id) ?? 0) + d);
        }
      }
      prevUser = g.users_id;
      prevCoord = { lat, lng };
    }
  } catch {
    // tabela ausente — kmTotal fica 0
  }

  /* ── Métricas de tempo por técnico (via auditoria) ──────────────────
     Cruza, por vistoria, os eventos Em Deslocamento → Iniciada → Finalizada
     e agrega médias por ator (técnico).
       • tempo de deslocamento = iniciada − em-deslocamento
       • SLA de execução       = finalizada − iniciada                      */
  const tempoMap = new Map<number, { desloc: number[]; sla: number[] }>();
  try {
    const evRows = await query<{
      alvo_id: string;
      ator_id: number;
      t_desloc: string | null;
      t_ini: string | null;
      t_fim: string | null;
    }>(
      `
        SELECT alvo_id,
               MAX(CASE WHEN acao IN ('vistoria-iniciada','vistoria-finalizada') THEN ator_id END) AS ator_id,
               MAX(CASE WHEN acao = 'vistoria-em-deslocamento' THEN ts END) AS t_desloc,
               MAX(CASE WHEN acao = 'vistoria-iniciada'        THEN ts END) AS t_ini,
               MAX(CASE WHEN acao = 'vistoria-finalizada'      THEN ts END) AS t_fim
          FROM glpi_plugin_vistomap_audit
         WHERE acao IN ('vistoria-em-deslocamento','vistoria-iniciada','vistoria-finalizada')
           AND ts >= ?
           AND ts < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY alvo_id
      `,
      [inicio, fim]
    );
    for (const r of evRows) {
      const ator = Number(r.ator_id) || 0;
      if (!ator) continue;
      const bucket = tempoMap.get(ator) ?? { desloc: [], sla: [] };
      if (r.t_desloc && r.t_ini) {
        const d = (new Date(r.t_ini).getTime() - new Date(r.t_desloc).getTime()) / 60000;
        if (d >= 0 && d <= 600) bucket.desloc.push(d); // ignora outliers > 10h
      }
      if (r.t_ini && r.t_fim) {
        const s = (new Date(r.t_fim).getTime() - new Date(r.t_ini).getTime()) / 60000;
        if (s >= 0 && s <= 600) bucket.sla.push(s);
      }
      tempoMap.set(ator, bucket);
    }
  } catch {
    // tabela de auditoria ausente — métricas ficam nulas
  }
  const mediaMin = (arr: number[]): number | null =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  // Técnico purgado do GLPI (u.id nulo, ver LEFT JOIN acima) — recupera o
  // nome do histórico em vez de deixar o ranking sem nome nenhum.
  const idsSemCadastroRanking = tecRows
    .filter((r) => r.id == null)
    .map((r) => Number(r.tecnico_id));
  const nomesRecuperadosRanking = await nomesDeUsuariosRemovidos(idsSemCadastroRanking);

  const rankingTecnicos = tecRows.map((r) => ({
    id: r.tecnico_id,
    nome:
      r.id == null
        ? nomesRecuperadosRanking.get(r.tecnico_id) ?? "Técnico desligado"
        : `${r.firstname ?? ""} ${r.realname ?? ""}`.trim() || r.name || "—",
    total: Number(r.total) || 0,
    aprovadas: Number(r.aprovadas) || 0,
    revisitas: Number(r.revisitas) || 0,
    cidades: Number(r.cidades) || 0,
    kmPercorrido:
      kmPorTecnico.get(r.tecnico_id) != null
        ? Math.round((kmPorTecnico.get(r.tecnico_id) ?? 0) * 10) / 10
        : undefined,
    tempoDeslocamentoMedioMin: mediaMin(tempoMap.get(r.tecnico_id)?.desloc ?? []),
    slaExecucaoMedioMin: mediaMin(tempoMap.get(r.tecnico_id)?.sla ?? []),
  }));

  /* ── Motivos de reprovação ─────────────────────────────────────
     Agrupa direto pelo dropdown "Motivo de Reprovação CPFL" (campo GLPI
     Fields criado em 2026-09-24) — antes disso passava pelo classificador
     de texto livre (lib motivos.ts, keywords), necessário enquanto o único
     dado era motivofield (texto livre do técnico). Reprovações que ainda
     não têm o dropdown preenchido (antigas, ou decididas direto no GLPI
     nativo pela CPFL sem usar o campo novo) caem em "Não categorizado" —
     não somem do total, só não têm motivo específico ainda. */
  const motivosReprovacaoRows = await query<{ motivo: string; total: number }>(
    `
      SELECT COALESCE(mr.name, 'Não categorizado') AS motivo, COUNT(*) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
        LEFT JOIN \`${TABLE_MOTIVO_REPROVACAO_CPFL}\` mr
                ON mr.id = f.\`${MOTIVO_REPROVACAO_CPFL_COLUMN}\`
        ${concJoin}
       WHERE (
              sv.name IN ('Reprovada','Reprovado')
           OR COALESCE(aux.is_repeat, 0) = 1
         )
         AND (
              f.datadavistoriafield IS NULL
           OR (DATE(f.datadavistoriafield) >= ? AND DATE(f.datadavistoriafield) <= ?)
         )
         ${concWhere}
         ${muniWhere}
       GROUP BY COALESCE(mr.name, 'Não categorizado')
       ORDER BY total DESC
    `,
    [inicio, fim, ...concParams, ...muniParams]
  );
  const motivosReprovacao = motivosReprovacaoRows.map((r) => ({
    label: r.motivo,
    total: Number(r.total) || 0,
  }));

  /* ── Tempo médio por status (equipe toda) — 2026-09-25, Análise
     Operacional dos Técnicos. Reconstrói a mesma cadeia de eventos que já
     alimenta tempoDeslocamentoMedioMin/slaExecucaoMedioMin por técnico
     (mais abaixo), mas agregada pra equipe inteira e com um marco a mais
     (vistoria-em-vistoria = chegada no local, feito quando o técnico marca
     situação "Em Vistoria" — ver src/app/api/vistorias/[id]/situacao/
     route.ts): Em deslocamento = chegada−saída; Em vistoria = início−
     chegada; Realizada/Reprovada = fim−início, separadas pelo desfecho
     (Realizada inclui "Em análise", mesmo critério de "Em análise ≠ não
     realizada" já documentado em memória). */
  const statusDuracoes = {
    desloc: [] as number[],
    emVistoria: [] as number[],
    realizada: [] as number[],
    reprovada: [] as number[],
  };
  try {
    const stageRows = await query<{
      alvo_id: string;
      t_desloc: string | null;
      t_chegada: string | null;
      t_ini: string | null;
      t_fim: string | null;
      status_name: string | null;
    }>(
      `
        SELECT ev.alvo_id, ev.t_desloc, ev.t_chegada, ev.t_ini, ev.t_fim, sv.name AS status_name
          FROM (
            SELECT alvo_id,
                   MAX(CASE WHEN acao = 'vistoria-em-deslocamento' THEN ts END) AS t_desloc,
                   MAX(CASE WHEN acao = 'vistoria-em-vistoria'     THEN ts END) AS t_chegada,
                   MAX(CASE WHEN acao = 'vistoria-iniciada'        THEN ts END) AS t_ini,
                   MAX(CASE WHEN acao = 'vistoria-finalizada'      THEN ts END) AS t_fim
              FROM glpi_plugin_vistomap_audit
             WHERE acao IN ('vistoria-em-deslocamento','vistoria-em-vistoria','vistoria-iniciada','vistoria-finalizada')
               AND ts >= ? AND ts < DATE_ADD(?, INTERVAL 1 DAY)
             GROUP BY alvo_id
          ) ev
          LEFT JOIN \`${TABLE_FIELDS}\` f ON f.items_id = CAST(ev.alvo_id AS UNSIGNED)
          LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                 ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
          ${concJoin}
         WHERE 1=1
         ${concWhere}
         ${muniWhere}
      `,
      [inicio, fim, ...concParams, ...muniParams]
    );
    for (const r of stageRows) {
      if (r.t_desloc && r.t_chegada) {
        const d = (new Date(r.t_chegada).getTime() - new Date(r.t_desloc).getTime()) / 60000;
        if (d >= 0 && d <= 600) statusDuracoes.desloc.push(d);
      }
      if (r.t_chegada && r.t_ini) {
        const d = (new Date(r.t_ini).getTime() - new Date(r.t_chegada).getTime()) / 60000;
        if (d >= 0 && d <= 600) statusDuracoes.emVistoria.push(d);
      }
      if (r.t_ini && r.t_fim) {
        const d = (new Date(r.t_fim).getTime() - new Date(r.t_ini).getTime()) / 60000;
        if (d >= 0 && d <= 600) {
          const s = r.status_name ?? "";
          if (s === "Reprovada" || s === "Reprovado") statusDuracoes.reprovada.push(d);
          else statusDuracoes.realizada.push(d);
        }
      }
    }
  } catch {
    // tabela de auditoria ausente — buckets ficam vazios (médias saem null)
  }
  const mediaMinTeam = (arr: number[]): number | null =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const tempoMedioPorStatus = {
    realizadaMin: mediaMinTeam(statusDuracoes.realizada),
    emVistoriaMin: mediaMinTeam(statusDuracoes.emVistoria),
    emDeslocamentoMin: mediaMinTeam(statusDuracoes.desloc),
    impedimentoMin: impedimentoMedioMin,
    reprovadaMin: mediaMinTeam(statusDuracoes.reprovada),
  };

  /* ── Vistorias por hora do dia — 2026-09-25, toggle "Hora" de "Vistorias
     por período". Só horas com alguma atividade (não força 0-23 fixo). */
  const horaRows = await query<{ hora: number; total: number }>(
    `
      SELECT HOUR(f.datadavistoriafield) AS hora, COUNT(*) AS total
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        ${concJoin}
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
         ${concWhere}
         ${muniWhere}
       GROUP BY HOUR(f.datadavistoriafield)
       ORDER BY hora
    `,
    [inicio, fim, ...concParams, ...muniParams]
  );
  const vistoriasPorHora = horaRows.map((r) => ({ hora: Number(r.hora), total: Number(r.total) || 0 }));

  const aprovacaoPct = finalizadas > 0
    ? Math.round((aprovadas / finalizadas) * 100)
    : 0;
  const revisitaPct = finalizadas > 0
    ? Math.round((revisitasFinalizadas / finalizadas) * 100)
    : 0;
  const diasNoPeriodo = eachDateInclusive(inicio, fim).length;
  const diariaVistorias = Math.round(finalizadas / Math.max(diasNoPeriodo, 1));
  const semanalVistorias = Math.round(finalizadas / Math.max(diasNoPeriodo / 7, 1));

  return {
    periodo: { inicio, fim, dias: diasNoPeriodo },
    totais: {
      vistoriasFinalizadas: finalizadas,
      revisitasFinalizadas,
      aprovadas,
      reprovadas,
      pdfsGerados,
      atribuidas: atribuidasPeriodo,
      atribuidasPeriodoAnterior,
      reprovadasPeriodoAnterior,
    },
    taxas: { aprovacaoPct, revisitaPct },
    medias: { diariaVistorias, semanalVistorias },
    serieDiaria,
    topMunicipios: muniRows.map((r) => ({
      municipio: r.municipio,
      total: Number(r.total) || 0,
      concluidas: Number(r.concluidas) || 0,
    })),
    topMunicipiosPeriodo: muniPeriodoRows.map((r) => {
      const aprovado = Number(r.aprovado) || 0;
      const aprovadoComPendencia = Number(r.aprovadoComPendencia) || 0;
      const reprovado = Number(r.reprovado) || 0;
      const concluidas = Number(r.concluidas) || 0;
      const impedRecusa = municipiosImpedimentosMap.get(r.municipio) ?? { impedimento: 0, recusa: 0 };
      return {
        municipio: r.municipio,
        concluidas,
        aprovado: aprovado + aprovadoComPendencia,
        aprovadoComPendencia,
        pendente: Math.max(concluidas - aprovado - aprovadoComPendencia - reprovado, 0),
        reprovado,
        impedimento: impedRecusa.impedimento,
        recusa: impedRecusa.recusa,
      };
    }),
    atividadeRecente: atividadeRecenteTop,
    tempoMedioPorStatus,
    vistoriasPorHora,
    rankingTecnicos,
    kmOperacional: Math.round(kmTotal * 10) / 10,
    motivosReprovacao,
    motivosImpedimento,
  };
}
