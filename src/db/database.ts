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
  transcription?: string;
  example?: string;
  is_custom: number;
  status: "new" | "review" | "learned";
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("english_cards.db");
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

// 2. Получение всех слов
export const getAllWords = async (): Promise<Word[]> => {
  const db = await getDb();
  return await db.getAllAsync<Word>("SELECT * FROM words;");
};

// 3. Добавление пользовательского слова
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

// 4. Статистика по статусам слов
export const getWordsStats = async () => {
  const db = await getDb();

  const newCustom = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM words WHERE status = 'new' AND is_custom = 1;",
  );
  const newDict = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM words WHERE status = 'new' AND is_custom = 0;",
  );
  const reviewCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM words WHERE status = 'review';",
  );
  const learnedCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM words WHERE status = 'learned';",
  );

  return {
    newCustom: newCustom?.count || 0,
    newDict: newDict?.count || 0,
    totalNew: (newCustom?.count || 0) + (newDict?.count || 0),
    review: reviewCount?.count || 0,
    learned: learnedCount?.count || 0,
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

// 6. Перевод слова в статус 'review'
export const markWordAsReview = async (wordId: number) => {
  const db = await getDb();
  await db.runAsync("UPDATE words SET status = 'review' WHERE id = ?;", [
    wordId,
  ]);
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

// 9. Полный сброс базы
export const resetDatabase = async () => {
  const db = await getDb();
  await db.execAsync("DROP TABLE IF EXISTS words;");
  await initDatabase();
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
