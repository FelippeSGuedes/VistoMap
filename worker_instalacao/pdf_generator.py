"""
pdf_generator.py — Renderização Jinja2 → HTML → PDF (WeasyPrint).
Mesmo fluxo do worker da Vistoria (worker/pdf_generator.py), templates
próprios em Config.TEMPLATES_DIR.
"""
import logging
from typing import Dict

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

from config import Config

logger = logging.getLogger("vistomap_worker_instalacao")


class PDFGenerator:
    """Gera o Relatório Técnico Fotográfico de Instalação em PDF."""

    def __init__(self):
        self._env: Environment | None = None

    def generate(self, data: Dict[str, str], output_path: str) -> None:
        html_str = self._render_template(data)
        self._write_pdf(html_str, output_path)
        logger.info("PDF gerado: %s", output_path)

    def _get_env(self) -> Environment:
        if self._env is None:
            self._env = Environment(
                loader=FileSystemLoader(str(Config.TEMPLATES_DIR)),
                autoescape=select_autoescape(["html", "xml"]),
                trim_blocks=True,
                lstrip_blocks=True,
            )
        return self._env

    def _render_template(self, data: Dict[str, str]) -> str:
        env = self._get_env()
        template = env.get_template("template_instalacao.html")
        return template.render(**data)

    def _write_pdf(self, html_str: str, output_path: str) -> None:
        font_config = FontConfiguration()
        css_path = Config.TEMPLATES_DIR / "style_instalacao.css"

        stylesheets = []
        if css_path.is_file():
            stylesheets.append(CSS(filename=str(css_path), font_config=font_config))
        else:
            logger.warning("style.css não encontrado em %s", css_path)

        HTML(string=html_str, base_url=str(Config.TEMPLATES_DIR)).write_pdf(
            output_path,
            stylesheets=stylesheets,
            font_config=font_config,
        )
