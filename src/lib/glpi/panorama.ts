import "server-only";
import { query } from "@/lib/db";
import {
  SITUACAO_A_VISTORIAR,
  SITUACAO_AGUARDANDO_REVISITA,
  SITUACAO_COLUMN,
  SITUACAO_DEVOLVIDA,
  SITUACAO_EM_DESLOCAMENTO,
  SITUACAO_EM_REVISITA,
  SITUACAO_EM_VISTORIA,
  SITUACAO_REVISITADO,
  SITUACAO_VISTORIADO,
  STATUS_VISTORIA_APROVADO,
  STATUS_VISTORIA_APROVADO_COM_PENDENCIAS,
  STATUS_VISTORIA_EM_ANALISE,
  TABLE_FIELDS,
  TABLE_NE,
} from "./constants";
import type {
  PanoramaOperacao,
  PanoramaEtapaFunil,
  PanoramaFaixaIdade,
  PanoramaMunicipioRestante,
} from "@/types";

/**
 * Panorama da operação — a leitura que faltava no /painel.
 *
 * O dashboard antigo respondia "quantos tem em cada status agora". Mas a
 * operação de vistoria é um BURN-DOWN de um universo FINITO (todo o parque de
 * equipamentos já está cadastrado; ninguém cria demanda nova). A pergunta
 * gerencial de verdade é outra: quanto já andou, em que ritmo, e quando acaba.
 * Nada disso existia — nem em query, nem na tela.
 *
 * Tudo aqui é DERIVADO de dado real (situação do equipamento + audit log).
 * Onde não dá pra saber, devolve null e a UI mostra "—" — nunca um número
 * inventado pra preencher espaço.
 */

/** Faixas de idade do que ainda não foi vistoriado (dias desde o cadastro). */
const FAIXAS: Array<{ id: string; label: string; min: number; max: number | null }> = [
  { id: "0-30", label: "até 30 dias", min: 0, max: 30 },
  { id: "31-60", label: "31 a 60 dias", min: 31, max: 60 },
  { id: "61-90", label: "61 a 90 dias", min: 61, max: 90 },
  { id: "90+", label: "mais de 90 dias", min: 91, max: null },
];

/**
 * Etapas do funil, na ordem em que acontecem. Derivadas do audit log — é o
 * único lugar que registra a TRANSIÇÃO (a tabela de fields só guarda o estado
 * atual, então sem isso não dá pra saber quantas passaram por cada etapa nem
 * quanto tempo levaram entre uma e outra).
 */
const ETAPAS: Array<{ id: string; label: string }> = [
  { id: "atribuida", label: "Atribuída" },
  { id: "deslocamento", label: "Em deslocamento" },
  { id: "iniciada", label: "Iniciada" },
  { id: "finalizada", label: "Finalizada" },
];

function mediana(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? Math.round(s[m]) : Math.round((s[m - 1] + s[m]) / 2);
}

