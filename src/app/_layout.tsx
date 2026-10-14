import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  DatabaseTooNewError,
  DatabaseUnsupportedError,
  initDatabase,
  getThemePreference,
} from "@/db/database";
import {
  applyThemePreference,
  useColorSchemeName,
  useTheme,
} from "@/theme/useTheme";
import { Theme } from "@/theme/tokens";
import TopFade from "@/components/TopFade";
import { Button } from "@/components/Button";
import { useReminderReplan } from "@/hooks/useReminderReplan";

// Системная заставка держится, пока не готова база (перенос схемы и
// синхронизация словаря); скрывается после успеха или ошибки инициализации
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorSchemeName();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isReady, setIsReady] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  // Ошибки версии базы, при которых повтор не поможет: база от более новой
  // версии приложения (нужно обновиться) или от старой неподдерживаемой
  // (нужно переустановить)
  const [dbVersionError, setDbVersionError] = useState<
    "too-new" | "unsupported" | null
  >(null);
  useReminderReplan(isReady);

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
      setDbVersionError(
        e instanceof DatabaseTooNewError
          ? "too-new"
          : e instanceof DatabaseUnsupportedError
            ? "unsupported"
            : null,
      );
      setInitFailed(true);
    }
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  // После первого исхода инициализации (приложение или экран ошибки уже
  // отрисованы) убираем заставку; повтор после ошибки идёт без неё
  useEffect(() => {
    if (isReady || initFailed) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isReady, initFailed]);

  const handleRetry = () => {
    setInitFailed(false);
    void prepare();
  };

  if (initFailed) {
    return (
      <ThemeProvider value={navTheme}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Не удалось открыть базу данных</Text>
          {dbVersionError === "too-new" && (
            <Text style={styles.errorHint}>
              Данные сохранены более новой версией приложения. Обновите
              приложение, чтобы продолжить.
            </Text>
          )}
          {dbVersionError === "unsupported" && (
            <Text style={styles.errorHint}>
              Данные сохранены старой версией приложения, которая больше не
              поддерживается. Удалите приложение и установите его заново —
              сохранённые слова и прогресс при этом будут удалены.
            </Text>
          )}
          <Button
            label="Повторить"
            onPress={handleRetry}
            style={styles.retryButtonGap}
          />
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
          {/* Единственный экран с нативным заголовком: открывается из Профиля,
              кнопка «назад» и свайп возвращают обратно */}
          <Stack.Screen
            name="sources"
            options={{
              title: "Источники и лицензии",
              headerBackButtonDisplayMode: "minimal",
              headerStyle: { backgroundColor: theme.pageBackground },
              headerTintColor: theme.textPrimary,
              headerShadowVisible: false,
            }}
          />
          {/* Выбор разделов «Учить»: полноэкранная модалка, выезжает снизу,
              как форма слова; закрывается своей кнопкой и «назад» на Android */}
          <Stack.Screen
            name="categories"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
              headerShown: false,
            }}
          />
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
    paddingHorizontal: 30,
    backgroundColor: theme.pageBackground,
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
  },
  errorHint: {
    marginTop: 8,
    color: theme.textSecondary,
    fontSize: 15,
    textAlign: "center",
  },
  retryButtonGap: {
    marginTop: 20,
  },
});
