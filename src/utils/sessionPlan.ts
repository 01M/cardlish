import type { WordsStats } from "../db/database";

// План сессии «Учить» для карточки плана: сколько своих слов и слов из
// словаря загрузит getSessionWords для выбранного источника и размера.
// Полоса, легенда «Из словаря N» и примечание берут число слов из словаря
// только из dictionary — так все три совпадают с самой сессией
export interface SessionPlan {
  own: number;
  dictionary: number;
  total: number;
  // Доля своих слов в сессии (0, если сессия пустая)
  ownShare: number;
  // Своих слов меньше размера сессии (только для "custom") — показываем
  // примечание «Своих слов не хватает…, добавим dictionary из словаря»
  isOwnShort: boolean;
}

// 1. Состав сессии: считаем так же, как getSessionWords загружает слова
// (не меняем сам запрос — только воспроизводим его план на экране)
export const getSessionPlan = (
  source: "custom" | "dictionary",
  sessionSize: number,
  stats: Pick<WordsStats, "newCustom" | "newDict">,
): SessionPlan => {
  const own = source === "custom" ? Math.min(sessionSize, stats.newCustom) : 0;
  const dictionary =
    source === "custom"
      ? Math.min(sessionSize - own, stats.newDict)
      : Math.min(sessionSize, stats.newDict);
  const total = own + dictionary;

  return {
    own,
    dictionary,
    total,
    ownShare: total > 0 ? own / total : 0,
    isOwnShort: source === "custom" && stats.newCustom < sessionSize,
  };
};

// 2. Текст примечания в карточке плана (пустой, когда примечание скрыто).
// Если из словаря добавить нечего, часть «добавим 0 из словаря» опускаем
export const getPlanNoteText = (
  plan: Pick<SessionPlan, "isOwnShort" | "dictionary">,
  newCustom: number,
): string => {
  if (!plan.isOwnShort) return "";
  const shortText = `Своих слов не хватает (${newCustom})`;
  return plan.dictionary > 0
    ? `${shortText}, добавим ${plan.dictionary} из словаря`
    : shortText;
};