/** Soma dias a uma data ISO 'YYYY-MM-DD', devolvendo ISO. */
function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function fetchPanoramaOperacao(): Promise<PanoramaOperacao> {
  const SIT = SITUACAO_COLUMN;

  const [universoRows, idadeRows, serieRows, funilRows, retrabalhoRows, municipioRows] =
    await Promise.all([
      /* ── 1. Onde cada equipamento do universo está agora ──────────────── */
      query<{ situacao: number | null; status_id: number | null; total: number }>(
        `
        SELECT f.${SIT} AS situacao,
               f.plugin_fields_statusvistoriafielddropdowns_id AS status_id,
               COUNT(*) AS total
          FROM \`${TABLE_FIELDS}\` f
          INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
         GROUP BY situacao, status_id
      `
      ),

      /* ── 2. Idade do que ainda não foi vistoriado ─────────────────────── */
      query<{ dias: number | null; total: number }>(
        `
        SELECT DATEDIFF(NOW(), ne.date_creation) AS dias, COUNT(*) AS total
          FROM \`${TABLE_FIELDS}\` f
          INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
         WHERE COALESCE(f.${SIT}, 0) IN (0, ${SITUACAO_A_VISTORIAR})
         GROUP BY dias
      `
      ),

      /* ── 3. Série diária de finalizadas (90 dias) ─────────────────────── */
      query<{ dia: string; total: number }>(
        `
        SELECT DATE(ts) AS dia, COUNT(*) AS total
          FROM glpi_plugin_vistomap_audit
         WHERE acao = 'vistoria-finalizada'
           AND ts >= DATE_SUB(CURDATE(), INTERVAL 89 DAY)
         GROUP BY dia
         ORDER BY dia
      `
      ),

      /* ── 4. Funil: primeiro timestamp de cada etapa, por equipamento ──── */
      query<{
        alvo_id: string;
        t_atribuida: string | null;
        t_deslocamento: string | null;
        t_iniciada: string | null;
        t_finalizada: string | null;
      }>(
        `
        SELECT alvo_id,
               MIN(CASE WHEN acao = 'vistoria-atribuida'       THEN ts END) AS t_atribuida,
               MIN(CASE WHEN acao = 'vistoria-em-deslocamento' THEN ts END) AS t_deslocamento,
               MIN(CASE WHEN acao = 'vistoria-iniciada'        THEN ts END) AS t_iniciada,
               MIN(CASE WHEN acao = 'vistoria-finalizada'      THEN ts END) AS t_finalizada
          FROM glpi_plugin_vistomap_audit
         WHERE alvo_tipo = 'vistoria'
           AND acao IN ('vistoria-atribuida','vistoria-em-deslocamento','vistoria-iniciada','vistoria-finalizada')
         GROUP BY alvo_id
      `
      ),

      /* ── 5. Retrabalho de atribuição ──────────────────────────────────── */
      query<{ n_atribuicoes: number; equipamentos: number }>(
        `
        SELECT n_atribuicoes, COUNT(*) AS equipamentos FROM (
          SELECT alvo_id, COUNT(*) AS n_atribuicoes
            FROM glpi_plugin_vistomap_audit
           WHERE acao = 'vistoria-atribuida'
           GROUP BY alvo_id
        ) x
        GROUP BY n_atribuicoes
        ORDER BY n_atribuicoes
      `
      ),

      /* ── 6. O que FALTA, por município (o mapa atual só mostra o feito) ─ */
      query<{ municipio: string | null; restantes: number; idade_media: number | null }>(
        `
        SELECT TRIM(f.municipiofield) AS municipio,
               COUNT(*) AS restantes,
               ROUND(AVG(DATEDIFF(NOW(), ne.date_creation))) AS idade_media
          FROM \`${TABLE_FIELDS}\` f
          INNER JOIN \`${TABLE_NE}\` ne ON ne.id = f.items_id AND ne.is_deleted = 0
         WHERE COALESCE(f.${SIT}, 0) IN (0, ${SITUACAO_A_VISTORIAR})
           AND TRIM(COALESCE(f.municipiofield, '')) <> ''
         GROUP BY municipio
         ORDER BY restantes DESC
      `
      ),
    ]);

  /* ══ 1. Universo ═══════════════════════════════════════════════════════ */
  let total = 0;
  let naoIniciadas = 0;
  let emAndamento = 0;
  let aguardandoAprovacao = 0;
  let aprovadas = 0;
  let aprovadasComPendencia = 0;
  let emAnalise = 0;
  let emRevisita = 0;
  let devolvidas = 0;

  for (const r of universoRows) {
    const n = Number(r.total) || 0;
    const sit = Number(r.situacao ?? 0);
    const st = r.status_id == null ? null : Number(r.status_id);
    total += n;

    if (st === STATUS_VISTORIA_APROVADO) aprovadas += n;
    else if (st === STATUS_VISTORIA_APROVADO_COM_PENDENCIAS) aprovadasComPendencia += n;
    else if (st === STATUS_VISTORIA_EM_ANALISE) emAnalise += n;

    if (sit === 0 || sit === SITUACAO_A_VISTORIAR) naoIniciadas += n;
    else if (sit === SITUACAO_EM_VISTORIA || sit === SITUACAO_EM_DESLOCAMENTO) emAndamento += n;
    else if (sit === SITUACAO_EM_REVISITA || sit === SITUACAO_AGUARDANDO_REVISITA) emRevisita += n;
    else if (sit === SITUACAO_DEVOLVIDA) devolvidas += n;
    else if (sit === SITUACAO_VISTORIADO || sit === SITUACAO_REVISITADO) {
      // Vistoriado/Revisitado que ainda não virou decisão da concessionária.
      if (st !== STATUS_VISTORIA_APROVADO && st !== STATUS_VISTORIA_APROVADO_COM_PENDENCIAS) {
        aguardandoAprovacao += n;
      }
    }
  }
  const concluidas = total - naoIniciadas;

  /* ══ 2. Idade do backlog ═══════════════════════════════════════════════ */
  const faixas: PanoramaFaixaIdade[] = FAIXAS.map((f) => ({
    id: f.id,
    label: f.label,
    total: 0,
  }));
  let idadeSoma = 0;
  let idadeCount = 0;
  let idadeMax = 0;
  for (const r of idadeRows) {
    const dias = Number(r.dias ?? 0);
    const n = Number(r.total) || 0;
    idadeSoma += dias * n;
    idadeCount += n;
    if (dias > idadeMax) idadeMax = dias;
    const alvo = FAIXAS.find((f) => dias >= f.min && (f.max == null || dias <= f.max));
    if (alvo) {
      const slot = faixas.find((x) => x.id === alvo.id);
      if (slot) slot.total += n;
    }
  }
  const idadeMediaBacklog = idadeCount > 0 ? Math.round(idadeSoma / idadeCount) : null;

  /* ══ 3. Velocidade ═════════════════════════════════════════════════════ */
  const serieMap = new Map<string, number>();
  for (const r of serieRows) serieMap.set(String(r.dia), Number(r.total) || 0);

  const hoje = new Date();
  const serie: Array<{ dia: string; total: number }> = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    serie.push({ dia: iso, total: serieMap.get(iso) ?? 0 });
  }

  const somaUltimos = (n: number) => serie.slice(-n).reduce((acc, d) => acc + d.total, 0);
  const total7 = somaUltimos(7);
  const total30 = somaUltimos(30);
  const ritmoDia7 = total7 / 7;
  const ritmoDia30 = total30 / 30;

  // Ritmo por DIA TRABALHADO (dias com pelo menos 1 finalizada) — separa
  // "capacidade quando a equipe está em campo" de "ritmo no calendário".
  const diasAtivos30 = serie.slice(-30).filter((d) => d.total > 0).length;
  const ritmoDiaAtivo = diasAtivos30 > 0 ? total30 / diasAtivos30 : 0;

  const melhorDia = serie.reduce((best, d) => (d.total > best.total ? d : best), {
    dia: "",
    total: 0,
  });

  // Mês corrente x mês anterior — comparação que o gestor faz de cabeça.
  const mesAtualPrefix = hoje.toISOString().slice(0, 7);
  const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesAnteriorPrefix = mesAnteriorDate.toISOString().slice(0, 7);
  const totalMesAtual = serie
    .filter((d) => d.dia.startsWith(mesAtualPrefix))
    .reduce((a, d) => a + d.total, 0);
  const totalMesAnterior = serie
    .filter((d) => d.dia.startsWith(mesAnteriorPrefix))
    .reduce((a, d) => a + d.total, 0);

  /* ══ 4. Projeção ═══════════════════════════════════════════════════════ */
  // Duas projeções (ritmo de 7 e de 30 dias) em vez de uma só: a diferença
  // entre elas É a incerteza, e mostrar as duas é mais honesto do que escolher
  // uma e apresentar como certeza.
  const hojeIso = hoje.toISOString().slice(0, 10);
  const projetar = (ritmo: number) => {
    if (ritmo <= 0 || naoIniciadas <= 0) return null;
    const dias = Math.ceil(naoIniciadas / ritmo);
    return { dias, data: addDias(hojeIso, dias) };
  };
  const projecaoOtimista = projetar(ritmoDia7);
  const projecaoConservadora = projetar(ritmoDia30);

  /* ══ 5. Funil ══════════════════════════════════════════════════════════ */
  const duracoes: Record<string, number[]> = {
    deslocamento: [],
    iniciada: [],
    finalizada: [],
  };
  const alcance: Record<string, number> = {
    atribuida: 0,
    deslocamento: 0,
    iniciada: 0,
    finalizada: 0,
  };
  const minutosEntre = (a: string | null, b: string | null): number | null => {
    if (!a || !b) return null;
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const min = ms / 60000;
    // Corta outlier absurdo (> 30 dias): quase sempre é reatribuição de um
    // ciclo antigo casando com evento novo, não tempo real de operação.
    return min > 43200 ? null : min;
  };
  for (const r of funilRows) {
    if (r.t_atribuida) alcance.atribuida++;
    if (r.t_deslocamento) alcance.deslocamento++;
    if (r.t_iniciada) alcance.iniciada++;
    if (r.t_finalizada) alcance.finalizada++;

    const d1 = minutosEntre(r.t_atribuida, r.t_deslocamento);
    if (d1 != null) duracoes.deslocamento.push(d1);
    const d2 = minutosEntre(r.t_deslocamento, r.t_iniciada);
    if (d2 != null) duracoes.iniciada.push(d2);
    const d3 = minutosEntre(r.t_iniciada, r.t_finalizada);
    if (d3 != null) duracoes.finalizada.push(d3);
  }
  const funil: PanoramaEtapaFunil[] = ETAPAS.map((e, i) => ({
    id: e.id,
    label: e.label,
    total: alcance[e.id] ?? 0,
    // Mediana, não média: a média de tempo aqui é dominada por uns poucos
    // casos de dias parados e não descreve a operação típica.
    medianaMinDesdeAnterior: i === 0 ? null : mediana(duracoes[e.id] ?? []),
  }));

  /* ══ 6. Retrabalho ═════════════════════════════════════════════════════ */
  let equipUmaVez = 0;
  let equipReatribuidos = 0;
  let maxAtribuicoes = 0;
  let totalAtribuicoes = 0;
  for (const r of retrabalhoRows) {
    const n = Number(r.n_atribuicoes) || 0;
    const q = Number(r.equipamentos) || 0;
    totalAtribuicoes += n * q;
    if (n > maxAtribuicoes) maxAtribuicoes = n;
    if (n <= 1) equipUmaVez += q;
    else equipReatribuidos += q;
  }

  /* ══ 7. Municípios restantes ═══════════════════════════════════════════ */
  const municipiosRestantes: PanoramaMunicipioRestante[] = municipioRows.map((r) => ({
    municipio: String(r.municipio ?? "").trim(),
    restantes: Number(r.restantes) || 0,
    idadeMediaDias: r.idade_media == null ? null : Number(r.idade_media),
  }));

  return {
    universo: {
      total,
      naoIniciadas,
      emAndamento,
      aguardandoAprovacao,
      emAnalise,
      aprovadas,
      aprovadasComPendencia,
      emRevisita,
      devolvidas,
      concluidas,
      progressoPct: total > 0 ? (concluidas / total) * 100 : 0,
    },
    backlog: {
      total: naoIniciadas,
      faixas,
      idadeMediaDias: idadeMediaBacklog,
      idadeMaxDias: idadeMax || null,
    },
    velocidade: {
      serie,
      ritmoDia7: Math.round(ritmoDia7 * 10) / 10,
      ritmoDia30: Math.round(ritmoDia30 * 10) / 10,
      ritmoDiaAtivo: Math.round(ritmoDiaAtivo * 10) / 10,
      diasAtivos30,
      total7,
      total30,
      melhorDia: melhorDia.total > 0 ? melhorDia : null,
      totalMesAtual,
      totalMesAnterior,
    },
    projecao: {
      restantes: naoIniciadas,
      otimista: projecaoOtimista,
      conservadora: projecaoConservadora,
    },
    funil,
    retrabalho: {
      equipamentosAtribuidos: equipUmaVez + equipReatribuidos,
      equipamentosReatribuidos: equipReatribuidos,
      maxAtribuicoes,
      totalAtribuicoes,
    },
    municipiosRestantes,
    geradoEm: new Date().toISOString(),
  };
}
