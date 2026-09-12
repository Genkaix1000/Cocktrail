import { DRINK_IMAGE_TARGET_PX } from "./staticDrinkImages";

export type CropRect = {
  /** Origen en coords de la imagen natural. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** Recorta un square de la imagen y exporta WebP 512×512. */
export async function cropImageToWebpDataUrl(
  source: CanvasImageSource,
  crop: CropRect,
  quality = 0.82,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = DRINK_IMAGE_TARGET_PX;
  canvas.height = DRINK_IMAGE_TARGET_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, DRINK_IMAGE_TARGET_PX, DRINK_IMAGE_TARGET_PX);
  return canvas.toDataURL("image/webp", quality);
}

/** Square centrado del lado mínimo (para imágenes ≤ target o skip-crop rápido). */
export function centeredSquareCrop(naturalWidth: number, naturalHeight: number): CropRect {
  const side = Math.min(naturalWidth, naturalHeight);
  return {
    sx: Math.floor((naturalWidth - side) / 2),
    sy: Math.floor((naturalHeight - side) / 2),
    sw: side,
    sh: side,
  };
}

export function needsCropTool(naturalWidth: number, naturalHeight: number): boolean {
  return naturalWidth > DRINK_IMAGE_TARGET_PX || naturalHeight > DRINK_IMAGE_TARGET_PX;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}
