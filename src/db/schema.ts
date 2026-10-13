// Схема базы и миграции — только SQL-строки и чистые функции, без
// expo-sqlite, чтобы их можно было проверять в тестах на node:sqlite.
// Версия схемы хранится в PRAGMA user_version (у v1 она 0)
export const SCHEMA_VERSION = 4;

// 1. Таблица слов. dict_key — стабильный ключ слова из словаря (term в
// нижнем регистре), у своих слов он NULL. rank (с v3) — частотный ранг
// слова словаря из dictionary.json, у своих слов NULL. Колонки v2 —
// отдельно: по ним строится таблица в переносе v1 → v2
const WORDS_V2_COLUMNS = `
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dict_key TEXT UNIQUE,
    term TEXT NOT NULL,
    translation TEXT NOT NULL,
    transcription TEXT,
    example TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'review', 'learned'))`;

const WORDS_CONSTRAINTS = `
    CHECK ((is_custom = 1) = (dict_key IS NULL))`;

const createWordsTableSql = (tableName: string, extraColumns = "") => `
  CREATE TABLE ${tableName} (${WORDS_V2_COLUMNS},${extraColumns}${WORDS_CONSTRAINTS}
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

// Сколько слов за локальный день впервые ушли из 'new' (с v4). local_day —
// 'YYYY-MM-DD' по местному времени устройства, считается в JS (toLocalDay)
const CREATE_DAILY_PROGRESS = `
  CREATE TABLE daily_progress (
    local_day TEXT PRIMARY KEY NOT NULL,
    introduced INTEGER NOT NULL DEFAULT 0 CHECK (introduced >= 0)
  );
`;

// 2. Схема v4 для новой установки (словарь заполняет синхронизация)
export const CREATE_SCHEMA_V4 = `
  ${createWordsTableSql("words", "\n    rank INTEGER,")}
  ${CREATE_WORDS_INDEXES}
  ${CREATE_APP_SETTINGS}
  ${CREATE_DAILY_PROGRESS}
`;

// Ставится последним шагом той же транзакции, что меняет схему
export const SET_SCHEMA_VERSION = `PRAGMA user_version = ${SCHEMA_VERSION};`;

export const SELECT_USER_VERSION = "PRAGMA user_version;";

export const SELECT_WORDS_TABLE =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'words';";

// 3. Что делать с базой при запуске:
// - "fresh" — новая установка: создать схему v4 (словарь — синхронизацией);
// - "upgrade-v1" — база v1 (user_version 0, таблица words есть): v1 → … → v4;
// - "upgrade-v2" — база v2: v2 → v3 → v4;
// - "upgrade-v3" — база v3: v3 → v4;
// - "current" — схема уже v4;
// - "too-new" — база от более новой версии приложения: ничего не трогаем;
// - "unknown" — версия, которую не записывала ни одна версия приложения (1)
export type MigrationPlan =
  | "fresh"
  | "upgrade-v1"
  | "upgrade-v2"
  | "upgrade-v3"
  | "current"
  | "too-new"
  | "unknown";

export const planMigration = (
  userVersion: number,
  hasWordsTable: boolean,
): MigrationPlan => {
  if (userVersion === 0) return hasWordsTable ? "upgrade-v1" : "fresh";
  if (userVersion === 2) return "upgrade-v2";
  if (userVersion === 3) return "upgrade-v3";
  if (userVersion === SCHEMA_VERSION) return "current";
  if (userVersion > SCHEMA_VERSION) return "too-new";
  return "unknown";
};

// 4. Перенос v1 → v2. Выполняется одной транзакцией вместе с
// MIGRATE_V2_TO_V3, MIGRATE_V3_TO_V4 и SET_SCHEMA_VERSION; при ошибке откат
// возвращает базу v1 как была.
// - id переносятся явно, свои слова и статусы — без изменений;
// - dict_key = lower(trim(term)) у слов словаря (все term в v1 — ASCII,
//   поэтому lower() в SQLite совпадает с toDictKey из dictionarySync.ts);
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

// 5. Перенос v2 → v3: колонка частотного ранга. У существующих строк
// rank — NULL, пока его не заполнит синхронизация словаря. Выполняется
// одной транзакцией вместе с MIGRATE_V3_TO_V4 и SET_SCHEMA_VERSION
export const MIGRATE_V2_TO_V3 = `
  ALTER TABLE words ADD COLUMN rank INTEGER;
`;

// 6. Перенос v3 → v4: пустая таблица дневного прогресса (прошлые дни не
// восстанавливаем). Одной транзакцией вместе с SET_SCHEMA_VERSION
export const MIGRATE_V3_TO_V4 = CREATE_DAILY_PROGRESS;

// Копия базы перед переносом (параметр — абсолютный путь к новому файлу;
// существующий файл VACUUM INTO не перезаписывает, а падает)
export const BACKUP_DATABASE_INTO = "VACUUM INTO ?;";
