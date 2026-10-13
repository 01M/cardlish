import {
  ALL_CATEGORY_KEYS,
  bandKey,
  Category,
  CATEGORIES,
  categoryFilter,
  formatCategoryCount,
  formatNewWords,
  formatNumber,
  formatSelectionSummary,
  getSelectionAvailability,
  isAllSelected,
  isLastSelected,
  normalizeSelection,
  parseSelection,
  selectionFilter,
  serializeSelection,
  toggleCategory,
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

describe("category registry", () => {
  it("is valid", () => {
    expect(validateCategories(CATEGORIES)).toEqual([]);
  });

  it("has the agreed keys in order", () => {
    expect(ALL_CATEGORY_KEYS).toEqual([
      "custom",
      "band:1-500",
      "band:501-1000",
      "band:1001-2000",
      "band:2001-3000",
      "band:3001-5000",
      "band:5001-10000",
      "band:10001-20000",
      "band:20001-",
    ]);
  });

  it("titles bands with non-breaking spaces in thousands", () => {
    expect(CATEGORIES.map((category) => category.title)).toEqual([
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

  it("gives every category a one-line description", () => {
    for (const category of CATEGORIES) {
      expect(category.description).toMatch(/^\S.*\S$/);
      expect(category.description).not.toMatch(/\n/);
    }
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
  });

  it("ORs the selected sections in registry order", () => {
    expect(selectionFilter(["band:20001-", "custom", "band:501-1000"])).toEqual({
      sql: "(is_custom = 1 OR (is_custom = 0 AND rank BETWEEN ? AND ?) OR (is_custom = 0 AND rank >= ?))",
      params: [501, 1000, 20001],
    });
  });

  it("uses all sections for an empty selection", () => {
    expect(selectionFilter([])).toEqual(selectionFilter(ALL_CATEGORY_KEYS));
  });
});

describe("getSelectionAvailability", () => {
  const counts = {
    custom: { total: 9, remaining: 4 },
    "band:1-500": { total: 500, remaining: 20 },
    "band:501-1000": { total: 500, remaining: 300 },
  };

  it("splits the selection's new words into own and dictionary", () => {
    expect(getSelectionAvailability(["custom", "band:1-500", "band:501-1000"], counts)).toEqual({
      includesCustom: true,
      ownNew: 4,
      dictionaryNew: 320,
    });
  });

  it("counts no own words when the custom section is not selected", () => {
    expect(getSelectionAvailability(["band:501-1000"], counts)).toEqual({
      includesCustom: false,
      ownNew: 0,
      dictionaryNew: 300,
    });
  });

  it("counts missing sections as empty", () => {
    expect(getSelectionAvailability(["custom", "band:20001-"], {})).toEqual({
      includesCustom: true,
      ownNew: 0,
      dictionaryNew: 0,
    });
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
  });

  it("formats a section's count", () => {
    expect(formatCategoryCount(custom, { total: 9, remaining: 1 })).toBe("1 новое слово");
    expect(formatCategoryCount(band(10001, 20000), { total: 10000, remaining: 9876 })).toBe(
      "осталось 9 876 из 10 000",
    );
  });
});
