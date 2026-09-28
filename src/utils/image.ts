/**
 * Decode a Blob through an <img> element and run `fn` with it.
 *
 * Per the HTML spec, <img> ALWAYS applies the EXIF orientation flag, unlike
 * createImageBitmap (whose default has flipped across browser versions). Going
 * through an <img> makes every canvas re-encode — avatar crop, word picture,
 * rotation — land upright no matter how the photo was shot.
 */
async function withDecodedImage<T>(file: Blob, fn: (img: HTMLImageElement) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });
    try {
      await img.decode();
    } catch {
      // onload already fired, so the frame is usable; some browsers throw here
      // for exotic formats — safe to continue.
    }
    return await fn(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downscale an image file to maxDim on its longest edge; returns a compressed Blob. */
export async function downscaleImage(file: Blob, maxDim = 1024, quality = 0.85): Promise<{ blob: Blob; mime: string }> {
  return withDecodedImage(file, async (img) => {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, quality);
    });
    return { blob, mime };
  });
}

/** Read a File/Blob as a data URL (for JSON export). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Make a small square profile picture: center-crop the longest side and
 * downscale (256px keeps it crisp on high-DPI screens while staying tiny in
 * IndexedDB). `zoom` crops tighter — 2 shows only the middle half, letting the
 * student frame a face to fill the circle. Returns a JPEG blob.
 */
export async function downscaleAvatar(file: Blob, size = 256, quality = 0.85, zoom = 1): Promise<{ blob: Blob; mime: string }> {
  return withDecodedImage(file, async (img) => {
    const z = Math.max(1, zoom);
    const side = Math.min(img.naturalWidth, img.naturalHeight) / z;
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality);
    });
    return { blob, mime: 'image/jpeg' };
  });
}

/**
 * Rotate an image by 90° steps clockwise. Already-stored pictures have no EXIF
 * left (canvas re-encodes strip it), so this is pure pixel rotation — a manual
 * fix for anything that was saved sideways.
 */
export async function rotateBlob(file: Blob, quarters = 1): Promise<{ blob: Blob; mime: string }> {
  const q = ((quarters % 4) + 4) % 4;
  if (q === 0) return { blob: file, mime: file.type || 'image/jpeg' };
  return withDecodedImage(file, async (img) => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const swap = q === 1 || q === 3;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((q * Math.PI) / 2);
    ctx.drawImage(img, -w / 2, -h / 2);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9);
    });
    return { blob, mime: 'image/jpeg' };
  });
}
