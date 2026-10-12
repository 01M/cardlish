// Схема базы и миграции — только SQL-строки и чистые функции, без
// expo-sqlite, чтобы их можно было проверять в тестах на node:sqlite.
// Версия схемы хранится в PRAGMA user_version (у v1 она 0)
export const SCHEMA_VERSION = 2;

// 1. Таблица слов v2. dict_key — стабильный ключ слова из словаря
// (term в нижнем регистре), у своих слов он NULL
const createWordsTableSql = (tableName: string) => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dict_key TEXT UNIQUE,
    term TEXT NOT NULL,
    translation TEXT NOT NULL,
    transcription TEXT,
    example TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'review', 'learned')),
    CHECK ((is_custom = 1) = (dict_key IS NULL))
  );
`;

const CREATE_WORDS_INDEXES = `
  CREATE INDEX idx_words_is_custom_status ON words (is_custom, status);
`;

const CREATE_APP_SETTINGS = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

// 2. Схема v2 для новой установки
export const CREATE_SCHEMA_V2 = `
  ${createWordsTableSql("words")}
  ${CREATE_WORDS_INDEXES}
  ${CREATE_APP_SETTINGS}
`;

// Ставится последним шагом той же транзакции, что меняет схему
export const SET_SCHEMA_VERSION = `PRAGMA user_version = ${SCHEMA_VERSION};`;

export const SELECT_USER_VERSION = "PRAGMA user_version;";

export const SELECT_WORDS_TABLE =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'words';";

// 3. Что делать с базой при запуске:
// - "fresh" — новая установка: создать схему v2 и заполнить словарь;
// - "upgrade-v1" — база v1 (user_version 0, таблица words есть): перенести;
// - "current" — схема уже v2;
// - "too-new" — база от более новой версии приложения: ничего не трогаем;
// - "unknown" — версия, которую не записывала ни одна версия приложения
export type MigrationPlan =
  | "fresh"
  | "upgrade-v1"
  | "current"
  | "too-new"
  | "unknown";

export const planMigration = (
  userVersion: number,
  hasWordsTable: boolean,
): MigrationPlan => {
  if (userVersion === 0) return hasWordsTable ? "upgrade-v1" : "fresh";
  if (userVersion === SCHEMA_VERSION) return "current";
  if (userVersion > SCHEMA_VERSION) return "too-new";
  return "unknown";
};

// 4. Перенос v1 → v2. Выполняется одной транзакцией вместе с
// SET_SCHEMA_VERSION; при ошибке откат возвращает базу v1 как была.
// - id переносятся явно, свои слова и статусы — без изменений;
// - dict_key = lower(trim(term)) у слов словаря (все term в v1 — ASCII,
//   поэтому lower() в SQLite совпадает с toDictKey);
// - дубли dict_key (словарь v1 заполнился дважды) сливаются в строку с
//   меньшим id, статус берётся самый продвинутый: learned > review > new;
// - счётчик AUTOINCREMENT не уменьшается: id удалённых своих слов не
//   выдаются повторно, как и в v1
const statusRankSql = (column: string) =>
  `CASE ${column} WHEN 'learned' THEN 2 WHEN 'review' THEN 1 ELSE 0 END`;

export const MIGRATE_V1_TO_V2 = `
  ${createWordsTableSql("words_v2")}

  INSERT INTO words_v2
    (id, dict_key, term, translation, transcription, example, is_custom, status)
  SELECT
    id,
    CASE WHEN is_custom = 1 THEN NULL ELSE lower(trim(term)) END,
    term,
    translation,
    transcription,
    example,
    CASE WHEN is_custom = 1 THEN 1 ELSE 0 END,
    status
  FROM words
  WHERE true
  ORDER BY id
  ON CONFLICT (dict_key) DO UPDATE SET status = CASE
    WHEN ${statusRankSql("excluded.status")} > ${statusRankSql("words_v2.status")}
      THEN excluded.status
    ELSE words_v2.status
  END;

  UPDATE sqlite_sequence
  SET seq = MAX(seq, COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'words'), 0))
  WHERE name = 'words_v2';

  DROP TABLE words;
  ALTER TABLE words_v2 RENAME TO words;
  ${CREATE_WORDS_INDEXES}
  ${CREATE_APP_SETTINGS}
`;

// Копия базы перед переносом (параметр — абсолютный путь к новому файлу;
// существующий файл VACUUM INTO не перезаписывает, а падает)
export const BACKUP_DATABASE_INTO = "VACUUM INTO ?;";

// 5. Заполнение словаря из dictionary.json: многострочные INSERT пачками
// (по 5 параметров на строку — далеко от лимита переменных SQLite)
export interface DictionaryItem {
  term: string;
  translation: string;
  transcription?: string;
  example?: string;
}

export interface SqlBatch {
  sql: string;
  params: (string | null)[];
}

export const SEED_BATCH_SIZE = 500;

export const COUNT_WORDS = "SELECT COUNT(*) AS count FROM words;";

export const toDictKey = (term: string) => term.trim().toLowerCase();

export const buildSeedBatches = (
  items: DictionaryItem[],
  batchSize = SEED_BATCH_SIZE,
): SqlBatch[] => {
  const batches: SqlBatch[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const chunk = items.slice(start, start + batchSize);
    batches.push({
      sql: `INSERT INTO words (dict_key, term, translation, transcription, example, is_custom, status)
            VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, 0, 'new')").join(", ")};`,
      params: chunk.flatMap((item) => [
        toDictKey(item.term),
        item.term,
        item.translation,
        item.transcription || null,
        item.example || null,
      ]),
    });
  }
  return batches;
};
