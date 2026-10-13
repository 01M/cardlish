/**
 * @jest-environment node
 */
/// <reference types="node" />
// Синхронизация словаря проверяется на настоящем SQLite из node:sqlite теми же
// SQL-строками, что выполняет initDatabase
import { DatabaseSync } from "node:sqlite";
import realDictionary from "../assets/dictionary.json";
import {
  buildDeleteBatches,
  buildUpsertBatches,
  DictionaryCard,
  findKeysToDelete,
  planDictionarySync,
  SELECT_DICTIONARY_VERSION,
  SELECT_NEW_DICTIONARY_KEYS,
  SYNC_BATCH_SIZE,
  toDictKey,
} from "./dictionarySync";
import { CREATE_SCHEMA_V4, SET_SCHEMA_VERSION } from "./schema";

const card = (
  term: string,
  translation: string,
  rank: number,
  transcription = "",
): DictionaryCard => ({ term, translation, transcription, example: "", rank });

const createV4 = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CREATE_SCHEMA_V4);
  db.exec(SET_SCHEMA_VERSION);
  return db;
};

type Row = {
  id: number;
  dict_key: string | null;
  term: string;
  translation: string;
  transcription: string | null;
  is_custom: number;
  status: string;
  rank: number | null;
};

// База после переноса v2 → v4: строки словаря со старым содержимым и без
// rank, свои слова, прогресс
const createSyncedBefore = (rows: Omit<Row, "rank">[]) => {
  const db = createV4();
  const insert = db.prepare(
    `INSERT INTO words (id, dict_key, term, translation, transcription, example, is_custom, status)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?);`,
  );
  for (const row of rows) {
    insert.run(row.id, row.dict_key, row.term, row.translation, row.transcription, row.is_custom, row.status);
  }
  return db;
};

const dictRow = (id: number, term: string, status = "new", translation = `старый ${term}`) => ({
  id, dict_key: term.toLowerCase(), term, translation, transcription: "/old/", is_custom: 0, status,
});

const customRow = (id: number, term: string, status = "new") => ({
  id, dict_key: null, term, translation: `своё ${term}`, transcription: null, is_custom: 1, status,
});

