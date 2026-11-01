/* Zoom'ni sayt ichida ochish mumkinmi? (Component View faqat kompyuter brauzerlari uchun) */

export function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
}

export function isZoomLink(link) {
  return /^https:\/\/([\w-]+\.)*zoom\.(us|com)\//i.test(String(link || '').trim());
}

/** true bo'lsa — dars sayt ichida ochiladi, aks holda eski usul (yangi tabda Zoom havolasi). */
export function canEmbedZoom(link) {
  return isZoomLink(link) && !isMobileBrowser();
}
