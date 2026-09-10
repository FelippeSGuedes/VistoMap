/**
 * "Recusar vistoria" — quando o técnico chega no local e a vistoria é
 * genuinamente impossível de fazer (propriedade privada, risco, poste
 * removido, etc.), diferente de "Mudar Poste" (o poste específico está
 * bloqueado mas existe alternativa por perto).
 *
 * CATEGORIA (2026-09-10): "impedimento" vs "recusa" — MESMO mecanismo (essa
 * mesma tabela, motivo + justificativa + aprovação do analista), só um
 * rótulo/cor diferente pra separar visualmente as duas naturezas:
 *   • impedimento = ausência de infraestrutura/acesso (sem poste na área,
 *     condomínio fechado) — ninguém "decidiu" nada, o ambiente impediu.
 *   • recusa = decisão/recusa de fato (sinal ruim/fora do padrão CPFL —
 *     SEMPRE recusa, nunca impedimento —, morador recusou, risco que o
 *     técnico optou por não correr, propriedade privada, técnico
 *     incapacitado).
 * É puramente derivado do MOTIVO (RECUSA_MOTIVO_CATEGORIA abaixo) — sem
 * coluna nova no banco, sem tabela nova. O mesmo motivo nunca muda de
 * categoria.
 *
 * SEM_POSTES é especial: nunca é escolhido manualmente — só é usado quando
 * o gate automático (busca de postes num raio de 100m) não encontra
 * nenhuma alternativa. Os motivos "manuais" (RECUSA_MOTIVOS_MANUAIS) só
 * ficam disponíveis pelo escape hatch de "Mudar Poste" (nenhuma alternativa
 * serve) — o Assistente de Vistoria (AssistenteVistoria.tsx) tem seu
 * próprio funil conversacional e não usa essa lista solta.
 */

