/**
 * Phone photos are 4-12 MB; homework only needs to be readable. Shrinks big JPEG/PNG/WebP photos to at most `maxSide` px
 * on the long edge (JPEG, quality 0.82) so the storage bucket stays small. Anything else (PDF, HEIC, small images) is
 * returned untouched, and any failure also returns the original file.
 */
export async function compressImage(file, { maxSide = 1600, quality = 0.82, minBytes = 400 * 1024 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < minBytes) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // PNG transparency -> white paper
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    return file;
  }
}

export const isImageFile = (f) => !!f && /^image\//i.test(f.type || '');

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
