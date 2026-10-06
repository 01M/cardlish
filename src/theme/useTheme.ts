import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, Theme } from "./tokens";

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
 * Возвращает тему, соответствующую системной цветовой схеме.
 */
export function useTheme(): Theme {
  return useColorSchemeName() === "dark" ? darkTheme : lightTheme;
}
