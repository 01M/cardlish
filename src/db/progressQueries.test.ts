/**
 * @jest-environment node
 */
/// <reference types="node" />
// Смена статусов, дневной прогресс, цель и сбросы проверяются на настоящем
// SQLite из node:sqlite теми же SQL-строками, что выполняет database.ts
import { DatabaseSync } from "node:sqlite";
import { DAILY_GOAL_DEFAULT } from "../utils/dailyGoal";
import {
  CLEAR_DAILY_PROGRESS,
  DELETE_CUSTOM_WORDS,
  INCREMENT_DAILY_PROGRESS,
  MARK_WORD_AS_LEARNED,
  MARK_WORD_AS_REVIEW,
  parseDailyProgress,
  RESET_ALL_STATUSES,
  SELECT_DAILY_GOAL,
  SELECT_DAILY_PROGRESS,
  SET_DAILY_GOAL,
} from "./progressQueries";
import { CREATE_SCHEMA_V5, SET_SCHEMA_VERSION } from "./schema";

const DAY = "2026-10-13";
const NEXT_DAY = "2026-10-14";

// Слова: id 1–3 словаря, 4–5 свои
const createFixture = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CREATE_SCHEMA_V5);
  db.exec(SET_SCHEMA_VERSION);
  db.exec(`
    INSERT INTO words (id, dict_key, term, translation, is_custom, status, rank) VALUES
      (1, 'apple', 'apple', 'я́блоко', 0, 'new', 1),
      (2, 'run', 'run', 'бег', 0, 'new', 2),
      (3, 'set', 'set', 'набо́р', 0, 'review', 3),
      (4, NULL, 'Alpha', 'своё', 1, 'new', NULL),
      (5, NULL, 'Beta', 'своё', 1, 'learned', NULL);
  `);
  return db;
};