// Как initDatabase: ключи, план и запись версии — одной транзакцией.
// failAt — номер шага, перед которым имитируется сбой
const sync = (
  db: DatabaseSync,
  cards: DictionaryCard[],
  version = "v-new",
  { batchSize = SYNC_BATCH_SIZE, failAt = -1 } = {},
) => {
  let changes = 0;
  db.exec("BEGIN");
  try {
    const existing = (db.prepare(SELECT_NEW_DICTIONARY_KEYS).all() as { dict_key: string }[])
      .map((row) => row.dict_key);
    planDictionarySync(cards, existing, version, batchSize).forEach((step, index) => {
      if (index === failAt) throw new Error("forced failure");
      changes += Number(db.prepare(step.sql).run(...step.params).changes);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return changes;
};

const rowsOf = (db: DatabaseSync) =>
  db
    .prepare(
      `SELECT id, dict_key, term, translation, transcription, is_custom, status, rank
       FROM words ORDER BY id;`,
    )
    .all() as Row[];

const versionOf = (db: DatabaseSync) =>
  (db.prepare(SELECT_DICTIONARY_VERSION).get() as { value: string } | undefined)?.value;

describe("dictionary sync", () => {
  it("fills an empty database (fresh install)", () => {
    const db = createV4();

    sync(db, [card("apple", "я́блоко", 2, "/ˈæpəl/"), card("the", "(определённый артикль)", 1)]);

    expect(rowsOf(db)).toEqual([
      { id: 1, dict_key: "apple", term: "apple", translation: "я́блоко", transcription: "/ˈæpəl/", is_custom: 0, status: "new", rank: 2 },
      { id: 2, dict_key: "the", term: "the", translation: "(определённый артикль)", transcription: null, is_custom: 0, status: "new", rank: 1 },
    ]);
    expect(versionOf(db)).toBe("v-new");
  });

  it("updates content of existing rows but never their id, status or is_custom, and inserts new keys", () => {
    const db = createSyncedBefore([
      dictRow(1, "Apple", "learned", "[[Эпл]]"),
      dictRow(5, "run", "review"),
      dictRow(9, "set"),
      customRow(12, "bank", "review"),
    ]);
    const cards = [
      card("apple", "я́блоко", 300, "/ˈæpəl/"),
      card("run", "бег, бежа́ть", 259),
      card("set", "набо́р", 198),
      card("the", "(определённый артикль)", 1),
    ];

    sync(db, cards);

    const rows = rowsOf(db);
    expect(rows).toEqual([
      { id: 1, dict_key: "apple", term: "apple", translation: "я́блоко", transcription: "/ˈæpəl/", is_custom: 0, status: "learned", rank: 300 },
      { id: 5, dict_key: "run", term: "run", translation: "бег, бежа́ть", transcription: null, is_custom: 0, status: "review", rank: 259 },
      { id: 9, dict_key: "set", term: "set", translation: "набо́р", transcription: null, is_custom: 0, status: "new", rank: 198 },
      { id: 12, dict_key: null, term: "bank", translation: "своё bank", transcription: null, is_custom: 1, status: "review", rank: null },
      { id: expect.any(Number), dict_key: "the", term: "the", translation: "(определённый артикль)", transcription: null, is_custom: 0, status: "new", rank: 1 },
    ]);
    // Новый id — после всех существующих. Точное значение больше 13: SQLite
    // выдаёт значение AUTOINCREMENT и строкам, которые ушли в DO UPDATE
    expect(rows[4].id).toBeGreaterThan(12);
  });

  it("ends with the old rows plus the new keys", () => {
    const db = createSyncedBefore([dictRow(1, "apple"), dictRow(2, "run", "review"), customRow(3, "bank")]);

    sync(db, [card("apple", "я́блоко", 3), card("run", "бег", 2), card("the", "арти́кль", 1), card("a", "арти́кль", 4)]);

    expect(rowsOf(db)).toHaveLength(3 + 2);
  });

  it("deletes absent keys that were not studied and keeps absent keys with progress unchanged", () => {
    const db = createSyncedBefore([
      dictRow(1, "apple"),
      dictRow(2, "gone"),
      dictRow(3, "kept", "review"),
      dictRow(4, "known", "learned"),
      customRow(5, "gone"),
    ]);
    const before = rowsOf(db);

    sync(db, [card("apple", "я́блоко", 1)]);

    expect(rowsOf(db)).toEqual([
      { ...before[0], term: "apple", translation: "я́блоко", transcription: null, rank: 1 },
      before[2],
      before[3],
      before[4],
    ]);
  });

  it("never touches custom words, even when their term matches a dictionary key", () => {
    const db = createSyncedBefore([customRow(1, "Apple", "learned"), customRow(2, "bank")]);
    const before = rowsOf(db);

    sync(db, [card("apple", "я́блоко", 1), card("bank", "банк", 2)]);

    const after = rowsOf(db);
    expect(after.slice(0, 2)).toEqual(before);
    expect(after.slice(2).map((row) => [row.dict_key, row.is_custom])).toEqual([
      ["apple", 0],
      ["bank", 0],
    ]);
  });

  it("leaves daily progress untouched", () => {
    const db = createSyncedBefore([dictRow(1, "apple", "review"), dictRow(2, "gone")]);
    db.exec("INSERT INTO daily_progress (local_day, introduced) VALUES ('2026-10-13', 3);");

    sync(db, [card("apple", "я́блоко", 1), card("the", "арти́кль", 2)]);

    expect(db.prepare("SELECT local_day, introduced FROM daily_progress;").all()).toEqual([
      { local_day: "2026-10-13", introduced: 3 },
    ]);
  });

  it("changes nothing when run a second time", () => {
    const db = createSyncedBefore([dictRow(1, "apple", "review"), dictRow(2, "gone"), customRow(3, "bank")]);
    const cards = [card("apple", "я́блоко", 2), card("the", "арти́кль", 1)];
    sync(db, cards);
    const afterFirst = rowsOf(db);

    const changes = sync(db, cards, "v-new", { batchSize: 1 });

    expect(rowsOf(db)).toEqual(afterFirst);
    // Единственная запись второго прогона — та же версия в app_settings
    expect(changes).toBe(1);
  });

  it("rolls everything back, including the version, when a step fails", () => {
    const db = createSyncedBefore([dictRow(1, "apple"), dictRow(2, "gone"), dictRow(3, "run", "review")]);
    db.exec("INSERT INTO app_settings (key, value) VALUES ('dictionary_version', 'v-old');");
    const before = rowsOf(db);
    const broken = { ...card("broken", "", 4), translation: null } as unknown as DictionaryCard;

    expect(() =>
      sync(db, [card("apple", "я́блоко", 1), card("run", "бег", 2), card("the", "арти́кль", 3), broken], "v-new", { batchSize: 2 }),
    ).toThrow(/NOT NULL constraint failed/);
    expect(rowsOf(db)).toEqual(before);
    expect(versionOf(db)).toBe("v-old");

    expect(() => sync(db, [card("apple", "я́блоко", 1)], "v-new", { failAt: 1 })).toThrow("forced failure");
    expect(rowsOf(db)).toEqual(before);
    expect(versionOf(db)).toBe("v-old");
  });

  it("syncs the real dictionary.json into an empty database", () => {
    const cards = realDictionary as DictionaryCard[];
    const db = createV4();

    sync(db, cards, "real");

    const keys = (db.prepare("SELECT dict_key FROM words;").all() as { dict_key: string }[])
      .map((row) => row.dict_key);
    expect(keys).toHaveLength(cards.length);
    expect(new Set(keys)).toEqual(new Set(cards.map((item) => toDictKey(item.term))));
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM words WHERE rank IS NULL OR status <> 'new';").get(),
    ).toEqual({ count: 0 });
  });
});

describe("dictionary sync helpers", () => {
  it("finds the existing keys that are absent from the new dictionary", () => {
    expect(findKeysToDelete(["a", "b", "c", "d"], ["d", "b", "e"])).toEqual(["a", "c"]);
    expect(findKeysToDelete([], ["a"])).toEqual([]);
    expect(findKeysToDelete(["a"], [])).toEqual(["a"]);
  });

  it("splits upserts and deletes into batches", () => {
    const cards = [1, 2, 3, 4, 5].map((rank) => card(`w${rank}`, "x", rank));

    expect(buildUpsertBatches(cards, 2).map((batch) => batch.params.length)).toEqual([12, 12, 6]);
    expect(buildDeleteBatches(["a", "b", "c"], 2).map((batch) => batch.params)).toEqual([["a", "b"], ["c"]]);
    expect(buildUpsertBatches([], 2)).toEqual([]);
    expect(buildDeleteBatches([], 2)).toEqual([]);
  });

  it("keeps the default batch under SQLite's variable limit", () => {
    expect(SYNC_BATCH_SIZE * 6).toBeLessThanOrEqual(32766);
  });

  it("writes the version as the last step", () => {
    const steps = planDictionarySync([card("a", "x", 1)], ["gone"], "v-new");

    expect(steps.at(-1)?.params).toEqual(["v-new"]);
    expect(steps.at(-1)?.sql).toMatch(/app_settings/);
  });

  it("computes the same key in JS as lower(trim(term)) in the v1 → v2 migration", () => {
    const db = new DatabaseSync(":memory:");
    for (const term of ["Apple", " RUN ", "o'clock", "Twenty-One"]) {
      expect(db.prepare("SELECT lower(trim(?)) AS key;").get(term)).toEqual({ key: toDictKey(term) });
    }
  });
});
