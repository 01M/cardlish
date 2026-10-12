import * as SQLite from "expo-sqlite";
import initialDictionaryRaw from "../assets/dictionary.json";

type DictionaryItem = {
  term: string;
  translation: string;
  transcription?: string;
  example?: string;
};

const initialDictionary = initialDictionaryRaw as DictionaryItem[];

export interface Word {
  id: number;
  term: string;
  translation: string;
  transcription: string | null;
  example: string | null;
  is_custom: number;
  status: "new" | "review" | "learned";
}

export interface WordsStats {
  newCustom: number;
  newDict: number;
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

// 1. Инициализация базы данных
export const initDatabase = async () => {
  const db = await getDb();

  await db.execAsync(`
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
  `);

  const firstRow = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM words;",
  );

  if (firstRow?.count === 0) {
    await db.withTransactionAsync(async () => {
      for (const item of initialDictionary) {
        await db.runAsync(
          `INSERT INTO words (term, translation, transcription, example, is_custom, status) 
           VALUES (?, ?, ?, ?, 0, 'new');`,
          [
            item.term,
            item.translation,
            item.transcription || null,
            item.example || null,
          ],
        );
      }
    });
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
    newCustom: number;
    newDict: number;
    review: number;
    learned: number;
  }>(
    `SELECT
       COUNT(CASE WHEN status = 'new' AND is_custom = 1 THEN 1 END) AS newCustom,
       COUNT(CASE WHEN status = 'new' AND is_custom = 0 THEN 1 END) AS newDict,
       COUNT(CASE WHEN status = 'review' THEN 1 END) AS review,
       COUNT(CASE WHEN status = 'learned' THEN 1 END) AS learned
     FROM words;`,
  );

  const newCustom = row?.newCustom ?? 0;
  const newDict = row?.newDict ?? 0;

  return {
    newCustom,
    newDict,
    totalNew: newCustom + newDict,
    review: row?.review ?? 0,
    learned: row?.learned ?? 0,
  };
};

// 5. Выборка слов для сессии «Учить»
export const getSessionWords = async (
  source: "custom" | "dictionary",
  limit: number,
): Promise<Word[]> => {
  const db = await getDb();

  if (source === "dictionary") {
    return await db.getAllAsync<Word>(
      "SELECT * FROM words WHERE status = 'new' AND is_custom = 0 ORDER BY RANDOM() LIMIT ?;",
      [limit],
    );
  } else {
    const customWords = await db.getAllAsync<Word>(
      "SELECT * FROM words WHERE status = 'new' AND is_custom = 1 ORDER BY RANDOM() LIMIT ?;",
      [limit],
    );

    if (customWords.length < limit) {
      const needed = limit - customWords.length;
      const dictWords = await db.getAllAsync<Word>(
        "SELECT * FROM words WHERE status = 'new' AND is_custom = 0 ORDER BY RANDOM() LIMIT ?;",
        [needed],
      );
      return [...customWords, ...dictWords];
    }

    return customWords;
  }
};

// 6. Перевод слова в статус 'review' (только из 'new': устаревшая сессия
// «Учить» не должна трогать слова, которые уже ушли дальше)
export const markWordAsReview = async (wordId: number) => {
  const db = await getDb();
  await db.runAsync(
    "UPDATE words SET status = 'review' WHERE id = ? AND status = 'new';",
    [wordId],
  );
};

// 7. Получение слов на повторение
export const getReviewWords = async (): Promise<Word[]> => {
  const db = await getDb();
  return await db.getAllAsync<Word>(
    "SELECT * FROM words WHERE status = 'review' ORDER BY RANDOM();",
  );
};

// 8. Перевод слова в статус 'learned'
export const markWordAsLearned = async (wordId: number) => {
  const db = await getDb();
  await db.runAsync("UPDATE words SET status = 'learned' WHERE id = ?;", [
    wordId,
  ]);
};

// 9. Полный сброс базы: удаляем свои слова, словарь возвращаем в 'new'.
// Строки словаря сохраняют свои id
export const resetDatabase = async () => {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM words WHERE is_custom = 1;");
    await txn.runAsync("UPDATE words SET status = 'new';");
  });
};

// 10. Сброс только прогресса
export const resetProgressOnly = async () => {
  const db = await getDb();
  await db.runAsync("UPDATE words SET status = 'new';");
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
