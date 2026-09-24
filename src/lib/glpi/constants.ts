import "server-only";

export const TABLE_NE = "glpi_networkequipments";
export const TABLE_FIELDS = "glpi_plugin_fields_networkequipmentdispositivosderedes";
export const TABLE_LOCATIONS = "glpi_locations";
export const TABLE_USERS = "glpi_users";
export const TABLE_STATES = "glpi_states";
export const TABLE_AUX = process.env.GLPI_AUX_TABLE ?? "glpi_plugin_vistomap_projects";
/**
 * Tabela da aba nativa "VistoMap - Projetos" (análise/aprovação de PDF de
 * projeto), gerenciada pela classe PHP PluginVistomapprojetosProject —
 * DIFERENTE de TABLE_AUX (glpi_plugin_vistomap_projects, tracking interno
 * de is_repeat/approval_status do fluxo de vistoria). cancelarVistoria()
 * também limpa aqui, senão um projeto que já tinha ido a análise/aprovação
 * fica órfão com status "in_review"/"approved" mesmo com a vistoria de
 * volta em "A Vistoriar".
 */
export const TABLE_PROJETOS_PLUGIN = "glpi_plugin_vistomapprojetos_projects";
export const ITEMTYPE_NE = "NetworkEquipment";

/**
 * Concessionária (CPFL Paulista/Piratininga/Santa Cruz) — filtro global do
 * dashboard (/painel), criado em 2026-09-24. Único dropdown já 100%
 * preenchido na base (0 registros sem valor, conferido na criação deste
 * filtro), por isso não precisa de tratamento pra "sem concessionária".
 */
export const CONCESSIONARIA_COLUMN = "plugin_fields_concessionriafielddropdowns_id";
export const TABLE_CONCESSIONARIA = "glpi_plugin_fields_concessionriafielddropdowns";

/**
 * Whitelist: campo do payload  →  tabela GLPI Fields que armazena a opção.
 * O nome do field segue o padrão do plugin GLPI Fields:
 *   `plugin_fields_<slug>fielddropdowns_id`
 * E a tabela é `glpi_plugin_fields_<slug>fielddropdowns`.
 */
export const DROPDOWN_TABLES = {
  equipamento: "glpi_plugin_fields_equipamentofielddropdowns",
  tipodeantena: "glpi_plugin_fields_tipodeantenafielddropdowns",
  ganhodbi: "glpi_plugin_fields_ganhodbifielddropdowns",
  mododeoperacao: "glpi_plugin_fields_mododeoperaofielddropdowns",
  operadorafourg: "glpi_plugin_fields_operadorafourgfielddropdowns",
  // "tipodematerial" deixou de ser dropdown no GLPI (virou campo de texto
  // livre, materialfield) — ver UPDATABLE_COLUMNS/SELECT_BASE em equipments.ts.
  tensao: "glpi_plugin_fields_tensofielddropdowns",
  alimentacaodoequipamento: "glpi_plugin_fields_alimentaodoequipamentofielddropdowns",
  localdeinstalacao: "glpi_plugin_fields_localdeinstalaofielddropdowns",
  tensovfield: "glpi_plugin_fields_tensovfielddropdowns",
  tipoifield: "glpi_plugin_fields_tipoifielddropdowns",
  tipollfield: "glpi_plugin_fields_tipollfielddropdowns",
  motivoReprovacaoCpfl: "glpi_plugin_fields_motivoreprovacaocpflfielddropdowns",
} as const;

export type DropdownKey = keyof typeof DROPDOWN_TABLES;

