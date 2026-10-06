import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, Theme } from "./tokens";

/**
 * Возвращает тему, соответствующую системной цветовой схеме.
 * null/undefined и "light" трактуются как светлая тема.
 */
export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  return colorScheme === "dark" ? darkTheme : lightTheme;
}
