import {
  Category,
  CATEGORIES,
  categoryFilter,
  CategoryCounts,
  CUSTOM_CATEGORY_KEY,
  normalizeSelection,
  SelectionAvailability,
  selectionFilter,
} from "../utils/categories";

// SQL разделов «Учить» (сами разделы — в src/utils/categories.ts). Модуль
// не зависит от expo-sqlite: те же строки проверяются в тестах на node:sqlite

export interface SqlQuery {
  sql: string;
  params: (string | number)[];
}

// 1. Выбор разделов в app_settings. Выбор «все разделы» не храним: нет
// записи — все разделы, так новый раздел из будущей версии сразу войдёт в выбор
const LEARN_CATEGORIES_KEY = "learn_categories";

export const SELECT_LEARN_CATEGORIES = `
  SELECT value FROM app_settings WHERE key = '${LEARN_CATEGORIES_KEY}';
`;

export const SET_LEARN_CATEGORIES = `
  INSERT INTO app_settings (key, value) VALUES ('${LEARN_CATEGORIES_KEY}', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

export const DELETE_LEARN_CATEGORIES = `
  DELETE FROM app_settings WHERE key = '${LEARN_CATEGORIES_KEY}';
`;

// 2. Счётчики всех разделов одним запросом: всего слов и сколько из них ещё
// 'new'. Столбцы — total_<i> и remaining_<i> по порядку CATEGORIES. Свои слова
// и полосы считаются одним проходом по words; темы небольшие — их считает
// подзапрос через индекс dict_key (условие в CASE на каждой строке words
// заметно медленнее). Условие раздела — то же, что в запросе сессии
const countColumns = (category: Category, index: number): SqlQuery => {
  const filter = categoryFilter(category);
  const sql =
    category.kind === "topic"
      ? `(SELECT COUNT(*) FROM words WHERE ${filter.sql}) AS total_${index}, ` +
        `(SELECT COUNT(*) FROM words WHERE status = 'new' AND ${filter.sql}) AS remaining_${index}`
      : `COUNT(CASE WHEN ${filter.sql} THEN 1 END) AS total_${index}, ` +
        `COUNT(CASE WHEN status = 'new' AND ${filter.sql} THEN 1 END) AS remaining_${index}`;
  return { sql, params: [...filter.params, ...filter.params] };
};

export const buildCategoryCountsQuery = (): SqlQuery => {
  const columns = CATEGORIES.map(countColumns);
  return {
    sql: `SELECT ${columns.map((column) => column.sql).join(", ")} FROM words;`,
    params: columns.flatMap((column) => column.params),
  };
};

export const parseCategoryCounts = (
  row: Record<string, number> | null | undefined,
): CategoryCounts =>
  Object.fromEntries(
    CATEGORIES.map((category, index) => [
      category.key,
      {
        total: row?.[`total_${index}`] ?? 0,
        remaining: row?.[`remaining_${index}`] ?? 0,
      },
    ]),
  );

// 2a. Сколько новых слов в выборе — различных слов объединения разделов
// (то же условие, что в запросе сессии), свои отдельно от словаря
export const buildSelectionAvailabilityQuery = (
  selection: readonly string[],
): SqlQuery => {
  const filter = selectionFilter(selection);
  return {
    sql: `SELECT
        COUNT(CASE WHEN is_custom = 1 THEN 1 END) AS own_new,
        COUNT(CASE WHEN is_custom = 0 THEN 1 END) AS dictionary_new
      FROM words
      WHERE status = 'new' AND ${filter.sql};`,
    params: filter.params,
  };
};

export const parseSelectionAvailability = (
  selection: readonly string[],
  row: { own_new: number; dictionary_new: number } | null | undefined,
): SelectionAvailability => ({
  includesCustom: normalizeSelection(selection).includes(CUSTOM_CATEGORY_KEY),
  ownNew: row?.own_new ?? 0,
  dictionaryNew: row?.dictionary_new ?? 0,
});

// 3. Новые слова для сессии из выбранных разделов (объединение без повторов):
// сначала свои (в случайном порядке, как и раньше), затем слова словаря по
// возрастанию rank. Из невыбранных разделов слова не добираются
export const buildNewWordsQuery = (
  selection: readonly string[],
  limit: number,
): SqlQuery => {
  const filter = selectionFilter(selection);
  return {
    sql: `SELECT * FROM words
      WHERE status = 'new' AND ${filter.sql}
      ORDER BY is_custom DESC, CASE WHEN is_custom = 1 THEN RANDOM() ELSE rank END, id
      LIMIT ?;`,
    params: [...filter.params, limit],
  };
};
