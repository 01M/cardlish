import topics from "../assets/topics.json";
import {
  ALL_CATEGORY_KEYS,
  bandKey,
  canDeselectGroup,
  canSelectGroup,
  Category,
  CATEGORIES,
  CATEGORY_GROUPS,
  categoryFilter,
  deselectGroup,
  formatCategoryCount,
  formatNewWords,
  formatNumber,
  formatSelectionSummary,
  hasGroupActions,
  isAllSelected,
  isGroupHoldingLastSelection,
  isLastSelected,
  normalizeSelection,
  parseSelection,
  selectGroup,
  selectionFilter,
  serializeSelection,
  toggleCategory,
  topicKey,
  validateCategories,
} from "./categories";

const band = (from: number, to: number | null): Category => ({
  kind: "band",
  key: bandKey(from, to),
  title: "",
  description: "",
  from,
  to,
});

const custom: Category = {
  kind: "custom",
  key: "custom",
  title: "",
  description: "",
};

const topic = (slug: string): Category => ({
  kind: "topic",
  key: topicKey(slug),
  title: "",
  slug,
});

const TOPIC_SLUGS = [
  "food", "animal", "plant", "body", "clothing", "home", "transport", "occupation",
  "family", "colour", "time", "weather", "emotion", "health", "school", "sport", "music",
  "money", "technology", "nature", "travel",
];

const BAND_KEYS = [
  "band:1-500",
  "band:501-1000",
  "band:1001-2000",
  "band:2001-3000",
  "band:3001-5000",
  "band:5001-10000",
  "band:10001-20000",
  "band:20001-",
];

const TOPIC_KEYS = TOPIC_SLUGS.map((slug) => `topic:${slug}`);

describe("category registry", () => {
  it("is valid", () => {
    expect(validateCategories(CATEGORIES)).toEqual([]);
  });

  it("has the agreed keys in order", () => {
    expect(ALL_CATEGORY_KEYS).toEqual(["custom", ...BAND_KEYS, ...TOPIC_KEYS]);
  });

  it("titles bands with non-breaking spaces in thousands", () => {
    expect(
      CATEGORIES.filter((category) => category.kind !== "topic").map((category) => category.title),
    ).toEqual([
      "Свои слова",
      "Слова 1–500",
      "Слова 501–1 000",
      "Слова 1 001–2 000",
      "Слова 2 001–3 000",
      "Слова 3 001–5 000",
      "Слова 5 001–10 000",
      "Слова 10 001–20 000",
      "Слова 20 001+",
    ]);
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1234567)).toBe("1 234 567");
  });

  it("gives own words and every band a one-line description and topics none", () => {
    for (const category of CATEGORIES) {
      if (category.kind === "topic") {
        expect(category).not.toHaveProperty("description");
        continue;
      }
      expect(category.description).toMatch(/^\S.*\S$/);
      expect(category.description).not.toMatch(/\n/);
    }
  });

  it("titles the topics in Russian", () => {
    expect(
      CATEGORIES.filter((category) => category.kind === "topic").map((category) => category.title),
    ).toEqual([
      "Еда и напитки",
      "Животные",
      "Растения",
      "Части тела",
      "Одежда и украшения",
      "Дом и быт",
      "Транспорт и дороги",
      "Профессии",
      "Семья",
      "Цвета",
      "Время",
      "Погода",
      "Чувства и эмоции",
      "Здоровье и медицина",
      "Школа и учёба",
      "Спорт и игры",
      "Музыка и танцы",
      "Деньги и покупки",
      "Техника и компьютеры",
      "Природа и ландшафт",
      "Путешествия",
    ]);
  });

  it("has a topic for every slug of topics.json and nothing else, in the file's order", () => {
    const registrySlugs = CATEGORIES.flatMap((category) =>
      category.kind === "topic" ? [category.slug] : [],
    );

    expect(registrySlugs).toEqual(Object.keys(topics));
  });
});

