"""
pdf_generator.py — Renderização Jinja2 → HTML → PDF (WeasyPrint).

Fluxo:
  dados resolvidos (dict)
       ↓
  Jinja2 renderiza template.html
       ↓
  WeasyPrint converte HTML+CSS em PDF
       ↓
  Arquivo projeto.pdf salvo no disco
"""
import logging
from pathlib import Path
from typing import Dict

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

from config import Config

logger = logging.getLogger("vistomap_worker")


class PDFGenerator:
    """Gera PDF profissional a partir dos dados do projeto."""

    def __init__(self):
        self._env: Environment | None = None

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def generate(self, data: Dict[str, str], output_path: str) -> None:
        """
        Renderiza o template Jinja2 com *data* e salva o PDF em *output_path*.

        Args:
            data:        Dicionário de variáveis resolvidas (NAME, PSPOSTE, etc.)
                         incluindo IMAGEM1/2/3 como URIs file://.
            output_path: Caminho absoluto de destino do PDF (ex: /.../.../projeto.pdf).
        """
        html_str = self._render_template(data)
        self._write_pdf(html_str, output_path)
        logger.info("PDF gerado: %s", output_path)

    # ------------------------------------------------------------------
    # Jinja2
    # ------------------------------------------------------------------

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
        template = env.get_template("template.html")
        return template.render(**data)

    # ------------------------------------------------------------------
    # WeasyPrint
    # ------------------------------------------------------------------

    def _write_pdf(self, html_str: str, output_path: str) -> None:
        font_config = FontConfiguration()
        css_path = Config.TEMPLATES_DIR / "style.css"

        stylesheets = []
        if css_path.is_file():
            stylesheets.append(
                CSS(filename=str(css_path), font_config=font_config)
            )
        else:
            logger.warning("style.css não encontrado em %s", css_path)

        HTML(
            string=html_str,
            base_url=str(Config.TEMPLATES_DIR),
        ).write_pdf(
            output_path,
            stylesheets=stylesheets,
            font_config=font_config,
        )
