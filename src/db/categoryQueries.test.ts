/**
 * @jest-environment node
 */
/// <reference types="node" />
// Запросы разделов проверяются на настоящем SQLite из node:sqlite теми же
// SQL-строками, что выполняет database.ts
import { DatabaseSync } from "node:sqlite";
import realDictionary from "../assets/dictionary.json";
import realTopics from "../assets/topics.json";
import {
  ALL_CATEGORY_KEYS,
  CATEGORIES,
  CategoryCounts,
  parseSelection,
  serializeSelection,
} from "../utils/categories";
import {
  buildCategoryCountsQuery,
  buildNewWordsQuery,
  buildSelectionAvailabilityQuery,
  DELETE_LEARN_CATEGORIES,
  parseCategoryCounts,
  parseSelectionAvailability,
  SELECT_LEARN_CATEGORIES,
  SET_LEARN_CATEGORIES,
} from "./categoryQueries";
import {
  DictionaryCard,
  planDictionarySync,
  TopicMembership,
} from "./dictionarySync";
import { CREATE_SCHEMA_V5, SET_SCHEMA_VERSION } from "./schema";

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

// Состав тем: темы пересекаются с полосами и друг с другом; near (food) уже
// выучено, be (time) на повторении; ключ alpha совпадает с term своего слова
// в нижнем регистре, но у своих слов dict_key NULL — в тему оно не попадает
const TOPICS: [string, string][] = [
  ["food", "the"],
  ["food", "edge"],
  ["food", "near"],
  ["food", "far"],
  ["food", "alpha"],
  ["time", "edge"],
  ["time", "after"],
  ["time", "be"],
];

const createFixture = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CREATE_SCHEMA_V5);
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
  const insertTopic = db.prepare(
    "INSERT INTO word_topics (topic, dict_key) VALUES (?, ?);",
  );
  for (const [topic, key] of TOPICS) {
    insertTopic.run(topic, key);
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

// Как getSelectionAvailability
const availabilityOf = (db: DatabaseSync, selection: readonly string[]) => {
  const query = buildSelectionAvailabilityQuery(selection);
  return parseSelectionAvailability(
    selection,
    db.prepare(query.sql).get(...query.params) as { own_new: number; dictionary_new: number },
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

  it("picks a topic's new dictionary words in ascending rank, never own words", () => {
    expect(termsOf(pick(createFixture(), ["topic:food"]))).toEqual(["the", "edge", "far"]);
    expect(termsOf(pick(createFixture(), ["topic:time"]))).toEqual(["edge", "after"]);
  });

  it("merges a band and a topic without duplicates", () => {
    // the и edge — и в полосе 1–500, и в теме food
    const rows = pick(createFixture(), ["band:1-500", "topic:food"]);

    expect(termsOf(rows)).toEqual(["the", "of", "edge", "far"]);
    expect(new Set(termsOf(rows)).size).toBe(rows.length);
  });

  it("merges overlapping topics without duplicates, own words first", () => {
    const rows = pick(createFixture(), ["custom", "topic:food", "topic:time"]);

    expect(rows.slice(0, 2).map((row) => row.is_custom)).toEqual([1, 1]);
    expect(termsOf(rows.slice(2))).toEqual(["the", "edge", "after", "far"]);
    expect(new Set(termsOf(rows)).size).toBe(rows.length);
  });
});

describe("buildCategoryCountsQuery", () => {
  it("counts all and remaining new words per section", () => {
    const empty = Object.fromEntries(
      CATEGORIES.filter((category) => category.kind === "topic").map((category) => [
        category.key,
        { total: 0, remaining: 0 },
      ]),
    );

    expect(countsOf(createFixture())).toEqual({
      ...empty,
      custom: { total: 3, remaining: 2 },
      "band:1-500": { total: 5, remaining: 3 },
      "band:501-1000": { total: 3, remaining: 3 },
      "band:1001-2000": { total: 1, remaining: 1 },
      "band:2001-3000": { total: 0, remaining: 0 },
      "band:3001-5000": { total: 0, remaining: 0 },
      "band:5001-10000": { total: 0, remaining: 0 },
      "band:10001-20000": { total: 1, remaining: 1 },
      "band:20001-": { total: 2, remaining: 2 },
      // alpha — не слово словаря; near выучено, be на повторении
      "topic:food": { total: 4, remaining: 3 },
      "topic:time": { total: 3, remaining: 2 },
    });
  });

  it("matches what the session query picks for every section", () => {
    const db = createFixture();
    const counts = countsOf(db);

    for (const category of CATEGORIES) {
      expect({ key: category.key, picked: pick(db, [category.key]).length }).toEqual({
        key: category.key,
        picked: counts[category.key].remaining,
      });
    }
  });

  it("drops a word from a topic's remaining once it is learned", () => {
    const db = createFixture();
    expect(countsOf(db)["topic:time"]).toEqual({ total: 3, remaining: 2 });

    db.exec("UPDATE words SET status = 'learned' WHERE dict_key = 'after';");

    expect(countsOf(db)["topic:time"]).toEqual({ total: 3, remaining: 1 });
    expect(termsOf(pick(db, ["topic:time"]))).toEqual(["edge"]);
  });

  it("splits the real dictionary into full bands and full topics", () => {
    const cards = realDictionary as DictionaryCard[];
    const topics = realTopics as TopicMembership;
    const db = new DatabaseSync(":memory:");
    db.exec(CREATE_SCHEMA_V5);
    db.exec("BEGIN");
    for (const step of planDictionarySync(cards, topics, [], "real")) {
      db.prepare(step.sql).run(...step.params);
    }
    db.exec("COMMIT");

    const counts = countsOf(db);
    for (const category of CATEGORIES) {
      if (category.kind === "custom") continue;
      const size =
        category.kind === "topic"
          ? topics[category.slug].length
          : (category.to ?? cards.length) - category.from + 1;
      expect({ key: category.key, ...counts[category.key] }).toEqual({
        key: category.key,
        total: size,
        remaining: size,
      });
    }
  });

  it("returns zeros for an empty table", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(CREATE_SCHEMA_V5);

    expect(Object.values(countsOf(db))).toEqual(
      CATEGORIES.map(() => ({ total: 0, remaining: 0 })),
    );
  });
});

