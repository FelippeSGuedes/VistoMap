"""
file_manager.py — Operações de sistema de arquivos do worker VistoMap.

Responsabilidades:
  - Criar diretórios automaticamente
  - Localizar e validar imagens de upload
  - Retornar URIs file:// compatíveis com WeasyPrint
  - Copiar PDF aprovado
  - Remover PDFs antigos
"""
import logging
import shutil
from pathlib import Path
from typing import Dict, Optional

from config import Config

logger = logging.getLogger("vistomap_worker")

# Extensões aceitas por ordem de prioridade
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

# Assinaturas de arquivo (magic bytes) para validação rápida
_SIGNATURES: Dict[bytes, str] = {
    b"\x89PNG":           "png",
    b"\xff\xd8\xff":      "jpg",
    b"RIFF":              "webp",
}


class FileManager:

    # ------------------------------------------------------------------
    # Utilitários de diretório
    # ------------------------------------------------------------------

    @staticmethod
    def ensure_dir(path: Path) -> None:
        """Cria o diretório (e pais) se ainda não existir."""
        path.mkdir(parents=True, exist_ok=True)
        logger.debug("Diretório garantido: %s", path)

    @staticmethod
    def copy_file(src: Path, dst: Path) -> None:
        """Copia src → dst, preservando metadados."""
        shutil.copy2(str(src), str(dst))
        logger.debug("Arquivo copiado: %s → %s", src, dst)

    # ------------------------------------------------------------------
    # Resolução de imagens
    # ------------------------------------------------------------------

    def resolve_images(self, equipment_name: str) -> Dict[str, str]:
        """
        Resolve TODAS as fotos do PDF a partir das evidencias capturadas no app.
        Mapeamento dos quadros do template (registro fotografico):
          IMAGEM1 <- imagem1  (Poste completo)
          IMAGEM2 <- imagem2  (Detalhe do topo)
          IMAGEM3 <- imagem3  (Detalhe da base)
          IMAGEM4 <- imagem4  (Print Vivo)
          IMAGEM5 <- imagem5  (Print Claro)
        O video360.mp4 NAO entra no PDF.
        Usa imagem de fallback quando o arquivo nao existe ou esta corrompido.
        """
        uploads_dir = Config.UPLOADS_DIR / equipment_name
        result: Dict[str, str] = {}

        # slot do PDF == indice do arquivo imagem{N} (1..5). Video excluido.
        for idx in (1, 2, 3, 4, 5):
            img_path = self._find_image(uploads_dir, idx)
            if img_path:
                uri = self._to_file_uri(img_path)
                logger.debug("IMAGEM%d <- imagem%d: %s", idx, idx, img_path)
            else:
                uri = self._to_file_uri(Config.FALLBACK_IMAGE)
                logger.warning(
                    "IMAGEM%d (imagem%d) nao encontrada em %s — usando fallback.",
                    idx, idx, uploads_dir,
                )
            result[f"IMAGEM{idx}"] = uri

        return result

    def _find_image(self, directory: Path, index: int) -> Optional[Path]:
        """Procura imagem{index} com extensões suportadas e valida o arquivo."""
        if not directory.is_dir():
            return None

        for ext in _IMAGE_EXTS:
            candidate = directory / f"imagem{index}{ext}"
            if self._is_valid_image(candidate):
                return candidate
        return None

    def _is_valid_image(self, path: Path) -> bool:
        """
        Verifica:
          1. O arquivo existe
          2. Tamanho > 0
          3. Assinatura de arquivo coerente com formato de imagem
        """
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

    # ------------------------------------------------------------------
    # URIs para WeasyPrint
    # ------------------------------------------------------------------

    @staticmethod
    def _to_file_uri(path: Path) -> str:
        """Converte Path Linux em URI file:// absoluta (compatível WeasyPrint)."""
        return f"file://{path.as_posix()}"

    # ------------------------------------------------------------------
    # Limpeza de arquivos
    # ------------------------------------------------------------------

    @staticmethod
    def remove_if_exists(path: Path) -> bool:
        """Remove arquivo se existir. Retorna True se removeu."""
        if path.is_file():
            path.unlink()
            logger.info("Arquivo removido: %s", path)
            return True
        return False
