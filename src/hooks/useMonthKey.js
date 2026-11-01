import { useEffect, useState } from 'react';

/** Joriy oy kaliti: 'YYYY-MM' (masalan '2026-10'). */
export function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Keyingi oy boshigacha necha millisekund qolganini hisoblaydi (kamida 1 soniya). */
function msUntilNextMonth(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime() + 50);
}

/**
 * Oy o'zgarganda (har oyning 1-kuni) qiymatni avtomatik yangilaydi.
 * Sahifa ochiq tursa ham, oy almashganda ro'yxat yangi oy uchun qayta yuklanadi.
 */
export default function useMonthKey() {
  const [key, setKey] = useState(currentMonthKey);
  useEffect(() => {
    const id = setTimeout(() => setKey(currentMonthKey()), msUntilNextMonth());
    return () => clearTimeout(id);
  }, [key]);
  return key;
}
