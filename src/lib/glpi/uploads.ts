import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sanitizeFolderName } from "@/lib/sanitize";

const BASE_PATH =
  process.env.GLPI_UPLOAD_PATH ??
  "/var/www/html/glpi/plugins/vistomapprojetos/uploads";

export interface SavedFile {
  filename: string;
  absolutePath: string;
  size: number;
}

export interface FilePayload {
  filename: string;
  data: Buffer;
}

/**
 * Garante que a pasta `${BASE_PATH}/<equipamento>/` existe e retorna o path absoluto.
 */
export async function ensureEquipmentFolder(equipmentName: string): Promise<string> {
  const folder = sanitizeFolderName(equipmentName);
  const targetDir = path.join(BASE_PATH, folder);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

export function buildEquipmentFilePath(
  equipmentName: string,
  filename: string
): string {
  const folder = sanitizeFolderName(equipmentName);
  return path.join(BASE_PATH, folder, filename);
}

/**
 * Salva uma coleção de arquivos para um equipamento.
 * Substitui automaticamente os existentes (modo 0644).
 */
export async function saveEquipmentFiles(
  equipmentName: string,
  files: ReadonlyArray<FilePayload | null | undefined>
): Promise<SavedFile[]> {
  const targetDir = await ensureEquipmentFolder(equipmentName);
  const saved: SavedFile[] = [];
  for (const file of files) {
    if (!file || !file.data || file.data.byteLength === 0) continue;
    const absolutePath = path.join(targetDir, file.filename);
    await fs.writeFile(absolutePath, file.data, { mode: 0o644 });
    saved.push({
      filename: file.filename,
      absolutePath,
      size: file.data.byteLength,
    });
  }
  return saved;
}

/**
 * Decodifica um data URL base64 (data:image/...;base64,...) em buffer cru.
 */
export function decodeDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}