describe("validateCategories", () => {
  it("reports a table that does not start at 1", () => {
    expect(validateCategories([custom, band(2, 10), band(11, null)])).toEqual([
      "first band starts at 2, expected 1",
    ]);
  });

  it("reports gaps and overlaps", () => {
    expect(validateCategories([custom, band(1, 10), band(12, 20), band(20, null)])).toEqual([
      "band:1-10 → band:12-20: gap",
      "band:12-20 → band:20-: overlap",
    ]);
  });

  it("reports a closed last band and an open band in the middle", () => {
    expect(validateCategories([custom, band(1, null), band(2, 5)])).toEqual([
      "band:1-: only the last band may be open-ended",
      "band:2-5: the last band must be open-ended",
    ]);
  });

  it("reports a band that ends before it starts", () => {
    expect(validateCategories([custom, band(1, 10), band(11, 5), band(6, null)])).toContain(
      "band:11-5: ends before it starts",
    );
  });

  it("reports duplicate keys and a missing custom category", () => {
    expect(validateCategories([band(1, 10), band(1, 10), band(11, null)])).toEqual([
      "duplicate keys: band:1-10",
      "expected exactly one custom category",
      "band:1-10 → band:1-10: overlap",
    ]);
    expect(validateCategories([custom])).toEqual(["no bands"]);
  });

  it("reports a topic with a malformed slug or key and a duplicate topic", () => {
    expect(
      validateCategories([
        custom,
        band(1, null),
        topic("food"),
        topic("food"),
        topic("Food"),
        { kind: "topic", key: "plant", title: "", slug: "plant" },
      ]),
    ).toEqual([
      "duplicate keys: topic:food",
      "topic:Food: a topic needs the key topic:<slug> with a slug of a-z",
      "plant: a topic needs the key topic:<slug> with a slug of a-z",
    ]);
  });
});

describe("selection", () => {
  it("treats an absent, unparsable, non-array or empty value as all sections", () => {
    for (const value of [null, undefined, "", "{", "42", '{"a":1}', "[]", '["nope", 3]']) {
      expect(parseSelection(value)).toEqual(ALL_CATEGORY_KEYS);
    }
  });

  it("drops unknown keys, dedupes and keeps the registry order", () => {
    expect(parseSelection('["band:20001-", "custom", "old", "band:1-500", "custom", 7]')).toEqual([
      "custom",
      "band:1-500",
      "band:20001-",
    ]);
  });

  it("serialises a normalised selection and parses it back", () => {
    const value = serializeSelection(["band:501-1000", "custom", "band:501-1000", "x"]);

    expect(value).toBe('["custom","band:501-1000"]');
    expect(parseSelection(value)).toEqual(["custom", "band:501-1000"]);
    expect(serializeSelection([])).toBe(JSON.stringify(ALL_CATEGORY_KEYS));
  });

  it("tells whether every section is selected", () => {
    expect(isAllSelected(ALL_CATEGORY_KEYS)).toBe(true);
    expect(isAllSelected([...ALL_CATEGORY_KEYS].reverse())).toBe(true);
    expect(isAllSelected(ALL_CATEGORY_KEYS.slice(1))).toBe(false);
  });

  it("toggles a section and never removes the last one", () => {
    expect(toggleCategory(["band:1-500"], "custom")).toEqual(["custom", "band:1-500"]);
    expect(toggleCategory(["custom", "band:1-500"], "custom")).toEqual(["band:1-500"]);
    expect(isLastSelected(["band:1-500"], "band:1-500")).toBe(true);
    expect(isLastSelected(["band:1-500"], "custom")).toBe(false);
    expect(toggleCategory(["band:1-500"], "band:1-500")).toEqual(["band:1-500"]);
  });

  it("normalises an empty selection to all sections", () => {
    expect(normalizeSelection([])).toEqual(ALL_CATEGORY_KEYS);
  });

  it("keeps topic keys in a stored selection", () => {
    expect(parseSelection('["topic:travel", "topic:food", "topic:dinosaurs"]')).toEqual([
      "topic:food",
      "topic:travel",
    ]);
  });
});

