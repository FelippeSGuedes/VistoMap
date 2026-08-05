"""
config.py — Configurações globais do worker de Instalação (Fase 3).

Processo TOTALMENTE isolado do worker/ da Vistoria: diretórios, lock,
log e tabela de fila próprios. Nunca importa nem é importado por
worker/ — a única coisa em comum é o mesmo banco MySQL do GLPI (lido
em modo mais restrito: só tabelas do módulo de Instalação + leitura do
contexto que a Vistoria já preencheu).
"""
import os
from pathlib import Path
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(_ENV_PATH)


class Config:
    # ─── Banco de dados ────────────────────────────────────────────────────
    DB_HOST: str = os.getenv("DB_HOST", "172.31.2.67")
    DB_USER: str = os.getenv("DB_USER", "glpi_user")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "glpi")
    DB_PORT: int = int(os.getenv("DB_PORT", "3306"))

    # ─── Diretórios (Linux) ────────────────────────────────────────────────
    # Mesma base do plugin (uploads é compartilhado com a Vistoria — pasta
    # por equipamento — mas os nomes de arquivo nunca colidem: a Vistoria
    # salva imagemN.png, a Instalação salva instalacao_fotoN.png).
    _BASE = "/var/www/html/glpi/plugins/vistomapprojetos"

    # MESMA pasta de templates da Vistoria (não uma cópia) — só assim os
    # dois relatórios reaproveitam os logos/assets já existentes lá
    # (logo-cpfl.png, logo-nansen.png, footer-marker.png, sem-imagem.jpg)
    # sem duplicar arquivo nenhum. Seguro: os dois workers só LEEM desse
    # diretório, nunca escrevem nele — o nome do arquivo do template
    # (template_instalacao.html / style_instalacao.css) é que garante que
    # não colide com template.html / style.css da Vistoria.
    TEMPLATES_DIR: Path = Path(os.getenv("INSTALACAO_TEMPLATES_DIR", f"{_BASE}/templates"))
    UPLOADS_DIR: Path = Path(os.getenv("GLPI_UPLOAD_PATH", f"{_BASE}/uploads"))
    FILES_DIR: Path = Path(os.getenv("INSTALACAO_FILES_DIR", f"{_BASE}/files_instalacao"))
    APPROVED_DIR: Path = Path(os.getenv("INSTALACAO_APPROVED_DIR", f"{_BASE}/InstalacoesAprovadas"))
    LOGS_DIR: Path = Path(os.getenv("INSTALACAO_LOGS_DIR", f"{_BASE}/logs"))
    LOG_FILE: Path = Path(os.getenv("INSTALACAO_LOG_FILE", f"{_BASE}/logs/worker_instalacao.log"))

    # Lock de execução única — arquivo próprio, nunca disputa com o da Vistoria.
    LOCK_FILE: Path = Path(os.getenv("INSTALACAO_LOCK_FILE", "/tmp/vistomap_worker_instalacao.lock"))

    # Imagem de fallback quando uma das 7 fotos não existe/está corrompida.
    FALLBACK_IMAGE: Path = TEMPLATES_DIR / "assets" / "sem-imagem.jpg"

    # ─── Tabela de fila (glpi_plugin_vistomap_instalacao_projects) ────────
    QUEUE_TABLE: str = "glpi_plugin_vistomap_instalacao_projects"

    # ─── IDs fixos — validação CPFL (glpi_plugin_fields_validaocpflfielddropdowns) ─
    VALIDACAO_CPFL_APROVADO: int = 1
    VALIDACAO_CPFL_REJEITADO: int = 2

    # states_id nativo (glpi_states) — instalado, fora do plugin_fields.
    STATE_INSTALADO: int = 5
