import type * as ExpoNotifications from "expo-notifications";
import { toLocalDay } from "../utils/dailyGoal";
import { planReminders, REMINDER_WINDOW_DAYS } from "../utils/reminderPlan";

// Перепланирование напоминаний: снять все запланированные уведомления
// приложения и поставить разовые (DATE) на скользящее окно из planReminders.
// Здесь только порядок шагов; модуль уведомлений и чтение базы передаются
// снаружи (notifications.ts), поэтому логика проверяется тестом без
// устройства

export type ReminderNotificationsApi = Pick<
  typeof ExpoNotifications,
  | "AndroidImportance"
  | "cancelAllScheduledNotificationsAsync"
  | "getPermissionsAsync"
  | "SchedulableTriggerInputTypes"
  | "scheduleNotificationAsync"
  | "setNotificationChannelAsync"
>;

// Всё, что нужно из базы, — на один локальный день
export type ReminderState = {
  enabled: boolean;
  times: readonly string[];
  dailyGoal: number;
  introducedToday: number;
  // Слов в статусе 'review' — то же число, что «Повторить» в «Учить»
  reviewCount: number;
};

export type ReminderDeps = {
  // undefined — модуль недоступен (Expo Go на Android)
  notifications: ReminderNotificationsApi | undefined;
  loadState: (localDay: string) => Promise<ReminderState>;
  // Канал Android; на iOS — null
  androidChannel: { id: string; name: string } | null;
  now: () => Date;
};

export const REMINDER_NOTIFICATION_TYPE = "study-reminder";

const replan = async (deps: ReminderDeps) => {
  const { notifications } = deps;
  if (!notifications) return;

  const now = deps.now();
  const state = await deps.loadState(toLocalDay(now));

  // Сначала снимаем всё: скользящее окно каждый раз строится заново, а при
  // выключенных напоминаниях или без разрешения ничего не должно остаться.
  // Снятие разрешения не требует
  await notifications.cancelAllScheduledNotificationsAsync();
  if (!state.enabled) return;

  // Разрешение здесь только проверяем, не запрашиваем
  const permissions = await notifications.getPermissionsAsync();
  if (!permissions.granted) return;

  const plan = planReminders({
    now,
    times: state.times,
    windowDays: REMINDER_WINDOW_DAYS,
    goalReachedToday: state.introducedToday >= state.dailyGoal,
    reviewCount: state.reviewCount,
    dailyGoal: state.dailyGoal,
  });
  if (plan.length === 0) return;

  const { androidChannel } = deps;
  if (androidChannel) {
    await notifications.setNotificationChannelAsync(androidChannel.id, {
      name: androidChannel.name,
      importance: notifications.AndroidImportance.DEFAULT,
    });
  }

  for (const item of plan) {
    await notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body,
        data: { type: REMINDER_NOTIFICATION_TYPE },
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: item.at,
        ...(androidChannel ? { channelId: androidChannel.id } : {}),
      },
    });
  }
};

// Вызовы выполняются строго по очереди: следующий начинается после конца
// предыдущего, так что снятие и постановка двух вызовов не перемешиваются.
// Пока один идёт, все новые вызовы делят одну ожидающую очередь (она ещё
// прочитает свежие данные). Ошибки не выходят наружу — только console.error
export const createReminderReplanner = (deps: ReminderDeps) => {
  let tail: Promise<void> = Promise.resolve();
  let queued: Promise<void> | null = null;

  return (): Promise<void> => {
    if (queued) return queued;
    const next = tail.then(async () => {
      queued = null;
      try {
        await replan(deps);
      } catch (error) {
        console.error("Failed to replan reminders:", error);
      }
    });
    queued = next;
    tail = next;
    return next;
  };
};
