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
  CREATE_SCHEMA_V4,
  MIGRATE_V1_TO_V2,
  MIGRATE_V2_TO_V3,
  MIGRATE_V3_TO_V4,
  planMigration,
  SCHEMA_VERSION,
  SELECT_USER_VERSION,
  SELECT_WORDS_TABLE,
  SET_SCHEMA_VERSION,
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

// Как initDatabase: шаги переноса и версия в одной транзакции, при ошибке —
// откат. failBeforeCommit имитирует сбой после всех шагов переноса
const runInTransaction = (
  db: DatabaseSync,
  steps: string[],
  failBeforeCommit = false,
) => {
  db.exec("BEGIN");
  try {
    for (const step of steps) db.exec(step);
    if (failBeforeCommit) throw new Error("forced failure");
    db.exec(SET_SCHEMA_VERSION);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

// План "upgrade-v1": v1 → v2 → v3 → v4
const upgrade = (db: DatabaseSync, failBeforeCommit = false) =>
  runInTransaction(
    db,
    [MIGRATE_V1_TO_V2, MIGRATE_V2_TO_V3, MIGRATE_V3_TO_V4],
    failBeforeCommit,
  );

// План "upgrade-v2": v2 → v3 → v4
const upgradeV2 = (db: DatabaseSync, failBeforeCommit = false) =>
  runInTransaction(db, [MIGRATE_V2_TO_V3, MIGRATE_V3_TO_V4], failBeforeCommit);

// План "upgrade-v3": v3 → v4
const upgradeV3 = (db: DatabaseSync, failBeforeCommit = false) =>
  runInTransaction(db, [MIGRATE_V3_TO_V4], failBeforeCommit);

// База v2 — такая, какой её оставлял перенос v1 → v2 прошлой версии
const createV2 = (rows: V1Row[]) => {
  const db = createV1(rows);
  db.exec(MIGRATE_V1_TO_V2);
  db.exec("PRAGMA user_version = 2;");
  return db;
};

// База v3 — после переноса v2 → v3 и синхронизации словаря (rank заполнен
// у слов словаря)
const createV3 = (rows: V1Row[]) => {
  const db = createV2(rows);
  db.exec(MIGRATE_V2_TO_V3);
  db.exec("UPDATE words SET rank = id * 10 WHERE is_custom = 0;");
  db.exec("PRAGMA user_version = 3;");
  return db;
};

// Схема без служебной sqlite_sequence и с нормализованными пробелами (после
// RENAME SQLite пишет имя таблицы в кавычках)
const comparableSchemaOf = (db: DatabaseSync) =>
  (schemaOf(db) as { name: string; sql: string | null }[])
    .filter((item) => item.name !== "sqlite_sequence")
    .map((item) => ({
      ...item,
      sql: item.sql?.replace(/\s+/g, " ").replace('"words"', "words"),
    }));

const createFreshV4 = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CREATE_SCHEMA_V4);
  return db;
};

const dailyRowsOf = (db: DatabaseSync) =>
  db.prepare("SELECT local_day, introduced FROM daily_progress;").all();

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

  it("treats version 2 as a v2 database", () => {
    expect(planMigration(2, true)).toBe("upgrade-v2");
  });

  it("treats version 3 as a v3 database", () => {
    expect(planMigration(3, true)).toBe("upgrade-v3");
  });

  it("is at schema version 4", () => {
    expect(SCHEMA_VERSION).toBe(4);
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

  it("matches what a v2 database reports", () => {
    const db = createV2([]);
    const hasWordsTable = db.prepare(SELECT_WORDS_TABLE).get() !== undefined;

    expect(planMigration(userVersion(db), hasWordsTable)).toBe("upgrade-v2");
  });

  it("matches what a v3 database reports", () => {
    const db = createV3([]);
    const hasWordsTable = db.prepare(SELECT_WORDS_TABLE).get() !== undefined;

    expect(planMigration(userVersion(db), hasWordsTable)).toBe("upgrade-v3");
  });
});

describe("v1 → v2 → v3 → v4 migration", () => {
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

  it("sets user_version to 4 and leaves the same schema as a fresh install", () => {
    const db = createV1(v1Rows);
    expect(userVersion(db)).toBe(0);

    upgrade(db);

    expect(userVersion(db)).toBe(4);
    expect(comparableSchemaOf(db)).toEqual(comparableSchemaOf(createFreshV4()));
    expect(dailyRowsOf(db)).toEqual([]);
  });

  it("leaves rank empty until the dictionary is synced", () => {
    const db = createV1(v1Rows);

    upgrade(db);

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM words WHERE rank IS NOT NULL;").get(),
    ).toEqual({ count: 0 });
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
    expect(userVersion(db)).toBe(4);
  });
});

