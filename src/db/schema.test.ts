/**
 * @jest-environment node
 */
/// <reference types="node" />
// SQL схемы и переноса проверяется на настоящем SQLite из node:sqlite
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BACKUP_DATABASE_INTO,
  buildSeedBatches,
  CREATE_SCHEMA_V2,
  DictionaryItem,
  MIGRATE_V1_TO_V2,
  planMigration,
  SCHEMA_VERSION,
  SELECT_USER_VERSION,
  SELECT_WORDS_TABLE,
  SEED_BATCH_SIZE,
  SET_SCHEMA_VERSION,
  toDictKey,
} from "./schema";

// Схема v1 — как её создавала прошлая версия initDatabase
const V1_SCHEMA = `
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    translation TEXT NOT NULL,
    transcription TEXT,
    example TEXT,
    is_custom INTEGER DEFAULT 0,
    status TEXT DEFAULT 'new'
  );

  CREATE INDEX IF NOT EXISTS idx_words_is_custom_status
    ON words (is_custom, status);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

type V1Row = {
  id: number;
  term: string;
  is_custom: number;
  status: string;
};

const createV1 = (rows: V1Row[]) => {
  const db = new DatabaseSync(":memory:");
  db.exec(V1_SCHEMA);
  const insert = db.prepare(
    `INSERT INTO words (id, term, translation, transcription, example, is_custom, status)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
  );
  for (const row of rows) {
    insert.run(
      row.id,
      row.term,
      `перевод ${row.id}`,
      row.id % 2 === 0 ? `[t${row.id}]` : null,
      null,
      row.is_custom,
      row.status,
    );
  }
  return db;
};

const dict = (id: number, term: string, status = "new"): V1Row => ({
  id,
  term,
  is_custom: 0,
  status,
});

const custom = (id: number, term: string, status = "new"): V1Row => ({
  id,
  term,
  is_custom: 1,
  status,
});

