import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDatabase } from "@/db/database";
import { useColorSchemeName, useTheme } from "@/theme/useTheme";
import { Theme } from "@/theme/tokens";

export default function RootLayout() {
  const scheme = useColorSchemeName();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isReady, setIsReady] = useState(false);

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

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
      } catch (e) {
        console.error("Ошибка инициализации БД:", e);
      } finally {
        setIsReady(true);
      }
    }

    prepare();
  }, []);

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
});
