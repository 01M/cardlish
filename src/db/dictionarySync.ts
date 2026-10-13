// Синхронизация встроенного словаря (src/assets/dictionary.json) с базой —
// только SQL-строки и чистые функции, без expo-sqlite, чтобы их можно было
// проверять в тестах на node:sqlite. Новая установка заполняет словарь этой
// же синхронизацией.
// Правила (всё — одной эксклюзивной транзакцией, вместе с записью версии):
// - строки словаря сопоставляются ТОЛЬКО по dict_key (id у разных установок
//   разные); у существующих обновляются term, translation, transcription,
//   example и rank, а id, status и is_custom не трогаются никогда;
// - свои слова (dict_key NULL) не трогаются, даже если их term совпадает с
//   ключом словаря;
// - строки словаря, которых нет в новом JSON, удаляются, только если слово
//   ещё не изучалось (status 'new'); слова с прогрессом остаются как есть;
// - повторный запуск ничего не меняет

// Карточка словаря — как её пишет scripts/convert_freedict.py
export interface DictionaryCard {
  term: string;
  translation: string;
  transcription: string;
  example: string;
  rank: number;
}

export interface SqlBatch {
  sql: string;
  params: (string | number | null)[];
}

// 6 параметров на строку — далеко от лимита переменных SQLite
export const SYNC_BATCH_SIZE = 500;

const DICTIONARY_VERSION_KEY = "dictionary_version";

// Версия словаря, с которой база синхронизирована в последний раз
export const SELECT_DICTIONARY_VERSION = `
  SELECT value FROM app_settings WHERE key = '${DICTIONARY_VERSION_KEY}';
`;

const SET_DICTIONARY_VERSION = `
  INSERT INTO app_settings (key, value) VALUES ('${DICTIONARY_VERSION_KEY}', ?)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value;
`;

// Ключи неизученных строк словаря — кандидаты на удаление
export const SELECT_NEW_DICTIONARY_KEYS = `
  SELECT dict_key FROM words WHERE is_custom = 0 AND status = 'new';
`;

// 1. Ключ слова словаря: term без пробелов по краям в нижнем регистре
export const toDictKey = (term: string) => term.trim().toLowerCase();

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
};

// 2. Вставка новых и обновление существующих строк словаря пачками.
// WHERE в DO UPDATE пропускает строки без изменений, поэтому повторная
// синхронизация ничего не пишет
export const buildUpsertBatches = (
  cards: DictionaryCard[],
  batchSize = SYNC_BATCH_SIZE,
): SqlBatch[] =>
  chunk(cards, batchSize).map((part) => ({
    sql: `
      INSERT INTO words
        (dict_key, term, translation, transcription, example, rank, is_custom, status)
      VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?, 0, 'new')").join(", ")}
      ON CONFLICT (dict_key) DO UPDATE SET
        term = excluded.term,
        translation = excluded.translation,
        transcription = excluded.transcription,
        example = excluded.example,
        rank = excluded.rank
      WHERE words.term IS NOT excluded.term
        OR words.translation IS NOT excluded.translation
        OR words.transcription IS NOT excluded.transcription
        OR words.example IS NOT excluded.example
        OR words.rank IS NOT excluded.rank;
    `,
    params: part.flatMap((card) => [
      toDictKey(card.term),
      card.term,
      card.translation,
      card.transcription || null,
      card.example || null,
      card.rank,
    ]),
  }));

// 3. Ключи, которых нет в новом словаре (порядок — как в existingKeys)
export const findKeysToDelete = (
  existingKeys: string[],
  incomingKeys: string[],
): string[] => {
  const incoming = new Set(incomingKeys);
  return existingKeys.filter((key) => !incoming.has(key));
};

// 4. Удаление пачками. Условия на is_custom и status повторены в SQL, чтобы
// строка с прогрессом не удалилась, даже если её ключ попал в список
export const buildDeleteBatches = (
  keys: string[],
  batchSize = SYNC_BATCH_SIZE,
): SqlBatch[] =>
  chunk(keys, batchSize).map((part) => ({
    sql: `
      DELETE FROM words
      WHERE is_custom = 0 AND status = 'new'
        AND dict_key IN (${part.map(() => "?").join(", ")});
    `,
    params: part,
  }));

// 5. Все шаги синхронизации по порядку — выполняются одной транзакцией.
// existingNewKeys — результат SELECT_NEW_DICTIONARY_KEYS в той же транзакции.
// Версия записывается последней: она сохранится, только если вся
// синхронизация зафиксирована
export const planDictionarySync = (
  cards: DictionaryCard[],
  existingNewKeys: string[],
  version: string,
  batchSize = SYNC_BATCH_SIZE,
): SqlBatch[] => [
  ...buildUpsertBatches(cards, batchSize),
  ...buildDeleteBatches(
    findKeysToDelete(existingNewKeys, cards.map((card) => toDictKey(card.term))),
    batchSize,
  ),
  { sql: SET_DICTIONARY_VERSION, params: [version] },
];