// Как initDatabase: перенос и версия в одной транзакции, при ошибке — откат.
// failBeforeCommit имитирует сбой после всех шагов переноса
const upgrade = (db: DatabaseSync, failBeforeCommit = false) => {
  db.exec("BEGIN");
  try {
    db.exec(MIGRATE_V1_TO_V2);
    if (failBeforeCommit) throw new Error("forced failure");
    db.exec(SET_SCHEMA_VERSION);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const userVersion = (db: DatabaseSync) =>
  (db.prepare(SELECT_USER_VERSION).get() as { user_version: number })
    .user_version;

const rowsOf = (db: DatabaseSync) =>
  db
    .prepare(
      `SELECT id, term, translation, transcription, example, is_custom, status
       FROM words ORDER BY id;`,
    )
    .all();

const keysOf = (db: DatabaseSync) =>
  db.prepare("SELECT id, dict_key FROM words ORDER BY id;").all();

const countsOf = (db: DatabaseSync) =>
  db
    .prepare(
      `SELECT is_custom, status, COUNT(*) AS count FROM words
       GROUP BY is_custom, status ORDER BY is_custom, status;`,
    )
    .all();

const schemaOf = (db: DatabaseSync) =>
  db
    .prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name;")
    .all();

describe("planMigration", () => {
  it("treats version 0 without a words table as a fresh install", () => {
    expect(planMigration(0, false)).toBe("fresh");
  });

  it("treats version 0 with a words table as a v1 database", () => {
    expect(planMigration(0, true)).toBe("upgrade-v1");
  });

  it.each([true, false])(
    "treats the current version as current (words table: %s)",
    (hasWordsTable) => {
      expect(planMigration(SCHEMA_VERSION, hasWordsTable)).toBe("current");
    },
  );

  it.each([SCHEMA_VERSION + 1, 100])(
    "treats version %i as a database from a newer app",
    (version) => {
      expect(planMigration(version, true)).toBe("too-new");
    },
  );

  it.each([1, -1])("treats version %i as unknown", (version) => {
    expect(planMigration(version, true)).toBe("unknown");
  });

  it("matches what a v1 database reports", () => {
    const db = createV1([]);
    const hasWordsTable = db.prepare(SELECT_WORDS_TABLE).get() !== undefined;

    expect(planMigration(userVersion(db), hasWordsTable)).toBe("upgrade-v1");
  });
});

describe("v1 → v2 migration", () => {
  const v1Rows = [
    dict(1, "apple"),
    dict(2, "Monday", "review"),
    dict(3, "run", "learned"),
    dict(4, "o'clock", "review"),
    custom(7, "Serendipity"),
    custom(9, "look after", "learned"),
    custom(12, "bank", "review"),
  ];

  it("keeps ids, statuses, custom words and counts", () => {
    const db = createV1(v1Rows);
    const rowsBefore = rowsOf(db);
    const countsBefore = countsOf(db);

    upgrade(db);

    expect(rowsOf(db)).toEqual(rowsBefore);
    expect(countsOf(db)).toEqual(countsBefore);
    expect(keysOf(db)).toEqual([
      { id: 1, dict_key: "apple" },
      { id: 2, dict_key: "monday" },
      { id: 3, dict_key: "run" },
      { id: 4, dict_key: "o'clock" },
      { id: 7, dict_key: null },
      { id: 9, dict_key: null },
      { id: 12, dict_key: null },
    ]);
  });

  it("sets user_version to 2 and leaves the v2 schema in place", () => {
    const db = createV1(v1Rows);
    expect(userVersion(db)).toBe(0);

    upgrade(db);

    expect(userVersion(db)).toBe(2);
    const fresh = new DatabaseSync(":memory:");
    fresh.exec(CREATE_SCHEMA_V2);
    // Та же схема, что у новой установки (кроме служебной sqlite_sequence;
    // после RENAME SQLite пишет имя таблицы в кавычках)
    const withoutSequence = (schema: unknown[]) =>
      (schema as { name: string; sql: string | null }[])
        .filter((item) => item.name !== "sqlite_sequence")
        .map((item) => ({
          ...item,
          sql: item.sql?.replace(/\s+/g, " ").replace('"words"', "words"),
        }));
    expect(withoutSequence(schemaOf(db))).toEqual(
      withoutSequence(schemaOf(fresh)),
    );
  });

  it("keeps app settings", () => {
    const db = createV1(v1Rows);
    db.exec("INSERT INTO app_settings (key, value) VALUES ('theme_preference', 'dark');");

    upgrade(db);

    expect(db.prepare("SELECT key, value FROM app_settings;").all()).toEqual([
      { key: "theme_preference", value: "dark" },
    ]);
  });

  it("does not conflict when a custom word repeats a dictionary term", () => {
    const db = createV1([dict(1, "apple", "learned"), custom(2, "Apple")]);

    upgrade(db);

    expect(keysOf(db)).toEqual([
      { id: 1, dict_key: "apple" },
      { id: 2, dict_key: null },
    ]);
    expect(rowsOf(db).map((row) => (row as V1Row).status)).toEqual([
      "learned",
      "new",
    ]);
  });

  it("merges duplicate dictionary terms into the lowest id with the most advanced status", () => {
    const db = createV1([
      dict(1, "Run"),
      dict(2, "run", "learned"),
      dict(3, " RUN ", "review"),
      dict(4, "set", "review"),
      dict(5, "Set"),
      custom(6, "run"),
    ]);

    upgrade(db);

    expect(
      db
        .prepare("SELECT id, dict_key, term, status FROM words ORDER BY id;")
        .all(),
    ).toEqual([
      { id: 1, dict_key: "run", term: "Run", status: "learned" },
      { id: 4, dict_key: "set", term: "set", status: "review" },
      { id: 6, dict_key: null, term: "run", status: "new" },
    ]);
  });

  it("never reuses the ids of deleted words", () => {
    const db = createV1(v1Rows);
    db.exec(
      "INSERT INTO words (id, term, translation, is_custom) VALUES (30, 'gone', 'x', 1);",
    );
    db.exec("DELETE FROM words WHERE id = 30;");

    upgrade(db);
    db.exec(
      `INSERT INTO words (term, translation, transcription, example, is_custom, status)
       VALUES ('next', 'x', NULL, NULL, 1, 'new');`,
    );

    expect(
      db.prepare("SELECT id FROM words WHERE term = 'next';").get(),
    ).toEqual({ id: 31 });
  });

  it("leaves v1 untouched when a row breaks a constraint", () => {
    const db = createV1([...v1Rows, dict(20, "broken", "unknown")]);
    const rowsBefore = rowsOf(db);
    const schemaBefore = schemaOf(db);

    expect(() => upgrade(db)).toThrow(/CHECK constraint failed/);

    expect(rowsOf(db)).toEqual(rowsBefore);
    expect(schemaOf(db)).toEqual(schemaBefore);
    expect(userVersion(db)).toBe(0);
  });

  it("leaves v1 untouched when it fails after the table swap", () => {
    const db = createV1(v1Rows);
    const rowsBefore = rowsOf(db);
    const schemaBefore = schemaOf(db);

    expect(() => upgrade(db, true)).toThrow("forced failure");

    expect(rowsOf(db)).toEqual(rowsBefore);
    expect(schemaOf(db)).toEqual(schemaBefore);
    expect(userVersion(db)).toBe(0);
    // Повторная попытка после отката проходит
    upgrade(db);
    expect(userVersion(db)).toBe(2);
  });
});

describe("schema v2 constraints", () => {
  const createV2 = () => {
    const db = new DatabaseSync(":memory:");
    db.exec(CREATE_SCHEMA_V2);
    return db;
  };

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
    const db = createV2();
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
    const db = createV2();
    expect(() => insert(db, "a", 0, "done")).toThrow(/CHECK constraint failed/);
    expect(() => insert(db, "b", 0, null)).toThrow(/NOT NULL constraint failed/);
  });

  it("rejects a custom word with a dict_key", () => {
    expect(() => insert(createV2(), "a", 1)).toThrow(/CHECK constraint failed/);
  });

  it("rejects a dictionary word without a dict_key", () => {
    expect(() => insert(createV2(), null, 0)).toThrow(/CHECK constraint failed/);
  });

  it("rejects an is_custom other than 0 or 1", () => {
    expect(() => insert(createV2(), "a", 2)).toThrow(/CHECK constraint failed/);
  });

  it("rejects a duplicate dict_key", () => {
    const db = createV2();
    insert(db, "a", 0);
    expect(() => insert(db, "a", 0)).toThrow(/UNIQUE constraint failed/);
  });
});

