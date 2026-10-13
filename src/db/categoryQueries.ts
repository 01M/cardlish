import {
  CATEGORIES,
  categoryFilter,
  CategoryCounts,
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

// 2. Счётчики всех разделов одним проходом по таблице: всего слов и сколько
// из них ещё 'new'. Столбцы — total_<i> и remaining_<i> по порядку CATEGORIES
export const buildCategoryCountsQuery = (): SqlQuery => {
  const filters = CATEGORIES.map(categoryFilter);
  return {
    sql: `SELECT ${filters
      .map(
        (filter, index) =>
          `COUNT(CASE WHEN ${filter.sql} THEN 1 END) AS total_${index}, ` +
          `COUNT(CASE WHEN status = 'new' AND ${filter.sql} THEN 1 END) AS remaining_${index}`,
      )
      .join(", ")} FROM words;`,
    params: filters.flatMap((filter) => [...filter.params, ...filter.params]),
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

// 3. Новые слова для сессии из выбранных разделов: сначала свои (в
// случайном порядке, как и раньше), затем слова словаря по возрастанию rank.
// Из невыбранных разделов слова не добираются
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
