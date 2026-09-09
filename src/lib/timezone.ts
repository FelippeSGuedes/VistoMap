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
