// Разделы для новых слов «Учить»: свои слова, полосы частотности словаря по
// words.rank и темы (таблица word_topics). Разделы описаны только в коде
// (таблицы BANDS и TOPICS), в базе хранится лишь выбор — JSON-массив ключей в
// app_settings.learn_categories. Выбранные разделы объединяются (OR): слово из
// нескольких разделов попадает в сессию один раз.
// Чистый модуль: без React и без базы

export type Category =
  | {
      kind: "custom";
      key: typeof CUSTOM_CATEGORY_KEY;
      title: string;
      description: string;
    }
  | {
      kind: "band";
      key: string;
      title: string;
      description: string;
      // Границы rank включительно; to = null — полоса без верхней границы
      from: number;
      to: number | null;
    }
  | {
      // Без строки описания: в выборе разделов у темы только счётчик
      kind: "topic";
      key: string;
      title: string;
      // slug из src/assets/topics.json — значение word_topics.topic
      slug: string;
    };

export type CategoryKind = Category["kind"];

export const CUSTOM_CATEGORY_KEY = "custom";

// 1. Полосы частотности: [от, до (null — без границы), описание]. Должны
// начинаться с 1, идти подряд без пропусков и пересечений, последняя — без
// верхней границы (проверяет validateCategories, тест — на настоящей таблице)
const BANDS: [number, number | null, string][] = [
  [1, 500, "Самые частые слова"],
  [501, 1000, "Частые слова"],
  [1001, 2000, "Повседневная лексика"],
  [2001, 3000, "Расширенная лексика"],
  [3001, 5000, "Менее частые слова"],
  [5001, 10000, "Редкие слова"],
  [10001, 20000, "Очень редкие слова"],
  [20001, null, "Узкая лексика, составные слова и имена"],
];

// 1a. Темы: [slug, название] в порядке src/assets/topics.json (его пишет
// scripts/build_topics.py). Тест сверяет эту таблицу с файлом: у каждой темы
// файла есть строка здесь, и наоборот
const TOPICS: [string, string][] = [
  ["food", "Еда и напитки"],
  ["animal", "Животные"],
  ["plant", "Растения"],
  ["body", "Части тела"],
  ["clothing", "Одежда и украшения"],
  ["home", "Дом и быт"],
  ["transport", "Транспорт и дороги"],
  ["occupation", "Профессии"],
  ["family", "Семья"],
  ["colour", "Цвета"],
  ["time", "Время"],
  ["weather", "Погода"],
  ["emotion", "Чувства и эмоции"],
  ["health", "Здоровье и медицина"],
  ["school", "Школа и учёба"],
  ["sport", "Спорт и игры"],
  ["music", "Музыка и танцы"],
  ["money", "Деньги и покупки"],
  ["technology", "Техника и компьютеры"],
  ["nature", "Природа и ландшафт"],
  ["travel", "Путешествия"],
];

export const topicKey = (slug: string) => `topic:${slug}`;

// Разряды через неразрывный пробел: 10000 → «10 000»
export const formatNumber = (value: number) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const bandKey = (from: number, to: number | null) =>
  `band:${from}-${to ?? ""}`;

const bandTitle = (from: number, to: number | null) =>
  to === null
    ? `Слова ${formatNumber(from)}+`
    : `Слова ${formatNumber(from)}–${formatNumber(to)}`;

export const CATEGORIES: Category[] = [
  {
    kind: "custom",
    key: CUSTOM_CATEGORY_KEY,
    title: "Свои слова",
    description: "Слова, которые вы добавили сами",
  },
  ...BANDS.map(
    ([from, to, description]): Category => ({
      kind: "band",
      key: bandKey(from, to),
      title: bandTitle(from, to),
      description,
      from,
      to,
    }),
  ),
  ...TOPICS.map(
    ([slug, title]): Category => ({
      kind: "topic",
      key: topicKey(slug),
      title,
      slug,
    }),
  ),
];

export const ALL_CATEGORY_KEYS = CATEGORIES.map((category) => category.key);

