import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDatabase, getThemePreference } from "@/db/database";
import {
  applyThemePreference,
  useColorSchemeName,
  useTheme,
} from "@/theme/useTheme";
import { Theme } from "@/theme/tokens";
import TopFade from "@/components/TopFade";
import { PressableScale } from "@/components/PressableScale";

export default function RootLayout() {
  const scheme = useColorSchemeName();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isReady, setIsReady] = useState(false);
  const [initFailed, setInitFailed] = useState(false);

  // Тема навигации: фон совпадает с фоном экрана, чтобы не было белой вспышки
  const navTheme = useMemo(
    () => {
      const base = scheme === "dark" ? DarkTheme : DefaultTheme;
      return {
        ...base,
        colors: { ...base.colors, background: theme.pageBackground },
      };
    },
    [scheme, theme],
  );

  // При ошибке приложение не показываем: остаётся экран с повтором
  const prepare = useCallback(async () => {
    try {
      await initDatabase();
      // Применяем сохранённое оформление до показа приложения
      try {
        applyThemePreference(await getThemePreference());
      } catch {
        applyThemePreference("system");
      }
      setIsReady(true);
    } catch (e) {
      console.error("Ошибка инициализации БД:", e);
      setInitFailed(true);
    }
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  const handleRetry = () => {
    setInitFailed(false);
    void prepare();
  };

  if (initFailed) {
    return (
      <ThemeProvider value={navTheme}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Не удалось открыть базу данных</Text>
          <PressableScale style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </PressableScale>
        </View>
      </ThemeProvider>
    );
  }

  if (!isReady) {
    return (
      <ThemeProvider value={navTheme}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.textEmphasis} />
          <Text style={styles.loadingText}>Загрузка базы данных...</Text>
        </View>
      </ThemeProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <TopFade />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.backdrop,
  },
  loadingText: {
    marginTop: 10,
    color: theme.textSecondary,
  },
  errorText: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 30,
  },
  retryButton: {
    backgroundColor: theme.orangeAccent,
    minHeight: 54,
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  retryButtonText: {
    color: theme.textOnAccent,
    fontSize: 16,
    fontWeight: "700",
  },
});
