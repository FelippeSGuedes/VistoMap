#!/usr/bin/env python3
"""Render de teste do template novo — NAO toca no banco nem na producao.
Usa as fotos reais de um equipamento e gera /tmp/test_projeto.pdf."""
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

TEMPLATES_DIR = Path("/data/glpi/plugins/vistomapprojetos/templates")
UPLOADS = Path("/data/glpi/plugins/vistomapprojetos/uploads/CAM-P-A-622")
OUT = "/tmp/test_projeto.pdf"


def uri(p: Path) -> str:
    return f"file://{p.as_posix()}"


data = {
    "NAME": "CAM-P-A-622",
    "DATE": "24/06/2026",
    "PSPOSTE": "123456",
    "ENDERECO": "Rua Exemplo, 1000 - Centro",
    "MUNICIPIO": "Campinas",
    "LATITUDE": "-22.9056",
    "LONGITUDE": "-47.0608",
    "MATERIAL": "Concreto",
    "ALTURAPOSTE": "11",
    "ATERRAMENTO": "Sim",
    "INSTALARTP": "Sim",
    "TENSAOV": "220 V",
    "OBSERVACAO": "Instalacao concluida sem intercorrencias.",
    # Rede móvel por operadora
    "TIPOCLARO": "4G+",
    "RSRPCLARO": "-95 dBm",
    "TIPOVIVO": "4G",
    "RSRPVIVO": "-102 dBm",
    "IMAGEM1": uri(UPLOADS / "imagem1.png"),
    "IMAGEM2": uri(UPLOADS / "imagem2.png"),
    "IMAGEM3": uri(UPLOADS / "imagem3.png"),
    "IMAGEM4": uri(UPLOADS / "imagem4.png"),
    "IMAGEM5": uri(UPLOADS / "imagem5.png"),
}

env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)
html_str = env.get_template("template.html").render(**data)

font_config = FontConfiguration()
css = CSS(filename=str(TEMPLATES_DIR / "style.css"), font_config=font_config)
HTML(string=html_str, base_url=str(TEMPLATES_DIR)).write_pdf(
    OUT, stylesheets=[css], font_config=font_config
)
print("OK ->", OUT)
