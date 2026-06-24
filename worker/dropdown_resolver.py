"""
dropdown_resolver.py — Resolução de campos dropdown do GLPI para texto legível.

Regras:
  - Campos dropdown: busca ID → texto na tabela glpi_plugin_fields_{field}dropdowns
  - Campos booleanos: converte 1/0 → Sim/Não
  - Campo de data:    formata do banco → dd/mm/aaaa HH:MM:SS
  - Outros campos:    retorna string limpa ou 'N/I'
"""
import logging
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger("vistomap_worker")


# ─── Mapeamento campo MySQL → tabela dropdown ─────────────────────────────────
DROPDOWN_MAP: Dict[str, str] = {
    "tipodeantenafield":           "glpi_plugin_fields_tipodeantenafielddropdowns",
    "ganhodbifield":               "glpi_plugin_fields_ganhodbifielddropdowns",
    "mododeoperaofield":           "glpi_plugin_fields_mododeoperaofielddropdowns",
    "operadorafourgfield":         "glpi_plugin_fields_operadorafourgfielddropdowns",
    "tipodematerialfield":         "glpi_plugin_fields_tipodematerialfielddropdowns",
    "tensofield":                  "glpi_plugin_fields_tensofielddropdowns",
    "alimentaodoequipamentofield": "glpi_plugin_fields_alimentaodoequipamentofielddropdowns",
    "localdeinstalaofield":        "glpi_plugin_fields_localdeinstalaofielddropdowns",
}

# ─── Campos booleanos: (valor_verdadeiro, valor_falso) ────────────────────────
BOOLEAN_MAP: Dict[str, tuple] = {
    "aterramentofield": ("Sim", "Não"),
}

# ─── Campo MySQL → chave do template Jinja2 ───────────────────────────────────
FIELD_TO_KEY: Dict[str, str] = {
    "equipment_name":              "NAME",
    "pspostefield":                "PSPOSTE",
    "endereofield":                "ENDERECO",      # Endereço (ASCII-safe)
    "municipiofield":              "MUNICIPIO",
    "latitudefield":               "LATITUDE",
    "longitudefield":              "LONGITUDE",
    "intensidadedesinalfield":     "INTENSIDADE",
    "velocidadefield":             "VELOCIDADE",
    "alturadaantenafield":         "ALTURA",
    "observaofield":               "OBSERVACAO",    # Observação (ASCII-safe)
    "project_date":                "DATE",
    # Dropdowns
    "tipodeantenafield":           "TIPODEANTENA",
    "ganhodbifield":               "GANHO",
    "mododeoperaofield":           "DEVICEMODE",
    "operadorafourgfield":         "OPERADORA",
    "tipodematerialfield":         "MATERIAL",
    "tensofield":                  "TENSAO",
    "alimentaodoequipamentofield": "ALIMENTACAO",
    "localdeinstalaofield":        "LOCALINS",
    # Booleano
    "aterramentofield":            "ATERRAMENTO",
}

_TRUTHY = {1, "1", True, "true", "True", "sim", "Sim", "SIM", "yes", "Yes", "YES"}


class DropdownResolver:
    """
    Converte os dados brutos do banco (IDs, inteiros, datas) nos valores
    de texto que preencherão o template HTML/Jinja2.
    """

    def __init__(self, db):
        self._db = db
        # Cache: { tabela: { id: texto } }
        self._cache: Dict[str, Dict[int, str]] = {}

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def resolve_all(self, raw: Dict[str, Any]) -> Dict[str, str]:
        """
        Recebe o dicionário bruto do banco e retorna o dicionário de
        variáveis prontas para o template.
        """
        resolved: Dict[str, str] = {}

        for field, key in FIELD_TO_KEY.items():
            value = raw.get(field)

            if field in DROPDOWN_MAP:
                resolved[key] = self._resolve_dropdown(field, value)

            elif field in BOOLEAN_MAP:
                resolved[key] = self._resolve_boolean(field, value)

            elif field == "project_date":
                resolved[key] = self._format_date(value)

            else:
                resolved[key] = self._clean(value)

        return resolved

    # ------------------------------------------------------------------
    # Resolução individual
    # ------------------------------------------------------------------

    def _resolve_dropdown(self, field: str, value: Any) -> str:
        """Converte ID numérico de dropdown em texto legível."""
        if value is None or value == "" or value == 0:
            return "N/I"

        try:
            dropdown_id = int(value)
        except (ValueError, TypeError):
            return str(value)

        table = DROPDOWN_MAP[field]
        if table not in self._cache:
            self._cache[table] = {}

        if dropdown_id not in self._cache[table]:
            text = self._db.get_dropdown_text(table, dropdown_id)
            self._cache[table][dropdown_id] = text if text else "N/I"

        return self._cache[table][dropdown_id]

    def _resolve_boolean(self, field: str, value: Any) -> str:
        true_label, false_label = BOOLEAN_MAP[field]
        return true_label if value in _TRUTHY else false_label

    def _format_date(self, value: Any) -> str:
        """
        Formata data vinda do banco (datetime ou string) para dd/mm/aaaa HH:MM:SS.
        NUNCA usa datetime.now() — a data deve vir exclusivamente do banco.
        """
        if value is None:
            return "N/I"

        # PyMySQL já retorna datetime para colunas DATETIME
        if hasattr(value, "strftime"):
            return value.strftime("%d/%m/%Y %H:%M:%S")

        # Fallback: string no formato MySQL
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(str(value), fmt).strftime("%d/%m/%Y %H:%M:%S")
            except ValueError:
                continue

        return str(value)

    @staticmethod
    def _clean(value: Any) -> str:
        if value is None:
            return "N/I"
        s = str(value).strip()
        return s if s else "N/I"
