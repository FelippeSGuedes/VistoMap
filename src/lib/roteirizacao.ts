import "server-only";
import { query } from "@/lib/db";
import { TABLE_FIELDS, TABLE_NE } from "@/lib/glpi/constants";
import { fetchRiscoChuva } from "@/lib/weather";
import { planejarDias, type ExpedienteJanela, type PernaCalculada } from "@/lib/roteirizacaoHorarios";

/**
 * Motor de roteirização/tempo pro agendamento de vistorias (painel) —
 * escrito pra ser reaproveitado depois pela Fase 2 (técnico organizando o
 * próprio dia), por isso fica em src/lib/ (não em glpi/) e não depende de
 * nada específico da rota de agendamento.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Parada extends LatLng {
  id: number;
}

export interface ParadaComHorario extends Parada {
  ordem: number;
  /** Dia (YYYY-MM-DD) em que a parada foi encaixada — pode ser depois da data pedida se o expediente não coube. */
  dia: string;
  novoDia: boolean;
  distanciaDesdeAnteriorM: number | null;
  duracaoPernaMin: number;
  chegadaPrevista: Date;
  saidaPrevista: Date;
  almocoAntes: boolean;
}

/** Ordem escolhida à mão pelo analista (remover/reordenar na simulação) — quem ficou de fora da lista vai pro fim. */
export function ordenarManual(paradas: Parada[], ordem: number[]): Parada[] {
  const porId = new Map(paradas.map((p) => [p.id, p]));
  const usadas = new Set<number>();
  const out: Parada[] = [];
  for (const id of ordem) {
    const p = porId.get(id);
    if (p && !usadas.has(id)) {
      out.push(p);
      usadas.add(id);
    }
  }
  for (const p of paradas) if (!usadas.has(p.id)) out.push(p);
  return out;
}

export interface ParadasSelecionadas {
  paradas: Parada[];
  semCoordenada: Array<{ vistoria_id: number; equipamento: string }>;
  nomeMap: Map<number, string>;
}

/**
 * Carrega lat/lng das vistorias escolhidas — mesma query nas rotas de
 * preview, plano e criação, pra nunca divergir o filtro de "sem coordenada".
 */
export async function fetchParadasSelecionadas(vIds: number[]): Promise<ParadasSelecionadas> {
  const rows = await query<{ id: number; name: string; latitude: string | null; longitude: string | null }>(
    `SELECT ne.id, ne.name,
            REPLACE(f.latitudefield, ',', '.') + 0.0 AS latitude,
            REPLACE(f.longitudefield, ',', '.') + 0.0 AS longitude
       FROM \`${TABLE_NE}\` ne
       INNER JOIN \`${TABLE_FIELDS}\` f ON f.items_id = ne.id
      WHERE ne.id IN (${vIds.map(() => "?").join(",")})
        AND ne.is_deleted = 0`,
    vIds
  );
  const temCoord = (r: (typeof rows)[number]) =>
    r.latitude != null && r.longitude != null && Number(r.latitude) !== 0;
  return {
    paradas: rows.filter(temCoord).map((r) => ({ id: r.id, lat: Number(r.latitude), lng: Number(r.longitude) })),
    semCoordenada: rows.filter((r) => !temCoord(r)).map((r) => ({ vistoria_id: r.id, equipamento: r.name })),
    nomeMap: new Map(rows.map((r) => [r.id, r.name])),
  };
}

/** Quando o técnico não tem histórico de execução ainda. */
const SLA_FALLBACK_MIN = 25;
/** Janela de histórico pra calcular o SLA médio — recente o bastante pra refletir o ritmo atual. */
const SLA_JANELA_DIAS = 90;

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Tempo médio de EXECUÇÃO (vistoria-iniciada → vistoria-finalizada) do
 * técnico, mesma fonte de fetchRankingTecnicosPeriodo()
 * (topTecnicosDashboard.ts) — aqui só pra 1 técnico, sem o resto do
 * widget. Fallback pro valor global quando não há histórico (técnico
 * novo, ou nenhuma vistoria no período).
 */
export async function fetchSlaTecnico(tecnicoId: number): Promise<number> {
  try {
    const rows = await query<{ t_ini: string | null; t_fim: string | null }>(
      `
        SELECT
          MAX(CASE WHEN acao = 'vistoria-iniciada'   THEN ts END) AS t_ini,
          MAX(CASE WHEN acao = 'vistoria-finalizada' THEN ts END) AS t_fim
          FROM glpi_plugin_vistomap_audit
         WHERE ator_id = ?
           AND acao IN ('vistoria-iniciada','vistoria-finalizada')
           AND ts >= NOW() - INTERVAL ${SLA_JANELA_DIAS} DAY
         GROUP BY alvo_id
      `,
      [tecnicoId]
    );
    const minutos: number[] = [];
    for (const r of rows) {
      if (!r.t_ini || !r.t_fim) continue;
      const m = (new Date(r.t_fim).getTime() - new Date(r.t_ini).getTime()) / 60000;
      if (m >= 0 && m <= 600) minutos.push(m);
    }
    if (minutos.length === 0) return SLA_FALLBACK_MIN;
    return Math.round(minutos.reduce((a, b) => a + b, 0) / minutos.length);
  } catch {
    return SLA_FALLBACK_MIN;
  }
}

/**
 * Nearest-neighbor puro em memória — greedy, não é o TSP ótimo, mas pro
 * tamanho real de uma agenda diária (poucas paradas) já dá uma ordem boa
 * o bastante sem pagar o custo de uma Optimization API paga.
 */
