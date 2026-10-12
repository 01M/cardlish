// Источники данных, которые поставляются с приложением (src/data/sources.json),
// для экрана «Источники и лицензии». Каждый новый источник добавляется в
// этот файл до того, как его данные попадут в приложение
export interface DataSource {
  key: string;
  title: string;
  author: string;
  version: string;
  // Сайт проекта; "" у источника без своей страницы (ручные исправления)
  url: string;
  licenceName: string;
  licenceUrl: string;
  // Для чего приложение использует источник
  usageRu: string;
  // Что изменено в данных (этого требуют GPL и CC BY-SA)
  changesRu: string;
  // Полный текст уведомления, если лицензия требует его приводить; иначе ""
  noticeText: string;
  sortOrder: number;
}

const REQUIRED_TEXT_FIELDS = [
  "key",
  "title",
  "author",
  "version",
  "licenceName",
  "licenceUrl",
  "usageRu",
  "changesRu",
] as const;

const isHttpsUrl = (value: string) => value.startsWith("https://");

const parseSource = (raw: unknown, index: number): DataSource => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Source #${index}: expected an object`);
  }
  const item = raw as Record<string, unknown>;

  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = item[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Source #${index}: "${field}" must be a non-empty string`);
    }
  }
  if (item.url !== undefined && typeof item.url !== "string") {
    throw new Error(`Source #${index}: "url" must be a string`);
  }
  const url = (item.url as string | undefined) ?? "";
  if (url !== "" && !isHttpsUrl(url)) {
    throw new Error(`Source #${index}: "url" must start with https://`);
  }
  if (!isHttpsUrl(item.licenceUrl as string)) {
    throw new Error(`Source #${index}: "licenceUrl" must start with https://`);
  }
  if (item.noticeText !== undefined && typeof item.noticeText !== "string") {
    throw new Error(`Source #${index}: "noticeText" must be a string`);
  }
  if (typeof item.sortOrder !== "number" || !Number.isFinite(item.sortOrder)) {
    throw new Error(`Source #${index}: "sortOrder" must be a number`);
  }

  return {
    key: item.key as string,
    title: item.title as string,
    author: item.author as string,
    version: item.version as string,
    url,
    licenceName: item.licenceName as string,
    licenceUrl: item.licenceUrl as string,
    usageRu: item.usageRu as string,
    changesRu: item.changesRu as string,
    noticeText: (item.noticeText as string | undefined) ?? "",
    sortOrder: item.sortOrder,
  };
};

// 1. Проверка и разбор списка источников: обязательные поля заполнены,
// ссылки только https:// (сайт проекта может отсутствовать), ключи уникальны;
// результат упорядочен по sortOrder
export const parseSources = (raw: unknown): DataSource[] => {
  if (!Array.isArray(raw)) {
    throw new Error("Sources: expected an array");
  }
  const sources = raw.map(parseSource);

  const keys = new Set<string>();
  for (const source of sources) {
    if (keys.has(source.key)) {
      throw new Error(`Sources: duplicate key "${source.key}"`);
    }
    keys.add(source.key);
  }

  return sources.sort((a, b) => a.sortOrder - b.sortOrder);
};

// 2. Ссылка для показа: без https:// и завершающего «/»
export const formatUrlForDisplay = (url: string) =>
  url.replace(/^https:\/\//, "").replace(/\/$/, "");