// 2. Проверка реестра: ключи уникальны, ровно один раздел своих слов, у тем
// ключ topic:<slug> со slug из строчных латинских букв, полосы начинаются с 1,
// идут подряд без пересечений, последняя открыта.
// Возвращает список проблем (пустой — всё в порядке)
export const validateCategories = (categories: Category[]): string[] => {
  const problems: string[] = [];
  const keys = categories.map((category) => category.key);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length > 0) {
    problems.push(`duplicate keys: ${[...new Set(duplicates)].join(", ")}`);
  }
  if (categories.filter((category) => category.kind === "custom").length !== 1) {
    problems.push("expected exactly one custom category");
  }
  for (const category of categories) {
    if (
      category.kind === "topic" &&
      (!/^[a-z]+$/.test(category.slug) || category.key !== topicKey(category.slug))
    ) {
      problems.push(`${category.key}: a topic needs the key topic:<slug> with a slug of a-z`);
    }
  }

  const bands = categories.flatMap((category) =>
    category.kind === "band" ? [category] : [],
  );
  if (bands.length === 0) {
    problems.push("no bands");
    return problems;
  }
  if (bands[0].from !== 1) {
    problems.push(`first band starts at ${bands[0].from}, expected 1`);
  }
  bands.forEach((band, index) => {
    const isLast = index === bands.length - 1;
    if (band.to === null && !isLast) {
      problems.push(`${band.key}: only the last band may be open-ended`);
    }
    if (band.to !== null && band.to < band.from) {
      problems.push(`${band.key}: ends before it starts`);
    }
    if (isLast && band.to !== null) {
      problems.push(`${band.key}: the last band must be open-ended`);
    }
    const next = bands[index + 1];
    if (next && band.to !== null && next.from !== band.to + 1) {
      problems.push(
        `${band.key} → ${next.key}: ${next.from <= band.to ? "overlap" : "gap"}`,
      );
    }
  });
  return problems;
};

// 3. Выбор разделов: известные ключи без повторов в порядке реестра.
// Пустой выбор означает «все разделы»
export const normalizeSelection = (keys: readonly unknown[]): string[] => {
  const selected = ALL_CATEGORY_KEYS.filter((key) => keys.includes(key));
  return selected.length > 0 ? selected : [...ALL_CATEGORY_KEYS];
};

