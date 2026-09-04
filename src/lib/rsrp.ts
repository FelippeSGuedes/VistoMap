/**
 * RSRP (dBm) é sempre negativo — quanto mais próximo de zero, melhor o sinal.
 * Limite combinado com o time: -102 dBm ou pior (mais negativo) é "ruim".
 * Reprova o poste só se as DUAS operadoras estiverem ruins ao mesmo tempo —
 * se uma tiver sinal bom, o poste segue viável mesmo com a outra ruim.
 */
export const RSRP_MINIMO = -102;

export const RSRP_MENSAGEM_ERRO =
  "Favor trocar o poste — RSRP não aceito (sinal igual ou pior que -102 dBm nas duas operadoras).";

function rsrpRuim(raw: string | undefined | null): boolean {
  if (raw == null || !raw.trim()) return false;
  const n = Number(raw);
  if (!Number.isFinite(n)) return false;
  return n <= RSRP_MINIMO;
}

/** true quando o par é aceitável — só reprova se claro E vivo estiverem ruins. */
export function rsrpParValido(
  claro: string | undefined | null,
  vivo: string | undefined | null
): boolean {
  return !(rsrpRuim(claro) && rsrpRuim(vivo));
}
