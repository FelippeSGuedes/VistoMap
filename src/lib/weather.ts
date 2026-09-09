import "server-only";

/**
 * Previsão de chuva pro agendamento (painel) — Open-Meteo, sem chave/custo.
 * Horizonte real de previsão diária é ~16 dias; além disso a API ainda
 * responde mas o dado deixa de ser confiável, então tratamos como
 * indisponível e nunca bloqueamos o agendamento por causa disso (mesmo
 * espírito "best-effort" do resto do código — GPS/audit/push também
 * engolem falha de rede sem quebrar o fluxo principal).
 */

const RISCO_CHUVA_LIMIAR_PCT = 50;
const HORIZONTE_PREVISAO_DIAS = 16;

export interface RiscoChuva {
  probabilidadePct: number | null;
  alerta: boolean;
}

export async function fetchRiscoChuva(
  lat: number,
  lng: number,
  dataISO: string
): Promise<RiscoChuva> {
  // Offset explícito (-03:00) — meia-noite de Brasília, não do processo (UTC
  // neste deploy), pra não errar por 1 dia perto da borda do horizonte.
  const dias = Math.ceil(
    (new Date(`${dataISO}T00:00:00-03:00`).getTime() - Date.now()) / 86_400_000
  );
  if (dias < 0 || dias > HORIZONTE_PREVISAO_DIAS) {
    return { probabilidadePct: null, alerta: false };
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_probability_max` +
    `&timezone=America%2FSao_Paulo` +
    `&start_date=${dataISO}&end_date=${dataISO}`;

  try {
    const r = await fetch(url);
    if (!r.ok) return { probabilidadePct: null, alerta: false };
    const json = await r.json();
    const pct = json?.daily?.precipitation_probability_max?.[0];
    if (typeof pct !== "number") return { probabilidadePct: null, alerta: false };
    return { probabilidadePct: pct, alerta: pct >= RISCO_CHUVA_LIMIAR_PCT };
  } catch {
    return { probabilidadePct: null, alerta: false };
  }
}
