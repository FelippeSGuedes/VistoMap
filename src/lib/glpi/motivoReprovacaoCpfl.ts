/**
 * Opções do dropdown "Motivo de Reprovação CPFL" (GLPI Fields, criado em
 * 2026-09-24) — mesma grafia exata das linhas semeadas em
 * glpi_plugin_fields_motivoreprovacaocpflfielddropdowns, já que
 * findOrCreateDropdown() (dropdowns.ts) resolve por igualdade de `name`.
 * Sem "server-only": usado tanto no client (EditarVistoriaModal) quanto no
 * server (agrupamentos de histórico).
 */
export const MOTIVO_REPROVACAO_CPFL_OPTIONS = [
  "Poste poluído",
  "Excesso de vegetação",
  "Falta de sinal",
  "Sinal fraco",
  "Falta de segurança",
  "Coordenada incorreta",
  "Endereço incorreto",
  "Má condição da estrutura",
  "Presença de transformador",
  "Presença de chaves",
  "Poste com derivação",
  "Imagens com baixa qualidade",
  "Local inadequado para a instalação de TP",
  "Local inadequado",
  "Propriedade privada",
  "Animais peçonhentos",
  "Rede secundária inexistente",
  "Próximo a primária",
  "Informar a instalação do TP",
  "Outros",
] as const;

export type MotivoReprovacaoCpfl = (typeof MOTIVO_REPROVACAO_CPFL_OPTIONS)[number];

/**
 * Texto de exibição do "motivo da reprovação", priorizando o dropdown novo.
 * Fallback pro `motivofield` legado cobre reprovações antigas e as que a
 * CPFL ainda faz direto no GLPI nativo (fora do VistoMap) sem usar o
 * dropdown — sem isso, essas ficariam "Motivo não informado" do nada.
 */
export function composeMotivoReprovacaoCpfl(
  motivoCpfl: string | null | undefined,
  descricaoDetalhada: string | null | undefined,
  motivoLegado: string | null | undefined
): string | null {
  const motivo = motivoCpfl?.trim();
  const detalhe = descricaoDetalhada?.trim();
  if (motivo) return detalhe ? `${motivo} — ${detalhe}` : motivo;
  return motivoLegado?.trim() || null;
}
