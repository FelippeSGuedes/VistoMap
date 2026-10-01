import "server-only";

/**
 * O host/containers/MySQL rodam em UTC (confirmado via SSH), mas a operação
 * é em Brasília (America/Sao_Paulo, UTC-3, sem horário de verão hoje). Isso
 * NÃO afeta o log de auditoria nem as tabelas internas (CURRENT_TIMESTAMP/
 * NOW() ficam em UTC de propósito — o lado de leitura já corrige isso em
 * vários lugares via parseUTC/toUtcMs/toDate) — só os campos NATIVOS do
 * GLPI (datadavistoriafield etc.), que são lidos direto pela UI PHP do GLPI
 * e por exportações CPFL sem NENHUMA correção de fuso do lado do cliente.
 * Esses precisam do horário real de Brasília já na gravação.
 *
 * Mesma técnica de agoraSP() (expediente.ts), generalizada aqui.
 */

const TZ = "America/Sao_Paulo";

function partsBrasilia(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/**
 * "YYYY-MM-DD HH:MM:SS" em horário real de Brasília — pra gravar em campos
 * nativos do GLPI. `iso` opcional: converte um instante específico em vez
 * de "agora" (mesma assinatura do formatGlpiDateTime que esta função substitui).
 */
export function nowBrasiliaSql(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const p = partsBrasilia(d);
  // Meia-noite: Intl com hour12:false devolve "24", não "00" — mesma
  // normalização já feita em agoraSP().
  const hh = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}:${p.second}`;
}

/** "YYYY-MM-DD" de hoje em Brasília — pra comparação de dia (CURDATE() do
 *  MySQL/`new Date().getDate()` refletem o relógio UTC do host, não servem). */
export function hojeBrasiliaISO(): string {
  return nowBrasiliaSql().slice(0, 10);
}

/**
 * Converte um dia civil + hora de parede de Brasília pro instante UTC
 * equivalente, em "YYYY-MM-DD HH:MM:SS" pronto pra gravar em colunas que
 * são `NOW()`/`DEFAULT CURRENT_TIMESTAMP` (essas SIM são UTC de verdade —
 * ver nota no topo do arquivo). Brasília é UTC-3 fixo (sem horário de verão
 * desde 2019), então a conversão é só "+3h", com `Date.UTC` absorvendo o
 * estouro de dia/mês/ano sozinho.
 *
 * Achado em 2026-10-01: o fechamento automático de expediente
 * (`fecharExpedientesPendurados`/`ensureExpedienteAuto`) gravava
 * `TIMESTAMP(dia, '18:00:00')` cru — um literal de parede de Brasília
 * sendo jogado numa coluna que o resto do sistema (inicio_at, fim_at
 * manual via NOW(), audit.ts) trata como UTC. Resultado: todo expediente
 * fechado automaticamente (o caso comum, já que o fluxo manual foi
 * removido) ficava 3h adiantado/atrasado dependendo da leitura.
 */
export function brasiliaLocalToUtcSql(dataISO: string, horaHHMM: string): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const [h, m] = horaHHMM.split(":").map(Number);
  const utcMs = Date.UTC(ano, mes - 1, dia, h + 3, m, 0);
  return new Date(utcMs).toISOString().slice(0, 19).replace("T", " ");
}
