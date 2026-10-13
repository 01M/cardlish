// Русское множественное число. Чистая функция: без React и без базы

// Форма по числу: one — 1, 21, 101; few — 2–4, 22–24; many — 0, 5–20, 25–30,
// 11–14, 111–114
export const pluralRu = (
  count: number,
  one: string,
  few: string,
  many: string,
): string => {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
};
