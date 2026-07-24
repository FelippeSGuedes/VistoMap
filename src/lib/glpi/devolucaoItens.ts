/**
 * Inventário de itens "corrigíveis" numa vistoria — usado pelo fluxo de
 * Devolução (analista aponta o que está errado, técnico corrige só isso).
 *
 * `tipo: "foto"` = precisa o técnico estar fisicamente no local pra refazer
 * (câmera/vídeo). `tipo: "campo"` = correção de informação, não exige
 * deslocamento por padrão (mas o técnico pode escolher ir mesmo assim).
 * Essa distinção decide a regra de "precisa deslocamento" na tela de devolução
 * do app técnico (Fase 2).
 *
 * Chaves de foto espelham `StepKey` em GuidedCaptureFlow.tsx. Chaves de
 * campo espelham `FormState` em VistoriaExecucaoForm.tsx.
 */

export type DevolucaoItemTipo = "foto" | "campo";

export interface DevolucaoItemDef {
  key: string;
  label: string;
  tipo: DevolucaoItemTipo;
}

export const DEVOLUCAO_ITENS: DevolucaoItemDef[] = [
  // Fotos/vídeo — sempre exigem deslocamento até o equipamento.
  { key: "imagem1", label: "Foto 1 — Poste completo", tipo: "foto" },
  { key: "imagem2", label: "Foto 2 — Detalhe do topo", tipo: "foto" },
  { key: "imagem3", label: "Foto 3 — Vista horizontal", tipo: "foto" },
  { key: "video360", label: "Vídeo 360°", tipo: "foto" },
  { key: "imagem4", label: "Print Vivo", tipo: "foto" },
  { key: "imagem5", label: "Print Claro", tipo: "foto" },
  // Campos do formulário — correção de informação, não exige deslocamento.
  { key: "pspostefield", label: "PS do poste", tipo: "campo" },
  { key: "municipiofield", label: "Município", tipo: "campo" },
  { key: "endereofield", label: "Endereço", tipo: "campo" },
  { key: "tipodematerial", label: "Material / Tipo da estrutura", tipo: "campo" },
  { key: "alturadopostemfield", label: "Altura do poste", tipo: "campo" },
  { key: "aterramentofield", label: "Aterramento", tipo: "campo" },
  { key: "danfield", label: "Resistência (daN)", tipo: "campo" },
  { key: "instalartpfield", label: "Instalação de TP", tipo: "campo" },
  { key: "tensovfield", label: "Tensão", tipo: "campo" },
  { key: "rsrpifield", label: "RSRP Claro", tipo: "campo" },
  { key: "tipoifield", label: "Tipo de rede Claro", tipo: "campo" },
  { key: "rsrpllfield", label: "RSRP Vivo", tipo: "campo" },
  { key: "tipollfield", label: "Tipo de rede Vivo", tipo: "campo" },
  { key: "tipodeantena", label: "Tipo de antena", tipo: "campo" },
  { key: "ganhodbi", label: "Ganho (dBi)", tipo: "campo" },
  { key: "equipamentofield", label: "Modo de operação (DCU/Repetidor)", tipo: "campo" },
  { key: "observacao", label: "Observação", tipo: "campo" },
];

export const DEVOLUCAO_ITEM_LABEL: Record<string, string> = Object.fromEntries(
  DEVOLUCAO_ITENS.map((i) => [i.key, i.label])
);

/** Lista fixa de motivos — "Outro" libera o campo de texto livre no formulário. */
export const DEVOLUCAO_MOTIVOS = [
  "Foto desfocada ou ilegível",
  "Foto não mostra o item exigido",
  "Vídeo incompleto ou de má qualidade",
  "Informação incorreta",
  "Informação incompleta",
  "Print da operadora inválido ou ilegível",
  "Localização/endereço divergente",
  "Outro",
] as const;

export type DevolucaoMotivo = (typeof DEVOLUCAO_MOTIVOS)[number];

/** true se pelo menos um item apontado exige deslocamento até o equipamento. */
export function devolucaoPrecisaDeslocamento(itens: string[]): boolean {
  const tipos = new Map(DEVOLUCAO_ITENS.map((i) => [i.key, i.tipo]));
  return itens.some((key) => tipos.get(key) === "foto");
}
