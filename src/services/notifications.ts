import { Platform } from "react-native";
import Constants from "expo-constants";

const isExpoGoAndroid =
  Constants.executionEnvironment === "storeClient" && Platform.OS === "android";

// На Android в Expo Go сам импорт expo-notifications падает с ошибкой
// (push-уведомления убраны из Expo Go начиная с SDK 53). Поэтому подгружаем
// модуль лениво и только там, где это безопасно — в dev-build/production
// сборке или на iOS.
let Notifications: typeof import("expo-notifications") | undefined;
if (!isExpoGoAndroid) {
  Notifications = require("expo-notifications");
}

const DAILY_REMINDER_ID = "daily-study-reminder";
const DAILY_REMINDER_HOUR = 20;
const DAILY_REMINDER_MINUTE = 0;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const cancelDailyReminder = async () => {
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = scheduled.filter(
    (request) => request.content.data?.type === DAILY_REMINDER_ID,
  );

  await Promise.all(
    reminders.map((request) =>
      Notifications!.cancelScheduledNotificationAsync(request.identifier),
    ),
  );
};

export const enableDailyReminder = async (): Promise<boolean> => {
  if (!Notifications) return false; // Expo Go на Android — напоминания недоступны

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("study-reminders", {
      name: "Напоминания об учебе",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const permissions = await Notifications.getPermissionsAsync();
  const result = permissions.granted
    ? permissions
    : await Notifications.requestPermissionsAsync();

  if (!result.granted) return false;

  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Время повторить слова",
      body: "Откройте тренажер и закрепите английскую лексику.",
      data: { type: DAILY_REMINDER_ID },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_REMINDER_HOUR,
      minute: DAILY_REMINDER_MINUTE,
      ...(Platform.OS === "android" ? { channelId: "study-reminders" } : {}),
    },
  });

  return true;
};

export const disableDailyReminder = async () => {
  await cancelDailyReminder();
};

export const getDailyReminderTime = () =>
  `${DAILY_REMINDER_HOUR.toString().padStart(2, "0")}:${DAILY_REMINDER_MINUTE.toString().padStart(
    2,
    "0",
  )}`;