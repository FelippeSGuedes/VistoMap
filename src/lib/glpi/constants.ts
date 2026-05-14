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
};

/** Status do plugin: 5 = "Em análise". */
export const STATUS_VISTORIA_EM_ANALISE = 5;
/** Pendência: 1 = "Pendência CPFL". */
export const PENDENCIA_CPFL = 1;

/** Status interno aux table. */
export const AUX_STATUS_PENDENTE = "PENDENTE";
export const AUX_STATUS_EM_CAMPO = "EM_CAMPO";

/** Mapeia GLPI state.name → VistoriaStatus do frontend. */
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
  "Em análise": "PENDENTE",
};