describe("groups", () => {
  const [customGroup, bandGroup, topicGroup] = CATEGORY_GROUPS;

  it("groups own words, bands and topics in registry order", () => {
    expect(
      CATEGORY_GROUPS.map((group) => [
        group.kind,
        group.title,
        group.categories.map((category) => category.key),
      ]),
    ).toEqual([
      ["custom", "Свои слова", ["custom"]],
      ["band", "Словарь по частотности", BAND_KEYS],
      ["topic", "Темы", TOPIC_KEYS],
    ]);
    expect(CATEGORY_GROUPS.flatMap((group) => group.categories)).toEqual(CATEGORIES);
  });

  it("shows group actions only for groups with more than one section", () => {
    expect(CATEGORY_GROUPS.map(hasGroupActions)).toEqual([false, true, true]);
    expect(hasGroupActions({ ...bandGroup, categories: bandGroup.categories.slice(0, 1) })).toBe(
      false,
    );
    expect(hasGroupActions({ ...customGroup, categories: [custom, custom] })).toBe(true);
  });

  it("selects every section of a group", () => {
    expect(selectGroup(["band:1-500", "topic:food"], topicGroup)).toEqual([
      "band:1-500",
      ...TOPIC_KEYS,
    ]);
    expect(canSelectGroup(["band:1-500", "topic:food"], topicGroup)).toBe(true);
    expect(canSelectGroup(["custom", ...TOPIC_KEYS], topicGroup)).toBe(false);
  });

  it("deselects a group only when something outside it stays selected", () => {
    expect(deselectGroup(["custom", "band:1-500", "band:20001-", "topic:food"], bandGroup)).toEqual([
      "custom",
      "topic:food",
    ]);
    expect(canDeselectGroup(["custom", "band:1-500"], bandGroup)).toBe(true);

    // Только разделы группы — снять нельзя, выбор не меняется
    expect(canDeselectGroup(["band:1-500", "band:20001-"], bandGroup)).toBe(false);
    expect(deselectGroup(["band:1-500", "band:20001-"], bandGroup)).toEqual([
      "band:1-500",
      "band:20001-",
    ]);
    expect(isGroupHoldingLastSelection(["band:1-500", "band:20001-"], bandGroup)).toBe(true);

    // В группе ничего не выбрано — снимать нечего
    expect(canDeselectGroup(["band:1-500"], customGroup)).toBe(false);
    expect(isGroupHoldingLastSelection(["band:1-500"], customGroup)).toBe(false);
  });
});

describe("SQL filters", () => {
  it("builds a condition per section", () => {
    expect(categoryFilter(custom)).toEqual({ sql: "is_custom = 1", params: [] });
    expect(categoryFilter(band(1, 500))).toEqual({
      sql: "(is_custom = 0 AND rank BETWEEN ? AND ?)",
      params: [1, 500],
    });
    expect(categoryFilter(band(20001, null))).toEqual({
      sql: "(is_custom = 0 AND rank >= ?)",
      params: [20001],
    });
    expect(categoryFilter(topic("food"))).toEqual({
      sql: "words.dict_key IN (SELECT t.dict_key FROM word_topics t WHERE t.topic = ?)",
      params: ["food"],
    });
  });

  it("ORs the selected sections in registry order", () => {
    expect(selectionFilter(["topic:time", "band:20001-", "custom", "band:501-1000"])).toEqual({
      sql:
        "(is_custom = 1 OR (is_custom = 0 AND rank BETWEEN ? AND ?) OR (is_custom = 0 AND rank >= ?)" +
        " OR words.dict_key IN (SELECT t.dict_key FROM word_topics t WHERE t.topic = ?))",
      params: [501, 1000, 20001, "time"],
    });
  });

  it("uses all sections for an empty selection", () => {
    expect(selectionFilter([])).toEqual(selectionFilter(ALL_CATEGORY_KEYS));
  });
});

describe("labels", () => {
  it("declines «новое слово» by the number", () => {
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 1002].map(formatNewWords)).toEqual([
      "0 новых слов",
      "1 новое слово",
      "2 новых слова",
      "4 новых слова",
      "5 новых слов",
      "11 новых слов",
      "12 новых слов",
      "14 новых слов",
      "21 новое слово",
      "22 новых слова",
      "25 новых слов",
      "101 новое слово",
      "111 новых слов",
      "1 002 новых слова",
    ]);
  });

  it("summarises the selection", () => {
    expect(formatSelectionSummary(ALL_CATEGORY_KEYS)).toBe("Все разделы");
    expect(formatSelectionSummary(["custom", "band:1-500"])).toBe("Выбрано: 2");
    expect(formatSelectionSummary(["custom", "topic:food", "topic:time"])).toBe("Выбрано: 3");
  });

  it("formats a section's count", () => {
    expect(formatCategoryCount(custom, { total: 9, remaining: 1 })).toBe("1 новое слово");
    expect(formatCategoryCount(topic("food"), { total: 477, remaining: 470 })).toBe(
      "осталось 470 из 477",
    );
    expect(formatCategoryCount(band(10001, 20000), { total: 10000, remaining: 9876 })).toBe(
      "осталось 9 876 из 10 000",
    );
  });
});