// Как markWordAsReview: UPDATE и +1 — одной транзакцией, +1 только если
// UPDATE изменил строку
const markAsReview = (db: DatabaseSync, wordId: number, localDay = DAY) => {
  db.exec("BEGIN");
  try {
    const { changes } = db.prepare(MARK_WORD_AS_REVIEW).run(wordId);
    if (Number(changes) > 0) {
      db.prepare(INCREMENT_DAILY_PROGRESS).run(localDay);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

// Как markWordAsLearned
const markAsLearned = (db: DatabaseSync, wordId: number) =>
  db.prepare(MARK_WORD_AS_LEARNED).run(wordId);

// Как getDailyProgress
const progressOf = (db: DatabaseSync, localDay = DAY) =>
  parseDailyProgress(
    db.prepare(SELECT_DAILY_PROGRESS).get(localDay) as {
      introduced: number | null;
      goal: string | null;
    },
  );

const statusOf = (db: DatabaseSync, id: number) =>
  (db.prepare("SELECT status FROM words WHERE id = ?;").get(id) as { status: string })
    .status;

const dailyRowsOf = (db: DatabaseSync) =>
  db.prepare("SELECT local_day, introduced FROM daily_progress ORDER BY local_day;").all();

describe("daily progress", () => {
  it("starts at zero with the default goal", () => {
    expect(progressOf(createFixture())).toEqual({ introduced: 0, goal: DAILY_GOAL_DEFAULT });
  });

  it("counts a word once when it leaves 'new'", () => {
    const db = createFixture();

    markAsReview(db, 1);

    expect(statusOf(db, 1)).toBe("review");
    expect(progressOf(db).introduced).toBe(1);
  });

  it("does not count a repeated call for the same word", () => {
    const db = createFixture();

    markAsReview(db, 1);
    markAsReview(db, 1);

    expect(progressOf(db).introduced).toBe(1);
  });

  it("does not count words that are not 'new'", () => {
    const db = createFixture();

    markAsReview(db, 3);
    markAsReview(db, 5);

    expect(statusOf(db, 3)).toBe("review");
    expect(statusOf(db, 5)).toBe("learned");
    expect(dailyRowsOf(db)).toEqual([]);
  });

  it("does not count review → learned", () => {
    const db = createFixture();
    markAsReview(db, 1);

    markAsLearned(db, 1);
    markAsLearned(db, 3);

    expect([statusOf(db, 1), statusOf(db, 3)]).toEqual(["learned", "learned"]);
    expect(progressOf(db).introduced).toBe(1);
  });

  it("never moves a 'new' word straight to 'learned'", () => {
    const db = createFixture();

    expect(Number(markAsLearned(db, 2).changes)).toBe(0);
    expect(statusOf(db, 2)).toBe("new");
    expect(dailyRowsOf(db)).toEqual([]);
  });

  it("counts own words like dictionary words", () => {
    const db = createFixture();

    markAsReview(db, 1);
    markAsReview(db, 4);

    expect(progressOf(db).introduced).toBe(2);
  });

  it("keeps a separate row per local day", () => {
    const db = createFixture();

    markAsReview(db, 1, DAY);
    markAsReview(db, 2, NEXT_DAY);
    markAsReview(db, 4, NEXT_DAY);

    expect(dailyRowsOf(db)).toEqual([
      { local_day: DAY, introduced: 1 },
      { local_day: NEXT_DAY, introduced: 2 },
    ]);
    expect(progressOf(db, NEXT_DAY).introduced).toBe(2);
    expect(progressOf(db, "2026-10-15").introduced).toBe(0);
  });

  it("rolls back the status change and the count together", () => {
    const db = createFixture();
    db.exec("DROP TABLE daily_progress;");

    expect(() => markAsReview(db, 1)).toThrow(/no such table/);
    expect(statusOf(db, 1)).toBe("new");
  });
});

describe("resets", () => {
  // Как resetProgressOnly / resetDatabase: одной транзакцией
  const run = (db: DatabaseSync, statements: string[]) => {
    db.exec("BEGIN");
    for (const sql of statements) db.prepare(sql).run();
    db.exec("COMMIT");
  };

  it("clears daily progress when only progress is reset", () => {
    const db = createFixture();
    markAsReview(db, 1, DAY);
    markAsReview(db, 2, NEXT_DAY);

    run(db, [RESET_ALL_STATUSES, CLEAR_DAILY_PROGRESS]);

    expect(dailyRowsOf(db)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM words WHERE status <> 'new';").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM words WHERE is_custom = 1;").get()).toEqual({ count: 2 });
  });

  it("clears daily progress and own words on a full reset", () => {
    const db = createFixture();
    markAsReview(db, 4);

    run(db, [DELETE_CUSTOM_WORDS, RESET_ALL_STATUSES, CLEAR_DAILY_PROGRESS]);

    expect(dailyRowsOf(db)).toEqual([]);
    expect(db.prepare("SELECT id, status FROM words ORDER BY id;").all()).toEqual([
      { id: 1, status: "new" },
      { id: 2, status: "new" },
      { id: 3, status: "new" },
    ]);
  });

  it("keeps the daily goal", () => {
    const db = createFixture();
    db.prepare(SET_DAILY_GOAL).run("25");

    run(db, [DELETE_CUSTOM_WORDS, RESET_ALL_STATUSES, CLEAR_DAILY_PROGRESS]);

    expect(progressOf(db).goal).toBe(25);
  });
});

describe("daily goal setting", () => {
  const goalValueOf = (db: DatabaseSync) =>
    (db.prepare(SELECT_DAILY_GOAL).get() as { value: string } | undefined)?.value;

  it("round-trips a goal", () => {
    const db = createFixture();

    db.prepare(SET_DAILY_GOAL).run("15");
    db.prepare(SET_DAILY_GOAL).run("40");

    expect(goalValueOf(db)).toBe("40");
    expect(progressOf(db).goal).toBe(40);
  });

  it.each(["abc", "7", "0", "55", ""])("falls back to the default for %p", (value) => {
    const db = createFixture();
    db.prepare(SET_DAILY_GOAL).run(value);

    expect(progressOf(db).goal).toBe(DAILY_GOAL_DEFAULT);
  });
});
