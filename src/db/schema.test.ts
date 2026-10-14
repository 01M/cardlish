/**
 * @jest-environment node
 */
/// <reference types="node" />
// SQL схемы проверяется на настоящем SQLite из node:sqlite
import { DatabaseSync } from "node:sqlite";
import {
  CREATE_SCHEMA_V5,
  planMigration,
  SCHEMA_VERSION,
  SELECT_USER_VERSION,
  SELECT_WORDS_TABLE,
  SET_SCHEMA_VERSION,
} from "./schema";
import expectedSchema from "./schema.v5.snapshot.json";

// Как initDatabase в плане "fresh": схема и версия в одной транзакции, при
// ошибке — откат. failBeforeCommit имитирует сбой после создания схемы
const createFresh = (db: DatabaseSync, failBeforeCommit = false) => {
  db.exec("BEGIN EXCLUSIVE");
  try {
    db.exec(CREATE_SCHEMA_V5);
    if (failBeforeCommit) throw new Error("forced failure");
    db.exec(SET_SCHEMA_VERSION);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const createFreshV5 = () => {
  const db = new DatabaseSync(":memory:");
  createFresh(db);
  return db;
};

const userVersion = (db: DatabaseSync) =>
  (db.prepare(SELECT_USER_VERSION).get() as { user_version: number })
    .user_version;

const hasWordsTable = (db: DatabaseSync) =>
  db.prepare(SELECT_WORDS_TABLE).get() !== undefined;

const schemaOf = (db: DatabaseSync) =>
  db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name;",
    )
    .all()
    .map((row) => ({ ...row }));

const countsOf = (db: DatabaseSync) =>
  db
    .prepare(
      `SELECT is_custom, status, COUNT(*) AS count FROM words
       GROUP BY is_custom, status ORDER BY is_custom, status;`,
    )
    .all();

const dailyRowsOf = (db: DatabaseSync) =>
  db.prepare("SELECT local_day, introduced FROM daily_progress;").all();

const topicRowsOf = (db: DatabaseSync) =>
  db.prepare("SELECT topic, dict_key FROM word_topics ORDER BY topic, dict_key;").all();

const settingsOf = (db: DatabaseSync) =>
  db.prepare("SELECT key, value FROM app_settings ORDER BY key;").all();

// База старой версии: таблица words (форма не важна — её не читают) и
// заданный user_version, как оставляли прошлые сборки
const createLegacy = (version: number) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      translation TEXT NOT NULL,
      status TEXT DEFAULT 'new'
    );
    PRAGMA user_version = ${version};
  `);
  return db;
};

describe("planMigration", () => {
  it("is at schema version 5", () => {
    expect(SCHEMA_VERSION).toBe(5);
  });

  it("treats version 0 without a words table as a fresh install", () => {
    expect(planMigration(0, false)).toBe("fresh");
  });

  it.each([true, false])(
    "treats the current version as current (words table: %s)",
    (withWordsTable) => {
      expect(planMigration(SCHEMA_VERSION, withWordsTable)).toBe("current");
    },
  );

  it.each([SCHEMA_VERSION + 1, 100])(
    "treats version %i as a database from a newer app",
    (version) => {
      expect(planMigration(version, true)).toBe("too-new");
    },
  );

  it("treats version 0 with a words table (a v1 database) as unknown", () => {
    expect(planMigration(0, true)).toBe("unknown");
  });

  it.each([1, 2, 3, 4, -1])("treats version %i as unknown", (version) => {
    expect(planMigration(version, true)).toBe("unknown");
    expect(planMigration(version, false)).toBe("unknown");
  });

  it("matches what an empty database reports", () => {
    const db = new DatabaseSync(":memory:");

    expect(planMigration(userVersion(db), hasWordsTable(db))).toBe("fresh");
  });

  it("matches what a fresh v5 database reports", () => {
    const db = createFreshV5();

    expect(planMigration(userVersion(db), hasWordsTable(db))).toBe("current");
  });

  it.each([0, 1, 2, 3, 4])(
    "matches what a database of an old version %i reports",
    (version) => {
      const db = createLegacy(version);

      expect(planMigration(userVersion(db), hasWordsTable(db))).toBe("unknown");
    },
  );
});

describe("fresh install", () => {
  // Снимок sqlite_master сделан из CREATE_SCHEMA_V5 до удаления цепочки
  // переносов v1 → v5: схема новой установки не должна меняться без новой
  // версии схемы
  it("creates exactly the committed v5 schema", () => {
    const db = createFreshV5();

    expect(userVersion(db)).toBe(expectedSchema.userVersion);
    expect(schemaOf(db)).toEqual(expectedSchema.sqliteMaster);
  });

  it("leaves every table empty", () => {
    const db = createFreshV5();

    expect(countsOf(db)).toEqual([]);
    expect(dailyRowsOf(db)).toEqual([]);
    expect(topicRowsOf(db)).toEqual([]);
    expect(settingsOf(db)).toEqual([]);
  });

  it("leaves the database empty when it fails before the commit", () => {
    const db = new DatabaseSync(":memory:");

    expect(() => createFresh(db, true)).toThrow("forced failure");

    expect(schemaOf(db)).toEqual([]);
    expect(userVersion(db)).toBe(0);
    expect(planMigration(userVersion(db), hasWordsTable(db))).toBe("fresh");
    // Повторная попытка после отката проходит
    createFresh(db);
    expect(userVersion(db)).toBe(SCHEMA_VERSION);
    expect(schemaOf(db)).toEqual(expectedSchema.sqliteMaster);
  });
});

describe("schema v5 constraints", () => {
  const insert = (
    db: DatabaseSync,
    dictKey: string | null,
    isCustom: number,
    status: string | null = "new",
  ) =>
    db
      .prepare(
        `INSERT INTO words (dict_key, term, translation, is_custom, status)
         VALUES (?, 'term', 'перевод', ?, ?);`,
      )
      .run(dictKey, isCustom, status);

  it("accepts dictionary and custom words", () => {
    const db = createFreshV5();
    insert(db, "term", 0);
    insert(db, null, 1);
    insert(db, null, 1);

    expect(db.prepare(SELECT_WORDS_TABLE).get()).toEqual({ name: "words" });
    expect(countsOf(db)).toEqual([
      { is_custom: 0, status: "new", count: 1 },
      { is_custom: 1, status: "new", count: 2 },
    ]);
  });

  it("rejects an unknown or missing status", () => {
    const db = createFreshV5();
    expect(() => insert(db, "a", 0, "done")).toThrow(/CHECK constraint failed/);
    expect(() => insert(db, "b", 0, null)).toThrow(/NOT NULL constraint failed/);
  });

  it("rejects a custom word with a dict_key", () => {
    expect(() => insert(createFreshV5(), "a", 1)).toThrow(/CHECK constraint failed/);
  });

  it("rejects a dictionary word without a dict_key", () => {
    expect(() => insert(createFreshV5(), null, 0)).toThrow(/CHECK constraint failed/);
  });

  it("rejects an is_custom other than 0 or 1", () => {
    expect(() => insert(createFreshV5(), "a", 2)).toThrow(/CHECK constraint failed/);
  });

  it("rejects a duplicate dict_key", () => {
    const db = createFreshV5();
    insert(db, "a", 0);
    expect(() => insert(db, "a", 0)).toThrow(/UNIQUE constraint failed/);
  });

  it("keeps one daily_progress row per day with a non-negative count", () => {
    const db = createFreshV5();
    db.exec("INSERT INTO daily_progress (local_day) VALUES ('2026-10-13');");

    expect(dailyRowsOf(db)).toEqual([{ local_day: "2026-10-13", introduced: 0 }]);
    expect(() =>
      db.exec("INSERT INTO daily_progress (local_day) VALUES ('2026-10-13');"),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      db.exec("INSERT INTO daily_progress (local_day, introduced) VALUES ('2026-10-14', -1);"),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.exec("INSERT INTO daily_progress (local_day) VALUES (NULL);"),
    ).toThrow(/NOT NULL constraint failed/);
  });

  it("keeps one word_topics row per topic and key, both required", () => {
    const db = createFreshV5();
    db.exec(
      `INSERT INTO word_topics (topic, dict_key)
       VALUES ('food', 'apple'), ('plant', 'apple'), ('food', 'bread');`,
    );

    expect(topicRowsOf(db)).toEqual([
      { topic: "food", dict_key: "apple" },
      { topic: "food", dict_key: "bread" },
      { topic: "plant", dict_key: "apple" },
    ]);
    expect(() =>
      db.exec("INSERT INTO word_topics (topic, dict_key) VALUES ('food', 'apple');"),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      db.exec("INSERT INTO word_topics (topic, dict_key) VALUES ('food', NULL);"),
    ).toThrow(/NOT NULL constraint failed/);
    expect(() =>
      db.exec("INSERT INTO word_topics (topic, dict_key) VALUES (NULL, 'pear');"),
    ).toThrow(/NOT NULL constraint failed/);
  });
});

describe("app_settings", () => {
  const upsert = (db: DatabaseSync, key: string, value: string | null) =>
    db
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      )
      .run(key, value);

  it("keeps one value per key and replaces it on upsert", () => {
    const db = createFreshV5();
    upsert(db, "theme_preference", "dark");
    upsert(db, "daily_goal", "15");
    upsert(db, "theme_preference", "light");

    expect(settingsOf(db)).toEqual([
      { key: "daily_goal", value: "15" },
      { key: "theme_preference", value: "light" },
    ]);
    expect(() =>
      db.exec("INSERT INTO app_settings (key, value) VALUES ('daily_goal', '20');"),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("requires a key and a value", () => {
    const db = createFreshV5();

    expect(() => upsert(db, "theme_preference", null)).toThrow(
      /NOT NULL constraint failed/,
    );
    expect(() =>
      db.exec("INSERT INTO app_settings (key, value) VALUES (NULL, 'x');"),
    ).toThrow(/NOT NULL constraint failed/);
  });
});
