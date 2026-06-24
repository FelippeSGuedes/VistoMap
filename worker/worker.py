#!/usr/bin/env python3

import fcntl
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import Config
from database import Database
from dropdown_resolver import DropdownResolver
from file_manager import FileManager
from pdf_generator import PDFGenerator


# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────

def setup_logging() -> logging.Logger:
    Config.LOGS_DIR.mkdir(parents=True, exist_ok=True)

    fmt = logging.Formatter(
        "[%(asctime)s] [%(levelname)-8s] %(message)s",
        datefmt="%d/%m/%Y %H:%M:%S",
    )

    log = logging.getLogger("vistomap_worker")
    log.setLevel(logging.DEBUG)
    log.propagate = False

    if not log.handlers:

        fh = logging.FileHandler(
            str(Config.LOG_FILE),
            encoding="utf-8"
        )

        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        log.addHandler(fh)

        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(logging.INFO)
        ch.setFormatter(fmt)
        log.addHandler(ch)

    return log


# ─────────────────────────────────────────────────────────────
# LOCK
# ─────────────────────────────────────────────────────────────

class ExecutionLock:

    def __init__(self, lock_path: Path):
        self._path = lock_path
        self._fd = None

    def acquire(self) -> bool:
        try:
            self._fd = open(self._path, "w")
            fcntl.flock(
                self._fd.fileno(),
                fcntl.LOCK_EX | fcntl.LOCK_NB
            )

            self._fd.write(str(os.getpid()))
            self._fd.flush()

            return True

        except (IOError, OSError):

            if self._fd:
                self._fd.close()
                self._fd = None

            return False

    def release(self):

        if self._fd:

            try:
                fcntl.flock(self._fd.fileno(), fcntl.LOCK_UN)

            finally:
                self._fd.close()
                self._fd = None

            try:
                self._path.unlink(missing_ok=True)

            except OSError:
                pass


# ─────────────────────────────────────────────────────────────
# WORKER
# ─────────────────────────────────────────────────────────────

class VistomapWorker:

    def __init__(self):

        self.log = logging.getLogger("vistomap_worker")

        self.db = Database()

        self.resolver = DropdownResolver(self.db)

        self.files = FileManager()

        self.pdf = PDFGenerator()

    # ---------------------------------------------------------

    def run(self):

        t0 = time.perf_counter()

        self.log.info("=" * 60)
        self.log.info("Worker executando — PID %d", os.getpid())

        try:

            self._process_pending()

            self._process_approvals()

            self._process_rejections()

        except Exception as exc:

            self.log.critical(
                "Erro crítico no worker: %s",
                exc,
                exc_info=True
            )

        elapsed = time.perf_counter() - t0

        self.log.info(
            "Ciclo finalizado em %.2fs",
            elapsed
        )

    # ---------------------------------------------------------
    # PENDENTES
    # ---------------------------------------------------------

    def _process_pending(self):

        pending = self.db.get_pending_projects()

        if not pending:
            self.log.info("Nenhum projeto pendente.")
            return

        self.log.info(
            "Projetos pendentes encontrados: %d",
            len(pending)
        )

        for project in pending:
            self._generate_project(project)

    # ---------------------------------------------------------

    def _generate_project(self, project: dict):

        name = project["equipment_name"]

        project_id = project["id"]

        self.log.info(
            "Gerando projeto: %s",
            name
        )

        self.db.update_project_status(
            project_id,
            "GERANDO"
        )

        try:

            self._cleanup_pdfs(name)

            raw_data = self.db.get_project_full_data(project)

            template_data = self.resolver.resolve_all(raw_data)

            template_data.update(
                self.files.resolve_images(name)
            )

            pdf_path = (
                Config.FILES_DIR /
                name /
                "projeto.pdf"
            )

            self.files.ensure_dir(pdf_path.parent)

            self.pdf.generate(
                template_data,
                str(pdf_path)
            )

            generated_at = datetime.now().strftime(
                "%Y-%m-%d %H:%M:%S"
            )

            self.db.update_project_generated(
                project_id,
                str(pdf_path),
                generated_at
            )

            self.log.info(
                "[OK] Projeto gerado: %s",
                name
            )

        except Exception as exc:

            self.log.error(
                "[ERRO] Falha ao gerar %s: %s",
                name,
                exc,
                exc_info=True
            )

            self.db.update_project_error(
                project_id,
                str(exc)
            )

    # ---------------------------------------------------------
    # APROVAÇÕES
    # ---------------------------------------------------------

    def _process_approvals(self):

        approved = self.db.get_projects_for_approval()

        if not approved:
            return

        self.log.info(
            "Projetos para aprovação: %d",
            len(approved)
        )

        for project in approved:
            self._approve_project(project)

    # ---------------------------------------------------------

    def _approve_project(self, project: dict):

        name = project["equipment_name"]

        project_id = project["id"]

        try:

            src = (
                Path(project["pdf_path"])
                if project.get("pdf_path")
                else Config.FILES_DIR / name / "projeto.pdf"
            )

            if not src.is_file():

                self.log.warning(
                    "PDF não encontrado: %s",
                    src
                )

                return

            dst_dir = Config.APPROVED_DIR / name

            self.files.ensure_dir(dst_dir)

            dst = dst_dir / "projeto.pdf"

            self.files.copy_file(src, dst)

            approved_at = datetime.now().strftime(
                "%Y-%m-%d %H:%M:%S"
            )

            self.db.update_project_approved(
                project_id,
                str(dst),
                approved_at
            )

            self.log.info(
                "[OK] Projeto aprovado: %s",
                name
            )

        except Exception as exc:

            self.log.error(
                "Erro aprovação %s: %s",
                name,
                exc,
                exc_info=True
            )

    # ---------------------------------------------------------
    # REPROVAÇÕES
    # ---------------------------------------------------------

    def _process_rejections(self):

        rejected = self.db.get_projects_for_rejection()

        if not rejected:
            return

        self.log.info(
            "Projetos para reprovação: %d",
            len(rejected)
        )

        for project in rejected:
            self._reject_project(project)

    # ---------------------------------------------------------

    def _reject_project(self, project: dict):

        name = project["equipment_name"]

        project_id = project["id"]

        try:

            self._cleanup_pdfs(name)

            self.db.update_project_rejected(project_id)

            self.log.info(
                "[OK] Projeto reprovado: %s",
                name
            )

        except Exception as exc:

            self.log.error(
                "Erro reprovação %s: %s",
                name,
                exc,
                exc_info=True
            )

    # ---------------------------------------------------------

    def _cleanup_pdfs(self, name: str):

        self.files.remove_if_exists(
            Config.FILES_DIR / name / "projeto.pdf"
        )

        self.files.remove_if_exists(
            Config.APPROVED_DIR / name / "projeto.pdf"
        )


# ─────────────────────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────────────────────

def main():

    log = setup_logging()

    lock = ExecutionLock(Config.LOCK_FILE)

    if not lock.acquire():

        log.warning(
            "Outra instância já está rodando."
        )

        sys.exit(0)

    log.info("Worker contínuo iniciado.")

    try:

        while True:

            try:

                VistomapWorker().run()

            except Exception as exc:

                log.error(
                    "Erro no loop principal: %s",
                    exc,
                    exc_info=True
                )

            time.sleep(10)

    except KeyboardInterrupt:

        log.info("Worker interrompido manualmente.")

    finally:

        lock.release()


if __name__ == "__main__":
    main()