export const RECUSA_MOTIVOS = [
  { key: "SEM_POSTES", label: "Sem postes na redondeza (100m)" },
  { key: "SINAL_RUIM_APOS_TROCA", label: "Sinal ruim mesmo após trocar de poste" },
  { key: "SINAL_FORA_PADRAO", label: "Sinal fora do padrão CPFL" },
  { key: "SINAL_SEM_MEDICAO", label: "Não foi possível medir o sinal" },
  { key: "CONDOMINIO_ACESSO_BLOQUEADO", label: "Condomínio — acesso bloqueado" },
  { key: "CONDOMINIO_SEM_CONTATO", label: "Condomínio — sem contato com responsável" },
  { key: "AREA_DIFICIL_ACESSO", label: "Área de difícil acesso" },
  { key: "OUTRO_PROBLEMA_IMPEDE", label: "Outro problema — impede a vistoria" },
  { key: "TECNICO_INCAPACITADO", label: "Recusada pelo analista (técnico incapacitado)" },
  { key: "ALTERNATIVAS_INACESSIVEIS", label: "Alternativas também inacessíveis" },
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

export type RecusaCategoria = "impedimento" | "recusa";

const MOTIVOS_IMPEDIMENTO: RecusaMotivo[] = [
  "SEM_POSTES",
  "CONDOMINIO_ACESSO_BLOQUEADO",
  "CONDOMINIO_SEM_CONTATO",
  "AREA_DIFICIL_ACESSO",
  "OUTRO_PROBLEMA_IMPEDE",
];

export const RECUSA_MOTIVO_CATEGORIA: Record<RecusaMotivo, RecusaCategoria> = Object.fromEntries(
  RECUSA_MOTIVOS.map((m) => [m.key, MOTIVOS_IMPEDIMENTO.includes(m.key) ? "impedimento" : "recusa"])
) as Record<RecusaMotivo, RecusaCategoria>;

export const CATEGORIA_LABEL: Record<RecusaCategoria, string> = {
  impedimento: "Impedimento",
  recusa: "Recusa",
};

/** Motivos que só chegam com motivoFixo (gate automático ou Assistente de Vistoria) — nunca escolhidos numa lista solta. */
const MOTIVOS_AUTOMATICOS: RecusaMotivo[] = [
  "SEM_POSTES",
  "SINAL_RUIM_APOS_TROCA",
  "SINAL_FORA_PADRAO",
  "SINAL_SEM_MEDICAO",
  "CONDOMINIO_ACESSO_BLOQUEADO",
  "CONDOMINIO_SEM_CONTATO",
  "AREA_DIFICIL_ACESSO",
  "OUTRO_PROBLEMA_IMPEDE",
  "TECNICO_INCAPACITADO",
];

/**
 * Motivos que aparecem na lista solta de "Recusar vistoria" quando o
 * técnico entra pelo escape hatch de "Mudar Poste" (nenhuma alternativa
 * serve) — os automáticos/conversacionais (acima) nunca aparecem numa
 * lista pra escolher, sempre chegam com motivoFixo já decidido.
 */
export const RECUSA_MOTIVOS_MANUAIS = RECUSA_MOTIVOS.filter((m) => !MOTIVOS_AUTOMATICOS.includes(m.key));

export interface RecusaPergunta {
  key: string;
  pergunta: string;
  tipo: "opcoes" | "texto";
  opcoes?: string[];
  obrigatoria: boolean;
}

export const RECUSA_PERGUNTAS: Record<RecusaMotivo, RecusaPergunta[]> = {
  SEM_POSTES: [],
  // Sem perguntas — vem sempre com motivoFixo (RSRP já preenchido em
  // respostasIniciais pelas telas/assistente que geram cada uma).
  SINAL_RUIM_APOS_TROCA: [],
  SINAL_FORA_PADRAO: [],
  SINAL_SEM_MEDICAO: [],
  CONDOMINIO_ACESSO_BLOQUEADO: [],
  CONDOMINIO_SEM_CONTATO: [],
  AREA_DIFICIL_ACESSO: [],
  OUTRO_PROBLEMA_IMPEDE: [],
  // Sem perguntas — nasce direto do painel (analista), nunca do app.
  TECNICO_INCAPACITADO: [],
  ALTERNATIVAS_INACESSIVEIS: [
    {
      key: "impedimento",
      pergunta: "O que impede as alternativas encontradas?",
      tipo: "opcoes",
      opcoes: [
        "Vegetação/mato bloqueando todas",
        "Sem acesso seguro pra fotografar",
        "Estrutura das alternativas também ruim",
        "Outro",
      ],
      obrigatoria: true,
    },
    { key: "detalhe", pergunta: "Detalhe adicional (opcional)", tipo: "texto", obrigatoria: false },
  ],
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

/** Monta o texto de justificativa a partir do motivo + respostas do Q&A (ou do Assistente de Vistoria). */
export function gerarJustificativaRecusa(
  motivo: RecusaMotivo,
  respostas: Record<string, string>
): string {
  const label = RECUSA_MOTIVO_LABEL[motivo];
  if (motivo === "SEM_POSTES") {
    return "Vistoria recusada — nenhum poste alternativo encontrado num raio de 100m do equipamento original.";
  }
  if (motivo === "SINAL_RUIM_APOS_TROCA") {
    const claro = respostas.rsrp_claro?.trim();
    const vivo = respostas.rsrp_vivo?.trim();
    const medidas = claro || vivo ? ` Último RSRP medido: Claro ${claro || "?"} dBm, Vivo ${vivo || "?"} dBm.` : "";
    return `Vistoria recusada — sinal ruim (RSRP ≤ -102 dBm nas duas operadoras) mesmo após trocar de poste.${medidas}`;
  }
  if (motivo === "SINAL_FORA_PADRAO") {
    const claro = respostas.rsrp_claro?.trim();
    const vivo = respostas.rsrp_vivo?.trim();
    const medidas = claro || vivo ? ` RSRP medido: Claro ${claro || "?"} dBm, Vivo ${vivo || "?"} dBm.` : "";
    return `Vistoria recusada — sinal (RSRP) fora do padrão aceito pela CPFL (≤ -102 dBm nas duas operadoras).${medidas}`;
  }
  if (motivo === "SINAL_SEM_MEDICAO") {
    return "Vistoria recusada — não foi possível medir o RSRP das duas operadoras no local.";
  }
  if (motivo === "CONDOMINIO_ACESSO_BLOQUEADO") {
    return "Impedimento registrado — condomínio com responsável contatado, mas acesso não foi liberado.";
  }
  if (motivo === "CONDOMINIO_SEM_CONTATO") {
    return "Impedimento registrado — não foi possível contato com o responsável/administração do condomínio.";
  }
  if (motivo === "AREA_DIFICIL_ACESSO") {
    const dificuldade = respostas.dificuldade?.trim();
    const descricao = respostas.descricao?.trim();
    return `Impedimento registrado — área de difícil acesso${dificuldade ? ` (${dificuldade})` : ""}.${descricao ? ` ${descricao}` : ""}`;
  }
  if (motivo === "OUTRO_PROBLEMA_IMPEDE") {
    const descricao = respostas.descricao?.trim();
    return `Impedimento registrado — ${descricao || "problema relatado pelo técnico impede a realização da vistoria."}`;
  }
  const partes = RECUSA_PERGUNTAS[motivo]
    .map((p) => respostas[p.key]?.trim())
    .filter((v): v is string => !!v);
  return `Vistoria recusada — ${label}.${partes.length ? " " + partes.join(" ") : ""}`;
}
