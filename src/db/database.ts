import * as SQLite from "expo-sqlite";
import dictionaryVersion from "../assets/dictionary.version.json";
import {
  CategoryCounts,
  isAllSelected,
  parseSelection,
  serializeSelection,
} from "../utils/categories";
import {
  isValidDailyGoal,
  parseDailyGoal,
  toLocalDay,
} from "../utils/dailyGoal";
import {
  buildCategoryCountsQuery,
  buildNewWordsQuery,
  DELETE_LEARN_CATEGORIES,
  parseCategoryCounts,
  SELECT_LEARN_CATEGORIES,
  SET_LEARN_CATEGORIES,
} from "./categoryQueries";
import {
  DictionaryCard,
  planDictionarySync,
  SELECT_DICTIONARY_VERSION,
  SELECT_NEW_DICTIONARY_KEYS,
} from "./dictionarySync";
import {
  CLEAR_DAILY_PROGRESS,
  DailyProgress,
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
import {
  BACKUP_DATABASE_INTO,
  CREATE_SCHEMA_V4,
  MIGRATE_V1_TO_V2,
  MIGRATE_V2_TO_V3,
  MIGRATE_V3_TO_V4,
  planMigration,
  SELECT_USER_VERSION,
  SELECT_WORDS_TABLE,
  SET_SCHEMA_VERSION,
} from "./schema";

export interface Word {
  id: number;
  // Ключ слова из словаря; у своих слов — null
  dict_key: string | null;
  term: string;
  translation: string;
  transcription: string | null;
  example: string | null;
  is_custom: number;
  status: "new" | "review" | "learned";
}

export type { DailyProgress } from "./progressQueries";

export interface WordsStats {
  totalNew: number;
  review: number;
  learned: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("english_cards.db").catch((error) => {
      // Сбрасываем мемоизацию, чтобы следующий вызов мог повторить открытие
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
};

// База создана более новой версией приложения: её не трогаем
export class DatabaseTooNewError extends Error {
  constructor(userVersion: number) {
    super(`Database schema version ${userVersion} is newer than this app`);
    this.name = "DatabaseTooNewError";
  }
}

// Синхронизация словаря (правила — в dictionarySync.ts), когда версия
// встроенного словаря отличается от сохранённой в app_settings. Так же
// заполняется словарь новой установки. Большой JSON подгружаем лениво —
// только когда синхронизация нужна, чтобы он не разбирался при каждом запуске
const syncDictionaryIfNeeded = async (db: SQLite.SQLiteDatabase) => {
  const installed = await db.getFirstAsync<{ value: string }>(
    SELECT_DICTIONARY_VERSION,
  );
  if (installed?.value === dictionaryVersion.version) return;

  const cards: DictionaryCard[] = require("../assets/dictionary.json");
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existingNewKeys = await txn.getAllAsync<{ dict_key: string }>(
      SELECT_NEW_DICTIONARY_KEYS,
    );
    const steps = planDictionarySync(
      cards,
      existingNewKeys.map((row) => row.dict_key),
      dictionaryVersion.version,
    );
    for (const step of steps) {
      await txn.runAsync(step.sql, step.params);
    }
  });
};

// Копия базы v1, которая делается перед переносом на v2. Лежит рядом с
// базой и удаляется при следующем успешном запуске на v2 или новее
const V1_BACKUP_NAME = "english_cards.v1-backup.db";

const getDbDirectory = (db: SQLite.SQLiteDatabase) =>
  db.databasePath.slice(0, db.databasePath.lastIndexOf("/"));

const deleteV1Backup = async (db: SQLite.SQLiteDatabase) => {
  try {
    await SQLite.deleteDatabaseAsync(V1_BACKUP_NAME, getDbDirectory(db));
  } catch {
    // Обычно файла просто нет; коды ошибки на iOS и Android разные,
    // поэтому их не различаем
  }
};

// 1. Инициализация базы данных: перенос схемы (версия в PRAGMA
// user_version), затем синхронизация словаря. Ошибка любого шага — экран
// ошибки БД с повтором
export const initDatabase = async () => {
  const db = await getDb();
  await migrateSchema(db);
  await syncDictionaryIfNeeded(db);
};

const migrateSchema = async (db: SQLite.SQLiteDatabase) => {
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    SELECT_USER_VERSION,
  );
  const userVersion = versionRow?.user_version ?? 0;
  const wordsTable = await db.getFirstAsync(SELECT_WORDS_TABLE);

  switch (planMigration(userVersion, wordsTable != null)) {
    case "fresh":
      // Схема и версия — одной транзакцией; словарь заполнит синхронизация
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(CREATE_SCHEMA_V4);
        await txn.execAsync(SET_SCHEMA_VERSION);
      });
      return;
    case "upgrade-v1":
      // Без копии v1 не переносим: ошибка здесь — экран ошибки БД. Копию
      // от прошлой неудачной попытки удаляем, иначе VACUUM INTO упадёт.
      // Пустую таблицу v1 (первое заполнение словаря прервалось) заполнит
      // синхронизация
      await deleteV1Backup(db);
      await db.runAsync(BACKUP_DATABASE_INTO, [
        `${getDbDirectory(db)}/${V1_BACKUP_NAME}`,
      ]);
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(MIGRATE_V1_TO_V2);
        await txn.execAsync(MIGRATE_V2_TO_V3);
        await txn.execAsync(MIGRATE_V3_TO_V4);
        await txn.execAsync(SET_SCHEMA_VERSION);
      });
      return;
    case "upgrade-v2":
      // Копия v1 могла остаться от переноса v1 → v2: это уже следующий запуск
      await deleteV1Backup(db);
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(MIGRATE_V2_TO_V3);
        await txn.execAsync(MIGRATE_V3_TO_V4);
        await txn.execAsync(SET_SCHEMA_VERSION);
      });
      return;
    case "upgrade-v3":
      // Копия v1 могла остаться от переноса v1 → v3 предыдущей версии
      await deleteV1Backup(db);
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(MIGRATE_V3_TO_V4);
        await txn.execAsync(SET_SCHEMA_VERSION);
      });
      return;
    case "current":
      await deleteV1Backup(db);
      return;
    case "too-new":
      throw new DatabaseTooNewError(userVersion);
    case "unknown":
      throw new Error(`Unknown database schema version ${userVersion}`);
  }
};

