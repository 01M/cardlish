import { parseDailyGoal } from "../utils/dailyGoal";

// SQL смены статусов, дневного прогресса, дневной цели и сбросов. Модуль не
// зависит от expo-sqlite: те же строки проверяются в тестах на node:sqlite

// 1. Смена статуса. Слово уходит из 'new' только через MARK_WORD_AS_REVIEW
// (Учить → «Далее»); MARK_WORD_AS_LEARNED двигает только 'review' (устаревшая
// карточка повторения не должна перепрыгнуть из 'new' сразу в 'learned').
// Оба UPDATE ничего не меняют при повторном вызове
export const MARK_WORD_AS_REVIEW =
  "UPDATE words SET status = 'review' WHERE id = ? AND status = 'new';";

export const MARK_WORD_AS_LEARNED =
  "UPDATE words SET status = 'learned' WHERE id = ? AND status = 'review';";

// 2. Дневной прогресс: +1 за слово, впервые ушедшее из 'new' за этот
// локальный день. Выполняется в той же транзакции, что и
// MARK_WORD_AS_REVIEW, и только если тот изменил строку. Локальный день
// ('YYYY-MM-DD', toLocalDay) передаётся параметром — без 'localtime' SQLite
export const INCREMENT_DAILY_PROGRESS = `
  INSERT INTO daily_progress (local_day, introduced) VALUES (?, 1)
  ON CONFLICT(local_day) DO UPDATE SET introduced = introduced + 1;
`;

// Прогресс дня и цель одним запросом (параметр — локальный день)
export const SELECT_DAILY_PROGRESS = `
  SELECT
    (SELECT introduced FROM daily_progress WHERE local_day = ?) AS introduced,
    (SELECT value FROM app_settings WHERE key = 'daily_goal') AS goal;
`;

export interface DailyProgress {
  introduced: number;
  goal: number;
}

export const parseDailyProgress = (
  row: { introduced: number | null; goal: string | null } | null | undefined,
): DailyProgress => ({
  introduced: row?.introduced ?? 0,
  goal: parseDailyGoal(row?.goal),
});

// 3. Дневная цель: целое число текстом; неверное значение читается как цель
// по умолчанию (parseDailyGoal)
export const SELECT_DAILY_GOAL =
  "SELECT value FROM app_settings WHERE key = 'daily_goal';";

export const SET_DAILY_GOAL = `
  INSERT INTO app_settings (key, value) VALUES ('daily_goal', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

// 4. Сбросы (каждый — одной транзакцией): все слова снова 'new', дневной
// прогресс очищается; полный сброс ещё и удаляет свои слова
export const DELETE_CUSTOM_WORDS = "DELETE FROM words WHERE is_custom = 1;";

export const RESET_ALL_STATUSES = "UPDATE words SET status = 'new';";

export const CLEAR_DAILY_PROGRESS = "DELETE FROM daily_progress;";
