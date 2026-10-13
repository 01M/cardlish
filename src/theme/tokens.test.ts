// Цвета нативной конфигурации (app.json) повторяют токены темы: заставка
// показывается до запуска JS, поэтому её фон задан строкой. Здесь он сверяется
// с pageBackground, чтобы переход заставка → приложение был без вспышки
import appConfig from "../../app.json";
import { darkTheme, lightTheme } from "./tokens";

type PluginEntry = string | [string, Record<string, unknown>];

const pluginOptions = (name: string) => {
  const entry = (appConfig.expo.plugins as PluginEntry[]).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === name,
  );
  return (entry as [string, Record<string, unknown>] | undefined)?.[1];
};

describe("app.json colours", () => {
  it("uses pageBackground of both themes for the splash screen", () => {
    const splash = pluginOptions("expo-splash-screen") as {
      backgroundColor?: string;
      dark?: { backgroundColor?: string };
    };
    expect(splash.backgroundColor).toBe(lightTheme.pageBackground);
    expect(splash.dark?.backgroundColor).toBe(darkTheme.pageBackground);
  });

  it("uses orangeAccent for the notification icon", () => {
    const notifications = pluginOptions("expo-notifications") as { color?: string };
    expect(notifications.color).toBe(lightTheme.orangeAccent);
    expect(notifications.color).toBe(darkTheme.orangeAccent);
  });
});
