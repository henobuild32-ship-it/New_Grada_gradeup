export interface CompressOptions {
  /** Largeur max du bitmap redimensionné (défaut 1600). */
  maxWidth?: number;
  /** Hauteur max du bitmap redimensionné (défaut 1600). */
  maxHeight?: number;
  /** Qualité JPEG (0–1, défaut 0.8). */
  quality?: number;
}

/**
 * Compresse une image File vers un Blob JPEG (canvas), max 1600px, qualité 0.8.
 * Si le résultat est plus volumineux que l'original ou si la compression échoue,
 * l'original est retourné tel quel. Retourne un `File` (compatibilité upload).
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxWidth = opts.maxWidth ?? 1600;
  const maxHeight = opts.maxHeight ?? 1600;
  const quality = opts.quality ?? 0.8;

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const ratio = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
