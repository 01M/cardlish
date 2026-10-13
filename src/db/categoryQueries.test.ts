/**
 * @jest-environment node
 */
/// <reference types="node" />
// Запросы разделов проверяются на настоящем SQLite из node:sqlite теми же
// SQL-строками, что выполняет database.ts
import { DatabaseSync } from "node:sqlite";
import realDictionary from "../assets/dictionary.json";
import {
  ALL_CATEGORY_KEYS,
  CATEGORIES,
  CategoryCounts,
  getSelectionAvailability,
  parseSelection,
  serializeSelection,
} from "../utils/categories";
import {
  buildCategoryCountsQuery,
  buildNewWordsQuery,
  DELETE_LEARN_CATEGORIES,
  parseCategoryCounts,
  SELECT_LEARN_CATEGORIES,
  SET_LEARN_CATEGORIES,
} from "./categoryQueries";
import { DictionaryCard, planDictionarySync } from "./dictionarySync";
import { CREATE_SCHEMA_V3, SET_SCHEMA_VERSION } from "./schema";

type Status = "new" | "review" | "learned";

// Строки словаря: [term, rank, status]; rank null — строка без rank
const DICTIONARY: [string, number | null, Status][] = [
  ["the", 1, "new"],
  ["be", 2, "review"],
  ["of", 3, "new"],
  ["near", 499, "learned"],
  ["edge", 500, "new"],
  ["past", 501, "new"],
  ["mid", 777, "new"],
  ["thousand", 1000, "new"],
  ["after", 1001, "new"],
  ["last", 20000, "new"],
  ["open", 20001, "new"],
  ["far", 35000, "new"],
  ["unranked", null, "new"],
];

// Свои слова: [term, status]
const CUSTOM: [string, Status][] = [
  ["Alpha", "new"],
  ["Beta", "new"],
  ["Gamma", "review"],
];

const createFixture = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CREATE_SCHEMA_V3);
  db.exec(SET_SCHEMA_VERSION);
  const insertDict = db.prepare(
    `INSERT INTO words (dict_key, term, translation, is_custom, status, rank)
     VALUES (?, ?, 'перевод', 0, ?, ?);`,
  );
  for (const [term, rank, status] of DICTIONARY) {
    insertDict.run(term, term, status, rank);
  }
  const insertCustom = db.prepare(
    `INSERT INTO words (dict_key, term, translation, is_custom, status, rank)
     VALUES (NULL, ?, 'своё', 1, ?, NULL);`,
  );
  for (const [term, status] of CUSTOM) {
    insertCustom.run(term, status);
  }
  return db;
};

// Как getSessionWords
const pick = (db: DatabaseSync, selection: readonly string[], limit = 100) => {
  const query = buildNewWordsQuery(selection, limit);
  return db.prepare(query.sql).all(...query.params) as {
    term: string;
    is_custom: number;
    status: string;
    rank: number | null;
  }[];
};

// Как getCategoryCounts
const countsOf = (db: DatabaseSync): CategoryCounts => {
  const query = buildCategoryCountsQuery();
  return parseCategoryCounts(
    db.prepare(query.sql).get(...query.params) as Record<string, number>,
  );
};

const termsOf = (rows: { term: string }[]) => rows.map((row) => row.term);

describe("buildNewWordsQuery", () => {
  it("includes both boundaries of a band", () => {
    expect(termsOf(pick(createFixture(), ["band:1-500"]))).toEqual(["the", "of", "edge"]);
    expect(termsOf(pick(createFixture(), ["band:501-1000"]))).toEqual(["past", "mid", "thousand"]);
    expect(termsOf(pick(createFixture(), ["band:10001-20000"]))).toEqual(["last"]);
  });

  it("treats the last band as open-ended", () => {
    expect(termsOf(pick(createFixture(), ["band:20001-"]))).toEqual(["open", "far"]);
  });

  it("puts own words first, then dictionary words in ascending rank", () => {
    const rows = pick(createFixture(), ALL_CATEGORY_KEYS);

    expect(rows.slice(0, 2).map((row) => row.is_custom)).toEqual([1, 1]);
    expect(new Set(termsOf(rows.slice(0, 2)))).toEqual(new Set(["Alpha", "Beta"]));
    expect(termsOf(rows.slice(2))).toEqual([
      "the", "of", "edge", "past", "mid", "thousand", "after", "last", "open", "far",
    ]);
  });

  it("takes own words first even when the limit cuts the dictionary", () => {
    const rows = pick(createFixture(), ["custom", "band:1-500"], 3);

    expect(rows.map((row) => row.is_custom)).toEqual([1, 1, 0]);
    expect(rows[2].term).toBe("the");
  });

  it("does not top up from sections outside the selection", () => {
    expect(termsOf(pick(createFixture(), ["band:10001-20000"], 10))).toEqual(["last"]);
    expect(new Set(termsOf(pick(createFixture(), ["custom"], 10)))).toEqual(new Set(["Alpha", "Beta"]));
  });

  it("excludes own words when the custom section is not selected", () => {
    const rows = pick(createFixture(), ALL_CATEGORY_KEYS.filter((key) => key !== "custom"));

    expect(rows.every((row) => row.is_custom === 0)).toBe(true);
  });

  it("never picks dictionary rows without a rank", () => {
    expect(termsOf(pick(createFixture(), ALL_CATEGORY_KEYS))).not.toContain("unranked");
  });

  it("never picks words with progress", () => {
    const rows = pick(createFixture(), ALL_CATEGORY_KEYS);

    expect(rows.every((row) => row.status === "new")).toBe(true);
    for (const term of ["be", "near", "Gamma"]) {
      expect(termsOf(rows)).not.toContain(term);
    }
  });
});

