import "server-only";
import { query } from "@/lib/db";
import {
  ITEMTYPE_NE,
  SITUACAO_COLUMN,
  TABLE_AUX,
  TABLE_FIELDS,
  TABLE_NE,
  TABLE_STATUS_VISTORIA,
} from "./constants";
import { nomesDeUsuariosRemovidos } from "./usuariosRemovidos";
import { RECUSA_MOTIVO_CATEGORIA, RECUSA_MOTIVO_LABEL, type RecusaCategoria, type RecusaMotivo } from "./recusaMotivos";

// situaodavistoriafield: 3=Vistoriado, 6=Revisitado — mesma prioridade 1 que
// resolveAdminStatus() já usa em painel.ts e que fetchVistoriasRealizadas()
// já cruza no WHERE. Sem isso aqui, vistorias concluídas só via situação
// nova (sem o dropdown legado `statusvistoria` preenchido) ficavam de fora
// das séries/ranking deste arquivo — divergindo do card "Concluídas" e de
// /painel/realizadas, que já consideravam essas vistorias.
const SITUACAO_CONCLUIDA_SQL = `f.\`${SITUACAO_COLUMN}\` IN (3, 6)`;
import { agregarMotivos, type MotivoAgregado } from "./motivos";

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
  }>;
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
  motivosReprovacao: MotivoAgregado[];
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
  inicioSerie: string = inicio
): Promise<HistoricoAnalytics> {
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
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
       GROUP BY DATE(f.datadavistoriafield), sv.name, f.\`${SITUACAO_COLUMN}\`
       ORDER BY dia
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
    }
  >();
  for (const dia of eachDateInclusive(inicioSerie, fim)) {
    diasMap.set(dia, {
      finalizadas: 0,
      aprovadas: 0,
      aprovadasSemPendencia: 0,
      aprovadasComPendencia: 0,
      reprovadas: 0,
    });
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
       WHERE f.datadavistoriafield IS NOT NULL
         AND DATE(f.datadavistoriafield) >= ?
         AND DATE(f.datadavistoriafield) <= ?
    `,
    [inicio, fim]
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
     (que continuam por período, ver `agg`/`serieDiaria` acima). LIMIT 20
     (não 10, como `muniRows`) — ajuda o mapa a enquadrar o cluster de
     atuação inteiro, não só o topo. */
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
       WHERE f.municipiofield IS NOT NULL
         AND TRIM(f.municipiofield) <> ''
       GROUP BY TRIM(f.municipiofield)
       ORDER BY concluidas DESC
       LIMIT 20
    `
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
  }>(
    `
      SELECT TRIM(f.municipiofield) AS municipio, r.motivo, r.categoria
        FROM glpi_plugin_vistomap_recusas r
        INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = r.vistoria_id
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
       WHERE r.status IN ('PENDENTE', 'APROVADO')
         AND DATE(r.criado_em) >= ?
         AND DATE(r.criado_em) <= ?
    `,
    [inicio, fim]
  );
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
  }>(
    `
      SELECT a.ts, a.acao, a.categoria, a.alvo_label AS equipamento,
             TRIM(f.municipiofield) AS municipio
        FROM glpi_plugin_vistomap_audit a
        LEFT JOIN \`${TABLE_FIELDS}\` f ON f.items_id = CAST(a.alvo_id AS UNSIGNED)
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
  }>(
    `
      SELECT ne.date_mod AS ts, sv.name AS status_name, ne.name AS equipamento,
             TRIM(f.municipiofield) AS municipio
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
       WHERE sv.name IN ('Aprovado', 'Aprovada', 'Aprovado com Pendências', 'Reprovado', 'Reprovada')
         AND DATE(ne.date_mod) >= ?
         AND DATE(ne.date_mod) <= ?
       ORDER BY ne.date_mod DESC
       LIMIT 30
    `,
    [inicio, fim]
  );
  type AtividadeStatus = "Vistoriada" | "Impedida" | "Recusada" | "Aprovada" | "Aprovado com Pendência" | "Reprovada";
  const atividadeRecente: Array<{ ts: string; status: AtividadeStatus; equipamento: string; municipio: string | null }> = [];
  for (const r of atividadeAuditRows) {
    if (r.acao === "vistoria-finalizada") {
      atividadeRecente.push({ ts: r.ts, status: "Vistoriada", equipamento: r.equipamento, municipio: r.municipio });
    } else if (r.acao === "recusa-aprovada") {
      atividadeRecente.push({
        ts: r.ts,
        status: r.categoria === "impedimento" ? "Impedida" : "Recusada",
        equipamento: r.equipamento,
        municipio: r.municipio,
      });
    }
  }
  for (const r of atividadeDecisaoRows) {
    const status: AtividadeStatus =
      r.status_name === "Reprovado" || r.status_name === "Reprovada" ? "Reprovada"
      : r.status_name === "Aprovado com Pendências" ? "Aprovado com Pendência"
      : "Aprovada";
    atividadeRecente.push({ ts: r.ts, status, equipamento: r.equipamento, municipio: r.municipio });
  }
  atividadeRecente.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const atividadeRecenteTop = atividadeRecente.slice(0, 10);

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

  /* ── Motivos de reprovação (classificados) ───────────────────── */
  // Coleta motivofield bruto de vistorias reprovadas no período +
  // de revisitas pendentes (is_repeat=1) — qualquer registro com motivo.
  // Classifica por keywords (lib motivos.ts) → distribuição %.
  const motivosRows = await query<{ motivo: string | null }>(
    `
      SELECT f.motivofield AS motivo
        FROM \`${TABLE_FIELDS}\` f
        INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
        LEFT JOIN \`${TABLE_STATUS_VISTORIA}\` sv
                ON sv.id = f.plugin_fields_statusvistoriafielddropdowns_id
        LEFT JOIN \`${TABLE_AUX}\` aux
                ON aux.items_id = ne.id AND aux.itemtype = '${ITEMTYPE_NE}'
       WHERE f.motivofield IS NOT NULL
         AND TRIM(f.motivofield) <> ''
         AND (
              sv.name IN ('Reprovada','Reprovado')
           OR COALESCE(aux.is_repeat, 0) = 1
         )
         AND (
              f.datadavistoriafield IS NULL
           OR (DATE(f.datadavistoriafield) >= ? AND DATE(f.datadavistoriafield) <= ?)
         )
       LIMIT 2000
    `,
    [inicio, fim]
  );
  const motivosReprovacao = agregarMotivos(motivosRows.map((r) => r.motivo));

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
    rankingTecnicos,
    kmOperacional: Math.round(kmTotal * 10) / 10,
    motivosReprovacao,
    motivosImpedimento,
  };
}
