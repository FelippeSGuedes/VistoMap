import "server-only";

export const TABLE_NE = "glpi_networkequipments";
export const TABLE_FIELDS = "glpi_plugin_fields_networkequipmentdispositivosderedes";
export const TABLE_LOCATIONS = "glpi_locations";
export const TABLE_USERS = "glpi_users";
export const TABLE_STATES = "glpi_states";
export const TABLE_AUX = process.env.GLPI_AUX_TABLE ?? "glpi_plugin_vistomap_projects";
export const ITEMTYPE_NE = "NetworkEquipment";

/**
 * Whitelist: campo do payload  →  tabela GLPI Fields que armazena a opção.
 * O nome do field segue o padrão do plugin GLPI Fields:
 *   `plugin_fields_<slug>fielddropdowns_id`
 * E a tabela é `glpi_plugin_fields_<slug>fielddropdowns`.
 */
export const DROPDOWN_TABLES = {
  tipodeantena: "glpi_plugin_fields_tipodeantenafielddropdowns",
  ganhodbi: "glpi_plugin_fields_ganhodbifielddropdowns",
  mododeoperacao: "glpi_plugin_fields_mododeoperaofielddropdowns",
  operadorafourg: "glpi_plugin_fields_operadorafourgfielddropdowns",
  tipodematerial: "glpi_plugin_fields_tipodematerialfielddropdowns",
  tensao: "glpi_plugin_fields_tensofielddropdowns",
  alimentacaodoequipamento: "glpi_plugin_fields_alimentaodoequipamentofielddropdowns",
  localdeinstalacao: "glpi_plugin_fields_localdeinstalaofielddropdowns",
  tensovfield: "glpi_plugin_fields_tensovfielddropdowns",
  tipoifield: "glpi_plugin_fields_tipoifielddropdowns",
  tipollfield: "glpi_plugin_fields_tipollfielddropdowns",
} as const;

export type DropdownKey = keyof typeof DROPDOWN_TABLES;

/** Mapeia DropdownKey → coluna FK na tabela TABLE_FIELDS. */
export const DROPDOWN_COLUMNS: Record<DropdownKey, string> = {
  tipodeantena: "plugin_fields_tipodeantenafielddropdowns_id",
  ganhodbi: "plugin_fields_ganhodbifielddropdowns_id",
  mododeoperacao: "plugin_fields_mododeoperaofielddropdowns_id",
  operadorafourg: "plugin_fields_operadorafourgfielddropdowns_id",
  tipodematerial: "plugin_fields_tipodematerialfielddropdowns_id",
  tensao: "plugin_fields_tensofielddropdowns_id",
  alimentacaodoequipamento: "plugin_fields_alimentaodoequipamentofielddropdowns_id",
  localdeinstalacao: "plugin_fields_localdeinstalaofielddropdowns_id",
  tensovfield: "plugin_fields_tensovfielddropdowns_id",
  tipoifield: "plugin_fields_tipoifielddropdowns_id",
  tipollfield: "plugin_fields_tipollfielddropdowns_id",
};

/** Status do plugin: 1=Pendente (inicial), 3=Aprovado, 4=Reprovado, 5=Em análise. */
export const STATUS_VISTORIA_PENDENTE = 1;
export const STATUS_VISTORIA_APROVADO = 3;
export const STATUS_VISTORIA_REPROVADO = 4;
export const STATUS_VISTORIA_EM_ANALISE = 5;
/** Pendência: 1 = "Pendência CPFL". */
export const PENDENCIA_CPFL = 1;

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

export const SITUACAO_COLUMN =
  "plugin_fields_situaodavistoriafielddropdowns_id";

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
