export interface CompressedImage {
  dataUrl: string;
  size: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  maxSize = 1280,
  quality = 0.78
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img as unknown as ImageBitmap;
  });

  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.round(bitmap.width * ratio);
  const targetH = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, targetW, targetH);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return {
    dataUrl,
    size: Math.round((dataUrl.length * 3) / 4),
    width: targetW,
    height: targetH,
  };
}
