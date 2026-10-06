import { Appearance, useColorScheme } from "react-native";
import { darkTheme, lightTheme, Theme } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Единственное место, где определяется цветовая схема приложения.
 * null/undefined трактуются как светлая тема.
 *
 * Чтобы временно посмотреть тёмную тему, верните здесь "dark".
 */
export function useColorSchemeName(): "light" | "dark" {
  const colorScheme = useColorScheme();
  return colorScheme === "dark" ? "dark" : "light";
}

/**
 * Применяет выбранное оформление: фиксированная тема или следование системе
 * ("unspecified" возвращает системное поведение, включая нативные элементы —
 * алерты, клавиатуру, переключатели).
 */
export function applyThemePreference(pref: ThemePreference): void {
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

/**
 * Возвращает тему, соответствующую текущей цветовой схеме.
 */
export function useTheme(): Theme {
  return useColorSchemeName() === "dark" ? darkTheme : lightTheme;
}