/** Mapeia DropdownKey → coluna FK na tabela TABLE_FIELDS. */
export const DROPDOWN_COLUMNS: Record<DropdownKey, string> = {
  equipamento: "plugin_fields_equipamentofielddropdowns_id",
  tipodeantena: "plugin_fields_tipodeantenafielddropdowns_id",
  ganhodbi: "plugin_fields_ganhodbifielddropdowns_id",
  mododeoperacao: "plugin_fields_mododeoperaofielddropdowns_id",
  operadorafourg: "plugin_fields_operadorafourgfielddropdowns_id",
  tensao: "plugin_fields_tensofielddropdowns_id",
  alimentacaodoequipamento: "plugin_fields_alimentaodoequipamentofielddropdowns_id",
  localdeinstalacao: "plugin_fields_localdeinstalaofielddropdowns_id",
  tensovfield: "plugin_fields_tensovfielddropdowns_id",
  tipoifield: "plugin_fields_tipoifielddropdowns_id",
  tipollfield: "plugin_fields_tipollfielddropdowns_id",
  motivoReprovacaoCpfl: "plugin_fields_motivoreprovacaocpflfielddropdowns_id",
};

/**
 * Status do plugin: 1=Pendente (inicial), 3=Aprovado, 4=Reprovado,
 * 5=Em análise, 6=AGUARDANDO VISTORIA.
 *
 * 3/4 são a decisão da CONCESSIONÁRIA, registrada por ela direto no GLPI —
 * o VistoMap só lê (ver src/lib/glpi/cpfl.ts). Não confundir com a aprovação
 * INTERNA do analista (aprovarVistoria), que deixa o status em 5 e marca
 * aux.approval_status.
 */
export const STATUS_VISTORIA_PENDENTE = 1;
export const STATUS_VISTORIA_APROVADO = 3;
export const STATUS_VISTORIA_REPROVADO = 4;
export const STATUS_VISTORIA_EM_ANALISE = 5;
export const STATUS_VISTORIA_AGUARDANDO_VISTORIA = 6;
/** Aprovação da concessionária com ressalva — projeto segue aprovado, mas fica de pé um apontamento pra Nansen resolver (ver /painel/cpfl). */
export const STATUS_VISTORIA_APROVADO_COM_PENDENCIAS = 7;

/** Pendência: 1 = "Pendência CPFL", 2 = "Pendência Nansen", 3 = "Sem Pendências". */
export const PENDENCIA_CPFL = 1;
export const PENDENCIA_NANSEN = 2;
export const PENDENCIA_SEM = 3;
export const TABLE_PENDENCIA = "glpi_plugin_fields_pendnciafielddropdowns";

/**
 * Situação operacional da vistoria (campo separado de statusvistoria).
 * Dropdown: glpi_plugin_fields_situaodavistoriafielddropdowns.
 *   1 = A Vistoriar
 *   2 = Em Vistoria
 *   3 = Vistoriado
 *   4 = Aguardando Revisita
 *   5 = Em Revisita
 *   6 = Revisitado
 */
export const SITUACAO_A_VISTORIAR = 1;
export const SITUACAO_EM_VISTORIA = 2;
export const SITUACAO_VISTORIADO = 3;
export const SITUACAO_AGUARDANDO_REVISITA = 4;
export const SITUACAO_EM_REVISITA = 5;
export const SITUACAO_REVISITADO = 6;
export const SITUACAO_EM_DESLOCAMENTO = 7;
/** 8 = "Devolvida para Correção" — já existe no GLPI (dropdown criado previamente). */
export const SITUACAO_DEVOLVIDA = 8;

export const SITUACAO_COLUMN =
  "plugin_fields_situaodavistoriafielddropdowns_id";

/**
 * Detecta se uma vistoria "é revisita" olhando os 3 sinais que podem indicar
 * isso — não dá pra confiar só em `aux.is_repeat`: statusvistoria=Reprovado(4)
 * pode vir de uma decisão da CONCESSIONÁRIA gravada direto no GLPI, sem nunca
 * passar por reprovarVistoria() (único lugar que marca is_repeat=1). Caso
 * real (VIN-G-A-009, 2026-09-16): concessionária reprovou, a fila
 * Central de Reprovações mostrou certo (já usa essa mesma lógica composta),
 * mas atribuir/finalizar olhavam só is_repeat=0 e tratavam como vistoria
 * normal — técnico não via "Revisita" no app e o envio fechava como
 * Vistoriado em vez de Revisitado.
 */
