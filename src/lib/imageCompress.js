/**
 * Homework uploads are PHOTOS ONLY. Any image format is accepted (JPG, PNG, WebP, GIF, AVIF, HEIC / HEIF from iPhones, BMP, TIFF ...),
 * everything else (PDF, Word, ...) is refused before anything is uploaded.
 */
const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  png: 'image/png', apng: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', heics: 'image/heic', heifs: 'image/heif', hif: 'image/heif',
  bmp: 'image/bmp', dib: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
};
// browsers report some formats under another name; the storage bucket knows only the canonical ones
const TYPE_ALIAS = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png', 'image/x-ms-bmp': 'image/bmp', 'image/x-bmp': 'image/bmp', 'image/x-tiff': 'image/tiff', 'image/heic-sequence': 'image/heic', 'image/heif-sequence': 'image/heif' };
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff']);

/** The image type (as the storage bucket expects it) of a picked file, or null when it is not an image we accept.
 *  The file name is used as well, because Windows / some browsers report an empty type for HEIC and a few other photos. */
export function imageMime(file) {
  if (!file) return null;
  const t = String(file.type || '').toLowerCase();
  const canon = TYPE_ALIAS[t] || t;
  if (ALLOWED.has(canon)) return canon;
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  const byExt = m ? EXT_MIME[m[1].toLowerCase()] : null;
  if (byExt && (!t || t === 'application/octet-stream' || t.startsWith('image/'))) return byExt;
  return null;
}
export const isImageFile = (f) => !!imageMime(f);

/** Value for <input type="file" accept>: every image, plus the extensions some pickers do not list as images. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif,.hif,.avif,.webp,.tif,.tiff,.bmp';

/**
 * Phone photos are 4-12 MB; homework only needs to be readable. Every photo the browser can decode (not GIF) is redrawn as a JPEG of at most
 * `maxSide` px on the long edge (quality 0.82) when that makes it smaller. A format the browser cannot decode (HEIC outside Safari, ...) and
 * any failure return the original file untouched, so a photo never gets refused because of the shrinking.
 */
export async function compressImage(file, { maxSide = 1600, quality = 0.82, minBytes = 400 * 1024 } = {}) {
  const mime = imageMime(file);
  if (!mime || mime === 'image/gif' || file.size < minBytes) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // transparency -> white paper
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    return file;
  }
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