// 2. Добавление пользовательского слова
export const addCustomWord = async (
  term: string,
  translation: string,
  transcription?: string,
  example?: string,
) => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO words (term, translation, transcription, example, is_custom, status) 
     VALUES (?, ?, ?, ?, 1, 'new');`,
    [term, translation, transcription || null, example || null],
  );
};

export const getCustomWords = async (
  status: Word["status"] | "all" = "all",
): Promise<Word[]> => {
  const db = await getDb();

  if (status === "all") {
    return await db.getAllAsync<Word>(
      "SELECT * FROM words WHERE is_custom = 1 ORDER BY term COLLATE NOCASE;",
    );
  }

  return await db.getAllAsync<Word>(
    "SELECT * FROM words WHERE is_custom = 1 AND status = ? ORDER BY term COLLATE NOCASE;",
    [status],
  );
};

export const updateCustomWord = async (
  id: number,
  term: string,
  translation: string,
  transcription?: string,
  example?: string,
) => {
  const db = await getDb();
  await db.runAsync(
    `UPDATE words
     SET term = ?, translation = ?, transcription = ?, example = ?
     WHERE id = ? AND is_custom = 1;`,
    [term, translation, transcription || null, example || null, id],
  );
};

export const deleteCustomWord = async (id: number) => {
  const db = await getDb();
  await db.runAsync("DELETE FROM words WHERE id = ? AND is_custom = 1;", [id]);
};

// 4. Статистика по статусам слов (один проход по таблице)
export const getWordsStats = async (): Promise<WordsStats> => {
  const db = await getDb();

  const row = await db.getFirstAsync<{
    totalNew: number;
    review: number;
    learned: number;
  }>(
    `SELECT
       COUNT(CASE WHEN status = 'new' THEN 1 END) AS totalNew,
       COUNT(CASE WHEN status = 'review' THEN 1 END) AS review,
       COUNT(CASE WHEN status = 'learned' THEN 1 END) AS learned
     FROM words;`,
  );

  return {
    totalNew: row?.totalNew ?? 0,
    review: row?.review ?? 0,
    learned: row?.learned ?? 0,
  };
};

// 5. Выборка новых слов для сессии «Учить» из выбранных разделов: сначала
// свои, затем словарь по частотности (см. buildNewWordsQuery)
export const getSessionWords = async (
  selection: readonly string[],
  limit: number,
): Promise<Word[]> => {
  const db = await getDb();
  const query = buildNewWordsQuery(selection, limit);
  return await db.getAllAsync<Word>(query.sql, query.params);
};

// 5a. Счётчики разделов: всего слов и сколько ещё новых (один проход)
export const getCategoryCounts = async (): Promise<CategoryCounts> => {
  const db = await getDb();
  const query = buildCategoryCountsQuery();
  const row = await db.getFirstAsync<Record<string, number>>(
    query.sql,
    query.params,
  );
  return parseCategoryCounts(row);
};

// 5b. Выбранные разделы «Учить». «Все разделы» храним отсутствием записи
export const getLearnSelection = async (): Promise<string[]> => {
  const db = await getDb();
  const setting = await db.getFirstAsync<{ value: string }>(
    SELECT_LEARN_CATEGORIES,
  );
  return parseSelection(setting?.value);
};

export const setLearnSelection = async (selection: readonly string[]) => {
  const db = await getDb();
  if (isAllSelected(selection)) {
    await db.runAsync(DELETE_LEARN_CATEGORIES);
  } else {
    await db.runAsync(SET_LEARN_CATEGORIES, [serializeSelection(selection)]);
  }
};

// 6. Перевод слова в статус 'review' (только из 'new': устаревшая сессия
// «Учить» не должна трогать слова, которые уже ушли дальше). Если слово
// действительно ушло из 'new', в той же транзакции +1 к прогрессу
// сегодняшнего локального дня; повторный вызов ничего не считает
export const markWordAsReview = async (wordId: number) => {
  const db = await getDb();
  const localDay = toLocalDay(new Date());
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(MARK_WORD_AS_REVIEW, [wordId]);
    if (result.changes > 0) {
      await txn.runAsync(INCREMENT_DAILY_PROGRESS, [localDay]);
    }
  });
};

// 7. Получение слов на повторение
export const getReviewWords = async (): Promise<Word[]> => {
  const db = await getDb();
  return await db.getAllAsync<Word>(
    "SELECT * FROM words WHERE status = 'review' ORDER BY RANDOM();",
  );
};

// 8. Перевод слова в статус 'learned' (только из 'review'; в дневной
// прогресс не идёт)
export const markWordAsLearned = async (wordId: number) => {
  const db = await getDb();
  await db.runAsync(MARK_WORD_AS_LEARNED, [wordId]);
};

// 9. Полный сброс базы: удаляем свои слова, словарь возвращаем в 'new',
// дневной прогресс очищаем. Строки словаря сохраняют свои id
export const resetDatabase = async () => {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(DELETE_CUSTOM_WORDS);
    await txn.runAsync(RESET_ALL_STATUSES);
    await txn.runAsync(CLEAR_DAILY_PROGRESS);
  });
};

// 10. Сброс только прогресса (вместе с дневным прогрессом)
export const resetProgressOnly = async () => {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(RESET_ALL_STATUSES);
    await txn.runAsync(CLEAR_DAILY_PROGRESS);
  });
};

// 10a. Дневная цель и сколько новых слов введено за локальный день
// (localDay — toLocalDay(new Date()) на момент загрузки экрана)
export const getDailyProgress = async (
  localDay: string,
): Promise<DailyProgress> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    introduced: number | null;
    goal: string | null;
  }>(SELECT_DAILY_PROGRESS, [localDay]);
  return parseDailyProgress(row);
};

export const getDailyGoal = async (): Promise<number> => {
  const db = await getDb();
  const setting = await db.getFirstAsync<{ value: string }>(SELECT_DAILY_GOAL);
  return parseDailyGoal(setting?.value);
};

export const setDailyGoal = async (goal: number) => {
  if (!isValidDailyGoal(goal)) {
    throw new Error(`Invalid daily goal ${goal}`);
  }
  const db = await getDb();
  await db.runAsync(SET_DAILY_GOAL, [String(goal)]);
};

export const getReminderEnabled = async (): Promise<boolean> => {
  const db = await getDb();
  const setting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'daily_reminder_enabled';",
  );
  return setting?.value === "true";
};

export const setReminderEnabled = async (enabled: boolean) => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('daily_reminder_enabled', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [enabled ? "true" : "false"],
  );
};

// 11. Предпочтение темы оформления ("system" | "light" | "dark")
export const getThemePreference = async (): Promise<
  "system" | "light" | "dark"
> => {
  const db = await getDb();
  const setting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'theme_preference';",
  );
  if (
    setting?.value === "light" ||
    setting?.value === "dark" ||
    setting?.value === "system"
  ) {
    return setting.value;
  }
  return "system";
};

export const setThemePreference = async (
  pref: "system" | "light" | "dark",
) => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('theme_preference', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [pref],
  );
};