export function isRevisitaAtual(sinais: {
  situacaoId?: number | string | null;
  statusVistoriaId?: number | string | null;
  isRepeat?: number | string | boolean | null;
}): boolean {
  const situacaoId = sinais.situacaoId != null ? Number(sinais.situacaoId) : null;
  // Reprovado pela concessionária é o sinal mais forte e sempre vence, ANTES
  // do corte de "situação já resolvida" abaixo — essa reprovação costuma vir
  // de uma edição direta no GLPI que só mexe no statusvistoria, nunca na
  // situação, então ela fica "presa" em Vistoriado(3)/Revisitado(6) do ciclo
  // anterior. Caso real (JUN-G-A-292, 2026-09-21): técnico finalizou
  // (situação=3), concessionária reprovou direto no GLPI (situação continuou
  // 3), e atribuir de novo tratava como vistoria comum em vez de revisita
  // porque o corte abaixo retornava false antes de checar o status.
  if (Number(sinais.statusVistoriaId) === STATUS_VISTORIA_REPROVADO) return true;
  // Situação já avançou pra um estado resolvido (Vistoriado/Revisitado)
  // manda, mesmo com is_repeat ainda em 1 — esse campo só é zerado quando
  // o ANALISTA aprova (aprovarVistoria), nunca quando o técnico reenvia a
  // revisita (finalizar/route.ts muda a situação, não mexe em is_repeat).
  // Sem este corte, uma vistoria já Revisitada e aguardando aprovação
  // continuava contando como revisita ATIVA só por causa do sinal velho.
  if (situacaoId === SITUACAO_VISTORIADO || situacaoId === SITUACAO_REVISITADO) {
    return false;
  }
  if (Number(sinais.isRepeat) === 1 || sinais.isRepeat === true) return true;
  if (situacaoId === SITUACAO_AGUARDANDO_REVISITA || situacaoId === SITUACAO_EM_REVISITA) {
    return true;
  }
  return false;
}

/** Status válidos da aux table (`project_status` ENUM do plugin). */
export const AUX_STATUS_PENDENTE = "PENDENTE";
export const AUX_STATUS_GERANDO = "GERANDO";
export const AUX_STATUS_GERADO = "GERADO";
export const AUX_STATUS_ERRO = "ERRO";

/** Tabela de dropdowns que armazena o nome do status da vistoria (FK de TABLE_FIELDS). */
export const TABLE_STATUS_VISTORIA =
  "glpi_plugin_fields_statusvistoriafielddropdowns";

/**
 * Mapeia GLPI `statusvistoriafielddropdowns.name` → VistoriaStatus do frontend.
 *
 * "Em análise" é o status gravado pelo backend quando o técnico finaliza (id=5).
 * Mapeamos para FINALIZADA para que a ordem saia da fila de pendentes
 * imediatamente após o envio.
 */
/**
 * Status geral do poste — campo NATIVO do GLPI (`glpi_states`, fora do
 * plugin), separado do fluxo de situação/status da vistoria. Sequência:
 * vistoria em processo → aguardando vistoria → aprovado libera pra
 * instalação → instalador assume → instalado.
 */
export const STATE_EM_PROCESSO_VISTORIA = 1;
export const STATE_AGUARDANDO_VISTORIA = 2;
export const STATE_LIBERADO_INSTALACAO = 3;
export const STATE_EM_INSTALACAO = 4;
export const STATE_INSTALADO = 5;
/** Instalador rejeitou — fica aqui até o analista decidir (escalar pra vistoria ou não). */
export const STATE_INSTALACAO_REJEITADA = 6;
/** Técnico finalizou a vistoria em campo (ainda não passou pela aprovação do CPFL). */
export const STATE_VISTORIADO = 7;

/** Avaliador CPFL — preenchido quando aprova/reprova (aprovarVistoria/reprovarVistoria). */
export const AVALIADOR_CPFL_USER_COLUMN = "users_id_avaliadordavistoriacpflfield";