function ordenarPorProximidade(origem: LatLng, paradas: Parada[]): Parada[] {
  const restantes = [...paradas];
  const ordenadas: Parada[] = [];
  let atual = origem;
  while (restantes.length > 0) {
    let melhorIdx = 0;
    let melhorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = haversineM(atual, restantes[i]);
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    const [proxima] = restantes.splice(melhorIdx, 1);
    ordenadas.push(proxima);
    atual = proxima;
  }
  return ordenadas;
}

/**
 * Ordena as paradas ENTRE SI, sem âncora na posição do técnico.
 *
 * Antes o roteiro partia da última posição de GPS dele — que pode ser de
 * outro dia ou de outra cidade, o que torcia toda a ordem e ainda somava uma
 * perna gigante antes da primeira parada. Agora o ponto de partida sai do
 * próprio conjunto: começa pela parada mais afastada do centro (uma ponta do
 * grupo, nunca o meio) e daí sempre segue pra mais próxima ainda não
 * visitada — o roteiro varre de ponta a ponta, do mais perto ao mais longe,
 * em vez de ziguezaguear.
 */
export function ordenarEntreParadas(paradas: Parada[]): Parada[] {
  if (paradas.length <= 2) return [...paradas];
  const centro: LatLng = {
    lat: paradas.reduce((s, p) => s + p.lat, 0) / paradas.length,
    lng: paradas.reduce((s, p) => s + p.lng, 0) / paradas.length,
  };
  const inicio = paradas.reduce((a, b) => (haversineM(centro, b) > haversineM(centro, a) ? b : a));
  return [inicio, ...ordenarPorProximidade(inicio, paradas.filter((p) => p.id !== inicio.id))];
}

/** Duração/distância real de uma perna via Mapbox Directions — server-side, sem cache (chamado 1x por agendamento). */
async function fetchPerna(
  from: LatLng,
  to: LatLng
): Promise<{ distanciaM: number; duracaoS: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=false&access_token=${token}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const route = json.routes?.[0];
    if (!route) return null;
    return { distanciaM: Math.round(route.distance), duracaoS: route.duration };
  } catch {
    return null;
  }
}

/**
 * Acumula chegada/saída prevista de cada parada, na ordem já decidida.
 * Perna sem resposta da Directions API (rede fora, token ausente) cai pra
 * uma estimativa por linha reta a 30km/h — nunca trava o agendamento por
 * causa disso. A regra de horário (almoço/margem) vive em
 * roteirizacaoHorarios.ts, compartilhada com a prévia ao vivo do painel.
 */
export async function calcularHorarios(
  paradasOrdenadas: Parada[],
  slaMin: number,
  dataInicial: string,
  expediente: ExpedienteJanela,
  horaInicioDia1?: string
): Promise<ParadaComHorario[]> {
  // A PRIMEIRA parada não tem perna: o dia começa nela, na hora de início do
  // expediente. Da segunda em diante, origem/destino já são conhecidos (a
  // ordem está decidida), então as chamadas à Directions saem em paralelo.
  const pernas: PernaCalculada[] = await Promise.all(
    paradasOrdenadas.map(async (parada, i) => {
      if (i === 0) return { distanciaM: 0, duracaoMin: 0 };
      const de = paradasOrdenadas[i - 1];
      const perna = await fetchPerna(de, parada);
      const distanciaM = perna?.distanciaM ?? Math.round(haversineM(de, parada));
      const duracaoMin = perna ? perna.duracaoS / 60 : (distanciaM / 1000 / 30) * 60;
      return { distanciaM, duracaoMin };
    })
  );

  const horarios = planejarDias(dataInicial, expediente, slaMin, pernas, horaInicioDia1);

  return paradasOrdenadas.map((parada, i) => ({
    ...parada,
    ordem: i + 1,
    dia: horarios[i].dia,
    novoDia: horarios[i].novoDia,
    distanciaDesdeAnteriorM: i === 0 ? null : pernas[i].distanciaM,
    duracaoPernaMin: pernas[i].duracaoMin,
    chegadaPrevista: horarios[i].chegada,
    saidaPrevista: horarios[i].saida,
    almocoAntes: horarios[i].almocoAntes,
  }));
}

export interface ParadaComAgenda extends ParadaComHorario {
  riscoChuvaPct: number | null;
  riscoChuvaAlerta: boolean;
}

/**
 * Orquestra o roteiro completo: SLA do técnico + ordem entre as próprias
 * paradas + horários previstos (respeitando o expediente) + risco de chuva
 * por parada. Usado pelas duas rotas (preview e criação) pra nunca divergir
 * o que o analista vê na prévia do que de fato é gravado.
 */
export async function montarRoteiroDoDia(
  tecnicoId: number,
  paradas: Parada[],
  dataInicial: string,
  expediente: ExpedienteJanela,
  opts: { horaInicio?: string; ordem?: number[] } = {}
): Promise<ParadaComAgenda[]> {
  const slaMin = await fetchSlaTecnico(tecnicoId);
  const ordenadas = opts.ordem?.length ? ordenarManual(paradas, opts.ordem) : ordenarEntreParadas(paradas);
  const comHorario = await calcularHorarios(ordenadas, slaMin, dataInicial, expediente, opts.horaInicio);

  // Clima do DIA em que a parada caiu (pode ser o seguinte, se o expediente não coube).
  const comClima = await Promise.all(
    comHorario.map(async (p) => {
      const clima = await fetchRiscoChuva(p.lat, p.lng, p.dia);
      return { ...p, riscoChuvaPct: clima.probabilidadePct, riscoChuvaAlerta: clima.alerta };
    })
  );

  return comClima;
}