describe("fresh install seeding", () => {
  const items: DictionaryItem[] = [
    { term: "apple", translation: "яблоко", transcription: "ˈæpl", example: "" },
    { term: "Monday", translation: "понедельник", transcription: "" },
    { term: "o'clock", translation: "час" },
    { term: "run", translation: "бежать", example: "Run!" },
    { term: "set", translation: "набор" },
  ];

  it("creates the schema, seeds the dictionary and sets the version in one go", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("BEGIN");
    db.exec(CREATE_SCHEMA_V2);
    for (const batch of buildSeedBatches(items, 2)) {
      db.prepare(batch.sql).run(...batch.params);
    }
    db.exec(SET_SCHEMA_VERSION);
    db.exec("COMMIT");

    expect(userVersion(db)).toBe(2);
    expect(
      db
        .prepare(
          `SELECT id, dict_key, term, transcription, example, is_custom, status
           FROM words ORDER BY id;`,
        )
        .all(),
    ).toEqual([
      { id: 1, dict_key: "apple", term: "apple", transcription: "ˈæpl", example: null, is_custom: 0, status: "new" },
      { id: 2, dict_key: "monday", term: "Monday", transcription: null, example: null, is_custom: 0, status: "new" },
      { id: 3, dict_key: "o'clock", term: "o'clock", transcription: null, example: null, is_custom: 0, status: "new" },
      { id: 4, dict_key: "run", term: "run", transcription: null, example: "Run!", is_custom: 0, status: "new" },
      { id: 5, dict_key: "set", term: "set", transcription: null, example: null, is_custom: 0, status: "new" },
    ]);
  });

  it("splits items into batches of the given size", () => {
    const batches = buildSeedBatches(items, 2);

    expect(batches.map((batch) => batch.params.length)).toEqual([10, 10, 5]);
    expect(buildSeedBatches([], 2)).toEqual([]);
  });

  it("keeps the default batch under SQLite's variable limit", () => {
    expect(SEED_BATCH_SIZE * 5).toBeLessThanOrEqual(32766);
  });

  it("computes the same key in JS as lower(trim(term)) in the migration", () => {
    const db = new DatabaseSync(":memory:");
    for (const term of ["Apple", " RUN ", "o'clock", "Twenty-One"]) {
      const row = db.prepare("SELECT lower(trim(?)) AS key;").get(term);
      expect(row).toEqual({ key: toDictKey(term) });
    }
  });
});

describe("v1 backup", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "english-cards-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("copies the whole database into a new file", () => {
    const db = createV1([dict(1, "apple", "learned"), custom(2, "Apple")]);
    const backupPath = join(dir, "english_cards.v1-backup.db");

    db.prepare(BACKUP_DATABASE_INTO).run(backupPath);

    const backup = new DatabaseSync(backupPath);
    expect(rowsOf(backup)).toEqual(rowsOf(db));
    expect(schemaOf(backup)).toEqual(schemaOf(db));
    backup.close();
  });

  it("fails instead of overwriting an existing file", () => {
    const db = createV1([dict(1, "apple")]);
    const backupPath = join(dir, "english_cards.v1-backup.db");
    db.prepare(BACKUP_DATABASE_INTO).run(backupPath);

    expect(() => db.prepare(BACKUP_DATABASE_INTO).run(backupPath)).toThrow();
  });
});
