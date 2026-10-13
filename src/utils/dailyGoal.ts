// Дневная цель «Новых слов сегодня: N из G». Чистый модуль: без React и
// без базы. Сколько слов введено за день, хранит daily_progress (по
// локальному дню), цель — app_settings.daily_goal

// 1. Локальный день 'YYYY-MM-DD' — из местных компонентов даты, никогда не
// из toISOString (UTC): иначе после полуночи по местному времени день
// сменялся бы не вовремя
export const toLocalDay = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// 2. Цель: от 5 до 50 с шагом 5, по умолчанию 10
export const DAILY_GOAL_DEFAULT = 10;
export const DAILY_GOAL_MIN = 5;
export const DAILY_GOAL_MAX = 50;
export const DAILY_GOAL_STEP = 5;

export const isValidDailyGoal = (value: number) =>
  Number.isInteger(value) &&
  value >= DAILY_GOAL_MIN &&
  value <= DAILY_GOAL_MAX &&
  value % DAILY_GOAL_STEP === 0;

// Значение из app_settings (целое число текстом). Всё остальное — нет
// записи, не число, вне диапазона, не кратно шагу — даёт цель по умолчанию
export const parseDailyGoal = (value: string | null | undefined): number => {
  if (value == null || !/^\d+$/.test(value)) return DAILY_GOAL_DEFAULT;
  const goal = Number(value);
  return isValidDailyGoal(goal) ? goal : DAILY_GOAL_DEFAULT;
};

// Ближайшая допустимая цель: округление к шагу и ограничение диапазоном
export const clampDailyGoal = (value: number): number => {
  if (!Number.isFinite(value)) return DAILY_GOAL_DEFAULT;
  const stepped = Math.round(value / DAILY_GOAL_STEP) * DAILY_GOAL_STEP;
  return Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, stepped));
};

// Шаг степпера: direction 1 — больше, -1 — меньше; у границы не меняется
export const stepDailyGoal = (goal: number, direction: 1 | -1): number =>
  clampDailyGoal(goal + direction * DAILY_GOAL_STEP);

// 3. Подписи блока «Сегодня»
export const isDailyGoalReached = (introduced: number, goal: number) =>
  introduced >= goal;

// Заполнение полосы 0..1: при N >= G полоса полная
export const getDailyProgressRatio = (introduced: number, goal: number) =>
  goal > 0 ? Math.min(1, Math.max(0, introduced / goal)) : 0;

// Части строки блока: заголовок слева, счёт справа, сверх цели — отдельно
export type DailyProgressParts = {
  title: string;
  count: string;
  extra: string | null;
};

export const getDailyProgressParts = (
  introduced: number,
  goal: number,
): DailyProgressParts =>
  isDailyGoalReached(introduced, goal)
    ? {
        title: "Цель выполнена",
        count: `${goal} из ${goal}`,
        extra: introduced > goal ? `+${introduced - goal}` : null,
      }
    : { title: "Новых слов сегодня", count: `${introduced} из ${goal}`, extra: null };

// Подпись для экранного диктора: всё одной фразой
export const formatDailyProgress = (introduced: number, goal: number) =>
  isDailyGoalReached(introduced, goal)
    ? `Цель на день выполнена: ${goal} из ${goal}${
        introduced > goal ? `, ещё ${introduced - goal} сверх цели` : ""
      }`
    : `Новых слов сегодня: ${introduced} из ${goal}`;
