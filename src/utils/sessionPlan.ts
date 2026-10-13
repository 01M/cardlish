import type { SelectionAvailability } from "./categories";

// План сессии «Учить» для карточки плана: сколько своих слов и слов из
// словаря загрузит getSessionWords для выбранных разделов и размера.
// Полоса, легенда «Из словаря N» и примечание берут число слов из словаря
// только из dictionary — так все три совпадают с самой сессией
export interface SessionPlan {
  own: number;
  dictionary: number;
  total: number;
  // Доля своих слов в сессии (0, если сессия пустая)
  ownShare: number;
  // Раздел своих слов выбран, но их меньше размера сессии — показываем
  // примечание «Своих слов не хватает…, добавим dictionary из словаря»
  isOwnShort: boolean;
}

// 1. Состав сессии: считаем так же, как getSessionWords загружает слова —
// сначала свои слова выбора, затем слова словаря из выбранных полос
export const getSessionPlan = (
  sessionSize: number,
  available: SelectionAvailability,
): SessionPlan => {
  const own = Math.min(sessionSize, available.ownNew);
  const dictionary = Math.min(sessionSize - own, available.dictionaryNew);
  const total = own + dictionary;

  return {
    own,
    dictionary,
    total,
    ownShare: total > 0 ? own / total : 0,
    isOwnShort: available.includesCustom && available.ownNew < sessionSize,
  };
};

// 2. Текст примечания в карточке плана (пустой, когда примечание скрыто).
// Если из словаря добавить нечего, часть «добавим 0 из словаря» опускаем
export const getPlanNoteText = (
  plan: Pick<SessionPlan, "isOwnShort" | "dictionary">,
  ownNew: number,
): string => {
  if (!plan.isOwnShort) return "";
  const shortText = `Своих слов не хватает (${ownNew})`;
  return plan.dictionary > 0
    ? `${shortText}, добавим ${plan.dictionary} из словаря`
    : shortText;
};
