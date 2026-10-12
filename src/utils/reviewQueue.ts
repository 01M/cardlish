// Очередь экрана «Повторение»: слова в порядке показа и позиция текущей карточки
export interface ReviewQueue<T extends { id: number }> {
  words: T[];
  index: number;
}

// 1. Слияние текущей очереди со свежей выборкой слов на повторение.
// Пустая очередь строится с нуля в порядке выборки (её перемешивает база).
// Иначе слова, которые всё ещё на повторении, сохраняют порядок и получают
// свежие данные из выборки; выбывшие убираются; новые добавляются в конец.
// Позиция остаётся на том же слове, а если оно выбыло — переходит на
// следующее оставшееся (за концом очереди — на первое)
export const mergeReviewQueue = <T extends { id: number }>(
  prev: ReviewQueue<T>,
  fresh: T[],
): ReviewQueue<T> => {
  if (prev.words.length === 0) return { words: fresh, index: 0 };

  const freshById = new Map(fresh.map((word) => [word.id, word]));
  const prevIds = new Set(prev.words.map((word) => word.id));
  const words: T[] = [];
  let index = 0;

  prev.words.forEach((word, i) => {
    if (i === prev.index) index = words.length;
    const freshWord = freshById.get(word.id);
    if (freshWord) words.push(freshWord);
  });
  fresh.forEach((word) => {
    if (!prevIds.has(word.id)) words.push(word);
  });

  return { words, index: index < words.length ? index : 0 };
};
