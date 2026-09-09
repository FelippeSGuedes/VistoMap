/**
 * Regras de horário do roteiro do dia — PURAS (sem DB, sem rede), pra rodar
 * idênticas no servidor (roteirizacao.ts → o que é gravado no agendamento)
 * e no navegador (SimulacaoDiaOverlay → o que o analista vê montando ao
 * vivo). Uma implementação só = prévia e gravação nunca divergem.
 *
 * Almoço e margem são fixos de propósito (decisão 2026-09-09): 1h de almoço
 * descontada a partir das 12:00 e 30 min de folga no fim do dia. Sem config.
 */

export interface PernaCalculada {
  distanciaM: number;
  duracaoMin: number;
}

export interface HorarioParada {
  chegada: Date;
  saida: Date;
  /** true quando o almoço de 1h entrou ANTES desta parada (o relógio cruzou 12:00 no caminho). */
  almocoAntes: boolean;
}

export const ALMOCO_HORA = "12:00";
export const ALMOCO_MIN = 60;
export const MARGEM_DESVIO_MIN = 30;

/** Instante do almoço no dia agendado — offset explícito, Brasília sem horário de verão. */
export function almocoDoDia(dataISO: string): Date {
  return new Date(`${dataISO}T${ALMOCO_HORA}:00-03:00`);
}

/**
 * Acumula chegada/saída de cada parada na ordem dada. A primeira chegada
 * que cair às 12:00 ou depois ganha +1h (o técnico almoça antes de começar
 * aquela parada); daí em diante tudo já sai deslocado.
 */
export function acumularHorarios(
  horaInicio: Date,
  slaMin: number,
  pernas: PernaCalculada[],
  almocoEm: Date
): HorarioParada[] {
  const out: HorarioParada[] = [];
  const almocoTs = almocoEm.getTime();
  let horario = horaInicio.getTime();
  let almocoFeito = false;

  for (const perna of pernas) {
    let chegada = horario + perna.duracaoMin * 60000;
    let almocoAntes = false;
    if (!almocoFeito && chegada >= almocoTs) {
      chegada += ALMOCO_MIN * 60000;
      almocoFeito = true;
      almocoAntes = true;
    }
    const saida = chegada + slaMin * 60000;
    out.push({ chegada: new Date(chegada), saida: new Date(saida), almocoAntes });
    horario = saida;
  }
  return out;
}

/**
 * Hora prevista de término = saída da última parada + margem. Se o dia
 * inteiro terminou antes das 12:00 não há almoço; se a última parada cruzou
 * o meio-dia sem nenhuma parada depois dela, o almoço entra aqui.
 */
export function calcularTermino(horarios: HorarioParada[], almocoEm: Date): Date | null {
  const ultima = horarios[horarios.length - 1];
  if (!ultima) return null;
  const almocoFeito = horarios.some((h) => h.almocoAntes);
  let t = ultima.saida.getTime() + MARGEM_DESVIO_MIN * 60000;
  if (!almocoFeito && ultima.saida.getTime() >= almocoEm.getTime()) t += ALMOCO_MIN * 60000;
  return new Date(t);
}
