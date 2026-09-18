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
  /**
   * true quando o item descreve o POSTE FÍSICO em si (foto do poste,
   * material, altura, aterramento, resistência, sinal medido nele) — não o
   * equipamento/antena instalado nele nem dados administrativos (endereço,
   * observação). Usado por /vistoria-corrigir pra decidir quando oferecer
   * "Trocar de poste": antes só sinal (RSRP) liberava a opção, mas qualquer
   * um desses motivos pode ser "o poste apontado não é o certo" (achado em
   * campo 2026-09-18 — devolução por foto/material também merece a opção).
   */
  sobrePoste?: boolean;
}

export const DEVOLUCAO_ITENS: DevolucaoItemDef[] = [
  // Fotos/vídeo — sempre exigem deslocamento até o equipamento.
  { key: "imagem1", label: "Foto 1 — Poste completo", tipo: "foto", sobrePoste: true },
  { key: "imagem2", label: "Foto 2 — Detalhe do topo", tipo: "foto", sobrePoste: true },
  { key: "imagem3", label: "Foto 3 — Vista horizontal", tipo: "foto", sobrePoste: true },
  { key: "video360", label: "Vídeo 360°", tipo: "foto", sobrePoste: true },
  { key: "imagem4", label: "Print Vivo", tipo: "foto" },
  { key: "imagem5", label: "Print Claro", tipo: "foto" },
  // Campos do formulário — correção de informação, não exige deslocamento.
  { key: "pspostefield", label: "PS do poste", tipo: "campo", sobrePoste: true },
  { key: "municipiofield", label: "Município", tipo: "campo" },
  { key: "endereofield", label: "Endereço", tipo: "campo" },
  { key: "tipodematerial", label: "Material / Tipo da estrutura", tipo: "campo", sobrePoste: true },
  { key: "alturadopostemfield", label: "Altura do poste", tipo: "campo", sobrePoste: true },
  { key: "aterramentofield", label: "Aterramento", tipo: "campo", sobrePoste: true },
  { key: "danfield", label: "Resistência (daN)", tipo: "campo", sobrePoste: true },
  { key: "instalartpfield", label: "Instalação de TP", tipo: "campo" },
  { key: "tensovfield", label: "Tensão", tipo: "campo" },
  { key: "rsrpifield", label: "RSRP Claro", tipo: "campo", sobrePoste: true },
  { key: "tipoifield", label: "Tipo de rede Claro", tipo: "campo" },
  { key: "rsrpllfield", label: "RSRP Vivo", tipo: "campo", sobrePoste: true },
  { key: "tipollfield", label: "Tipo de rede Vivo", tipo: "campo" },
  { key: "tipodeantena", label: "Tipo de antena", tipo: "campo" },
  { key: "ganhodbi", label: "Ganho (dBi)", tipo: "campo" },
  { key: "equipamentofield", label: "Modo de operação (DCU/Repetidor)", tipo: "campo" },
  { key: "observacao", label: "Observação", tipo: "campo" },
];

/** true se algum item apontado é sobre o poste físico (ver `sobrePoste`). */
export function devolucaoSobrePoste(itens: string[]): boolean {
  const flags = new Map(DEVOLUCAO_ITENS.map((i) => [i.key, !!i.sobrePoste]));
  return itens.some((key) => flags.get(key));
}

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

/**
 * item de devolução → DropdownKey (glpi/constants.ts) — campos "campo" cujo
 * valor vem de um dropdown do GLPI (não texto livre). Usado tanto pela tela
 * de correção do app (pra saber quando renderizar <SelectField>) quanto pela
 * rota corrigir-devolucao (pra resolver texto → id via resolveDropdowns).
 */
export const DEVOLUCAO_DROPDOWN_FIELD: Record<string, string> = {
  tensovfield: "tensovfield",
  tipoifield: "tipoifield",
  tipollfield: "tipollfield",
  tipodeantena: "tipodeantena",
  ganhodbi: "ganhodbi",
  equipamentofield: "equipamento",
};

/** true se pelo menos um item apontado exige deslocamento até o equipamento. */
export function devolucaoPrecisaDeslocamento(itens: string[]): boolean {
  const tipos = new Map(DEVOLUCAO_ITENS.map((i) => [i.key, i.tipo]));
  return itens.some((key) => tipos.get(key) === "foto");
}
