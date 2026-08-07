"""
resolver.py — Converte os dados brutos do banco (já com nomes de dropdown
resolvidos via JOIN em database.py) nos valores finais que preenchem o
template Jinja2. Bem mais simples que o resolver da Vistoria: como os
JOINs já trazem o texto legível (d_eq.name, d_tid.name etc.), aqui só
formata booleanos (yesno -> Sim/Não), data e "N/I" para vazio.
"""
import logging
from datetime import datetime
from typing import Any, Dict

logger = logging.getLogger("vistomap_worker_instalacao")

# Campo bruto do banco -> chave do template Jinja2.
FIELD_TO_KEY: Dict[str, str] = {
    "equipment_name": "NAME",
    "status_geral_nome": "STATUSGERAL",
    "municipio": "MUNICIPIO",
    "ps_poste": "PSPOSTE",
    "altura_poste": "ALTURAPOSTE",
    "endereco": "ENDERECO",
    "observacao": "OBSERVACAO",
    "material": "MATERIAL",
    "dan": "DAN",
    "equipamento": "EQUIPAMENTO",
    "tensao_contexto": "TENSAOCONTEXTO",
    "local_instalacao": "LOCALINSTALACAO",
    "alimentacao": "ALIMENTACAO",
    "empresa": "EMPRESA",
    "tensao_identificada": "TENSAOIDENTIFICADA",
    "validador_cpfl_status": "VALIDADORSTATUS",
}

# Campos booleanos (yesno: 1/0/None) -> Sim/Não/N/I.
BOOLEAN_FIELDS: Dict[str, str] = {
    "aterramento": "ATERRAMENTO",
    "chave": "CHAVE",
    "rede_primaria": "REDEPRIMARIA",
    "rede_secundaria": "REDESECUNDARIA",
    "religador": "RELIGADOR",
    "transformador": "TRANSFORMADOR",
    "instalar_tp": "INSTALARTP",
    "checklist_cinta": "CHECKLIST_CINTA",
    "checklist_fixacao": "CHECKLIST_FIXACAO",
    "checklist_cabeamento": "CHECKLIST_CABEAMENTO",
    "checklist_alimentacao": "CHECKLIST_ALIMENTACAO",
    "checklist_energizado": "CHECKLIST_ENERGIZADO",
    "checklist_registro": "CHECKLIST_REGISTRO",
}

_TRUTHY = {1, "1", True}


class Resolver:
    """Converte o dict bruto (raw do banco) no dict final pro template."""

    def resolve_all(self, raw: Dict[str, Any]) -> Dict[str, str]:
        resolved: Dict[str, str] = {}

        for field, key in FIELD_TO_KEY.items():
            resolved[key] = self._clean(raw.get(field))

        for field, key in BOOLEAN_FIELDS.items():
            resolved[key] = self._resolve_boolean(raw.get(field))

        resolved["INSTALADOR"] = self._clean(
            raw.get("instalador_nome_completo") or raw.get("instalador_login")
        )
        resolved["VALIDADORNOME"] = self._clean(
            raw.get("validador_cpfl_nome_completo") or raw.get("validador_cpfl_login")
        )

        resolved["DATE"] = self._format_date(raw.get("project_date"))
        resolved["DATAINSTALACAO"] = self._format_date(raw.get("data_instalacao"))

        # Todas as instalações deste relatório são em poste — fixo, não
        # depende do dropdown "formato" do GLPI (que às vezes vem vazio ou
        # com um valor genérico). Pedido pelos avaliadores em 2026-08-07.
        resolved["FORMATO"] = "Estrutura Vertical (Poste)"

        resolved["LATITUDE"] = self._format_coord(raw.get("latitude"))
        resolved["LONGITUDE"] = self._format_coord(raw.get("longitude"))

        return resolved

    @staticmethod
    def _resolve_boolean(value: Any) -> str:
        if value is None:
            return "N/I"
        return "Sim" if value in _TRUTHY else "Não"

    @staticmethod
    def _format_date(value: Any) -> str:
        if value is None:
            return "N/I"
        if hasattr(value, "strftime"):
            return value.strftime("%d/%m/%Y %H:%M:%S")
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(str(value), fmt).strftime("%d/%m/%Y %H:%M:%S")
            except ValueError:
                continue
        return str(value)

    @staticmethod
    def _format_coord(value: Any) -> str:
        if value is None:
            return "N/I"
        try:
            return f"{float(value):.6f}"
        except (TypeError, ValueError):
            return "N/I"

    @staticmethod
    def _clean(value: Any) -> str:
        if value is None:
            return "N/I"
        s = str(value).strip()
        return s if s else "N/I"
