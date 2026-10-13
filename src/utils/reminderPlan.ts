// План напоминаний на скользящее окно: разовые локальные уведомления на
// сегодня и следующие дни (повторяющихся триггеров нет). План пересчитывается
// при каждом запуске и уходе в фон, поэтому без открытия приложения
// напоминания сами заканчиваются с концом окна.
// Чистый модуль: без React и без базы

import { formatNewWords, formatNumber } from "./categories";
import { pluralRu } from "./plural";
import { parseReminderTime } from "./reminderTimes";

// 1. Пределы: 3 времени × 7 дней. iOS хранит не больше 64 запланированных
// уведомлений приложения — остаёмся далеко ниже
export const REMINDER_WINDOW_DAYS = 7;
export const REMINDER_PLAN_MAX = 21;

export const REMINDER_TITLE = "Время повторить слова";

export type PlannedReminder = { at: Date; title: string; body: string };

export type ReminderPlanInput = {
  now: Date;
  // "HH:MM", местное время
  times: readonly string[];
  windowDays: number;
  goalReachedToday: boolean;
  reviewCount: number;
  dailyGoal: number;
};

// 2. Тексты. Вариант выбирается по дню года и номеру времени, так что одно и
// то же напоминание всегда получает один и тот же текст
const REVIEW_BODIES: readonly ((count: number) => string)[] = [
  (count) =>
    `Пора повторить ${formatWords(count)}. Хватит пары минут.`,
  (count) =>
    `${formatWords(count)} ${pluralRu(count, "ждёт", "ждут", "ждут")} повторения — короткая сессия ${pluralRu(count, "закрепит его", "закрепит их", "закрепит их")}.`,
  (count) =>
    `Повторите ${formatWords(count)}, пока ${pluralRu(count, "оно свежо", "они свежи", "они свежи")} в памяти.`,
];

const NEW_WORDS_BODIES: readonly ((goal: number) => string)[] = [
  (goal) => `Новые слова ждут: цель на сегодня — ${formatNewWords(goal)}.`,
  (goal) =>
    `Самое время для новых слов: на сегодня запланировано ${formatNewWords(goal)}.`,
  (goal) =>
    `Короткая сессия — и вы ближе к цели: ${formatNewWords(goal)} в день.`,
];

const formatWords = (count: number) =>
  `${formatNumber(count)} ${pluralRu(count, "слово", "слова", "слов")}`;

// День года (0 — 1 января) из местных компонентов: не зависит от часового
// пояса и перевода часов
export const localDayOfYear = (date: Date) =>
  Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 1)) /
      86_400_000,
  );

export const getReminderBody = (
  at: Date,
  timeIndex: number,
  reviewCount: number,
  dailyGoal: number,
) => {
  const bodies = reviewCount > 0 ? REVIEW_BODIES : NEW_WORDS_BODIES;
  const variant = (localDayOfYear(at) + timeIndex) % bodies.length;
  return bodies[variant](reviewCount > 0 ? reviewCount : dailyGoal);
};

// 3. План. Даты строятся из местных компонентов (год, месяц, день + смещение,
// часы, минуты) — не прибавлением 24 часов, поэтому перевод часов не сдвигает
// время напоминания. Только строго будущие; сегодняшние — только пока цель
// дня не выполнена; по возрастанию; не больше REMINDER_PLAN_MAX
export const planReminders = ({
  now,
  times,
  windowDays,
  goalReachedToday,
  reviewCount,
  dailyGoal,
}: ReminderPlanInput): PlannedReminder[] => {
  const parsedTimes = [...new Set(times)]
    .sort()
    .map(parseReminderTime)
    .filter((time) => time !== null);

  const plan: PlannedReminder[] = [];
  const firstDay = goalReachedToday ? 1 : 0;
  for (let dayOffset = firstDay; dayOffset < windowDays; dayOffset += 1) {
    parsedTimes.forEach((time, timeIndex) => {
      const at = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + dayOffset,
        time.hour,
        time.minute,
      );
      if (at.getTime() <= now.getTime()) return;
      plan.push({
        at,
        title: REMINDER_TITLE,
        body: getReminderBody(at, timeIndex, reviewCount, dailyGoal),
      });
    });
  }

  return plan
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, REMINDER_PLAN_MAX);
};