/**
 * Motivo de reprovação do CPFL — dropdown dedicado (campo GLPI Fields criado
 * em 2026-09-24, 19 opções + "Outros"), preenchido pelo analista ao editar
 * uma reprovação em /painel/revisitas (EditarVistoriaModal). Substitui o
 * antigo hábito de reaproveitar `motivofield` ali, que colidia com o texto
 * livre que o TÉCNICO já escreve nesse mesmo campo ao finalizar a vistoria
 * (2 pessoas preenchendo a mesma coluna). `motivofield` continua existindo e
 * pertence exclusivamente ao fluxo do técnico — não escrever nele por aqui.
 */
export const MOTIVO_REPROVACAO_CPFL_COLUMN =
  "plugin_fields_motivoreprovacaocpflfielddropdowns_id";
export const TABLE_MOTIVO_REPROVACAO_CPFL =
  "glpi_plugin_fields_motivoreprovacaocpflfielddropdowns";
/** Texto livre complementar ao dropdown acima, mesmo campo/fluxo. */
export const DESCRICAO_DETALHADA_CPFL_COLUMN = "descricaodetalhadacpflfield";

/** Checklist de instalação — colunas sim/não em TABLE_FIELDS (yesno: 1/0). */
export const INSTALACAO_CHECKLIST_COLUMNS = {
  cintaInstalada: "cintacorretamenteinstaladafield",
  equipamentoFixado: "equipamentofixadoadequadamentefield",
  cabeamentoOrganizado: "cabeamentoorganizadofield",
  alimentacaoValidada: "alimentaovalidadafield",
  equipamentoEnergizado: "equipamentoenergizadofield",
  registroFotografico: "registrofotogrficocompletofield",
} as const;
export type InstalacaoChecklistKey = keyof typeof INSTALACAO_CHECKLIST_COLUMNS;

/** Tensão identificada — dropdown 127V/220V. */
export const INSTALACAO_TENSAO_COLUMN = "plugin_fields_tensoidentificadafielddropdowns_id";
export const TABLE_TENSAO_IDENTIFICADA = "glpi_plugin_fields_tensoidentificadafielddropdowns";

/** Instalador — FK pra glpi_users, preenchida pelo app ao assumir o poste. */
export const INSTALACAO_INSTALADOR_COLUMN = "users_id_instaladorfield";

/** Empresa terceirizada — já existia no schema, nunca populado até agora. */
export const INSTALACAO_EMPRESA_COLUMN = "plugin_fields_empresafielddropdowns_id";
export const TABLE_EMPRESA = "glpi_plugin_fields_empresafielddropdowns";

/**
 * Validador CPFL — nome + aprovado/rejeitado. Lidos (instalacoes.ts, cpfl.ts),
 * nunca escritos pelo VistoMap. Na base estão vazios: 0 de 4599 registros
 * usam o dropdown (conferido 2026-08-31) — por isso a etapa da CPFL sai de
 * `statusvistoria`, não daqui.
 */
export const VALIDADOR_CPFL_STATUS_COLUMN = "plugin_fields_validaocpflfielddropdowns_id";
export const VALIDADOR_CPFL_USER_COLUMN = "users_id_validadorcpflfield";
export const TABLE_VALIDACAO_CPFL = "glpi_plugin_fields_validaocpflfielddropdowns";
export const VALIDACAO_CPFL_APROVADO = 1;
export const VALIDACAO_CPFL_REJEITADO = 2;

export const STATE_NAME_TO_STATUS: Record<string, string> = {
  Pendente: "PENDENTE",
  pendente: "PENDENTE",
  PENDENTE: "PENDENTE",
  "Em campo": "EM_CAMPO",
  EM_CAMPO: "EM_CAMPO",
  "Em Campo": "EM_CAMPO",
  Finalizada: "FINALIZADA",
  Finalizado: "FINALIZADA",
  FINALIZADA: "FINALIZADA",
  Reprovada: "REPROVADA",
  Reprovado: "REPROVADA",
  REPROVADA: "REPROVADA",
  Aprovada: "APROVADA",
  Aprovado: "APROVADA",
  APROVADA: "APROVADA",
  "Em análise": "FINALIZADA",
  "Em Análise": "FINALIZADA",
};
