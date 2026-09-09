import "server-only";
import { query } from "@/lib/db";
import { DEFAULT_CENTER } from "@/services/maps";
import { fetchRiscoChuva } from "@/lib/weather";

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
  distanciaDesdeAnteriorM: number | null;
  chegadaPrevista: Date;
  saidaPrevista: Date;
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

/** Última posição de GPS conhecida do técnico — origem do roteiro do dia. */
export async function fetchOrigemTecnico(tecnicoId: number): Promise<LatLng> {
  try {
    const [row] = await query<{ latitude: string; longitude: string }>(
      `SELECT latitude, longitude
         FROM glpi_plugin_vistomap_locations
        WHERE users_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [tecnicoId]
    );
    if (row) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch {
    /* segue pro fallback */
  }
  return { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };
}

/**
 * Nearest-neighbor puro em memória — greedy, não é o TSP ótimo, mas pro
 * tamanho real de uma agenda diária (poucas paradas) já dá uma ordem boa
 * o bastante sem pagar o custo de uma Optimization API paga.
 */
export function ordenarPorProximidade(origem: LatLng, paradas: Parada[]): Parada[] {
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
 * causa disso.
 */
export async function calcularHorarios(
  origem: LatLng,
  paradasOrdenadas: Parada[],
  slaMin: number,
  horaInicio: Date
): Promise<ParadaComHorario[]> {
  const resultado: ParadaComHorario[] = [];
  let atual = origem;
  let horario = horaInicio;

  for (let i = 0; i < paradasOrdenadas.length; i++) {
    const parada = paradasOrdenadas[i];
    const perna = await fetchPerna(atual, parada);
    const distanciaM = perna?.distanciaM ?? Math.round(haversineM(atual, parada));
    const duracaoMin = perna
      ? perna.duracaoS / 60
      : (distanciaM / 1000 / 30) * 60; // fallback: 30km/h em linha reta

    const chegadaPrevista = new Date(horario.getTime() + duracaoMin * 60000);
    const saidaPrevista = new Date(chegadaPrevista.getTime() + slaMin * 60000);

    resultado.push({
      ...parada,
      ordem: i + 1,
      distanciaDesdeAnteriorM: distanciaM,
      chegadaPrevista,
      saidaPrevista,
    });

    atual = parada;
    horario = saidaPrevista;
  }

  return resultado;
}

export interface ParadaComAgenda extends ParadaComHorario {
  riscoChuvaPct: number | null;
  riscoChuvaAlerta: boolean;
}

/**
 * Orquestra o roteiro completo de um dia: SLA do técnico + origem (última
 * posição de GPS) + ordem por proximidade + horários previstos + risco de
 * chuva por parada. Usado pelas duas rotas (preview e criação) pra nunca
 * divergir o que o analista vê na prévia do que de fato é gravado.
 */
export async function montarRoteiroDoDia(
  tecnicoId: number,
  paradas: Parada[],
  dataAgendadaISO: string,
  horaInicio: Date
): Promise<ParadaComAgenda[]> {
  const [slaMin, origem] = await Promise.all([
    fetchSlaTecnico(tecnicoId),
    fetchOrigemTecnico(tecnicoId),
  ]);
  const ordenadas = ordenarPorProximidade(origem, paradas);
  const comHorario = await calcularHorarios(origem, ordenadas, slaMin, horaInicio);

  const comClima = await Promise.all(
    comHorario.map(async (p) => {
      const clima = await fetchRiscoChuva(p.lat, p.lng, dataAgendadaISO);
      return { ...p, riscoChuvaPct: clima.probabilidadePct, riscoChuvaAlerta: clima.alerta };
    })
  );

  return comClima;
}
