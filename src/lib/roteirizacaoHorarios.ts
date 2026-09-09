/**
 * Regras de horário do roteiro — PURAS (sem DB, sem rede), pra rodar
 * idênticas no servidor (roteirizacao.ts → o que é gravado no agendamento)
 * e no navegador (SimulacaoDiaOverlay → o que o analista vê montando ao
 * vivo). Uma implementação só = prévia e gravação nunca divergem.
 *
 * Segue o EXPEDIENTE configurado no painel (/painel/configuracoes/expediente):
 * o dia começa em `inicio`, e a parada que não couber até `fim` vai pro
 * próximo dia útil (sábado/domingo só se `fimDeSemana`). Almoço de 1h a
 * partir das 12:00 e 30 min de margem no término são fixos de propósito
 * (decisão 2026-09-09) — sem config.
 */

export interface ExpedienteJanela {
  inicio: string; // HH:MM
  fim: string; // HH:MM
  fimDeSemana: boolean;
}

export interface PernaCalculada {
  distanciaM: number;
  duracaoMin: number;
}

export interface HorarioParada {
  /** Dia (YYYY-MM-DD, Brasília) em que a parada foi encaixada. */
  dia: string;
  chegada: Date;
  saida: Date;
  /** true quando o almoço de 1h entrou ANTES desta parada (o relógio cruzou 12:00 no caminho). */
  almocoAntes: boolean;
  /** true quando esta parada abre um dia novo (não coube no anterior). */
  novoDia: boolean;
}

export interface ResumoDia {
  dia: string;
  paradas: number;
  /** Saída da última parada + margem (+ almoço, se o dia cruzou 12:00 sem parada depois). */
  termino: Date;
}

export const ALMOCO_HORA = "12:00";
export const ALMOCO_MIN = 60;
export const MARGEM_DESVIO_MIN = 30;

const MIN = 60_000;

/** Epoch de `dia` às `hhmm` — offset explícito, Brasília sem horário de verão. */
export function tsBrasilia(dia: string, hhmm: string): number {
  return new Date(`${dia}T${hhmm}:00-03:00`).getTime();
}

export function addDias(dia: string, n: number): string {
  // Meio-dia de Brasília = 15:00 UTC: somar dias inteiros nunca troca a data
  // do lado errado da meia-noite.
  const d = new Date(`${dia}T12:00:00-03:00`);
  d.setTime(d.getTime() + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00-03:00`).getUTCDay();
}

export function proximoDiaUtil(dia: string, fimDeSemana: boolean): string {
  let d = dia;
  if (!fimDeSemana) {
    while (diaDaSemana(d) === 0 || diaDaSemana(d) === 6) d = addDias(d, 1);
  }
  return d;
}

interface Encaixe {
  chegada: number;
  saida: number;
  almocoAntes: boolean;
}

function encaixar(dia: string, horario: number, almocoFeito: boolean, slaMin: number, perna: PernaCalculada): Encaixe {
  let chegada = horario + perna.duracaoMin * MIN;
  let almocoAntes = false;
  if (!almocoFeito && chegada >= tsBrasilia(dia, ALMOCO_HORA)) {
    chegada += ALMOCO_MIN * MIN;
    almocoAntes = true;
  }
  return { chegada, saida: chegada + slaMin * MIN, almocoAntes };
}

/**
 * Encaixa as paradas (na ordem dada) nos dias de expediente a partir de
 * `dataInicial`. A perna que sai de uma parada pra outra é sempre a mesma;
 * o que muda quando o dia vira é que ela passa a sair de manhã.
 */
export function planejarDias(
  dataInicial: string,
  expediente: ExpedienteJanela,
  slaMin: number,
  pernas: PernaCalculada[],
  horaInicioDia1?: string
): HorarioParada[] {
  const out: HorarioParada[] = [];
  let dia = proximoDiaUtil(dataInicial, expediente.fimDeSemana);
  let horario = tsBrasilia(dia, horaInicioDia1 ?? expediente.inicio);
  let almocoFeito = false;

  for (const perna of pernas) {
    let e = encaixar(dia, horario, almocoFeito, slaMin, perna);
    let novoDia = false;

    if (e.saida > tsBrasilia(dia, expediente.fim)) {
      const diaSeguinte = proximoDiaUtil(addDias(dia, 1), expediente.fimDeSemana);
      const inicioSeguinte = tsBrasilia(diaSeguinte, expediente.inicio);
      const eSeguinte = encaixar(diaSeguinte, inicioSeguinte, false, slaMin, perna);
      // Vira o dia se já tem parada hoje OU se num dia limpo ela cabe — a
      // primeira parada de um dia nunca é empurrada pra frente sem motivo
      // (uma perna gigante que não cabe em dia nenhum fica onde está).
      const cabeAmanha = eSeguinte.saida <= tsBrasilia(diaSeguinte, expediente.fim);
      if (out.length > 0 || cabeAmanha) {
        dia = diaSeguinte;
        almocoFeito = false;
        e = eSeguinte;
        novoDia = true;
      }
    }

    if (e.almocoAntes) almocoFeito = true;
    out.push({ dia, chegada: new Date(e.chegada), saida: new Date(e.saida), almocoAntes: e.almocoAntes, novoDia });
    horario = e.saida;
  }
  return out;
}

export function resumirDias(horarios: HorarioParada[]): ResumoDia[] {
  const porDia = new Map<string, HorarioParada[]>();
  for (const h of horarios) {
    const lista = porDia.get(h.dia) ?? [];
    lista.push(h);
    porDia.set(h.dia, lista);
  }
  return Array.from(porDia, ([dia, ps]) => {
    const ultima = ps[ps.length - 1];
    let t = ultima.saida.getTime() + MARGEM_DESVIO_MIN * MIN;
    const almocou = ps.some((p) => p.almocoAntes);
    if (!almocou && ultima.saida.getTime() >= tsBrasilia(dia, ALMOCO_HORA)) t += ALMOCO_MIN * MIN;
    return { dia, paradas: ps.length, termino: new Date(t) };
  });
}
