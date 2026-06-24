"""
config.py — Configurações globais do worker VistoMap
Carrega variáveis do .env e expõe como atributos tipados.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Carrega .env do mesmo diretório do worker
_ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(_ENV_PATH)


class Config:
    # ─── Banco de dados ───────────────────────────────────────────────────────
    DB_HOST: str    = os.getenv("DB_HOST",     "172.31.2.67")
    DB_USER: str    = os.getenv("DB_USER",     "glpi_user")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "!!N@n$3n")
    DB_NAME: str    = os.getenv("DB_NAME",     "glpi")
    DB_PORT: int    = int(os.getenv("DB_PORT",  "3306"))

    # ─── Diretórios (Linux) ───────────────────────────────────────────────────
    _BASE = "/var/www/html/glpi/plugins/vistomapprojetos"

    TEMPLATES_DIR: Path = Path(os.getenv("TEMPLATES_DIR",  f"{_BASE}/templates"))
    UPLOADS_DIR:   Path = Path(os.getenv("UPLOADS_DIR",    f"{_BASE}/uploads"))
    FILES_DIR:     Path = Path(os.getenv("FILES_DIR",      f"{_BASE}/files"))
    APPROVED_DIR:  Path = Path(os.getenv("APPROVED_DIR",   f"{_BASE}/ProjetosAprovados"))
    LOGS_DIR:      Path = Path(os.getenv("LOGS_DIR",       f"{_BASE}/logs"))
    LOG_FILE:      Path = Path(os.getenv("LOG_FILE",       f"{_BASE}/logs/worker.log"))

    # Lock de execução única (compatível com flock)
    LOCK_FILE: Path = Path(os.getenv("LOCK_FILE", "/tmp/vistomap_worker.lock"))

    # Imagem de fallback quando upload não existe/está corrompido
    FALLBACK_IMAGE: Path = TEMPLATES_DIR / "assets" / "sem-imagem.jpg"

    # ─── IDs fixos dos dropdowns de controle ─────────────────────────────────
    # glpi_plugin_fields_pendnciafielddropdowns
    PENDENCIA_CPFL_ID:        int = 1
    PENDENCIA_NANSEN_ID:      int = 2
    SEM_PENDENCIAS_ID:        int = 3

    # glpi_plugin_fields_statusvistoriafielddropdowns
    STATUS_APROVADO_ID:       int = 3
    STATUS_REPROVADO_ID:      int = 4
    STATUS_EM_ANALISE_ID:     int = 5
