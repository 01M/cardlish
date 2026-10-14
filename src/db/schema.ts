// Схема базы и миграции — только SQL-строки и чистые функции, без
// expo-sqlite, чтобы их можно было проверять в тестах на node:sqlite.
// Версия схемы хранится в PRAGMA user_version. Цепочка переносов v1 → v5
// удалена до публикации приложения: поддерживаются только новая установка
// и база текущей версии (см. docs/ARCHITECTURE.ru.md, раздел 4)
export const SCHEMA_VERSION = 5;

// 1. Таблица слов. dict_key — стабильный ключ слова из словаря (term в
// нижнем регистре), у своих слов он NULL. rank — частотный ранг слова
// словаря из dictionary.json, у своих слов NULL
const CREATE_WORDS = `
  CREATE TABLE words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dict_key TEXT UNIQUE,
    term TEXT NOT NULL,
    translation TEXT NOT NULL,
    transcription TEXT,
    example TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'review', 'learned')),
    rank INTEGER,
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

// Сколько слов за локальный день впервые ушли из 'new'. local_day —
// 'YYYY-MM-DD' по местному времени устройства, считается в JS (toLocalDay)
const CREATE_DAILY_PROGRESS = `
  CREATE TABLE daily_progress (
    local_day TEXT PRIMARY KEY NOT NULL,
    introduced INTEGER NOT NULL DEFAULT 0 CHECK (introduced >= 0)
  );
`;

// Тематические разделы: какие слова словаря входят в тему. Целиком
// переписывается синхронизацией словаря из src/assets/topics.json; своих
// слов здесь нет (у них dict_key NULL)
const CREATE_WORD_TOPICS = `
  CREATE TABLE word_topics (
    topic TEXT NOT NULL,
    dict_key TEXT NOT NULL,
    PRIMARY KEY (topic, dict_key)
  ) WITHOUT ROWID;
`;

// 2. Схема v5 для новой установки (словарь и темы заполняет синхронизация)
export const CREATE_SCHEMA_V5 = `
  ${CREATE_WORDS}
  ${CREATE_WORDS_INDEXES}
  ${CREATE_APP_SETTINGS}
  ${CREATE_DAILY_PROGRESS}
  ${CREATE_WORD_TOPICS}
`;

// Ставится последним шагом той же транзакции, что меняет схему
export const SET_SCHEMA_VERSION = `PRAGMA user_version = ${SCHEMA_VERSION};`;

export const SELECT_USER_VERSION = "PRAGMA user_version;";

export const SELECT_WORDS_TABLE =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'words';";

// 3. Что делать с базой при запуске:
// - "fresh" — пустая база (user_version 0, таблицы words нет): создать
//   схему v5 (словарь — синхронизацией);
// - "current" — схема уже v5;
// - "too-new" — база от более новой версии приложения: ничего не трогаем;
// - "unknown" — всё остальное: базы v1–v4 (переносы с них удалены),
//   user_version 0 с таблицей words, отрицательные версии. Базу не трогаем,
//   экран ошибки просит переустановить приложение.
// Следующая версия схемы добавляется отдельным планом "upgrade-v5" (v5 → v6)
export type MigrationPlan = "fresh" | "current" | "too-new" | "unknown";

export const planMigration = (
  userVersion: number,
  hasWordsTable: boolean,
): MigrationPlan => {
  if (userVersion === 0 && !hasWordsTable) return "fresh";
  if (userVersion === SCHEMA_VERSION) return "current";
  if (userVersion > SCHEMA_VERSION) return "too-new";
  return "unknown";
};
