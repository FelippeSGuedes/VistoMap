/**
 * "Recusar vistoria" — quando o técnico chega no local e a vistoria é
 * genuinamente impossível de fazer (propriedade privada, risco, poste
 * removido, etc.), diferente de "Mudar Poste" (o poste específico está
 * bloqueado mas existe alternativa por perto).
 *
 * SEM_POSTES é especial: nunca é escolhido manualmente — só é usado quando
 * o gate automático (busca de postes num raio de 100m) não encontra
 * nenhuma alternativa. Os demais (2–7) só ficam disponíveis depois que o
 * técnico passa pela lista de "Mudar Poste" e nenhuma opção serve.
 */

export const RECUSA_MOTIVOS = [
  { key: "SEM_POSTES", label: "Sem postes na redondeza (100m)" },
  { key: "PROPRIEDADE_PRIVADA", label: "Propriedade privada sem acesso" },
  { key: "RECUSA_MORADOR", label: "Recusa do morador/responsável" },
  { key: "RISCO_SEGURANCA", label: "Risco de segurança no local" },
  { key: "ENDERECO_NAO_LOCALIZADO", label: "Endereço ou poste não localizado" },
  { key: "POSTE_REMOVIDO", label: "Poste/equipamento removido ou interditado" },
  { key: "OUTRO", label: "Outro" },
] as const;

export type RecusaMotivo = (typeof RECUSA_MOTIVOS)[number]["key"];

export const RECUSA_MOTIVO_LABEL: Record<RecusaMotivo, string> = Object.fromEntries(
  RECUSA_MOTIVOS.map((m) => [m.key, m.label])
) as Record<RecusaMotivo, string>;

/** Motivos que o técnico escolhe manualmente (exclui SEM_POSTES, que é automático). */
export const RECUSA_MOTIVOS_MANUAIS = RECUSA_MOTIVOS.filter((m) => m.key !== "SEM_POSTES");

export interface RecusaPergunta {
  key: string;
  pergunta: string;
  tipo: "opcoes" | "texto";
  opcoes?: string[];
  obrigatoria: boolean;
}

export const RECUSA_PERGUNTAS: Record<RecusaMotivo, RecusaPergunta[]> = {
  SEM_POSTES: [],
  PROPRIEDADE_PRIVADA: [
    {
      key: "contato",
      pergunta: "Havia alguém no local pra autorizar entrada?",
      tipo: "opcoes",
      opcoes: [
        "Sim, mas recusou entrada",
        "Não havia ninguém no momento",
        "Não tentei contato (portão trancado/interfone sem resposta)",
      ],
      obrigatoria: true,
    },
    { key: "detalhe", pergunta: "Detalhe adicional (opcional)", tipo: "texto", obrigatoria: false },
  ],
  RECUSA_MORADOR: [
    { key: "motivo_morador", pergunta: "Qual foi o motivo dado pelo morador?", tipo: "texto", obrigatoria: true },
    {
      key: "explicou",
      pergunta: "Tentou explicar que era vistoria da concessionária?",
      tipo: "opcoes",
      opcoes: ["Sim", "Não"],
      obrigatoria: true,
    },
  ],
  RISCO_SEGURANCA: [
    {
      key: "tipo_risco",
      pergunta: "Qual o tipo de risco?",
      tipo: "opcoes",
      opcoes: ["Animal solto", "Área de insegurança", "Estrutura instável", "Fiação exposta", "Outro"],
      obrigatoria: true,
    },
    { key: "detalhe", pergunta: "Detalhe adicional (opcional)", tipo: "texto", obrigatoria: false },
  ],
  ENDERECO_NAO_LOCALIZADO: [
    {
      key: "situacao",
      pergunta: "O que você encontrou no local?",
      tipo: "opcoes",
      opcoes: ["Não há poste nenhum", "Há poste, mas não bate com o cadastro", "Endereço parece estar errado"],
      obrigatoria: true,
    },
  ],
  POSTE_REMOVIDO: [
    {
      key: "situacao",
      pergunta: "O que aconteceu?",
      tipo: "opcoes",
      opcoes: ["Foi removido (não existe mais)", "Interditado por outra equipe", "Caiu/danificado sem condição de acesso"],
      obrigatoria: true,
    },
  ],
  OUTRO: [
    { key: "descricao", pergunta: "Descreva a situação", tipo: "texto", obrigatoria: true },
  ],
};

/** true se todas as perguntas obrigatórias do motivo têm resposta preenchida. */
export function recusaRespostasCompletas(motivo: RecusaMotivo, respostas: Record<string, string>): boolean {
  return RECUSA_PERGUNTAS[motivo].every((p) => !p.obrigatoria || (respostas[p.key] ?? "").trim().length > 0);
}

/** Monta o texto de justificativa a partir do motivo + respostas do Q&A. */
export function gerarJustificativaRecusa(
  motivo: RecusaMotivo,
  respostas: Record<string, string>
): string {
  const label = RECUSA_MOTIVO_LABEL[motivo];
  if (motivo === "SEM_POSTES") {
    return "Vistoria recusada — nenhum poste alternativo encontrado num raio de 100m do equipamento original.";
  }
  const partes = RECUSA_PERGUNTAS[motivo]
    .map((p) => respostas[p.key]?.trim())
    .filter((v): v is string => !!v);
  return `Vistoria recusada — ${label}.${partes.length ? " " + partes.join(" ") : ""}`;
}
