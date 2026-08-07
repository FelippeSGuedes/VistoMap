#!/usr/bin/env python3
"""Render de teste do template de Instalação — NAO toca no banco nem na
produção. Usa fotos reais de um equipamento (troque EQUIPMENT abaixo) e
gera /tmp/test_instalacao.pdf. Rodar no servidor (precisa de WeasyPrint
com as libs nativas — não funciona num Windows sem GTK)."""
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

TEMPLATES_DIR = Path("/var/www/html/glpi/plugins/vistomapprojetos/templates")
EQUIPMENT = "CAM-P-A-622"
UPLOADS = Path(f"/var/www/html/glpi/plugins/vistomapprojetos/uploads/{EQUIPMENT}")
OUT = "/tmp/test_instalacao.pdf"


def uri(p: Path) -> str:
    return f"file://{p.as_posix()}"


data = {
    "NAME": EQUIPMENT,
    "DATE": "05/08/2026 14:00:00",
    "STATUSGERAL": "Instalado",
    "MUNICIPIO": "Campinas",
    "PSPOSTE": "123456",
    "ALTURAPOSTE": "11",
    "ENDERECO": "Rua Exemplo, 1000 - Centro",
    "LATITUDE": "-22.907104",
    "LONGITUDE": "-47.063240",
    "OBSERVACAO": "Instalação concluída sem intercorrências.",
    "MATERIAL": "Concreto",
    "DAN": "600",
    "EQUIPAMENTO": "Access Point",
    "FORMATO": "Retangular",
    "TENSAOCONTEXTO": "220 V",
    "LOCALINSTALACAO": "Topo do poste, lado norte",
    "ALIMENTACAO": "Rede CPFL",
    "EMPRESA": "Terceirizada XPTO",
    "TENSAOIDENTIFICADA": "220V",
    "VALIDADORSTATUS": "Aprovado",
    "ATERRAMENTO": "Sim",
    "CHAVE": "Não",
    "REDEPRIMARIA": "Sim",
    "REDESECUNDARIA": "Não",
    "RELIGADOR": "Não",
    "TRANSFORMADOR": "Sim",
    "INSTALARTP": "Sim",
    "CHECKLIST_CINTA": "Sim",
    "CHECKLIST_FIXACAO": "Sim",
    "CHECKLIST_CABEAMENTO": "Sim",
    "CHECKLIST_ALIMENTACAO": "Sim",
    "CHECKLIST_ENERGIZADO": "Sim",
    "CHECKLIST_REGISTRO": "Sim",
    "INSTALADOR": "João Silva",
    "VALIDADORNOME": "Maria Souza",
    "DATAINSTALACAO": "05/08/2026 13:30:00",
    "FOTO1": uri(UPLOADS / "instalacao_foto1.png"),
    "FOTO2": uri(UPLOADS / "instalacao_foto2.png"),
    "FOTO3": uri(UPLOADS / "instalacao_foto3.png"),
    "FOTO4": uri(UPLOADS / "instalacao_foto4.png"),
    "FOTO5": uri(UPLOADS / "instalacao_foto5.png"),
    "FOTO6": uri(UPLOADS / "instalacao_foto6.png"),
    "FOTO7": uri(UPLOADS / "instalacao_foto7.png"),
}

env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)
html_str = env.get_template("template_instalacao.html").render(**data)

font_config = FontConfiguration()
css = CSS(filename=str(TEMPLATES_DIR / "style_instalacao.css"), font_config=font_config)
HTML(string=html_str, base_url=str(TEMPLATES_DIR)).write_pdf(
    OUT, stylesheets=[css], font_config=font_config
)
print("OK ->", OUT)