describe("buildSelectionAvailabilityQuery", () => {
  it("counts the distinct new words of the union, own words apart", () => {
    const db = createFixture();
    const selection = ["custom", "band:1-500", "topic:food", "topic:time"];

    // Сумма счётчиков разделов была бы 2 + 3 + 3 + 2 = 10: the и edge
    // входят в три раздела сразу
    expect(availabilityOf(db, selection)).toEqual({
      includesCustom: true,
      ownNew: 2,
      dictionaryNew: 5,
    });
    expect(pick(db, selection)).toHaveLength(7);
  });

  it("matches the session query for any selection", () => {
    const db = createFixture();
    const selections = [
      ALL_CATEGORY_KEYS,
      ["custom"],
      ["topic:food"],
      ["band:1-500", "topic:food"],
      ["topic:food", "topic:time"],
      ["band:20001-", "topic:time"],
      ["custom", "band:501-1000", "topic:time"],
    ];

    for (const selection of selections) {
      const { ownNew, dictionaryNew } = availabilityOf(db, selection);
      const rows = pick(db, selection);
      expect({ selection, ownNew, dictionaryNew }).toEqual({
        selection,
        ownNew: rows.filter((row) => row.is_custom === 1).length,
        dictionaryNew: rows.filter((row) => row.is_custom === 0).length,
      });
    }
  });

  it("counts no own words when the custom section is not selected", () => {
    expect(availabilityOf(createFixture(), ["topic:food"])).toEqual({
      includesCustom: false,
      ownNew: 0,
      dictionaryNew: 3,
    });
  });

  it("returns zeros for an empty table", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(CREATE_SCHEMA_V5);

    expect(availabilityOf(db, ["custom", "topic:food"])).toEqual({
      includesCustom: true,
      ownNew: 0,
      dictionaryNew: 0,
    });
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