// Значение из app_settings: нет записи, не JSON или не массив — все разделы
export const parseSelection = (value: string | null | undefined): string[] => {
  if (value == null) return [...ALL_CATEGORY_KEYS];
  try {
    const parsed: unknown = JSON.parse(value);
    return normalizeSelection(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [...ALL_CATEGORY_KEYS];
  }
};

export const serializeSelection = (keys: readonly string[]) =>
  JSON.stringify(normalizeSelection(keys));

export const isAllSelected = (keys: readonly string[]) =>
  ALL_CATEGORY_KEYS.every((key) => keys.includes(key));

// Единственный выбранный раздел снять нельзя
export const isLastSelected = (selection: readonly string[], key: string) =>
  selection.length === 1 && selection[0] === key;

// Переключение раздела в выборе; последний выбранный раздел остаётся
export const toggleCategory = (
  selection: readonly string[],
  key: string,
): string[] => {
  if (!selection.includes(key)) return normalizeSelection([...selection, key]);
  if (isLastSelected(selection, key)) return [...selection];
  return selection.filter((selected) => selected !== key);
};

// 3a. Группы в выборе разделов (по виду раздела, в порядке реестра) и
// действия заголовка группы «Все» / «Нет»
export interface CategoryGroup {
  kind: CategoryKind;
  title: string;
  categories: Category[];
}

const GROUP_TITLES: Record<CategoryKind, string> = {
  custom: "Свои слова",
  band: "Словарь по частотности",
  topic: "Темы",
};

export const CATEGORY_GROUPS: CategoryGroup[] = (
  Object.keys(GROUP_TITLES) as CategoryKind[]
).map((kind) => ({
  kind,
  title: GROUP_TITLES[kind],
  categories: CATEGORIES.filter((category) => category.kind === kind),
}));

const groupKeys = (group: CategoryGroup) =>
  group.categories.map((category) => category.key);

// «Все» выбирает каждый раздел группы; ничего не меняет, если они уже выбраны
export const canSelectGroup = (
  selection: readonly string[],
  group: CategoryGroup,
) => groupKeys(group).some((key) => !selection.includes(key));

export const selectGroup = (
  selection: readonly string[],
  group: CategoryGroup,
): string[] => normalizeSelection([...selection, ...groupKeys(group)]);

// «Нет» снимает разделы группы — только если в группе что-то выбрано и вне
// группы останется хотя бы один выбранный раздел
export const canDeselectGroup = (
  selection: readonly string[],
  group: CategoryGroup,
) => {
  const keys = groupKeys(group);
  return (
    selection.some((key) => keys.includes(key)) &&
    selection.some((key) => !keys.includes(key))
  );
};

// Снятие, которое оставило бы выбор пустым, ничего не меняет
export const deselectGroup = (
  selection: readonly string[],
  group: CategoryGroup,
): string[] => {
  if (!canDeselectGroup(selection, group)) return [...selection];
  const keys = groupKeys(group);
  return selection.filter((key) => !keys.includes(key));
};

// «Нет» недоступно только потому, что группа держит все выбранные разделы
export const isGroupHoldingLastSelection = (
  selection: readonly string[],
  group: CategoryGroup,
) => {
  const keys = groupKeys(group);
  return selection.length > 0 && selection.every((key) => keys.includes(key));
};

// 4. SQL-условие на строку words для раздела и для выбора: только строки и
// параметры. Строки с rank NULL не попадают ни в одну полосу. Тема — через
// некоррелированный подзапрос по первичному ключу word_topics: SQLite строит
// по нему временный индекс один раз на запрос (коррелированный EXISTS на
// каждой строке words на реальных данных медленнее в десятки раз). У своих
// слов dict_key NULL, поэтому они не попадают ни в одну тему
export interface SqlFilter {
  sql: string;
  params: (string | number)[];
}

export const categoryFilter = (category: Category): SqlFilter => {
  if (category.kind === "custom") return { sql: "is_custom = 1", params: [] };
  if (category.kind === "topic") {
    return {
      sql: "words.dict_key IN (SELECT t.dict_key FROM word_topics t WHERE t.topic = ?)",
      params: [category.slug],
    };
  }
  return category.to === null
    ? { sql: "(is_custom = 0 AND rank >= ?)", params: [category.from] }
    : {
        sql: "(is_custom = 0 AND rank BETWEEN ? AND ?)",
        params: [category.from, category.to],
      };
};

// Разделы выбора, объединённые через OR в одном условии — поэтому слово из
// нескольких разделов не повторяется (выбор нормализуется: пустой — все)
export const selectionFilter = (selection: readonly string[]): SqlFilter => {
  const keys = normalizeSelection(selection);
  const filters = CATEGORIES.filter((category) => keys.includes(category.key))
    .map(categoryFilter);
  return {
    sql: `(${filters.map((filter) => filter.sql).join(" OR ")})`,
    params: filters.flatMap((filter) => filter.params),
  };
};

// 5. Сколько слов в разделе всего и сколько из них ещё новых
export interface CategoryCount {
  total: number;
  remaining: number;
}

export type CategoryCounts = Record<string, CategoryCount>;

// Новые слова в выборе: свои отдельно от словаря (для плана сессии). Разделы
// пересекаются (тема и полоса), поэтому это не сумма счётчиков разделов, а
// отдельный подсчёт различных слов объединения (buildSelectionAvailabilityQuery)
export interface SelectionAvailability {
  includesCustom: boolean;
  ownNew: number;
  dictionaryNew: number;
}

// 6. Подписи для экрана «Учить» и выбора разделов

// «1 новое слово», «3 новых слова», «12 новых слов»
export const formatNewWords = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  const words =
    last === 1 && lastTwo !== 11
      ? "новое слово"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "новых слова"
        : "новых слов";
  return `${formatNumber(count)} ${words}`;
};

export const formatSelectionSummary = (selection: readonly string[]) =>
  isAllSelected(selection)
    ? "Все разделы"
    : `Выбрано: ${normalizeSelection(selection).length}`;

// Счётчик строки раздела: для своих слов — сколько новых, для полос и тем —
// сколько новых осталось из всех слов раздела
export const formatCategoryCount = (
  category: Category,
  count: CategoryCount,
) =>
  category.kind === "custom"
    ? formatNewWords(count.remaining)
    : `осталось ${formatNumber(count.remaining)} из ${formatNumber(count.total)}`;
