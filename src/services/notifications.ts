import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import {
  getDailyProgress,
  getReminderEnabled,
  getReminderTimes,
  getWordsStats,
} from "../db/database";
import { createReminderReplanner } from "./reminders";

// isRunningInExpoGo() смотрит, есть ли нативный модуль самого Expo Go, — так
// же Expo Go определяет и expo-notifications. Constants.executionEnvironment
// для этого не годится: в Expo Go 58 на Android проверка по нему перестала
// срабатывать
const isExpoGoAndroid = isRunningInExpoGo() && Platform.OS === "android";

// На Android в Expo Go сам импорт expo-notifications падает с ошибкой
// (в Expo Go нет части его нативных модулей). Поэтому подгружаем модуль
// лениво и только там, где это безопасно — в собранном приложении или на
// iOS. Если загрузка всё же упадёт, напоминания просто недоступны: ошибка
// импорта не должна ронять корневой layout
let Notifications: typeof import("expo-notifications") | undefined;
if (!isExpoGoAndroid) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- required lazy import to prevent Android Expo Go crash
    Notifications = require("expo-notifications");
  } catch (e) {
    console.error("Не удалось загрузить expo-notifications:", e);
  }
}

const ANDROID_CHANNEL = { id: "study-reminders", name: "Напоминания об учебе" };

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Запрос разрешения при включении напоминаний. На Android 13+ системный
// запрос появляется только после создания канала, поэтому канал — первым
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!Notifications) return false; // Expo Go на Android — напоминания недоступны

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.id, {
      name: ANDROID_CHANNEL.name,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
};

// Состояние разрешения — только проверка, без запроса: "blocked" — система
// больше не покажет запрос, включить можно лишь в настройках устройства;
// "unavailable" — Expo Go на Android
export type NotificationPermission =
  | "granted"
  | "askable"
  | "blocked"
  | "unavailable";

export const getNotificationPermission =
  async (): Promise<NotificationPermission> => {
    if (!Notifications) return "unavailable";
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.granted) return "granted";
    return permissions.canAskAgain ? "askable" : "blocked";
  };

// Перепланировать напоминания по текущим настройкам и прогрессу (см.
// services/reminders.ts). Никогда не бросает; вызовы идут по очереди.
// Вызывается при запуске, при возврате в приложение и уходе в фон
// (useReminderReplan) и после изменения настроек в «Профиле»
export const replanReminders = createReminderReplanner({
  notifications: Notifications,
  androidChannel: Platform.OS === "android" ? ANDROID_CHANNEL : null,
  now: () => new Date(),
  loadState: async (localDay) => {
    const [enabled, times, progress, stats] = await Promise.all([
      getReminderEnabled(),
      getReminderTimes(),
      getDailyProgress(localDay),
      getWordsStats(),
    ]);
    return {
      enabled,
      times,
      dailyGoal: progress.goal,
      introducedToday: progress.introduced,
      reviewCount: stats.review,
    };
  },
});
