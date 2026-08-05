"""
file_manager.py — Operações de sistema de arquivos do worker de Instalação.

Resolve as 7 fotos fixas do Relatório Técnico Fotográfico de Instalação
(instalacao_foto1..7, salvas por src/app/api/instalacoes/[id]/finalizar/route.ts
na MESMA pasta por equipamento que a Vistoria usa — nomes diferentes,
sem colisão nenhuma).
"""
import logging
import shutil
from pathlib import Path
from typing import Dict, Optional

from config import Config

logger = logging.getLogger("vistomap_worker_instalacao")

_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

_SIGNATURES: Dict[bytes, str] = {
    b"\x89PNG": "png",
    b"\xff\xd8\xff": "jpg",
    b"RIFF": "webp",
}

# slot do PDF -> rótulo exibido no relatório (mesma ordem de PHOTO_SLOTS
# em src/app/api/instalacoes/[id]/finalizar/route.ts).
PHOTO_LABELS: Dict[int, str] = {
    1: "Chegada e inspeção",
    2: "Preparação do material",
    3: "Fixação da cinta",
    4: "Fixação do Access Point",
    5: "Teste de tensão",
    6: "Vista frontal",
    7: "Vista geral final",
}


class FileManager:

    @staticmethod
    def ensure_dir(path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        logger.debug("Diretório garantido: %s", path)

    @staticmethod
    def copy_file(src: Path, dst: Path) -> None:
        shutil.copy2(str(src), str(dst))
        logger.debug("Arquivo copiado: %s → %s", src, dst)

    def resolve_images(self, equipment_name: str) -> Dict[str, str]:
        """Resolve as 7 fotos (instalacao_foto1..7) em URIs file:// pro template."""
        uploads_dir = Config.UPLOADS_DIR / equipment_name
        result: Dict[str, str] = {}

        for idx in range(1, 8):
            img_path = self._find_image(uploads_dir, idx)
            if img_path:
                uri = self._to_file_uri(img_path)
                logger.debug("FOTO%d <- instalacao_foto%d: %s", idx, idx, img_path)
            else:
                uri = self._to_file_uri(Config.FALLBACK_IMAGE)
                logger.warning(
                    "FOTO%d (instalacao_foto%d) não encontrada em %s — usando fallback.",
                    idx, idx, uploads_dir,
                )
            result[f"FOTO{idx}"] = uri

        return result

    def _find_image(self, directory: Path, index: int) -> Optional[Path]:
        if not directory.is_dir():
            return None
        for ext in _IMAGE_EXTS:
            candidate = directory / f"instalacao_foto{index}{ext}"
            if self._is_valid_image(candidate):
                return candidate
        return None

    def _is_valid_image(self, path: Path) -> bool:
        if not path.is_file():
            return False
        if path.stat().st_size == 0:
            return False
        try:
            with path.open("rb") as fh:
                header = fh.read(12)
        except (IOError, OSError) as exc:
            logger.warning("Erro ao ler cabeçalho de %s: %s", path, exc)
            return False
        for sig in _SIGNATURES:
            if header[: len(sig)] == sig:
                return True
        logger.warning("Arquivo %s não reconhecido como imagem válida.", path)
        return False

    @staticmethod
    def _to_file_uri(path: Path) -> str:
        return f"file://{path.as_posix()}"

    @staticmethod
    def remove_if_exists(path: Path) -> bool:
        if path.is_file():
            path.unlink()
            logger.info("Arquivo removido: %s", path)
            return True
        return False