describe("buildCategoryCountsQuery", () => {
  it("counts all and remaining new words per section", () => {
    expect(countsOf(createFixture())).toEqual({
      custom: { total: 3, remaining: 2 },
      "band:1-500": { total: 5, remaining: 3 },
      "band:501-1000": { total: 3, remaining: 3 },
      "band:1001-2000": { total: 1, remaining: 1 },
      "band:2001-3000": { total: 0, remaining: 0 },
      "band:3001-5000": { total: 0, remaining: 0 },
      "band:5001-10000": { total: 0, remaining: 0 },
      "band:10001-20000": { total: 1, remaining: 1 },
      "band:20001-": { total: 2, remaining: 2 },
    });
  });

  it("matches what the session query picks for every section", () => {
    const db = createFixture();
    const counts = countsOf(db);

    for (const category of CATEGORIES) {
      expect(pick(db, [category.key])).toHaveLength(counts[category.key].remaining);
    }
    const selection = ["custom", "band:1-500", "band:20001-"];
    const { ownNew, dictionaryNew } = getSelectionAvailability(selection, counts);
    expect(pick(db, selection)).toHaveLength(ownNew + dictionaryNew);
  });

  it("splits the real dictionary into full bands", () => {
    const cards = realDictionary as DictionaryCard[];
    const db = new DatabaseSync(":memory:");
    db.exec(CREATE_SCHEMA_V3);
    db.exec("BEGIN");
    for (const step of planDictionarySync(cards, [], "real")) {
      db.prepare(step.sql).run(...step.params);
    }
    db.exec("COMMIT");

    const counts = countsOf(db);
    for (const category of CATEGORIES) {
      if (category.kind === "custom") continue;
      const size = (category.to ?? cards.length) - category.from + 1;
      expect(counts[category.key]).toEqual({ total: size, remaining: size });
    }
  });

  it("returns zeros for an empty table", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(CREATE_SCHEMA_V3);

    expect(Object.values(countsOf(db))).toEqual(
      CATEGORIES.map(() => ({ total: 0, remaining: 0 })),
    );
  });
});

describe("learn_categories setting", () => {
  // Как getLearnSelection / setLearnSelection
  const read = (db: DatabaseSync) =>
    parseSelection((db.prepare(SELECT_LEARN_CATEGORIES).get() as { value: string } | undefined)?.value);

  it("reads all sections when nothing is stored", () => {
    expect(read(createFixture())).toEqual(ALL_CATEGORY_KEYS);
  });

  it("stores a selection, overwrites it and deletes it for all sections", () => {
    const db = createFixture();

    db.prepare(SET_LEARN_CATEGORIES).run(serializeSelection(["band:1-500"]));
    db.prepare(SET_LEARN_CATEGORIES).run(serializeSelection(["custom", "band:501-1000"]));
    expect(read(db)).toEqual(["custom", "band:501-1000"]);

    db.prepare(DELETE_LEARN_CATEGORIES).run();
    expect(db.prepare("SELECT COUNT(*) AS count FROM app_settings;").get()).toEqual({ count: 0 });
    expect(read(db)).toEqual(ALL_CATEGORY_KEYS);
  });

  it("falls back to all sections for a broken stored value", () => {
    const db = createFixture();
    db.prepare(SET_LEARN_CATEGORIES).run("not json");

    expect(read(db)).toEqual(ALL_CATEGORY_KEYS);
  });
});
