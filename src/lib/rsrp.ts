/**
 * RSRP (dBm) é sempre negativo — quanto mais próximo de zero, melhor o sinal.
 * Limite combinado com o time: -102 dBm ou pior (mais negativo) reprova o
 * poste na hora, exige troca antes de finalizar a vistoria.
 */
export const RSRP_MINIMO = -102;

export const RSRP_MENSAGEM_ERRO =
  "Favor trocar o poste — RSRP não aceito (sinal igual ou pior que -102 dBm).";

/** Campo vazio ou não numérico é ignorado aqui — outra validação cuida disso. */
export function rsrpValido(raw: string | undefined | null): boolean {
  if (raw == null || !raw.trim()) return true;
  const n = Number(raw);
  if (!Number.isFinite(n)) return true;
  return n > RSRP_MINIMO;
}
