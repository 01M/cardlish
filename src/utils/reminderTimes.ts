// Время напоминаний: app_settings.reminder_times — JSON-массив строк "HH:MM"
// (местное время), по возрастанию, без повторов, от 1 до 3 штук.
// Чистый модуль: без React и без базы

import { pluralRu } from "./plural";

// 1. Пределы и значение по умолчанию
export const REMINDER_TIMES_MAX = 3;
export const DEFAULT_REMINDER_TIME = "20:00";
export const DEFAULT_REMINDER_TIMES: readonly string[] = [DEFAULT_REMINDER_TIME];

// 2. Одно время "HH:MM": часы 00–23, минуты 00–59, всегда две цифры
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ReminderTime = { hour: number; minute: number };

export const parseReminderTime = (value: unknown): ReminderTime | null => {
  if (typeof value !== "string") return null;
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

export const formatReminderTime = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

// Для выбора времени: дата с этим временем (местное) и обратно
export const reminderTimeToDate = (time: string, base: Date): Date => {
  const parsed = parseReminderTime(time) ?? parseReminderTime(DEFAULT_REMINDER_TIME)!;
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    parsed.hour,
    parsed.minute,
  );
};

export const dateToReminderTime = (date: Date) =>
  formatReminderTime(date.getHours(), date.getMinutes());

// 3. Список: только корректные значения, без повторов, по возрастанию
// ("HH:MM" с нулями сортируется как строка), не больше трёх (ранние)
export const normalizeReminderTimes = (values: readonly unknown[]): string[] =>
  [
    ...new Set(
      values.filter(
        (value): value is string => parseReminderTime(value) !== null,
      ),
    ),
  ]
    .sort()
    .slice(0, REMINDER_TIMES_MAX);

// Значение из app_settings. Нет записи, не JSON, не массив или ни одного
// корректного времени — время по умолчанию
export const parseReminderTimes = (
  value: string | null | undefined,
): string[] => {
  if (value == null) return [...DEFAULT_REMINDER_TIMES];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [...DEFAULT_REMINDER_TIMES];
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_REMINDER_TIMES];
  const times = normalizeReminderTimes(parsed);
  return times.length > 0 ? times : [...DEFAULT_REMINDER_TIMES];
};

// Записываем только допустимый список: 1–3 корректных разных времени
export const isValidReminderTimes = (times: readonly unknown[]) => {
  if (times.length < 1 || times.length > REMINDER_TIMES_MAX) return false;
  const normalized = normalizeReminderTimes(times);
  return normalized.length === times.length;
};

export const serializeReminderTimes = (times: readonly string[]): string => {
  if (!isValidReminderTimes(times)) {
    throw new Error(`Invalid reminder times ${JSON.stringify(times)}`);
  }
  return JSON.stringify(normalizeReminderTimes(times));
};

// 4. Изменения списка из «Профиля». Повтор существующего времени, лишнее
// четвёртое время или удаление последнего ничего не меняют (возвращается
// тот же массив — экран по ссылке понимает, что сохранять нечего)
export const canAddReminderTime = (times: readonly string[]) =>
  times.length < REMINDER_TIMES_MAX;

export const canRemoveReminderTime = (times: readonly string[]) =>
  times.length > 1;

export const addReminderTime = (
  times: readonly string[],
  time: string,
): readonly string[] => {
  if (!canAddReminderTime(times) || times.includes(time)) return times;
  if (parseReminderTime(time) === null) return times;
  return normalizeReminderTimes([...times, time]);
};

export const replaceReminderTime = (
  times: readonly string[],
  previous: string,
  next: string,
): readonly string[] => {
  if (!times.includes(previous) || times.includes(next)) return times;
  if (parseReminderTime(next) === null) return times;
  return normalizeReminderTimes(
    times.map((time) => (time === previous ? next : time)),
  );
};

export const removeReminderTime = (
  times: readonly string[],
  time: string,
): readonly string[] => {
  if (!canRemoveReminderTime(times) || !times.includes(time)) return times;
  return times.filter((item) => item !== time);
};

// Начальное значение выбора для нового времени: ближайший к 20:00 свободный
// целый час (20, 19, 21, 18, 22 …)
export const suggestReminderTime = (times: readonly string[]): string => {
  const base = parseReminderTime(DEFAULT_REMINDER_TIME)!.hour;
  for (let offset = 0; offset < 24; offset += 1) {
    for (const sign of offset === 0 ? [1] : [-1, 1]) {
      const hour = (base + sign * offset + 24) % 24;
      const candidate = formatReminderTime(hour, 0);
      if (!times.includes(candidate)) return candidate;
    }
  }
  return DEFAULT_REMINDER_TIME;
};

// 5. Подписи: «1 раз в день», «2 раза в день»
export const formatRemindersPerDay = (count: number) =>
  `${count} ${pluralRu(count, "раз", "раза", "раз")} в день`;