describe("v2 → v3 → v4 migration", () => {
  const v2Rows = [
    dict(1, "apple"),
    dict(2, "Monday", "review"),
    dict(3, "run", "learned"),
    custom(7, "Serendipity"),
    custom(12, "bank", "review"),
  ];

  it("keeps every row, id, key and status and leaves rank empty", () => {
    const db = createV2(v2Rows);
    const rowsBefore = rowsOf(db);
    const keysBefore = keysOf(db);

    upgradeV2(db);

    expect(rowsOf(db)).toEqual(rowsBefore);
    expect(keysOf(db)).toEqual(keysBefore);
    expect(db.prepare("SELECT id, rank FROM words ORDER BY id;").all()).toEqual(
      [1, 2, 3, 7, 12].map((id) => ({ id, rank: null })),
    );
  });

  it("sets user_version to 4 and leaves the same schema as a fresh install", () => {
    const db = createV2(v2Rows);
    db.exec("INSERT INTO app_settings (key, value) VALUES ('theme_preference', 'dark');");

    upgradeV2(db);

    expect(userVersion(db)).toBe(4);
    expect(comparableSchemaOf(db)).toEqual(comparableSchemaOf(createFreshV4()));
    expect(db.prepare("SELECT key, value FROM app_settings;").all()).toEqual([
      { key: "theme_preference", value: "dark" },
    ]);
  });

  it("leaves v2 untouched when it fails", () => {
    const db = createV2(v2Rows);
    const schemaBefore = schemaOf(db);

    expect(() => upgradeV2(db, true)).toThrow("forced failure");

    expect(schemaOf(db)).toEqual(schemaBefore);
    expect(userVersion(db)).toBe(2);
  });
});

describe("v3 → v4 migration", () => {
  const v3Rows = [
    dict(1, "apple"),
    dict(2, "Monday", "review"),
    dict(3, "run", "learned"),
    custom(7, "Serendipity"),
    custom(12, "bank", "review"),
  ];

  const fullRowsOf = (db: DatabaseSync) =>
    db.prepare("SELECT * FROM words ORDER BY id;").all();

  it("keeps every row, key, status and rank", () => {
    const db = createV3(v3Rows);
    const rowsBefore = fullRowsOf(db);

    upgradeV3(db);

    expect(fullRowsOf(db)).toEqual(rowsBefore);
    expect(rowsBefore).toHaveLength(5);
  });

  it("sets user_version to 4, adds an empty daily_progress and leaves the same schema as a fresh install", () => {
    const db = createV3(v3Rows);
    db.exec(
      `INSERT INTO app_settings (key, value)
       VALUES ('theme_preference', 'dark'), ('dictionary_version', 'abc');`,
    );

    upgradeV3(db);

    expect(userVersion(db)).toBe(4);
    expect(comparableSchemaOf(db)).toEqual(comparableSchemaOf(createFreshV4()));
    expect(dailyRowsOf(db)).toEqual([]);
    expect(db.prepare("SELECT key, value FROM app_settings ORDER BY key;").all()).toEqual([
      { key: "dictionary_version", value: "abc" },
      { key: "theme_preference", value: "dark" },
    ]);
  });

  it("leaves v3 untouched when it fails", () => {
    const db = createV3(v3Rows);
    const schemaBefore = schemaOf(db);

    expect(() => upgradeV3(db, true)).toThrow("forced failure");

    expect(schemaOf(db)).toEqual(schemaBefore);
    expect(userVersion(db)).toBe(3);
  });
});

describe("schema v4 constraints", () => {
  const createV4 = createFreshV4;

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
    const db = createV4();
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
    const db = createV4();
    expect(() => insert(db, "a", 0, "done")).toThrow(/CHECK constraint failed/);
    expect(() => insert(db, "b", 0, null)).toThrow(/NOT NULL constraint failed/);
  });

  it("rejects a custom word with a dict_key", () => {
    expect(() => insert(createV4(), "a", 1)).toThrow(/CHECK constraint failed/);
  });

  it("rejects a dictionary word without a dict_key", () => {
    expect(() => insert(createV4(), null, 0)).toThrow(/CHECK constraint failed/);
  });

  it("rejects an is_custom other than 0 or 1", () => {
    expect(() => insert(createV4(), "a", 2)).toThrow(/CHECK constraint failed/);
  });

  it("rejects a duplicate dict_key", () => {
    const db = createV4();
    insert(db, "a", 0);
    expect(() => insert(db, "a", 0)).toThrow(/UNIQUE constraint failed/);
  });

  it("keeps one daily_progress row per day with a non-negative count", () => {
    const db = createV4();
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
